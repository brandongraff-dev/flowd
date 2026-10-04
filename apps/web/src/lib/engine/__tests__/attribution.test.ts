import { describe, expect, it } from "vitest";
import type { ConversionSource, OfferCode } from "@/lib/contract/types";
import {
  activeCodes,
  assignOfferCode,
  classifyRevenueCatEvent,
  confidenceFor,
  cpaEligibility,
  deepLink,
  ingestRevenueCatEvent,
  matchRevenueCatEvent,
  normalizeRevenueCatEvent,
  poolHealth,
  promoCodeText,
  rotationReasons,
  sdkAttributes,
  shortUrl,
  sourceChip,
  trackingCode,
  uniqueCodeText,
  validatePool,
  type NormalizedRcEvent,
  type RcRawEvent,
} from "../attribution";
import { NOW } from "./helpers";

const ms = (iso: string): number => Date.parse(iso);

describe("confidence labels", () => {
  it("maps every source to its confidence", () => {
    const expected: Record<ConversionSource, string> = { link: "deterministic", code: "deterministic", mmp: "matched", survey: "self_reported", modelled: "modelled" };
    for (const [source, confidence] of Object.entries(expected)) expect(confidenceFor(source as ConversionSource)).toBe(confidence);
  });

  it("labels tracked and estimated chips, and says which pay", () => {
    expect(sourceChip("link")).toEqual({ label: "Tracked (link)", kind: "tracked", pays: true });
    expect(sourceChip("code")).toEqual({ label: "Tracked (code)", kind: "tracked", pays: true });
    expect(sourceChip("mmp")).toEqual({ label: "Estimated (MMP)", kind: "estimated", pays: false });
    expect(sourceChip("survey")).toEqual({ label: "Estimated (survey)", kind: "estimated", pays: false });
    expect(sourceChip("modelled")).toEqual({ label: "Estimated (modelled)", kind: "estimated", pays: false });
  });
});

describe("CPA eligibility", () => {
  const rates = { install: 40, trial: 150, paid: 400 };
  const base = {
    conversion: { kind: "install" as const, source: "link" as const, status: "cleared" as const, occurred_at: "2026-10-01T08:00:00Z" },
    post: { posted_at: "2026-09-30T09:00:00Z", status: "cleared" as const },
    bounty: { type: "stacked" as const, rates },
    now: NOW,
  };

  it("pays a cleared link install inside the window", () => {
    expect(cpaEligibility(base)).toEqual({ eligible: true, code: "ok", message: "Tracked and cleared. This pays." });
  });

  it("never pays estimated sources, even when everything else is fine", () => {
    for (const source of ["mmp", "survey", "modelled"] as const) {
      const r = cpaEligibility({ ...base, conversion: { ...base.conversion, source } });
      expect(r).toMatchObject({ eligible: false, code: "estimated_source" });
    }
  });

  it("refuses rejected and refunded conversions", () => {
    expect(cpaEligibility({ ...base, conversion: { ...base.conversion, status: "rejected" } }).code).toBe("rejected");
    expect(cpaEligibility({ ...base, conversion: { ...base.conversion, status: "refunded" } }).code).toBe("refunded");
  });

  it("refuses a kind the bounty does not pay, and every kind on a CPM-only bounty", () => {
    expect(cpaEligibility({ ...base, bounty: { type: "stacked", rates: { trial: 150 } } }).code).toBe("no_rate");
    expect(cpaEligibility({ ...base, bounty: { type: "cpm", rates } }).code).toBe("no_rate");
    expect(cpaEligibility({ ...base, bounty: { type: "install_only", rates: { install: 40 } } }).eligible).toBe(true);
  });

  it("refuses conversions on a removed or clawed-back post", () => {
    expect(cpaEligibility({ ...base, post: { ...base.post, status: "removed" } }).code).toBe("post_removed");
    expect(cpaEligibility({ ...base, post: { ...base.post, status: "clawed_back" } }).code).toBe("post_removed");
  });

  it("only pays inside the 30 days after posting", () => {
    expect(cpaEligibility({ ...base, conversion: { ...base.conversion, occurred_at: "2026-09-30T08:00:00Z" } }).code).toBe("before_post");
    // exactly 30 days after the post is inside the window; a second later is not
    const post = { posted_at: "2026-09-01T00:00:00Z", status: "cleared" as const };
    expect(cpaEligibility({ ...base, post, conversion: { ...base.conversion, occurred_at: "2026-10-01T00:00:00Z" } }).code).toBe("ok");
    expect(cpaEligibility({ ...base, post, conversion: { ...base.conversion, occurred_at: "2026-10-01T00:00:01Z" } }).code).toBe("outside_window");
  });

  it("stops at the per-video cap", () => {
    expect(cpaEligibility({ ...base, cap_remaining_cents: 0 }).code).toBe("cap_reached");
    expect(cpaEligibility({ ...base, cap_remaining_cents: 1 }).eligible).toBe(true);
  });

  it("holds a conversion inside its clearing window and says when it clears", () => {
    const r = cpaEligibility({ ...base, conversion: { ...base.conversion, occurred_at: "2026-10-03T08:00:00Z" } });
    expect(r).toMatchObject({ eligible: false, code: "still_clearing", clears_at: "2026-10-04T14:00:00Z" });
    // a paid conversion waits the 168 h refund window
    const paid = cpaEligibility({ ...base, conversion: { kind: "paid", source: "code", status: "pending", occurred_at: "2026-09-30T20:00:00Z" } });
    expect(paid).toMatchObject({ eligible: false, code: "still_clearing", clears_at: "2026-10-08T14:00:00Z" });
  });

  it("also waits for the post's own clearing run: the CPM leg settles first, so the cap can be applied to both", () => {
    // an install 24 h old is past its own window, but the post (posted Oct 2 18:30, window open until Oct 5) clears at the Oct 6 14:00 run
    const live = { posted_at: "2026-10-02T18:30:00Z", status: "live" as const };
    const r = cpaEligibility({ ...base, post: live, conversion: { ...base.conversion, occurred_at: "2026-10-02T19:00:00Z" } });
    expect(r).toMatchObject({ eligible: false, code: "still_clearing", clears_at: "2026-10-06T14:00:00Z" });
    // once that run has executed it pays
    const later = cpaEligibility({ ...base, post: live, now: "2026-10-06T14:00:00Z", conversion: { ...base.conversion, occurred_at: "2026-10-02T19:00:00Z" } });
    expect(later).toMatchObject({ eligible: true, code: "ok" });
  });
});

describe("links and codes", () => {
  it("builds a short, deterministic tracking code from the handle and the app", () => {
    expect(trackingCode({ creator_handle: "maya.makes", app_slug: "lumi-ai-photo" })).toBe(trackingCode({ creator_handle: "maya.makes", app_slug: "lumi-ai-photo" }));
    expect(trackingCode({ creator_handle: "maya.makes", app_slug: "lumi-ai-photo" })).toMatch(/^maya-lumi[1-9]$/);
    expect(trackingCode({ creator_handle: "@Jo_Rivera", app_slug: "Stride Fit" })).toMatch(/^jo-stride[1-9]$/);
  });

  it("moves on until the code is free, then past 9 to two digits", () => {
    const first = trackingCode({ creator_handle: "maya", app_slug: "lumi" });
    const second = trackingCode({ creator_handle: "maya", app_slug: "lumi", taken: new Set([first]) });
    expect(second).not.toBe(first);
    const all = new Set(Array.from({ length: 9 }, (_, i) => `maya-lumi${i + 1}`));
    expect(trackingCode({ creator_handle: "maya", app_slug: "lumi", taken: all })).toBe("maya-lumi10");
    all.add("maya-lumi10");
    expect(trackingCode({ creator_handle: "maya", app_slug: "lumi", taken: all })).toBe("maya-lumi11");
  });

  it("falls back to a placeholder for an empty handle", () => {
    expect(trackingCode({ creator_handle: "", app_slug: "lumi" })).toMatch(/^x-lumi[1-9]$/);
  });

  it("builds the public URL, the deep link, the SDK attributes and the promo text", () => {
    expect(shortUrl("maya-lumi7")).toBe("joinflowd.io/r/maya-lumi7");
    expect(deepLink("lumi", "maya-lumi7")).toBe("lumi://r/maya-lumi7");
    expect(sdkAttributes({ code: "maya-lumi7", creator_id: "cr_maya", bounty_id: "bnty_a" })).toEqual({ flowd_link: "maya-lumi7", flowd_creator: "cr_maya", flowd_bounty: "bnty_a" });
    expect(promoCodeText("maya.makes", "lumi-ai-photo")).toBe("MAYA-LUMI");
  });
});

describe("the offer-code pool (Apple allows 10 active codes per subscription SKU)", () => {
  const code = (n: number, over: Partial<OfferCode> = {}): OfferCode => ({
    id: `oc_${n}`,
    app_id: "app_lumi",
    sku: "lumi_pro_annual",
    offer_name: "7-day free trial",
    code: `CODE${n}`,
    status: "assigned",
    assigned_creator_id: `cr_${n}`,
    assigned_bounty_id: `bnty_${n}`,
    assigned_at: "2026-09-20T00:00:00Z",
    redemptions: 10 + n,
    max_redemptions: 25_000,
    valid_from: "2026-09-01T00:00:00Z",
    valid_until: "2026-12-31T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  const pool = (n: number, over: (i: number) => Partial<OfferCode> = () => ({})): OfferCode[] => Array.from({ length: n }, (_, i) => code(i + 1, over(i + 1)));
  const ask = { app_id: "app_lumi", sku: "lumi_pro_annual", creator_id: "cr_new", bounty_id: "bnty_new", now: NOW, desired_code: "NEW-LUMI" };

  it("counts only available and assigned codes as active, per app and SKU", () => {
    const mixed = [code(1), code(2, { status: "available", assigned_creator_id: undefined }), code(3, { status: "expired" }), code(4, { status: "retired" }), code(5, { status: "exhausted" }), code(6, { sku: "lumi_pro_monthly" }), code(7, { app_id: "app_other" })];
    expect(activeCodes(mixed, "app_lumi", "lumi_pro_annual").map((c) => c.id)).toEqual(["oc_1", "oc_2"]);
  });

  it("reports pool health: slots, stale codes and usage", () => {
    const p = [...pool(8), code(9, { status: "available", assigned_creator_id: undefined }), code(10, { valid_until: "2026-10-01T00:00:00Z" }), code(11, { status: "retired" })];
    const h = poolHealth(p, "app_lumi", "lumi_pro_annual", NOW);
    expect(h).toMatchObject({ active: 10, cap: 10, free_slots: 0, available: 1, assigned: 9, stale: 1, at_cap: true });
    expect(h.usage_ratio).toBeCloseTo((9 * 10 + 45 + 10 + 10) / (10 * 25_000) / 1, 2);
    expect(poolHealth([], "app_lumi", "lumi_pro_annual", NOW)).toMatchObject({ active: 0, free_slots: 10, at_cap: false, usage_ratio: 0 });
    // out of redemptions counts as stale too
    expect(poolHealth([code(1, { redemptions: 25_000 })], "app_lumi", "lumi_pro_annual", NOW).stale).toBe(1);
  });

  it("validates T-12: at most 10 active per SKU, codes unique per app", () => {
    expect(validatePool(pool(10))).toEqual([]);
    expect(validatePool(pool(11))).toEqual(["app_lumi|lumi_pro_annual has 11 active codes (the limit is 10)."]);
    expect(validatePool([code(1), code(2, { code: "CODE1" })])).toEqual(["app_lumi|CODE1 is used 2 times (codes are unique per app)."]);
    // retired codes do not count against the cap
    expect(validatePool([...pool(10), code(11, { status: "retired" })])).toEqual([]);
  });

  it("explains why a code is due for rotation", () => {
    expect(rotationReasons(code(1), NOW)).toEqual([]);
    expect(rotationReasons(code(1, { valid_until: "2026-10-03T14:00:00Z" }), NOW)).toEqual(["Past its valid-until date."]);
    expect(rotationReasons(code(1, { redemptions: 25_000 }), NOW)).toEqual(["Out of redemptions."]);
    expect(rotationReasons(code(1, { rotation_due_at: "2026-10-02T00:00:00Z" }), NOW)).toEqual(["Rotation is due."]);
    expect(rotationReasons(code(1), NOW, true)).toEqual(["Its bounty has ended."]);
    expect(rotationReasons(code(1, { status: "available", assigned_creator_id: undefined }), NOW, true)).toEqual([]);
  });

  it("makes a code unique inside the app", () => {
    expect(uniqueCodeText("maya-lumi", new Set())).toBe("MAYA-LUMI");
    expect(uniqueCodeText("maya-lumi", new Set(["MAYA-LUMI"]))).toBe("MAYA-LUMI2");
    expect(uniqueCodeText("maya-lumi", new Set(["MAYA-LUMI", "MAYA-LUMI2"]))).toBe("MAYA-LUMI3");
  });

  it("reuses the code a creator already holds for this bounty", () => {
    const d = assignOfferCode({ ...ask, creator_id: "cr_3", bounty_id: "bnty_3", pool: pool(10) });
    expect(d).toMatchObject({ action: "reuse", code: { id: "oc_3" } });
  });

  it("assigns an available code first, the one expiring soonest", () => {
    const p = [...pool(5), code(6, { status: "available", assigned_creator_id: undefined, valid_until: "2026-12-01T00:00:00Z" }), code(7, { status: "available", assigned_creator_id: undefined, valid_until: "2026-11-01T00:00:00Z" })];
    expect(assignOfferCode({ ...ask, pool: p })).toMatchObject({ action: "assign_available", code: { id: "oc_7" } });
    // an available code that is expired or exhausted is not offered
    const dead = [code(1, { status: "available", assigned_creator_id: undefined, valid_until: "2026-10-01T00:00:00Z" }), code(2, { status: "available", assigned_creator_id: undefined, redemptions: 25_000 })];
    expect(assignOfferCode({ ...ask, pool: dead }).action).toBe("create_new");
  });

  it("creates a new code while fewer than 10 are active", () => {
    const d = assignOfferCode({ ...ask, pool: pool(9) });
    expect(d).toMatchObject({ action: "create_new", new_code: "NEW-LUMI" });
    expect(d.reason).toBe("9 of 10 active codes used, so there is room for a new one.");
    // a taken name gets a number
    expect(assignOfferCode({ ...ask, desired_code: "code1", pool: pool(9) })).toMatchObject({ action: "create_new", new_code: "CODE12" });
    expect(assignOfferCode({ ...ask, pool: [] })).toMatchObject({ action: "create_new", new_code: "NEW-LUMI" });
  });

  it("at the cap, rotates out a stale code first (expired, then ended bounty)", () => {
    const expired = assignOfferCode({ ...ask, pool: pool(10, (i) => (i === 4 ? { valid_until: "2026-10-02T00:00:00Z" } : {})) });
    expect(expired).toMatchObject({ action: "rotate", retire: { id: "oc_4" }, new_code: "NEW-LUMI" });
    expect(expired.reason).toContain("Retiring CODE4: Past its valid-until date.");
    const ended = assignOfferCode({ ...ask, ended_bounty_ids: ["bnty_8"], pool: pool(10) });
    expect(ended).toMatchObject({ action: "rotate", retire: { id: "oc_8" } });
    expect(ended.reason).toContain("Its bounty has ended.");
  });

  it("at the cap with nothing stale, rotates the least-used code assigned over 14 days ago", () => {
    const d = assignOfferCode({ ...ask, pool: pool(10, (i) => ({ redemptions: 100 - i * 5, assigned_at: "2026-09-10T00:00:00Z" })) });
    expect(d).toMatchObject({ action: "rotate", retire: { id: "oc_10" } });
    expect(d.reason).toContain("assigned more than 14 days ago");
  });

  it("falls back to the deterministic link when every code is in fresh use", () => {
    const d = assignOfferCode({ ...ask, pool: pool(10, () => ({ assigned_at: "2026-10-01T00:00:00Z" })) });
    expect(d.action).toBe("link_only");
    expect(d.reason).toContain("tracking link");
  });

  it("never lets the pool exceed the cap, whatever the decision", () => {
    for (const n of [0, 5, 9, 10]) {
      const p = pool(n);
      const d = assignOfferCode({ ...ask, pool: p });
      let next = p;
      if (d.action === "create_new") next = [...p, code(99, { code: d.new_code, assigned_creator_id: "cr_new", assigned_bounty_id: "bnty_new" })];
      if (d.action === "rotate") next = [...p.filter((c) => c.id !== d.retire.id), code(99, { code: d.new_code })];
      expect(validatePool(next)).toEqual([]);
    }
  });
});

describe("RevenueCat events", () => {
  const ctx = { app_id: "app_lumi", received_at: "2026-10-03T13:59:30Z" };
  const trial: RcRawEvent = {
    id: "evt_trial_1",
    type: "INITIAL_PURCHASE",
    app_user_id: "$RCAnonymousID:a1b2",
    product_id: "lumi_pro_annual",
    period_type: "TRIAL",
    purchased_at_ms: ms("2026-10-01T08:15:00Z"),
    expiration_at_ms: ms("2026-10-08T08:15:00Z"),
    environment: "PRODUCTION",
    price: 0,
    currency: "usd",
    country_code: "us",
    subscriber_attributes: { flowd_link: { value: "maya-lumi7", updated_at_ms: ms("2026-10-01T08:00:00Z") }, other: { value: "x" } },
  };
  const conversion: RcRawEvent = {
    id: "evt_paid_1",
    type: "RENEWAL",
    app_user_id: "$RCAnonymousID:a1b2",
    product_id: "lumi_pro_annual",
    period_type: "NORMAL",
    purchased_at_ms: ms("2026-10-02T09:00:00Z"),
    environment: "PRODUCTION",
    price: 34.99,
    currency: "USD",
    takehome_percentage: 0.85,
    is_trial_conversion: true,
    subscriber_attributes: { flowd_link: { value: "maya-lumi7" } },
  };
  const links = [{ id: "lnk_maya", code: "maya-lumi7", creator_id: "cr_maya", bounty_id: "bnty_a", app_id: "app_lumi", post_id: "post_1", status: "active" as const }];
  const offerCodes = [{ code: "MAYA-LUMI", app_id: "app_lumi", status: "assigned" as const, assigned_link_id: "lnk_maya", assigned_creator_id: "cr_maya", assigned_bounty_id: "bnty_a" }];
  const noneSeen = new Set<string>();

  it("normalises a trial start into flowd's own shape", () => {
    const e = normalizeRevenueCatEvent(trial, ctx);
    expect(e).toEqual({
      id: "evt_trial_1",
      app_id: "app_lumi",
      event_type: "initial_purchase",
      period_type: "trial",
      app_user_id: "$RCAnonymousID:a1b2",
      product_id: "lumi_pro_annual",
      price_cents: 0,
      currency: "USD",
      is_trial_conversion: false,
      subscriber_attributes: { flowd_link: "maya-lumi7", other: "x" },
      environment: "production",
      purchased_at: "2026-10-01T08:15:00Z",
      expiration_at: "2026-10-08T08:15:00Z",
      received_at: "2026-10-03T13:59:30Z",
      idempotency_key: "evt_trial_1",
      country: "US",
      kind: "trial",
    });
  });

  it("accepts the webhook envelope as well as the bare event", () => {
    expect(normalizeRevenueCatEvent({ api_version: "1.0", event: trial }, ctx)).toEqual(normalizeRevenueCatEvent(trial, ctx));
  });

  it("prices a trial conversion net of the store's cut, and a plain purchase at the full price", () => {
    expect(normalizeRevenueCatEvent(conversion, ctx)).toMatchObject({ event_type: "renewal", period_type: "normal", price_cents: 2974, is_trial_conversion: true, kind: "paid" });
    expect(normalizeRevenueCatEvent({ ...conversion, type: "INITIAL_PURCHASE", is_trial_conversion: false, takehome_percentage: null }, ctx)).toMatchObject({ price_cents: 3499, kind: "paid" });
    // a trial is never priced, whatever the payload says
    expect(normalizeRevenueCatEvent({ ...trial, price: 9.99 }, ctx).price_cents).toBe(0);
    // a missing price is zero, never NaN
    expect(normalizeRevenueCatEvent({ ...conversion, price: undefined, takehome_percentage: undefined }, ctx).price_cents).toBe(0);
  });

  it("classifies what each event means for the funnel", () => {
    const k = (event_type: NormalizedRcEvent["event_type"], period_type: NormalizedRcEvent["period_type"], is_trial_conversion = false, cancel_reason?: string) => classifyRevenueCatEvent({ event_type, period_type, is_trial_conversion, cancel_reason });
    expect(k("initial_purchase", "trial")).toBe("trial");
    expect(k("initial_purchase", "normal")).toBe("paid");
    expect(k("initial_purchase", "intro")).toBe("paid");
    expect(k("renewal", "normal", true)).toBe("paid");
    expect(k("renewal", "normal", false)).toBeNull();
    expect(k("non_renewing_purchase", "normal")).toBe("paid");
    expect(k("cancellation", "normal", false, "CUSTOMER_SUPPORT")).toBe("refund");
    expect(k("cancellation", "normal", false, "customer_support")).toBe("refund");
    expect(k("cancellation", "normal", false, "UNSUBSCRIBE")).toBeNull();
    expect(k("expiration", "normal")).toBeNull();
    expect(k("billing_issue", "normal")).toBeNull();
    expect(k(null, "normal")).toBeNull();
  });

  it("marks sandbox events and unknown types", () => {
    const sandbox = normalizeRevenueCatEvent({ ...trial, environment: "SANDBOX" }, ctx);
    expect(sandbox.environment).toBe("sandbox");
    const unknown = normalizeRevenueCatEvent({ ...trial, type: "SUBSCRIPTION_PAUSED" }, ctx);
    expect(unknown).toMatchObject({ event_type: null, kind: null });
    expect(normalizeRevenueCatEvent({ ...trial, offer_code: "MAYA-LUMI" }, ctx).offer_code).toBe("MAYA-LUMI");
    expect(normalizeRevenueCatEvent({ ...trial, offer_code: null, expiration_at_ms: null, country_code: undefined }, ctx)).not.toHaveProperty("offer_code");
  });

  it("ignores redeliveries, test events and sandbox events", () => {
    const e = normalizeRevenueCatEvent(trial, ctx);
    expect(matchRevenueCatEvent(e, { links, offer_codes: offerCodes, seen_keys: new Set(["evt_trial_1"]) }).match_status).toBe("duplicate");
    expect(matchRevenueCatEvent({ ...e, event_type: "test" }, { links, offer_codes: offerCodes, seen_keys: noneSeen }).match_status).toBe("ignored");
    expect(matchRevenueCatEvent({ ...e, environment: "sandbox" }, { links, offer_codes: offerCodes, seen_keys: noneSeen })).toMatchObject({ match_status: "ignored", reason: "A sandbox event. Only production events count." });
    expect(matchRevenueCatEvent({ ...e, environment: "sandbox" }, { links, offer_codes: offerCodes, seen_keys: noneSeen, accept_sandbox: true }).match_status).toBe("matched");
  });

  it("matches by the SDK link attribute first, then by offer code", () => {
    const byLink = matchRevenueCatEvent(normalizeRevenueCatEvent(trial, ctx), { links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(byLink).toEqual({ match_status: "matched", source: "link", link_id: "lnk_maya", creator_id: "cr_maya", bounty_id: "bnty_a", post_id: "post_1", reason: "Matched by tracking link maya-lumi7." });
    const noAttribute = { ...trial, subscriber_attributes: {}, offer_code: "maya-lumi" };
    const byCode = matchRevenueCatEvent(normalizeRevenueCatEvent(noAttribute, ctx), { links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(byCode).toMatchObject({ match_status: "matched", source: "code", link_id: "lnk_maya", creator_id: "cr_maya", bounty_id: "bnty_a", post_id: "post_1" });
    // an unknown link falls through to the code
    const both = normalizeRevenueCatEvent({ ...trial, subscriber_attributes: { flowd_link: { value: "nobody-7" } }, offer_code: "MAYA-LUMI" }, ctx);
    expect(matchRevenueCatEvent(both, { links, offer_codes: offerCodes, seen_keys: noneSeen }).source).toBe("code");
  });

  it("never attributes across apps, and says why an event is unmatched", () => {
    const other = normalizeRevenueCatEvent(trial, { app_id: "app_other", received_at: ctx.received_at });
    expect(matchRevenueCatEvent(other, { links, offer_codes: offerCodes, seen_keys: noneSeen })).toMatchObject({ match_status: "unmatched", reason: "A link or code was present but does not belong to any creator on this app." });
    const bare = normalizeRevenueCatEvent({ ...trial, subscriber_attributes: {} }, ctx);
    expect(matchRevenueCatEvent(bare, { links, offer_codes: offerCodes, seen_keys: noneSeen })).toMatchObject({ match_status: "unmatched", reason: "No flowd link or offer code on this event." });
    // an offer code with no creator on it (still in the pool) does not match
    const unassigned = normalizeRevenueCatEvent({ ...trial, subscriber_attributes: {}, offer_code: "MAYA-LUMI" }, ctx);
    expect(matchRevenueCatEvent(unassigned, { links, offer_codes: [{ ...offerCodes[0], assigned_creator_id: undefined }], seen_keys: noneSeen }).match_status).toBe("unmatched");
  });

  it("matches a later event of a subscriber flowd already tied to a creator, even with no attribute on it", () => {
    const known = { "$RCAnonymousID:a1b2": { source: "link" as const, creator_id: "cr_maya", link_id: "lnk_maya", bounty_id: "bnty_a", post_id: "post_1" } };
    const cancellation = normalizeRevenueCatEvent({ ...conversion, id: "evt_cancel", type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", subscriber_attributes: {} }, ctx);
    const m = matchRevenueCatEvent(cancellation, { links, offer_codes: offerCodes, seen_keys: noneSeen, known_users: known });
    expect(m).toEqual({ match_status: "matched", source: "link", link_id: "lnk_maya", creator_id: "cr_maya", bounty_id: "bnty_a", post_id: "post_1", reason: "Matched to this subscriber's earlier conversion." });
    // without the record it stays unmatched
    expect(matchRevenueCatEvent(cancellation, { links, offer_codes: offerCodes, seen_keys: noneSeen }).match_status).toBe("unmatched");
    // an explicit link on the event still wins over the remembered subscriber
    const withLink = normalizeRevenueCatEvent(trial, ctx);
    const other = { "$RCAnonymousID:a1b2": { source: "code" as const, creator_id: "cr_other" } };
    expect(matchRevenueCatEvent(withLink, { links, offer_codes: offerCodes, seen_keys: noneSeen, known_users: other })).toMatchObject({ source: "link", creator_id: "cr_maya" });
  });

  it("finds a remembered subscriber by their original id when they signed in later", () => {
    const e = normalizeRevenueCatEvent({ ...conversion, id: "evt_signed_in", app_user_id: "user_42", original_app_user_id: "$RCAnonymousID:a1b2", subscriber_attributes: {} }, ctx);
    expect(e.original_app_user_id).toBe("$RCAnonymousID:a1b2");
    const m = matchRevenueCatEvent(e, { links, offer_codes: offerCodes, seen_keys: noneSeen, known_users: { "$RCAnonymousID:a1b2": { source: "code", creator_id: "cr_maya" } } });
    expect(m).toMatchObject({ match_status: "matched", source: "code", creator_id: "cr_maya" });
    // an original id equal to the current one is not repeated, and a missing one is not invented
    expect(normalizeRevenueCatEvent({ ...conversion, original_app_user_id: conversion.app_user_id }, ctx)).not.toHaveProperty("original_app_user_id");
    expect(normalizeRevenueCatEvent(conversion, ctx)).not.toHaveProperty("original_app_user_id");
  });

  it("reverses the conversion for a refund that carries no attribute, through the remembered subscriber", () => {
    const refund: RcRawEvent = { ...conversion, id: "evt_refund_2", type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", is_trial_conversion: false, subscriber_attributes: {} };
    const r = ingestRevenueCatEvent(refund, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen, known_users: { "$RCAnonymousID:a1b2": { source: "link", creator_id: "cr_maya", link_id: "lnk_maya", bounty_id: "bnty_a" } } });
    expect(r.conversion).toMatchObject({ action: "reverse_conversion", kind: "paid", status: "refunded", payable: false, creator_id: "cr_maya", link_id: "lnk_maya" });
    expect(ingestRevenueCatEvent(refund, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen }).conversion).toEqual({ action: "none" });
  });

  it("proposes a deterministic, payable conversion for a matched trial", () => {
    const r = ingestRevenueCatEvent(trial, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(r.match.match_status).toBe("matched");
    expect(r.conversion).toEqual({
      action: "create_conversion",
      kind: "trial",
      source: "link",
      confidence: "deterministic",
      quantity: 1,
      occurred_on: "2026-10-01",
      first_at: "2026-10-01T08:15:00Z",
      revenue_cents: 0,
      status: "pending",
      payable: true,
      link_id: "lnk_maya",
      creator_id: "cr_maya",
      bounty_id: "bnty_a",
      post_id: "post_1",
      country: "US",
    });
  });

  it("carries the net first payment on a paid conversion", () => {
    const r = ingestRevenueCatEvent(conversion, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(r.conversion).toMatchObject({ action: "create_conversion", kind: "paid", revenue_cents: 2974, occurred_on: "2026-10-02", payable: true });
  });

  it("proposes a reversal for a refund and nothing for other events", () => {
    const refund = ingestRevenueCatEvent({ ...conversion, id: "evt_refund", type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", is_trial_conversion: false }, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(refund.conversion).toMatchObject({ action: "reverse_conversion", kind: "paid", status: "refunded", payable: false, creator_id: "cr_maya" });
    const renewal = ingestRevenueCatEvent({ ...conversion, id: "evt_renew", is_trial_conversion: false }, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(renewal.conversion).toEqual({ action: "none" });
    const unmatched = ingestRevenueCatEvent({ ...trial, subscriber_attributes: {} }, { ...ctx, links, offer_codes: offerCodes, seen_keys: noneSeen });
    expect(unmatched.conversion).toEqual({ action: "none" });
    const dup = ingestRevenueCatEvent(trial, { ...ctx, links, offer_codes: offerCodes, seen_keys: new Set(["evt_trial_1"]) });
    expect(dup).toMatchObject({ match: { match_status: "duplicate" }, conversion: { action: "none" } });
  });
});
