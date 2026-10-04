/**
 * Bounty actions: build, publish, fund (escrow, Funded badge), top up, pause, end, cancel.
 *
 * Rules enforced here (DOMAIN section 8):
 *  - Brief Lint blockers stop a draft from publishing (`brief_lint_blockers`).
 *  - A bounty cannot go live until fully escrowed (`bounty_not_funded`): funding moves the pool and fee reserve from the wallet into escrow, adds
 *    flowd's match on a first bounty, flips the Funded badge and only then opens it.
 *  - Money moves only through ledger transactions that net to zero; the bounty's money fields follow the engine's escrow helpers.
 */

import type { Bounty, BountyId, Invoice, LedgerEntry } from "@/lib/contract/types";
import { addDays, escrowFundTxn, escrowRefundTxn, formatMoney, fundEscrow, fundedMemo, matchedBudgetTxn, mulRate, toMs, type Funding, type BriefLintResult } from "@/lib/engine";
import { buildBountyDraft, type BountyDraft, type BountyDraftInput } from "./bounty-draft";
import { availableWallet, topUpWallet, ensureWalletCovers } from "./billing";
import { applyEscrow, escrowOf, syncCapacity } from "./escrow";
import { invalidState, requireBrand } from "./guards";
import { describeActor, logActivity, notifyBrand, notifyCreator } from "./notify";
import { ActionError, ensure, type Tx } from "./tx";

/** The draft input that reproduces an existing bounty (used to re-lint and re-price it). */
export function inputOf(b: Bounty): BountyDraftInput {
  return {
    app_id: b.app_id,
    title: b.title,
    budget_cents: b.budget_cents,
    type: b.type,
    visibility: b.visibility,
    cpm_cents: b.cpm_cents,
    cpa_install_cents: b.cpa_install_cents,
    cpa_trial_cents: b.cpa_trial_cents,
    cpa_paid_cents: b.cpa_paid_cents,
    flat_fee_cents: b.flat_fee_cents,
    per_video_cap_cents: b.per_video_cap_cents,
    ...(b.per_creator_cap_cents !== undefined ? { per_creator_cap_cents: b.per_creator_cap_cents } : {}),
    ad_commission_rate: b.ad_commission_rate,
    brief: b.brief,
    deliverables: b.deliverables,
    eligibility: b.eligibility,
    format_ids: b.format_ids,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
  };
}

// ── create and edit a draft ────────────────────────────────────────────────────────────────────

export interface BountyDraftResult {
  bounty: Bounty;
  lint: BriefLintResult;
  funding: Funding;
  first_bounty: boolean;
}

const toResult = (d: BountyDraft): BountyDraftResult => ({ bounty: d.bounty, lint: d.lint, funding: d.funding, first_bounty: d.first_bounty });

/** Saves a new draft bounty. Nothing is charged; the draft is linted and priced, and reads back with its Brief Lint findings and funding breakdown. */
export function createBounty(tx: Tx, input: BountyDraftInput): BountyDraftResult {
  const app = tx.must("apps", input.app_id, "App");
  const { member, brand } = requireBrand(tx, app.brand_id, "build");
  ensure(input.title.trim().length >= 3, "title_required", "Give the bounty a title (at least 3 characters).", undefined, 422);
  ensure(Number.isFinite(input.budget_cents) && input.budget_cents >= 0, "invalid_amount", "Enter a budget in dollars.", undefined, 422);
  const draft = buildBountyDraft(tx.state, input, { member });
  tx.put("bounties", draft.bounty);
  logActivity(tx, { brand_id: brand.id, action: "bounty_created", summary: `${describeActor(tx, member?.id)} started the bounty "${draft.bounty.title}"`, actor_member_id: member?.id, target_kind: "bounty", target_id: draft.bounty.id });
  return toResult(draft);
}

/** Edits a draft (or a bounty waiting for funding, which returns to draft). Re-lints and re-prices. */
export function updateBounty(tx: Tx, input: { bounty_id: BountyId; changes: Partial<BountyDraftInput> }): BountyDraftResult {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b.brand_id, "build");
  ensure(b.status === "draft" || b.status === "awaiting_funding", "invalid_state", `This bounty is ${b.status.replace(/_/g, " ")}, so its brief can no longer be edited.`, "Pause it or create a refresh bounty instead.", 409);
  const merged: BountyDraftInput = { ...inputOf(b), ...input.changes };
  const draft = buildBountyDraft(tx.state, merged, { member }, { ...b, status: "draft" });
  tx.put("bounties", { ...draft.bounty, status: "draft" });
  return toResult({ ...draft, bounty: { ...draft.bounty, status: "draft" } });
}

/** Discards a draft. */
export function discardDraft(tx: Tx, input: { bounty_id: BountyId }): { bounty: Bounty } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  requireBrand(tx, b.brand_id, "build");
  ensure(b.status === "draft" || b.status === "awaiting_funding", "invalid_state", "Only a draft can be discarded.", "A live bounty can be ended or cancelled instead.", 409);
  return { bounty: tx.patch("bounties", b.id, { status: "cancelled", updated_at: tx.now }) };
}

// ── publish and fund ───────────────────────────────────────────────────────────────────────────

const lintSummary = (lint: BriefLintResult): string =>
  lint.findings
    .filter((f) => f.severity === "blocker")
    .map((f) => f.title)
    .join(", ");

export interface PublishResult {
  bounty: Bounty;
  lint: BriefLintResult;
  funding: Funding;
  /** True when the escrow was funded and the bounty is open (or scheduled). */
  funded: boolean;
  /** What the wallet is short by when it could not fund (0 when it did). */
  shortfall_cents: number;
}

/**
 * Publishes a draft: Brief Lint must have no blockers. The bounty then waits for funding (`awaiting_funding`), and is funded right away unless
 * `fund: false`. If the wallet cannot cover the escrow and `top_up_from_card` is not set, the bounty stays in `awaiting_funding` and the result
 * says how much is missing.
 */
export function publishBounty(tx: Tx, input: { bounty_id: BountyId; fund?: boolean; top_up_from_card?: boolean }): PublishResult {
  const b0 = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b0.brand_id, "build");
  ensure(b0.status === "draft", "invalid_state", `This bounty is ${b0.status.replace(/_/g, " ")}.`, "Only a draft can be published.", 409);
  const draft = buildBountyDraft(tx.state, inputOf(b0), { member }, { ...b0, status: "draft" });
  if (!draft.lint.can_publish) {
    tx.put("bounties", { ...draft.bounty, status: "draft" });
    throw new ActionError("brief_lint_blockers", `Fix ${draft.lint.blockers} Brief Lint ${draft.lint.blockers === 1 ? "issue" : "issues"} before publishing: ${lintSummary(draft.lint)}.`, "Open the Brief Lint panel; every blocker has a one-line fix.", 422);
  }
  ensure(draft.bounty.budget_cents >= 10_000, "budget_below_minimum", "The minimum bounty budget is $100.", undefined, 422);
  tx.put("bounties", { ...draft.bounty, status: "awaiting_funding", updated_at: tx.now });
  logActivity(tx, { brand_id: b0.brand_id, action: "bounty_published", summary: `${describeActor(tx, member?.id)} published "${draft.bounty.title}"`, actor_member_id: member?.id, target_kind: "bounty", target_id: b0.id });

  if (input.fund === false) return { bounty: tx.must("bounties", b0.id), lint: draft.lint, funding: draft.funding, funded: false, shortfall_cents: 0 };
  const needed = draft.funding.brand_funded_cents;
  const available = availableWallet(tx, b0.brand_id);
  if (available < needed && !input.top_up_from_card) {
    notifyBrand(tx, b0.brand_id, {
      kind: "funding_needed",
      title: `Fund "${draft.bounty.title}" to go live`,
      body: `It needs ${formatMoney(needed - available)} more in the wallet. Nothing goes live until it is fully escrowed.`,
      route: `/brand/bounties/${b0.id}`,
      ref_kind: "bounty",
      ref_id: b0.id,
    });
    return { bounty: tx.must("bounties", b0.id), lint: draft.lint, funding: draft.funding, funded: false, shortfall_cents: needed - available };
  }
  const funded = fundBounty(tx, { bounty_id: b0.id, top_up_from_card: input.top_up_from_card });
  return { bounty: funded.bounty, lint: draft.lint, funding: draft.funding, funded: true, shortfall_cents: 0 };
}

export interface FundResult {
  bounty: Bounty;
  /** Ledger rows written (escrow funding, matched budget). */
  ledger: LedgerEntry[];
  /** The invoice for a card top-up made to cover the shortfall. */
  invoice?: Invoice;
  matched_cents: number;
  status: Bounty["status"];
}

/**
 * Funds a bounty's escrow from the wallet: pool plus fee reserve (less flowd's match on a first bounty) move into `escrow:<bounty>`, the Funded
 * badge turns on, and the bounty goes live (or scheduled if it starts later). With `top_up_from_card`, a shortfall is topped up by card first.
 */
export function fundBounty(tx: Tx, input: { bounty_id: BountyId; top_up_from_card?: boolean }): FundResult {
  const b0 = tx.must("bounties", input.bounty_id, "Bounty");
  const { member, brand } = requireBrand(tx, b0.brand_id, "finance");
  if (b0.status !== "awaiting_funding") throw invalidState("bounty", b0.status, "published and waiting for funding");
  // Re-price at funding time: the first-bounty waiver may have been used by another bounty since the draft was saved.
  const draft = buildBountyDraft(tx.state, inputOf(b0), { member }, { ...b0, status: "draft" });
  ensure(draft.lint.can_publish, "brief_lint_blockers", `Fix the Brief Lint blockers first: ${lintSummary(draft.lint)}.`, undefined, 422);
  const b = draft.bounty;
  const needed = draft.funding.brand_funded_cents;

  let invoice: Invoice | undefined;
  const available = availableWallet(tx, brand.id);
  if (available < needed) {
    if (!input.top_up_from_card) ensureWalletCovers(tx, brand.id, needed);
    const topUp = topUpWallet(tx, brand.id, needed - available, { description: `Wallet top-up to fund ${b.title}`, bounty_id: b.id, minimum: 100 });
    invoice = topUp.invoice;
  }

  const ledger: LedgerEntry[] = [];
  const memo = fundedMemo(b.title, b.budget_cents, b.fee_reserve_cents, (c) => formatMoney(c), b.funding_source === "platform" ? "platform" : "brand");
  ledger.push(...tx.post(escrowFundTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: brand.id, bounty_id: b.id, amount_cents: needed, memo })));
  const matched = draft.funding.matched_cents;
  if (matched > 0) ledger.push(...tx.post(matchedBudgetTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: brand.id, bounty_id: b.id, amount_cents: matched })));

  const live = toMs(b.starts_at) <= toMs(tx.now);
  tx.put("bounties", { ...b, status: live ? "live" : "scheduled", funded_at: tx.now, published_at: tx.now, matched_cents: matched });
  const escrow = fundEscrow(escrowOf(tx.must("bounties", b.id)), needed + matched);
  applyEscrow(tx, b.id, escrow, { matched_cents: matched });
  if (draft.first_bounty) tx.patch("brands", brand.id, { first_bounty_waiver_used: true, matched_budget_used_cents: brand.matched_budget_used_cents + matched });

  const final = syncCapacity(tx, b.id);
  logActivity(tx, {
    brand_id: brand.id,
    action: "bounty_funded",
    summary: `${describeActor(tx, member?.id)} funded "${b.title}" (${formatMoney(b.budget_cents)} pool${matched > 0 ? `, ${formatMoney(matched)} matched by flowd` : ""}). It is ${live ? "live" : "scheduled"}.`,
    actor_member_id: member?.id,
    target_kind: "bounty",
    target_id: b.id,
  });
  notifyBrand(tx, brand.id, {
    kind: "bounty_funded",
    title: `"${b.title}" is funded and ${live ? "live" : "scheduled"}`,
    body: `${formatMoney(needed + matched)} is in escrow. Creators see the Funded badge${live ? " now" : " when it starts"}.`,
    route: `/brand/bounties/${b.id}`,
    ref_kind: "bounty",
    ref_id: b.id,
    member_id: member?.id,
  });
  return { bounty: final, ledger, invoice, matched_cents: matched, status: final.status };
}

// ── top up, pause, end, cancel ─────────────────────────────────────────────────────────────────

/** Adds budget to a bounty that is open or about to be: the extra pool and its fee reserve move from the wallet into escrow. */
export function topUpBounty(tx: Tx, input: { bounty_id: BountyId; amount_cents: number; top_up_from_card?: boolean }): { bounty: Bounty; added_cents: number } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member, brand } = requireBrand(tx, b.brand_id, "finance");
  ensure(["scheduled", "live", "paused", "filled"].includes(b.status), "invalid_state", `This bounty is ${b.status.replace(/_/g, " ")}, so it cannot take more budget.`, undefined, 409);
  ensure(Number.isInteger(input.amount_cents) && input.amount_cents >= 1000, "amount_too_small", "The smallest top-up to a bounty is $10.", undefined, 422);
  const budget = b.budget_cents + input.amount_cents;
  const fee = mulRate(budget, b.take_rate);
  const extraEscrow = input.amount_cents + (fee - b.fee_reserve_cents);
  const available = availableWallet(tx, brand.id);
  if (available < extraEscrow) {
    if (!input.top_up_from_card) ensureWalletCovers(tx, brand.id, extraEscrow);
    topUpWallet(tx, brand.id, extraEscrow - available, { description: `Wallet top-up for ${b.title}`, bounty_id: b.id, minimum: 100 });
  }
  const memo = `Top-up: ${b.title} (${formatMoney(input.amount_cents)} pool + ${formatMoney(fee - b.fee_reserve_cents)} fee reserve)`;
  tx.post(escrowFundTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: brand.id, bounty_id: b.id, amount_cents: extraEscrow, memo }));
  const escrow = fundEscrow(escrowOf(b), extraEscrow);
  const updated = applyEscrow(tx, b.id, escrow, { budget_cents: budget, fee_reserve_cents: fee });
  logActivity(tx, { brand_id: brand.id, action: "bounty_funded", summary: `${describeActor(tx, member?.id)} added ${formatMoney(input.amount_cents)} to "${b.title}"`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: updated, added_cents: extraEscrow };
}

/** Pauses a live bounty (no new submissions; pending ones are still decided and paid). */
export function pauseBounty(tx: Tx, input: { bounty_id: BountyId; reason?: string }): { bounty: Bounty } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b.brand_id, "manage");
  if (b.status !== "live" && b.status !== "filled") throw invalidState("bounty", b.status, "live");
  const next = tx.patch("bounties", b.id, { status: "paused", updated_at: tx.now });
  logActivity(tx, { brand_id: b.brand_id, action: "bounty_paused", summary: `${describeActor(tx, member?.id)} paused "${b.title}"${input.reason ? `: ${input.reason}` : ""}`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: next };
}

/** Resumes a paused bounty (it reads as filled if no spot is left). */
export function resumeBounty(tx: Tx, input: { bounty_id: BountyId }): { bounty: Bounty } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b.brand_id, "manage");
  if (b.status !== "paused") throw invalidState("bounty", b.status, "paused");
  ensure(toMs(b.ends_at) > toMs(tx.now), "bounty_ended", "This bounty's end date has passed. Extend it first.", undefined, 409);
  tx.patch("bounties", b.id, { status: "live", updated_at: tx.now });
  const next = syncCapacity(tx, b.id);
  logActivity(tx, { brand_id: b.brand_id, action: "bounty_funded", summary: `${describeActor(tx, member?.id)} resumed "${b.title}"`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: next };
}

/** Moves the end date. An ended bounty that is extended past now reopens. */
export function extendBounty(tx: Tx, input: { bounty_id: BountyId; ends_at: string }): { bounty: Bounty } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  requireBrand(tx, b.brand_id, "manage");
  ensure(toMs(input.ends_at) > toMs(tx.now), "invalid_date", "Pick an end date in the future.", undefined, 422);
  ensure(["scheduled", "live", "paused", "filled", "ended"].includes(b.status), "invalid_state", `This bounty is ${b.status.replace(/_/g, " ")}.`, undefined, 409);
  let next = tx.patch("bounties", b.id, { ends_at: input.ends_at, updated_at: tx.now });
  if (b.status === "ended") {
    tx.patch("bounties", b.id, { status: "live", updated_at: tx.now });
    tx.unset("bounties", b.id, "ended_at");
    next = syncCapacity(tx, b.id);
  }
  return { bounty: next };
}

/** Ends a bounty now: no new submissions. Pending ones are still decided; the bounty settles when every window has closed. */
export function endBounty(tx: Tx, input: { bounty_id: BountyId }): { bounty: Bounty } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b.brand_id, "manage");
  if (!["live", "paused", "filled"].includes(b.status)) throw invalidState("bounty", b.status, "live, paused or full");
  const next = tx.patch("bounties", b.id, { status: "ended", ended_at: tx.now, updated_at: tx.now });
  logActivity(tx, { brand_id: b.brand_id, action: "bounty_ended", summary: `${describeActor(tx, member?.id)} ended "${b.title}"`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: next };
}

/**
 * Cancels a bounty. A draft or one awaiting funding just closes. A funded bounty can be cancelled only while no video has been approved: pending
 * submissions are released (their creators are told) and the unspent escrow returns to the wallet in one transaction.
 */
export function cancelBounty(tx: Tx, input: { bounty_id: BountyId; reason?: string }): { bounty: Bounty; refunded_cents: number } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member } = requireBrand(tx, b.brand_id, "manage");
  if (b.status === "draft" || b.status === "awaiting_funding") return { bounty: tx.patch("bounties", b.id, { status: "cancelled", updated_at: tx.now }), refunded_cents: 0 };
  ensure(["scheduled", "live", "paused", "filled"].includes(b.status), "invalid_state", `This bounty is ${b.status.replace(/_/g, " ")}.`, undefined, 409);
  const subs = tx.all("submissions").filter((s) => s.bounty_id === b.id);
  ensure(!subs.some((s) => s.status === "approved" || s.status === "posted"), "has_approved_work", "A bounty with approved videos cannot be cancelled.", "End it instead; approved videos are still posted and paid.", 409);
  let escrow = escrowOf(b);
  for (const s of subs) {
    if (!["qa_pending", "in_review", "changes_requested", "appealed"].includes(s.status)) continue;
    escrow = { ...escrow, reserved_cents: escrow.reserved_cents - s.reserved_cents, remaining_cents: escrow.remaining_cents + s.reserved_cents };
    tx.put("submissions", { ...s, status: "expired", reserved_cents: 0, updated_at: tx.now });
    notifyCreator(tx, s.creator_id, { kind: "system_notice", title: `"${b.title}" was cancelled`, body: "The brand cancelled this bounty before a decision. Your reservation is released and nothing was charged to you.", path: `submission/${s.id}`, ref_kind: "submission", ref_id: s.id });
  }
  const refund = escrow.remaining_cents;
  const txn = escrowRefundTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: b.brand_id, bounty_id: b.id, unspent_cents: refund, memo: `Refund of unspent budget: ${b.title}` });
  if (txn) tx.post(txn);
  tx.patch("bounties", b.id, { status: "cancelled", ended_at: tx.now, updated_at: tx.now });
  applyEscrow(tx, b.id, { ...escrow, remaining_cents: 0, refunded_cents: escrow.refunded_cents + refund }, { status: "cancelled" });
  logActivity(tx, { brand_id: b.brand_id, action: "bounty_ended", summary: `${describeActor(tx, member?.id)} cancelled "${b.title}"${input.reason ? `: ${input.reason}` : ""}. ${formatMoney(refund)} returned to the wallet.`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: tx.must("bounties", b.id), refunded_cents: refund };
}

/** Pins a bounty to the top of the feed for a week for a flat fee from the wallet. */
export const FEATURED_PIN_WEEK_CENTS = 4900;
export function featureBounty(tx: Tx, input: { bounty_id: BountyId; weeks?: number }): { bounty: Bounty; fee_cents: number } {
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const { member, brand } = requireBrand(tx, b.brand_id, "finance");
  ensure(["scheduled", "live", "filled"].includes(b.status), "invalid_state", "Only an open bounty can be featured.", undefined, 409);
  const weeks = Math.max(1, Math.min(4, Math.round(input.weeks ?? 1)));
  const fee = FEATURED_PIN_WEEK_CENTS * weeks;
  ensureWalletCovers(tx, brand.id, fee);
  const txnId = tx.nextId("txn");
  const memo = `Featured pin, ${weeks * 7} days: ${b.title}`;
  tx.post({
    txn_id: txnId,
    legs: [
      { txn_id: txnId, entry_type: "fee", account: `wallet:${brand.id}`, amount_cents: -fee, status: "cleared", posted_at: tx.now, cleared_at: tx.now, brand_id: brand.id, bounty_id: b.id, memo },
      { txn_id: txnId, entry_type: "fee", account: "platform:fees", amount_cents: fee, status: "cleared", posted_at: tx.now, cleared_at: tx.now, brand_id: brand.id, bounty_id: b.id, memo },
    ],
  });
  const from = b.featured_until && toMs(b.featured_until) > toMs(tx.now) ? b.featured_until : tx.now;
  const next = tx.patch("bounties", b.id, { featured: true, featured_until: addDays(from, weeks * 7), updated_at: tx.now });
  logActivity(tx, { brand_id: brand.id, action: "bounty_funded", summary: `${describeActor(tx, member?.id)} pinned "${b.title}" for ${weeks} ${weeks === 1 ? "week" : "weeks"} (${formatMoney(fee)})`, actor_member_id: member?.id, target_kind: "bounty", target_id: b.id });
  return { bounty: next, fee_cents: fee };
}
