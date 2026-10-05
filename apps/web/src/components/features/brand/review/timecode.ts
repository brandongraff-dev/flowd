/** Timecodes for the review player and its notes. Pure, so server components and tests can use them. */

/** 18000 -> "0:18", 65500 -> "1:05". Whole seconds, for lists and flags. */
export function tc(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 7300 -> "0:07.3". One decimal, for the player clock and for frame-accurate notes. */
export function tcPrecise(ms: number): string {
  const clamped = Math.max(0, ms);
  const tenths = Math.floor(clamped / 100) % 10;
  return `${tc(clamped)}.${tenths}`;
}

/** "0:18", "18", "1:05.5" or "00:18" to milliseconds, or null when it is not a time. */
export function parseTimecode(text: string): number | null {
  const match = /^\s*(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(text);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (seconds > 59 && match[1]) return null;
  const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
  return Math.round((minutes * 60 + seconds + fraction) * 1000);
}

/** 18000 -> "00:18": the form evidence refs are stored in (it matches the QA checks' own timecodes). */
export function tcPadded(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A span: "0:12 to 0:15". */
export function tcRange(startMs: number, endMs?: number): string {
  return endMs !== undefined && endMs > startMs ? `${tc(startMs)} to ${tc(endMs)}` : tc(startMs);
}
