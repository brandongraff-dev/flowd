/**
 * The market: clearing CPMs by category with their p25 to p75 band, price against fill time with a confidence, competition heat, trends, sealed-bid
 * auctions and the Spec Market. Neutral ink and arrows for deltas: brands see no green or red.
 */

import type { App, Auction, Bid, Brand, Category, Creator, Format, FormatId, HookType, Niche, Spec, SpecStatus, Trend, TrendDirection, TrendKind, MarketSeriesPoint, CurvePoint } from "@/lib/contract/types";
import { CATEGORY_META } from "@/lib/contract/types";
import { categoryPriceCurve, clearingStats, competitionHeat, cpmPercentile, fillTime, hoursBetween, marketPosition, suggestCpm, toMs, trendCopy, type ClearingStats, type CompetitionHeat, type FillTime, type MarketPosition, type SuggestedCpm } from "@/lib/engine";
import { asList, asc, defineSelector, desc, matchesQuery, valuesOf, type Db } from "../select";
import { bountyView, type BountyDb, type BountyView } from "./bounties";

export interface MarketView {
  category: Category;
  label: string;
  /** Clearing CPM (median), p25, p75, 7 and 30 day change, trend and sample. */
  stats: ClearingStats;
  /** "+5% this week", "steady this week". */
  trend_copy: string;
  /** Daily points for the band chart (median with p25 to p75). */
  series: readonly MarketSeriesPoint[];
  heat: CompetitionHeat;
  /** Price against fill time, six points around the clearing price. */
  curve: readonly CurvePoint[];
  /** Fewer than 8 comparable bounties: say so in the page ("few trades"). */
  thin_market: boolean;
  /** The date of the latest data point (show "as of" beside the numbers). */
  as_of: string;
  supply: { open_bounties: number; open_budget_cents: number; submissions_7d: number; creators_in_category: number };
  /** Open funded bounties in this category, best-paying first. */
  open_bounties: readonly BountyView[];
  /** The signed-in brand's own bounties in the category (to mark them on the chart). */
  mine: readonly BountyView[];
  /** The hook types converting best in this category, from settled posts (sample size beside each). */
  top_hooks: readonly { hook_type: HookType; trial_rate: number | null; posts: number }[];
}

type MarketDb = BountyDb & Db<"market_series" | "creators" | "posts" | "session">;
const MARKET_KEYS = ["market_series", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "creators", "posts", "session"] as const;

const NICHE_OF: Record<Category, Niche[]> = {
  ai_photo: ["ai_tools", "tech", "lifestyle", "beauty"],
  ai_assistant: ["ai_tools", "tech", "productivity"],
  fitness: ["fitness", "wellness", "lifestyle"],
  language: ["study", "travel", "lifestyle"],
  productivity: ["productivity", "study", "tech"],
  finance: ["money", "lifestyle", "productivity"],
  sleep_mind: ["wellness", "lifestyle", "parenting"],
  music_audio: ["lifestyle", "tech"],
  lifestyle: ["lifestyle", "food", "travel", "parenting"],
};

function market(db: MarketDb, category: Category): MarketView {
  const points = valuesOf(db.market_series);
  const stats = clearingStats(points, category);
  const series = points.filter((p) => p.category === category).sort((a, b) => asc(a.date, b.date));
  const latest = series[series.length - 1];
  const open = valuesOf(db.bounties).filter((b) => b.status === "live" && b.funded && db.apps[b.app_id]?.category === category);
  const brandId = db.session.brand_id;
  const catPosts = valuesOf(db.posts).filter((p) => (p.status === "cleared" || p.status === "paid") && db.apps[p.app_id]?.category === category);
  const hooks = new Map<HookType, { installs: number; trials: number; posts: number }>();
  for (const p of catPosts) {
    const row = hooks.get(p.tags.hook_type) ?? { installs: 0, trials: 0, posts: 0 };
    row.installs += p.funnel.installs;
    row.trials += p.funnel.trials;
    row.posts += 1;
    hooks.set(p.tags.hook_type, row);
  }
  const niches = NICHE_OF[category];
  return {
    category,
    label: CATEGORY_META[category].label,
    stats,
    trend_copy: trendCopy(stats.change_7d),
    series,
    heat: competitionHeat(latest ?? { open_bounties: stats.open_bounties, open_budget_cents: stats.open_budget_cents, submissions: stats.submissions, clearing_cpm_cents: stats.clearing_cpm_cents, median_views: stats.median_views }),
    curve: categoryPriceCurve(stats),
    thin_market: stats.sample_n < 8,
    as_of: stats.date,
    supply: {
      open_bounties: stats.open_bounties || open.length,
      open_budget_cents: stats.open_budget_cents,
      submissions_7d: series.slice(-7).reduce((s, p) => s + p.submissions, 0),
      creators_in_category: valuesOf(db.creators).filter((c) => c.niches.some((n) => niches.includes(n))).length,
    },
    open_bounties: open.map((b) => bountyView(db, b)).sort((a, b) => desc(a.cpm_cents, b.cpm_cents)).slice(0, 8),
    mine: brandId ? open.filter((b) => b.brand_id === brandId).map((b) => bountyView(db, b)) : [],
    top_hooks: [...hooks.entries()].map(([hook_type, v]) => ({ hook_type, trial_rate: v.installs >= 20 ? Math.round((v.trials / v.installs) * 10_000) / 10_000 : null, posts: v.posts })).sort((a, b) => desc(a.trial_rate ?? -1, b.trial_rate ?? -1)),
  };
}

/** The live market of one category. `useMarket("ai_photo")`. */
export const selectMarket = defineSelector(MARKET_KEYS, (db: MarketDb, category: Category | undefined): MarketView | undefined => (category ? market(db, category) : undefined));

export interface MarketOverviewRow {
  category: Category;
  label: string;
  clearing_cpm_cents: number;
  p25_cpm_cents: number;
  p75_cpm_cents: number;
  change_7d: number;
  trend: ClearingStats["trend"];
  open_bounties: number;
  sample_n: number;
  thin_market: boolean;
  heat: CompetitionHeat["level"];
  sparkline: readonly number[];
}

/** Every category at a glance (the public Market page and the landing preview). */
export const selectMarketOverview = defineSelector(["market_series"] as const, (db: Db<"market_series">): readonly MarketOverviewRow[] => {
  const points = valuesOf(db.market_series);
  return (Object.keys(CATEGORY_META) as Category[]).map((category) => {
    const s = clearingStats(points, category);
    const latest = points.filter((p) => p.category === category).sort((a, b) => desc(a.date, b.date))[0];
    return {
      category,
      label: CATEGORY_META[category].label,
      clearing_cpm_cents: s.clearing_cpm_cents,
      p25_cpm_cents: s.p25_cpm_cents,
      p75_cpm_cents: s.p75_cpm_cents,
      change_7d: s.change_7d,
      trend: s.trend,
      open_bounties: s.open_bounties,
      sample_n: s.sample_n,
      thin_market: s.sample_n < 8,
      heat: latest ? competitionHeat(latest).level : "cool",
      sparkline: s.series.slice(-30).map((p) => p.value),
    };
  });
});

export interface PriceSuggestion extends SuggestedCpm {
  category: Category;
  stats: ClearingStats;
  /** Where the typed price sits against the category quartiles, and the percentile for the slider caption ("higher than 62% of bounties"). */
  position: MarketPosition;
  percentile: number;
  /** Fill time at the typed price. */
  fill: FillTime;
  curve: readonly CurvePoint[];
  copy: string;
}

/** The price slider of the bounty builder: the suggested CPM for a target fill time, with the fill time and confidence at the price being typed. */
export const selectPriceSuggestion = defineSelector(["market_series"] as const, (db: Db<"market_series">, arg: { category: Category; cpm_cents?: number; target_hours?: number } | undefined): PriceSuggestion | undefined => {
  if (!arg) return undefined;
  const stats = clearingStats(valuesOf(db.market_series), arg.category);
  const suggested = suggestCpm({ clearing_cpm_cents: stats.clearing_cpm_cents, p25_cpm_cents: stats.p25_cpm_cents, p75_cpm_cents: stats.p75_cpm_cents, median_fill_hours: stats.median_fill_hours, sample_n: stats.sample_n, target_fill_hours: arg.target_hours ?? stats.median_fill_hours, category_label: CATEGORY_META[arg.category].label });
  const cpm = arg.cpm_cents ?? suggested.cpm_cents;
  const q = { p25: stats.p25_cpm_cents, median: stats.clearing_cpm_cents, p75: stats.p75_cpm_cents };
  const fill = fillTime({ cpm_cents: cpm, clearing_cpm_cents: stats.clearing_cpm_cents, median_fill_hours: stats.median_fill_hours, sample_n: stats.sample_n });
  return {
    ...suggested,
    category: arg.category,
    stats,
    position: marketPosition(cpm, q),
    percentile: cpmPercentile(cpm, q),
    fill,
    curve: categoryPriceCurve(stats),
    copy: `At this price a bounty fills in about ${Math.round(fill.fill_hours_p50)} hours (${Math.round(fill.confidence * 100)}% confidence${fill.thin_market ? ", thin market" : ""}).`,
  };
});

// ── trends ─────────────────────────────────────────────────────────────────────────────────────

export interface TrendFilter {
  kind?: TrendKind;
  direction?: TrendDirection;
  category?: Category;
  niche?: Niche;
}

export interface TrendView extends Trend {
  format?: Format;
  /** "+32% a week", "-12% a week". */
  change_copy: string;
}

/** The Trend radar: rising and fading formats, hooks, topics and sounds, built from public top ads and flowd's own settled winners. */
export const selectTrends = defineSelector(["trends", "formats"] as const, (db: Db<"trends" | "formats">, f: TrendFilter | undefined): readonly TrendView[] =>
  valuesOf(db.trends)
    .filter((t) => (!f?.kind || t.kind === f.kind) && (!f?.direction || t.direction === f.direction) && (!f?.category || t.categories.includes(f.category)) && (!f?.niche || t.niches.includes(f.niche)))
    .map((t) => ({ ...t, ...(t.format_id && db.formats[t.format_id] ? { format: db.formats[t.format_id] } : {}), change_copy: `${t.weekly_change_ratio >= 0 ? "+" : "-"}${Math.abs(Math.round(t.weekly_change_ratio * 100))}% a week` }))
    .sort((a, b) => desc(Math.abs(a.weekly_change_ratio), Math.abs(b.weekly_change_ratio))),
);

// ── auctions ───────────────────────────────────────────────────────────────────────────────────

export interface AuctionView extends Omit<Auction, "bids"> {
  creator: Creator;
  /** Bids the signed-in viewer may see: a brand sees only its own while the auction is open; everyone sees all once it closes; Ops sees all. */
  bids: readonly Bid[];
  bids_count: number;
  /** The signed-in brand's bid, if it has one. */
  my_bid?: Bid;
  /** Open for bids now. */
  is_open: boolean;
  hours_left: number | null;
  /** Won by the signed-in brand. */
  won: boolean;
  /** Price paid when awarded. */
  pays_cents?: number;
}

export interface AuctionFilter {
  status?: Auction["status"] | readonly Auction["status"][] | "open" | "closed";
  /** Only auctions the signed-in brand bid on. */
  mine?: boolean;
  /** A creator id or "mine" (the creator's own auctions). */
  creator?: string;
}

type AuctionDb = Db<"auctions" | "creators" | "clock" | "session">;

function auctionView(db: AuctionDb, a: Auction): AuctionView {
  const brandId = db.session.brand_id;
  const closed = a.status === "closed" || a.status === "awarded" || a.status === "no_bids" || a.status === "cancelled";
  const mine = brandId ? a.bids.find((b) => b.brand_id === brandId && b.status !== "withdrawn") : undefined;
  const sees = db.session.persona === "admin" || closed ? a.bids : mine ? [mine] : db.session.persona === "creator" && db.session.creator_id === a.creator_id ? [] : [];
  return {
    ...a,
    creator: db.creators[a.creator_id],
    bids: sees,
    bids_count: a.bids_count,
    ...(mine ? { my_bid: mine } : {}),
    is_open: a.status === "open" && toMs(a.closes_at) > toMs(db.clock.now),
    hours_left: a.status === "open" || a.status === "scheduled" ? Math.max(0, hoursBetween(db.clock.now, a.status === "scheduled" ? a.opens_at : a.closes_at)) : null,
    won: mine?.status === "won",
    ...(mine?.pays_cents !== undefined ? { pays_cents: mine.pays_cents } : {}),
  };
}

/** Auctions. Bids stay sealed: a brand sees its own bid until the auction closes. */
export const selectAuctions = defineSelector(["auctions", "creators", "clock", "session"] as const, (db: AuctionDb, f: AuctionFilter | undefined): readonly AuctionView[] => {
  const filter = f ?? {};
  const creatorId = filter.creator === "mine" ? db.session.creator_id : filter.creator;
  const wanted = filter.status === "open" ? (["open", "scheduled"] as const) : filter.status === "closed" ? (["closed", "awarded", "no_bids", "cancelled"] as const) : asList(filter.status as Auction["status"] | readonly Auction["status"][] | undefined);
  return valuesOf(db.auctions)
    .filter((a) => (!wanted || (wanted as readonly string[]).includes(a.status)) && (!creatorId || a.creator_id === creatorId) && (!filter.mine || a.bids.some((b) => b.brand_id === db.session.brand_id && b.status !== "withdrawn")))
    .map((a) => auctionView(db, a))
    .sort((a, b) => Number(b.is_open) - Number(a.is_open) || asc(a.closes_at, b.closes_at));
});

/** One auction. */
export const selectAuction = defineSelector(["auctions", "creators", "clock", "session"] as const, (db: AuctionDb, id: string | undefined): AuctionView | undefined => {
  const a = id ? db.auctions[id] : undefined;
  return a ? auctionView(db, a) : undefined;
});

// ── the Spec Market ────────────────────────────────────────────────────────────────────────────

export interface SpecView extends Spec {
  creator: Creator;
  format?: Format;
  /** The signed-in brand licenses it already. */
  licensed_by_me: boolean;
  /** The signed-in brand has first refusal (an approved-but-unused video from its own bounty), and for how long. */
  first_refusal_mine: boolean;
  /** Days left of first refusal. */
  first_refusal_days_left: number | null;
  /** What the signed-in brand would pay: the creator's price plus its take rate. */
  brand_price_cents: number | null;
  /** The signed-in brand can license it right now. */
  can_license: boolean;
  /** Why not. */
  blocked_reason?: string;
}

export interface SpecFilter {
  status?: SpecStatus | readonly SpecStatus[] | "available";
  category?: Category;
  format?: FormatId;
  hook_type?: HookType;
  min_flow?: number;
  max_price_cents?: number;
  /** A creator id or "mine" (the creator's own uploads). */
  creator?: string;
  /** Only specs the signed-in brand licenses. */
  licensed_by_me?: boolean;
  /** Only specs the signed-in brand has first refusal on. */
  first_refusal?: boolean;
  q?: string;
  sort?: "flow" | "price" | "newest" | "popular";
}

type SpecDb = Db<"specs" | "creators" | "formats" | "brands" | "clock" | "session">;

function specView(db: SpecDb, s: Spec): SpecView {
  const brandId = db.session.brand_id;
  const brand: Brand | undefined = brandId ? db.brands[brandId] : undefined;
  const take = brand ? ({ free: 0.12, pro: 0.1, scale: 0.08 } as const)[brand.plan] : null;
  const licensed = brandId ? s.licenses.some((l) => l.brand_id === brandId) : false;
  const refusal = s.status === "first_refusal";
  const mineRefusal = refusal && s.source_brand_id === brandId;
  let blocked: string | undefined;
  if (!brand) blocked = "Sign in as a brand to license.";
  else if (licensed) blocked = "You already license this video.";
  else if (refusal && !mineRefusal) blocked = "The brand that approved this video has first refusal for seven days.";
  else if (s.status !== "listed" && s.status !== "first_refusal") blocked = `This spec is ${s.status.replace(/_/g, " ")}.`;
  return {
    ...s,
    creator: db.creators[s.creator_id],
    ...(s.format_id && db.formats[s.format_id] ? { format: db.formats[s.format_id] } : {}),
    licensed_by_me: licensed,
    first_refusal_mine: mineRefusal,
    first_refusal_days_left: refusal && s.first_refusal_ends_at ? Math.max(0, Math.ceil((toMs(s.first_refusal_ends_at) - toMs(db.clock.now)) / 86_400_000)) : null,
    brand_price_cents: take === null ? null : s.price_cents + Math.round(s.price_cents * take),
    can_license: blocked === undefined,
    ...(blocked ? { blocked_reason: blocked } : {}),
  };
}

/** The Spec Market: pre-scored videos a brand can license off the shelf. */
export const selectSpecs = defineSelector(["specs", "creators", "formats", "brands", "clock", "session"] as const, (db: SpecDb, f: SpecFilter | undefined): readonly SpecView[] => {
  const filter = f ?? {};
  const creatorId = filter.creator === "mine" ? db.session.creator_id : filter.creator;
  const wanted = filter.status === "available" ? (["listed", "first_refusal"] as const) : asList(filter.status as SpecStatus | readonly SpecStatus[] | undefined);
  const views = valuesOf(db.specs)
    .filter((s) => {
      if (wanted && !(wanted as readonly string[]).includes(s.status)) return false;
      if (filter.category && s.category !== filter.category) return false;
      if (filter.format && s.format_id !== filter.format) return false;
      if (filter.hook_type && s.hook_type !== filter.hook_type) return false;
      if (filter.min_flow !== undefined && s.flow_points < filter.min_flow) return false;
      if (filter.max_price_cents !== undefined && s.price_cents > filter.max_price_cents) return false;
      if (creatorId && s.creator_id !== creatorId) return false;
      return matchesQuery(filter.q, s.title, s.description, s.hook_text, db.creators[s.creator_id]?.handle);
    })
    .map((s) => specView(db, s))
    .filter((s) => (!filter.licensed_by_me || s.licensed_by_me) && (!filter.first_refusal || s.first_refusal_mine));
  const sort = filter.sort ?? "flow";
  views.sort((a, b) => (sort === "price" ? asc(a.price_cents, b.price_cents) : sort === "newest" ? desc(a.created_at, b.created_at) : sort === "popular" ? desc(a.stats.licenses, b.stats.licenses) : desc(a.flow_points, b.flow_points)));
  return views;
});

/** One spec. */
export const selectSpec = defineSelector(["specs", "creators", "formats", "brands", "clock", "session"] as const, (db: SpecDb, id: string | undefined): SpecView | undefined => {
  const s = id ? db.specs[id] : undefined;
  return s ? specView(db, s) : undefined;
});

/** The category label of an app, for building market links ("market of this app"). */
export const marketCategoryOf = (app: Pick<App, "category">): Category => app.category;
