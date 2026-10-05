/**
 * Submissions and the review queue: a creator's video for a bounty, with its notes, decision, SLA clock and the evidence a reviewer needs.
 */

import { CONSTANTS } from "@/lib/contract/types";
import type { App, AttributionLink, AutoApproveRule, Brand, Creator, CreatorReputation, Dispute, FeedbackNote, Post, Submission, SubmissionStatus, SubmissionVersion, VideoAnalysis } from "@/lib/contract/types";
import { addDays, compareForReviewQueue, hoursBetween, reliabilityForBrandView, reviewClock, toMs, type ReliabilityView, type ReviewClock } from "@/lib/engine";
import { asList, asc, defineSelector, desc, groupBy, joinView, matchesQuery, valuesOf, viewCache, type Db } from "../select";
import { bountyView, mineBrandId, type BountyDb, type BountyView } from "./bounties";

export interface SubmissionView extends Submission {
  creator: Creator;
  bounty: BountyView;
  app: App;
  brand: Brand;
  /** The creator's reputation row (finished work, recency-weighted). */
  reputation?: CreatorReputation;
  /** What a brand sees: a verdict, or a range while the creator has fewer than 5 finished decisions. */
  reliability?: ReliabilityView;
  /** The current version (the last of `versions`). */
  current: SubmissionVersion;
  /** Timecoded notes on every version, oldest first. */
  notes: readonly FeedbackNote[];
  /** Must-fix notes not yet ticked off: they carry to the next version. */
  open_must_fix: readonly FeedbackNote[];
  post?: Post;
  /** The tracking link and promo code issued at approval. */
  link?: AttributionLink;
  /** The appeal on this rejection, if one was opened. */
  appeal?: Dispute;
  /** The decide-by countdown while in review (amber at 48 h, breached at 72 h). */
  review: ReviewClock | null;
  /** Free revision rounds left (two are included; a third and later round is paid by the brand). */
  rounds_left: number;
  /** The creator can appeal this rejection now. */
  can_appeal: boolean;
  /** The last day to appeal. */
  appeal_by?: string;
  /** QA counts of the current version. */
  qa: { pass: number; warn: number; fail: number };
}

export type SubmissionDb = BountyDb & Db<"submissions" | "creators" | "creator_reputation" | "feedback_notes" | "posts" | "attribution_links" | "disputes">;

export const SUBMISSION_VIEW_KEYS = ["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "submissions", "creators", "creator_reputation", "feedback_notes", "posts", "attribution_links", "disputes"] as const;

const cache = viewCache<Submission, SubmissionView>();

export function submissionView(db: SubmissionDb, s: Submission): SubmissionView {
  const creator = db.creators[s.creator_id];
  const bounty = bountyView(db, db.bounties[s.bounty_id]);
  const reputation = groupBy(db.creator_reputation, "creator", (r) => r.creator_id).get(s.creator_id)[0];
  const notes = groupBy(db.feedback_notes, "submission", (n) => n.submission_id).get(s.id);
  const post = s.post_id ? db.posts[s.post_id] : undefined;
  const link = s.link_id ? db.attribution_links[s.link_id] : undefined;
  const appeal = groupBy(db.disputes, "submission", (d) => d.submission_id).get(s.id).find((d) => d.kind === "rejection_appeal");
  const now = db.clock.now;
  return joinView(cache, s, [creator, bounty, reputation, post, link, appeal, now, ...notes], () => {
    const current = s.versions[s.version - 1] ?? s.versions[s.versions.length - 1];
    const entered = current?.submitted_at ?? s.submitted_at;
    const sortedNotes = [...notes].sort((a, b) => asc(a.created_at, b.created_at) || a.t_ms - b.t_ms);
    const appealOpen = s.status === "rejected" && s.decision?.action === "reject" && !s.decision.appeal_used;
    const appealBy = s.decision && s.status === "rejected" ? addDays(s.decision.decided_at, CONSTANTS.review.appeal_window_days) : undefined;
    return {
      ...s,
      creator,
      bounty,
      app: bounty.app,
      brand: bounty.brand,
      ...(reputation ? { reputation, reliability: reliabilityForBrandView({ score: reputation.reliability_score, provisional: reputation.provisional, finished_n: reputation.finished_n }) } : {}),
      current,
      notes: sortedNotes,
      open_must_fix: sortedNotes.filter((n) => n.severity === "must_fix" && n.status === "open"),
      ...(post ? { post } : {}),
      ...(link ? { link } : {}),
      ...(appeal ? { appeal } : {}),
      review: s.status === "in_review" ? reviewClock({ entered_review_at: entered, now, sla_hours: bounty.review_sla_hours }) : null,
      rounds_left: Math.max(0, CONSTANTS.review.revision_rounds_included - s.revision_round),
      can_appeal: appealOpen && appealBy !== undefined && toMs(now) <= toMs(appealBy),
      ...(appealBy ? { appeal_by: appealBy } : {}),
      qa: { pass: current?.qa_pass ?? 0, warn: current?.qa_warn ?? 0, fail: current?.qa_fail ?? 0 },
    };
  });
}

export interface SubmissionFilter {
  /** A creator id, or "mine" for the signed-in creator. */
  creator?: string;
  /** A brand id, or "mine" for the signed-in brand workspace. */
  brand?: string;
  bounty?: string;
  app?: string;
  status?: SubmissionStatus | readonly SubmissionStatus[] | "open" | "decided";
  q?: string;
  sort?: "newest" | "oldest" | "decide_by" | "flow";
  limit?: number;
}

const OPEN: readonly SubmissionStatus[] = ["qa_pending", "in_review", "changes_requested", "approved", "appealed"];
const DECIDED: readonly SubmissionStatus[] = ["posted", "rejected", "withdrawn", "expired", "released"];

/** Submissions with joins. `status: "open"` = anything still waiting on someone. */
export const selectSubmissions = defineSelector([...SUBMISSION_VIEW_KEYS, "session"] as const, (db: SubmissionDb & Db<"session">, f: SubmissionFilter | undefined): readonly SubmissionView[] => {
  const filter = f ?? {};
  const creatorId = filter.creator === "mine" ? db.session.creator_id : filter.creator;
  const brandId = filter.brand === "mine" ? mineBrandId(db) : filter.brand;
  let list: readonly Submission[] = valuesOf(db.submissions);
  if (filter.bounty) list = groupBy(db.submissions, "bounty", (s) => s.bounty_id).get(filter.bounty);
  else if (creatorId) list = groupBy(db.submissions, "creator", (s) => s.creator_id).get(creatorId);
  else if (brandId) list = groupBy(db.submissions, "brand", (s) => s.brand_id).get(brandId);
  const wanted = filter.status === "open" ? OPEN : filter.status === "decided" ? DECIDED : asList(filter.status as SubmissionStatus | readonly SubmissionStatus[] | undefined);
  let rows = list.filter((s) => {
    if (creatorId && s.creator_id !== creatorId) return false;
    if (brandId && s.brand_id !== brandId) return false;
    if (filter.app && s.app_id !== filter.app) return false;
    if (wanted && !wanted.includes(s.status)) return false;
    return true;
  });
  if (filter.q) rows = rows.filter((s) => matchesQuery(filter.q, s.title, s.id, db.creators[s.creator_id]?.handle, db.bounties[s.bounty_id]?.title));
  const views = rows.map((s) => submissionView(db, s));
  const sort = filter.sort ?? "newest";
  views.sort((a, b) => (sort === "oldest" ? asc(a.submitted_at, b.submitted_at) : sort === "decide_by" ? asc(a.sla_due_at ?? "9", b.sla_due_at ?? "9") : sort === "flow" ? asc(a.flow_points, b.flow_points) : desc(a.updated_at, b.updated_at)));
  return filter.limit ? views.slice(0, filter.limit) : views;
});

/** One submission with its notes, SLA clock and joins. */
export const selectSubmission = defineSelector(SUBMISSION_VIEW_KEYS, (db: SubmissionDb, id: string | undefined): SubmissionView | undefined => {
  const s = id ? db.submissions[id] : undefined;
  return s ? submissionView(db, s) : undefined;
});

/** Every submission to a bounty (the table on the bounty page), newest first. */
export const selectSubmissionsForBounty = defineSelector(SUBMISSION_VIEW_KEYS, (db: SubmissionDb, bountyId: string | undefined): readonly SubmissionView[] => {
  if (!bountyId) return [];
  return groupBy(db.submissions, "bounty", (s) => s.bounty_id)
    .get(bountyId)
    .map((s) => submissionView(db, s))
    .sort((a, b) => desc(a.updated_at, b.updated_at));
});

/** The machine analysis of a submission (transcript, beats, QA checks, Hook and Flow Score). Heavy: loads on demand, `loading` until then. */
export interface SubmissionAnalysis {
  loading: boolean;
  /** The analysis of the current version. */
  current?: VideoAnalysis;
  /** Every version, oldest first (for the v1 / v2 diff). */
  versions: readonly VideoAnalysis[];
}

export const selectSubmissionAnalysis = defineSelector(
  ["video_analyses", "submissions", "loaded"] as const,
  (db: Db<"video_analyses" | "submissions" | "loaded">, id: string | undefined): SubmissionAnalysis => {
    const s = id ? db.submissions[id] : undefined;
    const loading = db.loaded.video_analyses !== true;
    if (!s) return { loading, versions: [] };
    const versions = groupBy(db.video_analyses, "submission", (a) => a.submission_id)
      .get(s.id)
      .slice()
      .sort((a, b) => a.version - b.version);
    return { loading, ...(versions.find((a) => a.version === s.version) ? { current: versions.find((a) => a.version === s.version) } : {}), versions };
  },
  { ensure: ["video_analyses"] },
);

// ── the review queue ───────────────────────────────────────────────────────────────────────────

export interface ReviewQueueFilter {
  /** A brand id, or "mine" (default). */
  brand?: string;
  app?: string;
  bounty?: string;
  creator?: string;
  q?: string;
  /** Only videos with this flag. */
  flag?: "qa_fail" | "qa_warn" | "stale" | "breached" | "first_time_creator";
  /** "queue" = QA flags first, then lower Flow Score, then oldest (the review order). */
  sort?: "queue" | "oldest" | "decide_by";
}

export interface ReviewQueue {
  /** Videos waiting for a decision, in review order. */
  items: readonly SubmissionView[];
  counts: {
    waiting: number;
    /** 48 hours or more in the queue. */
    stale: number;
    /** Past the 72-hour promise. */
    breached: number;
    qa_flagged: number;
    /** Hours the oldest video has waited; null when the queue is empty. */
    oldest_hours: number | null;
    auto_approved_today: number;
  };
  /** Posts whose money is on a fraud hold: the fraud-hold lane. */
  fraud_hold: readonly { post_id: string; submission_id: string; creator: Creator; bounty_title: string; score: number; money_at_stake_cents: number }[];
  /** Nothing is waiting. */
  inbox_zero: boolean;
  /** Active guarded auto-approve rules (the badge that links to the rules page). */
  active_rules: number;
}

export const selectReviewQueue = defineSelector(
  [...SUBMISSION_VIEW_KEYS, "auto_approve_rules", "fraud_flags", "session"] as const,
  (db: SubmissionDb & Db<"auto_approve_rules" | "fraud_flags" | "session">, f: ReviewQueueFilter | undefined): ReviewQueue => {
    const filter = f ?? {};
    const brandId = filter.brand === undefined || filter.brand === "mine" ? mineBrandId(db) : filter.brand;
    const empty: ReviewQueue = { items: [], counts: { waiting: 0, stale: 0, breached: 0, qa_flagged: 0, oldest_hours: null, auto_approved_today: 0 }, fraud_hold: [], inbox_zero: true, active_rules: 0 };
    if (!brandId) return empty;
    const all = groupBy(db.submissions, "brand", (s) => s.brand_id).get(brandId);
    let waiting = all.filter((s) => s.status === "in_review");
    if (filter.bounty) waiting = waiting.filter((s) => s.bounty_id === filter.bounty);
    if (filter.app) waiting = waiting.filter((s) => s.app_id === filter.app);
    if (filter.creator) waiting = waiting.filter((s) => s.creator_id === filter.creator);
    if (filter.q) waiting = waiting.filter((s) => matchesQuery(filter.q, s.title, s.id, db.creators[s.creator_id]?.handle, db.bounties[s.bounty_id]?.title));
    const views = waiting.map((s) => submissionView(db, s));
    const flagged = (v: SubmissionView): boolean => v.qa.fail > 0 || v.qa.warn > 0;
    const filtered = views.filter((v) => {
      switch (filter.flag) {
        case "qa_fail":
          return v.qa.fail > 0;
        case "qa_warn":
          return v.qa.warn > 0;
        case "stale":
          return v.review?.state === "stale";
        case "breached":
          return v.review?.state === "breached";
        case "first_time_creator":
          return v.creator.approved_count === 0;
        default:
          return true;
      }
    });
    const sort = filter.sort ?? "queue";
    filtered.sort((a, b) =>
      sort === "oldest"
        ? asc(a.current.submitted_at, b.current.submitted_at)
        : sort === "decide_by"
          ? asc(a.review?.due_at ?? "9", b.review?.due_at ?? "9")
          : compareForReviewQueue({ qa_fail: a.qa.fail, qa_warn: a.qa.warn, flow_points: a.flow_points, submitted_at: a.current.submitted_at }, { qa_fail: b.qa.fail, qa_warn: b.qa.warn, flow_points: b.flow_points, submitted_at: b.current.submitted_at }),
    );
    const today = db.clock.now.slice(0, 10);
    const heldPosts = groupBy(db.posts, "brand", (p) => p.brand_id)
      .get(brandId)
      .filter((p) => p.status === "held" && p.hold_reason === "fraud_review");
    const flags = groupBy(db.fraud_flags, "post", (x) => x.post_id);
    return {
      items: filtered,
      counts: {
        waiting: views.length,
        stale: views.filter((v) => v.review?.state === "stale").length,
        breached: views.filter((v) => v.review?.state === "breached").length,
        qa_flagged: views.filter(flagged).length,
        oldest_hours: views.length > 0 ? Math.max(...views.map((v) => hoursBetween(v.current.submitted_at, db.clock.now))) : null,
        auto_approved_today: all.filter((s) => s.auto_approved && s.decision?.decided_at.slice(0, 10) === today).length,
      },
      fraud_hold: heldPosts.map((p) => ({ post_id: p.id, submission_id: p.submission_id, creator: db.creators[p.creator_id], bounty_title: db.bounties[p.bounty_id]?.title ?? "", score: flags.get(p.id)[0]?.score ?? p.fraud.score, money_at_stake_cents: p.earnings.total_cents })),
      inbox_zero: views.length === 0,
      active_rules: groupBy(db.auto_approve_rules, "brand", (r) => r.brand_id).get(brandId).filter((r) => r.status === "active").length,
    };
  },
);

// ── auto-approve rules ─────────────────────────────────────────────────────────────────────────

export interface RuleView extends AutoApproveRule {
  /** True once a dry run on the last 50 submissions exists (required before a rule can be active). */
  has_dry_run: boolean;
  /** "Would have approved 31 of the last 50", from the stored dry run. */
  dry_run_summary: string | null;
  /** Approved by the rule this ISO day, against its daily cap. */
  today: { approved: number; cap: number };
  /** Can the rule be switched on right now (needs a dry run and not killed without a fresh one). */
  can_enable: boolean;
  /** Why not, in plain words. */
  enable_blocked_reason?: string;
}

const ruleCache = viewCache<AutoApproveRule, RuleView>();

export const selectRules = defineSelector(["auto_approve_rules", "submissions", "clock", "session"] as const, (db: Db<"auto_approve_rules" | "submissions" | "clock" | "session">, brand: string | undefined): readonly RuleView[] => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  if (!brandId) return [];
  const today = db.clock.now.slice(0, 10);
  const subs = groupBy(db.submissions, "brand", (s) => s.brand_id).get(brandId);
  return groupBy(db.auto_approve_rules, "brand", (r) => r.brand_id)
    .get(brandId)
    .map((rule) =>
      joinView(ruleCache, rule, [today, subs.length], () => {
        const approvedToday = subs.filter((s) => s.auto_approved && s.decision?.decided_at.slice(0, 10) === today).length;
        const hasDry = rule.dry_run !== undefined;
        const killed = rule.status === "killed";
        const blocked = !hasDry ? "Run a dry run on the last 50 submissions first." : killed && rule.dry_run && toMs(rule.dry_run.ran_at) <= toMs(rule.killed_at ?? rule.dry_run.ran_at) ? "A killed rule needs a fresh dry run." : undefined;
        return {
          ...rule,
          has_dry_run: hasDry,
          dry_run_summary: rule.dry_run ? `Would have approved ${rule.dry_run.would_approve} of the last ${rule.dry_run.sample_size}` : null,
          today: { approved: approvedToday, cap: rule.guardrails.daily_cap },
          can_enable: blocked === undefined,
          ...(blocked ? { enable_blocked_reason: blocked } : {}),
        };
      }),
    );
});

/** One rule with its audit log. */
export const selectRule = defineSelector(["auto_approve_rules", "submissions", "clock", "session"] as const, (db: Db<"auto_approve_rules" | "submissions" | "clock" | "session">, id: string | undefined): RuleView | undefined => {
  const rule = id ? db.auto_approve_rules[id] : undefined;
  return rule ? selectRules(db, rule.brand_id).find((r) => r.id === rule.id) : undefined;
});
