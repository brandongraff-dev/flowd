import { describe, expect, it } from "vitest";
import {
  GATE_TEXT,
  isTopPick,
  matchFactors,
  matchPoints,
  matchScore,
  nicheOverlap,
  rankBountiesForCreator,
  rankCreatorsForBounty,
  regionFit,
  type CreatorMatchProfile,
  type MatchBounty,
} from "../matching";
import { NOW } from "./helpers";

describe("match score (DOMAIN worked example: Maya x a fresh stacked AI-photo bounty)", () => {
  const maya = { gates: { tier: true }, niche_overlap: 1, platform_fit: 1, region_fit: 1, price_ratio: 1.2, brand_reliability: 94, bounty_age_days: 2 };

  it("scores 96: 40 + 15 + 15 + 12 + 9.4 + 4.55", () => {
    expect(matchScore(maya)).toBe(96);
    const pts = matchPoints(matchFactors(maya));
    expect(pts.niche).toBe(40);
    expect(pts.platform).toBe(15);
    expect(pts.region).toBe(15);
    expect(pts.price).toBeCloseTo(12, 9);
    expect(pts.brand_reliability).toBeCloseTo(9.4, 9);
    // DOMAIN rounds recency to 0.91 (4.55 points); unrounded it is 0.5^(2/14) = 0.9057 (4.529 points). Both land on 96.
    expect(matchFactors(maya).recency).toBeCloseTo(0.91, 2);
    expect(pts.recency).toBeCloseTo(4.5286, 3);
  });

  it("is null when any gate fails", () => {
    expect(matchScore({ ...maya, gates: { tier: false } })).toBeNull();
    expect(matchScore({ ...maya, gates: { tier: true, country: true, funded: false } })).toBeNull();
    expect(matchScore({ ...maya, gates: {} })).toBe(96); // no gates to fail
  });

  it("scores the weak vector 59", () => {
    expect(matchScore({ gates: { tier: true }, niche_overlap: 0.5, platform_fit: 1, region_fit: 0.6, price_ratio: 0.7, brand_reliability: 60, bounty_age_days: 20 })).toBe(59);
  });

  it("caps price fit at 1.5x and recency halves every 14 days", () => {
    expect(matchFactors({ ...maya, price_ratio: 3 }).price).toBe(1);
    expect(matchFactors({ ...maya, price_ratio: 0.75 }).price).toBe(0.5);
    expect(matchFactors({ ...maya, price_ratio: -1 }).price).toBe(0);
    expect(matchFactors({ ...maya, bounty_age_days: 0 }).recency).toBe(1);
    expect(matchFactors({ ...maya, bounty_age_days: 14 }).recency).toBe(0.5);
    expect(matchFactors({ ...maya, bounty_age_days: 28 }).recency).toBe(0.25);
    expect(matchFactors({ ...maya, bounty_age_days: -5 }).recency).toBe(1);
  });

  it("clamps every factor to 0..1 and the score to 0..100", () => {
    const f = matchFactors({ niche_overlap: 5, platform_fit: -1, region_fit: 2, price_ratio: 99, brand_reliability: 300, bounty_age_days: 0 });
    expect(f).toEqual({ niche: 1, platform: 0, region: 1, price: 1, brand_reliability: 1, recency: 1 });
    expect(matchScore({ gates: {}, niche_overlap: 1, platform_fit: 1, region_fit: 1, price_ratio: 1.5, brand_reliability: 100, bounty_age_days: 0 })).toBe(100);
    expect(matchScore({ gates: {}, niche_overlap: 0, platform_fit: 0, region_fit: 0, price_ratio: 0, brand_reliability: 0, bounty_age_days: 9999 })).toBe(0);
  });

  it("calls 60 and up a top pick", () => {
    expect(isTopPick(60)).toBe(true);
    expect(isTopPick(59)).toBe(false);
    expect(isTopPick(null)).toBe(false);
  });
});

describe("factors", () => {
  it("measures niche overlap against the bounty's niches, with a neutral score for an open bounty", () => {
    expect(nicheOverlap(["lifestyle", "ai_tools"], ["ai_tools"])).toBe(1);
    expect(nicheOverlap(["lifestyle"], ["ai_tools", "tech"])).toBe(0);
    expect(nicheOverlap(["ai_tools"], ["ai_tools", "tech"])).toBe(0.5);
    expect(nicheOverlap(["lifestyle"], [])).toBe(0.6);
  });

  it("measures region fit by US share when the bounty states a minimum, else by country", () => {
    expect(regionFit({ creator_country: "US", us_audience_ratio: 0.71, min_us_audience_ratio: 0.5, regions: ["US"] })).toBe(1);
    expect(regionFit({ creator_country: "US", us_audience_ratio: 0.3, min_us_audience_ratio: 0.5, regions: ["US"] })).toBeCloseTo(0.6, 9);
    expect(regionFit({ creator_country: "GB", us_audience_ratio: 0, regions: ["GB", "IE"] })).toBe(1);
    expect(regionFit({ creator_country: "BR", us_audience_ratio: 0, regions: ["GB", "IE"] })).toBe(0.3);
    expect(regionFit({ creator_country: "BR", us_audience_ratio: 0, regions: [] })).toBe(1);
  });
});

const maya: CreatorMatchProfile = {
  id: "cr_maya",
  tier: "silver",
  country: "US",
  niches: ["lifestyle", "ai_tools"],
  accounts: [
    { platform: "tiktok", status: "connected", us_audience_ratio: 0.71, followers: 48_200, median_views_28d: 14_200, primary: true },
    { platform: "instagram", status: "connected", us_audience_ratio: 0.64, followers: 21_400, median_views_28d: 5200 },
  ],
  usual_pay_cents: 3658,
  reliability_score: 93,
  last_active_at: "2026-10-02T09:00:00Z",
  min_cpm_cents: 150,
  open_to_offers: true,
};

const bounty = (id: string, over: Partial<MatchBounty> = {}): MatchBounty => ({
  id,
  status: "live",
  funded: true,
  cpm_cents: 210,
  rates: { install: 40, trial: 150, paid: 400 },
  per_video_cap_cents: 25_000,
  eligibility: { countries: ["US"], niches: ["ai_tools"], min_us_audience_ratio: 0.5 },
  platforms: ["tiktok", "instagram"],
  regions: ["US"],
  brand_reliability: 94,
  created_at: "2026-10-01T14:00:00Z",
  published_at: "2026-10-01T14:00:00Z",
  ...over,
});

describe("rankBountiesForCreator", () => {
  it("scores the fresh stacked AI-photo bounty 96 for Maya, with her expected pay", () => {
    const [m] = rankBountiesForCreator({ creator: maya, bounties: [bounty("bnty_a")], now: NOW });
    expect(m).toMatchObject({ bounty_id: "bnty_a", score: 96, locked: false, gate_failures: [], lock_reasons: [], visible: true });
    expect(m.expected_pay_cents).toEqual({ p25: 1756, median: 4389, p75: 11_191 });
    expect(m.factors).toMatchObject({ niche: 1, platform: 1, region: 1, brand_reliability: 0.94 });
    expect(m.factors.price).toBeCloseTo(0.8, 2);
    expect(m.reasons).toEqual(["Matches your niche.", "Pays at or above what you usually earn.", "The brand decides fast and pays on time.", "Just posted."]);
  });

  it("ranks unlocked bounties by score and puts locked ones last with their reasons", () => {
    const bounties = [
      bounty("bnty_low", { eligibility: { countries: ["US"], niches: ["tech"], min_us_audience_ratio: 0.5 }, brand_reliability: 60 }),
      bounty("bnty_top"),
      bounty("bnty_gold", { eligibility: { countries: ["US"], niches: ["ai_tools"], min_tier: "gold" } }),
      bounty("bnty_unfunded", { funded: false, status: "awaiting_funding" }),
      bounty("bnty_scheduled", { status: "scheduled" }),
      bounty("bnty_uk", { eligibility: { countries: ["GB"], niches: ["ai_tools"] } }),
      bounty("bnty_yt", { platforms: ["youtube"] }),
    ];
    const r = rankBountiesForCreator({ creator: { ...maya, submitted_bounty_ids: ["bnty_low"] }, bounties, now: NOW });
    // One open bounty first; the locked ones follow, fewest failed gates first and then by id.
    expect(r.map((x) => x.bounty_id)).toEqual(["bnty_top", "bnty_gold", "bnty_low", "bnty_scheduled", "bnty_uk", "bnty_unfunded", "bnty_yt"]);
    expect(r[0].locked).toBe(false);
    const locked = Object.fromEntries(r.slice(1).map((x) => [x.bounty_id, x.gate_failures]));
    expect(locked).toEqual({
      bnty_gold: ["eligibility_tier"],
      bnty_low: ["not_already_submitted"],
      bnty_scheduled: ["funded"],
      bnty_unfunded: ["funded"],
      bnty_uk: ["country"],
      bnty_yt: ["platform_account_linked"],
    });
    expect(r.every((x) => (x.locked ? x.score === null : x.score !== null))).toBe(true);
    expect(r.find((x) => x.bounty_id === "bnty_gold")?.lock_reasons).toEqual([GATE_TEXT.eligibility_tier]);
    expect(GATE_TEXT.funded).toMatch(/Not live yet/);
  });

  it("orders unlocked matches by score, then by expected pay", () => {
    const strong = bounty("bnty_strong");
    const weaker = bounty("bnty_weaker", { eligibility: { countries: ["US"], niches: ["ai_tools", "tech", "money"], min_us_audience_ratio: 0.5 }, brand_reliability: 70 });
    const r = rankBountiesForCreator({ creator: maya, bounties: [weaker, strong], now: NOW });
    expect(r.map((x) => x.bounty_id)).toEqual(["bnty_strong", "bnty_weaker"]);
    expect((r[0].score ?? 0) > (r[1].score ?? 0)).toBe(true);
  });

  it("requires a follower minimum on a linked account", () => {
    const r = rankBountiesForCreator({ creator: maya, bounties: [bounty("bnty_big", { eligibility: { countries: ["US"], niches: ["ai_tools"], min_followers: 100_000 } }), bounty("bnty_ok", { eligibility: { countries: ["US"], niches: ["ai_tools"], min_followers: 40_000 } })], now: NOW });
    expect(r.find((x) => x.bounty_id === "bnty_big")?.gate_failures).toEqual(["eligibility_tier"]);
    expect(r.find((x) => x.bounty_id === "bnty_ok")?.locked).toBe(false);
  });

  it("ignores accounts that need re-authorising", () => {
    const stale = { ...maya, accounts: maya.accounts.map((a) => ({ ...a, status: "needs_reauth" as const })) };
    const [m] = rankBountiesForCreator({ creator: stale, bounties: [bounty("bnty_a")], now: NOW });
    expect(m.gate_failures).toEqual(["platform_account_linked"]);
  });

  it("scales the price fit with the creator's own usual pay", () => {
    const rich = rankBountiesForCreator({ creator: { ...maya, usual_pay_cents: 20_000 }, bounties: [bounty("bnty_a")], now: NOW })[0];
    const modest = rankBountiesForCreator({ creator: { ...maya, usual_pay_cents: 1000 }, bounties: [bounty("bnty_a")], now: NOW })[0];
    expect(rich.factors.price).toBeLessThan(modest.factors.price);
    expect(modest.factors.price).toBe(1);
  });

  it("defaults the usual pay to the creator's median views at the default CPM", () => {
    // 14,200 views at the $2.00 default CPM is $28.40 usual. A $1.00 CPM bounty pays $14.20 at the median: a ratio of 0.5, a price fit of 1/3.
    const [m] = rankBountiesForCreator({ creator: { ...maya, usual_pay_cents: undefined }, bounties: [bounty("bnty_a", { cpm_cents: 100, rates: {} })], now: NOW });
    expect(m.expected_pay_cents.median).toBe(1420);
    expect(m.factors.price).toBeCloseTo(0.5 / 1.5, 6);
    expect(m.reasons).not.toContain("Pays at or above what you usually earn.");
    // The stacked $2.10 bounty pays $43.89 against $28.40: a ratio over 1.5, so the fit is capped at 1.
    const [stacked] = rankBountiesForCreator({ creator: { ...maya, usual_pay_cents: undefined }, bounties: [bounty("bnty_b")], now: NOW });
    expect(stacked.factors.price).toBe(1);
  });

  it("puts a locked bounty with fewer failed gates first, then orders by id", () => {
    const r = rankBountiesForCreator({
      creator: { ...maya, submitted_bounty_ids: ["bnty_both"] },
      bounties: [bounty("bnty_both", { platforms: ["youtube"] }), bounty("bnty_one", { eligibility: { countries: ["GB"], niches: ["ai_tools"] } })],
      now: NOW,
    });
    expect(r.map((x) => [x.bounty_id, x.gate_failures.length])).toEqual([["bnty_one", 1], ["bnty_both", 2]]);
  });

  it("adds a flat fee on a direct bounty to the expected pay", () => {
    const [m] = rankBountiesForCreator({ creator: maya, bounties: [bounty("bnty_direct", { cpm_cents: 0, rates: {}, flat_fee_cents: 30_000 })], now: NOW });
    expect(m.expected_pay_cents).toEqual({ p25: 30_000, median: 30_000, p75: 30_000 });
  });

  it("applies early access: a head start by tier before a bounty releases", () => {
    const upcoming = bounty("bnty_soon", { status: "live", starts_at: "2026-10-03T16:00:00Z", published_at: undefined, created_at: "2026-10-03T12:00:00Z" });
    const asSilver = rankBountiesForCreator({ creator: maya, bounties: [upcoming], now: NOW });
    expect(asSilver).toEqual([]); // Silver sees it from 15:00
    const hidden = rankBountiesForCreator({ creator: maya, bounties: [upcoming], now: NOW, include_hidden: true });
    expect(hidden[0]).toMatchObject({ visible: false, visible_at: "2026-10-03T15:00:00Z" });
    const asGold = rankBountiesForCreator({ creator: { ...maya, tier: "gold" }, bounties: [upcoming], now: NOW });
    expect(asGold[0]).toMatchObject({ visible: true, visible_at: "2026-10-03T13:00:00Z" });
  });

  it("handles a creator with no accounts and no bounties", () => {
    expect(rankBountiesForCreator({ creator: maya, bounties: [], now: NOW })).toEqual([]);
    const [m] = rankBountiesForCreator({ creator: { ...maya, accounts: [] }, bounties: [bounty("bnty_a")], now: NOW });
    expect(m.gate_failures).toContain("platform_account_linked");
    expect(m.expected_pay_cents.median).toBe(0);
  });

  it("is deterministic", () => {
    const a = rankBountiesForCreator({ creator: maya, bounties: [bounty("bnty_b"), bounty("bnty_a")], now: NOW });
    expect(a).toEqual(rankBountiesForCreator({ creator: maya, bounties: [bounty("bnty_a"), bounty("bnty_b")], now: NOW }));
    expect(a.map((x) => x.bounty_id)).toEqual(["bnty_a", "bnty_b"]);
  });
});

describe("rankCreatorsForBounty", () => {
  const profile = (id: string, over: Partial<CreatorMatchProfile> = {}): CreatorMatchProfile => ({ ...maya, id, ...over });
  const b = bounty("bnty_a", { eligibility: { countries: ["US"], niches: ["ai_tools"], min_tier: "silver", min_us_audience_ratio: 0.5 } });

  it("ranks the fit first and lists the reasons", () => {
    const r = rankCreatorsForBounty({
      bounty: b,
      creators: [
        profile("cr_bronze", { tier: "bronze" }),
        profile("cr_maya"),
        profile("cr_off_niche", { niches: ["food"] }),
        profile("cr_paused", { paused_until: "2026-12-01T00:00:00Z" }),
        profile("cr_no_account", { accounts: [] }),
        profile("cr_uk", { country: "GB" }),
        profile("cr_done", { submitted_bounty_ids: ["bnty_a"] }),
      ],
      now: NOW,
    });
    expect(r[0].creator_id).toBe("cr_maya");
    expect(r[0].score).toBeGreaterThan(80);
    expect(r[0].reasons).toEqual(expect.arrayContaining(["Covers the bounty's niche.", "Audience fits the target region.", "Reliable on finished work.", "Active this week."]));
    expect(r[1].creator_id).toBe("cr_off_niche");
    expect(r[1].score).toBeLessThan(r[0].score ?? 0);
    const failures = Object.fromEntries(r.filter((x) => x.score === null).map((x) => [x.creator_id, x.gate_failures]));
    expect(failures).toEqual({
      cr_bronze: ["eligibility_tier"],
      cr_done: ["not_already_submitted"],
      cr_no_account: ["platform_account_linked"],
      cr_paused: ["paused"],
      cr_uk: ["country"],
    });
  });

  it("filters to creators open to offers for an invite", () => {
    const r = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_a"), profile("cr_b", { open_to_offers: false })], now: NOW, require_open_to_offers: true });
    expect(r.find((x) => x.creator_id === "cr_b")?.gate_failures).toEqual(["open_to_offers"]);
    expect(r.find((x) => x.creator_id === "cr_a")?.score).not.toBeNull();
  });

  it("compares the bounty CPM with the creator's rate-card minimum", () => {
    const cheap = rankCreatorsForBounty({ bounty: { ...b, cpm_cents: 100 }, creators: [profile("cr_a", { min_cpm_cents: 200 })], now: NOW })[0];
    const rich = rankCreatorsForBounty({ bounty: { ...b, cpm_cents: 300 }, creators: [profile("cr_a", { min_cpm_cents: 200 })], now: NOW })[0];
    expect(cheap.factors.price).toBeCloseTo(0.5 / 1.5, 6);
    expect(rich.factors.price).toBe(1);
    expect((rich.score ?? 0) > (cheap.score ?? 0)).toBe(true);
  });

  it("decays a creator's recency by days since they were active", () => {
    const fresh = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_a", { last_active_at: "2026-10-03T10:00:00Z" })], now: NOW })[0];
    const old = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_a", { last_active_at: "2026-09-03T14:00:00Z" })], now: NOW })[0];
    const never = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_a", { last_active_at: undefined })], now: NOW })[0];
    expect(fresh.factors.recency).toBeGreaterThan(old.factors.recency);
    expect(fresh.factors.recency).toBeCloseTo(0.5 ** (4 / 24 / 14), 4);
    expect(old.factors.recency).toBeCloseTo(0.5 ** (30 / 14), 4);
    // A creator with no known activity counts as 30 days idle: the same recency as one last active 30 days ago.
    expect(never.factors.recency).toBeCloseTo(old.factors.recency, 6);
  });

  it("gives a creator with no history a neutral 70 reliability", () => {
    const [r] = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_a", { reliability_score: undefined })], now: NOW });
    expect(r.factors.brand_reliability).toBe(0.7);
  });

  it("returns nothing for no creators and is deterministic", () => {
    expect(rankCreatorsForBounty({ bounty: b, creators: [], now: NOW })).toEqual([]);
    const a = rankCreatorsForBounty({ bounty: b, creators: [profile("cr_b"), profile("cr_a")], now: NOW });
    expect(a.map((x) => x.creator_id)).toEqual(["cr_a", "cr_b"]);
  });
});
