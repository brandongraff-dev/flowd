/**
 * Metadata helpers. Every page exports `metadata` (CONVENTIONS section 4); `buildMetadata` makes that one call.
 *
 * ```ts
 * export const metadata = buildMetadata({
 *   title: "Pricing",
 *   description: "Free, Pro and Scale. 12%, 10% and 8% on bounty spend, with the all-in price shown up front.",
 *   path: "/pricing",
 * });
 * ```
 *
 * The root layout supplies `title.template` ("%s · flowd"), `metadataBase` and the default icons. A page's own `openGraph` REPLACES the
 * parent's (Next does not deep-merge it), so `buildMetadata` always writes a complete `openGraph` and `twitter`.
 */

import type { Metadata } from "next";
import { SITE } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { truncate } from "@/lib/format/text";

/** The shipped 1200 x 630 share image (public/brand/og-image.png). */
export const DEFAULT_OG_IMAGE = { url: "/brand/og-image.png", width: 1200, height: 630, alt: "flowd. Money follows what works." } as const;

/** The kinds the `/og/[kind]/[id]` route handler renders (docs/ROUTES.md section 2b). */
export type OgKind = "proof" | "audit" | "card" | "scorecard" | "bounty";

/** Search engines show roughly 155 to 160 characters of a description. */
export const MAX_DESCRIPTION = 160;

/** The site origin from the public env (`NEXT_PUBLIC_SITE_URL`, else localhost in development and joinflowd.io in production). Never throws. */
export function resolveBaseUrl(): string {
  try {
    return publicEnv().SITE_URL;
  } catch {
    return SITE.siteUrl;
  }
}

/** Joins a base origin and a path: one slash between, none doubled, a full URL passes through. */
export function absoluteUrl(path: string, base: string = resolveBaseUrl()): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = base.replace(/\/+$/, "");
  const tail = path.startsWith("/") ? path : `/${path}`;
  return tail === "/" ? origin : `${origin}${tail}`;
}

/** The generated share image for a record: `/og/proof/prf_95455fe9`. The handler (tools-public) owns the art. */
export function ogImageUrl(kind: OgKind, id: string, base?: string): string {
  return absoluteUrl(`/og/${kind}/${encodeURIComponent(id)}`, base);
}

export interface PageMetaInput {
  /** The page name. The root layout appends " · flowd". */
  title: string;
  /** One or two plain sentences. Cut to 160 characters. */
  description: string;
  /** Canonical path, starting with "/". Query strings are not part of a canonical URL. */
  path: string;
  /** Share image: a URL, or a generated one (`{ kind, id }` becomes `/og/<kind>/<id>`). Default: the brand card. */
  image?: string | { kind: OgKind; id: string } | { url: string; width?: number; height?: number; alt?: string };
  /** Alt text for a generated or URL image. */
  imageAlt?: string;
  /** Keep out of search results (and the sitemap). */
  noindex?: boolean;
  /** Use the title exactly as written, without the "· flowd" template (the home page). */
  absoluteTitle?: boolean;
  /** `article` for changelog and report pages, `profile` for storefronts. Default `website`. */
  type?: "website" | "article" | "profile";
  keywords?: readonly string[];
  /** ISO timestamps for `article`. */
  publishedTime?: string;
  modifiedTime?: string;
}

export interface BuildOptions {
  /** Site origin. Default: the public env (`NEXT_PUBLIC_SITE_URL`). Pass it for tests. */
  baseUrl?: string;
}

/** Complete page metadata: title, description, canonical, Open Graph, Twitter card and robots. */
export function buildMetadata(input: PageMetaInput, options: BuildOptions = {}): Metadata {
  const base = options.baseUrl ?? resolveBaseUrl();
  const description = truncate(input.description.trim(), MAX_DESCRIPTION);
  const canonical = absoluteUrl(input.path.split(/[?#]/, 1)[0] || "/", base);
  const fullTitle = input.absoluteTitle ? input.title : `${input.title} · ${SITE.name}`;
  const image = resolveImage(input, base);

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description,
    ...(input.keywords && input.keywords.length > 0 ? { keywords: [...input.keywords] } : {}),
    alternates: { canonical },
    robots: input.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: input.type === "profile" ? "profile" : input.type === "article" ? "article" : "website",
      siteName: SITE.name,
      locale: "en_US",
      url: canonical,
      title: fullTitle,
      description,
      images: [image],
      ...(input.type === "article" && input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.type === "article" && input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
  };
}

interface ResolvedImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

function resolveImage(input: PageMetaInput, base: string): ResolvedImage {
  const alt = input.imageAlt ?? DEFAULT_OG_IMAGE.alt;
  const img = input.image;
  if (!img) return { url: absoluteUrl(DEFAULT_OG_IMAGE.url, base), width: DEFAULT_OG_IMAGE.width, height: DEFAULT_OG_IMAGE.height, alt };
  if (typeof img === "string") return { url: absoluteUrl(img, base), width: 1200, height: 630, alt };
  if ("kind" in img) return { url: ogImageUrl(img.kind, img.id, base), width: 1200, height: 630, alt };
  return { url: absoluteUrl(img.url, base), width: img.width ?? 1200, height: img.height ?? 630, alt: img.alt ?? alt };
}

/** Metadata for a page that must not be indexed (sign-in, reset, results behind a token): `noindex` and no canonical share card needed. */
export function noindexMetadata(title: string, description: string, path: string, options: BuildOptions = {}): Metadata {
  return buildMetadata({ title, description, path, noindex: true }, options);
}
