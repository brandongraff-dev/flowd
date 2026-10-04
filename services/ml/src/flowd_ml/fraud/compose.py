"""Fraud score composition: a port of ``fraudScore`` / ``fraudBand`` / ``fraudAction`` from ``formulas.mjs``."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from ..constants import FRAUD_BANDS, FRAUD_HOLD_THRESHOLD, FRAUD_REVIEW_THRESHOLD, FRAUD_SIGNALS
from ..numeric import js_round


@dataclass(frozen=True, slots=True)
class Hit:
    signal: str
    severity: float
    points: int
    detail: str


def fraud_band(score: int) -> str:
    if score <= FRAUD_BANDS["clean"][1]:
        return "clean"
    if score <= FRAUD_BANDS["watch"][1]:
        return "watch"
    if score <= FRAUD_BANDS["review"][1]:
        return "review"
    return "high"


def fraud_action(score: int) -> str:
    """What a fraud band does to money."""
    if score >= FRAUD_HOLD_THRESHOLD:
        return "auto_hold_and_queue"
    if score >= FRAUD_REVIEW_THRESHOLD:
        return "hold_for_human_review"
    return "auto_clear"


def points_for(signal: str, severity: float) -> int:
    """points = round(max_points x severity)."""
    return js_round(FRAUD_SIGNALS[signal][0] * severity)


def compose(signals: Iterable[Mapping[str, object]]) -> tuple[int, str, list[Hit]]:
    """``score = min(100, sum of round(max_points x severity))`` over fired signals; zero-point signals are dropped."""
    hits: list[Hit] = []
    for s in signals:
        name = str(s["signal"])
        severity = float(s["severity"])  # type: ignore[arg-type]
        pts = points_for(name, severity)
        if pts > 0:
            detail = s.get("detail")
            hits.append(Hit(name, severity, pts, str(detail) if detail else FRAUD_SIGNALS[name][1]))
    score = min(100, sum(h.points for h in hits))
    return score, fraud_band(score), hits
