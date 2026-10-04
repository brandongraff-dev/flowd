/**
 * Cash-out. The weekly payout (Fridays 18:00 UTC) is free and automatic; an instant cash-out pays the cleared money now for a fee that is shown
 * before the creator confirms (1.5%, minimum $0.50, maximum $15, free for Platinum and Elite, once a week for Gold, and for founding creators).
 */

import type { LedgerEntry, Payout } from "@/lib/contract/types";
import {
  estimatePayoutArrival,
  foundingFreeActive,
  formatMoney,
  freeInstantUsedThisWeek,
  hashString,
  instantCashOutPreview,
  instantPayoutTxn,
  type InstantCashOutPreview,
} from "@/lib/engine";
import { createProof, earningRows, ensureNoPayoutHold, payRows, pushTicker, scheduleWeekly } from "./earnings";
import { requireCreator } from "./guards";
import { notifyCreator } from "./notify";
import { ensure, ActionError, type Tx } from "./tx";

/** The cleared, unpaid earning rows a cash-out can include (all of them, or the chosen subset). */
export function cashOutRows(tx: Tx, creatorId: string, rowIds?: readonly string[]): LedgerEntry[] {
  const cleared = earningRows(tx, creatorId).filter((e) => e.status === "cleared" && !e.payout_id);
  if (!rowIds || rowIds.length === 0) return cleared;
  const set = new Set(rowIds);
  const picked = cleared.filter((e) => set.has(e.id));
  ensure(picked.length === set.size, "invalid_rows", "Some of those earnings are not cleared yet, or are already in a payout.", undefined, 422);
  return picked;
}

/** The fee preview shown before confirm: fee, net, and why it is free when it is. */
export function previewInstant(tx: Tx, creatorId: string, rowIds?: readonly string[]): InstantCashOutPreview & { gross_cents: number; row_count: number } {
  const creator = tx.must("creators", creatorId, "Creator");
  const rows = cashOutRows(tx, creatorId, rowIds);
  const gross = rows.reduce((s, r) => s + r.amount_cents, 0);
  const preview = instantCashOutPreview({
    amount_cents: gross,
    tier: creator.tier,
    founding_free: foundingFreeActive({ founding: creator.founding, founding_perks_until: creator.founding_perks_until, now: tx.now }),
    free_instant_used_this_week: freeInstantUsedThisWeek(tx.all("payouts").filter((p) => p.creator_id === creatorId), tx.now),
    cleared_cents: earningRows(tx, creatorId).filter((e) => e.status === "cleared" && !e.payout_id).reduce((s, r) => s + r.amount_cents, 0),
  });
  return { ...preview, gross_cents: gross, row_count: rows.length };
}

export interface InstantCashOutInput {
  /** Earning rows to cash out; omit for everything cleared. */
  row_ids?: string[];
  /** The fee the creator was shown. If it no longer matches, nothing is paid (the fee is confirmed first, never a surprise). */
  confirm_fee_cents?: number;
}

/** Instant cash-out: the cleared earnings go to the bank now. The fee and the net are quoted first; money is `paid` (in transit) at once. */
export function requestPayout(tx: Tx, input: InstantCashOutInput = {}): { payout: Payout; fee_cents: number; net_cents: number; arrives_at: string } {
  const { creator } = requireCreator(tx);
  ensureNoPayoutHold(tx, creator);
  ensure(creator.payout_method?.instant_capable === true, "not_instant_capable", "Your payout method does not support instant cash-out.", "Add a debit card to cash out instantly, or wait for the free weekly payout.", 409);
  const quote = previewInstant(tx, creator.id, input.row_ids);
  if (!quote.ok) throw new ActionError(quote.reason === "below_minimum" ? "below_minimum" : "exceeds_cleared", quote.summary, undefined, 422);
  if (input.confirm_fee_cents !== undefined && input.confirm_fee_cents !== quote.fee_cents) {
    throw new ActionError("fee_changed", `The fee is now ${formatMoney(quote.fee_cents)} (you were shown ${formatMoney(input.confirm_fee_cents)}). Nothing was paid.`, "Review the new fee and confirm again.", 409);
  }
  const rows = cashOutRows(tx, creator.id, input.row_ids);
  const id = tx.nextId("pay");
  const txnId = tx.nextId("txn");
  tx.post(instantPayoutTxn({ txn_id: txnId, posted_at: tx.now, creator_id: creator.id, payout_id: id, gross_cents: quote.gross_cents, fee_cents: quote.fee_cents, fee_label: formatMoney(quote.fee_cents) }));
  const arrives = estimatePayoutArrival({ kind: "instant", initiated_at: tx.now });
  const payout: Payout = {
    id,
    creator_id: creator.id,
    kind: "instant",
    status: "in_transit",
    gross_cents: quote.gross_cents,
    fee_cents: quote.fee_cents,
    net_cents: quote.net_cents,
    requested_at: tx.now,
    scheduled_for: tx.now,
    initiated_at: tx.now,
    method_label: creator.payout_method ? `${creator.payout_method.label} ••${creator.payout_method.last4}` : "Bank account",
    stripe_transfer_id: `tr_${hashString(`${id}|tr`).toString(36).padStart(12, "0").slice(0, 12)}`,
    ledger_txn_id: txnId,
    item_count: rows.length,
    tier_at_payout: creator.tier,
    free_instant: quote.free_instant,
    proof_id: `prf_${hashString(`proof|${id}`).toString(36).padStart(8, "0").slice(0, 8)}`,
  };
  tx.put("payouts", payout);
  payRows(tx, rows, payout, tx.now, arrives);
  createProof(tx, payout);
  pushTicker(tx, payout);
  scheduleWeekly(tx, creator.id);
  notifyCreator(tx, creator.id, {
    kind: "payout_paid",
    title: `${formatMoney(quote.net_cents)} is on its way`,
    body: quote.free_instant ? `Instant cash-out, free. It arrives about ${new Date(arrives).getUTCHours() % 12 || 12}:${String(new Date(arrives).getUTCMinutes()).padStart(2, "0")} ${new Date(arrives).getUTCHours() < 12 ? "AM" : "PM"} UTC.` : `Fee ${formatMoney(quote.fee_cents)}. It arrives within 30 minutes.`,
    amount_cents: quote.net_cents,
    path: `payout/${id}`,
    ref_kind: "payout",
    ref_id: id,
  });
  return { payout, fee_cents: quote.fee_cents, net_cents: quote.net_cents, arrives_at: arrives };
}
