import { describe, expect, it } from "vitest";
import {
  SPARK_OPTIONS_DAYS,
  adMustStop,
  buildRightsCard,
  daysLeft,
  deriveGrantStatus,
  dueExpiryAlerts,
  effectiveAdEnd,
  renewalPricePer30,
  renewalQuote,
  rightsEndsAt,
  rightsLines,
  rightsSummary,
  rightsVault,
  sparkCodeDaysFor,
  validateRightsCard,
  type VaultGrant,
} from "../rights";
import { addDays } from "../time";
import { NOW } from "./helpers";

describe("buildRightsCard", () => {
  it("starts from the platform defaults: organic always, 90 days of paid ads, 25% renewal, AI likeness off", () => {
    const card = buildRightsCard();
    expect(card).toMatchObject({
      organic: true,
      paid_ads_days: 90,
      ad_platforms: ["tiktok", "meta"],
      whitelisting: true,
      renewal_pct_per_30d: 0.25,
      exclusivity_days: 0,
      ai_likeness: false,
      territory: "Worldwide",
    });
    expect(card.summary.length).toBeGreaterThan(100);
  });

  it("builds an organic-only card when paid ads are 0 days: no platforms, no permission", () => {
    const card = buildRightsCard({ paid_ads_days: 0, ad_platforms: ["tiktok"], whitelisting: true });
    expect(card).toMatchObject({ paid_ads_days: 0, ad_platforms: [], whitelisting: false });
    expect(card.summary).toContain("Paid ads are not included.");
  });

  it("takes overrides and never lets AI likeness default on", () => {
    const card = buildRightsCard({ paid_ads_days: 60, ad_platforms: ["meta"], whitelisting: false, renewal_pct_per_30d: 0.3, exclusivity_days: 30, territory: "United States" });
    expect(card).toMatchObject({ paid_ads_days: 60, ad_platforms: ["meta"], whitelisting: false, renewal_pct_per_30d: 0.3, exclusivity_days: 30, territory: "United States", ai_likeness: false });
    expect(buildRightsCard({ ai_likeness: true }).ai_likeness).toBe(true);
  });

  it("does not share the platform list between cards", () => {
    const a = buildRightsCard();
    a.ad_platforms.push("tiktok");
    expect(buildRightsCard().ad_platforms).toEqual(["tiktok", "meta"]);
  });
});

describe("rightsSummary", () => {
  it("says what is included, what costs extra, and that AI use is off", () => {
    const s = buildRightsCard().summary;
    expect(s).toContain("You post this video on your own account. That is always included.");
    expect(s).toContain("paid ad on TikTok and Meta for 90 days");
    expect(s).toContain("You will be asked to approve the ad permission");
    expect(s).toContain("25% of your fee for every extra 30 days");
    expect(s).toContain("There is no exclusivity.");
    expect(s).toContain("never cloned or recreated with AI");
    expect(s).toContain("Territory: worldwide.");
  });

  it("reflects each option in plain words", () => {
    expect(rightsSummary({ ...buildRightsCard(), exclusivity_days: 30 })).toContain("not to make a video for a competing app for 30 days");
    expect(rightsSummary({ ...buildRightsCard(), ai_likeness: true })).toContain("AI use of your voice or face is included in this licence.");
    expect(rightsSummary({ ...buildRightsCard(), whitelisting: false })).toContain("The brand cannot run it through your account.");
    expect(rightsSummary({ ...buildRightsCard(), territory: "US and Canada" })).toContain("Territory: US and Canada.");
    expect(rightsSummary({ ...buildRightsCard(), ad_platforms: [] })).toContain("as a paid ad for 90 days");
  });

  it("stays plain: short sentences and no legalese", () => {
    for (const card of [buildRightsCard(), buildRightsCard({ paid_ads_days: 0 }), buildRightsCard({ exclusivity_days: 60, ai_likeness: true })]) {
      const sentences = card.summary.split(/(?<=\.)\s+/);
      const words = card.summary.split(/\s+/).length;
      expect(words / sentences.length).toBeLessThan(18);
      expect(card.summary).not.toMatch(/hereby|thereof|licensor|licensee|irrevocable|sublicens/i);
    }
  });
});

describe("rightsLines", () => {
  it("lists seven rows and marks what a creator should read twice", () => {
    const lines = rightsLines(buildRightsCard());
    expect(lines.map((l) => l.id)).toEqual(["organic", "paid_ads", "whitelisting", "exclusivity", "ai_likeness", "renewal", "territory"]);
    expect(Object.fromEntries(lines.map((l) => [l.id, l.value]))).toEqual({
      organic: "Always included",
      paid_ads: "90 days on TikTok and Meta",
      whitelisting: "Requested when approved",
      exclusivity: "None",
      ai_likeness: "Off",
      renewal: "25% of your fee per extra 30 days",
      territory: "Worldwide",
    });
    expect(lines.filter((l) => l.notable).map((l) => l.id)).toEqual(["paid_ads", "whitelisting"]);
  });

  it("changes with the card", () => {
    const organic = Object.fromEntries(rightsLines(buildRightsCard({ paid_ads_days: 0 })).map((l) => [l.id, l]));
    expect(organic.paid_ads).toMatchObject({ value: "Not included", notable: false });
    expect(organic.renewal.value).toBe("Not applicable");
    const heavy = Object.fromEntries(rightsLines(buildRightsCard({ exclusivity_days: 14, ai_likeness: true })).map((l) => [l.id, l]));
    expect(heavy.exclusivity).toMatchObject({ value: "14 days", notable: true });
    expect(heavy.ai_likeness).toMatchObject({ value: "Included", notable: true });
  });
});

describe("validateRightsCard", () => {
  it("has nothing to say about the default card", () => {
    expect(validateRightsCard(buildRightsCard())).toEqual([]);
  });

  it("blocks what Brief Lint blocks: perpetual terms and AI likeness", () => {
    const messages = (c: ReturnType<typeof buildRightsCard>) => validateRightsCard(c).filter((i) => i.severity === "blocker").map((i) => i.message);
    expect(messages(buildRightsCard({ paid_ads_days: 366 }))).toEqual(["Paid-ad terms over 365 days are treated as perpetual. Use a fixed term with a priced renewal."]);
    expect(messages(buildRightsCard({ paid_ads_days: 365 }))).toEqual([]);
    expect(messages(buildRightsCard({ ai_likeness: true }))).toEqual(["AI likeness is off by default and needs a separate agreement."]);
    expect(messages({ ...buildRightsCard(), organic: false })).toEqual(["Organic posting is always included."]);
    expect(messages({ ...buildRightsCard(), paid_ads_days: -1 })).toEqual(["The paid-ad term cannot be negative."]);
    expect(messages(buildRightsCard({ renewal_pct_per_30d: 1.5 }))).toEqual(["Renewal must be a share of the base fee between 0% and 100%."]);
    expect(messages(buildRightsCard({ renewal_pct_per_30d: -0.1 }))).toHaveLength(1);
  });

  it("warns on a paid-ad term with no platform and on an unusual exclusivity", () => {
    const warn = (c: ReturnType<typeof buildRightsCard>) => validateRightsCard(c).filter((i) => i.severity === "warning").map((i) => i.message);
    expect(warn(buildRightsCard({ ad_platforms: [] }))).toEqual(["Paid ads are included but no ad platform is named."]);
    expect(validateRightsCard({ ...buildRightsCard(), ad_platforms: [] }).map((i) => i.severity)).toEqual(["warning"]);
    // organic only has no platforms by design and is not a warning
    expect(validateRightsCard(buildRightsCard({ paid_ads_days: 0 }))).toEqual([]);
    expect(warn(buildRightsCard({ exclusivity_days: 7 }))).toEqual(["Exclusivity is usually 14, 30 or 60 days."]);
    for (const d of [0, 14, 30, 60]) expect(warn(buildRightsCard({ exclusivity_days: d }))).toEqual([]);
  });
});

describe("renewals", () => {
  it("prices one 30-day period at 25% of the base fee, rounded half up", () => {
    expect(renewalPricePer30(10_000)).toBe(2500);
    expect(renewalPricePer30(7654)).toBe(1914); // 1913.5
    expect(renewalPricePer30(10_000, 0.3)).toBe(3000);
    expect(renewalPricePer30(0)).toBe(0);
  });

  it("quotes an extension: each started 30 days is a period, the brand pays the fee on top", () => {
    const q = renewalQuote({ base_fee_cents: 7654, extra_days: 60, take_rate: 0.1, current_ends_at: "2026-12-01T00:00:00Z" });
    expect(q).toEqual({
      periods: 2,
      per_30_cents: 1914,
      price_cents: 3828,
      fee_cents: 383,
      total_cents: 4211,
      new_ends_at: "2027-01-30T00:00:00Z",
      summary: "Extend 60 days for $38.28 (+ $3.83 fee)",
    });
    expect(renewalQuote({ base_fee_cents: 7654, extra_days: 31, take_rate: 0.1 }).periods).toBe(2);
    expect(renewalQuote({ base_fee_cents: 7654, extra_days: 30, take_rate: 0.1 }).periods).toBe(1);
    expect(renewalQuote({ base_fee_cents: 7654, extra_days: 30, take_rate: 0.1 })).not.toHaveProperty("new_ends_at");
  });

  it("handles a waived fee, a custom share and nothing to renew", () => {
    expect(renewalQuote({ base_fee_cents: 10_000, extra_days: 30, take_rate: 0 })).toMatchObject({ fee_cents: 0, total_cents: 2500, summary: "Extend 30 days for $25.00" });
    expect(renewalQuote({ base_fee_cents: 10_000, extra_days: 30, take_rate: 0.12, renewal_pct_per_30d: 0.4 })).toMatchObject({ per_30_cents: 4000, fee_cents: 480, total_cents: 4480 });
    expect(renewalQuote({ base_fee_cents: 10_000, extra_days: 0, take_rate: 0.1, current_ends_at: NOW })).toEqual({ periods: 0, per_30_cents: 2500, price_cents: 0, fee_cents: 0, total_cents: 0, summary: "Nothing to renew." });
    expect(renewalQuote({ base_fee_cents: 10_000, extra_days: -10, take_rate: 0.1 }).periods).toBe(0);
  });
});

describe("expiry", () => {
  it("counts days left and the end of a term", () => {
    expect(daysLeft("2026-10-10T14:00:00Z", NOW)).toBe(7);
    expect(daysLeft("2026-10-03T02:00:00Z", NOW)).toBeCloseTo(-0.5, 9);
    expect(rightsEndsAt("2026-07-05T00:00:00Z", 90)).toBe("2026-10-03T00:00:00Z");
  });

  it("sends the alerts at 30, 14 and 7 days, once each", () => {
    const at = (days: number, sent: number[] = []) => dueExpiryAlerts({ ends_at: addDays(NOW, days), alerts_sent: sent, now: NOW });
    expect(at(31)).toEqual({ due: [], send: null });
    expect(at(30)).toEqual({ due: [30], send: 30 });
    expect(at(29.5, [30])).toEqual({ due: [], send: null });
    expect(at(14)).toEqual({ due: [30, 14], send: 14 });
    expect(at(14, [30])).toEqual({ due: [14], send: 14 });
    expect(at(7)).toEqual({ due: [30, 14, 7], send: 7 });
    expect(at(6, [30, 14])).toEqual({ due: [7], send: 7 });
    expect(at(6, [30, 14, 7])).toEqual({ due: [], send: null });
  });

  it("sends only the most urgent alert when the job ran late, and none after the end", () => {
    expect(dueExpiryAlerts({ ends_at: addDays(NOW, 5), alerts_sent: [], now: NOW }).send).toBe(7);
    expect(dueExpiryAlerts({ ends_at: NOW, alerts_sent: [], now: NOW })).toEqual({ due: [], send: null });
    expect(dueExpiryAlerts({ ends_at: addDays(NOW, -1), alerts_sent: [], now: NOW })).toEqual({ due: [], send: null });
  });

  it("derives the status a grant should show", () => {
    const s = (over: Partial<Parameters<typeof deriveGrantStatus>[0]>) => deriveGrantStatus({ status: "active", ends_at: addDays(NOW, 90), now: NOW, ...over });
    expect(s({})).toBe("active");
    expect(s({ ends_at: addDays(NOW, 30) })).toBe("expiring");
    expect(s({ ends_at: addDays(NOW, 30.01) })).toBe("active");
    expect(s({ ends_at: addDays(NOW, 0) })).toBe("expired");
    expect(s({ ends_at: addDays(NOW, -3) })).toBe("expired");
    expect(s({ ends_at: undefined })).toBe("active");
    expect(s({ status: "revoked" })).toBe("revoked");
    expect(s({ revoked_at: NOW })).toBe("revoked");
    expect(s({ status: "pending_permission", ends_at: undefined })).toBe("pending_permission");
    expect(s({ status: "renewal_requested", ends_at: addDays(NOW, 10) })).toBe("renewal_requested");
    expect(s({ status: "renewal_requested", ends_at: addDays(NOW, -1) })).toBe("expired");
  });
});

describe("Spark codes and the ad stop rule", () => {
  it("offers 7, 30, 60 and 365 days and picks the shortest code that covers the term", () => {
    expect(SPARK_OPTIONS_DAYS).toEqual([7, 30, 60, 365]);
    expect(sparkCodeDaysFor(5)).toBe(7);
    expect(sparkCodeDaysFor(30)).toBe(30);
    expect(sparkCodeDaysFor(31)).toBe(60);
    expect(sparkCodeDaysFor(90)).toBe(365);
    expect(sparkCodeDaysFor(365)).toBe(365);
    expect(sparkCodeDaysFor(500)).toBe(365);
  });

  it("ends ads at the earlier of the Spark code and the rights term", () => {
    expect(effectiveAdEnd({ code_expires_at: "2026-11-01T00:00:00Z", rights_ends_at: "2026-12-01T00:00:00Z" })).toEqual({ ends_at: "2026-11-01T00:00:00Z", limited_by: "spark_code" });
    expect(effectiveAdEnd({ code_expires_at: "2027-01-01T00:00:00Z", rights_ends_at: "2026-12-01T00:00:00Z" })).toEqual({ ends_at: "2026-12-01T00:00:00Z", limited_by: "rights" });
    expect(effectiveAdEnd({ code_expires_at: "2026-12-01T00:00:00Z", rights_ends_at: "2026-12-01T00:00:00Z" }).limited_by).toBe("rights");
    expect(effectiveAdEnd({ code_expires_at: "2026-11-01T00:00:00Z" })).toEqual({ ends_at: "2026-11-01T00:00:00Z", limited_by: "spark_code" });
    expect(effectiveAdEnd({ rights_ends_at: "2026-12-01T00:00:00Z" })).toEqual({ ends_at: "2026-12-01T00:00:00Z", limited_by: "rights" });
    expect(effectiveAdEnd({})).toEqual({ ends_at: null, limited_by: null });
  });

  it("stops an ad automatically, and says why", () => {
    expect(adMustStop({ now: NOW, code_expires_at: "2026-10-03T13:59:59Z", rights_ends_at: "2026-12-01T00:00:00Z" })).toEqual({ stop: true, reason: "The Spark code expired. Codes cannot be reactivated; request a new one." });
    expect(adMustStop({ now: NOW, rights_ends_at: "2026-10-03T14:00:00Z" })).toEqual({ stop: true, reason: "The rights term ended. Renew it to keep the ad running." });
    expect(adMustStop({ now: NOW, code_expires_at: "2026-10-03T14:00:01Z" })).toEqual({ stop: false });
    expect(adMustStop({ now: NOW })).toEqual({ stop: false });
  });
});

describe("rightsVault", () => {
  const grant = (id: string, days: number | null, over: Partial<VaultGrant> = {}): VaultGrant => ({
    id,
    scope: "paid_ads",
    status: "active",
    ...(days === null ? {} : { ends_at: addDays(NOW, days) }),
    renewal_price_cents: 1000,
    alerts_sent: [],
    ...over,
  });
  const grants = [grant("g_90", 90), grant("g_none", null, { scope: "organic" }), grant("g_25", 25), grant("g_exp", -2), grant("g_6", 6), grant("g_rev", 3, { status: "revoked" }), grant("g_10", 10), grant("g_14", 14), grant("g_30", 30)];

  it("buckets grants by how soon they end, soonest first, and leaves revoked ones out", () => {
    const v = rightsVault(grants, NOW);
    expect(v.expired.map((g) => g.id)).toEqual(["g_exp"]);
    expect(v.within_7.map((g) => g.id)).toEqual(["g_6"]);
    expect(v.within_14.map((g) => g.id)).toEqual(["g_10", "g_14"]);
    expect(v.within_30.map((g) => g.id)).toEqual(["g_25", "g_30"]);
    expect(v.later.map((g) => g.id)).toEqual(["g_90"]);
    expect(v.no_end.map((g) => g.id)).toEqual(["g_none"]);
    const all = [...v.expired, ...v.within_7, ...v.within_14, ...v.within_30, ...v.later, ...v.no_end].map((g) => g.id);
    expect(all).not.toContain("g_rev");
    expect(all).toHaveLength(8);
  });

  it("totals what it costs to renew everything ending inside 30 days, and lists the alerts due now", () => {
    const v = rightsVault(grants, NOW);
    expect(v.renewal_exposure_cents).toBe(5000); // g_6, g_10, g_14, g_25, g_30
    expect(v.alerts_due).toEqual([
      { grant_id: "g_6", days: 7 },
      { grant_id: "g_10", days: 14 },
      { grant_id: "g_14", days: 14 },
      { grant_id: "g_25", days: 30 },
      { grant_id: "g_30", days: 30 },
    ]);
  });

  it("does not repeat an alert that went out", () => {
    const v = rightsVault([grant("g_6", 6, { alerts_sent: [30, 14, 7] }), grant("g_10", 10, { alerts_sent: [30] })], NOW);
    expect(v.alerts_due).toEqual([{ grant_id: "g_10", days: 14 }]);
    expect(v.renewal_exposure_cents).toBe(2000);
  });

  it("is empty for no grants and keeps the caller's grant objects", () => {
    expect(rightsVault([], NOW)).toEqual({ expired: [], within_7: [], within_14: [], within_30: [], later: [], no_end: [], renewal_exposure_cents: 0, alerts_due: [] });
    const one = grant("g_25", 25);
    expect(rightsVault([one], NOW).within_30[0]).toBe(one);
  });
});
