"""Evaluation on held-out apps: does a score actually rank videos the way the market did, inside each app?

Scores are compared *within* an app (a good video in a small app should not be ranked against a mediocre video in a
huge one), then averaged across apps. Differences between two scorers carry an app-level bootstrap interval, so a
promotion never rests on a lucky split.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from itertools import pairwise

from ..constants import BAND_ORDER, BAND_VIEW_MULTIPLIER, LEARNED_READY_AT_POSTS
from ..numeric import median, round2
from ..scoring.bands import band_for
from .dataset import MIN_POSTS_PER_APP, app_medians, baseline_views
from .schema import SettledPostRow

Scorer = Callable[[SettledPostRow], float]


def _ranks(values: Sequence[float]) -> list[float]:
    """Average ranks (ties share the mean rank)."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        mean_rank = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = mean_rank
        i = j + 1
    return ranks


def pearson(x: Sequence[float], y: Sequence[float]) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx == 0 or syy == 0:
        return 0.0
    return sum((a - mx) * (b - my) for a, b in zip(x, y, strict=True)) / math.sqrt(sxx * syy)


def spearman(x: Sequence[float], y: Sequence[float]) -> float:
    """Spearman rank correlation (Pearson on average ranks). 0 when either side is constant."""
    return pearson(_ranks(x), _ranks(y))


def lift_target(r: SettledPostRow, app_median: dict[str, float]) -> float:
    return math.log((r.window_views + 1) / (baseline_views(r, app_median) + 1))


def within_app_spearman(
    rows: Sequence[SettledPostRow], scorer: Scorer, min_posts: int = MIN_POSTS_PER_APP
) -> dict[str, float]:
    """Spearman of the score against realised views lift, inside each app with enough posts."""
    med = app_medians(rows)
    by_app: dict[str, list[SettledPostRow]] = defaultdict(list)
    for r in rows:
        by_app[r.app_id].append(r)
    return {
        app: spearman([scorer(r) for r in rs], [lift_target(r, med) for r in rs])
        for app, rs in sorted(by_app.items())
        if len(rs) >= min_posts
    }


def top_band_lift(rows: Sequence[SettledPostRow], scorer: Scorer) -> float:
    """How much better is the top fifth by score than the rest, in median realised lift (ln scale)? Pooled within apps."""
    med = app_medians(rows)
    by_app: dict[str, list[SettledPostRow]] = defaultdict(list)
    for r in rows:
        by_app[r.app_id].append(r)
    top: list[float] = []
    rest: list[float] = []
    for rs in by_app.values():
        if len(rs) < MIN_POSTS_PER_APP:
            continue
        ordered = sorted(rs, key=scorer, reverse=True)
        cut = max(1, len(ordered) // 5)
        mean_app = sum(lift_target(r, med) for r in rs) / len(rs)
        top.extend(lift_target(r, med) - mean_app for r in ordered[:cut])
        rest.extend(lift_target(r, med) - mean_app for r in ordered[cut:])
    if not top or not rest:
        return 0.0
    return median(top) - median(rest)


@dataclass(frozen=True, slots=True)
class BandBin:
    band: str
    count: int
    median_views: int
    median_lift_multiple: float
    trial_rate: float


def band_bins(rows: Sequence[SettledPostRow], bands: Sequence[str]) -> list[BandBin]:
    """Realised results per predicted band (the contract's ``CalibrationBin`` plus the lift multiple vs the creator's norm)."""
    med = app_medians(rows)
    groups: dict[str, list[SettledPostRow]] = defaultdict(list)
    for r, b in zip(rows, bands, strict=True):
        groups[b].append(r)
    out: list[BandBin] = []
    for b in BAND_ORDER:
        rs = groups.get(b, [])
        if not rs:
            out.append(BandBin(b, 0, 0, 0.0, 0.0))
            continue
        installs = sum(r.installs for r in rs)
        trials = sum(r.trials for r in rs)
        lifts = [math.exp(lift_target(r, med)) for r in rs]
        out.append(
            BandBin(
                b,
                len(rs),
                round(median([float(r.window_views) for r in rs])),
                round2(median(lifts)),
                round(trials / installs, 4) if installs else 0.0,
            )
        )
    return out


def is_monotone_non_increasing(values: Sequence[float], tolerance: float = 0.0) -> bool:
    nonzero = [v for v in values if v > 0]
    return all(b <= a + tolerance for a, b in pairwise(nonzero))


@dataclass(slots=True)
class ScorerReport:
    name: str
    mean_spearman: float
    per_app_spearman: dict[str, float]
    top_band_lift: float
    bins: list[BandBin]
    monotone: bool
    n_posts: int
    n_apps: int

    def as_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "mean_spearman": round2(self.mean_spearman),
            "per_app_spearman": {k: round2(v) for k, v in self.per_app_spearman.items()},
            "top_band_lift_ln": round2(self.top_band_lift),
            "monotone_bands": self.monotone,
            "n_posts": self.n_posts,
            "n_apps": self.n_apps,
            "bins": [asdict(b) for b in self.bins],
        }


def evaluate_scorer(
    name: str, rows: Sequence[SettledPostRow], scorer: Scorer, banding: Callable[[SettledPostRow], str] | None = None
) -> ScorerReport:
    per_app = within_app_spearman(rows, scorer)
    bands = [banding(r) if banding else band_for(scorer(r)) for r in rows]
    bins = band_bins(rows, bands)
    # monotone: A >= B >= C >= D >= E in median lift multiple (empty bands are ignored)
    return ScorerReport(
        name=name,
        mean_spearman=sum(per_app.values()) / len(per_app) if per_app else 0.0,
        per_app_spearman=per_app,
        top_band_lift=top_band_lift(rows, scorer),
        bins=bins,
        monotone=is_monotone_non_increasing([b.median_lift_multiple for b in bins]),
        n_posts=len(rows),
        n_apps=len(per_app),
    )


def bootstrap_diff(
    rows: Sequence[SettledPostRow], a: Scorer, b: Scorer, n_boot: int = 400, seed: int = 11
) -> tuple[float, float, float]:
    """Mean within-app Spearman of ``a`` minus ``b`` with a 95% app-level bootstrap interval ``(diff, lo, hi)``."""
    sa, sb = within_app_spearman(rows, a), within_app_spearman(rows, b)
    apps = sorted(sa)
    if not apps:
        return 0.0, 0.0, 0.0
    diffs = {x: sa[x] - sb[x] for x in apps}
    point = sum(diffs.values()) / len(apps)
    rng = random.Random(seed)
    boots = sorted(sum(diffs[rng.choice(apps)] for _ in apps) / len(apps) for _ in range(n_boot))
    return point, boots[int(0.025 * n_boot)], boots[int(0.975 * n_boot) - 1]


Decision = str  # keep_heuristic | shadow | promote


@dataclass(slots=True)
class PromotionDecision:
    decision: Decision
    reasons: list[str] = field(default_factory=list)
    diff: float = 0.0
    ci_lo: float = 0.0
    ci_hi: float = 0.0

    def as_dict(self) -> dict[str, object]:
        return {
            "decision": self.decision,
            "reasons": self.reasons,
            "spearman_diff": round2(self.diff),
            "ci95": [round2(self.ci_lo), round2(self.ci_hi)],
        }


def promotion_decision(
    learned: ScorerReport,
    heuristic: ScorerReport,
    diff: tuple[float, float, float],
    n_settled: int,
    min_test_apps: int = 3,
    min_gain: float = 0.03,
) -> PromotionDecision:
    """Compare learned vs checklist on held-out apps. The checklist stays live until the learned model clearly earns the slot."""
    d, lo, hi = diff
    reasons: list[str] = []
    if n_settled < LEARNED_READY_AT_POSTS:
        reasons.append(f"Only {n_settled:,} settled posts; the comparison starts at {LEARNED_READY_AT_POSTS:,}.")
        return PromotionDecision("keep_heuristic", reasons, d, lo, hi)
    if learned.n_apps < min_test_apps:
        reasons.append(f"Only {learned.n_apps} held-out apps with enough posts; need {min_test_apps}.")
        return PromotionDecision("keep_heuristic", reasons, d, lo, hi)
    reasons.append(
        f"Held-out apps: learned rank correlation {learned.mean_spearman:.2f} vs checklist {heuristic.mean_spearman:.2f} (difference {d:+.2f}, 95% interval {lo:+.2f} to {hi:+.2f})."
    )
    if not learned.monotone:
        reasons.append(
            "The learned bands are not monotone in realised lift (a higher band did worse), so it cannot ship yet."
        )
        return PromotionDecision("keep_heuristic" if d <= 0 else "shadow", reasons, d, lo, hi)
    if lo > 0 and d >= min_gain:
        reasons.append(
            "The learned model beats the checklist with an interval clear of zero and monotone bands: promote."
        )
        return PromotionDecision("promote", reasons, d, lo, hi)
    if d > 0:
        reasons.append(
            "Better on average, but the interval includes zero: run it in shadow and re-test as more posts settle."
        )
        return PromotionDecision("shadow", reasons, d, lo, hi)
    reasons.append("The learned model does not beat the checklist: keep the checklist.")
    return PromotionDecision("keep_heuristic", reasons, d, lo, hi)


def heuristic_scorer(r: SettledPostRow) -> float:
    """The checklist as a scorer: the Flow Score points recorded at submission."""
    return float(r.flow_points)


__all__ = [
    "BAND_VIEW_MULTIPLIER",
    "BandBin",
    "PromotionDecision",
    "ScorerReport",
    "band_bins",
    "bootstrap_diff",
    "evaluate_scorer",
    "heuristic_scorer",
    "is_monotone_non_increasing",
    "lift_target",
    "pearson",
    "promotion_decision",
    "spearman",
    "top_band_lift",
    "within_app_spearman",
]
