"""Matching: gates, factors, adjacency, embeddings that can only lift, ordering."""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from flowd_ml.matching import HashingEmbedder, cosine, match_score, rank_bounties
from flowd_ml.matching.rank import niche_factor, platform_factor, price_factor, region_factor
from flowd_ml.schemas.matching import MatchBounty, MatchCreator, MatchRequest
from helpers import assert_subset, contract_vectors, load_vectors

CREATOR = {
    "id": "cr_maya",
    "tier": "silver",
    "country": "US",
    "niches": ["ai_tools"],
    "platforms_linked": ["tiktok"],
    "primary_platform": "tiktok",
    "audience_geo": {"US": 0.71, "CA": 0.08},
    "median_views_28d": 14_200,
    "usual_pay_cents": 3_650,
}
BOUNTY = {
    "id": "b1",
    "category": "ai_photo",
    "niches": ["ai_tools"],
    "min_tier": "bronze",
    "countries": ["US", "CA"],
    "platforms": ["tiktok", "instagram"],
    "target_countries": ["US"],
    "min_target_audience_ratio": 0.5,
    "funded": True,
    "expected_pay_cents": 4_380,
    "brand_reliability": 94,
    "age_days": 2,
}
GATES = {
    "eligibility_tier": True,
    "country": True,
    "platform_account_linked": True,
    "funded": True,
    "not_already_submitted": True,
}


def creator(**o) -> MatchCreator:
    return MatchCreator(**{**CREATOR, **o})


def bounty(**o) -> MatchBounty:
    return MatchBounty(**{**BOUNTY, **o})


def rank(bounties, c=None, **kw):
    return rank_bounties(MatchRequest(creator=c or creator(), bounties=bounties, use_embeddings=False, **kw), None)


@pytest.mark.parametrize("case", load_vectors("match_score")["cases"], ids=lambda c: c["id"])
def test_match_score_vectors(case: dict) -> None:
    i = case["in"]
    got = match_score(
        i["gates"],
        i["niche_overlap"],
        i["platform_fit"],
        i["region_fit"],
        i["price_ratio"],
        i["brand_reliability"],
        i["bounty_age_days"],
    )
    assert got == case["out"]


def test_match_score_matches_the_contracts_own_vectors() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("contract vectors not present")
    for c in v["match_score"]:
        i = c["in"]
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
            == c["out"]
        )


def test_rank_vector_replays() -> None:
    case = load_vectors("match_rank")["cases"][0]
    r = rank_bounties(MatchRequest.model_validate(case["in"]), None)
    got = {
        "top_pick_bounty_id": r.top_pick_bounty_id,
        "ranked": [
            {
                "bounty_id": x.bounty_id,
                "rank": x.rank,
                "score": x.score,
                "factors": [{"key": f.key, "points": f.points} for f in x.factors],
            }
            for x in r.ranked
        ],
        "locked": [{"bounty_id": x.bounty_id, "locked_by": x.locked_by} for x in r.locked],
    }
    assert_subset(case["out"], got)


def test_the_contract_example_scores_96_with_every_factor_explained() -> None:
    r = rank([bounty()])
    top = r.ranked[0]
    assert top.score == 96
    assert top.rank == 1
    assert r.top_pick_bounty_id == "b1"
    assert [f.key for f in top.factors] == ["niche", "platform", "region", "price", "brand_reliability", "recency"]
    assert [f.points for f in top.factors] == [40, 15, 15, 12, 9.4, 4.53]
    assert all(f.reason for f in top.factors)
    assert top.reasons[0].code == "price"  # the biggest shortfall is listed first
    assert top.reasons[0].impact == -3.0
    assert "strongest on" in top.summary
    assert top.price_ratio == 1.2
    assert top.expected_pay_cents == 4_380


def test_gates_lock_a_bounty_and_name_every_failed_gate() -> None:
    r = rank(
        [
            bounty(id="tier", min_tier="gold"),
            bounty(id="country", countries=["GB"]),
            bounty(id="platform", platforms=["youtube"]),
            bounty(id="funded", funded=False),
            bounty(id="done", already_submitted=True),
            bounty(id="ok"),
        ]
    )
    assert [x.bounty_id for x in r.ranked] == ["ok"]
    locked = {x.bounty_id: x for x in r.locked}
    assert locked["tier"].locked_by == ["eligibility_tier"]
    assert "Needs gold tier; you are silver." in locked["tier"].reasons[0].message
    assert locked["country"].locked_by == ["country"]
    assert locked["platform"].locked_by == ["platform_account_linked"]
    assert locked["funded"].locked_by == ["funded"]
    assert "escrowed" in locked["funded"].summary
    assert locked["done"].locked_by == ["not_already_submitted"]
    assert all(x.score is None and not x.eligible for x in r.locked)
    both = rank([bounty(min_tier="elite", funded=False)]).locked[0]
    assert both.locked_by == ["eligibility_tier", "funded"]


def test_submitted_bounty_ids_on_the_creator_also_lock() -> None:
    r = rank([bounty(id="b1")], c=creator(submitted_bounty_ids=["b1"]))
    assert r.ranked == []
    assert r.locked[0].locked_by == ["not_already_submitted"]
    assert r.summary.startswith("No open bounty fits")


def test_niche_factor_direct_adjacent_and_neutral() -> None:
    c = creator(niches=["ai_tools", "lifestyle"])
    assert niche_factor(c, bounty(niches=["ai_tools"]))[0] == 1.0
    assert niche_factor(c, bounty(niches=["ai_tools", "fitness"]))[0] == 0.5  # 1 direct of 2
    assert niche_factor(creator(niches=["tech"]), bounty(niches=["ai_tools"]))[0] == 0.5  # adjacent
    assert niche_factor(creator(niches=["food"]), bounty(niches=["fitness"]))[0] == 0.0
    f, _src, text = niche_factor(creator(niches=["ai_tools"]), bounty(niches=[], category="fitness"))
    assert f == 0.0
    assert "fitness" in text  # category supplies the niches
    assert (
        niche_factor(c, bounty(niches=[], category="fitness"))[0] == 0.25
    )  # lifestyle is adjacent to wellness: 0.5 x 1 of 2
    assert niche_factor(c, bounty(niches=[], category=None))[0] == 0.5
    assert "Adjacent niche" in niche_factor(creator(niches=["tech"]), bounty(niches=["ai_tools"]))[2]


def test_platform_region_and_price_factors() -> None:
    assert platform_factor(creator(), bounty())[0] == 1.0
    assert (
        platform_factor(
            creator(platforms_linked=["tiktok", "instagram"], primary_platform="instagram"),
            bounty(platforms=["tiktok"]),
        )[0]
        == 0.7
    )
    assert platform_factor(creator(), bounty(platforms=["youtube"]))[0] == 0.0
    assert region_factor(creator(), bounty())[0] == 1.0
    assert region_factor(creator(audience_geo={"US": 0.25}), bounty())[0] == 0.5
    assert region_factor(creator(audience_geo=None), bounty())[0] == 0.6  # neutral, and says so
    assert "Link an account" in region_factor(creator(audience_geo=None), bounty())[1]
    assert region_factor(creator(), bounty(target_countries=[]))[0] == 1.0
    ratio, fit, pay, _ = price_factor(creator(), bounty(expected_pay_cents=7_300))
    assert (ratio, round(fit, 3), pay) == (2.0, 1.0, 7_300)  # capped at 1.5x
    assert price_factor(creator(usual_pay_cents=None), bounty())[0] == 1.0


def test_pay_terms_run_pay_math_at_the_creators_median_views() -> None:
    b = bounty(
        expected_pay_cents=None,
        pay={
            "cpm_cents": 210,
            "install_cents": 40,
            "trial_cents": 150,
            "paid_cents": 400,
            "per_video_cap_cents": 25_000,
        },
    )
    r = rank([b])
    assert r.ranked[0].expected_pay_cents == 4_389  # the contract's median example: $43.89
    no_views = rank([b], c=creator(median_views_28d=None))
    assert no_views.ranked[0].expected_pay_cents is None
    assert no_views.ranked[0].price_ratio is None


def test_new_brands_get_a_neutral_reliability_and_say_so() -> None:
    f = {x.key: x for x in rank([bounty(brand_reliability=None)]).ranked[0].factors}
    assert f["brand_reliability"].value == 0.7
    assert "New brand" in f["brand_reliability"].reason


def test_ranking_order_and_tiebreaks_and_limit() -> None:
    r = rank(
        [
            bounty(id="b_old", age_days=0, expected_pay_cents=4_380),
            bounty(id="b_new_cheap", age_days=0, expected_pay_cents=1_000),
            bounty(id="b_a", age_days=0, expected_pay_cents=4_380),
        ]
    )
    assert [x.bounty_id for x in r.ranked] == [
        "b_a",
        "b_old",
        "b_new_cheap",
    ]  # equal score + equal age + equal pay: by id
    assert [x.rank for x in r.ranked] == [1, 2, 3]
    assert [x.bounty_id for x in rank([bounty(id="x"), bounty(id="y", expected_pay_cents=100)], limit=1).ranked] == [
        "x"
    ]
    fresh_first = rank(
        [
            bounty(id="stale", age_days=40, expected_pay_cents=9_000),
            bounty(id="fresh", age_days=0, expected_pay_cents=4_380),
        ]
    )
    assert fresh_first.ranked[0].bounty_id == "fresh"


def test_no_top_pick_below_60() -> None:
    weak = bounty(
        niches=["fitness"],
        platforms=["tiktok"],
        target_countries=["US"],
        min_target_audience_ratio=0.9,
        expected_pay_cents=500,
        brand_reliability=30,
        age_days=60,
    )
    r = rank([weak], c=creator(niches=["food"], audience_geo={"US": 0.2}))
    assert r.ranked[0].score is not None
    assert r.ranked[0].score < 60
    assert r.top_pick_bounty_id is None
    assert "no top pick" in r.summary


# ── embeddings ──────────────────────────────────────────────────────────────────────────────────
def test_hashing_embedder_is_deterministic_unit_length_and_semantic() -> None:
    e = HashingEmbedder(256)
    a, b, c = e.embed_texts(
        ["AI photo editor that fixes selfies", "AI photo editor that fixes selfies", "budget app for saving money"]
    )
    assert a == b
    assert len(a) == 256
    assert e.dim == 256
    assert math.isclose(sum(x * x for x in a), 1.0, rel_tol=1e-9)
    similar = e.embed_texts(["editing selfies with an AI photo app"])[0]
    assert cosine(a, similar) > cosine(a, c) + 0.1
    assert cosine(a, [0.0] * 256) == 0.0
    assert cosine([1.0], [1.0, 2.0]) == 0.0
    with pytest.raises(ValueError, match="at least 16"):
        HashingEmbedder(4)


def test_embedding_can_lift_a_weak_niche_match_but_never_lower_a_strong_one() -> None:
    e = HashingEmbedder()
    c = creator(niches=["food"], bio="I film AI photo glow-up reveals and test photo editing apps")
    b = bounty(niches=["fitness"], summary="Show an AI photo glow-up reveal in one take")
    plain = rank_bounties(MatchRequest(creator=c, bounties=[b], use_embeddings=False), None).ranked[0]
    lifted = rank_bounties(MatchRequest(creator=c, bounties=[b]), e).ranked[0]
    nf = lambda r: next(f for f in r.factors if f.key == "niche")  # noqa: E731
    assert nf(plain).value == 0.0
    assert nf(lifted).value > 0
    assert "similarity" in nf(lifted).reason
    assert lifted.embedding_similarity is not None  # type: ignore[operator]
    assert lifted.score > plain.score  # type: ignore[operator]
    perfect_c = creator(niches=["ai_tools"], bio="gardening and baking")
    perfect_b = bounty(niches=["ai_tools"], summary="enterprise tax software")
    out = rank_bounties(MatchRequest(creator=perfect_c, bounties=[perfect_b]), e).ranked[0]
    assert nf(out).value == 1.0  # a perfect rules match is never pulled down by a dissimilar embedding


def test_precomputed_embeddings_are_used_and_embeddings_can_be_switched_off() -> None:
    v = [1.0] + [0.0] * 15
    c = creator(niches=["food"], embedding=v)
    b = bounty(niches=["fitness"], embedding=v)
    r = rank_bounties(MatchRequest(creator=c, bounties=[b]), None).ranked[0]
    assert r.embedding_similarity == 1.0
    off = rank_bounties(MatchRequest(creator=c, bounties=[b], use_embeddings=False), None).ranked[0]
    assert off.embedding_similarity is None  # type: ignore[operator]
    assert off.score < r.score  # type: ignore[operator]


def test_match_request_validation() -> None:
    with pytest.raises(ValidationError):
        MatchRequest(creator=creator(), bounties=[])
    with pytest.raises(ValidationError):
        MatchCreator(**{**CREATOR, "niches": []})
    with pytest.raises(ValidationError):
        MatchCreator(**{**CREATOR, "tier": "diamond"})
    with pytest.raises(ValidationError):
        MatchBounty(**{**BOUNTY, "brand_reliability": 140})
