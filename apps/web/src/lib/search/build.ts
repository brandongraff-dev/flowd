/**
 * Builds the command-palette index from what the caller already has in memory (store rows, fixtures, query results). Pure: no
 * hooks, no data access of its own. Pages come from the route registry, actions from the action catalogue, and every entity link is
 * rewritten for the person's role, so a creator's "Edit with me" opens `/creator/bounties/<id>` and a brand's opens `/brand/bounties/<id>`.
 */

import type { Role } from "@/lib/contract/types";
import { humanize } from "@/lib/format/text";
import { formatCpm } from "@/lib/format/money";
import { actionsForRole } from "./actions";
import { compareResults, scoreEntry, tokenizeQuery } from "./rank";
import { routesForRole } from "./routes";
import type {
  SearchEntry,
  SearchGroup,
  SearchIndex,
  SearchIndexInput,
  SearchKind,
  SearchResult,
  SearchableApp,
  SearchableBounty,
  SearchableBrand,
  SearchableCreator,
  SearchableLesson,
  SearchablePost,
  SearchableSubmission,
} from "./types";

/** Group headings, in the order the palette shows them. */
export const GROUP_ORDER = ["Suggested", "Go to", "Actions", "Bounties", "Creators", "Brands", "Apps", "Submissions", "Posts", "Academy"] as const;

/** Where an entity opens for a role. Returns null when that role has no page for it (it is then left out of the index). */
export function entityHref(kind: SearchKind, role: Role | null, id: string, extra?: { handle?: string }): string | null {
  const enc = encodeURIComponent;
  switch (kind) {
    case "bounty":
      if (role === "brand_member") return `/brand/bounties/${enc(id)}`;
      if (role === "creator") return `/creator/bounties/${enc(id)}`;
      if (role === "admin") return `/admin/bounties?q=${enc(id)}`;
      return `/b/${enc(id)}`;
    case "creator": {
      const handle = extra?.handle ?? id;
      if (role === "brand_member") return `/brand/creators/${enc(handle)}`;
      if (role === "admin") return `/admin/creators?q=${enc(handle)}`;
      if (role === "creator") return `/c/${enc(handle)}`;
      return `/c/${enc(handle)}`;
    }
    case "brand":
      if (role === "creator") return `/creator/brands/${enc(id)}`;
      if (role === "admin") return `/admin/brands?q=${enc(id)}`;
      return `/scorecard/${enc(id)}`;
    case "app":
      return role === "brand_member" ? `/brand/apps/${enc(id)}` : null;
    case "submission":
      if (role === "brand_member") return `/brand/review/${enc(id)}`;
      if (role === "creator") return `/creator/submissions/${enc(id)}`;
      return null;
    case "post":
      return role === "creator" ? `/creator/posts/${enc(id)}` : null;
    case "lesson":
      return role === "creator" ? `/creator/academy/${enc(id)}` : null;
    default:
      return null;
  }
}

const TIER_LABEL: Readonly<Record<string, string>> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", elite: "Elite" };

const dot = (parts: readonly (string | undefined | false)[]): string => parts.filter(Boolean).join(" · ");

function bountyEntry(b: SearchableBounty, role: Role | null): SearchEntry | null {
  const href = entityHref("bounty", role, b.id);
  if (!href) return null;
  return {
    id: `bounty:${b.id}`,
    kind: "bounty",
    group: "Bounties",
    label: b.title,
    hint: dot([humanize(b.status), b.cpm_cents ? formatCpm(b.cpm_cents, "short") : undefined, b.app_name ?? b.brand_name]),
    href,
    icon: "target",
    keywords: [b.id, b.app_name ?? "", b.brand_name ?? "", b.category ? humanize(b.category) : "", b.funded ? "funded" : ""].filter(Boolean),
    boost: b.status === "live" ? 5 : 2,
  };
}

function creatorEntry(c: SearchableCreator, role: Role | null): SearchEntry | null {
  const href = entityHref("creator", role, c.handle, { handle: c.handle });
  if (!href) return null;
  return {
    id: `creator:${c.handle}`,
    kind: "creator",
    group: "Creators",
    label: c.display_name,
    hint: dot([`@${c.handle}`, c.tier ? (TIER_LABEL[c.tier] ?? humanize(c.tier)) : undefined]),
    href,
    icon: "user",
    keywords: [c.handle, `@${c.handle}`, ...(c.niches ?? []).map(humanize)],
    boost: 3,
  };
}

function brandEntry(b: SearchableBrand, role: Role | null): SearchEntry | null {
  const href = entityHref("brand", role, b.id);
  if (!href) return null;
  return { id: `brand:${b.id}`, kind: "brand", group: "Brands", label: b.name, hint: role === "creator" ? "Brand Scorecard" : "Scorecard", href, icon: "building", keywords: [b.id, "scorecard", "reliability"], boost: 3 };
}

function appEntry(a: SearchableApp, role: Role | null): SearchEntry | null {
  const href = entityHref("app", role, a.id);
  if (!href) return null;
  return { id: `app:${a.id}`, kind: "app", group: "Apps", label: a.name, hint: a.category ? humanize(a.category) : "App", href, icon: "phone", keywords: [a.id, "app"], boost: 3 };
}

function submissionEntry(s: SearchableSubmission, role: Role | null): SearchEntry | null {
  const href = entityHref("submission", role, s.id);
  if (!href) return null;
  return {
    id: `submission:${s.id}`,
    kind: "submission",
    group: "Submissions",
    label: s.title,
    hint: dot([humanize(s.status), s.creator_handle ? `@${s.creator_handle}` : undefined, s.bounty_title]),
    href,
    icon: "review",
    keywords: [s.id, s.creator_handle ?? "", s.bounty_title ?? ""].filter(Boolean),
    boost: s.status === "in_review" ? 4 : 2,
  };
}

function postEntry(p: SearchablePost, role: Role | null): SearchEntry | null {
  const href = entityHref("post", role, p.id);
  if (!href) return null;
  return { id: `post:${p.id}`, kind: "post", group: "Posts", label: p.title ?? p.bounty_title ?? p.id, hint: dot([humanize(p.status), p.bounty_title]), href, icon: "video", keywords: [p.id, p.bounty_title ?? ""].filter(Boolean), boost: 2 };
}

function lessonEntry(l: SearchableLesson, role: Role | null): SearchEntry | null {
  const href = entityHref("lesson", role, l.slug);
  if (!href) return null;
  return { id: `lesson:${l.slug}`, kind: "lesson", group: "Academy", label: l.title, hint: l.minutes ? `${l.minutes} min lesson` : "Lesson", href, icon: "graduation", keywords: ["academy", "learn", "lesson", l.slug], boost: 2 };
}

/**
 * The palette index for a role: its pages (public pages included), its actions, and every entity passed in. Entities the role has no
 * page for are skipped (a creator cannot open a brand's review queue). Ids are unique; the first entry with an id wins.
 */
export function buildSearchIndex(input: SearchIndexInput): SearchIndex {
  const { role, includeActions = true } = input;
  const entries: SearchEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: SearchEntry | null): void => {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  };

  for (const r of routesForRole(role)) {
    // A signed-in person does not need "Sign in" or the signup pages in the palette.
    if (role && r.href.startsWith("/signup")) continue;
    if (role && r.href === "/login") continue;
    push({ id: `page:${r.href}`, kind: "page", group: "Go to", label: r.label, hint: r.section, href: r.href, icon: r.icon, keywords: r.keywords, shortcut: r.shortcut, boost: (r.boost ?? 4) + (role !== null && r.access === role ? 2 : 0) });
  }
  if (includeActions) for (const a of actionsForRole(role)) push(a);

  for (const b of input.bounties ?? []) push(bountyEntry(b, role));
  for (const c of input.creators ?? []) push(creatorEntry(c, role));
  for (const b of input.brands ?? []) push(brandEntry(b, role));
  for (const a of input.apps ?? []) push(appEntry(a, role));
  for (const s of input.submissions ?? []) push(submissionEntry(s, role));
  for (const p of input.posts ?? []) push(postEntry(p, role));
  for (const l of input.lessons ?? []) push(lessonEntry(l, role));

  return { role, entries };
}

export interface SearchOptions {
  /** Most results to return (default 30). */
  limit?: number;
  /** At most this many per group (default 8; the empty query uses 6 suggested entries). */
  perGroup?: number;
  /** Restrict to these kinds. */
  kinds?: readonly SearchKind[];
  /** Entry ids used recently, most recent first. */
  recent?: readonly string[];
}

/** Ranks the index for a query. An empty query returns the best-weighted pages and actions (the "Suggested" list). */
export function searchIndex(index: SearchIndex, query: string, options: SearchOptions = {}): SearchResult[] {
  const { limit = 30, perGroup = 8, kinds, recent } = options;
  const words = tokenizeQuery(query);
  const scored: SearchResult[] = [];
  for (const entry of index.entries) {
    if (kinds && !kinds.includes(entry.kind)) continue;
    // With no query, entities (hundreds of bounties) stay out of the default list: it is for pages, actions and what was used lately.
    if (words.length === 0 && entry.kind !== "page" && entry.kind !== "action" && !(recent && recent.includes(entry.id))) continue;
    const result = scoreEntry(entry, words, { recent });
    if (result) scored.push(result);
  }
  scored.sort(compareResults);

  if (words.length === 0) return scored.slice(0, Math.min(limit, 8));

  const counts = new Map<string, number>();
  const out: SearchResult[] = [];
  for (const r of scored) {
    const n = counts.get(r.entry.group) ?? 0;
    if (n >= perGroup) continue;
    counts.set(r.entry.group, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Groups ranked results under headings. With no query the results are one "Suggested" group; with a query, groups follow
 * `GROUP_ORDER` but a group is placed by its best result, so a strong bounty hit does not sit under a weak page hit.
 */
export function groupResults(results: readonly SearchResult[], query = ""): SearchGroup[] {
  if (results.length === 0) return [];
  if (tokenizeQuery(query).length === 0) return [{ heading: "Suggested", results }];
  const byGroup = new Map<string, SearchResult[]>();
  for (const r of results) {
    const list = byGroup.get(r.entry.group) ?? [];
    list.push(r);
    byGroup.set(r.entry.group, list);
  }
  const rank = (heading: string): number => {
    const i = (GROUP_ORDER as readonly string[]).indexOf(heading);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return [...byGroup.entries()]
    .map(([heading, list]) => ({ heading, results: list, best: Math.max(...list.map((r) => r.score)) }))
    .sort((a, b) => b.best - a.best || rank(a.heading) - rank(b.heading))
    .map(({ heading, results: list }) => ({ heading, results: list }));
}

/** One call for the common case: rank and group. */
export function search(index: SearchIndex, query: string, options?: SearchOptions): SearchGroup[] {
  return groupResults(searchIndex(index, query, options), query);
}

/** Wraps the matched ranges of a label in `[` `]` (plain text, for tests and aria-labels). */
export function highlightPlain(label: string, matches: readonly { start: number; end: number }[]): string {
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    out += `${label.slice(cursor, m.start)}[${label.slice(m.start, m.end)}]`;
    cursor = m.end;
  }
  return out + label.slice(cursor);
}

/** The segments of a label for rendering a highlight: `[{ text, match }]`. */
export function highlightSegments(label: string, matches: readonly { start: number; end: number }[]): { text: string; match: boolean }[] {
  const out: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) out.push({ text: label.slice(cursor, m.start), match: false });
    out.push({ text: label.slice(m.start, m.end), match: true });
    cursor = m.end;
  }
  if (cursor < label.length) out.push({ text: label.slice(cursor), match: false });
  return out.length > 0 ? out : [{ text: label, match: false }];
}
