/**
 * No-Rug Approvals: the brand's decisions on submissions.
 *
 *  - 72-hour SLA from the moment the current version entered review; reason code and evidence are mandatory on a rejection (`reason_required`).
 *  - Request changes needs at least one must-fix timecoded note; two revision rounds are included, a third and later round is paid by the brand.
 *  - Approval issues the tracking link and promo code, keeps the Reserved Slot until the post is attached, and updates the creator's tier path.
 *  - A rejected video can be appealed once, within seven days (see `appealRejection`).
 */

import { REASON_CODE_INFO, REASON_CODE_META } from "@/lib/contract/types";
import type {
  DecisionAction,
  Evidence,
  FeedbackCategory,
  FeedbackNote,
  FeedbackSeverity,
  ReasonCode,
  Submission,
  TaxProfile,
} from "@/lib/contract/types";
import { CONSTANTS, formatMoney, hoursBetween, settlementTxn, slaState, toMs, addDays, mulRate, nextClearingRun, clockLabel } from "@/lib/engine";
import { releaseFor } from "./escrow";
import { requireBrand } from "./guards";
import { describeActor, logActivity, notifyCreator } from "./notify";
import { refreshBrandScorecard, refreshCreator, refreshReputation } from "./creator-stats";
import { recountBounty } from "./recount";
import { issueTracking } from "./tracking";
import { ActionError, ensure, type Tx } from "./tx";

/** One timecoded note a reviewer writes (about the video, never the person). */
export interface NoteInput {
  t_ms: number;
  t_end_ms?: number;
  body: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  reason_code?: ReasonCode;
}

const hoursInQueue = (tx: Tx, s: Submission): number => hoursBetween(s.versions[s.version - 1]?.submitted_at ?? s.submitted_at, tx.now);

/** Statuses a brand may decide from. */
function ensureInReview(s: Submission): void {
  ensure(s.status === "in_review", "invalid_state", `This video is ${s.status.replace(/_/g, " ")}, so it cannot be decided now.`, s.status === "approved" || s.status === "posted" ? "It is already approved. Approved videos can only be undone for proven fraud." : undefined, 409);
}

/** Just-in-time tax: the first approval asks the creator for a W-9 (or W-8BEN) before the first payout. */
function requestTaxInfo(tx: Tx, creatorId: string): void {
  const creator = tx.must("creators", creatorId);
  const existing = tx.all("tax_profiles").find((t) => t.creator_id === creatorId);
  if (existing && existing.status !== "none") return;
  const form = creator.country === "US" ? "w9" : "w8ben";
  if (existing) {
    tx.patch("tax_profiles", existing.id, { status: "requested", form, requested_at: tx.now, updated_at: tx.now });
  } else {
    const row: TaxProfile = {
      id: `taxp_${creator.handle.replace(/\./g, "_")}`,
      creator_id: creatorId,
      status: "requested",
      form,
      country: creator.country,
      tax_year: CONSTANTS.tax.tax_year,
      ytd_cleared_cents: 0,
      ytd_paid_cents: 0,
      threshold_cents: CONSTANTS.tax.form_1099_nec_threshold_cents,
      threshold_progress: 0,
      form_1099_required: false,
      set_aside_rate: CONSTANTS.tax.set_aside_rate,
      set_aside_cents: 0,
      requested_at: tx.now,
      updated_at: tx.now,
    };
    tx.put("tax_profiles", row);
  }
  notifyCreator(tx, creatorId, {
    kind: "tax_info_needed",
    title: `Add your ${form === "w9" ? "W-9" : "W-8BEN"} before your first payout`,
    body: "It takes about two minutes. Your approved video is paid either way; we just need this before money leaves flowd.",
    path: "tax",
    ref_kind: "tax_profile",
  });
}

export interface ApprovalSource {
  action: Extract<DecisionAction, "approve" | "auto_approve" | "timeout_approve" | "appeal_overturn">;
  by_user_id?: string;
  summary?: string;
}

/**
 * The one place a submission becomes approved: the brand's click, an auto-approve rule, a timeout approve-if-clean, or an appeal overturn.
 * Issues the link and code, writes the decision, refreshes the creator's tier path and the brand Scorecard, and tells the creator.
 */
export function finalizeApproval(tx: Tx, submissionId: string, source: ApprovalSource): Submission {
  const sub = tx.must("submissions", submissionId, "Submission");
  const bounty = tx.must("bounties", sub.bounty_id, "Bounty");
  const creator = tx.must("creators", sub.creator_id, "Creator");
  const app = tx.must("apps", sub.app_id, "App");
  const hours = hoursInQueue(tx, sub);
  const sla = bounty.review_sla_hours;
  const issued = issueTracking(tx, { creator, bounty, app });
  const decision = {
    action: source.action,
    decided_at: tx.now,
    ...(source.by_user_id ? { decided_by_user_id: source.by_user_id } : {}),
    summary: source.summary ?? (source.action === "auto_approve" ? "Approved by a guarded auto-approve rule: every guardrail passed." : "Approved. The link and code are ready."),
    sla_met: hours <= sla,
    appeal_used: sub.decision?.appeal_used ?? false,
  };
  tx.patch("submissions", sub.id, {
    status: "approved",
    approved_at: tx.now,
    link_id: issued.link.id,
    decision,
    auto_approved: source.action === "auto_approve",
    sla_state: slaState(hours, true, sla),
    updated_at: tx.now,
  });
  tx.unset("submissions", sub.id, "sla_due_at");
  requestTaxInfo(tx, sub.creator_id);
  refreshCreator(tx, sub.creator_id);
  refreshReputation(tx, sub.creator_id);
  refreshBrandScorecard(tx, sub.brand_id);
  recountBounty(tx, sub.bounty_id);
  notifyCreator(tx, sub.creator_id, {
    kind: source.action === "appeal_overturn" ? "appeal_decided" : "approval",
    title: source.action === "appeal_overturn" ? `Appeal upheld: "${bounty.title}" is approved` : `Approved: ${bounty.title}`,
    body: `Your link ${issued.link.short_url}${issued.promo_code ? ` and code ${issued.promo_code}` : ""} are ready. Post it with the #ad disclosure and the 72-hour view window starts.`,
    path: `submission/${sub.id}`,
    ref_kind: "submission",
    ref_id: sub.id,
  });
  return tx.must("submissions", sub.id);
}

// ── approve ────────────────────────────────────────────────────────────────────────────────────

export function approveSubmission(tx: Tx, input: { submission_id: string; summary?: string }): { submission: Submission; link_url: string; promo_code?: string } {
  const sub = tx.must("submissions", input.submission_id, "Submission");
  const { member, user_id } = requireBrand(tx, sub.brand_id, "review");
  ensureInReview(sub);
  const approved = finalizeApproval(tx, sub.id, { action: "approve", by_user_id: user_id, summary: input.summary });
  const creator = tx.must("creators", sub.creator_id);
  const bounty = tx.must("bounties", sub.bounty_id);
  logActivity(tx, { brand_id: sub.brand_id, action: "submission_approved", summary: `${describeActor(tx, member?.id)} approved a video from @${creator.handle} on "${bounty.title}"`, actor_member_id: member?.id, target_kind: "submission", target_id: sub.id });
  const link = tx.must("attribution_links", approved.link_id);
  return { submission: approved, link_url: link.short_url, promo_code: link.promo_code };
}

// ── request changes ────────────────────────────────────────────────────────────────────────────

/** Writes timecoded notes on the current version. */
export function writeNotes(tx: Tx, sub: Submission, authorMemberId: string | undefined, notes: readonly NoteInput[], decisionReason?: ReasonCode): FeedbackNote[] {
  const duration = sub.versions[sub.version - 1]?.video.duration_ms ?? Number.MAX_SAFE_INTEGER;
  return notes.map((n) => {
    ensure(n.body.trim().length >= 3, "note_empty", "A note needs a few words about the video.", undefined, 422);
    ensure(n.t_ms >= 0 && n.t_ms <= duration, "note_out_of_range", `A note's time must be inside the video (0 to ${Math.round(duration / 1000)} seconds).`, undefined, 422);
    const row: FeedbackNote = {
      id: tx.nextId("note"),
      submission_id: sub.id,
      bounty_id: sub.bounty_id,
      creator_id: sub.creator_id,
      version: sub.version,
      author_member_id: authorMemberId ?? "bm_system",
      t_ms: n.t_ms,
      ...(n.t_end_ms !== undefined ? { t_end_ms: n.t_end_ms } : {}),
      category: n.category,
      severity: n.severity,
      status: "open",
      body: n.body.trim(),
      ...((n.reason_code ?? decisionReason) && n.severity === "must_fix" ? { reason_code: n.reason_code ?? decisionReason } : {}),
      created_at: tx.now,
    };
    return tx.put("feedback_notes", row);
  });
}

/** Asks for changes: at least one must-fix timecoded note; two revision rounds are included, later rounds cost the brand $10 each (paid to the creator). */
export function requestChanges(tx: Tx, input: { submission_id: string; notes: NoteInput[]; reason_code?: ReasonCode; summary?: string }): { submission: Submission; notes: FeedbackNote[]; extra_round_fee_cents: number } {
  const sub = tx.must("submissions", input.submission_id, "Submission");
  const { member, user_id } = requireBrand(tx, sub.brand_id, "review");
  ensureInReview(sub);
  ensure(input.notes.some((n) => n.severity === "must_fix"), "must_fix_required", "Add at least one must-fix note with a timecode so the creator knows exactly what to change.", "Click the player where the problem is and write what to fix.", 422);
  const bounty = tx.must("bounties", sub.bounty_id);
  const reason = input.reason_code ?? input.notes.find((n) => n.reason_code)?.reason_code;
  if (reason) ensure(REASON_CODE_INFO[reason].applies_to === "both", "reason_not_allowed", "That reason code can only be used to reject, not to request changes.", undefined, 422);
  const notes = writeNotes(tx, sub, member?.id, input.notes, reason);
  const round = sub.revision_round + 1;
  let fee = 0;
  if (sub.revision_round >= CONSTANTS.review.revision_rounds_included) {
    // Extra rounds are paid by the brand: a flat fee to the creator for the extra work, from the wallet, with the platform fee on top.
    fee = CONSTANTS.pay.extra_revision_pay_cents;
    const platformFee = mulRate(fee, bounty.take_rate);
    const brand = tx.must("brands", bounty.brand_id);
    ensure(brand.wallet_balance_cents >= fee + platformFee, "insufficient_funds", `An extra revision round is paid by the brand (${formatMoney(fee)} to the creator) and the wallet is short.`, "Top up the wallet or approve or reject this video instead.", 402);
    const txnId = tx.nextId("txn");
    tx.post(
      settlementTxn({
        txn_id: txnId,
        posted_at: tx.now,
        brand_id: bounty.brand_id,
        bounty_id: bounty.id,
        creator_id: sub.creator_id,
        submission_id: sub.id,
        type: "flat_fee",
        pay_cents: fee,
        fee_cents: platformFee,
        pay_memo: `Extra revision round: ${bounty.title}`,
        fee_memo: `Platform fee ${Math.round(bounty.take_rate * 100)}%: ${bounty.title}`,
        source: "wallet",
      }),
    );
    const run = nextClearingRun(tx.now);
    const ledgerRow = tx.all("ledger").find((l) => l.txn_id === txnId && l.account === `creator:${sub.creator_id}`);
    tx.put("money_clock", {
      id: tx.nextId("mc"),
      creator_id: sub.creator_id,
      bounty_id: bounty.id,
      app_id: bounty.app_id,
      source: "flat_fee",
      state: "pending",
      amount_cents: fee,
      estimated: false,
      earned_at: tx.now,
      eta_at: run,
      reason: "awaiting_clearing_run",
      reason_text: `Extra revision round, paid by the brand. Clears ${clockLabel(run)} UTC.`,
      label: `${tx.must("apps", bounty.app_id).name}: ${bounty.title} (extra revision)`,
      ...(ledgerRow ? { ledger_id: ledgerRow.id } : {}),
    });
  }
  const decision = {
    action: "request_changes" as const,
    decided_at: tx.now,
    decided_by_user_id: user_id,
    ...(reason ? { reason_code: reason } : {}),
    summary: input.summary ?? `Changes requested: ${notes.filter((n) => n.severity === "must_fix").length} must-fix, ${notes.filter((n) => n.severity === "suggestion").length} suggestions.`,
    sla_met: hoursInQueue(tx, sub) <= bounty.review_sla_hours,
    appeal_used: sub.decision?.appeal_used ?? false,
  };
  tx.patch("submissions", sub.id, { status: "changes_requested", revision_round: round, decision, sla_state: "met", updated_at: tx.now });
  tx.unset("submissions", sub.id, "sla_due_at");
  refreshBrandScorecard(tx, sub.brand_id);
  recountBounty(tx, sub.bounty_id);
  const creator = tx.must("creators", sub.creator_id);
  logActivity(tx, { brand_id: sub.brand_id, action: "submission_changes_requested", summary: `${describeActor(tx, member?.id)} requested changes on a video from @${creator.handle} (round ${round})`, actor_member_id: member?.id, target_kind: "submission", target_id: sub.id });
  notifyCreator(tx, sub.creator_id, {
    kind: "changes_requested",
    title: `Changes requested on "${bounty.title}"`,
    body: `${notes.filter((n) => n.severity === "must_fix").length} must-fix ${notes.filter((n) => n.severity === "must_fix").length === 1 ? "note" : "notes"} with timecodes. ${round >= CONSTANTS.review.revision_rounds_included ? "That was your last included revision round." : `Round ${round} of ${CONSTANTS.review.revision_rounds_included}.`}`,
    path: `submission/${sub.id}`,
    ref_kind: "submission",
    ref_id: sub.id,
  });
  return { submission: tx.must("submissions", sub.id), notes, extra_round_fee_cents: fee };
}

/** A creator ticks a note off. Must-fix notes carry to the next version until they are resolved. */
export function resolveNote(tx: Tx, input: { note_id: string; status?: "resolved" | "dismissed" }): { note: FeedbackNote } {
  const note = tx.must("feedback_notes", input.note_id, "Note");
  const s = tx.session;
  if (s.persona === "creator") ensure(note.creator_id === s.creator_id, "forbidden", "That note is on another creator's video.", undefined, 403);
  else ensure(s.persona === "brand" || s.persona === "admin", "unauthenticated", "Sign in to do that.", undefined, 401);
  const sub = tx.must("submissions", note.submission_id);
  const status = input.status ?? "resolved";
  ensure(note.status === "open", "invalid_state", "That note is already closed.", undefined, 409);
  const next = tx.patch("feedback_notes", note.id, { status, resolved_in_version: sub.version, resolved_at: tx.now });
  return { note: next };
}

/** A reviewer adds a timecoded note without deciding yet (keyboard C in focus mode). */
export function addFeedbackNote(tx: Tx, input: { submission_id: string; note: NoteInput }): { note: FeedbackNote } {
  const sub = tx.must("submissions", input.submission_id, "Submission");
  const { member } = requireBrand(tx, sub.brand_id, "review");
  ensure(sub.status === "in_review" || sub.status === "changes_requested", "invalid_state", "Notes go on videos that are in review.", undefined, 409);
  return { note: writeNotes(tx, sub, member?.id, [input.note])[0] };
}

// ── reject ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Rejects a video. The reason code and evidence are mandatory and the evidence must point at something the brief actually states; the
 * reservation goes back to the pool; the creator can appeal once within seven days.
 */
export function rejectSubmission(tx: Tx, input: { submission_id: string; reason_code?: ReasonCode; evidence?: Evidence; summary?: string }): { submission: Submission } {
  const sub = tx.must("submissions", input.submission_id, "Submission");
  const { member, user_id } = requireBrand(tx, sub.brand_id, "review");
  ensureInReview(sub);
  if (!input.reason_code) throw new ActionError("reason_required", "Pick a reason code. A rejection must say which requirement the video missed.", "Reason codes are tied to the brief, like \"Missing a required beat\" or \"No spoken disclosure\".", 422);
  if (!input.evidence || !input.evidence.ref?.trim()) throw new ActionError("evidence_required", "Point at the evidence: a timecode, a QA check or the brief line the video missed.", "Click the player at the moment that shows the problem, or pick the failed QA check.", 422);
  const bounty = tx.must("bounties", sub.bounty_id);
  const info = REASON_CODE_INFO[input.reason_code];
  ensure(info.applies_to !== "admin", "reason_not_allowed", "That reason code is for Ops only.", "Use a code tied to the brief.", 422);
  const decision = {
    action: "reject" as const,
    decided_at: tx.now,
    decided_by_user_id: user_id,
    reason_code: input.reason_code,
    evidence: input.evidence,
    summary: input.summary ?? `${REASON_CODE_META[input.reason_code].label}. ${info?.creator_copy ?? ""}`.trim(),
    sla_met: hoursInQueue(tx, sub) <= bounty.review_sla_hours,
    appeal_used: false,
  };
  releaseFor(tx, sub.bounty_id, sub.reserved_cents);
  tx.patch("submissions", sub.id, { status: "rejected", reserved_cents: 0, decision, sla_state: slaState(hoursInQueue(tx, sub), true, bounty.review_sla_hours), updated_at: tx.now });
  tx.unset("submissions", sub.id, "sla_due_at");
  refreshCreator(tx, sub.creator_id);
  refreshReputation(tx, sub.creator_id);
  refreshBrandScorecard(tx, sub.brand_id);
  recountBounty(tx, sub.bounty_id);
  const creator = tx.must("creators", sub.creator_id);
  logActivity(tx, { brand_id: sub.brand_id, action: "submission_rejected", summary: `${describeActor(tx, member?.id)} rejected a video from @${creator.handle} on "${bounty.title}": ${REASON_CODE_META[input.reason_code].label}`, actor_member_id: member?.id, target_kind: "submission", target_id: sub.id });
  notifyCreator(tx, sub.creator_id, {
    kind: "rejection",
    title: `Not approved: "${bounty.title}"`,
    body: `${REASON_CODE_META[input.reason_code].label}. You can appeal once within ${CONSTANTS.review.appeal_window_days} days if you think the reason does not match the brief.`,
    path: `submission/${sub.id}`,
    ref_kind: "submission",
    ref_id: sub.id,
  });
  return { submission: tx.must("submissions", sub.id) };
}

/** True while a rejected video can still be appealed (one appeal, inside seven days). */
export function canAppeal(s: Submission, now: string): boolean {
  return s.status === "rejected" && s.decision?.action === "reject" && !s.decision.appeal_used && toMs(now) <= toMs(addDays(s.decision.decided_at, CONSTANTS.review.appeal_window_days));
}
