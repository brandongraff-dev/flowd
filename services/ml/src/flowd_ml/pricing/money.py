"""Money formulas the ML service needs (ports of ``packages/contract/schema/formulas.mjs``): funding, all-in price, Pay Math.

All money is integer cents; rates are 0..1 ratios; rounding is half-up per leg. Parity with the contract is enforced by
``tests/test_contract_parity.py``.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..constants import (
    CARD_PROCESSING_FIXED_CENTS,
    CARD_PROCESSING_RATE,
    CPA_ONLY_TAKE_RATE,
    FUNNEL_INSTALL_TO_TRIAL,
    FUNNEL_TRIAL_TO_PAID,
    FUNNEL_VIEW_TO_VISIT,
    FUNNEL_VISIT_TO_INSTALL,
    MATCHED_FIRST_BOUNTY_CAP_CENTS,
    PLAN_TAKE_RATE,
    VIEWS_QUANTILE_RATIO,
)
from ..numeric import bps, js_round, mul_rate, round2


def take_rate(plan: str, bounty_type: str | None = None, first_bounty_waived: bool = False) -> float:
    """Plan take rate. First bounty: waived (0). CPA-only and install-only bounties: flat 6%."""
    if first_bounty_waived:
        return 0.0
    if bounty_type in ("cpa", "install_only"):
        return CPA_ONLY_TAKE_RATE
    return PLAN_TAKE_RATE[plan]


def card_processing(amount_cents: int) -> int:
    """Card processing passed through at cost: round(2.9% x amount) + $0.30."""
    return mul_rate(amount_cents, CARD_PROCESSING_RATE) + CARD_PROCESSING_FIXED_CENTS if amount_cents > 0 else 0


@dataclass(frozen=True, slots=True)
class Funding:
    budget_cents: int
    take_rate: float
    fee_reserve_cents: int
    escrow_total_cents: int
    matched_cents: int
    brand_funded_cents: int
    processing_cents: int
    card_charge_cents: int

    def as_dict(self) -> dict[str, float | int]:
        return {
            "budget_cents": self.budget_cents,
            "take_rate": self.take_rate,
            "fee_reserve_cents": self.fee_reserve_cents,
            "escrow_total_cents": self.escrow_total_cents,
            "matched_cents": self.matched_cents,
            "brand_funded_cents": self.brand_funded_cents,
            "processing_cents": self.processing_cents,
            "card_charge_cents": self.card_charge_cents,
        }


def funding(budget_cents: int, rate: float, matched_cents: int = 0) -> Funding:
    """Escrow funding for a bounty budget (the creator-pay pool). See DOMAIN.md 11, "Escrow total"."""
    fee_reserve = mul_rate(budget_cents, rate)
    escrow_total = budget_cents + fee_reserve
    brand_funded = escrow_total - matched_cents
    processing = card_processing(brand_funded)
    return Funding(
        budget_cents,
        rate,
        fee_reserve,
        escrow_total,
        matched_cents,
        brand_funded,
        processing,
        brand_funded + processing,
    )


def first_bounty_funding(brand_funds_cents: int) -> Funding:
    """First bounty: fee waived and flowd matches dollar for dollar up to $500, on top of what the brand funds."""
    matched = min(MATCHED_FIRST_BOUNTY_CAP_CENTS, brand_funds_cents)
    return funding(brand_funds_cents + matched, 0.0, matched)


def all_in_cpm(cpm_cents: int, budget_cents: int, card_charge_cents: int) -> int:
    """Bounty-level all-in effective CPM: round(card_charge x cpm / budget). 0 when cpm or budget is 0."""
    return js_round((card_charge_cents * cpm_cents) / budget_cents) if cpm_cents > 0 and budget_cents > 0 else 0


def all_in_rate(rate_cents: int, rate: float) -> int:
    """All-in price of a flat rate or a CPA event: rate x (1 + take_rate) x (1 + 2.9%). The $0.30 fixed fee is excluded."""
    return js_round((rate_cents * (10000 + bps(rate)) * (10000 + bps(CARD_PROCESSING_RATE))) / 1e8)


@dataclass(frozen=True, slots=True)
class EarningsPoint:
    views: int
    installs: float
    trials: float
    paid: float
    cpm_pay_cents: int
    cpa_pay_cents: int
    pay_cents: int
    capped: bool

    def as_dict(self) -> dict[str, float | int | bool]:
        return {
            "views": self.views,
            "installs": self.installs,
            "trials": self.trials,
            "paid": self.paid,
            "cpm_pay_cents": self.cpm_pay_cents,
            "cpa_pay_cents": self.cpa_pay_cents,
            "pay_cents": self.pay_cents,
            "capped": self.capped,
        }


def expected_earnings(
    base_median_views: float,
    cpm_cents: int,
    per_video_cap_cents: int,
    install_cents: int = 0,
    trial_cents: int = 0,
    paid_cents: int = 0,
) -> dict[str, EarningsPoint]:
    """Pay Math: expected pay per video at the p25 / median / p75 view quantiles (always an estimate; the cap applies)."""
    out: dict[str, EarningsPoint] = {}
    for name, ratio in VIEWS_QUANTILE_RATIO.items():
        views = js_round(base_median_views * ratio)
        visits = views * FUNNEL_VIEW_TO_VISIT
        installs = visits * FUNNEL_VISIT_TO_INSTALL
        trials = installs * FUNNEL_INSTALL_TO_TRIAL
        paid = trials * FUNNEL_TRIAL_TO_PAID
        cpm_pay = js_round((views * cpm_cents) / 1000)
        cpa_pay = js_round(installs * install_cents + trials * trial_cents + paid * paid_cents)
        gross = cpm_pay + cpa_pay
        out[name] = EarningsPoint(
            views=views,
            installs=round2(installs),
            trials=round2(trials),
            paid=round2(paid),
            cpm_pay_cents=cpm_pay,
            cpa_pay_cents=cpa_pay,
            pay_cents=min(gross, per_video_cap_cents),
            capped=gross > per_video_cap_cents,
        )
    return out
