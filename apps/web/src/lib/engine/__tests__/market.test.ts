import { describe, expect, it } from "vitest";
import { CATEGORIES, type MarketSeriesPoint } from "@/lib/contract/types";
import {
  CATEGORY_BASELINES,
  baselineFor,
  categoryPriceCurve,
  clearingStats,
  competitionHeat,
  cpmPercentile,
  fillTime,
  fillTimeCopy,
  marketPosition,
  priceCurve,
  suggestCpm,
  trendCopy,
} from "../market";

const Q = { p25: 190, median: 240, p75: 310 };

describe("price vs fill time (DOMAIN worked example: AI photo & video, clearing $2.40, median fill 31 h, 38 bounties)", () => {
  const curve = priceCurve({ clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38 });

  it("has six points at 0.6x to 2.0x of the clearing CPM", () => {
    expect(curve.map((p) => p.cpm_cents)).toEqual([144, 192, 240, 288, 360, 480]);
    expect(curve.every((p) => p.sample_n === 38)).toBe(true);
  });

  it("matches the documented fill times and confidence", () => {
    expect(curve.map((p) => [p.fill_hours_p50, p.fill_hours_p80, p.confidence])).toEqual([
      [70.2, 126.35, 0.33],
      [44.3, 79.74, 0.51],
      [31, 55.8, 0.66],
      [23.16, 41.68, 0.54],
      [16.2, 29.17, 0.39],
      [10.23, 18.41, 0.33],
    ]);
  });

  it("fills faster at higher prices, with p80 always 1.8x p50", () => {
    for (let i = 1; i < curve.length; i += 1) expect(curve[i].fill_hours_p50).toBeLessThan(curve[i - 1].fill_hours_p50);
    for (const p of curve) expect(p.fill_hours_p80).toBeCloseTo(p.fill_hours_p50 * 1.8, 1);
  });

  it("is most confident at the clearing price", () => {
    const best = [...curve].sort((a, b) => b.confidence - a.confidence)[0];
    expect(best.cpm_cents).toBe(240);
  });

  it("flags a thin market under 8 comparable bounties (vector: clearing $1.70, 52 h, 6 bounties)", () => {
    const thin = fillTime({ cpm_cents: 170, clearing_cpm_cents: 170, median_fill_hours: 52, sample_n: 6 });
    expect(thin.thin_market).toBe(true);
    expect(thin.confidence).toBe(0.23);
    expect(fillTime({ cpm_cents: 170, clearing_cpm_cents: 170, median_fill_hours: 52, sample_n: 8 }).thin_market).toBe(false);
  });

  it("never fills faster than 6 hours and survives a zero price", () => {
    expect(fillTime({ cpm_cents: 5000, clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38 }).fill_hours_p50).toBe(6);
    const zero = fillTime({ cpm_cents: 0, clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38 });
    expect(Number.isFinite(zero.fill_hours_p50)).toBe(true);
  });

  it("writes the line beside a suggested price", () => {
    expect(fillTimeCopy({ fill_hours_p50: 31, confidence: 0.66 })).toBe("about 31 h (66% confidence)");
    expect(fillTimeCopy({ fill_hours_p50: 70.2, confidence: 0.33 })).toBe("about 3 days (33% confidence)");
  });
});

describe("quartile position", () => {
  it("places a CPM against the quartiles", () => {
    expect([100, 189, 190, 239, 240, 310, 311].map((c) => marketPosition(c, Q))).toEqual(["below_p25", "below_p25", "p25_to_median", "p25_to_median", "median_to_p75", "median_to_p75", "above_p75"]);
  });

  it("estimates a percentile between the quartiles", () => {
    expect(cpmPercentile(240, Q)).toBe(50);
    expect(cpmPercentile(190, Q)).toBe(25);
    expect(cpmPercentile(310, Q)).toBe(75);
    expect(cpmPercentile(215, Q)).toBe(38); // halfway p25 to median
    expect(cpmPercentile(95, Q)).toBe(13);
    expect(cpmPercentile(1000, Q)).toBe(95);
    expect(cpmPercentile(1, Q)).toBe(5);
  });
});

describe("suggested CPM", () => {
  const base = { clearing_cpm_cents: 240, p25_cpm_cents: 190, p75_cpm_cents: 310, median_fill_hours: 31, sample_n: 38, category_label: "AI photo & video" };

  it("suggests the clearing price to fill at the median speed", () => {
    const s = suggestCpm({ ...base, target_fill_hours: 31 });
    expect(s).toMatchObject({ cpm_cents: 240, fill_hours_p50: 31, confidence: 0.66, thin_market: false, position: "median_to_p75", aims_at: "p50", target_hours: 31 });
    expect(s.basis).toBe("Based on 38 comparable bounties in AI photo & video. The median clearing CPM is $2.40.");
  });

  it("suggests a lower price when there is more time, and a higher one when it must be fast", () => {
    const slow = suggestCpm({ ...base, target_fill_hours: 48 });
    expect(slow.cpm_cents).toBe(185);
    expect(slow.fill_hours_p50).toBeLessThanOrEqual(48);
    expect(slow.position).toBe("below_p25");
    const fast = suggestCpm({ ...base, target_fill_hours: 16 });
    expect(fast.cpm_cents).toBeGreaterThan(240);
    expect(fast.fill_hours_p50).toBeLessThanOrEqual(16.2);
  });

  it("aiming at the slow end (p80) costs more than aiming at the median", () => {
    const p50 = suggestCpm({ ...base, target_fill_hours: 48 });
    const p80 = suggestCpm({ ...base, target_fill_hours: 48, aims_at: "p80" });
    expect(p80.cpm_cents).toBeGreaterThan(p50.cpm_cents);
    expect(p80.fill_hours_p80).toBeLessThanOrEqual(48);
    expect(p80.aims_at).toBe("p80");
  });

  it("rounds up to the next $0.05 and respects the floor and a 3x ceiling", () => {
    for (const hours of [12, 20, 31, 40, 60, 90]) expect(suggestCpm({ ...base, target_fill_hours: hours }).cpm_cents % 5).toBe(0);
    expect(suggestCpm({ ...base, target_fill_hours: 5000 }).cpm_cents).toBe(50);
    expect(suggestCpm({ ...base, target_fill_hours: 1 }).cpm_cents).toBeLessThanOrEqual(720);
    expect(suggestCpm({ ...base, target_fill_hours: 1 }).cpm_cents).toBe(suggestCpm({ ...base, target_fill_hours: 6 }).cpm_cents);
  });

  it("warns plainly about a thin market", () => {
    const s = suggestCpm({ clearing_cpm_cents: 170, median_fill_hours: 52, sample_n: 6, target_fill_hours: 52 });
    expect(s.thin_market).toBe(true);
    expect(s.basis).toMatch(/Only 6 comparable bounties, so treat this as a rough guide/);
  });

  it("derives quartiles when they are not given", () => {
    expect(suggestCpm({ clearing_cpm_cents: 200, median_fill_hours: 30, sample_n: 30, target_fill_hours: 30 }).position).toBe("median_to_p75");
  });
});

describe("category baselines", () => {
  it("covers all nine categories with ordered quartiles", () => {
    expect(Object.keys(CATEGORY_BASELINES).sort()).toEqual([...CATEGORIES].sort());
    for (const c of CATEGORIES) {
      const b = baselineFor(c);
      expect(b.p25_cpm_cents).toBeLessThan(b.clearing_cpm_cents);
      expect(b.clearing_cpm_cents).toBeLessThan(b.p75_cpm_cents);
      expect(b.clearing_cpm_cents).toBeGreaterThanOrEqual(50);
      expect(b.label.length).toBeGreaterThan(3);
      expect(b.install_to_trial).toBeGreaterThan(0.03);
      expect(b.install_to_trial).toBeLessThan(0.12);
    }
    expect(baselineFor("ai_photo")).toMatchObject({ clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38, label: "AI photo & video" });
  });
});

describe("clearing stats from the market series", () => {
  const point = (date: string, clearing: number, over: Partial<MarketSeriesPoint> = {}): MarketSeriesPoint => ({
    id: `mkt_ai_photo_${date}`,
    category: "ai_photo",
    date,
    clearing_cpm_cents: clearing,
    p25_cpm_cents: Math.round(clearing * 0.8),
    p75_cpm_cents: Math.round(clearing * 1.3),
    open_bounties: 12,
    open_budget_cents: 900_000,
    new_bounties: 2,
    submissions: 30,
    median_fill_hours: 31,
    median_views: 15_800,
    trial_rate: 0.07,
    sample_n: 38,
    ...over,
  });
  const series = (fn: (i: number) => number, days = 40): MarketSeriesPoint[] =>
    Array.from({ length: days }, (_, i) => point(new Date(Date.UTC(2026, 7, 25 + i)).toISOString().slice(0, 10), fn(i)));

  it("reads the latest day, the 7 and 30 day change and the series", () => {
    const pts = series((i) => 200 + i); // 200 to 239 over 40 days
    const s = clearingStats(pts, "ai_photo");
    expect(s.date).toBe("2026-10-03");
    expect(s.clearing_cpm_cents).toBe(239);
    expect(s.change_7d).toBe(0.03); // 239 vs 232
    expect(s.change_30d).toBe(0.14); // 239 vs 209
    expect(s.trend).toBe("rising");
    expect(s.series).toHaveLength(40);
    expect(s.series[0]).toEqual({ date: "2026-08-25", value: 200 });
    expect(s.from_baseline).toBe(false);
    expect(s).toMatchObject({ open_bounties: 12, submissions: 30, median_fill_hours: 31, sample_n: 38 });
  });

  it("calls a small move steady and a drop falling", () => {
    expect(clearingStats(series(() => 240), "ai_photo").trend).toBe("steady");
    expect(clearingStats(series((i) => 300 - i * 2), "ai_photo")).toMatchObject({ trend: "falling", change_7d: -0.06 });
    expect(clearingStats(series((i) => 240 + (i % 2)), "ai_photo").trend).toBe("steady");
  });

  it("ignores other categories and unsorted input", () => {
    const mixed = [...series((i) => 200 + i), point("2026-10-03", 999, { category: "fitness", id: "mkt_fitness_2026-10-03" })].reverse();
    const s = clearingStats(mixed, "ai_photo");
    expect(s.clearing_cpm_cents).toBe(239);
    expect(s.date).toBe("2026-10-03");
  });

  it("falls back to the category baseline when there is no series", () => {
    const s = clearingStats([], "fitness");
    expect(s).toMatchObject({ from_baseline: true, clearing_cpm_cents: 190, trend: "steady", change_7d: 0, series: [], date: "" });
    expect(clearingStats(series(() => 200), "finance").from_baseline).toBe(true);
  });

  it("has no change figure with too little history", () => {
    const s = clearingStats([point("2026-10-03", 240)], "ai_photo");
    expect(s.change_7d).toBe(0);
    expect(s.change_30d).toBe(0);
  });

  it("draws the price-vs-fill curve for the category", () => {
    const s = clearingStats(series(() => 240), "ai_photo");
    expect(categoryPriceCurve(s).map((p) => p.cpm_cents)).toEqual([144, 192, 240, 288, 360, 480]);
  });
});

describe("competition heat", () => {
  const p = { open_bounties: 12, open_budget_cents: 900_000, submissions: 30, clearing_cpm_cents: 240, median_views: 15_800 };

  it("is hot when open budget is more than two weeks of creator supply", () => {
    const h = competitionHeat({ ...p, open_budget_cents: 1_200_000, submissions: 20 });
    expect(h.level).toBe("hot");
    expect(h.score).toBe(100);
    expect(h.budget_cover_days).toBe(15.82);
    expect(h.for_brands).toMatch(/slower fills at the median price/);
    expect(h.for_creators).toMatch(/Good week to submit/);
  });

  it("is warm around a week and cool when budget is thin", () => {
    const warm = competitionHeat({ ...p, open_budget_cents: 530_000, submissions: 20 });
    expect(warm.level).toBe("warm");
    expect(warm.score).toBe(50);
    const cool = competitionHeat({ ...p, open_budget_cents: 100_000, submissions: 20 });
    expect(cool.level).toBe("cool");
    expect(cool.score).toBe(9);
    expect(cool.for_brands).toMatch(/should fill quickly/);
    expect(cool.for_creators).toMatch(/Pick the brief you are best at/);
  });

  it("measures bounties per 100 submissions and survives zero submissions", () => {
    expect(competitionHeat(p).bounties_per_100_submissions).toBe(40);
    const none = competitionHeat({ ...p, submissions: 0 });
    expect(none.bounties_per_100_submissions).toBe(100);
    expect(Number.isFinite(none.score)).toBe(true);
    expect(competitionHeat({ ...p, submissions: 0, open_bounties: 0 }).bounties_per_100_submissions).toBe(0);
    expect(competitionHeat({ ...p, open_budget_cents: 0 }).score).toBe(0);
  });

  it("words the weekly trend", () => {
    expect(trendCopy(0.05)).toBe("+5% this week");
    expect(trendCopy(-0.06)).toBe("-6% this week");
    expect(trendCopy(0.02)).toBe("steady this week");
    expect(trendCopy(0)).toBe("steady this week");
  });
});
