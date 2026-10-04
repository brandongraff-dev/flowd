"""Suggested CPM and the price-vs-fill-time curve for a new bounty (BLUEPRINT ML system 7, day-one approach)."""

from __future__ import annotations

from ..constants import (
    CATEGORY_DEFAULT,
    LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS,
    PAY_FLOOR_CPM_CENTS,
    PRICING_CURVE_MULTIPLIERS,
    PRICING_MIN_FILL_HOURS,
    PRICING_THIN_MARKET_MIN_SAMPLE,
)
from ..numeric import js_round, round2, usd
from ..schemas.common import Fix, ModelInfo, Reason
from ..schemas.pricing import (
    AllInPrice,
    CandidateAssessment,
    CpmRange,
    CreatorPay,
    CurvePoint,
    FillEstimate,
    MarketStats,
    PriceSuggestion,
    SuggestCpmRequest,
)
from ..version import MODEL_VERSIONS
from .fill import cpm_for_target_fill, fill_time, price_curve
from .money import all_in_cpm, expected_earnings, first_bounty_funding, funding, take_rate

MODEL = ModelInfo(name="suggest-cpm", kind="pricing", version=MODEL_VERSIONS["suggest_cpm"], stage="heuristic")

_PRIORITY_MULTIPLIER = {"balanced": 1.0, "fastest": 1.5, "cheapest": 0.8}
MAX_CURVE_MULTIPLIER = max(PRICING_CURVE_MULTIPLIERS)


def _hours(h: float) -> str:
    return f"{h:.0f}h" if h >= 10 else f"{h:.1f}h"


def default_market(category: str) -> MarketStats:
    d = CATEGORY_DEFAULT[category]
    return MarketStats(
        clearing_cpm_cents=d["clearing_cpm_cents"],
        median_fill_hours=d["median_fill_hours"],
        sample_n=0,
        median_views=d["median_views"],
    )


def _all_in(req: SuggestCpmRequest, cpm_cents: int) -> AllInPrice | None:
    if not req.budget_cents:
        return None
    if req.first_bounty:
        f = first_bounty_funding(req.budget_cents)
    else:
        f = funding(req.budget_cents, take_rate(req.plan, req.bounty_type))
    return AllInPrice(**f.as_dict(), all_in_cpm_cents=all_in_cpm(cpm_cents, f.budget_cents, f.card_charge_cents))  # type: ignore[arg-type]


def suggest_cpm(req: SuggestCpmRequest) -> PriceSuggestion:
    source = "market" if req.market is not None else "category_default"
    m = req.market or default_market(req.category)
    clearing, hours, n = m.clearing_cpm_cents, m.median_fill_hours, m.sample_n
    warnings: list[str] = []
    reasons: list[Reason] = []

    # 1. the suggested price
    basis = f"priority {req.priority}"
    if req.target_fill_hours is not None:
        target = req.target_fill_hours
        if target < PRICING_MIN_FILL_HOURS:
            warnings.append(
                f"No price fills in under {PRICING_MIN_FILL_HOURS} hours; the model floors fill time there."
            )
        raw = cpm_for_target_fill(target, clearing, hours)
        basis = f"a {_hours(target)} fill target"
    else:
        raw = clearing * _PRIORITY_MULTIPLIER[req.priority]
    cpm = js_round(raw)
    if cpm > clearing * MAX_CURVE_MULTIPLIER:
        cpm = js_round(clearing * MAX_CURVE_MULTIPLIER)
        warnings.append(
            f"Capped at {MAX_CURVE_MULTIPLIER:g}x the clearing CPM; faster than that is outside what the model can price."
        )
    if cpm < PAY_FLOOR_CPM_CENTS:
        cpm = PAY_FLOOR_CPM_CENTS
        warnings.append(f"Raised to the {usd(PAY_FLOOR_CPM_CENTS)} CPM floor.")

    ft = fill_time(cpm, clearing, hours, n)
    thin = n < PRICING_THIN_MARKET_MIN_SAMPLE
    if thin:
        warnings.append(
            f"Thin market: only {n} comparable bounties. Treat this as a starting point and watch the first submissions."
        )

    # 2. the range
    if m.p25_cpm_cents and m.p75_cpm_cents:
        rng = CpmRange(low_cpm_cents=m.p25_cpm_cents, high_cpm_cents=m.p75_cpm_cents, basis="market_p25_p75")
    else:
        rng = CpmRange(
            low_cpm_cents=js_round(clearing * 0.8), high_cpm_cents=js_round(clearing * 1.25), basis="clearing_band"
        )

    # 3. the curve
    all_in_base = _all_in(req, cpm)
    curve: list[CurvePoint] = []
    for p in price_curve(clearing, hours, n):
        curve.append(
            CurvePoint(
                cpm_cents=p.cpm_cents,
                multiplier=p.multiplier,
                fill_hours_p50=p.fill_hours_p50,
                fill_hours_p80=p.fill_hours_p80,
                confidence=p.confidence,
                vs_clearing_pct=js_round((p.multiplier - 1) * 100),
                sample_n=p.sample_n,
                all_in_cpm_cents=None
                if all_in_base is None
                else all_in_cpm(p.cpm_cents, all_in_base.budget_cents, all_in_base.card_charge_cents),
            )
        )

    # 4. creator pay at the suggested price (Pay Math) and the Brief Lint low-pay rule
    views = m.median_views or CATEGORY_DEFAULT[req.category]["median_views"]
    cpa = req.cpa
    e = expected_earnings(
        views,
        cpm,
        req.per_video_cap_cents,
        cpa.install_cents if cpa else 0,
        cpa.trial_cents if cpa else 0,
        cpa.paid_cents if cpa else 0,
    )
    creator_pay = CreatorPay(
        median_views=views,
        p25_cents=e["p25"].pay_cents,
        median_cents=e["median"].pay_cents,
        p75_cents=e["p75"].pay_cents,
        capped_at_p75=e["p75"].capped,
    )
    if creator_pay.median_cents < LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS:
        warnings.append(
            f"A typical creator would earn about {usd(creator_pay.median_cents)} per video here, under the {usd(LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS)} Brief Lint warning line. Raise the CPM or add a CPA bonus."
        )

    # 5. the candidate price
    candidate: CandidateAssessment | None = None
    if req.candidate_cpm_cents:
        c = req.candidate_cpm_cents
        cf = fill_time(c, clearing, hours, n)
        vs = js_round((c / clearing - 1) * 100)
        position = "below_market" if c < clearing * 0.9 else "above_market" if c > clearing * 1.1 else "at_market"
        msg = (
            f"{usd(c)} is {abs(vs)}% {'under' if vs < 0 else 'over' if vs > 0 else 'at'} the clearing price of {usd(clearing)}; "
            f"expect about {_hours(cf.fill_hours_p50)} to fill (80% of the time within {_hours(cf.fill_hours_p80)})."
        )
        candidate = CandidateAssessment(
            cpm_cents=c,
            position=position,
            vs_clearing_pct=vs,  # type: ignore[arg-type]
            fill=FillEstimate(p50_hours=cf.fill_hours_p50, p80_hours=cf.fill_hours_p80, confidence=cf.confidence),
            message=msg,
        )

    # 6. explanations
    reasons.append(
        Reason(
            code="clearing_price",
            severity="info",
            title="Clearing price",
            message=(
                f"Bounties in this category clear at {usd(clearing)} per 1,000 verified views, and the median fills in {_hours(hours)} ({n} comparable bounties)."
                if source == "market"
                else f"No live market data was supplied, so this uses the day-one default for the category: {usd(clearing)} CPM, {_hours(hours)} median fill. Defaults are replaced by real clearing prices as bounties settle."
            ),
        )
    )
    reasons.append(
        Reason(
            code="suggestion",
            severity="positive",
            title="Suggested CPM",
            message=f"{usd(cpm)} for {basis}: p50 fill about {_hours(ft.fill_hours_p50)}, p80 {_hours(ft.fill_hours_p80)}, confidence {ft.confidence:.2f}.",
        )
    )
    if ft.confidence < 0.4:
        reasons.append(
            Reason(
                code="confidence",
                severity="warning",
                title="Confidence",
                message=f"Confidence is {ft.confidence:.2f}: it shrinks with fewer comparable bounties and with distance from the clearing price.",
            )
        )
    reasons.append(
        Reason(
            code="creator_pay",
            severity="positive" if creator_pay.median_cents >= LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS else "warning",
            title="Creator pay",
            message=f"At {usd(cpm)} a creator with {views:,} median views earns about {usd(creator_pay.median_cents)} per video (range {usd(creator_pay.p25_cents)} to {usd(creator_pay.p75_cents)}). Estimate.",
        )
    )
    if all_in_base is not None:
        reasons.append(
            Reason(
                code="all_in",
                severity="info",
                title="All-in price",
                message=f"All in, with the {all_in_base.take_rate:.0%} fee and card processing, you pay {usd(all_in_base.all_in_cpm_cents)} per 1,000 verified views when the pool is fully used.",
            )
        )

    fixes: list[Fix] = []
    mults = list(PRICING_CURVE_MULTIPLIERS)
    here = min(range(len(curve)), key=lambda i: abs(curve[i].cpm_cents - cpm))
    if here + 1 < len(mults):
        up = curve[here + 1]
        saved = round2(ft.fill_hours_p50 - up.fill_hours_p50)
        fixes.append(
            Fix(
                id="go_faster",
                target="cpm",
                effort="quick",
                text=f"Raise to {usd(up.cpm_cents)} to fill about {_hours(saved)} sooner (p50 {_hours(up.fill_hours_p50)} instead of {_hours(ft.fill_hours_p50)}).",
            )
        )
    if here > 0:
        down = curve[here - 1]
        fixes.append(
            Fix(
                id="go_cheaper",
                target="cpm",
                effort="quick",
                text=f"Lower to {usd(down.cpm_cents)} and save {usd(cpm - down.cpm_cents)} per 1,000 views if you can wait about {_hours(round2(down.fill_hours_p50 - ft.fill_hours_p50))} longer (p50 {_hours(down.fill_hours_p50)}).",
            )
        )
    if creator_pay.median_cents < LINT_LOW_EFFECTIVE_PAY_MEDIAN_CENTS:
        fixes.append(
            Fix(
                id="add_cpa",
                target="pay",
                effort="quick",
                text="Add a CPA bonus (for example $1.50 per trial) so a typical creator clears the low-pay line.",
            )
        )
    if thin:
        fixes.append(
            Fix(
                id="start_small",
                target="budget",
                effort="moderate",
                text="Fund a smaller first pool and re-price after the first 10 submissions.",
            )
        )

    summary = (
        f"Suggested CPM {usd(cpm)} ({source.replace('_', ' ')}): about {_hours(ft.fill_hours_p50)} to fill, confidence {ft.confidence:.2f}"
        + (f"; all-in {usd(all_in_base.all_in_cpm_cents)}." if all_in_base else ".")
    )
    return PriceSuggestion(
        model=MODEL,
        category=req.category,
        source=source,
        suggested_cpm_cents=cpm,
        clearing_cpm_cents=clearing,  # type: ignore[arg-type]
        range=rng,
        fill=FillEstimate(p50_hours=ft.fill_hours_p50, p80_hours=ft.fill_hours_p80, confidence=ft.confidence),
        thin_market=thin,
        sample_n=n,
        curve=curve,
        candidate=candidate,
        all_in=all_in_base,
        creator_pay=creator_pay,
        summary=summary,
        reasons=reasons,
        fixes=fixes,
        warnings=warnings,
    )
