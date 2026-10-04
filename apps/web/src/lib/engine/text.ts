/**
 * Text helpers used by hook scoring, auto-QA, brief lint and the audit generator. Pure and locale-independent.
 */

/** Lower-cases, turns curly quotes and dashes into plain ones and collapses whitespace. Keeps # and digits. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word tokens: letters, digits, apostrophes inside words, and a leading # for hashtags. */
export function tokenize(text: string): string[] {
  const matches = normalizeText(text).match(/#?[a-z0-9]+(?:'[a-z0-9]+)*/g);
  return matches ?? [];
}

/** Number of words in a string. */
export const wordCount = (text: string): number => tokenize(text).length;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "is", "are", "was", "were", "be", "it",
  "this", "that", "these", "those", "so", "just", "really", "very", "i", "you", "my", "your", "me", "we", "our", "as", "by",
]);

/** Tokens without common function words; used to compare what is said with what is shown. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

/** Jaccard similarity of two token sets, 0..1. Two empty sets are 0 (nothing to compare). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/** Share of `needle` tokens that appear in `haystack`, 0..1. Order-insensitive. */
export function containment(needle: readonly string[], haystack: readonly string[]): number {
  if (needle.length === 0) return 0;
  const hs = new Set(haystack);
  let hit = 0;
  for (const t of needle) if (hs.has(t)) hit += 1;
  return hit / needle.length;
}

/**
 * How closely on-screen text mirrors a spoken line, 0..1: the larger of Jaccard and containment of the shorter one's
 * content words in the longer one. A burned-in caption that shortens the spoken line still counts as a mirror.
 */
export function textParity(spoken: string, onscreen: string): number {
  const a = contentTokens(spoken);
  const b = contentTokens(onscreen);
  if (a.length === 0 || b.length === 0) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return Math.max(jaccard(a, b), containment(shorter, longer));
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive whole-phrase search. Returns the first matching phrase and its index, or null. */
export function findPhrase(text: string, phrases: readonly string[]): { phrase: string; index: number } | null {
  const hay = normalizeText(text);
  let best: { phrase: string; index: number } | null = null;
  for (const phrase of phrases) {
    const p = normalizeText(phrase);
    if (!p) continue;
    const re = new RegExp(`(^|[^a-z0-9#])${escapeRegExp(p)}(?![a-z0-9])`);
    const m = re.exec(hay);
    if (m) {
      const index = m.index + m[1].length;
      if (best === null || index < best.index) best = { phrase, index };
    }
  }
  return best;
}

/** Every phrase from the list that occurs in the text (whole-phrase, case-insensitive). */
export function findPhrases(text: string, phrases: readonly string[]): string[] {
  return phrases.filter((p) => findPhrase(text, [p]) !== null);
}

/** "lumi ai photo editor" to "Lumi Ai Photo Editor". Keeps all-caps tokens of 2 to 3 letters (AI, TV) upper-case. */
export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[A-Z]{2,3}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** URL-safe slug: lower-case, a-z0-9 and single hyphens. */
export function slugify(text: string): string {
  return normalizeText(text)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Uppercases the first character. */
export const capitalize = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Joins items as "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The distinct things a call to action can ask for. Several phrasings of the same ask ("link in bio" or "search the App Store") are one. */
export type CtaObjective = "get_the_app" | "follow" | "engage" | "visit_site";

const CTA_PATTERNS: readonly (readonly [CtaObjective, RegExp])[] = [
  ["get_the_app", /\b(?:download|install|get (?:the|it|our|my|this)?\s*(?:app|it)|grab (?:it|the app)|try (?:it|\w+)?\s*(?:free|for free|today|now|out)|start (?:your |a )?(?:free )?trial|claim (?:your|a|the)|sign up|use (?:my |the |our )?code|code [a-z0-9-]{3,}|link in (?:my |the )?bio|tap the link|click the link|search (?:for )?(?:it |the app |\w+ )?(?:in|on) the app store|available on the app store)\b/i],
  ["follow", /\b(?:follow (?:me|us|for)|subscribe to (?:my|our)|hit follow)\b/i],
  ["engage", /\b(?:like (?:this|and|&)|comment (?:below|\w+)|share (?:this|it|with)|tag a friend|save this)\b/i],
  ["visit_site", /\b(?:visit (?:our|my|the)?\s*(?:site|website)|go to [a-z0-9.-]+\.[a-z]{2,}|check out [a-z0-9.-]+\.[a-z]{2,})\b/i],
];

/** The distinct calls to action a line of copy makes. More than one means the CTA is unclear. */
export function callsToAction(text: string): CtaObjective[] {
  return CTA_PATTERNS.filter(([, re]) => re.test(text)).map(([objective]) => objective);
}

/** "0:03" style timecode from milliseconds. */
export function timecode(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "2.4s" style seconds label from milliseconds. */
export const secondsLabel = (ms: number | null | undefined): string => (ms == null ? "never" : `${(ms / 1000).toFixed(1)}s`);
