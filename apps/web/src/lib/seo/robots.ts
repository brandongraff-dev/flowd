/**
 * robots.txt rules. Crawlers may read the marketing site, tools, public pages and legal text. They may not read anything behind a
 * login, the mock API, the design gallery, tracking links (`/r/`) or proof pages (`/p/`, which show a creator's earnings and are shared
 * by link, not searched for). Anything that is not the canonical production domain is closed entirely, so a staging or preview deploy
 * can never be indexed by accident.
 *
 * `/brand/` and `/creator/` carry the trailing slash on purpose (with `/brand$` for the bare overview): `/brands` and `/creators` are
 * public marketing pages.
 */

import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { SITE } from "@/lib/constants";
import { absoluteUrl, resolveBaseUrl } from "./metadata";

/** Paths crawlers must not fetch. */
export const DISALLOWED_PATHS: readonly string[] = [
  "/api/",
  "/brand/",
  "/brand$",
  "/creator/",
  "/creator$",
  "/admin/",
  "/admin$",
  "/onboarding/",
  "/dev/",
  "/login",
  "/forgot",
  "/verify",
  "/r/",
  "/p/",
];

export interface RobotsOptions {
  baseUrl?: string;
  /** Force indexing on or off. Default: on only for the canonical production domain, unless `NEXT_PUBLIC_ALLOW_INDEXING` says otherwise. */
  allowIndexing?: boolean;
}

/** True when `baseUrl` is the canonical production site (joinflowd.io or www.joinflowd.io over https). */
export function isCanonicalOrigin(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" && (url.hostname === SITE.domain || url.hostname === `www.${SITE.domain}`);
  } catch {
    return false;
  }
}

function defaultAllowIndexing(baseUrl: string): boolean {
  try {
    const override = publicEnv().NEXT_PUBLIC_ALLOW_INDEXING;
    if (override !== undefined) return override;
  } catch {
    // An invalid env is reported where it is read; fall through to the domain check.
  }
  return isCanonicalOrigin(baseUrl);
}

export function buildRobots(options: RobotsOptions = {}): MetadataRoute.Robots {
  const base = options.baseUrl ?? resolveBaseUrl();
  const allow = options.allowIndexing ?? defaultAllowIndexing(base);
  if (!allow) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] }],
    sitemap: absoluteUrl("/sitemap.xml", base),
    host: base,
  };
}

/** Would a crawler following these rules be allowed to fetch `path`? A small matcher for tests and the sitemap check (longest rule wins, allow beats disallow on a tie). */
export function isPathAllowed(rules: MetadataRoute.Robots, path: string): boolean {
  const list = Array.isArray(rules.rules) ? rules.rules : [rules.rules];
  const group = list.find((r) => r.userAgent === "*" || (Array.isArray(r.userAgent) && r.userAgent.includes("*")));
  if (!group) return true;
  const toArray = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const matches = (rule: string): boolean => (rule.endsWith("$") ? path === rule.slice(0, -1) : path.startsWith(rule));
  const longest = (rulesList: string[]): number => rulesList.filter(matches).reduce((n, r) => Math.max(n, r.length), -1);
  const allowLen = longest(toArray(group.allow));
  const disallowLen = longest(toArray(group.disallow));
  if (disallowLen === -1) return true;
  return allowLen >= disallowLen;
}
