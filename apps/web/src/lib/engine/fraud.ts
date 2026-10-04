/**
 * View-fraud scoring: ten explainable signals, a 0 to 100 score, and a named action.
 *
 * Fraud score = min(100, sum over fired signals of round(max_points x severity)). Bands: clean 0 to 19 (auto-clear), watch 20 to 39
 * (auto-clear, logged), review 40 to 69 (held for a human within 24 hours), high 70 and up (auto-hold and queued for Ops).
 *
 * Only PROVEN fraud is clawed back, and legitimate views already delivered are still paid. Every score shows its signals as evidence, with
 * plain-English detail, so it can be disputed. This is the day-one rules engine (the anomaly model comes once posts settle); each detector
 * is a pure function over numbers the platform already collects.
 */

import type { Country, CurveShape, FraudAssessment, FraudBand, FraudEvidence, FraudSignal, FraudSignalHit, IsoTimestamp, TrafficSource } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { formatInt, formatMoney, formatPercent } from "./money";
import { clamp, clamp01, median, round2, sum } from "./stats";

// ── composition (DOMAIN section 11) ────────────────────────────────────────────────────────────

/** clean 0 to 19, watch 20 to 39, review 40 to 69, high 70 and up. */
export function fraudBand(score: number): FraudBand {
  const b = CONSTANTS.fraud.bands;
  return score <= b.clean[1] ? "clean" : score <= b.watch[1] ? "watch" : score <= b.review[1] ? "review" : "high";
}

/** What a score does to money. */
export type FraudAction = "auto_clear" | "hold_for_human_review" | "auto_hold_and_queue";

export function fraudAction(score: number): FraudAction {
  return score >= CONSTANTS.fraud.hold_threshold ? "auto_hold_and_queue" : score >= CONSTANTS.fraud.review_threshold ? "hold_for_human_review" : "auto_clear";
}

/** A signal that fired, before it is turned into points. */
export interface FiredSignal {
  signal: FraudSignal;
  /** 0 to 1: how strongly the rule fired. */
  severity: number;
  detail?: string;
}

/** Score composition: points = round(max_points x severity), score = min(100, sum). Zero-point signals are dropped. */
export function fraudScore(signals: readonly FiredSignal[]): { score: number; band: FraudBand; signals: FraudSignalHit[] } {
  const hits: FraudSignalHit[] = signals
    .map((s) => ({
      signal: s.signal,
      severity: s.severity,
      points: Math.round(CONSTANTS.fraud.signals[s.signal].max_points * s.severity),
      detail: s.detail ?? CONSTANTS.fraud.signals[s.signal].rule,
    }))
    .filter((h) => h.points > 0);
  const score = Math.min(100, hits.reduce((n, h) => n + h.points, 0));
  return { score, band: fraudBand(score), signals: hits };
}

// ── the view curve ─────────────────────────────────────────────────────────────────────────────

/** Share of a post's views that arrive in the two busiest hours. */
export function topTwoHourShare(hourly: readonly number[]): number {
  const total = sum(hourly);
  if (total <= 0) return 0;
  const [a = 0, b = 0] = [...hourly].sort((x, y) => y - x);
  return (a + b) / total;
}

/**
 * Classifies a view curve:
 *  - stepped: 80% or more of views in two hourly buckets and little elsewhere (bought-views signature)
 *  - spiky:   one hour is at least 10x the median hour
 *  - flat:    a day or more with no decay (hourly views level or rising)
 *  - organic: fast start and a natural decay
 */
export function classifyCurve(hourly: readonly number[]): CurveShape {
  if (hourly.length < 6 || sum(hourly) <= 0) return "organic";
  const share = topTwoHourShare(hourly);
  const sorted = [...hourly].sort((a, b) => b - a);
  const rest = sorted.slice(2);
  const peak = sorted[0];
  const restMedian = median(rest);
  if (share >= 0.8 && restMedian <= peak * 0.05) return "stepped";
  const med = median(hourly.filter((v) => v > 0));
  if (med > 0 && peak >= 10 * med && hourly.indexOf(peak) > 1) return "spiky";
  if (longestNoDecayRun(hourly) > 24) return "flat";
  return "organic";
}

/**
 * The longest run of hours, after the peak, in which views stay level or rise (each hour at least 98% of the one before). A natural curve
 * loses about 5% an hour, so it never holds for a day; bought or botted views often do.
 */
export function longestNoDecayRun(hourly: readonly number[]): number {
  if (hourly.length < 2) return 0;
  const peakIdx = hourly.indexOf(Math.max(...hourly));
  let best = 0;
  let run = 0;
  for (let i = Math.max(0, peakIdx); i + 1 < hourly.length; i += 1) {
    if (hourly[i + 1] >= hourly[i] * 0.98 && hourly[i + 1] > 0) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

/** A natural view curve: about 70% of views in the first 24 hours. Used to draw the expected envelope on the review screen. */
export const NATURAL_FIRST_DAY_SHARE = 0.7;

/**
 * The expected hourly view curve for a post with `total_views` over `hours`, with a low and high band (0.5x and 2x). Exponential decay
 * calibrated so about 70% of lifetime views land in the first 24 hours; the sum of `expected` equals `total_views`.
 */
export function expectedViewCurve(params: { total_views: number; hours: number }): { expected: number[]; low: number[]; high: number[] } {
  const { total_views, hours } = params;
  if (hours <= 0) return { expected: [], low: [], high: [] };
  const k = -Math.log(1 - NATURAL_FIRST_DAY_SHARE) / 24;
  const norm = 1 - Math.exp(-k * hours);
  const expected: number[] = [];
  for (let i = 0; i < hours; i += 1) expected.push((total_views * (Math.exp(-k * i) - Math.exp(-k * (i + 1)))) / norm);
  return { expected, low: expected.map((v) => v * 0.5), high: expected.map((v) => v * 2) };
}

// ── detectors ──────────────────────────────────────────────────────────────────────────────────

/** Everything the detectors read about a post and the account behind it. All shares are 0..1 ratios. */
export interface FraudInput {
  /** Verified-view deltas per hour from the hour of posting, oldest first. */
  hourly_views: readonly number[];
  /** Lifetime views (defaults to the sum of the hourly deltas). */
  views?: number;
  likes: number;
  comments: number;
  shares?: number;
  followers: number;
  account_age_days: number;
  /** Traffic source mix (shares or counts; normalised). */
  traffic_sources?: Partial<Record<TrafficSource, number>>;
  /** Audience country mix (shares or counts; normalised). */
  audience?: Partial<Record<Country, number>>;
  /** The bounty's target countries and its minimum audience share in them. */
  target_regions?: readonly Country[];
  min_target_audience_ratio?: number;
  cpm_cents?: number;
  per_video_cap_cents?: number;
  /** Pool pay of the creator's last 5 posts including this one (cents). */
  recent_earnings_cents?: readonly number[];
  /** The creator's usual hourly views, to judge spikes against (defaults to the trailing hours of this post). */
  baseline_hourly_views?: number;
  /** The account's 28-day comments-per-view norm, for the comment-ratio outlier. */
  comment_ratio_norm?: number;
  /** Nearest perceptual-hash distance to another video, if any. */
  phash_distance?: number | null;
}

const total = (input: FraudInput): number => input.views ?? sum(input.hourly_views);
const shareOf = (mix: Partial<Record<string, number>> | undefined, keys: readonly string[]): number => {
  if (!mix) return 0;
  const all = sum(Object.values(mix).filter((v): v is number => typeof v === "number"));
  if (all <= 0) return 0;
  return sum(keys.map((k) => mix[k] ?? 0)) / all;
};

/** Hourly views at least 10x the baseline while engagement stays under 0.5% of views. */
export function detectViewSpikeNoEngagement(input: FraudInput): FiredSignal | null {
  const h = input.hourly_views;
  const views = total(input);
  if (h.length < 4 || views <= 0) return null;
  const engagement = (input.likes + input.comments + (input.shares ?? 0)) / views;
  let worst = 0;
  let worstAt = -1;
  for (let i = 1; i < h.length; i += 1) {
    const trailing = h.slice(Math.max(0, i - 6), i);
    const base = input.baseline_hourly_views ?? Math.max(1, sum(trailing) / Math.max(1, trailing.length));
    const ratio = h[i] / Math.max(1, base);
    if (h[i] >= 200 && ratio > worst) {
      worst = ratio;
      worstAt = i;
    }
  }
  if (worst < 10 || engagement >= 0.005) return null;
  const severity = clamp(0.4 + 0.35 * Math.min(1, (worst - 10) / 30) + 0.25 * (1 - engagement / 0.005), 0, 1);
  return { signal: "view_spike_no_engagement", severity: round2(severity), detail: `Hour ${worstAt + 1} had ${worst.toFixed(0)}x the usual hourly views while engagement stayed at ${formatPercent(engagement, 2)} of views.` };
}

/** Earnings land within 2% of the per-video cap on 3 of the last 5 posts. */
export function detectCapClustering(input: Pick<FraudInput, "recent_earnings_cents" | "per_video_cap_cents">): FiredSignal | null {
  const cap = input.per_video_cap_cents;
  const earnings = input.recent_earnings_cents;
  if (!cap || !earnings || earnings.length < 3) return null;
  const last = earnings.slice(-5);
  const near = last.filter((e) => e >= cap * 0.98 && e <= cap).length;
  if (near < 3) return null;
  const severity = near >= 5 ? 1 : near === 4 ? 0.8 : 0.6;
  return { signal: "cap_clustering", severity, detail: `${near} of the last ${last.length} posts paid within 2% of the per-video cap.` };
}

/**
 * The cap-snap detector: views stop growing right where the pool pay reaches the per-video cap. The views needed to hit the cap are
 * cap / CPM x 1,000; a post whose lifetime views land within 1% above that line and then go flat is "snapping" to the cap.
 */
export function detectCapSnap(input: Pick<FraudInput, "hourly_views" | "views" | "cpm_cents" | "per_video_cap_cents">): FiredSignal | null {
  const { cpm_cents: cpm, per_video_cap_cents: cap } = input;
  if (!cpm || !cap || cpm <= 0) return null;
  const capViews = (cap / cpm) * 1000;
  const h = input.hourly_views;
  const views = input.views ?? sum(h);
  if (h.length < 12 || views < capViews || views > capViews * 1.01) return null;
  // flat after reaching the cap: the last 24 hours add under 1% of the total
  const tail = sum(h.slice(-24));
  if (tail > views * 0.01) return null;
  return { signal: "cap_clustering", severity: 0.8, detail: `Views stopped at ${formatInt(views)}, right where this post's pay reaches the ${formatMoney(cap)} cap.` };
}

/** 80% or more of views in two hourly buckets, flat otherwise, and over 60% from the "other" source. */
export function detectBoughtViewsPattern(input: Pick<FraudInput, "hourly_views" | "traffic_sources">): FiredSignal | null {
  const share = topTwoHourShare(input.hourly_views);
  const other = shareOf(input.traffic_sources, ["other"]);
  if (input.hourly_views.length < 6 || share < 0.8 || other <= 0.6) return null;
  const severity = clamp(0.5 + 0.35 * ((other - 0.6) / 0.4) + 0.15 * ((share - 0.8) / 0.2), 0.5, 1);
  return { signal: "bought_views_pattern", severity: round2(severity), detail: `${formatPercent(share, 0)} of views arrived in two hours, and ${formatPercent(other, 0)} came from an unknown external source.` };
}

/** Audience in the bounty's target region is more than 25 points below the bounty minimum. */
export function detectGeoMismatch(input: Pick<FraudInput, "audience" | "target_regions" | "min_target_audience_ratio">): FiredSignal | null {
  const min = input.min_target_audience_ratio;
  if (min === undefined || !input.audience || !input.target_regions || input.target_regions.length === 0) return null;
  if (sum(Object.values(input.audience).filter((v): v is number => typeof v === "number")) <= 0) return null; // no audience data is not a signal
  const actual = shareOf(input.audience, input.target_regions);
  const gap = min - actual;
  if (gap <= 0.25) return null;
  const severity = clamp(0.4 + 0.6 * ((gap - 0.25) / 0.35), 0.4, 1);
  return { signal: "geo_mismatch", severity: round2(severity), detail: `${formatPercent(actual, 0)} of the audience is in ${input.target_regions.join(", ")}; the bounty asks for ${formatPercent(min, 0)}.` };
}

/** Views are more than 40x followers on an account under 5,000 followers. */
export function detectViewToFollowerOutlier(input: Pick<FraudInput, "followers" | "hourly_views" | "views">): FiredSignal | null {
  const views = input.views ?? sum(input.hourly_views);
  if (input.followers <= 0 || input.followers >= 5000) return null;
  const ratio = views / input.followers;
  if (ratio <= 40) return null;
  const severity = clamp(0.4 + 0.6 * Math.min(1, (ratio - 40) / 160), 0.4, 1);
  return { signal: "view_to_follower_outlier", severity: round2(severity), detail: `${formatInt(views)} views on an account with ${formatInt(input.followers)} followers (${ratio.toFixed(0)}x).` };
}

/** Social account younger than 30 days. */
export function detectNewAccount(input: Pick<FraudInput, "account_age_days">): FiredSignal | null {
  if (input.account_age_days >= 30) return null;
  const severity = clamp(1 - input.account_age_days / 30, 0.3, 1);
  return { signal: "new_account", severity: round2(severity), detail: `The account is ${Math.max(0, Math.floor(input.account_age_days))} days old (under 30).` };
}

/** Perceptual hash within distance 6 of another creator's video or the creator's own earlier post. */
export function detectDuplicateHash(input: Pick<FraudInput, "phash_distance">): FiredSignal | null {
  const d = input.phash_distance;
  if (d === undefined || d === null || d > CONSTANTS.fraud.duplicate_phash_max_distance) return null;
  const severity = d === 0 ? 1 : d <= 2 ? 0.9 : d <= 4 ? 0.7 : 0.5;
  return { signal: "duplicate_hash", severity, detail: d === 0 ? "This video is identical to an earlier one." : `This video is within ${d} bits of an earlier one (the limit is ${CONSTANTS.fraud.duplicate_phash_max_distance}).` };
}

/** Likes under 0.4% of views, or a comment ratio that is an outlier against the account's norm. */
export function detectEngagementAnomaly(input: Pick<FraudInput, "likes" | "comments" | "hourly_views" | "views" | "comment_ratio_norm">): FiredSignal | null {
  const views = input.views ?? sum(input.hourly_views);
  if (views < 1000) return null;
  const likeRatio = input.likes / views;
  let severity = 0;
  const reasons: string[] = [];
  if (likeRatio < 0.004) {
    severity = Math.max(severity, 0.4 + 0.6 * (1 - likeRatio / 0.004));
    reasons.push(`likes are ${formatPercent(likeRatio, 2)} of views (under 0.4%)`);
  }
  const norm = input.comment_ratio_norm;
  if (norm !== undefined && norm > 0) {
    const commentRatio = input.comments / views;
    if (commentRatio >= norm * 5 || commentRatio <= norm * 0.1) {
      severity = Math.max(severity, 0.5);
      reasons.push(`the comment rate is ${commentRatio >= norm * 5 ? "5x above" : "10x below"} this account's norm`);
    }
  }
  if (severity === 0) return null;
  return { signal: "engagement_anomaly", severity: round2(clamp(severity, 0, 1)), detail: `Engagement looks off: ${reasons.join("; ")}.` };
}

/** More than 50% of views from external or "other" sources. */
export function detectTrafficSourceAnomaly(input: Pick<FraudInput, "traffic_sources">): FiredSignal | null {
  const other = shareOf(input.traffic_sources, ["other"]);
  if (other <= 0.5) return null;
  const severity = clamp(0.3 + 0.7 * ((other - 0.5) / 0.4), 0.3, 1);
  return { signal: "traffic_source_anomaly", severity: round2(severity), detail: `${formatPercent(other, 0)} of views came from external or unknown sources.` };
}

/** No natural decay: hourly views flat or rising for more than 24 hours. */
export function detectCurveShape(input: Pick<FraudInput, "hourly_views">): FiredSignal | null {
  const run = longestNoDecayRun(input.hourly_views);
  if (run <= 24) return null;
  const severity = clamp(0.4 + 0.6 * ((run - 24) / 48), 0.4, 1);
  return { signal: "curve_shape", severity: round2(severity), detail: `Views stayed level or rose for ${run} hours with no natural decay.` };
}

// ── assessment ─────────────────────────────────────────────────────────────────────────────────

export interface FraudResult extends FraudAssessment {
  action: FraudAction;
  curve_shape: CurveShape;
  /** One plain sentence per fired signal, for the evidence panel and a dispute-ready log. */
  explanation: string[];
}

/**
 * Runs all ten detectors over a post and composes the score. Detectors that lack the inputs they need do not fire (no data is not a signal).
 * `assessed_at` is injected; the result is otherwise deterministic. Cap clustering and the cap-snap detector share one signal: the stronger wins.
 */
export function assessFraud(input: FraudInput, assessedAt: IsoTimestamp): FraudResult {
  const clustering = detectCapClustering(input);
  const snap = detectCapSnap(input);
  const capSignal = clustering && snap ? (clustering.severity >= snap.severity ? clustering : snap) : (clustering ?? snap);
  const fired = [
    detectViewSpikeNoEngagement(input),
    capSignal,
    detectBoughtViewsPattern(input),
    detectGeoMismatch(input),
    detectViewToFollowerOutlier(input),
    detectNewAccount(input),
    detectDuplicateHash(input),
    detectEngagementAnomaly(input),
    detectTrafficSourceAnomaly(input),
    detectCurveShape(input),
  ].filter((s): s is FiredSignal => s !== null);
  const composed = fraudScore(fired);
  return {
    score: composed.score,
    band: composed.band,
    signals: composed.signals,
    assessed_at: assessedAt,
    action: fraudAction(composed.score),
    curve_shape: classifyCurve(input.hourly_views),
    explanation: composed.signals.map((s) => `${s.signal.replace(/_/g, " ")}: ${s.detail} (${s.points} of ${CONSTANTS.fraud.signals[s.signal].max_points} points)`),
  };
}

/** What the action means for the creator, in words that are about the views and never the person. */
export function fraudActionText(action: FraudAction): string {
  switch (action) {
    case "auto_clear":
      return "Views look natural. Earnings clear on schedule.";
    case "hold_for_human_review":
      return "A person is reviewing the views and decides within 24 hours. Legitimate views are still paid.";
    case "auto_hold_and_queue":
      return "Held and queued for Ops. Only proven fraud is clawed back, and legitimate views already delivered are still paid.";
  }
}

// ── creator-level evidence before approval ─────────────────────────────────────────────────────

/**
 * How believable an account's audience is, 0 to 1: engagement against a healthy 5%, and median views per follower inside a plausible band
 * (3% to 80%). Both halves count equally.
 */
export function followerQuality(params: { followers: number; median_views_28d: number; engagement_rate: number }): number {
  const eng = clamp01(params.engagement_rate / 0.05);
  const reach = params.followers > 0 ? params.median_views_28d / params.followers : 0;
  const reachScore = reach < 0.03 ? reach / 0.03 : reach > 0.8 ? 0.8 / reach : 1;
  return round2(0.5 * eng + 0.5 * clamp01(reachScore));
}

/**
 * The fraud evidence a brand sees in the review queue before approving, built from the creator's history (there is no post yet): the mean of
 * their recent post scores (newest weighted most), their typical curve shape, audience share, a duplicate match, and follower quality.
 */
export function creatorFraudEvidence(params: {
  /** Fraud scores of the creator's recent posts, newest first. */
  recent_scores: readonly number[];
  /** Curve shape of each of those posts, newest first. */
  recent_shapes: readonly CurveShape[];
  audience_us_ratio: number;
  followers: number;
  median_views_28d: number;
  engagement_rate: number;
  duplicate?: { submission_id: string; phash_distance: number };
}): FraudEvidence {
  const weights = params.recent_scores.map((_, i) => 0.8 ** i);
  const wsum = sum(weights);
  const score = wsum > 0 ? Math.round(sum(params.recent_scores.map((s, i) => s * weights[i])) / wsum) : 0;
  const counts = new Map<CurveShape, number>();
  for (const s of params.recent_shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  const order: CurveShape[] = ["organic", "flat", "stepped", "spiky"];
  const shape = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]?.[0] ?? "organic";
  return {
    creator_fraud_score: score,
    creator_fraud_band: fraudBand(score),
    audience_us_ratio: params.audience_us_ratio,
    view_curve_shape: shape,
    ...(params.duplicate ? { duplicate_of_submission_id: params.duplicate.submission_id, phash_distance: params.duplicate.phash_distance } : {}),
    follower_quality: followerQuality(params),
  };
}
