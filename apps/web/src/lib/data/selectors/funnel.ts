/**
 * The install-to-paid funnel and payback analytics: views to clicks to installs to trials to paid, with Tracked and Estimated kept apart (CPA pays only on
 * Tracked: link and code), cost per stage, ROAS D7 to D90 with maturity, payback day, a creator league ranked by cost per trial, hook and format
 * leaderboards and weekly cohorts.
 */

import type { Conversion, ConversionSource, Creator, FormatId, FunnelCounts, HookType, Platform, Post } from "@/lib/contract/types";
import {
  aggregateFunnelBy,
  coverageLabel,
  dateOf,
  emptyFunnel,
  funnelStats,
  isoWeek,
  revenueByDay,
  splitConversions,
  stepRates,
  sumFunnels,
  toMs,
  type FunnelRow,
  type FunnelStats,
  type KindCounts,
  type Rate,
} from "@/lib/engine";
import { defineSelector, groupBy, joinView, valuesOf, viewCache, type Db } from "../select";
import { mineBrandId } from "./bounties";

export interface FunnelScope {
  /** A brand id, or "mine" for the signed-in brand workspace. */
  brand?: string;
  app?: string;
  bounty?: string;
  /** A creator id, or "mine". */
  creator?: string;
  platform?: Platform;
  hook_type?: HookType;
  format?: FormatId;
  /** Posts posted in the last 7, 30 or 90 days (a posting cohort), or all. Default "all". */
  range?: "7d" | "30d" | "90d" | "all";
}

export interface FunnelStep {
  key: "views" | "clicks" | "installs" | "trials" | "paid";
  label: string;
  value: number;
  /** The rate from the previous step with its honesty attached (null under the minimum sample). */
  rate: Rate | null;
}

export interface LeagueRow extends FunnelRow {
  creator?: Creator;
  /** ROAS at day 30 from tracked revenue (null while conversions load or with no cost). */
  roas_d30: number | null;
}

export interface Cohort {
  /** ISO week the posts were posted ("2026-W39"). */
  week: string;
  posts: number;
  funnel: FunnelCounts;
  cost_cents: number;
  cost_per_trial_cents: number | null;
  roas_d7: number | null;
  roas_d30: number | null;
}

export interface FunnelView {
  /** Heavy tables (conversions, daily metrics) are still loading: counts and costs are ready, ROAS and the source mix are not. */
  loading: boolean;
  posts: number;
  /** Tracked counts and the estimated counts beside them. */
  counts: FunnelCounts;
  steps: readonly FunnelStep[];
  tracked: KindCounts;
  estimated: KindCounts;
  /** The share of installs, trials and paid that are Tracked (link and code): the attribution coverage meter. */
  coverage: { share: number; label: "high" | "medium" | "low" };
  /** Counts by source (link, code, mmp, survey, modelled); null while conversions load. */
  by_source: Record<ConversionSource, KindCounts> | null;
  /** What the brand paid for these posts: creator pay plus platform fee. */
  cost_cents: number;
  /** Cost per stage, ROAS D7 to D90 with maturity and the payback day. Always present; ROAS reads 0 until `roas_ready`. */
  stats: FunnelStats;
  roas_ready: boolean;
  /** Days of revenue data in the youngest and the oldest post: ROAS Dn is final only when the youngest post has n days. */
  observed_days: { min: number; max: number };
  /** Ranked by cost per trial, cheapest first: judge creators on cost per trial, not views. */
  league: readonly LeagueRow[];
  by_hook_type: readonly FunnelRow[];
  by_format: readonly FunnelRow[];
  by_platform: readonly FunnelRow[];
  by_bounty: readonly (FunnelRow & { title?: string })[];
  cohorts: readonly Cohort[];
  /** Daily totals for the trend chart, oldest first (empty while loading). */
  trend: readonly { date: string; views: number; clicks: number; installs: number; trials: number; paid: number }[];
}

type FunnelDb = Db<"posts" | "bounties" | "apps" | "creators" | "ledger" | "conversions" | "post_metrics_daily" | "loaded" | "clock" | "session">;

interface Econ {
  cost_cents: number;
  revenue: readonly number[];
}

const econCache = viewCache<Post, Econ>();

/** What a post cost the brand and what it earned back, day by day from posting (tracked revenue only). */
function economics(db: FunnelDb, post: Post, convs: readonly Conversion[], loaded: boolean): Econ {
  const legs = groupBy(db.ledger, "post", (e) => e.post_id).get(post.id);
  return joinView(econCache, post, [...legs, ...convs, loaded, db.clock.now], () => {
    let cost = 0;
    for (const e of legs) {
      if (e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee")) cost += e.amount_cents;
      else if (e.account === "platform:fees" && e.amount_cents > 0 && e.entry_type === "fee") cost += e.amount_cents;
    }
    const revenue = loaded ? revenueByDay({ batches: convs, posted_on: dateOf(post.posted_at), days: 90, through: dateOf(db.clock.now) }) : [];
    return { cost_cents: cost, revenue };
  });
}

const sumArrays = (arrays: readonly (readonly number[])[]): number[] => {
  const len = Math.max(0, ...arrays.map((a) => a.length));
  const out = Array.from({ length: len }, () => 0);
  for (const a of arrays) for (let i = 0; i < a.length; i += 1) out[i] += a[i];
  return out;
};

const roasAt = (revenue: readonly number[], cost: number, day: number): number | null => (cost > 0 ? Math.round((revenue.slice(0, day).reduce((s, x) => s + x, 0) / cost) * 100) / 100 : null);

const STEP_LABEL: Record<FunnelStep["key"], string> = { views: "Verified views", clicks: "Link clicks and code lookups", installs: "Installs", trials: "Trials started", paid: "Paid conversions" };

/** The funnel for any scope. `useFunnel({ brand: "mine", range: "30d" })`. */
export const selectFunnel = defineSelector(
  ["posts", "bounties", "apps", "creators", "ledger", "conversions", "post_metrics_daily", "loaded", "clock", "session"] as const,
  (db: FunnelDb, scope: FunnelScope | undefined): FunnelView => {
    const s = scope ?? {};
    const brandId = s.brand === "mine" ? mineBrandId(db) : s.brand;
    const creatorId = s.creator === "mine" ? db.session.creator_id : s.creator;
    const loaded = db.loaded.conversions === true && db.loaded.post_metrics_daily === true;
    const now = toMs(db.clock.now);
    const days = s.range === "7d" ? 7 : s.range === "30d" ? 30 : s.range === "90d" ? 90 : null;
    let list: readonly Post[] = valuesOf(db.posts);
    if (s.bounty) list = groupBy(db.posts, "bounty", (p) => p.bounty_id).get(s.bounty);
    else if (creatorId) list = groupBy(db.posts, "creator", (p) => p.creator_id).get(creatorId);
    else if (brandId) list = groupBy(db.posts, "brand", (p) => p.brand_id).get(brandId);
    const posts = list.filter((p) => {
      if (p.status === "removed") return false;
      if (brandId && p.brand_id !== brandId) return false;
      if (creatorId && p.creator_id !== creatorId) return false;
      if (s.app && p.app_id !== s.app) return false;
      if (s.platform && p.platform !== s.platform) return false;
      if (s.hook_type && p.tags.hook_type !== s.hook_type) return false;
      if (s.format && p.tags.format_id !== s.format) return false;
      if (days !== null && toMs(p.posted_at) < now - days * 86_400_000) return false;
      return true;
    });
    const convsOf = (p: Post): readonly Conversion[] => (loaded ? groupBy(db.conversions, "post", (c) => c.post_id).get(p.id) : []);
    const econ = new Map(posts.map((p) => [p.id, economics(db, p, convsOf(p), loaded)] as const));
    const counts = posts.length > 0 ? sumFunnels(posts.map((p) => p.funnel)) : emptyFunnel();
    const cost = posts.reduce((sum, p) => sum + (econ.get(p.id)?.cost_cents ?? 0), 0);
    const revenue = sumArrays(posts.map((p) => econ.get(p.id)?.revenue ?? []));
    const stats = funnelStats({ cost_cents: cost, views: counts.views, clicks: counts.clicks, installs: counts.installs, trials: counts.trials, paid: counts.paid, revenue_by_day_cents: revenue });
    const tracked: KindCounts = { installs: counts.installs, trials: counts.trials, paid: counts.paid };
    const estimated: KindCounts = { installs: counts.est_installs, trials: counts.est_trials, paid: counts.est_paid };
    const total = tracked.installs + tracked.trials + tracked.paid + estimated.installs + estimated.trials + estimated.paid;
    const share = total > 0 ? (tracked.installs + tracked.trials + tracked.paid) / total : 1;
    const rates = stepRates(counts);
    const steps: FunnelStep[] = [
      { key: "views", label: STEP_LABEL.views, value: counts.views, rate: null },
      { key: "clicks", label: STEP_LABEL.clicks, value: counts.clicks, rate: rates.view_to_click },
      { key: "installs", label: STEP_LABEL.installs, value: counts.installs, rate: rates.click_to_install },
      { key: "trials", label: STEP_LABEL.trials, value: counts.trials, rate: rates.install_to_trial },
      { key: "paid", label: STEP_LABEL.paid, value: counts.paid, rate: rates.trial_to_paid },
    ];
    const keyed = posts.map((p) => ({ post: p, funnel: p.funnel, cost_cents: econ.get(p.id)?.cost_cents ?? 0 }));
    const league: LeagueRow[] = aggregateFunnelBy(keyed, (x) => x.post.creator_id).map((row) => {
      const rev = sumArrays(keyed.filter((x) => x.post.creator_id === row.key).map((x) => econ.get(x.post.id)?.revenue ?? []));
      return { ...row, ...(db.creators[row.key] ? { creator: db.creators[row.key] } : {}), roas_d30: loaded ? roasAt(rev, row.cost_cents, 30) : null };
    });
    const byBounty = aggregateFunnelBy(keyed, (x) => x.post.bounty_id).map((row) => ({ ...row, ...(db.bounties[row.key] ? { title: db.bounties[row.key].title } : {}) }));
    const weeks = new Map<string, typeof keyed>();
    for (const x of keyed) {
      const w = isoWeek(x.post.posted_at);
      const list2 = weeks.get(w);
      if (list2) list2.push(x);
      else weeks.set(w, [x]);
    }
    const cohorts: Cohort[] = [...weeks.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week, group]) => {
        const f = sumFunnels(group.map((x) => x.funnel));
        const c = group.reduce((sum, x) => sum + x.cost_cents, 0);
        const rev = sumArrays(group.map((x) => econ.get(x.post.id)?.revenue ?? []));
        return { week, posts: group.length, funnel: f, cost_cents: c, cost_per_trial_cents: f.trials > 0 ? Math.round(c / f.trials) : null, roas_d7: loaded ? roasAt(rev, c, 7) : null, roas_d30: loaded ? roasAt(rev, c, 30) : null };
      });
    const bySource = loaded ? splitConversions(posts.flatMap((p) => convsOf(p))).by_source : null;
    const trendDays = new Map<string, { date: string; views: number; clicks: number; installs: number; trials: number; paid: number }>();
    if (loaded) {
      const inScope = new Set(posts.map((p) => p.id));
      for (const p of posts) {
        for (const d of groupBy(db.post_metrics_daily, "post", (m) => m.post_id).get(p.id)) {
          if (!inScope.has(d.post_id)) continue;
          const row = trendDays.get(d.date) ?? { date: d.date, views: 0, clicks: 0, installs: 0, trials: 0, paid: 0 };
          row.views += d.views;
          row.clicks += d.clicks;
          row.installs += d.installs;
          row.trials += d.trials;
          row.paid += d.paid;
          trendDays.set(d.date, row);
        }
      }
    }
    const ages = posts.map((p) => Math.max(0, Math.floor((now - toMs(p.posted_at)) / 86_400_000) + 1));
    return {
      loading: !loaded,
      posts: posts.length,
      counts,
      steps,
      tracked,
      estimated,
      coverage: { share, label: coverageLabel(share) },
      by_source: bySource,
      cost_cents: cost,
      stats,
      roas_ready: loaded,
      observed_days: { min: ages.length > 0 ? Math.min(...ages) : 0, max: ages.length > 0 ? Math.max(...ages) : 0 },
      league,
      by_hook_type: aggregateFunnelBy(keyed, (x) => x.post.tags.hook_type),
      by_format: aggregateFunnelBy(
        keyed.filter((x) => x.post.tags.format_id),
        (x) => x.post.tags.format_id as string,
      ),
      by_platform: aggregateFunnelBy(keyed, (x) => x.post.platform),
      by_bounty: byBounty,
      cohorts,
      trend: [...trendDays.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  },
  { ensure: ["conversions", "post_metrics_daily"] },
);
