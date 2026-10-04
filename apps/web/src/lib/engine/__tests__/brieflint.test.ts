import { describe, expect, it } from "vitest";
import type { BriefLintCode } from "@/lib/contract/types";
import { canPublish, effectivePayAtMedian, lintBrief, type BriefLintInput } from "../brieflint";
import { NOW } from "./helpers";

const base = (over: Partial<BriefLintInput> = {}): BriefLintInput => ({
  type: "stacked",
  plan: "pro",
  cpm_cents: 210,
  rates: { install: 40, trial: 150, paid: 400 },
  per_video_cap_cents: 25_000,
  budget_cents: 300_000,
  brief: {
    summary: "Show how Lumi turns a selfie into a studio headshot in under a minute.",
    talking_points: ["Upload one selfie", "Pick a style", "Download in 60 seconds"],
    dos: ["Show the app on screen", "Say the free trial once"],
    donts: ["Don't promise perfect results"],
    cta: "Try Lumi free for 7 days",
    offer_line: "7-day free trial",
    tone: "Casual, honest, a little amazed",
    disclosure_text: "#ad Paid partnership with Lumi",
  },
  rights_card: { paid_ads_days: 90, ai_likeness: false },
  deliverables: { videos_per_creator: 1, min_duration_s: 15, max_duration_s: 45, platforms: ["tiktok", "instagram"], regions: ["US"] },
  starts_at: "2026-10-05T00:00:00Z",
  ends_at: "2026-11-05T00:00:00Z",
  median_views: 14_200,
  ...over,
});

/** The brief with one line of text changed. */
const withText = (over: Partial<BriefLintInput["brief"]>): BriefLintInput => base({ brief: { ...base().brief, ...over } });

const codes = (input: BriefLintInput, options?: { overrides?: BriefLintCode[] }): BriefLintCode[] => lintBrief(input, NOW, options).findings.map((f) => f.code);

describe("a clean brief", () => {
  it("passes with no findings and shows the Pay Math at the median", () => {
    const r = lintBrief(base(), NOW);
    expect(r).toMatchObject({ passed: true, can_publish: true, blockers: 0, warnings: 0, infos: 0, checked_at: NOW });
    expect(r.findings).toEqual([]);
    expect(r.issues).toEqual([]);
    // 14,200 views at $2.10 plus the stacked CPA bonuses: the DOMAIN worked example
    expect(r.pay_math).toMatchObject({ expected_views_median: 14_200, p25_cents: 1756, median_cents: 4389, p75_cents: 11_191 });
    expect(canPublish(r)).toBe(true);
  });
});

describe("structural blockers and warnings", () => {
  it("blocks missing deliverables and platforms, warns on missing regions", () => {
    const d = base().deliverables;
    expect(codes(base({ deliverables: { ...d, videos_per_creator: 0 } }))).toContain("missing_deliverables");
    expect(codes(base({ deliverables: { ...d, min_duration_s: 0 } }))).toContain("missing_deliverables");
    expect(codes(base({ deliverables: { ...d, max_duration_s: 0 } }))).toContain("missing_deliverables");
    expect(codes(base({ deliverables: { ...d, min_duration_s: 30, max_duration_s: 15 } }))).toContain("missing_deliverables");
    expect(codes(base({ deliverables: { ...d, platforms: [] } }))).toEqual(["missing_platforms"]);
    const r = lintBrief(base({ deliverables: { ...d, regions: [] } }), NOW);
    expect(r.findings).toMatchObject([{ code: "missing_regions", severity: "warning", field: "deliverables.regions" }]);
    expect(r.passed).toBe(true);
  });

  it("blocks a CPM under the floor, but not a bounty with no CPM at all", () => {
    expect(codes(base({ cpm_cents: 49 }))).toContain("below_floor_cpm");
    expect(codes(base({ cpm_cents: 50 }))).not.toContain("below_floor_cpm");
    expect(codes(base({ cpm_cents: 0, type: "cpa" }))).not.toContain("below_floor_cpm");
    const f = lintBrief(base({ cpm_cents: 25 }), NOW).findings.find((x) => x.code === "below_floor_cpm");
    expect(f).toMatchObject({ severity: "blocker", title: "CPM below floor", message: "The CPM is under the $0.50 floor.", fix: "Raise the CPM to at least $0.50." });
  });

  it("blocks a budget under $100", () => {
    expect(codes(base({ budget_cents: 9999 }))).toContain("budget_below_minimum");
    expect(codes(base({ budget_cents: 10_000 }))).not.toContain("budget_below_minimum");
    expect(lintBrief(base({ budget_cents: 5000 }), NOW).findings.find((x) => x.code === "budget_below_minimum")?.message).toBe("The budget is under $100.");
  });

  it("warns on missing disclosure wording and an unclear call to action", () => {
    expect(codes(withText({ disclosure_text: "" }))).toEqual(["no_disclosure_text"]);
    expect(codes(withText({ disclosure_text: "   " }))).toEqual(["no_disclosure_text"]);
    expect(codes(withText({ cta: "" }))).toEqual(["unclear_cta"]);
    expect(codes(withText({ cta: "Download the app and follow me for more" }))).toEqual(["unclear_cta"]);
    expect(codes(withText({ cta: "Download Lumi today" }))).toEqual([]);
  });

  it("warns on a low cap, except for a direct bounty with a flat fee", () => {
    expect(codes(base({ per_video_cap_cents: 1999 }))).toContain("cap_too_low");
    expect(codes(base({ per_video_cap_cents: 2000 }))).not.toContain("cap_too_low");
    expect(codes(base({ type: "direct", per_video_cap_cents: 0, flat_fee_cents: 30_000, cpm_cents: 0 }))).not.toContain("cap_too_low");
  });

  it("warns when a typical creator earns under $15 per video", () => {
    const r = lintBrief(base({ cpm_cents: 50, rates: {} }), NOW);
    const f = r.findings.find((x) => x.code === "low_effective_pay");
    // 14,200 views at $0.50 is $7.10
    expect(f).toMatchObject({ severity: "warning", matched_text: "$7.10 at the median" });
    expect(r.pay_math?.median_cents).toBe(710);
    // exactly $15 is fine
    expect(codes(base({ cpm_cents: 50, rates: {}, median_views: 30_000 }))).not.toContain("low_effective_pay");
    expect(codes(base({ cpm_cents: 50, rates: {}, median_views: 29_900 }))).toContain("low_effective_pay");
    // it cannot run without a category median
    expect(lintBrief(base({ cpm_cents: 50, rates: {}, median_views: undefined }), NOW).pay_math).toBeNull();
    expect(codes(base({ cpm_cents: 50, rates: {}, median_views: undefined }))).not.toContain("low_effective_pay");
  });

  it("tells a short deadline (under 5 days) as an info, not a block", () => {
    const r = lintBrief(base({ ends_at: "2026-10-09T23:59:59Z" }), NOW);
    expect(r.findings).toMatchObject([{ code: "short_window", severity: "info", field: "ends_at" }]);
    expect(r).toMatchObject({ infos: 1, passed: true });
    expect(codes(base({ ends_at: "2026-10-10T00:00:00Z" }))).not.toContain("short_window");
  });

  it("treats a paid-ad term over 365 days as perpetual, and AI likeness as a blocker", () => {
    const perpetual = lintBrief(base({ rights_card: { paid_ads_days: 366, ai_likeness: false } }), NOW);
    expect(perpetual.findings).toMatchObject([{ code: "perpetual_rights", severity: "blocker", field: "rights_card.paid_ads_days", matched_text: "366 days" }]);
    expect(codes(base({ rights_card: { paid_ads_days: 365, ai_likeness: false } }))).toEqual([]);
    expect(lintBrief(base({ rights_card: { paid_ads_days: 90, ai_likeness: true } }), NOW).findings).toMatchObject([{ code: "ai_likeness_requested", field: "rights_card.ai_likeness" }]);
  });
});

describe("text rules", () => {
  const flagged = (code: BriefLintCode, text: string): boolean => codes(withText({ summary: text })).includes(code);

  it("catches view minimums on base pay, but not a threshold on a bonus", () => {
    for (const text of ["You must reach 10,000 views to qualify.", "Creators are paid after 5k views.", "Videos need to hit 20k views before we pay.", "Minimum of 10,000 views per video.", "Base pay only starts once you reach 10,000 views.", "10k views required."]) {
      expect(flagged("view_minimum_base", text), text).toBe(true);
    }
    for (const text of ["Earn a $200 bonus once you hit 100k views.", "Extra $50 when you get over 25k views.", "Creators are paid from the first verified view.", "Aim for views, no minimum."]) {
      expect(flagged("view_minimum_base", text), text).toBe(false);
    }
    // a bonus sentence that still gates base pay is flagged
    expect(flagged("view_minimum_base", "Bonus pay and base pay only after you reach 10,000 views.")).toBe(true);
  });

  it("catches unpaid test, sample and trial videos", () => {
    for (const text of ["We need an unpaid test before the real campaign.", "Send a free sample video first.", "Film a trial video before we pay you.", "unpaid audition clip"]) {
      expect(flagged("unpaid_trial", text), text).toBe(true);
    }
    expect(flagged("unpaid_trial", "No unpaid test videos. Every video is paid.")).toBe(false);
    expect(flagged("unpaid_trial", "Mention the 7-day free trial once.")).toBe(false);
  });

  it("catches burner and dedicated accounts, and fresh accounts", () => {
    for (const text of ["Create a new TikTok account for this.", "Use a dedicated account.", "Post from a burner.", "Make a separate Instagram account", "An account just for us please."]) {
      expect(flagged("burner_account", text), text).toBe(true);
    }
    for (const text of ["Use a fresh TikTok account.", "No other content on your account.", "Only post about our app.", "No personal posts allowed."]) {
      expect(flagged("fresh_account_demand", text), text).toBe(true);
    }
    expect(flagged("burner_account", "Post from your own account. No new account needed.")).toBe(false);
    expect(flagged("fresh_account_demand", "No fresh account needed.")).toBe(false);
  });

  it("catches demanded posting cadences, and only more than the paid videos", () => {
    for (const text of ["Post daily for 30 days.", "Daily posts for the whole month.", "Post every day.", "Post 3 times a day.", "Post 5 times per week."]) {
      expect(flagged("forced_posting_count", text), text).toBe(true);
    }
    expect(flagged("forced_posting_count", "Make 1 video per week.")).toBe(false);
    expect(flagged("forced_posting_count", "Do not post daily.")).toBe(false);
    // 3 videos a week is fine when the bounty pays for 3
    const three = base({ deliverables: { ...base().deliverables, videos_per_creator: 3 }, brief: { ...base().brief, summary: "Make 3 videos per week." } });
    expect(codes(three)).not.toContain("forced_posting_count");
    expect(codes(base({ brief: { ...base().brief, summary: "Make 3 videos per week." } }))).toContain("forced_posting_count");
    // a daily cadence is never fine
    expect(codes({ ...three, brief: { ...three.brief, summary: "Make 1 video a day." } })).toContain("forced_posting_count");
  });

  it("catches perpetual rights and AI likeness asked for in words", () => {
    for (const text of ["The brand gets perpetual usage.", "Rights in perpetuity.", "Ad usage runs forever.", "Unlimited usage rights.", "An irrevocable licence."]) {
      expect(flagged("perpetual_rights", text), text).toBe(true);
    }
    expect(flagged("perpetual_rights", "No perpetual rights. Paid ads run 90 days.")).toBe(false);
    for (const text of ["We may clone your voice.", "Permission to train an AI model on your videos.", "AI likeness is included.", "Use your face with AI."]) {
      expect(flagged("ai_likeness_requested", text), text).toBe(true);
    }
    expect(flagged("ai_likeness_requested", "Your voice and face are never cloned. No AI likeness.")).toBe(false);
  });

  it("catches charges to take part", () => {
    for (const text of ["A $20 entry fee applies.", "Submit a refundable deposit.", "Pay to join the program.", "Buy the app first, then film.", "You must purchase the premium plan."]) {
      expect(flagged("pay_to_join", text), text).toBe(true);
    }
    expect(flagged("pay_to_join", "There is no entry fee.")).toBe(false);
  });

  it("reads every field of the brief and any extra text, and says where it found the words", () => {
    const viaTalking = lintBrief(withText({ talking_points: ["Say hi", "Pay to join our crew"] }), NOW).findings.find((f) => f.code === "pay_to_join");
    expect(viaTalking).toMatchObject({ field: "brief.talking_points[1]", matched_text: "Pay to join" });
    const viaDos = lintBrief(withText({ dos: ["Use a burner account"] }), NOW).findings.find((f) => f.code === "burner_account");
    expect(viaDos?.field).toBe("brief.dos[0]");
    const viaExtra = lintBrief(base({ extra_text: ["Welcome! Creators post daily."] }), NOW).findings.find((f) => f.code === "forced_posting_count");
    expect(viaExtra).toMatchObject({ field: "extra_text[0]", matched_text: "post daily" });
    expect(lintBrief(withText({ offer_line: "Free sample video then we pay" }), NOW).findings.find((f) => f.code === "unpaid_trial")?.field).toBe("brief.offer_line");
  });
});

describe("the result", () => {
  const messy = base({ budget_cents: 5000, deliverables: { ...base().deliverables, regions: [] }, ends_at: "2026-10-07T00:00:00Z", brief: { ...base().brief, summary: "Entry fee required." } });

  it("orders blockers, then warnings, then infos, and counts them", () => {
    const r = lintBrief(messy, NOW);
    expect(r.findings.map((f) => `${f.severity}:${f.code}`)).toEqual(["blocker:pay_to_join", "blocker:budget_below_minimum", "warning:missing_regions", "info:short_window"]);
    expect(r).toMatchObject({ blockers: 2, warnings: 1, infos: 1, passed: false, can_publish: false });
    expect(canPublish(r)).toBe(false);
  });

  it("mirrors the findings as contract issues", () => {
    const r = lintBrief(messy, NOW);
    expect(r.issues).toEqual(r.findings.map(({ code, severity, message, field }) => ({ code, severity, message, field })));
    for (const f of r.findings) {
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.fix.length).toBeGreaterThan(5);
    }
  });

  it("lets an Ops override stop a finding blocking, while keeping it visible", () => {
    const r = lintBrief(messy, NOW, { overrides: ["pay_to_join"] });
    expect(r.findings.find((f) => f.code === "pay_to_join")).toMatchObject({ overridden: true, severity: "blocker" });
    expect(r.blockers).toBe(1);
    expect(r.can_publish).toBe(false);
    const both = lintBrief(messy, NOW, { overrides: ["pay_to_join", "budget_below_minimum"] });
    expect(both).toMatchObject({ blockers: 0, passed: true, can_publish: true });
    expect(both.findings).toHaveLength(4);
  });

  it("is deterministic", () => {
    expect(lintBrief(messy, NOW)).toEqual(lintBrief(messy, NOW));
  });
});

describe("effectivePayAtMedian", () => {
  const input = base();

  it("is null without a median", () => {
    expect(effectivePayAtMedian({ ...input, median_views: undefined })).toBeNull();
  });

  it("returns the contract's Pay Math, with a default basis line", () => {
    const pm = effectivePayAtMedian(input);
    expect(pm).toMatchObject({ expected_views_p25: 5680, expected_views_median: 14_200, expected_views_p75: 36_210, median_cents: 4389, basis: "Category median views, an estimate" });
    expect(pm?.all_in_cpm_cents).toBeGreaterThan(pm?.creator_cpm_cents ?? 0);
    expect(effectivePayAtMedian({ ...input, basis: "AI photo, 38 comparable bounties" })?.basis).toBe("AI photo, 38 comparable bounties");
  });

  it("adds a flat fee to every quantile and applies the cap", () => {
    const flat = effectivePayAtMedian({ ...input, type: "direct", cpm_cents: 0, rates: {}, flat_fee_cents: 30_000 });
    expect(flat).toMatchObject({ p25_cents: 30_000, median_cents: 30_000, p75_cents: 30_000 });
    const capped = effectivePayAtMedian({ ...input, cpm_cents: 400, rates: {}, median_views: 90_000 });
    expect(capped?.median_cents).toBe(25_000);
  });

  it("uses the bounty's own take rate: a platform-funded bounty has no fee, a bounty keeps the rate it was made with", () => {
    const planRate = effectivePayAtMedian(input);
    const noFee = effectivePayAtMedian({ ...input, take_rate: 0 });
    const free = effectivePayAtMedian({ ...input, take_rate: 0.12 });
    expect(noFee?.median_cents).toBe(planRate?.median_cents);
    expect(noFee?.all_in_cpm_cents).toBeLessThan(planRate?.all_in_cpm_cents ?? 0);
    expect(free?.all_in_cpm_cents).toBeGreaterThan(planRate?.all_in_cpm_cents ?? 0);
    // and the lint passes it through to its own Pay Math
    expect(lintBrief({ ...input, take_rate: 0 }, NOW).pay_math?.all_in_cpm_cents).toBe(noFee?.all_in_cpm_cents);
  });

  it("charges no platform fee on a first bounty, so the all-in price is lower", () => {
    const normal = effectivePayAtMedian(input);
    const first = effectivePayAtMedian({ ...input, first_bounty: true });
    expect(first?.median_cents).toBe(normal?.median_cents);
    expect(first?.all_in_cpm_cents).toBeLessThan(normal?.all_in_cpm_cents ?? 0);
  });
});
