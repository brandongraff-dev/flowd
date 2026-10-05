import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FLO_MODEL, EnvError, isDemoMode, parsePublicEnv, parseServerEnv, publicEnv, resetEnvCache, serverEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("parsePublicEnv", () => {
  it("runs with no environment at all: demo on, Flo local, analytics off, local origin in development", () => {
    const env = parsePublicEnv({});
    expect(env.NEXT_PUBLIC_DEMO_MODE).toBe(true);
    expect(env.NEXT_PUBLIC_FLO_MODE).toBe("local");
    expect(env.NEXT_PUBLIC_ANALYTICS_PROVIDER).toBe("none");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.joinflowd.io");
    expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.joinflowd.io");
    expect(env.SITE_URL).toBe("http://localhost:3000");
    expect(env.IS_PRODUCTION).toBe(false);
    expect(env.NEXT_PUBLIC_ALLOW_INDEXING).toBeUndefined();
  });

  it("uses the owned domain in production and trims trailing slashes from an explicit origin", () => {
    expect(parsePublicEnv({ NODE_ENV: "production" }).SITE_URL).toBe("https://joinflowd.io");
    expect(parsePublicEnv({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://staging.joinflowd.io///" }).SITE_URL).toBe("https://staging.joinflowd.io");
  });

  it("reads booleans in the usual spellings and treats blank as unset", () => {
    for (const on of ["true", "1", "YES", " on "]) expect(parsePublicEnv({ NEXT_PUBLIC_DEMO_MODE: on }).NEXT_PUBLIC_DEMO_MODE).toBe(true);
    for (const off of ["false", "0", "No", "off"]) expect(parsePublicEnv({ NEXT_PUBLIC_DEMO_MODE: off }).NEXT_PUBLIC_DEMO_MODE).toBe(false);
    expect(parsePublicEnv({ NEXT_PUBLIC_DEMO_MODE: "" }).NEXT_PUBLIC_DEMO_MODE).toBe(true);
    expect(parsePublicEnv({ NEXT_PUBLIC_ALLOW_INDEXING: "true" }).NEXT_PUBLIC_ALLOW_INDEXING).toBe(true);
    expect(parsePublicEnv({ NEXT_PUBLIC_ALLOW_INDEXING: "off" }).NEXT_PUBLIC_ALLOW_INDEXING).toBe(false);
    expect(parsePublicEnv({ NEXT_PUBLIC_ALLOW_INDEXING: "maybe" }).NEXT_PUBLIC_ALLOW_INDEXING).toBeUndefined();
  });

  it("names the variable when a value is wrong, without echoing a long value", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "not a url" })).toThrow(EnvError);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_DEMO_MODE: "sometimes-but-only-on-tuesdays" })).toThrow(/NEXT_PUBLIC_DEMO_MODE: expected true or false, got "sometimes-bu"/);
  });

  it("falls back on enums that do not match instead of crashing the app", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_FLO_MODE: "cloud", NEXT_PUBLIC_ANALYTICS_PROVIDER: "mixpanel", NODE_ENV: "staging" });
    expect(env.NEXT_PUBLIC_FLO_MODE).toBe("local");
    expect(env.NEXT_PUBLIC_ANALYTICS_PROVIDER).toBe("none");
    expect(env.NODE_ENV).toBe("development");
  });

  it("accepts the PostHog settings as optional", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_ANALYTICS_PROVIDER: "posthog", NEXT_PUBLIC_POSTHOG_KEY: "  phc_test  ", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" });
    expect(env.NEXT_PUBLIC_ANALYTICS_PROVIDER).toBe("posthog");
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBe("phc_test");
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://eu.i.posthog.com");
  });
});

describe("parseServerEnv", () => {
  it("defaults to the deterministic mock: no key, auto provider, Sonnet 5.5, 20 requests a minute", () => {
    const env = parseServerEnv({});
    expect(env.claudeConfigured).toBe(false);
    expect(env.FLO_PROVIDER).toBe("auto");
    expect(env.FLO_MODEL).toBe("claude-sonnet-5-5");
    expect(DEFAULT_FLO_MODEL).toBe("claude-sonnet-5-5");
    expect(env.FLO_MAX_TOKENS).toBe(4000);
    expect(env.FLO_REFUSAL_FALLBACK).toBe(true);
    expect(env.FLO_RATE_LIMIT_PER_MIN).toBe(20);
  });

  it("notices a key and honours overrides", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "sk-ant-test", FLO_PROVIDER: "claude", FLO_MODEL: "claude-sonnet-5-5", FLO_MAX_TOKENS: "2500", FLO_RATE_LIMIT_PER_MIN: "5", FLO_REFUSAL_FALLBACK: "0" });
    expect(env.claudeConfigured).toBe(true);
    expect(env.FLO_PROVIDER).toBe("claude");
    expect(env.FLO_MAX_TOKENS).toBe(2500);
    expect(env.FLO_RATE_LIMIT_PER_MIN).toBe(5);
    expect(env.FLO_REFUSAL_FALLBACK).toBe(false);
  });

  it("treats a blank key as no key", () => {
    expect(parseServerEnv({ ANTHROPIC_API_KEY: "   " }).claudeConfigured).toBe(false);
    expect(parseServerEnv({ ANTHROPIC_API_KEY: "" }).claudeConfigured).toBe(false);
  });

  it("rejects limits that make no sense, and never prints the key", () => {
    expect(() => parseServerEnv({ FLO_MAX_TOKENS: "-5" })).toThrow(/FLO_MAX_TOKENS/);
    expect(() => parseServerEnv({ FLO_RATE_LIMIT_PER_MIN: "0" })).toThrow(/FLO_RATE_LIMIT_PER_MIN/);
    expect(() => parseServerEnv({ FLO_MAX_TOKENS: "999999999" })).toThrow(EnvError);
    try {
      parseServerEnv({ ANTHROPIC_API_KEY: "sk-ant-secret-value", FLO_MAX_TOKENS: "nope" });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("sk-ant-secret-value");
    }
  });
});

describe("cached readers", () => {
  it("publicEnv and serverEnv read process.env once and cache until reset", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    resetEnvCache();
    expect(publicEnv().NEXT_PUBLIC_DEMO_MODE).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(publicEnv().NEXT_PUBLIC_DEMO_MODE).toBe(false);
    resetEnvCache();
    expect(publicEnv().NEXT_PUBLIC_DEMO_MODE).toBe(true);

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    resetEnvCache();
    expect(serverEnv().claudeConfigured).toBe(true);
  });

  it("isDemoMode follows the flag and reads as on when the env is invalid", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "off");
    resetEnvCache();
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "off");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "::not-a-url::");
    resetEnvCache();
    expect(isDemoMode()).toBe(true);
  });
});

describe(".env.example", () => {
  it("is valid as written: every documented value parses, and the secrets are left blank", () => {
    const text = readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8");
    const source: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (match?.[1]) source[match[1]] = (match[2] ?? "").trim();
    }
    expect(() => parsePublicEnv(source)).not.toThrow();
    expect(() => parseServerEnv(source)).not.toThrow();
    expect(source.ANTHROPIC_API_KEY).toBe("");
    expect(parseServerEnv(source).claudeConfigured).toBe(false);
    expect(parseServerEnv(source).FLO_MODEL).toBe(DEFAULT_FLO_MODEL);
    expect(parsePublicEnv(source).NEXT_PUBLIC_FLO_MODE).toBe("local");
  });
});
