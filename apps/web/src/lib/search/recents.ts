/** "Recently used" palette entries: a short most-recent-first list of entry ids. The list logic is pure; storage is guarded. */

export const RECENTS_KEY = "flowd-recent-search";
export const MAX_RECENTS = 8;

/** Puts `id` first, removes an earlier copy, keeps at most `max`. Returns a new array. */
export function pushRecent(list: readonly string[], id: string, max: number = MAX_RECENTS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, Math.max(0, max));
}

/** Parses a stored value into a clean id list (strings only, no duplicates, capped). Anything unreadable is an empty list. */
export function parseRecents(raw: string | null | undefined, max: number = MAX_RECENTS): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.length <= 160 && !out.includes(item)) out.push(item);
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseRecents(window.localStorage.getItem(RECENTS_KEY));
  } catch {
    return [];
  }
}

export function writeRecents(list: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    // Blocked or full: recents are a convenience.
  }
}
