import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectMarket, selectMedianEarnings, selectTicker, type MedianEarnings } from "@/lib/data/selectors";
import { CATEGORIES, CATEGORY_META, HOOK_TYPE_META, type BountyType, type Category } from "@/lib/contract/types";
import type { ArtSeed } from "@/components/brand/art";
import type { PayoutEvent } from "@/components/shell/payout-ticker";

/** One open, funded bounty as the public market shows it: a row, not the whole bounty. */
export interface MarketBounty {
  id: string;
  title: string;
  appName: string;
  appArt: ArtSeed;
  brandName: string;
  brandVerified: boolean;
  type: BountyType;
  typeLabel: string;
  cpmCents: number;
  cpaInstallCents: number;
  cpaTrialCents: number;
  cpaPaidCents: number;
  perVideoCapCents: number;
  spotsLeft: number;
  /** Share of the pool spent or reserved, 0 to 1. */
  fillRatio: number;
  budgetLeftCents: number;
  hoursLeft: number;
  /** "Decides in about 11 h", from the brand's Scorecard, or null for a brand with too little history. */
  decidesIn: string | null;
  platformFunded: boolean;
}

export interface MarketHook {
  type: string;
  label: string;
  /** Trials per install on settled posts, or null when there are too few installs to say. */
  trialRate: number | null;
  posts: number;
}

export interface MarketCategory {
  category: Category;
  label: string;
  clearingCents: number;
  p25Cents: number;
  p75Cents: number;
  change7d: number;
  change30d: number;
  trend: "rising" | "steady" | "falling";
  /** ISO date of the latest data point. */
  asOf: string;
  /** Fewer than 8 comparable bounties: the page says "few trades". */
  thin: boolean;
  sampleN: number;
  medianFillHours: number;
  medianViews: number;
  /** Daily points, oldest first: ISO date, p25, median, p75 (cents per 1,000 verified views). */
  series: ReadonlyArray<{ date: string; p25: number; median: number; p75: number }>;
  supply: { creators: number; openBounties: number; openBudgetCents: number; submissions7d: number };
  heat: { level: "cool" | "warm" | "hot"; forBrands: string; forCreators: string; coverDays: number };
  bounties: readonly MarketBounty[];
  hooks: readonly MarketHook[];
}

export interface MarketPageData {
  now: string;
  categories: readonly MarketCategory[];
  ticker: { events: PayoutEvent[]; paidTodayCents: number; paid7dCents: number; creatorsPaid: number };
  median: Pick<MedianEarnings, "typical_cents" | "p25_cents" | "p75_cents" | "top_decile_cents" | "active_creators_30d" | "period">;
}

const FALLBACK_ART: ArtSeed = { hue_a: 256, hue_b: 210, hue_c: 180, pattern: "orbs", seed: 11 };
const SERIES_DAYS = 60;

/** Everything `/market` shows, read once per request on the server from the same selectors the brand's Market view uses. */
export const getMarketData = cache(async (): Promise<MarketPageData> => {
  const db = await getServerState();
  const ticker = selectTicker(db);
  const median = selectMedianEarnings(db);

  const categories: MarketCategory[] = CATEGORIES.map((category) => {
    const view = selectMarket(db, category);
    if (!view) throw new Error(`No market for ${category}`);
    const { stats } = view;
    return {
      category,
      label: CATEGORY_META[category].label,
      clearingCents: stats.clearing_cpm_cents,
      p25Cents: stats.p25_cpm_cents,
      p75Cents: stats.p75_cpm_cents,
      change7d: stats.change_7d,
      change30d: stats.change_30d,
      trend: stats.trend,
      asOf: view.as_of,
      thin: view.thin_market,
      sampleN: stats.sample_n,
      medianFillHours: stats.median_fill_hours,
      medianViews: stats.median_views,
      series: view.series.slice(-SERIES_DAYS).map((point) => ({ date: point.date, p25: point.p25_cpm_cents, median: point.clearing_cpm_cents, p75: point.p75_cpm_cents })),
      supply: { creators: view.supply.creators_in_category, openBounties: view.supply.open_bounties, openBudgetCents: view.supply.open_budget_cents, submissions7d: view.supply.submissions_7d },
      heat: { level: view.heat.level, forBrands: view.heat.for_brands, forCreators: view.heat.for_creators, coverDays: view.heat.budget_cover_days },
      bounties: view.open_bounties.slice(0, 4).map((bounty) => ({
        id: bounty.id,
        title: bounty.title,
        appName: bounty.app.name,
        appArt: bounty.app.icon,
        brandName: bounty.brand.name,
        brandVerified: bounty.brand.verification === "verified",
        type: bounty.type,
        typeLabel: bounty.type_label,
        cpmCents: bounty.cpm_cents,
        cpaInstallCents: bounty.cpa_install_cents,
        cpaTrialCents: bounty.cpa_trial_cents,
        cpaPaidCents: bounty.cpa_paid_cents,
        perVideoCapCents: bounty.per_video_cap_cents,
        spotsLeft: bounty.spots_left,
        fillRatio: bounty.fill_ratio,
        budgetLeftCents: bounty.budget_left_cents,
        hoursLeft: bounty.hours_left,
        decidesIn: bounty.decides_in,
        platformFunded: bounty.platform_funded,
      })),
      hooks: view.top_hooks.slice(0, 5).map((hook) => ({ type: hook.hook_type, label: HOOK_TYPE_META[hook.hook_type].label, trialRate: hook.trial_rate, posts: hook.posts })),
    };
  });

  const events: PayoutEvent[] = ticker.events
    .filter((event) => event.kind === "payout" && event.handle && event.amount_cents !== undefined)
    .slice(0, 14)
    .map((event) => {
      const creator = event.creator_id ? db.creators[event.creator_id] : undefined;
      const tier = event.tier ? `${event.tier.charAt(0).toUpperCase()}${event.tier.slice(1)} tier` : "Creator";
      return { id: event.id, handle: `@${event.handle ?? "creator"}`, art: creator?.avatar ?? FALLBACK_ART, amountCents: event.amount_cents ?? 0, app: tier };
    });

  return {
    now: db.clock.now,
    categories,
    ticker: { events, paidTodayCents: ticker.totals.paid_today_cents, paid7dCents: ticker.totals.paid_7d_cents, creatorsPaid: ticker.totals.creators_paid },
    median: { typical_cents: median.typical_cents, p25_cents: median.p25_cents, p75_cents: median.p75_cents, top_decile_cents: median.top_decile_cents, active_creators_30d: median.active_creators_30d, period: median.period },
  };
});
