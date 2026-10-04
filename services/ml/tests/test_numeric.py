"""The JavaScript-compatible rounding the whole service relies on."""

from __future__ import annotations

import math

import pytest

from flowd_ml.numeric import (
    clamp,
    js_round,
    median,
    mul_rate,
    pct,
    quantile,
    round2,
    sec,
    sigmoid,
    stdev,
    timecode,
    to_fixed,
    usd,
)
from helpers import assert_subset, load_vectors


@pytest.mark.parametrize(
    ("x", "expected"),
    [
        (0.5, 1),
        (1.5, 2),
        (2.5, 3),
        (2.4999, 2),
        (-0.5, 0),
        (-1.5, -1),
        (-2.5, -2),
        (7.5, 8),
        (12.5, 13),
        (0.0, 0),
        (1e9 + 0.5, 1_000_000_001),
    ],
)
def test_js_round_rounds_half_toward_positive_infinity(x: float, expected: int) -> None:
    assert js_round(x) == expected


def test_js_round_differs_from_bankers_rounding() -> None:
    assert round(2.5) == 2  # Python: banker's
    assert js_round(2.5) == 3  # JavaScript: half up


@pytest.mark.parametrize(
    ("x", "digits", "expected"),
    [
        (2.25, 1, "2.3"),
        (0.25, 1, "0.3"),
        (24.5, 0, "25"),
        (11.5, 0, "12"),
        (1.005, 2, "1.00"),
        (2.4, 1, "2.4"),
        (0, 1, "0.0"),
    ],
)
def test_to_fixed_matches_javascript(x: float, digits: int, expected: str) -> None:
    assert to_fixed(x, digits) == expected


def test_round2_uses_math_round_on_the_scaled_float() -> None:
    assert round2(0.005) == 0.01
    assert round2(1.005) == 1.0  # 1.005 * 100 = 100.49999999999999
    assert round2(0.125) == 0.13


@pytest.mark.parametrize(
    ("cents", "rate", "expected"),
    [(5, 0.10, 1), (25, 0.10, 3), (4, 0.10, 0), (9640, 0.10, 964), (500_000, 0.12, 60_000), (0, 0.12, 0)],
)
def test_mul_rate_is_half_up_basis_point_math(cents: int, rate: float, expected: int) -> None:
    assert mul_rate(cents, rate) == expected


def test_rounding_vectors_replay() -> None:
    fns = {"mul_rate": mul_rate, "js_round": js_round, "round2": round2, "to_fixed": to_fixed}
    for case in load_vectors("rounding")["cases"]:
        assert_subset(case["out"], fns[case["in"]["fn"]](*case["in"]["args"]))


def test_clamp_and_stats_helpers() -> None:
    assert clamp(5, 0, 3) == 3
    assert clamp(-1, 0, 3) == 0
    assert median([3, 1, 2]) == 2
    assert median([]) == 0.0
    assert quantile([1, 2, 3, 4], 0.25) == 1.75  # type 7 interpolation
    assert stdev([2, 4, 4, 4, 5, 5, 7, 9]) == 2.0
    assert stdev([1]) == 0.0
    assert 0 < sigmoid(-50) < 1e-20
    assert sigmoid(0) == 0.5
    assert math.isclose(sigmoid(40), 1.0)


def test_formatting_helpers() -> None:
    assert usd(576_270) == "$5,762.70"
    assert usd(-250) == "-$2.50"
    assert usd(5) == "$0.05"
    assert sec(2400) == "2.4s"
    assert sec(None) == "never"
    assert timecode(3999) == "00:03"
    assert timecode(61_000) == "01:01"
    assert timecode(None) == "n/a"
    assert pct(0.623) == "62%"
    assert pct(0.0026, 2) == "0.26%"
