/**
 * Palette ranking: a small, deterministic scorer with no dependencies. Every query word must match the entry somewhere (label, keywords,
 * hint, or the path), so "wallet cash" finds Cash out and "rev que" finds Review queue. Each word scores by where and how it matches;
 * the entry's static boost breaks ties, and recently used entries get a bump.
 *
 * Word scores: label equal 100, label starts with 90, starts a label word 75, inside a label 55, keyword equal 65, keyword starts 50,
 * hint word start 35, hint contains 25, path segment 20, letters in order inside the label (3 or more letters) 15 to 30.
 */

import type { MatchRange, SearchEntry, SearchResult } from "./types";

/** Lower-case, accents folded, curly quotes straightened, punctuation (except # @ and apostrophes inside words) to spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9#@'$%.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Query words, normalized. */
export const tokenizeQuery = (query: string): string[] => normalize(query).split(" ").filter(Boolean);

const wordsOf = (text: string): string[] => normalize(text).split(/[\s/_.-]+/).filter(Boolean);

interface WordScore {
  score: number;
  /** Where in the (normalized) label the word matched, when it matched there. */
  range?: MatchRange;
}

/** Score of one query word against an entry. 0 means no match. */
function scoreWord(word: string, labelNorm: string, labelWords: readonly string[], hintNorm: string, keywordNorms: readonly string[], pathWords: readonly string[]): WordScore {
  // label
  if (labelNorm === word) return { score: 100, range: { start: 0, end: labelNorm.length } };
  if (labelNorm.startsWith(word)) return { score: 90, range: { start: 0, end: word.length } };
  let offset = 0;
  for (const w of labelWords) {
    const at = labelNorm.indexOf(w, offset);
    if (w.startsWith(word)) return { score: 75, range: { start: at, end: at + word.length } };
    offset = at + w.length;
  }
  const inside = labelNorm.indexOf(word);
  if (inside !== -1 && word.length >= 2) return { score: 55, range: { start: inside, end: inside + word.length } };
  // keywords
  let best = 0;
  for (const k of keywordNorms) {
    if (k === word) best = Math.max(best, 65);
    else if (k.startsWith(word)) best = Math.max(best, 50);
    else if (k.split(" ").some((kw) => kw.startsWith(word))) best = Math.max(best, 45);
  }
  if (best > 0) return { score: best };
  // hint
  if (hintNorm) {
    if (hintNorm.split(" ").some((hw) => hw.startsWith(word))) return { score: 35 };
    if (word.length >= 3 && hintNorm.includes(word)) return { score: 25 };
  }
  // path
  if (pathWords.some((p) => p.startsWith(word))) return { score: 20 };
  // letters in order inside the label ("rvq" is not a match, "rvw" is "review")
  if (word.length >= 3) {
    const sub = subsequence(word, labelNorm);
    if (sub) return { score: 15 + Math.round(15 * sub.density), range: sub.range };
  }
  return { score: 0 };
}

function subsequence(word: string, text: string): { density: number; range: MatchRange } | null {
  let from = 0;
  let first = -1;
  let last = -1;
  for (const ch of word) {
    const at = text.indexOf(ch, from);
    if (at === -1) return null;
    if (first === -1) first = at;
    last = at;
    from = at + 1;
  }
  const span = last - first + 1;
  // Reject scattered matches: the letters must sit in a window at most twice the word's length.
  if (span > word.length * 2) return null;
  return { density: word.length / span, range: { start: first, end: last + 1 } };
}

/** Merges overlapping or touching ranges, sorted. */
export function mergeRanges(ranges: readonly MatchRange[]): MatchRange[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: MatchRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Maps ranges found in the normalized label back onto the display label (normalization only removes or folds characters 1 to 1 for ASCII labels). */
function toDisplayRanges(label: string, labelNorm: string, ranges: readonly MatchRange[]): MatchRange[] {
  if (label.length === labelNorm.length && normalize(label) === labelNorm) return mergeRanges(ranges);
  // The label contained characters normalize() dropped or changed: map by walking both strings.
  const lowered = label.toLowerCase();
  return mergeRanges(
    ranges.map((r) => {
      const text = labelNorm.slice(r.start, r.end);
      const at = lowered.indexOf(text);
      return at === -1 ? { start: 0, end: 0 } : { start: at, end: at + text.length };
    }),
  );
}

export interface ScoreOptions {
  /** Entry ids used recently, most recent first. */
  recent?: readonly string[];
}

/**
 * Scores one entry for the query words. Returns null when any word fails to match (the entry is not a result). An empty query scores
 * every entry by its boost alone, so the palette can show a useful default list.
 */
export function scoreEntry(entry: SearchEntry, words: readonly string[], options: ScoreOptions = {}): SearchResult | null {
  const recentIdx = options.recent?.indexOf(entry.id) ?? -1;
  const recentBonus = recentIdx === -1 ? 0 : Math.max(2, 12 - recentIdx);
  const boost = entry.boost * 1.5 + recentBonus;
  if (words.length === 0) return { entry, score: boost, matches: [] };

  const labelNorm = normalize(entry.label);
  const labelWords = labelNorm.split(" ").filter(Boolean);
  const hintNorm = entry.hint ? normalize(entry.hint) : "";
  const keywordNorms = entry.keywords.map(normalize).filter(Boolean);
  const pathWords = entry.href ? wordsOf(entry.href) : [];

  let total = 0;
  const ranges: MatchRange[] = [];
  for (const word of words) {
    const r = scoreWord(word, labelNorm, labelWords, hintNorm, keywordNorms, pathWords);
    if (r.score === 0) return null;
    total += r.score;
    if (r.range) ranges.push(r.range);
  }
  let score = total / words.length;
  // The whole query as one phrase at the start of the label is the best possible hit.
  const phrase = words.join(" ");
  if (words.length > 1 && labelNorm.startsWith(phrase)) score += 20;
  else if (words.length > 1 && labelNorm.includes(phrase)) score += 10;
  return { entry, score: score + boost, matches: toDisplayRanges(entry.label, labelNorm, ranges) };
}

/** Sorts results best first; ties fall to the label, then the id, so the order is the same on every run. */
export function compareResults(a: SearchResult, b: SearchResult): number {
  return b.score - a.score || a.entry.label.localeCompare(b.entry.label) || a.entry.id.localeCompare(b.entry.id);
}
