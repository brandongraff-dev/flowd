"""CLI, settings, and the deployment files (Dockerfile, Modal, pyproject)."""

from __future__ import annotations

import ast
import json
import re
import tomllib
from pathlib import Path

import pytest

from flowd_ml.cli import build_parser, main
from flowd_ml.settings import Settings
from helpers import ROOT, VECTOR_DIR

PYPROJECT = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))


# ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
def test_cli_requires_a_command_and_reports_the_version(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as e:
        main([])
    assert e.value.code == 2
    with pytest.raises(SystemExit):
        main(["--version"])
    assert "flowd-ml 1.0.0" in capsys.readouterr().out
    help_text = build_parser().format_help()
    for command in ("serve", "openapi", "vectors", "synth", "train", "calibrate"):
        assert command in help_text, command


def test_cli_openapi_to_stdout_and_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["openapi", "--out", "-"]) == 0
    spec = json.loads(capsys.readouterr().out)
    assert "/v1/hook-score" in spec["paths"]
    out = tmp_path / "api.json"
    assert main(["openapi", "--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8")) == spec


def test_cli_vectors_writes_every_suite(tmp_path: Path) -> None:
    assert main(["vectors", "--out", str(tmp_path)]) == 0
    assert {p.name for p in tmp_path.glob("*.json")} == {p.name for p in VECTOR_DIR.glob("*.json")}
    for p in tmp_path.glob("*.json"):
        assert p.read_text(encoding="utf-8") == (VECTOR_DIR / p.name).read_text(encoding="utf-8")


@pytest.mark.slow
def test_cli_synth_train_and_calibrate_end_to_end(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    pytest.importorskip("lightgbm")
    data = tmp_path / "synthetic.jsonl"
    assert main(["synth", "--out", str(data), "--n", "1200", "--apps", "12"]) == 0
    assert "SYNTHETIC" in capsys.readouterr().out
    model = tmp_path / "models" / "creative_scorer"
    assert main(["train", "--export", str(data), "--out", str(model), "--synthetic"]) == 0
    out = capsys.readouterr().out
    assert "decision:" in out
    assert "model + card written" in out
    for name in ("model.txt", "meta.json", "MODEL_CARD.md", "model_card.json", "evaluation.json"):
        assert (model / name).exists(), name
    assert "Synthetic data" in (model / "MODEL_CARD.md").read_text(encoding="utf-8")
    reports = tmp_path / "reports"
    assert main(["calibrate", "--export", str(data), "--out", str(reports)]) == 0
    cal = json.loads((reports / "calibration.json").read_text(encoding="utf-8"))
    assert cal["n_posts"] == 1200
    assert cal["model"]["stage"] == "heuristic"
    assert (reports / "calibration.md").exists()


def test_cli_train_reports_bad_exports_without_a_traceback(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    pytest.importorskip("lightgbm")
    missing = tmp_path / "nope.jsonl"
    assert main(["train", "--export", str(missing), "--out", str(tmp_path / "m")]) == 2
    assert "does not exist" in capsys.readouterr().err


# ── settings ────────────────────────────────────────────────────────────────────────────────────
def test_settings_read_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ML_ENV", "prod")
    monkeypatch.setenv("ML_API_KEY", "abc")
    monkeypatch.setenv("ML_ADAPTERS", "real")
    monkeypatch.setenv("ML_FIXED_NOW", "2026-10-03T14:00:00Z")
    monkeypatch.setenv("ML_MAX_BODY_BYTES", "5000")
    s = Settings()
    assert (s.env, s.adapters, s.fixed_now, s.max_body_bytes) == ("prod", "real", "2026-10-03T14:00:00Z", 5000)
    assert s.api_key is not None
    assert s.api_key.get_secret_value() == "abc"
    assert "abc" not in repr(s)  # secrets never print


def test_settings_defaults_are_safe_for_development() -> None:
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.env == "dev"
    assert s.adapters == "fake"
    assert s.api_key is None
    assert s.embedder == "siglip"
    assert s.vlm_model == "claude-sonnet-5-5"
    with pytest.raises(ValueError, match="env"):
        Settings(env="staging")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="embedding_dim"):
        Settings(embedding_dim=2)


# ── deployment files ────────────────────────────────────────────────────────────────────────────
def _pins() -> dict[str, str]:
    deps = list(PYPROJECT["project"]["dependencies"]) + [
        d for group in PYPROJECT["project"]["optional-dependencies"].values() for d in group
    ]
    return {
        m.group(1).lower(): m.group(2)
        for d in deps
        if (m := re.match(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?==([\w.]+)$", d))
    }


def test_runtime_dependencies_are_exactly_pinned_and_small() -> None:
    runtime = PYPROJECT["project"]["dependencies"]
    assert len(runtime) <= 6
    assert all("==" in d for d in runtime)
    assert {re.split(r"[=<>\[]", d)[0] for d in runtime} == {"fastapi", "pydantic", "pydantic-settings", "uvicorn"}
    assert PYPROJECT["project"]["requires-python"].startswith(">=3.12")
    assert PYPROJECT["project"]["scripts"]["flowd-ml"] == "flowd_ml.cli:main"
    assert {"train", "real", "modal", "dev"} == set(PYPROJECT["project"]["optional-dependencies"])


def test_modal_app_pins_match_pyproject_and_the_structure_is_right() -> None:
    src = (ROOT / "modal_app.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    assigned = {
        t.id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        for t in node.targets
        if isinstance(t, ast.Name)
    }
    core = [ast.literal_eval(e) for e in assigned["CORE"].elts]  # type: ignore[attr-defined]
    train = [ast.literal_eval(e) for e in assigned["TRAIN"].elts]  # type: ignore[attr-defined]
    pins = _pins()
    for spec in (*core, *train):
        name, version = spec.split("==")
        assert pins[name] == version, f"modal_app.py pins {spec} but pyproject pins {name}=={pins[name]}"
    defs = {n.name for n in tree.body if isinstance(n, ast.FunctionDef | ast.ClassDef)}
    assert {"api", "Video", "nightly_calibration", "weekly_train", "selftest", "smoke"} <= defs
    assert 'modal.Cron("0 3 * * *")' in src
    assert 'modal.Cron("0 4 * * 1")' in src
    assert "min_containers=1" in src
    assert 'gpu="L4"' in src
    assert 'ML_ENV": "prod"' in src
    assert 'ML_ADAPTERS": "real"' in src
    assert "flowd-ml-models" in src
    assert "modal.Secret.from_name" in src


def test_modal_app_imports_and_registers_functions() -> None:
    modal = pytest.importorskip("modal")
    import importlib
    import sys

    sys.path.insert(0, str(ROOT))
    try:
        mod = importlib.import_module("modal_app")
    finally:
        sys.path.remove(str(ROOT))
    assert isinstance(mod.app, modal.App)
    assert mod.app.name == "flowd-ml"
    for name in ("api", "nightly_calibration", "weekly_train", "selftest"):
        assert hasattr(mod, name), name
    assert hasattr(mod, "Video")


def test_dockerfile_is_hardened() -> None:
    d = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert d.count("FROM python:") >= 3
    assert "AS runtime" in d
    assert "AS worker" in d
    assert "USER flowd" in d
    assert "HEALTHCHECK" in d
    assert "useradd --system" in d
    assert "uvicorn" in d
    assert "flowd_ml.main:app" in d
    assert "--proxy-headers" in d
    assert "ffmpeg" in d
    assert '".[real]"' in d
    assert "ML_ADAPTERS=real" in d
    assert "COPY src ./src" in d
    assert "tests" not in d.split("FROM python", 2)[1]  # the runtime image carries no tests


def _dockerignored(rel: str, patterns: list[str]) -> bool:
    """Docker's rule: the last matching pattern wins; a leading ``!`` re-includes."""
    import fnmatch

    ignored = False
    for pat in patterns:
        negate = pat.startswith("!")
        body = pat.lstrip("!").rstrip("/")
        if fnmatch.fnmatch(rel, body) or rel == body or rel.startswith(body + "/"):
            ignored = not negate
    return ignored


def test_dockerfile_fails_closed_and_every_copy_source_reaches_the_build_context() -> None:
    d = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    stages = re.split(r"(?m)^FROM ", d)[1:]
    final_stages = [s for s in stages if s.splitlines()[0].endswith(("AS runtime", "AS worker"))]
    assert len(final_stages) == 2
    for stage in final_stages:
        assert "ML_ENV=prod" in stage, "an image that forgets its env must refuse to start, not serve open"
    patterns = [
        line.strip()
        for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    copies = [line.split()[1:-1] for line in d.splitlines() if line.startswith("COPY ") and "--from" not in line]
    assert copies, "the build stages copy the package in"
    for sources in copies:
        for source in sources:
            rel = source.removeprefix("./")
            assert (ROOT / rel).exists(), f"Dockerfile copies {rel} but it does not exist"
            assert not _dockerignored(rel, patterns), f".dockerignore removes {rel} from the build context"


def test_repo_hygiene_files() -> None:
    gi = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for needle in (".venv/", "__pycache__/", ".env", "models/", ".pytest_cache/"):
        assert needle in gi
    di = (ROOT / ".dockerignore").read_text(encoding="utf-8")
    ignored = {line.strip() for line in di.splitlines() if line.strip() and not line.startswith("#")}
    assert {
        "tests",
        "models",
        "data",
        ".venv",
        "__pycache__",
    } <= ignored  # the runtime image never carries tests, venvs or model artifacts
    env = (ROOT / ".env.example").read_text(encoding="utf-8")
    assert "ML_ENV" in env
    assert "ML_API_KEY" in env
    assert "sk-" not in env  # no real keys in the example
    assert not list(ROOT.glob("**/.venv"))
    assert not list(ROOT.glob("**/node_modules"))
