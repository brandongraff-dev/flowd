"""The scheduled Modal jobs (nightly calibration, weekly training), run in-process against a temp "volume".

``Function.local()`` executes the real function body. Only the Modal volume handles are stubbed, so these tests prove the paths a
cron run takes on day one (no export yet, too little data) and on day one-hundred (a candidate that earns the shadow slot replaces
the live scorer without ever leaving production without one).
"""

from __future__ import annotations

import dataclasses
import importlib
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

from flowd_ml.training.dataset import write_rows
from flowd_ml.training.evaluate import PromotionDecision
from flowd_ml.training.synthetic import generate_settled_posts
from helpers import ROOT

pytest.importorskip("modal")
pytest.importorskip("lightgbm")

pytestmark = [pytest.mark.slow, pytest.mark.filterwarnings("ignore:.*is executing locally.*:UserWarning")]


class _Volume:
    """Stands in for ``modal.Volume`` (reload / commit are no-ops on a local directory)."""

    def __init__(self) -> None:
        self.commits = 0

    def reload(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1


@pytest.fixture(scope="module")
def modal_app() -> ModuleType:
    sys.path.insert(0, str(ROOT))
    try:
        return importlib.import_module("modal_app")
    finally:
        sys.path.remove(str(ROOT))


@pytest.fixture
def volumes(modal_app: ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    data_dir, models_dir = tmp_path / "data", tmp_path / "models"
    (data_dir / "exports").mkdir(parents=True)
    models_dir.mkdir()
    monkeypatch.setattr(modal_app, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(modal_app, "MODELS_DIR", str(models_dir))
    monkeypatch.setattr(modal_app, "data", _Volume())
    monkeypatch.setattr(modal_app, "models", _Volume())
    return {"data": data_dir, "models": models_dir, "export": data_dir / "exports" / "settled_posts.jsonl"}


def _write_export(path: Path, n: int, apps: int) -> None:
    write_rows(generate_settled_posts(n, apps, 7), path)


def test_nightly_calibration_skips_cleanly_before_the_first_export(
    modal_app: ModuleType, volumes: dict[str, Path]
) -> None:
    out = modal_app.nightly_calibration.local()
    assert out.startswith("skipped: no settled-post export")
    assert not (volumes["data"] / "reports").exists()


def test_nightly_calibration_writes_json_and_markdown_reports(modal_app: ModuleType, volumes: dict[str, Path]) -> None:
    _write_export(volumes["export"], 600, 10)
    summary = modal_app.nightly_calibration.local()
    assert summary
    reports = list((volumes["data"] / "reports" / "calibration").iterdir())
    assert len(reports) == 1
    report = json.loads((reports[0] / "calibration.json").read_text(encoding="utf-8"))
    assert report["n_posts"] > 0
    assert report["model"]["stage"] == "heuristic"
    assert (reports[0] / "calibration.md").read_text(encoding="utf-8").strip()
    assert modal_app.data.commits == 1


def test_weekly_train_skips_cleanly_before_the_first_export(modal_app: ModuleType, volumes: dict[str, Path]) -> None:
    assert modal_app.weekly_train.local().startswith("skipped: no settled-post export")
    assert not (volumes["models"] / "candidates").exists()


def test_weekly_train_skips_when_there_is_too_little_data(modal_app: ModuleType, volumes: dict[str, Path]) -> None:
    _write_export(volumes["export"], 60, 6)
    out = modal_app.weekly_train.local()
    assert out.startswith("skipped:")
    assert "usable posts" in out
    assert not (volumes["models"] / "creative_scorer").exists()


def _force_decision(monkeypatch: pytest.MonkeyPatch, decision: str) -> None:
    from flowd_ml.training import trainer

    real = trainer.train_scorer

    def wrapped(rows, config=None, **kwargs):
        result = real(rows, config, **kwargs)
        return dataclasses.replace(result, decision=PromotionDecision(decision, [f"forced {decision} for the test"]))

    monkeypatch.setattr(trainer, "train_scorer", wrapped)


def test_a_candidate_that_keeps_the_heuristic_never_touches_the_live_scorer(
    modal_app: ModuleType, volumes: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_export(volumes["export"], 1200, 12)
    _force_decision(monkeypatch, "keep_heuristic")
    out = modal_app.weekly_train.local()
    assert out.startswith("keep_heuristic:")
    candidates = list((volumes["models"] / "candidates").iterdir())
    assert len(candidates) == 1
    for name in ("model.txt", "meta.json", "MODEL_CARD.md", "model_card.json"):
        assert (candidates[0] / name).exists(), name
    assert not (volumes["models"] / "creative_scorer").exists()


def test_a_shadow_candidate_replaces_the_live_scorer_without_leftovers(
    modal_app: ModuleType, volumes: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_export(volumes["export"], 1200, 12)
    live = volumes["models"] / "creative_scorer"
    live.mkdir()
    (live / "old_scorer.marker").write_text("yesterday's model", encoding="utf-8")
    _force_decision(monkeypatch, "shadow")
    out = modal_app.weekly_train.local()
    assert out.startswith("shadow:")
    assert (live / "model.txt").exists()
    assert (live / "MODEL_CARD.md").exists()
    assert not (live / "old_scorer.marker").exists(), "the previous scorer was replaced"
    leftovers = sorted(p.name for p in volumes["models"].iterdir())
    assert leftovers == ["candidates", "creative_scorer"], leftovers
    assert modal_app.models.commits == 1


def test_a_failed_copy_leaves_the_live_scorer_in_place(
    modal_app: ModuleType, volumes: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_export(volumes["export"], 1200, 12)
    live = volumes["models"] / "creative_scorer"
    live.mkdir()
    (live / "model.txt").write_text("production model", encoding="utf-8")
    _force_decision(monkeypatch, "promote")

    def broken_copytree(*_args: object, **_kwargs: object) -> None:
        raise OSError("volume is full")

    monkeypatch.setattr("shutil.copytree", broken_copytree)
    with pytest.raises(OSError, match="volume is full"):
        modal_app.weekly_train.local()
    assert (live / "model.txt").read_text(encoding="utf-8") == "production model"
