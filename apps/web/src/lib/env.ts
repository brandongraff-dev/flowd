/**
 * Validated environment. Two halves:
 *
 *  - `publicEnv()`  NEXT_PUBLIC_* values. Safe in client and server code. Every variable is read as a literal
 *                   `process.env.NEXT_PUBLIC_X` so Next can inline it at build time.
 *  - `serverEnv()`  server-only values (the optional Claude key, Flo provider switches). Throws if called in the browser.
 *
 * Everything has a working default, so a fresh clone runs with no `.env` at all: demo mode on, Flo on the deterministic
 * mock, analytics off. A wrong value (a URL that is not a URL, a negative limit) throws one `EnvError` that names the variable.
 * Secrets are never echoed in an error message.
 */

import { z } from "zod";

// ── parsing helpers ────────────────────────────────────────────────────────────────────────────

/** "true", "1", "yes", "on" are true; "false", "0", "no", "off" are false; empty or unset is the default. Anything else is an error. */
const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx): boolean => {
      const v = (value ?? "").trim().toLowerCase();
      if (v === "") return fallback;
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      ctx.addIssue({ code: "custom", message: `expected true or false, got "${v.slice(0, 12)}"` });
      return fallback;
    });

/** Unset or blank becomes undefined, so `.default()` and `.optional()` treat "VAR=" like a missing variable. */
const blankToUndefined = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? undefined : value);

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url().optional());

const positiveInt = (fallback: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(max).default(fallback));

/** The model the Flo copilot uses when the Claude provider is switched on (DECISIONS: Claude API behind `AIProvider`). */
export const DEFAULT_FLO_MODEL = "claude-sonnet-5-5";

// ── schemas ────────────────────────────────────────────────────────────────────────────────────

const nodeEnv = z.enum(["development", "test", "production"]).catch("development");

export const publicEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  /** Canonical origin of the marketing site. Drives metadataBase, canonical URLs, the sitemap and OG links. */
  NEXT_PUBLIC_SITE_URL: z.preprocess(blankToUndefined, z.url().optional()),
  /** The signed-in product. */
  NEXT_PUBLIC_APP_URL: z.preprocess(blankToUndefined, z.url().default("https://app.joinflowd.io")),
  /** The public API (the iOS app and the MCP server talk to it). */
  NEXT_PUBLIC_API_URL: z.preprocess(blankToUndefined, z.url().default("https://api.joinflowd.io")),
  /** Demo mode: seeded data, persona picker, "Demo data" affordances. Default on: this build is the demo. */
  NEXT_PUBLIC_DEMO_MODE: flag(true),
  /** "local" runs Flo in the browser (deterministic mock). "remote" calls /api/v1/flo/chat, which may use Claude. */
  NEXT_PUBLIC_FLO_MODE: z.enum(["local", "remote"]).default("local").catch("local"),
  /** Which analytics adapter to mount. "none" (default) is a no-op. */
  NEXT_PUBLIC_ANALYTICS_PROVIDER: z.enum(["none", "posthog"]).default("none").catch("none"),
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
  /** Force search indexing on or off. Unset: indexing is on only for the canonical production domain. */
  NEXT_PUBLIC_ALLOW_INDEXING: z
    .string()
    .optional()
    .transform((value): boolean | undefined => {
      const v = (value ?? "").trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      return undefined;
    }),
  /** Shown in analytics context and the status page. */
  NEXT_PUBLIC_APP_VERSION: z.preprocess(blankToUndefined, z.string().trim().default("0.1.0")),
});

export const serverEnvSchema = z.object({
  /** Optional. With it, Flo can run on Claude through the server route. Never sent to the browser. */
  ANTHROPIC_API_KEY: optionalString,
  /** "auto" uses Claude when a key is set, otherwise the mock. "mock" never calls out. "claude" requires a key (falls back to the mock when missing). */
  FLO_PROVIDER: z.enum(["auto", "mock", "claude"]).default("auto").catch("auto"),
  FLO_MODEL: z.preprocess(blankToUndefined, z.string().trim().min(1).default(DEFAULT_FLO_MODEL)),
  FLO_MAX_TOKENS: positiveInt(4000, 32_000),
  /** Server-side refusal fallback ("fallbacks: default"): a policy decline is retried on the model Anthropic names. */
  FLO_REFUSAL_FALLBACK: flag(true),
  /** Per-IP requests per minute on the Flo route (it fronts a paid API). */
  FLO_RATE_LIMIT_PER_MIN: positiveInt(20, 600),
});

export type PublicEnv = z.infer<typeof publicEnvSchema> & { SITE_URL: string; IS_PRODUCTION: boolean };
export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  /** True when a Claude key is present. */
  claudeConfigured: boolean;
};

export class EnvError extends Error {
  readonly issues: readonly string[];
  constructor(scope: "public" | "server", issues: readonly string[]) {
    super(`Invalid ${scope} environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
    this.issues = issues;
  }
}

type Source = Readonly<Record<string, string | undefined>>;

function describe(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

/** Parses a public-env source. Pure (no `process`), so tests can pass any object. */
export function parsePublicEnv(source: Source): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) throw new EnvError("public", describe(result.error));
  const parsed = result.data;
  const IS_PRODUCTION = parsed.NODE_ENV === "production";
  const SITE_URL = (parsed.NEXT_PUBLIC_SITE_URL ?? (IS_PRODUCTION ? "https://joinflowd.io" : "http://localhost:3000")).replace(/\/+$/, "");
  return { ...parsed, SITE_URL, IS_PRODUCTION };
}

/** Parses a server-env source. Pure. */
export function parseServerEnv(source: Source): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) throw new EnvError("server", describe(result.error));
  const parsed = result.data;
  return { ...parsed, claudeConfigured: Boolean(parsed.ANTHROPIC_API_KEY) };
}

let publicCache: PublicEnv | undefined;
let serverCache: ServerEnv | undefined;

/**
 * Public env, parsed once. The literal `process.env.NEXT_PUBLIC_*` reads are what let Next inline the values into the
 * client bundle: do not refactor them into a loop over `process.env`.
 */
export function publicEnv(): PublicEnv {
  publicCache ??= parsePublicEnv({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    NEXT_PUBLIC_FLO_MODE: process.env.NEXT_PUBLIC_FLO_MODE,
    NEXT_PUBLIC_ANALYTICS_PROVIDER: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_ALLOW_INDEXING: process.env.NEXT_PUBLIC_ALLOW_INDEXING,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  });
  return publicCache;
}

/** Server-only env, parsed once. Throws when called from the browser. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() was called in the browser. Server variables never reach client code.");
  serverCache ??= parseServerEnv({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    FLO_PROVIDER: process.env.FLO_PROVIDER,
    FLO_MODEL: process.env.FLO_MODEL,
    FLO_MAX_TOKENS: process.env.FLO_MAX_TOKENS,
    FLO_REFUSAL_FALLBACK: process.env.FLO_REFUSAL_FALLBACK,
    FLO_RATE_LIMIT_PER_MIN: process.env.FLO_RATE_LIMIT_PER_MIN,
  });
  return serverCache;
}

/** Clears the parse caches. Tests only. */
export function resetEnvCache(): void {
  publicCache = undefined;
  serverCache = undefined;
}
