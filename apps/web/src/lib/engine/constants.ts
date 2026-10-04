/**
 * Constants and the plan / take-rate helpers.
 *
 * `CONSTANTS` is generated into the contract (packages/contract/schema/constants.mjs, mirrored in docs/DECISIONS.md) and is the
 * single place every number lives. It is re-exported here so engine code imports from one place; never hard-code a rate,
 * threshold or window anywhere else.
 */

import {
  CONSTANTS,
  type BountyType,
  type ConversionKind,
  type ConversionSource,
  type Plan,
  type PlanFeature,
  type Tier,
  type TierPerks,
  type TierThresholds,
} from "@/lib/contract/types";

export { CONSTANTS };

/** The demo world's "now" (2026-10-03T14:00:00Z). Fixtures and the demo UI are relative to it; the engine itself never reads a clock. */
export const DEMO_NOW: string = CONSTANTS.now;

/** The honest label every Hook Score, Flow Score and brief-compliance score carries until a learned model beats the checklist. */
export const CHECKLIST_LABEL: string = CONSTANTS.scores.checklist_label;

/** Plans from cheapest to most expensive. */
export const PLAN_ORDER: readonly Plan[] = ["free", "pro", "scale"];

/** Tiers from lowest to highest. */
export const TIER_ORDER: readonly Tier[] = CONSTANTS.tiers.order;

/** Per-event CPA rates in cents. Missing keys mean "this event is not paid". */
export interface CpaRates {
  install?: number;
  trial?: number;
  paid?: number;
}

/** The defaults a new stacked bounty starts with: $0.40 install, $1.50 trial, $4.00 paid. */
export const DEFAULT_CPA_RATES: Readonly<Required<CpaRates>> = {
  install: CONSTANTS.pay.default_cpa_install_cents,
  trial: CONSTANTS.pay.default_cpa_trial_cents,
  paid: CONSTANTS.pay.default_cpa_paid_cents,
};

/** Rate (cents) for one kind of conversion; 0 when the bounty does not pay it. */
export function rateForKind(rates: CpaRates, kind: ConversionKind): number {
  return rates[kind] ?? 0;
}

/** Pulls the three CPA rates off a bounty-shaped object. */
export function ratesOf(bounty: { cpa_install_cents: number; cpa_trial_cents: number; cpa_paid_cents: number }): Required<CpaRates> {
  return { install: bounty.cpa_install_cents, trial: bounty.cpa_trial_cents, paid: bounty.cpa_paid_cents };
}

/** Plan take rate on bounty, offer and spec spend (Free 12%, Pro 10%, Scale 8%). */
export const planTakeRate = (plan: Plan): number => CONSTANTS.plans[plan].take_rate;

/** Monthly plan price in cents (Free 0, Pro 29,900, Scale 99,900). */
export const planPriceCentsMonth = (plan: Plan): number => CONSTANTS.plans[plan].price_cents_month;

/** Human label of a plan ("Pro"). */
export const planLabel = (plan: Plan): string => CONSTANTS.plans[plan].label;

/** The PlanFeature keys a plan includes. */
export const planFeatures = (plan: Plan): readonly PlanFeature[] => CONSTANTS.plans[plan].features;

/** True when the plan includes a feature (Pro and Scale include the learned scorer, auto-approve, Market view ...). */
export const planHasFeature = (plan: Plan, feature: PlanFeature): boolean => (CONSTANTS.plans[plan].features as readonly string[]).includes(feature);

/** The cheapest plan that includes a feature, or null when no plan does. Powers upgrade nudges. */
export function cheapestPlanWith(feature: PlanFeature): Plan | null {
  for (const plan of PLAN_ORDER) if (planHasFeature(plan, feature)) return plan;
  return null;
}

/** CPA-only bounties (`cpa`) and install-only bounties (`install_only`) pay the flat 6% take rate on cleared conversions. */
export const isCpaOnly = (type: BountyType): boolean => type === "cpa" || type === "install_only";

/**
 * The take rate that applies to a bounty.
 *   first bounty (fee waived): 0
 *   cpa and install_only:      flat 6%, whatever the plan
 *   everything else:           the plan rate (Free 12%, Pro 10%, Scale 8%)
 */
export function takeRateFor(params: { plan: Plan; type: BountyType; firstBountyWaived?: boolean }): number {
  if (params.firstBountyWaived) return 0;
  if (isCpaOnly(params.type)) return CONSTANTS.fees.cpa_only_take_rate;
  return CONSTANTS.plans[params.plan].take_rate;
}

/** What a tier requires. */
export const tierThresholds = (tier: Tier): TierThresholds => CONSTANTS.tiers.thresholds[tier];

/** What a tier unlocks. */
export const tierPerks = (tier: Tier): TierPerks => CONSTANTS.tiers.perks[tier];

/** True for the sources CPA pays on. Only `link` and `code` are deterministic, so only they pay. */
export const isPayableSource = (source: ConversionSource): boolean => (CONSTANTS.attribution.pay_on_sources as readonly string[]).includes(source);

/** "Tracked" (link, code: deterministic, paid) or "Estimated" (MMP, survey, modelled: reported, never paid). */
export const trackedOrEstimated = (source: ConversionSource): "tracked" | "estimated" => (isPayableSource(source) ? "tracked" : "estimated");
