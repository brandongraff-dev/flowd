import { describe, expect, it } from "vitest";
import { CONSTANTS, takeRateFor } from "../constants";
import {
  allInBreakdown,
  allInCpm,
  allInRate,
  budgetPlan,
  cardProcessing,
  comparePlans,
  escrowShortfall,
  escrowTotal,
  firstBountyFunding,
  funding,
  fundingFor,
  installOnlyFee,
  installOnlyPlan,
  isFunded,
  maxCpmForCostPerTrial,
  planBreakEven,
  realizedCpm,
  smartBudget,
} from "../pricing";

describe("take rates (DECISIONS section 2)", () => {
  it("uses the plan rate for cpm, stacked and direct bounties", () => {
    expect(takeRateFor({ plan: "free", type: "cpm" })).toBe(0.12);
    expect(takeRateFor({ plan: "pro", type: "stacked" })).toBe(0.1);
    expect(takeRateFor({ plan: "scale", type: "direct" })).toBe(0.08);
  });

  it("charges a flat 6% on CPA-only and install-only bounties, whatever the plan", () => {
    for (const plan of ["free", "pro", "scale"] as const) {
      expect(takeRateFor({ plan, type: "cpa" })).toBe(0.06);
      expect(takeRateFor({ plan, type: "install_only" })).toBe(0.06);
    }
  });

  it("waives the fee on the first bounty, even for CPA-only", () => {
    expect(takeRateFor({ plan: "free", type: "cpm", firstBountyWaived: true })).toBe(0);
    expect(takeRateFor({ plan: "free", type: "install_only", firstBountyWaived: true })).toBe(0);
  });
});

describe("funding (DOMAIN worked examples)", () => {
  it("Free plan, $5,000 pool at $2.00 CPM", () => {
    const f = funding({ budget_cents: 500_000, take_rate: 0.12 });
    expect(f.fee_reserve_cents).toBe(60_000);
    expect(f.escrow_total_cents).toBe(560_000);
    expect(f.brand_funded_cents).toBe(560_000);
    expect(f.processing_cents).toBe(16_270);
    expect(f.card_charge_cents).toBe(576_270);
    expect(allInCpm({ cpm_cents: 200, budget_cents: 500_000, card_charge_cents: f.card_charge_cents })).toBe(231);
  });

  it("first bounty on Pro: brand funds $1,500, flowd matches $500", () => {
    const m = firstBountyFunding({ brand_funds_cents: 150_000 });
    expect(m.matched_cents).toBe(50_000);
    expect(m.budget_cents).toBe(200_000);
    expect(m.fee_reserve_cents).toBe(0);
    expect(m.escrow_total_cents).toBe(200_000);
    expect(m.brand_funded_cents).toBe(150_000);
    expect(m.processing_cents).toBe(4_380);
    expect(m.card_charge_cents).toBe(154_380);
    expect(allInCpm({ cpm_cents: 200, budget_cents: m.budget_cents, card_charge_cents: m.card_charge_cents })).toBe(154);
  });

  it("matches dollar for dollar below the cap", () => {
    const m = firstBountyFunding({ brand_funds_cents: 30_000 });
    expect(m.matched_cents).toBe(30_000);
    expect(m.budget_cents).toBe(60_000);
    expect(m.card_charge_cents).toBe(30_900);
  });

  it("caps the match at $500 however much the brand funds", () => {
    const m = firstBountyFunding({ brand_funds_cents: 1_000_000 });
    expect(m.matched_cents).toBe(CONSTANTS.fees.matched_first_bounty_cap_cents);
    expect(m.budget_cents).toBe(1_050_000);
  });

  it("funds a Pro $3,000 pool with a $300 reserve and a $3,396.00 card charge", () => {
    const f = funding({ budget_cents: 300_000, take_rate: 0.1 });
    expect(f.escrow_total_cents).toBe(330_000);
    expect(f.processing_cents).toBe(9_600);
    expect(f.card_charge_cents).toBe(339_600);
  });

  it("funds a CPA-only pool at the flat 6%", () => {
    const f = funding({ budget_cents: 120_000, take_rate: 0.06 });
    expect(f.fee_reserve_cents).toBe(7_200);
    expect(f.processing_cents).toBe(3_719);
    expect(f.card_charge_cents).toBe(130_919);
  });

  it("charges no processing on a zero charge", () => {
    expect(cardProcessing(0)).toBe(0);
    expect(cardProcessing(-5)).toBe(0);
    expect(cardProcessing(10_000)).toBe(290 + 30);
  });

  it("picks the right take rate for a bounty in one call", () => {
    expect(fundingFor({ budget_cents: 500_000, plan: "free", type: "cpm" }).fee_reserve_cents).toBe(60_000);
    expect(fundingFor({ budget_cents: 500_000, plan: "pro", type: "install_only" }).fee_reserve_cents).toBe(30_000);
    expect(fundingFor({ budget_cents: 500_000, plan: "scale", type: "cpm", first_bounty: true, matched_cents: 50_000 }).brand_funded_cents).toBe(450_000);
  });

  it("knows when escrow makes a bounty Funded, and what is missing", () => {
    const b = { budget_cents: 300_000, fee_reserve_cents: 30_000 };
    expect(isFunded({ ...b, escrow_funded_cents: 330_000 })).toBe(true);
    expect(isFunded({ ...b, escrow_funded_cents: 329_999 })).toBe(false);
    expect(escrowShortfall({ ...b, escrow_funded_cents: 300_000 })).toBe(30_000);
    expect(escrowShortfall({ ...b, escrow_funded_cents: 400_000 })).toBe(0);
    expect(escrowTotal(300_000, 0.1)).toBe(330_000);
  });
});

describe("all-in price", () => {
  it("is 0 for a bounty with no CPM or no budget", () => {
    expect(allInCpm({ cpm_cents: 0, budget_cents: 500_000, card_charge_cents: 576_270 })).toBe(0);
    expect(allInCpm({ cpm_cents: 200, budget_cents: 0, card_charge_cents: 0 })).toBe(0);
  });

  it("prices a rate or CPA event all-in, rounded once", () => {
    expect(allInRate(200, 0.12)).toBe(230);
    expect(allInRate(200, 0.1)).toBe(226);
    expect(allInRate(200, 0.08)).toBe(222);
    expect(allInRate(150, 0.06)).toBe(164); // 150 x 1.06 x 1.029 = 163.6
    expect(allInRate(0, 0.1)).toBe(0);
  });

  it("splits the all-in CPM into creator pay, platform fee and processing that add up", () => {
    const free = allInBreakdown({ rate_cents: 200, plan: "free" });
    const pro = allInBreakdown({ rate_cents: 200, plan: "pro" });
    const scale = allInBreakdown({ rate_cents: 200, plan: "scale" });
    expect([free.fee_cents, pro.fee_cents, scale.fee_cents]).toEqual([24, 20, 16]);
    expect([free.total_cents, pro.total_cents, scale.total_cents]).toEqual([230, 226, 222]);
    for (const b of [free, pro, scale]) expect(b.creator_cents + b.fee_cents + b.processing_cents).toBe(b.total_cents);
    expect(allInBreakdown({ rate_cents: 200, plan: "free", first_bounty: true }).fee_cents).toBe(0);
    expect(allInBreakdown({ rate_cents: 150, plan: "scale", type: "cpa" }).take_rate).toBe(0.06);
  });

  it("computes the realised effective CPM", () => {
    expect(realizedCpm({ cost_cents: 52_000, verified_views: 410_000 })).toBe(127);
    expect(realizedCpm({ cost_cents: 52_000, verified_views: 0 })).toBeNull();
  });
});

describe("install-only and CPA-only", () => {
  it("takes a flat 6% per leg on cleared conversions only", () => {
    const q = installOnlyFee({ conversions: { install: 7, trial: 2, paid: 1 }, rates: { install: 40, trial: 150, paid: 400 } });
    expect(q.take_rate).toBe(0.06);
    expect(q.by_kind.install).toEqual({ quantity: 7, rate_cents: 40, pay_cents: 280, fee_cents: 17 });
    expect(q.by_kind.trial.fee_cents).toBe(18);
    expect(q.by_kind.paid.fee_cents).toBe(24);
    expect(q.pay_cents).toBe(980);
    expect(q.fee_cents).toBe(59);
    expect(q.brand_cost_cents).toBe(1039);
  });

  it("charges nothing for kinds the bounty does not pay", () => {
    const q = installOnlyFee({ conversions: { install: 10, trial: 5 }, rates: { install: 50 } });
    expect(q.by_kind.trial.pay_cents).toBe(0);
    expect(q.pay_cents).toBe(500);
    expect(q.fee_cents).toBe(30);
  });

  it("plans an install-only pool: installs funded and all-in cost per install", () => {
    const p = installOnlyPlan({ budget_cents: 100_000, install_rate_cents: 300 });
    expect(p.max_installs).toBe(333);
    expect(p.funding.fee_reserve_cents).toBe(6_000);
    expect(p.all_in_cost_per_install_cents).toBe(327);
    expect(installOnlyPlan({ budget_cents: 100_000, install_rate_cents: 0 }).max_installs).toBe(0);
  });
});

describe("plan comparison (PRODUCT_SPEC section 7)", () => {
  it("finds the documented break-evens", () => {
    expect(planBreakEven("free", "pro")).toBe(1_495_000); // $14,950
    expect(planBreakEven("free", "scale")).toBe(2_497_500); // $24,975
    expect(planBreakEven("pro", "scale")).toBe(3_500_000); // $35,000
  });

  it("has no break-even when the target plan is not cheaper per dollar", () => {
    expect(planBreakEven("pro", "free")).toBeNull();
    expect(planBreakEven("pro", "pro")).toBeNull();
  });

  it("recommends Free at low spend, Pro in the middle, Scale at high spend", () => {
    expect(comparePlans({ monthly_spend_cents: 500_000 }).best).toBe("free");
    expect(comparePlans({ monthly_spend_cents: 2_000_000 }).best).toBe("pro");
    expect(comparePlans({ monthly_spend_cents: 4_000_000 }).best).toBe("scale");
  });

  it("breaks ties toward the cheaper plan", () => {
    expect(comparePlans({ monthly_spend_cents: 1_495_000 }).best).toBe("free");
    expect(comparePlans({ monthly_spend_cents: 1_500_000 }).best).toBe("pro");
    expect(comparePlans({ monthly_spend_cents: 3_500_000 }).best).toBe("pro");
    expect(comparePlans({ monthly_spend_cents: 3_600_000 }).best).toBe("scale");
  });

  it("totals subscription plus fee and reports the saving against Free", () => {
    const c = comparePlans({ monthly_spend_cents: 4_000_000 });
    const byPlan = Object.fromEntries(c.plans.map((p) => [p.plan, p]));
    expect(byPlan.free.total_cents).toBe(480_000);
    expect(byPlan.pro.total_cents).toBe(29_900 + 400_000);
    expect(byPlan.scale.total_cents).toBe(99_900 + 320_000);
    expect(c.savings_vs_free_cents).toBe(480_000 - 419_900);
    expect(byPlan.scale.effective_rate).toBeCloseTo(0.105, 3);
  });

  it("handles zero spend", () => {
    const c = comparePlans({ monthly_spend_cents: 0 });
    expect(c.best).toBe("free");
    expect(c.plans.every((p) => p.effective_rate === 0)).toBe(true);
    expect(c.savings_vs_free_cents).toBe(0);
  });
});

describe("budget planner (DOMAIN: Pro, $5,000 pool at $2.00 CPM)", () => {
  const plan = budgetPlan({ budget_cents: 500_000, take_rate: 0.1, cpm_cents: 200, avg_first_payment_cents: 3499 });

  it("computes the card charge and views", () => {
    expect(plan.funding.card_charge_cents).toBe(565_980);
    expect(plan.views).toBe(2_500_000);
  });

  it("matches the documented bands", () => {
    expect(plan.band.low).toMatchObject({ installs: 2351, trials: 146, paid: 51, cost_per_trial_cents: 3882 });
    expect(plan.band.median).toMatchObject({ installs: 4275, trials: 265, paid: 92, cost_per_trial_cents: 2135 });
    expect(plan.band.high).toMatchObject({ installs: 6840, trials: 424, paid: 148, cost_per_trial_cents: 1335 });
  });

  it("adds cost per install and per paid (the CAC), and revenue", () => {
    expect(plan.band.median.cost_per_install_cents).toBe(132);
    expect(plan.band.median.cost_per_paid_cents).toBeGreaterThan(plan.band.median.cost_per_trial_cents ?? 0);
    expect(plan.band.median.revenue_cents).toBeGreaterThan(0);
    expect(plan.label).toMatch(/estimate/i);
  });

  it("returns null cost per unit when under one expected unit", () => {
    const small = budgetPlan({ budget_cents: 5_000, take_rate: 0.12, cpm_cents: 200, avg_first_payment_cents: 3499 });
    expect(small.band.low.cost_per_paid_cents).toBeNull();
    expect(small.band.low.cost_per_trial_cents).not.toBeNull();
    const tiny = budgetPlan({ budget_cents: 2_000, take_rate: 0.12, cpm_cents: 200, avg_first_payment_cents: 3499 });
    expect(tiny.band.low.cost_per_trial_cents).toBeNull();
  });

  it("accounts for a match on a first bounty", () => {
    const m = budgetPlan({ budget_cents: 200_000, take_rate: 0, cpm_cents: 200, avg_first_payment_cents: 3499, matched_cents: 50_000 });
    expect(m.funding.card_charge_cents).toBe(154_380);
    expect(m.views).toBe(1_000_000);
  });

  it("has no views without a CPM", () => {
    expect(budgetPlan({ budget_cents: 100_000, take_rate: 0.06, cpm_cents: 0, avg_first_payment_cents: 3499 }).views).toBe(0);
  });
});

describe("smart budget", () => {
  it("sizes a pool for a trials goal: 265 median trials is about the $5,000 pool", () => {
    const r = smartBudget({ goal: { kind: "trials", count: 265 }, cpm_cents: 200, plan: "pro", avg_first_payment_cents: 3499 });
    expect(r.recommended.budget_cents).toBe(500_000);
    expect(r.recommended.budget_cents).toBeLessThan(r.conservative.budget_cents);
    expect(r.optimistic.budget_cents).toBeLessThan(r.recommended.budget_cents);
    expect(r.conservative.budget_cents % 5_000).toBe(0);
    expect(r.recommended.plan.band.median.trials).toBeGreaterThanOrEqual(264);
    expect(r.views).toBeGreaterThan(2_400_000);
    expect(r.label).toMatch(/estimate/i);
  });

  it("scales the pool with the goal and never goes under the $100 minimum", () => {
    const small = smartBudget({ goal: { kind: "installs", count: 5 }, cpm_cents: 200, plan: "free", avg_first_payment_cents: 3499 });
    expect(small.recommended.budget_cents).toBe(CONSTANTS.pay.min_bounty_budget_cents);
    const big = smartBudget({ goal: { kind: "installs", count: 4275 }, cpm_cents: 200, plan: "free", avg_first_payment_cents: 3499 });
    expect(big.recommended.budget_cents).toBe(500_000);
  });

  it("supports a views goal and a number of posts", () => {
    const r = smartBudget({ goal: { kind: "views", count: 1_000_000 }, cpm_cents: 200, plan: "pro", avg_first_payment_cents: 3499, median_views_per_post: 14_200 });
    expect(r.recommended.budget_cents).toBe(200_000);
    expect(r.posts_needed).toBe(71);
  });

  it("adds CPA bonuses to the pool on a stacked bounty", () => {
    const plain = smartBudget({ goal: { kind: "views", count: 1_000_000 }, cpm_cents: 200, plan: "pro", avg_first_payment_cents: 3499 });
    const stacked = smartBudget({ goal: { kind: "views", count: 1_000_000 }, cpm_cents: 200, plan: "pro", avg_first_payment_cents: 3499, rates: { install: 40, trial: 150, paid: 400 } });
    expect(stacked.recommended.budget_cents).toBeGreaterThan(plain.recommended.budget_cents);
  });

  it("sizes a CPA-only pool from the events it pays for, with the flat 6%", () => {
    const r = smartBudget({ goal: { kind: "installs", count: 1000 }, cpm_cents: 0, plan: "scale", type: "install_only", rates: { install: 40 }, avg_first_payment_cents: 3499 });
    expect(r.recommended.budget_cents).toBe(40_000);
    expect(r.recommended.funding.take_rate).toBe(0.06);
    expect(r.recommended.funding.fee_reserve_cents).toBe(2_400);
    expect(r.warnings.some((w) => /CPA-only/.test(w))).toBe(true);
  });

  it("splits the first bounty into brand funds and match", () => {
    const r = smartBudget({ goal: { kind: "views", count: 500_000 }, cpm_cents: 200, plan: "pro", avg_first_payment_cents: 3499, first_bounty: true });
    expect(r.recommended.funding.take_rate).toBe(0);
    expect(r.recommended.funding.matched_cents).toBe(50_000);
    expect(r.recommended.funding.brand_funded_cents).toBe(r.recommended.budget_cents - 50_000);
  });

  it("warns about a zero goal and a CPM under the floor", () => {
    expect(smartBudget({ goal: { kind: "trials", count: 0 }, cpm_cents: 200, plan: "free", avg_first_payment_cents: 3499 }).warnings.length).toBeGreaterThan(0);
    expect(smartBudget({ goal: { kind: "views", count: 100_000 }, cpm_cents: 20, plan: "free", avg_first_payment_cents: 3499 }).warnings.some((w) => /floor/.test(w))).toBe(true);
  });

  it("finds the highest CPM that still hits a cost per trial", () => {
    const cpm = maxCpmForCostPerTrial({ target_cost_per_trial_cents: 2135, plan: "pro" });
    expect(cpm).toBeGreaterThanOrEqual(197);
    expect(cpm).toBeLessThanOrEqual(200);
    expect(maxCpmForCostPerTrial({ target_cost_per_trial_cents: 2135, plan: "pro", rates: { trial: 150 } })).toBeLessThan(cpm);
    expect(maxCpmForCostPerTrial({ target_cost_per_trial_cents: 100, plan: "pro", rates: { trial: 1500 } })).toBe(0);
  });
});
