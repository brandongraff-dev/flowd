import { describe, expect, it } from "vitest";
import { accessFor } from "@/lib/session/access";
import {
  DEFAULT_OG_IMAGE,
  MAX_DESCRIPTION,
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  buildMetadata,
  buildRobots,
  buildSitemap,
  faqJsonLd,
  graph,
  isCanonicalOrigin,
  isPathAllowed,
  jsonLdString,
  noindexMetadata,
  ogImageUrl,
  organizationJsonLd,
  pricingJsonLd,
  profilePageJsonLd,
  siteJsonLd,
  softwareApplicationJsonLd,
  DISALLOWED_PATHS,
} from "../index";

const BASE = "https://joinflowd.io";

describe("absoluteUrl", () => {
  it("joins origin and path with exactly one slash", () => {
    expect(absoluteUrl("/pricing", BASE)).toBe("https://joinflowd.io/pricing");
    expect(absoluteUrl("pricing", `${BASE}/`)).toBe("https://joinflowd.io/pricing");
    expect(absoluteUrl("/", BASE)).toBe("https://joinflowd.io");
  });
  it("passes a full URL through", () => {
    expect(absoluteUrl("https://example.com/x", BASE)).toBe("https://example.com/x");
  });
  it("builds generated share image URLs", () => {
    expect(ogImageUrl("proof", "prf_95455fe9", BASE)).toBe("https://joinflowd.io/og/proof/prf_95455fe9");
    expect(ogImageUrl("audit", "lumi photo", BASE)).toBe("https://joinflowd.io/og/audit/lumi%20photo");
  });
});

describe("buildMetadata", () => {
  const base = { title: "Pricing", description: "Free, Pro and Scale. 12%, 10% and 8% on bounty spend.", path: "/pricing" };

  it("writes a complete page: title, description, canonical, Open Graph, Twitter, robots", () => {
    const m = buildMetadata(base, { baseUrl: BASE });
    expect(m.title).toBe("Pricing");
    expect(m.description).toBe(base.description);
    expect(m.alternates?.canonical).toBe("https://joinflowd.io/pricing");
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.openGraph).toMatchObject({ type: "website", siteName: "flowd", url: "https://joinflowd.io/pricing", title: "Pricing · flowd", locale: "en_US" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Pricing · flowd" });
  });
  it("carries the brand share card by default, with its size and alt text", () => {
    const m = buildMetadata(base, { baseUrl: BASE });
    expect(m.openGraph?.images).toEqual([{ url: "https://joinflowd.io/brand/og-image.png", width: 1200, height: 630, alt: DEFAULT_OG_IMAGE.alt }]);
    expect(m.twitter?.images).toEqual(["https://joinflowd.io/brand/og-image.png"]);
  });
  it("uses a generated card for a record, or any URL", () => {
    const proof = buildMetadata({ ...base, image: { kind: "proof", id: "prf_1" }, imageAlt: "Earnings proof" }, { baseUrl: BASE });
    expect(proof.openGraph?.images).toEqual([{ url: "https://joinflowd.io/og/proof/prf_1", width: 1200, height: 630, alt: "Earnings proof" }]);
    const custom = buildMetadata({ ...base, image: { url: "/x.png", width: 800, height: 400, alt: "x" } }, { baseUrl: BASE });
    expect(custom.openGraph?.images).toEqual([{ url: "https://joinflowd.io/x.png", width: 800, height: 400, alt: "x" }]);
    const str = buildMetadata({ ...base, image: "/y.png" }, { baseUrl: BASE });
    expect((str.openGraph?.images as { url: string }[])[0]?.url).toBe("https://joinflowd.io/y.png");
  });
  it("cuts a long description to 160 characters on a word", () => {
    const long = "Money follows what works. ".repeat(20);
    const m = buildMetadata({ ...base, description: long }, { baseUrl: BASE });
    expect(Array.from(String(m.description)).length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(String(m.description).endsWith("…")).toBe(true);
  });
  it("leaves the query string and hash out of the canonical URL", () => {
    const m = buildMetadata({ ...base, path: "/market?category=fitness#top" }, { baseUrl: BASE });
    expect(m.alternates?.canonical).toBe("https://joinflowd.io/market");
  });
  it("supports an absolute title for the home page", () => {
    const m = buildMetadata({ ...base, title: "flowd: money follows what works", path: "/", absoluteTitle: true }, { baseUrl: BASE });
    expect(m.title).toEqual({ absolute: "flowd: money follows what works" });
    expect(m.openGraph?.title).toBe("flowd: money follows what works");
    expect(m.alternates?.canonical).toBe("https://joinflowd.io");
  });
  it("marks noindex pages", () => {
    const m = noindexMetadata("Sign in", "Pick a demo persona.", "/login", { baseUrl: BASE });
    expect(m.robots).toEqual({ index: false, follow: false });
  });
  it("types articles and profiles", () => {
    const a = buildMetadata({ ...base, type: "article", publishedTime: "2026-09-01T00:00:00Z", modifiedTime: "2026-09-10T00:00:00Z" }, { baseUrl: BASE });
    expect(a.openGraph).toMatchObject({ type: "article", publishedTime: "2026-09-01T00:00:00Z", modifiedTime: "2026-09-10T00:00:00Z" });
    expect(buildMetadata({ ...base, type: "profile" }, { baseUrl: BASE }).openGraph).toMatchObject({ type: "profile" });
    expect(buildMetadata(base, { baseUrl: BASE }).openGraph).not.toHaveProperty("publishedTime");
  });
  it("adds keywords only when given", () => {
    expect(buildMetadata(base, { baseUrl: BASE })).not.toHaveProperty("keywords");
    expect(buildMetadata({ ...base, keywords: ["ugc", "bounties"] }, { baseUrl: BASE }).keywords).toEqual(["ugc", "bounties"]);
  });
});

describe("JSON-LD", () => {
  it("describes the organization with the owned domain and no invented profiles", () => {
    const org = organizationJsonLd(BASE);
    expect(org).toMatchObject({ "@type": "Organization", name: "flowd", legalName: "flowd, Inc.", url: BASE, email: "hello@joinflowd.io", slogan: "Money follows what works." });
    expect(org).not.toHaveProperty("sameAs");
    expect(JSON.stringify(org)).not.toMatch(/flowd\.(so|com|app)\b/);
  });
  it("wraps nodes in a graph that points at the organization", () => {
    const g = siteJsonLd(BASE) as { "@context": string; "@graph": Record<string, unknown>[] };
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@graph"].map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);
    expect((g["@graph"][1]?.publisher as { "@id": string })["@id"]).toBe(`${BASE}/#organization`);
    expect(graph({ "@type": "Thing" })["@graph"]).toEqual([{ "@type": "Thing" }]);
  });
  it("builds a FAQ from visible questions", () => {
    const faq = faqJsonLd([{ question: "When do I get paid?", answer: "Weekly, on Fridays at 18:00 UTC. Instant cash-out costs 1.5%." }]) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity).toHaveLength(1);
    expect(faq.mainEntity[0]?.name).toBe("When do I get paid?");
    expect(faq.mainEntity[0]?.acceptedAnswer.text).toContain("Fridays");
  });
  it("numbers breadcrumbs from 1 and links all but an unlinked last crumb", () => {
    const b = breadcrumbJsonLd([{ name: "Tools", path: "/tools" }, { name: "Hook Score checker" }], BASE) as { itemListElement: { position: number; item?: string }[] };
    expect(b.itemListElement.map((c) => c.position)).toEqual([1, 2]);
    expect(b.itemListElement[0]?.item).toBe("https://joinflowd.io/tools");
    expect(b.itemListElement[1]).not.toHaveProperty("item");
  });
  it("marks up an article with the organization as author by default", () => {
    const a = articleJsonLd({ headline: "State of App UGC", description: "d", path: "/report/state-of-app-ugc", datePublished: "2026-09-30" }, BASE) as Record<string, unknown>;
    expect(a.dateModified).toBe("2026-09-30");
    expect(a.author).toEqual({ "@id": `${BASE}/#organization` });
    expect((articleJsonLd({ headline: "h", description: "d", path: "/x", datePublished: "2026-01-01", author: "Dara Whitfield" }, BASE) as { author: unknown }).author).toEqual({ "@type": "Person", name: "Dara Whitfield" });
  });
  it("prices the plans from the engine constants: $0, $299 and $999 a month", () => {
    const p = pricingJsonLd(BASE) as { offers: { name: string; price: string; description: string; priceCurrency: string }[] };
    expect(p.offers.map((o) => [o.name, o.price])).toEqual([["Free", "0.00"], ["Pro", "299.00"], ["Scale", "999.00"]]);
    expect(p.offers.map((o) => o.description)).toEqual([
      "12% on bounty, offer and spec spend. No seats, no minimums.",
      "10% on bounty, offer and spec spend.",
      "8% on bounty, offer and spec spend.",
    ]);
    expect(p.offers.every((o) => o.priceCurrency === "USD")).toBe(true);
  });
  it("describes the app without ratings", () => {
    const app = softwareApplicationJsonLd(BASE);
    expect(app).toMatchObject({ "@type": "MobileApplication", operatingSystem: "iOS 17+" });
    expect(app).not.toHaveProperty("aggregateRating");
    expect(app).not.toHaveProperty("review");
  });
  it("marks up a storefront", () => {
    const p = profilePageJsonLd({ name: "Maya Reyes", handle: "maya.makes", description: "Lifestyle and AI tools." }, BASE) as { mainEntity: { alternateName: string; url: string } };
    expect(p.mainEntity.alternateName).toBe("@maya.makes");
    expect(p.mainEntity.url).toBe("https://joinflowd.io/c/maya.makes");
  });
  it("serialises so data can never close the script tag", () => {
    const text = jsonLdString({ "@type": "Thing", name: "</script><script>alert(1)</script> & more " });
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("&");
    expect(text).not.toContain(" ");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script> & more ");
  });
});

describe("buildSitemap", () => {
  const sources = {
    creators: [{ key: "maya.makes", updatedAt: "2026-09-21T22:50:22Z" }, { key: "lou_learns" }],
    bounties: [{ key: "bnty_lumi_editwithme", updatedAt: "2026-10-02T14:34:18Z" }],
    audits: [{ key: "lumi-photo-editor", updatedAt: "2026-08-29T14:00:00Z" }],
    brands: [{ key: "br_lumi" }],
  };
  const sitemap = buildSitemap({ baseUrl: BASE, sources });
  const urls = sitemap.map((e) => e.url);

  it("lists the public pages with the home page first", () => {
    expect(urls[0]).toBe("https://joinflowd.io");
    expect(sitemap[0]?.priority).toBe(1);
    for (const path of ["/pricing", "/promise", "/tools/hook-score", "/legal/terms", "/market"]) expect(urls).toContain(`${BASE}${path}`);
  });
  it("lists the public records", () => {
    expect(urls).toContain(`${BASE}/c/maya.makes`);
    expect(urls).toContain(`${BASE}/b/bnty_lumi_editwithme`);
    expect(urls).toContain(`${BASE}/audit/lumi-photo-editor`);
    expect(urls).toContain(`${BASE}/scorecard/br_lumi`);
  });
  it("never lists a guarded, utility or private page", () => {
    for (const url of urls) {
      const path = url.replace(BASE, "") || "/";
      expect(accessFor(path), path).toBe("public");
      expect(path).not.toMatch(/^\/(login|forgot|verify|p\/|r\/|api\/|dev\/)/);
    }
  });
  it("has unique URLs, valid priorities and a date on every entry", () => {
    expect(new Set(urls).size).toBe(urls.length);
    for (const e of sitemap) {
      expect(e.priority ?? 0).toBeGreaterThan(0);
      expect(e.priority ?? 0).toBeLessThanOrEqual(1);
      expect(e.lastModified).toBeInstanceOf(Date);
      expect(Number.isNaN((e.lastModified as Date).getTime())).toBe(false);
    }
  });
  it("uses the record's own date, else the demo world's", () => {
    const maya = sitemap.find((e) => e.url.endsWith("/c/maya.makes"));
    const lou = sitemap.find((e) => e.url.endsWith("/c/lou_learns"));
    expect((maya?.lastModified as Date).toISOString()).toBe("2026-09-21T22:50:22.000Z");
    expect((lou?.lastModified as Date).toISOString()).toBe("2026-10-03T14:00:00.000Z");
  });
  it("encodes keys and caps each group", () => {
    const capped = buildSitemap({ baseUrl: BASE, maxPerGroup: 2, sources: { creators: [{ key: "a b" }, { key: "c" }, { key: "d" }] } });
    expect(capped.map((e) => e.url)).toContain(`${BASE}/c/a%20b`);
    expect(capped.filter((e) => e.url.includes("/c/"))).toHaveLength(2);
  });
  it("works with no records at all", () => {
    expect(buildSitemap({ baseUrl: BASE }).length).toBeGreaterThan(30);
  });
});

describe("buildRobots", () => {
  const open = buildRobots({ baseUrl: BASE, allowIndexing: true });

  it("opens the public site and points at the sitemap", () => {
    expect(open.sitemap).toBe("https://joinflowd.io/sitemap.xml");
    for (const path of ["/", "/pricing", "/brands", "/creators", "/tools/hook-score", "/c/maya.makes", "/b/bnty_x", "/audit/lumi-photo-editor", "/og/audit/x", "/legal/terms"]) {
      expect(isPathAllowed(open, path), path).toBe(true);
    }
  });
  it("closes everything behind a login, the API, the gallery, proofs and tracking links", () => {
    for (const path of ["/brand/review", "/creator/wallet", "/admin", "/onboarding/creator", "/api/v1/flo/chat", "/dev/design", "/login", "/forgot", "/verify", "/r/maya-lumi1", "/p/prf_1"]) {
      expect(isPathAllowed(open, path), path).toBe(false);
    }
  });
  it("does not block the marketing pages whose names start like a guarded area", () => {
    expect(DISALLOWED_PATHS).toContain("/brand/");
    expect(isPathAllowed(open, "/brands")).toBe(true);
    expect(isPathAllowed(open, "/creators")).toBe(true);
    expect(isPathAllowed(open, "/administrators")).toBe(true);
  });
  it("closes the whole site when indexing is off", () => {
    const closed = buildRobots({ baseUrl: "http://localhost:3000", allowIndexing: false });
    expect(closed.sitemap).toBeUndefined();
    expect(isPathAllowed(closed, "/")).toBe(false);
    expect(isPathAllowed(closed, "/pricing")).toBe(false);
  });
  it("opens indexing by default only for the canonical production domain", () => {
    expect(isCanonicalOrigin("https://joinflowd.io")).toBe(true);
    expect(isCanonicalOrigin("https://www.joinflowd.io")).toBe(true);
    expect(isCanonicalOrigin("http://joinflowd.io")).toBe(false);
    expect(isCanonicalOrigin("https://preview-123.vercel.app")).toBe(false);
    expect(isCanonicalOrigin("http://localhost:3000")).toBe(false);
    expect(isCanonicalOrigin("not a url")).toBe(false);
    expect(isPathAllowed(buildRobots({ baseUrl: "https://staging.joinflowd.io" }), "/")).toBe(false);
    expect(isPathAllowed(buildRobots({ baseUrl: "https://joinflowd.io" }), "/")).toBe(true);
  });
  it("matches a longer allow over a shorter disallow", () => {
    const rules = { rules: [{ userAgent: "*", allow: ["/brand/public"], disallow: ["/brand/"] }] };
    expect(isPathAllowed(rules, "/brand/public/x")).toBe(true);
    expect(isPathAllowed(rules, "/brand/review")).toBe(false);
    expect(isPathAllowed({ rules: [{ userAgent: "Googlebot", disallow: "/" }] }, "/x")).toBe(true);
  });
  it("sitemap and robots agree: nothing in the sitemap is disallowed", () => {
    for (const e of buildSitemap({ baseUrl: BASE })) expect(isPathAllowed(open, e.url.replace(BASE, "") || "/"), e.url).toBe(true);
  });
});
