"""LightGBM creative-scorer trainer (BLUEPRINT ML system 5: "LightGBM on settled posts").

    export -> drop clawed-back / fraud-held / tiny-app posts -> per-app centred target -> split by APP
           -> LightGBM with monotone constraints, early stopping on validation apps
           -> bands from quantiles of the predicted lift -> evaluate on held-out apps against the checklist
           -> promotion decision -> artifacts + model card

The learned model predicts a *lift versus the creator's own median* (not raw views), so it measures the video, not the
audience. It outputs a band, and every prediction can be explained with the booster's per-feature contributions.
numpy and lightgbm are imported lazily: the rest of the service never needs them.
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..numeric import quantile, round2
from ..schemas.common import Reason
from ..scoring.bands import band_for
from .dataset import DataSummary, centred_targets, feature_vector, split_by_app, usable_rows
from .evaluate import (
    PromotionDecision,
    ScorerReport,
    bootstrap_diff,
    evaluate_scorer,
    heuristic_scorer,
    promotion_decision,
)
from .schema import FEATURE_LABELS, FEATURE_NAMES, MONOTONE, MS_FEATURES, NEVER_MS, Outcome, SettledPostRow

ARTIFACT_VERSION = 1
BAND_QUANTILES = {
    "A": 0.85,
    "B": 0.60,
    "C": 0.30,
    "D": 0.10,
}  # share of posts above each cutoff: top 15% = A ... bottom 10% = E


class TrainingError(RuntimeError):
    """Training cannot proceed (missing optional dependency, too little data)."""


def _lgb() -> Any:
    try:
        import lightgbm
    except ImportError as exc:  # pragma: no cover
        raise TrainingError("lightgbm is not installed. pip install 'flowd-ml[train]'") from exc
    return lightgbm


def _np() -> Any:
    try:
        import numpy
    except ImportError as exc:  # pragma: no cover
        raise TrainingError("numpy is not installed. pip install 'flowd-ml[train]'") from exc
    return numpy


@dataclass(frozen=True, slots=True)
class TrainConfig:
    outcome: Outcome = "views_lift"
    num_leaves: int = 15
    min_data_in_leaf: int = 20
    learning_rate: float = 0.05
    n_estimators: int = 600
    early_stopping_rounds: int = 40
    feature_fraction: float = 0.85
    bagging_fraction: float = 0.8
    lambda_l2: float = 1.0
    seed: int = 7
    test_app_fraction: float = 0.25
    valid_app_fraction: float = 0.15

    def params(self) -> dict[str, Any]:
        return {
            "objective": "regression",
            "metric": "l2",
            "num_leaves": self.num_leaves,
            "min_data_in_leaf": self.min_data_in_leaf,
            "learning_rate": self.learning_rate,
            "feature_fraction": self.feature_fraction,
            "bagging_fraction": self.bagging_fraction,
            "bagging_freq": 1,
            "lambda_l2": self.lambda_l2,
            "seed": self.seed,
            "deterministic": True,
            "force_row_wise": True,
            "monotone_constraints": [MONOTONE[f] for f in FEATURE_NAMES],
            "monotone_constraints_method": "basic",
            "verbosity": -1,
            "num_threads": 1,
        }


@dataclass(frozen=True, slots=True)
class BandCutoffs:
    """Predicted-lift thresholds: a prediction at or above ``a`` is band A, and so on."""

    a: float
    b: float
    c: float
    d: float

    def band(self, y: float) -> str:
        return "A" if y >= self.a else "B" if y >= self.b else "C" if y >= self.c else "D" if y >= self.d else "E"

    def as_dict(self) -> dict[str, float]:
        return {"A": self.a, "B": self.b, "C": self.c, "D": self.d}


def cutoffs_from(predictions: Sequence[float]) -> BandCutoffs:
    return BandCutoffs(*(quantile(predictions, BAND_QUANTILES[b]) for b in "ABCD"))


@dataclass(slots=True)
class LearnedScorer:
    """A trained booster with its band cutoffs. ``predict`` is the predicted ln(lift) versus the creator's median."""

    booster: Any
    cutoffs: BandCutoffs
    config: TrainConfig
    feature_names: tuple[str, ...] = FEATURE_NAMES
    version: str = "learned-0"
    meta: dict[str, Any] = field(default_factory=dict)

    def predict_many(self, rows: Sequence[SettledPostRow]) -> list[float]:
        np = _np()
        x = np.array([feature_vector(r) for r in rows], dtype=float)
        return [float(v) for v in self.booster.predict(x)]

    def predict(self, row: SettledPostRow) -> float:
        return self.predict_many([row])[0]

    def band(self, row: SettledPostRow) -> str:
        return self.cutoffs.band(self.predict(row))

    def explain(self, row: SettledPostRow, top: int = 5) -> list[Reason]:
        """Per-feature contributions (TreeSHAP) as plain-English reasons, largest effect first."""
        np = _np()
        contrib = self.booster.predict(np.array([feature_vector(row)], dtype=float), pred_contrib=True)[0]
        pairs = sorted(zip(self.feature_names, contrib[:-1], strict=True), key=lambda p: -abs(p[1]))
        reasons: list[Reason] = []
        for name, c in pairs[:top]:
            if abs(c) < 0.01:
                continue
            pct = math.expm1(c) * 100
            value = feature_vector(row)[self.feature_names.index(name)]
            shown = (
                "never"
                if name in MS_FEATURES and value >= NEVER_MS
                else f"{value / 1000:.1f}s"
                if name in MS_FEATURES
                else f"{value:g}"
            )
            reasons.append(
                Reason(
                    code=name,
                    severity="positive" if c > 0 else "warning",
                    title=FEATURE_LABELS[name].capitalize(),
                    message=f"{FEATURE_LABELS[name].capitalize()} ({shown}) moves the predicted views {pct:+.0f}% against this creator's median.",
                    impact=round2(pct),
                )
            )
        return reasons

    def feature_importance(self) -> dict[str, float]:
        gains = self.booster.feature_importance(importance_type="gain")
        total = float(sum(gains)) or 1.0
        return {
            n: round2(float(g) / total)
            for n, g in sorted(zip(self.feature_names, gains, strict=True), key=lambda p: -p[1])
        }

    # persistence
    def save(self, out_dir: str | Path) -> Path:
        d = Path(out_dir)
        d.mkdir(parents=True, exist_ok=True)
        self.booster.save_model(str(d / "model.txt"))
        meta = {
            "artifact_version": ARTIFACT_VERSION,
            "version": self.version,
            "feature_names": list(self.feature_names),
            "cutoffs": self.cutoffs.as_dict(),
            "config": asdict(self.config),
            "meta": self.meta,
        }
        (d / "meta.json").write_text(json.dumps(meta, indent=2, sort_keys=True), encoding="utf-8")
        return d

    @classmethod
    def load(cls, out_dir: str | Path) -> LearnedScorer:
        d = Path(out_dir)
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        if meta.get("artifact_version") != ARTIFACT_VERSION:
            raise TrainingError(f"unsupported artifact version {meta.get('artifact_version')}")
        lgb = _lgb()
        booster = lgb.Booster(model_file=str(d / "model.txt"))
        c = meta["cutoffs"]
        return cls(
            booster=booster,
            cutoffs=BandCutoffs(c["A"], c["B"], c["C"], c["D"]),
            config=TrainConfig(**meta["config"]),
            feature_names=tuple(meta["feature_names"]),
            version=meta["version"],
            meta=meta.get("meta", {}),
        )


@dataclass(slots=True)
class TrainingResult:
    scorer: LearnedScorer
    config: TrainConfig
    summary: DataSummary
    n_train: int
    n_valid: int
    n_test: int
    test_apps: list[str]
    best_iteration: int
    learned: ScorerReport
    heuristic: ScorerReport
    decision: PromotionDecision
    importance: dict[str, float]
    synthetic: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "config": asdict(self.config),
            "data": self.summary.as_dict(),
            "n_train": self.n_train,
            "n_valid": self.n_valid,
            "n_test": self.n_test,
            "test_apps": self.test_apps,
            "best_iteration": self.best_iteration,
            "learned": self.learned.as_dict(),
            "heuristic": self.heuristic.as_dict(),
            "decision": self.decision.as_dict(),
            "feature_importance": self.importance,
            "synthetic": self.synthetic,
        }


def train_scorer(
    rows: Sequence[SettledPostRow], config: TrainConfig | None = None, *, synthetic: bool = False
) -> TrainingResult:
    """Train, validate on held-out apps, compare with the checklist, and decide. Raises ``TrainingError`` on too little data."""
    cfg = config or TrainConfig()
    lgb, np = _lgb(), _np()
    used, summary = usable_rows(rows)
    if len(used) < 100:
        raise TrainingError(
            f"only {len(used)} usable posts after filtering; need at least 100 to train anything meaningful"
        )
    train, valid, test = split_by_app(used, (cfg.test_app_fraction, cfg.valid_app_fraction), cfg.seed)

    def xy(rs: Sequence[SettledPostRow]) -> tuple[Any, Any]:
        y, _ = centred_targets(rs, cfg.outcome)
        return np.array([feature_vector(r) for r in rs], dtype=float), np.array(y, dtype=float)

    x_tr, y_tr = xy(train)
    x_va, y_va = xy(valid)
    dtrain = lgb.Dataset(x_tr, y_tr, feature_name=list(FEATURE_NAMES), free_raw_data=False)
    dvalid = lgb.Dataset(x_va, y_va, reference=dtrain, free_raw_data=False)
    booster = lgb.train(
        cfg.params(),
        dtrain,
        num_boost_round=cfg.n_estimators,
        valid_sets=[dvalid],
        callbacks=[lgb.early_stopping(cfg.early_stopping_rounds, verbose=False)],
    )
    cutoffs = cutoffs_from([float(v) for v in booster.predict(x_tr)])
    scorer = LearnedScorer(
        booster=booster,
        cutoffs=cutoffs,
        config=cfg,
        version=f"learned-{datetime.now(UTC):%Y%m%d}",
        meta={
            "trained_on": summary.as_dict(),
            "outcome": cfg.outcome,
            "synthetic": synthetic,
            "best_iteration": int(booster.best_iteration or 0),
        },
    )

    test_scores = dict(zip((r.post_id for r in test), scorer.predict_many(test), strict=True))
    by_id = lambda r: test_scores[r.post_id]  # noqa: E731
    learned = evaluate_scorer("learned (LightGBM)", test, by_id, banding=lambda r: cutoffs.band(by_id(r)))
    # the checklist's score is on a 0..100 scale, the learned one is ln-lift: Spearman is scale-free, bands use each one's own cutoffs
    heuristic = evaluate_scorer(
        "checklist (Flow Score)", test, heuristic_scorer, banding=lambda r: band_for(r.flow_points)
    )
    diff = bootstrap_diff(test, by_id, heuristic_scorer, seed=cfg.seed)
    decision = promotion_decision(learned, heuristic, diff, n_settled=summary.n_used)
    return TrainingResult(
        scorer=scorer,
        config=cfg,
        summary=summary,
        n_train=len(train),
        n_valid=len(valid),
        n_test=len(test),
        test_apps=sorted({r.app_id for r in test}),
        best_iteration=int(booster.best_iteration or 0),
        learned=learned,
        heuristic=heuristic,
        decision=decision,
        importance=scorer.feature_importance(),
        synthetic=synthetic,
    )
