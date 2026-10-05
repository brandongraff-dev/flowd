import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_EVENTS,
  EVENT_GROUPS,
  chooseAdapter,
  createConsoleAdapter,
  createMemoryAdapter,
  createPostHogAdapter,
  getAnalyticsAdapter,
  getAnalyticsContext,
  groupOf,
  identify,
  initAnalytics,
  initAnalyticsFromEnv,
  isEventName,
  isAnalyticsEnabled,
  noopAdapter,
  privacyOptOut,
  pseudonymise,
  resetAnalytics,
  resetAnalyticsForTests,
  sanitizePath,
  sanitizeProps,
  setAnalyticsContext,
  setAnalyticsEnabled,
  track,
  trackPage,
  type PostHogLike,
} from "../index";

describe("the event catalogue", () => {
  it("has every group of PRODUCT_SPEC section 10 and no duplicate names", () => {
    expect(Object.keys(EVENT_GROUPS)).toEqual([
      "acquisition", "creator_onboarding", "brand_onboarding", "bounty", "marketplace", "studio", "review", "money", "attribution", "engagement", "trust", "platform",
    ]);
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });
  it("names events object_action in snake case", () => {
    for (const name of ALL_EVENTS) expect(name).toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/);
  });
  it("expands the spec's a|b variants into separate names", () => {
    for (const name of [
      "account_link_started", "account_link_completed", "account_link_skipped", "permission_granted", "permission_denied",
      "bounty_ai_draft_generated", "bounty_ai_draft_failed", "offer_received", "offer_countered", "upload_resumed",
      "payout_scheduled", "payout_failed", "referral_sent", "referral_accepted", "earnings_card_shared", "dispute_resolved",
    ]) {
      expect(isEventName(name)).toBe(true);
    }
  });
  it("includes the spec's key events", () => {
    for (const name of ["page_viewed", "persona_switched", "decision_made", "cash_out_confirmed", "conversion_recorded", "first_dollar_cleared", "flo_prompt_sent"]) {
      expect(isEventName(name)).toBe(true);
    }
    expect(isEventName("campaign_launched")).toBe(false);
  });
  it("finds the group of an event", () => {
    expect(groupOf("decision_made")).toBe("review");
    expect(groupOf("cash_out_confirmed")).toBe("money");
    expect(groupOf("mcp_tool_called")).toBe("platform");
  });
});

describe("sanitizeProps", () => {
  it("keeps numbers, booleans, null and short codes", () => {
    const { props, dropped } = sanitizeProps({ errors: 0, instant: true, rule: "pay_to_join", fee_cents: 240, none: null });
    expect(props).toEqual({ errors: 0, instant: true, rule: "pay_to_join", fee_cents: 240, none: null });
    expect(dropped).toEqual([]);
  });
  it("drops names that suggest free text or personal data", () => {
    const { props, dropped } = sanitizeProps({ email: "a@b.co", note: "hi", prompt_text: "write me a script", user_name: "Maya", band: "B" });
    expect(props).toEqual({ band: "B" });
    expect(dropped).toHaveLength(4);
  });
  it("drops values that look like sentences, emails or are long", () => {
    const { props, dropped } = sanitizeProps({
      reason: "the app is not on screen in the first three seconds",
      contact: "maya.reyes@example.com",
      blob: "x".repeat(100),
      ok: "no_app_reveal",
    });
    expect(props).toEqual({ ok: "no_app_reveal" });
    expect(dropped).toHaveLength(3);
  });
  it("drops non-finite numbers, nested objects and undefined", () => {
    const { props, dropped } = sanitizeProps({ a: Number.NaN, b: Number.POSITIVE_INFINITY, c: undefined, d: 1 } as never);
    expect(props).toEqual({ d: 1 });
    expect(dropped).toHaveLength(2);
    const nested = sanitizeProps({ nested: { deep: 1 } } as never);
    expect(nested.props).toEqual({});
    expect(nested.dropped[0]).toContain("nested");
  });
  it("keeps arrays of safe scalars, capped at 20, and drops unsafe items", () => {
    const { props } = sanitizeProps({ tags: Array.from({ length: 30 }, (_, i) => i), words: ["ok", "this is a long free text sentence right here"] });
    expect((props.tags as number[]).length).toBe(20);
    expect(props.words).toEqual(["ok"]);
  });
  it("handles no props", () => {
    expect(sanitizeProps(undefined)).toEqual({ props: {}, dropped: [] });
  });
});

describe("sanitizePath", () => {
  it("removes amount, identity and search query values", () => {
    expect(sanitizePath("/brand/wallet?amount=5000&tab=ledger")).toBe("/brand/wallet?tab=ledger");
    expect(sanitizePath("/search?q=maya&email=a@b.co")).toBe("/search");
    expect(sanitizePath("/r/maya-lumi1?token=abc")).toBe("/r/maya-lumi1");
  });
  it("masks dollar figures in a path and drops the hash", () => {
    expect(sanitizePath("/fund/$1,500.00/confirm")).toBe("/fund/$_/confirm");
    expect(sanitizePath("/pricing#calculator")).toBe("/pricing");
  });
  it("leaves a clean path alone", () => {
    expect(sanitizePath("/creator/feed?filter=funded")).toBe("/creator/feed?filter=funded");
    expect(sanitizePath("")).toBe("/");
  });
});

describe("pseudonymise and privacy signals", () => {
  it("is stable, prefixed and does not contain the id", () => {
    const a = pseudonymise("usr_maya");
    expect(a).toBe(pseudonymise("usr_maya"));
    expect(a).toMatch(/^u_[a-z0-9]+$/);
    expect(a).not.toContain("maya");
    expect(pseudonymise("usr_jordan")).not.toBe(a);
    expect(pseudonymise("usr_maya", "other")).not.toBe(a);
    expect(a.length).toBeLessThanOrEqual(18);
  });
  it("honours Do Not Track and Global Privacy Control", () => {
    expect(privacyOptOut({ doNotTrack: "1" })).toBe(true);
    expect(privacyOptOut({ globalPrivacyControl: true })).toBe(true);
    expect(privacyOptOut({ doNotTrack: "0", globalPrivacyControl: false })).toBe(false);
    expect(privacyOptOut(undefined)).toBe(false);
  });
});

describe("track", () => {
  let memory: ReturnType<typeof createMemoryAdapter>;
  beforeEach(() => {
    memory = createMemoryAdapter();
    initAnalytics({ adapter: memory, captureOnServer: true });
  });
  afterEach(() => resetAnalyticsForTests());

  it("is a no-op by default (the shipped build has analytics off)", () => {
    resetAnalyticsForTests();
    expect(() => track("bounty_viewed", { source: "feed" })).not.toThrow();
    expect(noopAdapter.name).toBe("noop");
  });

  it("sends the event with the spec's context", () => {
    track("bounty_viewed", { source: "feed" });
    const [[name, props]] = memory.captures();
    expect(name).toBe("bounty_viewed");
    expect(props).toMatchObject({ source: "feed", surface: "web", demo: true, locale: "en-US" });
    expect(typeof props.app_version).toBe("string");
  });

  it("merges role, plan, tier and pseudonymous ids into later events", () => {
    setAnalyticsContext({ role: "creator", tier: "silver", creatorId: "cr_maya" });
    track("feed_viewed");
    const props = memory.captures()[0]?.[1] ?? {};
    expect(props).toMatchObject({ role: "creator", tier: "silver" });
    expect(props.creator_id).toBe(pseudonymise("cr_maya"));
    expect(JSON.stringify(props)).not.toContain("cr_maya");
    expect(getAnalyticsContext().creator_id).toBe(pseudonymise("cr_maya"));
  });

  it("sanitises properties before they reach the adapter", () => {
    const onWarn = vi.fn();
    initAnalytics({ adapter: memory, captureOnServer: true, onWarn });
    track("flo_prompt_sent", { kind: "script", prompt: "write me a script about my app" } as never);
    const props = memory.captures()[0]?.[1] ?? {};
    expect(props.kind).toBe("script");
    expect("prompt" in props).toBe(false);
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining("flo_prompt_sent"));
  });

  it("keeps money as integer cents and never lets an amount into a path", () => {
    track("cash_out_confirmed", { instant: true, fee_cents: 240 });
    track("page_viewed", { path: "/brand/wallet?amount=5000&tab=ledger" });
    const [cash, page] = memory.captures();
    expect(cash?.[1]).toMatchObject({ instant: true, fee_cents: 240 });
    expect(page?.[1].path).toBe("/brand/wallet?tab=ledger");
  });

  it("sends page views through the adapter's page call and as page_viewed", () => {
    trackPage("/pricing?q=secret&tab=plans");
    expect(memory.events.find((e) => e.kind === "page")?.path).toBe("/pricing?tab=plans");
    expect(memory.captures().map(([name]) => name)).toContain("page_viewed");
  });

  it("identifies with a pseudonymous id and non-identifying traits only", () => {
    identify("usr_maya", { role: "creator", tier: "silver" });
    const call = memory.events.find((e) => e.kind === "identify");
    expect(call?.distinctId).toBe(pseudonymise("usr_maya"));
    expect(call?.props).toEqual({ role: "creator", tier: "silver" });
  });

  it("forgets identity and context on reset", () => {
    identify("usr_maya", { role: "creator" });
    resetAnalytics();
    expect(getAnalyticsContext().role).toBeUndefined();
    expect(memory.events.some((e) => e.kind === "reset")).toBe(true);
  });

  it("does not capture when the browser says do not track", () => {
    initAnalytics({ adapter: memory, captureOnServer: true, signals: { globalPrivacyControl: true } });
    expect(isAnalyticsEnabled()).toBe(false);
    track("feed_viewed");
    expect(memory.captures()).toHaveLength(0);
  });

  it("can be switched off and on like a consent toggle", () => {
    setAnalyticsEnabled(false);
    track("feed_viewed");
    expect(memory.captures()).toHaveLength(0);
    expect(memory.events.some((e) => e.kind === "reset")).toBe(true);
    setAnalyticsEnabled(true);
    track("feed_viewed");
    expect(memory.captures()).toHaveLength(1);
  });

  it("never throws when an adapter does", () => {
    initAnalytics({
      adapter: { name: "bad", capture: () => { throw new Error("boom"); }, identify: () => { throw new Error("boom"); }, reset: () => { throw new Error("boom"); } },
      captureOnServer: true,
    });
    expect(() => track("feed_viewed")).not.toThrow();
    expect(() => trackPage("/x")).not.toThrow();
    expect(() => identify("usr_x")).not.toThrow();
    expect(() => resetAnalytics()).not.toThrow();
  });
});

describe("adapters", () => {
  it("wraps a PostHog-style client", () => {
    const client: PostHogLike = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn(), register: vi.fn() };
    const adapter = createPostHogAdapter(client);
    adapter.capture("feed_viewed", { role: "creator" });
    adapter.identify("u_abc", { role: "creator" });
    adapter.page?.("/pricing", { demo: true });
    adapter.register?.({ plan: "pro" });
    adapter.reset();
    expect(client.capture).toHaveBeenCalledWith("feed_viewed", { role: "creator" });
    expect(client.identify).toHaveBeenCalledWith("u_abc", { role: "creator" });
    expect(client.capture).toHaveBeenCalledWith("$pageview", { demo: true, $pathname: "/pricing" });
    expect(client.register).toHaveBeenCalledWith({ plan: "pro" });
    expect(client.reset).toHaveBeenCalled();
  });
  it("tolerates a client without register", () => {
    const client: PostHogLike = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    expect(() => createPostHogAdapter(client).register?.({ a: 1 })).not.toThrow();
  });
  it("logs through the console adapter", () => {
    const log = vi.fn();
    const adapter = createConsoleAdapter(log);
    adapter.capture("feed_viewed", { a: 1 });
    expect(log).toHaveBeenCalledWith("[analytics]", "feed_viewed", { a: 1 });
  });
});

describe("initAnalyticsFromEnv", () => {
  beforeEach(() => resetAnalyticsForTests());
  afterEach(() => resetAnalyticsForTests());

  it("is the no-op adapter by default, and nothing is sent", () => {
    const result = initAnalyticsFromEnv({ provider: "none", signals: {} });
    expect(result.adapter).toBe(noopAdapter);
    expect(result.reason).toBeUndefined();
    expect(getAnalyticsAdapter()).toBe(noopAdapter);
  });

  it("mounts PostHog around the client it is given, and events reach it sanitised", () => {
    const client: PostHogLike = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    const result = initAnalyticsFromEnv({ provider: "posthog", posthog: client, signals: {} });
    expect(result.adapter.name).toBe("posthog");
    // `track` only captures in a browser (or when told to); mount the same adapter with the server switch on to observe it.
    initAnalytics({ adapter: result.adapter, captureOnServer: true });
    track("bounty_viewed", { source: "feed" });
    expect(client.capture).toHaveBeenCalledWith("bounty_viewed", expect.objectContaining({ source: "feed", demo: true }));
  });

  it("stays on the no-op adapter, with a warning, when PostHog is asked for and there is no client", () => {
    const onWarn = vi.fn();
    const result = initAnalyticsFromEnv({ provider: "posthog", signals: {}, onWarn });
    expect(result).toEqual({ adapter: noopAdapter, reason: "no_client" });
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining("no PostHog client"));
  });

  it("turns everything off under Do Not Track or Global Privacy Control, whatever the provider", () => {
    const client: PostHogLike = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    initAnalyticsFromEnv({ provider: "posthog", posthog: client, signals: { doNotTrack: "1" } });
    expect(isAnalyticsEnabled()).toBe(false);
    initAnalyticsFromEnv({ provider: "posthog", posthog: client, signals: { globalPrivacyControl: true } });
    expect(isAnalyticsEnabled()).toBe(false);
    initAnalyticsFromEnv({ provider: "posthog", posthog: client, signals: {} });
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it("chooses adapters purely from the setting and the client", () => {
    const client: PostHogLike = { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
    expect(chooseAdapter("none", client).adapter).toBe(noopAdapter);
    expect(chooseAdapter("posthog", client).adapter.name).toBe("posthog");
    expect(chooseAdapter("posthog", undefined).reason).toBe("no_client");
  });
});
