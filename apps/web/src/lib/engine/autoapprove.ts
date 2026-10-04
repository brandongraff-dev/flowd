/**
 * Guarded auto-approve.
 *
 * A rule is conditions + scope + guardrails. It can only ever approve ORGANIC posting, never paid-ad rights. It needs a dry run on the last 50
 * submissions before it can be switched on, sends 10% of its own approvals to a human (the spot-check), pauses on any clawback (and on a fraud flag
 * unless its guardrails say otherwise), and has a kill switch. First-time creators are always reviewed by a person. A hard safety failure (a missing disclosure, a duplicate, a fraud score in the hold
 * band) is never auto-approved, whatever the rule says.
 *
 * Randomness is injected (`Rng`): the same inputs and seed give the same spot-check, in tests and in production audits.
 */

import type { AutoApproveRule, DryRun, IsoTimestamp, Platform, RuleGuardrails, RuleStatus, ScoreBand, Tier, TimeoutPolicy } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatPercent } from "./money";
import type { Rng } from "./rng";
import { sample } from "./rng";
import { bandAtLeast } from "./scoring";
import { toMs } from "./time";

// ── a submission as the rule sees it ───────────────────────────────────────────────────────────

export interface AutoApproveSubject {
  submission_id: string;
  bounty_id: string;
  creator_id: string;
  tier: Tier;
  platform: Platform;
  flow_band: ScoreBand;
  beats_found: number;
  beats_required: number;
  /** Spoken and on-screen disclosure both passed. */
  disclosure_pass: boolean;
  /** No perceptual-hash match with another video. */
  no_duplicate: boolean;
  music_pass: boolean;
  fraud_score: number;
  us_audience_ratio: number;
  creator_approved_count: number;
  creator_approval_rate: number;
  submitted_at: IsoTimestamp;
}

/** The slice of a rule that decides. */
export type RuleLike = Pick<AutoApproveRule, "status" | "conditions" | "scope" | "guardrails">;

/** Running totals the guardrails read. */
export interface RuleState {
  /** Auto-approvals already made today. */
  approved_today: number;
  /** Budget the rule has approved today (cents of per-video cap reserved). */
  spent_today_cents: number;
  /** A clawback or fraud event paused the rule. */
  paused_by_event?: boolean;
}

export interface ConditionResult {
  id: string;
  label: string;
  passed: boolean;
  /** Plain English: what was found against what was needed. */
  detail: string;
  /** A hard safety check: never auto-approved when it fails, whatever the rule says. */
  hard?: boolean;
}

export type AutoDecision = "auto_approve" | "send_to_human" | "block";

export interface RuleEvaluation {
  decision: AutoDecision;
  conditions: ConditionResult[];
  /** Why it was not auto-approved, in order of importance. Empty for an approval. */
  reasons: string[];
  /** Always organic posting only. Paid-ad rights are never granted by a rule. */
  grants: "organic_only";
  /** True when a hard safety check failed. */
  hard_block: boolean;
  /** True when this approval was selected for a human spot-check. */
  spot_check: boolean;
}

// ── conditions ─────────────────────────────────────────────────────────────────────────────────

/** Evaluates every condition of a rule on a submission, soft ones from the rule and hard safety ones always. */
export function checkConditions(rule: RuleLike, s: AutoApproveSubject): ConditionResult[] {
  const c = rule.conditions;
  const out: ConditionResult[] = [];
  out.push({
    id: "disclosure",
    label: "Disclosure spoken and on screen",
    passed: s.disclosure_pass,
    detail: s.disclosure_pass ? "Both disclosures present." : "A disclosure is missing. This always needs a person.",
    hard: true,
  });
  out.push({
    id: "duplicate",
    label: "No duplicate video",
    passed: s.no_duplicate,
    detail: s.no_duplicate ? "No matching video." : "This video matches another. This always needs a person.",
    hard: true,
  });
  out.push({
    id: "fraud_hold",
    label: "Fraud score under the hold band",
    passed: s.fraud_score < CONSTANTS.fraud.hold_threshold,
    detail: s.fraud_score < CONSTANTS.fraud.hold_threshold ? `Fraud score ${s.fraud_score}.` : `Fraud score ${s.fraud_score} is in the hold band. This always needs a person.`,
    hard: true,
  });
  out.push({
    id: "min_flow_band",
    label: `Flow band ${c.min_flow_band} or better`,
    passed: bandAtLeast(s.flow_band, c.min_flow_band),
    detail: `Flow band ${s.flow_band} (needs ${c.min_flow_band} or better).`,
  });
  if (c.require_all_beats) {
    out.push({ id: "all_beats", label: "Every required beat found", passed: s.beats_found >= s.beats_required, detail: `${s.beats_found} of ${s.beats_required} required beats found.` });
  }
  if (c.require_music_pass) {
    out.push({ id: "music", label: "Music passes", passed: s.music_pass, detail: s.music_pass ? "Music is licensed for ads." : "The music isn't licensed for ads." });
  }
  out.push({
    id: "fraud_max",
    label: `Fraud score at most ${c.max_fraud_score}`,
    passed: s.fraud_score <= c.max_fraud_score,
    detail: `Fraud score ${s.fraud_score} (limit ${c.max_fraud_score}).`,
  });
  out.push({
    id: "us_audience",
    label: `US audience at least ${formatPercent(c.min_us_audience_ratio, 0)}`,
    passed: s.us_audience_ratio >= c.min_us_audience_ratio,
    detail: `${formatPercent(s.us_audience_ratio, 0)} US audience (needs ${formatPercent(c.min_us_audience_ratio, 0)}).`,
  });
  out.push({
    id: "approved_posts",
    label: `At least ${c.min_creator_approved_posts} approved posts`,
    passed: s.creator_approved_count >= c.min_creator_approved_posts,
    detail: `${s.creator_approved_count} approved posts (needs ${c.min_creator_approved_posts}).`,
  });
  out.push({
    id: "approval_rate",
    label: `Approval rate at least ${formatPercent(c.min_creator_approval_rate, 0)}`,
    passed: s.creator_approval_rate >= c.min_creator_approval_rate,
    detail: `${formatPercent(s.creator_approval_rate, 0)} approved (needs ${formatPercent(c.min_creator_approval_rate, 0)}).`,
  });
  return out;
}

/** Whether a submission is inside a rule's scope: its bounties, tiers and platforms. An empty list means everything. */
export function inScope(rule: Pick<AutoApproveRule, "scope">, s: Pick<AutoApproveSubject, "bounty_id" | "tier" | "platform">): { ok: boolean; reason?: string } {
  const sc = rule.scope;
  if (sc.bounty_ids.length > 0 && !sc.bounty_ids.includes(s.bounty_id)) return { ok: false, reason: "This bounty is not in the rule's scope." };
  if (sc.tiers.length > 0 && !sc.tiers.includes(s.tier)) return { ok: false, reason: `The ${s.tier} tier is not in the rule's scope.` };
  if (sc.platforms.length > 0 && !sc.platforms.includes(s.platform)) return { ok: false, reason: `${s.platform} is not in the rule's scope.` };
  return { ok: true };
}

const STATUS_REASON: Readonly<Record<Exclude<RuleStatus, "active">, string>> = {
  draft: "The rule is still a draft.",
  dry_run: "The rule is in dry run: it shows what it would do and approves nothing yet.",
  paused: "The rule is paused.",
  killed: "The rule was killed.",
};

/**
 * Evaluates one submission against a rule.
 *  - not active (draft, dry run, paused, killed): send to a human
 *  - hard safety failure (disclosure, duplicate, fraud hold band): `block`, which means "never auto, show the flag"
 *  - first-time creator: always a human
 *  - out of scope, a guardrail reached, or any soft condition failed: send to a human, with the reasons
 *  - otherwise: auto-approve (organic only)
 * `state` carries the daily guardrails; omit it (a dry run) to ignore caps.
 */
export function evaluateRule(rule: RuleLike, s: AutoApproveSubject, state?: RuleState): RuleEvaluation {
  const conditions = checkConditions(rule, s);
  const base = { conditions, grants: "organic_only" as const, spot_check: false };
  const hard = conditions.filter((c) => c.hard && !c.passed);
  if (hard.length > 0) return { ...base, decision: "block", reasons: hard.map((h) => h.detail), hard_block: true };
  const reasons: string[] = [];
  if (rule.status !== "active") reasons.push(STATUS_REASON[rule.status]);
  if (CONSTANTS.auto_approve.first_time_creators_manual && s.creator_approved_count === 0) reasons.push("First-time creators are always reviewed by a person.");
  const scope = inScope(rule, s);
  if (!scope.ok && scope.reason) reasons.push(scope.reason);
  for (const c of conditions.filter((x) => !x.hard && !x.passed)) reasons.push(c.detail);
  if (state?.paused_by_event) reasons.push("The rule is paused after a clawback or fraud event.");
  if (state && rule.guardrails.daily_cap > 0 && state.approved_today >= rule.guardrails.daily_cap) reasons.push(`The daily cap of ${rule.guardrails.daily_cap} auto-approvals is reached.`);
  if (state && rule.guardrails.budget_cap_cents > 0 && state.spent_today_cents >= rule.guardrails.budget_cap_cents) reasons.push("The daily budget cap is reached.");
  if (reasons.length > 0) return { ...base, decision: "send_to_human", reasons, hard_block: false };
  return { ...base, decision: "auto_approve", reasons: [], hard_block: false };
}

// ── spot check ─────────────────────────────────────────────────────────────────────────────────

/** One approval in `1 / ratio` goes to a human on average. True means: route this one to a person. */
export const shouldSpotCheck = (rng: Rng, ratio: number = CONSTANTS.auto_approve.spot_check_ratio): boolean => ratio > 0 && rng() < ratio;

/** How many of `n` approvals a batch spot-check reviews: round(n x ratio), at least one when there is anything to check. */
export const spotCheckCount = (n: number, ratio: number = CONSTANTS.auto_approve.spot_check_ratio): number => (n <= 0 || ratio <= 0 ? 0 : Math.min(n, Math.max(1, Math.round(n * ratio))));

/** Picks the approvals a human re-checks: a random sample of `spotCheckCount(n)` items, reproducible for a given Rng. */
export function sampleForSpotCheck<T>(items: readonly T[], rng: Rng, ratio: number = CONSTANTS.auto_approve.spot_check_ratio): T[] {
  return sample(rng, items, spotCheckCount(items.length, ratio));
}

/**
 * An auto-approval that is randomly routed to a person instead (10% by default). Anything that was not an approval is returned unchanged.
 * The routed evaluation says why: "Random spot-check".
 */
export function withSpotCheck(e: RuleEvaluation, rng: Rng, ratio: number = CONSTANTS.auto_approve.spot_check_ratio): RuleEvaluation {
  if (e.decision !== "auto_approve" || !shouldSpotCheck(rng, ratio)) return e;
  return { ...e, decision: "send_to_human", reasons: ["Random spot-check: a person reviews a share of automatic approvals."], spot_check: true };
}

// ── dry run ────────────────────────────────────────────────────────────────────────────────────

export interface DryRunResult {
  dry_run: DryRun;
  /** "Would have approved 31 of the last 50." */
  headline: string;
  per_submission: { submission_id: string; decision: AutoDecision; reasons: string[] }[];
}

/**
 * Dry run: what the rule WOULD have done on the most recent submissions (default 50), with no guardrail caps. `would_block` counts hard safety
 * failures, `would_send_to_human` the rest that a person would still review, `would_approve` the automatic approvals. Enabling needs one.
 */
export function dryRun(rule: RuleLike, submissions: readonly AutoApproveSubject[], p: { now: IsoTimestamp; sample_size?: number }): DryRunResult {
  const size = p.sample_size ?? CONSTANTS.auto_approve.dry_run_sample;
  const recent = [...submissions].sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0)).slice(0, size);
  const per = recent.map((s) => {
    const e = evaluateRule({ ...rule, status: "active" }, s);
    return { submission_id: s.submission_id, decision: e.decision, reasons: e.reasons };
  });
  const would_approve = per.filter((r) => r.decision === "auto_approve").length;
  const would_block = per.filter((r) => r.decision === "block").length;
  return {
    dry_run: { ran_at: p.now, sample_size: recent.length, would_approve, would_send_to_human: recent.length - would_approve - would_block, would_block },
    headline: `Would have approved ${would_approve} of the last ${recent.length}.`,
    per_submission: per,
  };
}

// ── lifecycle ──────────────────────────────────────────────────────────────────────────────────

/**
 * A rule can be switched on only after a dry run. A killed rule needs a FRESH dry run (one that ran after the kill) before it can come back
 * (DOMAIN: "Killed: kill switch used; needs a fresh dry run to re-enable").
 */
export function canEnable(rule: Pick<AutoApproveRule, "status" | "dry_run" | "killed_at">): { ok: boolean; reason?: string } {
  if (rule.status === "active") return { ok: false, reason: "The rule is already on." };
  if (!rule.dry_run) return { ok: false, reason: "Run the dry run first. It shows what the rule would have done on your last submissions." };
  if (rule.status === "killed" && rule.killed_at && toMs(rule.dry_run.ran_at) <= toMs(rule.killed_at)) {
    return { ok: false, reason: "A killed rule needs a fresh dry run before it can be switched back on." };
  }
  return { ok: true };
}

/** The patch that kills a rule: status, time and reason. The audit entry is the caller's to write. */
export function killRule(reason: string, now: IsoTimestamp): { status: RuleStatus; killed_at: IsoTimestamp; kill_reason: string } {
  return { status: "killed", killed_at: now, kill_reason: reason };
}

/** What pauses an active rule: a clawback of something it approved, or a fraud flag on a post it approved. */
export type RuleEvent = "clawback" | "fraud_flag";

/**
 * A clawback always pauses an active rule, and a fraud flag does too unless the rule's guardrails turn `pause_on_fraud` off, so a person looks before
 * it approves anything else. Only an active rule is paused: draft, dry run, paused and killed rules stay as they are.
 */
export function statusAfterEvent(status: RuleStatus, event: RuleEvent = "clawback", guardrails?: Pick<RuleGuardrails, "pause_on_fraud">): RuleStatus {
  if (status !== "active") return status;
  if (event === "fraud_flag" && guardrails && !guardrails.pause_on_fraud) return status;
  return "paused";
}

/** The share of this rule's approvals that go to a person: its own `spot_check_ratio`, else the platform's 10%. */
export const spotCheckRatioOf = (rule: Pick<RuleLike, "guardrails">): number => rule.guardrails.spot_check_ratio ?? CONSTANTS.auto_approve.spot_check_ratio;

/**
 * What happens at the 72-hour deadline when nobody has decided. With "approve if clean" the submission is approved only when every QA check passes;
 * otherwise (the default) it is escalated to the bounty owner and the SLA desk. Before 72 hours the answer is always to wait.
 */
export function timeoutAction(p: { policy: TimeoutPolicy; hours_in_queue: number; qa_clean: boolean }): "wait" | "approve" | "escalate" {
  if (p.hours_in_queue < CONSTANTS.review.sla_hours) return "wait";
  return p.policy === "approve_if_clean" && p.qa_clean ? "approve" : "escalate";
}
