/**
 * The brand wallet and billing as actions: card top-ups, plan changes, the card on file and invoice finance fields.
 * (Escrow funding of a bounty lives in `bounties.ts`; this is the money that gets the wallet ready for it.)
 */

import type { Brand, Invoice, PaymentMethod, Plan } from "@/lib/contract/types";
import { formatMoney, planLabel } from "@/lib/engine";
import { changePlan, topUpWallet, type PlanChange, type TopUpResult } from "./billing";
import { requireBrand } from "./guards";
import { describeActor, logActivity } from "./notify";
import { ensure, type Tx } from "./tx";

/** Adds money to the brand wallet by card. The card is charged the amount plus processing at cost (2.9% + $0.30); the wallet gets exactly the amount. */
export function fundWallet(tx: Tx, input: { amount_cents: number }): TopUpResult & { balance_cents: number } {
  const { brand, member } = requireBrand(tx, null, "finance");
  const result = topUpWallet(tx, brand.id, input.amount_cents);
  logActivity(tx, {
    brand_id: brand.id,
    action: "wallet_topped_up",
    summary: `${describeActor(tx, member?.id)} added ${formatMoney(input.amount_cents)} to the wallet (card charge ${formatMoney(result.card_charge_cents)})`,
    actor_member_id: member?.id,
    target_kind: "invoice",
    target_id: result.invoice.id,
  });
  return { ...result, balance_cents: tx.must("brands", brand.id).wallet_balance_cents };
}

/** Moves the workspace to another plan. An upgrade is charged by card at once; a downgrade takes effect at the next renewal. */
export function changeBrandPlan(tx: Tx, input: { plan: Plan }): PlanChange {
  const { brand, member } = requireBrand(tx, null, "manage");
  const change = changePlan(tx, brand.id, input.plan);
  logActivity(tx, {
    brand_id: brand.id,
    action: "plan_changed",
    summary: `${describeActor(tx, member?.id)} moved the workspace from ${planLabel(change.from)} to ${planLabel(change.to)}`,
    actor_member_id: member?.id,
    target_kind: "brand",
    target_id: brand.id,
  });
  return change;
}

/** Saves the card or bank account the wallet is funded from. Only the last four digits are ever sent or stored. */
export function setPaymentMethod(tx: Tx, input: { kind: PaymentMethod["kind"]; label?: string; last4: string; exp?: string }): { brand: Brand; payment_method: PaymentMethod } {
  const { brand } = requireBrand(tx, null, "finance");
  ensure(/^\d{4}$/.test(input.last4), "last4_invalid", "Enter the last four digits of the card or account.", "We never ask for the full number in the demo.", 422);
  if (input.exp !== undefined) ensure(/^(0[1-9]|1[0-2])\/\d{2}$/.test(input.exp), "exp_invalid", "Enter the expiry as MM/YY.", undefined, 422);
  const payment_method: PaymentMethod = { kind: input.kind, label: input.label?.trim() || (input.kind === "card" ? "Card" : "Bank account"), last4: input.last4, ...(input.exp ? { exp: input.exp } : {}) };
  const next = tx.patch("brands", brand.id, { billing: { ...brand.billing, payment_method } });
  return { brand: next, payment_method };
}

/** Finance fields on an invoice: the PO number, the cost centre and the VAT id (editable on the printable invoice). */
export function updateInvoice(tx: Tx, input: { invoice_id: string; po_number?: string; cost_center?: string; vat_id?: string }): { invoice: Invoice } {
  const invoice = tx.must("invoices", input.invoice_id, "Invoice");
  requireBrand(tx, invoice.brand_id, "finance");
  const clean = (v: string | undefined): string | undefined => (v === undefined ? undefined : v.trim() || undefined);
  const next: Invoice = { ...invoice };
  const po = clean(input.po_number);
  const cc = clean(input.cost_center);
  const vat = clean(input.vat_id);
  if (input.po_number !== undefined) {
    if (po) next.po_number = po;
    else delete next.po_number;
  }
  if (input.cost_center !== undefined) {
    if (cc) next.cost_center = cc;
    else delete next.cost_center;
  }
  if (input.vat_id !== undefined) {
    if (vat) next.vat_id = vat;
    else delete next.vat_id;
  }
  return { invoice: tx.put("invoices", next) };
}

/** Logs that someone exported data (CSV, a finance pack) so the activity log can answer "who took this out". */
export function recordExport(tx: Tx, input: { what: string; target_kind?: string; target_id?: string }): { logged: true } {
  const { brand, member } = requireBrand(tx, null, "view");
  logActivity(tx, {
    brand_id: brand.id,
    action: "export_created",
    summary: `${describeActor(tx, member?.id)} exported ${input.what.trim() || "data"}`,
    actor_member_id: member?.id,
    ...(input.target_kind ? { target_kind: input.target_kind } : {}),
    ...(input.target_id ? { target_id: input.target_id } : {}),
  });
  return { logged: true };
}

/** Logs an invoice download or print. */
export function recordInvoiceDownload(tx: Tx, input: { invoice_id: string }): { invoice: Invoice } {
  const invoice = tx.must("invoices", input.invoice_id, "Invoice");
  const { brand, member } = requireBrand(tx, invoice.brand_id, "finance");
  logActivity(tx, { brand_id: brand.id, action: "invoice_downloaded", summary: `${describeActor(tx, member?.id)} downloaded invoice ${invoice.number}`, actor_member_id: member?.id, target_kind: "invoice", target_id: invoice.id });
  return { invoice };
}
