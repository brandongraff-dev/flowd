/**
 * The append-only, double-entry ledger (DOMAIN section 10).
 *
 * A transaction is a set of legs that net to exactly zero (credit to an account is positive, debit negative). Accounts are strings
 * "<kind>:<id>". This module builds the legs for every event that moves money and checks the invariants the validator enforces
 * (L-01 every txn nets to 0, L-03 and L-04 the escrow identity, L-08 spent equals escrow debits, L-17 platform accounts never negative).
 *
 * Builders are pure: they take ids and timestamps in and return legs. Row ids (`ledg_<n>`) are assigned by the caller's store.
 */

import type {
  AdId,
  BountyId,
  BrandId,
  ConversionId,
  CreatorId,
  InvoiceId,
  IsoTimestamp,
  LedgerAccountKind,
  LedgerEntry,
  LedgerStatus,
  LedgerType,
  PayoutId,
  PostId,
  SubmissionId,
} from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatMoney, formatPercent, roundHalfUp } from "./money";
import { cardProcessing } from "./pricing";
import { dayLabel } from "./time";

// ── accounts ───────────────────────────────────────────────────────────────────────────────────

/** Fixed platform and external accounts. */
export const ACCOUNTS = {
  fees: "platform:fees",
  subscriptions: "platform:subscriptions",
  processing: "platform:processing",
  matching: "platform:matching",
  promo: "platform:promo",
  card: "external:card",
  bank: "external:bank",
} as const;

export const walletAccount = (brandId: BrandId): string => `wallet:${brandId}`;
export const escrowAccount = (bountyId: BountyId): string => `escrow:${bountyId}`;
export const creatorAccount = (creatorId: CreatorId): string => `creator:${creatorId}`;

/** Splits "escrow:bnty_x" into its kind and id. Throws on a malformed account. */
export function parseAccount(account: string): { kind: LedgerAccountKind; id: string } {
  const i = account.indexOf(":");
  const kind = account.slice(0, i);
  if (i <= 0 || !["wallet", "escrow", "creator", "platform", "external"].includes(kind)) throw new Error(`Bad ledger account: ${account}`);
  return { kind: kind as LedgerAccountKind, id: account.slice(i + 1) };
}

/** Platform accounts that are funded outside the ledger and may legitimately run negative (L-17). */
const TREASURY_ACCOUNTS: ReadonlySet<string> = new Set([ACCOUNTS.promo, ACCOUNTS.matching]);

// ── legs and transactions ──────────────────────────────────────────────────────────────────────

/** A ledger row before the store assigns its id. */
export type LedgerLeg = Omit<LedgerEntry, "id">;

/** All legs of one transaction. They share `txn_id` and net to exactly zero. */
export interface LedgerTxn {
  txn_id: string;
  legs: LedgerLeg[];
}

/** Hands out the next transaction id. Inject your own, or use `sequentialTxnIds`. */
export type TxnIdFactory = () => string;

/** "txn_000001", "txn_000002" ... deterministic ids for tests and demos. */
export function sequentialTxnIds(start = 1, prefix = "txn_"): TxnIdFactory {
  let n = start;
  return () => {
    const id = `${prefix}${String(n).padStart(6, "0")}`;
    n += 1;
    return id;
  };
}

/** Sum of the signed amounts of some legs. */
export const netOf = (legs: readonly Pick<LedgerLeg, "amount_cents">[]): number => legs.reduce((s, l) => s + l.amount_cents, 0);

/** Wraps legs in a transaction and throws if they do not net to zero (a bug in the caller, never user input). */
export function makeTxn(txn_id: string, legs: LedgerLeg[]): LedgerTxn {
  const net = netOf(legs);
  if (net !== 0) throw new Error(`Transaction ${txn_id} does not net to zero (off by ${net} cents)`);
  return { txn_id, legs };
}

/** Fields every builder takes. */
interface Base {
  txn_id: string;
  posted_at: IsoTimestamp;
}

/** Optional back-references copied onto every leg. */
interface Refs {
  brand_id?: BrandId;
  bounty_id?: BountyId;
  post_id?: PostId;
  submission_id?: SubmissionId;
  creator_id?: CreatorId;
  conversion_id?: ConversionId;
  ad_id?: AdId;
  invoice_id?: InvoiceId;
  payout_id?: PayoutId;
}

function leg(base: Base, refs: Refs, entry_type: LedgerType, account: string, amount_cents: number, status: LedgerStatus, memo: string, extra: Partial<LedgerLeg> = {}): LedgerLeg {
  const row: LedgerLeg = { txn_id: base.txn_id, entry_type, account, amount_cents, status, posted_at: base.posted_at, memo };
  if (refs.brand_id) row.brand_id = refs.brand_id;
  if (refs.bounty_id) row.bounty_id = refs.bounty_id;
  if (refs.post_id) row.post_id = refs.post_id;
  if (refs.submission_id) row.submission_id = refs.submission_id;
  if (refs.creator_id) row.creator_id = refs.creator_id;
  if (refs.conversion_id) row.conversion_id = refs.conversion_id;
  if (refs.ad_id) row.ad_id = refs.ad_id;
  if (refs.invoice_id) row.invoice_id = refs.invoice_id;
  if (refs.payout_id) row.payout_id = refs.payout_id;
  if (status === "cleared") row.cleared_at = base.posted_at;
  if (status === "paid") {
    row.cleared_at = base.posted_at;
    row.paid_at = base.posted_at;
  }
  return { ...row, ...extra };
}

// ── funding ────────────────────────────────────────────────────────────────────────────────────

/**
 * Wallet top-up by card: external:card -(X + processing), wallet +X, platform:processing +processing.
 * Processing (2.9% + $0.30) is passed through at cost; `amount_cents` is what lands in the wallet.
 * Memos read "Wallet top-up by card ($1,500.00)" and "Card processing (2.9% + $0.30)".
 */
export function walletTopUpTxn(p: Base & { brand_id: BrandId; amount_cents: number; invoice_id?: InvoiceId }): LedgerTxn {
  const processing = cardProcessing(p.amount_cents);
  const refs: Refs = { brand_id: p.brand_id, invoice_id: p.invoice_id };
  const memo = `Wallet top-up by card (${formatMoney(p.amount_cents)})`;
  const processingMemo = `Card processing (${formatPercent(CONSTANTS.fees.card_processing_rate)} + ${formatMoney(CONSTANTS.fees.card_processing_fixed_cents)})`;
  return makeTxn(p.txn_id, [
    leg(p, refs, "wallet_topup", ACCOUNTS.card, -(p.amount_cents + processing), "cleared", memo),
    leg(p, refs, "wallet_topup", walletAccount(p.brand_id), p.amount_cents, "cleared", memo),
    leg(p, refs, "processing", ACCOUNTS.processing, processing, "cleared", processingMemo),
  ]);
}

/** Escrow funding: wallet -X, escrow +X. The bounty is Funded when its escrow equals budget + fee reserve. */
export function escrowFundTxn(p: Base & { brand_id: BrandId; bounty_id: BountyId; amount_cents: number; memo: string; invoice_id?: InvoiceId }): LedgerTxn {
  const refs: Refs = { brand_id: p.brand_id, bounty_id: p.bounty_id, invoice_id: p.invoice_id };
  return makeTxn(p.txn_id, [
    leg(p, refs, "escrow_fund", walletAccount(p.brand_id), -p.amount_cents, "cleared", p.memo),
    leg(p, refs, "escrow_fund", escrowAccount(p.bounty_id), p.amount_cents, "cleared", p.memo),
  ]);
}

/** Matched budget on a first bounty: platform:matching -M, escrow +M. */
export function matchedBudgetTxn(p: Base & { brand_id: BrandId; bounty_id: BountyId; amount_cents: number }): LedgerTxn {
  const refs: Refs = { brand_id: p.brand_id, bounty_id: p.bounty_id };
  const memo = "Matched budget (first bounty)";
  return makeTxn(p.txn_id, [
    leg(p, refs, "matched_budget", ACCOUNTS.matching, -p.amount_cents, "cleared", memo),
    leg(p, refs, "matched_budget", escrowAccount(p.bounty_id), p.amount_cents, "cleared", memo),
  ]);
}

/**
 * The plain-English memo of an escrow funding row: "Funded: Glow-up reveal ($3,000.00 pool + $300.00 fee reserve)". A waived fee reads
 * "($2,000.00 pool + $0.00 fee reserve)", the same shape the demo ledger uses. A bounty flowd funds itself reads "Funded by flowd: Title ($2,500.00 pool)".
 */
export function fundedMemo(title: string, poolCents: number, feeReserveCents: number, fmt: (cents: number) => string, source: "brand" | "platform" = "brand"): string {
  if (source === "platform") return `Funded by flowd: ${title} (${fmt(poolCents)} pool)`;
  return `Funded: ${title} (${fmt(poolCents)} pool + ${fmt(feeReserveCents)} fee reserve)`;
}

// ── settlement legs ────────────────────────────────────────────────────────────────────────────

/** Where a settlement is paid from. Escrow normally; the brand wallet covers an approved post after the pool has emptied. */
export type FundingSource = "escrow" | "wallet";

/**
 * One settlement transaction: source -(pay + fee), creator +pay, platform:fees +fee. A zero fee (waived first bounty) omits the fee leg.
 * `entry_type` is cpm, cpa or flat_fee; the fee leg is always type fee. The creator row starts `pending` and becomes `cleared`
 * at the 14:00 UTC run (see `markCleared`).
 */
export function settlementTxn(
  p: Base &
    Refs & {
      brand_id: BrandId;
      bounty_id: BountyId;
      creator_id: CreatorId;
      type: "cpm" | "cpa" | "flat_fee";
      pay_cents: number;
      fee_cents: number;
      pay_memo: string;
      fee_memo: string;
      source?: FundingSource;
      creator_status?: Extract<LedgerStatus, "pending" | "cleared">;
    },
): LedgerTxn {
  const refs: Refs = p;
  const source = p.source ?? "escrow";
  const from = source === "escrow" ? escrowAccount(p.bounty_id) : walletAccount(p.brand_id);
  const creatorStatus = p.creator_status ?? "pending";
  const legs: LedgerLeg[] = [
    leg(p, refs, p.type, from, -(p.pay_cents + p.fee_cents), "cleared", p.pay_memo),
    leg(p, refs, p.type, creatorAccount(p.creator_id), p.pay_cents, creatorStatus, p.pay_memo),
  ];
  if (p.fee_cents > 0) legs.push(leg(p, refs, "fee", ACCOUNTS.fees, p.fee_cents, "cleared", p.fee_memo));
  return makeTxn(p.txn_id, legs);
}

/**
 * Winner promotion commission: wallet -c, creator +c [commission]. Outside the per-video cap. The memo reads
 * "Ad commission: 10% of ad-attributed revenue (Glow-up reveal)" when a bounty title is given.
 */
export function adCommissionTxn(p: Base & { brand_id: BrandId; creator_id: CreatorId; ad_id: AdId; post_id?: PostId; bounty_id?: BountyId; commission_cents: number; title?: string; memo?: string }): LedgerTxn {
  const refs: Refs = p;
  const memo = p.memo ?? `Ad commission: ${formatPercent(CONSTANTS.pay.ad_commission_rate)} of ad-attributed revenue${p.title ? ` (${p.title})` : ""}`;
  return makeTxn(p.txn_id, [
    leg(p, refs, "commission", walletAccount(p.brand_id), -p.commission_cents, "cleared", memo),
    leg(p, refs, "commission", creatorAccount(p.creator_id), p.commission_cents, "pending", memo),
  ]);
}

/** Winner promotion platform fee: wallet -f, platform:fees +f [ad_fee]. The creator is never charged. The memo reads "Winner promotion fee: 1% of ad spend (Title)". */
export function adFeeTxn(p: Base & { brand_id: BrandId; ad_id: AdId; fee_cents: number; title?: string; memo?: string }): LedgerTxn {
  const refs: Refs = p;
  const memo = p.memo ?? `Winner promotion fee: ${formatPercent(CONSTANTS.fees.ad_spend_fee_rate)} of ad spend${p.title ? ` (${p.title})` : ""}`;
  return makeTxn(p.txn_id, [
    leg(p, refs, "ad_fee", walletAccount(p.brand_id), -p.fee_cents, "cleared", memo),
    leg(p, refs, "ad_fee", ACCOUNTS.fees, p.fee_cents, "cleared", memo),
  ]);
}

/** "Rights renewal, 30 days: Headshots in 60 seconds". */
export const rightsRenewalMemo = (days: number, title: string): string => `Rights renewal, ${days} days: ${title}`;

/** "flowd Pro plan, 17 Jul to 16 Aug": the memo of a plan fee. `from` and `to` are the first and last day of the period. */
export function subscriptionMemo(planLabel: string, from: IsoTimestamp, to: IsoTimestamp): string {
  const day = (t: IsoTimestamp): string => dayLabel(t).split(" ").reverse().join(" ");
  return `flowd ${planLabel} plan, ${day(from)} to ${day(to)}`;
}

/** Rights renewal: wallet -(price + fee), creator +price [rights_fee], platform:fees +fee. The fee leg reads "Platform fee 12%: rights renewal" when `fee_memo` is given, else it shares the memo. */
export function rightsRenewalTxn(p: Base & { brand_id: BrandId; creator_id: CreatorId; post_id?: PostId; bounty_id?: BountyId; price_cents: number; fee_cents: number; memo: string; fee_memo?: string }): LedgerTxn {
  const refs: Refs = p;
  const legs: LedgerLeg[] = [
    leg(p, refs, "rights_fee", walletAccount(p.brand_id), -(p.price_cents + p.fee_cents), "cleared", p.memo),
    leg(p, refs, "rights_fee", creatorAccount(p.creator_id), p.price_cents, "pending", p.memo),
  ];
  if (p.fee_cents > 0) legs.push(leg(p, refs, "fee", ACCOUNTS.fees, p.fee_cents, "cleared", p.fee_memo ?? p.memo));
  return makeTxn(p.txn_id, legs);
}

/** Pro and Scale plan fees: external:card -P, platform:subscriptions +P. */
export function subscriptionTxn(p: Base & { brand_id: BrandId; amount_cents: number; memo: string; invoice_id?: InvoiceId }): LedgerTxn {
  const refs: Refs = { brand_id: p.brand_id, invoice_id: p.invoice_id };
  return makeTxn(p.txn_id, [
    leg(p, refs, "subscription_fee", ACCOUNTS.card, -p.amount_cents, "cleared", p.memo),
    leg(p, refs, "subscription_fee", ACCOUNTS.subscriptions, p.amount_cents, "cleared", p.memo),
  ]);
}

/** Bonus, prize or referral reward from the platform promo treasury: platform:promo -x, creator +x. */
export function promoTxn(p: Base & { creator_id: CreatorId; type: "bonus" | "prize" | "referral"; amount_cents: number; memo: string }): LedgerTxn {
  const refs: Refs = { creator_id: p.creator_id };
  return makeTxn(p.txn_id, [
    leg(p, refs, p.type, ACCOUNTS.promo, -p.amount_cents, "cleared", p.memo),
    leg(p, refs, p.type, creatorAccount(p.creator_id), p.amount_cents, "pending", p.memo),
  ]);
}

// ── payouts ────────────────────────────────────────────────────────────────────────────────────

/** Weekly payout (free): creator -gross, external:bank +gross. The earning rows included become paid with payout_id. */
export function weeklyPayoutTxn(p: Base & { creator_id: CreatorId; payout_id: PayoutId; gross_cents: number; run_id: string }): LedgerTxn {
  const refs: Refs = { creator_id: p.creator_id, payout_id: p.payout_id };
  const memo = `Weekly payout ${p.run_id}`;
  return makeTxn(p.txn_id, [
    leg(p, refs, "payout", creatorAccount(p.creator_id), -p.gross_cents, "paid", memo),
    leg(p, refs, "payout", ACCOUNTS.bank, p.gross_cents, "paid", memo),
  ]);
}

/**
 * Instant cash-out: creator -gross, external:bank +(gross - fee), platform:fees +fee [payout_fee]. A free instant perk has fee 0 and omits the fee leg.
 * Memos read "Instant cash-out (fee $2.40)" on the payout legs and "Instant cash-out fee ($2.40)" on the fee leg; a free one reads "Instant cash-out".
 */
export function instantPayoutTxn(p: Base & { creator_id: CreatorId; payout_id: PayoutId; gross_cents: number; fee_cents: number; fee_label: string }): LedgerTxn {
  const refs: Refs = { creator_id: p.creator_id, payout_id: p.payout_id };
  const memo = p.fee_cents > 0 ? `Instant cash-out (fee ${p.fee_label})` : "Instant cash-out";
  const legs: LedgerLeg[] = [
    leg(p, refs, "payout", creatorAccount(p.creator_id), -p.gross_cents, "paid", memo),
    leg(p, refs, "payout", ACCOUNTS.bank, p.gross_cents - p.fee_cents, "paid", memo),
  ];
  if (p.fee_cents > 0) legs.push(leg(p, refs, "payout_fee", ACCOUNTS.fees, p.fee_cents, "cleared", `Instant cash-out fee (${p.fee_label})`));
  return makeTxn(p.txn_id, legs);
}

// ── clawbacks and refunds ──────────────────────────────────────────────────────────────────────

/**
 * Clawback of proven fraud or a refund: reverses an earlier settlement in a NEW transaction that references the original.
 *   creator -pay [status reversed] · platform:fees -fee · wallet +(pay + fee)
 * `fraction` (0..1, default 1) claws back only the invalid share (delivered legitimate views stay paid). Amounts round half-up
 * per leg and the wallet leg is the exact sum of the other two, so the transaction always nets to zero. A creator balance may go
 * negative; it is recovered from future earnings (`recoverFromEarnings`).
 */
export function clawbackTxn(p: Base & { original: LedgerTxn; brand_id: BrandId; fraction?: number; memo?: string }): LedgerTxn {
  const fraction = Math.min(1, Math.max(0, p.fraction ?? 1));
  const creatorLeg = p.original.legs.find((l) => l.account.startsWith("creator:") && l.amount_cents > 0);
  if (!creatorLeg) throw new Error(`Transaction ${p.original.txn_id} has no creator earning leg to claw back`);
  const feeLeg = p.original.legs.find((l) => l.account === ACCOUNTS.fees && l.amount_cents > 0);
  const pay = fraction >= 1 ? creatorLeg.amount_cents : roundHalfUp(creatorLeg.amount_cents * fraction);
  const fee = feeLeg ? (fraction >= 1 ? feeLeg.amount_cents : roundHalfUp(feeLeg.amount_cents * fraction)) : 0;
  const memo = p.memo ?? "Clawback: proven view fraud (delivered views still paid)";
  const refs: Refs = {
    brand_id: p.brand_id,
    bounty_id: creatorLeg.bounty_id,
    post_id: creatorLeg.post_id,
    submission_id: creatorLeg.submission_id,
    creator_id: creatorLeg.creator_id,
    conversion_id: creatorLeg.conversion_id,
  };
  const legs: LedgerLeg[] = [leg(p, refs, "clawback", creatorLeg.account, 0 - pay, "reversed", memo, { reverses_txn_id: p.original.txn_id })];
  if (fee > 0) legs.push(leg(p, refs, "clawback", ACCOUNTS.fees, 0 - fee, "cleared", memo, { reverses_txn_id: p.original.txn_id }));
  legs.push(leg(p, refs, "clawback", walletAccount(p.brand_id), pay + fee, "cleared", memo, { reverses_txn_id: p.original.txn_id }));
  return makeTxn(p.txn_id, legs);
}

/**
 * Netting a negative creator balance against a new payout: returns what can be paid, what was recovered and what is still owed.
 * `owed_cents` is the positive amount the creator owes after clawbacks.
 */
export function recoverFromEarnings(params: { cleared_cents: number; owed_cents: number }): { payable_cents: number; recovered_cents: number; remaining_owed_cents: number } {
  const owed = Math.max(0, params.owed_cents);
  const recovered = Math.min(owed, Math.max(0, params.cleared_cents));
  return { payable_cents: Math.max(0, params.cleared_cents) - recovered, recovered_cents: recovered, remaining_owed_cents: owed - recovered };
}

/** Escrow refund at settlement: escrow -unspent, wallet +unspent. Unspent budget and unused fee reserve return together. Null when nothing to return. */
export function escrowRefundTxn(p: Base & { brand_id: BrandId; bounty_id: BountyId; unspent_cents: number; memo: string }): LedgerTxn | null {
  if (p.unspent_cents <= 0) return null;
  const refs: Refs = { brand_id: p.brand_id, bounty_id: p.bounty_id };
  return makeTxn(p.txn_id, [
    leg(p, refs, "escrow_refund", escrowAccount(p.bounty_id), -p.unspent_cents, "cleared", p.memo),
    leg(p, refs, "escrow_refund", walletAccount(p.brand_id), p.unspent_cents, "cleared", p.memo),
  ]);
}

// ── row transitions (the only mutations a ledger row allows) ───────────────────────────────────

/** A cleared copy of a leg: only status and cleared_at change. */
export function markCleared<T extends Pick<LedgerLeg, "status" | "cleared_at">>(row: T, clearedAt: IsoTimestamp): T {
  return { ...row, status: "cleared" as LedgerStatus, cleared_at: clearedAt };
}

/** A paid copy of a leg: status, paid_at and payout_id change. */
export function markPaid<T extends Pick<LedgerLeg, "status" | "paid_at" | "payout_id">>(row: T, paidAt: IsoTimestamp, payoutId: PayoutId): T {
  return { ...row, status: "paid" as LedgerStatus, paid_at: paidAt, payout_id: payoutId };
}

// ── balances and invariants ────────────────────────────────────────────────────────────────────

type Balanced = Pick<LedgerEntry, "account" | "amount_cents">;

/** Balance of every account (credits positive). */
export function balances(entries: Iterable<Balanced>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.account, (out.get(e.account) ?? 0) + e.amount_cents);
  return out;
}

/** Balance of one account. */
export function balanceOf(entries: Iterable<Balanced>, account: string): number {
  let b = 0;
  for (const e of entries) if (e.account === account) b += e.amount_cents;
  return b;
}

export interface LedgerViolation {
  rule: "L-01" | "L-03" | "L-04" | "L-08" | "L-17";
  detail: string;
}

/**
 * Checks the ledger invariants that need no other table:
 *   L-01  every txn_id nets to exactly 0
 *   L-17  platform accounts never go negative (except platform:promo and platform:matching, treasuries funded outside the ledger)
 */
export function verifyLedger(entries: readonly Pick<LedgerEntry, "txn_id" | "account" | "amount_cents">[]): { ok: boolean; violations: LedgerViolation[] } {
  const violations: LedgerViolation[] = [];
  const byTxn = new Map<string, number>();
  for (const e of entries) byTxn.set(e.txn_id, (byTxn.get(e.txn_id) ?? 0) + e.amount_cents);
  for (const [txn, net] of byTxn) if (net !== 0) violations.push({ rule: "L-01", detail: `${txn} nets to ${net} cents` });
  for (const [account, bal] of balances(entries)) {
    if (account.startsWith("platform:") && bal < 0 && !TREASURY_ACCOUNTS.has(account)) violations.push({ rule: "L-17", detail: `${account} is negative (${bal} cents)` });
  }
  return { ok: violations.length === 0, violations };
}

/** Escrow money of a bounty from its ledger legs. */
export interface BountyLedgerMoney {
  /** Total credited to escrow:bnty_x by escrow_fund and matched_budget legs. */
  funded_cents: number;
  /** Debits of types cpm, cpa, flat_fee and fee on the escrow account (negated): creator pay + fees settled. */
  spent_cents: number;
  /** escrow_refund debits (negated). */
  refunded_cents: number;
  /** Ledger balance of the escrow account: reserved + remaining. */
  balance_cents: number;
}

export function bountyLedgerMoney(entries: readonly LedgerEntry[] | readonly LedgerLeg[], bountyId: BountyId): BountyLedgerMoney {
  const account = escrowAccount(bountyId);
  let funded = 0;
  let spent = 0;
  let refunded = 0;
  let balance = 0;
  for (const e of entries) {
    if (e.account !== account) continue;
    balance += e.amount_cents;
    if (e.entry_type === "escrow_fund" || e.entry_type === "matched_budget") funded += e.amount_cents;
    else if (e.entry_type === "escrow_refund") refunded += -e.amount_cents;
    else if (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee" || e.entry_type === "fee") spent += -e.amount_cents;
  }
  return { funded_cents: funded, spent_cents: spent, refunded_cents: refunded, balance_cents: balance };
}

/**
 * Reconciles a bounty's denormalised money fields with its ledger legs (L-03, L-04, L-08).
 * The ledger balance of the escrow account must equal reserved + remaining, and spent must equal the settlement debits.
 */
export function reconcileBounty(
  entries: readonly LedgerEntry[] | readonly LedgerLeg[],
  bounty: { id: BountyId; escrow_funded_cents: number; reserved_cents: number; spent_cents: number; remaining_cents: number; refunded_cents: number },
): LedgerViolation[] {
  const v: LedgerViolation[] = [];
  const money = bountyLedgerMoney(entries, bounty.id);
  const sumParts = bounty.reserved_cents + bounty.spent_cents + bounty.remaining_cents + bounty.refunded_cents;
  if (bounty.escrow_funded_cents !== sumParts) v.push({ rule: "L-03", detail: `${bounty.id}: funded ${bounty.escrow_funded_cents} != reserved + spent + remaining + refunded (${sumParts})` });
  if (money.balance_cents !== bounty.reserved_cents + bounty.remaining_cents) v.push({ rule: "L-04", detail: `${bounty.id}: escrow balance ${money.balance_cents} != reserved + remaining (${bounty.reserved_cents + bounty.remaining_cents})` });
  if (money.spent_cents !== bounty.spent_cents) v.push({ rule: "L-08", detail: `${bounty.id}: spent ${bounty.spent_cents} != escrow settlement debits (${money.spent_cents})` });
  return v;
}

/** A creator's money by earning state, from their ledger rows. Pending and cleared are never summed. */
export interface CreatorLedgerMoney {
  /** Earning rows still pending (window open or clearing). */
  pending_cents: number;
  /** Earning rows cleared and waiting for a payout. */
  cleared_cents: number;
  held_cents: number;
  /** Earning rows included in a payout. */
  paid_cents: number;
  /** Net of every leg on the creator account: earnings less payouts less clawbacks. Negative after a clawback. */
  account_balance_cents: number;
}

const EARNING_TYPES: ReadonlySet<LedgerType> = new Set<LedgerType>(["cpm", "cpa", "flat_fee", "commission", "rights_fee", "bonus", "prize", "referral"]);

export function creatorLedgerMoney(entries: readonly Pick<LedgerEntry, "account" | "amount_cents" | "status" | "entry_type">[], creatorId: CreatorId): CreatorLedgerMoney {
  const account = creatorAccount(creatorId);
  const out: CreatorLedgerMoney = { pending_cents: 0, cleared_cents: 0, held_cents: 0, paid_cents: 0, account_balance_cents: 0 };
  for (const e of entries) {
    if (e.account !== account) continue;
    out.account_balance_cents += e.amount_cents;
    if (e.amount_cents <= 0 || !EARNING_TYPES.has(e.entry_type)) continue;
    if (e.status === "pending") out.pending_cents += e.amount_cents;
    else if (e.status === "cleared") out.cleared_cents += e.amount_cents;
    else if (e.status === "held") out.held_cents += e.amount_cents;
    else if (e.status === "paid") out.paid_cents += e.amount_cents;
  }
  return out;
}

