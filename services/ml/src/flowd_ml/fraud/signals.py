"""The ten fraud signal detectors (DOMAIN.md 12.4). Each looks at the evidence it was given and returns an ``Outcome``.

The contract fixes the signals and their maximum points; the detectors below fix how a severity 0..1 is derived from raw
evidence. Severities are rounded to two decimals and the numbers that drove them are returned as ``evidence`` so a
reviewer sees exactly what the model saw. When the evidence for a signal is missing the outcome is ``no_data``, never a
silent pass.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..constants import (
    DUPLICATE_PHASH_MAX_DISTANCE,
    FRAUD_BOUGHT_OTHER_SHARE,
    FRAUD_BOUGHT_TOP2_SHARE,
    FRAUD_CAP_MIN_HITS,
    FRAUD_CAP_NEAR_RATIO,
    FRAUD_FLAT_RUN_HOURS,
    FRAUD_FOLLOWER_MAX,
    FRAUD_FOLLOWER_RATIO,
    FRAUD_GEO_SHORTFALL,
    FRAUD_LIKE_RATIO_MIN,
    FRAUD_LIKE_RATIO_MIN_VIEWS,
    FRAUD_NEW_ACCOUNT_DAYS,
    FRAUD_OTHER_SOURCE_MAX,
    FRAUD_SPIKE_ENGAGEMENT_MAX,
    FRAUD_SPIKE_RATIO,
)
from ..numeric import clamp, pct, round2
from ..schemas.fraud import FraudAccount, FraudBounty, FraudDuplicate, FraudHistoryPost, FraudPost
from .curve import CurveStats


@dataclass(slots=True)
class Outcome:
    status: str  # fired | clear | no_data
    severity: float = 0.0
    detail: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)


def _fired(severity: float, detail: str, **evidence: Any) -> Outcome:
    return Outcome("fired", round2(clamp(severity, 0.0, 1.0)), detail, evidence)


def _clear(detail: str, **evidence: Any) -> Outcome:
    return Outcome("clear", 0.0, detail, evidence)


def _no_data(detail: str) -> Outcome:
    return Outcome("no_data", 0.0, detail, {})


def engagement_rate(post: FraudPost) -> float:
    """(likes + comments + shares) / views, as the contract defines engagement."""
    return (post.likes + post.comments + post.shares) / post.views if post.views > 0 else 0.0


def other_share(post: FraudPost) -> float | None:
    return post.traffic_sources.get("other", 0.0) if post.traffic_sources else None


# 1 ────────────────────────────────────────────────────────────────────────────────────────────────
def view_spike_no_engagement(post: FraudPost | None, curve: CurveStats | None) -> Outcome:
    if post is None or curve is None:
        return _no_data("No hourly view curve supplied.")
    eng = engagement_rate(post)
    ev = {
        "peak_hour": curve.peak_hour,
        "peak_views": curve.peak,
        "baseline_hourly_views": curve.baseline,
        "spike_ratio": curve.spike_ratio,
        "engagement_rate": round(eng, 4),
    }
    if post.views < 200:
        return _clear(f"Only {post.views} views, too few to judge a spike.", **ev)
    if curve.spike_ratio >= FRAUD_SPIKE_RATIO and eng < FRAUD_SPIKE_ENGAGEMENT_MAX:
        spike_sev = 0.5 + 0.5 * clamp((curve.spike_ratio - FRAUD_SPIKE_RATIO) / 30, 0, 1)
        eng_factor = 1.0 if eng < 0.002 else 1 - 0.3 * (eng - 0.002) / (FRAUD_SPIKE_ENGAGEMENT_MAX - 0.002)
        return _fired(
            spike_sev * eng_factor,
            f"Hour {curve.peak_hour} had {curve.peak:,} views, {curve.spike_ratio:.1f}x the baseline of {curve.baseline:,.0f} per hour, while engagement is only {pct(eng, 2)} of views.",
            **ev,
        )
    return _clear(f"Peak hour was {curve.spike_ratio:.1f}x baseline and engagement is {pct(eng, 1)}.", **ev)


# 2 ────────────────────────────────────────────────────────────────────────────────────────────────
def cap_clustering(post: FraudPost | None, history: list[FraudHistoryPost], bounty: FraudBounty | None) -> Outcome:
    recent = history[:5]
    near = 0
    for h in recent:
        cap = h.cap_cents or (bounty.per_video_cap_cents if bounty else None)
        if cap and cap * (1 - FRAUD_CAP_NEAR_RATIO) <= h.earnings_cents <= cap:
            near += 1
    snap = False
    projected = None
    if post is not None and bounty and bounty.per_video_cap_cents and bounty.cpm_cents:
        projected = post.views * bounty.cpm_cents / 1000
        cap = bounty.per_video_cap_cents
        snap = cap * (1 - FRAUD_CAP_NEAR_RATIO) <= projected <= cap * (1 + FRAUD_CAP_NEAR_RATIO)
    if not recent and projected is None:
        return _no_data("No earnings history or bounty cap supplied.")
    ev: dict[str, Any] = {"posts_near_cap": near, "posts_checked": len(recent), "views_snap_to_cap": snap}
    if projected is not None:
        ev["projected_cpm_earnings_cents"] = round(projected)
    sev = 0.0
    parts: list[str] = []
    if near >= FRAUD_CAP_MIN_HITS:
        sev = near / 5
        parts.append(f"{near} of the last {len(recent)} posts earned within 2% of the per-video cap")
    if snap:
        sev = max(sev, 0.5)
        parts.append("this post's views land almost exactly on the cap")
    if parts:
        return _fired(sev, "; ".join(parts).capitalize() + ".", **ev)
    return _clear(f"{near} of the last {len(recent)} posts earned within 2% of the cap.", **ev)


# 3 ────────────────────────────────────────────────────────────────────────────────────────────────
def bought_views_pattern(post: FraudPost | None, curve: CurveStats | None) -> Outcome:
    if post is None or curve is None:
        return _no_data("No hourly view curve supplied.")
    other = other_share(post)
    ev: dict[str, Any] = {
        "top2_bucket_share": curve.top2_share,
        "rest_flat": curve.rest_flat,
        "other_source_share": other,
    }
    stepped = curve.hours >= 12 and curve.top2_share >= FRAUD_BOUGHT_TOP2_SHARE and curve.rest_flat
    if not stepped:
        return _clear(f"Views are spread across the window (the top two hours hold {pct(curve.top2_share)}).", **ev)
    if other is None:
        return _fired(
            0.4,
            f"Step-function curve: {pct(curve.top2_share)} of views arrive in two hours and the rest is flat. The traffic-source mix was not supplied, so the 'other' test is unconfirmed.",
            **ev,
        )
    if other > FRAUD_BOUGHT_OTHER_SHARE:
        sev = (
            0.6
            + 0.2 * clamp((curve.top2_share - FRAUD_BOUGHT_TOP2_SHARE) / 0.2, 0, 1)
            + 0.2 * clamp((other - FRAUD_BOUGHT_OTHER_SHARE) / 0.3, 0, 1)
        )
        return _fired(
            sev,
            f"Step-function curve: {pct(curve.top2_share)} of views arrive in two hours, flat otherwise, and {pct(other)} come from 'other' sources.",
            **ev,
        )
    return _clear(
        f"The curve is stepped ({pct(curve.top2_share)} in two hours) but only {pct(other)} of views are 'other', so it may be one genuine share spike.",
        **ev,
    )


# 4 ────────────────────────────────────────────────────────────────────────────────────────────────
def geo_mismatch(post: FraudPost | None, bounty: FraudBounty | None) -> Outcome:
    if post is None or not post.geo or bounty is None or not bounty.target_countries:
        return _no_data("No audience geography or target region supplied.")
    want = bounty.min_target_audience_ratio if bounty.min_target_audience_ratio is not None else 0.5
    share = sum(post.geo.get(c, 0.0) for c in bounty.target_countries)
    shortfall = want - share
    ev = {
        "target_countries": bounty.target_countries,
        "audience_in_target": round(share, 3),
        "minimum": want,
        "shortfall_points": round(shortfall * 100, 1),
    }
    if shortfall > FRAUD_GEO_SHORTFALL:
        return _fired(
            0.4 + 0.6 * clamp((shortfall - FRAUD_GEO_SHORTFALL) / 0.25, 0, 1),
            f"Only {pct(share)} of the audience is in {', '.join(bounty.target_countries)}; the bounty needs {pct(want)} ({shortfall * 100:.0f} points short).",
            **ev,
        )
    return _clear(f"{pct(share)} of the audience is in {', '.join(bounty.target_countries)} (needs {pct(want)}).", **ev)


# 5 ────────────────────────────────────────────────────────────────────────────────────────────────
def view_to_follower_outlier(post: FraudPost | None, account: FraudAccount | None) -> Outcome:
    if post is None or account is None or account.followers is None:
        return _no_data("No follower count supplied.")
    ratio = post.views / max(account.followers, 1)
    ev = {"followers": account.followers, "views": post.views, "views_per_follower": round(ratio, 1)}
    if account.followers < FRAUD_FOLLOWER_MAX and ratio > FRAUD_FOLLOWER_RATIO:
        return _fired(
            0.5 + 0.5 * clamp((ratio - FRAUD_FOLLOWER_RATIO) / 160, 0, 1),
            f"{post.views:,} views on an account with {account.followers:,} followers is {ratio:.0f}x its audience.",
            **ev,
        )
    return _clear(f"{ratio:.1f} views per follower on {account.followers:,} followers.", **ev)


# 6 ────────────────────────────────────────────────────────────────────────────────────────────────
def new_account(account: FraudAccount | None) -> Outcome:
    if account is None or account.account_age_days is None:
        return _no_data("No account age supplied.")
    age = account.account_age_days
    if age < FRAUD_NEW_ACCOUNT_DAYS:
        return _fired(
            0.4 + 0.6 * (1 - age / FRAUD_NEW_ACCOUNT_DAYS),
            f"The social account is {age:.0f} days old (under {FRAUD_NEW_ACCOUNT_DAYS}).",
            account_age_days=age,
        )
    return _clear(f"The social account is {age:.0f} days old.", account_age_days=age)


# 7 ────────────────────────────────────────────────────────────────────────────────────────────────
def duplicate_hash(dup: FraudDuplicate | None) -> Outcome:
    if dup is None or dup.phash_distance is None:
        return _no_data("No perceptual-hash comparison supplied.")
    d = dup.phash_distance
    ev = {"phash_distance": d, "duplicate_of": dup.duplicate_of, "kind": dup.kind}
    if d <= DUPLICATE_PHASH_MAX_DISTANCE:
        who = "the creator's own earlier post" if dup.kind == "own_earlier" else "another creator's video"
        return _fired(
            1 - 0.4 * d / DUPLICATE_PHASH_MAX_DISTANCE,
            f"Perceptual hash is {d} bits from {who}{f' ({dup.duplicate_of})' if dup.duplicate_of else ''}.",
            **ev,
        )
    return _clear(f"Closest known video is {d} bits away (limit {DUPLICATE_PHASH_MAX_DISTANCE}).", **ev)


# 8 ────────────────────────────────────────────────────────────────────────────────────────────────
def engagement_anomaly(post: FraudPost | None, account: FraudAccount | None) -> Outcome:
    if post is None:
        return _no_data("No engagement numbers supplied.")
    like_ratio = post.likes / post.views if post.views else 0.0
    comment_ratio = post.comments / post.views if post.views else 0.0
    ev: dict[str, Any] = {"like_ratio": round(like_ratio, 4), "comment_ratio": round(comment_ratio, 5)}
    sev = 0.0
    parts: list[str] = []
    if post.views >= FRAUD_LIKE_RATIO_MIN_VIEWS and like_ratio < FRAUD_LIKE_RATIO_MIN:
        sev = 0.5 + 0.5 * clamp((FRAUD_LIKE_RATIO_MIN - like_ratio) / FRAUD_LIKE_RATIO_MIN, 0, 1)
        parts.append(f"likes are {pct(like_ratio, 2)} of views (under 0.4%)")
    if (
        account
        and account.comment_ratio_mean_28d is not None
        and account.comment_ratio_sd_28d
        and post.views >= FRAUD_LIKE_RATIO_MIN_VIEWS
    ):
        z = (comment_ratio - account.comment_ratio_mean_28d) / account.comment_ratio_sd_28d
        ev["comment_ratio_z"] = round(z, 2)
        if abs(z) >= 3:
            sev = max(sev, 0.5 + 0.5 * clamp((abs(z) - 3) / 3, 0, 1))
            parts.append(
                f"the comment ratio is {abs(z):.1f} standard deviations {'above' if z > 0 else 'below'} the account's 28-day norm"
            )
    if parts:
        return _fired(sev, "; ".join(parts).capitalize() + ".", **ev)
    if post.views < FRAUD_LIKE_RATIO_MIN_VIEWS:
        return _clear(f"Only {post.views:,} views, too few to judge engagement.", **ev)
    return _clear(f"Likes are {pct(like_ratio, 1)} of views.", **ev)


# 9 ────────────────────────────────────────────────────────────────────────────────────────────────
def traffic_source_anomaly(post: FraudPost | None) -> Outcome:
    other = other_share(post) if post else None
    if other is None:
        return _no_data("No traffic-source mix supplied.")
    ev = {"other_source_share": round(other, 3)}
    if other > FRAUD_OTHER_SOURCE_MAX:
        return _fired(
            0.4 + 0.6 * clamp((other - FRAUD_OTHER_SOURCE_MAX) / 0.4, 0, 1),
            f"{pct(other)} of views come from external or 'other' sources (limit 50%).",
            **ev,
        )
    return _clear(f"{pct(other)} of views come from 'other' sources.", **ev)


# 10 ───────────────────────────────────────────────────────────────────────────────────────────────
def curve_shape_signal(curve: CurveStats | None) -> Outcome:
    if curve is None:
        return _no_data("No hourly view curve supplied.")
    ev = {"flat_run_hours": curve.flat_run_hours, "decay_ratio": curve.decay_ratio, "shape": curve.shape}
    if curve.flat_run_hours > FRAUD_FLAT_RUN_HOURS:
        return _fired(
            0.4 + 0.6 * clamp((curve.flat_run_hours - FRAUD_FLAT_RUN_HOURS) / 24, 0, 1),
            f"Hourly views stayed flat or rose for {curve.flat_run_hours} hours with no natural decay.",
            **ev,
        )
    return _clear(f"The longest flat or rising run is {curve.flat_run_hours} hours.", **ev)
