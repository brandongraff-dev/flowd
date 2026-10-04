"""Price vs fill time: the day-one pricing heuristic (ports of ``fillTime`` / ``priceCurve`` in formulas.mjs).

    p50 = max(6, H x (clearing / cpm) ^ 1.6)        p80 = p50 x 1.8
    confidence = n / (n + 20) x (1 - min(0.5, |ln(cpm / clearing)|))

H is the category's median fill hours at the clearing price. Replaced by a regression once enough bounties settle.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..constants import (
    PRICING_CONFIDENCE_K,
    PRICING_CURVE_MULTIPLIERS,
    PRICING_FILL_EXPONENT,
    PRICING_MIN_FILL_HOURS,
    PRICING_P80_MULTIPLIER,
    PRICING_THIN_MARKET_MIN_SAMPLE,
)
from ..numeric import js_round, round2


@dataclass(frozen=True, slots=True)
class FillTime:
    fill_hours_p50: float
    fill_hours_p80: float
    confidence: float
    thin_market: bool


def fill_time(cpm_cents: float, clearing_cpm_cents: float, median_fill_hours: float, sample_n: int) -> FillTime:
    p50 = max(
        PRICING_MIN_FILL_HOURS, median_fill_hours * math.pow(clearing_cpm_cents / cpm_cents, PRICING_FILL_EXPONENT)
    )
    distance = min(0.5, abs(math.log(cpm_cents / clearing_cpm_cents)))
    confidence = round2((sample_n / (sample_n + PRICING_CONFIDENCE_K)) * (1 - distance))
    return FillTime(
        round2(p50), round2(p50 * PRICING_P80_MULTIPLIER), confidence, sample_n < PRICING_THIN_MARKET_MIN_SAMPLE
    )


@dataclass(frozen=True, slots=True)
class CurvePointRaw:
    cpm_cents: int
    multiplier: float
    fill_hours_p50: float
    fill_hours_p80: float
    confidence: float
    sample_n: int


def price_curve(clearing_cpm_cents: float, median_fill_hours: float, sample_n: int) -> list[CurvePointRaw]:
    """Six CPM points at 0.6x .. 2.0x of the clearing CPM."""
    out: list[CurvePointRaw] = []
    for m in PRICING_CURVE_MULTIPLIERS:
        cpm = js_round(clearing_cpm_cents * m)
        f = fill_time(cpm, clearing_cpm_cents, median_fill_hours, sample_n)
        out.append(CurvePointRaw(cpm, m, f.fill_hours_p50, f.fill_hours_p80, f.confidence, sample_n))
    return out


def cpm_for_target_fill(target_hours: float, clearing_cpm_cents: float, median_fill_hours: float) -> float:
    """Invert the fill model: the CPM whose p50 fill time is ``target_hours`` (the 6-hour floor is not invertible)."""
    t = max(target_hours, PRICING_MIN_FILL_HOURS)
    return clearing_cpm_cents * math.pow(median_fill_hours / t, 1 / PRICING_FILL_EXPONENT)
