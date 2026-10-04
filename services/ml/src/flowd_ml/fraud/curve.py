"""View-curve analysis: spikes, step functions, decay and flat runs from hourly view deltas."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

from ..constants import FRAUD_BOUGHT_TOP2_SHARE
from ..numeric import mean, median, round2
from ..schemas.common import CurveShape
from ..schemas.fraud import ViewPoint


@dataclass(frozen=True, slots=True)
class CurveStats:
    hours: int
    total: int
    peak: int
    peak_hour: int
    baseline: float
    spike_ratio: float
    top2_share: float
    rest_flat: bool
    flat_run_hours: int
    decay_ratio: float | None
    cv: float
    shape: CurveShape


def hourly_from_snapshots(points: Sequence[ViewPoint]) -> list[int]:
    """Spread cumulative snapshots into hourly deltas (uniformly inside each interval).

    Resolution is only as good as the snapshot interval (6 hours in the View Ledger), which is why curve signals prefer
    real hourly data when the platform API provides it.
    """
    pts = sorted(points, key=lambda p: p.t_hours)
    if len(pts) < 2:
        return []
    out: list[int] = []
    for a, b in pairwise(pts):
        span = b.t_hours - a.t_hours
        hours = max(1, round(span))
        delta = max(0, b.views - a.views)
        base, extra = divmod(delta, hours)
        out.extend(base + (1 if i < extra else 0) for i in range(hours))
    return out


def _smooth3(values: Sequence[float]) -> list[float]:
    n = len(values)
    return [mean(values[max(0, i - 1) : min(n, i + 2)]) for i in range(n)]


def longest_flat_run(hourly: Sequence[int], tolerance: float = 0.03, significance: float = 0.1) -> int:
    """Longest run of hours where the 3-hour-smoothed rate is flat or rising (within ``tolerance``) and not negligible.

    "Negligible" is below ``significance`` of the peak: a post that simply went quiet is not "flat", it is dead.
    """
    if len(hourly) < 3:
        return 0
    s = _smooth3([float(v) for v in hourly])
    floor = significance * max(s)
    best = run = 1 if s[0] >= floor > 0 else 0
    for prev, cur in pairwise(s):
        if cur >= floor > 0 and prev >= floor and cur >= (1 - tolerance) * prev:
            run += 1
        else:
            run = 1 if cur >= floor > 0 else 0
        best = max(best, run)
    return best


def analyse_curve(hourly: Sequence[int], baseline_override: float | None = None) -> CurveStats:
    n = len(hourly)
    if n == 0:
        raise ValueError("empty curve")
    total = sum(hourly)
    peak = max(hourly)
    peak_hour = hourly.index(peak)
    baseline = baseline_override if baseline_override else max(1.0, median(hourly))
    order = sorted(range(n), key=lambda i: hourly[i], reverse=True)
    top2 = sum(hourly[i] for i in order[:2])
    top2_share = top2 / total if total else 0.0
    rest = [hourly[i] for i in order[2:]]
    rest_med = median(rest) if rest else 0.0
    rest_flat = (not rest) or max(rest) <= max(3 * rest_med, 0.02 * peak, 3)
    flat_run = longest_flat_run(hourly)
    decay: float | None = None
    if n >= 48:
        first, second = mean(hourly[:24]), mean(hourly[24:48])
        decay = round2(second / first) if first > 0 else None
    avg = mean(hourly)
    cv = (sum((v - avg) ** 2 for v in hourly) / n) ** 0.5 / avg if avg > 0 else 0.0
    spike_ratio = peak / baseline

    shape: CurveShape
    if n >= 12 and top2_share >= FRAUD_BOUGHT_TOP2_SHARE and rest_flat:
        shape = "stepped"
    elif spike_ratio >= 10 and top2_share >= 0.5:
        shape = "spiky"
    elif flat_run >= 24 or (n >= 24 and cv <= 0.25 and (decay is None or decay >= 0.9)):
        shape = "flat"
    else:
        shape = "organic"
    return CurveStats(
        hours=n,
        total=total,
        peak=peak,
        peak_hour=peak_hour,
        baseline=round2(baseline),
        spike_ratio=round2(spike_ratio),
        top2_share=round2(top2_share),
        rest_flat=rest_flat,
        flat_run_hours=flat_run,
        decay_ratio=decay,
        cv=round2(cv),
        shape=shape,
    )
