import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAdapter, initAnalytics, resetAnalyticsForTests } from "@/lib/analytics";
import { readRoleCookie, readRoleFromCookieHeader, serializeRoleCookie, writeRoleCookie, parseRole } from "../cookie";
import { ROLE_COOKIE, SESSION_STORAGE_KEY } from "../constants";
import { getServerSessionSnapshot, getSessionSnapshot, resetSessionForTests, signInAs, signOut, subscribeSession } from "../store";

/** A browser in a few lines: a cookie jar with document.cookie semantics, localStorage, and window listeners. */
function installBrowser() {
  const jar = new Map<string, string>();
  const storage = new Map<string, string>();
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const doc = {
    get cookie(): string {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair = "", ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => /^max-age=0$/i.test(a));
      if (expired || value === "") jar.delete(name);
      else jar.set(name, value);
    },
  };
  const win = {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => void handlers.get(type)?.delete(fn),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("location", { protocol: "http:" });
  return {
    jar,
    storage,
    emit: (type: string, event: unknown) => handlers.get(type)?.forEach((fn) => fn(event)),
    listenerCount: (type: string) => handlers.get(type)?.size ?? 0,
  };
}

describe("cookie helpers", () => {
  it("parses only the three roles", () => {
    expect(parseRole("creator")).toBe("creator");
    expect(parseRole("brand_member")).toBe("brand_member");
    expect(parseRole("admin")).toBe("admin");
    expect(parseRole("root")).toBeNull();
    expect(parseRole("")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
  it("reads the role from a Cookie header among other cookies", () => {
    expect(readRoleFromCookieHeader("a=1; flowd_role=creator; b=2")).toBe("creator");
    expect(readRoleFromCookieHeader("flowd_role=brand_member")).toBe("brand_member");
    expect(readRoleFromCookieHeader("flowd_role=hacker")).toBeNull();
    expect(readRoleFromCookieHeader("other=creator")).toBeNull();
    expect(readRoleFromCookieHeader(null)).toBeNull();
    expect(readRoleFromCookieHeader("")).toBeNull();
  });
  it("serializes a site-wide, lax cookie and expires it on sign-out", () => {
    const set = serializeRoleCookie("creator");
    expect(set).toContain(`${ROLE_COOKIE}=creator`);
    expect(set).toContain("Path=/");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Max-Age=2592000");
    expect(set).not.toContain("Secure");
    expect(serializeRoleCookie("admin", { secure: true })).toContain("Secure");
    const cleared = serializeRoleCookie(null);
    expect(cleared).toContain(`${ROLE_COOKIE}=;`);
    expect(cleared).toContain("Max-Age=0");
  });
  it("is a no-op on the server", () => {
    expect(readRoleCookie()).toBeNull();
    expect(() => writeRoleCookie("creator")).not.toThrow();
  });
});

describe("the client session store", () => {
  let browser: ReturnType<typeof installBrowser>;
  let analytics: ReturnType<typeof createMemoryAdapter>;

  beforeEach(() => {
    resetSessionForTests();
    browser = installBrowser();
    analytics = createMemoryAdapter();
    initAnalytics({ adapter: analytics });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAnalyticsForTests();
    resetSessionForTests();
  });

  it("reports an unknown, signed-out session on the server", () => {
    expect(getServerSessionSnapshot()).toEqual({ status: "unknown", role: null });
  });

  it("starts ready and signed out in a fresh browser", () => {
    expect(getSessionSnapshot()).toEqual({ status: "ready", role: null });
  });

  it("reads the role from the cookie", () => {
    browser.jar.set(ROLE_COOKIE, "creator");
    expect(getSessionSnapshot().role).toBe("creator");
  });

  it("repairs a lost cookie from localStorage so the server can see the role again", () => {
    browser.storage.set(SESSION_STORAGE_KEY, JSON.stringify({ role: "admin" }));
    expect(getSessionSnapshot().role).toBe("admin");
    expect(browser.jar.get(ROLE_COOKIE)).toBe("admin");
  });

  it("ignores a corrupt or hostile stored value", () => {
    browser.storage.set(SESSION_STORAGE_KEY, "{not json");
    expect(getSessionSnapshot().role).toBeNull();
    resetSessionForTests();
    browser.storage.set(SESSION_STORAGE_KEY, JSON.stringify({ role: "superuser" }));
    expect(getSessionSnapshot().role).toBeNull();
  });

  it("signs in, writes both stores, notifies subscribers and tells analytics", () => {
    const listener = vi.fn();
    subscribeSession(listener);
    signInAs("brand_member");
    expect(getSessionSnapshot()).toEqual({ status: "ready", role: "brand_member" });
    expect(browser.jar.get(ROLE_COOKIE)).toBe("brand_member");
    expect(JSON.parse(browser.storage.get(SESSION_STORAGE_KEY) ?? "{}").role).toBe("brand_member");
    expect(listener).toHaveBeenCalledTimes(1);
    const names = analytics.captures().map(([name]) => name);
    expect(names).toContain("login_succeeded");
    expect(analytics.events.some((e) => e.kind === "identify")).toBe(true);
  });

  it("records a persona switch with from and to", () => {
    signInAs("creator");
    analytics.clear();
    signInAs("admin");
    const switched = analytics.captures().find(([name]) => name === "persona_switched");
    expect(switched?.[1]).toMatchObject({ from: "creator", to: "admin" });
    expect(browser.jar.get(ROLE_COOKIE)).toBe("admin");
  });

  it("does nothing when signing in as the current role", () => {
    signInAs("creator");
    const listener = vi.fn();
    subscribeSession(listener);
    signInAs("creator");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the snapshot reference stable between changes (required by useSyncExternalStore)", () => {
    signInAs("creator");
    expect(getSessionSnapshot()).toBe(getSessionSnapshot());
  });

  it("signs out: clears cookie and mirror, notifies and resets analytics", () => {
    signInAs("creator");
    const listener = vi.fn();
    subscribeSession(listener);
    analytics.clear();
    signOut();
    expect(getSessionSnapshot().role).toBeNull();
    expect(browser.jar.has(ROLE_COOKIE)).toBe(false);
    expect(browser.storage.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(analytics.events.some((e) => e.kind === "reset")).toBe(true);
  });

  it("follows another tab through the storage event", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    expect(browser.listenerCount("storage")).toBe(1);
    browser.storage.set(SESSION_STORAGE_KEY, JSON.stringify({ role: "creator" }));
    browser.emit("storage", { key: SESSION_STORAGE_KEY });
    expect(getSessionSnapshot().role).toBe("creator");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    expect(browser.listenerCount("storage")).toBe(0);
  });
});
