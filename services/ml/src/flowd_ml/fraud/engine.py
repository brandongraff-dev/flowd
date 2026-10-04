"""View-fraud scoring: run the ten detectors, compose the score the contract's way, explain every signal."""

from __future__ import annotations

from ..constants import FRAUD_REVIEW_SLA_HOURS, FRAUD_SIGNALS
from ..phash.index import closest_match
from ..schemas.common import Fix, ModelInfo, Reason
from ..schemas.fraud import (
    CurveSummary,
    FraudDuplicate,
    FraudRequest,
    FraudResponse,
    FraudSignalHit,
    SignalOutcome,
)
from ..version import MODEL_VERSIONS
from . import signals as sig
from .compose import compose, fraud_action
from .curve import CurveStats, analyse_curve, hourly_from_snapshots

MODEL = ModelInfo(name="fraud", kind="fraud", version=MODEL_VERSIONS["fraud"], stage="heuristic")

LABELS = {
    "view_spike_no_engagement": "View spike, no engagement",
    "cap_clustering": "Cap clustering",
    "bought_views_pattern": "Bought-views pattern",
    "geo_mismatch": "Geo mismatch",
    "view_to_follower_outlier": "View-to-follower outlier",
    "new_account": "New account",
    "duplicate_hash": "Duplicate video",
    "engagement_anomaly": "Engagement anomaly",
    "traffic_source_anomaly": "Traffic-source anomaly",
    "curve_shape": "Curve shape",
}

NEXT_STEPS = {
    "view_spike_no_engagement": "Ask the creator for the platform analytics export (traffic sources and audience tabs) and compare it with the spike hour.",
    "cap_clustering": "Open the creator's last five posts side by side and check whether their view curves look alike.",
    "bought_views_pattern": "Hold the post, request the audience and traffic-source screenshots, and compare follower overlap with the viewers.",
    "geo_mismatch": "Check the audience country split with the creator; if the audience is genuinely outside the target, decline with region_mismatch and keep paying delivered views.",
    "view_to_follower_outlier": "Look at the account's other recent posts: one breakout is normal, a pattern of 40x+ posts is not.",
    "new_account": "Ask for proof the account is the creator's own and check its posting history; a new account alone is not proof of fraud.",
    "duplicate_hash": "Open the matched video next to this one and decide between duplicate_content and unoriginal_clip.",
    "engagement_anomaly": "Sample the comments and likes for bot patterns; compare with the account's 28-day norm.",
    "traffic_source_anomaly": "Ask where the external traffic came from; a link in a large group chat can look the same as a click farm.",
    "curve_shape": "Re-pull the hourly curve from the platform API at the end of the 72-hour window and check whether the plateau persists.",
}


def _curve_of(req: FraudRequest) -> CurveStats | None:
    post = req.post
    if post is None:
        return None
    hourly = post.hourly_views or (hourly_from_snapshots(post.snapshots) if post.snapshots else [])
    if len(hourly) < 3 or sum(hourly) == 0:
        return None
    return analyse_curve(hourly, post.baseline_hourly_views)


def _duplicate_of(req: FraudRequest) -> FraudDuplicate | None:
    """The supplied comparison, or one computed from this video's hash against the known hashes."""
    if req.duplicate is not None or req.phash is None or not req.known_hashes:
        return req.duplicate
    match = closest_match(req.phash, req.known_hashes)
    if match is None:
        return None
    distance, known = match
    return FraudDuplicate(phash_distance=distance, duplicate_of=known.id, kind=known.kind)


def detect(req: FraudRequest) -> tuple[list[SignalOutcome], CurveStats | None]:
    """Run all ten detectors. Returns the per-signal outcomes in contract order and the curve statistics."""
    curve = _curve_of(req)
    post, account, bounty = req.post, req.account, req.bounty
    outcomes = {
        "view_spike_no_engagement": sig.view_spike_no_engagement(post, curve),
        "cap_clustering": sig.cap_clustering(post, req.history, bounty),
        "bought_views_pattern": sig.bought_views_pattern(post, curve),
        "geo_mismatch": sig.geo_mismatch(post, bounty),
        "view_to_follower_outlier": sig.view_to_follower_outlier(post, account),
        "new_account": sig.new_account(account),
        "duplicate_hash": sig.duplicate_hash(_duplicate_of(req)),
        "engagement_anomaly": sig.engagement_anomaly(post, account),
        "traffic_source_anomaly": sig.traffic_source_anomaly(post),
        "curve_shape": sig.curve_shape_signal(curve),
    }
    out: list[SignalOutcome] = []
    for name, (max_points, _rule) in FRAUD_SIGNALS.items():
        o = outcomes[name]
        out.append(
            SignalOutcome(
                signal=name,
                label=LABELS[name],
                status=o.status,
                severity=o.severity,  # type: ignore[arg-type]
                points=0,
                max_points=max_points,
                detail=o.detail,
                evidence=o.evidence,
            )
        )
    return out, curve


def score_fraud(req: FraudRequest) -> FraudResponse:
    curve: CurveStats | None = None
    if req.precomputed_signals is not None:
        raw = [{"signal": s.signal, "severity": s.severity, "detail": s.detail} for s in req.precomputed_signals]
        checked = [
            SignalOutcome(
                signal=name,
                label=LABELS[name],
                status="clear",
                severity=0.0,
                points=0,
                max_points=mp,
                detail="Not supplied.",
            )  # type: ignore[arg-type]
            for name, (mp, _r) in FRAUD_SIGNALS.items()
        ]
    else:
        checked, curve = detect(req)
        raw = [{"signal": o.signal, "severity": o.severity, "detail": o.detail} for o in checked if o.status == "fired"]
    score, band, hits = compose(raw)
    points = {h.signal: h for h in hits}
    for o in checked:
        if o.signal in points:
            o.points = points[o.signal].points
            o.severity = points[o.signal].severity
            o.status = "fired"
            o.detail = points[o.signal].detail

    reasons: list[Reason] = []
    for h in sorted(hits, key=lambda h: -h.points):
        reasons.append(
            Reason(
                code=h.signal,
                severity="critical" if h.points >= FRAUD_SIGNALS[h.signal][0] * 0.7 else "warning",
                title=LABELS[h.signal],
                message=h.detail,
                impact=float(h.points),
            )
        )
    no_data = [o.signal for o in checked if o.status == "no_data"]
    if not hits:
        reasons.append(
            Reason(
                code="clean",
                severity="positive",
                title="No signals fired",
                message="No fraud signal fired on the evidence supplied.",
            )
        )
    if no_data:
        reasons.append(
            Reason(
                code="no_data",
                severity="info",
                title="Not enough evidence",
                message=f"{len(no_data)} signal{'s' if len(no_data) != 1 else ''} had no data: {', '.join(no_data)}.",
            )
        )
    fixes = [
        Fix(id=f"next_{h.signal}", target=h.signal, text=NEXT_STEPS[h.signal], gain=float(h.points), effort="moderate")
        for h in sorted(hits, key=lambda h: -h.points)
    ]
    action = fraud_action(score)
    if score >= 70:
        summary = f"Fraud score {score} ({band}): auto-hold and queue for Ops. {len(hits)} signal{'s' if len(hits) != 1 else ''} fired."
    elif score >= 40:
        summary = f"Fraud score {score} ({band}): hold for a human review within {FRAUD_REVIEW_SLA_HOURS} hours. {len(hits)} signal{'s' if len(hits) != 1 else ''} fired."
    elif score >= 20:
        summary = f"Fraud score {score} ({band}): auto-clears and is logged. {len(hits)} signal{'s' if len(hits) != 1 else ''} fired."
    else:
        summary = f"Fraud score {score} ({band}): auto-clears." + (f" {len(hits)} minor signal fired." if hits else "")
    return FraudResponse(
        model=MODEL,
        score=score,
        band=band,
        action=action,  # type: ignore[arg-type]
        review_sla_hours=FRAUD_REVIEW_SLA_HOURS if band == "review" else None,
        summary=summary,
        signals=[FraudSignalHit(signal=h.signal, severity=h.severity, points=h.points, detail=h.detail) for h in hits],  # type: ignore[arg-type]
        checked=checked,
        curve=None
        if curve is None
        else CurveSummary(
            hours=curve.hours,
            total_views=curve.total,
            peak_hour=curve.peak_hour,
            peak_views=curve.peak,
            baseline_hourly_views=curve.baseline,
            spike_ratio=curve.spike_ratio,
            top2_bucket_share=curve.top2_share,
            flat_run_hours=curve.flat_run_hours,
            decay_ratio=curve.decay_ratio,
            shape=curve.shape,
        ),
        reasons=reasons,
        fixes=fixes,
        note="Only proven fraud is clawed back, and delivered legitimate views are still paid. Every score shows its signals as evidence.",
    )
