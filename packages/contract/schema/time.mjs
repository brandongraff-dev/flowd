// UTC time helpers shared by the formulas, the generators and the validator. Zero dependencies.
// Every timestamp in flowd is ISO-8601 UTC with second precision and a trailing Z: "2026-10-03T14:00:00Z".

export const NOW_ISO = '2026-10-03T14:00:00Z';
export const NOW_MS = Date.parse(NOW_ISO);
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const pad2 = (n) => String(n).padStart(2, '0');

/** ms since epoch -> "YYYY-MM-DDTHH:MM:SSZ" (seconds precision, UTC). */
export function iso(ms) {
  const d = new Date(Math.floor(ms / 1000) * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
}
/** "YYYY-MM-DDTHH:MM:SSZ" | "YYYY-MM-DD" -> ms. */
export function ms(isoOrDate) {
  const t = Date.parse(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${isoOrDate}`);
  return t;
}
export const addHours = (isoStr, h) => iso(ms(isoStr) + h * HOUR_MS);
export const addDays = (isoStr, d) => iso(ms(isoStr) + d * DAY_MS);
export const addMinutes = (isoStr, m) => iso(ms(isoStr) + m * 60_000);
/** Calendar date "YYYY-MM-DD" (UTC) of a timestamp. */
export const dateOf = (isoStr) => isoStr.slice(0, 10);
/** Start of the UTC day containing the timestamp. */
export const dayStart = (isoStr) => `${dateOf(isoStr)}T00:00:00Z`;
export const hoursBetween = (fromIso, toIso) => (ms(toIso) - ms(fromIso)) / HOUR_MS;
export const daysBetween = (fromIso, toIso) => (ms(toIso) - ms(fromIso)) / DAY_MS;
export const addDaysToDate = (dateStr, d) => dateOf(iso(ms(dateStr) + d * DAY_MS));
/** Inclusive list of "YYYY-MM-DD" dates from a to b. */
export function dateRange(fromDate, toDate) {
  const out = [];
  for (let t = ms(fromDate); t <= ms(toDate); t += DAY_MS) out.push(dateOf(iso(t)));
  return out;
}

/** UTC weekday: 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (isoStr) => new Date(ms(isoStr)).getUTCDay();

/** ISO week label "2026-W40" of a timestamp (Monday-based weeks, UTC). */
export function isoWeek(isoStr) {
  const d = new Date(ms(isoStr));
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7; // Mon=1..Sun=7
  const thursday = t + (4 - day) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday - jan1) / DAY_MS + 1) / 7);
  return `${year}-W${pad2(week)}`;
}
/** Monday 00:00:00Z of the ISO week containing the timestamp. */
export function isoWeekStart(isoStr) {
  const d = new Date(ms(isoStr));
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7;
  return iso(t - (day - 1) * DAY_MS);
}
/** Monday 00:00:00Z of the NEXT ISO week (the leaderboard reset). */
export const nextWeekStart = (isoStr) => addDays(isoWeekStart(isoStr), 7);
/** Sunday 23:59:59Z of the ISO week containing the timestamp. */
export const isoWeekEnd = (isoStr) => iso(ms(nextWeekStart(isoStr)) - 1000);

/** First time strictly after `afterIso` that is HH:00:00Z on any day. */
export function nextDailyAt(afterIso, hourUtc) {
  const base = ms(dayStart(afterIso)) + hourUtc * HOUR_MS;
  return iso(base > ms(afterIso) ? base : base + DAY_MS);
}
/** First time strictly after `afterIso` that is `weekday` (0=Sun..6=Sat) at HH:00:00Z. */
export function nextWeeklyAt(afterIso, weekday, hourUtc) {
  let t = ms(nextDailyAt(afterIso, hourUtc));
  while (new Date(t).getUTCDay() !== weekday) t += DAY_MS;
  return iso(t);
}
/** Most recent time at or before `atOrBeforeIso` that is `weekday` at HH:00:00Z. */
export function prevWeeklyAt(atOrBeforeIso, weekday, hourUtc) {
  let t = ms(dayStart(atOrBeforeIso)) + hourUtc * HOUR_MS;
  if (t > ms(atOrBeforeIso)) t -= DAY_MS;
  while (new Date(t).getUTCDay() !== weekday) t -= DAY_MS;
  return iso(t);
}

/** "Sat 2:00 PM" style label in UTC for Money Clock copy. */
export function clockLabel(isoStr) {
  const d = new Date(ms(isoStr));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${days[d.getUTCDay()]} ${h12}:${pad2(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}
