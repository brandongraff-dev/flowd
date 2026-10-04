import { describe, expect, it } from "vitest";
import { CONSTANTS } from "../constants";
import {
  NATURAL_FIRST_DAY_SHARE,
  assessFraud,
  classifyCurve,
  creatorFraudEvidence,
  detectBoughtViewsPattern,
  detectCapClustering,
  detectCapSnap,
  detectCurveShape,
  detectDuplicateHash,
  detectEngagementAnomaly,
  detectGeoMismatch,
  detectNewAccount,
  detectTrafficSourceAnomaly,
  detectViewSpikeNoEngagement,
  detectViewToFollowerOutlier,
  expectedViewCurve,
  followerQuality,
  fraudAction,
  fraudActionText,
  fraudBand,
  fraudScore,
  longestNoDecayRun,
  topTwoHourShare,
  type FraudInput,
} from "../fraud";
import { sum } from "../stats";

const NOW = "2026-10-03T14:00:00Z";
const organic = (total = 100_000, hours = 72): number[] => expectedViewCurve({ total_views: total, hours }).expected.map((v) => Math.round(v));
const stepped = (): number[] => Array.from({ length: 72 }, (_, i) => (i === 10 || i === 11 ? 20_000 : 20));
const healthy = (over: Partial<FraudInput> = {}): FraudInput => ({ hourly_views: organic(), views: 100_000, likes: 6000, comments: 400, shares: 300, followers: 48_200, account_age_days: 400, ...over });

describe("score composition (DOMAIN worked example)", () => {
  it("scores the spiky no-engagement post 60 and sends it to a human", () => {
    const r = fraudScore([
      { signal: "view_spike_no_engagement", severity: 0.8 },
      { signal: "bought_views_pattern", severity: 0.9 },
      { signal: "traffic_source_anomaly", severity: 0.7 },
      { signal: "curve_shape", severity: 0.6 },
    ]);
    expect(r.signals.map((s) => [s.signal, s.points])).toEqual([
      ["view_spike_no_engagement", 20],
      ["bought_views_pattern", 27],
      ["traffic_source_anomaly", 7],
      ["curve_shape", 6],
    ]);
    expect(r.score).toBe(60);
    expect(r.band).toBe("review");
    expect(fraudAction(r.score)).toBe("hold_for_human_review");
    expect(r.signals[0].detail).toBe(CONSTANTS.fraud.signals.view_spike_no_engagement.rule);
  });

  it("scores a new account with a low engagement 15 and clean", () => {
    const r = fraudScore([
      { signal: "new_account", severity: 1 },
      { signal: "engagement_anomaly", severity: 0.5 },
    ]);
    expect(r.score).toBe(15);
    expect(r.band).toBe("clean");
    expect(fraudScore([]).score).toBe(0);
  });

  it("drops zero-point signals, keeps custom detail, and caps at 100", () => {
    const r = fraudScore([
      { signal: "new_account", severity: 0.01, detail: "tiny" },
      { signal: "duplicate_hash", severity: 1, detail: "same video" },
    ]);
    expect(r.signals.map((s) => s.signal)).toEqual(["duplicate_hash"]);
    expect(r.signals[0].detail).toBe("same video");
    const all = fraudScore(Object.keys(CONSTANTS.fraud.signals).map((signal) => ({ signal: signal as keyof typeof CONSTANTS.fraud.signals, severity: 1 })));
    expect(sum(Object.values(CONSTANTS.fraud.signals).map((s) => s.max_points))).toBe(160);
    expect(all.score).toBe(100);
    expect(all.band).toBe("high");
  });

  it("cuts bands at 19, 39 and 69", () => {
    expect([0, 19, 20, 39, 40, 69, 70, 100].map(fraudBand)).toEqual(["clean", "clean", "watch", "watch", "review", "review", "high", "high"]);
    expect([0, 39, 40, 69, 70, 100].map(fraudAction)).toEqual(["auto_clear", "auto_clear", "hold_for_human_review", "hold_for_human_review", "auto_hold_and_queue", "auto_hold_and_queue"]);
  });

  it("describes every action in words about the views", () => {
    expect(fraudActionText("auto_clear")).toMatch(/natural/);
    expect(fraudActionText("hold_for_human_review")).toMatch(/24 hours/);
    expect(fraudActionText("auto_hold_and_queue")).toMatch(/legitimate views already delivered are still paid/);
  });
});

describe("the view curve", () => {
  it("draws a natural curve with about 70% of views in the first day", () => {
    expect(NATURAL_FIRST_DAY_SHARE).toBe(0.7);
    const { expected, low, high } = expectedViewCurve({ total_views: 100_000, hours: 72 });
    expect(expected).toHaveLength(72);
    expect(sum(expected)).toBeCloseTo(100_000, 6);
    expect(sum(expected.slice(0, 24)) / 100_000).toBeCloseTo(0.7 / (1 - 0.3 ** 3), 3);
    for (let i = 1; i < expected.length; i += 1) expect(expected[i]).toBeLessThan(expected[i - 1]);
    expect(low[5]).toBeCloseTo(expected[5] * 0.5, 9);
    expect(high[5]).toBeCloseTo(expected[5] * 2, 9);
    expect(expectedViewCurve({ total_views: 10, hours: 0 })).toEqual({ expected: [], low: [], high: [] });
  });

  it("measures the share of views in the two busiest hours", () => {
    expect(topTwoHourShare([10, 20, 30, 40])).toBeCloseTo(0.7, 6);
    expect(topTwoHourShare([])).toBe(0);
    expect(topTwoHourShare([0, 0])).toBe(0);
    expect(topTwoHourShare(stepped())).toBeGreaterThan(0.9);
  });

  it("finds the longest run of hours with no decay after the peak", () => {
    expect(longestNoDecayRun(organic())).toBe(0);
    expect(longestNoDecayRun(Array.from({ length: 72 }, () => 500))).toBe(71);
    expect(longestNoDecayRun([1000, 400, 400, 410, 405, 600, 100])).toBe(4);
    expect(longestNoDecayRun([1000, 900, 800, 700])).toBe(0); // a 10% hourly loss is decay
    expect(longestNoDecayRun([5])).toBe(0);
    expect(longestNoDecayRun([])).toBe(0);
  });

  it("classifies organic, stepped, spiky and flat curves", () => {
    expect(classifyCurve(organic())).toBe("organic");
    expect(classifyCurve(stepped())).toBe("stepped");
    const spiky = organic();
    spiky[30] = spiky[30] * 40 + 4000;
    expect(classifyCurve(spiky)).toBe("spiky");
    expect(classifyCurve(Array.from({ length: 72 }, () => 500))).toBe("flat");
    expect(classifyCurve([1, 2, 3])).toBe("organic");
    expect(classifyCurve(Array.from({ length: 24 }, () => 0))).toBe("organic");
  });
});

describe("view spike with no engagement", () => {
  const spikeCurve = (): number[] => {
    const h = Array.from({ length: 48 }, (_, i) => Math.round(400 * 0.97 ** i));
    h[12] = 20_000;
    return h;
  };

  it("fires when an hour is 10x the usual and engagement is under 0.5%", () => {
    const h = spikeCurve();
    const s = detectViewSpikeNoEngagement({ hourly_views: h, likes: 20, comments: 2, followers: 5000, account_age_days: 100 });
    expect(s?.signal).toBe("view_spike_no_engagement");
    expect(s?.severity).toBeGreaterThan(0.6);
    expect(s?.severity).toBeLessThanOrEqual(1);
    expect(s?.detail).toMatch(/Hour 13 had/);
  });

  it("does not fire when real people reacted", () => {
    const h = spikeCurve();
    expect(detectViewSpikeNoEngagement({ hourly_views: h, likes: 3000, comments: 200, followers: 5000, account_age_days: 100 })).toBeNull();
  });

  it("does not fire on a natural decay, a tiny post, or a post with too few hours", () => {
    expect(detectViewSpikeNoEngagement(healthy({ likes: 0, comments: 0, shares: 0 }))).toBeNull();
    expect(detectViewSpikeNoEngagement({ hourly_views: [5, 80, 3, 4, 5], likes: 0, comments: 0, followers: 100, account_age_days: 100 })).toBeNull();
    expect(detectViewSpikeNoEngagement({ hourly_views: [100, 200], likes: 0, comments: 0, followers: 100, account_age_days: 100 })).toBeNull();
    expect(detectViewSpikeNoEngagement({ hourly_views: [0, 0, 0, 0, 0], likes: 0, comments: 0, followers: 100, account_age_days: 100 })).toBeNull();
  });

  it("judges against the creator's usual hourly views when given", () => {
    const h = Array.from({ length: 24 }, () => 3000);
    expect(detectViewSpikeNoEngagement({ hourly_views: h, likes: 10, comments: 0, followers: 5000, account_age_days: 100 })).toBeNull();
    expect(detectViewSpikeNoEngagement({ hourly_views: h, likes: 10, comments: 0, followers: 5000, account_age_days: 100, baseline_hourly_views: 200 })?.signal).toBe("view_spike_no_engagement");
  });
});

describe("cap clustering and the cap snap", () => {
  it("fires when 3 of the last 5 posts land within 2% of the cap", () => {
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_600, 24_800, 24_900, 10_000, 5000] })).toMatchObject({ signal: "cap_clustering", severity: 0.6 });
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_600, 24_800, 24_900, 10_000, 24_990] })?.severity).toBe(0.8);
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [25_000, 25_000, 24_900, 25_000, 24_700] })?.severity).toBe(1);
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_600, 24_800, 10_000, 10_000, 5000] })).toBeNull();
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_600, 24_800] })).toBeNull();
    expect(detectCapClustering({ recent_earnings_cents: [24_600, 24_800, 24_900] })).toBeNull();
    expect(detectCapClustering({ per_video_cap_cents: 25_000 })).toBeNull();
  });

  it("only looks at the last 5 posts and detail names the count", () => {
    const s = detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [25_000, 25_000, 25_000, 100, 100, 100, 100, 100] });
    expect(s).toBeNull();
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_990, 24_990, 1, 1, 1, 1] })).toBeNull();
    expect(detectCapClustering({ per_video_cap_cents: 25_000, recent_earnings_cents: [24_990, 24_990, 24_990] })?.detail).toBe("3 of the last 3 posts paid within 2% of the per-video cap.");
  });

  it("catches views that stop right where the pay reaches the cap", () => {
    // $2.00 CPM, $250 cap: the cap is reached at 125,000 views
    const climb = Array.from({ length: 48 }, () => 2604);
    const tail = Array.from({ length: 24 }, () => 4);
    const h = [...climb, ...tail];
    const total = sum(h);
    expect(total).toBeGreaterThanOrEqual(125_000);
    expect(total).toBeLessThanOrEqual(126_250);
    const s = detectCapSnap({ hourly_views: h, cpm_cents: 200, per_video_cap_cents: 25_000 });
    expect(s).toMatchObject({ signal: "cap_clustering", severity: 0.8 });
    expect(s?.detail).toMatch(/\$250\.00 cap/);
  });

  it("does not call a post a snap when it is far from the cap, far past it, or still growing", () => {
    const base = { cpm_cents: 200, per_video_cap_cents: 25_000 };
    expect(detectCapSnap({ ...base, hourly_views: Array.from({ length: 72 }, () => 1000) })).toBeNull(); // 72,000 views
    expect(detectCapSnap({ ...base, hourly_views: Array.from({ length: 72 }, () => 1900) })).toBeNull(); // 136,800 views
    expect(detectCapSnap({ ...base, hourly_views: [...Array.from({ length: 48 }, () => 2000), ...Array.from({ length: 24 }, () => 1220)] })).toBeNull(); // 125,280 views but still growing
    expect(detectCapSnap({ cpm_cents: 0, per_video_cap_cents: 25_000, hourly_views: Array.from({ length: 72 }, () => 1000) })).toBeNull();
    expect(detectCapSnap({ hourly_views: [1, 2, 3] })).toBeNull();
  });
});

describe("bought views, geography, followers, account age, duplicates", () => {
  it("fires on a stepped curve with mostly unknown traffic, and not otherwise", () => {
    const s = detectBoughtViewsPattern({ hourly_views: stepped(), traffic_sources: { other: 0.8, fyp: 0.2 } });
    expect(s?.signal).toBe("bought_views_pattern");
    expect(s?.severity).toBeGreaterThanOrEqual(0.5);
    expect(s?.detail).toMatch(/two hours/);
    expect(detectBoughtViewsPattern({ hourly_views: stepped(), traffic_sources: { other: 0.6, fyp: 0.4 } })).toBeNull();
    expect(detectBoughtViewsPattern({ hourly_views: organic(), traffic_sources: { other: 0.9, fyp: 0.1 } })).toBeNull();
    expect(detectBoughtViewsPattern({ hourly_views: stepped() })).toBeNull();
    expect(detectBoughtViewsPattern({ hourly_views: [1, 2], traffic_sources: { other: 1 } })).toBeNull();
    const worse = detectBoughtViewsPattern({ hourly_views: stepped(), traffic_sources: { other: 0.98 } });
    expect(worse?.severity ?? 0).toBeGreaterThan(s?.severity ?? 1);
  });

  it("normalises traffic counts as well as shares", () => {
    expect(detectTrafficSourceAnomaly({ traffic_sources: { other: 700, fyp: 300 } })?.severity).toBeCloseTo(0.3 + 0.7 * (0.2 / 0.4), 2);
    expect(detectTrafficSourceAnomaly({ traffic_sources: { other: 0.5, fyp: 0.5 } })).toBeNull();
    expect(detectTrafficSourceAnomaly({})).toBeNull();
    expect(detectTrafficSourceAnomaly({ traffic_sources: {} })).toBeNull();
    expect(detectTrafficSourceAnomaly({ traffic_sources: { other: 0.95, fyp: 0.05 } })?.severity).toBe(1);
  });

  it("fires when the audience in the target region is 25+ points under the minimum", () => {
    const s = detectGeoMismatch({ audience: { US: 0.2, BR: 0.8 }, target_regions: ["US"], min_target_audience_ratio: 0.5 });
    expect(s).toMatchObject({ signal: "geo_mismatch" });
    expect(s?.severity).toBeCloseTo(0.4 + 0.6 * (0.05 / 0.35), 2);
    expect(s?.detail).toMatch(/20% of the audience is in US; the bounty asks for 50%/);
    expect(detectGeoMismatch({ audience: { US: 0.25, BR: 0.75 }, target_regions: ["US"], min_target_audience_ratio: 0.5 })).toBeNull(); // exactly 25 points under
    expect(detectGeoMismatch({ audience: { US: 0.7 }, target_regions: ["US"], min_target_audience_ratio: 0.5 })).toBeNull();
    expect(detectGeoMismatch({ audience: { US: 0.1 }, target_regions: ["US"] })).toBeNull();
    expect(detectGeoMismatch({ audience: { US: 0.1 }, target_regions: [], min_target_audience_ratio: 0.5 })).toBeNull();
    expect(detectGeoMismatch({ target_regions: ["US"], min_target_audience_ratio: 0.5 })).toBeNull();
    expect(detectGeoMismatch({ audience: { US: 0, CA: 0.0 }, target_regions: ["US", "CA"], min_target_audience_ratio: 0.5 })).toBeNull();
    expect(detectGeoMismatch({ audience: { US: 0.1, CA: 0.2, BR: 0.7 }, target_regions: ["US", "CA"], min_target_audience_ratio: 0.6 })?.signal).toBe("geo_mismatch");
  });

  it("fires on views more than 40x followers under 5,000 followers", () => {
    expect(detectViewToFollowerOutlier({ followers: 1000, hourly_views: [], views: 80_000 })).toMatchObject({ signal: "view_to_follower_outlier" });
    expect(detectViewToFollowerOutlier({ followers: 1000, hourly_views: [], views: 80_000 })?.severity).toBeCloseTo(0.4 + 0.6 * (40 / 160), 2);
    expect(detectViewToFollowerOutlier({ followers: 1000, hourly_views: [], views: 40_000 })).toBeNull(); // exactly 40x
    expect(detectViewToFollowerOutlier({ followers: 5000, hourly_views: [], views: 900_000 })).toBeNull();
    expect(detectViewToFollowerOutlier({ followers: 0, hourly_views: [], views: 900_000 })).toBeNull();
    expect(detectViewToFollowerOutlier({ followers: 500, hourly_views: [], views: 1_000_000 })?.severity).toBe(1);
    expect(detectViewToFollowerOutlier({ followers: 1000, hourly_views: [50_000, 50_000] })?.signal).toBe("view_to_follower_outlier");
  });

  it("fires on accounts younger than 30 days, harder the newer", () => {
    expect(detectNewAccount({ account_age_days: 30 })).toBeNull();
    expect(detectNewAccount({ account_age_days: 400 })).toBeNull();
    expect(detectNewAccount({ account_age_days: 0 })?.severity).toBe(1);
    expect(detectNewAccount({ account_age_days: 5 })?.severity).toBeCloseTo(0.83, 2);
    expect(detectNewAccount({ account_age_days: 29 })?.severity).toBe(0.3);
    expect(detectNewAccount({ account_age_days: 5 })?.detail).toBe("The account is 5 days old (under 30).");
  });

  it("fires on a perceptual hash within 6 bits", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => detectDuplicateHash({ phash_distance: d })?.severity)).toEqual([1, 0.9, 0.9, 0.7, 0.7, 0.5, 0.5]);
    expect(detectDuplicateHash({ phash_distance: 7 })).toBeNull();
    expect(detectDuplicateHash({ phash_distance: null })).toBeNull();
    expect(detectDuplicateHash({})).toBeNull();
    expect(detectDuplicateHash({ phash_distance: 0 })?.detail).toMatch(/identical/);
    expect(detectDuplicateHash({ phash_distance: 4 })?.detail).toMatch(/within 4 bits/);
  });
});

describe("engagement and curve shape", () => {
  it("fires on likes under 0.4% of views, harder the lower", () => {
    const s = detectEngagementAnomaly({ likes: 100, comments: 5, hourly_views: [], views: 100_000 });
    expect(s?.signal).toBe("engagement_anomaly");
    expect(s?.severity).toBe(0.85);
    expect(detectEngagementAnomaly({ likes: 300, comments: 5, hourly_views: [], views: 100_000 })?.severity).toBeCloseTo(0.4 + 0.6 * (1 - 0.003 / 0.004), 2);
    expect(detectEngagementAnomaly({ likes: 400, comments: 5, hourly_views: [], views: 100_000 })).toBeNull();
    expect(detectEngagementAnomaly({ likes: 0, comments: 0, hourly_views: [], views: 900 })).toBeNull(); // too few views to judge
  });

  it("fires on a comment rate far from the account's norm", () => {
    const base = { likes: 6000, hourly_views: [], views: 100_000 };
    expect(detectEngagementAnomaly({ ...base, comments: 3000, comment_ratio_norm: 0.001 })?.severity).toBe(0.5);
    expect(detectEngagementAnomaly({ ...base, comments: 5, comment_ratio_norm: 0.001 })?.detail).toMatch(/10x below/);
    expect(detectEngagementAnomaly({ ...base, comments: 100, comment_ratio_norm: 0.001 })).toBeNull();
    expect(detectEngagementAnomaly({ ...base, comments: 3000 })).toBeNull();
    expect(detectEngagementAnomaly({ ...base, comments: 3000, comment_ratio_norm: 0 })).toBeNull();
  });

  it("fires when views stay level or rise for more than 24 hours", () => {
    const flat = Array.from({ length: 72 }, () => 500);
    const s = detectCurveShape({ hourly_views: flat });
    expect(s?.signal).toBe("curve_shape");
    expect(s?.severity).toBeGreaterThan(0.8);
    expect(detectCurveShape({ hourly_views: organic() })).toBeNull();
    expect(detectCurveShape({ hourly_views: Array.from({ length: 20 }, () => 500) })).toBeNull();
    expect(detectCurveShape({ hourly_views: [] })).toBeNull();
  });
});

describe("assessFraud", () => {
  it("clears a healthy post with no signals", () => {
    const r = assessFraud(healthy(), NOW);
    expect(r).toMatchObject({ score: 0, band: "clean", action: "auto_clear", curve_shape: "organic", assessed_at: NOW });
    expect(r.signals).toEqual([]);
    expect(r.explanation).toEqual([]);
  });

  it("holds a bought-views post for Ops, with every signal explained", () => {
    const r = assessFraud(
      {
        hourly_views: stepped(),
        likes: 40,
        comments: 1,
        followers: 800,
        account_age_days: 6,
        traffic_sources: { other: 0.86, fyp: 0.14 },
        audience: { US: 0.1, BR: 0.9 },
        target_regions: ["US"],
        min_target_audience_ratio: 0.5,
      },
      NOW,
    );
    const names = r.signals.map((s) => s.signal);
    expect(names).toEqual(expect.arrayContaining(["bought_views_pattern", "traffic_source_anomaly", "new_account", "geo_mismatch", "view_to_follower_outlier", "engagement_anomaly"]));
    expect(r.score).toBe(Math.min(100, sum(r.signals.map((s) => s.points))));
    expect(r.band).toBe("high");
    expect(r.action).toBe("auto_hold_and_queue");
    expect(r.curve_shape).toBe("stepped");
    expect(r.explanation).toHaveLength(r.signals.length);
    expect(r.explanation[0]).toMatch(/of \d+ points\)$/);
    for (const s of r.signals) expect(s.points).toBeLessThanOrEqual(CONSTANTS.fraud.signals[s.signal].max_points);
  });

  it("does not count a signal for which the data is missing", () => {
    const r = assessFraud({ hourly_views: organic(), likes: 6000, comments: 400, followers: 48_200, account_age_days: 400 }, NOW);
    expect(r.score).toBe(0);
  });

  it("uses the stronger of cap clustering and the cap snap, once", () => {
    const climb = Array.from({ length: 48 }, () => 2604);
    const h = [...climb, ...Array.from({ length: 24 }, () => 4)];
    const r = assessFraud({ hourly_views: h, likes: 9000, comments: 500, followers: 50_000, account_age_days: 500, cpm_cents: 200, per_video_cap_cents: 25_000, recent_earnings_cents: [24_990, 24_980, 24_970, 24_960, 25_000] }, NOW);
    expect(r.signals.filter((s) => s.signal === "cap_clustering")).toHaveLength(1);
    expect(r.signals.find((s) => s.signal === "cap_clustering")?.severity).toBe(1);
    const snapOnly = assessFraud({ hourly_views: h, likes: 9000, comments: 500, followers: 50_000, account_age_days: 500, cpm_cents: 200, per_video_cap_cents: 25_000 }, NOW);
    expect(snapOnly.signals.find((s) => s.signal === "cap_clustering")?.severity).toBe(0.8);
  });

  it("is deterministic", () => {
    const input = healthy({ account_age_days: 3, likes: 50 });
    expect(assessFraud(input, NOW)).toEqual(assessFraud(input, NOW));
  });
});

describe("evidence before approval", () => {
  it("rates follower quality from engagement and reach", () => {
    expect(followerQuality({ followers: 48_200, median_views_28d: 14_200, engagement_rate: 0.062 })).toBe(1);
    expect(followerQuality({ followers: 48_200, median_views_28d: 14_200, engagement_rate: 0.025 })).toBe(0.75);
    expect(followerQuality({ followers: 100_000, median_views_28d: 500, engagement_rate: 0.05 })).toBe(0.58); // reach 0.5% earns 0.17 of the reach half
    expect(followerQuality({ followers: 1000, median_views_28d: 4000, engagement_rate: 0.05 })).toBe(0.6); // views 4x followers earns 0.2 of the reach half
    expect(followerQuality({ followers: 0, median_views_28d: 0, engagement_rate: 0 })).toBe(0);
  });

  it("builds creator-level evidence from recent posts, newest weighted most", () => {
    const e = creatorFraudEvidence({
      recent_scores: [10, 0, 0, 0, 0],
      recent_shapes: ["organic", "organic", "spiky", "organic", "organic"],
      audience_us_ratio: 0.71,
      followers: 48_200,
      median_views_28d: 14_200,
      engagement_rate: 0.062,
    });
    expect(e).toMatchObject({ creator_fraud_score: 3, creator_fraud_band: "clean", audience_us_ratio: 0.71, view_curve_shape: "organic", follower_quality: 1 });
    expect(e.duplicate_of_submission_id).toBeUndefined();
    const dup = creatorFraudEvidence({ recent_scores: [80, 70], recent_shapes: ["stepped", "stepped"], audience_us_ratio: 0.2, followers: 900, median_views_28d: 200_000, engagement_rate: 0.001, duplicate: { submission_id: "sub_0042", phash_distance: 2 } });
    expect(dup).toMatchObject({ creator_fraud_band: "high", view_curve_shape: "stepped", duplicate_of_submission_id: "sub_0042", phash_distance: 2 });
    expect(dup.follower_quality).toBeLessThan(0.1);
  });

  it("has a neutral answer for a creator with no history", () => {
    const e = creatorFraudEvidence({ recent_scores: [], recent_shapes: [], audience_us_ratio: 0.5, followers: 1000, median_views_28d: 300, engagement_rate: 0.04 });
    expect(e.creator_fraud_score).toBe(0);
    expect(e.view_curve_shape).toBe("organic");
  });

  it("breaks shape ties toward the calmer shape", () => {
    expect(creatorFraudEvidence({ recent_scores: [1, 1], recent_shapes: ["spiky", "flat"], audience_us_ratio: 1, followers: 1000, median_views_28d: 300, engagement_rate: 0.04 }).view_curve_shape).toBe("flat");
  });
});
