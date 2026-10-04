import { describe, expect, it } from "vitest";
import {
  EARNINGS_DISCLAIMER,
  expectedEarnings,
  incomeCalendar,
  monthlyEarningsRange,
  payMath,
  predictedViews,
  taxDesk,
  typicalEarnings,
  typicalVsTop,
  type CalendarRow,
} from "../earnings";
import { NOW } from "./helpers";

const RATES = { install: 40, trial: 150, paid: 400 };

describe("expected earnings (DOMAIN worked example: $2.10 CPM + $0.40 / $1.50 / $4.00, median 14,200 views, $250 cap)", () => {
  const e = expectedEarnings({ base_median_views: 14_200, cpm_cents: 210, rates: RATES, per_video_cap_cents: 25_000 });

  it("p25: 5,680 views, $17.56 (CPM $11.93 + CPA $5.63)", () => {
    expect(e.p25).toEqual({ views: 5680, installs: 9.71, trials: 0.6, paid: 0.21, cpm_pay_cents: 1193, cpa_pay_cents: 563, pay_cents: 1756, capped: false });
  });

  it("median: 14,200 views, $43.89 (CPM $29.82 + CPA $14.07)", () => {
    expect(e.median).toEqual({ views: 14_200, installs: 24.28, trials: 1.51, paid: 0.52, cpm_pay_cents: 2982, cpa_pay_cents: 1407, pay_cents: 4389, capped: false });
  });

  it("p75: 36,210 views, $111.91 (CPM $76.04 + CPA $35.87)", () => {
    expect(e.p75).toEqual({ views: 36_210, installs: 61.92, trials: 3.84, paid: 1.34, cpm_pay_cents: 7604, cpa_pay_cents: 3587, pay_cents: 11_191, capped: false });
  });

  it("predicts views for a take from the Flow Score band", () => {
    expect(predictedViews(14_200, "B")).toBe(16_330);
    expect([14_200].flatMap((m) => (["A", "B", "C", "D", "E"] as const).map((b) => predictedViews(m, b)))).toEqual([22_720, 16_330, 12_070, 7100, 4260]);
    expect(predictedViews(0, "A")).toBe(0);
  });

  it("applies the cap and says so", () => {
    const capped = expectedEarnings({ base_median_views: 90_000, cpm_cents: 400, per_video_cap_cents: 25_000 });
    expect(capped.median).toMatchObject({ views: 90_000, cpm_pay_cents: 36_000, cpa_pay_cents: 0, pay_cents: 25_000, capped: true });
    expect(capped.p25).toMatchObject({ views: 36_000, pay_cents: 14_400, capped: false });
    expect(capped.p75.capped).toBe(true);
  });

  it("is CPM-only when the bounty pays no CPA", () => {
    const cpmOnly = expectedEarnings({ base_median_views: 10_000, cpm_cents: 200, per_video_cap_cents: 25_000 });
    expect(cpmOnly.median.cpa_pay_cents).toBe(0);
    expect(cpmOnly.median.pay_cents).toBe(2000);
  });

  it("handles a creator with no views", () => {
    const none = expectedEarnings({ base_median_views: 0, cpm_cents: 200, rates: RATES, per_video_cap_cents: 25_000 });
    expect(none.median.pay_cents).toBe(0);
    expect(none.p75.views).toBe(0);
  });
});

describe("Pay Math", () => {
  it("builds the contract shape: expected views, pay at p25 / median / p75, blended creator CPM and the brand's all-in CPM", () => {
    const pm = payMath({ cpm_cents: 210, rates: RATES, per_video_cap_cents: 25_000, plan: "pro", median_views: 14_200, basis: "AI photo & video, 38 comparable bounties" });
    expect(pm).toEqual({
      expected_views_p25: 5680,
      expected_views_median: 14_200,
      expected_views_p75: 36_210,
      p25_cents: 1756,
      median_cents: 4389,
      p75_cents: 11_191,
      creator_cpm_cents: 309,
      all_in_cpm_cents: 350,
      basis: "AI photo & video, 38 comparable bounties",
    });
  });

  it("uses the plan's take rate, the flat 6% for CPA-only, and no fee on a first bounty", () => {
    const base = { cpm_cents: 200, per_video_cap_cents: 25_000, median_views: 10_000, basis: "x" };
    expect(payMath({ ...base, plan: "free" }).all_in_cpm_cents).toBe(230);
    expect(payMath({ ...base, plan: "scale" }).all_in_cpm_cents).toBe(222);
    expect(payMath({ ...base, plan: "pro", first_bounty: true }).all_in_cpm_cents).toBe(206);
    expect(payMath({ ...base, cpm_cents: 0, rates: { install: 100 }, type: "install_only", plan: "pro" }).all_in_cpm_cents).toBe(payMath({ ...base, cpm_cents: 0, rates: { install: 100 }, type: "install_only", plan: "free" }).all_in_cpm_cents);
  });

  it("has a zero blended CPM when there are no views", () => {
    expect(payMath({ cpm_cents: 200, per_video_cap_cents: 25_000, plan: "pro", median_views: 0, basis: "x" }).creator_cpm_cents).toBe(0);
  });

  it("uses the bounty's own take rate when it has one: platform-funded 0%, or the rate it was created with", () => {
    // flowd's own $1.50 CPM bounty (fee 0): the brand-side price is just creator pay plus 2.9% processing
    const flowd = payMath({ cpm_cents: 150, per_video_cap_cents: 10_000, plan: "scale", take_rate: 0, median_views: 12_900, basis: "x" });
    expect(flowd).toMatchObject({ creator_cpm_cents: 150, all_in_cpm_cents: 154, median_cents: 1935 });
    // a stacked bounty made on the Free plan keeps its 12% after the brand moves to Pro (fixture bnty_quillby_onetake)
    const quillby = payMath({ cpm_cents: 255, rates: RATES, per_video_cap_cents: 25_000, plan: "pro", take_rate: 0.12, median_views: 13_900, basis: "x" });
    expect(quillby).toMatchObject({ median_cents: 4922, creator_cpm_cents: 354, all_in_cpm_cents: 408 });
    expect(payMath({ cpm_cents: 255, rates: RATES, per_video_cap_cents: 25_000, plan: "pro", median_views: 13_900, basis: "x" }).all_in_cpm_cents).toBe(401);
    // an explicit rate beats the plan, the type and the first-bounty waiver
    const explicit = payMath({ cpm_cents: 200, per_video_cap_cents: 25_000, plan: "free", type: "cpa", first_bounty: true, take_rate: 0.1, median_views: 10_000, basis: "x" });
    expect(explicit.all_in_cpm_cents).toBe(payMath({ cpm_cents: 200, per_video_cap_cents: 25_000, plan: "pro", median_views: 10_000, basis: "x" }).all_in_cpm_cents);
  });

  it("prices a flat-fee (direct) bounty: the fee is the whole pay at every quantile, outside the cap", () => {
    // flowd's $5 starter bounty, no fee: $0.40 per 1,000 views to the creator, $0.41 all-in
    const starter = payMath({ cpm_cents: 0, per_video_cap_cents: 500, plan: "scale", take_rate: 0, flat_fee_cents: 500, median_views: 12_600, basis: "x" });
    expect(starter).toEqual({ expected_views_p25: 5040, expected_views_median: 12_600, expected_views_p75: 32_130, p25_cents: 500, median_cents: 500, p75_cents: 500, creator_cpm_cents: 40, all_in_cpm_cents: 41, basis: "x" });
    // a $360 direct offer on Scale (8%): 2,432 creator CPM, 2,703 all-in
    const offer = payMath({ cpm_cents: 0, per_video_cap_cents: 0, plan: "scale", type: "direct", flat_fee_cents: 36_000, median_views: 14_803, basis: "x" });
    expect(offer).toMatchObject({ p25_cents: 36_000, median_cents: 36_000, p75_cents: 36_000, creator_cpm_cents: 2432, all_in_cpm_cents: 2703 });
    // a flat fee on top of view pay is added to every quantile, and the cap applies to the view pay only
    const mixed = payMath({ cpm_cents: 400, per_video_cap_cents: 25_000, plan: "pro", flat_fee_cents: 10_000, median_views: 90_000, basis: "x" });
    expect(mixed).toMatchObject({ p25_cents: 24_400, median_cents: 35_000, p75_cents: 35_000 });
    // no views, no CPM
    expect(payMath({ cpm_cents: 0, per_video_cap_cents: 0, plan: "pro", flat_fee_cents: 500, median_views: 0, basis: "x" })).toMatchObject({ median_cents: 500, creator_cpm_cents: 0, all_in_cpm_cents: 0 });
  });
});

describe("typical beside top (FTC-careful)", () => {
  it("writes the typical first, the top beside it, and the disclaimer", () => {
    expect(typicalVsTop({ typical_cents: 6200, top_cents: 64_000 })).toBe(`The typical creator earned $62 in 30 days. The top 10% earned $640. ${EARNINGS_DISCLAIMER}`);
    expect(typicalVsTop({ typical_cents: 6250, top_cents: 64_000, top_label: "1%", period: "a month" })).toContain("The typical creator earned $62.50 in a month. The top 1% earned $640.");
    expect(EARNINGS_DISCLAIMER).toMatch(/Results vary/);
    expect(typicalVsTop({ typical_cents: 6200, top_cents: 64_000 }).toLowerCase()).not.toMatch(/guaranteed income|passive|quit your job/);
  });

  it("computes the typical band of a list of cleared earnings", () => {
    expect(typicalEarnings([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000])).toEqual({ n: 10, p25: 3250, median: 5500, p75: 7750, p90: 9100 });
    expect(typicalEarnings([])).toEqual({ n: 0, p25: 0, median: 0, p75: 0, p90: 0 });
  });
});

describe("earnings calculator", () => {
  it("gives a monthly range from posts, approval rate and the quantiles", () => {
    const r = monthlyEarningsRange({ median_views: 14_200, posts_per_month: 12, approval_rate: 0.75, cpm_cents: 210, rates: RATES, per_video_cap_cents: 25_000 });
    expect(r.approved_posts).toBe(9);
    expect(r.monthly_cents).toEqual({ p25: 1756 * 9, median: 4389 * 9, p75: 11_191 * 9 });
    expect(r.per_video.median.pay_cents).toBe(4389);
    expect(r.label).toMatch(/^Estimate\. Results vary/);
  });

  it("defaults to the platform approval rate and never promises", () => {
    const r = monthlyEarningsRange({ median_views: 10_000, posts_per_month: 10, cpm_cents: 200, per_video_cap_cents: 25_000 });
    expect(r.approved_posts).toBe(7.8);
    expect(r.monthly_cents.median).toBe(Math.round(2000 * 7.8));
    expect(r.label.toLowerCase()).not.toContain("guarantee d");
  });

  it("is zero with no posts", () => {
    expect(monthlyEarningsRange({ median_views: 10_000, posts_per_month: 0, cpm_cents: 200, per_video_cap_cents: 25_000 }).monthly_cents).toEqual({ p25: 0, median: 0, p75: 0 });
  });
});

describe("income calendar", () => {
  const rows: CalendarRow[] = [
    { amount_cents: 6000, state: "accruing", eta_at: "2026-10-06T14:00:00Z", estimated: true },
    { amount_cents: 9000, state: "accruing", eta_at: "2026-10-05T14:00:00Z", estimated: true },
    { amount_cents: 6200, state: "pending", eta_at: "2026-10-04T14:00:00Z" },
    { amount_cents: 8600, state: "cleared", eta_at: "2026-10-09T18:00:00Z" },
    { amount_cents: 700, state: "held" },
    { amount_cents: 155_400, state: "paid" },
    { amount_cents: 500, state: "reversed" },
  ];
  const cal = incomeCalendar({ rows, now: NOW });

  it("shows when pending money clears and when the Friday payout carries it", () => {
    expect(cal.days.map((d) => [d.date, d.clears_cents, d.pays_cents])).toEqual([
      ["2026-10-04", 6200, 0],
      ["2026-10-05", 9000, 0],
      ["2026-10-06", 6000, 0],
      ["2026-10-09", 0, 29_800],
    ]);
    expect(cal.days[0].label).toBe("Sun Oct 4");
    expect(cal.days[3].label).toBe("Fri Oct 9");
  });

  it("names the next payout and what it will carry", () => {
    expect(cal.next_payout).toEqual({ at: "2026-10-09T18:00:00Z", amount_cents: 29_800 });
  });

  it("keeps pending, cleared and held apart (Maya: $212.00 pending)", () => {
    expect(cal.to_clear_cents).toBe(21_200);
    expect(cal.to_pay_cents).toBe(29_800);
    expect(cal.held_cents).toBe(700);
  });

  it("flags the estimated part of a day (accruing money is a live estimate)", () => {
    expect(cal.days.find((d) => d.date === "2026-10-05")?.estimated_cents).toBe(9000);
    expect(cal.days.find((d) => d.date === "2026-10-04")?.estimated_cents).toBe(0);
  });

  it("pays money that clears after one Friday on the next Friday", () => {
    const later = incomeCalendar({ rows: [{ amount_cents: 1000, state: "pending", eta_at: "2026-10-10T14:00:00Z" }], now: NOW });
    expect(later.days.map((d) => [d.date, d.clears_cents, d.pays_cents])).toEqual([["2026-10-10", 1000, 0], ["2026-10-16", 0, 1000]]);
    expect(later.next_payout).toBeNull();
  });

  it("stops at the horizon and handles an empty wallet", () => {
    const short = incomeCalendar({ rows, now: NOW, horizon_days: 3 });
    expect(short.days.map((d) => d.date)).toEqual(["2026-10-04", "2026-10-05"]);
    expect(short.to_pay_cents).toBe(0);
    expect(incomeCalendar({ rows: [], now: NOW })).toEqual({ days: [], next_payout: null, to_clear_cents: 0, to_pay_cents: 0, held_cents: 0 });
  });

  it("treats a cleared row with no ETA as paying at the next weekly run", () => {
    const c = incomeCalendar({ rows: [{ amount_cents: 800, state: "cleared" }], now: NOW });
    expect(c.next_payout).toEqual({ at: "2026-10-09T18:00:00Z", amount_cents: 800 });
  });
});

describe("Tax Desk", () => {
  it("sets aside 25% and tracks the $2,000 1099-NEC threshold: not tax advice", () => {
    const t = taxDesk({ ytd_cleared_cents: 164_000 });
    expect(t).toMatchObject({ ytd_cleared_cents: 164_000, set_aside_cents: 41_000, set_aside_rate: 0.25, threshold_cents: 200_000, remaining_to_threshold_cents: 36_000, over_threshold: false });
    expect(t.progress_to_threshold).toBeCloseTo(0.82, 6);
    expect(t.disclaimer).toBe("Not tax advice. Estimate only.");
  });

  it("flags the threshold, adjusts the rate and ignores negatives", () => {
    expect(taxDesk({ ytd_cleared_cents: 200_000 })).toMatchObject({ over_threshold: true, remaining_to_threshold_cents: 0, progress_to_threshold: 1 });
    expect(taxDesk({ ytd_cleared_cents: 500_000, set_aside_rate: 0.3 }).set_aside_cents).toBe(150_000);
    expect(taxDesk({ ytd_cleared_cents: -500 })).toMatchObject({ set_aside_cents: 0, progress_to_threshold: 0 });
    expect(taxDesk({ ytd_cleared_cents: 0 }).remaining_to_threshold_cents).toBe(200_000);
  });
});
