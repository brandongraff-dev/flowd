/**
 * Brand money: the wallet, escrow, the double-entry ledger, invoices and the plan. Every figure is read from the ledger and the rows it must agree with.
 */

import type { AutoTopUp, Bounty, Brand, Invoice, LedgerEntry, LedgerType, PaymentMethod, Plan } from "@/lib/contract/types";
import { comparePlans, dateOf, formatMoney, planBreakEven, planLabel, planPriceCentsMonth, planTakeRate, toMs, type PlanComparison } from "@/lib/engine";
import { heldForBidsIn } from "@/lib/store/core/billing";
import { asList, defineSelector, desc, groupBy, valuesOf, type Db } from "../select";
import { bountyView, mineBrandId, type BountyDb, type BountyView } from "./bounties";

export interface LedgerTxnView {
  txn_id: string;
  posted_at: string;
  /** The memo of the leg that explains the transaction ("Funded: Glow-up reveal ($5,000.00 pool + $500.00 fee reserve)"). */
  memo: string;
  /** The entry types in it, in leg order ("escrow_fund", "matched_budget"). */
  types: readonly LedgerType[];
  /** Every leg: credits are positive, debits negative, and they sum to exactly zero. */
  legs: readonly LedgerEntry[];
  /** The amount that moved (the largest positive leg). */
  amount_cents: number;
  /** Net of the brand wallet's own leg: negative when money left the wallet. 0 when the wallet is not involved. */
  wallet_delta_cents: number;
  bounty_id?: string;
  post_id?: string;
  creator_id?: string;
  invoice_id?: string;
  /** This transaction reverses another (a clawback). */
  reverses_txn_id?: string;
}

export interface BrandWallet {
  brand?: Brand;
  wallet: {
    /** The balance: the ledger's `wallet:<brand>` account (the denormalised `wallet_balance_cents` always equals it). */
    balance_cents: number;
    /** The balance less money held for open sealed bids. */
    available_cents: number;
    held_for_bids_cents: number;
  };
  escrow: {
    /** Pool and fee reserve still in escrow across open bounties (reserved + remaining). */
    held_cents: number;
    /** Reserved Slots on videos in review. */
    reserved_cents: number;
    /** Free for new videos. */
    available_cents: number;
    /** Creator pay and fees settled out of escrow, all time. */
    settled_cents: number;
    /** Returned to the wallet at settlement or cancellation. */
    returned_cents: number;
    bounties: readonly BountyView[];
  };
  plan: {
    plan: Plan;
    label: string;
    take_rate: number;
    price_cents_month: number;
    renews_at?: string;
    /** What each plan would have cost on the last 30 days of spend, with the cheapest one marked. */
    comparison: PlanComparison;
    /** Monthly spend above which the next plan up is cheaper, and a sentence for it. */
    next_break_even?: { to: Plan; spend_cents: number; text: string };
  };
  auto_top_up?: AutoTopUp;
  payment_method?: PaymentMethod;
  /** Brand transactions, newest first. */
  txns: readonly LedgerTxnView[];
  /** Escrow returns (unspent budget handed back), newest first. */
  returned: readonly LedgerTxnView[];
  invoices: readonly Invoice[];
  /** Platform fees paid in the last 30 days and all time. */
  fees: { last_30d_cents: number; total_cents: number };
  /** Creator pay settled in the last 30 days (the spend the plan comparison uses). */
  spend_30d_cents: number;
}

type BrandWalletDb = BountyDb & Db<"ledger" | "invoices" | "auctions" | "session">;

/** Groups a brand's ledger legs into transactions. */
export function brandTxns(legs: readonly LedgerEntry[], brandId: string): LedgerTxnView[] {
  const byTxn = new Map<string, LedgerEntry[]>();
  for (const e of legs) {
    const list = byTxn.get(e.txn_id);
    if (list) list.push(e);
    else byTxn.set(e.txn_id, [e]);
  }
  const wallet = `wallet:${brandId}`;
  const out: LedgerTxnView[] = [];
  for (const [txn_id, group] of byTxn) {
    const lead = group.find((e) => e.memo && e.amount_cents < 0) ?? group[0];
    const first = group[0];
    out.push({
      txn_id,
      posted_at: first.posted_at,
      memo: lead.memo,
      types: [...new Set(group.map((e) => e.entry_type))],
      legs: group,
      amount_cents: Math.max(...group.map((e) => e.amount_cents)),
      wallet_delta_cents: group.filter((e) => e.account === wallet).reduce((s, e) => s + e.amount_cents, 0),
      ...(first.bounty_id ? { bounty_id: first.bounty_id } : {}),
      ...(group.find((e) => e.post_id)?.post_id ? { post_id: group.find((e) => e.post_id)?.post_id } : {}),
      ...(group.find((e) => e.creator_id)?.creator_id ? { creator_id: group.find((e) => e.creator_id)?.creator_id } : {}),
      ...(group.find((e) => e.invoice_id)?.invoice_id ? { invoice_id: group.find((e) => e.invoice_id)?.invoice_id } : {}),
      ...(group.find((e) => e.reverses_txn_id)?.reverses_txn_id ? { reverses_txn_id: group.find((e) => e.reverses_txn_id)?.reverses_txn_id } : {}),
    });
  }
  return out.sort((a, b) => desc(a.posted_at, b.posted_at) || desc(a.txn_id, b.txn_id));
}

const UNSETTLED = new Set<Bounty["status"]>(["scheduled", "live", "paused", "filled", "ended"]);

/** The brand wallet page: balance, escrow, plan, ledger and invoices. `useBrandWallet()` for the signed-in brand. */
export const selectBrandWallet = defineSelector(["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "ledger", "invoices", "auctions", "session"] as const, (db: BrandWalletDb, brand: string | undefined): BrandWallet => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const b = brandId ? db.brands[brandId] : undefined;
  const now = db.clock.now;
  const empty: BrandWallet = {
    wallet: { balance_cents: 0, available_cents: 0, held_for_bids_cents: 0 },
    escrow: { held_cents: 0, reserved_cents: 0, available_cents: 0, settled_cents: 0, returned_cents: 0, bounties: [] },
    plan: { plan: "free", label: planLabel("free"), take_rate: planTakeRate("free"), price_cents_month: 0, comparison: comparePlans({ monthly_spend_cents: 0 }) },
    txns: [],
    returned: [],
    invoices: [],
    fees: { last_30d_cents: 0, total_cents: 0 },
    spend_30d_cents: 0,
  };
  if (!brandId || !b) return empty;
  const legs = groupBy(db.ledger, "brand", (e) => e.brand_id).get(brandId);
  const balance = legs.filter((e) => e.account === `wallet:${brandId}`).reduce((s, e) => s + e.amount_cents, 0);
  const held = heldForBidsIn(valuesOf(db.auctions), brandId);
  const bounties = groupBy(db.bounties, "brand", (x) => x.brand_id).get(brandId);
  const open = bounties.filter((x) => UNSETTLED.has(x.status) && x.funded);
  const day30 = toMs(now) - 30 * 86_400_000;
  const settledPay = legs.filter((e) => e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee") && toMs(e.posted_at) >= day30).reduce((s, e) => s + e.amount_cents, 0);
  const fees = legs.filter((e) => e.account === "platform:fees" && e.amount_cents > 0);
  const txns = brandTxns(legs, brandId);
  const next: Plan | undefined = b.plan === "free" ? "pro" : b.plan === "pro" ? "scale" : undefined;
  const breakEven = next ? planBreakEven(b.plan, next) : null;
  return {
    brand: b,
    wallet: { balance_cents: balance, available_cents: balance - held, held_for_bids_cents: held },
    escrow: {
      held_cents: open.reduce((s, x) => s + x.reserved_cents + x.remaining_cents, 0),
      reserved_cents: open.reduce((s, x) => s + x.reserved_cents, 0),
      available_cents: open.reduce((s, x) => s + x.remaining_cents, 0),
      settled_cents: bounties.reduce((s, x) => s + x.spent_cents, 0),
      returned_cents: bounties.reduce((s, x) => s + x.refunded_cents, 0),
      bounties: open.map((x) => bountyView(db, x)).sort((a, c) => desc(a.remaining_cents + a.reserved_cents, c.remaining_cents + c.reserved_cents)),
    },
    plan: {
      plan: b.plan,
      label: planLabel(b.plan),
      take_rate: planTakeRate(b.plan),
      price_cents_month: planPriceCentsMonth(b.plan),
      ...(b.plan_renews_at ? { renews_at: b.plan_renews_at } : {}),
      comparison: comparePlans({ monthly_spend_cents: settledPay }),
      ...(next && breakEven !== null ? { next_break_even: { to: next, spend_cents: breakEven, text: `${planLabel(next)} is cheaper above ${formatMoney(breakEven, { cents: "auto" })} a month of creator pay.` } } : {}),
    },
    ...(b.auto_top_up ? { auto_top_up: b.auto_top_up } : {}),
    ...(b.billing.payment_method ? { payment_method: b.billing.payment_method } : {}),
    txns,
    returned: txns.filter((t) => t.types.includes("escrow_refund")),
    invoices: groupBy(db.invoices, "brand", (i) => i.brand_id).get(brandId).slice().sort((a, c) => desc(a.issued_at, c.issued_at)),
    fees: { last_30d_cents: fees.filter((e) => toMs(e.posted_at) >= day30).reduce((s, e) => s + e.amount_cents, 0), total_cents: fees.reduce((s, e) => s + e.amount_cents, 0) },
    spend_30d_cents: settledPay,
  };
});

export interface InvoiceView extends Invoice {
  brand: Brand;
  bounty?: Bounty;
  /** The bounty's all-in cost per 1,000 views, shown on the printable invoice. */
  all_in_cpm_cents: number | null;
  /** Pool, fee and processing, always summing to the total: what the finance team reconciles. */
  breakdown: { pool_cents: number; fee_cents: number; processing_cents: number; tax_cents: number; total_cents: number };
}

/** One invoice with its bounty and a pool / fee / processing breakdown. */
export const selectInvoice = defineSelector(["invoices", "brands", "bounties"] as const, (db: Db<"invoices" | "brands" | "bounties">, id: string | undefined): InvoiceView | undefined => {
  const inv = id ? db.invoices[id] : undefined;
  if (!inv) return undefined;
  const bounty = inv.bounty_id ? db.bounties[inv.bounty_id] : undefined;
  return {
    ...inv,
    brand: db.brands[inv.brand_id],
    ...(bounty ? { bounty } : {}),
    all_in_cpm_cents: bounty && bounty.all_in_cpm_cents > 0 ? bounty.all_in_cpm_cents : null,
    breakdown: { pool_cents: inv.subtotal_cents, fee_cents: 0, processing_cents: inv.processing_cents, tax_cents: inv.tax_cents, total_cents: inv.total_cents },
  };
});

export interface LedgerFilter {
  /** An account prefix or exact account: "wallet:br_lumi", "creator:", "platform:fees". */
  account?: string;
  bounty?: string;
  post?: string;
  creator?: string;
  brand?: string;
  type?: LedgerType | readonly LedgerType[];
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

export interface LedgerExplorer {
  txns: readonly LedgerTxnView[];
  /** Transactions that do not net to zero (must be none) and platform accounts below zero. */
  anomalies: readonly string[];
  totals: { debit_cents: number; credit_cents: number; txn_count: number };
}

/**
 * The ledger explorer (Ops): filter by account, bounty, post, creator, brand or type; transactions grouped with every leg so the pairs net to zero.
 * Pass `brand: "mine"` for a brand's own view.
 */
export const selectLedger = defineSelector(["ledger", "session"] as const, (db: Db<"ledger" | "session">, f: LedgerFilter | undefined): LedgerExplorer => {
  const filter = f ?? {};
  const brandId = filter.brand === "mine" ? db.session.brand_id : filter.brand;
  const types = asList(filter.type);
  let rows: readonly LedgerEntry[] = valuesOf(db.ledger);
  if (filter.bounty) rows = groupBy(db.ledger, "bounty", (e) => e.bounty_id).get(filter.bounty);
  else if (filter.post) rows = groupBy(db.ledger, "post", (e) => e.post_id).get(filter.post);
  else if (brandId) rows = groupBy(db.ledger, "brand", (e) => e.brand_id).get(brandId);
  else if (filter.creator) rows = groupBy(db.ledger, "account", (e) => e.account).get(`creator:${filter.creator}`);
  const wanted = new Set<string>();
  for (const e of rows) {
    if (filter.account && !e.account.startsWith(filter.account)) continue;
    if (types && !types.includes(e.entry_type)) continue;
    if (filter.from && dateOf(e.posted_at) < filter.from) continue;
    if (filter.to && dateOf(e.posted_at) > filter.to) continue;
    if (filter.q && !`${e.memo} ${e.account} ${e.txn_id}`.toLowerCase().includes(filter.q.toLowerCase())) continue;
    wanted.add(e.txn_id);
  }
  // Whole transactions, never a partial pair: a matching leg pulls in its siblings.
  const legsByTxn = groupBy(db.ledger, "txn", (e) => e.txn_id);
  const txns: LedgerTxnView[] = [];
  for (const id of wanted) {
    const legs = legsByTxn.get(id);
    txns.push(...brandTxns(legs, legs.find((l) => l.account.startsWith("wallet:"))?.account.slice("wallet:".length) ?? ""));
  }
  txns.sort((a, b) => desc(a.posted_at, b.posted_at) || desc(a.txn_id, b.txn_id));
  const anomalies: string[] = [];
  for (const t of txns) {
    const net = t.legs.reduce((s, e) => s + e.amount_cents, 0);
    if (net !== 0) anomalies.push(`${t.txn_id} nets to ${net} cents`);
  }
  let debit = 0;
  let credit = 0;
  for (const t of txns) {
    for (const e of t.legs) {
      if (e.amount_cents < 0) debit += -e.amount_cents;
      else credit += e.amount_cents;
    }
  }
  const limited = filter.limit ? txns.slice(0, filter.limit) : txns;
  return { txns: limited, anomalies, totals: { debit_cents: debit, credit_cents: credit, txn_count: txns.length } };
});

/** The proof that a bounty's escrow balances: money in equals creator pay plus fees plus returned plus what is still held. Null when the bounty is unknown. */
export interface EscrowProof {
  bounty_id: string;
  in_cents: number;
  creator_pay_cents: number;
  platform_fee_cents: number;
  returned_cents: number;
  still_held_cents: number;
  balanced: boolean;
}

export const selectEscrowProof = defineSelector(["ledger", "bounties"] as const, (db: Db<"ledger" | "bounties">, bountyId: string | undefined): EscrowProof | null => {
  const b = bountyId ? db.bounties[bountyId] : undefined;
  if (!b) return null;
  const escrow = `escrow:${b.id}`;
  const legs = groupBy(db.ledger, "bounty", (e) => e.bounty_id).get(b.id);
  const byTxn = new Map<string, LedgerEntry[]>();
  for (const e of legs) {
    const list = byTxn.get(e.txn_id);
    if (list) list.push(e);
    else byTxn.set(e.txn_id, [e]);
  }
  let inCents = 0;
  let pay = 0;
  let fee = 0;
  let returned = 0;
  let balance = 0;
  for (const group of byTxn.values()) {
    const onEscrow = group.filter((e) => e.account === escrow);
    if (onEscrow.length === 0) continue;
    balance += onEscrow.reduce((s, e) => s + e.amount_cents, 0);
    for (const e of onEscrow) if (e.amount_cents > 0) inCents += e.amount_cents;
    // A settlement debits the escrow once and credits the creator and the platform fee in the same transaction.
    if (onEscrow.some((e) => e.amount_cents < 0 && e.entry_type !== "escrow_refund")) {
      pay += group.filter((e) => e.account.startsWith("creator:") && e.amount_cents > 0).reduce((s, e) => s + e.amount_cents, 0);
      fee += group.filter((e) => e.account === "platform:fees" && e.amount_cents > 0).reduce((s, e) => s + e.amount_cents, 0);
    }
    if (onEscrow.some((e) => e.entry_type === "escrow_refund" && e.amount_cents < 0)) returned += -onEscrow.filter((e) => e.entry_type === "escrow_refund").reduce((s, e) => s + e.amount_cents, 0);
  }
  return { bounty_id: b.id, in_cents: inCents, creator_pay_cents: pay, platform_fee_cents: fee, returned_cents: returned, still_held_cents: balance, balanced: inCents === pay + fee + returned + balance };
});
