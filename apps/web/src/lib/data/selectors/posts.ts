/**
 * Posts: a live video on a creator's account, with its 72-hour window, its Money Clock rows, rights and the per-video cap.
 */

import type { Ad, App, AttributionLink, Brand, Creator, Dispute, MoneyClockRow, Post, PostStatus, RightsGrant, Submission } from "@/lib/contract/types";
import { describeEarning, hoursBetween, postTimeline, toMs, type EarningDescription, type TimelineStep } from "@/lib/engine";
import { asList, asc, defineSelector, desc, groupBy, joinView, matchesQuery, valuesOf, viewCache, type Db } from "../select";
import { bountyView, mineBrandId, type BountyDb, type BountyView } from "./bounties";

export interface PostView extends Post {
  creator: Creator;
  bounty: BountyView;
  app: App;
  brand: Brand;
  submission?: Submission;
  /** The tracking link and promo code the creator posts. */
  link?: AttributionLink;
  /** The 72-hour view window. */
  window: { opens_at: string; closes_at: string; is_open: boolean; hours_left: number; progress: number };
  /** Money Clock rows of this post (CPM or flat leg, conversions), newest first. */
  clock_rows: readonly MoneyClockRow[];
  /** The dated sentence for the post's main earning: "Clears Sat 2:00 PM UTC after the view check." Never a bare "pending". */
  money: EarningDescription | null;
  /** Posted, window closes, fraud check, cleared, paid: each with its time and whether it has happened. */
  timeline: readonly TimelineStep[];
  rights: readonly RightsGrant[];
  /** The running or requested promotion, if any. */
  ad?: Ad;
  /** An open dispute on this post. */
  dispute?: Dispute;
  /** The per-video cap: what pool pay has been used and what is left. */
  cap: { cap_cents: number; used_cents: number; remaining_cents: number; ratio: number };
  /** Installs to trials, tracked. Null under 20 installs: too small to quote a rate. */
  trial_rate: number | null;
  /** Hours since posting. */
  age_hours: number;
}

export type PostViewDb = BountyDb & Db<"posts" | "creators" | "submissions" | "attribution_links" | "money_clock" | "rights_grants" | "ads" | "disputes">;

const cache = viewCache<Post, PostView>();
const MAIN_SOURCES = new Set(["cpm", "flat_fee"]);

export function postView(db: PostViewDb, p: Post): PostView {
  const creator = db.creators[p.creator_id];
  const bounty = bountyView(db, db.bounties[p.bounty_id]);
  const submission = db.submissions[p.submission_id];
  const link = db.attribution_links[p.tracking_link_id];
  const clockRows = groupBy(db.money_clock, "post", (r) => r.post_id).get(p.id);
  const rights = groupBy(db.rights_grants, "post", (g) => g.post_id).get(p.id);
  const ad = p.ad_id ? db.ads[p.ad_id] : groupBy(db.ads, "post", (a) => a.post_id).get(p.id)[0];
  const dispute = groupBy(db.disputes, "post", (d) => d.post_id)
    .get(p.id)
    .find((d) => d.status === "open" || d.status === "evidence_requested" || d.status === "under_review");
  const now = db.clock.now;
  return joinView(cache, p, [creator, bounty, submission, link, ad, dispute, now, ...clockRows, ...rights], () => {
    const closes = p.window_ends_at;
    const hoursLeft = Math.max(0, hoursBetween(now, closes));
    const windowHours = hoursBetween(p.posted_at, closes) || 72;
    const main = [...clockRows].filter((r) => MAIN_SOURCES.has(r.source)).sort((a, b) => desc(a.earned_at, b.earned_at))[0] ?? clockRows[0];
    const money = main
      ? describeEarning({ state: main.state, reason: main.reason, eta_at: main.eta_at, window_ends_at: closes, cleared_at: main.cleared_at, paid_at: main.paid_at })
      : null;
    const used = p.earnings.cpm_cents + p.earnings.cpa_cents;
    return {
      ...p,
      creator,
      bounty,
      app: bounty.app,
      brand: bounty.brand,
      ...(submission ? { submission } : {}),
      ...(link ? { link } : {}),
      window: { opens_at: p.posted_at, closes_at: closes, is_open: toMs(now) < toMs(closes), hours_left: hoursLeft, progress: Math.min(1, Math.max(0, 1 - hoursLeft / windowHours)) },
      clock_rows: [...clockRows].sort((a, b) => desc(a.earned_at, b.earned_at)),
      money,
      timeline: postTimeline({ posted_at: p.posted_at, now }),
      rights: [...rights],
      ...(ad ? { ad } : {}),
      ...(dispute ? { dispute } : {}),
      cap: { cap_cents: bounty.per_video_cap_cents, used_cents: used, remaining_cents: p.earnings.cap_remaining_cents, ratio: bounty.per_video_cap_cents > 0 ? Math.min(1, used / bounty.per_video_cap_cents) : 0 },
      trial_rate: p.funnel.installs >= 20 ? Math.round((p.funnel.trials / p.funnel.installs) * 10_000) / 10_000 : null,
      age_hours: Math.max(0, hoursBetween(p.posted_at, now)),
    };
  });
}

export const POST_VIEW_KEYS = ["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "posts", "creators", "submissions", "attribution_links", "money_clock", "rights_grants", "ads", "disputes"] as const;

export interface PostFilter {
  /** A creator id, or "mine" for the signed-in creator. */
  creator?: string;
  /** A brand id, or "mine" for the signed-in brand workspace. */
  brand?: string;
  bounty?: string;
  app?: string;
  status?: PostStatus | readonly PostStatus[] | "open" | "settling";
  q?: string;
  sort?: "newest" | "oldest" | "views" | "earnings";
  limit?: number;
}

/** Posts with joins. For a creator: "live" and "window_closed" are the ones still settling. */
export const selectPosts = defineSelector([...POST_VIEW_KEYS, "session"] as const, (db: PostViewDb & Db<"session">, f: PostFilter | undefined): readonly PostView[] => {
  const filter = f ?? {};
  const creatorId = filter.creator === "mine" ? db.session.creator_id : filter.creator;
  const brandId = filter.brand === "mine" ? mineBrandId(db) : filter.brand;
  let list: readonly Post[] = valuesOf(db.posts);
  if (creatorId) list = groupBy(db.posts, "creator", (p) => p.creator_id).get(creatorId);
  else if (filter.bounty) list = groupBy(db.posts, "bounty", (p) => p.bounty_id).get(filter.bounty);
  const wanted = filter.status === "open" ? (["live"] as readonly PostStatus[]) : filter.status === "settling" ? (["live", "window_closed", "held"] as readonly PostStatus[]) : asList(filter.status as PostStatus | readonly PostStatus[] | undefined);
  let rows = list.filter((p) => {
    if (brandId && p.brand_id !== brandId) return false;
    if (filter.bounty && p.bounty_id !== filter.bounty) return false;
    if (filter.app && p.app_id !== filter.app) return false;
    if (wanted && !wanted.includes(p.status)) return false;
    return true;
  });
  if (filter.q) rows = rows.filter((p) => matchesQuery(filter.q, p.caption, p.id, db.bounties[p.bounty_id]?.title, db.apps[p.app_id]?.name, db.creators[p.creator_id]?.handle));
  const views = rows.map((p) => postView(db, p));
  const sort = filter.sort ?? "newest";
  views.sort((a, b) => (sort === "oldest" ? asc(a.posted_at, b.posted_at) : sort === "views" ? desc(a.views, b.views) : sort === "earnings" ? desc(a.earnings.total_cents, b.earnings.total_cents) : desc(a.posted_at, b.posted_at)));
  return filter.limit ? views.slice(0, filter.limit) : views;
});

/** One post with its joins, or `undefined`. */
export const selectPost = defineSelector(POST_VIEW_KEYS, (db: PostViewDb, id: string | undefined): PostView | undefined => {
  const p = id ? db.posts[id] : undefined;
  return p ? postView(db, p) : undefined;
});
