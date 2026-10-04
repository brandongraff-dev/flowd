"""Turn a raw checklist card into first-class explanations: ordered reasons, one-tap fixes with their payoff."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal

from ..schemas.common import Fix, Reason, ScoreItem
from .bands import band_for
from .core import RawItem

Effort = Literal["quick", "moderate", "reshoot"]


def to_score_items(
    items: Sequence[RawItem],
    t_ms: Mapping[str, int | None] | None = None,
    target_ms: Mapping[str, int | None] | None = None,
) -> list[ScoreItem]:
    t_ms = t_ms or {}
    target_ms = target_ms or {}
    return [
        ScoreItem(
            id=i.id,
            label=i.label,
            points=i.points,
            max=i.max,
            passed=i.passed,
            reason=i.reason,
            fix=i.fix,
            t_ms=t_ms.get(i.id),
            target_ms=target_ms.get(i.id),
        )
        for i in items
    ]


def build_reasons(items: Sequence[RawItem], t_ms: Mapping[str, int | None] | None = None) -> list[Reason]:
    """Reasons ordered by what they cost: biggest loss first, fully earned items last."""
    t_ms = t_ms or {}
    order = sorted(range(len(items)), key=lambda idx: (-(items[idx].max - items[idx].points), idx))
    reasons: list[Reason] = []
    for idx in order:
        i = items[idx]
        lost = i.max - i.points
        severity: Literal["positive", "warning", "critical"] = (
            "positive" if lost == 0 else ("critical" if i.points == 0 else "warning")
        )
        reasons.append(
            Reason(
                code=i.id, severity=severity, title=i.label, message=i.reason, t_ms=t_ms.get(i.id), impact=float(-lost)
            )
        )
    return reasons


def build_fixes(
    items: Sequence[RawItem],
    points: int,
    fix_text: Mapping[str, str],
    effort: Mapping[str, Effort],
    t_ms: Mapping[str, int | None] | None = None,
) -> list[Fix]:
    """One fix per item that lost points, biggest payoff first. ``band_after`` is the band if only that fix lands."""
    t_ms = t_ms or {}
    losing = [(idx, i) for idx, i in enumerate(items) if i.points < i.max]
    losing.sort(key=lambda p: (-(p[1].max - p[1].points), p[0]))
    fixes: list[Fix] = []
    for _, i in losing:
        gain = i.max - i.points
        fixes.append(
            Fix(
                id=f"fix_{i.id}",
                target=i.id,
                text=fix_text.get(i.id, i.fix or ""),
                gain=float(gain),
                band_after=band_for(points + gain),
                effort=effort.get(i.id),
                t_ms=t_ms.get(i.id),
            )
        )
    return fixes


def best_band(points: int, fixes: Sequence[Fix]) -> str:
    """Band if every available fix lands (never below the current band)."""
    total = points + sum(int(f.gain or 0) for f in fixes)
    return band_for(min(100, total))


def summary_line(kind: str, band: str, points: int, fixes: Sequence[Fix]) -> str:
    """One sentence for the top of a card. Names the single biggest fix, never a bare number."""
    head = f"{kind} band {band} ({points}/100)."
    if not fixes:
        return f"{head} Every checklist item is earned."
    top = fixes[0]
    best = best_band(points, fixes)
    lift = f" Fixing all {len(fixes)} could reach band {best}." if best != band else ""
    return f"{head} Biggest gain, +{int(top.gain or 0)}: {top.text}{lift}"
