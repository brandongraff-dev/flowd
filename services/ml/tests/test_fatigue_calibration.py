"""Fatigue alerts and calibration reports."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from flowd_ml.calibration.report import build_report, render_markdown
from flowd_ml.fatigue.detect import detect_fatigue
from flowd_ml.schemas.calibration import CalibrationRequest
from flowd_ml.schemas.fatigue import FatigueRequest
from helpers import assert_subset, load_vectors


def days(values: list[float], volume: int | None = 90, start: int = 1) -> list[dict]:
    return [
        {"date": f"2026-09-{start + i:02d}", "value": v, **({"volume": volume} if volume is not None else {})}
        for i, v in enumerate(values)
    ]


def run(values: list[float], **kw):
    return detect_fatigue(
        FatigueRequest(
            metric=kw.pop("metric", "trial_rate"),
            series=days(values, **{k: v for k, v in kw.items() if k in ("volume", "start")}),
            **{k: v for k, v in kw.items() if k not in ("volume", "start")},
        )
    )


@pytest.mark.parametrize("case", load_vectors("fatigue")["cases"], ids=lambda c: c["id"])
def test_fatigue_vectors(case: dict) -> None:
    r = detect_fatigue(FatigueRequest.model_validate(case["in"]))
    assert_subset(
        case["out"],
        {
            "state": r.state,
            "drop_ratio": r.drop_ratio,
            "peak_on": r.peak_on,
            "peak_value": r.peak_value,
            "current_value": r.current_value,
        },
    )


def test_alert_fires_at_exactly_thirty_percent_and_explains_itself() -> None:
    r = run([0.10, 0.10, 0.10, 0.10, 0.08, 0.07, 0.07, 0.07])
    assert r.state == "fatigued"
    assert r.drop_ratio == 0.3
    assert r.peak_on == "2026-09-03"
    assert r.days_since_peak == 5
    assert "down 30% from its peak" in r.message
    assert "refresh" in r.message
    assert r.reasons[0].severity == "critical"
    assert r.reasons[0].impact == -30
    assert {f.id for f in r.fixes} == {"refresh_hook", "rebuy", "rotate_ad"}


def test_watch_band_and_healthy_band() -> None:
    watch = run([0.10, 0.10, 0.10, 0.10, 0.085, 0.078, 0.078, 0.078])
    assert watch.state == "watch"
    assert "Not an alert yet" in watch.message
    assert watch.fixes[0].id == "line_up_refresh"
    healthy = run([0.05, 0.06, 0.07, 0.08, 0.08, 0.09, 0.09, 0.10])
    assert healthy.state == "healthy"
    assert healthy.drop_ratio == 0.0
    assert healthy.reasons[0].severity == "positive"


def test_one_bad_day_cannot_raise_an_alert() -> None:
    r = run([0.08] * 8 + [0.02])  # the 3-day smoothing absorbs a single dip
    assert r.state != "fatigued"


def test_a_lucky_first_day_cannot_set_the_peak() -> None:
    r = run([0.30, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06])
    assert r.state == "healthy"  # the peak must be a full smoothing window in


def test_insufficient_and_noisy_data() -> None:
    few = run([0.07] * 6)
    assert few.state == "insufficient_data"
    assert few.peak_value is None
    assert "6 usable days" in few.message
    noisy = run([0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.04, 0.04], volume=10)
    assert noisy.state == "insufficient_data"
    assert "ignored as noise" in noisy.reasons[0].message
    mixed = FatigueRequest(
        metric="ctr", series=[*days([0.01] * 9, volume=100), {"date": "2026-09-20", "value": 0.0, "volume": 3}]
    )
    r = detect_fatigue(mixed)
    assert r.state == "healthy"
    assert any(x.code == "noisy_days" for x in r.reasons)


def test_unordered_series_and_every_metric_label() -> None:
    series = list(reversed(days([0.10, 0.10, 0.10, 0.10, 0.08, 0.07, 0.07, 0.07])))
    assert detect_fatigue(FatigueRequest(series=series)).state == "fatigued"
    for metric, label in (
        ("trial_rate", "Trial-start rate"),
        ("ctr", "Click-through rate"),
        ("install_rate", "Installs per 1,000 views"),
    ):
        assert detect_fatigue(FatigueRequest(metric=metric, series=days([0.05] * 8))).message.startswith(label)  # type: ignore[arg-type]


def test_fatigue_request_validation() -> None:
    with pytest.raises(ValidationError):
        FatigueRequest(series=[{"date": "09/01/2026", "value": 0.1}])
    with pytest.raises(ValidationError):
        FatigueRequest(series=[])
    with pytest.raises(ValidationError):
        FatigueRequest(metric="clicks", series=days([0.1]))  # type: ignore[arg-type]


# ── calibration ─────────────────────────────────────────────────────────────────────────────────
def posts(plan: dict[str, tuple[int, float]], apps: int = 5, base: int = 10_000) -> list[dict]:
    out, n = [], 0
    for band, (count, mult) in plan.items():
        for i in range(count):
            n += 1
            views = round(base * mult * (1 + ((i * 37) % 21 - 10) / 100))
            installs = max(1, round(views / 600))
            out.append(
                {
                    "post_id": f"p{n}",
                    "app_id": f"app_{i % apps}",
                    "predicted_band": band,
                    "predicted_points": {"A": 90, "B": 77, "C": 62, "D": 47, "E": 30}[band] + i % 5,
                    "window_views": views,
                    "installs": installs,
                    "trials": round(installs * 0.06),
                    "creator_median_views_28d": base,
                }
            )
    return out


GOOD = {"A": (40, 2.0), "B": (60, 1.3), "C": (70, 0.95), "D": (45, 0.6), "E": (25, 0.4)}


@pytest.mark.parametrize("case", load_vectors("calibration")["cases"], ids=lambda c: c["id"])
def test_calibration_vector(case: dict) -> None:
    r = build_report(CalibrationRequest.model_validate(case["in"]))
    got = {
        "n_posts": r.n_posts,
        "n_apps": r.n_apps,
        "monotone": r.monotone,
        "spearman": r.spearman,
        "top_vs_bottom": r.top_vs_bottom,
        "recommendation": r.recommendation,
        "bins": [
            {
                "band": b.band,
                "count": b.count,
                "median_views": b.median_views,
                "trial_rate": b.trial_rate,
                "median_lift_multiple": b.median_lift_multiple,
            }
            for b in r.bins
        ],
    }
    assert_subset(case["out"], got)


def test_a_separating_checklist_is_monotone_and_ranked() -> None:
    r = build_report(CalibrationRequest(posts=posts(GOOD)))
    assert r.monotone
    assert r.n_posts == 240
    assert r.n_apps == 5
    assert [b.band for b in r.bins] == ["A", "B", "C", "D", "E"]
    assert [b.count for b in r.bins] == [40, 60, 70, 45, 25]
    assert r.spearman is not None
    assert r.spearman > 0.8
    assert r.top_vs_bottom is not None
    assert r.top_vs_bottom > 4
    assert r.bins[0].expected_multiplier == 1.6
    assert r.bins[-1].expected_multiplier == 0.3
    assert r.bins[0].share_of_posts == round(40 / 240, 2)
    assert any(f.code == "good_ranking" and f.severity == "positive" for f in r.findings)
    assert r.readiness.settled_posts == 240
    assert not r.readiness.ready
    assert r.readiness.remaining == 760
    assert r.recommendation == "collect_more_data"
    assert r.fixes[0].id == "seed_posts"
    assert r.label == "Checklist score. It gets smarter as bounties settle."


def test_inverted_bands_are_flagged_with_the_pair() -> None:
    inverted = {"A": (40, 1.0), "B": (60, 1.5), "C": (70, 0.95), "D": (45, 0.6), "E": (25, 0.4)}
    r = build_report(CalibrationRequest(posts=posts(inverted)))
    assert not r.monotone
    f = next(x for x in r.findings if x.code == "inversion_A_B")
    assert f.severity == "warning"
    assert "not separating them" in f.message
    assert any(fx.id == "merge_bands" for fx in r.fixes)
    assert "NOT monotone" in r.summary


def test_ready_with_drift_recommends_recalibrating_multipliers() -> None:
    big = {"A": (300, 1.0), "B": (300, 0.95), "C": (200, 0.9), "D": (100, 0.8), "E": (100, 0.7)}
    r = build_report(CalibrationRequest(posts=posts(big, apps=10)))
    assert r.readiness.ready
    assert r.recommendation in ("recalibrate_multipliers", "review_checklist")
    drift = [f for f in r.findings if f.code.startswith("drift_")]
    assert drift
    assert "Pay Math assumes" in drift[0].message
    if r.recommendation == "recalibrate_multipliers":
        assert "band_view_multiplier" in r.fixes[0].target  # type: ignore[operator]
    assert r.drift_score is not None
    assert r.drift_score > 0.35


def test_a_useless_score_is_critical() -> None:
    flat = dict.fromkeys("ABCDE", (60, 1.0))
    ps = posts(flat)
    for i, p in enumerate(ps):  # make the realised lift independent of the band
        p["window_views"] = 10_000 + (i * 7919) % 3_000
    r = build_report(CalibrationRequest(posts=ps))
    assert r.spearman is not None
    assert r.spearman < 0.15
    assert any(f.code == "weak_ranking" and f.severity == "critical" for f in r.findings)


def test_empty_and_thin_bands_are_called_out() -> None:
    r = build_report(CalibrationRequest(posts=posts({"A": (5, 2.0), "C": (40, 1.0)})))
    codes = {f.code for f in r.findings}
    assert {"empty_B", "empty_D", "empty_E", "thin_A"} <= codes
    assert next(b for b in r.bins if b.band == "B").count == 0
    assert r.top_vs_bottom is not None  # nearest populated bands


def test_small_apps_are_left_out_of_the_rank_correlation() -> None:
    r = build_report(CalibrationRequest(posts=posts({"A": (4, 2.0), "E": (4, 0.4)}, apps=4), min_posts_per_app=8))
    assert r.spearman is None


def test_markdown_report_has_the_table_and_findings() -> None:
    md = render_markdown(build_report(CalibrationRequest(posts=posts(GOOD))))
    assert md.startswith("# Calibration report: creative-scorer (heuristic)")
    assert "| A | 40 |" in md
    assert "## Findings" in md
    assert "## Next steps" in md
    assert "Checklist score" in md


def test_calibration_request_validation() -> None:
    with pytest.raises(ValidationError):
        CalibrationRequest(posts=[])
    with pytest.raises(ValidationError):
        CalibrationRequest(posts=[{"post_id": "p", "app_id": "a", "predicted_band": "Z", "window_views": 1}])
