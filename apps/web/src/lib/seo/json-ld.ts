/**
 * Structured data (schema.org JSON-LD). Plain objects, so they are testable and serialisable; render them with `<JsonLd data=... />`.
 *
 * Honesty rules (CONVENTIONS section 1): no invented reviews, ratings or customer counts, no real brands or people, prices from the
 * engine constants (never retyped here). Fictional demo creators and apps are marked up only on the pages that show them.
 */

import { SITE } from "@/lib/constants";
import { planLabel, planPriceCentsMonth, planTakeRate, PLAN_ORDER } from "@/lib/engine/constants";
import { absoluteUrl, resolveBaseUrl } from "./metadata";

export type JsonLdNode = { [key: string]: unknown };

const CONTEXT = "https://schema.org";

/** Stable `@id`s so nodes in one `@graph` can point at each other. */
export const ids = {
  organization: (base: string = resolveBaseUrl()): string => `${base.replace(/\/+$/, "")}/#organization`,
  website: (base: string = resolveBaseUrl()): string => `${base.replace(/\/+$/, "")}/#website`,
};

/** Wraps nodes in one `@graph` with the schema.org context. */
export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": CONTEXT, "@graph": nodes };
}

/** flowd, Inc. Logo and email are the owned domain's; no social profiles are listed because none are claimed yet. */
export function organizationJsonLd(base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ids.organization(base),
    name: SITE.name,
    legalName: SITE.legalName,
    url: absoluteUrl("/", base),
    logo: absoluteUrl("/brand/app-icon-rounded-512.png", base),
    slogan: SITE.tagline,
    description: SITE.description,
    email: SITE.email,
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.email, availableLanguage: ["English"] }],
  };
}

/** The site itself. */
export function websiteJsonLd(base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": ids.website(base),
    url: absoluteUrl("/", base),
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en-US",
    publisher: { "@id": ids.organization(base) },
  };
}

/** The Organization and WebSite nodes, ready to render on the home page. */
export function siteJsonLd(base: string = resolveBaseUrl()): JsonLdNode {
  return graph(organizationJsonLd(base), websiteJsonLd(base));
}

export interface FaqItem {
  question: string;
  /** Plain text. */
  answer: string;
}

/** A FAQPage. Use only for questions that are visible on the page. */
export function faqJsonLd(items: readonly FaqItem[]): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  };
}

export interface Crumb {
  name: string;
  /** Path of the page ("/tools/hook-score"). The last crumb may omit it. */
  path?: string;
}

/** A BreadcrumbList. Positions start at 1. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[], base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      ...(crumb.path ? { item: absoluteUrl(crumb.path, base) } : {}),
    })),
  };
}

export interface ArticleInput {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  /** Defaults to the organization. */
  author?: string;
}

/** An Article for changelog entries and the State of App UGC report. The author is flowd unless a fictional byline is passed. */
export function articleJsonLd(input: ArticleInput, base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    mainEntityOfPage: absoluteUrl(input.path, base),
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: input.author ? { "@type": "Person", name: input.author } : { "@id": ids.organization(base) },
    publisher: { "@id": ids.organization(base) },
  };
}

/**
 * The pricing page: one Product with an Offer per plan, from the engine constants. Monthly fees use a UnitPriceSpecification; the take
 * rate on bounty spend is in the offer description (a percentage cannot be a schema.org price).
 */
export function pricingJsonLd(base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: "flowd for Brands",
    description: "Fund bounties, review creator videos and pay for verified views, installs, trials and paid subscriptions. Escrowed, with the all-in price shown up front.",
    brand: { "@id": ids.organization(base) },
    url: absoluteUrl("/pricing", base),
    offers: PLAN_ORDER.map((plan) => {
      const monthly = planPriceCentsMonth(plan);
      const rate = Math.round(planTakeRate(plan) * 100);
      return {
        "@type": "Offer",
        name: planLabel(plan),
        description: `${rate}% on bounty, offer and spec spend.${monthly === 0 ? " No seats, no minimums." : ""}`,
        priceCurrency: "USD",
        price: (monthly / 100).toFixed(2),
        priceSpecification: { "@type": "UnitPriceSpecification", price: (monthly / 100).toFixed(2), priceCurrency: "USD", billingDuration: 1, billingIncrement: 1, unitCode: "MON" },
        availability: "https://schema.org/InStock",
        url: absoluteUrl("/pricing", base),
      };
    }),
  };
}

/** The iOS creator app (TestFlight beta). No ratings: there are none to report. */
export function softwareApplicationJsonLd(base: string = resolveBaseUrl()): JsonLdNode {
  return {
    "@context": CONTEXT,
    "@type": "MobileApplication",
    name: "flowd for creators",
    description: "Find funded bounties, make a take in Studio with a teleprompter and a live checklist, and watch the Money Clock.",
    operatingSystem: "iOS 17+",
    applicationCategory: "BusinessApplication",
    url: absoluteUrl("/app", base),
    publisher: { "@id": ids.organization(base) },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

export interface ProfileInput {
  /** Display name of a (fictional) creator. */
  name: string;
  handle: string;
  description: string;
}

/** A creator storefront as a ProfilePage. */
export function profilePageJsonLd(input: ProfileInput, base: string = resolveBaseUrl()): JsonLdNode {
  const url = absoluteUrl(`/c/${encodeURIComponent(input.handle)}`, base);
  return {
    "@context": CONTEXT,
    "@type": "ProfilePage",
    url,
    mainEntity: { "@type": "Person", name: input.name, alternateName: `@${input.handle}`, description: input.description, url },
  };
}

/** U+2028 and U+2029: valid in JSON, but line terminators in older JavaScript parsers. */
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, "g");

/**
 * Serialises JSON-LD for a `<script type="application/ld+json">`. Escapes `<`, `>`, `&` and the two line separators so the data can
 * never close the tag or break the script: the string is safe for `dangerouslySetInnerHTML`.
 */
export function jsonLdString(data: JsonLdNode | readonly JsonLdNode[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPARATORS, (ch) => `\\u${ch.charCodeAt(0).toString(16)}`);
}
