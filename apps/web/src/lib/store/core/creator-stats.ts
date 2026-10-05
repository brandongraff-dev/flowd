/**
 * Derived creator and brand numbers that must follow every decision and every cleared dollar: approval counts, lifetime cleared, tier (with the
 * 30-day grace), reliability, and the Brand Scorecard. They are recomputed from the rows (never incremented by hand), so they cannot drift.
 */

import type { BrandDecisionRecord } from "@/lib/engine";
import {
  addDays,
  approvalRate,
  buildBrandScorecard,
  creatorReasons,
  creatorReliability,
  evaluateTier,
  hoursBetween,
  perkLines,
  tierProgress,
  toMs,
  withCarryOver,
  CONSTANTS,
} from "@/lib/engine";
import type { Creator, CreatorId, CreatorReputation, LedgerEntry, LedgerType, OnboardingStage, Submission, TierEvent } from "@/lib/contract/types";
import { notifyCreator } from "./notify";
import type { Tx } from "./tx";

/** Ledger types that are creator earnings. */
const EARNING_TYPES: ReadonlySet<LedgerType> = new Set<LedgerType>(["cpm", "cpa", "flat_fee", "commission", "rights_fee", "bonus", "prize", "referral"]);

export const isEarning = (e: Pick<LedgerEntry, "entry_type" | "amount_cents" | "account">): boolean => e.amount_cents > 0 && e.account.startsWith("creator:") && EARNING_TYPES.has(e.entry_type);

/** Statuses that count as approved work. */
export const APPROVED_LIKE: ReadonlySet<Submission["status"]> = new Set<Submission["status"]>(["approved", "posted", "released"]);
/** Statuses that count as a rejection (an appeal in flight is still a rejection until it is overturned). */
export const REJECTED_LIKE: ReadonlySet<Submission["status"]> = new Set<Submission["status"]>(["rejected", "appealed"]);

/** Cleared and paid earnings in the ledger for a creator (the lifetime figure, before carry-over). */
export function clearedFromLedger(tx: Tx, creatorId: CreatorId): number {
  const account = `creator:${creatorId}`;
  let sum = 0;
  for (const e of tx.all("ledger")) if (e.account === account && isEarning(e) && (e.status === "cleared" || e.status === "paid")) sum += e.amount_cents;
  return sum;
}

/** The First-Dollar Path in order. */
export const ONBOARDING_STAGES: readonly OnboardingStage[] = ["signed_up", "niches_picked", "accounts_linked", "first_submission", "first_approval", "verified", "first_dollar"];

/** The furthest stage the facts support, never earlier than the stage the creator already reached. */
export function onboardingStageFor(c: Pick<Creator, "onboarding_stage" | "verification_status">, facts: { submissions: number; approved: number; cleared_cents: number }): OnboardingStage {
  let reached: OnboardingStage = c.onboarding_stage;
  const advance = (to: OnboardingStage): void => {
    if (ONBOARDING_STAGES.indexOf(to) > ONBOARDING_STAGES.indexOf(reached)) reached = to;
  };
  if (facts.submissions > 0) advance("first_submission");
  if (facts.approved > 0) advance("first_approval");
  if (facts.approved > 0 && c.verification_status === "verified") advance("verified");
  if (facts.cleared_cents > 0) advance("first_dollar");
  return reached;
}

/** Recomputes approval counts, lifetime cleared and the tier of a creator. Writes a tier-history row and a notification on a change. */
export function refreshCreator(tx: Tx, creatorId: CreatorId, opts: { clearedCents?: number } = {}): Creator {
  const c = tx.must("creators", creatorId, "Creator");
  const subs = tx.all("submissions").filter((s) => s.creator_id === creatorId);
  const approvedLike = subs.filter((s) => APPROVED_LIKE.has(s.status)).length;
  const rejectedLike = subs.filter((s) => REJECTED_LIKE.has(s.status)).length;
  const carry = c.carry_over;
  const approved = approvedLike + (carry?.approved_count ?? 0);
  const decided = approvedLike + rejectedLike + (carry?.decided_count ?? 0);
  const lifetime = (carry?.cleared_cents ?? 0) + (opts.clearedCents ?? clearedFromLedger(tx, creatorId));
  const posts = tx.all("posts").filter((p) => p.creator_id === creatorId);

  const stats = withCarryOver(
    { lifetime_cleared_cents: lifetime - (carry?.cleared_cents ?? 0), approved_count: approvedLike, decided_count: approvedLike + rejectedLike, reliability_score: c.reliability_score, elite_reviewed: c.tier_review !== undefined },
    carry,
  );
  const paused = c.paused_until !== undefined && toMs(c.paused_until) > toMs(tx.now);
  const dipStarted = c.tier_basis === "grace_hold" && c.tier_hold_until ? addDays(c.tier_hold_until, -CONSTANTS.tiers.demotion_grace_days) : undefined;
  const evaluation = evaluateTier({ stats, held_tier: c.tier, held_basis: c.tier_basis, dip_started_at: dipStarted, now: tx.now, paused });

  const patch: Partial<Creator> = {
    approved_count: approved,
    decided_count: decided,
    approval_rate: approvalRate(approved, decided),
    lifetime_cleared_cents: lifetime,
    posts_count: posts.filter((p) => p.status !== "removed").length,
    live_posts_count: posts.filter((p) => p.status === "live").length,
    tier: evaluation.tier,
    tier_basis: evaluation.tier_basis,
    last_active_at: tx.now,
  };
  if (evaluation.tier_hold_until) patch.tier_hold_until = evaluation.tier_hold_until;
  if (evaluation.tier !== c.tier) patch.tier_since = tx.now;
  if (evaluation.tier_basis === "earned" && c.tier_hold_until) patch.tier_hold_until = undefined;
  // The First-Dollar Path moves forward as the facts arrive (a first video, a first approval, a first cleared dollar); it never moves back.
  const ledgerCleared = opts.clearedCents ?? clearedFromLedger(tx, creatorId);
  const stage = onboardingStageFor(c, { submissions: subs.length, approved: approvedLike, cleared_cents: ledgerCleared });
  if (stage !== c.onboarding_stage) patch.onboarding_stage = stage;
  if (ledgerCleared > 0 && !c.first_dollar_at) {
    patch.first_dollar_at = tx.now;
    if (!c.badges.includes("first_dollar")) patch.badges = [...c.badges, "first_dollar"];
  }
  const next = { ...c, ...patch } as Creator;
  if (next.tier_hold_until === undefined) delete (next as Partial<Creator>).tier_hold_until;
  tx.put("creators", next);

  if (evaluation.event) {
    const row: TierEvent = {
      id: tx.nextId("tev"),
      creator_id: creatorId,
      kind: evaluation.event,
      ...(evaluation.event === "promoted" || evaluation.event === "demoted" ? { from_tier: c.tier } : {}),
      to_tier: evaluation.tier,
      basis: evaluation.tier_basis,
      at: tx.now,
      stats: { lifetime_cleared_cents: stats.lifetime_cleared_cents, approved_count: stats.approved_count, approval_rate: stats.approval_rate, reliability_score: stats.reliability_score },
      note:
        evaluation.event === "promoted"
          ? `Reached ${evaluation.tier}.`
          : evaluation.event === "hold_started"
            ? `Numbers dipped below ${c.tier}. No drop for ${CONSTANTS.tiers.demotion_grace_days} days.`
            : evaluation.event === "hold_cleared"
              ? `Back above the ${evaluation.tier} thresholds. Grace hold cleared.`
              : `Moved to ${evaluation.tier} after the grace period.`,
    };
    tx.put("tier_history", row);
    if (evaluation.event === "promoted") {
      const perks = perkLines(evaluation.tier);
      notifyCreator(tx, creatorId, {
        kind: "tier_up",
        title: `You reached ${evaluation.tier[0].toUpperCase()}${evaluation.tier.slice(1)}`,
        body: perks.length > 0 ? `New perks: ${perks.slice(0, 2).join(" ")}` : "Your tier is earned from approved work and cleared earnings.",
        path: "tiers",
        ref_kind: "tier",
        ref_id: evaluation.tier,
      });
    }
  }
  return tx.must("creators", creatorId);
}

/** Recomputes the reliability score and reputation row of a creator from finished work, keeping the components that need other tables. */
export function refreshReputation(tx: Tx, creatorId: CreatorId): CreatorReputation | undefined {
  const c = tx.must("creators", creatorId, "Creator");
  const rep = tx.all("creator_reputation").find((r) => r.creator_id === creatorId);
  const subs = tx.all("submissions").filter((s) => s.creator_id === creatorId);
  const decisions: { approved: boolean; decided_at: string }[] = [];
  for (const s of subs) {
    const at = s.decision?.decided_at ?? s.approved_at;
    if (!at) continue;
    if (APPROVED_LIKE.has(s.status)) decisions.push({ approved: true, decided_at: at });
    else if (REJECTED_LIKE.has(s.status)) decisions.push({ approved: false, decided_at: at });
  }
  // Verified prior history of founding creators counts too (spread before the verification date, approved first).
  if (c.carry_over) {
    const at = addDays(c.carry_over.verified_at, -60);
    for (let i = 0; i < c.carry_over.decided_count; i += 1) decisions.push({ approved: i < c.carry_over.approved_count, decided_at: at });
  }
  const n = Math.max(1, decisions.length);
  const lessons = tx.all("lesson_progress").filter((p) => p.creator_id === creatorId && p.status === "completed").length;
  const result = creatorReliability({
    decisions,
    now: tx.now,
    on_time: { ok: Math.round((rep?.on_time_ratio ?? 1) * n), total: n },
    post_through: { posted: Math.round((rep?.post_through_ratio ?? 1) * n), approved: n },
    compliance: { passed: Math.round((rep?.compliance_ratio ?? 1) * n), total: n },
    fraud_confirmed_90d: rep?.fraud_flags_90d ?? 0,
    clawbacks_90d: rep?.clawbacks_90d ?? 0,
    disputes_lost_90d: rep?.disputes_lost_90d ?? 0,
    academy_lessons: lessons,
  });
  if (c.reliability_score !== result.score) tx.patch("creators", creatorId, { reliability_score: result.score });
  const fresh = tx.must("creators", creatorId);
  const stats = withCarryOver(
    { lifetime_cleared_cents: fresh.lifetime_cleared_cents - (fresh.carry_over?.cleared_cents ?? 0), approved_count: fresh.approved_count - (fresh.carry_over?.approved_count ?? 0), decided_count: fresh.decided_count - (fresh.carry_over?.decided_count ?? 0), reliability_score: result.score, elite_reviewed: fresh.tier_review !== undefined },
    fresh.carry_over,
  );
  if (!rep) return undefined;
  const next: CreatorReputation = {
    ...rep,
    as_of: tx.now,
    provisional: result.provisional,
    reliability_score: result.score,
    approval_rate_finished: result.approval_rate_finished,
    approval_rate_raw: result.approval_rate_raw,
    finished_n: result.finished_n,
    academy_bonus_points: result.academy_bonus_points,
    components: result.components,
    reasons: creatorReasons(result, fresh.approved_count),
    tier_progress: tierProgress(stats, fresh.tier),
  };
  return tx.put("creator_reputation", next);
}

/** Recomputes a brand's Scorecard from its decisions in the last 90 days, keeping the pay and reply numbers the ledger and messages supply. */
export function refreshBrandScorecard(tx: Tx, brandId: string): void {
  const sc = tx.all("brand_scorecards").find((s) => s.brand_id === brandId);
  if (!sc) return;
  const since = toMs(tx.now) - sc.window_days * 86_400_000;
  const records: BrandDecisionRecord[] = [];
  for (const s of tx.all("submissions")) {
    if (s.brand_id !== brandId || !s.decision) continue;
    const d = s.decision;
    if (toMs(d.decided_at) < since) continue;
    const entered = s.versions[s.version - 1]?.submitted_at ?? s.submitted_at;
    const hours = Math.max(0, hoursBetween(entered, d.decided_at));
    if (d.action === "approve" || d.action === "auto_approve" || d.action === "timeout_approve") records.push({ outcome: "approved", hours_to_decide: hours });
    else if (d.action === "reject" || d.action === "auto_reject") records.push({ outcome: "rejected", hours_to_decide: hours, appealed: d.appeal_used, overturned: false });
    else if (d.action === "request_changes") records.push({ outcome: "changes_requested", hours_to_decide: hours });
    else if (d.action === "appeal_overturn") records.push({ outcome: "rejected", hours_to_decide: hours, appealed: true, overturned: true });
    else if (d.action === "appeal_uphold") records.push({ outcome: "rejected", hours_to_decide: hours, appealed: true, overturned: false });
  }
  // Too little recent history to recompute honestly: keep what the data shipped with.
  if (records.length < 3) return;
  tx.put(
    "brand_scorecards",
    buildBrandScorecard({
      id: sc.id,
      brand_id: brandId,
      as_of: tx.now,
      decisions: records,
      run_rate: sc.run_rate,
      pays_on_time_ratio: sc.pays_on_time_ratio,
      pay_speed_hours_median: sc.pay_speed_hours_median,
      reply_hours_median: sc.reply_hours_median,
      funded_always: sc.funded_always,
      previous_score: sc.reliability_score - sc.trend_30d,
      window_days: sc.window_days,
    }),
  );
}
