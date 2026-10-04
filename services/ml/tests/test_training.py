"""Training stub: dataset IO, held-out-app evaluation, LightGBM scorer, model card, shadow mode."""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from flowd_ml.api.app import create_app
from flowd_ml.schemas.scores import FlowScoreRequest
from flowd_ml.settings import Settings
from flowd_ml.training import generate_settled_posts, read_rows, write_rows
from flowd_ml.training.dataset import (
    DatasetError,
    app_medians,
    centred_targets,
    feature_vector,
    raw_target,
    split_by_app,
    usable_rows,
)
from flowd_ml.training.evaluate import (
    PromotionDecision,
    ScorerReport,
    bootstrap_diff,
    evaluate_scorer,
    heuristic_scorer,
    is_monotone_non_increasing,
    pearson,
    promotion_decision,
    spearman,
    within_app_spearman,
)
from flowd_ml.training.model_card import card_data, render_markdown, write_model_card
from flowd_ml.training.schema import FEATURE_NAMES, MONOTONE, NEVER_MS, SettledPostRow
from flowd_ml.training.shadow import shadow_prediction, shadow_row
from flowd_ml.training.trainer import BandCutoffs, LearnedScorer, TrainConfig, TrainingError, cutoffs_from, train_scorer

lgb = pytest.importorskip("lightgbm")


@pytest.fixture(scope="module")
def rows() -> list[SettledPostRow]:
    return generate_settled_posts(1500, 14, 7)


@pytest.fixture(scope="module")
def trained(rows):
    return train_scorer(rows, synthetic=True)


# ── synthetic data and IO ───────────────────────────────────────────────────────────────────────
def test_synthetic_posts_are_deterministic_and_internally_consistent(rows) -> None:
    again = generate_settled_posts(1500, 14, 7)
    assert [r.model_dump() for r in rows[:50]] == [r.model_dump() for r in again[:50]]
    assert generate_settled_posts(10, 3, 8)[0].post_id == "post_synth_00000"
    assert len({r.app_id for r in rows}) == 14
    assert len({r.post_id for r in rows}) == 1500
    r0 = rows[0]
    from flowd_ml.scoring.bands import band_for

    assert r0.flow_band == band_for(r0.flow_points)
    assert 0 <= r0.hook_points <= 100
    assert all(r.installs <= r.window_views or r.window_views == 0 for r in rows)
    assert all(r.trials <= r.installs and r.paid <= r.trials for r in rows)


def test_jsonl_and_csv_round_trip(tmp_path: Path, rows) -> None:
    sample = rows[:40]
    p = tmp_path / "posts.jsonl"
    assert write_rows(sample, p) == 40
    assert [r.model_dump() for r in read_rows(p)] == [r.model_dump() for r in sample]
    c = tmp_path / "posts.csv"
    with c.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(sample[0].model_dump()))
        w.writeheader()
        for r in sample:
            w.writerow({k: ("" if v is None else v) for k, v in r.model_dump().items()})
    back = read_rows(c)
    assert len(back) == 40
    assert back[0].lands_ms == sample[0].lands_ms
    assert back[0].spoken_matches_onscreen == sample[0].spoken_matches_onscreen
    assert [r.face_ms for r in back] == [r.face_ms for r in sample]  # empty cells are null


def test_bad_exports_fail_with_the_row_and_field(tmp_path: Path) -> None:
    with pytest.raises(DatasetError, match="does not exist"):
        read_rows(tmp_path / "nope.jsonl")
    bad = tmp_path / "bad.jsonl"
    good = generate_settled_posts(10, 3, 1)[0].model_dump_json()
    bad.write_text(good + "\n" + json.dumps({"post_id": "x"}) + "\n", encoding="utf-8")
    with pytest.raises(DatasetError, match=r"row 2: app_id"):
        read_rows(bad)
    assert len(read_rows(bad, strict=False)) == 1
    broken = tmp_path / "broken.jsonl"
    broken.write_text("{not json\n", encoding="utf-8")
    with pytest.raises(DatasetError, match="invalid JSON"):
        read_rows(broken)
    empty = tmp_path / "empty.jsonl"
    empty.write_text("\n", encoding="utf-8")
    with pytest.raises(DatasetError, match="no usable rows"):
        read_rows(empty)


def test_unusable_posts_are_dropped_and_counted(rows) -> None:
    mutated = [
        r.model_copy(update={"clawed_back": True})
        if i % 10 == 0
        else r.model_copy(update={"fraud_score": 55})
        if i % 10 == 1
        else r
        for i, r in enumerate(rows)
    ]
    tiny = [r.model_copy(update={"app_id": "app_tiny"}) for r in rows[:5]]
    used, summary = usable_rows([*mutated[5:], *tiny])
    assert summary.dropped["clawed_back"] > 0
    assert summary.dropped["fraud_held"] > 0
    assert summary.dropped["small_app"] == 5
    assert summary.n_used == len(used)
    assert "app_tiny" not in {r.app_id for r in used}
    assert summary.first_posted_at is not None
    assert summary.n_apps == 14


def test_features_use_a_sentinel_for_never_and_keep_names_aligned(rows) -> None:
    r = rows[0].model_copy(
        update={"face_ms": None, "lands_ms": 99_999, "beats_required": 0, "creator_median_views_28d": None}
    )
    v = dict(zip(FEATURE_NAMES, feature_vector(r), strict=True))
    assert v["face_ms"] == NEVER_MS
    assert v["lands_ms"] == NEVER_MS
    assert v["beat_coverage"] == 1.0
    assert math.isnan(v["log_creator_median_views"])
    assert len(feature_vector(rows[1])) == len(FEATURE_NAMES) == len(MONOTONE)


def test_targets_are_centred_per_app_and_use_the_creators_own_median(rows) -> None:
    med = app_medians(rows)
    r = rows[0].model_copy(update={"window_views": 20_000, "creator_median_views_28d": 10_000})
    assert raw_target(r, "views_lift", med) == pytest.approx(math.log(20_001 / 10_001))
    assert raw_target(
        r.model_copy(update={"creator_median_views_28d": None}), "views_lift", {r.app_id: 4_000.0}
    ) == pytest.approx(math.log(20_001 / 4_001))
    assert raw_target(r.model_copy(update={"installs": 40}), "installs_per_1k", med) == pytest.approx(math.log1p(2.0))
    assert raw_target(r.model_copy(update={"window_views": 0}), "installs_per_1k", med) == 0.0
    y, means = centred_targets(rows, "views_lift")
    for app in list(means)[:3]:
        assert sum(t for t, r_ in zip(y, rows, strict=True) if r_.app_id == app) == pytest.approx(0, abs=1e-6)


def test_split_by_app_never_leaks_an_app_across_sets(rows) -> None:
    train, valid, test = split_by_app(rows)
    a, b, c = ({r.app_id for r in s} for s in (train, valid, test))
    assert not (a & b)
    assert not (a & c)
    assert not (b & c)
    assert len(train) + len(valid) + len(test) == len(rows)
    assert len(c) >= 3
    assert len(b) >= 1
    assert split_by_app(rows, seed=1) != split_by_app(rows, seed=2)
    with pytest.raises(DatasetError, match="at least 5 apps"):
        split_by_app([r for r in rows if r.app_id in {"app_synth_00", "app_synth_01", "app_synth_02"}])


# ── metrics ─────────────────────────────────────────────────────────────────────────────────────
def test_rank_correlations() -> None:
    assert spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert spearman([1, 2, 3, 4], [40, 30, 20, 10]) == -1.0
    assert spearman([1, 1, 1], [1, 2, 3]) == 0.0  # a constant score ranks nothing
    assert spearman([1, 2, 2, 3], [1, 2, 3, 4]) == pytest.approx(0.9487, abs=1e-3)  # ties share the mean rank
    assert pearson([1], [1]) == 0.0
    assert is_monotone_non_increasing([2.0, 1.4, 0.0, 0.9, 0.5]) is True  # empty bands ignored
    assert is_monotone_non_increasing([1.0, 1.2]) is False


def test_the_checklist_ranks_better_than_chance_on_the_synthetic_market(rows) -> None:
    per_app = within_app_spearman(rows, heuristic_scorer)
    assert len(per_app) == 14
    assert 0.3 < sum(per_app.values()) / 14 < 0.8
    rep = evaluate_scorer("checklist", rows, heuristic_scorer)
    assert rep.n_apps == 14
    assert len(rep.bins) == 5
    assert rep.top_band_lift > 0


def test_bootstrap_interval_is_deterministic_and_brackets_the_point(rows) -> None:
    oracle = lambda r: math.log((r.window_views + 1) / (r.creator_median_views_28d + 1))  # noqa: E731
    d1 = bootstrap_diff(rows, oracle, heuristic_scorer, n_boot=200, seed=3)
    assert d1 == bootstrap_diff(rows, oracle, heuristic_scorer, n_boot=200, seed=3)
    diff, lo, hi = d1
    assert lo <= diff <= hi
    assert diff > 0.2
    assert bootstrap_diff([], oracle, heuristic_scorer) == (0.0, 0.0, 0.0)


def report(name: str, rho: float, apps: int = 6, monotone: bool = True) -> ScorerReport:
    return ScorerReport(
        name=name,
        mean_spearman=rho,
        per_app_spearman={},
        top_band_lift=0.5,
        bins=[],
        monotone=monotone,
        n_posts=900,
        n_apps=apps,
    )


def test_promotion_decision_rules() -> None:
    learned, check = report("l", 0.6), report("c", 0.5)
    early = promotion_decision(learned, check, (0.1, 0.05, 0.15), n_settled=640)
    assert early.decision == "keep_heuristic"
    assert "640" in early.reasons[0]
    assert "1,000" in early.reasons[0]
    few_apps = promotion_decision(report("l", 0.6, apps=2), check, (0.1, 0.05, 0.15), n_settled=2_000)
    assert few_apps.decision == "keep_heuristic"
    assert "held-out apps" in few_apps.reasons[0]
    promote = promotion_decision(learned, check, (0.1, 0.05, 0.15), n_settled=2_000)
    assert promote.decision == "promote"
    assert "monotone" in promote.reasons[-1]
    shadow = promotion_decision(learned, check, (0.04, -0.01, 0.09), n_settled=2_000)
    assert shadow.decision == "shadow"
    assert "interval includes zero" in shadow.reasons[-1]
    small_gain = promotion_decision(learned, check, (0.02, 0.01, 0.03), n_settled=2_000)
    assert small_gain.decision == "shadow"  # clear of zero but under the 0.03 minimum gain
    keep = promotion_decision(report("l", 0.4), check, (-0.1, -0.15, -0.05), n_settled=2_000)
    assert keep.decision == "keep_heuristic"
    assert "does not beat" in keep.reasons[-1]
    non_mono = promotion_decision(report("l", 0.6, monotone=False), check, (0.1, 0.05, 0.15), n_settled=2_000)
    assert non_mono.decision == "shadow"
    assert "not monotone" in non_mono.reasons[-1]
    assert isinstance(promote, PromotionDecision)
    assert promote.as_dict()["ci95"] == [0.05, 0.15]


# ── the trainer ─────────────────────────────────────────────────────────────────────────────────
def test_learned_scorer_beats_the_checklist_on_held_out_apps(trained) -> None:
    assert trained.learned.mean_spearman > trained.heuristic.mean_spearman + 0.03
    assert trained.learned.monotone
    assert trained.learned.n_apps >= 3
    assert trained.decision.decision == "promote"
    assert trained.decision.ci_lo > 0
    assert trained.n_train + trained.n_valid + trained.n_test == trained.summary.n_used == 1500
    assert trained.config.outcome == "views_lift"
    assert trained.synthetic
    assert set(trained.test_apps).isdisjoint(
        {r.app_id for r in generate_settled_posts(1500, 14, 7) if False}
    )  # test apps are an explicit list
    assert len(trained.test_apps) >= 3
    assert trained.best_iteration > 10


def test_feature_importance_finds_the_planted_drivers(trained) -> None:
    imp = trained.importance
    top = list(imp)[:5]
    assert "lands_ms" in top
    assert "app_ms" in top  # the synthetic market pays for an early hook and an early app
    assert imp["lands_ms"] > imp["disclosure_audio"]
    assert imp["lands_ms"] > imp["faceless"]
    assert sum(imp.values()) == pytest.approx(1.0, abs=0.05)


def test_monotone_constraints_are_respected(trained, rows) -> None:
    scorer = trained.scorer
    base = rows[3]
    prev = None
    for lands in (500, 1500, 2500, 4000, 7000):  # later hook can only lower the prediction
        p = scorer.predict(base.model_copy(update={"lands_ms": lands}))
        assert prev is None or p <= prev + 1e-9
        prev = p
    prev = None
    for cov in (0, 1, 2, 3, 4):  # more of the brief covered can only help (beat_coverage is constrained +1)
        p = scorer.predict(base.model_copy(update={"beats_required": 4, "beats_found": cov}))
        assert prev is None or p >= prev - 1e-9
        prev = p


def test_bands_come_from_prediction_quantiles(trained, rows) -> None:
    c = trained.scorer.cutoffs
    assert c.a > c.b > c.c > c.d
    cuts = cutoffs_from([float(i) for i in range(100)])
    assert cuts.band(99) == "A"
    assert cuts.band(85) == "A"
    assert cuts.band(60) == "B"
    assert cuts.band(30) == "C"
    assert cuts.band(10) == "D"
    assert cuts.band(0) == "E"
    assert BandCutoffs(3, 2, 1, 0).band(2.5) == "B"
    shares = dict.fromkeys("ABCDE", 0)
    for p in trained.scorer.predict_many(rows[:600]):
        shares[c.band(p)] += 1
    assert shares["A"] > 0
    assert shares["E"] > 0


def test_explanations_name_features_with_signed_effects(trained, rows) -> None:
    slow = rows[5].model_copy(update={"lands_ms": 6000, "app_ms": 11_000, "face_ms": None})
    reasons = trained.scorer.explain(slow)
    assert 1 <= len(reasons) <= 5
    codes = {r.code: r for r in reasons}
    assert "lands_ms" in codes
    assert codes["lands_ms"].severity == "warning"
    assert (codes["lands_ms"].impact or 0) < 0
    assert "6.0s" in codes["lands_ms"].message
    assert "against this creator's median" in codes["lands_ms"].message
    assert [abs(r.impact or 0) for r in reasons] == sorted((abs(r.impact or 0) for r in reasons), reverse=True)
    quick = rows[5].model_copy(update={"lands_ms": 500, "app_ms": 900})
    assert next(r for r in trained.scorer.explain(quick, top=12) if r.code == "lands_ms").severity == "positive"


def test_model_round_trips_through_disk(trained, rows, tmp_path: Path) -> None:
    trained.scorer.save(tmp_path / "creative_scorer")
    loaded = LearnedScorer.load(tmp_path / "creative_scorer")
    assert loaded.version == trained.scorer.version
    assert loaded.cutoffs == trained.scorer.cutoffs
    assert loaded.feature_names == FEATURE_NAMES
    sample = rows[:25]
    assert loaded.predict_many(sample) == pytest.approx(trained.scorer.predict_many(sample))
    meta = json.loads((tmp_path / "creative_scorer" / "meta.json").read_text(encoding="utf-8"))
    assert meta["artifact_version"] == 1
    assert meta["meta"]["synthetic"] is True
    meta["artifact_version"] = 99
    (tmp_path / "creative_scorer" / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    with pytest.raises(TrainingError, match="unsupported artifact version"):
        LearnedScorer.load(tmp_path / "creative_scorer")


def test_training_is_reproducible(rows) -> None:
    cfg = TrainConfig(n_estimators=60)
    a, b = train_scorer(rows[:900], cfg), train_scorer(rows[:900], cfg)
    assert a.scorer.predict_many(rows[:20]) == b.scorer.predict_many(rows[:20])
    assert a.learned.mean_spearman == b.learned.mean_spearman


def test_too_little_data_is_refused_with_a_reason(rows) -> None:
    one_app = [r for r in rows if r.app_id == "app_synth_00"][:40]
    with pytest.raises(TrainingError, match="only 40 usable posts"):
        train_scorer(one_app)
    with pytest.raises(TrainingError, match="only 0 usable posts"):
        train_scorer(rows[:40])  # 14 apps with ~3 posts each: every app is too small to normalise
    few_apps = [r for r in rows if r.app_id in {"app_synth_00", "app_synth_01", "app_synth_02", "app_synth_03"}]
    with pytest.raises(DatasetError, match="at least 5 apps"):
        train_scorer(few_apps)


def test_an_installs_outcome_can_be_trained_too(rows) -> None:
    r = train_scorer(rows, TrainConfig(outcome="installs_per_1k", n_estimators=120))
    assert r.config.outcome == "installs_per_1k"
    assert r.n_test > 0


# ── model card ──────────────────────────────────────────────────────────────────────────────────
def test_model_card_is_honest_and_complete(trained, tmp_path: Path) -> None:
    md_path, js_path = write_model_card(trained, tmp_path / "card")
    md = md_path.read_text(encoding="utf-8")
    data = json.loads(js_path.read_text(encoding="utf-8"))
    assert md.startswith("# Model card: creative-scorer learned-")
    assert "Synthetic data" in md
    assert "Do not use or cite" in md  # synthetic artifacts say so at the top
    for heading in (
        "## Decision",
        "## Intended use",
        "## Training data",
        "## Held-out evaluation",
        "### Calibration of the learned bands",
        "## Features",
        "## Limitations",
        "## Fairness and responsible use",
    ):
        assert heading in md
    assert "Checklist score. It gets smarter as bounties settle." in md
    assert "| A |" in md
    assert "`lands_ms`" in md
    assert data["synthetic_data"] is True
    assert data["stage_after_decision"] == "learned"
    assert data["split"]["method"].startswith("group split by app")
    assert any("No creator attributes" in x for x in data["fairness"])
    assert any("never penalised" in x for x in data["fairness"])
    assert len(data["features"]) == len(FEATURE_NAMES)
    assert data["evaluation"]["decision"]["decision"] == "promote"
    assert render_markdown(card_data(trained)).count("##") >= 8


def test_model_card_for_a_kept_heuristic_says_so(trained) -> None:
    kept = trained
    original = kept.decision
    try:
        kept.decision = PromotionDecision("keep_heuristic", ["Only 640 settled posts; the comparison starts at 1,000."])
        md = render_markdown(card_data(kept))
        assert "**keep heuristic.** Keep the checklist score live." in md
        assert card_data(kept)["stage_after_decision"] == "heuristic"
    finally:
        kept.decision = original


# ── shadow mode ─────────────────────────────────────────────────────────────────────────────────
FLOW_WITH_HOOK = {
    "hook": {
        "lands_ms": 1200,
        "onscreen_ms": 600,
        "spoken_matches_onscreen": True,
        "face_ms": 300,
        "app_ms": 1800,
        "interrupt_ms": 900,
        "hook_type": "confession",
        "speech_ms": 300,
        "captions_in_safe_zone": True,
    },
    "beats_found": 4,
    "beats_required": 5,
    "app_ms": 1800,
    "disclosure_audio": True,
    "disclosure_onscreen": True,
    "duration_s": 24,
    "captions_in_safe_zone": True,
    "single_cta": True,
    "ends_on_win_state": True,
    "audio_gaps": 0,
    "format_order": "in_order",
    "creator_median_views": 14_200,
    "format_id": "tmpl_screen_reaction",
}


def test_shadow_prediction_needs_hook_features_and_never_replaces_the_checklist(trained) -> None:
    req = FlowScoreRequest(**FLOW_WITH_HOOK)
    row = shadow_row(req)
    assert row is not None
    assert row.lands_ms == 1200
    assert row.hook_type == "confession"
    assert row.hook_type_above_median
    assert row.creator_median_views_28d == 14_200
    p = shadow_prediction(trained.scorer, req)
    assert p is not None
    assert p.stage == "shadow"
    assert p.band in "ABCDE"
    assert p.predicted_lift_multiple > 0
    assert p.reasons
    assert "Not shown to users" in p.note
    no_hook = FlowScoreRequest(**{k: v for k, v in FLOW_WITH_HOOK.items() if k != "hook"}, hook_points=88)
    assert shadow_row(no_hook) is None
    assert shadow_prediction(trained.scorer, no_hook) is None


def test_api_serves_the_shadow_scorer_beside_the_checklist(trained, tmp_path: Path) -> None:
    trained.scorer.save(tmp_path / "creative_scorer")
    client = TestClient(create_app(Settings(env="test", model_dir=tmp_path)))
    r = client.post("/v1/flow-score", json=FLOW_WITH_HOOK).json()
    assert r["shadow"]["stage"] == "shadow"
    assert r["band"] in "ABCDE"
    assert r["label"].startswith("Checklist score")
    plain = client.post(
        "/v1/flow-score", json={k: v for k, v in FLOW_WITH_HOOK.items() if k != "hook"} | {"hook_points": 90}
    ).json()
    assert plain["shadow"] is None
    models = {m["kind"]: m for m in client.get("/v1/models").json()}
    assert models["creative_scorer"]["stage"] == "shadow"
    assert models["creative_scorer"]["trained_on_n"] == 1500
    assert "shadow" in models["creative_scorer"]["approach"]


def test_a_broken_artifact_is_ignored_not_fatal(tmp_path: Path) -> None:
    d = tmp_path / "creative_scorer"
    d.mkdir()
    (d / "meta.json").write_text("{broken", encoding="utf-8")
    client = TestClient(create_app(Settings(env="test", model_dir=tmp_path)))
    assert client.get("/healthz").status_code == 200
    assert {m["kind"]: m for m in client.get("/v1/models").json()}["creative_scorer"]["stage"] == "heuristic"
