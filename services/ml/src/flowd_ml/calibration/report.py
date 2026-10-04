"""Calibration report: does band A really outperform band E, and by how much? (BLUEPRINT: "label the score honestly ... until the
learned model beats it").

Realised results per predicted band, the contract's ``CalibrationBin`` (count, median views, trial rate) plus the median
lift against each creator's own norm, a monotonicity check, a within-app rank correlation, drift against the multipliers Pay
Math promises, and a plain-English list of findings with a recommendation.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence
from itertools import pairwise

from ..constants import BAND_ORDER, BAND_VIEW_MULTIPLIER, CHECKLIST_LABEL, LEARNED_READY_AT_POSTS
from ..numeric import median, round2
from ..schemas.calibration import (
    CalibrationBinOut,
    CalibrationPost,
    CalibrationReport,
    CalibrationRequest,
    Finding,
    Readiness,
    Recommendation,
)
from ..schemas.common import Fix, ModelInfo, Reason
from ..training.evaluate import is_monotone_non_increasing, spearman
from ..version import MODEL_VERSIONS

THIN_BAND = 30
DRIFT_WARN = 0.35  # realised multiplier more than 35% off what Pay Math promises
BAND_INDEX = {"A": 5.0, "B": 4.0, "C": 3.0, "D": 2.0, "E": 1.0}


def _baselines(posts: Sequence[CalibrationPost]) -> dict[str, float]:
    by_app: dict[str, list[float]] = defaultdict(list)
    for p in posts:
        by_app[p.app_id].append(float(p.window_views))
    return {a: max(1.0, median(v)) for a, v in by_app.items()}


def _lift(p: CalibrationPost, app_median: dict[str, float]) -> float:
    base = p.creator_median_views_28d if p.creator_median_views_28d else app_median[p.app_id]
    return (p.window_views + 1) / (base + 1)


def build_report(req: CalibrationRequest) -> CalibrationReport:
    posts = req.posts
    apps_med = _baselines(posts)
    lifts = {p.post_id: _lift(p, apps_med) for p in posts}
    groups: dict[str, list[CalibrationPost]] = defaultdict(list)
    for p in posts:
        groups[p.predicted_band].append(p)

    bins: list[CalibrationBinOut] = []
    for b in BAND_ORDER:
        rs = groups.get(b, [])
        installs = sum(r.installs for r in rs)
        trials = sum(r.trials for r in rs)
        bins.append(
            CalibrationBinOut(
                band=b,
                count=len(rs),
                median_views=round(median([float(r.window_views) for r in rs])) if rs else 0,  # type: ignore[arg-type]
                trial_rate=round(trials / installs, 4) if installs else 0.0,
                median_lift_multiple=round2(median([lifts[r.post_id] for r in rs])) if rs else 0.0,
                expected_multiplier=BAND_VIEW_MULTIPLIER[b],
                share_of_posts=round2(len(rs) / len(posts)),
            )
        )
    monotone = is_monotone_non_increasing([b.median_lift_multiple for b in bins])

    # within-app rank correlation of the score with realised lift
    by_app: dict[str, list[CalibrationPost]] = defaultdict(list)
    for p in posts:
        by_app[p.app_id].append(p)
    rhos = [
        spearman(
            [p.predicted_points if p.predicted_points is not None else BAND_INDEX[p.predicted_band] for p in rs],
            [math.log(lifts[p.post_id]) for p in rs],
        )
        for rs in by_app.values()
        if len(rs) >= req.min_posts_per_app
    ]
    rho = round2(sum(rhos) / len(rhos)) if rhos else None

    populated = [b for b in bins if b.count > 0]
    top_vs_bottom = (
        round2(populated[0].median_lift_multiple / populated[-1].median_lift_multiple)
        if len(populated) >= 2 and populated[-1].median_lift_multiple > 0
        else None
    )
    drifts = [
        abs(b.median_lift_multiple - b.expected_multiplier) / b.expected_multiplier
        for b in bins
        if b.count >= THIN_BAND
    ]
    drift = round2(sum(drifts) / len(drifts)) if drifts else None

    n = len(posts)
    readiness = Readiness(
        settled_posts=n,
        needed=LEARNED_READY_AT_POSTS,
        apps=len(by_app),
        ready=n >= LEARNED_READY_AT_POSTS,
        remaining=max(0, LEARNED_READY_AT_POSTS - n),
    )
    findings: list[Finding] = []
    if not readiness.ready:
        findings.append(
            Finding(
                severity="info",
                code="small_sample",
                message=f"{n:,} settled posts so far; the learned-vs-checklist comparison starts at {LEARNED_READY_AT_POSTS:,} ({readiness.remaining:,} to go). Read this as direction, not proof.",
            )
        )
    for b in bins:
        if b.count == 0:
            findings.append(
                Finding(severity="info", code=f"empty_{b.band}", message=f"Band {b.band} has no settled posts yet.")
            )
        elif b.count < THIN_BAND:
            findings.append(
                Finding(
                    severity="info",
                    code=f"thin_{b.band}",
                    message=f"Band {b.band} has only {b.count} posts; its numbers will move.",
                )
            )
    for hi, lo in pairwise(populated):
        if lo.median_lift_multiple > hi.median_lift_multiple:
            findings.append(
                Finding(
                    severity="warning",
                    code=f"inversion_{hi.band}_{lo.band}",
                    message=f"Band {lo.band} realised {lo.median_lift_multiple:.2f}x but band {hi.band} only {hi.median_lift_multiple:.2f}x: the checklist is not separating them.",
                )
            )
    if rho is not None:
        if rho < 0.15:
            findings.append(
                Finding(
                    severity="critical",
                    code="weak_ranking",
                    message=f"Within-app rank correlation is {rho:.2f}: the score barely orders videos by what they earned. Review the checklist weights.",
                )
            )
        elif rho < 0.30:
            findings.append(
                Finding(
                    severity="warning",
                    code="modest_ranking",
                    message=f"Within-app rank correlation is {rho:.2f}: better than chance, with room to improve.",
                )
            )
        else:
            findings.append(
                Finding(
                    severity="positive",
                    code="good_ranking",
                    message=f"Within-app rank correlation is {rho:.2f}: higher bands do earn more inside each app.",
                )
            )
    if top_vs_bottom is not None and top_vs_bottom >= 2:
        findings.append(
            Finding(
                severity="positive",
                code="spread",
                message=f"Band {populated[0].band} realised {top_vs_bottom:.1f}x the lift of band {populated[-1].band}.",
            )
        )
    for b in bins:
        if (
            b.count >= THIN_BAND
            and abs(b.median_lift_multiple - b.expected_multiplier) / b.expected_multiplier > DRIFT_WARN
        ):
            findings.append(
                Finding(
                    severity="warning",
                    code=f"drift_{b.band}",
                    message=f"Band {b.band} realised {b.median_lift_multiple:.2f}x against the {b.expected_multiplier:.2f}x Pay Math assumes: the views estimate shown to creators is off.",
                )
            )

    recommendation: Recommendation
    if not readiness.ready:
        recommendation = "collect_more_data"
    elif rho is not None and rho < 0.15:
        recommendation = "review_checklist"
    elif any(f.code.startswith("drift_") for f in findings):
        recommendation = "recalibrate_multipliers"
    else:
        recommendation = "keep"

    fixes: list[Fix] = []
    if recommendation == "recalibrate_multipliers":
        cal = {b.band: b.median_lift_multiple for b in bins if b.count >= THIN_BAND}
        fixes.append(
            Fix(
                id="recalibrate",
                target="band_view_multiplier",
                effort="moderate",
                text="Update the band view multipliers (CONSTANTS.scores.band_view_multiplier) to the realised medians: "
                + ", ".join(f"{k} {v:.2f}" for k, v in cal.items())
                + ".",
            )
        )
    if recommendation == "review_checklist":
        fixes.append(
            Fix(
                id="review_weights",
                target="checklist",
                effort="moderate",
                text="Run the trainer on this export: the learned feature importance shows which checklist items actually matter.",
            )
        )
    if recommendation == "collect_more_data":
        fixes.append(
            Fix(
                id="seed_posts",
                target="data",
                effort="moderate",
                text=f"Settle {readiness.remaining:,} more posts (fund design-partner bounties) before comparing a learned scorer.",
            )
        )
    if any(f.code.startswith("inversion_") for f in findings):
        fixes.append(
            Fix(
                id="merge_bands",
                target="bands",
                effort="quick",
                text="Show adjacent inverted bands as one band until more posts settle.",
            )
        )

    severity_of = {"critical": "critical", "warning": "warning", "positive": "positive", "info": "info"}
    reasons = [
        Reason(
            code=f.code,
            severity=severity_of[f.severity],
            title=f.code.replace("_", " ").capitalize(),
            message=f.message,
        )
        for f in findings
    ]  # type: ignore[arg-type]
    summary = (
        f"{n:,} settled posts across {len(by_app)} apps. "
        + ("Bands are monotone" if monotone else "Bands are NOT monotone")
        + (f"; rank correlation {rho:.2f}" if rho is not None else "")
        + (f"; top band {top_vs_bottom:.1f}x the bottom" if top_vs_bottom is not None else "")
        + f". Recommendation: {recommendation.replace('_', ' ')}."
    )
    return CalibrationReport(
        model=ModelInfo(
            name="calibration", kind="creative_scorer", version=MODEL_VERSIONS["calibration"], stage=req.model_stage
        ),
        model_name=req.model_name,
        n_posts=n,
        n_apps=len(by_app),
        bins=bins,
        monotone=monotone,
        spearman=rho,
        top_vs_bottom=top_vs_bottom,
        drift_score=drift,
        readiness=readiness,
        recommendation=recommendation,
        findings=findings,
        summary=summary,
        reasons=reasons,
        fixes=fixes,
        label=CHECKLIST_LABEL,
    )


def render_markdown(report: CalibrationReport) -> str:
    lines = [
        f"# Calibration report: {report.model_name} ({report.model.stage})",
        "",
        report.summary,
        "",
        f"_{report.label}_",
        "",
    ]
    lines += [
        "| Band | Posts | Median views | Lift vs creator's norm | Promised | Trial rate |",
        "|---|---|---|---|---|---|",
    ]
    for b in report.bins:
        lines.append(
            f"| {b.band} | {b.count:,} | {b.median_views:,} | {b.median_lift_multiple:.2f}x | {b.expected_multiplier:.2f}x | {b.trial_rate:.1%} |"
        )
    lines += ["", "## Findings", ""]
    lines += [f"- **{f.severity}**: {f.message}" for f in report.findings] or ["- Nothing to flag."]
    if report.fixes:
        lines += ["", "## Next steps", ""] + [f"- {f.text}" for f in report.fixes]
    lines.append("")
    return "\n".join(lines)
