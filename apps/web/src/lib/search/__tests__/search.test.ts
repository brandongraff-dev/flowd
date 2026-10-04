import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { accessFor } from "@/lib/session/access";
import {
  GROUP_ORDER,
  ROUTE_REGISTRY,
  actionsForRole,
  allActionIds,
  buildSearchIndex,
  entityHref,
  groupResults,
  highlightPlain,
  highlightSegments,
  mergeRanges,
  normalize,
  parseRecents,
  personaOfAction,
  pushRecent,
  routeFor,
  routesForRole,
  scoreEntry,
  search,
  searchIndex,
  shortcutsForRole,
  sitemapRoutes,
  tokenizeQuery,
  type SearchIndexInput,
} from "../index";
import { SEARCH_ICONS } from "../icons";
import { toCommandGroups } from "../palette";

// ── fixtures: a small, realistic slice of the demo world ───────────────────────────────────────

const DATA: Omit<SearchIndexInput, "role"> = {
  bounties: [
    { id: "bnty_lumi_editwithme", title: "Edit with me", status: "live", app_name: "Lumi", brand_name: "Lumi", category: "ai_photo", cpm_cents: 228, funded: true },
    { id: "bnty_parlo_spoke", title: "I spoke it on day one", status: "live", app_name: "Parlo", category: "language", cpm_cents: 190, funded: true },
    { id: "bnty_flowd_starter_1", title: "Starter: show us one app you actually keep", status: "live", app_name: "flowd", cpm_cents: 0, funded: true },
    { id: "bnty_old", title: "Old summer push", status: "ended", app_name: "Lumi", cpm_cents: 210 },
  ],
  creators: [
    { handle: "maya.makes", display_name: "Maya Reyes", tier: "silver", niches: ["lifestyle", "ai_tools"] },
    { handle: "lou_learns", display_name: "Lou Park", tier: "gold", niches: ["study"] },
  ],
  brands: [{ id: "br_lumi", name: "Lumi" }, { id: "br_parlo", name: "Parlo" }],
  apps: [{ id: "app_lumi", name: "Lumi", category: "ai_photo" }],
  submissions: [{ id: "sub_0634", title: "Confession hook v2", status: "in_review", creator_handle: "maya.makes", bounty_title: "Edit with me" }],
  posts: [{ id: "post_0412", title: "Day 30 with Parlo", bounty_title: "I spoke it on day one", status: "live" }],
  lessons: [{ slug: "hooks-in-two-seconds", title: "Hooks that land in two seconds", minutes: 5 }, { slug: "usage-rights", title: "Usage rights, plainly", minutes: 4 }],
};

const brandIndex = buildSearchIndex({ role: "brand_member", ...DATA });
const creatorIndex = buildSearchIndex({ role: "creator", ...DATA });
const adminIndex = buildSearchIndex({ role: "admin", ...DATA });
const visitorIndex = buildSearchIndex({ role: null, ...DATA });

const firstLabel = (groupsOrResults: ReturnType<typeof search>): string | undefined => groupsOrResults[0]?.results[0]?.entry.label;

// ── the registry against docs/ROUTES.md ────────────────────────────────────────────────────────

describe("the route registry", () => {
  const docsPath = fileURLToPath(new URL("../../../../../../docs/ROUTES.md", import.meta.url));
  const docs = readFileSync(docsPath, "utf8");
  const documented = new Set<string>();
  for (const line of docs.split("\n")) {
    const m = /^\| `(\/[^`]*)` \|/.exec(line);
    if (m?.[1] && !m[1].includes("[")) documented.add(m[1]);
  }

  it("lists every static page in docs/ROUTES.md", () => {
    const missing = [...documented].filter((href) => !routeFor(href));
    expect(missing).toEqual([]);
  });
  it("lists nothing that docs/ROUTES.md does not", () => {
    const extra = ROUTE_REGISTRY.map((r) => r.href).filter((href) => !documented.has(href));
    expect(extra).toEqual([]);
  });
  it("has unique paths", () => {
    const hrefs = ROUTE_REGISTRY.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("agrees with the route guards on who may open each page", () => {
    for (const r of ROUTE_REGISTRY) expect(accessFor(r.href), r.href).toBe(r.access);
  });
  it("uses sentence case labels and the product vocabulary", () => {
    for (const r of ROUTE_REGISTRY) {
      expect(r.label.length, r.href).toBeGreaterThan(2);
      expect(/campaign|influencer|gig/i.test(r.label), r.label).toBe(false);
    }
  });
  it("keeps shortcuts unique within a role", () => {
    for (const role of ["brand_member", "creator", "admin"] as const) {
      const keys = shortcutsForRole(role).map((s) => s.keys.join(" "));
      expect(new Set(keys).size, role).toBe(keys.length);
      for (const s of shortcutsForRole(role)) expect(s.keys[0]).toBe("g");
    }
  });
  it("puts only public, indexable pages in the sitemap list", () => {
    const hrefs = sitemapRoutes().map((r) => r.href);
    expect(hrefs).toContain("/pricing");
    expect(hrefs).toContain("/tools/hook-score");
    expect(hrefs).not.toContain("/login");
    expect(hrefs).not.toContain("/forgot");
    expect(hrefs).not.toContain("/verify");
    expect(hrefs.some((h) => /^\/(brand|creator|admin)(\/|$)/.test(h))).toBe(false);
    for (const r of sitemapRoutes()) expect(r.priority, r.href).toBeGreaterThan(0);
  });
  it("shows a role its own area and the public pages, never another role's", () => {
    const creatorHrefs = routesForRole("creator").map((r) => r.href);
    expect(creatorHrefs).toContain("/creator/wallet");
    expect(creatorHrefs).toContain("/pricing");
    expect(creatorHrefs).not.toContain("/brand/wallet");
    expect(routesForRole(null).every((r) => r.access === "public")).toBe(true);
  });
});

// ── text normalising and ranking ───────────────────────────────────────────────────────────────

describe("normalize and tokenizeQuery", () => {
  it("lower-cases, folds accents and straightens quotes", () => {
    expect(normalize("  Café  Today’s  Drop ")).toBe("cafe today's drop");
  });
  it("keeps # @ $ and % so handles, hashtags and prices stay searchable", () => {
    expect(normalize("@maya.makes #ad $2.28 12%")).toBe("@maya.makes #ad $2.28 12%");
  });
  it("splits a query into words", () => {
    expect(tokenizeQuery("  Rev   QUEUE ")).toEqual(["rev", "queue"]);
    expect(tokenizeQuery("")).toEqual([]);
    expect(tokenizeQuery("???")).toEqual([]);
  });
  it("merges overlapping ranges", () => {
    expect(mergeRanges([{ start: 4, end: 6 }, { start: 0, end: 2 }, { start: 1, end: 3 }, { start: 3, end: 4 }, { start: 8, end: 8 }])).toEqual([{ start: 0, end: 6 }]);
  });
});

describe("scoreEntry", () => {
  const wallet = creatorIndex.entries.find((e) => e.id === "page:/creator/wallet");
  if (!wallet) throw new Error("fixture: creator wallet entry missing");

  it("ranks an exact label above a prefix above a word start above a substring", () => {
    const score = (q: string): number => scoreEntry(wallet, tokenizeQuery(q))?.score ?? 0;
    expect(score("wallet")).toBeGreaterThan(score("wall"));
    expect(score("wall")).toBeGreaterThan(score("allet"));
  });
  it("requires every word to match", () => {
    expect(scoreEntry(wallet, ["wallet", "zzzz"])).toBeNull();
    expect(scoreEntry(wallet, ["wallet", "cash"])).not.toBeNull(); // "cash" is a keyword
  });
  it("matches a keyword the label does not contain", () => {
    expect(scoreEntry(wallet, tokenizeQuery("withdraw"))).not.toBeNull();
  });
  it("tolerates a typo made of letters in order, close together", () => {
    expect(scoreEntry(wallet, tokenizeQuery("walet"))).not.toBeNull();
    expect(scoreEntry(wallet, tokenizeQuery("wxt"))).toBeNull();
  });
  it("scores an empty query by boost alone, with recents on top", () => {
    const plain = scoreEntry(wallet, [])?.score ?? 0;
    const recent = scoreEntry(wallet, [], { recent: [wallet.id] })?.score ?? 0;
    expect(recent).toBeGreaterThan(plain);
  });
  it("reports where the label matched", () => {
    const r = scoreEntry(wallet, ["wall"]);
    expect(r?.matches).toEqual([{ start: 0, end: 4 }]);
    expect(highlightPlain("Wallet", r?.matches ?? [])).toBe("[Wall]et");
    expect(highlightSegments("Wallet", r?.matches ?? [])).toEqual([{ text: "Wall", match: true }, { text: "et", match: false }]);
    expect(highlightSegments("Wallet", [])).toEqual([{ text: "Wallet", match: false }]);
  });
});

// ── building and searching ─────────────────────────────────────────────────────────────────────

describe("buildSearchIndex", () => {
  it("has unique ids in every index", () => {
    for (const index of [brandIndex, creatorIndex, adminIndex, visitorIndex]) {
      const ids = index.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("gives each role its own pages and no one else's", () => {
    const ids = (index: typeof brandIndex): string[] => index.entries.map((e) => e.id);
    expect(ids(brandIndex)).toContain("page:/brand/review");
    expect(ids(brandIndex)).not.toContain("page:/creator/wallet");
    expect(ids(creatorIndex)).toContain("page:/creator/wallet");
    expect(ids(creatorIndex)).not.toContain("page:/admin/fraud");
    expect(ids(adminIndex)).toContain("page:/admin/fraud");
    expect(ids(visitorIndex)).toContain("page:/pricing");
    expect(ids(visitorIndex)).toContain("page:/login");
    expect(ids(visitorIndex)).not.toContain("page:/brand");
  });
  it("hides sign-in and sign-up from someone who is signed in", () => {
    const ids = creatorIndex.entries.map((e) => e.id);
    expect(ids).not.toContain("page:/login");
    expect(ids).not.toContain("page:/signup/brand");
  });
  it("rewrites entity links for the role", () => {
    const href = (index: typeof brandIndex, id: string): string | undefined => index.entries.find((e) => e.id === id)?.href;
    expect(href(brandIndex, "bounty:bnty_lumi_editwithme")).toBe("/brand/bounties/bnty_lumi_editwithme");
    expect(href(creatorIndex, "bounty:bnty_lumi_editwithme")).toBe("/creator/bounties/bnty_lumi_editwithme");
    expect(href(adminIndex, "bounty:bnty_lumi_editwithme")).toBe("/admin/bounties?q=bnty_lumi_editwithme");
    expect(href(visitorIndex, "bounty:bnty_lumi_editwithme")).toBe("/b/bnty_lumi_editwithme");
    expect(href(brandIndex, "creator:maya.makes")).toBe("/brand/creators/maya.makes");
    expect(href(visitorIndex, "creator:maya.makes")).toBe("/c/maya.makes");
    expect(href(creatorIndex, "brand:br_lumi")).toBe("/creator/brands/br_lumi");
    expect(href(brandIndex, "app:app_lumi")).toBe("/brand/apps/app_lumi");
    expect(href(creatorIndex, "lesson:usage-rights")).toBe("/creator/academy/usage-rights");
    expect(href(brandIndex, "submission:sub_0634")).toBe("/brand/review/sub_0634");
    expect(href(creatorIndex, "submission:sub_0634")).toBe("/creator/submissions/sub_0634");
    expect(href(creatorIndex, "post:post_0412")).toBe("/creator/posts/post_0412");
  });
  it("leaves out entities a role has no page for", () => {
    expect(creatorIndex.entries.some((e) => e.id.startsWith("app:"))).toBe(false);
    expect(brandIndex.entries.some((e) => e.id.startsWith("lesson:"))).toBe(false);
    expect(brandIndex.entries.some((e) => e.id.startsWith("post:"))).toBe(false);
    expect(visitorIndex.entries.some((e) => e.id.startsWith("submission:"))).toBe(false);
  });
  it("encodes ids in links", () => {
    expect(entityHref("bounty", "creator", "a b/c")).toBe("/creator/bounties/a%20b%2Fc");
    expect(entityHref("app", "creator", "app_x")).toBeNull();
    expect(entityHref("page", "creator", "x")).toBeNull();
  });
  it("describes entities with a status and the price in house wording", () => {
    const entry = brandIndex.entries.find((e) => e.id === "bounty:bnty_lumi_editwithme");
    expect(entry?.hint).toBe("Live · $2.28 CPM · Lumi");
    expect(brandIndex.entries.find((e) => e.id === "creator:maya.makes")?.hint).toBe("@maya.makes · Silver");
  });
  it("can leave the actions out", () => {
    const lean = buildSearchIndex({ role: "creator", includeActions: false });
    expect(lean.entries.some((e) => e.kind === "action")).toBe(false);
  });
});

describe("actions", () => {
  it("offers role-specific actions plus the shared ones", () => {
    const creator = actionsForRole("creator").map((a) => a.label);
    expect(creator).toContain("Cash out");
    expect(creator).toContain("Make a take");
    expect(creator).toContain("Switch theme");
    expect(creator).not.toContain("Start a bounty");
    expect(actionsForRole("brand_member").map((a) => a.label)).toContain("Start a bounty");
    expect(actionsForRole("admin").map((a) => a.label)).toContain("Advance demo clock by 24 hours");
  });
  it("skips the persona you already are", () => {
    const labels = actionsForRole("creator").map((a) => a.label);
    expect(labels).toContain("Switch to Jordan (brand)");
    expect(labels).toContain("Switch to Sam (admin)");
    expect(labels).not.toContain("Switch to Maya (creator)");
    expect(actionsForRole(null).filter((a) => a.action?.startsWith("switch-persona")).length).toBe(3);
  });
  it("gives a visitor no sign-out", () => {
    expect(actionsForRole(null).some((a) => a.action === "sign-out")).toBe(false);
  });
  it("names every action the shell must implement", () => {
    const ids = allActionIds();
    expect(ids).toEqual(expect.arrayContaining(["toggle-theme", "sign-out", "reset-demo", "switch-persona:brand", "switch-persona:creator", "switch-persona:admin", "advance-clock-24h"]));
    expect(personaOfAction("switch-persona:creator")).toBe("creator");
    expect(personaOfAction("toggle-theme")).toBeNull();
  });
  it("gives every entry something to do", () => {
    for (const role of [null, "creator", "brand_member", "admin"] as const) {
      for (const a of actionsForRole(role)) expect(Boolean(a.href) !== Boolean(a.action), a.id).toBe(true);
    }
  });
});

describe("search", () => {
  it("finds a page by its name", () => {
    expect(firstLabel(search(creatorIndex, "wallet"))).toBe("Wallet");
    expect(firstLabel(search(brandIndex, "review queue"))).toBe("Review queue");
  });
  it("finds a page from the start of each word", () => {
    expect(firstLabel(search(brandIndex, "rev que"))).toBe("Review queue");
  });
  it("finds an action by what the person means", () => {
    expect(firstLabel(search(creatorIndex, "withdraw"))).toMatch(/Cash out|Wallet/);
    const groups = search(creatorIndex, "cash out");
    expect(groups.flatMap((g) => g.results).some((r) => r.entry.label === "Cash out")).toBe(true);
  });
  it("finds a bounty by title, app and id", () => {
    expect(search(brandIndex, "edit with").flatMap((g) => g.results).some((r) => r.entry.id === "bounty:bnty_lumi_editwithme")).toBe(true);
    expect(search(brandIndex, "parlo").flatMap((g) => g.results).some((r) => r.entry.id === "bounty:bnty_parlo_spoke")).toBe(true);
    expect(search(brandIndex, "bnty_parlo_spoke").flatMap((g) => g.results).some((r) => r.entry.id === "bounty:bnty_parlo_spoke")).toBe(true);
  });
  it("finds a creator by name and by handle", () => {
    expect(search(brandIndex, "maya").flatMap((g) => g.results).some((r) => r.entry.id === "creator:maya.makes")).toBe(true);
    expect(search(brandIndex, "@maya.makes").flatMap((g) => g.results).some((r) => r.entry.id === "creator:maya.makes")).toBe(true);
    expect(search(brandIndex, "lou_learns").flatMap((g) => g.results).some((r) => r.entry.id === "creator:lou_learns")).toBe(true);
  });
  it("finds a lesson in a creator's index and not in a brand's", () => {
    expect(search(creatorIndex, "usage rights").flatMap((g) => g.results).some((r) => r.entry.id === "lesson:usage-rights")).toBe(true);
    expect(search(brandIndex, "hooks that land").flatMap((g) => g.results).some((r) => r.entry.kind === "lesson")).toBe(false);
  });
  it("never shows a creator a brand-only page", () => {
    const all = search(creatorIndex, "review").flatMap((g) => g.results).map((r) => r.entry.href ?? "");
    expect(all.some((h) => h.startsWith("/brand"))).toBe(false);
  });
  it("returns nothing for gibberish", () => {
    expect(search(creatorIndex, "qqqzzzxxx")).toEqual([]);
  });
  it("is deterministic", () => {
    const a = JSON.stringify(search(brandIndex, "re"));
    const b = JSON.stringify(search(brandIndex, "re"));
    expect(a).toBe(b);
  });
  it("respects limit, per-group caps and kind filters", () => {
    const many = searchIndex(brandIndex, "a", { limit: 5 });
    expect(many.length).toBeLessThanOrEqual(5);
    const capped = searchIndex(brandIndex, "e", { perGroup: 2, limit: 100 });
    const perGroup = new Map<string, number>();
    for (const r of capped) perGroup.set(r.entry.group, (perGroup.get(r.entry.group) ?? 0) + 1);
    for (const n of perGroup.values()) expect(n).toBeLessThanOrEqual(2);
    expect(searchIndex(brandIndex, "lumi", { kinds: ["bounty"] }).every((r) => r.entry.kind === "bounty")).toBe(true);
  });
  it("keeps entities out of the empty-query suggestions, but not a recent one", () => {
    const suggested = searchIndex(brandIndex, "");
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.length).toBeLessThanOrEqual(8);
    expect(suggested.every((r) => r.entry.kind === "page" || r.entry.kind === "action")).toBe(true);
    const withRecent = searchIndex(brandIndex, "", { recent: ["bounty:bnty_parlo_spoke"] });
    expect(withRecent[0]?.entry.id).toBe("bounty:bnty_parlo_spoke");
  });
  it("suggests the role's own work first", () => {
    expect(searchIndex(brandIndex, "")[0]?.entry.href?.startsWith("/brand")).toBe(true);
    expect(searchIndex(creatorIndex, "")[0]?.entry.href?.startsWith("/creator")).toBe(true);
  });
});

describe("groupResults", () => {
  it("returns one Suggested group for an empty query", () => {
    const groups = search(creatorIndex, "");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.heading).toBe("Suggested");
  });
  it("orders groups by their best result", () => {
    const groups = search(brandIndex, "edit with me");
    expect(groups[0]?.heading).toBe("Bounties");
  });
  it("uses known headings and returns nothing for no results", () => {
    for (const g of search(brandIndex, "lumi")) expect((GROUP_ORDER as readonly string[]).includes(g.heading), g.heading).toBe(true);
    expect(groupResults([], "x")).toEqual([]);
  });
});

describe("recents", () => {
  it("puts the newest first, dedupes and caps", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a"], "z", 2)).toEqual(["z", "a"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
  it("reads a stored list defensively", () => {
    expect(parseRecents('["a","b","a"]')).toEqual(["a", "b"]);
    expect(parseRecents('{"a":1}')).toEqual([]);
    expect(parseRecents("not json")).toEqual([]);
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents(JSON.stringify([1, "ok", { x: 1 }, "x".repeat(300)]))).toEqual(["ok"]);
    expect(parseRecents(JSON.stringify(Array.from({ length: 20 }, (_, i) => `id${i}`)))).toHaveLength(8);
  });
});

describe("the CommandPalette adapter", () => {
  it("maps entries to command items with icons, links and actions", () => {
    const onAction = vi.fn();
    const onSelect = vi.fn();
    const groups = toCommandGroups(search(creatorIndex, "theme"), { onAction, onSelect });
    const item = groups.flatMap((g) => g.items).find((i) => i.id === "action:toggle-theme");
    expect(item).toBeDefined();
    expect(item?.icon).toBeTruthy();
    expect(item?.href).toBeUndefined();
    item?.onSelect?.();
    expect(onAction).toHaveBeenCalledWith("toggle-theme", expect.objectContaining({ id: "action:toggle-theme" }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    const link = toCommandGroups(search(creatorIndex, "wallet")).flatMap((g) => g.items).find((i) => i.id === "page:/creator/wallet");
    expect(link?.href).toBe("/creator/wallet");
    expect(link?.shortcut).toEqual(["g", "w"]);
  });
  it("makes duplicate labels unique, because the palette selects by label", () => {
    const index = buildSearchIndex({
      role: "brand_member",
      includeActions: false,
      bounties: [
        { id: "bnty_a", title: "Wallet", status: "live", app_name: "Lumi" },
        { id: "bnty_b", title: "Wallet", status: "ended", app_name: "Parlo" },
      ],
    });
    const items = toCommandGroups(search(index, "wallet")).flatMap((g) => g.items);
    const labels = items.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("has an icon for every icon name", () => {
    for (const [name, icon] of Object.entries(SEARCH_ICONS)) expect(icon, name).toBeTruthy();
    const used = new Set<string>([...ROUTE_REGISTRY.map((r) => r.icon), ...allIcons()]);
    for (const name of used) expect(name in SEARCH_ICONS, name).toBe(true);
  });
});

function allIcons(): string[] {
  const out: string[] = [];
  for (const role of [null, "creator", "brand_member", "admin"] as const) for (const a of actionsForRole(role)) out.push(a.icon);
  for (const e of brandIndex.entries) out.push(e.icon);
  return out;
}
