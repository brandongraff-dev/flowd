import { describe, expect, it } from "vitest";
import {
  approvalCopy,
  brandBadges,
  brandBandLabel,
  brandDecisionStats,
  brandReliability,
  buildBrandScorecard,
  creatorReasons,
  creatorReliability,
  decidesInAbout,
  reliabilityForBrandView,
  reviewClock,
  scorecardSample,
  slaDueAt,
  slaState,
  type BrandDecisionRecord,
  type CreatorReliabilityInput,
} from "../reputation";
import { NOW } from "./helpers";

/** The DOMAIN worked example: 21 of 27 finished posts approved, 6 Academy lessons. */
const approvedDays = ["2026-07-24", "2026-07-30", "2026-08-04", "2026-08-09", "2026-08-13", "2026-08-18", "2026-08-22", "2026-08-26", "2026-08-30", "2026-09-03", "2026-09-06", "2026-09-10", "2026-09-13", "2026-09-16", "2026-09-19", "2026-09-22", "2026-09-24", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"];
const rejectedDays = ["2026-07-27", "2026-08-06", "2026-08-20", "2026-09-01", "2026-09-08", "2026-09-20"];
const worked: CreatorReliabilityInput = {
  decisions: [...approvedDays.map((d) => ({ approved: true, decided_at: `${d}T12:00:00Z` })), ...rejectedDays.map((d) => ({ approved: false, decided_at: `${d}T12:00:00Z` }))],
  now: NOW,
  on_time: { ok: 17, total: 19 },
  post_through: { posted: 20, approved: 21 },
  compliance: { passed: 20, total: 21 },
  fraud_confirmed_90d: 0,
  clawbacks_90d: 0,
  disputes_lost_90d: 0,
  academy_lessons: 6,
};

describe("creator reliability (DOMAIN worked example)", () => {
  const r = creatorReliability(worked);

  it("scores 93 from five weighted components plus the Academy bonus", () => {
    expect(r.score).toBe(93);
    expect(r.provisional).toBe(false);
    expect(r.finished_n).toBe(27);
    expect(r.components.map((c) => [c.key, c.value, c.weight, c.points])).toEqual([
      ["finished_approval", 0.8, 0.3, 24.12],
      ["on_time", 0.89, 0.2, 17.89],
      ["post_through", 0.95, 0.2, 19.05],
      ["compliance", 0.95, 0.2, 19.05],
      ["clean_record", 1, 0.1, 10],
    ]);
    expect(r.academy_bonus_points).toBe(3);
  });

  it("weights recent decisions more: the recency-weighted rate is above the plain 78%", () => {
    expect(r.approval_rate_raw).toBe(0.78);
    expect(r.approval_rate_finished).toBe(0.8);
    expect(r.approval_rate_finished).toBeGreaterThan(r.approval_rate_raw);
  });

  it("explains every component in plain English", () => {
    expect(r.components[0].reason).toBe("80% of 27 finished posts approved, recent ones count more.");
    expect(r.components[1].reason).toBe("17 of 19 on time.");
    expect(r.components[2].reason).toBe("20 of 21 approved videos posted within 7 days.");
    expect(r.components[3].reason).toBe("20 of 21 posts passed the disclosure check first time.");
    expect(r.components[4].reason).toBe("0 confirmed fraud, 0 clawbacks, 0 lost disputes.");
    expect(r.components[0].label).toBe("Finished-work approval (recency-weighted)");
  });

  it("is shown with reasons on the creator's own profile", () => {
    const lines = creatorReasons(r, 21);
    expect(lines[0]).toBe("93. 21 of 27 finished posts approved.");
    expect(lines).toHaveLength(7);
    expect(lines[lines.length - 1]).toBe("Academy bonus: +3.");
  });

  it("caps the Academy bonus at 5 and the score at 100", () => {
    const perfect = creatorReliability({ ...worked, decisions: approvedDays.map((d) => ({ approved: true, decided_at: `${d}T12:00:00Z` })), on_time: { ok: 5, total: 5 }, post_through: { posted: 5, approved: 5 }, compliance: { passed: 5, total: 5 }, academy_lessons: 30 });
    expect(perfect.academy_bonus_points).toBe(5);
    expect(perfect.score).toBe(100);
  });

  it("counts confirmed fraud, clawbacks and lost disputes against the clean record only", () => {
    const bad = creatorReliability({ ...worked, fraud_confirmed_90d: 1, clawbacks_90d: 1, disputes_lost_90d: 2, academy_lessons: 0 });
    expect(bad.components[4].value).toBe(0); // 1 - 0.4 - 0.3 - 0.3 = 0
    expect(bad.score).toBeLessThan(r.score - 10);
    expect(creatorReliability({ ...worked, disputes_lost_90d: 1 }).components[4].value).toBe(0.85);
  });

  it("is provisional (70, building history) under 5 finished decisions, and never penalises a short record", () => {
    const young = creatorReliability({ ...worked, decisions: worked.decisions.slice(0, 4) });
    expect(young).toMatchObject({ score: 70, provisional: true, finished_n: 4 });
    expect(creatorReliability({ ...worked, decisions: worked.decisions.slice(0, 5) }).provisional).toBe(false);
    expect(creatorReasons(young, 4)[0]).toMatch(/Building history\. 4 of 5 finished posts/);
  });

  it("treats a component with nothing to measure as no evidence against", () => {
    const fresh = creatorReliability({ ...worked, on_time: { ok: 0, total: 0 }, post_through: { posted: 0, approved: 0 }, compliance: { passed: 0, total: 0 } });
    expect(fresh.components.map((c) => c.value)).toEqual([0.8, 1, 1, 1, 1]);
  });

  it("handles no decisions at all", () => {
    const none = creatorReliability({ ...worked, decisions: [] });
    expect(none.provisional).toBe(true);
    expect(none.approval_rate_finished).toBe(0);
    expect(none.approval_rate_raw).toBe(0);
  });

  it("weights an old rejection less than a recent one", () => {
    const oldBad: CreatorReliabilityInput = { ...worked, decisions: [{ approved: false, decided_at: "2026-05-01T00:00:00Z" }, ...Array.from({ length: 5 }, () => ({ approved: true, decided_at: "2026-10-01T00:00:00Z" }))] };
    const newBad: CreatorReliabilityInput = { ...worked, decisions: [{ approved: false, decided_at: "2026-10-02T00:00:00Z" }, ...Array.from({ length: 5 }, () => ({ approved: true, decided_at: "2026-10-01T00:00:00Z" }))] };
    expect(creatorReliability(oldBad).approval_rate_finished).toBeGreaterThan(creatorReliability(newBad).approval_rate_finished);
  });

  it("shows brands a range, not a verdict, while history is short", () => {
    expect(reliabilityForBrandView({ score: 93, provisional: false, finished_n: 27 })).toEqual({ kind: "verdict", score: 93, label: "93 reliability" });
    expect(reliabilityForBrandView({ score: 70, provisional: true, finished_n: 0 })).toEqual({ kind: "range", low: 45, high: 95, label: "Building history (45 to 95)" });
    expect(reliabilityForBrandView({ score: 70, provisional: true, finished_n: 4 })).toEqual({ kind: "range", low: 61, high: 79, label: "Building history (61 to 79)" });
  });
});

describe("brand reliability (DOMAIN worked example: Lumi)", () => {
  const lumi = brandReliability({ decisions_n: 64, approved_n: 49, decision_hours_median: 11.2, appeals_overturned: 1, pays_on_time_ratio: 0.99, run_rate: 0.93, reply_hours_median: 4.5 });

  it("scores 97 and band excellent", () => {
    expect(lumi.score).toBe(97);
    expect(lumi.band).toBe("excellent");
    expect(lumi.components.map((c) => [c.key, c.value, c.points])).toEqual([
      ["decision_speed", 1, 30],
      ["approval_fairness", 0.97, 24.17],
      ["pays_on_time", 0.99, 19.8],
      ["run_rate", 0.93, 13.95],
      ["reply_speed", 0.95, 9.46],
    ]);
    expect(lumi.rejection_rate).toBe(0.23);
  });

  it("explains each component", () => {
    expect(lumi.components[0].reason).toBe("Median 11.2 h to decide (best 12 h, worst 72 h).");
    expect(lumi.components[1].reason).toBe("23% of decisions were rejections; 1 overturned on appeal.");
    expect(lumi.components[2].reason).toBe("99% of commissions, offers and top-ups funded on time.");
    expect(lumi.components[3].reason).toBe("93% of approved work was posted or used within 30 days.");
    expect(lumi.components[4].reason).toBe("Median 4.5 h to reply.");
  });

  it("scores a slow, strict brand poor", () => {
    const poor = brandReliability({ decisions_n: 22, approved_n: 9, decision_hours_median: 58, appeals_overturned: 3, pays_on_time_ratio: 0.8, run_rate: 0.5, reply_hours_median: 30 });
    expect(poor).toMatchObject({ score: 38, band: "poor" });
  });

  it("is a new brand under 10 decisions, however good the numbers", () => {
    const fresh = brandReliability({ decisions_n: 6, approved_n: 6, decision_hours_median: 8, appeals_overturned: 0, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 1 });
    expect(fresh).toMatchObject({ score: 100, band: "new" });
    expect(brandBandLabel("new")).toBe("New brand");
  });

  it("grades bands at 90, 75 and 60", () => {
    const at = (hours: number) => brandReliability({ decisions_n: 50, approved_n: 40, decision_hours_median: hours, appeals_overturned: 0, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 2 });
    expect(at(12).band).toBe("excellent");
    expect(at(40).band).toBe("good"); // speed 0.53
    expect(at(60).band).toBe("good"); // 76 points
    expect(at(72).band).toBe("fair"); // 70 points: no speed credit at all
    const poor = brandReliability({ decisions_n: 50, approved_n: 40, decision_hours_median: 72, appeals_overturned: 0, pays_on_time_ratio: 0.6, run_rate: 0.5, reply_hours_median: 48 });
    expect(poor.band).toBe("poor");
  });

  it("rejection rates up to 30% are free and 70% scores zero fairness", () => {
    const f = (approved: number) => brandReliability({ decisions_n: 100, approved_n: approved, decision_hours_median: 12, appeals_overturned: 0, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 2 }).components[1].value;
    expect(f(70)).toBe(1); // 30% rejected
    expect(f(100)).toBe(1);
    expect(f(50)).toBe(0.5); // 50% rejected: 1 - 0.2 / 0.4
    expect(f(30)).toBe(0); // 70% rejected
    expect(f(0)).toBe(0);
  });

  it("deducts for appeals overturned, clamped at zero", () => {
    const f = (overturned: number) => brandReliability({ decisions_n: 100, approved_n: 70, decision_hours_median: 12, appeals_overturned: overturned, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 2 }).components[1].value;
    expect(f(0)).toBe(1);
    expect(f(15)).toBe(0.75); // 15 of 30 rejections overturned: 1 - 0.25
    expect(f(30)).toBe(0.5);
  });

  it("never divides by zero", () => {
    const z = brandReliability({ decisions_n: 0, approved_n: 0, decision_hours_median: 0, appeals_overturned: 0, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 0 });
    expect(z.band).toBe("new");
    expect(z.rejection_rate).toBe(0);
  });
});

describe("badges and copy", () => {
  const base = { decision_hours_median: 11.2, funded_always: true, pays_on_time_ratio: 0.99, appeals_n: 2, appeals_overturned: 0, run_rate: 0.93, decisions_n: 64 };

  it("awards the badges a brand has earned", () => {
    expect(brandBadges(base)).toEqual(["fast_decisions", "fair_reviews", "runs_what_it_approves", "funded_always", "pays_on_time"]);
    expect(brandBadges({ ...base, decision_hours_median: 30, run_rate: 0.9, appeals_overturned: 1 })).toEqual(["funded_always", "pays_on_time"]);
    expect(brandBadges({ ...base, appeals_n: 0, appeals_overturned: 0 })).toContain("fair_reviews");
    expect(brandBadges({ ...base, appeals_n: 10, appeals_overturned: 1 })).toContain("fair_reviews");
    expect(brandBadges({ ...base, appeals_n: 10, appeals_overturned: 2 })).not.toContain("fair_reviews");
  });

  it("keeps decision badges for brands with at least 10 decisions", () => {
    expect(brandBadges({ ...base, decisions_n: 9 })).toEqual(["funded_always", "pays_on_time"]);
    expect(brandBadges({ ...base, funded_always: false, pays_on_time_ratio: 0.97, decisions_n: 9 })).toEqual([]);
  });

  it("writes the line on a bounty card, and nothing for a new brand", () => {
    expect(decidesInAbout({ band: "excellent", decision_hours_median: 11.2 })).toBe("Decides in about 11.2 h");
    expect(decidesInAbout({ band: "good", decision_hours_median: 50 })).toBe("Decides in about 2 days");
    expect(decidesInAbout({ band: "new", decision_hours_median: 3 })).toBeNull();
    expect(["excellent", "good", "fair", "poor"].map((b) => brandBandLabel(b as never))).toEqual(["Excellent", "Good", "Fair", "Poor"]);
    expect(approvalCopy(0.77)).toBe("77% approved");
    expect(scorecardSample({ decisions_n: 142, window_days: 90 })).toBe("142 decisions, 90 days");
  });
});

describe("Brand Scorecard from decision records", () => {
  const rec = (outcome: BrandDecisionRecord["outcome"], hours: number, extra: Partial<BrandDecisionRecord> = {}): BrandDecisionRecord => ({ outcome, hours_to_decide: hours, ...extra });
  const records: BrandDecisionRecord[] = [
    ...Array.from({ length: 8 }, () => rec("approved", 10)),
    rec("approved", 80),
    rec("rejected", 20, { appealed: true, overturned: true }),
    rec("rejected", 30, { appealed: true }),
    rec("changes_requested", 5),
    rec("changes_requested", 6),
  ];

  it("counts approvals and rejections only as decisions, and flags SLA breaches", () => {
    const s = brandDecisionStats(records);
    expect(s.decisions_n).toBe(11);
    expect(s.approved_n).toBe(9);
    expect(s.approval_rate).toBe(0.82);
    expect(s.rejection_rate).toBe(0.18);
    expect(s.sla_breaches).toBe(1);
    expect(s.appeals_n).toBe(2);
    expect(s.appeals_overturned).toBe(1);
    expect(s.decision_hours_median).toBe(10);
    expect(s.decision_hours_p90).toBeGreaterThan(20);
  });

  it("handles no records", () => {
    expect(brandDecisionStats([])).toMatchObject({ decisions_n: 0, approved_n: 0, approval_rate: 0, rejection_rate: 0, decision_hours_median: 0, sla_breaches: 0 });
  });

  it("builds the full Scorecard with reliability, band, badges and trend", () => {
    const sc = buildBrandScorecard({ id: "bsc_lumi", brand_id: "br_lumi", as_of: NOW, decisions: records, run_rate: 0.93, pays_on_time_ratio: 0.99, pay_speed_hours_median: 2, reply_hours_median: 4.5, funded_always: true, previous_score: 80 });
    expect(sc).toMatchObject({ id: "bsc_lumi", brand_id: "br_lumi", window_days: 90, as_of: NOW, decisions_n: 11, approved_n: 9, sla_breaches: 1, funded_always: true, band: "excellent" });
    expect(sc.reliability_score).toBeGreaterThanOrEqual(90);
    expect(sc.trend_30d).toBe(sc.reliability_score - 80);
    expect(sc.badges).toEqual(expect.arrayContaining(["funded_always", "pays_on_time", "runs_what_it_approves"]));
    expect(buildBrandScorecard({ id: "x", brand_id: "b", as_of: NOW, decisions: [], run_rate: 1, pays_on_time_ratio: 1, pay_speed_hours_median: 0, reply_hours_median: 0, funded_always: false }).trend_30d).toBe(0);
    expect(buildBrandScorecard({ id: "x", brand_id: "b", as_of: NOW, decisions: records.slice(0, 5), run_rate: 1, pays_on_time_ratio: 1, pay_speed_hours_median: 0, reply_hours_median: 0, funded_always: true }).band).toBe("new");
  });
});

describe("review SLA (DOMAIN worked example)", () => {
  it("maps hours in the queue to the state", () => {
    expect([10, 47.9, 48, 72, 72.5].map((h) => slaState(h))).toEqual(["on_track", "on_track", "stale", "stale", "breached"]);
    expect(slaState(0)).toBe("on_track");
    expect(slaState(47.99)).toBe("on_track");
    expect(slaState(72.01)).toBe("breached");
  });

  it("judges a decided submission as met or breached", () => {
    expect(slaState(11, true)).toBe("met");
    expect(slaState(72, true)).toBe("met");
    expect(slaState(72.5, true)).toBe("breached");
  });

  it("is due 72 hours after the version entered review", () => {
    expect(slaDueAt("2026-10-02T14:00:00Z")).toBe("2026-10-05T14:00:00Z");
    expect(slaDueAt("2026-10-02T14:00:00Z", 24)).toBe("2026-10-03T14:00:00Z");
  });

  it("shows the countdown on a submission and escalates a breach", () => {
    const track = reviewClock({ entered_review_at: "2026-10-03T03:00:00Z", now: NOW });
    expect(track).toMatchObject({ state: "on_track", due_at: "2026-10-06T03:00:00Z", hours_in_queue: 11, hours_left: 61, escalate: false, label: "Decide by Tue 3:00 AM UTC" });
    const stale = reviewClock({ entered_review_at: "2026-09-30T20:00:00Z", now: NOW });
    expect(stale.state).toBe("stale");
    const late = reviewClock({ entered_review_at: "2026-09-30T08:00:00Z", now: NOW });
    expect(late).toMatchObject({ state: "breached", escalate: true, hours_left: -6, label: "Overdue by 6 h" });
    expect(reviewClock({ entered_review_at: "2026-10-01T14:00:00Z", now: NOW, sla_hours: 24 }).state).toBe("breached");
  });
});
