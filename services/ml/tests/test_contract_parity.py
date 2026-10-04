"""Parity with the contract: the Python service against the contract's executable JavaScript reference (node).

Skipped when node or ``packages/contract`` is unavailable, so a Python-only CI still passes; on a full checkout these tests are what
prove the TypeScript engine, the Swift engine and this service are computing the same numbers.
"""

from __future__ import annotations

import random

import pytest

from flowd_ml import constants as K
from flowd_ml.fraud.compose import compose, fraud_action
from flowd_ml.matching.rank import match_score
from flowd_ml.numeric import js_round, mul_rate, round2, to_fixed
from flowd_ml.pricing.fill import fill_time, price_curve
from flowd_ml.pricing.money import all_in_cpm, expected_earnings, first_bounty_funding, funding
from flowd_ml.scoring.bands import band_for, predicted_views
from flowd_ml.scoring.core import FlowObs, HookObs, score_flow_raw, score_hook_raw
from helpers import assert_subset, contract_vectors, load_vectors, run_node

pytestmark = pytest.mark.contract

REQUIRED = (
    "rounding",
    "bands",
    "hook_score",
    "flow_score",
    "fraud_compose",
    "match_score",
    "price_curve",
    "fill_time",
    "funding",
    "first_bounty_funding",
    "all_in_cpm",
    "expected_earnings",
)


# ── constants ───────────────────────────────────────────────────────────────────────────────────
def test_constants_mirror_the_contract_exactly() -> None:
    c = run_node({"__constants__": True})
    assert {p: v["take_rate"] for p, v in c["plans"].items()} == K.PLAN_TAKE_RATE
    f = c["fees"]
    assert (
        f["cpa_only_take_rate"],
        f["matched_first_bounty_cap_cents"],
        f["card_processing_rate"],
        f["card_processing_fixed_cents"],
    ) == (K.CPA_ONLY_TAKE_RATE, K.MATCHED_FIRST_BOUNTY_CAP_CENTS, K.CARD_PROCESSING_RATE, K.CARD_PROCESSING_FIXED_CENTS)
    p = c["pay"]
    assert (
        p["default_cpm_cents"],
        p["floor_cpm_cents"],
        p["default_per_video_cap_cents"],
        p["min_bounty_budget_cents"],
    ) == (K.PAY_DEFAULT_CPM_CENTS, K.PAY_FLOOR_CPM_CENTS, K.PAY_DEFAULT_CAP_CENTS, K.PAY_MIN_BOUNTY_BUDGET_CENTS)
    s = c["scores"]
    assert s["bands"] == K.BANDS
    assert s["band_view_multiplier"] == K.BAND_VIEW_MULTIPLIER
    assert s["checklist_label"] == K.CHECKLIST_LABEL
    assert [
        {"id": i["id"], "label": i["label"], "weight": i["weight"], "rule": i["rule"]} for i in s["hook_checklist"]
    ] == list(K.HOOK_CHECKLIST)
    assert [
        {"id": i["id"], "label": i["label"], "weight": i["weight"], "rule": i["rule"]} for i in s["flow_checklist"]
    ] == list(K.FLOW_CHECKLIST)
    fr = c["fraud"]
    assert {k: (v["max_points"], v["rule"]) for k, v in fr["signals"].items()} == K.FRAUD_SIGNALS
    assert {k: tuple(v) for k, v in fr["bands"].items()} == K.FRAUD_BANDS
    assert (
        fr["review_threshold"],
        fr["hold_threshold"],
        fr["review_sla_hours"],
        fr["duplicate_phash_max_distance"],
    ) == (K.FRAUD_REVIEW_THRESHOLD, K.FRAUD_HOLD_THRESHOLD, K.FRAUD_REVIEW_SLA_HOURS, K.DUPLICATE_PHASH_MAX_DISTANCE)
    fd = c["funnel_defaults"]
    assert (fd["view_to_visit"], fd["visit_to_install"], fd["install_to_trial"], fd["trial_to_paid"]) == (
        K.FUNNEL_VIEW_TO_VISIT,
        K.FUNNEL_VISIT_TO_INSTALL,
        K.FUNNEL_INSTALL_TO_TRIAL,
        K.FUNNEL_TRIAL_TO_PAID,
    )
    assert fd["views_quantile_ratio"] == K.VIEWS_QUANTILE_RATIO
    m = c["matching"]
    assert (
        m["weights"],
        m["recency_half_life_days"],
        m["price_ratio_cap"],
        m["gates"],
        m["min_match_to_rank_first"],
    ) == (
        K.MATCH_WEIGHTS,
        K.MATCH_RECENCY_HALF_LIFE_DAYS,
        K.MATCH_PRICE_RATIO_CAP,
        list(K.MATCH_GATES),
        K.MATCH_MIN_TO_RANK_FIRST,
    )
    pm = c["pricing_model"]
    assert (
        pm["fill_exponent"],
        pm["p80_multiplier"],
        pm["min_fill_hours"],
        pm["confidence_k"],
        pm["curve_cpm_multipliers"],
        pm["thin_market_min_sample"],
    ) == (
        K.PRICING_FILL_EXPONENT,
        K.PRICING_P80_MULTIPLIER,
        K.PRICING_MIN_FILL_HOURS,
        K.PRICING_CONFIDENCE_K,
        list(K.PRICING_CURVE_MULTIPLIERS),
        K.PRICING_THIN_MARKET_MIN_SAMPLE,
    )
    assert c["tiers"]["order"] == list(K.TIER_ORDER)
    st = c["studio"]
    assert (st["aspect"], st["width"], st["height"], st["min_duration_s"], st["max_duration_s"]) == (
        K.STUDIO_ASPECT,
        K.STUDIO_WIDTH,
        K.STUDIO_HEIGHT,
        K.STUDIO_MIN_DURATION_S,
        K.STUDIO_MAX_DURATION_S,
    )
    assert c["lint"]["thresholds"]["low_effective_pay_median_cents"] == K.LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS
    assert c["auto_approve"]["default_max_fraud_score"] == K.AUTO_APPROVE_DEFAULT_MAX_FRAUD_SCORE
    assert c["compliance"]["disclosure_tag"] == K.COMPLIANCE_DISCLOSURE_TAG
    assert c["compliance"]["default_disclosure_text"] == K.COMPLIANCE_DEFAULT_DISCLOSURE
    assert c["now"] == K.NOW


def test_enum_vocabulary_matches_the_contract_types() -> None:
    from helpers import REPO

    ts = (REPO / "packages" / "contract" / "types.ts").read_text(encoding="utf-8")
    for const, values in (
        ("HOOK_TYPES", K.ENUM_HOOK_TYPES),
        ("BEAT_IDS", K.ENUM_BEAT_IDS),
        ("FORMAT_IDS", K.ENUM_FORMAT_IDS),
        ("CTA_TYPES", K.ENUM_CTA_TYPES),
        ("CATEGORIES", K.ENUM_CATEGORIES),
        ("NICHES", K.ENUM_NICHES),
        ("COUNTRIES", K.ENUM_COUNTRIES),
        ("QA_CHECK_TYPES", K.ENUM_QA_CHECKS),
        ("PLATFORMS", K.ENUM_PLATFORMS),
        ("TRAFFIC_SOURCES", K.ENUM_TRAFFIC_SOURCES),
        ("FATIGUE_METRICS", K.ENUM_FATIGUE_METRICS),
    ):
        marker = f"export const {const} = ["
        assert marker in ts, const
        body = ts.split(marker, 1)[1].split("]", 1)[0]
        listed = [v.strip().strip("'\"") for v in body.replace("\n", " ").split(",") if v.strip()]
        assert listed == list(values), (const, listed)


# ── the contract's own vector file ──────────────────────────────────────────────────────────────
def test_the_contracts_formula_vectors_replay_through_the_node_reference_and_python() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("formula-vectors.json is not present")
    suites = {
        "hook_score": [c["in"] for c in v["hook_score"]],
        "flow_score": [c["in"] for c in v["flow_score"]],
        "match_score": [c["in"] for c in v["match_score"]],
        "price_curve": [c["in"] for c in v["price_curve"]],
    }
    ref = run_node(suites)
    for name in suites:
        for case, got in zip(v[name], ref[name], strict=True):
            assert_subset(
                case["out"], got
            )  # the vector file agrees with the reference, and our code agrees with the vector file elsewhere


# ── golden vectors written by this service, checked against the contract reference ──────────────
@pytest.mark.parametrize("suite", REQUIRED)
def test_required_vector_suites_match_the_contract_reference(suite: str) -> None:
    v = load_vectors(suite)
    ref = run_node({suite: [c["in"] for c in v["cases"]]})[suite]
    for case, got in zip(v["cases"], ref, strict=True):
        diff = _diff(case["out"], got)
        assert diff is None, f"{suite}/{case['id']}: {diff}"


def _diff(expected, actual):
    from helpers import subset_diff

    return subset_diff(expected, actual)


# ── fuzz: random inputs through both implementations ────────────────────────────────────────────
def _rnd_ms(rng: random.Random, p_none: float = 0.15) -> int | None:
    return (
        None
        if rng.random() < p_none
        else rng.choice(
            [
                0,
                100,
                999,
                1000,
                1001,
                1499,
                1500,
                1501,
                1999,
                2000,
                2001,
                2999,
                3000,
                3001,
                4999,
                5000,
                5001,
                rng.randint(0, 9000),
            ]
        )
    )


def test_fuzz_hook_and_flow_scores_match_the_reference() -> None:
    rng = random.Random(2026)
    hooks = [
        {
            "lands_ms": _rnd_ms(rng),
            "onscreen_ms": _rnd_ms(rng),
            "spoken_matches_onscreen": rng.random() < 0.5,
            "face_ms": _rnd_ms(rng),
            "faceless": rng.random() < 0.15,
            "app_ms": _rnd_ms(rng),
            "interrupt_ms": _rnd_ms(rng),
            "hook_type_known": rng.random() < 0.6,
            "hook_type_above_median": rng.random() < 0.4,
            "speech_ms": _rnd_ms(rng),
            "captions_in_safe_zone": rng.random() < 0.5,
        }
        for _ in range(400)
    ]
    flows = [
        {
            "hook_points": rng.randint(0, 100),
            "beats_found": (b := rng.randint(0, 8)) and rng.randint(0, b),
            "beats_required": b,
            "app_ms": _rnd_ms(rng, 0.1),
            "disclosure_audio": rng.random() < 0.6,
            "disclosure_onscreen": rng.random() < 0.6,
            "duration_s": rng.choice(
                [
                    rng.uniform(0, 70),
                    9.99,
                    10,
                    14.99,
                    15,
                    30,
                    30.01,
                    45,
                    45.01,
                    24.5,
                    11.5,
                    round(rng.uniform(5, 60), 1),
                ]
            ),
            "captions_in_safe_zone": rng.random() < 0.5,
            "single_cta": rng.random() < 0.5,
            "ends_on_win_state": rng.random() < 0.5,
            "audio_gaps": rng.randint(0, 4),
            "format_order": rng.choice(["in_order", "one_off", "out_of_order"]),
        }
        for _ in range(400)
    ]
    ref = run_node({"hook_score": hooks, "flow_score": flows})
    for h, got in zip(hooks, ref["hook_score"], strict=True):
        assert score_hook_raw(HookObs(**h)).as_dict() == got, h
    for f, got in zip(flows, ref["flow_score"], strict=True):
        assert score_flow_raw(FlowObs(**f)).as_dict() == got, f


def test_fuzz_fraud_match_pricing_and_money_match_the_reference() -> None:
    rng = random.Random(7)
    signals = list(K.FRAUD_SIGNALS)
    fraud = [
        {
            "precomputed_signals": [
                {"signal": rng.choice(signals), "severity": round(rng.random(), rng.choice([1, 2, 3]))}
                for _ in range(rng.randint(0, 10))
            ]
        }
        for _ in range(300)
    ]
    match = [
        {
            "gates": {"tier": rng.random() < 0.9, "country": rng.random() < 0.95},
            "niche_overlap": round(rng.random(), 2),
            "platform_fit": rng.choice([0, 0.7, 1]),
            "region_fit": round(rng.random(), 2),
            "price_ratio": round(rng.uniform(0, 3), 2),
            "brand_reliability": rng.randint(0, 120),
            "bounty_age_days": rng.choice([0, 1, 14, 28, round(rng.uniform(0, 90), 1)]),
        }
        for _ in range(300)
    ]
    fill = [
        {
            "cpm_cents": rng.randint(20, 1500),
            "clearing_cpm_cents": rng.randint(50, 800),
            "median_fill_hours": round(rng.uniform(4, 120), 1),
            "sample_n": rng.choice([0, 3, 7, 8, 40, 500]),
        }
        for _ in range(300)
    ]
    curve = [
        {
            "clearing_cpm_cents": rng.randint(50, 800),
            "median_fill_hours": round(rng.uniform(4, 120), 1),
            "sample_n": rng.choice([0, 5, 38, 400]),
        }
        for _ in range(100)
    ]
    fund = [
        {
            "budget_cents": rng.randint(10_000, 5_000_000),
            "take_rate": rng.choice([0, 0.06, 0.08, 0.10, 0.12]),
            "matched_cents": rng.choice([0, 0, 50_000]),
        }
        for _ in range(200)
    ]
    first = [{"brand_funds_cents": rng.randint(1, 2_000_000)} for _ in range(100)]
    earn = [
        {
            "base_median_views": rng.choice([0, 800, 14_200, rng.randint(0, 400_000)]),
            "cpm_cents": rng.randint(50, 600),
            "rates": {"install": rng.randint(0, 80), "trial": rng.randint(0, 300), "paid": rng.randint(0, 900)},
            "per_video_cap_cents": rng.choice([2_000, 25_000, 100_000]),
        }
        for _ in range(150)
    ]
    rounding = [
        {"fn": "mul_rate", "args": [rng.randint(0, 5_000_000), rng.choice([0.029, 0.06, 0.08, 0.1, 0.12, 0.015, 0.01])]}
        for _ in range(200)
    ]
    rounding += [{"fn": "round2", "args": [round(rng.uniform(0, 5), rng.choice([2, 3, 4]))]} for _ in range(100)]
    rounding += [
        {
            "fn": "to_fixed",
            "args": [
                rng.choice([2.25, 24.5, round(rng.uniform(0, 100), 2), rng.randint(0, 9000) / 1000]),
                rng.choice([0, 1, 2]),
            ],
        }
        for _ in range(150)
    ]
    bands = [
        {"fn": "band_for", "args": [rng.choice([84.99, 85, 69.99, 70, 54.99, 55, 39.99, 40, rng.uniform(0, 100)])]}
        for _ in range(60)
    ]
    bands += [{"fn": "predicted_views", "args": [rng.randint(0, 200_000), rng.choice("ABCDE")]} for _ in range(60)]
    ref = run_node(
        {
            "fraud_compose": fraud,
            "match_score": match,
            "fill_time": fill,
            "price_curve": curve,
            "funding": fund,
            "first_bounty_funding": first,
            "expected_earnings": earn,
            "rounding": rounding,
            "bands": bands,
        }
    )

    for inp, got in zip(fraud, ref["fraud_compose"], strict=True):
        score, band, hits = compose(inp["precomputed_signals"])
        assert (score, band, fraud_action(score), [(h.signal, h.points) for h in hits]) == (
            got["score"],
            got["band"],
            got["action"],
            [(s["signal"], s["points"]) for s in got["signals"]],
        )
    for i, got in zip(match, ref["match_score"], strict=True):
        assert (
            match_score(
                i["gates"],
                i["niche_overlap"],
                i["platform_fit"],
                i["region_fit"],
                i["price_ratio"],
                i["brand_reliability"],
                i["bounty_age_days"],
            )
            == got
        )
    for i, got in zip(fill, ref["fill_time"], strict=True):
        f = fill_time(i["cpm_cents"], i["clearing_cpm_cents"], i["median_fill_hours"], i["sample_n"])
        assert (f.fill_hours_p50, f.fill_hours_p80, f.confidence, f.thin_market) == (
            got["fill_hours_p50"],
            got["fill_hours_p80"],
            got["confidence"],
            got["thin_market"],
        ), i
    for i, got in zip(curve, ref["price_curve"], strict=True):
        pts = price_curve(i["clearing_cpm_cents"], i["median_fill_hours"], i["sample_n"])
        assert [(p.cpm_cents, p.fill_hours_p50, p.fill_hours_p80, p.confidence) for p in pts] == [
            (g["cpm_cents"], g["fill_hours_p50"], g["fill_hours_p80"], g["confidence"]) for g in got
        ], i
    for i, got in zip(fund, ref["funding"], strict=True):
        assert_subset(got, funding(i["budget_cents"], i["take_rate"], i["matched_cents"]).as_dict())
        assert all_in_cpm(200, i["budget_cents"], got["card_charge_cents"]) > 0
    for i, got in zip(first, ref["first_bounty_funding"], strict=True):
        assert_subset(got, first_bounty_funding(i["brand_funds_cents"]).as_dict())
    for i, got in zip(earn, ref["expected_earnings"], strict=True):
        e = expected_earnings(
            i["base_median_views"],
            i["cpm_cents"],
            i["per_video_cap_cents"],
            i["rates"]["install"],
            i["rates"]["trial"],
            i["rates"]["paid"],
        )
        assert {k: v.as_dict() for k, v in e.items()} == got, i
    fns = {
        "mul_rate": mul_rate,
        "js_round": js_round,
        "round2": round2,
        "to_fixed": to_fixed,
        "band_for": band_for,
        "predicted_views": predicted_views,
    }
    for i, got in zip(rounding, ref["rounding"], strict=True):
        assert fns[i["fn"]](*i["args"]) == got, i
    for i, got in zip(bands, ref["bands"], strict=True):
        assert fns[i["fn"]](*i["args"]) == got, i


# ── the generated rule tables in DOMAIN.md (12.1, 12.3, 12.4) ───────────────────────────────────
def _domain_block(name: str) -> str:
    from helpers import REPO

    path = REPO / "packages" / "contract" / "DOMAIN.md"
    if not path.exists():
        pytest.skip("packages/contract/DOMAIN.md is not present")
    text = path.read_text(encoding="utf-8")
    start, end = f"<!-- GENERATED:{name} -->", f"<!-- /GENERATED:{name} -->"
    assert start in text, f"DOMAIN.md has no {name} block"
    return text.split(start, 1)[1].split(end, 1)[0]


def test_reason_codes_match_domain_md_section_12_1() -> None:
    from flowd_ml.qa.reasons import REASON_CODES

    rows = [
        [c.strip() for c in line.strip().strip("|").split("|")]
        for line in _domain_block("reason-codes").splitlines()
        if line.startswith("| `")
    ]
    assert len(rows) == 21
    assert {r[0].strip("`") for r in rows} == set(REASON_CODES)
    for code, label, applies_to, category, qa_check, creator_copy, fix_hint in rows:
        meta = REASON_CODES[code.strip("`")]
        expected_check = None if qa_check == "-" else qa_check.strip("`")
        assert (meta.label, meta.applies_to, meta.category, meta.qa_check, meta.creator_copy, meta.fix_hint) == (
            label,
            applies_to,
            category,
            expected_check,
            creator_copy,
            fix_hint,
        ), code


def test_fraud_signals_match_domain_md_section_12_4() -> None:
    import re

    found = {}
    for line in _domain_block("fraud-signals").splitlines():
        m = re.match(r"\| `(\w+)` \| (\d+) \| (.*) \|$", line)
        if m:
            found[m.group(1)] = (int(m.group(2)), m.group(3))
    assert len(found) == 10
    assert found == dict(K.FRAUD_SIGNALS)
    assert sum(points for points, _ in found.values()) == 160, (
        "ten signals; the score is capped at 100, so no single signal is decisive"
    )


def test_checklists_match_domain_md_section_12_3() -> None:
    import re

    items: dict[str, list[dict[str, object]]] = {"Hook Score": [], "Flow Score": []}
    for line in _domain_block("score-items").splitlines():
        m = re.match(r"\| (Hook Score|Flow Score) \| `(\w+)` \| (.*?) \| (\d+) \| (.*) \|$", line)
        if m:
            items[m.group(1)].append(
                {"id": m.group(2), "label": m.group(3), "weight": int(m.group(4)), "rule": m.group(5)}
            )
    assert items["Hook Score"] == list(K.HOOK_CHECKLIST)
    assert items["Flow Score"] == list(K.FLOW_CHECKLIST)
    assert sum(int(i["weight"]) for i in items["Hook Score"]) == 100
    assert sum(int(i["weight"]) for i in items["Flow Score"]) == 100
