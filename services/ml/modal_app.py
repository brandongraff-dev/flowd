"""Modal deployment of the flowd ML service ("Python on Modal: Whisper, SigLIP/CLIP, PySceneDetect, LightGBM", BLUEPRINT architecture).

One codebase, two deployments of the same FastAPI app:

* ``api``    CPU, always warm: scores, QA, fraud, matching, pricing, fatigue, phash, calibration. Pure rules, millisecond latency.
              ``/v1/analyze-video`` is refused here in production (the fake adapters must never answer for real videos).
* ``Video``  GPU (scales to zero): the same app with the REAL adapters (faster-whisper, PySceneDetect, Claude vision-language model,
              SigLIP). The flowd backend calls it once per upload; models load once per container in ``@modal.enter``.

plus scheduled jobs: nightly calibration report and weekly learned-scorer training (candidate artifacts, never auto-promoted).

    modal deploy services/ml/modal_app.py        # deploy
    modal run    services/ml/modal_app.py        # smoke: analyse a fake:// video on the CPU image

Secrets: create ``flowd-ml`` with ``ML_API_KEY`` (the bearer token the backend sends) and ``ANTHROPIC_API_KEY`` (vision-language model).
Volumes: ``flowd-ml-models`` (HuggingFace cache + learned scorer artifacts) and ``flowd-ml-data`` (settled-post exports written by
the backend, reports written here).
"""

from __future__ import annotations

import modal

APP_NAME = "flowd-ml"
PY = "3.12"
SRC_ROOT = "flowd_ml"
MODELS_DIR = "/models"
DATA_DIR = "/data"

# Pins mirror pyproject.toml (verified on PyPI 2026-10-03).
CORE = ["fastapi==0.142.2", "pydantic==2.13.5", "pydantic-settings==2.15.0", "uvicorn==0.54.0"]
TRAIN = ["numpy==2.5.3", "lightgbm==4.7.0"]
REAL = [
    "faster-whisper>=1.2.1,<2",
    "scenedetect[opencv-headless]>=0.7.1,<0.8",
    "transformers>=5.18,<6",
    "torch>=2.14,<3",
    "anthropic>=1.11,<2",
    "Pillow==12.3.0",
    "numpy==2.5.3",
]

app = modal.App(APP_NAME)
secrets = [modal.Secret.from_name("flowd-ml")]
models = modal.Volume.from_name("flowd-ml-models", create_if_missing=True)
data = modal.Volume.from_name("flowd-ml-data", create_if_missing=True)

cpu_image = (
    modal.Image.debian_slim(python_version=PY)
    .pip_install(*CORE, *TRAIN)
    .env({"ML_ENV": "prod", "ML_ADAPTERS": "fake", "ML_ALLOW_SCENARIO_URIS": "false", "ML_MODEL_DIR": MODELS_DIR})
    .add_local_python_source(SRC_ROOT)
)

gpu_image = (
    modal.Image.debian_slim(python_version=PY)
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(*CORE, *REAL)
    .env(
        {
            "ML_ENV": "prod",
            "ML_ADAPTERS": "real",
            "ML_ALLOW_SCENARIO_URIS": "false",
            "ML_MODEL_DIR": MODELS_DIR,
            "HF_HOME": f"{MODELS_DIR}/hf",
            "TOKENIZERS_PARALLELISM": "false",
        }
    )
    .add_local_python_source(SRC_ROOT)
)


# ── CPU: scores, QA, fraud, matching, pricing ──────────────────────────────────────────────────────
@app.function(
    image=cpu_image,
    secrets=secrets,
    volumes={MODELS_DIR: models},
    cpu=2,
    memory=2048,
    min_containers=1,
    scaledown_window=300,
    timeout=60,
)
@modal.concurrent(max_inputs=32)
@modal.asgi_app(label="flowd-ml")
def api():
    """The rules API. ``min_containers=1`` keeps one container warm: score calls sit on the creator's critical path."""
    from flowd_ml.api.app import create_app

    models.reload()  # pick up a newly promoted shadow scorer
    return create_app()


# ── GPU: video understanding ──────────────────────────────────────────────────────────────────────
@app.cls(
    image=gpu_image,
    gpu="L4",
    secrets=secrets,
    volumes={MODELS_DIR: models},
    cpu=4,
    memory=16384,
    scaledown_window=120,
    timeout=900,
    startup_timeout=600,
)
@modal.concurrent(max_inputs=4)
class Video:
    """Real adapters, loaded once per container. Serves the full API; the backend uses ``/v1/analyze-video``."""

    @modal.enter()
    def load(self) -> None:
        from flowd_ml.api.app import create_app

        models.reload()
        self.fastapi_app = create_app()
        adapters = self.fastapi_app.state.ml.adapters
        adapters.transcriber.load()  # type: ignore[attr-defined]
        adapters.embedder.load()  # type: ignore[attr-defined]

    @modal.asgi_app(label="flowd-ml-video")
    def web(self):
        return self.fastapi_app

    @modal.method()
    def analyze(self, payload: dict) -> dict:
        """Direct call for jobs (Inngest / Trigger.dev workers): same request and response as ``POST /v1/analyze-video``."""
        from flowd_ml.schemas.video import AnalyzeVideoRequest

        pipeline = self.fastapi_app.state.ml.pipeline
        return pipeline.analyze(AnalyzeVideoRequest.model_validate(payload)).model_dump(mode="json")


# ── scheduled jobs ────────────────────────────────────────────────────────────────────────────────
@app.function(
    image=cpu_image,
    secrets=secrets,
    volumes={DATA_DIR: data, MODELS_DIR: models},
    schedule=modal.Cron("0 3 * * *"),
    timeout=1800,
)
def nightly_calibration() -> str:
    """03:00 UTC: calibration report of the checklist bands against settled posts (the admin ML page reads the JSON)."""
    import datetime as dt
    from pathlib import Path

    from flowd_ml.calibration.report import build_report, render_markdown
    from flowd_ml.schemas.calibration import CalibrationPost, CalibrationRequest
    from flowd_ml.training.dataset import read_rows

    data.reload()
    export = Path(DATA_DIR) / "exports" / "settled_posts.jsonl"
    if not export.exists():
        return f"skipped: no settled-post export at {export} yet (the backend writes it once posts settle)"
    rows = read_rows(export)
    posts = [
        CalibrationPost(
            post_id=r.post_id,
            app_id=r.app_id,
            predicted_band=r.flow_band,
            predicted_points=r.flow_points,
            window_views=r.window_views,
            installs=r.installs,
            trials=r.trials,
            creator_median_views_28d=r.creator_median_views_28d,
        )
        for r in rows
        if not r.clawed_back
    ]
    report = build_report(CalibrationRequest(model_name="creative-scorer", model_stage="heuristic", posts=posts))
    out = Path(DATA_DIR) / "reports" / "calibration" / dt.date.today().isoformat()
    out.mkdir(parents=True, exist_ok=True)
    (out / "calibration.json").write_text(report.model_dump_json(indent=2), encoding="utf-8")
    (out / "calibration.md").write_text(render_markdown(report), encoding="utf-8")
    data.commit()
    return report.summary


@app.function(
    image=cpu_image,
    secrets=secrets,
    volumes={DATA_DIR: data, MODELS_DIR: models},
    schedule=modal.Cron("0 4 * * 1"),
    timeout=3600,
    cpu=4,
    memory=8192,
)
def weekly_train() -> str:
    """Mondays 04:00 UTC: train a candidate learned scorer, evaluate on held-out apps, write the model card.

    The candidate lands in ``candidates/<date>/``. It is copied to ``creative_scorer/`` (shadow mode: computed beside the checklist,
    never shown to users) only when the promotion rules say ``shadow`` or ``promote``; a human flips the product label.
    """
    import datetime as dt
    import shutil
    from pathlib import Path

    from flowd_ml.training.dataset import read_rows
    from flowd_ml.training.model_card import write_model_card
    from flowd_ml.training.trainer import TrainConfig, TrainingError, train_scorer

    data.reload()
    export = Path(DATA_DIR) / "exports" / "settled_posts.jsonl"
    if not export.exists():
        return f"skipped: no settled-post export at {export} yet (the backend writes it once posts settle)"
    rows = read_rows(export)
    try:
        result = train_scorer(rows, TrainConfig())
    except TrainingError as exc:  # too little data is the normal state until bounties settle; the checklist stays live
        return f"skipped: {exc}"
    candidate = Path(MODELS_DIR) / "candidates" / dt.date.today().isoformat()
    result.scorer.save(candidate)
    write_model_card(result, candidate)
    if result.decision.decision in ("shadow", "promote"):
        live = Path(MODELS_DIR) / "creative_scorer"
        incoming = Path(MODELS_DIR) / "creative_scorer.incoming"
        previous = Path(MODELS_DIR) / "creative_scorer.previous"
        for leftover in (incoming, previous):
            shutil.rmtree(leftover, ignore_errors=True)
        shutil.copytree(candidate, incoming)  # a failed copy leaves the live scorer untouched
        if live.exists():
            live.rename(previous)
        incoming.rename(live)
        shutil.rmtree(previous, ignore_errors=True)
    models.commit()
    return f"{result.decision.decision}: " + " ".join(result.decision.reasons)


@app.function(image=cpu_image, secrets=secrets, timeout=120)
def selftest() -> dict:
    """Run one example through each rules model inside the deployed image. Proves the image, the package and the models import and answer."""
    from flowd_ml.fraud.engine import score_fraud
    from flowd_ml.pricing.suggest import suggest_cpm
    from flowd_ml.qa.engine import run_qa
    from flowd_ml.schemas.fraud import FraudRequest
    from flowd_ml.schemas.pricing import SuggestCpmRequest
    from flowd_ml.schemas.qa import QaRequest
    from flowd_ml.schemas.scores import HookScoreRequest
    from flowd_ml.scoring.hook import score_hook

    return {
        "hook_score": score_hook(
            HookScoreRequest.model_validate(HookScoreRequest.model_json_schema()["examples"][0])
        ).summary,
        "qa": run_qa(QaRequest.model_validate(QaRequest.model_json_schema()["examples"][0])).summary,
        "fraud": score_fraud(FraudRequest.model_validate(FraudRequest.model_json_schema()["examples"][0])).summary,
        "suggest_cpm": suggest_cpm(
            SuggestCpmRequest.model_validate(SuggestCpmRequest.model_json_schema()["examples"][0])
        ).summary,
    }


@app.local_entrypoint()
def smoke() -> None:
    """``modal run services/ml/modal_app.py``: prove the image builds and every rules model answers."""
    for name, summary in selftest.remote().items():
        print(f"{name:12s} {summary}")
