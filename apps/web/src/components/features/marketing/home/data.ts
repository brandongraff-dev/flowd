import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectFoundingSpots, selectMarketOverview, selectMedianEarnings, selectPromise, selectTicker, selectTrustMetrics, selectWaitlist } from "@/lib/data/selectors";
import type { MarketOverviewRow, MedianEarnings } from "@/lib/data/selectors";
import { valuesOf } from "@/lib/data/select";
import type { ArtSeed } from "@/components/brand/art";
import type { PayoutEvent } from "@/components/shell/payout-ticker";
import type { PromiseMetric } from "@/lib/contract/types";
import { clearingStats } from "@/lib/engine";

/** One category's clearing numbers, flattened for the client islands (no functions, no dates). */
export interface MarketRow extends Pick<MarketOverviewRow, "category" | "label" | "clearing_cpm_cents" | "p25_cpm_cents" | "p75_cpm_cents" | "change_7d" | "trend" | "open_bounties" | "sample_n" | "thin_market"> {
  median_fill_hours: number;
  median_views: number;
}

export interface LessonRow {
  slug: string;
  order: number;
  title: string;
  summary: string;
  readMinutes: number;
}

export interface FormatRow {
  id: string;
  name: string;
  summary: string;
  rank: number;
  /** In the first six formats shipped at MVP. */
  mvp: boolean;
  minSeconds: number;
  maxSeconds: number;
  difficulty: string;
  faceless: boolean;
  /** The beat labels in order ("Hook on your face", "Cut to the app"). */
  beats: string[];
  why: string;
  /** One example hook from the library, filled for a fictional app. */
  sampleHook: string | null;
  art: ArtSeed;
}

export interface MarketingSnapshot {
  /** The demo world's "now": every date on the marketing pages hangs off it, never off the system clock. */
  now: string;
  events: PayoutEvent[];
  paidTodayCents: number;
  paid7dCents: number;
  totalPaidCents: number;
  creatorsPaid: number;
  postsCleared: number;
  median: MedianEarnings;
  promise: readonly PromiseMetric[];
  promiseAsOf: string;
  market: MarketRow[];
  founding: { total: number; taken: number; left: number };
  waitlist: { creators: number; brands: number; total: number; invitesAccepted: number };
  lessons: LessonRow[];
  formats: FormatRow[];
  trust: { firstDollarMedianHours: number; medianDecisionHours: number; asOf: string };
}

const FALLBACK_ART: ArtSeed = { hue_a: 256, hue_b: 210, hue_c: 180, pattern: "orbs", seed: 11 };

/**
 * Everything the marketing pages read from the demo world, loaded once per request on the server so the first paint already has the
 * numbers (no skeleton flash, no client download of the fixtures). Same selectors as the in-app hooks, so a page here and a page in the
 * product always agree. Every figure is a demo-world figure; the pages that show them say so.
 */
export const getMarketingSnapshot = cache(async (): Promise<MarketingSnapshot> => {
  const db = await getServerState();
  const ticker = selectTicker(db);
  const median = selectMedianEarnings(db);
  const promise = selectPromise(db);
  const overview = selectMarketOverview(db);
  const founding = selectFoundingSpots(db);
  const waitlist = selectWaitlist(db);
  const trust = selectTrustMetrics(db);

  const events: PayoutEvent[] = ticker.events
    .filter((event) => event.kind === "payout" && event.handle && event.amount_cents !== undefined)
    .slice(0, 14)
    .map((event) => {
      const creator = event.creator_id ? db.creators[event.creator_id] : undefined;
      const tier = event.tier ? `${event.tier.charAt(0).toUpperCase()}${event.tier.slice(1)} tier` : "Creator";
      return {
        id: event.id,
        handle: `@${event.handle ?? "creator"}`,
        art: creator?.avatar ?? FALLBACK_ART,
        amountCents: event.amount_cents ?? 0,
        app: `${tier}`,
      };
    });

  const series = valuesOf(db.market_series);
  const market: MarketRow[] = overview.map((row) => {
    const stats = clearingStats(series, row.category);
    return {
      category: row.category,
      label: row.label,
      clearing_cpm_cents: row.clearing_cpm_cents,
      p25_cpm_cents: row.p25_cpm_cents,
      p75_cpm_cents: row.p75_cpm_cents,
      change_7d: row.change_7d,
      trend: row.trend,
      open_bounties: row.open_bounties,
      sample_n: row.sample_n,
      thin_market: row.thin_market,
      median_fill_hours: stats.median_fill_hours,
      median_views: stats.median_views,
    };
  });

  const lessons: LessonRow[] = valuesOf(db.lessons)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((lesson) => ({ slug: lesson.slug, order: lesson.order, title: lesson.title, summary: lesson.summary, readMinutes: lesson.read_minutes }));

  const hooks = valuesOf(db.hooks);
  const formats: FormatRow[] = valuesOf(db.formats)
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((format) => ({
      id: format.id,
      name: format.name,
      summary: format.summary,
      rank: format.rank,
      mvp: format.mvp,
      minSeconds: format.min_duration_s,
      maxSeconds: format.max_duration_s,
      difficulty: format.difficulty,
      faceless: format.faceless,
      beats: format.beats.map((beat) => beat.label),
      why: format.why_it_works,
      sampleHook: hooks.find((hook) => hook.applies_to.includes(format.id))?.examples[0]?.text ?? null,
      art: format.art,
    }));

  return {
    now: db.clock.now,
    events,
    paidTodayCents: ticker.totals.paid_today_cents,
    paid7dCents: ticker.totals.paid_7d_cents,
    totalPaidCents: ticker.totals.total_paid_cents,
    creatorsPaid: ticker.totals.creators_paid,
    postsCleared: ticker.totals.posts_cleared,
    median,
    promise: promise.metrics,
    promiseAsOf: promise.as_of,
    market,
    founding: { total: founding.total, taken: founding.taken, left: founding.left },
    waitlist: { creators: waitlist.totals.creators, brands: waitlist.totals.brands, total: waitlist.total, invitesAccepted: waitlist.totals.invites_accepted },
    lessons,
    formats,
    trust: { firstDollarMedianHours: trust.first_dollar_median_hours, medianDecisionHours: trust.median_decision_hours, asOf: trust.as_of },
  };
});
