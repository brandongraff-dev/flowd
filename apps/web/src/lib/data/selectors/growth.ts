/**
 * Brand growth tools: the Creative Library (every video tagged by format, hook, CTA), hook and format leaderboards, the test planner and Winner promotion.
 */

import type { Ad, App, Bounty, Creator, CtaType, FatigueAlert, Format, FormatId, HookType, Offer, Platform, Post, RightsGrant, TestAxisItem, TestCell, TestPlan, VideoTags } from "@/lib/contract/types";
import { aggregateFunnelBy, effectiveAdEnd, planHasFeature, toMs, type FunnelRow } from "@/lib/engine";
import { asc, defineSelector, desc, groupBy, matchesQuery, type Db } from "../select";
import { mineBrandId } from "./bounties";

// ── the creative library ───────────────────────────────────────────────────────────────────────

export interface LibraryItem {
  post: Post;
  creator: Creator;
  app: App;
  bounty: Bounty;
  tags: VideoTags;
  format?: Format;
  /** Installs to trials, tracked. Null under 20 installs. */
  trial_rate: number | null;
  /** What the brand paid for the post (creator pay plus fee) and per tracked trial. */
  cost_cents: number;
  cost_per_trial_cents: number | null;
  /** Plain-English reasons written after settlement ("Hook landed at 1.4 s"). */
  why_it_won: readonly string[];
  /** The post is a winner for its bounty (top decile on trial rate). */
  is_winner: boolean;
}

export interface LibraryFilter {
  /** A brand id or "mine" (default for a brand). */
  brand?: string;
  app?: string;
  creator?: string;
  format?: FormatId;
  hook_type?: HookType;
  cta?: CtaType;
  platform?: Platform;
  min_views?: number;
  winners_only?: boolean;
  q?: string;
  sort?: "trial_rate" | "views" | "newest" | "cost_per_trial";
  limit?: number;
}

export interface LibraryResult {
  items: readonly LibraryItem[];
  /** The numbers behind the leaderboards, so a page can show "based on 38 posts". */
  total: number;
  hook_types: readonly (FunnelRow & { thin: boolean })[];
  formats: readonly (FunnelRow & { thin: boolean; format?: Format })[];
  /** The first words of hooks, with the trial rate of the posts that used them. */
  hook_words: readonly (FunnelRow & { thin: boolean })[];
  ctas: readonly (FunnelRow & { thin: boolean })[];
  /** True when nothing has settled yet (the empty state explains that the library needs settled posts). */
  empty: boolean;
}

/** Posts that have finished their 72-hour window: only those have numbers worth ranking. */
const SETTLED = new Set<Post["status"]>(["window_closed", "cleared", "paid", "held"]);
const MIN_POSTS_PER_ROW = 3;

export const selectLibrary = defineSelector(["posts", "creators", "apps", "bounties", "formats", "ledger", "session"] as const, (db: Db<"posts" | "creators" | "apps" | "bounties" | "formats" | "ledger" | "session">, f: LibraryFilter | undefined): LibraryResult => {
  const filter = f ?? {};
  const brandId = filter.brand === undefined || filter.brand === "mine" ? db.session.brand_id : filter.brand;
  if (!brandId) return { items: [], total: 0, hook_types: [], formats: [], hook_words: [], ctas: [], empty: true };
  const costOf = (p: Post): number => {
    let cost = 0;
    for (const e of groupBy(db.ledger, "post", (x) => x.post_id).get(p.id)) {
      if (e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee")) cost += e.amount_cents;
      else if (e.account === "platform:fees" && e.amount_cents > 0) cost += e.amount_cents;
    }
    return cost;
  };
  const all = groupBy(db.posts, "brand", (p) => p.brand_id)
    .get(brandId)
    .filter((p) => SETTLED.has(p.status));
  const rows = all.map((p) => ({ post: p, cost: costOf(p) }));
  const keyed = rows.map((r) => ({ ...r, funnel: r.post.funnel, cost_cents: r.cost }));
  const thin = (row: FunnelRow): boolean => row.n < MIN_POSTS_PER_ROW;
  const items: LibraryItem[] = [];
  for (const { post: p, cost } of rows) {
    if (filter.app && p.app_id !== filter.app) continue;
    if (filter.creator && p.creator_id !== filter.creator) continue;
    if (filter.format && p.tags.format_id !== filter.format) continue;
    if (filter.hook_type && p.tags.hook_type !== filter.hook_type) continue;
    if (filter.cta && p.tags.cta_type !== filter.cta) continue;
    if (filter.platform && p.platform !== filter.platform) continue;
    if (filter.min_views !== undefined && p.views < filter.min_views) continue;
    if (filter.winners_only && !p.is_winner) continue;
    const creator = db.creators[p.creator_id];
    if (!matchesQuery(filter.q, p.tags.hook_words, p.caption, creator?.handle, db.apps[p.app_id]?.name, ...(p.why_it_won ?? []))) continue;
    items.push({
      post: p,
      creator,
      app: db.apps[p.app_id],
      bounty: db.bounties[p.bounty_id],
      tags: p.tags,
      ...(p.tags.format_id && db.formats[p.tags.format_id] ? { format: db.formats[p.tags.format_id] } : {}),
      trial_rate: p.funnel.installs >= 20 ? Math.round((p.funnel.trials / p.funnel.installs) * 10_000) / 10_000 : null,
      cost_cents: cost,
      cost_per_trial_cents: p.funnel.trials > 0 ? Math.round(cost / p.funnel.trials) : null,
      why_it_won: p.why_it_won ?? [],
      is_winner: p.is_winner,
    });
  }
  const sort = filter.sort ?? "trial_rate";
  items.sort((a, b) =>
    sort === "views"
      ? desc(a.post.views, b.post.views)
      : sort === "newest"
        ? desc(a.post.posted_at, b.post.posted_at)
        : sort === "cost_per_trial"
          ? asc(a.cost_per_trial_cents ?? Number.MAX_SAFE_INTEGER, b.cost_per_trial_cents ?? Number.MAX_SAFE_INTEGER)
          : desc(a.trial_rate ?? -1, b.trial_rate ?? -1),
  );
  return {
    items: filter.limit ? items.slice(0, filter.limit) : items,
    total: all.length,
    hook_types: aggregateFunnelBy(keyed, (x) => x.post.tags.hook_type).map((r) => ({ ...r, thin: thin(r) })),
    formats: aggregateFunnelBy(
      keyed.filter((x) => x.post.tags.format_id),
      (x) => x.post.tags.format_id as string,
    ).map((r) => ({ ...r, thin: thin(r), ...(db.formats[r.key] ? { format: db.formats[r.key] } : {}) })),
    hook_words: aggregateFunnelBy(keyed, (x) => x.post.tags.hook_words.toLowerCase())
      .map((r) => ({ ...r, thin: thin(r) }))
      .slice(0, 20),
    ctas: aggregateFunnelBy(keyed, (x) => x.post.tags.cta_type).map((r) => ({ ...r, thin: thin(r) })),
    empty: all.length === 0,
  };
});

/** Side by side: two to four library items with their metrics, for the compare view. */
export const selectLibraryCompare = defineSelector(["posts", "creators", "apps", "bounties", "formats", "ledger", "session"] as const, (db: Db<"posts" | "creators" | "apps" | "bounties" | "formats" | "ledger" | "session">, ids: readonly string[] | undefined): readonly LibraryItem[] => {
  const wanted = new Set(ids ?? []);
  if (wanted.size === 0) return [];
  return selectLibrary(db, { brand: "mine" }).items.filter((i) => wanted.has(i.post.id)).slice(0, 4);
});

// ── the test planner ───────────────────────────────────────────────────────────────────────────

export interface TestCellView extends TestCell {
  hook_label: string;
  body_label: string;
  /** The measured post's trial rate against the plan's median, when measured. */
  vs_median: number | null;
  is_winner: boolean;
}

export interface TestPlanView extends TestPlan {
  app: App;
  cells: TestCellView[];
  winner?: TestCellView;
  /** Measured cells out of all cells. */
  progress: { measured: number; total: number };
  bounties: readonly Bounty[];
  offers: readonly Offer[];
  /** "Winner has a 38% higher trial rate than the median (confidence 0.62)". */
  summary: string | null;
}

const labelOf = (items: readonly TestAxisItem[], id: string): string => items.find((i) => i.id === id)?.label ?? id;

export const selectTestPlans = defineSelector(["test_plans", "apps", "bounties", "offers", "session"] as const, (db: Db<"test_plans" | "apps" | "bounties" | "offers" | "session">, brand: string | undefined): readonly TestPlanView[] => {
  const brandId = brand === undefined || brand === "mine" ? db.session.brand_id : brand;
  if (!brandId) return [];
  return groupBy(db.test_plans, "brand", (p) => p.brand_id)
    .get(brandId)
    .map((plan): TestPlanView => {
      const rates = plan.cells.map((c) => c.results?.trial_rate).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
      const median = rates.length > 0 ? rates[Math.floor(rates.length / 2)] : null;
      const cells: TestCellView[] = plan.cells.map((c) => ({
        ...c,
        hook_label: labelOf(plan.hooks, c.hook_ref),
        body_label: labelOf(plan.bodies, c.body_ref),
        vs_median: c.results && median ? Math.round((c.results.trial_rate / median - 1) * 100) / 100 : null,
        is_winner: plan.winner_cell_id === c.id,
      }));
      const winner = cells.find((c) => c.is_winner);
      return {
        ...plan,
        app: db.apps[plan.app_id],
        cells,
        ...(winner ? { winner } : {}),
        progress: { measured: plan.cells.filter((c) => c.status === "measured").length, total: plan.cells.length },
        bounties: plan.bounty_ids.map((id) => db.bounties[id]).filter((b): b is Bounty => b !== undefined),
        offers: plan.offer_ids.map((id) => db.offers[id]).filter((o): o is Offer => o !== undefined),
        summary: winner && plan.lift_ratio !== undefined ? `The winning cell has a ${Math.round(plan.lift_ratio * 100)}% higher trial rate than the median${plan.confidence !== undefined ? ` (confidence ${plan.confidence.toFixed(2)})` : ""}.` : null,
      };
    })
    .sort((a, b) => desc(a.updated_at, b.updated_at));
});

/** One plan. */
export const selectTestPlan = defineSelector(["test_plans", "apps", "bounties", "offers", "session"] as const, (db: Db<"test_plans" | "apps" | "bounties" | "offers" | "session">, id: string | undefined): TestPlanView | undefined => {
  const plan = id ? db.test_plans[id] : undefined;
  return plan ? selectTestPlans(db, plan.brand_id).find((p) => p.id === plan.id) : undefined;
});

/** Can the signed-in brand use the test planner on its plan (Pro and up)? */
export const selectCanUseTestPlanner = defineSelector(["brands", "session"] as const, (db: Db<"brands" | "session">): boolean => {
  const brand = db.session.brand_id ? db.brands[db.session.brand_id] : undefined;
  return brand ? planHasFeature(brand.plan, "test_planner") : false;
});

// ── Winner promotion ───────────────────────────────────────────────────────────────────────────

export interface PromotableItem {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  app: App;
  /** The active paid-ad rights grant, if the Rights Card includes paid-ad use. */
  rights?: RightsGrant;
  /** Share still watching at about 3 seconds ("hook rate") and the average share watched ("hold rate"). */
  hook_rate: number | null;
  hold_rate: number;
  trial_rate: number | null;
  eligible: boolean;
  /** Why not, in plain words. */
  blocked_reason?: string;
  /** Commission to the creator on ad-attributed revenue and the platform's 1% of ad spend. */
  commission: { rate: number; days: number; platform_fee_rate: number };
}

export interface AdView extends Ad {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  app: App;
  /** When the ad must stop: the Spark code or the rights term, whichever ends first, and which one it is. */
  ends: { at: string | null; limited_by: "spark_code" | "rights" | null; days_left: number | null };
  ctr: number | null;
  cost_per_trial_cents: number | null;
  /** Ad-attributed revenue over spend. */
  roas: number | null;
}

export interface FatigueView extends FatigueAlert {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  ad?: Ad;
}

export interface Promotions {
  eligible: readonly PromotableItem[];
  /** Waiting on the creator's consent (a Spark code or partnership permission). */
  requested: readonly AdView[];
  /** Consent given, waiting for the brand to launch. */
  authorised: readonly AdView[];
  running: readonly AdView[];
  ended: readonly AdView[];
  fatigue: readonly FatigueView[];
  /** The plan includes Winner promotion. */
  plan_ok: boolean;
}

type PromoDb = Db<"posts" | "creators" | "bounties" | "apps" | "ads" | "rights_grants" | "fatigue_alerts" | "brands" | "clock" | "session">;

function adView(db: PromoDb, ad: Ad): AdView {
  const end = effectiveAdEnd({ code_expires_at: ad.code_expires_at, rights_ends_at: ad.rights_ends_at });
  return {
    ...ad,
    post: db.posts[ad.post_id],
    creator: db.creators[ad.creator_id],
    bounty: db.bounties[ad.bounty_id],
    app: db.apps[ad.app_id],
    ends: { at: end.ends_at, limited_by: end.limited_by, days_left: end.ends_at ? Math.max(0, Math.round((toMs(end.ends_at) - toMs(db.clock.now)) / 86_400_000)) : null },
    ctr: ad.impressions >= 1000 ? Math.round((ad.clicks / ad.impressions) * 10_000) / 10_000 : null,
    cost_per_trial_cents: ad.trials > 0 ? Math.round(ad.spend_cents / ad.trials) : null,
    roas: ad.spend_cents > 0 ? Math.round((ad.revenue_cents / ad.spend_cents) * 100) / 100 : null,
  };
}

export const selectPromotions = defineSelector(["posts", "creators", "bounties", "apps", "ads", "rights_grants", "fatigue_alerts", "brands", "clock", "session"] as const, (db: PromoDb, brand: string | undefined): Promotions => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const none: Promotions = { eligible: [], requested: [], authorised: [], running: [], ended: [], fatigue: [], plan_ok: false };
  if (!brandId) return none;
  const b = db.brands[brandId];
  const ads = groupBy(db.ads, "brand", (a) => a.brand_id).get(brandId);
  const promotedPosts = new Set(ads.filter((a) => ["requested", "authorised", "live", "paused", "fatigued"].includes(a.status)).map((a) => a.post_id));
  const planOk = b ? planHasFeature(b.plan, "winner_promotion") : false;
  const eligible: PromotableItem[] = groupBy(db.posts, "brand", (p) => p.brand_id)
    .get(brandId)
    .filter((p) => p.status === "cleared" || p.status === "paid")
    .map((p): PromotableItem => {
      const rights = groupBy(db.rights_grants, "post", (g) => g.post_id).get(p.id).find((g) => g.scope === "paid_ads" && g.status !== "revoked" && g.status !== "expired");
      let blocked: string | undefined;
      if (!planOk) blocked = "Winner promotion is part of the Pro plan.";
      else if (!rights) blocked = "This bounty's Rights Card does not include paid-ad use, or the term ended. Renew it in the Rights Vault.";
      else if (promotedPosts.has(p.id)) blocked = "This post already has a promotion.";
      const bounty = db.bounties[p.bounty_id];
      return {
        post: p,
        creator: db.creators[p.creator_id],
        bounty,
        app: db.apps[p.app_id],
        ...(rights ? { rights } : {}),
        hook_rate: p.retention.curve[1] ?? null,
        hold_rate: p.retention.avg_watch_ratio,
        trial_rate: p.funnel.installs >= 20 ? Math.round((p.funnel.trials / p.funnel.installs) * 10_000) / 10_000 : null,
        eligible: blocked === undefined,
        ...(blocked ? { blocked_reason: blocked } : {}),
        commission: { rate: bounty?.ad_commission_rate ?? 0.1, days: 60, platform_fee_rate: 0.01 },
      };
    })
    .sort((a, c) => Number(c.post.is_winner) - Number(a.post.is_winner) || desc(c.trial_rate ?? -1, a.trial_rate ?? -1));
  const views = ads.map((a) => adView(db, a));
  return {
    eligible,
    requested: views.filter((a) => a.status === "requested"),
    authorised: views.filter((a) => a.status === "authorised"),
    running: views.filter((a) => a.status === "live" || a.status === "paused" || a.status === "fatigued"),
    ended: views.filter((a) => a.status === "ended" || a.status === "expired" || a.status === "declined").sort((a, c) => desc(a.ended_at ?? a.permission_requested_at, c.ended_at ?? c.permission_requested_at)),
    fatigue: groupBy(db.fatigue_alerts, "brand", (f) => f.brand_id)
      .get(brandId)
      .filter((f) => f.status === "open" || f.status === "acknowledged" || f.status === "refreshing")
      .map((f): FatigueView => ({ ...f, post: db.posts[f.post_id], creator: db.creators[f.creator_id], bounty: db.bounties[f.bounty_id], ...(f.ad_id && db.ads[f.ad_id] ? { ad: db.ads[f.ad_id] } : {}) }))
      .sort((a, c) => desc(a.drop_ratio, c.drop_ratio)),
    plan_ok: planOk,
  };
});

