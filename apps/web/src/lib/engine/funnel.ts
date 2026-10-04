/**
 * The funnel: views to clicks to installs to trials to paid, with cost per stage, ROAS D7 to D90 and payback.
 *
 * Two rules shape every number here:
 *  - Tracked is not Estimated. Link and code conversions are deterministic (Tracked, and the only ones CPA pays on). MMP, survey and
 *    modelled conversions are reported separately and are never mixed into a tracked count or a cost per stage.
 *  - Sparse data says so. A rate is shown only when its denominator is large enough; the helpers return `null` and the minimum
 *    needed so the UI can say "needs 20 installs to show a trial rate".
 */

import type { ConversionKind, ConversionSource, ConversionStatus, FunnelCounts, IsoDate } from "@/lib/contract/types";
import { isPayableSource } from "./constants";
import { clamp, round2, roundTo, sum } from "./stats";
import { DAY_MS, toMs } from "./time";

// ── counts ─────────────────────────────────────────────────────────────────────────────────────

export const emptyFunnel = (): FunnelCounts => ({ views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 });

/** Adds two funnels field by field. */
export function addFunnels(a: FunnelCounts, b: FunnelCounts): FunnelCounts {
  return {
    views: a.views + b.views,
    clicks: a.clicks + b.clicks,
    installs: a.installs + b.installs,
    trials: a.trials + b.trials,
    paid: a.paid + b.paid,
    est_installs: a.est_installs + b.est_installs,
    est_trials: a.est_trials + b.est_trials,
    est_paid: a.est_paid + b.est_paid,
  };
}

/** Sum of many funnels (a bounty's posts, an app's bounties). */
export const sumFunnels = (funnels: readonly FunnelCounts[]): FunnelCounts => funnels.reduce(addFunnels, emptyFunnel());

/** Tracked counts are monotonic: views >= clicks >= installs >= trials >= paid (invariant M-07). Returns the broken links, if any. */
export function funnelMonotonicProblems(f: FunnelCounts): string[] {
  const out: string[] = [];
  const steps: [string, number][] = [["views", f.views], ["clicks", f.clicks], ["installs", f.installs], ["trials", f.trials], ["paid", f.paid]];
  for (let i = 1; i < steps.length; i += 1) if (steps[i][1] > steps[i - 1][1]) out.push(`${steps[i][0]} (${steps[i][1]}) exceeds ${steps[i - 1][0]} (${steps[i - 1][1]})`);
  return out;
}

/** Least denominator that makes a rate worth showing. Below it the UI says what is needed instead of a misleading percentage. */
export const MIN_SAMPLE_FOR_RATE = 20;

export interface Rate {
  /** num / den, or null when the sample is too small to show. */
  value: number | null;
  /** The denominator the rate is based on. */
  sample: number;
  /** True when `sample` reaches `MIN_SAMPLE_FOR_RATE`. */
  enough: boolean;
  /** What to tell the viewer when it is not enough. */
  note?: string;
}

/** A rate with its honesty attached: null value and a note when the denominator is under the minimum. */
export function rateWithSample(num: number, den: number, label = "events", min = MIN_SAMPLE_FOR_RATE): Rate {
  if (den >= min) return { value: num / den, sample: den, enough: true };
  return { value: null, sample: den, enough: false, note: `Needs ${min} ${label} to show a reliable rate (has ${den}).` };
}

/** Wilson score interval for a rate: the honest range around a small-sample percentage. */
export function wilsonInterval(successes: number, trials: number, z = 1.96): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;
  return { low: clamp(center - margin, 0, 1), high: clamp(center + margin, 0, 1) };
}

export interface StepRates {
  view_to_click: Rate;
  click_to_install: Rate;
  install_to_trial: Rate;
  trial_to_paid: Rate;
  /** Installs to paid (download to paid). */
  install_to_paid: Rate;
}

/** Step rates of the TRACKED funnel. Estimated counts are never included. */
export function stepRates(f: FunnelCounts): StepRates {
  return {
    view_to_click: rateWithSample(f.clicks, f.views, "views", 1000),
    click_to_install: rateWithSample(f.installs, f.clicks, "clicks"),
    install_to_trial: rateWithSample(f.trials, f.installs, "installs"),
    trial_to_paid: rateWithSample(f.paid, f.trials, "trials"),
    install_to_paid: rateWithSample(f.paid, f.installs, "installs"),
  };
}

/** Trials per install (the "trial rate" that hooks and formats are ranked on). Null when there are no installs. */
export const trialRate = (f: Pick<FunnelCounts, "installs" | "trials">): number | null => (f.installs > 0 ? f.trials / f.installs : null);

// ── tracked vs estimated ───────────────────────────────────────────────────────────────────────

/** A batch of identical conversion events (a Conversion row, reduced to what the funnel needs). */
export interface ConversionLike {
  kind: ConversionKind;
  source: ConversionSource;
  quantity: number;
  status: ConversionStatus;
  occurred_on?: IsoDate;
  revenue_cents?: number;
}

export interface KindCounts {
  installs: number;
  trials: number;
  paid: number;
}

export interface TrackedVsEstimated {
  /** Link + code: deterministic, the only counts CPA pays on. */
  tracked: KindCounts;
  /** MMP + survey + modelled: reported, never paid, never mixed in. */
  estimated: KindCounts;
  by_source: Record<ConversionSource, KindCounts>;
  /** Tracked events / all events across kinds. 1 when there is nothing yet. */
  deterministic_share: number;
}

const KIND_KEY: Record<ConversionKind, keyof KindCounts> = { install: "installs", trial: "trials", paid: "paid" };
const zeroKinds = (): KindCounts => ({ installs: 0, trials: 0, paid: 0 });

/**
 * Splits conversions into Tracked (link, code) and Estimated (mmp, survey, modelled). Rejected and refunded batches are excluded;
 * pending batches count (they happened, they have not cleared yet).
 */
export function splitConversions(batches: readonly ConversionLike[]): TrackedVsEstimated {
  const tracked = zeroKinds();
  const estimated = zeroKinds();
  const by_source: Record<ConversionSource, KindCounts> = { link: zeroKinds(), code: zeroKinds(), mmp: zeroKinds(), survey: zeroKinds(), modelled: zeroKinds() };
  for (const b of batches) {
    if (b.status === "rejected" || b.status === "refunded") continue;
    const key = KIND_KEY[b.kind];
    by_source[b.source][key] += b.quantity;
    (isPayableSource(b.source) ? tracked : estimated)[key] += b.quantity;
  }
  const t = tracked.installs + tracked.trials + tracked.paid;
  const e = estimated.installs + estimated.trials + estimated.paid;
  return { tracked, estimated, by_source, deterministic_share: t + e > 0 ? t / (t + e) : 1 };
}

/** Plain-English coverage of the deterministic share (the attribution coverage meter). */
export function coverageLabel(share: number): "high" | "medium" | "low" {
  return share >= 0.8 ? "high" : share >= 0.5 ? "medium" : "low";
}

/** Replaces the tracked and estimated fields of a funnel from conversion batches, keeping views and clicks. */
export function funnelFromConversions(base: Pick<FunnelCounts, "views" | "clicks">, batches: readonly ConversionLike[]): FunnelCounts {
  const s = splitConversions(batches);
  return {
    views: base.views,
    clicks: base.clicks,
    installs: s.tracked.installs,
    trials: s.tracked.trials,
    paid: s.tracked.paid,
    est_installs: s.estimated.installs,
    est_trials: s.estimated.trials,
    est_paid: s.estimated.paid,
  };
}

// ── cost per stage, ROAS and payback ───────────────────────────────────────────────────────────

/** Cohort maturity of a ROAS horizon: D7 is an early signal, D30 the core decision window, D60 and D90 for annual and long trials. */
export type RoasMaturity = "early_signal" | "decision" | "long_term";

export interface RoasPoint {
  days: number;
  /** Cumulative tracked revenue within `days` of posting / cost. For a cohort younger than `days` it is the figure to date. */
  value: number;
  revenue_cents: number;
  maturity: RoasMaturity;
  /** True when the cohort has at least `days` of data, so the figure is final for that horizon. */
  mature: boolean;
}

export const ROAS_HORIZONS = [7, 14, 30, 60, 90] as const;
export type RoasHorizon = (typeof ROAS_HORIZONS)[number];

const maturityOf = (days: number): RoasMaturity => (days <= 14 ? "early_signal" : days <= 30 ? "decision" : "long_term");

export interface FunnelStatsInput {
  /** Creator pay + platform fee (+ ad spend and commission for promoted posts). */
  cost_cents: number;
  views: number;
  clicks: number;
  installs: number;
  trials: number;
  paid: number;
  /** Tracked revenue per day after posting: index 0 is day 1. */
  revenue_by_day_cents: readonly number[];
}

export interface FunnelStats {
  /** cost / views x 1,000. Null with no views. */
  cpm_effective_cents: number | null;
  cost_per_click_cents: number | null;
  cost_per_install_cents: number | null;
  cost_per_trial_cents: number | null;
  /** The CAC. */
  cost_per_paid_cents: number | null;
  view_to_click: number;
  trial_to_paid: number;
  roas_d7: number;
  roas_d30: number;
  roas_d90: number;
  /** Every horizon with its maturity badge. */
  roas: Record<RoasHorizon, RoasPoint>;
  /** The first day on which cumulative tracked revenue reached cost (1 = day of posting). Null if not yet. */
  payback_day: number | null;
  /** Days of revenue data the cohort has. */
  observed_days: number;
}

/**
 * Brand cost = creator pay + platform fee (+ ad commission and spend for promoted posts). Stage costs divide cost by TRACKED counts
 * (link + code); estimated counts are shown separately and never mixed in. ROAS Dn = tracked revenue within n days of posting / cost.
 * payback_day = the first day on which cumulative tracked revenue >= cost (null if not yet, or when there is no cost).
 */
export function funnelStats(input: FunnelStatsInput): FunnelStats {
  const { cost_cents, views, clicks, installs, trials, paid, revenue_by_day_cents } = input;
  const per = (n: number): number | null => (n > 0 ? Math.round(cost_cents / n) : null);
  const cumulative: number[] = [];
  let run = 0;
  for (const r of revenue_by_day_cents) {
    run += r;
    cumulative.push(run);
  }
  const revenueTo = (d: number): number => cumulative[Math.min(d, cumulative.length) - 1] ?? 0;
  const roasAt = (d: number): number => (cost_cents > 0 ? round2(revenueTo(d) / cost_cents) : 0);
  const point = (days: RoasHorizon): RoasPoint => ({ days, value: roasAt(days), revenue_cents: revenueTo(days), maturity: maturityOf(days), mature: cumulative.length >= days });
  const idx = cost_cents > 0 ? cumulative.findIndex((x) => x >= cost_cents) : -1;
  return {
    cpm_effective_cents: views > 0 ? Math.round((cost_cents / views) * 1000) : null,
    cost_per_click_cents: per(clicks),
    cost_per_install_cents: per(installs),
    cost_per_trial_cents: per(trials),
    cost_per_paid_cents: per(paid),
    view_to_click: views > 0 ? roundTo(clicks / views, 4) : 0,
    trial_to_paid: trials > 0 ? roundTo(paid / trials, 4) : 0,
    roas_d7: roasAt(7),
    roas_d30: roasAt(30),
    roas_d90: roasAt(90),
    roas: { 7: point(7), 14: point(14), 30: point(30), 60: point(60), 90: point(90) },
    payback_day: idx === -1 ? null : idx + 1,
    observed_days: cumulative.length,
  };
}

/**
 * Builds the revenue-by-day series (index 0 = day 1 = the posting date, UTC) from conversion batches. Only tracked revenue counts
 * (link and code), and rejected or refunded batches are excluded. `days` fixes the length; days with no revenue are 0. Revenue dated
 * after `through` (default: the last day) is not counted, so a young cohort has a short series.
 */
export function revenueByDay(params: { batches: readonly ConversionLike[]; posted_on: IsoDate; days: number; through?: IsoDate }): number[] {
  const start = toMs(params.posted_on);
  const lastDay = params.through ? Math.min(params.days, Math.floor((toMs(params.through) - start) / DAY_MS) + 1) : params.days;
  const out: number[] = Array.from({ length: Math.max(0, lastDay) }, () => 0);
  for (const b of params.batches) {
    if (!b.occurred_on || b.status === "rejected" || b.status === "refunded" || !isPayableSource(b.source)) continue;
    const i = Math.floor((toMs(b.occurred_on) - start) / DAY_MS);
    if (i >= 0 && i < out.length) out[i] += b.revenue_cents ?? 0;
  }
  return out;
}

// ── aggregation (creator league, hook and format leaderboards) ─────────────────────────────────

export interface FunnelRow {
  /** The grouping key: a creator id, a hook type, a format id. */
  key: string;
  /** Items in the group. */
  n: number;
  funnel: FunnelCounts;
  cost_cents: number;
  cost_per_trial_cents: number | null;
  cost_per_paid_cents: number | null;
  /** Trials per install. */
  trial_rate: number | null;
}

/**
 * Groups items with a funnel and a cost by a key and totals each group. Sorted by cost per trial ascending (cheapest first, groups with
 * no trials last), the creator-league ordering: judge creators on cost per trial, not views.
 */
export function aggregateFunnelBy<T extends { funnel: FunnelCounts; cost_cents?: number }>(items: readonly T[], key: (item: T) => string): FunnelRow[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  const rows: FunnelRow[] = [];
  for (const [k, list] of groups) {
    const funnel = sumFunnels(list.map((i) => i.funnel));
    const cost = sum(list.map((i) => i.cost_cents ?? 0));
    rows.push({
      key: k,
      n: list.length,
      funnel,
      cost_cents: cost,
      cost_per_trial_cents: funnel.trials > 0 ? Math.round(cost / funnel.trials) : null,
      cost_per_paid_cents: funnel.paid > 0 ? Math.round(cost / funnel.paid) : null,
      trial_rate: trialRate(funnel),
    });
  }
  return rows.sort((a, b) => {
    if (a.cost_per_trial_cents === null && b.cost_per_trial_cents === null) return b.funnel.views - a.funnel.views || a.key.localeCompare(b.key);
    if (a.cost_per_trial_cents === null) return 1;
    if (b.cost_per_trial_cents === null) return -1;
    return a.cost_per_trial_cents - b.cost_per_trial_cents || a.key.localeCompare(b.key);
  });
}

// ── fatigue ────────────────────────────────────────────────────────────────────────────────────

export interface FatigueReading {
  fatigued: boolean;
  /** Highest smoothed value seen. */
  peak_value: number;
  /** Smoothed value now. */
  current_value: number;
  /** 1 - current / peak. 0.30 or more triggers the alert. */
  drop_ratio: number;
  peak_on?: IsoDate;
}

/** The rule that fires a fatigue alert: the trial-start rate (or CTR, or install yield) fell 30% from its peak. */
export const FATIGUE_DROP_THRESHOLD = 0.3;

/**
 * Fatigue detection (day-one rule): smooth a daily series with a trailing window (default 3 days) and compare today's smoothed value with the
 * peak. Needs at least `window + 2` points so one noisy day cannot raise an alert. Series are oldest first.
 */
export function detectFatigue(series: readonly { date: IsoDate; value: number }[], window = 3): FatigueReading {
  if (series.length < window + 2) return { fatigued: false, peak_value: 0, current_value: 0, drop_ratio: 0 };
  const smoothed = series.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = series.slice(from, i + 1);
    return sum(slice.map((p) => p.value)) / slice.length;
  });
  let peakIdx = window - 1;
  for (let i = window - 1; i < smoothed.length; i += 1) if (smoothed[i] > smoothed[peakIdx]) peakIdx = i;
  const peak = smoothed[peakIdx];
  const current = smoothed[smoothed.length - 1];
  const drop = peak > 0 ? clamp(1 - current / peak, 0, 1) : 0;
  return { fatigued: drop >= FATIGUE_DROP_THRESHOLD, peak_value: peak, current_value: current, drop_ratio: round2(drop), peak_on: series[peakIdx].date };
}
