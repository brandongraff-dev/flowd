/**
 * Referrals: single level, time-limited and funded by flowd. The person referred is never charged.
 *
 * Creators earn 5% of a referee's cleared earnings for 90 days after the referee's first dollar, capped at $100 per referee. Agency and consultant
 * partners earn 10% of the platform fees of brands they referred for 12 months. No chance-based rewards, no second level. The ranked waitlist moves
 * a person up when friends they invited join.
 */

import type { IsoTimestamp, ReferralStatus } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { mulRate } from "./money";
import { hashString } from "./rng";
import { addDays, addMonths, toMs } from "./time";

// ── creator referral reward ────────────────────────────────────────────────────────────────────

export interface ReferralEarning {
  /** When the referee's earning cleared. */
  cleared_at: IsoTimestamp;
  amount_cents: number;
}

export interface CreatorReferralReward {
  /** The 90 days after the referee's first dollar. Absent until they have one. */
  window_ends_at?: IsoTimestamp;
  /** What the referrer has earned in total, inside the cap. */
  earned_cents: number;
  cap_cents: number;
  remaining_cap_cents: number;
  /** The reward on each qualifying earning, oldest first (rounded half up per earning, and trimmed to fit the cap). */
  per_earning: { cleared_at: IsoTimestamp; amount_cents: number; reward_cents: number }[];
  /** Earnings that fell outside the window and so earn nothing. */
  outside_window: number;
}

/**
 * The referrer's reward on one referee: 5% of each cleared earning inside the 90 days after the referee's first dollar, until the $100 cap is reached.
 * Paid by flowd from the promo treasury (ledger type `referral`); the referee's own earnings are untouched.
 */
export function creatorReferralReward(p: { earnings: readonly ReferralEarning[]; first_dollar_at?: IsoTimestamp }): CreatorReferralReward {
  const R = CONSTANTS.referrals;
  const cap = R.creator_share_cap_per_referee_cents;
  if (!p.first_dollar_at) return { earned_cents: 0, cap_cents: cap, remaining_cap_cents: cap, per_earning: [], outside_window: 0 };
  const windowEnds = addDays(p.first_dollar_at, R.creator_share_days);
  const sorted = [...p.earnings].sort((a, b) => toMs(a.cleared_at) - toMs(b.cleared_at));
  let earned = 0;
  let outside = 0;
  const per: CreatorReferralReward["per_earning"] = [];
  for (const e of sorted) {
    if (toMs(e.cleared_at) < toMs(p.first_dollar_at) || toMs(e.cleared_at) > toMs(windowEnds)) {
      outside += 1;
      continue;
    }
    const reward = Math.min(mulRate(e.amount_cents, R.creator_share_rate), cap - earned);
    earned += reward;
    per.push({ cleared_at: e.cleared_at, amount_cents: e.amount_cents, reward_cents: reward });
  }
  return { window_ends_at: windowEnds, earned_cents: earned, cap_cents: cap, remaining_cap_cents: cap - earned, per_earning: per, outside_window: outside };
}

// ── agency and consultant partners ─────────────────────────────────────────────────────────────

export interface PartnerShare {
  window_ends_at: IsoTimestamp;
  earned_cents: number;
  per_fee: { at: IsoTimestamp; fee_cents: number; share_cents: number }[];
}

/**
 * A partner's share: 10% of the platform fees a referred brand pays for 12 months from the brand's first fee. Fees outside the window earn nothing.
 * Funded out of flowd's own fee, never charged to the brand.
 */
export function brandPartnerShare(p: { fees: readonly { at: IsoTimestamp; fee_cents: number }[]; started_at: IsoTimestamp }): PartnerShare {
  const R = CONSTANTS.referrals;
  const windowEnds = addMonths(p.started_at, R.brand_partner_share_months);
  const per: PartnerShare["per_fee"] = [];
  let earned = 0;
  for (const f of [...p.fees].sort((a, b) => toMs(a.at) - toMs(b.at))) {
    if (toMs(f.at) < toMs(p.started_at) || toMs(f.at) > toMs(windowEnds)) continue;
    const share = mulRate(f.fee_cents, R.brand_partner_share_rate);
    earned += share;
    per.push({ at: f.at, fee_cents: f.fee_cents, share_cents: share });
  }
  return { window_ends_at: windowEnds, earned_cents: earned, per_fee: per };
}

// ── status and codes ───────────────────────────────────────────────────────────────────────────

/** A referral invite that has not been accepted lapses after this many days. */
export const INVITE_EXPIRY_DAYS = 30;

/**
 * Where a referral stands: invited (waiting, or expired after 30 days), joined, first_dollar (the referee earned their first dollar), earning (the
 * reward window is running), complete (the window ended).
 */
export function referralStatus(p: { invited_at: IsoTimestamp; joined_at?: IsoTimestamp; first_dollar_at?: IsoTimestamp; reward_window_ends_at?: IsoTimestamp; reward_earned_cents?: number; now: IsoTimestamp }): ReferralStatus {
  if (!p.joined_at) return toMs(p.now) > toMs(addDays(p.invited_at, INVITE_EXPIRY_DAYS)) ? "expired" : "invited";
  if (!p.first_dollar_at) return "joined";
  if (p.reward_window_ends_at && toMs(p.now) > toMs(p.reward_window_ends_at)) return "complete";
  return (p.reward_earned_cents ?? 0) > 0 ? "earning" : "first_dollar";
}

/** "MAYA6": the first name in capitals (at most 6 letters) and a digit, unique within `taken`. Deterministic for a given name and taken set. */
export function makeReferralCode(name: string, taken: ReadonlySet<string> = new Set()): string {
  const base = (name.trim().split(/\s+/)[0] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "FLOWD";
  const start = (hashString(base) % 9) + 1;
  for (let i = 0; i < 9; i += 1) {
    const code = `${base}${((start - 1 + i) % 9) + 1}`;
    if (!taken.has(code)) return code;
  }
  for (let n = 10; ; n += 1) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

/** The share link for a referral code. */
export const referralLink = (code: string): string => `${CONSTANTS.world.public_domain}/waitlist?ref=${code}`;

/** True when someone is trying to refer themselves (the same id). Self-referrals earn nothing. */
export const isSelfReferral = (p: { referrer_id: string; referee_id: string }): boolean => p.referrer_id === p.referee_id;

// ── ranked waitlist ────────────────────────────────────────────────────────────────────────────

/** Each accepted invite moves a waitlist member up this many places. */
export const WAITLIST_JUMP_PER_INVITE = 25;

export interface WaitlistEntry {
  id: string;
  /** 1-based order in which the person joined. */
  join_order: number;
  /** Friends who accepted their invite. */
  accepted_invites: number;
}

/** A member's effective position: join order less 25 places per accepted invite, never above 1. */
export const waitlistPosition = (e: Pick<WaitlistEntry, "join_order" | "accepted_invites">): number => Math.max(1, e.join_order - WAITLIST_JUMP_PER_INVITE * e.accepted_invites);

/**
 * The ranked waitlist: members ordered by effective position, ties by who joined first. Ranks are 1..n without gaps, so the position a member sees
 * is always real. Perks are position-based and never chance-based.
 */
export function rankWaitlist(entries: readonly WaitlistEntry[]): { id: string; rank: number; effective_position: number; accepted_invites: number }[] {
  return [...entries]
    .map((e) => ({ id: e.id, join_order: e.join_order, effective_position: e.join_order - WAITLIST_JUMP_PER_INVITE * e.accepted_invites, accepted_invites: e.accepted_invites }))
    .sort((a, b) => a.effective_position - b.effective_position || a.join_order - b.join_order)
    .map((e, i) => ({ id: e.id, rank: i + 1, effective_position: Math.max(1, e.effective_position), accepted_invites: e.accepted_invites }));
}
