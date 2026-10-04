/**
 * Settlement: how a post turns into money, and how a bounty's escrow is reserved, spent and refunded.
 *
 *  - Stacked pay (CPM first, then CPA until the per-video cap), fee per ledger leg.
 *  - Ledger postings for the CPM leg and every cleared CPA batch (DOMAIN section 10).
 *  - Reserved Slot: one reservation unit (cap + fee on the cap) is held from the pool on submit and replaced by the actual pay + fee
 *    on settlement. Approved posts are paid even if the pool later empties.
 *  - The escrow identity: escrow_funded = reserved + spent + remaining + refunded, all non-negative.
 *
 * Pure functions only: ids and timestamps come in, legs and new states come out.
 */

import type { BountyId, BrandId, ConversionId, ConversionKind, ConversionSource, ConversionStatus, CreatorId, IsoDate, IsoTimestamp, PostId, SubmissionId } from "@/lib/contract/types";
import { CONSTANTS, isPayableSource, rateForKind, type CpaRates } from "./constants";
import { DAY_MS, toMs } from "./time";
import {
  escrowRefundTxn,
  settlementTxn,
  type FundingSource,
  type LedgerTxn,
  type TxnIdFactory,
} from "./ledger";
import { formatInt, formatPercent, mulRate } from "./money";
import type { ConversionCounts } from "./pricing";

// ── stacked pay (pure math) ────────────────────────────────────────────────────────────────────

export interface PostSettlement {
  /** round(window_views x cpm / 1000) before the cap. */
  cpm_uncapped_cents: number;
  /** installs x r_i + trials x r_t + paid x r_p before the cap. */
  cpa_uncapped_cents: number;
  cpm_pay_cents: number;
  cpa_pay_cents: number;
  /** Pool pay: cpm_pay + cpa_pay, never above the per-video cap. */
  pay_cents: number;
  /** True when the cap stopped some pay. Anything above the cap is unpaid. */
  capped: boolean;
  cap_remaining_cents: number;
  fee_cpm_cents: number;
  fee_cpa_cents: number;
  fee_cents: number;
  /** pay + fees. */
  brand_cost_cents: number;
}

/**
 * Pool pay for one post. CPM leg first, then CPA legs, both inside the per-video cap.
 *   cpm_pay = min(round(window_views x cpm / 1000), cap_left)
 *   cpa_pay = min(installs x r_i + trials x r_t + paid x r_p, cap_left - cpm_pay)   (payable conversions only: link and code)
 *   fee     = round(cpm_pay x take_rate) + round(cpa_pay x take_rate)               (per ledger leg)
 *   brand_cost = pay + fee.  Ad commission and flat fees sit outside the cap.
 * `already_paid_cents` is pool pay already settled on this post (an earlier CPM leg, earlier CPA batches).
 */
export function settlePost(params: {
  window_views: number;
  cpm_cents: number;
  conversions?: ConversionCounts;
  rates?: CpaRates;
  per_video_cap_cents: number;
  take_rate: number;
  already_paid_cents?: number;
}): PostSettlement {
  const { window_views, cpm_cents, conversions = {}, rates = {}, per_video_cap_cents, take_rate, already_paid_cents = 0 } = params;
  const capLeft = Math.max(0, per_video_cap_cents - already_paid_cents);
  const cpmUncapped = Math.round((window_views * cpm_cents) / 1000);
  const cpaUncapped = (conversions.install ?? 0) * (rates.install ?? 0) + (conversions.trial ?? 0) * (rates.trial ?? 0) + (conversions.paid ?? 0) * (rates.paid ?? 0);
  const cpmPay = Math.min(cpmUncapped, capLeft);
  const cpaPay = Math.min(cpaUncapped, capLeft - cpmPay);
  const pay = cpmPay + cpaPay;
  const feeCpm = mulRate(cpmPay, take_rate);
  const feeCpa = mulRate(cpaPay, take_rate);
  return {
    cpm_uncapped_cents: cpmUncapped,
    cpa_uncapped_cents: cpaUncapped,
    cpm_pay_cents: cpmPay,
    cpa_pay_cents: cpaPay,
    pay_cents: pay,
    capped: cpmUncapped + cpaUncapped > capLeft,
    cap_remaining_cents: capLeft - pay,
    fee_cpm_cents: feeCpm,
    fee_cpa_cents: feeCpa,
    fee_cents: feeCpm + feeCpa,
    brand_cost_cents: pay + feeCpm + feeCpa,
  };
}

/** The most the brand can be charged for one post: the cap plus the fee on it (one reservation unit). */
export const maxBrandCostPerPost = (per_video_cap_cents: number, take_rate: number): number => per_video_cap_cents + mulRate(per_video_cap_cents, take_rate);

// ── conversion batches ─────────────────────────────────────────────────────────────────────────

/** A batch of identical funnel events: (post, kind, source, UTC day). CPA is paid only when it is a cleared link or code batch. */
export interface ConversionBatchInput {
  id: ConversionId;
  kind: ConversionKind;
  source: ConversionSource;
  quantity: number;
  status: ConversionStatus;
  occurred_on?: IsoDate;
}

export type SkipReason = "estimated_not_paid" | "still_clearing" | "rejected" | "refunded" | "no_rate" | "empty";

const SKIP_TEXT: Record<SkipReason, string> = {
  estimated_not_paid: "Estimated conversions (MMP, survey, modelled) are reported but never paid. Only tracked link and code conversions pay.",
  still_clearing: "Still inside its clearing window (install 24 h, trial 72 h, paid 168 h).",
  rejected: "Rejected, so not paid.",
  refunded: "Refunded, so not paid.",
  no_rate: "This bounty does not pay this kind of conversion.",
  empty: "No conversions in this batch.",
};

export const skipReasonText = (reason: SkipReason): string => SKIP_TEXT[reason];

export interface SkippedBatch {
  conversion_id: ConversionId;
  reason: SkipReason;
}

/** Why a batch is not payable, or null when it is. Source first, then status, then rate. */
export function batchSkipReason(batch: ConversionBatchInput, rates: CpaRates): SkipReason | null {
  if (batch.quantity < 1) return "empty";
  if (!isPayableSource(batch.source)) return "estimated_not_paid";
  if (batch.status === "rejected") return "rejected";
  if (batch.status === "refunded") return "refunded";
  if (batch.status !== "cleared") return "still_clearing";
  if (rateForKind(rates, batch.kind) <= 0) return "no_rate";
  return null;
}

// ── ledger postings for a post ─────────────────────────────────────────────────────────────────

/** What every settlement call needs to know about the bounty and the post. */
export interface SettleContext {
  bounty: {
    id: BountyId;
    brand_id: BrandId;
    title: string;
    cpm_cents: number;
    per_video_cap_cents: number;
    take_rate: number;
    rates: CpaRates;
  };
  post: { id: PostId; creator_id: CreatorId; submission_id?: SubmissionId };
  /** When the legs are posted (the settlement time). */
  posted_at: IsoTimestamp;
  /** Pool pay already settled on this post. */
  already_paid_cents?: number;
  /** Escrow normally; "wallet" covers an approved post after the pool has emptied. */
  source?: FundingSource;
  /** Creator row status: pending (default, clears at the 14:00 UTC run) or cleared. */
  creator_status?: "pending" | "cleared";
}

export interface LegResult {
  /** The posted transaction, or null when nothing was payable. */
  txn: LedgerTxn | null;
  pay_cents: number;
  fee_cents: number;
  /** True when the cap stopped (part of) this leg. */
  capped: boolean;
  /** Pool pay available under the cap after this leg. */
  cap_remaining_cents: number;
}

/** "Platform fee 10%: Glow-up reveal". */
export const feeMemo = (takeRate: number, title: string): string => `Platform fee ${formatPercent(takeRate)}: ${title}`;

const KIND_LABEL: Record<ConversionKind, string> = { install: "Install bonus", trial: "Trial bonus", paid: "Paid conversion bonus" };

/** "Install bonus x7 (tracked link): Glow-up reveal", "Trial bonus x2 ...", "Paid conversion bonus x1 ...". */
export const cpaMemo = (kind: ConversionKind, quantity: number, source: ConversionSource, title: string): string =>
  `${KIND_LABEL[kind]} x${quantity} (tracked ${source}): ${title}`;

/** "Views pay: Glow-up reveal (31,400 verified views)". */
export const cpmMemo = (title: string, windowViews: number): string => `Views pay: ${title} (${formatInt(windowViews)} verified views)`;

/**
 * The CPM leg of a post at clearing: escrow -(pay + fee), creator +pay [cpm], platform:fees +fee [fee].
 * Pay is capped at the per-video cap left; a zero fee (waived first bounty) omits the fee leg.
 */
export function settleCpmLeg(ctx: SettleContext & { txn_id: string; window_views: number }): LegResult {
  const { bounty, post } = ctx;
  const capLeft = Math.max(0, bounty.per_video_cap_cents - (ctx.already_paid_cents ?? 0));
  const uncapped = Math.round((ctx.window_views * bounty.cpm_cents) / 1000);
  const pay = Math.min(uncapped, capLeft);
  const fee = mulRate(pay, bounty.take_rate);
  const result: LegResult = { txn: null, pay_cents: pay, fee_cents: fee, capped: uncapped > capLeft, cap_remaining_cents: capLeft - pay };
  if (pay <= 0) return result;
  result.txn = settlementTxn({
    txn_id: ctx.txn_id,
    posted_at: ctx.posted_at,
    brand_id: bounty.brand_id,
    bounty_id: bounty.id,
    creator_id: post.creator_id,
    post_id: post.id,
    submission_id: post.submission_id,
    type: "cpm",
    pay_cents: pay,
    fee_cents: fee,
    pay_memo: cpmMemo(bounty.title, ctx.window_views),
    fee_memo: feeMemo(bounty.take_rate, bounty.title),
    source: ctx.source,
    creator_status: ctx.creator_status,
  });
  return result;
}

/**
 * One cleared CPA batch: same shape as the CPM leg with type cpa and the conversion id on every leg. The batch is paid up to the
 * cap left; the fee is rounded for this leg alone, so a post's fee can differ by a cent or two from the fee on its total.
 */
export function settleCpaBatch(ctx: SettleContext & { txn_id: string; batch: ConversionBatchInput }): LegResult & { skipped?: SkipReason } {
  const { bounty, post, batch } = ctx;
  const capLeft = Math.max(0, bounty.per_video_cap_cents - (ctx.already_paid_cents ?? 0));
  const skip = batchSkipReason(batch, bounty.rates);
  if (skip) return { txn: null, pay_cents: 0, fee_cents: 0, capped: false, cap_remaining_cents: capLeft, skipped: skip };
  const uncapped = batch.quantity * rateForKind(bounty.rates, batch.kind);
  const pay = Math.min(uncapped, capLeft);
  const fee = mulRate(pay, bounty.take_rate);
  const result: LegResult = { txn: null, pay_cents: pay, fee_cents: fee, capped: uncapped > capLeft, cap_remaining_cents: capLeft - pay };
  if (pay <= 0) return result;
  result.txn = settlementTxn({
    txn_id: ctx.txn_id,
    posted_at: ctx.posted_at,
    brand_id: bounty.brand_id,
    bounty_id: bounty.id,
    creator_id: post.creator_id,
    post_id: post.id,
    submission_id: post.submission_id,
    conversion_id: batch.id,
    type: "cpa",
    pay_cents: pay,
    fee_cents: fee,
    pay_memo: cpaMemo(batch.kind, batch.quantity, batch.source, bounty.title),
    fee_memo: feeMemo(bounty.take_rate, bounty.title),
    source: ctx.source,
    creator_status: ctx.creator_status,
  });
  return result;
}

export interface PostLedgerResult {
  /** CPM transaction first, then one per paid CPA batch in the order given. */
  txns: LedgerTxn[];
  /** Batches that were not paid and why. */
  skipped: SkippedBatch[];
  /** Conversion ids whose batch was (partly) stopped by the cap. */
  capped_conversion_ids: ConversionId[];
  summary: {
    cpm_pay_cents: number;
    cpa_pay_cents: number;
    pay_cents: number;
    fee_cents: number;
    /** pay + fees: what the post cost the brand. */
    brand_cost_cents: number;
    capped: boolean;
    cap_remaining_cents: number;
  };
}

/**
 * Settles a whole post in one go: the CPM leg, then each payable CPA batch in order, all inside one per-video cap. In production the CPM
 * leg posts at the clearing run and CPA batches post as they clear (call `settleCpmLeg` and `settleCpaBatch` separately and thread
 * `already_paid_cents`); this helper does both for demos, tests and the "what would this post pay" preview.
 *
 * Idempotent by construction: it only returns legs, it never stores them; the store keys settlement on (post, leg).
 */
export function settlePostToLedger(
  ctx: SettleContext & {
    window_views: number;
    conversions: readonly ConversionBatchInput[];
    next_txn_id: TxnIdFactory;
    /** Set false when the CPM leg was already settled and only CPA batches are being added. */
    include_cpm?: boolean;
  },
): PostLedgerResult {
  const txns: LedgerTxn[] = [];
  const skipped: SkippedBatch[] = [];
  const cappedIds: ConversionId[] = [];
  let paid = ctx.already_paid_cents ?? 0;
  let cpmPay = 0;
  let cpaPay = 0;
  let fee = 0;
  let capped = false;

  if (ctx.include_cpm !== false) {
    const cpm = settleCpmLeg({ ...ctx, txn_id: ctx.next_txn_id(), already_paid_cents: paid });
    if (cpm.txn) txns.push(cpm.txn);
    cpmPay += cpm.pay_cents;
    paid += cpm.pay_cents;
    fee += cpm.fee_cents;
    capped = capped || cpm.capped;
  }
  for (const batch of ctx.conversions) {
    const skip = batchSkipReason(batch, ctx.bounty.rates);
    if (skip) {
      skipped.push({ conversion_id: batch.id, reason: skip });
      continue;
    }
    const r = settleCpaBatch({ ...ctx, txn_id: ctx.next_txn_id(), batch, already_paid_cents: paid });
    if (r.txn) txns.push(r.txn);
    if (r.capped) cappedIds.push(batch.id);
    cpaPay += r.pay_cents;
    paid += r.pay_cents;
    fee += r.fee_cents;
    capped = capped || r.capped;
  }
  const pay = cpmPay + cpaPay;
  return {
    txns,
    skipped,
    capped_conversion_ids: cappedIds,
    summary: {
      cpm_pay_cents: cpmPay,
      cpa_pay_cents: cpaPay,
      pay_cents: pay,
      fee_cents: fee,
      brand_cost_cents: pay + fee,
      capped,
      cap_remaining_cents: Math.max(0, ctx.bounty.per_video_cap_cents - paid),
    },
  };
}

/**
 * A flat-fee settlement (direct offer, auction win, spec licence). Offers and auctions pay from the private bounty's escrow;
 * spec licences are paid from the brand wallet (`source: "wallet"`). Fee = round(price x take_rate). Sits outside any per-video cap.
 */
export function settleFlatFee(p: {
  txn_id: string;
  posted_at: IsoTimestamp;
  brand_id: BrandId;
  bounty_id: BountyId;
  creator_id: CreatorId;
  post_id?: PostId;
  submission_id?: SubmissionId;
  price_cents: number;
  take_rate: number;
  title: string;
  /** "Flat fee" (default) for offers, auctions and specs; "Starter bounty" for the First-Dollar Path starter. */
  label?: "Flat fee" | "Starter bounty";
  source?: FundingSource;
}): { txn: LedgerTxn; pay_cents: number; fee_cents: number; brand_cost_cents: number } {
  const fee = mulRate(p.price_cents, p.take_rate);
  const txn = settlementTxn({
    txn_id: p.txn_id,
    posted_at: p.posted_at,
    brand_id: p.brand_id,
    bounty_id: p.bounty_id,
    creator_id: p.creator_id,
    post_id: p.post_id,
    submission_id: p.submission_id,
    type: "flat_fee",
    pay_cents: p.price_cents,
    fee_cents: fee,
    pay_memo: `${p.label ?? "Flat fee"}: ${p.title}`,
    fee_memo: feeMemo(p.take_rate, p.title),
    source: p.source,
  });
  return { txn, pay_cents: p.price_cents, fee_cents: fee, brand_cost_cents: p.price_cents + fee };
}

// ── Reserved Slot and the escrow identity ──────────────────────────────────────────────────────

/**
 * A bounty's money split. escrow_funded = reserved + spent + remaining + refunded, all non-negative.
 * `reserved` is a claim on `remaining` that is not on the ledger; the ledger balance of the escrow account is reserved + remaining.
 */
export interface EscrowState {
  escrow_funded_cents: number;
  reserved_cents: number;
  spent_cents: number;
  remaining_cents: number;
  refunded_cents: number;
}

/** Pulls the five escrow fields off a bounty-shaped object. */
export const escrowStateOf = (b: EscrowState): EscrowState => ({
  escrow_funded_cents: b.escrow_funded_cents,
  reserved_cents: b.reserved_cents,
  spent_cents: b.spent_cents,
  remaining_cents: b.remaining_cents,
  refunded_cents: b.refunded_cents,
});

/** A bounty with nothing in escrow yet. */
export const emptyEscrow = (): EscrowState => ({ escrow_funded_cents: 0, reserved_cents: 0, spent_cents: 0, remaining_cents: 0, refunded_cents: 0 });

/** Money lands in escrow (wallet funding or a match): funded and remaining both grow. */
export function fundEscrow(state: EscrowState, amount_cents: number): EscrowState {
  if (amount_cents < 0) throw new Error("fundEscrow: negative amount");
  return { ...state, escrow_funded_cents: state.escrow_funded_cents + amount_cents, remaining_cents: state.remaining_cents + amount_cents };
}

/** True when every part is non-negative and funded = reserved + spent + remaining + refunded. */
export function escrowIdentityHolds(s: EscrowState): boolean {
  const parts = [s.reserved_cents, s.spent_cents, s.remaining_cents, s.refunded_cents];
  return parts.every((p) => p >= 0) && s.escrow_funded_cents === parts.reduce((a, b) => a + b, 0);
}

/** One reservation unit: per-video cap + the fee on it. A submission reserves one unit on submit. */
export function reservationUnit(params: { per_video_cap_cents: number; take_rate: number }): number {
  return params.per_video_cap_cents + mulRate(params.per_video_cap_cents, params.take_rate);
}

/** Spots a pool can still take: floor(remaining / reservation unit). */
export function spotsLeft(params: { remaining_cents: number; per_video_cap_cents: number; take_rate: number }): number {
  const unit = reservationUnit(params);
  return unit > 0 ? Math.floor(params.remaining_cents / unit) : 0;
}

/** The bounty is filled when no spot is left; it is live again as soon as a unit is released. */
export const isFilled = (params: { remaining_cents: number; per_video_cap_cents: number; take_rate: number }): boolean => spotsLeft(params) === 0;

export type ReserveResult = { ok: true; state: EscrowState; reserved_cents: number } | { ok: false; state: EscrowState; reason: "insufficient_remaining" };

/** A submission takes a Reserved Slot: `unit` moves from remaining to reserved. Refuses when remaining is short. */
export function reserveSlot(state: EscrowState, unit_cents: number): ReserveResult {
  if (unit_cents <= 0 || state.remaining_cents < unit_cents) return { ok: false, state, reason: "insufficient_remaining" };
  return { ok: true, reserved_cents: unit_cents, state: { ...state, reserved_cents: state.reserved_cents + unit_cents, remaining_cents: state.remaining_cents - unit_cents } };
}

/** Rejection, withdrawal, expiry or release gives the reservation back to remaining. */
export function releaseSlot(state: EscrowState, reserved_cents: number): EscrowState {
  const amount = Math.min(reserved_cents, state.reserved_cents);
  return { ...state, reserved_cents: state.reserved_cents - amount, remaining_cents: state.remaining_cents + amount };
}

export interface SettleReservationResult {
  state: EscrowState;
  /** What escrow actually paid out (pay + fee, or less when escrow could not cover it). */
  covered_cents: number;
  /** Reservation not needed after settlement; it returned to remaining. */
  released_cents: number;
  /** Pay + fee that escrow could not cover. The brand wallet pays it, so an approved post is always paid. */
  shortfall_cents: number;
}

/**
 * On settlement the reservation is replaced by the actual pay + fee and the difference returns to remaining.
 * Rounding the fee per leg can push the actual a cent or two above a unit in rare cases; the overage comes from remaining, and
 * anything escrow cannot cover is reported as `shortfall_cents` for the wallet to pay (approved posts are paid even when the pool is empty).
 */
export function settleReservation(state: EscrowState, p: { reserved_cents: number; pay_cents: number; fee_cents: number }): SettleReservationResult {
  const reserved = Math.min(p.reserved_cents, state.reserved_cents);
  const actual = p.pay_cents + p.fee_cents;
  const available = reserved + state.remaining_cents;
  const covered = Math.min(actual, available);
  return {
    state: { ...state, reserved_cents: state.reserved_cents - reserved, spent_cents: state.spent_cents + covered, remaining_cents: state.remaining_cents + reserved - covered },
    covered_cents: covered,
    released_cents: Math.max(0, reserved - actual),
    shortfall_cents: actual - covered,
  };
}

/** A later settlement with no reservation behind it (a CPA batch clearing after the CPM leg): drawn from remaining. */
export function spendFromRemaining(state: EscrowState, p: { pay_cents: number; fee_cents: number }): SettleReservationResult {
  return settleReservation(state, { reserved_cents: 0, ...p });
}

/**
 * Settles the bounty: unspent budget and unused fee reserve return together to the wallet. Any reservation still open is released
 * first. After this a settled bounty has reserved = 0 and remaining = 0, and refunded + spent = funded.
 */
export function settleBounty(p: { state: EscrowState; txn_id: string; posted_at: IsoTimestamp; brand_id: BrandId; bounty_id: BountyId; title: string }): {
  state: EscrowState;
  refund_cents: number;
  txn: LedgerTxn | null;
} {
  const released = releaseSlot(p.state, p.state.reserved_cents);
  const refund = released.remaining_cents;
  const state: EscrowState = { ...released, remaining_cents: 0, refunded_cents: released.refunded_cents + refund };
  const txn = escrowRefundTxn({
    txn_id: p.txn_id,
    posted_at: p.posted_at,
    brand_id: p.brand_id,
    bounty_id: p.bounty_id,
    unspent_cents: refund,
    memo: `Refund of unspent budget: ${p.title}`,
  });
  return { state, refund_cents: refund, txn };
}

/** Share of the escrow in each state, for the budget-burn bar. Ratios sum to 1 (0 when nothing is funded). */
export function escrowBurn(s: EscrowState): { spent: number; reserved: number; remaining: number; refunded: number } {
  const f = s.escrow_funded_cents;
  if (f <= 0) return { spent: 0, reserved: 0, remaining: 0, refunded: 0 };
  return { spent: s.spent_cents / f, reserved: s.reserved_cents / f, remaining: s.remaining_cents / f, refunded: s.refunded_cents / f };
}

/** The 30-day CPA window: a conversion pays only if it happens inside it. */
export function withinCpaWindow(postedAt: IsoTimestamp, occurredAt: IsoTimestamp): boolean {
  const days = (toMs(occurredAt) - toMs(postedAt)) / DAY_MS;
  return days >= 0 && days <= CONSTANTS.pay.cpa_window_days;
}
