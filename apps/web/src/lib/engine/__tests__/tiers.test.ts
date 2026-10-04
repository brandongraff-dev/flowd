import { describe, expect, it } from "vitest";
import { TIERS } from "@/lib/contract/types";
import {
  approvalRate,
  canSeeBounty,
  earlyAccessAt,
  evaluateTier,
  graceDaysLeft,
  meetsTier,
  nextTier,
  perkLines,
  previousTier,
  remainingToNext,
  tierAtLeast,
  tierFor,
  tierProgress,
  tierRank,
  tierWithGrace,
  whatUnlocksNext,
  withCarryOver,
  type TierStats,
} from "../tiers";
import { NOW } from "./helpers";

const stats = (over: Partial<TierStats> = {}): TierStats => ({ lifetime_cleared_cents: 0, approved_count: 0, approval_rate: 0, reliability_score: 0, elite_reviewed: false, ...over });
const MAYA = stats({ lifetime_cleared_cents: 164_000, approved_count: 21, approval_rate: approvalRate(21, 27), reliability_score: 93 });

describe("order and helpers", () => {
  it("ranks the five tiers Bronze to Elite", () => {
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3, 4]);
    expect(tierAtLeast("gold", "silver")).toBe(true);
    expect(tierAtLeast("silver", "silver")).toBe(true);
    expect(tierAtLeast("bronze", "silver")).toBe(false);
    expect(nextTier("bronze")).toBe("silver");
    expect(nextTier("platinum")).toBe("elite");
    expect(nextTier("elite")).toBeNull();
    expect(previousTier("silver")).toBe("bronze");
    expect(previousTier("bronze")).toBeNull();
  });

  it("rounds the approval rate to 2 decimals on finished work only", () => {
    expect(approvalRate(21, 27)).toBe(0.78);
    expect(approvalRate(0, 0)).toBe(0);
    expect(approvalRate(5, 5)).toBe(1);
    expect(approvalRate(2, 3)).toBe(0.67);
  });
});

describe("thresholds (DECISIONS section 3)", () => {
  it("Silver: $250 lifetime cleared, 5 approved, 70%", () => {
    const ok = stats({ lifetime_cleared_cents: 25_000, approved_count: 5, approval_rate: 0.7 });
    expect(meetsTier("silver", ok)).toBe(true);
    expect(meetsTier("silver", { ...ok, lifetime_cleared_cents: 24_999 })).toBe(false);
    expect(meetsTier("silver", { ...ok, approved_count: 4 })).toBe(false);
    expect(meetsTier("silver", { ...ok, approval_rate: 0.69 })).toBe(false);
    expect(tierFor(ok)).toBe("silver");
  });

  it("Gold: $2,000, 25 approved, 75%", () => {
    const ok = stats({ lifetime_cleared_cents: 200_000, approved_count: 25, approval_rate: 0.75 });
    expect(tierFor(ok)).toBe("gold");
    expect(tierFor({ ...ok, approval_rate: 0.74 })).toBe("silver");
    expect(tierFor({ ...ok, lifetime_cleared_cents: 199_999 })).toBe("silver");
  });

  it("Platinum needs reliability 90 on top of $10,000, 80 approved and 80%", () => {
    const ok = stats({ lifetime_cleared_cents: 1_000_000, approved_count: 80, approval_rate: 0.8, reliability_score: 90 });
    expect(tierFor(ok)).toBe("platinum");
    expect(tierFor({ ...ok, reliability_score: 89 })).toBe("gold");
  });

  it("Elite needs $50,000, 250 approved, 85%, reliability 95 and a manual review", () => {
    const ok = stats({ lifetime_cleared_cents: 5_000_000, approved_count: 250, approval_rate: 0.85, reliability_score: 95, elite_reviewed: true });
    expect(tierFor(ok)).toBe("elite");
    expect(tierFor({ ...ok, elite_reviewed: false })).toBe("platinum");
    expect(tierFor({ ...ok, elite_reviewed: undefined })).toBe("platinum");
    expect(tierFor({ ...ok, reliability_score: 94 })).toBe("platinum");
  });

  it("holds the highest tier whose thresholds are ALL met, not just the money", () => {
    // $50k cleared but only 10 approved and 60%: Bronze
    expect(tierFor(stats({ lifetime_cleared_cents: 5_000_000, approved_count: 10, approval_rate: 0.6 }))).toBe("bronze");
    expect(tierFor(stats())).toBe("bronze");
  });

  it("puts @maya.makes at Silver", () => {
    expect(tierFor(MAYA)).toBe("silver");
    expect(MAYA.approval_rate).toBe(0.78);
  });

  it("counts a founding creator's verified prior history", () => {
    const s = withCarryOver({ lifetime_cleared_cents: 60_000, approved_count: 8, decided_count: 10, reliability_score: 92 }, { cleared_cents: 150_000, approved_count: 20, decided_count: 24 });
    expect(s).toMatchObject({ lifetime_cleared_cents: 210_000, approved_count: 28, reliability_score: 92 });
    expect(s.approval_rate).toBe(0.82); // 28 of 34
    expect(tierFor(s)).toBe("gold");
    const none = withCarryOver({ lifetime_cleared_cents: 60_000, approved_count: 8, decided_count: 10, reliability_score: 92 });
    expect(none.approval_rate).toBe(0.8);
  });
});

describe("progress to the next tier (DOMAIN worked example)", () => {
  it("@maya.makes is 82% of the way to Gold, bottlenecked on lifetime cleared", () => {
    const p = tierProgress(MAYA);
    expect(p.current).toBe("silver");
    expect(p.next).toBe("gold");
    expect(p.criteria).toEqual([
      { key: "lifetime_cleared", label: "Lifetime cleared", have: 164_000, need: 200_000, met: false },
      { key: "approved", label: "Approved posts", have: 21, need: 25, met: false },
      { key: "approval_rate", label: "Approval rate", have: 0.78, need: 0.75, met: true },
    ]);
    expect(p.progress).toBe(0.82);
  });

  it("adds reliability from Platinum, and the manual review for Elite without letting it set the bottleneck", () => {
    const gold = stats({ lifetime_cleared_cents: 250_000, approved_count: 30, approval_rate: 0.8, reliability_score: 70 });
    const p = tierProgress(gold);
    expect(p.current).toBe("gold");
    expect(p.criteria.map((c) => c.key)).toEqual(["lifetime_cleared", "approved", "approval_rate", "reliability"]);
    expect(p.progress).toBe(0.25); // $2,500 of $10,000
    const plat = stats({ lifetime_cleared_cents: 6_000_000, approved_count: 300, approval_rate: 0.9, reliability_score: 97 });
    const toElite = tierProgress(plat);
    expect(toElite.current).toBe("platinum");
    expect(toElite.criteria.map((c) => c.key)).toEqual(["lifetime_cleared", "approved", "approval_rate", "reliability", "review"]);
    expect(toElite.criteria.find((c) => c.key === "review")).toMatchObject({ have: 0, need: 1, met: false });
    expect(toElite.progress).toBe(1); // every numeric criterion is met; only the review remains
    expect(tierProgress({ ...plat, elite_reviewed: true }).current).toBe("elite");
  });

  it("is complete at Elite", () => {
    const elite = stats({ lifetime_cleared_cents: 6_000_000, approved_count: 300, approval_rate: 0.9, reliability_score: 97, elite_reviewed: true });
    expect(tierProgress(elite)).toEqual({ current: "elite", criteria: [], progress: 1 });
  });

  it("can measure progress from a held tier that differs from the computed one", () => {
    const p = tierProgress(MAYA, "bronze");
    expect(p.next).toBe("silver");
    expect(p.progress).toBe(1);
  });

  it("says exactly what is missing", () => {
    const r = remainingToNext(MAYA);
    expect(r.map((x) => x.text)).toEqual(["$360.00 more cleared", "4 more approved posts", ""]);
    expect(r[0]).toMatchObject({ key: "lifetime_cleared", remaining: 36_000, met: false });
    expect(r[2]).toMatchObject({ met: true, remaining: 0 });
    expect(remainingToNext({ ...MAYA, approved_count: 24 })[1].text).toBe("1 more approved post");
    expect(remainingToNext({ ...MAYA, approval_rate: 0.7 })[2].text).toBe("Approval rate 75% (you: 70%)");
    expect(remainingToNext({ ...MAYA, approval_rate: 0.7 })[2].remaining).toBe(0.05);
    const gold = remainingToNext(stats({ lifetime_cleared_cents: 250_000, approved_count: 30, approval_rate: 0.8, reliability_score: 85 }));
    expect(gold.find((x) => x.key === "reliability")?.text).toBe("Reliability 90 (you: 85)");
    const review = remainingToNext(stats({ lifetime_cleared_cents: 6_000_000, approved_count: 300, approval_rate: 0.9, reliability_score: 97 }));
    expect(review.find((x) => x.key === "review")?.text).toBe("A short manual review by flowd");
  });
});

describe("perks", () => {
  it("lists the perks of each tier in plain English", () => {
    expect(perkLines("bronze")).toEqual([]);
    expect(perkLines("silver")).toEqual(["1-hour head start on new bounties", "Your own rate card"]);
    expect(perkLines("gold")).toEqual(["3-hour head start on new bounties", "Your own rate card", "1 free instant cash-out a week", "Lead a crew"]);
    expect(perkLines("platinum")).toEqual(["6-hour head start on new bounties", "Your own rate card", "Unlimited free instant cash-outs", "Lead a crew", "Run sealed-bid auctions"]);
    expect(perkLines("elite")).toContain("Featured on the creator directory");
    expect(perkLines("elite")).toContain("12-hour head start on new bounties");
  });

  it("says what the next tier unlocks", () => {
    expect(whatUnlocksNext("bronze")).toEqual(["1-hour head start on new bounties", "Your own rate card"]);
    expect(whatUnlocksNext("silver")).toEqual(["Head start grows from 1 h to 3 h", "1 free instant cash-out a week", "Lead a crew"]);
    expect(whatUnlocksNext("gold")).toEqual(["Head start grows from 3 h to 6 h", "Unlimited free instant cash-outs", "Run sealed-bid auctions"]);
    expect(whatUnlocksNext("platinum")).toEqual(["Head start grows from 6 h to 12 h", "Featured on the creator directory"]);
    expect(whatUnlocksNext("elite")).toEqual([]);
  });

  it("gives a head start: Elite 12 h, Platinum 6 h, Gold 3 h, Silver 1 h, Bronze none", () => {
    const release = "2026-10-03T16:00:00Z";
    expect(earlyAccessAt(release, "elite")).toBe("2026-10-03T04:00:00Z");
    expect(earlyAccessAt(release, "platinum")).toBe("2026-10-03T10:00:00Z");
    expect(earlyAccessAt(release, "gold")).toBe("2026-10-03T13:00:00Z");
    expect(earlyAccessAt(release, "silver")).toBe("2026-10-03T15:00:00Z");
    expect(earlyAccessAt(release, "bronze")).toBe(release);
    expect(canSeeBounty({ release_at: release, tier: "gold", now: NOW })).toBe(true); // 14:00 >= 13:00
    expect(canSeeBounty({ release_at: release, tier: "silver", now: NOW })).toBe(false); // 14:00 < 15:00
    expect(canSeeBounty({ release_at: release, tier: "bronze", now: "2026-10-03T16:00:00Z" })).toBe(true);
  });
});

describe("no tier drop for 30 days after a dip", () => {
  const gold = stats({ lifetime_cleared_cents: 220_000, approved_count: 30, approval_rate: 0.8, reliability_score: 80 });
  const dipped = { ...gold, approval_rate: 0.7 }; // below Gold's 75%, still Silver's 70%

  it("starts a grace hold on a dip and keeps the held tier for 30 days", () => {
    const e = evaluateTier({ stats: dipped, held_tier: "gold", now: NOW });
    expect(e).toMatchObject({ tier: "gold", tier_basis: "grace_hold", tier_hold_until: "2026-11-02T14:00:00Z", dip_started_at: NOW, event: "hold_started", computed_tier: "silver" });
  });

  it("stays on hold without a new event, then demotes when the hold ends", () => {
    const again = evaluateTier({ stats: dipped, held_tier: "gold", held_basis: "grace_hold", dip_started_at: NOW, now: "2026-10-20T14:00:00Z" });
    expect(again).toMatchObject({ tier: "gold", tier_basis: "grace_hold", event: null });
    const lastDay = evaluateTier({ stats: dipped, held_tier: "gold", held_basis: "grace_hold", dip_started_at: NOW, now: "2026-11-02T13:59:59Z" });
    expect(lastDay.tier).toBe("gold");
    const over = evaluateTier({ stats: dipped, held_tier: "gold", held_basis: "grace_hold", dip_started_at: NOW, now: "2026-11-02T14:00:00Z" });
    expect(over).toMatchObject({ tier: "silver", tier_basis: "earned", event: "demoted" });
    expect(over.tier_hold_until).toBeUndefined();
  });

  it("clears the hold when the numbers recover inside the window", () => {
    const e = evaluateTier({ stats: gold, held_tier: "gold", held_basis: "grace_hold", dip_started_at: NOW, now: "2026-10-15T14:00:00Z" });
    expect(e).toMatchObject({ tier: "gold", tier_basis: "earned", event: "hold_cleared" });
  });

  it("promotes straight away", () => {
    const e = evaluateTier({ stats: stats({ lifetime_cleared_cents: 1_200_000, approved_count: 90, approval_rate: 0.82, reliability_score: 91 }), held_tier: "gold", now: NOW });
    expect(e).toMatchObject({ tier: "platinum", tier_basis: "earned", event: "promoted" });
  });

  it("changes nothing when nothing changed", () => {
    expect(evaluateTier({ stats: gold, held_tier: "gold", now: NOW })).toMatchObject({ tier: "gold", tier_basis: "earned", event: null });
  });

  it("pausing preserves the tier whatever the numbers say", () => {
    const e = evaluateTier({ stats: stats(), held_tier: "platinum", now: NOW, paused: true });
    expect(e).toMatchObject({ tier: "platinum", tier_basis: "earned", event: null, computed_tier: "bronze" });
    const held = evaluateTier({ stats: stats(), held_tier: "platinum", held_basis: "grace_hold", dip_started_at: NOW, now: "2026-12-01T00:00:00Z", paused: true });
    expect(held.tier).toBe("platinum");
    expect(held.tier_basis).toBe("grace_hold");
  });

  it("matches the reference form of the rule", () => {
    const now = NOW;
    expect(tierWithGrace({ held_tier: "gold", computed_tier: "silver", dip_started_at: "2026-09-20T14:00:00Z", now })).toEqual({ tier: "gold", tier_basis: "grace_hold", tier_hold_until: "2026-10-20T14:00:00Z" });
    expect(tierWithGrace({ held_tier: "gold", computed_tier: "silver", dip_started_at: "2026-08-20T14:00:00Z", now })).toEqual({ tier: "silver", tier_basis: "earned" });
    expect(tierWithGrace({ held_tier: "gold", computed_tier: "gold", dip_started_at: "2026-09-20T14:00:00Z", now })).toEqual({ tier: "gold", tier_basis: "earned" });
    expect(tierWithGrace({ held_tier: "gold", computed_tier: "platinum", dip_started_at: "2026-09-20T14:00:00Z", now })).toEqual({ tier: "platinum", tier_basis: "earned" });
  });

  it("counts the days left in a hold, rounded up", () => {
    expect(graceDaysLeft("2026-11-02T14:00:00Z", NOW)).toBe(30);
    expect(graceDaysLeft("2026-10-04T14:00:01Z", NOW)).toBe(2);
    expect(graceDaysLeft("2026-10-01T00:00:00Z", NOW)).toBe(0);
  });
});
