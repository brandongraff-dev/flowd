/**
 * The brand overview: five KPI tiles with a signed delta against the previous period and a 12-point spark, what needs the brand now, spend pacing,
 * the funnel in miniature, live bounties with fill and burn, the market pulse, activity and the next best actions.
 */

import { addDaysToDate, dateOf, dateRange, toMs } from "@/lib/engine";
import type { StateKey } from "@/lib/store/state";
import { defineSelector, groupBy, mergeKeys, valuesOf, type Db, type DbOf } from "../select";
import type { BountyView } from "./bounties";
import { selectBounties } from "./bounties";
import { selectFunnel, type FunnelView } from "./funnel";
import { selectMarket, type MarketView } from "./market";
import { selectReviewQueue } from "./submissions";
import { selectDisputes, selectRightsVault } from "./trust";
import { selectPromotions } from "./growth";
import { selectActivityLog, type ActivityRow } from "./workspace";

export type OverviewRange = "7d" | "30d" | "90d";

export interface KpiTile {
  key: "spend" | "views" | "installs" | "trials" | "cost_per_trial";
  label: string;
  /** Cents for spend and cost per trial, a count for the rest. */
  value: number;
  unit: "cents" | "count";
  /** The same measure over the previous period. */
  previous: number;
  /** Signed change against the previous period as a ratio (0.12 = +12%). Null when the previous period was zero. */
  delta: number | null;
  /** "vs the previous 30 days". */
  delta_label: string;
  /** Twelve points across the period, oldest first. */
  spark: readonly number[];
  /** For cost per trial a falling number is good: the page uses neutral ink and arrows, never red or green. */
  lower_is_better: boolean;
}

export interface NeedsItem {
  id: string;
  kind: "review" | "sla" | "dispute" | "rights" | "funding" | "fatigue" | "promotion" | "qa";
  title: string;
  detail: string;
  href: string;
  /** 1 is most urgent. */
  priority: number;
}

export interface NextAction {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface BrandOverview {
  /** The daily app metrics are still loading: the tiles read zero until they arrive. */
  loading: boolean;
  range: OverviewRange;
  tiles: readonly KpiTile[];
  needs: { waiting: number; oldest_hours: number | null; stale: number; breached: number; disputes: number; rights_expiring: number; items: readonly NeedsItem[] };
  pacing: { budget_cents: number; spent_cents: number; reserved_cents: number; burn_ratio: number; live_bounties: number; time_ratio: number; pace: "ahead" | "on_track" | "behind" | null };
  funnel: FunnelView | null;
  live_bounties: readonly (BountyView & { burn: { fill: number; time: number; pace: "ahead" | "on_track" | "behind" } })[];
  market?: Pick<MarketView, "category" | "label" | "stats" | "trend_copy" | "heat" | "thin_market">;
  activity: readonly ActivityRow[];
  next_actions: readonly NextAction[];
  /** The first-run checklist for a brand with nothing live yet. */
  checklist: readonly { id: "connect" | "fund" | "brief"; label: string; done: boolean; href: string }[];
  is_new: boolean;
}

const DAYS: Record<OverviewRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

type OverviewDb = Db<"app_metrics_daily" | "loaded"> & DbOf<typeof selectReviewQueue> & DbOf<typeof selectDisputes> & DbOf<typeof selectRightsVault> & DbOf<typeof selectPromotions> & DbOf<typeof selectBounties> & DbOf<typeof selectFunnel> & DbOf<typeof selectMarket> & DbOf<typeof selectActivityLog> & Db<"integrations" | "apps" | "bounties" | "brands">;

const KEYS = mergeKeys<keyof OverviewDb & StateKey>(["app_metrics_daily", "loaded", "integrations", "apps", "bounties", "brands"], selectReviewQueue.keys, selectDisputes.keys, selectRightsVault.keys, selectPromotions.keys, selectBounties.keys, selectFunnel.keys, selectMarket.keys, selectActivityLog.keys);

/** Splits a period into 12 buckets and sums a per-day value into each. */
function spark(days: readonly string[], by: Map<string, number>): number[] {
  const out = Array.from({ length: 12 }, () => 0);
  days.forEach((d, i) => {
    out[Math.min(11, Math.floor((i * 12) / days.length))] += by.get(d) ?? 0;
  });
  return out;
}

const pace = (fill: number, time: number): "ahead" | "on_track" | "behind" => (fill > time + 0.15 ? "ahead" : fill < time - 0.15 ? "behind" : "on_track");

export const selectBrandOverview = defineSelector(
  KEYS,
  (db: OverviewDb, arg: { range?: OverviewRange; brand?: string } | undefined): BrandOverview => {
    const range = arg?.range ?? "30d";
    const n = DAYS[range];
    const brandId = arg?.brand === undefined || arg.brand === "mine" ? db.session.brand_id : arg.brand;
    const loading = db.loaded.app_metrics_daily !== true;
    const today = dateOf(db.clock.now);
    const cur = dateRange(addDaysToDate(today, -(n - 1)), today);
    const prev = dateRange(addDaysToDate(today, -(2 * n - 1)), addDaysToDate(today, -n));
    const apps = brandId ? groupBy(db.apps, "brand", (a) => a.brand_id).get(brandId) : [];
    const appIds = new Set(apps.map((a) => a.id));
    const rows = loading ? [] : valuesOf(db.app_metrics_daily).filter((r) => appIds.has(r.app_id));
    const perDay = (pick: (r: (typeof rows)[number]) => number): Map<string, number> => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + pick(r));
      return m;
    };
    const spend = perDay((r) => r.creator_pay_cents + r.fee_cents);
    const views = perDay((r) => r.views);
    const installs = perDay((r) => r.installs);
    const trials = perDay((r) => r.trials);
    const total = (m: Map<string, number>, days: readonly string[]): number => days.reduce((s, d) => s + (m.get(d) ?? 0), 0);
    const delta = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 1000) / 1000 : null);
    const label = `vs the previous ${n} days`;
    const cpt = (days: readonly string[]): number => (total(trials, days) > 0 ? Math.round(total(spend, days) / total(trials, days)) : 0);
    const tile = (key: KpiTile["key"], l: string, unit: KpiTile["unit"], m: Map<string, number>, lower = false): KpiTile => ({ key, label: l, value: total(m, cur), unit, previous: total(m, prev), delta: delta(total(m, cur), total(m, prev)), delta_label: label, spark: spark(cur, m), lower_is_better: lower });
    const cptSpark = (days: readonly string[]): number[] => Array.from({ length: 12 }, (_, i) => cpt(days.slice(i * Math.ceil(days.length / 12), (i + 1) * Math.ceil(days.length / 12))));
    const tiles: KpiTile[] = [
      tile("spend", "Spend", "cents", spend),
      tile("views", "Verified views", "count", views),
      tile("installs", "Installs", "count", installs),
      tile("trials", "Trials", "count", trials),
      { key: "cost_per_trial", label: "Cost per trial", value: cpt(cur), unit: "cents", previous: cpt(prev), delta: delta(cpt(cur), cpt(prev)), delta_label: label, spark: cptSpark(cur), lower_is_better: true },
    ];

    const queue = selectReviewQueue(db, { brand: "mine" });
    const disputes = selectDisputes(db, { status: "open" });
    const vault = selectRightsVault(db, "mine");
    const promo = selectPromotions(db, "mine");
    const wallet = brandId ? db.brands[brandId]?.wallet_balance_cents ?? 0 : 0;
    const mine = brandId ? groupBy(db.bounties, "brand", (b) => b.brand_id).get(brandId) : [];
    const live = selectBounties(db, { brand: "mine", status: "active", sort: "fill", limit: 8 });
    const needsItems: NeedsItem[] = [];
    if (queue.counts.breached > 0) needsItems.push({ id: "sla-breached", kind: "sla", title: `${queue.counts.breached} ${queue.counts.breached === 1 ? "video is" : "videos are"} past the 72-hour promise`, detail: "Decide now: every day over lowers your Brand Scorecard.", href: "/brand/review?filter=breached", priority: 1 });
    if (queue.counts.stale > 0) needsItems.push({ id: "sla-stale", kind: "sla", title: `${queue.counts.stale} ${queue.counts.stale === 1 ? "video has" : "videos have"} waited over 48 hours`, detail: "They breach at 72 hours.", href: "/brand/review?filter=stale", priority: 2 });
    if (queue.counts.waiting > 0) needsItems.push({ id: "review", kind: "review", title: `${queue.counts.waiting} ${queue.counts.waiting === 1 ? "video is" : "videos are"} waiting for a decision`, detail: queue.counts.oldest_hours !== null ? `The oldest has waited ${Math.round(queue.counts.oldest_hours)} hours.` : "", href: "/brand/review", priority: 3 });
    if (queue.counts.qa_flagged > 0) needsItems.push({ id: "qa", kind: "qa", title: `${queue.counts.qa_flagged} with QA flags`, detail: "Missing disclosure, a banned claim or a duplicate.", href: "/brand/review?filter=qa_fail", priority: 4 });
    if (disputes.length > 0) needsItems.push({ id: "disputes", kind: "dispute", title: `${disputes.length} open ${disputes.length === 1 ? "dispute" : "disputes"}`, detail: "A person at flowd decides within five days; your evidence helps.", href: "/brand/disputes", priority: 3 });
    if (vault.counts.expiring_30 > 0) needsItems.push({ id: "rights", kind: "rights", title: `${vault.counts.expiring_30} ${vault.counts.expiring_30 === 1 ? "licence ends" : "licences end"} within 30 days`, detail: "Renew before an ad stops.", href: "/brand/rights", priority: 5 });
    const awaiting = mine.filter((b) => b.status === "awaiting_funding");
    if (awaiting.length > 0) needsItems.push({ id: "funding", kind: "funding", title: `${awaiting.length} ${awaiting.length === 1 ? "bounty needs" : "bounties need"} funding to go live`, detail: "Nothing goes live until it is fully escrowed.", href: `/brand/bounties/${awaiting[0].id}`, priority: 2 });
    if (promo.fatigue.length > 0) needsItems.push({ id: "fatigue", kind: "fatigue", title: `${promo.fatigue.length} ${promo.fatigue.length === 1 ? "winner is" : "winners are"} tiring`, detail: "Trial rate fell 30% from its peak. Commission fresh hooks.", href: "/brand/promote", priority: 6 });
    needsItems.sort((a, b) => a.priority - b.priority);

    const liveRows = mine.filter((b) => b.status === "live" || b.status === "filled" || b.status === "paused");
    const budget = liveRows.reduce((s, b) => s + b.escrow_funded_cents, 0);
    const spent = liveRows.reduce((s, b) => s + b.spent_cents, 0);
    const reserved = liveRows.reduce((s, b) => s + b.reserved_cents, 0);
    const timeRatio = liveRows.length > 0 ? liveRows.reduce((s, b) => s + Math.min(1, Math.max(0, (toMs(db.clock.now) - toMs(b.starts_at)) / Math.max(1, toMs(b.ends_at) - toMs(b.starts_at)))), 0) / liveRows.length : 0;
    const burn = budget > 0 ? (spent + reserved) / budget : 0;
    const category = apps.find((a) => a.id === db.session.app_id)?.category ?? apps[0]?.category;
    const m = category ? selectMarket(db, category) : undefined;
    const funnel = brandId ? selectFunnel(db, { brand: "mine", range }) : null;
    const rcConnected = apps.some((a) => groupBy(db.integrations, "app", (i) => i.app_id).get(a.id).some((i) => i.kind === "revenuecat" && i.status === "connected"));
    const everFunded = mine.some((b) => b.funded);
    const hasBriefs = mine.length > 0;
    const nextActions: NextAction[] = [];
    if (!rcConnected) nextActions.push({ id: "connect", title: "Connect RevenueCat", detail: "Without it, trials and paid conversions cannot be tied to creators, so CPA cannot pay.", href: "/brand/attribution" });
    if (mine.some((b) => b.status === "draft")) nextActions.push({ id: "draft", title: "Finish your draft bounty", detail: "Brief Lint tells you what blocks publishing, with a one-line fix each.", href: `/brand/bounties/${mine.find((b) => b.status === "draft")?.id}` });
    if (wallet < 50_000 && everFunded) nextActions.push({ id: "wallet", title: "Top up the wallet", detail: "A bounty funds from the wallet; keep enough for the next one.", href: "/brand/wallet" });
    if (queue.counts.waiting > 0) nextActions.push({ id: "queue", title: "Clear the review queue", detail: "Keyboard first: J and K to move, A to approve.", href: "/brand/review" });
    if (live.length === 0) nextActions.push({ id: "launch", title: "Launch a bounty", detail: "Fund a pool and let creators compete for it.", href: "/brand/bounties/new" });
    if (promo.eligible.some((e) => e.eligible && e.post.is_winner)) nextActions.push({ id: "promote", title: "Promote a winner", detail: "A post that cleared and wins on trial rate can run as a Spark or partnership ad.", href: "/brand/promote" });
    return {
      loading,
      range,
      tiles,
      needs: { waiting: queue.counts.waiting, oldest_hours: queue.counts.oldest_hours, stale: queue.counts.stale, breached: queue.counts.breached, disputes: disputes.length, rights_expiring: vault.counts.expiring_30, items: needsItems },
      pacing: { budget_cents: budget, spent_cents: spent, reserved_cents: reserved, burn_ratio: Math.round(burn * 1000) / 1000, live_bounties: liveRows.length, time_ratio: Math.round(timeRatio * 1000) / 1000, pace: liveRows.length > 0 ? pace(burn, timeRatio) : null },
      funnel,
      live_bounties: live.map((b) => ({ ...b, burn: { fill: b.fill_ratio, time: Math.min(1, Math.max(0, (toMs(db.clock.now) - toMs(b.starts_at)) / Math.max(1, toMs(b.ends_at) - toMs(b.starts_at)))), pace: pace(b.fill_ratio, Math.min(1, Math.max(0, (toMs(db.clock.now) - toMs(b.starts_at)) / Math.max(1, toMs(b.ends_at) - toMs(b.starts_at))))) } })),
      ...(m ? { market: { category: m.category, label: m.label, stats: m.stats, trend_copy: m.trend_copy, heat: m.heat, thin_market: m.thin_market } } : {}),
      activity: selectActivityLog(db, { limit: 8 }),
      next_actions: nextActions.slice(0, 4),
      checklist: [
        { id: "connect", label: "Connect your app and RevenueCat", done: rcConnected, href: "/brand/onboarding" },
        { id: "fund", label: "Fund your wallet", done: everFunded || wallet > 0, href: "/brand/wallet" },
        { id: "brief", label: "Write your first brief", done: hasBriefs, href: "/brand/bounties/new" },
      ],
      is_new: !mine.some((b) => b.status === "live" || b.status === "settled" || b.status === "filled" || b.status === "ended"),
    };
  },
  { ensure: ["app_metrics_daily", "conversions", "post_metrics_daily"] },
);

