"""Per-process service state, built once at startup and read by the routes."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request

from ..settings import Settings
from ..training.trainer import LearnedScorer, TrainingError
from ..video.adapters.base import AdapterSet
from ..video.pipeline import VideoPipeline, utc_now_iso
from ..video.registry import build_adapters

log = logging.getLogger("flowd_ml")
SCORER_DIR = "creative_scorer"


@dataclass(slots=True)
class MlState:
    settings: Settings
    adapters: AdapterSet
    pipeline: VideoPipeline
    clock: Callable[[], str]
    learned_scorer: LearnedScorer | None = None
    learned_posts: int = 0


def load_learned_scorer(model_dir: Path) -> tuple[LearnedScorer | None, int]:
    """Load ``<model_dir>/creative_scorer`` for shadow mode if it exists. Never raises: a broken artifact must not take the service down."""
    path = model_dir / SCORER_DIR
    if not (path / "meta.json").exists():
        return None, 0
    try:
        scorer = LearnedScorer.load(path)
    except (TrainingError, OSError, ValueError, KeyError) as exc:
        log.warning("ignoring learned scorer at %s: %s", path, exc)
        return None, 0
    used = scorer.meta.get("trained_on", {}).get("n_used", 0)
    return scorer, int(used)


def build_state(
    settings: Settings, adapters: AdapterSet | None = None, clock: Callable[[], str] | None = None
) -> MlState:
    adapter_set = adapters or build_adapters(settings)
    now = clock or ((lambda: settings.fixed_now) if settings.fixed_now else utc_now_iso)
    scorer, n = load_learned_scorer(settings.model_dir)
    return MlState(
        settings=settings,
        adapters=adapter_set,
        pipeline=VideoPipeline(adapter_set, now),
        clock=now,
        learned_scorer=scorer,
        learned_posts=n,
    )


def ml_state(request: Request) -> MlState:
    state: MlState = request.app.state.ml
    return state
