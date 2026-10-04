"""Score bands (DOMAIN.md: A 85+, B 70-84, C 55-69, D 40-54, E under 40)."""

from __future__ import annotations

from ..constants import BAND_ORDER, BAND_VIEW_MULTIPLIER, BANDS
from ..numeric import js_round


def band_for(points: float) -> str:
    """``bandFor`` from formulas.mjs."""
    if points >= BANDS["A"]:
        return "A"
    if points >= BANDS["B"]:
        return "B"
    if points >= BANDS["C"]:
        return "C"
    if points >= BANDS["D"]:
        return "D"
    return "E"


def next_band(points: float) -> tuple[str, int] | None:
    """The band above the current one and the points still needed to reach it (``None`` at A)."""
    band = band_for(points)
    idx = BAND_ORDER.index(band)
    if idx == 0:
        return None
    above = BAND_ORDER[idx - 1]
    return above, int(BANDS[above] - points)


def predicted_views(median_views: float, band: str) -> int:
    """``predictedViews``: median views x the band multiplier, rounded half up."""
    return js_round(median_views * BAND_VIEW_MULTIPLIER[band])
