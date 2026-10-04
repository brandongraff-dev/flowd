import { describe, expect, it } from "vitest";
import {
  FATIGUE_DROP_THRESHOLD,
  MIN_SAMPLE_FOR_RATE,
  addFunnels,
  aggregateFunnelBy,
  coverageLabel,
  detectFatigue,
  emptyFunnel,
  funnelFromConversions,
  funnelMonotonicProblems,
  funnelStats,
  rateWithSample,
  revenueByDay,
  splitConversions,
  stepRates,
  sumFunnels,
  trialRate,
  wilsonInterval,
  type ConversionLike,
} from "../funnel";

const f = (over: Partial<ReturnType<typeof emptyFunnel>> = {}) => ({ ...emptyFunnel(), ...over });

describe("funnel counts", () => {
  it("adds and sums funnels field by field", () => {
    const a = f({ views: 1000, clicks: 40, installs: 10, trials: 2, paid: 1, est_installs: 3 });
    const b = f({ views: 500, clicks: 10, installs: 5, trials: 1, paid: 0, est_trials: 2 });
    expect(addFunnels(a, b)).toEqual(f({ views: 1500, clicks: 50, installs: 15, trials: 3, paid: 1, est_installs: 3, est_trials: 2 }));
    expect(sumFunnels([a, b, a]).views).toBe(2500);
    expect(sumFunnels([])).toEqual(emptyFunnel());
  });

  it("checks the tracked funnel is monotonic (M-07)", () => {
    expect(funnelMonotonicProblems(f({ views: 1000, clicks: 40, installs: 10, trials: 2, paid: 1 }))).toEqual([]);
    expect(funnelMonotonicProblems(f({ views: 100, clicks: 40, installs: 50, trials: 2, paid: 3 }))).toHaveLength(2);
    // estimated counts are separate and may exceed tracked ones
    expect(funnelMonotonicProblems(f({ views: 1000, clicks: 40, installs: 10, est_installs: 900 }))).toEqual([]);
  });

  it("computes the trial rate", () => {
    expect(trialRate({ installs: 700, trials: 112 })).toBeCloseTo(0.16, 5);
    expect(trialRate({ installs: 0, trials: 0 })).toBeNull();
  });
});

describe("rates tell the truth about sparse data", () => {
  it("shows a rate only when the sample is big enough", () => {
    expect(rateWithSample(5, 100)).toEqual({ value: 0.05, sample: 100, enough: true });
    const sparse = rateWithSample(1, 4, "installs");
    expect(sparse.value).toBeNull();
    expect(sparse.enough).toBe(false);
    expect(sparse.note).toBe(`Needs ${MIN_SAMPLE_FOR_RATE} installs to show a reliable rate (has 4).`);
    expect(rateWithSample(1, 20).enough).toBe(true);
    expect(rateWithSample(1, 19).enough).toBe(false);
  });

  it("gives step rates of the tracked funnel only", () => {
    const r = stepRates(f({ views: 410_000, clicks: 1850, installs: 700, trials: 112, paid: 41, est_installs: 5000 }));
    expect(r.view_to_click.value).toBeCloseTo(1850 / 410_000, 8);
    expect(r.click_to_install.value).toBeCloseTo(700 / 1850, 8);
    expect(r.install_to_trial.value).toBeCloseTo(0.16, 8);
    expect(r.trial_to_paid.value).toBeCloseTo(41 / 112, 8);
    expect(r.install_to_paid.value).toBeCloseTo(41 / 700, 8);
    const sparse = stepRates(f({ views: 200, clicks: 3, installs: 1 }));
    expect(sparse.view_to_click.value).toBeNull();
    expect(sparse.click_to_install.value).toBeNull();
  });

  it("gives the Wilson interval around a small-sample rate", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    const w = wilsonInterval(5, 10);
    expect(w.low).toBeCloseTo(0.237, 2);
    expect(w.high).toBeCloseTo(0.763, 2);
    const big = wilsonInterval(500, 1000);
    expect(big.high - big.low).toBeLessThan(w.high - w.low);
    expect(wilsonInterval(0, 50).low).toBe(0);
    expect(wilsonInterval(50, 50).high).toBe(1);
  });
});

describe("tracked vs estimated", () => {
  const batches: ConversionLike[] = [
    { kind: "install", source: "link", quantity: 100, status: "cleared" },
    { kind: "install", source: "code", quantity: 20, status: "cleared" },
    { kind: "install", source: "mmp", quantity: 60, status: "cleared" },
    { kind: "trial", source: "link", quantity: 12, status: "pending" },
    { kind: "trial", source: "survey", quantity: 8, status: "cleared" },
    { kind: "paid", source: "link", quantity: 3, status: "cleared" },
    { kind: "paid", source: "link", quantity: 2, status: "refunded" },
    { kind: "paid", source: "modelled", quantity: 4, status: "cleared" },
    { kind: "install", source: "code", quantity: 50, status: "rejected" },
  ];

  it("keeps link and code as Tracked and everything else as Estimated, never mixed", () => {
    const s = splitConversions(batches);
    expect(s.tracked).toEqual({ installs: 120, trials: 12, paid: 3 });
    expect(s.estimated).toEqual({ installs: 60, trials: 8, paid: 4 });
    expect(s.by_source.link).toEqual({ installs: 100, trials: 12, paid: 3 });
    expect(s.by_source.mmp.installs).toBe(60);
    expect(s.by_source.code.installs).toBe(20); // the rejected batch is excluded
    expect(s.deterministic_share).toBeCloseTo(135 / 207, 6);
  });

  it("reports full coverage when nothing has happened yet", () => {
    expect(splitConversions([]).deterministic_share).toBe(1);
  });

  it("labels coverage", () => {
    expect(coverageLabel(0.95)).toBe("high");
    expect(coverageLabel(0.8)).toBe("high");
    expect(coverageLabel(0.65)).toBe("medium");
    expect(coverageLabel(0.5)).toBe("medium");
    expect(coverageLabel(0.2)).toBe("low");
  });

  it("rebuilds a funnel from conversion batches, keeping views and clicks", () => {
    expect(funnelFromConversions({ views: 9000, clicks: 400 }, batches)).toEqual({
      views: 9000,
      clicks: 400,
      installs: 120,
      trials: 12,
      paid: 3,
      est_installs: 60,
      est_trials: 8,
      est_paid: 4,
    });
  });
});

describe("cost per stage, ROAS and payback (DOMAIN worked example)", () => {
  // $520.00 cost, 410,000 views, 1,850 clicks, 700 installs, 112 trials, 41 paid
  const revenue = Array.from({ length: 30 }, (_, i) => (i < 3 ? 2000 : i < 12 ? 4200 : 1800));
  const s = funnelStats({ cost_cents: 52_000, views: 410_000, clicks: 1850, installs: 700, trials: 112, paid: 41, revenue_by_day_cents: revenue });

  it("computes effective CPM and cost per stage", () => {
    expect(s.cpm_effective_cents).toBe(127);
    expect(s.cost_per_install_cents).toBe(74);
    expect(s.cost_per_trial_cents).toBe(464);
    expect(s.cost_per_paid_cents).toBe(1268);
    expect(s.cost_per_click_cents).toBe(28);
  });

  it("keeps enough decimals that a 0.45% view-to-click rate does not round to zero", () => {
    expect(s.view_to_click).toBe(0.0045);
    expect(s.trial_to_paid).toBe(0.3661);
  });

  it("computes ROAS D7 and D30 and the payback day", () => {
    expect(s.roas_d7).toBe(0.44);
    expect(s.roas_d30).toBe(1.47);
    expect(s.payback_day).toBe(17);
  });

  it("badges each horizon with its maturity and whether the cohort has that much data", () => {
    expect(s.roas[7]).toMatchObject({ days: 7, value: 0.44, maturity: "early_signal", mature: true, revenue_cents: 22_800 });
    expect(s.roas[30]).toMatchObject({ value: 1.47, maturity: "decision", mature: true });
    expect(s.roas[60]).toMatchObject({ maturity: "long_term", mature: false });
    expect(s.roas[90].mature).toBe(false);
    expect(s.roas_d90).toBe(1.47); // the figure to date, flagged immature above
    expect(s.observed_days).toBe(30);
  });

  it("has no payback day until cumulative revenue reaches cost", () => {
    const young = funnelStats({ cost_cents: 52_000, views: 100, clicks: 10, installs: 5, trials: 1, paid: 0, revenue_by_day_cents: [1000, 2000] });
    expect(young.payback_day).toBeNull();
    expect(young.roas_d7).toBe(0.06);
    expect(young.roas[7].mature).toBe(false);
  });

  it("returns null per-stage costs with no events and zero ROAS with no cost", () => {
    const empty = funnelStats({ cost_cents: 1000, views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, revenue_by_day_cents: [] });
    expect(empty.cpm_effective_cents).toBeNull();
    expect(empty.cost_per_install_cents).toBeNull();
    expect(empty.cost_per_paid_cents).toBeNull();
    expect(empty.roas_d30).toBe(0);
    const free = funnelStats({ cost_cents: 0, views: 100, clicks: 1, installs: 1, trials: 0, paid: 0, revenue_by_day_cents: [500] });
    expect(free.roas_d7).toBe(0);
    expect(free.payback_day).toBeNull();
  });
});

describe("revenueByDay", () => {
  const rows: ConversionLike[] = [
    { kind: "paid", source: "link", quantity: 1, status: "cleared", occurred_on: "2026-09-01", revenue_cents: 3499 },
    { kind: "paid", source: "code", quantity: 2, status: "cleared", occurred_on: "2026-09-03", revenue_cents: 6998 },
    { kind: "paid", source: "mmp", quantity: 5, status: "cleared", occurred_on: "2026-09-03", revenue_cents: 17_495 },
    { kind: "paid", source: "link", quantity: 1, status: "refunded", occurred_on: "2026-09-02", revenue_cents: 3499 },
    { kind: "paid", source: "link", quantity: 1, status: "cleared", occurred_on: "2026-12-01", revenue_cents: 3499 },
    { kind: "paid", source: "link", quantity: 1, status: "cleared", occurred_on: "2026-08-31", revenue_cents: 3499 },
  ];

  it("builds a day-indexed series from tracked revenue only", () => {
    expect(revenueByDay({ batches: rows, posted_on: "2026-09-01", days: 5 })).toEqual([3499, 0, 6998, 0, 0]);
  });

  it("cuts a young cohort at `through`", () => {
    expect(revenueByDay({ batches: rows, posted_on: "2026-09-01", days: 30, through: "2026-09-03" })).toEqual([3499, 0, 6998]);
    expect(revenueByDay({ batches: [], posted_on: "2026-09-01", days: 3 })).toEqual([0, 0, 0]);
  });
});

describe("aggregateFunnelBy", () => {
  const items = [
    { creator: "cr_a", funnel: f({ views: 10_000, clicks: 100, installs: 40, trials: 8, paid: 2 }), cost_cents: 2000 },
    { creator: "cr_a", funnel: f({ views: 5000, clicks: 50, installs: 20, trials: 4, paid: 1 }), cost_cents: 1000 },
    { creator: "cr_b", funnel: f({ views: 20_000, clicks: 100, installs: 30, trials: 3, paid: 0 }), cost_cents: 2400 },
    { creator: "cr_c", funnel: f({ views: 90_000, clicks: 10, installs: 0, trials: 0, paid: 0 }), cost_cents: 500 },
    { creator: "cr_d", funnel: f({ views: 1000 }), cost_cents: 100 },
  ];

  it("groups, totals and ranks by cost per trial (cheapest first, no-trial groups last by views)", () => {
    const rows = aggregateFunnelBy(items, (i) => i.creator);
    expect(rows.map((r) => r.key)).toEqual(["cr_a", "cr_b", "cr_c", "cr_d"]);
    const a = rows[0];
    expect(a.n).toBe(2);
    expect(a.funnel.trials).toBe(12);
    expect(a.cost_cents).toBe(3000);
    expect(a.cost_per_trial_cents).toBe(250);
    expect(a.cost_per_paid_cents).toBe(1000);
    expect(a.trial_rate).toBeCloseTo(12 / 60, 6);
    expect(rows[1].cost_per_trial_cents).toBe(800);
    expect(rows[2].cost_per_trial_cents).toBeNull();
    expect(rows[2].trial_rate).toBeNull();
  });

  it("handles an item with no cost", () => {
    const rows = aggregateFunnelBy([{ funnel: f({ trials: 2, installs: 10 }) }], () => "x");
    expect(rows[0].cost_per_trial_cents).toBe(0);
  });
});

describe("fatigue", () => {
  const day = (i: number) => `2026-09-${String(i + 1).padStart(2, "0")}`;
  const series = (values: number[]) => values.map((value, i) => ({ date: day(i), value }));

  it("fires when the smoothed rate is 30% or more below its peak", () => {
    const r = detectFatigue(series([0.1, 0.11, 0.12, 0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.06]));
    expect(r.fatigued).toBe(true);
    expect(r.peak_value).toBeCloseTo(0.1167, 3);
    expect(r.current_value).toBeCloseTo(0.07, 5);
    expect(r.drop_ratio).toBe(0.4);
    expect(r.peak_on).toBe("2026-09-04");
  });

  it("does not fire on a steady series, a small dip, or too little data", () => {
    expect(detectFatigue(series([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).fatigued).toBe(false);
    expect(detectFatigue(series([0.1, 0.11, 0.12, 0.12, 0.11, 0.1, 0.1, 0.1, 0.1, 0.1])).fatigued).toBe(false);
    expect(detectFatigue(series([0.2, 0.1, 0.05, 0.01])).fatigued).toBe(false);
    expect(detectFatigue([])).toEqual({ fatigued: false, peak_value: 0, current_value: 0, drop_ratio: 0 });
  });

  it("is not fooled by one noisy day", () => {
    expect(detectFatigue(series([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.02])).fatigued).toBe(false);
  });

  it("uses a 30% threshold", () => {
    expect(FATIGUE_DROP_THRESHOLD).toBe(0.3);
    // flat 0.10 then flat 0.07: smoothed current 0.07 vs peak 0.10 = exactly 30%
    const r = detectFatigue(series([0.1, 0.1, 0.1, 0.1, 0.07, 0.07, 0.07]));
    expect(r.drop_ratio).toBe(0.3);
    expect(r.fatigued).toBe(true);
  });
});
