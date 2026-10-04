"""Creator <-> bounty matching: hard gates, five explainable factors, an embedding that can lift a weak niche match.

Score (0..100) = niche 40 + platform 15 + region 15 + price 15 + brand reliability 10 + recency 5, each factor 0..1
(``matchScore`` in formulas.mjs). Gates are binary and applied first: a bounty that fails any gate is returned as
``locked`` with the failed gates named, never silently dropped.
"""

from __future__ import annotations

from collections.abc import Sequence

from ..constants import (
    CATEGORY_NICHES,
    MATCH_EMBEDDING_SHARE,
    MATCH_GATES,
    MATCH_MIN_TO_RANK_FIRST,
    MATCH_PRICE_RATIO_CAP,
    MATCH_RECENCY_HALF_LIFE_DAYS,
    MATCH_WEIGHTS,
    NICHE_ADJACENT,
    NICHE_ADJACENT_CREDIT,
    TIER_ORDER,
)
from ..numeric import clamp, js_round, pct, round2, usd
from ..pricing.money import expected_earnings
from ..schemas.common import Fix, ModelInfo, Reason
from ..schemas.matching import (
    MatchBounty,
    MatchCreator,
    MatchFactor,
    MatchRequest,
    MatchResponse,
    MatchResult,
)
from ..version import MODEL_VERSIONS
from .embeddings import EmbeddingProvider, cosine

MODEL = ModelInfo(name="match", kind="matching", version=MODEL_VERSIONS["match"], stage="heuristic")

NEUTRAL_BRAND_RELIABILITY = 70.0  # a new brand has no verdict yet: neutral, never a misleading figure
NEUTRAL_REGION_FIT = 0.6  # audience data not linked: a cautious middle, explained in the reason
GATE_LABEL = {
    "eligibility_tier": "tier",
    "country": "country",
    "platform_account_linked": "linked account",
    "funded": "funding",
    "not_already_submitted": "already submitted",
}


def match_score(
    gates: dict[str, bool],
    niche_overlap: float,
    platform_fit: float,
    region_fit: float,
    price_ratio: float,
    brand_reliability: float,
    bounty_age_days: float,
) -> int | None:
    """Port of ``matchScore``: null (None) when any gate fails, else the rounded weighted sum."""
    if not all(gates.values()):
        return None
    f = {
        "niche": niche_overlap,
        "platform": platform_fit,
        "region": region_fit,
        "price": clamp(price_ratio, 0, MATCH_PRICE_RATIO_CAP) / MATCH_PRICE_RATIO_CAP,
        "brand_reliability": clamp(brand_reliability / 100, 0, 1),
        "recency": 0.5 ** (bounty_age_days / MATCH_RECENCY_HALF_LIFE_DAYS),
    }
    return js_round(sum(w * f[k] for k, w in MATCH_WEIGHTS.items()))


def _gates(c: MatchCreator, b: MatchBounty) -> dict[str, bool]:
    tier_ok = b.min_tier is None or TIER_ORDER.index(c.tier) >= TIER_ORDER.index(b.min_tier)
    country_ok = not b.countries or c.country in b.countries
    linked_ok = bool(set(c.platforms_linked) & set(b.platforms)) if b.platforms else bool(c.platforms_linked)
    return {
        "eligibility_tier": tier_ok,
        "country": country_ok,
        "platform_account_linked": linked_ok,
        "funded": b.funded,
        "not_already_submitted": not (b.already_submitted or b.id in c.submitted_bounty_ids),
    }


def _gate_reason(gate: str, c: MatchCreator, b: MatchBounty) -> str:
    if gate == "eligibility_tier":
        return f"Needs {b.min_tier} tier; you are {c.tier}."
    if gate == "country":
        return f"Open to {', '.join(b.countries)} creators; you are in {c.country}."
    if gate == "platform_account_linked":
        return f"Needs a linked {' or '.join(b.platforms) if b.platforms else 'social'} account."
    if gate == "funded":
        return "Not fully escrowed yet, so it is not live."
    return "You already submitted to this bounty."


def niche_factor(c: MatchCreator, b: MatchBounty) -> tuple[float, str, str]:
    """Rules overlap of the bounty's niches with the creator's: direct match 1, adjacent niche 0.5."""
    wanted = list(b.niches) or list(CATEGORY_NICHES.get(b.category or "", ()))
    if not wanted:
        return 0.5, "neutral", "The bounty names no niche, so niche fit is neutral."
    mine = set(c.niches)
    direct = [n for n in wanted if n in mine]
    adjacent = [n for n in wanted if n not in mine and any(frozenset((n, m)) in NICHE_ADJACENT for m in mine)]
    score = clamp((len(direct) + NICHE_ADJACENT_CREDIT * len(adjacent)) / len(wanted), 0, 1)
    if direct:
        text = f"{len(direct)} of {len(wanted)} bounty niche{'s' if len(wanted) != 1 else ''} match yours ({', '.join(direct)})"
        text += f"; {', '.join(adjacent)} is adjacent." if adjacent else "."
    elif adjacent:
        text = f"Adjacent niche: {', '.join(adjacent)} is close to {', '.join(sorted(mine))}."
    else:
        text = f"The bounty is in {', '.join(wanted)}; your niches are {', '.join(sorted(mine))}."
    return score, "rules", text


def platform_factor(c: MatchCreator, b: MatchBounty) -> tuple[float, str]:
    allowed = set(b.platforms) or {"tiktok", "instagram", "youtube"}
    linked = set(c.platforms_linked) & allowed
    if not linked:
        return 0.0, "No linked account on a bounty platform."
    if c.primary_platform in linked:
        return 1.0, f"Your primary platform, {c.primary_platform}, is on the bounty."
    return 0.7, f"You have {', '.join(sorted(linked))} linked; it is not your primary platform."


def region_factor(c: MatchCreator, b: MatchBounty) -> tuple[float, str]:
    if not b.target_countries or b.min_target_audience_ratio is None or b.min_target_audience_ratio <= 0:
        return 1.0, "The bounty has no audience-region requirement."
    if not c.audience_geo:
        return NEUTRAL_REGION_FIT, "Link an account with audience data to confirm the region fit; neutral for now."
    share = sum(c.audience_geo.get(t, 0.0) for t in b.target_countries)
    fit = clamp(share / b.min_target_audience_ratio, 0, 1)
    return (
        fit,
        f"{pct(share)} of your audience is in {', '.join(b.target_countries)} against {pct(b.min_target_audience_ratio)} needed.",
    )


def expected_pay(c: MatchCreator, b: MatchBounty) -> int | None:
    if b.expected_pay_cents is not None:
        return b.expected_pay_cents
    if b.pay is not None and c.median_views_28d is not None:
        e = expected_earnings(
            c.median_views_28d,
            b.pay.cpm_cents,
            b.pay.per_video_cap_cents,
            b.pay.install_cents,
            b.pay.trial_cents,
            b.pay.paid_cents,
        )
        return e["median"].pay_cents
    return None


def price_factor(c: MatchCreator, b: MatchBounty) -> tuple[float, float, int | None, str]:
    """Price fit = min(expected pay / usual pay, 1.5) / 1.5. Returns ``(ratio, fit, expected_pay, reason)``."""
    pay = expected_pay(c, b)
    if pay is None or not c.usual_pay_cents:
        return 1.0, 1.0 / MATCH_PRICE_RATIO_CAP, pay, "Not enough pay history to compare; neutral."
    ratio = pay / c.usual_pay_cents
    fit = clamp(ratio, 0, MATCH_PRICE_RATIO_CAP) / MATCH_PRICE_RATIO_CAP
    return ratio, fit, pay, f"Expected {usd(pay)} per video against your usual {usd(c.usual_pay_cents)} ({ratio:.2f}x)."


def _profile_text(c: MatchCreator) -> str:
    return " ".join([*c.niches, c.bio, *c.top_hook_words])


def _bounty_text(b: MatchBounty) -> str:
    return " ".join([b.title, b.summary, b.category or "", *b.niches])


def embedding_similarity(creator_vec: Sequence[float] | None, bounty_vec: Sequence[float] | None) -> float | None:
    if creator_vec is None or bounty_vec is None:
        return None
    return clamp(cosine(creator_vec, bounty_vec), 0.0, 1.0)


def rank_bounties(req: MatchRequest, embedder: EmbeddingProvider | None = None) -> MatchResponse:
    c = req.creator
    creator_vec: list[float] | None = None
    bounty_vecs: dict[str, list[float]] = {}
    if req.use_embeddings:
        creator_vec = c.embedding
        need_text = [b for b in req.bounties if b.embedding is None and (b.summary or b.title)]
        if embedder is not None:
            if creator_vec is None and (c.bio or c.top_hook_words):
                creator_vec = embedder.embed_texts([_profile_text(c)])[0]
            if need_text:
                for b, vec in zip(need_text, embedder.embed_texts([_bounty_text(b) for b in need_text]), strict=True):
                    bounty_vecs[b.id] = vec
        for b in req.bounties:
            if b.embedding is not None:
                bounty_vecs[b.id] = b.embedding

    results: list[MatchResult] = []
    for b in req.bounties:
        gates = _gates(c, b)
        failed = [g for g in MATCH_GATES if not gates[g]]
        if failed:
            results.append(
                MatchResult(
                    bounty_id=b.id,
                    eligible=False,
                    locked_by=failed,
                    reasons=[
                        Reason(
                            code=g, severity="warning", title=f"Locked: {GATE_LABEL[g]}", message=_gate_reason(g, c, b)
                        )
                        for g in failed
                    ],
                    summary=f"Locked: {'; '.join(_gate_reason(g, c, b) for g in failed)}",
                )
            )
            continue
        rules_niche, _src, niche_text = niche_factor(c, b)
        sim = embedding_similarity(creator_vec, bounty_vecs.get(b.id)) if req.use_embeddings else None
        niche = rules_niche
        if sim is not None and sim > rules_niche:
            niche = clamp(rules_niche + MATCH_EMBEDDING_SHARE * (sim - rules_niche), 0, 1)
            niche_text += f" Your content also reads close to the brief (similarity {sim:.2f}), which lifts it."
        plat, plat_text = platform_factor(c, b)
        reg, reg_text = region_factor(c, b)
        ratio, price_fit, pay, price_text = price_factor(c, b)
        brand = b.brand_reliability if b.brand_reliability is not None else NEUTRAL_BRAND_RELIABILITY
        brand_text = (
            f"Brand reliability {brand:.0f}/100."
            if b.brand_reliability is not None
            else "New brand: no reliability score yet, so a neutral 70."
        )
        recency = 0.5 ** (b.age_days / MATCH_RECENCY_HALF_LIFE_DAYS)
        rec_text = f"Posted {b.age_days:.0f} day{'s' if round(b.age_days) != 1 else ''} ago; freshness halves every {MATCH_RECENCY_HALF_LIFE_DAYS} days."
        score = match_score(gates, niche, plat, reg, ratio, brand, b.age_days)
        raw = {
            "niche": (niche, "Niche fit", niche_text),
            "platform": (plat, "Platform fit", plat_text),
            "region": (reg, "Audience-region fit", reg_text),
            "price": (price_fit, "Price fit", price_text),
            "brand_reliability": (brand / 100, "Brand reliability", brand_text),
            "recency": (recency, "Freshness", rec_text),
        }
        factors = [
            MatchFactor(
                key=k,
                label=raw[k][1],
                weight=w,
                value=round2(raw[k][0]),
                points=round2(w * raw[k][0]),
                reason=raw[k][2],
            )
            for k, w in MATCH_WEIGHTS.items()
        ]
        order = sorted(factors, key=lambda f: -(f.weight - f.points))
        reasons = [
            Reason(
                code=f.key,
                severity="positive"
                if f.points >= 0.8 * f.weight
                else "warning"
                if f.points >= 0.4 * f.weight
                else "critical",
                title=f.label,
                message=f.reason,
                impact=round2(f.points - f.weight),
            )
            for f in order
        ]
        top = max(factors, key=lambda f: f.points / f.weight)
        low = min(factors, key=lambda f: f.points / f.weight)
        summary = f"{score}/100: strongest on {top.label.lower()}" + (
            f", weakest on {low.label.lower()}." if low.key != top.key else "."
        )
        results.append(
            MatchResult(
                bounty_id=b.id,
                eligible=True,
                score=score,
                factors=factors,
                embedding_similarity=None if sim is None else round2(sim),
                expected_pay_cents=pay,
                price_ratio=None if pay is None or not c.usual_pay_cents else round2(ratio),
                reasons=reasons,
                summary=summary,
            )
        )

    bounty_by_id = {b.id: b for b in req.bounties}
    ranked = [r for r in results if r.eligible]
    ranked.sort(
        key=lambda r: (-(r.score or 0), bounty_by_id[r.bounty_id].age_days, -(r.expected_pay_cents or 0), r.bounty_id)
    )
    if req.limit is not None:
        ranked = ranked[: req.limit]
    for i, r in enumerate(ranked, start=1):
        r.rank = i
    locked = [r for r in results if not r.eligible]
    top_pick = ranked[0].bounty_id if ranked and (ranked[0].score or 0) >= MATCH_MIN_TO_RANK_FIRST else None
    if not ranked:
        summary = f"No open bounty fits right now: {len(locked)} locked."
    elif top_pick:
        summary = f"{len(ranked)} bounties ranked for {c.id}; best is {top_pick} at {ranked[0].score}/100. {len(locked)} locked."
    else:
        summary = f"{len(ranked)} bounties ranked for {c.id}, but none scores {MATCH_MIN_TO_RANK_FIRST}+, so there is no top pick. {len(locked)} locked."
    reasons, fixes = _feed_explanation(req, ranked, locked, bounty_by_id)
    return MatchResponse(
        model=MODEL,
        creator_id=c.id,
        ranked=ranked,
        locked=locked,
        top_pick_bounty_id=top_pick,
        summary=summary,
        reasons=reasons,
        fixes=fixes,
    )


def _name(b: MatchBounty) -> str:
    return b.title or b.id


def _feed_explanation(
    req: MatchRequest, ranked: list[MatchResult], locked: list[MatchResult], by_id: dict[str, MatchBounty]
) -> tuple[list[Reason], list[Fix]]:
    """Top-level reasons and fixes: the best matches, what is locked and how to unlock it."""
    reasons: list[Reason] = []
    for r in ranked[:3]:
        score = r.score or 0
        reasons.append(
            Reason(
                code=r.bounty_id,
                severity="positive" if score >= MATCH_MIN_TO_RANK_FIRST else "warning",
                title=_name(by_id[r.bounty_id]),
                message=f"#{r.rank} at {score}/100: {r.summary.split(': ', 1)[1] if ': ' in r.summary else r.summary}",
                impact=float(score - 100),
            )
        )
    if locked:
        gates = sorted({g for r in locked for g in r.locked_by})
        reasons.append(
            Reason(
                code="locked",
                severity="info",
                title="Locked bounties",
                message=f"{len(locked)} bounty{'ies' if len(locked) != 1 else ''} locked by: {', '.join(GATE_LABEL[g] for g in gates)}.",
            )
        )
    if not ranked:
        reasons.append(
            Reason(
                code="empty_feed",
                severity="warning",
                title="Nothing to rank",
                message="No open bounty passes every gate for this creator right now.",
            )
        )
    fixes: list[Fix] = []
    c = req.creator
    for r in locked:
        b = by_id[r.bounty_id]
        if r.locked_by == ["eligibility_tier"] and b.min_tier:
            fixes.append(
                Fix(
                    id=f"tier_{b.id}",
                    target="eligibility_tier",
                    text=f"Reach {b.min_tier} to unlock {_name(b)}.",
                    effort="reshoot",
                )
            )
        elif r.locked_by == ["platform_account_linked"] and b.platforms:
            fixes.append(
                Fix(
                    id=f"link_{b.id}",
                    target="platform_account_linked",
                    text=f"Link a {' or '.join(b.platforms)} account to unlock {_name(b)}.",
                    effort="quick",
                )
            )
    if ranked and not c.audience_geo and any(by_id[r.bounty_id].target_countries for r in ranked):
        fixes.append(
            Fix(
                id="link_audience",
                target="region",
                text="Link an account with audience data so region fit is measured, not assumed.",
                effort="quick",
            )
        )
    return reasons, fixes
