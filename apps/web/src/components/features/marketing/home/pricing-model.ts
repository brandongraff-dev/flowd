import type { Plan, PlanFeature } from "@/lib/contract/types";
import { CONSTANTS, PLAN_ORDER, funding, planBreakEven, planFeatures, planLabel, planPriceCentsMonth, planTakeRate } from "@/lib/engine";

/**
 * The numbers behind the pricing page and the landing calculator, built only from the engine's functions and constants so a quote here is the same
 * quote the product shows when a brand funds a bounty. Money is integer cents everywhere.
 */

export interface PlanQuote {
  plan: Plan;
  label: string;
  takeRate: number;
  /** The monthly plan price. */
  subscriptionCents: number;
  /** The platform fee on the month's creator spend. */
  feeCents: number;
  /** Card processing at cost (2.9% + $0.30 on one top-up). */
  processingCents: number;
  /** Everything the brand pays in the month: creator pay, fee, processing and the plan. */
  totalCents: number;
  /** Fee plus plan: what flowd takes. */
  platformCents: number;
  /** Creator pay per 1,000 verified views (the bounty's CPM). */
  creatorCpmCents: number;
  /** Fee per 1,000 views. */
  feeCpmCents: number;
  processingCpmCents: number;
  planCpmCents: number;
  /** The effective all-in CPM: total / views x 1,000. */
  effectiveCpmCents: number;
  /** Verified views the month's spend buys at that CPM. */
  views: number;
}

export interface PlanQuotes {
  spendCents: number;
  cpmCents: number;
  quotes: PlanQuote[];
  /** The cheapest plan at this spend (ties go to the lower plan). */
  best: Plan;
  savingsVsFreeCents: number;
}

const per1000 = (cents: number, views: number): number => (views > 0 ? Math.round((cents / views) * 1000) : 0);

/** One quote per plan for a month's creator spend at a CPM. One card top-up a month is assumed; each extra top-up adds $0.30. */
export function quotePlans(params: { spendCents: number; cpmCents: number }): PlanQuotes {
  const spendCents = Math.max(0, Math.round(params.spendCents));
  const cpmCents = Math.max(1, Math.round(params.cpmCents));
  const views = Math.round((spendCents / cpmCents) * 1000);

  const quotes = PLAN_ORDER.map((plan): PlanQuote => {
    const takeRate = planTakeRate(plan);
    const f = funding({ budget_cents: spendCents, take_rate: takeRate });
    const subscriptionCents = planPriceCentsMonth(plan);
    const totalCents = f.card_charge_cents + subscriptionCents;
    return {
      plan,
      label: planLabel(plan),
      takeRate,
      subscriptionCents,
      feeCents: f.fee_reserve_cents,
      processingCents: f.processing_cents,
      totalCents,
      platformCents: f.fee_reserve_cents + subscriptionCents,
      creatorCpmCents: cpmCents,
      feeCpmCents: per1000(f.fee_reserve_cents, views),
      processingCpmCents: per1000(f.processing_cents, views),
      planCpmCents: per1000(subscriptionCents, views),
      effectiveCpmCents: per1000(totalCents, views),
      views,
    };
  });

  let best = quotes[0] as PlanQuote;
  for (const quote of quotes) if (quote.platformCents < best.platformCents) best = quote;
  const free = quotes[0] as PlanQuote;
  return { spendCents, cpmCents, quotes, best: best.plan, savingsVsFreeCents: free.platformCents - best.platformCents };
}

/** The monthly spend (cents) above which the second plan is cheaper than the first, from the engine; null when it never is. */
export const breakEven = (from: Plan, to: Plan): number | null => planBreakEven(from, to);

/** Monthly platform cost (fee plus plan, before processing) per plan across a spend range, for the break-even chart. */
export function platformCostCurve(maxSpendCents: number, steps: number): { spendCents: number; costs: Record<Plan, number> }[] {
  const out: { spendCents: number; costs: Record<Plan, number> }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const spendCents = Math.round((maxSpendCents / steps) * i);
    const costs = {} as Record<Plan, number>;
    for (const plan of PLAN_ORDER) costs[plan] = Math.round(spendCents * planTakeRate(plan)) + planPriceCentsMonth(plan);
    out.push({ spendCents, costs });
  }
  return out;
}

const FEATURE_LABEL: Record<PlanFeature, string> = {
  escrow: "Escrow and the Funded badge",
  review_queue: "Keyboard-first review queue",
  funnel: "Install-to-paid funnel and payback",
  creator_discovery: "Creator discovery",
  rights_card: "Rights Card on every bounty",
  free_tools: "Free tools",
  brief_lint: "Brief Lint and Pay Math",
  attribution_kit: "Attribution Kit",
  learned_scorer: "Learned scorer",
  guarded_auto_approve: "Guarded auto-approve",
  market_view: "Market view and price suggestions",
  rights_vault: "Rights Vault with expiry alerts",
  test_planner: "Test planner and fatigue alerts",
  slack: "Slack approvals and digests",
  api: "API, webhooks and MCP",
  winner_promotion: "Winner promotion",
  multi_app: "Multiple apps",
  agency_workspaces: "Agency workspaces",
  roles: "Roles and permissions",
  finance_pack: "Finance pack: invoices and POs",
  slas: "Review service levels",
  white_label_reports: "White-label reports",
};

/** What a plan adds on top of the one below it, in the product's words. */
export function featuresAddedBy(plan: Plan): string[] {
  const index = PLAN_ORDER.indexOf(plan);
  const below = index > 0 ? planFeatures(PLAN_ORDER[index - 1] as Plan) : [];
  return planFeatures(plan)
    .filter((feature) => !below.includes(feature))
    .map((feature) => FEATURE_LABEL[feature]);
}

export const FEES = CONSTANTS.fees;
