/**
 * Ops registry and desk actions: payout holds and failures, bounty holds and Brief Lint overrides, creator and brand standing, the review SLA desk.
 * Every one needs the admin persona, names a reason, and leaves an audit line for Ops (`ref_kind: "audit"` notifications).
 */

import type { Bounty, BriefLintCode, Brand, Creator, Payout, Plan, Submission } from "@/lib/contract/types";
import { addHours, formatMoney, planLabel } from "@/lib/engine";
import { buildBountyDraft } from "./bounty-draft";
import { inputOf, pauseBounty, resumeBounty } from "./bounties";
import { scheduleWeekly, holdNextStep } from "./earnings";
import { requireAdmin } from "./guards";
import { notifyAdmins, notifyBrand, notifyCreator } from "./notify";
import { finalizeApproval } from "./review";
import { releaseFor } from "./escrow";
import { recountBounty } from "./recount";
import { ensure, type Tx } from "./tx";

/** One audit line for Ops: who did what to what, and why. */
function audit(tx: Tx, p: { action: string; target_kind: string; target_id: string; reason: string; route: string }): void {
  const user = tx.get("users", tx.session.user_id);
  notifyAdmins(tx, { kind: "system_notice", title: `Audit: ${p.action}`, body: `${user?.display_name ?? "Ops"}: ${p.reason}`, route: p.route, ref_kind: "audit", ref_id: p.target_id, priority: "digest" });
}

const needReason = (reason: string | undefined, what: string): string => {
  const text = (reason ?? "").trim();
  ensure(text.length >= 10, "reason_required", `Give a reason for ${what}. It is logged and the person sees it.`, undefined, 422);
  return text;
};

// ── payouts ────────────────────────────────────────────────────────────────────────────────────

/** Nudges the creator about the step that releases a payout hold (add a W-9, verify identity, add a bank account). Ops cannot skip these checks. */
export function nudgePayoutHold(tx: Tx, input: { payout_id: string }): { payout: Payout } {
  requireAdmin(tx);
  const payout = tx.must("payouts", input.payout_id, "Payout");
  ensure(payout.status === "held" && payout.hold_reason !== undefined, "invalid_state", "Only a held payout can be nudged.", undefined, 409);
  notifyCreator(tx, payout.creator_id, { kind: "payout_held", title: `Your ${formatMoney(payout.net_cents)} payout is waiting on you`, body: holdNextStep(payout.hold_reason as NonNullable<Payout["hold_reason"]>), amount_cents: payout.net_cents, path: "wallet", ref_kind: "payout", ref_id: payout.id });
  audit(tx, { action: "payout hold nudge", target_kind: "payout", target_id: payout.id, reason: `Reminded the creator about ${payout.hold_reason?.replace(/_/g, " ")}.`, route: "/admin/payouts" });
  return { payout };
}

/** Retries a failed transfer: the failed payout is closed and the creator's cleared money is scheduled again for the next run. */
export function retryFailedPayout(tx: Tx, input: { payout_id: string }): { payout: Payout; scheduled: Payout } {
  requireAdmin(tx);
  const payout = tx.must("payouts", input.payout_id, "Payout");
  ensure(payout.status === "failed", "invalid_state", `This payout is ${payout.status.replace(/_/g, " ")}, not failed.`, undefined, 409);
  const closed = tx.patch("payouts", payout.id, { status: "cancelled" });
  const scheduled = scheduleWeekly(tx, payout.creator_id);
  ensure(scheduled, "nothing_to_retry", "No cleared earnings are waiting for this creator, so there is nothing to retry.", "It will pay in the run after their next earning clears.", 409);
  notifyCreator(tx, payout.creator_id, { kind: "payout_cleared", title: "We are retrying your payout", body: `${formatMoney(scheduled.net_cents)} is scheduled for the next Friday run. Check your payout method is current.`, amount_cents: scheduled.net_cents, path: "wallet", ref_kind: "payout", ref_id: scheduled.id });
  audit(tx, { action: "payout retried", target_kind: "payout", target_id: payout.id, reason: `Failed transfer rescheduled as ${scheduled.id}.`, route: "/admin/payouts" });
  return { payout: closed, scheduled };
}

// ── bounties ───────────────────────────────────────────────────────────────────────────────────

/** Ops pauses a bounty (new submissions stop; pending ones are still decided and paid) and tells the brand why. */
export function adminHoldBounty(tx: Tx, input: { bounty_id: string; reason: string }): { bounty: Bounty } {
  requireAdmin(tx);
  const reason = needReason(input.reason, "holding a bounty");
  const { bounty } = pauseBounty(tx, { bounty_id: input.bounty_id, reason });
  notifyBrand(tx, bounty.brand_id, { kind: "system_notice", title: `Ops paused "${bounty.title}"`, body: `${reason} A person replies within 24 hours.`, route: `/brand/bounties/${bounty.id}`, ref_kind: "bounty", ref_id: bounty.id });
  audit(tx, { action: "bounty held", target_kind: "bounty", target_id: bounty.id, reason, route: "/admin/bounties" });
  return { bounty };
}

/** Ops lifts a hold. */
export function adminReleaseBounty(tx: Tx, input: { bounty_id: string }): { bounty: Bounty } {
  requireAdmin(tx);
  const { bounty } = resumeBounty(tx, { bounty_id: input.bounty_id });
  notifyBrand(tx, bounty.brand_id, { kind: "system_notice", title: `"${bounty.title}" is live again`, body: "Ops lifted the hold.", route: `/brand/bounties/${bounty.id}`, ref_kind: "bounty", ref_id: bounty.id });
  audit(tx, { action: "bounty released", target_kind: "bounty", target_id: bounty.id, reason: "Hold lifted.", route: "/admin/bounties" });
  return { bounty };
}

/** Ops overrides one Brief Lint finding on a bounty (logged on the bounty; the finding stops blocking). */
export function overrideBriefLint(tx: Tx, input: { bounty_id: string; code: BriefLintCode; reason: string }): { bounty: Bounty } {
  const user = requireAdmin(tx);
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const reason = needReason(input.reason, "a lint override");
  ensure(!(b.lint_overrides ?? []).some((o) => o.code === input.code), "already_overridden", "That finding is already overridden.", undefined, 409);
  const lint_overrides = [...(b.lint_overrides ?? []), { code: input.code, by_user_id: user.id, reason, at: tx.now }];
  const draft = buildBountyDraft(tx.state, inputOf(b), {}, { ...b, lint_overrides });
  const next = tx.patch("bounties", b.id, { lint_overrides, brief_lint: draft.bounty.brief_lint, updated_at: tx.now });
  audit(tx, { action: "lint override", target_kind: "bounty", target_id: b.id, reason: `${input.code.replace(/_/g, " ")}: ${reason}`, route: "/admin/bounties" });
  return { bounty: next };
}

// ── people ─────────────────────────────────────────────────────────────────────────────────────

export type StandingAction = "hold" | "ban" | "restore";

/**
 * Ops changes a creator's standing. A hold lets them read but not act; a ban also withdraws their open submissions (reservations return to the pools).
 * Money already earned is never taken by this action: fraud is handled in the fraud queue, with a clawback of the invalid share only.
 */
export function setCreatorStanding(tx: Tx, input: { creator_id: string; action: StandingAction; reason: string }): { creator: Creator; withdrawn: number } {
  requireAdmin(tx);
  const creator = tx.must("creators", input.creator_id, "Creator");
  const reason = needReason(input.reason, input.action === "restore" ? "restoring an account" : "this decision");
  const user = tx.must("users", creator.user_id, "User");
  let withdrawn = 0;
  if (input.action === "restore") {
    ensure(user.status === "suspended", "invalid_state", "This account is not on hold.", undefined, 409);
    tx.patch("users", user.id, { status: "active" });
    notifyCreator(tx, creator.id, { kind: "system_notice", title: "Your account is active again", body: reason, path: "settings", ref_kind: "creator", ref_id: creator.id });
  } else {
    ensure(user.status !== "suspended", "invalid_state", "This account is already on hold.", undefined, 409);
    tx.patch("users", user.id, { status: "suspended" });
    if (input.action === "ban") {
      for (const s of tx.all("submissions").filter((x) => x.creator_id === creator.id && ["in_review", "changes_requested", "approved", "qa_pending"].includes(x.status))) {
        releaseFor(tx, s.bounty_id, s.reserved_cents);
        tx.patch("submissions", s.id, { status: "withdrawn", reserved_cents: 0, updated_at: tx.now });
        tx.unset("submissions", s.id, "sla_due_at");
        recountBounty(tx, s.bounty_id);
        withdrawn += 1;
      }
    }
    notifyCreator(tx, creator.id, { kind: "system_notice", title: input.action === "ban" ? "Your account was closed" : "Your account is on hold", body: `${reason} Your earned money is safe; a person replies within 24 hours.`, path: "settings", ref_kind: "creator", ref_id: creator.id });
  }
  audit(tx, { action: `creator ${input.action}`, target_kind: "creator", target_id: creator.id, reason: `@${creator.handle}: ${reason}`, route: "/admin/creators" });
  return { creator: tx.must("creators", creator.id), withdrawn };
}

/** Ops suspends a brand workspace (its live bounties pause, its members can read but not act) or restores it. */
export function setBrandStanding(tx: Tx, input: { brand_id: string; action: "suspend" | "restore"; reason: string }): { brand: Brand; paused_bounties: number } {
  requireAdmin(tx);
  const brand = tx.must("brands", input.brand_id, "Brand");
  const reason = needReason(input.reason, input.action === "suspend" ? "a suspension" : "restoring a workspace");
  const members = tx.all("brand_members").filter((m) => m.brand_id === brand.id && m.status === "active");
  let paused = 0;
  if (input.action === "suspend") {
    for (const m of members) {
      const u = tx.get("users", m.user_id);
      if (u && u.status === "active") tx.patch("users", u.id, { status: "suspended" });
    }
    for (const b of tx.all("bounties").filter((x) => x.brand_id === brand.id && (x.status === "live" || x.status === "filled"))) {
      tx.patch("bounties", b.id, { status: "paused", updated_at: tx.now });
      paused += 1;
    }
  } else {
    for (const m of members) {
      const u = tx.get("users", m.user_id);
      if (u && u.status === "suspended") tx.patch("users", u.id, { status: "active" });
    }
  }
  audit(tx, { action: `brand ${input.action}`, target_kind: "brand", target_id: brand.id, reason: `${brand.name}: ${reason}`, route: "/admin/brands" });
  return { brand: tx.must("brands", brand.id), paused_bounties: paused };
}

/** Ops moves a brand to another plan's rate without charging (a logged fee adjustment: new bounties use the new take rate). */
export function adjustBrandPlan(tx: Tx, input: { brand_id: string; plan: Plan; reason: string }): { brand: Brand } {
  requireAdmin(tx);
  const brand = tx.must("brands", input.brand_id, "Brand");
  const reason = needReason(input.reason, "a fee adjustment");
  ensure(brand.plan !== input.plan, "same_plan", `${brand.name} is already on ${planLabel(input.plan)}.`, undefined, 409);
  const next = tx.patch("brands", brand.id, { plan: input.plan });
  audit(tx, { action: "fee adjustment", target_kind: "brand", target_id: brand.id, reason: `${brand.name}: ${planLabel(brand.plan)} to ${planLabel(input.plan)}. ${reason}`, route: "/admin/brands" });
  return { brand: next };
}

// ── the review SLA desk ────────────────────────────────────────────────────────────────────────

const waiting = (s: Submission): boolean => s.status === "in_review";

/** Nudges the brand about a video that is stale or past the 72-hour promise. */
export function slaNudge(tx: Tx, input: { submission_id: string }): { submission: Submission } {
  requireAdmin(tx);
  const s = tx.must("submissions", input.submission_id, "Submission");
  ensure(waiting(s), "invalid_state", "That video is not waiting for a decision.", undefined, 409);
  const bounty = tx.must("bounties", s.bounty_id);
  notifyBrand(tx, s.brand_id, { kind: "review_sla_warning", title: "A video is waiting on you", body: `"${bounty.title}": decide by ${s.sla_due_at ?? addHours(s.submitted_at, bounty.review_sla_hours)} to keep the ${bounty.review_sla_hours}-hour review promise.`, route: `/brand/review/${s.id}`, ref_kind: "submission", ref_id: s.id, member_id: bounty.owner_member_id });
  audit(tx, { action: "SLA nudge", target_kind: "submission", target_id: s.id, reason: `Nudged the brand about ${bounty.title}.`, route: "/admin/sla" });
  return { submission: s };
}

/** Approves a video the brand left past the window, when every QA check is clean (the timeout policy "approve if clean", by hand). */
export function slaApproveIfClean(tx: Tx, input: { submission_id: string }): { submission: Submission } {
  const user = requireAdmin(tx);
  const s = tx.must("submissions", input.submission_id, "Submission");
  ensure(waiting(s), "invalid_state", "That video is not waiting for a decision.", undefined, 409);
  const v = s.versions[s.version - 1];
  ensure(v && v.qa_fail === 0 && v.qa_warn === 0, "not_clean", "This video has QA warnings or failures, so only the brand can decide it.", "Nudge the brand instead.", 409);
  const approved = finalizeApproval(tx, s.id, { action: "timeout_approve", by_user_id: user.id, summary: "Approved by Ops: the review window passed and every QA check was clean." });
  audit(tx, { action: "approve if clean", target_kind: "submission", target_id: s.id, reason: "Past the review window, QA clean.", route: "/admin/sla" });
  return { submission: approved };
}

/** Gives a bounty's review queue a new named owner (a brand member of the same workspace). */
export function reassignBountyOwner(tx: Tx, input: { bounty_id: string; member_id: string }): { bounty: Bounty } {
  requireAdmin(tx);
  const b = tx.must("bounties", input.bounty_id, "Bounty");
  const member = tx.must("brand_members", input.member_id, "Team member");
  ensure(member.brand_id === b.brand_id && member.status === "active", "invalid_member", "Pick an active member of the brand's workspace.", undefined, 422);
  const next = tx.patch("bounties", b.id, { owner_member_id: member.id, updated_at: tx.now });
  audit(tx, { action: "review owner changed", target_kind: "bounty", target_id: b.id, reason: `${b.title} now belongs to ${tx.get("users", member.user_id)?.display_name ?? member.id}.`, route: "/admin/sla" });
  return { bounty: next };
}
