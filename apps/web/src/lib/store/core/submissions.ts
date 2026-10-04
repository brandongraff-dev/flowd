/**
 * The creator's side of a bounty: save, claim, submit a video (Reserved Slot), revise, withdraw and appeal.
 *
 * Submitting takes a Reserved Slot (the per-video cap plus the fee) from the bounty's pool at once, so an approved video is always paid even if the
 * pool later empties. QA and the two checklist scores run immediately; a video that fails hard (an exact duplicate) is rejected by the system with
 * the evidence attached. Everything else enters review and starts the 72-hour SLA.
 */

import type {
  BountySave,
  CurveShape,
  Dispute,
  FormatId,
  Platform,
  Submission,
  SubmissionSource,
  SubmissionVersion,
  VideoAnalysis,
  VideoMeta,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  addHours,
  clockLabel,
  creatorFraudEvidence,
  evaluateRule,
  hoursBetween,
  makeArtSeed,
  rankBountiesForCreator,
  seededRng,
  shouldSpotCheck,
  toMs,
} from "@/lib/engine";
import { analyzeClip, type ClipInput } from "./analysis";
import { autoApproveSubject, creatorProfile, matchBounty } from "./adapters";
import { releaseFor, reserveFor, ensureOpen } from "./escrow";
import { holdsAcceptedOffer } from "./offers";
import { requireCreator } from "./guards";
import { finalizeApproval } from "./review";
import { notifyAdmins, notifyBrand, notifyCreator, logActivity } from "./notify";
import { recountBounty } from "./recount";
import { refreshCreator, refreshReputation } from "./creator-stats";
import { pad } from "../ids";
import { ActionError, ensure, type Tx } from "./tx";

// ── eligibility ────────────────────────────────────────────────────────────────────────────────

/** Throws unless this creator may take this bounty now (tier early access, the five gates, funded and live). */
function ensureEligible(tx: Tx, creatorId: string, bountyId: string): void {
  const creator = tx.must("creators", creatorId, "Creator");
  const bounty = tx.must("bounties", bountyId, "Bounty");
  ensureOpen(bounty);
  if (bounty.visibility === "private" || bounty.visibility === "invite_only") {
    ensure(holdsAcceptedOffer(tx, bountyId, creatorId), "invite_only", bounty.visibility === "private" ? "This bounty is private to the creator it was offered to." : "This bounty is invite-only.", "Brands send invites from their creator list.", 403);
  }
  const [match] = rankBountiesForCreator({ creator: creatorProfile(tx.state, creator), bounties: [matchBounty(tx.state, bounty)], now: tx.now, include_hidden: true });
  if (!match) return;
  if (!match.visible) {
    throw new ActionError("early_access", `This bounty opens to your tier at ${clockLabel(match.visible_at)} UTC.`, "Higher tiers get a head start: Silver 1 hour, Gold 3, Platinum 6, Elite 12.", 403);
  }
  if (match.locked) throw new ActionError("not_eligible", match.lock_reasons[0] ?? "You are not eligible for this bounty.", match.lock_reasons.slice(1).join(" ") || undefined, 403);
  const own = tx.all("submissions").filter((s) => s.bounty_id === bountyId && s.creator_id === creatorId && ["qa_pending", "in_review", "changes_requested", "approved", "posted", "appealed"].includes(s.status));
  ensure(own.length < bounty.deliverables.videos_per_creator, "already_submitted", "You have already submitted to this bounty.", "Open your submission to see where it stands.", 409);
}

// ── save and claim ─────────────────────────────────────────────────────────────────────────────

function upsertSave(tx: Tx, creatorId: string, bountyId: string, patch: Partial<BountySave>): BountySave {
  const existing = tx.all("bounty_saves").find((s) => s.creator_id === creatorId && s.bounty_id === bountyId);
  if (existing) return tx.patch("bounty_saves", existing.id, { ...patch, updated_at: tx.now });
  return tx.put("bounty_saves", { id: tx.nextId("save"), creator_id: creatorId, bounty_id: bountyId, stage: "saved", saved_at: tx.now, updated_at: tx.now, ...patch });
}

/** Saves or un-saves a bounty for later. */
export function saveBounty(tx: Tx, input: { bounty_id: string; saved?: boolean }): { saved: boolean } {
  const { creator } = requireCreator(tx);
  tx.must("bounties", input.bounty_id, "Bounty");
  const existing = tx.all("bounty_saves").find((s) => s.creator_id === creator.id && s.bounty_id === input.bounty_id);
  const saved = input.saved ?? !existing;
  if (!saved) {
    if (existing && existing.stage === "saved") tx.remove("bounty_saves", existing.id);
    return { saved: false };
  }
  if (!existing) upsertSave(tx, creator.id, input.bounty_id, { stage: "saved" });
  return { saved: true };
}

/** "Make it": joins a bounty (a claimed place, started in Studio). Gated exactly like a submission. */
export function claimBounty(tx: Tx, input: { bounty_id: string }): { save: BountySave } {
  const { creator } = requireCreator(tx);
  ensureEligible(tx, creator.id, input.bounty_id);
  const existing = tx.all("bounty_saves").find((s) => s.creator_id === creator.id && s.bounty_id === input.bounty_id);
  if (existing && (existing.stage === "submitted")) throw new ActionError("already_submitted", "You have already submitted to this bounty.", undefined, 409);
  return { save: upsertSave(tx, creator.id, input.bounty_id, { stage: "joined" }) };
}

// ── submit ─────────────────────────────────────────────────────────────────────────────────────

export interface SubmitVideoInput {
  bounty_id: string;
  /** Short internal title; defaults to "<hook type> hook v1". */
  title?: string;
  format_id?: FormatId;
  source?: SubmissionSource;
  clip: ClipInput;
  /** Must be true: the creator accepts the bounty's Rights Card at submit (a snapshot is stored). */
  accept_rights: boolean;
  /** Mock file facts (name and size) to show in the version history. */
  file?: { name?: string; size_bytes?: number };
}

export interface SubmitVideoResult {
  submission: Submission;
  analysis: VideoAnalysis;
  /** What the pool reserved for this video until the post is attached. */
  reserved_cents: number;
  /** `in_review` normally; `rejected` when QA hard-failed; `approved` when a guarded auto-approve rule passed it. */
  status: Submission["status"];
  /** Present when auto-approve took the decision. */
  auto_approved: boolean;
}

function videoMeta(tx: Tx, clipMs: number, clip: ClipInput, file: SubmitVideoInput["file"], hue: number, label: string): VideoMeta {
  const asset = `vid_${pad(tx.nextNumber("vid"), 4)}`;
  const durationS = clipMs / 1000;
  return {
    asset_id: asset,
    duration_ms: clipMs,
    width: clip.width ?? 1080,
    height: clip.height ?? 1920,
    size_bytes: file?.size_bytes ?? Math.round(durationS * 960_000),
    fps: 30,
    has_captions: clip.has_captions ?? true,
    language: "en",
    art: makeArtSeed(seededRng(asset), { hue, label }),
    uploaded_at: addHours(tx.now, 0),
  };
}

/** Fraud evidence shown to the reviewer before approving: the creator's recent scores and curve shapes, audience share, duplicate and follower quality. */
function fraudEvidenceFor(tx: Tx, creatorId: string, duplicate?: { submission_id: string; phash_distance: number }) {
  const posts = tx.all("posts").filter((p) => p.creator_id === creatorId).sort((a, b) => (a.posted_at < b.posted_at ? 1 : -1)).slice(0, 5);
  const accounts = tx.all("social_accounts").filter((a) => a.creator_id === creatorId && a.status === "connected");
  const best = [...accounts].sort((a, b) => b.median_views_28d - a.median_views_28d)[0];
  return creatorFraudEvidence({
    recent_scores: posts.map((p) => p.fraud.score),
    recent_shapes: posts.map((): CurveShape => "organic"),
    audience_us_ratio: best?.us_audience_ratio ?? 0.5,
    followers: best?.followers ?? 0,
    median_views_28d: best?.median_views_28d ?? 0,
    engagement_rate: best?.engagement_rate ?? 0.04,
    ...(duplicate ? { duplicate } : {}),
  });
}

/** Hashes of videos already analysed in this session (other creators' and this creator's own) for duplicate detection. */
function knownHashes(tx: Tx, excludeSubmissionId?: string): { id: string; phash: string; creator_id?: string }[] {
  return tx
    .all("video_analyses")
    .filter((a) => a.submission_id !== excludeSubmissionId)
    .map((a) => ({ id: a.submission_id, phash: a.phash, creator_id: tx.get("submissions", a.submission_id)?.creator_id }));
}

/**
 * Evaluates the brand's active auto-approve rules on a submission. A rule approves only when every guardrail passes, only organic rights are
 * granted, and about one in ten approvals is routed to a person instead (spot-check, seeded so it is reproducible).
 */
export function tryAutoApprove(tx: Tx, submissionId: string, analysis: VideoAnalysis | undefined): { approved: boolean; rule_id?: string } {
  const sub = tx.must("submissions", submissionId, "Submission");
  if (sub.status !== "in_review") return { approved: false };
  const creator = tx.must("creators", sub.creator_id);
  const bounty = tx.must("bounties", sub.bounty_id);
  const rules = tx.all("auto_approve_rules").filter((r) => r.brand_id === sub.brand_id && r.status === "active");
  const today = tx.now.slice(0, 10);
  for (const rule of rules) {
    const approvedToday = tx.all("submissions").filter((s) => s.brand_id === sub.brand_id && s.auto_approved && s.decision?.decided_at.slice(0, 10) === today).length;
    const subject = autoApproveSubject(sub, analysis, creator, bounty);
    const evaluation = evaluateRule(rule, subject, { approved_today: approvedToday, spent_today_cents: approvedToday * bounty.per_video_cap_cents });
    if (evaluation.decision === "auto_approve") {
      const rng = seededRng(`${rule.id}|${sub.id}`);
      const spot = shouldSpotCheck(rng, rule.guardrails.spot_check_ratio);
      if (spot) {
        tx.patch("auto_approve_rules", rule.id, (r) => ({
          stats: { ...r.stats, spot_checked: r.stats.spot_checked + 1 },
          audit: [...r.audit, { at: tx.now, action: "spot_check" as const, note: `Routed ${sub.id} to a person (10% spot-check).` }],
          updated_at: tx.now,
        }));
        return { approved: false, rule_id: rule.id };
      }
      finalizeApproval(tx, sub.id, { action: "auto_approve", summary: `Approved by "${rule.name}": every guardrail passed. Organic posting only.` });
      tx.patch("auto_approve_rules", rule.id, (r) => ({ stats: { ...r.stats, auto_approved: r.stats.auto_approved + 1, last_triggered_at: tx.now }, updated_at: tx.now }));
      logActivity(tx, { brand_id: sub.brand_id, action: "submission_approved", summary: `Auto-approve rule "${rule.name}" approved a video from @${creator.handle} on "${bounty.title}"`, target_kind: "submission", target_id: sub.id });
      return { approved: true, rule_id: rule.id };
    }
  }
  return { approved: false };
}

/** Creator submits a video: gates, Reserved Slot, QA and scores, then review (or an immediate system rejection / auto-approval). */
export function submitVideo(tx: Tx, input: SubmitVideoInput): SubmitVideoResult {
  const { creator } = requireCreator(tx);
  const bounty = tx.must("bounties", input.bounty_id, "Bounty");
  ensure(input.accept_rights === true, "rights_not_accepted", "Accept the Rights Card to submit. It is a snapshot of exactly what you agree to.", "Open the Rights Card on the bounty and tick the box.", 422);
  ensureEligible(tx, creator.id, bounty.id);
  const app = tx.must("apps", bounty.app_id);
  const brand = tx.must("brands", bounty.brand_id);
  const format = input.format_id ? tx.get("formats", input.format_id) : undefined;

  const subId = tx.nextId("sub");
  const num = subId.slice("sub_".length);
  const title = input.title?.trim() || `${format?.name ?? "Video"} v1`;
  const reserved = reserveFor(tx, bounty.id);
  const result = analyzeClip({ clip: { ...input.clip, known_hashes: input.clip.known_hashes ?? knownHashes(tx) }, bounty, app, brand, format, creatorId: creator.id, title });
  const a = result.analysis;
  const video = videoMeta(tx, a.duration_ms, input.clip, input.file, app.icon.hue_a, a.tags.hook_words);
  const duplicate = result.qa.duplicates[0];
  const evidence = fraudEvidenceFor(tx, creator.id, duplicate ? { submission_id: duplicate.id, phash_distance: duplicate.distance } : undefined);
  const version: SubmissionVersion = {
    version: 1,
    submitted_at: tx.now,
    video,
    flow_band: result.flow.band,
    flow_points: result.flow.points,
    hook_band: result.hook.band,
    hook_points: result.hook.points,
    qa_pass: result.qa.pass,
    qa_warn: result.qa.warn,
    qa_fail: result.qa.fail,
  };
  const analysis: VideoAnalysis = { id: `va_${num}_v1`, submission_id: subId, version: 1, analysed_at: tx.now, ...a };
  tx.put("video_analyses", analysis);

  const hardFail = duplicate?.exact === true;
  const sub: Submission = {
    id: subId,
    bounty_id: bounty.id,
    creator_id: creator.id,
    brand_id: bounty.brand_id,
    app_id: bounty.app_id,
    status: hardFail ? "rejected" : "in_review",
    version: 1,
    versions: [version],
    source: input.source ?? "web_studio",
    ...(format ? { format_id: format.id } : {}),
    title,
    revision_round: 0,
    reserved_cents: hardFail ? 0 : reserved,
    flow_band: result.flow.band,
    flow_points: result.flow.points,
    hook_band: result.hook.band,
    hook_points: result.hook.points,
    rights_card: bounty.rights_card,
    rights_accepted_at: tx.now,
    fraud_evidence: evidence,
    submitted_at: tx.now,
    ...(hardFail ? {} : { sla_due_at: addHours(tx.now, bounty.review_sla_hours) }),
    sla_state: hardFail ? "met" : "on_track",
    ...(hardFail
      ? {
          decision: {
            action: "auto_reject" as const,
            decided_at: tx.now,
            reason_code: "duplicate_content" as const,
            evidence: { kind: "qa_check" as const, ref: "duplicate", excerpt: "This video matches one that was already submitted." },
            summary: "This exact video was already submitted. Film a new original take.",
            sla_met: true,
            appeal_used: false,
          },
        }
      : {}),
    auto_approved: false,
    updated_at: tx.now,
  };
  tx.put("submissions", sub);
  if (hardFail) releaseFor(tx, bounty.id, reserved);

  upsertSave(tx, creator.id, bounty.id, { stage: "submitted", submission_id: subId });
  recountBounty(tx, bounty.id);
  refreshCreator(tx, creator.id);
  refreshReputation(tx, creator.id);

  if (hardFail) {
    notifyCreator(tx, creator.id, { kind: "rejection", title: `Not accepted: "${bounty.title}"`, body: "This exact video was already submitted. Film a new original take; your reservation is released.", path: `submission/${subId}`, ref_kind: "submission", ref_id: subId });
  } else {
    notifyBrand(tx, bounty.brand_id, {
      kind: "review_waiting",
      title: `New video for "${bounty.title}"`,
      body: `From @${creator.handle}: Flow band ${result.flow.band}, ${result.qa.fail === 0 ? "no QA failures" : `${result.qa.fail} QA ${result.qa.fail === 1 ? "failure" : "failures"}`}. Decide by ${clockLabel(addHours(tx.now, bounty.review_sla_hours))} UTC.`,
      route: `/brand/review/${subId}`,
      ref_kind: "submission",
      ref_id: subId,
      member_id: bounty.owner_member_id,
    });
  }
  const auto = hardFail ? { approved: false } : tryAutoApprove(tx, subId, analysis);
  const final = tx.must("submissions", subId);
  return { submission: final, analysis, reserved_cents: final.reserved_cents, status: final.status, auto_approved: auto.approved };
}

// ── revise, withdraw, appeal ───────────────────────────────────────────────────────────────────

/** Uploads the next version after changes were requested. The reservation stays; the 72-hour SLA restarts. Open must-fix notes carry over until ticked off. */
export function reviseSubmission(tx: Tx, input: { submission_id: string; clip: ClipInput; changes_summary?: string; file?: { size_bytes?: number } }): { submission: Submission; analysis: VideoAnalysis; auto_approved: boolean } {
  const { creator } = requireCreator(tx);
  const sub = tx.must("submissions", input.submission_id, "Submission");
  ensure(sub.creator_id === creator.id, "forbidden", "That submission belongs to another creator.", undefined, 403);
  ensure(sub.status === "changes_requested", "invalid_state", `This video is ${sub.status.replace(/_/g, " ")}, so it cannot be revised now.`, undefined, 409);
  const decidedAt = sub.decision?.decided_at ?? sub.updated_at;
  ensure(hoursBetween(decidedAt, tx.now) <= CONSTANTS.review.revision_expiry_days * 24, "revision_expired", `The ${CONSTANTS.review.revision_expiry_days}-day window to resubmit has passed.`, "Submit a new video to the bounty instead.", 409);
  const bounty = tx.must("bounties", sub.bounty_id);
  const app = tx.must("apps", sub.app_id);
  const brand = tx.must("brands", sub.brand_id);
  const format = sub.format_id ? tx.get("formats", sub.format_id) : undefined;
  const version = sub.version + 1;
  const num = sub.id.slice("sub_".length);
  const result = analyzeClip({ clip: { ...input.clip, known_hashes: input.clip.known_hashes ?? knownHashes(tx, sub.id) }, bounty, app, brand, format, creatorId: creator.id, title: `${sub.title} v${version}` });
  const video = videoMeta(tx, result.analysis.duration_ms, input.clip, input.file, app.icon.hue_a, result.analysis.tags.hook_words);
  const v: SubmissionVersion = {
    version,
    submitted_at: tx.now,
    video,
    flow_band: result.flow.band,
    flow_points: result.flow.points,
    hook_band: result.hook.band,
    hook_points: result.hook.points,
    qa_pass: result.qa.pass,
    qa_warn: result.qa.warn,
    qa_fail: result.qa.fail,
    ...(input.changes_summary ? { changes_summary: input.changes_summary } : {}),
  };
  const analysis: VideoAnalysis = { id: `va_${num}_v${version}`, submission_id: sub.id, version, analysed_at: tx.now, ...result.analysis };
  tx.put("video_analyses", analysis);
  tx.patch("submissions", sub.id, {
    status: "in_review",
    version,
    versions: [...sub.versions, v],
    flow_band: v.flow_band,
    flow_points: v.flow_points,
    hook_band: v.hook_band,
    hook_points: v.hook_points,
    sla_due_at: addHours(tx.now, bounty.review_sla_hours),
    sla_state: "on_track",
    updated_at: tx.now,
  });
  recountBounty(tx, sub.bounty_id);
  notifyBrand(tx, sub.brand_id, {
    kind: "review_waiting",
    title: `Revision v${version} for "${bounty.title}"`,
    body: `@${creator.handle} resubmitted${input.changes_summary ? `: ${input.changes_summary}` : "."} Decide by ${clockLabel(addHours(tx.now, bounty.review_sla_hours))} UTC.`,
    route: `/brand/review/${sub.id}`,
    ref_kind: "submission",
    ref_id: sub.id,
    member_id: bounty.owner_member_id,
  });
  const auto = tryAutoApprove(tx, sub.id, analysis);
  return { submission: tx.must("submissions", sub.id), analysis, auto_approved: auto.approved };
}

/** Withdraws a video before it is posted. The reservation returns to the pool. */
export function withdrawSubmission(tx: Tx, input: { submission_id: string }): { submission: Submission } {
  const { creator } = requireCreator(tx);
  const sub = tx.must("submissions", input.submission_id, "Submission");
  ensure(sub.creator_id === creator.id, "forbidden", "That submission belongs to another creator.", undefined, 403);
  ensure(["in_review", "changes_requested", "approved"].includes(sub.status), "invalid_state", `This video is ${sub.status.replace(/_/g, " ")}, so it cannot be withdrawn.`, "A posted video stays posted; you can remove the post itself.", 409);
  releaseFor(tx, sub.bounty_id, sub.reserved_cents);
  tx.patch("submissions", sub.id, { status: "withdrawn", reserved_cents: 0, updated_at: tx.now });
  tx.unset("submissions", sub.id, "sla_due_at");
  const save = tx.all("bounty_saves").find((s) => s.creator_id === creator.id && s.bounty_id === sub.bounty_id);
  if (save) tx.patch("bounty_saves", save.id, { stage: "joined", updated_at: tx.now });
  recountBounty(tx, sub.bounty_id);
  refreshCreator(tx, creator.id);
  refreshReputation(tx, creator.id);
  return { submission: tx.must("submissions", sub.id) };
}

/**
 * Appeals a rejection. One appeal per rejection, within seven days. A human at Ops decides within 72 hours by comparing the decision with the
 * brief and the video; the reservation is taken again so an overturn can be paid.
 */
export function appealRejection(tx: Tx, input: { submission_id: string; note: string; reason?: string }): { submission: Submission; dispute: Dispute } {
  const { creator } = requireCreator(tx);
  const sub = tx.must("submissions", input.submission_id, "Submission");
  ensure(sub.creator_id === creator.id, "forbidden", "That submission belongs to another creator.", undefined, 403);
  ensure(sub.status === "rejected" && sub.decision?.action === "reject", "invalid_state", "Only a rejected video can be appealed.", "System rejections for duplicates are not appealable here; resubmit an original take.", 409);
  ensure(!sub.decision.appeal_used, "appeal_used", "You have already used the one appeal for this rejection.", undefined, 409);
  ensure(toMs(tx.now) <= toMs(addDays(sub.decision.decided_at, CONSTANTS.review.appeal_window_days)), "appeal_window_closed", `Appeals must be filed within ${CONSTANTS.review.appeal_window_days} days of the decision.`, undefined, 409);
  ensure(input.note.trim().length >= 10, "note_required", "Say in a sentence or two why the reason does not match the brief.", undefined, 422);
  const bounty = tx.must("bounties", sub.bounty_id);
  let reserved = 0;
  try {
    reserved = reserveFor(tx, sub.bounty_id);
  } catch {
    reserved = 0;
  }
  const user = tx.get("users", creator.user_id);
  const dispute: Dispute = {
    id: tx.nextId("disp"),
    kind: "rejection_appeal",
    status: "open",
    opened_by: "creator",
    creator_id: creator.id,
    brand_id: sub.brand_id,
    bounty_id: sub.bounty_id,
    submission_id: sub.id,
    ...(sub.decision.reason_code ? { rejection_reason_code: sub.decision.reason_code } : {}),
    reason: input.reason?.trim() || "The reason does not match the brief.",
    note: input.note.trim(),
    evidence: sub.decision.evidence ? [sub.decision.evidence] : [],
    amount_in_dispute_cents: 0,
    events: [{ at: tx.now, actor: "creator", action: "opened", text: "Appeal opened from the rejection. One appeal is allowed per rejection.", ...(user ? { user_id: user.id } : {}) }],
    opened_at: tx.now,
    reply_due_at: addHours(tx.now, 24),
    resolution_due_at: addHours(tx.now, CONSTANTS.review.appeal_decision_sla_hours),
    updated_at: tx.now,
  };
  tx.put("disputes", dispute);
  tx.patch("submissions", sub.id, { status: "appealed", reserved_cents: reserved, decision: { ...sub.decision, appeal_used: true }, updated_at: tx.now });
  recountBounty(tx, sub.bounty_id);
  notifyAdmins(tx, { kind: "dispute_update", title: `Appeal on "${bounty.title}"`, body: `@${creator.handle} appeals a rejection (${sub.decision.reason_code?.replace(/_/g, " ") ?? "no code"}). Decide within 72 hours.`, route: `/admin/disputes/${dispute.id}`, ref_kind: "dispute", ref_id: dispute.id });
  notifyBrand(tx, sub.brand_id, { kind: "dispute_update", title: `Appeal on a rejection for "${bounty.title}"`, body: "An Ops reviewer will compare your decision with the brief and the video within 72 hours.", route: `/brand/disputes`, ref_kind: "dispute", ref_id: dispute.id });
  return { submission: tx.must("submissions", sub.id), dispute };
}

