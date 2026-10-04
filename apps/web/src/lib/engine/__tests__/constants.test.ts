import { describe, expect, it } from "vitest";
import type { BountyType, ConversionSource, Plan, PlanFeature } from "@/lib/contract/types";
import {
  CHECKLIST_LABEL,
  CONSTANTS,
  DEFAULT_CPA_RATES,
  DEMO_NOW,
  PLAN_ORDER,
  TIER_ORDER,
  cheapestPlanWith,
  isCpaOnly,
  isPayableSource,
  planFeatures,
  planHasFeature,
  planLabel,
  planPriceCentsMonth,
  planTakeRate,
  rateForKind,
  ratesOf,
  takeRateFor,
  tierPerks,
  tierThresholds,
  trackedOrEstimated,
} from "../constants";
import { ROAS_HORIZONS } from "../funnel";
import { BAND_NAMES, BUDGET_PLAN_LABEL, DEFAULT_FUNNEL } from "../pricing";
import { HOOK_TEXT_PARITY_MIN, MOTION_INTERRUPT_MIN } from "../scoring";

describe("constants (DECISIONS and DOMAIN section 9)", () => {
  it("re-exports the contract's CONSTANTS and the demo clock", () => {
    expect(DEMO_NOW).toBe("2026-10-03T14:00:00Z");
    expect(CONSTANTS.now).toBe(DEMO_NOW);
    expect(CHECKLIST_LABEL).toBe("Checklist score. It gets smarter as bounties settle.");
  });

  it("holds the money defaults from DECISIONS", () => {
    expect(CONSTANTS.pay).toMatchObject({ default_cpm_cents: 200, floor_cpm_cents: 50, default_per_video_cap_cents: 25_000, default_cpa_install_cents: 40, default_cpa_trial_cents: 150, default_cpa_paid_cents: 400, ad_commission_rate: 0.1, ad_commission_days: 60, cpa_window_days: 30 });
    expect(CONSTANTS.fees).toMatchObject({ cpa_only_take_rate: 0.06, ad_spend_fee_rate: 0.01, instant_payout_rate: 0.015, instant_payout_min_cents: 50, instant_payout_max_cents: 1500, matched_first_bounty_cap_cents: 50_000 });
    expect(CONSTANTS.windows).toMatchObject({ view_window_hours: 72, weekly_payout_weekday_utc: 5, weekly_payout_hour_utc: 18, clearing_run_hour_utc: 14 });
    expect(CONSTANTS.review).toMatchObject({ sla_hours: 72, revision_rounds_included: 2, unused_release_days: 30 });
    expect(CONSTANTS.rights).toMatchObject({ paid_ads_default_days: 90, renewal_fee_pct_of_base_per_30d: 0.25, ai_likeness_default: false });
    expect(CONSTANTS.rights.expiry_alert_days).toEqual([30, 14, 7]);
    expect(CONSTANTS.attribution.apple_active_offers_per_sku).toBe(10);
  });

  it("keeps every weighted checklist honest: weights sum to 100 (or 1)", () => {
    const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
    expect(sum(CONSTANTS.scores.hook_checklist.map((i) => i.weight))).toBe(100);
    expect(sum(CONSTANTS.scores.flow_checklist.map((i) => i.weight))).toBe(100);
    expect(sum(Object.values(CONSTANTS.matching.weights))).toBe(100);
    expect(sum(Object.values(CONSTANTS.reliability.creator.weights))).toBeCloseTo(1, 9);
    expect(sum(Object.values(CONSTANTS.reliability.brand.weights))).toBeCloseTo(1, 9);
  });

  it("orders the plans, rates and tier thresholds monotonically", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "scale"]);
    const rates = PLAN_ORDER.map(planTakeRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    const prices = PLAN_ORDER.map(planPriceCentsMonth);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(TIER_ORDER).toEqual(["bronze", "silver", "gold", "platinum", "elite"]);
    for (const key of ["lifetime_cleared_cents", "approved_count", "approval_rate_min", "reliability_min"] as const) {
      const values = TIER_ORDER.map((t) => tierThresholds(t)[key]);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
    const heads = TIER_ORDER.map((t) => tierPerks(t).early_access_hours);
    expect(heads).toEqual([0, 1, 3, 6, 12]);
  });
});

describe("CPA rates", () => {
  it("defaults to $0.40 an install, $1.50 a trial and $4.00 a paid subscriber", () => {
    expect(DEFAULT_CPA_RATES).toEqual({ install: 40, trial: 150, paid: 400 });
  });

  it("reads a rate by kind, and 0 when the bounty does not pay it", () => {
    expect(rateForKind({ install: 40, paid: 400 }, "install")).toBe(40);
    expect(rateForKind({ install: 40, paid: 400 }, "trial")).toBe(0);
    expect(rateForKind({}, "paid")).toBe(0);
  });

  it("pulls the three rates off a bounty-shaped object", () => {
    expect(ratesOf({ cpa_install_cents: 40, cpa_trial_cents: 150, cpa_paid_cents: 400 })).toEqual({ install: 40, trial: 150, paid: 400 });
  });
});

describe("plans and take rates", () => {
  it("knows each plan's rate, price, label and features", () => {
    expect(PLAN_ORDER.map(planTakeRate)).toEqual([0.12, 0.1, 0.08]);
    expect(PLAN_ORDER.map(planPriceCentsMonth)).toEqual([0, 29_900, 99_900]);
    expect(PLAN_ORDER.map(planLabel)).toEqual(["Free", "Pro", "Scale"]);
    expect(PLAN_ORDER.map((p) => planFeatures(p).length)).toEqual([8, 16, 22]);
  });

  it("tells what a plan includes and the cheapest plan with a feature", () => {
    expect(planHasFeature("free", "escrow")).toBe(true);
    expect(planHasFeature("free", "learned_scorer")).toBe(false);
    expect(planHasFeature("pro", "guarded_auto_approve")).toBe(true);
    expect(planHasFeature("pro", "white_label_reports")).toBe(false);
    expect(planHasFeature("scale", "white_label_reports")).toBe(true);
    expect(cheapestPlanWith("escrow")).toBe("free");
    expect(cheapestPlanWith("market_view")).toBe("pro");
    expect(cheapestPlanWith("agency_workspaces")).toBe("scale");
    expect(cheapestPlanWith("not_a_feature" as PlanFeature)).toBeNull();
  });

  it("calls only cpa and install_only bounties CPA-only", () => {
    const only: BountyType[] = ["cpa", "install_only"];
    const rest: BountyType[] = ["cpm", "stacked", "direct"];
    for (const t of only) expect(isCpaOnly(t)).toBe(true);
    for (const t of rest) expect(isCpaOnly(t)).toBe(false);
  });

  it("picks the take rate: waived first bounty, flat 6% for CPA-only, else the plan rate", () => {
    const plans: Plan[] = ["free", "pro", "scale"];
    expect(plans.map((plan) => takeRateFor({ plan, type: "cpm" }))).toEqual([0.12, 0.1, 0.08]);
    expect(plans.map((plan) => takeRateFor({ plan, type: "stacked" }))).toEqual([0.12, 0.1, 0.08]);
    expect(plans.map((plan) => takeRateFor({ plan, type: "direct" }))).toEqual([0.12, 0.1, 0.08]);
    for (const plan of plans) {
      expect(takeRateFor({ plan, type: "cpa" })).toBe(0.06);
      expect(takeRateFor({ plan, type: "install_only" })).toBe(0.06);
      expect(takeRateFor({ plan, type: "cpm", firstBountyWaived: true })).toBe(0);
      expect(takeRateFor({ plan, type: "cpa", firstBountyWaived: true })).toBe(0);
      expect(takeRateFor({ plan, type: "cpm", firstBountyWaived: false })).toBe(planTakeRate(plan));
    }
  });
});

describe("tiers and sources", () => {
  it("reads thresholds and perks", () => {
    expect(tierThresholds("gold")).toMatchObject({ lifetime_cleared_cents: 200_000, approved_count: 25, approval_rate_min: 0.75 });
    expect(tierThresholds("elite")).toMatchObject({ lifetime_cleared_cents: 5_000_000, approved_count: 250, approval_rate_min: 0.85, reliability_min: 95, manual_review: true });
    expect(tierPerks("platinum")).toMatchObject({ early_access_hours: 6, instant_cashout_unlimited: true, auctions: true, featured_profile: false });
    expect(tierPerks("bronze")).toMatchObject({ early_access_hours: 0, rate_card: false });
  });

  it("pays only on link and code; everything else is estimated", () => {
    const sources: ConversionSource[] = ["link", "code", "mmp", "survey", "modelled"];
    expect(sources.map(isPayableSource)).toEqual([true, true, false, false, false]);
    expect(sources.map(trackedOrEstimated)).toEqual(["tracked", "tracked", "estimated", "estimated", "estimated"]);
  });
});

describe("tuning constants that live beside the code that uses them", () => {
  it("states the planner funnel and bands from the contract", () => {
    expect(DEFAULT_FUNNEL).toBe(CONSTANTS.funnel_defaults);
    expect(DEFAULT_FUNNEL).toMatchObject({ view_to_visit: 0.0045, visit_to_install: 0.38, install_to_trial: 0.062, trial_to_paid: 0.348 });
    expect(BAND_NAMES).toEqual(["low", "median", "high"]);
    expect(BUDGET_PLAN_LABEL).toMatch(/^Estimate\./);
  });

  it("states the ROAS horizons and the score thresholds", () => {
    expect(ROAS_HORIZONS).toEqual([7, 14, 30, 60, 90]);
    expect(HOOK_TEXT_PARITY_MIN).toBe(0.6);
    expect(MOTION_INTERRUPT_MIN).toBe(0.35);
  });
});
