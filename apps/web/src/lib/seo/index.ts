/**
 * flowd SEO kit. Import from "@/lib/seo".
 *
 *   buildMetadata({ title, description, path })      every page's `export const metadata`
 *   <JsonLd data={faqJsonLd(items)} />               from "@/lib/seo/json-ld-script" (server component)
 *   buildSitemap / buildRobots                       used by src/app/sitemap.ts and src/app/robots.ts
 *   loadSitemapSources()                             from "@/lib/seo/sitemap-data" (server, build time)
 */

export * from "./metadata";
export * from "./json-ld";
export * from "./sitemap";
export * from "./robots";
