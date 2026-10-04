/**
 * The sitemap, built from the route registry (every public, indexable static page) plus the public records passed in: creator
 * storefronts (`/c/<handle>`), open funded bounties (`/b/<id>`), shareable audits (`/audit/<slug>`) and public Brand Scorecards
 * (`/scorecard/<id>`). Proof pages (`/p/...`), tracking links (`/r/...`) and everything behind a login are never listed.
 *
 * Pure: `src/app/sitemap.ts` loads the records and calls this; tests call it with inline data.
 */

import type { MetadataRoute } from "next";
import { DEMO_NOW } from "@/lib/constants";
import { sitemapRoutes } from "@/lib/search/routes";
import { absoluteUrl, resolveBaseUrl } from "./metadata";

export interface SitemapRecord {
  /** The id, handle or slug the URL is built from. */
  key: string;
  /** ISO timestamp the record last changed. */
  updatedAt?: string;
}

export interface SitemapSources {
  creators?: readonly SitemapRecord[];
  bounties?: readonly SitemapRecord[];
  audits?: readonly SitemapRecord[];
  brands?: readonly SitemapRecord[];
}

export interface SitemapOptions {
  /** Site origin. Default: the public env. */
  baseUrl?: string;
  /** Last-modified for static pages. Default: the demo world's now (fixtures and the changelog are relative to it). */
  lastModified?: string;
  sources?: SitemapSources;
  /** At most this many URLs from each record group (the protocol allows 50,000 in total). Default 2,000. */
  maxPerGroup?: number;
}

type Entry = MetadataRoute.Sitemap[number];

function dynamicEntries(
  records: readonly SitemapRecord[] | undefined,
  pathFor: (key: string) => string,
  base: string,
  fallback: Date,
  max: number,
  extra: Pick<Entry, "changeFrequency" | "priority">,
): Entry[] {
  return (records ?? [])
    .filter((r) => r.key.length > 0)
    .slice(0, max)
    .map((r) => ({ url: absoluteUrl(pathFor(r.key), base), lastModified: r.updatedAt ? new Date(r.updatedAt) : fallback, ...extra }));
}

/** The full sitemap: static pages first (by priority), then each record group in a stable order. URLs are unique. */
export function buildSitemap(options: SitemapOptions = {}): MetadataRoute.Sitemap {
  const base = options.baseUrl ?? resolveBaseUrl();
  const fallback = new Date(options.lastModified ?? DEMO_NOW);
  const max = options.maxPerGroup ?? 2000;
  const { sources = {} } = options;
  const enc = encodeURIComponent;

  const pages: Entry[] = sitemapRoutes()
    .map((r) => ({ url: absoluteUrl(r.href, base), lastModified: fallback, changeFrequency: r.changeFrequency ?? "monthly", priority: r.priority ?? 0.5 }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const all: Entry[] = [
    ...pages,
    ...dynamicEntries(sources.bounties, (k) => `/b/${enc(k)}`, base, fallback, max, { changeFrequency: "daily", priority: 0.6 }),
    ...dynamicEntries(sources.audits, (k) => `/audit/${enc(k)}`, base, fallback, max, { changeFrequency: "monthly", priority: 0.5 }),
    ...dynamicEntries(sources.creators, (k) => `/c/${enc(k)}`, base, fallback, max, { changeFrequency: "weekly", priority: 0.5 }),
    ...dynamicEntries(sources.brands, (k) => `/scorecard/${enc(k)}`, base, fallback, max, { changeFrequency: "weekly", priority: 0.4 }),
  ];

  const seen = new Set<string>();
  return all.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}
