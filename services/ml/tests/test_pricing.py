"""Pricing: price-vs-fill curve, suggested CPM, all-in price, Pay Math, funding."""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from flowd_ml.pricing import suggest_cpm
from flowd_ml.pricing.fill import cpm_for_target_fill, fill_time, price_curve
from flowd_ml.pricing.money import (
    all_in_cpm,
    all_in_rate,
    card_processing,
    expected_earnings,
    first_bounty_funding,
    funding,
    take_rate,
)
from flowd_ml.schemas.pricing import MarketStats, SuggestCpmRequest
from helpers import assert_subset, contract_vectors, load_vectors

MARKET = {
    "clearing_cpm_cents": 240,
    "p25_cpm_cents": 190,
    "p75_cpm_cents": 310,
    "median_fill_hours": 31,
    "sample_n": 38,
    "median_views": 14_200,
}


def req(**o) -> SuggestCpmRequest:
    return SuggestCpmRequest.model_validate({"category": "ai_photo", "market": MARKET, **o})


@pytest.mark.parametrize("case", load_vectors("price_curve")["cases"], ids=lambda c: c["id"])
def test_price_curve_vectors(case: dict) -> None:
    i = case["in"]
    got = [
        {
            "cpm_cents": p.cpm_cents,
            "fill_hours_p50": p.fill_hours_p50,
            "fill_hours_p80": p.fill_hours_p80,
            "confidence": p.confidence,
            "sample_n": p.sample_n,
        }
        for p in price_curve(i["clearing_cpm_cents"], i["median_fill_hours"], i["sample_n"])
    ]
    assert_subset(case["out"], got)


@pytest.mark.parametrize("case", load_vectors("fill_time")["cases"], ids=lambda c: c["id"])
def test_fill_time_vectors(case: dict) -> None:
    i = case["in"]
    f = fill_time(i["cpm_cents"], i["clearing_cpm_cents"], i["median_fill_hours"], i["sample_n"])
    assert_subset(
        case["out"],
        {
            "fill_hours_p50": f.fill_hours_p50,
            "fill_hours_p80": f.fill_hours_p80,
            "confidence": f.confidence,
            "thin_market": f.thin_market,
        },
    )


def test_curve_matches_the_contracts_own_vectors() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("contract vectors not present")
    for c in v["price_curve"]:
        got = [
            {
                "cpm_cents": p.cpm_cents,
                "fill_hours_p50": p.fill_hours_p50,
                "fill_hours_p80": p.fill_hours_p80,
                "confidence": p.confidence,
                "sample_n": p.sample_n,
            }
            for p in price_curve(**c["in"])
        ]
        assert_subset(c["out"], got)


def test_contract_example_numbers() -> None:
    curve = price_curve(240, 31, 38)
    assert [p.cpm_cents for p in curve] == [144, 192, 240, 288, 360, 480]
    assert [p.fill_hours_p50 for p in curve] == [70.2, 44.3, 31.0, 23.16, 16.2, 10.23]
    assert [p.confidence for p in curve] == [0.33, 0.51, 0.66, 0.54, 0.39, 0.33]


def test_fill_model_properties() -> None:
    at = fill_time(240, 240, 31, 38)
    assert at.fill_hours_p50 == 31
    assert at.fill_hours_p80 == 55.8
    cheap, dear = fill_time(120, 240, 31, 38), fill_time(480, 240, 31, 38)
    assert cheap.fill_hours_p50 > at.fill_hours_p50 > dear.fill_hours_p50
    assert fill_time(10_000, 240, 31, 38).fill_hours_p50 == 6  # the floor
    assert fill_time(240, 240, 31, 7).thin_market
    assert not fill_time(240, 240, 31, 8).thin_market
    assert fill_time(240, 240, 31, 0).confidence == 0
    # confidence peaks at the clearing price
    confs = [fill_time(c, 240, 31, 100).confidence for c in (60, 120, 240, 480, 960)]
    assert confs.index(max(confs)) == 2


def test_cpm_for_target_fill_inverts_the_model() -> None:
    for target in (10, 20, 31, 60):
        cpm = cpm_for_target_fill(target, 240, 31)
        assert fill_time(cpm, 240, 31, 38).fill_hours_p50 == pytest.approx(target, abs=0.5)
    assert cpm_for_target_fill(1, 240, 31) == cpm_for_target_fill(6, 240, 31)


# ── suggestion ──────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("case", load_vectors("suggest_cpm")["cases"], ids=lambda c: c["id"])
def test_suggest_vectors(case: dict) -> None:
    r = suggest_cpm(SuggestCpmRequest.model_validate(case["in"]))
    got = {
        "source": r.source,
        "suggested_cpm_cents": r.suggested_cpm_cents,
        "thin_market": r.thin_market,
        "fill": {"p50_hours": r.fill.p50_hours, "p80_hours": r.fill.p80_hours, "confidence": r.fill.confidence},
        "curve": [
            {"cpm_cents": p.cpm_cents, "fill_hours_p50": p.fill_hours_p50, "all_in_cpm_cents": p.all_in_cpm_cents}
            for p in r.curve
        ],
        "all_in": None
        if r.all_in is None
        else {"card_charge_cents": r.all_in.card_charge_cents, "all_in_cpm_cents": r.all_in.all_in_cpm_cents},
        "creator_pay": None
        if r.creator_pay is None
        else {
            "p25_cents": r.creator_pay.p25_cents,
            "median_cents": r.creator_pay.median_cents,
            "p75_cents": r.creator_pay.p75_cents,
        },
        "warnings_count": len(r.warnings),
    }
    assert_subset(case["out"], got)


def test_balanced_suggestion_is_the_clearing_price_with_the_whole_story() -> None:
    r = suggest_cpm(
        req(
            plan="pro",
            budget_cents=500_000,
            cpa={"install_cents": 40, "trial_cents": 150, "paid_cents": 400},
            candidate_cpm_cents=192,
        )
    )
    assert r.suggested_cpm_cents == 240
    assert r.source == "market"
    assert r.clearing_cpm_cents == 240
    assert (r.fill.p50_hours, r.fill.p80_hours, r.fill.confidence) == (31.0, 55.8, 0.66)
    assert (r.range.low_cpm_cents, r.range.high_cpm_cents, r.range.basis) == (190, 310, "market_p25_p75")
    assert r.model.kind == "pricing"
    assert r.model.stage == "heuristic"
    # the brand sees the all-in price everywhere a price appears
    assert r.all_in is not None
    assert r.all_in.take_rate == 0.10
    assert r.all_in.escrow_total_cents == 550_000
    assert r.all_in.all_in_cpm_cents == all_in_cpm(240, 500_000, r.all_in.card_charge_cents)
    assert r.all_in.all_in_cpm_cents > 240
    assert all(p.all_in_cpm_cents is not None and p.all_in_cpm_cents > p.cpm_cents for p in r.curve)
    # candidate
    assert r.candidate is not None
    assert r.candidate.position == "below_market"
    assert r.candidate.vs_clearing_pct == -20
    assert "20% under" in r.candidate.message
    assert "$1.92" in r.candidate.message
    # reasons and fixes are first-class
    assert [x.code for x in r.reasons][:2] == ["clearing_price", "suggestion"]
    assert any(x.code == "all_in" for x in r.reasons)
    assert any(x.code == "creator_pay" for x in r.reasons)
    assert {f.id for f in r.fixes} >= {"go_faster", "go_cheaper"}
    assert "Raise to $2.88" in next(f for f in r.fixes if f.id == "go_faster").text


def test_priority_and_target_fill_move_the_price_the_right_way() -> None:
    fast, bal, cheap = (suggest_cpm(req(priority=p)).suggested_cpm_cents for p in ("fastest", "balanced", "cheapest"))
    assert fast > bal > cheap
    assert (fast, bal, cheap) == (360, 240, 192)
    twelve = suggest_cpm(req(target_fill_hours=12))
    assert twelve.fill.p50_hours == pytest.approx(12, abs=1.0)
    slow = suggest_cpm(req(target_fill_hours=90))
    assert slow.suggested_cpm_cents < 240
    assert slow.fill.p50_hours == pytest.approx(90, abs=3)
    impossible = suggest_cpm(req(target_fill_hours=2))
    assert impossible.suggested_cpm_cents == 480
    assert any("6 hours" in w for w in impossible.warnings)
    assert any("2x" in w or "2" in w for w in impossible.warnings)


def test_floor_and_defaults_and_thin_market() -> None:
    floor = suggest_cpm(
        SuggestCpmRequest(
            category="lifestyle",
            market=MarketStats(clearing_cpm_cents=55, median_fill_hours=20, sample_n=50),
            priority="cheapest",
        )
    )
    assert floor.suggested_cpm_cents == 50
    assert any("floor" in w for w in floor.warnings)
    default = suggest_cpm(SuggestCpmRequest(category="fitness"))
    assert default.source == "category_default"
    assert default.suggested_cpm_cents == 190
    assert default.thin_market
    assert default.sample_n == 0
    assert "day-one default" in default.reasons[0].message
    thin = suggest_cpm(req(market={**MARKET, "sample_n": 5}))
    assert thin.thin_market
    assert any("Thin market" in w for w in thin.warnings)
    assert any(f.id == "start_small" for f in thin.fixes)
    assert thin.range.basis == "market_p25_p75"
    band = suggest_cpm(
        SuggestCpmRequest(
            category="fitness", market=MarketStats(clearing_cpm_cents=200, median_fill_hours=30, sample_n=20)
        )
    )
    assert (band.range.low_cpm_cents, band.range.high_cpm_cents, band.range.basis) == (160, 250, "clearing_band")


def test_low_effective_pay_warning_matches_brief_lint() -> None:
    r = suggest_cpm(
        SuggestCpmRequest(
            category="lifestyle",
            market=MarketStats(clearing_cpm_cents=60, median_fill_hours=20, sample_n=50, median_views=6_000),
        )
    )
    assert r.creator_pay is not None
    assert r.creator_pay.median_cents < 1_500
    assert any("Brief Lint" in w for w in r.warnings)
    assert any(f.id == "add_cpa" for f in r.fixes)
    ok = suggest_cpm(req())
    assert ok.creator_pay is not None
    assert ok.creator_pay.median_cents >= 1_500
    assert not any("Brief Lint" in w for w in ok.warnings)


def test_first_bounty_and_cpa_only_pricing() -> None:
    first = suggest_cpm(req(plan="pro", first_bounty=True, budget_cents=150_000))
    assert first.all_in is not None
    assert first.all_in.matched_cents == 50_000
    assert first.all_in.fee_reserve_cents == 0
    assert first.all_in.budget_cents == 200_000
    cpa = suggest_cpm(req(plan="free", bounty_type="cpa", budget_cents=120_000))
    assert cpa.all_in is not None
    assert cpa.all_in.take_rate == 0.06
    assert suggest_cpm(req()).all_in is None  # no budget, no all-in price


def test_curve_points_are_ordered_and_fill_falls_as_price_rises() -> None:
    r = suggest_cpm(req())
    assert [p.multiplier for p in r.curve] == [0.6, 0.8, 1.0, 1.2, 1.5, 2.0]
    assert [p.vs_clearing_pct for p in r.curve] == [-40, -20, 0, 20, 50, 100]
    p50 = [p.fill_hours_p50 for p in r.curve]
    assert p50 == sorted(p50, reverse=True)


def test_suggest_request_validation() -> None:
    with pytest.raises(ValidationError):
        SuggestCpmRequest(category="crypto")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        MarketStats(clearing_cpm_cents=0, median_fill_hours=10, sample_n=1)
    with pytest.raises(ValidationError):
        SuggestCpmRequest(category="fitness", target_fill_hours=0)


# ── money formulas ──────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("case", load_vectors("funding")["cases"], ids=lambda c: c["id"])
def test_funding_vectors(case: dict) -> None:
    i = case["in"]
    assert_subset(case["out"], funding(i["budget_cents"], i["take_rate"], i["matched_cents"]).as_dict())


@pytest.mark.parametrize("case", load_vectors("first_bounty_funding")["cases"], ids=lambda c: c["id"])
def test_first_bounty_vectors(case: dict) -> None:
    assert_subset(case["out"], first_bounty_funding(case["in"]["brand_funds_cents"]).as_dict())


@pytest.mark.parametrize("case", load_vectors("all_in_cpm")["cases"], ids=lambda c: c["id"])
def test_all_in_cpm_vectors(case: dict) -> None:
    i = case["in"]
    assert all_in_cpm(i["cpm_cents"], i["budget_cents"], i["card_charge_cents"]) == case["out"]


@pytest.mark.parametrize("case", load_vectors("expected_earnings")["cases"], ids=lambda c: c["id"])
def test_expected_earnings_vectors(case: dict) -> None:
    i = case["in"]
    e = expected_earnings(
        i["base_median_views"],
        i["cpm_cents"],
        i["per_video_cap_cents"],
        i["rates"]["install"],
        i["rates"]["trial"],
        i["rates"]["paid"],
    )
    assert_subset(case["out"], {k: v.as_dict() for k, v in e.items()})


def test_money_matches_the_contracts_own_vectors() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("contract vectors not present")
    for c in v["funding"]:
        got = (
            first_bounty_funding(c["in"]["brand_funds_cents"])
            if "brand_funds_cents" in c["in"]
            else funding(c["in"]["budget_cents"], c["in"]["take_rate"])
        )
        assert_subset(c["out"], got.as_dict())
    for c in v["expected_earnings"]:
        i = c["in"]
        rates = i.get("rates", {})
        e = expected_earnings(
            i["base_median_views"],
            i["cpm_cents"],
            i["per_video_cap_cents"],
            rates.get("install", 0),
            rates.get("trial", 0),
            rates.get("paid", 0),
        )
        assert_subset(c["out"], {k: v_.as_dict() for k, v_ in e.items()})


def test_contract_worked_examples() -> None:
    f = funding(500_000, 0.12)
    assert (f.fee_reserve_cents, f.escrow_total_cents, f.processing_cents, f.card_charge_cents) == (
        60_000,
        560_000,
        16_270,
        576_270,
    )
    assert all_in_cpm(200, 500_000, f.card_charge_cents) == 231
    m = first_bounty_funding(150_000)
    assert (m.matched_cents, m.budget_cents, m.brand_funded_cents, m.card_charge_cents) == (
        50_000,
        200_000,
        150_000,
        154_380,
    )
    assert all_in_cpm(200, m.budget_cents, m.card_charge_cents) == 154
    e = expected_earnings(14_200, 210, 25_000, 40, 150, 400)
    assert (e["p25"].pay_cents, e["median"].pay_cents, e["p75"].pay_cents) == (1_756, 4_389, 11_191)


def test_take_rate_card_processing_and_all_in_rate() -> None:
    assert take_rate("free") == 0.12
    assert take_rate("pro") == 0.10
    assert take_rate("scale") == 0.08
    assert take_rate("pro", "cpa") == 0.06
    assert take_rate("scale", "install_only") == 0.06
    assert take_rate("pro", None, first_bounty_waived=True) == 0.0
    assert card_processing(0) == 0
    assert card_processing(100) == 33  # 2.9 -> 3, + 30
    assert all_in_rate(200, 0.10) == 226
    assert math.isclose(all_in_cpm(0, 1, 1), 0)
    assert all_in_cpm(200, 0, 100) == 0
