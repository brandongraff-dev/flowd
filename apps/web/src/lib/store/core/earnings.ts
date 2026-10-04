/**
 * How a post turns into money, step by step, on the ledger and the Money Clock.
 *
 *   attach post   -> an accruing Money Clock row (a live estimate)
 *   window closes -> the CPM (or flat) leg is settled: escrow -(pay + fee), creator +pay [pending], platform:fees +fee; row is pending with a dated ETA
 *   clearing run  -> 14:00 UTC: after the fraud and disclosure check the creator row clears; CPA batches clear after their own windows
 *   weekly run    -> Friday 18:00 UTC: cleared rows become paid in one payout (free); an instant cash-out does it now for a fee
 *
 * Every state change writes the ledger row, the Money Clock row and the post together, so the three never disagree (DOMAIN L-16, L-18).
 */

import type {
  Bounty,
  Conversion,
  Creator,
  HoldReason,
  IsoTimestamp,
  LedgerEntry,
  MoneyClockRow,
  Payout,
  PayoutRun,
  Post,
  Proof,
  TickerEvent,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  addHours,
  clockLabel,
  conversionRunOnPost,
  dateOf,
  estimatePayoutArrival,
  formatMoney,
  hashString,
  HOLD_TO_REASON,
  makeArtSeed,
  markCleared,
  markPaid,
  nextClearingRun,
  nextWeeklyPayout,
  promoTxn,
  payoutRunId,
  postClearingRun,
  reasonText,
  seededRng,
  settleCpaBatch,
  settleCpmLeg,
  settleFlatFee,
  spendFromRemaining,
  toMs,
  typicalBand,
  weeklyPayoutFor,
  weeklyPayoutTxn,
  windowEndsAt,
  type FundingSource,
  type LegResult,
} from "@/lib/engine";
import { applyEscrow, escrowOf } from "./escrow";
import { isEarning } from "./creator-stats";
import { notifyBrand, notifyCreator } from "./notify";
import { ensure, type Tx } from "./tx";

// ── helpers ────────────────────────────────────────────────────────────────────────────────────

/** The creator's earning rows on the ledger (positive legs on `creator:<id>` of an earning type). */
export function earningRows(tx: Tx, creatorId: string): LedgerEntry[] {
  const account = `creator:${creatorId}`;
  return tx.all("ledger").filter((e) => e.account === account && isEarning(e));
}

/** Pool pay (cpm + cpa) already settled on a post: the legs that count against the per-video cap. */
export function poolPaidOnPost(tx: Tx, postId: string): number {
  let sum = 0;
  for (const e of tx.all("ledger")) if (e.post_id === postId && e.account.startsWith("creator:") && (e.entry_type === "cpm" || e.entry_type === "cpa") && e.status !== "reversed") sum += e.amount_cents;
  return sum;
}

const label = (tx: Tx, bounty: Bounty): string => `${tx.get("apps", bounty.app_id)?.name ?? "App"}: ${bounty.title}`;

/** The Money Clock rows of a post. */
export const clockRowsOfPost = (tx: Tx, postId: string): MoneyClockRow[] => tx.all("money_clock").filter((r) => r.post_id === postId);

/** Writes the dated reason text a row shows, from its state and ETA. */
function clockText(row: Pick<MoneyClockRow, "reason" | "eta_at">, windowEnd?: IsoTimestamp, arrives?: IsoTimestamp): string {
  return reasonText({ reason: row.reason, eta_at: row.eta_at, window_ends_at: windowEnd, arrives_at: arrives });
}

/** What stops a creator's cleared money from paying out: no payout method, identity not verified, or no tax form (just-in-time at first approval). */
export function payoutHold(tx: Tx, creator: Creator): HoldReason | null {
  const method = creator.payout_method;
  if (!method || method.status !== "active") return "payout_method_missing";
  if (creator.verification_status !== "verified") return "identity_check";
  const tax = tx.all("tax_profiles").find((t) => t.creator_id === creator.id);
  if (CONSTANTS.tax.hold_payout_without_tax_info && (!tax || tax.status !== "verified")) return "tax_info_missing";
  return null;
}

const HOLD_NEXT_STEP: Record<HoldReason, string> = {
  fraud_review: "A person is reviewing the views and decides within 24 hours.",
  dispute_open: "Held while your dispute is open.",
  tax_info_missing: "Add your W-9 to release this payout.",
  identity_check: "Verify your identity to release this payout.",
  payout_method_missing: "Add a bank account or debit card to release this payout.",
  compliance_fail: "The posted video failed the disclosure check. Fix the caption to release it.",
  admin_hold: "Ops is holding this payout. They reply within 24 hours.",
};
export const holdNextStep = (reason: HoldReason): string => HOLD_NEXT_STEP[reason];

// ── accrual: a post goes live ──────────────────────────────────────────────────────────────────

/** Opens the Money Clock for a new post: an accruing row with the estimate, the end of the 72-hour window and the clearing run after it. */
export function openAccrual(tx: Tx, post: Post, bounty: Bounty, estimateCents: number): MoneyClockRow {
  const windowEnd = windowEndsAt(post.posted_at);
  const eta = postClearingRun(windowEnd);
  const row: MoneyClockRow = {
    id: tx.nextId("mc"),
    creator_id: post.creator_id,
    bounty_id: bounty.id,
    app_id: bounty.app_id,
    post_id: post.id,
    source: bounty.type === "direct" ? "flat_fee" : "cpm",
    state: "accruing",
    amount_cents: estimateCents,
    estimated: true,
    earned_at: post.posted_at,
    eta_at: eta,
    reason: "window_open",
    reason_text: reasonText({ reason: "window_open", eta_at: eta, window_ends_at: windowEnd }),
    label: label(tx, bounty),
  };
  return tx.put("money_clock", row);
}

// ── settlement ─────────────────────────────────────────────────────────────────────────────────

/** Posts a settlement leg from escrow, or from the wallet when the pool cannot cover it (an approved post is always paid). */
function settleFromEscrowOrWallet(tx: Tx, bountyId: string, build: (source: FundingSource) => LegResult): LegResult {
  let res = build("escrow");
  if (!res.txn) return res;
  const actual = res.pay_cents + res.fee_cents;
  const b = tx.must("bounties", bountyId);
  if (b.remaining_cents + b.reserved_cents >= actual && b.remaining_cents >= actual) {
    tx.post(res.txn);
    const spent = spendFromRemaining(escrowOf(b), { pay_cents: res.pay_cents, fee_cents: res.fee_cents });
    applyEscrow(tx, bountyId, spent.state);
    return res;
  }
  res = build("wallet");
  if (res.txn) {
    tx.post(res.txn);
    const brand = tx.must("brands", b.brand_id);
    if (brand.wallet_balance_cents < 0) {
      notifyBrand(tx, b.brand_id, {
        kind: "funding_needed",
        title: "Your wallet needs funds",
        body: `The pool for "${b.title}" is spent, so an approved post was paid from the wallet. The balance is ${formatMoney(brand.wallet_balance_cents)}. Top up to cover it.`,
        route: "/brand/wallet",
        ref_kind: "bounty",
        ref_id: b.id,
      });
    }
  }
  return res;
}

export interface WindowSettlement {
  post: Post;
  pay_cents: number;
  fee_cents: number;
  held: HoldReason | null;
}

/**
 * The 72-hour window of a post closes: its views are final and the CPM (or flat) leg is settled. A post with a fraud score of 40 or more, or a failed
 * disclosure that blocks settlement, is held with a named reason instead of clearing.
 */
export function settlePostWindow(tx: Tx, postId: string): WindowSettlement {
  const post = tx.must("posts", postId, "Post");
  const bounty = tx.must("bounties", post.bounty_id, "Bounty");
  const windowEnd = post.window_ends_at;
  const run = postClearingRun(windowEnd);
  const flagged = post.fraud.score >= CONSTANTS.fraud.review_threshold;
  const audit = tx.all("compliance_checks").find((c) => c.post_id === postId);
  const blocked = audit !== undefined && audit.blocks_settlement && !audit.fixed_at && !audit.waived_by_member_id;
  const held: HoldReason | null = flagged ? "fraud_review" : blocked ? "compliance_fail" : null;
  const rates = { install: bounty.cpa_install_cents, trial: bounty.cpa_trial_cents, paid: bounty.cpa_paid_cents };
  const already = poolPaidOnPost(tx, postId);
  const base = {
    bounty: { id: bounty.id, brand_id: bounty.brand_id, title: bounty.title, cpm_cents: bounty.cpm_cents, per_video_cap_cents: bounty.per_video_cap_cents, take_rate: bounty.take_rate, rates },
    post: { id: post.id, creator_id: post.creator_id, submission_id: post.submission_id },
    posted_at: windowEnd,
  };
  let pay = 0;
  let fee = 0;
  let capped = false;
  let flatPaid = 0;
  const ledgerIds: string[] = [];
  const settledBefore = tx.all("ledger").some((e) => e.post_id === postId && (e.entry_type === "cpm" || e.entry_type === "flat_fee") && e.account.startsWith("creator:"));
  if (!settledBefore) {
    if (bounty.cpm_cents > 0) {
      const cpm = settleFromEscrowOrWallet(tx, bounty.id, (source) => settleCpmLeg({ ...base, txn_id: tx.nextId("txn"), window_views: post.views, already_paid_cents: already, source, creator_status: "pending" }));
      pay += cpm.pay_cents;
      fee += cpm.fee_cents;
      capped = capped || cpm.capped;
    }
    if (bounty.flat_fee_cents > 0) {
      const flat = settleFromEscrowOrWallet(tx, bounty.id, (source) => {
        const r = settleFlatFee({ txn_id: tx.nextId("txn"), posted_at: windowEnd, brand_id: bounty.brand_id, bounty_id: bounty.id, creator_id: post.creator_id, post_id: post.id, submission_id: post.submission_id, price_cents: bounty.flat_fee_cents, take_rate: bounty.take_rate, title: bounty.title, label: bounty.is_starter ? "Starter bounty" : "Flat fee", source });
        return { txn: r.txn, pay_cents: r.pay_cents, fee_cents: r.fee_cents, capped: false, cap_remaining_cents: 0 };
      });
      flatPaid += flat.pay_cents;
      fee += flat.fee_cents;
    }
  }
  const creatorRows = tx.all("ledger").filter((e) => e.post_id === postId && e.account === `creator:${post.creator_id}` && (e.entry_type === "cpm" || e.entry_type === "flat_fee") && e.status === "pending");
  for (const r of creatorRows) {
    ledgerIds.push(r.id);
    if (held) tx.put("ledger", { ...r, status: "held" });
  }
  const totalPay = pay + flatPaid;
  const poolPaid = poolPaidOnPost(tx, postId);
  tx.patch("posts", postId, {
    status: held ? "held" : "window_closed",
    ...(held ? { hold_reason: held } : {}),
    window_views: post.views,
    earnings: { ...post.earnings, cpm_cents: post.earnings.cpm_cents + pay, flat_cents: post.earnings.flat_cents + flatPaid, total_cents: post.earnings.total_cents + totalPay, capped: post.earnings.capped || capped, cap_remaining_cents: Math.max(0, bounty.per_video_cap_cents - poolPaid) },
  });
  // Money Clock: the accruing row becomes pending (or held) with the real amount and the ledger row.
  const ownerRow = tx.all("ledger").find((e) => ledgerIds.includes(e.id));
  const mc = clockRowsOfPost(tx, postId).find((r) => (r.source === "cpm" || r.source === "flat_fee") && r.state === "accruing");
  const nowAfterFraudCheck = toMs(tx.now) >= toMs(addHours(windowEnd, CONSTANTS.windows.fraud_check_max_hours));
  const clockPatch: Partial<MoneyClockRow> = held
    ? { state: "held", amount_cents: totalPay, estimated: false, reason: HOLD_TO_REASON[held], eta_at: undefined, ...(ownerRow ? { ledger_id: ownerRow.id } : {}) }
    : { state: "pending", amount_cents: totalPay, estimated: false, reason: nowAfterFraudCheck ? "awaiting_clearing_run" : "fraud_check", eta_at: run, ...(ownerRow ? { ledger_id: ownerRow.id } : {}) };
  if (mc) {
    const next = { ...mc, ...clockPatch } as MoneyClockRow;
    if (next.eta_at === undefined) delete (next as Partial<MoneyClockRow>).eta_at;
    next.reason_text = held ? holdNextStep(held) : clockText(next, windowEnd);
    tx.put("money_clock", next);
  } else if (totalPay > 0) {
    const row: MoneyClockRow = { id: tx.nextId("mc"), creator_id: post.creator_id, bounty_id: bounty.id, app_id: bounty.app_id, post_id: postId, source: bounty.type === "direct" ? "flat_fee" : "cpm", state: "pending", amount_cents: totalPay, estimated: false, earned_at: post.posted_at, eta_at: run, reason: "fraud_check", reason_text: "", label: label(tx, bounty), ...(ownerRow ? { ledger_id: ownerRow.id } : {}), ...(clockPatch as object) } as MoneyClockRow;
    row.reason_text = held ? holdNextStep(held) : clockText(row, windowEnd);
    if (held) delete (row as Partial<MoneyClockRow>).eta_at;
    tx.put("money_clock", row);
  }
  return { post: tx.must("posts", postId), pay_cents: totalPay, fee_cents: fee, held };
}

/** Clears a post's CPM (or flat) earnings at a clearing run: rows go pending -> cleared on the ledger and the Money Clock, and the creator is told. */
export function clearPostEarnings(tx: Tx, postId: string, runAt: IsoTimestamp): { cleared_cents: number } {
  const post = tx.must("posts", postId, "Post");
  const bounty = tx.must("bounties", post.bounty_id);
  let cleared = 0;
  for (const e of tx.all("ledger")) {
    if (e.post_id !== postId || e.account !== `creator:${post.creator_id}` || e.status !== "pending") continue;
    if (e.entry_type !== "cpm" && e.entry_type !== "flat_fee") continue;
    tx.put("ledger", markCleared(e, runAt));
    cleared += e.amount_cents;
  }
  const payAt = weeklyPayoutFor(runAt);
  for (const r of clockRowsOfPost(tx, postId)) {
    if ((r.source !== "cpm" && r.source !== "flat_fee") || r.state !== "pending") continue;
    const next: MoneyClockRow = { ...r, state: "cleared", reason: "awaiting_weekly_payout", eta_at: payAt, cleared_at: runAt, estimated: false, reason_text: "" };
    next.reason_text = clockText(next);
    tx.put("money_clock", next);
  }
  tx.patch("posts", postId, { status: "cleared", cleared_at: runAt });
  if (cleared > 0) {
    notifyCreator(tx, post.creator_id, {
      kind: "cash_event",
      title: `Cleared +${formatMoney(cleared)}`,
      body: `${label(tx, bounty)} passed the view and disclosure check. It pays out ${clockLabel(payAt)} UTC (weekly payout, free), or cash out now.`,
      amount_cents: cleared,
      path: `post/${postId}`,
      ref_kind: "post",
      ref_id: postId,
    });
  }
  return { cleared_cents: cleared };
}

/**
 * Settles the conversion batches whose clearing window has passed at `runAt`: a payable batch (link or code) writes a CPA ledger leg that is cleared at
 * once (the cap shared with the CPM leg applies); an estimated batch just closes. Returns the number of batches cleared and the pay cleared.
 */
export function clearConversions(tx: Tx, runAt: IsoTimestamp): { batches: number; cleared_cents: number } {
  let batches = 0;
  let clearedCents = 0;
  const due = tx
    .all("conversions")
    .filter((c) => c.status === "pending")
    .map((c) => ({ c, post: tx.get("posts", c.post_id) }))
    .filter((x): x is { c: Conversion; post: Post } => x.post !== undefined && x.post.status !== "removed" && x.post.status !== "clawed_back" && x.post.status !== "live" && x.post.status !== "held")
    .filter((x) => toMs(conversionRunOnPost(x.c.kind, x.c.first_at, x.post.posted_at)) <= toMs(runAt))
    .sort((a, b) => (a.c.first_at < b.c.first_at ? -1 : a.c.first_at > b.c.first_at ? 1 : 0));
  for (const { c, post } of due) {
    const bounty = tx.must("bounties", post.bounty_id);
    const brand = tx.get("brands", bounty.brand_id);
    const payAt = weeklyPayoutFor(runAt);
    let ledgerTxn: string | undefined;
    let capped = c.capped;
    if (c.payable && brand) {
      const rates = { install: bounty.cpa_install_cents, trial: bounty.cpa_trial_cents, paid: bounty.cpa_paid_cents };
      const already = poolPaidOnPost(tx, post.id);
      const res = settleFromEscrowOrWallet(tx, bounty.id, (source) =>
        settleCpaBatch({ bounty: { id: bounty.id, brand_id: bounty.brand_id, title: bounty.title, cpm_cents: bounty.cpm_cents, per_video_cap_cents: bounty.per_video_cap_cents, take_rate: bounty.take_rate, rates }, post: { id: post.id, creator_id: post.creator_id, submission_id: post.submission_id }, posted_at: runAt, already_paid_cents: already, source, creator_status: "cleared", txn_id: tx.nextId("txn"), batch: { id: c.id, kind: c.kind, source: c.source, quantity: c.quantity, status: "cleared", occurred_on: c.occurred_on } }),
      );
      capped = capped || res.capped;
      if (res.txn) {
        ledgerTxn = res.txn.txn_id;
        clearedCents += res.pay_cents;
        const poolPaid = poolPaidOnPost(tx, post.id);
        const cur = tx.must("posts", post.id);
        tx.patch("posts", post.id, { earnings: { ...cur.earnings, cpa_cents: cur.earnings.cpa_cents + res.pay_cents, total_cents: cur.earnings.total_cents + res.pay_cents, capped: cur.earnings.capped || res.capped, cap_remaining_cents: Math.max(0, bounty.per_video_cap_cents - poolPaid) } });
        const creatorLeg = tx.all("ledger").find((e) => e.txn_id === res.txn?.txn_id && e.account === `creator:${post.creator_id}`);
        const mc = tx.all("money_clock").find((r) => r.conversion_id === c.id);
        if (mc) {
          const next: MoneyClockRow = { ...mc, state: "cleared", amount_cents: res.pay_cents, estimated: false, reason: "awaiting_weekly_payout", eta_at: payAt, cleared_at: runAt, reason_text: "", ...(creatorLeg ? { ledger_id: creatorLeg.id } : {}) };
          next.reason_text = clockText(next);
          tx.put("money_clock", next);
        }
        batches += 1;
      }
    }
    tx.put("conversions", { ...c, status: "cleared", capped, cleared_at: runAt, ...(ledgerTxn ? { ledger_txn_id: ledgerTxn } : {}) } as Conversion);
  }
  return { batches, cleared_cents: clearedCents };
}

// ── weekly payout schedule ─────────────────────────────────────────────────────────────────────

const proofIdFor = (payoutId: string): string => `prf_${hashString(`proof|${payoutId}`).toString(36).padStart(8, "0").slice(0, 8)}`;

const methodLabel = (c: Creator): string => (c.payout_method ? `${c.payout_method.label} ••${c.payout_method.last4}` : "No payout method");

/** Rebuilds the totals of a payout run from the payouts that carry its id. */
export function refreshRun(tx: Tx, runId: string, patch: Partial<PayoutRun> = {}): PayoutRun {
  const date = runId.slice("run_".length);
  const payouts = tx.all("payouts").filter((p) => p.run_id === runId);
  const held = payouts.filter((p) => p.status === "held");
  const holds = new Map<HoldReason, { count: number; cents: number }>();
  for (const p of held) {
    if (!p.hold_reason) continue;
    const cur = holds.get(p.hold_reason) ?? { count: 0, cents: 0 };
    holds.set(p.hold_reason, { count: cur.count + 1, cents: cur.cents + p.gross_cents });
  }
  const existing = tx.get("payout_runs", runId);
  const row: PayoutRun = {
    id: runId,
    run_date: date,
    scheduled_for: `${date}T18:00:00Z`,
    status: "scheduled",
    ...(existing ?? {}),
    payouts_count: payouts.length,
    total_gross_cents: payouts.reduce((s, p) => s + p.gross_cents, 0),
    total_fee_cents: payouts.reduce((s, p) => s + p.fee_cents, 0),
    total_net_cents: payouts.reduce((s, p) => s + p.net_cents, 0),
    paid_count: payouts.filter((p) => p.status === "paid").length,
    failed_count: payouts.filter((p) => p.status === "failed").length,
    held_count: held.length,
    held_cents: held.reduce((s, p) => s + p.gross_cents, 0),
    holds: [...holds.entries()].map(([reason, v]) => ({ reason, count: v.count, cents: v.cents })),
    ...patch,
  };
  return tx.put("payout_runs", row);
}

/**
 * Keeps one scheduled weekly payout per creator for the next run: it carries every cleared earning row that is not yet in a payout, and is `held` with a
 * named reason while a payout-level hold applies (no tax form, identity not verified, no payout method). No cleared money means no scheduled payout.
 */
export function scheduleWeekly(tx: Tx, creatorId: string, runAt?: IsoTimestamp): Payout | null {
  const creator = tx.must("creators", creatorId, "Creator");
  const at = runAt ?? nextWeeklyPayout(tx.now);
  const runId = payoutRunId(at);
  const rows = earningRows(tx, creatorId).filter((e) => e.status === "cleared" && !e.payout_id);
  const existing = tx.all("payouts").find((p) => p.creator_id === creatorId && p.kind === "weekly" && p.run_id === runId && (p.status === "scheduled" || p.status === "held"));
  if (rows.length === 0) {
    if (existing) {
      tx.patch("payouts", existing.id, { status: "cancelled" });
      refreshRun(tx, runId);
    }
    return null;
  }
  const gross = rows.reduce((s, r) => s + r.amount_cents, 0);
  const hold = payoutHold(tx, creator);
  const id = existing?.id ?? tx.nextId("pay");
  const payout: Payout = {
    id,
    creator_id: creatorId,
    kind: "weekly",
    status: hold ? "held" : "scheduled",
    gross_cents: gross,
    fee_cents: 0,
    net_cents: gross,
    run_id: runId,
    requested_at: existing?.requested_at ?? tx.now,
    scheduled_for: at,
    ...(hold ? { hold_reason: hold } : {}),
    method_label: methodLabel(creator),
    item_count: rows.length,
    tier_at_payout: creator.tier,
    free_instant: false,
    proof_id: existing?.proof_id ?? proofIdFor(id),
  };
  tx.put("payouts", payout);
  refreshRun(tx, runId);
  return payout;
}

/** Re-checks payout holds after something changed (a W-9, an ID check, a bank account): flips held payouts back to scheduled and the Money Clock rows with them. */
export function reevaluatePayoutHolds(tx: Tx, creatorId: string): void {
  const creator = tx.must("creators", creatorId, "Creator");
  const hold = payoutHold(tx, creator);
  const payoutLevel: HoldReason[] = ["payout_method_missing", "identity_check", "tax_info_missing"];
  for (const r of tx.all("money_clock")) {
    if (r.creator_id !== creatorId) continue;
    const held = payoutLevel.find((h) => HOLD_TO_REASON[h] === r.reason);
    if (r.state === "held" && held && hold === null) {
      const payAt = nextWeeklyPayout(tx.now);
      const next: MoneyClockRow = { ...r, state: "cleared", reason: "awaiting_weekly_payout", eta_at: payAt, reason_text: "" };
      next.reason_text = clockText(next);
      tx.put("money_clock", next);
    } else if (r.state === "cleared" && hold && !r.payout_id) {
      const next: MoneyClockRow = { ...r, state: "held", reason: HOLD_TO_REASON[hold], reason_text: holdNextStep(hold) };
      delete (next as Partial<MoneyClockRow>).eta_at;
      tx.put("money_clock", next);
    }
  }
  scheduleWeekly(tx, creatorId);
}

// ── proofs and the public ticker ───────────────────────────────────────────────────────────────

/** A public proof page for a payout: the verified amount, the tier and the typical creator beside it. */
export function createProof(tx: Tx, payout: Payout): Proof {
  const existing = tx.get("proofs", payout.proof_id);
  if (existing) return existing;
  const creator = tx.must("creators", payout.creator_id);
  const ticker = tx.doc("ticker");
  const rows = earningRows(tx, payout.creator_id).filter((e) => e.payout_id === payout.id);
  const dates = rows.map((r) => r.posted_at).sort();
  const sizes = tx.all("payouts").filter((p) => p.status === "paid").map((p) => p.gross_cents);
  const band = typicalBand(sizes.length > 0 ? sizes : [ticker.totals.typical_creator_30d_cents]);
  const proof: Proof = {
    id: payout.proof_id,
    kind: "payout",
    creator_id: creator.id,
    handle: creator.handle,
    anonymous: false,
    payout_id: payout.id,
    period_label: payout.run_id ? `Weekly payout ${payout.run_id.slice(4)}` : "Instant cash-out",
    period_start: dateOf(dates[0] ?? payout.requested_at),
    period_end: dateOf(payout.requested_at),
    amount_cents: payout.net_cents,
    tier: creator.tier,
    posts_count: new Set(rows.map((r) => r.post_id).filter(Boolean)).size,
    typical_median_cents: ticker.totals.typical_creator_30d_cents || band.median,
    typical_p25_cents: ticker.totals.p25_creator_30d_cents || band.p25,
    typical_p75_cents: ticker.totals.p75_creator_30d_cents || band.p75,
    ledger_hash: hashString(rows.map((r) => r.id).join("|")).toString(16).padStart(8, "0") + hashString(`${payout.id}|${payout.net_cents}`).toString(16).padStart(8, "0").slice(0, 4),
    art: makeArtSeed(seededRng(payout.proof_id), { label: creator.handle }),
    revoked: false,
    page_views: 0,
    created_at: tx.now,
  };
  return tx.put("proofs", proof);
}

/** Adds a payout to the public ticker (handles only, never emails) and its totals. */
export function pushTicker(tx: Tx, payout: Payout): void {
  const creator = tx.must("creators", payout.creator_id);
  const ticker = tx.doc("ticker");
  const nextNum = ticker.events.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, "")) || 0), 0) + 1;
  const event: TickerEvent = {
    id: `tick_${String(nextNum).padStart(3, "0")}`,
    kind: "payout",
    at: tx.now,
    text: `@${creator.handle} was paid ${formatMoney(payout.net_cents)}`,
    amount_cents: payout.net_cents,
    creator_id: creator.id,
    handle: creator.handle,
    tier: creator.tier,
    proof_id: payout.proof_id,
  };
  const today = dateOf(tx.now);
  const t = ticker.totals;
  tx.setDoc("ticker", {
    totals: {
      ...t,
      total_paid_cents: t.total_paid_cents + payout.net_cents,
      paid_today_cents: ticker.events.some((e) => dateOf(e.at) === today) || dateOf(t.updated_at) === today ? t.paid_today_cents + payout.net_cents : payout.net_cents,
      paid_7d_cents: t.paid_7d_cents + payout.net_cents,
      payouts_count: t.payouts_count + 1,
      updated_at: tx.now,
    },
    events: [event, ...ticker.events].slice(0, 80),
  });
}

// ── paying out ─────────────────────────────────────────────────────────────────────────────────

/** Marks earning rows paid and their Money Clock rows paid (in transit until the transfer lands). */
export function payRows(tx: Tx, rows: readonly LedgerEntry[], payout: Payout, paidAt: IsoTimestamp, arrives: IsoTimestamp): void {
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) tx.put("ledger", markPaid(r, paidAt, payout.id));
  for (const m of tx.all("money_clock")) {
    if (!m.ledger_id || !ids.has(m.ledger_id)) continue;
    const next: MoneyClockRow = { ...m, state: "paid", reason: "payout_in_transit", payout_id: payout.id, paid_at: paidAt, reason_text: "" };
    delete (next as Partial<MoneyClockRow>).eta_at;
    next.reason_text = clockText(next, undefined, arrives);
    tx.put("money_clock", next);
  }
}

/** Executes the weekly run at `runAt`: every scheduled payout is paid (free) or stays held with its reason. Returns the payouts paid and the cents moved. */
export function executeWeeklyRun(tx: Tx, runAt: IsoTimestamp): { paid: number; held: number; net_cents: number } {
  const runId = payoutRunId(runAt);
  // Anyone with cleared money and no scheduled payout yet gets one first (so a run never skips a creator).
  const creatorsWithCleared = new Set(tx.all("ledger").filter((e) => e.status === "cleared" && !e.payout_id && isEarning(e)).map((e) => e.account.slice("creator:".length)));
  for (const id of creatorsWithCleared) if (tx.get("creators", id)) scheduleWeekly(tx, id, runAt);
  let paid = 0;
  let held = 0;
  let net = 0;
  for (const p of tx.all("payouts").filter((x) => x.run_id === runId && (x.status === "scheduled" || x.status === "held"))) {
    const creator = tx.get("creators", p.creator_id);
    if (!creator) continue;
    const hold = payoutHold(tx, creator);
    const rows = earningRows(tx, p.creator_id).filter((e) => e.status === "cleared" && !e.payout_id);
    if (rows.length === 0) {
      tx.patch("payouts", p.id, { status: "cancelled" });
      continue;
    }
    if (hold) {
      tx.patch("payouts", p.id, { status: "held", hold_reason: hold });
      held += 1;
      notifyCreator(tx, p.creator_id, { kind: "payout_held", title: "Your weekly payout is on hold", body: holdNextStep(hold), amount_cents: rows.reduce((s, r) => s + r.amount_cents, 0), path: "wallet", ref_kind: "payout", ref_id: p.id });
      continue;
    }
    const gross = rows.reduce((s, r) => s + r.amount_cents, 0);
    const txnId = tx.nextId("txn");
    tx.post(weeklyPayoutTxn({ txn_id: txnId, posted_at: runAt, creator_id: p.creator_id, payout_id: p.id, gross_cents: gross, run_id: runId }));
    const arrives = estimatePayoutArrival({ kind: "weekly", initiated_at: runAt });
    const next: Payout = { ...p, status: "in_transit", gross_cents: gross, net_cents: gross, item_count: rows.length, initiated_at: runAt, stripe_transfer_id: `tr_${hashString(`${p.id}|tr`).toString(36).padStart(12, "0").slice(0, 12)}`, ledger_txn_id: txnId, method_label: methodLabel(creator), tier_at_payout: creator.tier };
    delete (next as Partial<Payout>).hold_reason;
    tx.put("payouts", next);
    payRows(tx, rows, next, runAt, arrives);
    createProof(tx, next);
    pushTicker(tx, next);
    notifyCreator(tx, p.creator_id, { kind: "payout_paid", title: `${formatMoney(gross)} is on its way`, body: `Your weekly payout left flowd ${clockLabel(runAt)} UTC and arrives ${clockLabel(arrives)} UTC. It was free.`, amount_cents: gross, path: `payout/${p.id}`, ref_kind: "payout", ref_id: p.id });
    paid += 1;
    net += gross;
  }
  refreshRun(tx, runId, { status: "complete", initiated_at: runAt, completed_at: addHours(runAt, 1) });
  return { paid, held, net_cents: net };
}

/** Transfers that have landed: in-transit payouts whose arrival time has passed become paid, and their Money Clock rows read "Paid out". */
export function completeTransfers(tx: Tx): number {
  let n = 0;
  for (const p of tx.all("payouts")) {
    if (p.status !== "in_transit" || !p.initiated_at) continue;
    const arrives = estimatePayoutArrival({ kind: p.kind, initiated_at: p.initiated_at });
    if (toMs(arrives) > toMs(tx.now)) continue;
    tx.patch("payouts", p.id, { status: "paid", paid_at: arrives });
    for (const m of tx.all("money_clock")) {
      if (m.payout_id !== p.id || m.reason !== "payout_in_transit") continue;
      tx.put("money_clock", { ...m, reason: "paid_out", reason_text: "Paid out." });
    }
    if (p.run_id) refreshRun(tx, p.run_id);
    n += 1;
  }
  return n;
}

/** Guard used by the instant cash-out action. */
export function ensureNoPayoutHold(tx: Tx, creator: Creator): void {
  const hold = payoutHold(tx, creator);
  ensure(hold === null, `hold_${hold}`, holdNextStep(hold as HoldReason), "Open Wallet to fix it; your money is safe in the meantime.", 409);
}

// ── platform-funded earnings ───────────────────────────────────────────────────────────────────

/**
 * A bonus, prize or referral reward paid from flowd's own treasury (never charged to a recruit or a brand): `platform:promo -x`, `creator:cr +x`,
 * with a pending Money Clock row that clears at the next daily run like any other earning.
 */
export function addPlatformEarning(tx: Tx, p: { creator_id: string; type: "bonus" | "prize" | "referral"; amount_cents: number; memo: string; label: string }): LedgerEntry {
  const txnId = tx.nextId("txn");
  const rows = tx.post(promoTxn({ txn_id: txnId, posted_at: tx.now, creator_id: p.creator_id, type: p.type, amount_cents: p.amount_cents, memo: p.memo }));
  const creatorRow = rows.find((r) => r.account === `creator:${p.creator_id}`) as LedgerEntry;
  const eta = nextClearingRun(tx.now);
  const row: MoneyClockRow = {
    id: tx.nextId("mc"),
    creator_id: p.creator_id,
    bounty_id: "",
    app_id: "",
    source: p.type,
    state: "pending",
    amount_cents: p.amount_cents,
    estimated: false,
    earned_at: tx.now,
    eta_at: eta,
    reason: "awaiting_clearing_run",
    reason_text: "",
    label: p.label,
    ledger_id: creatorRow.id,
  };
  row.reason_text = clockText(row);
  tx.put("money_clock", row);
  return creatorRow;
}

/** The daily 14:00 UTC clearing run: pending Money Clock rows that are due clear (platform earnings, revision fees, rights renewals). Posts and conversions clear in their own steps. */
export function clearDueRows(tx: Tx, runAt: IsoTimestamp): number {
  let n = 0;
  const due = tx.all("money_clock").filter((r) => r.state === "pending" && r.ledger_id && !r.post_id && !r.conversion_id && r.eta_at && toMs(r.eta_at) <= toMs(runAt));
  for (const r of due) {
    const leg = tx.get("ledger", r.ledger_id);
    if (leg && leg.status === "pending") tx.put("ledger", markCleared(leg, runAt));
    const payAt = weeklyPayoutFor(runAt);
    const next: MoneyClockRow = { ...r, state: "cleared", reason: "awaiting_weekly_payout", eta_at: payAt, cleared_at: runAt, reason_text: "" };
    next.reason_text = clockText(next);
    tx.put("money_clock", next);
    n += 1;
  }
  return n;
}
