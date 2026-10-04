/**
 * Market view: clearing CPMs, the price-versus-fill-time curve, a suggested CPM, and how crowded a category is.
 *
 * Day-one pricing is a heuristic with its confidence on the face of it, replaced by a regression once enough bounties settle:
 *   p50 fill hours = max(6, H x (clearing_cpm / cpm)^1.6)       p80 = p50 x 1.8
 *   confidence = sample_n / (sample_n + 20) x (1 - min(0.5, |ln(cpm / clearing_cpm)|))
 * H is the category's median fill time at the clearing price. Fewer than 8 comparable bounties is a thin market and says so.
 */

import { CATEGORY_META, type Category, type CurvePoint, type IsoDate, type MarketSeriesPoint } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatHours, formatMoney, formatPercent } from "./money";
import { clamp, clamp01, round2 } from "./stats";
import { addDaysToDate } from "./time";

// ── category baselines ─────────────────────────────────────────────────────────────────────────

/** Per-category defaults used before the market series has enough data, and by the free tools. All fictional demo-world figures. */
export interface CategoryBaseline {
  category: Category;
  label: string;
  /** Median CPM of bounties that filled or are live and receiving submissions. */
  clearing_cpm_cents: number;
  p25_cpm_cents: number;
  p75_cpm_cents: number;
  median_fill_hours: number;
  /** Median verified views per post (7-day trailing). */
  median_views: number;
  /** Trials per install. */
  install_to_trial: number;
  /** Paid per trial. */
  trial_to_paid: number;
  /** Comparable settled bounties behind the numbers. */
  sample_n: number;
}

const base = (category: Category, clearing: number, p25: number, p75: number, fill: number, views: number, i2t: number, t2p: number, n: number): CategoryBaseline => ({
  category,
  label: CATEGORY_META[category].label,
  clearing_cpm_cents: clearing,
  p25_cpm_cents: p25,
  p75_cpm_cents: p75,
  median_fill_hours: fill,
  median_views: views,
  install_to_trial: i2t,
  trial_to_paid: t2p,
  sample_n: n,
});

export const CATEGORY_BASELINES: Readonly<Record<Category, CategoryBaseline>> = {
  ai_photo: base("ai_photo", 240, 190, 310, 31, 15_800, 0.071, 0.352, 38),
  ai_assistant: base("ai_assistant", 260, 200, 340, 36, 13_400, 0.066, 0.331, 26),
  fitness: base("fitness", 190, 150, 250, 28, 17_200, 0.06, 0.368, 31),
  language: base("language", 170, 130, 220, 40, 11_900, 0.058, 0.341, 17),
  productivity: base("productivity", 180, 140, 240, 34, 12_600, 0.055, 0.322, 22),
  finance: base("finance", 230, 180, 300, 44, 10_800, 0.049, 0.309, 14),
  sleep_mind: base("sleep_mind", 160, 120, 210, 29, 14_500, 0.064, 0.347, 19),
  music_audio: base("music_audio", 150, 110, 200, 33, 13_100, 0.057, 0.318, 12),
  lifestyle: base("lifestyle", 140, 100, 190, 26, 16_300, 0.052, 0.326, 20),
};

export const baselineFor = (category: Category): CategoryBaseline => CATEGORY_BASELINES[category];

// ── price versus fill time ─────────────────────────────────────────────────────────────────────

export interface FillTime {
  fill_hours_p50: number;
  fill_hours_p80: number;
  /** 0 to 1. */
  confidence: number;
  /** Fewer than 8 comparable bounties. */
  thin_market: boolean;
}

/**
 * How long a bounty at `cpm_cents` takes to fill, given the category's clearing price and median fill time. Faster for higher prices
 * (exponent 1.6), never faster than 6 hours; confidence falls with a small sample and with distance from the clearing price.
 */
export function fillTime(p: { cpm_cents: number; clearing_cpm_cents: number; median_fill_hours: number; sample_n: number }): FillTime {
  const P = CONSTANTS.pricing_model;
  const cpm = Math.max(1, p.cpm_cents);
  const clearing = Math.max(1, p.clearing_cpm_cents);
  const p50 = Math.max(P.min_fill_hours, p.median_fill_hours * (clearing / cpm) ** P.fill_exponent);
  const distance = Math.min(0.5, Math.abs(Math.log(cpm / clearing)));
  const confidence = round2((p.sample_n / (p.sample_n + P.confidence_k)) * (1 - distance));
  return { fill_hours_p50: round2(p50), fill_hours_p80: round2(p50 * P.p80_multiplier), confidence, thin_market: p.sample_n < P.thin_market_min_sample };
}

/** The price-versus-fill curve: six CPM points at 0.6x, 0.8x, 1.0x, 1.2x, 1.5x and 2.0x of the clearing CPM. */
export function priceCurve(p: { clearing_cpm_cents: number; median_fill_hours: number; sample_n: number }): CurvePoint[] {
  return CONSTANTS.pricing_model.curve_cpm_multipliers.map((m) => {
    const cpm_cents = Math.round(p.clearing_cpm_cents * m);
    const f = fillTime({ cpm_cents, clearing_cpm_cents: p.clearing_cpm_cents, median_fill_hours: p.median_fill_hours, sample_n: p.sample_n });
    return { cpm_cents, fill_hours_p50: f.fill_hours_p50, fill_hours_p80: f.fill_hours_p80, confidence: f.confidence, sample_n: p.sample_n };
  });
}

/** "about 3 days (68% confidence)": the line beside a suggested price. */
export function fillTimeCopy(f: Pick<FillTime, "fill_hours_p50" | "confidence">): string {
  return `about ${formatHours(f.fill_hours_p50)} (${Math.round(f.confidence * 100)}% confidence)`;
}

export type MarketPosition = "below_p25" | "p25_to_median" | "median_to_p75" | "above_p75";

/** Where a CPM sits against the category's quartiles. */
export function marketPosition(cpm_cents: number, q: { p25: number; median: number; p75: number }): MarketPosition {
  if (cpm_cents < q.p25) return "below_p25";
  if (cpm_cents < q.median) return "p25_to_median";
  if (cpm_cents <= q.p75) return "median_to_p75";
  return "above_p75";
}

/**
 * An approximate percentile (5 to 95) of a CPM among the category's bounties, interpolating between the quartiles. For the price slider's
 * "higher than 62% of bounties" caption.
 */
export function cpmPercentile(cpm_cents: number, q: { p25: number; median: number; p75: number }): number {
  if (cpm_cents <= q.p25) return Math.round(clamp(25 * (cpm_cents / Math.max(1, q.p25)), 5, 25));
  if (cpm_cents <= q.median) return Math.round(25 + 25 * ((cpm_cents - q.p25) / Math.max(1, q.median - q.p25)));
  if (cpm_cents <= q.p75) return Math.round(50 + 25 * ((cpm_cents - q.median) / Math.max(1, q.p75 - q.median)));
  return Math.round(clamp(75 + 25 * ((cpm_cents - q.p75) / Math.max(1, q.p75)), 75, 95));
}

export interface SuggestedCpm {
  /** Rounded up to the next $0.05, never under the $0.50 floor. */
  cpm_cents: number;
  fill_hours_p50: number;
  fill_hours_p80: number;
  confidence: number;
  thin_market: boolean;
  position: MarketPosition;
  /** The fill time the suggestion aims at. */
  target_hours: number;
  /** Whether the target is the median fill (p50) or the slow end (p80). */
  aims_at: "p50" | "p80";
  /** One sentence on where the number comes from, with a thin-market warning when it applies. */
  basis: string;
}

/**
 * The CPM that fills a bounty in about `target_fill_hours`: invert the fill curve, p50 = H x (clearing / cpm)^1.6, for cpm, then round up
 * to the next $0.05. `aims_at: "p80"` asks that 4 in 5 bounties fill inside the target instead of half. A target under 6 hours is raised to
 * 6 (the curve never goes faster). The price never goes under the floor or past 3x the clearing price.
 */
export function suggestCpm(p: {
  clearing_cpm_cents: number;
  p25_cpm_cents?: number;
  p75_cpm_cents?: number;
  median_fill_hours: number;
  sample_n: number;
  target_fill_hours: number;
  aims_at?: "p50" | "p80";
  category_label?: string;
}): SuggestedCpm {
  const P = CONSTANTS.pricing_model;
  const aims_at = p.aims_at ?? "p50";
  const requested = aims_at === "p80" ? p.target_fill_hours / P.p80_multiplier : p.target_fill_hours;
  const p50Target = Math.max(P.min_fill_hours, requested);
  const raw = p.clearing_cpm_cents * (p.median_fill_hours / p50Target) ** (1 / P.fill_exponent);
  const stepped = Math.ceil(raw / 5 - 1e-9) * 5;
  const cpm_cents = clamp(stepped, CONSTANTS.pay.floor_cpm_cents, Math.round(p.clearing_cpm_cents * 3));
  const f = fillTime({ cpm_cents, clearing_cpm_cents: p.clearing_cpm_cents, median_fill_hours: p.median_fill_hours, sample_n: p.sample_n });
  const q = { p25: p.p25_cpm_cents ?? Math.round(p.clearing_cpm_cents * 0.8), median: p.clearing_cpm_cents, p75: p.p75_cpm_cents ?? Math.round(p.clearing_cpm_cents * 1.3) };
  const where = p.category_label ? ` in ${p.category_label}` : "";
  const basis = f.thin_market
    ? `Only ${p.sample_n} comparable bounties${where}, so treat this as a rough guide. The median clearing CPM is ${formatMoney(p.clearing_cpm_cents)}.`
    : `Based on ${p.sample_n} comparable bounties${where}. The median clearing CPM is ${formatMoney(p.clearing_cpm_cents)}.`;
  return {
    cpm_cents,
    fill_hours_p50: f.fill_hours_p50,
    fill_hours_p80: f.fill_hours_p80,
    confidence: f.confidence,
    thin_market: f.thin_market,
    position: marketPosition(cpm_cents, q),
    target_hours: p.target_fill_hours,
    aims_at,
    basis,
  };
}

// ── clearing CPM statistics ────────────────────────────────────────────────────────────────────

export type MarketTrend = "rising" | "steady" | "falling";

export interface ClearingStats {
  category: Category;
  date: IsoDate;
  clearing_cpm_cents: number;
  p25_cpm_cents: number;
  p75_cpm_cents: number;
  open_bounties: number;
  open_budget_cents: number;
  new_bounties: number;
  submissions: number;
  median_fill_hours: number;
  median_views: number;
  trial_rate: number;
  sample_n: number;
  /** Change of the clearing CPM over 7 days, as a ratio (0.05 = +5%). 0 with too little history. */
  change_7d: number;
  change_30d: number;
  trend: MarketTrend;
  /** The clearing CPM per day, oldest first, for the chart. */
  series: { date: IsoDate; value: number }[];
  /** True when the numbers come from the category baseline, not the live series. */
  from_baseline: boolean;
}

/** A change under 3% over a week reads as steady. */
const STEADY_BAND = 0.03;

/**
 * Clearing-CPM statistics for a category from the daily market series: the latest day, the 7- and 30-day change, the trend and the series for
 * the chart. With no series, the category baseline stands in (flagged `from_baseline`).
 */
export function clearingStats(points: readonly MarketSeriesPoint[], category: Category): ClearingStats {
  const rows = points.filter((p) => p.category === category).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (rows.length === 0) {
    const b = baselineFor(category);
    return {
      category,
      date: "",
      clearing_cpm_cents: b.clearing_cpm_cents,
      p25_cpm_cents: b.p25_cpm_cents,
      p75_cpm_cents: b.p75_cpm_cents,
      open_bounties: 0,
      open_budget_cents: 0,
      new_bounties: 0,
      submissions: 0,
      median_fill_hours: b.median_fill_hours,
      median_views: b.median_views,
      trial_rate: b.install_to_trial,
      sample_n: b.sample_n,
      change_7d: 0,
      change_30d: 0,
      trend: "steady",
      series: [],
      from_baseline: true,
    };
  }
  const latest = rows[rows.length - 1];
  const at = (daysBack: number): MarketSeriesPoint | undefined => {
    const target = addDaysToDate(latest.date, -daysBack);
    return [...rows].reverse().find((r) => r.date <= target);
  };
  const change = (daysBack: number): number => {
    const prev = at(daysBack);
    return prev && prev.clearing_cpm_cents > 0 ? round2((latest.clearing_cpm_cents - prev.clearing_cpm_cents) / prev.clearing_cpm_cents) : 0;
  };
  const change_7d = change(7);
  return {
    category,
    date: latest.date,
    clearing_cpm_cents: latest.clearing_cpm_cents,
    p25_cpm_cents: latest.p25_cpm_cents,
    p75_cpm_cents: latest.p75_cpm_cents,
    open_bounties: latest.open_bounties,
    open_budget_cents: latest.open_budget_cents,
    new_bounties: latest.new_bounties,
    submissions: latest.submissions,
    median_fill_hours: latest.median_fill_hours,
    median_views: latest.median_views,
    trial_rate: latest.trial_rate,
    sample_n: latest.sample_n,
    change_7d,
    change_30d: change(30),
    trend: change_7d >= STEADY_BAND ? "rising" : change_7d <= -STEADY_BAND ? "falling" : "steady",
    series: rows.map((r) => ({ date: r.date, value: r.clearing_cpm_cents })),
    from_baseline: false,
  };
}

/** The price-vs-fill curve for a category at its latest clearing price. */
export const categoryPriceCurve = (stats: Pick<ClearingStats, "clearing_cpm_cents" | "median_fill_hours" | "sample_n">): CurvePoint[] =>
  priceCurve({ clearing_cpm_cents: stats.clearing_cpm_cents, median_fill_hours: stats.median_fill_hours, sample_n: stats.sample_n });

// ── competition heat ───────────────────────────────────────────────────────────────────────────

export type HeatLevel = "cool" | "warm" | "hot";

export interface CompetitionHeat {
  /** 0 to 100. */
  score: number;
  level: HeatLevel;
  /** Days of creator submissions it would take to absorb the open budget. */
  budget_cover_days: number;
  /** Open bounties per 100 daily submissions. */
  bounties_per_100_submissions: number;
  /** One line for brands: what it means for filling a bounty. */
  for_brands: string;
  /** One line for creators: what it means for finding work. */
  for_creators: string;
}

/**
 * How crowded a category is, from a market-series day. Heat = the open budget measured in days of the category's creator supply: submissions per day
 * x the typical pay per post (clearing CPM x median views). Over about two weeks of supply is hot (brands compete for creators, prices rise);
 * under a few days is cool (creators compete for bounties). A transparent heuristic, not a forecast.
 */
export function competitionHeat(p: Pick<MarketSeriesPoint, "open_bounties" | "open_budget_cents" | "submissions" | "clearing_cpm_cents" | "median_views">): CompetitionHeat {
  const typicalPay = Math.max(1, (p.clearing_cpm_cents * p.median_views) / 1000);
  const dailySupply = Math.max(1, p.submissions) * typicalPay;
  const cover = p.open_budget_cents / dailySupply;
  const score = Math.round(clamp01(cover / 14) * 100);
  const level: HeatLevel = score < 35 ? "cool" : score < 65 ? "warm" : "hot";
  const per100 = p.submissions > 0 ? Math.round((p.open_bounties / p.submissions) * 100) : p.open_bounties > 0 ? 100 : 0;
  const coverText = `${round2(cover)} days`;
  const for_brands =
    level === "hot"
      ? `Open bounties hold about ${coverText} of creator supply. Expect slower fills at the median price; a higher CPM moves you up the queue.`
      : level === "warm"
        ? `Open bounties hold about ${coverText} of creator supply. The market price fills at a normal pace.`
        : `Open bounties hold only about ${coverText} of creator supply. Creators have room: the median price should fill quickly.`;
  const for_creators = level === "hot" ? "Plenty of money per creator right now. Good week to submit." : level === "warm" ? "A steady flow of bounties." : "Fewer bounties than creators. Pick the brief you are best at.";
  return { score, level, budget_cover_days: round2(cover), bounties_per_100_submissions: per100, for_brands, for_creators };
}

/** "+5% this week" / "-3% this week" / "steady this week". */
export function trendCopy(change_7d: number): string {
  if (Math.abs(change_7d) < STEADY_BAND) return "steady this week";
  return `${change_7d > 0 ? "+" : "-"}${formatPercent(Math.abs(change_7d), 0)} this week`;
}
