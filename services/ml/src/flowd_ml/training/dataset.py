"""Reading, validating and shaping the settled-post export."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from ..numeric import median
from .schema import (
    BOOL_FEATURES,
    FEATURE_NAMES,
    MS_FEATURES,
    NEVER_MS,
    NUM_FEATURES,
    Outcome,
    SettledPostRow,
)

FORMAT_ORDER_CODE = {"in_order": 0.0, "one_off": 1.0, "out_of_order": 2.0}
MIN_POSTS_PER_APP = 8
FRAUD_EXCLUDE_SCORE = 40  # posts held for review are not evidence of what a good video does


class DatasetError(ValueError):
    """The export is unusable; the message says why and where."""


def _parse_cell(value: str) -> object:
    v = value.strip()
    if v == "":
        return None
    low = v.lower()
    if low in ("true", "false"):
        return low == "true"
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        return v


def read_rows(path: str | Path, *, strict: bool = True) -> list[SettledPostRow]:
    """Read ``.jsonl`` or ``.csv``. ``strict=False`` skips invalid rows (and counts them in the exception-free path)."""
    p = Path(path)
    if not p.exists():
        raise DatasetError(f"{p} does not exist")
    raw: list[dict[str, object]] = []
    if p.suffix.lower() == ".csv":
        with p.open(newline="", encoding="utf-8") as fh:
            for rec in csv.DictReader(fh):
                raw.append({k: _parse_cell(v) for k, v in rec.items() if v is not None})
    else:
        with p.open(encoding="utf-8") as fh:
            for n, line in enumerate(fh, start=1):
                if not line.strip():
                    continue
                try:
                    raw.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    if strict:
                        raise DatasetError(f"{p}:{n}: invalid JSON ({exc.msg})") from exc
    rows: list[SettledPostRow] = []
    for i, rec in enumerate(raw, start=1):
        try:
            rows.append(SettledPostRow.model_validate(rec))
        except ValidationError as exc:
            if strict:
                first = exc.errors()[0]
                loc = ".".join(str(x) for x in first["loc"])
                raise DatasetError(f"{p}: row {i}: {loc}: {first['msg']}") from exc
    if not rows:
        raise DatasetError(f"{p} has no usable rows")
    return rows


def write_rows(rows: Iterable[SettledPostRow], path: str | Path) -> int:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with p.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(r.model_dump_json() + "\n")
            n += 1
    return n


@dataclass(frozen=True, slots=True)
class DataSummary:
    n_rows: int
    n_used: int
    n_apps: int
    categories: dict[str, int]
    dropped: dict[str, int]
    first_posted_at: str | None
    last_posted_at: str | None

    def as_dict(self) -> dict[str, object]:
        return {
            "n_rows": self.n_rows,
            "n_used": self.n_used,
            "n_apps": self.n_apps,
            "categories": self.categories,
            "dropped": self.dropped,
            "first_posted_at": self.first_posted_at,
            "last_posted_at": self.last_posted_at,
        }


def usable_rows(
    rows: Sequence[SettledPostRow], min_posts_per_app: int = MIN_POSTS_PER_APP
) -> tuple[list[SettledPostRow], DataSummary]:
    """Drop posts that cannot teach anything: clawed back, fraud-held, or from apps too small to normalise."""
    dropped: dict[str, int] = defaultdict(int)
    keep: list[SettledPostRow] = []
    for r in rows:
        if r.clawed_back:
            dropped["clawed_back"] += 1
        elif r.fraud_score >= FRAUD_EXCLUDE_SCORE:
            dropped["fraud_held"] += 1
        else:
            keep.append(r)
    per_app: dict[str, int] = defaultdict(int)
    for r in keep:
        per_app[r.app_id] += 1
    small = {a for a, n in per_app.items() if n < min_posts_per_app}
    final = [r for r in keep if r.app_id not in small]
    dropped["small_app"] += len(keep) - len(final)
    cats: dict[str, int] = defaultdict(int)
    for r in final:
        cats[r.category or "unknown"] += 1
    dates = sorted(r.posted_at for r in final if r.posted_at)
    return final, DataSummary(
        n_rows=len(rows),
        n_used=len(final),
        n_apps=len({r.app_id for r in final}),
        categories=dict(cats),
        dropped={k: v for k, v in dropped.items() if v},
        first_posted_at=dates[0] if dates else None,
        last_posted_at=dates[-1] if dates else None,
    )


# ── features ────────────────────────────────────────────────────────────────────────────────────
def feature_vector(r: SettledPostRow) -> list[float]:
    """Numeric features in ``FEATURE_NAMES`` order. "Never" becomes a 10 s sentinel so later stays worse."""
    out: list[float] = []
    for name in MS_FEATURES:
        v = getattr(r, name)
        out.append(float(NEVER_MS if v is None else min(v, NEVER_MS)))
    out.extend(1.0 if getattr(r, name) else 0.0 for name in BOOL_FEATURES)
    out.extend(float(getattr(r, name)) for name in NUM_FEATURES)
    out.append(r.beats_found / r.beats_required if r.beats_required > 0 else 1.0)
    out.append(FORMAT_ORDER_CODE[r.format_order])
    out.append(math.log1p(r.creator_median_views_28d) if r.creator_median_views_28d is not None else math.nan)
    assert len(out) == len(FEATURE_NAMES)
    return out


def baseline_views(r: SettledPostRow, app_median: dict[str, float]) -> float:
    """The audience a post is compared against: the creator's own median, else the app's median."""
    return float(r.creator_median_views_28d) if r.creator_median_views_28d else app_median.get(r.app_id, 1.0)


def app_medians(rows: Sequence[SettledPostRow]) -> dict[str, float]:
    by_app: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        by_app[r.app_id].append(float(r.window_views))
    return {a: max(1.0, median(v)) for a, v in by_app.items()}


def raw_target(r: SettledPostRow, outcome: Outcome, app_median: dict[str, float]) -> float:
    """views_lift: ln((views + 1) / (baseline + 1)). installs_per_1k: ln(1 + installs per 1,000 views)."""
    if outcome == "views_lift":
        return math.log((r.window_views + 1) / (baseline_views(r, app_median) + 1))
    per_k = 1000 * r.installs / r.window_views if r.window_views > 0 else 0.0
    return math.log1p(per_k)


def centred_targets(rows: Sequence[SettledPostRow], outcome: Outcome) -> tuple[list[float], dict[str, float]]:
    """Per-app centred targets: subtract each app's mean so a big app's reach never dominates. Returns (targets, app means)."""
    med = app_medians(rows)
    raw = [raw_target(r, outcome, med) for r in rows]
    sums: dict[str, list[float]] = defaultdict(list)
    for r, y in zip(rows, raw, strict=True):
        sums[r.app_id].append(y)
    means = {a: sum(v) / len(v) for a, v in sums.items()}
    return [y - means[r.app_id] for r, y in zip(rows, raw, strict=True)], means


def split_by_app(
    rows: Sequence[SettledPostRow], fractions: tuple[float, float] = (0.25, 0.15), seed: int = 7
) -> tuple[list[SettledPostRow], list[SettledPostRow], list[SettledPostRow]]:
    """Group split: every app lands wholly in train, valid or test. Test apps are never seen in training.

    ``fractions`` = (test, valid) share of apps. Needs at least five apps so each side has one.
    """
    import random

    apps = sorted({r.app_id for r in rows})
    if len(apps) < 5:
        raise DatasetError(f"need at least 5 apps to validate on held-out apps, have {len(apps)}")
    rng = random.Random(seed)
    rng.shuffle(apps)
    n_test = max(1, round(len(apps) * fractions[0]))
    n_valid = max(1, round(len(apps) * fractions[1]))
    test_apps, valid_apps = set(apps[:n_test]), set(apps[n_test : n_test + n_valid])
    train = [r for r in rows if r.app_id not in test_apps and r.app_id not in valid_apps]
    valid = [r for r in rows if r.app_id in valid_apps]
    test = [r for r in rows if r.app_id in test_apps]
    return train, valid, test
