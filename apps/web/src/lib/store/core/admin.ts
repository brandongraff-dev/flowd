/**
 * Trust and safety: the fraud queue, disputes and appeals, verification, scam reports, tier overrides and the live numbers on the control tower.
 *
 * Principles (DECISIONS): delivered legitimate views are always paid; only proven fraud is clawed back, in a separate ledger transaction that
 * references the original; undisputed money is never blocked by a dispute on another item; every hold names its reason and its next step.
 */

import type {
  AdminMetrics,
  Dispute,
  DisputeKind,
  DisputeOutcome,
  Evidence,
  FraudFlag,
  HoldReason,
  LedgerEntry,
  Post,
  QueueCounts,
  ReportTargetKind,
  ScamReason,
  ScamReport,
  Tier,
  Verification,
  VerificationKind,
  VerificationReason,
  VerificationStatus,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  addHours,
  clawbackTxn,
  clockLabel,
  expectedViewCurve,
  formatMoney,
  nextWeeklyPayout,
  payoutRunId,
  statusAfterEvent,
  tierRank,
  toMs,
  type LedgerTxn,
} from "@/lib/engine";
import { addPlatformEarning, reevaluatePayoutHolds, scheduleWeekly } from "./earnings";
import { requireAdmin, requireBrand, requireCreator } from "./guards";
import { holdPost, releasePostHold } from "./holds";
import { logActivity, notifyAdmins, notifyBrand, notifyCreator } from "./notify";
import { finalizeApproval } from "./review";
import { recountBounty } from "./recount";
import { refreshCreator, refreshReputation, refreshBrandScorecard } from "./creator-stats";
import { reserveFor, releaseFor } from "./escrow";
import type { DemoState } from "../state";
import { ActionError, ensure, type Tx } from "./tx";

// ── the fraud queue ────────────────────────────────────────────────────────────────────────────

/** Opens a case in the admin fraud queue for a post that scored 40 or more (idempotent per post). */
export function openFraudFlag(tx: Tx, post: Post): FraudFlag {
  const existing = tx.all("fraud_flags").find((f) => f.post_id === post.id && (f.status === "open" || f.status === "monitoring"));
  if (existing) return existing;
  const account = tx.get("social_accounts", post.social_account_id);
  const curve = expectedViewCurve({ total_views: Math.max(1, post.window_views), hours: 72 });
  const flag: FraudFlag = {
    id: tx.nextId("flag"),
    post_id: post.id,
    creator_id: post.creator_id,
    brand_id: post.brand_id,
    bounty_id: post.bounty_id,
    status: "open",
    score: post.fraud.score,
    band: post.fraud.band,
    signals: post.fraud.signals,
    curve_shape: "organic",
    curve: { views: curve.expected.map((v) => Math.round(v)), expected_low: curve.low.map((v) => Math.round(v)), expected_high: curve.high.map((v) => Math.round(v)) },
    money_at_stake_cents: post.earnings.total_cents,
    hold_placed: true,
    audience_us_ratio: account?.us_audience_ratio ?? 0.5,
    account_age_days: account ? Math.max(0, Math.round((toMs(tx.now) - toMs(account.account_created_at)) / 86_400_000)) : 0,
    opened_at: tx.now,
    sla_due_at: addHours(tx.now, CONSTANTS.fraud.review_sla_hours),
  };
  tx.put("fraud_flags", flag);
  notifyAdmins(tx, { kind: "scam_warning", title: `Fraud case: score ${post.fraud.score}`, body: `${formatMoney(post.earnings.total_cents)} held. Decide within ${CONSTANTS.fraud.review_sla_hours} hours.`, route: `/admin/fraud/${flag.id}`, ref_kind: "fraud_flag", ref_id: flag.id });
  return flag;
}

export interface FraudDecisionInput {
  flag_id: string;
  decision: "clear" | "monitor" | "confirm";
  note?: string;
  /** Confirm: the views that were not real (default: the share the score implies). */
  invalid_views?: number;
}

/** The ledger transaction(s) of a post's creator earnings, rebuilt from rows so the engine can reverse them. */
function settlementTxnsOfPost(tx: Tx, post: Post): LedgerTxn[] {
  const byTxn = new Map<string, LedgerEntry[]>();
  for (const e of tx.all("ledger")) {
    if (e.post_id !== post.id) continue;
    if (e.entry_type !== "cpm" && e.entry_type !== "cpa" && e.entry_type !== "flat_fee" && e.entry_type !== "fee") continue;
    const list = byTxn.get(e.txn_id);
    if (list) list.push(e);
    else byTxn.set(e.txn_id, [e]);
  }
  return [...byTxn.entries()].filter(([, legs]) => legs.some((l) => l.account.startsWith("creator:") && l.amount_cents > 0)).map(([txn_id, legs]) => ({ txn_id, legs: legs.map(({ id: _id, ...leg }) => (void _id, leg)) }));
}

/** Claws back the invalid share of a post's earnings: a new transaction per settlement that references the original; delivered legitimate views stay paid. */
export function clawBackPost(tx: Tx, postId: string, fraction: number, memo: string): { clawed_cents: number } {
  const post = tx.must("posts", postId, "Post");
  let clawed = 0;
  for (const original of settlementTxnsOfPost(tx, post)) {
    const already = tx.all("ledger").some((e) => e.reverses_txn_id === original.txn_id);
    if (already) continue;
    const claw = clawbackTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, original, brand_id: post.brand_id, fraction, memo });
    const rows = tx.post(claw);
    clawed += rows.find((r) => r.account.startsWith("creator:"))?.amount_cents ?? 0;
    if (fraction >= 1) for (const leg of original.legs) {
      if (!leg.account.startsWith("creator:")) continue;
      const row = tx.all("ledger").find((e) => e.txn_id === original.txn_id && e.account === leg.account);
      if (row && row.status !== "paid") tx.put("ledger", { ...row, status: "reversed" });
    }
  }
  for (const m of tx.all("money_clock")) {
    if (m.post_id !== postId || m.state === "paid" || m.state === "reversed") continue;
    if (fraction >= 1) tx.put("money_clock", { ...m, state: "reversed", reason: "reversed_clawback", reason_text: "Reversed: views were found invalid. Legitimate views already delivered are still paid." });
    else tx.put("money_clock", { ...m, amount_cents: m.amount_cents - Math.round(m.amount_cents * fraction) });
  }
  return { clawed_cents: Math.abs(clawed) };
}

/** Ops decides a fraud case. Clear releases the hold; monitor waits for more snapshots; confirm claws back only the invalid share and pauses auto-approve rules. */
export function decideFraudFlag(tx: Tx, input: FraudDecisionInput): { flag: FraudFlag; clawed_cents: number } {
  const user = requireAdmin(tx);
  const flag = tx.must("fraud_flags", input.flag_id, "Fraud case");
  ensure(flag.status === "open" || flag.status === "monitoring", "invalid_state", `This case is ${flag.status}.`, undefined, 409);
  const post = tx.must("posts", flag.post_id);
  const base = { reviewed_at: tx.now, reviewed_by_user_id: user.id, ...(input.note ? { decision_note: input.note.trim() } : {}) };
  if (input.decision === "monitor") return { flag: tx.patch("fraud_flags", flag.id, { status: "monitoring", ...base }), clawed_cents: 0 };
  if (input.decision === "clear") {
    const next = tx.patch("fraud_flags", flag.id, { status: "cleared", ...base });
    if (post.status === "held") releasePostHold(tx, post.id);
    notifyCreator(tx, flag.creator_id, { kind: "dispute_update", title: "Your views were cleared", body: "The review found nothing wrong. Your earnings are back on their normal clearing schedule.", path: `post/${post.id}`, ref_kind: "post", ref_id: post.id });
    return { flag: next, clawed_cents: 0 };
  }
  const windowViews = Math.max(1, post.window_views);
  const invalid = Math.min(windowViews, Math.max(0, input.invalid_views ?? Math.round((windowViews * flag.score) / 100)));
  const fraction = invalid / windowViews;
  const { clawed_cents } = clawBackPost(tx, post.id, fraction, "Clawback: proven view fraud (delivered views still paid)");
  tx.patch("posts", post.id, { status: "clawed_back", views_invalid: invalid });
  tx.unset("posts", post.id, "hold_reason");
  const next = tx.patch("fraud_flags", flag.id, { status: "confirmed", invalid_views: invalid, ...base });
  const rep = tx.all("creator_reputation").find((r) => r.creator_id === flag.creator_id);
  if (rep) tx.patch("creator_reputation", rep.id, { fraud_flags_90d: rep.fraud_flags_90d + 1, clawbacks_90d: rep.clawbacks_90d + 1 });
  for (const rule of tx.all("auto_approve_rules").filter((r) => r.brand_id === flag.brand_id)) {
    const status = statusAfterEvent(rule.status, "clawback", rule.guardrails);
    if (status !== rule.status) {
      tx.patch("auto_approve_rules", rule.id, { status, audit: [...rule.audit, { at: tx.now, action: "paused" as const, note: "Paused after a clawback." }], updated_at: tx.now });
      notifyBrand(tx, rule.brand_id, { kind: "auto_approve_paused", title: `Auto-approve rule "${rule.name}" paused`, body: "A clawback pauses guarded rules so a person looks before anything else is approved automatically.", route: "/brand/review/rules", ref_kind: "rule", ref_id: rule.id });
    }
  }
  notifyCreator(tx, flag.creator_id, { kind: "dispute_update", title: "Some views were not counted", body: `${invalid.toLocaleString("en-US")} views were found invalid. The ${(100 - Math.round(fraction * 100)).toString()}% that were real are still paid. You can dispute this within 7 days.`, path: `post/${post.id}`, ref_kind: "post", ref_id: post.id });
  refreshCreator(tx, flag.creator_id);
  refreshReputation(tx, flag.creator_id);
  scheduleWeekly(tx, flag.creator_id);
  return { flag: next, clawed_cents };
}

/** Ops holds a post's money by hand ("admin_hold"). */
export function adminHoldPost(tx: Tx, input: { post_id: string; reason?: HoldReason; note?: string }): { post: Post } {
  requireAdmin(tx);
  const post = holdPost(tx, input.post_id, input.reason ?? "admin_hold");
  notifyCreator(tx, post.creator_id, { kind: "payout_held", title: "Ops is holding one post's earnings", body: input.note?.trim() || "A person is looking at this post and replies within 24 hours. Money on your other posts is not affected.", path: `post/${post.id}`, ref_kind: "post", ref_id: post.id });
  return { post };
}

/** Ops releases a hold. */
export function adminReleasePost(tx: Tx, input: { post_id: string }): { post: Post } {
  requireAdmin(tx);
  return { post: releasePostHold(tx, input.post_id) };
}

// ── disputes ───────────────────────────────────────────────────────────────────────────────────

export interface DisputePostInput {
  post_id: string;
  kind?: DisputeKind;
  reason: string;
  note: string;
  range_from?: string;
  range_to?: string;
}

/**
 * A creator disputes a post in one tap. Evidence from the View Ledger and the ledger is attached automatically; only THIS post's money is held
 * (`held_dispute`), everything else keeps clearing. A human replies within 24 hours and resolves within 5 business days.
 */
export function disputePost(tx: Tx, input: DisputePostInput): { dispute: Dispute } {
  const { creator } = requireCreator(tx);
  const post = tx.must("posts", input.post_id, "Post");
  ensure(post.creator_id === creator.id, "forbidden", "That post belongs to another creator.", undefined, 403);
  ensure(post.status !== "removed", "invalid_state", "A removed post earned nothing, so there is nothing to dispute.", undefined, 409);
  ensure(input.note.trim().length >= 10, "note_required", "Tell us what looks wrong in a sentence or two.", undefined, 422);
  ensure(!tx.all("disputes").some((d) => d.post_id === post.id && d.creator_id === creator.id && (d.status === "open" || d.status === "evidence_requested" || d.status === "under_review")), "already_open", "You already have an open dispute on this post.", "Add to it instead.", 409);
  const snaps = tx.all("view_snapshots").filter((s) => s.post_id === post.id).sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
  const last = snaps[snaps.length - 1];
  const evidence: Evidence[] = [];
  if (last) evidence.push({ kind: "timecode", ref: last.taken_at, excerpt: `${last.views_verified.toLocaleString("en-US")} verified of ${last.views_reported.toLocaleString("en-US")} reported views${last.views_invalid > 0 ? `; ${last.views_invalid.toLocaleString("en-US")} excluded` : ""}.` });
  evidence.push({ kind: "brief_requirement", ref: "Ledger", excerpt: `${formatMoney(post.earnings.total_cents)} earned so far on this post.` });
  const id = tx.nextId("disp");
  const dispute: Dispute = {
    id,
    kind: input.kind ?? "view_count",
    status: "open",
    opened_by: "creator",
    creator_id: creator.id,
    brand_id: post.brand_id,
    bounty_id: post.bounty_id,
    post_id: post.id,
    ...(input.range_from ? { range_from: input.range_from } : {}),
    ...(input.range_to ? { range_to: input.range_to } : {}),
    reason: input.reason.trim(),
    note: input.note.trim(),
    evidence,
    amount_in_dispute_cents: post.earnings.total_cents,
    events: [{ at: tx.now, actor: "creator", action: "opened", text: "Dispute opened from the post. Only this post's money is held.", user_id: creator.user_id }],
    opened_at: tx.now,
    reply_due_at: addHours(tx.now, 24),
    resolution_due_at: addHours(tx.now, 5 * 24),
    updated_at: tx.now,
  };
  tx.put("disputes", dispute);
  if (post.status !== "paid" && post.status !== "clawed_back") holdPost(tx, post.id, "dispute_open");
  notifyAdmins(tx, { kind: "dispute_update", title: "New dispute", body: `${creator.display_name} disputes a post (${dispute.kind.replace(/_/g, " ")}): ${formatMoney(post.earnings.total_cents)} in question.`, route: `/admin/disputes/${id}`, ref_kind: "dispute", ref_id: id });
  notifyBrand(tx, post.brand_id, { kind: "dispute_update", title: "A creator opened a dispute", body: "An Ops reviewer will compare the View Ledger with the payout and may ask you for evidence.", route: "/brand/disputes", ref_kind: "dispute", ref_id: id });
  return { dispute };
}

/** Either party adds a reply or evidence to a dispute. */
export function replyToDispute(tx: Tx, input: { dispute_id: string; text: string; evidence?: Evidence }): { dispute: Dispute } {
  const d = tx.must("disputes", input.dispute_id, "Dispute");
  const s = tx.session;
  let actor: "creator" | "brand" | "admin";
  let userId: string | undefined;
  if (s.persona === "creator") {
    actor = "creator";
    ensure(d.creator_id === s.creator_id, "forbidden", "That is another creator's dispute.", undefined, 403);
    userId = s.user_id ?? undefined;
  } else if (s.persona === "brand") {
    actor = "brand";
    userId = requireBrand(tx, d.brand_id, "review").user_id;
  } else {
    actor = "admin";
    userId = requireAdmin(tx).id;
  }
  ensure(d.status !== "resolved" && d.status !== "withdrawn", "invalid_state", `This dispute is ${d.status}.`, undefined, 409);
  ensure(input.text.trim().length > 0, "empty", "Write a reply first.", undefined, 422);
  const status = actor !== "admin" && d.status === "evidence_requested" ? "open" : d.status;
  const next = tx.patch("disputes", d.id, {
    status,
    events: [...d.events, { at: tx.now, actor, action: input.evidence ? "evidence_added" : "reply", text: input.text.trim(), ...(userId ? { user_id: userId } : {}) }],
    ...(input.evidence ? { evidence: [...d.evidence, input.evidence] } : {}),
    ...(actor === "admin" && !d.first_reply_at ? { first_reply_at: tx.now } : {}),
    updated_at: tx.now,
  });
  return { dispute: next };
}

/** Ops asks a party for more evidence. */
export function requestDisputeEvidence(tx: Tx, input: { dispute_id: string; text: string }): { dispute: Dispute } {
  const user = requireAdmin(tx);
  const d = tx.must("disputes", input.dispute_id, "Dispute");
  ensure(d.status === "open", "invalid_state", `This dispute is ${d.status.replace(/_/g, " ")}.`, undefined, 409);
  const next = tx.patch("disputes", d.id, { status: "evidence_requested", events: [...d.events, { at: tx.now, actor: "admin", action: "evidence_requested", text: input.text.trim(), user_id: user.id }], first_reply_at: d.first_reply_at ?? tx.now, assigned_admin_user_id: user.id, updated_at: tx.now });
  if (d.creator_id) notifyCreator(tx, d.creator_id, { kind: "dispute_update", title: "Ops asked for more evidence", body: input.text.trim(), path: `dispute/${d.id}`, ref_kind: "dispute", ref_id: d.id });
  return { dispute: next };
}

/** Ops starts reviewing a dispute. */
export function startDisputeReview(tx: Tx, input: { dispute_id: string }): { dispute: Dispute } {
  const user = requireAdmin(tx);
  const d = tx.must("disputes", input.dispute_id, "Dispute");
  ensure(d.status === "open" || d.status === "evidence_requested", "invalid_state", `This dispute is ${d.status.replace(/_/g, " ")}.`, undefined, 409);
  return { dispute: tx.patch("disputes", d.id, { status: "under_review", events: [...d.events, { at: tx.now, actor: "admin", action: "review_started", text: "An Ops reviewer is comparing the evidence.", user_id: user.id }], first_reply_at: d.first_reply_at ?? tx.now, assigned_admin_user_id: user.id, updated_at: tx.now }) };
}

/** A creator withdraws their own dispute: the held money is released. */
export function withdrawDispute(tx: Tx, input: { dispute_id: string }): { dispute: Dispute } {
  const d = tx.must("disputes", input.dispute_id, "Dispute");
  const { creator } = requireCreator(tx, d.creator_id);
  ensure(d.status === "open" || d.status === "evidence_requested", "invalid_state", `This dispute is ${d.status.replace(/_/g, " ")}.`, undefined, 409);
  const next = tx.patch("disputes", d.id, { status: "withdrawn", events: [...d.events, { at: tx.now, actor: "creator", action: "withdrawn", text: "Withdrawn by the creator.", user_id: creator.user_id }], updated_at: tx.now });
  if (d.post_id && tx.get("posts", d.post_id)?.hold_reason === "dispute_open") releasePostHold(tx, d.post_id);
  return { dispute: next };
}

export interface ResolveDisputeInput {
  dispute_id: string;
  outcome: DisputeOutcome;
  outcome_text: string;
  /** Upheld or partly upheld view or payout disputes: extra pay released to the creator, funded by flowd. */
  adjustment_cents?: number;
}

/**
 * Ops decides. For a rejection appeal "upheld" overturns the rejection (the video is approved and the brand's reliability takes a hit); "rejected"
 * keeps it. For a post dispute the held money is released either way (the views stand unless fraud was proven); an upheld outcome can add an adjustment.
 */
export function resolveDispute(tx: Tx, input: ResolveDisputeInput): { dispute: Dispute } {
  const user = requireAdmin(tx);
  const d = tx.must("disputes", input.dispute_id, "Dispute");
  ensure(d.status !== "resolved" && d.status !== "withdrawn", "invalid_state", `This dispute is already ${d.status}.`, undefined, 409);
  ensure(input.outcome_text.trim().length >= 10, "reason_required", "Explain the decision in a sentence: both parties see it.", undefined, 422);
  const adjustment = Math.max(0, Math.round(input.adjustment_cents ?? 0));
  if (d.kind === "rejection_appeal" && d.submission_id) {
    const sub = tx.must("submissions", d.submission_id);
    if (input.outcome === "upheld" || input.outcome === "partially_upheld") {
      let reserved = sub.reserved_cents;
      if (reserved === 0) {
        try {
          reserved = reserveFor(tx, sub.bounty_id);
        } catch {
          reserved = 0;
        }
        tx.patch("submissions", sub.id, { reserved_cents: reserved });
      }
      finalizeApproval(tx, sub.id, { action: "appeal_overturn", by_user_id: user.id, summary: input.outcome_text.trim() });
    } else {
      releaseFor(tx, sub.bounty_id, sub.reserved_cents);
      tx.patch("submissions", sub.id, { status: "rejected", reserved_cents: 0, decision: { ...(sub.decision ?? { action: "reject", decided_at: tx.now, sla_met: true, appeal_used: true }), action: "appeal_uphold", decided_by_user_id: user.id, summary: input.outcome_text.trim(), appeal_used: true, decided_at: tx.now }, updated_at: tx.now });
      refreshCreator(tx, sub.creator_id);
      refreshReputation(tx, sub.creator_id);
    }
    refreshBrandScorecard(tx, sub.brand_id);
    recountBounty(tx, sub.bounty_id);
  } else if (d.post_id) {
    const post = tx.get("posts", d.post_id);
    if (post && post.hold_reason === "dispute_open") releasePostHold(tx, post.id);
    if (adjustment > 0 && (input.outcome === "upheld" || input.outcome === "partially_upheld") && d.creator_id) {
      addPlatformEarning(tx, { creator_id: d.creator_id, type: "bonus", amount_cents: adjustment, memo: `Dispute adjustment: ${d.kind.replace(/_/g, " ")}`, label: "Dispute adjustment" });
    }
  }
  const next = tx.patch("disputes", d.id, {
    status: "resolved",
    outcome: input.outcome,
    outcome_text: input.outcome_text.trim(),
    ...(adjustment > 0 ? { adjustment_cents: adjustment } : {}),
    resolved_at: tx.now,
    first_reply_at: d.first_reply_at ?? tx.now,
    events: [...d.events, { at: tx.now, actor: "admin", action: "decision", text: input.outcome_text.trim(), user_id: user.id }],
    assigned_admin_user_id: d.assigned_admin_user_id ?? user.id,
    updated_at: tx.now,
  });
  if (d.creator_id) notifyCreator(tx, d.creator_id, { kind: d.kind === "rejection_appeal" ? "appeal_decided" : "dispute_update", title: input.outcome === "rejected" ? "Your dispute was not upheld" : "Your dispute was upheld", body: input.outcome_text.trim(), amount_cents: adjustment || undefined, path: `dispute/${d.id}`, ref_kind: "dispute", ref_id: d.id });
  notifyBrand(tx, d.brand_id, { kind: "dispute_update", title: "A dispute was decided", body: input.outcome_text.trim(), route: "/brand/disputes", ref_kind: "dispute", ref_id: d.id });
  return { dispute: next };
}

// ── verification ───────────────────────────────────────────────────────────────────────────────

export interface SubmitVerificationInput {
  kind: VerificationKind;
  /** The mock provider outcome: `verified` (default) decides at once; `pending` queues for Ops. */
  outcome?: "verified" | "pending" | "rejected";
  reason?: VerificationReason;
}

/**
 * Starts a verification (just-in-time for creators: identity and age at the first approval; business for brands). The mock provider decides at once
 * unless told otherwise; a `pending` one waits in Ops' queue with a 24-hour SLA. Verified creators with a payout method and a tax form are payout ready.
 */
export function submitVerification(tx: Tx, input: SubmitVerificationInput): { verification: Verification; status: VerificationStatus } {
  const s = tx.session;
  ensure(s.persona === "creator" || s.persona === "brand", "forbidden", "Creators and brands verify themselves.", undefined, 403);
  const isCreator = s.persona === "creator";
  const subjectId = isCreator ? s.creator_id : s.brand_id;
  ensure(subjectId, "unauthenticated", "Sign in to do that.", undefined, 401);
  const outcome = input.outcome ?? "verified";
  const status: VerificationStatus = outcome === "verified" ? "verified" : outcome === "rejected" ? "rejected" : "pending";
  const v: Verification = {
    id: tx.nextId("ver"),
    subject_kind: isCreator ? "creator" : "brand",
    ...(isCreator ? { creator_id: subjectId } : { brand_id: subjectId }),
    kind: input.kind,
    status,
    provider: isCreator ? "Stripe Identity (mock)" : "Business check (mock)",
    documents: [],
    submitted_at: tx.now,
    sla_due_at: addHours(tx.now, 24),
    ...(status !== "pending" ? { decided_at: tx.now } : {}),
    ...(status === "rejected" ? { reason: input.reason ?? "document_unreadable" } : {}),
    blocks_payout: status !== "verified",
  };
  tx.put("verifications", v);
  if (status === "verified") applyVerified(tx, v);
  else if (status === "pending") notifyAdmins(tx, { kind: "system_notice", title: "Verification waiting", body: `${isCreator ? "Creator" : "Brand"} ${input.kind} check. Decide within 24 hours.`, route: "/admin/verification", ref_kind: "verification", ref_id: v.id });
  return { verification: v, status };
}

function applyVerified(tx: Tx, v: Verification): void {
  if (v.creator_id) {
    const c = tx.must("creators", v.creator_id);
    if (v.kind === "identity" || v.kind === "age") tx.patch("creators", c.id, { verification_status: "verified", age_verified: true } as Partial<typeof c>);
    const fresh = tx.must("creators", c.id);
    tx.patch("creators", c.id, { payout_ready: fresh.verification_status === "verified" && fresh.payout_method?.status === "active" && tx.all("tax_profiles").some((t) => t.creator_id === c.id && t.status === "verified") });
    reevaluatePayoutHolds(tx, c.id);
  } else if (v.brand_id) tx.patch("brands", v.brand_id, { verification: "verified" });
}

/** Ops decides a verification in the queue. */
export function decideVerification(tx: Tx, input: { verification_id: string; decision: "approve" | "reject" | "needs_info"; reason?: VerificationReason; note?: string }): { verification: Verification } {
  const user = requireAdmin(tx);
  const v = tx.must("verifications", input.verification_id, "Verification");
  ensure(v.status === "pending", "invalid_state", `This verification is ${v.status.replace(/_/g, " ")}.`, undefined, 409);
  if (input.decision !== "approve") ensure(input.reason, "reason_required", "Pick a reason so the person knows what to fix.", undefined, 422);
  const status: VerificationStatus = input.decision === "approve" ? "verified" : input.decision === "reject" ? "rejected" : "needs_info";
  const next = tx.patch("verifications", v.id, { status, decided_at: tx.now, decided_by_user_id: user.id, ...(input.reason ? { reason: input.reason } : {}), ...(input.note ? { note: input.note.trim() } : {}), blocks_payout: status !== "verified" });
  if (status === "verified") applyVerified(tx, next);
  if (v.creator_id) notifyCreator(tx, v.creator_id, { kind: "system_notice", title: status === "verified" ? "You're verified" : status === "rejected" ? "We couldn't verify you" : "We need a little more", body: status === "verified" ? "Your payouts are no longer held for identity." : (input.note?.trim() || "Check the reason and resubmit; a person reviews it within 24 hours."), path: "settings", ref_kind: "verification", ref_id: v.id });
  return { verification: next };
}

// ── safety ─────────────────────────────────────────────────────────────────────────────────────

export interface ReportInput {
  target_kind: ReportTargetKind;
  target_id: string;
  reason: ScamReason;
  description: string;
  evidence_refs?: string[];
}

/** Anyone can report a scam, from inside the app or the public form. The report gets a case id and a 24-hour triage SLA. */
export function reportScam(tx: Tx, input: ReportInput): { report: ScamReport } {
  const s = tx.session;
  ensure(input.description.trim().length >= 10, "description_required", "Tell us what happened in a sentence or two.", undefined, 422);
  const id = tx.nextId("scam");
  const n = Number(id.replace(/\D/g, ""));
  const report: ScamReport = {
    id,
    case_id: `SR-2026-${String(n).padStart(4, "0")}`,
    reporter_kind: s.persona === "brand" ? "brand" : "creator",
    ...(s.persona === "creator" && s.creator_id ? { reporter_creator_id: s.creator_id } : {}),
    ...(s.persona === "brand" && s.brand_id ? { reporter_brand_id: s.brand_id } : {}),
    target_kind: input.target_kind,
    target_id: input.target_id,
    reason: input.reason,
    description: input.description.trim(),
    evidence_refs: input.evidence_refs ?? [],
    status: "new",
    created_at: tx.now,
    sla_due_at: addHours(tx.now, 24),
  };
  tx.put("scam_reports", report);
  notifyAdmins(tx, { kind: "scam_warning", title: `Scam report ${report.case_id}`, body: `${input.reason.replace(/_/g, " ")}: ${report.description.slice(0, 90)}`, route: "/admin/safety", ref_kind: "scam_report", ref_id: id });
  return { report };
}

/** Ops triages and closes a report. */
export function decideScamReport(tx: Tx, input: { report_id: string; decision: "triage" | "confirm" | "dismiss" | "action"; action_taken?: string }): { report: ScamReport } {
  const user = requireAdmin(tx);
  const r = tx.must("scam_reports", input.report_id, "Report");
  const next: Record<string, ScamReport["status"]> = { triage: "triaged", confirm: "confirmed", dismiss: "dismissed", action: "actioned" };
  const flow: Partial<Record<ScamReport["status"], ScamReport["status"][]>> = { new: ["triaged"], triaged: ["confirmed", "dismissed"], confirmed: ["actioned"] };
  const to = next[input.decision];
  ensure(flow[r.status]?.includes(to), "invalid_state", `A ${r.status} report cannot move to ${to}.`, undefined, 409);
  if (to === "actioned") ensure(input.action_taken?.trim(), "action_required", "Say what was done (suspended, removed, warned).", undefined, 422);
  const patch: Partial<ScamReport> = { status: to, assigned_admin_user_id: user.id, ...(to === "triaged" ? { triaged_at: tx.now } : {}), ...(to === "actioned" || to === "dismissed" ? { resolved_at: tx.now } : {}), ...(input.action_taken ? { action_taken: input.action_taken.trim() } : {}) };
  return { report: tx.patch("scam_reports", r.id, patch) };
}

// ── tier override ──────────────────────────────────────────────────────────────────────────────

/** Ops sets a creator's tier by hand (logged in the tier history with the reason). Elite also records the manual review. */
export function overrideTier(tx: Tx, input: { creator_id: string; tier: Tier; reason: string }): { creator_id: string; tier: Tier } {
  const user = requireAdmin(tx);
  const c = tx.must("creators", input.creator_id, "Creator");
  ensure(input.reason.trim().length >= 10, "reason_required", "Give a reason. Tier overrides are logged.", undefined, 422);
  ensure(input.tier !== c.tier, "same_tier", `@${c.handle} is already ${c.tier}.`, undefined, 409);
  tx.patch("creators", c.id, { tier: input.tier, tier_basis: "earned", tier_since: tx.now, ...(input.tier === "elite" ? { tier_review: { status: "approved", reviewer_user_id: user.id, reviewed_at: tx.now, note: input.reason.trim() } } : {}) });
  tx.unset("creators", c.id, "tier_hold_until");
  tx.put("tier_history", {
    id: tx.nextId("tev"),
    creator_id: c.id,
    kind: tierRank(input.tier) > tierRank(c.tier) ? "granted" : "demoted",
    from_tier: c.tier,
    to_tier: input.tier,
    basis: "earned",
    at: tx.now,
    stats: { lifetime_cleared_cents: c.lifetime_cleared_cents, approved_count: c.approved_count, approval_rate: c.approval_rate, reliability_score: c.reliability_score },
    note: `Set by Ops: ${input.reason.trim()}`,
  });
  notifyCreator(tx, c.id, { kind: tierRank(input.tier) > tierRank(c.tier) ? "tier_up" : "system_notice", title: `Your tier is now ${input.tier}`, body: "Set by the flowd team. Your perks update right away.", path: "tiers", ref_kind: "tier", ref_id: input.tier });
  return { creator_id: c.id, tier: input.tier };
}

// ── the control tower, live ────────────────────────────────────────────────────────────────────

/** The tables the control-tower numbers are counted from. */
export type LiveDb = Pick<DemoState, "fraud_flags" | "disputes" | "verifications" | "scam_reports" | "submissions" | "payouts" | "ledger" | "posts" | "bounties">;

/** The numbers on the control tower that follow the data: queue counts, the next payout run and the money summary. */
export function liveAdminMetrics(db: LiveDb, now: string): Pick<AdminMetrics, "queues" | "next_payout_run" | "summary"> & { as_of: string } {
  const queues = queueCounts(db);
  const runAt = nextWeeklyPayout(now);
  const runId = payoutRunId(runAt);
  const payouts = Object.values(db.payouts).filter((p) => p.run_id === runId && p.status !== "cancelled");
  const held = payouts.filter((p) => p.status === "held");
  const day30 = toMs(now) - 30 * 86_400_000;
  let gmv = 0;
  let fees = 0;
  for (const e of Object.values(db.ledger)) {
    if (toMs(e.posted_at) < day30) continue;
    if (e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee" || e.entry_type === "commission")) gmv += e.amount_cents;
    if (e.account === "platform:fees" && e.amount_cents > 0) {
      fees += e.amount_cents;
      gmv += e.amount_cents;
    }
  }
  const paidTotal = Object.values(db.payouts).filter((p) => p.status === "paid" || p.status === "in_transit").reduce((s, p) => s + p.net_cents, 0);
  return {
    as_of: now,
    queues,
    next_payout_run: { run_id: runId, scheduled_for: runAt, creators: new Set(payouts.map((p) => p.creator_id)).size, total_cents: payouts.reduce((s, p) => s + p.gross_cents, 0), holds: held.length, held_cents: held.reduce((s, p) => s + p.gross_cents, 0) },
    summary: {
      gmv_30d_cents: gmv,
      fees_30d_cents: fees,
      paid_total_cents: paidTotal,
      active_creators_30d: new Set(Object.values(db.posts).filter((p) => toMs(p.posted_at) >= day30).map((p) => p.creator_id)).size,
      live_bounties: Object.values(db.bounties).filter((b) => b.status === "live").length,
      brands_active_30d: new Set(Object.values(db.bounties).filter((b) => b.status === "live" || (b.published_at && toMs(b.published_at) >= day30)).map((b) => b.brand_id)).size,
    },
  };
}

/** Open items per admin queue, counted from the tables (never stored, so they cannot go stale). */
export function queueCounts(db: Pick<LiveDb, "fraud_flags" | "disputes" | "verifications" | "scam_reports" | "submissions" | "payouts">): QueueCounts {
  return {
    fraud_open: Object.values(db.fraud_flags).filter((f) => f.status === "open" || f.status === "monitoring").length,
    disputes_open: Object.values(db.disputes).filter((d) => d.status === "open" || d.status === "evidence_requested" || d.status === "under_review").length,
    verification_open: Object.values(db.verifications).filter((v) => v.status === "pending" || v.status === "needs_info").length,
    safety_new: Object.values(db.scam_reports).filter((r) => r.status === "new").length,
    sla_stale: Object.values(db.submissions).filter((s) => s.status === "in_review" && s.sla_state === "stale").length,
    sla_breached: Object.values(db.submissions).filter((s) => s.status === "in_review" && s.sla_state === "breached").length,
    payouts_held: Object.values(db.payouts).filter((p) => p.status === "held").length,
  };
}

/** Keeps the control-tower doc fresh after the clock moves. */
export function refreshAdminDoc(tx: Tx): void {
  const doc = tx.doc("admin_metrics");
  const live = liveAdminMetrics(tx.state, tx.now);
  tx.setDoc("admin_metrics", { ...doc, ...live });
}

export { ActionError, clockLabel, logActivity };
