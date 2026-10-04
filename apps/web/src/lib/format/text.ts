/**
 * Truncation and small text helpers for cards, tables, toasts and metadata. Pure.
 *
 * Truncate in CSS (`truncate`, `line-clamp-2`) when the container decides the width. Use these when the length is a fact about the
 * string itself: a meta description, a push body, a tooltip, an id in the middle of a sentence, a copied code.
 */

export const ELLIPSIS = "…";

export interface TruncateOptions {
  /** Appended when text is cut. Default "…". Its length counts toward `max`. */
  ellipsis?: string;
  /** Cut at the last word boundary when one exists in the last 40% of the text. Default true. */
  wordSafe?: boolean;
}

/** Collapses runs of whitespace (including newlines) to single spaces and trims. */
export const compactWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Cuts text to at most `max` characters including the ellipsis, on a word boundary when it can: `truncate("Money follows what works.", 14)`
 * gives "Money follows…". Surrogate pairs are never split. Text that fits is returned unchanged.
 */
export function truncate(text: string, max: number, options: TruncateOptions = {}): string {
  const { ellipsis = ELLIPSIS, wordSafe = true } = options;
  const chars = Array.from(text);
  if (max <= 0) return "";
  if (chars.length <= max) return text;
  const room = Math.max(0, max - Array.from(ellipsis).length);
  let cut = chars.slice(0, room).join("");
  if (wordSafe) {
    const boundary = cut.search(/\s\S*$/);
    if (boundary > room * 0.6) cut = cut.slice(0, boundary);
  }
  return `${cut.replace(/[\s.,;:!?-]+$/, "")}${ellipsis}`;
}

/** The first `count` words, with an ellipsis when something was cut. */
export function truncateWords(text: string, count: number, ellipsis: string = ELLIPSIS): string {
  const words = compactWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= count) return words.join(" ");
  return `${words.slice(0, Math.max(0, count)).join(" ").replace(/[.,;:!?-]+$/, "")}${ellipsis}`;
}

/**
 * Keeps both ends of a long identifier: `truncateMiddle("joinflowd.io/p/proof_8f3a91c2d4e5", 20)` gives "joinflowd.io…2d4e5".
 * For ids, URLs and hashes, where the tail is the part people compare.
 */
export function truncateMiddle(text: string, max: number, ellipsis: string = ELLIPSIS): string {
  const chars = Array.from(text);
  if (chars.length <= max || max <= 0) return max <= 0 ? "" : text;
  const room = Math.max(2, max - Array.from(ellipsis).length);
  const head = Math.ceil(room * 0.6);
  const tail = room - head;
  return `${chars.slice(0, head).join("")}${ellipsis}${tail > 0 ? chars.slice(-tail).join("") : ""}`;
}

/**
 * A short plain-text excerpt for search results and previews: whitespace compacted, markdown-ish marks and hashtags kept, cut on a word.
 * Centres on the first match of `query` when it is not near the start, so a hit is visible.
 */
export function excerpt(text: string, max: number, query?: string): string {
  const flat = compactWhitespace(text);
  if (flat.length <= max) return flat;
  const q = query?.trim().toLowerCase();
  const at = q ? flat.toLowerCase().indexOf(q) : -1;
  if (at <= max * 0.4) return truncate(flat, max);
  const start = Math.max(0, at - Math.floor(max * 0.3));
  const wordStart = flat.indexOf(" ", start);
  const from = wordStart === -1 || wordStart > at ? start : wordStart + 1;
  return `${ELLIPSIS}${truncate(flat.slice(from), max - 1)}`;
}

/** "Maya Reyes" gives "MR"; "maya.makes" gives "MM"; one word gives its first two letters. Used by the generated avatars. */
export function initials(name: string, max = 2): string {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return Array.from(parts[0] ?? "").slice(0, max).join("").toUpperCase();
  return parts
    .slice(0, max)
    .map((p) => Array.from(p)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** "maya.makes" and "@maya.makes" both give "@maya.makes". */
export const formatHandle = (handle: string): string => `@${handle.trim().replace(/^@+/, "")}`;

/** A URL without its scheme, "www." and trailing slash: "https://joinflowd.io/c/maya.makes/" gives "joinflowd.io/c/maya.makes". */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** The tail of an id for tight spaces: `shortId("sub_0634")` is "0634"; `shortId("proof_8f3a91c2d4e5")` is "c2d4e5". */
export function shortId(id: string, length = 6): string {
  const body = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
  return body.length <= length ? body : body.slice(-length);
}

/** "reason_required" gives "Reason required"; "window_closed" gives "Window closed". Sentence case, per the UI voice. */
export function humanize(code: string): string {
  const spaced = code.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
