/**
 * Brand billing: card top-ups, funding invoices and plan changes. Every dollar that enters or leaves a wallet goes through the ledger here.
 */

import type { Auction, Brand, BrandId, Invoice, LineItem, Plan } from "@/lib/contract/types";
import {
  addDays,
  addMonths,
  cardProcessing,
  formatMoney,
  planLabel,
  planPriceCentsMonth,
  subscriptionMemo,
  subscriptionTxn,
  walletTopUpTxn,
} from "@/lib/engine";
import { pad } from "../ids";
import { ActionError, ensure, type Tx } from "./tx";

/** The smallest manual top-up (shortfall top-ups made while funding a bounty can be smaller). */
export const MIN_TOP_UP_CENTS = 1000;
/** The largest single card top-up in the demo. */
export const MAX_TOP_UP_CENTS = 5_000_000;

/** Brand billing needs a card (or bank) on file. */
export function ensurePaymentMethod(brand: Brand): void {
  ensure(brand.billing.payment_method, "no_payment_method", "Add a card before you top up.", "Open Settings, then Plan and billing.", 409);
}

export interface TopUpResult {
  invoice: Invoice;
  amount_cents: number;
  processing_cents: number;
  card_charge_cents: number;
  txn_id: string;
}

/**
 * Tops up a brand wallet by card: the wallet gets `amount_cents`, the card is charged that plus processing (2.9% + $0.30, passed through at
 * cost), and a paid funding invoice is issued with the finance-pack fields.
 */
export function topUpWallet(tx: Tx, brandId: BrandId, amountCents: number, opts: { description?: string; bounty_id?: string; minimum?: number } = {}): TopUpResult {
  const brand = tx.must("brands", brandId, "Brand");
  ensurePaymentMethod(brand);
  ensure(Number.isInteger(amountCents) && amountCents > 0, "invalid_amount", "Enter an amount in dollars.", undefined, 422);
  ensure(amountCents >= (opts.minimum ?? MIN_TOP_UP_CENTS), "amount_too_small", `The smallest top-up is ${formatMoney(opts.minimum ?? MIN_TOP_UP_CENTS)}.`, undefined, 422);
  ensure(amountCents <= MAX_TOP_UP_CENTS, "amount_too_large", `The largest single top-up is ${formatMoney(MAX_TOP_UP_CENTS, { cents: "auto" })}. Contact flowd for larger funding.`, undefined, 422);
  const processing = cardProcessing(amountCents);
  const n = tx.nextNumber("inv");
  const invoiceId = `inv_${pad(n, 4)}`;
  const txnId = tx.nextId("txn");
  const txn = walletTopUpTxn({ txn_id: txnId, posted_at: tx.now, brand_id: brandId, amount_cents: amountCents, invoice_id: invoiceId });
  tx.post(txn);
  const line: LineItem = { description: opts.description ?? "Wallet top-up by card", quantity: 1, unit_cents: amountCents, amount_cents: amountCents, ...(opts.bounty_id ? { bounty_id: opts.bounty_id } : {}) };
  const invoice: Invoice = {
    id: invoiceId,
    brand_id: brandId,
    number: `FD-2026-${pad(n, 4)}`,
    kind: "funding",
    status: "paid",
    ...(opts.bounty_id ? { bounty_id: opts.bounty_id } : {}),
    line_items: [line],
    subtotal_cents: amountCents,
    processing_cents: processing,
    tax_cents: 0,
    total_cents: amountCents + processing,
    ...(brand.billing.vat_id ? { vat_id: brand.billing.vat_id } : {}),
    ...(brand.billing.cost_center ? { cost_center: brand.billing.cost_center } : {}),
    reverse_charge: false,
    issued_at: tx.now,
    due_at: addDays(tx.now, 7),
    paid_at: tx.now,
    ledger_txn_id: txnId,
    pdf_ref: `FD-2026-${pad(n, 4)}.pdf`,
  };
  tx.put("invoices", invoice);
  return { invoice, amount_cents: amountCents, processing_cents: processing, card_charge_cents: amountCents + processing, txn_id: txnId };
}

/** The wallet balance a brand can spend now: the balance less sealed-bid holds on open auctions. */
export function availableWallet(tx: Tx, brandId: BrandId): number {
  const brand = tx.must("brands", brandId, "Brand");
  return brand.wallet_balance_cents - heldForBids(tx, brandId);
}

/** Money held from the wallet for open sealed bids, from a list of auctions (selectors use this; actions use `heldForBids`). */
export function heldForBidsIn(auctions: Iterable<Auction>, brandId: BrandId): number {
  let held = 0;
  for (const a of auctions) {
    if (a.status !== "open" && a.status !== "scheduled" && a.status !== "closed") continue;
    for (const b of a.bids) if (b.brand_id === brandId && b.status === "sealed") held += b.escrow_hold_cents;
  }
  return held;
}

/** Money held from the wallet for open sealed bids. */
export const heldForBids = (tx: Tx, brandId: BrandId): number => heldForBidsIn(tx.all("auctions"), brandId);

export interface PlanChange {
  from: Plan;
  to: Plan;
  invoice?: Invoice;
  /** What the first month costs now. */
  charged_cents: number;
}

/**
 * Moves a brand to another plan. Upgrading charges the new plan's first month by card (a `subscription_fee` ledger transaction and a paid invoice);
 * downgrading takes effect at the next renewal. New bounties use the new plan's take rate; existing bounties keep the rate they were funded at.
 */
export function changePlan(tx: Tx, brandId: BrandId, to: Plan): PlanChange {
  const brand = tx.must("brands", brandId, "Brand");
  const from = brand.plan;
  ensure(from !== to, "same_plan", `You are already on ${planLabel(to)}.`, undefined, 409);
  const price = planPriceCentsMonth(to);
  const upgrading = price > planPriceCentsMonth(from);
  if (!upgrading) {
    tx.patch("brands", brandId, { plan: to });
    return { from, to, charged_cents: 0 };
  }
  ensurePaymentMethod(brand);
  const n = tx.nextNumber("inv");
  const invoiceId = `inv_${pad(n, 4)}`;
  const txnId = tx.nextId("txn");
  const periodEnd = addDays(addMonths(tx.now, 1), -1);
  tx.post(subscriptionTxn({ txn_id: txnId, posted_at: tx.now, brand_id: brandId, amount_cents: price, memo: subscriptionMemo(planLabel(to), tx.now, periodEnd), invoice_id: invoiceId }));
  const invoice: Invoice = {
    id: invoiceId,
    brand_id: brandId,
    number: `FD-2026-${pad(n, 4)}`,
    kind: "subscription",
    status: "paid",
    line_items: [{ description: subscriptionMemo(planLabel(to), tx.now, periodEnd), quantity: 1, unit_cents: price, amount_cents: price }],
    subtotal_cents: price,
    processing_cents: 0,
    tax_cents: 0,
    total_cents: price,
    reverse_charge: false,
    issued_at: tx.now,
    due_at: addDays(tx.now, 14),
    paid_at: tx.now,
    ledger_txn_id: txnId,
    pdf_ref: `FD-2026-${pad(n, 4)}.pdf`,
  };
  tx.put("invoices", invoice);
  tx.patch("brands", brandId, { plan: to, plan_renews_at: addMonths(tx.now, 1) });
  return { from, to, invoice, charged_cents: price };
}

/** Throws unless the wallet covers `needed`, with the exact shortfall and the card charge for it in the hint. */
export function ensureWalletCovers(tx: Tx, brandId: BrandId, needed: number): void {
  const available = availableWallet(tx, brandId);
  if (available >= needed) return;
  const shortfall = needed - available;
  throw new ActionError(
    "insufficient_funds",
    `The wallet is ${formatMoney(shortfall)} short for this.`,
    `Top up at least ${formatMoney(shortfall)} (the card charge is ${formatMoney(shortfall + cardProcessing(shortfall))} with processing at cost).`,
    402,
  );
}
