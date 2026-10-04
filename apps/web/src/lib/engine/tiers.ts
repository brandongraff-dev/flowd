/**
 * Tiers: Bronze, Silver, Gold, Platinum, Elite. Earned, shown everywhere, never bought.
 *
 * A creator holds the highest tier whose thresholds are ALL met: lifetime cleared, approved posts, approval rate (approved / finished),
 * reliability (Platinum and up) and a manual review (Elite). Progress to the next tier is the bottleneck: the lowest
 * min(1, have / need) over the numeric criteria. There is no tier drop for 30 days after a dip (grace hold), and pausing preserves tier.
 */

import type { CarryOver, IsoTimestamp, Tier, TierBasis, TierCriterion, TierEventKind, TierPerks, TierProgress } from "@/lib/contract/types";
import { CONSTANTS, TIER_ORDER, tierPerks, tierThresholds } from "./constants";
import { formatMoney, formatPercent } from "./money";
import { clamp, round2 } from "./stats";
import { addHours, toMs } from "./time";

/** What the thresholds read about a creator. */
export interface TierStats {
  lifetime_cleared_cents: number;
  approved_count: number;
  /** approved / finished, 0 to 1. See `approvalRate`. */
  approval_rate: number;
  reliability_score: number;
  /** Elite needs a manual review by flowd on top of the numbers. */
  elite_reviewed?: boolean;
}

/** Position of a tier, 0 (bronze) to 4 (elite). */
export const tierRank = (tier: Tier): number => TIER_ORDER.indexOf(tier);

/** True when `tier` is at least `min`. */
export const tierAtLeast = (tier: Tier, min: Tier): boolean => tierRank(tier) >= tierRank(min);

/** The tier above, or null at Elite. */
export const nextTier = (tier: Tier): Tier | null => TIER_ORDER[tierRank(tier) + 1] ?? null;

/** The tier below, or null at Bronze. */
export const previousTier = (tier: Tier): Tier | null => (tierRank(tier) > 0 ? TIER_ORDER[tierRank(tier) - 1] : null);

/** approved / decided (finished work only: approved + rejected; withdrawn and expired excluded), rounded to 2 decimals. 0 with nothing decided. */
export const approvalRate = (approved: number, decided: number): number => (decided > 0 ? Math.round((approved / decided) * 100) / 100 : 0);

/** True when every threshold of `tier` is met. */
export function meetsTier(tier: Tier, s: TierStats): boolean {
  const t = tierThresholds(tier);
  return (
    s.lifetime_cleared_cents >= t.lifetime_cleared_cents &&
    s.approved_count >= t.approved_count &&
    s.approval_rate >= t.approval_rate_min &&
    s.reliability_score >= t.reliability_min &&
    (!t.manual_review || s.elite_reviewed === true)
  );
}

/** The highest tier whose thresholds are all met. */
export function tierFor(s: TierStats): Tier {
  let best: Tier = "bronze";
  for (const tier of TIER_ORDER) if (meetsTier(tier, s)) best = tier;
  return best;
}

/**
 * Founding creators' verified prior history counts toward the thresholds: carry-over cleared money and approved and decided counts are
 * added to what the ledger shows. Approval rate is recomputed on the combined finished work.
 */
export function withCarryOver(
  ledger: { lifetime_cleared_cents: number; approved_count: number; decided_count: number; reliability_score: number; elite_reviewed?: boolean },
  carry?: Pick<CarryOver, "cleared_cents" | "approved_count" | "decided_count">,
): TierStats {
  const approved = ledger.approved_count + (carry?.approved_count ?? 0);
  const decided = ledger.decided_count + (carry?.decided_count ?? 0);
  return {
    lifetime_cleared_cents: ledger.lifetime_cleared_cents + (carry?.cleared_cents ?? 0),
    approved_count: approved,
    approval_rate: approvalRate(approved, decided),
    reliability_score: ledger.reliability_score,
    elite_reviewed: ledger.elite_reviewed,
  };
}

/**
 * Progress toward the next tier: every criterion with have / need, and progress = the bottleneck (the lowest min(1, have/need) over the
 * numeric criteria, rounded to 2 decimals). At Elite, progress is 1 and there are no criteria.
 */
export function tierProgress(s: TierStats, current: Tier = tierFor(s)): TierProgress {
  const next = nextTier(current);
  if (!next) return { current, criteria: [], progress: 1 };
  const t = tierThresholds(next);
  const criteria: TierCriterion[] = [
    { key: "lifetime_cleared", label: "Lifetime cleared", have: s.lifetime_cleared_cents, need: t.lifetime_cleared_cents, met: s.lifetime_cleared_cents >= t.lifetime_cleared_cents },
    { key: "approved", label: "Approved posts", have: s.approved_count, need: t.approved_count, met: s.approved_count >= t.approved_count },
    { key: "approval_rate", label: "Approval rate", have: s.approval_rate, need: t.approval_rate_min, met: s.approval_rate >= t.approval_rate_min },
  ];
  if (t.reliability_min > 0) criteria.push({ key: "reliability", label: "Reliability", have: s.reliability_score, need: t.reliability_min, met: s.reliability_score >= t.reliability_min });
  if (t.manual_review) criteria.push({ key: "review", label: "Manual review", have: s.elite_reviewed ? 1 : 0, need: 1, met: s.elite_reviewed === true });
  const numeric = criteria.filter((c) => c.key !== "review");
  const progress = round2(Math.min(...numeric.map((c) => clamp(c.have / c.need, 0, 1))));
  return { current, next, criteria, progress };
}

export interface Remaining {
  key: string;
  label: string;
  have: number;
  need: number;
  met: boolean;
  /** How much is left, in the criterion's own unit (cents, posts, ratio points, score points, 0 or 1 for the review). 0 when met. */
  remaining: number;
  /** "$360.00 more cleared", "4 more approved posts", "Approval rate 75% (you: 70%)". Empty when met. */
  text: string;
}

/** What is missing for the next tier, in words: the progress ring's list. Met criteria are included with empty text. */
export function remainingToNext(s: TierStats, current: Tier = tierFor(s)): Remaining[] {
  return tierProgress(s, current).criteria.map((c) => {
    const remaining = c.met ? 0 : c.key === "approval_rate" ? round2(c.need - c.have) : c.need - c.have;
    let text = "";
    if (!c.met) {
      switch (c.key) {
        case "lifetime_cleared":
          text = `${formatMoney(remaining)} more cleared`;
          break;
        case "approved":
          text = `${remaining} more approved post${remaining === 1 ? "" : "s"}`;
          break;
        case "approval_rate":
          text = `Approval rate ${formatPercent(c.need, 0)} (you: ${formatPercent(c.have, 0)})`;
          break;
        case "reliability":
          text = `Reliability ${c.need} (you: ${c.have})`;
          break;
        default:
          text = "A short manual review by flowd";
      }
    }
    return { key: c.key, label: c.label, have: c.have, need: c.need, met: c.met, remaining, text };
  });
}

// ── perks ──────────────────────────────────────────────────────────────────────────────────────

/** The perks of a tier in plain English, one line each. Only the perks the tier actually has. */
export function perkLines(tier: Tier): string[] {
  const p: TierPerks = tierPerks(tier);
  const out: string[] = [];
  if (p.early_access_hours > 0) out.push(`${p.early_access_hours}-hour head start on new bounties`);
  if (p.rate_card) out.push("Your own rate card");
  if (p.instant_cashout_unlimited) out.push("Unlimited free instant cash-outs");
  else if (p.instant_cashout_free_per_week > 0) out.push(`${p.instant_cashout_free_per_week} free instant cash-out a week`);
  if (p.crews_lead) out.push("Lead a crew");
  if (p.auctions) out.push("Run sealed-bid auctions");
  if (p.featured_profile) out.push("Featured on the creator directory");
  return out;
}

/** What a creator gains by reaching the next tier: the lines that are new or better. Empty at Elite. */
export function whatUnlocksNext(current: Tier): string[] {
  const next = nextTier(current);
  if (!next) return [];
  const a = tierPerks(current);
  const b = tierPerks(next);
  const out: string[] = [];
  if (b.early_access_hours > a.early_access_hours) out.push(a.early_access_hours > 0 ? `Head start grows from ${a.early_access_hours} h to ${b.early_access_hours} h` : `${b.early_access_hours}-hour head start on new bounties`);
  if (b.rate_card && !a.rate_card) out.push("Your own rate card");
  if (b.instant_cashout_unlimited && !a.instant_cashout_unlimited) out.push("Unlimited free instant cash-outs");
  else if (b.instant_cashout_free_per_week > a.instant_cashout_free_per_week) out.push(`${b.instant_cashout_free_per_week} free instant cash-out a week`);
  if (b.crews_lead && !a.crews_lead) out.push("Lead a crew");
  if (b.auctions && !a.auctions) out.push("Run sealed-bid auctions");
  if (b.featured_profile && !a.featured_profile) out.push("Featured on the creator directory");
  return out;
}

/** When a tier first sees a bounty that goes live at `releaseAt`: release minus the tier's head start. Bronze sees it at release. */
export function earlyAccessAt(releaseAt: IsoTimestamp, tier: Tier): IsoTimestamp {
  return addHours(releaseAt, -tierPerks(tier).early_access_hours);
}

/** True when a creator of `tier` can already see a bounty released at `releaseAt`. */
export const canSeeBounty = (params: { release_at: IsoTimestamp; tier: Tier; now: IsoTimestamp }): boolean => toMs(params.now) >= toMs(earlyAccessAt(params.release_at, params.tier));

// ── grace: no tier drop for 30 days after a dip ────────────────────────────────────────────────

export interface TierEvaluation {
  tier: Tier;
  tier_basis: TierBasis;
  /** Set during a grace hold: no tier drop before this. */
  tier_hold_until?: IsoTimestamp;
  /** When the dip started (kept so the hold can be recomputed). Set during a hold. */
  dip_started_at?: IsoTimestamp;
  /** What changed since the last evaluation, for the tier history and notifications. */
  event: TierEventKind | null;
  /** The tier the numbers support right now. */
  computed_tier: Tier;
}

/**
 * Re-evaluates a creator's tier.
 *  - The numbers support the held tier or higher: the creator holds the earned tier (event `promoted` when higher, `hold_cleared` when
 *    they recovered during a grace hold).
 *  - The numbers dipped below the held tier: a 30-day grace hold starts (event `hold_started`); the held tier is kept until
 *    `tier_hold_until`. After the hold, the tier drops to what the numbers support (event `demoted`).
 *  - A paused creator keeps their tier untouched.
 */
export function evaluateTier(p: {
  stats: TierStats;
  held_tier: Tier;
  held_basis?: TierBasis;
  /** Set while a grace hold is running. */
  dip_started_at?: IsoTimestamp;
  now: IsoTimestamp;
  paused?: boolean;
}): TierEvaluation {
  const computed = tierFor(p.stats);
  const held = p.held_tier;
  if (p.paused) return { tier: held, tier_basis: p.held_basis ?? "earned", event: null, computed_tier: computed, ...(p.dip_started_at ? { dip_started_at: p.dip_started_at, tier_hold_until: addHours(p.dip_started_at, CONSTANTS.tiers.demotion_grace_days * 24) } : {}) };
  if (tierRank(computed) >= tierRank(held)) {
    const event: TierEventKind | null = tierRank(computed) > tierRank(held) ? "promoted" : p.held_basis === "grace_hold" ? "hold_cleared" : null;
    return { tier: computed, tier_basis: "earned", event, computed_tier: computed };
  }
  const dipStart = p.dip_started_at ?? p.now;
  const holdUntil = addHours(dipStart, CONSTANTS.tiers.demotion_grace_days * 24);
  if (toMs(p.now) < toMs(holdUntil)) {
    return { tier: held, tier_basis: "grace_hold", tier_hold_until: holdUntil, dip_started_at: dipStart, event: p.held_basis === "grace_hold" ? null : "hold_started", computed_tier: computed };
  }
  return { tier: computed, tier_basis: "earned", event: "demoted", computed_tier: computed };
}

/** The reference form of the grace rule: a creator whose computed tier is below their held tier keeps it until dip start + 30 days. */
export function tierWithGrace(p: { held_tier: Tier; computed_tier: Tier; dip_started_at: IsoTimestamp; now: IsoTimestamp }): { tier: Tier; tier_basis: TierBasis; tier_hold_until?: IsoTimestamp } {
  if (tierRank(p.computed_tier) >= tierRank(p.held_tier)) return { tier: p.computed_tier, tier_basis: "earned" };
  const holdUntil = addHours(p.dip_started_at, CONSTANTS.tiers.demotion_grace_days * 24);
  return toMs(p.now) < toMs(holdUntil) ? { tier: p.held_tier, tier_basis: "grace_hold", tier_hold_until: holdUntil } : { tier: p.computed_tier, tier_basis: "earned" };
}

/** Days left in a grace hold, rounded up. 0 once it has ended. */
export const graceDaysLeft = (holdUntil: IsoTimestamp, now: IsoTimestamp): number => Math.max(0, Math.ceil((toMs(holdUntil) - toMs(now)) / 86_400_000));
