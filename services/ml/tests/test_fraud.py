"""View-fraud: score composition (contract), the ten detectors, curve analysis, explanations."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from flowd_ml.constants import FRAUD_SIGNALS
from flowd_ml.fraud import score_fraud
from flowd_ml.fraud.compose import compose, fraud_action, fraud_band, points_for
from flowd_ml.fraud.curve import analyse_curve, hourly_from_snapshots, longest_flat_run
from flowd_ml.schemas.fraud import FraudRequest, ViewPoint
from helpers import assert_subset, contract_vectors, load_vectors


def organic() -> list[int]:
    return load_vectors("fraud_detect")["cases"][0]["in"]["post"]["hourly_views"]


def fired(r) -> dict[str, tuple[float, int]]:
    return {s.signal: (s.severity, s.points) for s in r.signals}


@pytest.mark.parametrize("case", load_vectors("fraud_compose")["cases"], ids=lambda c: c["id"])
def test_composition_replays_every_golden_vector(case: dict) -> None:
    r = score_fraud(FraudRequest.model_validate(case["in"]))
    assert_subset(case["out"], r.model_dump(mode="json"))


@pytest.mark.parametrize("case", load_vectors("fraud_detect")["cases"], ids=lambda c: c["id"])
def test_detectors_replay_every_golden_vector(case: dict) -> None:
    r = score_fraud(FraudRequest.model_validate(case["in"]))
    got = {
        "score": r.score,
        "band": r.band,
        "action": r.action,
        "signals": [{"signal": s.signal, "severity": s.severity, "points": s.points} for s in r.signals],
    }
    assert_subset(case["out"], got)


def test_composition_matches_the_contracts_own_vectors() -> None:
    v = contract_vectors()
    if v is None:
        pytest.skip("contract vectors not present")
    for c in v["fraud"]:
        r = score_fraud(FraudRequest(precomputed_signals=c["in"]))
        assert_subset(
            {"score": c["out"]["score"], "band": c["out"]["band"], "signals": c["out"]["signals"]},
            r.model_dump(mode="json"),
        )


def test_the_contract_example_scores_60_and_goes_to_review() -> None:
    r = score_fraud(
        FraudRequest(
            precomputed_signals=[
                {"signal": "view_spike_no_engagement", "severity": 0.8},
                {"signal": "bought_views_pattern", "severity": 0.9},
                {"signal": "traffic_source_anomaly", "severity": 0.7},
                {"signal": "curve_shape", "severity": 0.6},
            ]
        )
    )
    assert (r.score, r.band, r.action) == (60, "review", "hold_for_human_review")
    assert [s.points for s in r.signals] == [20, 27, 7, 6]
    assert r.review_sla_hours == 24
    assert "human review within 24 hours" in r.summary


def test_bands_and_actions_at_the_boundaries() -> None:
    assert [fraud_band(s) for s in (0, 19, 20, 39, 40, 69, 70, 100)] == [
        "clean",
        "clean",
        "watch",
        "watch",
        "review",
        "review",
        "high",
        "high",
    ]
    assert [fraud_action(s) for s in (0, 39, 40, 69, 70)] == [
        "auto_clear",
        "auto_clear",
        "hold_for_human_review",
        "hold_for_human_review",
        "auto_hold_and_queue",
    ]
    assert points_for("view_spike_no_engagement", 0.5) == 13  # round half up: 12.5 -> 13
    assert points_for("engagement_anomaly", 0.04) == 0
    assert compose([{"signal": s, "severity": 1} for s in FRAUD_SIGNALS])[0] == 100  # capped, not 160


def test_high_band_is_auto_held_and_queued() -> None:
    r = score_fraud(
        FraudRequest(
            precomputed_signals=[
                {"signal": "bought_views_pattern", "severity": 1},
                {"signal": "view_spike_no_engagement", "severity": 1},
                {"signal": "duplicate_hash", "severity": 1},
            ]
        )
    )
    assert r.score == 75
    assert r.band == "high"
    assert r.action == "auto_hold_and_queue"
    assert r.review_sla_hours is None
    assert "queue for Ops" in r.summary


# ── curves ──────────────────────────────────────────────────────────────────────────────────────
def test_organic_curve_is_organic_and_decays() -> None:
    c = analyse_curve(organic())
    assert c.shape == "organic"
    assert c.flat_run_hours <= 24
    assert c.top2_share < 0.5
    assert c.decay_ratio is not None
    assert c.decay_ratio < 0.2


def test_stepped_spiky_and_flat_shapes() -> None:
    stepped = analyse_curve([120, 380, 54_000, 5_100, 300, 280, 250, 230, 210, 200, 190, 180])
    assert stepped.shape == "stepped"
    assert stepped.top2_share >= 0.8
    assert stepped.rest_flat
    spiky = analyse_curve([300, 300, 9_000, 400, 350, 320, 300, 280, 250, 700, 260, 240, 230, 220])
    assert spiky.shape == "spiky"
    assert spiky.spike_ratio >= 10
    drip = analyse_curve([180 + (i % 3) * 4 for i in range(72)])
    assert drip.shape == "flat"
    assert drip.flat_run_hours > 24


def test_flat_run_ignores_dead_tails_and_needs_enough_points() -> None:
    assert longest_flat_run([100, 90, 80, 70, 0, 0, 0, 0, 0, 0]) <= 3  # a post that went quiet is not "flat"
    assert longest_flat_run([5, 5]) == 0
    assert longest_flat_run([100] * 30) == 30


def test_snapshots_are_spread_into_hourly_deltas() -> None:
    pts = [ViewPoint(t_hours=0, views=0), ViewPoint(t_hours=6, views=600), ViewPoint(t_hours=12, views=900)]
    h = hourly_from_snapshots(pts)
    assert h == [100] * 6 + [50] * 6
    assert sum(h) == 900
    assert hourly_from_snapshots([ViewPoint(t_hours=0, views=0)]) == []
    assert (
        sum(hourly_from_snapshots([ViewPoint(t_hours=0, views=0), ViewPoint(t_hours=3, views=10)])) == 10
    )  # remainder is distributed


def test_empty_curve_is_rejected() -> None:
    with pytest.raises(ValueError, match="empty curve"):
        analyse_curve([])


# ── detectors ───────────────────────────────────────────────────────────────────────────────────
def test_healthy_post_fires_nothing_and_says_why() -> None:
    case = load_vectors("fraud_detect")["cases"][0]["in"]
    r = score_fraud(FraudRequest.model_validate(case))
    assert r.score == 0
    assert r.band == "clean"
    assert r.action == "auto_clear"
    assert r.signals == []
    assert len(r.checked) == 10
    assert all(s.status in ("clear", "no_data") for s in r.checked)
    assert r.reasons[0].code == "clean"
    assert r.reasons[0].severity == "positive"
    assert r.curve is not None
    assert r.curve.shape == "organic"


def test_spike_without_engagement_scales_with_the_spike_and_the_engagement() -> None:
    def sev(peak: int, likes: int) -> float:
        curve = [100] * 3 + [peak] + [100] * 8
        total = sum(curve)
        r = score_fraud(FraudRequest(post={"views": total, "likes": likes, "hourly_views": curve}))
        return fired(r).get("view_spike_no_engagement", (0, 0))[0]

    assert sev(1_000, 3) == 0.5  # exactly 10x
    assert sev(4_100, 0) > sev(1_000, 0)  # bigger spike, higher severity
    assert sev(4_100, 0) > sev(4_100, 40)  # engagement softens it
    assert sev(1_000, 400) == 0  # engagement above 0.5% clears it
    assert sev(900, 0) == 0  # 9x is below the line


def test_few_views_cannot_raise_a_spike() -> None:
    r = score_fraud(FraudRequest(post={"views": 150, "hourly_views": [1, 1, 100, 1, 1, 1, 1, 1, 1, 1, 1, 1]}))
    assert "view_spike_no_engagement" not in fired(r)


def test_cap_clustering_counts_posts_within_two_percent_of_the_cap() -> None:
    near = [{"earnings_cents": 24_800, "cap_cents": 25_000}] * 3 + [{"earnings_cents": 100, "cap_cents": 25_000}] * 2
    assert fired(score_fraud(FraudRequest(history=near)))["cap_clustering"] == (0.6, 12)
    four = [{"earnings_cents": 25_000, "cap_cents": 25_000}] * 4 + [{"earnings_cents": 100, "cap_cents": 25_000}]
    assert fired(score_fraud(FraudRequest(history=four)))["cap_clustering"][0] == 0.8
    two = [{"earnings_cents": 24_800, "cap_cents": 25_000}] * 2 + [{"earnings_cents": 100, "cap_cents": 25_000}] * 3
    assert "cap_clustering" not in fired(score_fraud(FraudRequest(history=two)))
    # the cap can come from the bounty, and views that snap to it count too
    snap = score_fraud(
        FraudRequest(
            post={"views": 124_000, "likes": 9_000, "comments": 400, "shares": 600},
            bounty={"per_video_cap_cents": 25_000, "cpm_cents": 200},
        )
    )
    assert fired(snap)["cap_clustering"][0] == 0.5
    over = score_fraud(FraudRequest(history=[{"earnings_cents": 26_000, "cap_cents": 25_000}] * 5))
    assert "cap_clustering" not in fired(over)  # earnings above the cap are not "within 2% under it"


def test_bought_views_needs_the_step_and_the_other_traffic() -> None:
    curve = [100, 100, 80_000, 9_000, 100, 100, 100, 100, 100, 100, 100, 100]
    both = score_fraud(
        FraudRequest(
            post={
                "views": sum(curve),
                "likes": 90,
                "hourly_views": curve,
                "traffic_sources": {"other": 0.75, "fyp": 0.25},
            }
        )
    )
    assert fired(both)["bought_views_pattern"][0] >= 0.7
    clean_source = score_fraud(
        FraudRequest(
            post={
                "views": sum(curve),
                "likes": 5_000,
                "comments": 400,
                "shares": 800,
                "hourly_views": curve,
                "traffic_sources": {"other": 0.2, "fyp": 0.8},
            }
        )
    )
    assert "bought_views_pattern" not in fired(clean_source)
    unknown = score_fraud(
        FraudRequest(post={"views": sum(curve), "likes": 5_000, "comments": 400, "shares": 800, "hourly_views": curve})
    )
    assert fired(unknown)["bought_views_pattern"][0] == 0.4  # step but source mix unconfirmed
    assert "unconfirmed" in next(s for s in unknown.signals if s.signal == "bought_views_pattern").detail


def test_geo_mismatch_uses_the_25_point_shortfall_rule() -> None:
    def run(us: float, want: float = 0.5):
        return score_fraud(
            FraudRequest(
                post={"views": 10_000, "likes": 800, "comments": 50, "shares": 50, "geo": {"US": us, "BR": 1 - us}},
                bounty={"target_countries": ["US"], "min_target_audience_ratio": want},
            )
        )

    assert "geo_mismatch" not in fired(run(0.26))  # 24 points short
    assert "geo_mismatch" not in fired(run(0.25))  # exactly 25 points short is not "more than 25"
    assert fired(run(0.24))["geo_mismatch"][0] == 0.42
    assert fired(run(0.0))["geo_mismatch"] == (1.0, 15)  # 50 points short: the maximum
    assert fired(run(0.2, 0.55))["geo_mismatch"][0] >= 0.4
    assert "geo_mismatch" in {s.signal for s in run(0.5).checked if s.status == "clear"}
    no_geo = score_fraud(FraudRequest(post={"views": 10_000, "likes": 800}, bounty={"target_countries": ["US"]}))
    assert next(s for s in no_geo.checked if s.signal == "geo_mismatch").status == "no_data"


def test_view_to_follower_outlier_and_new_account() -> None:
    r = score_fraud(
        FraudRequest(
            post={"views": 72_000, "likes": 4_000, "comments": 200, "shares": 300},
            account={"followers": 900, "account_age_days": 6},
        )
    )
    f = fired(r)
    assert f["view_to_follower_outlier"][0] == 0.63  # 80x followers: 0.5 + 0.5 x (80 - 40) / 160 = 0.625, half up
    assert f["new_account"][0] == 0.88  # 0.4 + 0.6 x (1 - 6/30)
    big = score_fraud(
        FraudRequest(
            post={"views": 72_000, "likes": 4_000, "comments": 200, "shares": 300},
            account={"followers": 9_000, "account_age_days": 400},
        )
    )
    assert fired(big) == {}  # an account over 5,000 followers is never a view-to-follower outlier
    assert "new_account" not in fired(score_fraud(FraudRequest(account={"account_age_days": 30})))
    assert fired(score_fraud(FraudRequest(account={"account_age_days": 0})))["new_account"] == (1.0, 10)


def test_duplicate_hash_severity_falls_with_distance() -> None:
    sev = [
        fired(score_fraud(FraudRequest(duplicate={"phash_distance": d}))).get("duplicate_hash", (None,))[0]
        for d in range(0, 9)
    ]
    assert sev[0] == 1.0
    assert sev[6] == 0.6
    assert sev[7] is None
    assert sev[8] is None
    assert sev[:7] == sorted(sev[:7], reverse=True)


def test_duplicate_is_computed_from_known_hashes() -> None:
    r = score_fraud(
        FraudRequest(
            phash="ffffffffffffffff",
            known_hashes=[
                {"id": "sub_9", "phash": "fffffffffffffff0", "kind": "own_earlier"},
                {"id": "sub_8", "phash": "0000000000000000"},
            ],
        )
    )
    hit = next(s for s in r.signals if s.signal == "duplicate_hash")
    assert "sub_9" in hit.detail
    assert "own earlier post" in hit.detail
    assert hit.severity == round(1 - 0.4 * 4 / 6, 2)


def test_engagement_anomaly_from_likes_or_comment_outlier() -> None:
    low = score_fraud(FraudRequest(post={"views": 30_000, "likes": 60, "comments": 2, "shares": 1}))
    assert fired(low)["engagement_anomaly"][0] == 0.75  # likes at 0.2%: halfway between the line and zero
    ok = score_fraud(FraudRequest(post={"views": 30_000, "likes": 2_000, "comments": 90, "shares": 60}))
    assert "engagement_anomaly" not in fired(ok)
    outlier = score_fraud(
        FraudRequest(
            post={"views": 20_000, "likes": 1_500, "comments": 800, "shares": 20},
            account={"comment_ratio_mean_28d": 0.004, "comment_ratio_sd_28d": 0.001},
        )
    )
    assert fired(outlier)["engagement_anomaly"][0] >= 0.5
    assert "comment ratio" in next(s for s in outlier.signals if s.signal == "engagement_anomaly").detail
    tiny = score_fraud(FraudRequest(post={"views": 500, "likes": 0}))
    assert "engagement_anomaly" not in fired(tiny)


def test_traffic_source_anomaly_and_flat_curve() -> None:
    r = score_fraud(
        FraudRequest(
            post={
                "views": 20_000,
                "likes": 1_500,
                "comments": 90,
                "shares": 120,
                "traffic_sources": {"fyp": 0.25, "other": 0.7},
            }
        )
    )
    assert fired(r)["traffic_source_anomaly"][0] == 0.4 + 0.6 * (0.2 / 0.4)
    drip = score_fraud(
        FraudRequest(
            post={
                "views": 13_000,
                "likes": 700,
                "comments": 30,
                "shares": 40,
                "hourly_views": [180 + (i % 3) * 4 for i in range(72)],
            }
        )
    )
    assert fired(drip)["curve_shape"][0] > 0.4
    assert drip.curve is not None
    assert drip.curve.shape == "flat"


def test_no_data_is_reported_never_silently_passed() -> None:
    r = score_fraud(FraudRequest(post={"views": 1_000}))
    statuses = {s.signal: s.status for s in r.checked}
    assert statuses["bought_views_pattern"] == "no_data"
    assert statuses["geo_mismatch"] == "no_data"
    assert statuses["duplicate_hash"] == "no_data"
    assert any(x.code == "no_data" for x in r.reasons)


def test_every_fired_signal_has_evidence_a_reason_and_a_next_step() -> None:
    r = score_fraud(FraudRequest.model_validate(load_vectors("fraud_detect")["cases"][1]["in"]))
    assert r.signals
    assert len(r.fixes) == len(r.signals)
    for s in r.signals:
        out = next(c for c in r.checked if c.signal == s.signal)
        assert out.evidence
        assert out.detail == s.detail
        assert s.severity > 0
        assert any(x.code == s.signal for x in r.reasons)
    assert [f.gain for f in r.fixes] == sorted((f.gain for f in r.fixes), reverse=True)
    assert "legitimate views" in r.note


def test_snapshots_alone_can_drive_the_curve_signals() -> None:
    snaps = [
        {"t_hours": t, "views": v}
        for t, v in [(0, 0), (6, 500), (12, 70_000), (18, 71_000), (24, 71_500), (30, 71_900), (36, 72_000)]
    ]
    r = score_fraud(FraudRequest(post={"views": 72_000, "likes": 100, "snapshots": snaps}))
    # six-hour snapshots smear the spike over six hours, so the shape reads organic, but the spike against baseline still shows
    assert r.curve is not None
    assert r.curve.hours == 36
    assert r.curve.spike_ratio > 100
    assert "view_spike_no_engagement" in fired(r)


def test_request_needs_some_evidence_and_rejects_nonsense() -> None:
    with pytest.raises(ValidationError, match="give post evidence"):
        FraudRequest()
    with pytest.raises(ValidationError):
        FraudRequest(precomputed_signals=[{"signal": "made_up", "severity": 0.5}])
    with pytest.raises(ValidationError):
        FraudRequest(precomputed_signals=[{"signal": "new_account", "severity": 1.5}])
    with pytest.raises(ValidationError):
        FraudRequest(post={"views": -1})
