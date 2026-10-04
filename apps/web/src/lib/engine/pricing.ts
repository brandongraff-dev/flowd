/**
 * Pricing: what a brand funds, what it really pays, and what a pool buys.
 *
 * Money rules (DOMAIN section 11, formulas "funding", "reservation", "budget"):
 *   fee_reserve  = round(budget x take_rate)          held in escrow with the pool; only the used part is ever taken
 *   escrow_total = budget + fee_reserve               the Funded badge needs escrow_funded >= escrow_total
 *   brand_funded = escrow_total - matched             what the brand wallet puts in (matched = flowd match on a first bounty)
 *   processing   = round(2.9% x brand_funded) + $0.30 passed through at cost, shown in the all-in price
 *   card_charge  = brand_funded + processing
 *   all_in_cpm   = round(card_charge x cpm / budget)  what the brand pays per 1,000 verified views when the pool is fully used
 */

import type { BountyType, ConversionKind, Plan } from "@/lib/contract/types";
import {
  CONSTANTS,
  PLAN_ORDER,
  isCpaOnly,
  planLabel,
  planPriceCentsMonth,
  planTakeRate,
  rateForKind,
  takeRateFor,
  type CpaRates,
} from "./constants";
import { bps, divRound, mulRate } from "./money";

// ── funding ────────────────────────────────────────────────────────────────────────────────────

/** Card processing passed through at cost: round(2.9% x amount) + $0.30. Zero for a zero charge. */
export function cardProcessing(amountCents: number): number {
  return amountCents > 0 ? mulRate(amountCents, CONSTANTS.fees.card_processing_rate) + CONSTANTS.fees.card_processing_fixed_cents : 0;
}

/** The numbers behind "fund this bounty". */
export interface Funding {
  /** The creator-pay pool B. */
  budget_cents: number;
  take_rate: number;
  /** round(budget x take_rate). */
  fee_reserve_cents: number;
  /** budget + fee_reserve: what must sit in escrow for the Funded badge. */
  escrow_total_cents: number;
  /** flowd's match on a first bounty (0 otherwise). */
  matched_cents: number;
  /** escrow_total - matched: what the brand wallet puts in. */
  brand_funded_cents: number;
  processing_cents: number;
  /** brand_funded + processing: the card charge. */
  card_charge_cents: number;
}

/** Escrow funding for a budget (the creator-pay pool) at a take rate. */
export function funding(params: { budget_cents: number; take_rate: number; matched_cents?: number }): Funding {
  const { budget_cents, take_rate, matched_cents = 0 } = params;
  const fee_reserve_cents = mulRate(budget_cents, take_rate);
  const escrow_total_cents = budget_cents + fee_reserve_cents;
  const brand_funded_cents = escrow_total_cents - matched_cents;
  const processing_cents = cardProcessing(brand_funded_cents);
  return {
    budget_cents,
    take_rate,
    fee_reserve_cents,
    escrow_total_cents,
    matched_cents,
    brand_funded_cents,
    processing_cents,
    card_charge_cents: brand_funded_cents + processing_cents,
  };
}

/** The escrow a bounty must hold to be Funded (budget + fee reserve). */
export const escrowTotal = (budget_cents: number, take_rate: number): number => budget_cents + mulRate(budget_cents, take_rate);

/**
 * First bounty: the platform fee is waived and flowd matches dollar for dollar up to $500, on top of what the brand funds.
 * `brand_funds_cents` is what the brand puts in; the pool is that plus the match.
 */
export function firstBountyFunding(params: { brand_funds_cents: number }): Funding {
  const matched_cents = Math.min(CONSTANTS.fees.matched_first_bounty_cap_cents, params.brand_funds_cents);
  return funding({ budget_cents: params.brand_funds_cents + matched_cents, take_rate: 0, matched_cents });
}

/** Funding for a bounty from its plan and type, handling the first-bounty waiver and CPA-only 6% in one call. */
export function fundingFor(params: {
  budget_cents: number;
  plan: Plan;
  type: BountyType;
  /** The brand's first bounty: fee waived (and matched when `brand_funds_cents` is given instead of a pool). */
  first_bounty?: boolean;
  matched_cents?: number;
}): Funding {
  const take_rate = takeRateFor({ plan: params.plan, type: params.type, firstBountyWaived: params.first_bounty });
  return funding({ budget_cents: params.budget_cents, take_rate, matched_cents: params.matched_cents ?? 0 });
}

/** True when escrow covers budget + fee reserve: the Funded badge, and the gate for going live. */
export const isFunded = (params: { escrow_funded_cents: number; budget_cents: number; fee_reserve_cents: number }): boolean =>
  params.escrow_funded_cents >= params.budget_cents + params.fee_reserve_cents;

/** How much more must go into escrow to be Funded ("Needs $X more in escrow"). Never negative. */
export const escrowShortfall = (params: { escrow_funded_cents: number; budget_cents: number; fee_reserve_cents: number }): number =>
  Math.max(0, params.budget_cents + params.fee_reserve_cents - params.escrow_funded_cents);

// ── all-in price ───────────────────────────────────────────────────────────────────────────────

/**
 * Bounty-level all-in CPM: round(card_charge x cpm / budget). What the brand pays per 1,000 verified views when the pool is
 * used in full. Returns 0 when there is no CPM (cpa, install_only, direct) or no budget.
 */
export function allInCpm(params: { cpm_cents: number; budget_cents: number; card_charge_cents: number }): number {
  const { cpm_cents, budget_cents, card_charge_cents } = params;
  return cpm_cents > 0 && budget_cents > 0 ? divRound(card_charge_cents * cpm_cents, budget_cents) : 0;
}

/**
 * All-in price of a flat rate or a CPA event: rate x (1 + take_rate) x (1 + 2.9%), rounded once. The $0.30 fixed card fee is
 * excluded (it amortises over the whole top-up).
 */
export function allInRate(rate_cents: number, take_rate: number): number {
  return divRound(rate_cents * (10_000 + bps(take_rate)) * (10_000 + bps(CONSTANTS.fees.card_processing_rate)), 100_000_000);
}

/** The three parts of an all-in price per 1,000 views (or per event). `total_cents` always equals the sum of the parts. */
export interface AllInBreakdown {
  take_rate: number;
  /** What the creator earns. */
  creator_cents: number;
  /** flowd's take on it. */
  fee_cents: number;
  /** Card processing passed through at cost. */
  processing_cents: number;
  total_cents: number;
}

/**
 * The all-in CPM broken into creator pay, platform fee and processing, so the UI can show every line.
 * At $2.00 CPM the total is $2.30 on Free, $2.26 on Pro and $2.22 on Scale (processing included); the fee line alone is
 * $0.24, $0.20 and $0.16.
 */
export function allInBreakdown(params: { rate_cents: number; plan: Plan; type?: BountyType; first_bounty?: boolean }): AllInBreakdown {
  const take_rate = takeRateFor({ plan: params.plan, type: params.type ?? "cpm", firstBountyWaived: params.first_bounty });
  const creator_cents = params.rate_cents;
  const fee_cents = mulRate(creator_cents, take_rate);
  const total = allInRate(creator_cents, take_rate);
  const processing_cents = Math.max(0, total - creator_cents - fee_cents);
  return { take_rate, creator_cents, fee_cents, processing_cents, total_cents: creator_cents + fee_cents + processing_cents };
}

/**
 * Effective CPM after the fact: (creator pay + platform fee + processing) / verified views x 1,000. Null when no views yet.
 * This is the realised number; `allInCpm` is the planned one.
 */
export function realizedCpm(params: { cost_cents: number; verified_views: number }): number | null {
  return params.verified_views > 0 ? Math.round((params.cost_cents / params.verified_views) * 1000) : null;
}

// ── CPA-only and install-only ──────────────────────────────────────────────────────────────────

/** Conversion counts by kind. */
export type ConversionCounts = Partial<Record<ConversionKind, number>>;

export interface CpaOnlyQuote {
  take_rate: number;
  by_kind: Record<ConversionKind, { quantity: number; rate_cents: number; pay_cents: number; fee_cents: number }>;
  pay_cents: number;
  fee_cents: number;
  brand_cost_cents: number;
}

/**
 * What cleared conversions cost on a CPA-only or install-only bounty. The flat 6% is taken per leg (one leg per kind),
 * only on cleared conversions; there is no CPM and no fee on views.
 */
export function installOnlyFee(params: { conversions: ConversionCounts; rates: CpaRates }): CpaOnlyQuote {
  const take_rate = CONSTANTS.fees.cpa_only_take_rate;
  const kinds: ConversionKind[] = ["install", "trial", "paid"];
  const by_kind = {} as CpaOnlyQuote["by_kind"];
  let pay_cents = 0;
  let fee_cents = 0;
  for (const kind of kinds) {
    const quantity = Math.max(0, params.conversions[kind] ?? 0);
    const rate_cents = rateForKind(params.rates, kind);
    const pay = quantity * rate_cents;
    const fee = mulRate(pay, take_rate);
    by_kind[kind] = { quantity, rate_cents, pay_cents: pay, fee_cents: fee };
    pay_cents += pay;
    fee_cents += fee;
  }
  return { take_rate, by_kind, pay_cents, fee_cents, brand_cost_cents: pay_cents + fee_cents };
}

export interface InstallOnlyPlan {
  funding: Funding;
  /** Installs the pool pays for before it is spent. */
  max_installs: number;
  /** What one paid install costs the brand all-in (rate + 6% + processing). */
  all_in_cost_per_install_cents: number;
  /** The fee taken at the maximum: 6% of the pool, charged only as installs clear. */
  max_fee_cents: number;
}

/** Plan an install-only bounty: how many installs a pool buys and what each costs all-in. Views are free to the brand. */
export function installOnlyPlan(params: { budget_cents: number; install_rate_cents: number }): InstallOnlyPlan {
  const take_rate = CONSTANTS.fees.cpa_only_take_rate;
  const f = funding({ budget_cents: params.budget_cents, take_rate });
  const max_installs = params.install_rate_cents > 0 ? Math.floor(params.budget_cents / params.install_rate_cents) : 0;
  return {
    funding: f,
    max_installs,
    all_in_cost_per_install_cents: allInRate(params.install_rate_cents, take_rate),
    max_fee_cents: f.fee_reserve_cents,
  };
}

// ── plan comparison ────────────────────────────────────────────────────────────────────────────

export interface PlanCost {
  plan: Plan;
  label: string;
  /** Monthly plan price. */
  subscription_cents: number;
  take_rate: number;
  /** Take on the month's spend (rounded once at the month level, a planning figure). */
  fee_cents: number;
  /** subscription + fee. */
  total_cents: number;
  /** total / spend: the true all-in platform cost as a ratio of creator spend. 0 when spend is 0. */
  effective_rate: number;
}

export interface PlanComparison {
  monthly_spend_cents: number;
  plans: PlanCost[];
  /** Cheapest plan for this spend (ties go to the lower plan). */
  best: Plan;
  /** What `best` saves against Free per month (0 when Free is best). */
  savings_vs_free_cents: number;
}

/** Compares Free, Pro and Scale at a monthly bounty spend (creator pool spent on cpm, offers and specs). */
export function comparePlans(params: { monthly_spend_cents: number }): PlanComparison {
  const spend = Math.max(0, params.monthly_spend_cents);
  const plans: PlanCost[] = PLAN_ORDER.map((plan) => {
    const subscription_cents = planPriceCentsMonth(plan);
    const take_rate = planTakeRate(plan);
    const fee_cents = mulRate(spend, take_rate);
    const total_cents = subscription_cents + fee_cents;
    return { plan, label: planLabel(plan), subscription_cents, take_rate, fee_cents, total_cents, effective_rate: spend > 0 ? roundRate4(total_cents / spend) : 0 };
  });
  let best = plans[0];
  for (const p of plans) if (p.total_cents < best.total_cents) best = p;
  const free = plans[0];
  return { monthly_spend_cents: spend, plans, best: best.plan, savings_vs_free_cents: free.total_cents - best.total_cents };
}

/** round to 4 decimals (an effective rate such as 0.1195). */
function roundRate4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/**
 * Monthly spend (cents) above which `to` is cheaper than `from`: (price_to - price_from) / (rate_from - rate_to), rounded up
 * to a whole cent. Free to Pro is $14,950, Free to Scale $24,975, Pro to Scale $35,000. Null when `to` never wins
 * (its rate is not lower).
 */
export function planBreakEven(from: Plan, to: Plan): number | null {
  const dBps = bps(planTakeRate(from)) - bps(planTakeRate(to));
  if (dBps <= 0) return null;
  const dPrice = planPriceCentsMonth(to) - planPriceCentsMonth(from);
  return Math.ceil((dPrice * 10_000) / dBps);
}

// ── Smart Budget planner ───────────────────────────────────────────────────────────────────────

/** Funnel assumptions used to turn views into installs, trials and paid. Defaults come from CONSTANTS.funnel_defaults. */
export interface FunnelAssumptions {
  view_to_visit: number;
  visit_to_install: number;
  install_to_trial: number;
  trial_to_paid: number;
  views_quantile_ratio: { p25: number; median: number; p75: number };
  conversion_band_ratio: { low: number; median: number; high: number };
}

export const DEFAULT_FUNNEL: FunnelAssumptions = CONSTANTS.funnel_defaults;

export type BandName = "low" | "median" | "high";
export const BAND_NAMES: readonly BandName[] = ["low", "median", "high"];

export interface BudgetBand {
  installs: number;
  trials: number;
  paid: number;
  /** card charge per install; null when under one expected install. */
  cost_per_install_cents: number | null;
  /** card charge per trial; null when under one expected trial. */
  cost_per_trial_cents: number | null;
  /** card charge per paid subscriber: the CAC. Null when under one expected paid. */
  cost_per_paid_cents: number | null;
  /** First-payment revenue of the expected paid subscribers. */
  revenue_cents: number;
}

export interface BudgetPlan {
  funding: Funding;
  /** budget / cpm x 1,000. */
  views: number;
  band: Record<BandName, BudgetBand>;
  /** Always shown with the plan: this is a planning range, not a promise. */
  label: string;
}

export const BUDGET_PLAN_LABEL = "Estimate. A planning range from category medians, not a promise.";

/**
 * What a pool buys. Views = budget / cpm x 1,000. Median stage counts follow the funnel (views x 0.45% visits x 38% installs x
 * 6.2% trials x 34.8% paid); the low and high bands multiply every stage by 0.55 and 1.6. Cost per stage divides the card
 * charge (pool + fee + processing, less any match) by the expected count.
 */
export function budgetPlan(params: {
  budget_cents: number;
  take_rate: number;
  cpm_cents: number;
  avg_first_payment_cents: number;
  matched_cents?: number;
  funnel?: FunnelAssumptions;
  /** Override the views the pool buys. Used for CPA-only pools, which do not buy views at a CPM. */
  views?: number;
}): BudgetPlan {
  const { budget_cents, take_rate, cpm_cents, avg_first_payment_cents, matched_cents = 0, funnel = DEFAULT_FUNNEL } = params;
  const f = funding({ budget_cents, take_rate, matched_cents });
  const views = params.views ?? (cpm_cents > 0 ? Math.round((budget_cents / cpm_cents) * 1000) : 0);
  const installsMedian = views * funnel.view_to_visit * funnel.visit_to_install;
  const trialsMedian = installsMedian * funnel.install_to_trial;
  const paidMedian = trialsMedian * funnel.trial_to_paid;
  const per = (units: number): number | null => (units >= 1 ? Math.round(f.card_charge_cents / units) : null);
  const band = {} as Record<BandName, BudgetBand>;
  for (const name of BAND_NAMES) {
    const k = funnel.conversion_band_ratio[name];
    band[name] = {
      installs: Math.round(installsMedian * k),
      trials: Math.round(trialsMedian * k),
      paid: Math.round(paidMedian * k),
      cost_per_install_cents: per(installsMedian * k),
      cost_per_trial_cents: per(trialsMedian * k),
      cost_per_paid_cents: per(paidMedian * k),
      revenue_cents: Math.round(paidMedian * k * avg_first_payment_cents),
    };
  }
  return { funding: f, views, band, label: BUDGET_PLAN_LABEL };
}

export type BudgetGoalKind = "views" | "installs" | "trials" | "paid";

export interface SmartBudgetInput {
  goal: { kind: BudgetGoalKind; count: number };
  cpm_cents: number;
  plan: Plan;
  type?: BountyType;
  /** The brand's first bounty: fee waived and a match up to $500 on top. */
  first_bounty?: boolean;
  avg_first_payment_cents: number;
  /** CPA bonuses on a stacked bounty add to the pool cost per view. */
  rates?: CpaRates;
  /** Median verified views per post in the category; turns views into a number of posts. */
  median_views_per_post?: number;
  funnel?: FunnelAssumptions;
}

export interface SmartBudgetScenario {
  /** Pool (creator pay) needed, rounded up to the next $50 and never under the $100 minimum. */
  budget_cents: number;
  funding: Funding;
  plan: BudgetPlan;
  /** What the goal costs all-in per unit at this scenario's conversion band (card charge / goal count). */
  all_in_cost_per_goal_cents: number | null;
}

export interface SmartBudgetResult {
  goal: { kind: BudgetGoalKind; count: number };
  /** Plan on median conversion: the number to show first. */
  recommended: SmartBudgetScenario;
  /** Plan on low conversion (0.55x): the safe number. */
  conservative: SmartBudgetScenario;
  /** Plan on high conversion (1.6x). */
  optimistic: SmartBudgetScenario;
  /** Views the recommended pool buys. */
  views: number;
  /** Posts needed to deliver those views at the category median (null without `median_views_per_post`). */
  posts_needed: number | null;
  warnings: string[];
  label: string;
}

const BUDGET_STEP_CENTS = 5_000;

/** Rounds up to the next $50. The epsilon keeps float noise (40000.000000001) from bumping an exact amount up a whole step. */
const ceilToStep = (cents: number, step = BUDGET_STEP_CENTS): number => Math.ceil(cents / step - 1e-9) * step;

/** Funnel yield per verified view for a goal at a conversion multiplier k. */
function goalPerView(kind: BudgetGoalKind, funnel: FunnelAssumptions, k: number): number {
  if (kind === "views") return 1;
  const installs = funnel.view_to_visit * funnel.visit_to_install * k;
  if (kind === "installs") return installs;
  const trials = installs * funnel.install_to_trial;
  if (kind === "trials") return trials;
  return trials * funnel.trial_to_paid;
}

/**
 * Smart Budget: the pool a brand needs to hit a goal (views, installs, trials or paid subscribers).
 *
 * Views needed = goal / (goal yield per view x k). Pool = views x (CPM per view + CPA bonuses per view). CPA-only bounties
 * have no CPM, so the pool is just the events they pay for. Three scenarios (conversion at 0.55x, 1x, 1.6x) so the brand sees a
 * safe number, an expected number and an optimistic number. Always an estimate.
 */
export function smartBudget(input: SmartBudgetInput): SmartBudgetResult {
  const funnel = input.funnel ?? DEFAULT_FUNNEL;
  const type = input.type ?? "cpm";
  const rates = input.rates ?? {};
  const count = Math.max(0, input.goal.count);
  const warnings: string[] = [];
  const takeRate = takeRateFor({ plan: input.plan, type, firstBountyWaived: input.first_bounty });
  const cpaOnly = isCpaOnly(type);
  const cpmPerView = cpaOnly ? 0 : input.cpm_cents / 1000;

  const scenario = (name: BandName): SmartBudgetScenario => {
    const k = funnel.conversion_band_ratio[name];
    const installsPv = funnel.view_to_visit * funnel.visit_to_install * k;
    const trialsPv = installsPv * funnel.install_to_trial;
    const paidPv = trialsPv * funnel.trial_to_paid;
    const costPerView = cpmPerView + installsPv * rateForKind(rates, "install") + trialsPv * rateForKind(rates, "trial") + paidPv * rateForKind(rates, "paid");
    const yieldPv = goalPerView(input.goal.kind, funnel, k);
    const viewsNeeded = yieldPv > 0 ? count / yieldPv : 0;
    const budget_cents = ceilToStep(Math.max(CONSTANTS.pay.min_bounty_budget_cents, Math.ceil(viewsNeeded * costPerView - 1e-6)));
    // First bounty: the brand funds F, flowd matches min($500, F), and the pool is F + match. A pool P is therefore matched by
    // min($500, floor(P / 2)).
    const matched_cents = input.first_bounty ? Math.min(CONSTANTS.fees.matched_first_bounty_cap_cents, Math.floor(budget_cents / 2)) : 0;
    const plan = budgetPlan({
      budget_cents,
      take_rate: takeRate,
      cpm_cents: cpaOnly ? 0 : input.cpm_cents,
      avg_first_payment_cents: input.avg_first_payment_cents,
      matched_cents,
      funnel,
      views: cpaOnly ? Math.round(viewsNeeded) : undefined,
    });
    return {
      budget_cents,
      funding: plan.funding,
      plan,
      all_in_cost_per_goal_cents: count > 0 ? Math.round(plan.funding.card_charge_cents / count) : null,
    };
  };

  const recommended = scenario("median");
  const conservative = scenario("low");
  const optimistic = scenario("high");
  const views = recommended.plan.views;
  const posts_needed = input.median_views_per_post && input.median_views_per_post > 0 ? Math.max(1, Math.ceil(views / input.median_views_per_post)) : null;

  if (count === 0) warnings.push("Set a goal above zero to size a pool.");
  if (conservative.budget_cents > recommended.budget_cents * 2) warnings.push("The safe pool is more than twice the expected pool: small samples swing a lot. Start smaller and top up.");
  if (cpaOnly) warnings.push("CPA-only pools stop paying when the pool is spent, so the views shown are the views the goal implies.");
  if (!cpaOnly && input.cpm_cents > 0 && input.cpm_cents < CONSTANTS.pay.floor_cpm_cents) warnings.push("CPM is under the $0.50 floor: Brief Lint will block it.");
  return { goal: { kind: input.goal.kind, count }, recommended, conservative, optimistic, views, posts_needed, warnings, label: BUDGET_PLAN_LABEL };
}

/**
 * The highest CPM that still hits a target cost per trial (all-in, on median conversion).
 *   cost per trial = all-in cost per view / trials per view
 * Returns 0 when the target cannot be met even at a zero CPM (the CPA bonuses alone cost more than the target).
 */
export function maxCpmForCostPerTrial(params: {
  target_cost_per_trial_cents: number;
  plan: Plan;
  first_bounty?: boolean;
  rates?: CpaRates;
  funnel?: FunnelAssumptions;
}): number {
  const funnel = params.funnel ?? DEFAULT_FUNNEL;
  const take = takeRateFor({ plan: params.plan, type: "cpm", firstBountyWaived: params.first_bounty });
  const rates = params.rates ?? {};
  const installsPv = funnel.view_to_visit * funnel.visit_to_install;
  const trialsPv = installsPv * funnel.install_to_trial;
  const paidPv = trialsPv * funnel.trial_to_paid;
  const cpaPerView = installsPv * rateForKind(rates, "install") + trialsPv * rateForKind(rates, "trial") + paidPv * rateForKind(rates, "paid");
  const multiplier = (1 + take) * (1 + CONSTANTS.fees.card_processing_rate);
  const allowedPoolPerView = (params.target_cost_per_trial_cents * trialsPv) / multiplier;
  const cpm = (allowedPoolPerView - cpaPerView) * 1000;
  return cpm > 0 ? Math.floor(cpm) : 0;
}

