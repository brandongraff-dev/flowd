/**
 * Words and ordinals: "3rd", "2 bounties", "a, b and c". Pure, locale-independent (English only in v1).
 */

import { formatInt } from "@/lib/engine/money";
import { joinList } from "@/lib/engine/text";

/** "a, b and c". Alias of the engine's `joinList`. */
export const formatList = joinList;

/** 1 to "1st", 2 to "2nd", 3 to "3rd", 11 to "11th", 112 to "112th", 21 to "21st". Rounds to a whole number; negatives keep the sign. */
export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return "0th";
  const value = Math.round(n);
  const abs = Math.abs(value);
  const lastTwo = abs % 100;
  let suffix = "th";
  if (lastTwo < 11 || lastTwo > 13) {
    const last = abs % 10;
    if (last === 1) suffix = "st";
    else if (last === 2) suffix = "nd";
    else if (last === 3) suffix = "rd";
  }
  return `${value < 0 ? "-" : ""}${abs}${suffix}`;
}

const IRREGULAR: Readonly<Record<string, string>> = {
  person: "people",
  child: "children",
  man: "men",
  woman: "women",
  life: "lives",
  half: "halves",
};

/** The plural of an English noun for the words this product uses (bounty, submission, creator, match, day, person). Keeps case of the first letter. */
export function pluralOf(singular: string): string {
  const word = singular.trim();
  if (word === "") return word;
  const lower = word.toLowerCase();
  const irregular = IRREGULAR[lower];
  if (irregular) return /^[A-Z]/.test(word) ? `${irregular.charAt(0).toUpperCase()}${irregular.slice(1)}` : irregular;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Just the right word for a count: `pluralWord(1, "bounty")` is "bounty", `pluralWord(3, "bounty")` is "bounties". */
export function pluralWord(count: number, singular: string, plural: string = pluralOf(singular)): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/**
 * Count and word together: `pluralise(1, "bounty")` is "1 bounty", `pluralise(1204, "view")` is "1,204 views",
 * `pluralise(0, "submission")` is "0 submissions". Pass `plural` for irregular nouns.
 */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${formatInt(count)} ${pluralWord(count, singular, plural)}`;
}

/** "4th of 30", or "4th" when there is no field size. Leaderboards and cohorts. */
export function formatRank(rank: number, total?: number): string {
  return total === undefined ? ordinal(rank) : `${ordinal(rank)} of ${formatInt(total)}`;
}

/** "a", "an" before a word: `withArticle("hour")` is "an hour", `withArticle("bounty")` is "a bounty". A heuristic for the nouns this product uses. */
export function withArticle(word: string): string {
  const w = word.trim();
  if (w === "") return w;
  const vowelSound = /^(?:[aeiou]|hour|honest|heir)/i.test(w) && !/^(?:uni|use|user|euro|one)/i.test(w);
  return `${vowelSound ? "an" : "a"} ${w}`;
}
