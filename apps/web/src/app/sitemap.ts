import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { loadSitemapSources } from "@/lib/seo/sitemap-data";

/** sitemap.xml: every public, indexable page plus the public creator, bounty, audit and scorecard pages (docs/ROUTES.md section 2). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap({ sources: await loadSitemapSources() });
}
