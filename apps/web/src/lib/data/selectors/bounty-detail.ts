/**
 * A bounty as its brand sees it: the money (pool, reserved, spent, left, refunded), the submissions, the posts and how each one is settling
 * (window, fraud check, cleared), the creators and the lifetime funnel.
 */

import type { Creator, FunnelCounts, LedgerEntry } from "@/lib/contract/types";
import { bountyLedgerMoney, escrowIdentityHolds, escrowStateOf, hoursBetween, type BountyLedgerMoney } from "@/lib/engine";
import { defineSelector, desc, groupBy, type Db } from "../select";
import { bountyView, type BountyView } from "./bounties";
import { postView, type PostView, type PostViewDb } from "./posts";
import { submissionView, type SubmissionView, type SubmissionDb } from "./submissions";

export interface SettlementRow {
  post: PostView;
  creator: Creator;
  /** window_open, fraud_check, clearing, cleared, paid, held, clawed_back, removed. */
  stage: "window_open" | "fraud_check" | "clearing" | "cleared" | "paid" | "held" | "clawed_back" | "removed";
  /** What the brand paid the creator for this post so far (settled legs). */
  creator_pay_cents: number;
  /** The platform fee on it. */
  fee_cents: number;
  window_closes_at: string;
  clears_at?: string;
  hold_reason?: string;
}

export interface BountyCreatorRow {
  creator: Creator;
  submissions: number;
  approved: number;
  posts: number;
  views: number;
  trials: number;
  paid_cents: number;
  /** Cost per tracked trial; null with no trials. */
  cost_per_trial_cents: number | null;
}

export interface BountyDetail {
  bounty: BountyView;
  money: {
    pool_cents: number;
    escrow_funded_cents: number;
    matched_cents: number;
    fee_reserve_cents: number;
    reserved_cents: number;
    spent_cents: number;
    remaining_cents: number;
    refunded_cents: number;
    funded: boolean;
    /** funded = reserved + spent + remaining + refunded (DOMAIN L-03): false would be a bug. */
    identity_ok: boolean;
    /** The same money read from the ledger legs of escrow:<bounty>. */
    ledger: BountyLedgerMoney;
  };
  submissions: readonly SubmissionView[];
  posts: readonly PostView[];
  settlement: readonly SettlementRow[];
  creators: readonly BountyCreatorRow[];
  /** Clawback transactions on this bounty's posts (proven fraud only; delivered views stay paid). */
  clawbacks: readonly LedgerEntry[];
  funnel: FunnelCounts;
  /** Effective cost per 1,000 verified views and per tracked trial, from what was settled. Null with no data. */
  cost: { cpm_cents: number | null; per_trial_cents: number | null; per_install_cents: number | null };
  review: { in_review: number; oldest_hours: number | null; breached: number };
}

type DetailDb = PostViewDb & SubmissionDb & Db<"ledger">;

const DETAIL_KEYS = ["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "posts", "creators", "submissions", "attribution_links", "money_clock", "rights_grants", "ads", "disputes", "creator_reputation", "feedback_notes", "ledger"] as const;

export const selectBountyDetail = defineSelector(DETAIL_KEYS, (db: DetailDb, id: string | undefined): BountyDetail | undefined => {
  const b = id ? db.bounties[id] : undefined;
  if (!b) return undefined;
  const bounty = bountyView(db, b);
  const submissions = groupBy(db.submissions, "bounty", (s) => s.bounty_id)
    .get(b.id)
    .map((s) => submissionView(db, s))
    .sort((a, c) => desc(a.updated_at, c.updated_at));
  const posts = groupBy(db.posts, "bounty", (p) => p.bounty_id)
    .get(b.id)
    .map((p) => postView(db, p))
    .sort((a, c) => desc(a.posted_at, c.posted_at));
  const byPost = groupBy(db.ledger, "post", (e) => e.post_id);
  const bountyLegs = groupBy(db.ledger, "bounty", (e) => e.bounty_id).get(b.id);
  const settlement: SettlementRow[] = posts.map((p) => {
    const legs = byPost.get(p.id);
    const pay = legs.filter((e) => e.account === `creator:${p.creator_id}` && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee")).reduce((s, e) => s + e.amount_cents, 0);
    const fee = legs.filter((e) => e.account === "platform:fees" && e.amount_cents > 0).reduce((s, e) => s + e.amount_cents, 0);
    const clears = p.clock_rows.find((r) => r.eta_at)?.eta_at;
    let stage: SettlementRow["stage"];
    if (p.status === "removed") stage = "removed";
    else if (p.status === "clawed_back") stage = "clawed_back";
    else if (p.status === "held") stage = "held";
    else if (p.status === "paid") stage = "paid";
    else if (p.status === "cleared") stage = "cleared";
    else if (p.status === "live") stage = "window_open";
    else stage = hoursBetween(p.window_ends_at, db.clock.now) < 12 ? "fraud_check" : "clearing";
    return { post: p, creator: p.creator, stage, creator_pay_cents: pay, fee_cents: fee, window_closes_at: p.window_ends_at, ...(clears ? { clears_at: clears } : {}), ...(p.hold_reason ? { hold_reason: p.hold_reason } : {}) };
  });
  const creatorIds = [...new Set([...submissions.map((s) => s.creator_id), ...posts.map((p) => p.creator_id)])];
  const creators: BountyCreatorRow[] = creatorIds
    .map((cid) => {
      const subs = submissions.filter((s) => s.creator_id === cid);
      const ps = posts.filter((p) => p.creator_id === cid);
      const paid = settlement.filter((r) => r.creator.id === cid).reduce((s, r) => s + r.creator_pay_cents + r.fee_cents, 0);
      const trials = ps.reduce((s, p) => s + p.funnel.trials, 0);
      return {
        creator: db.creators[cid],
        submissions: subs.length,
        approved: subs.filter((s) => s.status === "approved" || s.status === "posted" || s.status === "released").length,
        posts: ps.length,
        views: ps.reduce((s, p) => s + p.views, 0),
        trials,
        paid_cents: paid,
        cost_per_trial_cents: trials > 0 ? Math.round(paid / trials) : null,
      };
    })
    .sort((a, c) => desc(a.trials, c.trials) || desc(a.paid_cents, c.paid_cents));
  const waiting = submissions.filter((s) => s.status === "in_review");
  const f = b.funnel;
  return {
    bounty,
    money: {
      pool_cents: b.budget_cents,
      escrow_funded_cents: b.escrow_funded_cents,
      matched_cents: b.matched_cents,
      fee_reserve_cents: b.fee_reserve_cents,
      reserved_cents: b.reserved_cents,
      spent_cents: b.spent_cents,
      remaining_cents: b.remaining_cents,
      refunded_cents: b.refunded_cents,
      funded: b.funded,
      identity_ok: escrowIdentityHolds(escrowStateOf(b)),
      ledger: bountyLedgerMoney(bountyLegs, b.id),
    },
    submissions,
    posts,
    settlement,
    creators,
    clawbacks: bountyLegs.filter((e) => e.entry_type === "clawback" || e.reverses_txn_id !== undefined),
    funnel: f,
    cost: {
      cpm_cents: f.views > 0 && b.spent_cents > 0 ? Math.round((b.spent_cents / f.views) * 1000) : null,
      per_trial_cents: f.trials > 0 && b.spent_cents > 0 ? Math.round(b.spent_cents / f.trials) : null,
      per_install_cents: f.installs > 0 && b.spent_cents > 0 ? Math.round(b.spent_cents / f.installs) : null,
    },
    review: { in_review: waiting.length, oldest_hours: waiting.length > 0 ? Math.max(...waiting.map((s) => hoursBetween(s.current.submitted_at, db.clock.now))) : null, breached: waiting.filter((s) => s.review?.state === "breached").length },
  };
});
