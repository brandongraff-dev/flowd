/**
 * App-wide constants for the web support layer. Free of React and browser globals, so server components, route handlers,
 * metadata helpers and tests can all import it.
 *
 * Business numbers (fees, windows, tiers) are NOT here: they live in `@/lib/engine` (`CONSTANTS`). This file holds the demo
 * world's clock and the brand and domain facts the UI needs (docs/CONVENTIONS.md section 1).
 */

/**
 * The demo world's "now": every fixture is generated relative to it, so the UI always looks live. Mirrors
 * `CONSTANTS.now` in the contract (a test pins the two together; this copy keeps the formatting helpers free of the big contract module).
 */
export const DEMO_NOW = "2026-10-03T14:00:00Z";
/** `DEMO_NOW` as milliseconds since the epoch. */
export const DEMO_NOW_MS: number = Date.parse(DEMO_NOW);
/** The demo world's calendar day. */
export const DEMO_TODAY = "2026-10-03";

/** Brand and domain facts. The domain is OWNED: never write flowd.so, flowd.com or flowd.app (docs/DOMAIN_CHECK.md). */
export const SITE = {
  name: "flowd",
  legalName: "flowd, Inc.",
  tagline: "Money follows what works.",
  description:
    "flowd is the open creator market for apps. App teams fund bounties, creators compete for them, and money flows to what actually drives views, installs and paid subscriptions.",
  domain: "joinflowd.io",
  siteUrl: "https://joinflowd.io",
  appUrl: "https://app.joinflowd.io",
  apiUrl: "https://api.joinflowd.io",
  email: "hello@joinflowd.io",
  locale: "en-US",
} as const;

/** The three demo identities' fixed ids (mirrors `world.personas` in the fixtures). */
export const DEMO_IDS = {
  creator: { userId: "usr_maya", creatorId: "cr_maya", handle: "maya.makes" },
  brand: { userId: "usr_jordan", memberId: "bm_lumi_jordan", brandId: "br_lumi", appId: "app_lumi" },
  admin: { userId: "usr_ops" },
} as const;

/** Public links on the owned domain, built from ids the contract defines. */
export const links = {
  creator: (handle: string): string => `${SITE.domain}/c/${handle.replace(/^@/, "")}`,
  proof: (proofId: string): string => `${SITE.domain}/p/${proofId}`,
  tracking: (code: string): string => `${SITE.domain}/r/${code}`,
  bounty: (bountyId: string): string => `${SITE.domain}/b/${bountyId}`,
  scorecard: (brandId: string): string => `${SITE.domain}/scorecard/${brandId}`,
} as const;
