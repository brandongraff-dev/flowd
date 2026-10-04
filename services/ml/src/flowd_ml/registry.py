"""The eight ML systems (BLUEPRINT "ML systems", DOMAIN ``ModelKind``) and their current stage."""

from __future__ import annotations

from .constants import CHECKLIST_LABEL, LEARNED_READY_AT_POSTS
from .schemas.misc import ModelStatus
from .version import MODEL_VERSIONS


def model_statuses(
    creative_scorer_stage: str = "heuristic", learned_posts: int = 0, adapter_stage: str = "fake"
) -> list[ModelStatus]:
    """Statuses for ``GET /v1/models``. ``creative_scorer_stage`` is ``shadow`` once a learned artifact is loaded."""
    video_version = MODEL_VERSIONS["video"] + (" (fake adapters)" if adapter_stage == "fake" else " (real adapters)")
    return [
        ModelStatus(
            id="mdl_video_understanding",
            kind="video_understanding",
            name="Video understanding",
            version=video_version,
            stage="heuristic",
            description="Transcript, scenes, on-screen text, per-frame facts, perceptual hash and embeddings for every submission version.",
            endpoints=["POST /v1/analyze-video", "POST /v1/embed", "POST /v1/phash/from-frames"],
            approach="Whisper, PySceneDetect, a vision-language model for frames, SigLIP/CLIP embeddings, behind adapter interfaces (fake adapters in dev and tests).",
            next_stage="Same models; the tags feed every learned model below.",
        ),
        ModelStatus(
            id="mdl_hook_coach",
            kind="hook_coach",
            name="Hook coach",
            version="on-device",
            stage="heuristic",
            description="First-3-seconds checks on the creator's phone, with no server round-trip.",
            endpoints=["POST /v1/hook-score (server reference for the on-device checks)"],
            approach="Apple Vision / ML Kit faces and text plus a motion score; the server's Hook Score is the reference the apps mirror.",
            next_stage="A small model distilled from the learned scorer, exported to Core ML and TensorFlow Lite.",
            label=CHECKLIST_LABEL,
        ),
        ModelStatus(
            id="mdl_auto_qa",
            kind="auto_qa",
            name="Auto-QA",
            version=MODEL_VERSIONS["qa"],
            stage="heuristic",
            description="Brief beats, disclosure (spoken and on screen), banned claims, music, AI labels, duplicates, safe zones, format and moderation.",
            endpoints=["POST /v1/qa", "POST /v1/phash/compare", "POST /v1/phash/duplicates"],
            approach="Rules over transcript, on-screen text and perceptual hashes; every flag carries a reason code, evidence and a fix.",
            next_stage="A classifier trained on approve / reject decisions.",
        ),
        ModelStatus(
            id="mdl_fraud",
            kind="fraud",
            name="View-fraud detection",
            version=MODEL_VERSIONS["fraud"],
            stage="heuristic",
            description="Post view curves and account history to a 0-100 risk score with ten named signals.",
            endpoints=["POST /v1/fraud"],
            approach="Ten rule signals composed as min(100, sum of round(max_points x severity)); every score shows its evidence.",
            next_stage="An anomaly model on settled vs clawed-back posts.",
        ),
        ModelStatus(
            id="mdl_creative_scorer",
            kind="creative_scorer",
            name="Creative scorer",
            version=MODEL_VERSIONS["hook_score"],
            stage=creative_scorer_stage,  # type: ignore[arg-type]
            description="Hook Score and Flow Score: a predicted performance band with timecoded reasons and one-tap fixes.",
            endpoints=["POST /v1/hook-score", "POST /v1/flow-score", "POST /v1/calibration/report"],
            approach="Heuristic checklist score with reasons."
            + (" A learned LightGBM model runs in shadow beside it." if creative_scorer_stage == "shadow" else ""),
            next_stage=f"LightGBM on settled posts, compared on held-out apps after about {LEARNED_READY_AT_POSTS:,} posts; later a fine-tuned video model.",
            trained_on_n=learned_posts,
            label=CHECKLIST_LABEL,
        ),
        ModelStatus(
            id="mdl_matching",
            kind="matching",
            name="Matching",
            version=MODEL_VERSIONS["match"],
            stage="heuristic",
            description="Ranks the bounty feed for each creator, with gates, five factors and an embedding that can lift a weak niche match.",
            endpoints=["POST /v1/match"],
            approach="Embedding similarity plus rules (niche, platform, region, price, brand reliability, recency) behind hard gates.",
            next_stage="Learning-to-rank on who earned most per bounty.",
        ),
        ModelStatus(
            id="mdl_pricing",
            kind="pricing",
            name="Pricing model",
            version=MODEL_VERSIONS["suggest_cpm"],
            stage="heuristic",
            description="Suggested CPM and a price-vs-fill-time curve with confidence and a thin-market warning.",
            endpoints=["POST /v1/suggest-cpm"],
            approach="p50 fill = max(6, H x (clearing / cpm)^1.6) around the category clearing price; fixed category defaults when no market data is supplied.",
            next_stage="Regression on clearing rates, fill speed and results.",
        ),
        ModelStatus(
            id="mdl_fatigue",
            kind="fatigue",
            name="Fatigue detection",
            version=MODEL_VERSIONS["fatigue"],
            stage="heuristic",
            description="Refresh alerts when a winner's rate falls 30% from its peak.",
            endpoints=["POST /v1/fatigue"],
            approach="Rule on the trailing three-day median of the trial-start rate, click-through or install yield.",
            next_stage="A per-app time-series model.",
        ),
    ]
