/**
 * UTC time helpers shared by every engine module. Pure, dependency-free, deterministic.
 *
 * Every timestamp in flowd is ISO-8601 UTC with second precision and a trailing Z ("2026-10-03T14:00:00Z");
 * calendar days are "YYYY-MM-DD"; ISO weeks are "2026-W40" (Monday to Sunday, UTC).
 * Nothing here reads the system clock: callers always pass `now` in.
 */

import type { IsoDate, IsoTimestamp } from "@/lib/contract/types";

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ms since epoch to "YYYY-MM-DDTHH:MM:SSZ" (second precision, UTC). */
export function iso(epochMs: number): IsoTimestamp {
  const d = new Date(Math.floor(epochMs / 1000) * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
}

/** "YYYY-MM-DDTHH:MM:SSZ" or "YYYY-MM-DD" to ms since epoch. Throws on an unparseable value so bad data fails loudly. */
export function toMs(isoOrDate: string): number {
  const t = Date.parse(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${isoOrDate}`);
  return t;
}

export const addHours = (isoStr: IsoTimestamp, hours: number): IsoTimestamp => iso(toMs(isoStr) + hours * HOUR_MS);
export const addDays = (isoStr: IsoTimestamp, days: number): IsoTimestamp => iso(toMs(isoStr) + days * DAY_MS);
export const addMinutes = (isoStr: IsoTimestamp, minutes: number): IsoTimestamp => iso(toMs(isoStr) + minutes * MINUTE_MS);

/**
 * Adds calendar months in UTC, clamping the day to the end of the target month (Jan 31 + 1 month = Feb 28 or 29).
 * Used for "12 months" style terms (founding perks, brand partner shares).
 */
export function addMonths(isoStr: IsoTimestamp, months: number): IsoTimestamp {
  const d = new Date(toMs(isoStr));
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return iso(Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

/** Calendar date "YYYY-MM-DD" (UTC) of a timestamp. */
export const dateOf = (isoStr: IsoTimestamp): IsoDate => isoStr.slice(0, 10);
/** Start of the UTC day containing the timestamp. */
export const dayStart = (isoStr: IsoTimestamp): IsoTimestamp => `${dateOf(isoStr)}T00:00:00Z`;
export const hoursBetween = (fromIso: IsoTimestamp, toIso: IsoTimestamp): number => (toMs(toIso) - toMs(fromIso)) / HOUR_MS;
export const daysBetween = (fromIso: IsoTimestamp, toIso: IsoTimestamp): number => (toMs(toIso) - toMs(fromIso)) / DAY_MS;
export const addDaysToDate = (dateStr: IsoDate, days: number): IsoDate => dateOf(iso(toMs(dateStr) + days * DAY_MS));

/** Inclusive list of "YYYY-MM-DD" dates from a to b (empty when b is before a). */
export function dateRange(fromDate: IsoDate, toDate: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let t = toMs(fromDate); t <= toMs(toDate); t += DAY_MS) out.push(dateOf(iso(t)));
  return out;
}

/** UTC weekday: 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (isoStr: IsoTimestamp): number => new Date(toMs(isoStr)).getUTCDay();

/** ISO week label "2026-W40" of a timestamp (Monday-based weeks, UTC). */
export function isoWeek(isoStr: IsoTimestamp): string {
  const d = new Date(toMs(isoStr));
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7; // Mon=1..Sun=7
  const thursday = t + (4 - day) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday - jan1) / DAY_MS + 1) / 7);
  return `${year}-W${pad2(week)}`;
}

/** Monday 00:00:00Z of the ISO week containing the timestamp. */
export function isoWeekStart(isoStr: IsoTimestamp): IsoTimestamp {
  const d = new Date(toMs(isoStr));
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7;
  return iso(t - (day - 1) * DAY_MS);
}

/** Monday 00:00:00Z of the NEXT ISO week (the leaderboard reset). */
export const nextWeekStart = (isoStr: IsoTimestamp): IsoTimestamp => addDays(isoWeekStart(isoStr), 7);
/** Sunday 23:59:59Z of the ISO week containing the timestamp. */
export const isoWeekEnd = (isoStr: IsoTimestamp): IsoTimestamp => iso(toMs(nextWeekStart(isoStr)) - 1000);

/** Monday 00:00:00Z of an ISO week label ("2026-W40"). Throws on a malformed label. */
export function isoWeekToStart(label: string): IsoTimestamp {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) throw new Error(`Bad ISO week: ${label}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4th is always in week 1.
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (jan4Day - 1) * DAY_MS;
  return iso(week1Monday + (week - 1) * 7 * DAY_MS);
}

/** The ISO week label n weeks after (or before, when negative) the given label. */
export const isoWeekAdd = (label: string, weeks: number): string => isoWeek(addDays(isoWeekToStart(label), weeks * 7));

/** First time strictly after `afterIso` that is HH:00:00Z on any day. */
export function nextDailyAt(afterIso: IsoTimestamp, hourUtc: number): IsoTimestamp {
  const base = toMs(dayStart(afterIso)) + hourUtc * HOUR_MS;
  return iso(base > toMs(afterIso) ? base : base + DAY_MS);
}

/** First time strictly after `afterIso` that is `weekday` (0 = Sun .. 6 = Sat) at HH:00:00Z. */
export function nextWeeklyAt(afterIso: IsoTimestamp, weekday: number, hourUtc: number): IsoTimestamp {
  let t = toMs(nextDailyAt(afterIso, hourUtc));
  while (new Date(t).getUTCDay() !== weekday) t += DAY_MS;
  return iso(t);
}

/** Most recent time at or before `atOrBeforeIso` that is `weekday` at HH:00:00Z. */
export function prevWeeklyAt(atOrBeforeIso: IsoTimestamp, weekday: number, hourUtc: number): IsoTimestamp {
  let t = toMs(dayStart(atOrBeforeIso)) + hourUtc * HOUR_MS;
  if (t > toMs(atOrBeforeIso)) t -= DAY_MS;
  while (new Date(t).getUTCDay() !== weekday) t -= DAY_MS;
  return iso(t);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2:00 PM" style time in UTC. */
export function timeLabel(isoStr: IsoTimestamp): string {
  const d = new Date(toMs(isoStr));
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "Sat 2:00 PM" style label in UTC for Money Clock copy ("clears Sat 2:00 PM"). */
export function clockLabel(isoStr: IsoTimestamp): string {
  return `${WEEKDAYS[weekdayOf(isoStr)]} ${timeLabel(isoStr)}`;
}

/** "Oct 9" style day label in UTC. */
export function dayLabel(isoStr: IsoTimestamp): string {
  const d = new Date(toMs(isoStr));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Fri Oct 9, 6:00 PM UTC": the fully dated form used where the clock label could be ambiguous. */
export function datedClockLabel(isoStr: IsoTimestamp): string {
  return `${WEEKDAYS[weekdayOf(isoStr)]} ${dayLabel(isoStr)}, ${timeLabel(isoStr)} UTC`;
}

/**
 * Plain-English distance between two instants, e.g. "in 2 hours", "in 3 days", "5 hours ago".
 * Minutes under an hour, whole hours (rounded) under 48 hours, whole days above.
 */
export function relativeLabel(targetIso: IsoTimestamp, nowIso: IsoTimestamp): string {
  const diffMs = toMs(targetIso) - toMs(nowIso);
  const abs = Math.abs(diffMs);
  let text: string;
  if (abs < 90 * SECOND_MS) text = "a moment";
  else if (abs < 60 * MINUTE_MS) text = `${Math.max(2, Math.round(abs / MINUTE_MS))} minutes`;
  else if (abs < 48 * HOUR_MS) {
    const h = Math.max(1, Math.round(abs / HOUR_MS));
    text = `${h} hour${h === 1 ? "" : "s"}`;
  } else {
    const d = Math.round(abs / DAY_MS);
    text = `${d} days`;
  }
  if (text === "a moment") return diffMs >= 0 ? "in a moment" : "a moment ago";
  return diffMs >= 0 ? `in ${text}` : `${text} ago`;
}
