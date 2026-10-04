"""Numeric helpers that reproduce the JavaScript reference semantics bit for bit.

The contract's reference implementation (``packages/contract/schema/formulas.mjs``) is JavaScript, so every
rounding rule here follows ``Math.round`` (round half toward +infinity) and ``Number.prototype.toFixed``
(round half away from zero on the exact binary value), NOT Python's banker's rounding. That is what lets the
TypeScript engine, the Swift engine and this service agree on every golden vector.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from decimal import ROUND_HALF_UP, Decimal


def js_round(x: float) -> int:
    """``Math.round``: round half up (toward +infinity). Exact for every finite double."""
    f = math.floor(x)
    return int(f + 1) if x - f >= 0.5 else int(f)


def round2(x: float) -> float:
    """``round2`` from formulas.mjs: ``Math.round(x * 100) / 100``."""
    return js_round(x * 100) / 100


def to_fixed(x: float, digits: int = 1) -> str:
    """``Number.prototype.toFixed``: round half away from zero on the exact binary value of ``x``."""
    quantum = Decimal(1).scaleb(-digits)
    return format(Decimal(x).quantize(quantum, rounding=ROUND_HALF_UP), "f")


def clamp(x: float, lo: float, hi: float) -> float:
    """``Math.min(hi, Math.max(lo, x))``."""
    return min(hi, max(lo, x))


def bps(rate: float) -> int:
    """Basis points of a rate (0.12 -> 1200)."""
    return js_round(rate * 10000)


def mul_rate(cents: float, rate: float) -> int:
    """round-half-up(cents x rate) using integer basis-point math (no float drift)."""
    return js_round((cents * bps(rate)) / 10000)


def quantile(values: Iterable[float], q: float) -> float:
    """Linear-interpolation quantile (type 7) of an unsorted numeric iterable. q in 0..1."""
    a = sorted(values)
    if not a:
        return 0.0
    pos = (len(a) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return a[lo] + (a[hi] - a[lo]) * (pos - lo)


def median(values: Iterable[float]) -> float:
    return quantile(values, 0.5)


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stdev(values: Sequence[float]) -> float:
    """Population standard deviation (0 for fewer than two values)."""
    if len(values) < 2:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def usd(cents: float) -> str:
    """``$1,234.56`` for explanations (the apps format money at the edge with their own formatMoney)."""
    neg = cents < 0
    absolute = abs(js_round(cents))
    s = f"${absolute // 100:,}.{absolute % 100:02d}"
    return f"-{s}" if neg else s


def fmt_cpm(cents: float) -> str:
    """CPM in explanations: ``$2.40``."""
    return usd(cents)


def pct(x: float, digits: int = 0) -> str:
    """``0.623`` -> ``62%``."""
    return f"{round(x * 100, digits):.{digits}f}%" if digits else f"{js_round(x * 100)}%"


def sec(ms: float | None) -> str:
    """Seconds with one decimal as the reference formats them (``2.4s``); ``never`` for null."""
    return "never" if ms is None else f"{to_fixed(ms / 1000, 1)}s"


def timecode(ms: float | None) -> str:
    """``00:03`` style timecode for evidence refs (mm:ss, floored to the second), as in the contract's ``Evidence``."""
    if ms is None:
        return "n/a"
    total = max(0, int(ms // 1000))
    return f"{total // 60:02d}:{total % 60:02d}"


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1 / (1 + z)
    z = math.exp(x)
    return z / (1 + z)
