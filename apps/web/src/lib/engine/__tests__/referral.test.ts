import { describe, expect, it } from "vitest";
import {
  INVITE_EXPIRY_DAYS,
  WAITLIST_JUMP_PER_INVITE,
  brandPartnerShare,
  creatorReferralReward,
  isSelfReferral,
  makeReferralCode,
  rankWaitlist,
  referralLink,
  referralStatus,
  waitlistPosition,
} from "../referral";
import { addDays } from "../time";
import { NOW } from "./helpers";

describe("creatorReferralReward (5% of the referee's cleared earnings for 90 days, capped at $100)", () => {
  const first = "2026-09-01T00:00:00Z";

  it("pays nothing until the referee has a first dollar", () => {
    expect(creatorReferralReward({ earnings: [{ cleared_at: NOW, amount_cents: 5000 }] })).toEqual({ earned_cents: 0, cap_cents: 10_000, remaining_cap_cents: 10_000, per_earning: [], outside_window: 0 });
  });

  it("takes 5% of each cleared earning inside the 90 days after the first dollar", () => {
    const r = creatorReferralReward({
      first_dollar_at: first,
      earnings: [
        { cleared_at: "2026-12-01T00:00:00Z", amount_cents: 5000 }, // after the window
        { cleared_at: "2026-10-01T00:00:00Z", amount_cents: 10_000 },
        { cleared_at: "2026-08-31T00:00:00Z", amount_cents: 1000 }, // before the first dollar
        { cleared_at: "2026-09-02T00:00:00Z", amount_cents: 4000 },
      ],
    });
    expect(r.window_ends_at).toBe("2026-11-30T00:00:00Z");
    expect(r.per_earning).toEqual([
      { cleared_at: "2026-09-02T00:00:00Z", amount_cents: 4000, reward_cents: 200 },
      { cleared_at: "2026-10-01T00:00:00Z", amount_cents: 10_000, reward_cents: 500 },
    ]);
    expect(r).toMatchObject({ earned_cents: 700, cap_cents: 10_000, remaining_cap_cents: 9300, outside_window: 2 });
  });

  it("includes an earning that clears exactly at the end of the window, and rounds half a cent up", () => {
    const r = creatorReferralReward({ first_dollar_at: first, earnings: [{ cleared_at: "2026-11-30T00:00:00Z", amount_cents: 10 }, { cleared_at: "2026-11-30T00:00:01Z", amount_cents: 10 }] });
    expect(r.per_earning).toEqual([{ cleared_at: "2026-11-30T00:00:00Z", amount_cents: 10, reward_cents: 1 }]);
    expect(r.outside_window).toBe(1);
  });

  it("stops at $100 per referee", () => {
    const r = creatorReferralReward({
      first_dollar_at: first,
      earnings: [
        { cleared_at: "2026-09-05T00:00:00Z", amount_cents: 120_000 },
        { cleared_at: "2026-09-12T00:00:00Z", amount_cents: 120_000 },
        { cleared_at: "2026-09-19T00:00:00Z", amount_cents: 120_000 },
      ],
    });
    expect(r.per_earning.map((p) => p.reward_cents)).toEqual([6000, 4000, 0]);
    expect(r).toMatchObject({ earned_cents: 10_000, remaining_cap_cents: 0 });
  });

  it("handles a referee with no earnings yet", () => {
    expect(creatorReferralReward({ first_dollar_at: first, earnings: [] })).toEqual({ window_ends_at: "2026-11-30T00:00:00Z", earned_cents: 0, cap_cents: 10_000, remaining_cap_cents: 10_000, per_earning: [], outside_window: 0 });
  });
});

describe("brandPartnerShare (10% of platform fees for 12 months)", () => {
  it("takes 10% of each fee inside the 12 months from the brand's start, and ignores the rest", () => {
    const r = brandPartnerShare({
      started_at: "2026-01-31T00:00:00Z",
      fees: [
        { at: "2027-02-01T00:00:00Z", fee_cents: 9999 }, // after 12 months
        { at: "2026-12-20T00:00:00Z", fee_cents: 12_345 },
        { at: "2026-01-30T00:00:00Z", fee_cents: 100 }, // before the start
        { at: "2026-02-15T00:00:00Z", fee_cents: 5000 },
      ],
    });
    expect(r.window_ends_at).toBe("2027-01-31T00:00:00Z");
    expect(r.per_fee).toEqual([
      { at: "2026-02-15T00:00:00Z", fee_cents: 5000, share_cents: 500 },
      { at: "2026-12-20T00:00:00Z", fee_cents: 12_345, share_cents: 1235 },
    ]);
    expect(r.earned_cents).toBe(1735);
  });

  it("clamps the window end to the end of a short month", () => {
    expect(brandPartnerShare({ started_at: "2027-02-28T00:00:00Z", fees: [] }).window_ends_at).toBe("2028-02-28T00:00:00Z");
    expect(brandPartnerShare({ started_at: "2024-02-29T00:00:00Z", fees: [] }).window_ends_at).toBe("2025-02-28T00:00:00Z");
    expect(brandPartnerShare({ started_at: "2026-10-03T14:00:00Z", fees: [] })).toEqual({ window_ends_at: "2027-10-03T14:00:00Z", earned_cents: 0, per_fee: [] });
  });
});

describe("referralStatus", () => {
  const invited_at = addDays(NOW, -10);

  it("is invited until the invite lapses after 30 days", () => {
    expect(INVITE_EXPIRY_DAYS).toBe(30);
    expect(referralStatus({ invited_at, now: NOW })).toBe("invited");
    expect(referralStatus({ invited_at: addDays(NOW, -30), now: NOW })).toBe("invited");
    expect(referralStatus({ invited_at: addDays(NOW, -31), now: NOW })).toBe("expired");
  });

  it("moves through joined, first dollar, earning and complete", () => {
    const joined_at = addDays(NOW, -8);
    expect(referralStatus({ invited_at, joined_at, now: NOW })).toBe("joined");
    // joining stops the invite from expiring
    expect(referralStatus({ invited_at: addDays(NOW, -90), joined_at: addDays(NOW, -80), now: NOW })).toBe("joined");
    const first_dollar_at = addDays(NOW, -5);
    const reward_window_ends_at = addDays(first_dollar_at, 90);
    expect(referralStatus({ invited_at, joined_at, first_dollar_at, reward_window_ends_at, now: NOW })).toBe("first_dollar");
    expect(referralStatus({ invited_at, joined_at, first_dollar_at, reward_window_ends_at, reward_earned_cents: 0, now: NOW })).toBe("first_dollar");
    expect(referralStatus({ invited_at, joined_at, first_dollar_at, reward_window_ends_at, reward_earned_cents: 240, now: NOW })).toBe("earning");
    expect(referralStatus({ invited_at, joined_at, first_dollar_at, reward_window_ends_at: addDays(NOW, -1), reward_earned_cents: 240, now: NOW })).toBe("complete");
    // exactly at the end of the window is still running
    expect(referralStatus({ invited_at, joined_at, first_dollar_at, reward_window_ends_at: NOW, reward_earned_cents: 240, now: NOW })).toBe("earning");
  });
});

describe("referral codes and links", () => {
  it("makes a short code from the first name, deterministically", () => {
    const a = makeReferralCode("Maya Chen");
    expect(a).toMatch(/^MAYA[1-9]$/);
    expect(makeReferralCode("Maya Chen")).toBe(a);
    expect(makeReferralCode("maya")).toBe(a);
  });

  it("cleans the name: letters only, at most six, with a fallback", () => {
    expect(makeReferralCode("J@mes O'Neil")).toMatch(/^JMES[1-9]$/);
    expect(makeReferralCode("Alexandria Ocasio")).toMatch(/^ALEXAN[1-9]$/);
    expect(makeReferralCode("Zoë")).toMatch(/^ZO[1-9]$/);
    expect(makeReferralCode("   ")).toMatch(/^FLOWD[1-9]$/);
    expect(makeReferralCode("1234")).toMatch(/^FLOWD[1-9]$/);
  });

  it("avoids taken codes, moving on a digit at a time and then to two digits", () => {
    const first = makeReferralCode("Maya");
    const second = makeReferralCode("Maya", new Set([first]));
    expect(second).not.toBe(first);
    const all = new Set(Array.from({ length: 9 }, (_, i) => `MAYA${i + 1}`));
    expect(makeReferralCode("Maya", all)).toBe("MAYA10");
    all.add("MAYA10");
    expect(makeReferralCode("Maya", all)).toBe("MAYA11");
  });

  it("builds the share link on the public domain", () => {
    expect(referralLink("MAYA6")).toBe("joinflowd.io/waitlist?ref=MAYA6");
  });

  it("spots a self-referral", () => {
    expect(isSelfReferral({ referrer_id: "cr_maya", referee_id: "cr_maya" })).toBe(true);
    expect(isSelfReferral({ referrer_id: "cr_maya", referee_id: "cr_jo" })).toBe(false);
  });
});

describe("the ranked waitlist", () => {
  it("moves a member up 25 places per accepted invite, never above 1", () => {
    expect(WAITLIST_JUMP_PER_INVITE).toBe(25);
    expect(waitlistPosition({ join_order: 100, accepted_invites: 0 })).toBe(100);
    expect(waitlistPosition({ join_order: 100, accepted_invites: 2 })).toBe(50);
    expect(waitlistPosition({ join_order: 10, accepted_invites: 1 })).toBe(1);
    expect(waitlistPosition({ join_order: 10, accepted_invites: 5 })).toBe(1);
  });

  it("ranks by effective position with gap-free ranks, ties going to whoever joined first", () => {
    const entries = [
      { id: "a", join_order: 100, accepted_invites: 0 },
      { id: "b", join_order: 120, accepted_invites: 2 }, // 70
      { id: "c", join_order: 40, accepted_invites: 0 }, // 40
      { id: "d", join_order: 75, accepted_invites: 1 }, // 50
      { id: "e", join_order: 50, accepted_invites: 0 }, // 50, joined earlier than d
      { id: "f", join_order: 10, accepted_invites: 3 }, // -65, shown as 1
    ];
    const r = rankWaitlist(entries);
    expect(r.map((x) => x.id)).toEqual(["f", "c", "e", "d", "b", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.map((x) => x.effective_position)).toEqual([1, 40, 50, 50, 70, 100]);
    expect(r[0].accepted_invites).toBe(3);
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c", "d", "e", "f"]); // the input is untouched
    expect(rankWaitlist([])).toEqual([]);
  });
});
