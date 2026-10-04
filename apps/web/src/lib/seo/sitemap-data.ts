/**
 * Loads the public records the sitemap lists. Server-side, build-time only (it is called from `src/app/sitemap.ts`).
 *
 * The demo has no database, so it reads the same fixtures the demo store seeds from. This is a crawler feed, not a page: the
 * "no raw JSON in pages" rule exists to keep UI on the store; the production version of this file queries the database for the
 * same four lists. A missing or malformed fixture degrades to the static pages instead of failing the build.
 */

import type { SitemapSources } from "./sitemap";

interface BountyRow {
  id: string;
  status: string;
  visibility: string;
  funded: boolean;
  updated_at?: string;
}
interface CreatorRow {
  handle: string;
  storefront?: { slug?: string };
  last_active_at?: string;
}
interface AuditRow {
  slug: string;
  generated_at?: string;
}
interface BrandRow {
  id: string;
  kind: string;
  created_at?: string;
}

async function rows<T>(load: () => Promise<{ default: unknown }>): Promise<T[]> {
  try {
    const mod = await load();
    return Array.isArray(mod.default) ? (mod.default as T[]) : [];
  } catch {
    return [];
  }
}

export async function loadSitemapSources(): Promise<SitemapSources> {
  const [creators, bounties, audits, brands] = await Promise.all([
    rows<CreatorRow>(() => import("@/data/fixtures/creators.json")),
    rows<BountyRow>(() => import("@/data/fixtures/bounties.json")),
    rows<AuditRow>(() => import("@/data/fixtures/audit_reports.json")),
    rows<BrandRow>(() => import("@/data/fixtures/brands.json")),
  ]);
  return {
    // Every creator has a storefront; the slug is the handle.
    creators: creators.map((c) => ({ key: c.storefront?.slug ?? c.handle, updatedAt: c.last_active_at })),
    // Only what a visitor can open: live, open to all, and fully escrowed (the Funded badge).
    bounties: bounties.filter((b) => b.status === "live" && b.visibility === "open" && b.funded).map((b) => ({ key: b.id, updatedAt: b.updated_at })),
    audits: audits.map((a) => ({ key: a.slug, updatedAt: a.generated_at })),
    // Workspaces that are real brands (not the flowd platform account, not agencies).
    brands: brands.filter((b) => b.kind === "brand").map((b) => ({ key: b.id, updatedAt: b.created_at })),
  };
}
