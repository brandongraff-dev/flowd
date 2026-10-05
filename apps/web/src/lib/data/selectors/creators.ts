/**
 * Creators as brands (and the public) see them: discovery, profiles, storefronts, CRM lists and the rate card. Reputation is fair: finished work only,
 * recency-weighted, shown with reasons; a creator with fewer than five finished decisions is "Building history" and shown as a range, not a verdict.
 */

import type { App, BrandList, Creator, CreatorReputation, Niche, Offer, Platform, Post, Proof, RateCard, SocialAccount, Submission, Tier, TierProgress } from "@/lib/contract/types";
import { rankCreatorsForBounty, reliabilityForBrandView, tierAtLeast, tierRank, type CreatorMatch, type ReliabilityView } from "@/lib/engine";
import { creatorProfile, matchBounty } from "@/lib/store/core/adapters";
import { asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { mineBrandId } from "./bounties";

export interface CreatorCard {
  creator: Creator;
  reputation?: CreatorReputation;
  /** A verdict, or a range while the creator has fewer than 5 finished decisions. */
  reliability?: ReliabilityView;
  accounts: readonly SocialAccount[];
  /** Combined followers of connected accounts. */
  followers: number;
  /** Median views over 28 days on the strongest connected account. */
  median_views: number;
  /** The best US audience share among connected accounts. */
  us_audience_ratio: number;
  rate_card?: RateCard;
  posts: number;
  /** Posts that became winners, over settled posts. Null under 5 settled posts. */
  hit_rate: number | null;
  /** The creator's work on the signed-in brand's apps. */
  on_my_apps: { posts: number; trials: number; cost_cents: number; cost_per_trial_cents: number | null };
  /** The brand's lists this creator is on. */
  in_lists: readonly BrandList[];
  /** The match for a bounty, when the directory was asked about one. */
  match?: CreatorMatch;
}

export interface CreatorFilter {
  niche?: Niche;
  /** This tier and above. */
  min_tier?: Tier;
  /** 0 to 1, over finished work. */
  min_approval_rate?: number;
  min_reliability?: number;
  platform?: Platform;
  /** Rate-card price ceiling (cents per video). */
  max_price_cents?: number;
  min_us_audience?: number;
  open_to_offers?: boolean;
  /** Only creators on this list (a list id). */
  list?: string;
  /** Rank for a bounty (match score, gates explained). */
  for_bounty?: string;
  q?: string;
  sort?: "match" | "reliability" | "approval" | "views" | "price" | "tier" | "recent";
  limit?: number;
}

export interface CreatorDirectory {
  items: readonly CreatorCard[];
  total: number;
}

type DirDb = Db<"creators" | "creator_reputation" | "social_accounts" | "rate_cards" | "posts" | "ledger" | "brand_lists" | "bounties" | "brand_scorecards" | "submissions" | "apps" | "clock" | "session">;
const DIR_KEYS = ["creators", "creator_reputation", "social_accounts", "rate_cards", "posts", "ledger", "brand_lists", "bounties", "brand_scorecards", "submissions", "apps", "clock", "session"] as const;

function card(db: DirDb, c: Creator, brandId: string | null): CreatorCard {
  const reputation = groupBy(db.creator_reputation, "creator", (r) => r.creator_id).get(c.id)[0];
  const accounts = groupBy(db.social_accounts, "creator", (a) => a.creator_id).get(c.id).filter((a) => a.status === "connected");
  const best = [...accounts].sort((a, b) => b.median_views_28d - a.median_views_28d)[0];
  const posts = groupBy(db.posts, "creator", (p) => p.creator_id).get(c.id).filter((p) => p.status !== "removed");
  const settled = posts.filter((p) => p.status === "window_closed" || p.status === "cleared" || p.status === "paid");
  const mine = brandId ? posts.filter((p) => p.brand_id === brandId) : [];
  let cost = 0;
  for (const p of mine) {
    for (const e of groupBy(db.ledger, "post", (x) => x.post_id).get(p.id)) {
      if ((e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee")) || (e.account === "platform:fees" && e.amount_cents > 0)) cost += e.amount_cents;
    }
  }
  const trials = mine.reduce((s, p) => s + p.funnel.trials, 0);
  return {
    creator: c,
    ...(reputation ? { reputation, reliability: reliabilityForBrandView({ score: reputation.reliability_score, provisional: reputation.provisional, finished_n: reputation.finished_n }) } : {}),
    accounts,
    followers: accounts.reduce((s, a) => s + a.followers, 0),
    median_views: best?.median_views_28d ?? 0,
    us_audience_ratio: Math.max(0, ...accounts.map((a) => a.us_audience_ratio)),
    ...(groupBy(db.rate_cards, "creator", (r) => r.creator_id).get(c.id)[0] ? { rate_card: groupBy(db.rate_cards, "creator", (r) => r.creator_id).get(c.id)[0] } : {}),
    posts: posts.length,
    hit_rate: settled.length >= 5 ? Math.round((settled.filter((p) => p.is_winner).length / settled.length) * 100) / 100 : null,
    on_my_apps: { posts: mine.length, trials, cost_cents: cost, cost_per_trial_cents: trials > 0 ? Math.round(cost / trials) : null },
    in_lists: brandId ? valuesOf(db.brand_lists).filter((l) => l.brand_id === brandId && l.members.some((m) => m.creator_id === c.id)) : [],
  };
}

/** Discover creators. `useCreatorDirectory({ niche: "ai_tools", min_tier: "silver", sort: "reliability" })`. */
export const selectCreatorDirectory = defineSelector(DIR_KEYS, (db: DirDb, f: CreatorFilter | undefined): CreatorDirectory => {
  const filter = f ?? {};
  const brandId = mineBrandId(db);
  let creators = valuesOf(db.creators).filter((c) => {
    if (filter.niche && !c.niches.includes(filter.niche)) return false;
    if (filter.min_tier && !tierAtLeast(c.tier, filter.min_tier)) return false;
    if (filter.min_approval_rate !== undefined && c.approval_rate < filter.min_approval_rate) return false;
    if (filter.min_reliability !== undefined && c.reliability_score < filter.min_reliability) return false;
    if (filter.open_to_offers !== undefined && c.open_to_offers !== filter.open_to_offers) return false;
    return matchesQuery(filter.q, c.handle, c.display_name, c.bio, ...c.niches);
  });
  if (filter.list) {
    const list = db.brand_lists[filter.list];
    const ids = new Set(list?.members.map((m) => m.creator_id) ?? []);
    creators = creators.filter((c) => ids.has(c.id));
  }
  let matches: Map<string, CreatorMatch> | null = null;
  if (filter.for_bounty && db.bounties[filter.for_bounty]) {
    const ranked = rankCreatorsForBounty({ bounty: matchBounty(db, db.bounties[filter.for_bounty]), creators: creators.map((c) => creatorProfile(db, c)), now: db.clock.now });
    matches = new Map(ranked.map((m) => [m.creator_id, m]));
  }
  let cards = creators.map((c) => ({ ...card(db, c, brandId), ...(matches?.get(c.id) ? { match: matches.get(c.id) } : {}) }) as CreatorCard);
  cards = cards.filter((k) => {
    if (filter.platform && !k.accounts.some((a) => a.platform === filter.platform)) return false;
    if (filter.max_price_cents !== undefined && k.rate_card && k.rate_card.price_per_video_cents > filter.max_price_cents) return false;
    if (filter.min_us_audience !== undefined && k.us_audience_ratio < filter.min_us_audience) return false;
    return true;
  });
  const sort = filter.sort ?? (matches ? "match" : "reliability");
  cards.sort((a, b) => {
    switch (sort) {
      case "match":
        return desc(a.match?.score ?? -1, b.match?.score ?? -1);
      case "approval":
        return desc(a.creator.approval_rate, b.creator.approval_rate);
      case "views":
        return desc(a.median_views, b.median_views);
      case "price":
        return asc(a.rate_card?.price_per_video_cents ?? Number.MAX_SAFE_INTEGER, b.rate_card?.price_per_video_cents ?? Number.MAX_SAFE_INTEGER);
      case "tier":
        return desc(tierRank(a.creator.tier), tierRank(b.creator.tier)) || desc(a.creator.reliability_score, b.creator.reliability_score);
      case "recent":
        return desc(a.creator.last_active_at, b.creator.last_active_at);
      default:
        return desc(a.creator.reliability_score, b.creator.reliability_score);
    }
  });
  return { items: filter.limit ? cards.slice(0, filter.limit) : cards, total: cards.length };
});

export interface CreatorProfileView extends CreatorCard {
  /** Recent posts, newest first. */
  recent_posts: readonly Post[];
  /** Results per app the creator has promoted. */
  per_app: readonly { app: App; posts: number; views: number; installs: number; trials: number; paid: number }[];
  /** Everything between this brand and the creator. */
  history: { submissions: readonly Submission[]; offers: readonly Offer[] };
  /** Fraud summary a brand may see: the highest score on a post in the last 90 days and the flags raised (never the evidence). */
  fraud: { max_score_90d: number; flags_90d: number; clawbacks_90d: number };
  /** The public storefront link. */
  storefront_url: string;
  /** Latest proof of earnings the creator chose to publish. */
  proof?: Proof;
}

/** A creator profile for a brand: reputation with reasons, results per app, history with this brand, a fraud summary. */
export const selectCreatorProfile = defineSelector([...DIR_KEYS, "offers", "proofs"] as const, (db: DirDb & Db<"offers" | "proofs">, handle: string | undefined): CreatorProfileView | undefined => {
  const c = handle ? valuesOf(db.creators).find((x) => x.handle === handle.replace(/^@/, "")) : undefined;
  if (!c) return undefined;
  const brandId = mineBrandId(db);
  const base = card(db, c, brandId);
  const posts = groupBy(db.posts, "creator", (p) => p.creator_id).get(c.id).filter((p) => p.status !== "removed");
  const apps = new Map<string, { app: App; posts: number; views: number; installs: number; trials: number; paid: number }>();
  for (const p of posts) {
    const app = db.apps[p.app_id];
    if (!app) continue;
    const row = apps.get(app.id) ?? { app, posts: 0, views: 0, installs: 0, trials: 0, paid: 0 };
    row.posts += 1;
    row.views += p.views;
    row.installs += p.funnel.installs;
    row.trials += p.funnel.trials;
    row.paid += p.funnel.paid;
    apps.set(app.id, row);
  }
  const rep = base.reputation;
  const proof = latestPublicProof(db.proofs, c.id);
  return {
    ...base,
    recent_posts: [...posts].sort((a, b) => desc(a.posted_at, b.posted_at)).slice(0, 12),
    per_app: [...apps.values()].sort((a, b) => desc(a.trials, b.trials)),
    history: {
      submissions: brandId ? groupBy(db.submissions, "creator", (s) => s.creator_id).get(c.id).filter((s) => s.brand_id === brandId) : [],
      offers: brandId ? groupBy(db.offers, "creator", (o) => o.creator_id).get(c.id).filter((o) => o.brand_id === brandId) : [],
    },
    fraud: { max_score_90d: Math.max(0, ...posts.filter((p) => Date.parse(p.posted_at) >= Date.parse(db.clock.now) - 90 * 86_400_000).map((p) => p.fraud.score)), flags_90d: rep?.fraud_flags_90d ?? 0, clawbacks_90d: rep?.clawbacks_90d ?? 0 },
    storefront_url: `joinflowd.io/c/${c.handle}`,
    ...(proof ? { proof } : {}),
  };
});

/** The newest proof of earnings a creator published (not revoked, not anonymous). */
function latestPublicProof(proofs: Readonly<Record<string, Proof>>, creatorId: string): Proof | undefined {
  return valuesOf(proofs)
    .filter((p) => p.creator_id === creatorId && !p.revoked && !p.anonymous)
    .sort((x, y) => desc(x.created_at, y.created_at))[0];
}

// ── the public storefront ──────────────────────────────────────────────────────────────────────

export interface PublicCreator {
  creator: Creator;
  /** Verified stats from the ledger, shown only when the creator turned stats on. */
  stats: { posts: number; approval_rate: number; median_views: number; tier: Tier; streak_weeks: number } | null;
  /** Apps this creator has promoted. */
  apps: readonly App[];
  featured_posts: readonly Post[];
  accounts: readonly { platform: Platform; handle: string; followers: number; verified: boolean }[];
  /** The rate card as a CTA: "Work with me from $140", only when the creator takes direct offers. */
  cta: { label: string; price_from_cents: number } | null;
  /** A published proof of earnings (never an anonymous one). */
  proof?: Proof;
  badges: Creator["badges"];
}

/** The public storefront at `/c/[handle]`: verified stats only, never private numbers. `undefined` for an unknown handle (show the designed 404). */
export const selectPublicCreator = defineSelector(["creators", "social_accounts", "posts", "apps", "rate_cards", "proofs"] as const, (db: Db<"creators" | "social_accounts" | "posts" | "apps" | "rate_cards" | "proofs">, handle: string | undefined): PublicCreator | undefined => {
  const c = handle ? valuesOf(db.creators).find((x) => x.handle === handle.replace(/^@/, "")) : undefined;
  if (!c) return undefined;
  const accounts = groupBy(db.social_accounts, "creator", (a) => a.creator_id).get(c.id).filter((a) => a.status === "connected");
  const posts = groupBy(db.posts, "creator", (p) => p.creator_id).get(c.id).filter((p) => p.status !== "removed");
  const appIds = [...new Set(posts.map((p) => p.app_id))];
  const rate = groupBy(db.rate_cards, "creator", (r) => r.creator_id).get(c.id)[0];
  const proof = latestPublicProof(db.proofs, c.id);
  return {
    creator: c,
    stats: c.storefront.show_stats ? { posts: c.posts_count, approval_rate: c.approval_rate, median_views: Math.max(0, ...accounts.map((a) => a.median_views_28d)), tier: c.tier, streak_weeks: c.streak_weeks } : null,
    apps: appIds.map((id) => db.apps[id]).filter((a): a is App => a !== undefined),
    featured_posts: c.storefront.featured_post_ids.map((id) => db.posts[id]).filter((p): p is Post => p !== undefined),
    accounts: accounts.map((a) => ({ platform: a.platform, handle: a.handle, followers: a.followers, verified: a.verified_by_platform })),
    cta: rate && rate.accepts_direct_offers && rate.status !== "paused" ? { label: c.storefront.cta_label, price_from_cents: Math.min(rate.price_per_video_cents, ...rate.packages.map((p) => p.price_per_video_cents)) } : null,
    ...(proof ? { proof } : {}),
    badges: c.badges,
  };
});

// ── lists ──────────────────────────────────────────────────────────────────────────────────────

export interface ListView extends BrandList {
  creators: readonly { creator: Creator; note?: string; tags: readonly string[]; added_at: string }[];
}

/** The brand's CRM lists (favourites first) with the creators on them, notes and tags. */
export const selectLists = defineSelector(["brand_lists", "creators", "session"] as const, (db: Db<"brand_lists" | "creators" | "session">, brand: string | undefined): readonly ListView[] => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  if (!brandId) return [];
  return groupBy(db.brand_lists, "brand", (l) => l.brand_id)
    .get(brandId)
    .map((l) => ({ ...l, creators: l.members.map((m) => ({ creator: db.creators[m.creator_id], ...(m.note ? { note: m.note } : {}), tags: m.tags, added_at: m.added_at })).filter((m) => m.creator !== undefined) }))
    .sort((a, b) => Number(b.is_favourites) - Number(a.is_favourites) || asc(a.name, b.name));
});

// ── the creator's own rate card ────────────────────────────────────────────────────────────────

export interface RateCardView {
  creator?: Creator;
  rate_card?: RateCard;
  /** Rate cards open at Silver. */
  locked: boolean;
  /** What unlocks it: the tier progress with each requirement (cleared, approved posts, approval rate). */
  unlock?: TierProgress;
  /** The market-suggested price with its p25 to p75 band, confidence and basis. */
  suggestion?: NonNullable<RateCard["suggested"]>;
  /** Where the ask sits against the suggestion: below, within or above the band. */
  position: "below" | "within" | "above" | null;
  /** How the card reads to a brand: price, minimum CPM, usage, turnaround, packages. */
  preview?: { headline: string; lines: readonly string[] };
}

export const selectRateCard = defineSelector(["creators", "rate_cards", "creator_reputation", "session"] as const, (db: Db<"creators" | "rate_cards" | "creator_reputation" | "session">, creator: string | undefined): RateCardView => {
  const id = creator === undefined || creator === "mine" ? db.session.creator_id : creator;
  const c = id ? db.creators[id] : undefined;
  if (!c) return { locked: true, position: null };
  const rate = groupBy(db.rate_cards, "creator", (r) => r.creator_id).get(c.id)[0];
  const locked = !tierAtLeast(c.tier, "silver");
  const rep = groupBy(db.creator_reputation, "creator", (r) => r.creator_id).get(c.id)[0];
  const sug = rate?.suggested;
  const position = rate && sug ? (rate.price_per_video_cents < sug.low_cents ? "below" : rate.price_per_video_cents > sug.high_cents ? "above" : "within") : null;
  return {
    creator: c,
    ...(rate ? { rate_card: rate } : {}),
    locked,
    ...(locked && rep ? { unlock: rep.tier_progress } : {}),
    ...(sug ? { suggestion: sug } : {}),
    position,
    ...(rate
      ? {
          preview: {
            headline: `@${c.handle} · ${c.tier[0].toUpperCase()}${c.tier.slice(1)}`,
            lines: [
              `From ${(rate.price_per_video_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} per video, organic posting included`,
              `${rate.paid_usage_days} days of paid-ad usage included; each extra 30 days is ${Math.round(rate.paid_usage_pct_per_30d * 100)}% of the base price`,
              `${rate.turnaround_days}-day turnaround, up to ${rate.max_videos_per_month} videos a month`,
              ...rate.packages.map((p) => `${p.label}: ${(p.price_per_video_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} per video`),
            ],
          },
        }
      : {}),
  };
});
