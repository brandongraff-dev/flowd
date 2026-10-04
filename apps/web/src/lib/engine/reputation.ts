/**
 * Reputation both ways.
 *
 * Creator reliability (0 to 100) counts FINISHED work only, weighted toward recent decisions (half-life 45 days), and never penalises
 * multi-brand work or pending samples. Fewer than 5 finished decisions is "Building history": a provisional 70, and brands see a range, not a
 * verdict. Brand reliability (the Brand Scorecard, 0 to 100) rewards fast decisions, fair rejections, paying on time, running what it approves
 * and replying quickly; fewer than 10 decisions is "New brand", never a misleading figure.
 *
 * Both scores come with their components and a plain-English reason for each, so they can be explained and disputed.
 */

import type { BrandBadge, BrandBand, BrandScorecard, IsoTimestamp, ReliabilityComponent, SlaState } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatHours, formatPercent } from "./money";
import { clamp, median, quantile, round2 } from "./stats";
import { DAY_MS, addHours, clockLabel, hoursBetween, toMs } from "./time";

// ── creator reliability ────────────────────────────────────────────────────────────────────────

export interface CreatorReliabilityInput {
  /** Finished decisions (approved or rejected; withdrawn and expired are not decisions). */
  decisions: readonly { approved: boolean; decided_at: IsoTimestamp }[];
  now: IsoTimestamp;
  /** Revisions and deadlines met on time. */
  on_time: { ok: number; total: number };
  /** Approved videos posted within 7 days. */
  post_through: { posted: number; approved: number };
  /** Posts that passed the disclosure check the first time. */
  compliance: { passed: number; total: number };
  fraud_confirmed_90d: number;
  clawbacks_90d: number;
  disputes_lost_90d: number;
  /** Completed Academy lessons (0.5 points each, up to 5). */
  academy_lessons: number;
}

export interface CreatorReliability {
  /** 0 to 100. 70 while provisional. */
  score: number;
  /** Fewer than 5 finished decisions: shown as "Building history". */
  provisional: boolean;
  finished_n: number;
  components: ReliabilityComponent[];
  academy_bonus_points: number;
  /** Recency-weighted share of finished work approved. */
  approval_rate_finished: number;
  /** Plain share approved. */
  approval_rate_raw: number;
}

const CREATOR_LABELS: Record<string, string> = {
  finished_approval: "Finished-work approval (recency-weighted)",
  on_time: "Revisions and deadlines on time",
  post_through: "Approved videos posted within 7 days",
  compliance: "Disclosure right first time",
  clean_record: "Clean record (90 days)",
};

/**
 * Creator reliability from finished work only.
 *   score = round(100 x sum(weight x value) + Academy bonus), capped at 100
 *   weights: finished approval 30% (half-life 45 days), on time 20%, posted within 7 days 20%, disclosure first time 20%, clean record 10%
 *   clean record = 1 - 0.4 x confirmed fraud - 0.3 x clawbacks - 0.15 x lost disputes (90 days)
 * A component with nothing to measure yet counts as 1 (no evidence against). Fewer than 5 finished decisions: provisional 70.
 */
export function creatorReliability(input: CreatorReliabilityInput): CreatorReliability {
  const R = CONSTANTS.reliability.creator;
  const weight = (d: { decided_at: IsoTimestamp }): number => 0.5 ** ((toMs(input.now) - toMs(d.decided_at)) / DAY_MS / R.recency_half_life_days);
  const sumW = input.decisions.reduce((s, d) => s + weight(d), 0);
  const approvedW = input.decisions.filter((d) => d.approved).reduce((s, d) => s + weight(d), 0);
  const finished_n = input.decisions.length;
  const ratio = (ok: number, total: number): number => (total > 0 ? ok / total : 1);
  const v: Record<string, number> = {
    finished_approval: sumW > 0 ? approvedW / sumW : 0,
    on_time: ratio(input.on_time.ok, input.on_time.total),
    post_through: ratio(input.post_through.posted, input.post_through.approved),
    compliance: ratio(input.compliance.passed, input.compliance.total),
    clean_record: clamp(1 - 0.4 * input.fraud_confirmed_90d - 0.3 * input.clawbacks_90d - 0.15 * input.disputes_lost_90d, 0, 1),
  };
  const reasons: Record<string, string> = {
    finished_approval: `${Math.round(v.finished_approval * 100)}% of ${finished_n} finished posts approved, recent ones count more.`,
    on_time: `${input.on_time.ok} of ${input.on_time.total} on time.`,
    post_through: `${input.post_through.posted} of ${input.post_through.approved} approved videos posted within ${R.post_through_days} days.`,
    compliance: `${input.compliance.passed} of ${input.compliance.total} posts passed the disclosure check first time.`,
    clean_record: `${input.fraud_confirmed_90d} confirmed fraud, ${input.clawbacks_90d} clawbacks, ${input.disputes_lost_90d} lost disputes.`,
  };
  const components: ReliabilityComponent[] = Object.entries(R.weights).map(([key, w]) => ({
    key,
    label: CREATOR_LABELS[key],
    value: round2(v[key]),
    weight: w,
    points: round2(100 * w * v[key]),
    reason: reasons[key],
  }));
  const base = Object.entries(R.weights).reduce((s, [key, w]) => s + 100 * w * v[key], 0);
  const academy_bonus_points = Math.min(R.academy_bonus_cap, R.academy_bonus_per_lesson * input.academy_lessons);
  const provisional = finished_n < R.min_finished_for_score;
  return {
    score: provisional ? R.provisional_score : Math.min(100, Math.round(base + academy_bonus_points)),
    provisional,
    finished_n,
    components,
    academy_bonus_points,
    approval_rate_finished: round2(v.finished_approval),
    approval_rate_raw: round2(input.decisions.filter((d) => d.approved).length / Math.max(1, finished_n)),
  };
}

/** What a brand sees of a creator's reliability: a verdict, or a range while the history is short. */
export type ReliabilityView = { kind: "verdict"; score: number; label: string } | { kind: "range"; low: number; high: number; label: string };

/**
 * Brands see a range, not a verdict, for a creator with fewer than 5 finished decisions: 70 plus or minus a spread that narrows with every
 * finished decision (+/-25 with none, +/-9 with four). Multi-brand work is never held against the creator.
 */
export function reliabilityForBrandView(r: Pick<CreatorReliability, "score" | "provisional" | "finished_n">): ReliabilityView {
  if (!r.provisional) return { kind: "verdict", score: r.score, label: `${r.score} reliability` };
  const spread = 4 * (CONSTANTS.reliability.creator.min_finished_for_score - r.finished_n) + 5;
  const low = Math.max(0, r.score - spread);
  const high = Math.min(100, r.score + spread);
  return { kind: "range", low, high, label: `Building history (${low} to ${high})` };
}

/** The reasons shown on a creator's own profile, in plain English: first the headline, then each component. */
export function creatorReasons(r: CreatorReliability, approvedCount: number): string[] {
  if (r.provisional) return [`Building history. ${r.finished_n} of ${CONSTANTS.reliability.creator.min_finished_for_score} finished posts so far. Your score starts at ${r.score} and becomes yours after the fifth decision.`];
  const lines = [`${r.score}. ${approvedCount} of ${r.finished_n} finished posts approved.`];
  for (const c of r.components) lines.push(`${c.label}: ${c.reason}`);
  if (r.academy_bonus_points > 0) lines.push(`Academy bonus: +${r.academy_bonus_points}.`);
  return lines;
}

// ── brand reliability and the Scorecard ────────────────────────────────────────────────────────

export interface BrandReliabilityInput {
  /** Approvals and rejections (request-changes is not a decision). */
  decisions_n: number;
  approved_n: number;
  decision_hours_median: number;
  appeals_overturned: number;
  pays_on_time_ratio: number;
  /** Share of approved work posted or used within 30 days. */
  run_rate: number;
  reply_hours_median: number;
}

export interface BrandReliability {
  score: number;
  band: BrandBand;
  components: ReliabilityComponent[];
  rejection_rate: number;
}

const BRAND_LABELS: Record<string, string> = {
  decision_speed: "Decision speed",
  approval_fairness: "Approval fairness",
  pays_on_time: "Pays on time",
  run_rate: "Runs what it approves",
  reply_speed: "Reply speed",
};

/**
 * Brand reliability (0 to 100).
 *   decision speed 30%: median hours to decide, 12 h = 1.0, 72 h = 0.0, linear
 *   approval fairness 25%: clamp(1 - (rejection rate - 0.30) / 0.40, 0, 1) - 0.5 x (appeals overturned / rejections)
 *   pays on time 20% · runs what it approves 15% · reply speed 10% (2 h = 1.0, 48 h = 0.0)
 * Fewer than 10 decisions: band "new" (shown as "New brand"); the score is still computed but must not be shown as a verdict.
 */
export function brandReliability(inp: BrandReliabilityInput): BrandReliability {
  const B = CONSTANTS.reliability.brand;
  const rejected_n = inp.decisions_n - inp.approved_n;
  const rejection_rate = inp.decisions_n > 0 ? rejected_n / inp.decisions_n : 0;
  const decision_speed = clamp((B.decision_worst_hours - inp.decision_hours_median) / (B.decision_worst_hours - B.decision_best_hours), 0, 1);
  const base = clamp(1 - (rejection_rate - B.rejection_rate_free_pass) / (B.rejection_rate_zero_at - B.rejection_rate_free_pass), 0, 1);
  const overturn_share = inp.appeals_overturned / Math.max(1, rejected_n);
  const approval_fairness = clamp(base - 0.5 * overturn_share, 0, 1);
  const reply_speed = clamp((B.reply_worst_hours - inp.reply_hours_median) / (B.reply_worst_hours - B.reply_best_hours), 0, 1);
  const v: Record<string, number> = { decision_speed, approval_fairness, pays_on_time: inp.pays_on_time_ratio, run_rate: inp.run_rate, reply_speed };
  const reasons: Record<string, string> = {
    decision_speed: `Median ${inp.decision_hours_median.toFixed(1)} h to decide (best ${B.decision_best_hours} h, worst ${B.decision_worst_hours} h).`,
    approval_fairness: `${Math.round(rejection_rate * 100)}% of decisions were rejections; ${inp.appeals_overturned} overturned on appeal.`,
    pays_on_time: `${Math.round(inp.pays_on_time_ratio * 100)}% of commissions, offers and top-ups funded on time.`,
    run_rate: `${Math.round(inp.run_rate * 100)}% of approved work was posted or used within 30 days.`,
    reply_speed: `Median ${inp.reply_hours_median.toFixed(1)} h to reply.`,
  };
  const components: ReliabilityComponent[] = Object.entries(B.weights).map(([key, weight]) => ({
    key,
    label: BRAND_LABELS[key],
    value: round2(v[key]),
    weight,
    points: round2(100 * weight * v[key]),
    reason: reasons[key],
  }));
  const score = Math.round(Object.entries(B.weights).reduce((s, [key, w]) => s + 100 * w * v[key], 0));
  const band: BrandBand = inp.decisions_n < B.min_decisions_for_score ? "new" : score >= B.bands.excellent ? "excellent" : score >= B.bands.good ? "good" : score >= B.bands.fair ? "fair" : "poor";
  return { score, band, components, rejection_rate: round2(rejection_rate) };
}

/** Badges a brand has earned. Decision-based badges need at least 10 decisions. */
export function brandBadges(p: {
  decision_hours_median: number;
  funded_always: boolean;
  pays_on_time_ratio: number;
  appeals_n: number;
  appeals_overturned: number;
  run_rate: number;
  decisions_n: number;
}): BrandBadge[] {
  const out: BrandBadge[] = [];
  if (p.decisions_n >= CONSTANTS.reliability.brand.min_decisions_for_score) {
    if (p.decision_hours_median < 24) out.push("fast_decisions");
    if (p.appeals_n === 0 || p.appeals_overturned / p.appeals_n <= 0.1) out.push("fair_reviews");
    if (p.run_rate > 0.9) out.push("runs_what_it_approves");
  }
  if (p.funded_always) out.push("funded_always");
  if (p.pays_on_time_ratio >= 0.98) out.push("pays_on_time");
  return out;
}

/** The label that goes beside a brand band. "New brand" for a brand with too few decisions: never a misleading figure. */
export function brandBandLabel(band: BrandBand): string {
  switch (band) {
    case "new":
      return "New brand";
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
  }
}

/** "Decides in about 11 h": the line on a bounty card. Null for a new brand, which has no honest figure yet. */
export function decidesInAbout(sc: Pick<BrandScorecard, "band" | "decision_hours_median">): string | null {
  return sc.band === "new" ? null : `Decides in about ${formatHours(sc.decision_hours_median)}`;
}

/** One reviewed submission. `outcome` is the first decision; `overturned` says an appeal reversed a rejection. */
export interface BrandDecisionRecord {
  outcome: "approved" | "rejected" | "changes_requested";
  /** Hours from entering review to the decision. */
  hours_to_decide: number;
  appealed?: boolean;
  overturned?: boolean;
}

export interface BrandDecisionStats {
  /** Approvals + rejections (request-changes excluded). */
  decisions_n: number;
  approved_n: number;
  decision_hours_median: number;
  decision_hours_p90: number;
  /** Decisions made after the 72-hour SLA. */
  sla_breaches: number;
  approval_rate: number;
  rejection_rate: number;
  appeals_n: number;
  appeals_overturned: number;
}

/** Scorecard numbers from decision records. Request-changes does not count as a decision, but its time to respond still counts toward speed. */
export function brandDecisionStats(records: readonly BrandDecisionRecord[]): BrandDecisionStats {
  const decided = records.filter((r) => r.outcome !== "changes_requested");
  const hours = records.map((r) => r.hours_to_decide);
  const approved = decided.filter((r) => r.outcome === "approved").length;
  const appealed = decided.filter((r) => r.appealed);
  return {
    decisions_n: decided.length,
    approved_n: approved,
    decision_hours_median: round2(median(hours)),
    decision_hours_p90: round2(quantile(hours, 0.9)),
    sla_breaches: records.filter((r) => r.hours_to_decide > CONSTANTS.review.sla_hours).length,
    approval_rate: decided.length > 0 ? round2(approved / decided.length) : 0,
    rejection_rate: decided.length > 0 ? round2((decided.length - approved) / decided.length) : 0,
    appeals_n: appealed.length,
    appeals_overturned: appealed.filter((r) => r.overturned).length,
  };
}

/**
 * The full Brand Scorecard for a brand over its last 90 days: decision stats from records, plus the money and reply numbers the ledger and
 * messages supply. `previous_score` (30 days ago) gives the trend.
 */
export function buildBrandScorecard(p: {
  id: string;
  brand_id: string;
  as_of: IsoTimestamp;
  decisions: readonly BrandDecisionRecord[];
  run_rate: number;
  pays_on_time_ratio: number;
  pay_speed_hours_median: number;
  reply_hours_median: number;
  funded_always: boolean;
  previous_score?: number;
  window_days?: number;
}): BrandScorecard {
  const s = brandDecisionStats(p.decisions);
  const rel = brandReliability({
    decisions_n: s.decisions_n,
    approved_n: s.approved_n,
    decision_hours_median: s.decision_hours_median,
    appeals_overturned: s.appeals_overturned,
    pays_on_time_ratio: p.pays_on_time_ratio,
    run_rate: p.run_rate,
    reply_hours_median: p.reply_hours_median,
  });
  return {
    id: p.id,
    brand_id: p.brand_id,
    window_days: p.window_days ?? 90,
    as_of: p.as_of,
    decisions_n: s.decisions_n,
    approved_n: s.approved_n,
    decision_hours_median: s.decision_hours_median,
    decision_hours_p90: s.decision_hours_p90,
    sla_breaches: s.sla_breaches,
    approval_rate: s.approval_rate,
    rejection_rate: s.rejection_rate,
    appeals_n: s.appeals_n,
    appeals_overturned: s.appeals_overturned,
    run_rate: p.run_rate,
    pays_on_time_ratio: p.pays_on_time_ratio,
    pay_speed_hours_median: p.pay_speed_hours_median,
    reply_hours_median: p.reply_hours_median,
    funded_always: p.funded_always,
    reliability_score: rel.score,
    band: rel.band,
    badges: brandBadges({ ...s, funded_always: p.funded_always, pays_on_time_ratio: p.pays_on_time_ratio, run_rate: p.run_rate }),
    trend_30d: p.previous_score === undefined ? 0 : rel.score - p.previous_score,
  };
}

/** "142 decisions, 90 days": the sample line beside any scorecard figure. */
export const scorecardSample = (sc: Pick<BrandScorecard, "decisions_n" | "window_days">): string => `${sc.decisions_n} decisions, ${sc.window_days} days`;

/** "78% approved". */
export const approvalCopy = (ratio: number): string => `${formatPercent(ratio, 0)} approved`;

// ── review SLA ─────────────────────────────────────────────────────────────────────────────────

/**
 * Position in the 72-hour review SLA by hours since the current version entered review.
 *   on_track under 48 h · stale 48 to 72 h · breached over 72 h (escalated, and the brand score takes a hit).
 * Once decided: met inside 72 h, breached after. A brand with its own SLA length (`slaHours`) gets the same shape: stale from two thirds of it.
 */
export function slaState(hoursInQueue: number, decided = false, slaHours: number = CONSTANTS.review.sla_hours): SlaState {
  const staleAfter = (slaHours * CONSTANTS.review.stale_after_hours) / CONSTANTS.review.sla_hours;
  if (decided) return hoursInQueue <= slaHours ? "met" : "breached";
  return hoursInQueue < staleAfter ? "on_track" : hoursInQueue <= slaHours ? "stale" : "breached";
}

/** When the current version must be decided: entered review + 72 h. */
export const slaDueAt = (enteredReviewAt: IsoTimestamp, slaHours: number = CONSTANTS.review.sla_hours): IsoTimestamp => addHours(enteredReviewAt, slaHours);

export interface ReviewClock {
  state: SlaState;
  due_at: IsoTimestamp;
  hours_in_queue: number;
  /** Hours until the deadline; negative once it has passed. */
  hours_left: number;
  /** True once the SLA is breached: escalate to the owner and the SLA desk. */
  escalate: boolean;
  /** "Decide by Fri 2:00 PM UTC" or "Overdue by 5 h". */
  label: string;
}

/** The countdown shown on every submission to both sides. Amber at 48 h, breached at 72 h. */
export function reviewClock(p: { entered_review_at: IsoTimestamp; now: IsoTimestamp; sla_hours?: number }): ReviewClock {
  const sla = p.sla_hours ?? CONSTANTS.review.sla_hours;
  const hours_in_queue = hoursBetween(p.entered_review_at, p.now);
  const due_at = slaDueAt(p.entered_review_at, sla);
  const hours_left = sla - hours_in_queue;
  const state = slaState(hours_in_queue, false, sla);
  return {
    state,
    due_at,
    hours_in_queue,
    hours_left,
    escalate: state === "breached",
    label: hours_left >= 0 ? `Decide by ${clockLabel(due_at)} UTC` : `Overdue by ${formatHours(-hours_left)}`,
  };
}
