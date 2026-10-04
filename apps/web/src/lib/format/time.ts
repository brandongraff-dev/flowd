/**
 * Dates, times, durations and "when does the money land" labels.
 *
 * Everything is UTC unless a `timeZone` (IANA) is passed: the Money Clock, Daily Drop (16:00 UTC) and payout (Fri 18:00 UTC)
 * copy is written in UTC, and UTC output is identical on the server and the client, so there is no hydration mismatch.
 * "Now" is explicit and defaults to the demo world's now (`DEMO_NOW`), never the system clock; pass `useNow()` for a live value.
 * Unreadable timestamps format as "—" instead of throwing, so one bad row never blanks a table.
 */

import { DEMO_NOW } from "@/lib/constants";
import { addDays, clockLabel, DAY_MS, HOUR_MS, iso, isoWeekToStart, MINUTE_MS, SECOND_MS } from "@/lib/engine/time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Anything that parses as a time: an ISO string ("2026-10-03T14:00:00Z" or "2026-10-03"), epoch milliseconds, or a Date. */
export type TimeInput = string | number | Date;

/** Options shared by the date and time formatters. */
export interface TimeOptions {
  /** IANA zone ("America/Chicago"). Default "UTC". An unknown zone falls back to UTC. */
  timeZone?: string;
  /** "Now" for relative and year-aware labels. Default `DEMO_NOW`. */
  now?: TimeInput;
}

/** Epoch ms of a time input, or null when it does not parse. */
export function parseTime(input: TimeInput | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const text = input.length === 10 ? `${input}T00:00:00Z` : input;
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

const NO_VALUE = "—";

// ── zoned parts ────────────────────────────────────────────────────────────────────────────────

interface Parts {
  year: number;
  /** 0 to 11. */
  month: number;
  day: number;
  /** 0 (Sunday) to 6. */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    formatter = null;
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function utcParts(ms: number): Parts {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
}

function partsOf(ms: number, timeZone: string | undefined): Parts {
  if (!timeZone || timeZone === "UTC") return utcParts(ms);
  const formatter = zonedFormatter(timeZone);
  if (!formatter) return utcParts(ms);
  const get: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(ms))) get[part.type] = part.value;
  const weekday = WEEKDAYS.findIndex((w) => w === get.weekday);
  return {
    year: Number(get.year),
    month: Number(get.month) - 1,
    day: Number(get.day),
    weekday: weekday < 0 ? 0 : weekday,
    hour: Number(get.hour) % 24,
    minute: Number(get.minute),
    second: Number(get.second),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function zoneName(timeZone: string | undefined, ms: number): string {
  if (!timeZone || timeZone === "UTC") return "UTC";
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return "UTC";
  }
}

// ── dates ──────────────────────────────────────────────────────────────────────────────────────

/**
 * - `short`    "Oct 3"
 * - `medium`   "Oct 3, 2026"
 * - `long`     "October 3, 2026"
 * - `weekday`  "Sat, Oct 3"
 * - `month`    "October 2026"
 * - `iso`      "2026-10-03"
 * - `auto`     "Oct 3" in the current year, "Oct 3, 2025" in any other (the default)
 */
export type DateStyle = "short" | "medium" | "long" | "weekday" | "month" | "iso" | "auto";

export function formatDate(input: TimeInput | null | undefined, style: DateStyle = "auto", options: TimeOptions = {}): string {
  const ms = parseTime(input);
  if (ms === null) return NO_VALUE;
  const p = partsOf(ms, options.timeZone);
  switch (style) {
    case "short":
      return `${MONTHS[p.month]} ${p.day}`;
    case "medium":
      return `${MONTHS[p.month]} ${p.day}, ${p.year}`;
    case "long":
      return `${MONTHS_LONG[p.month]} ${p.day}, ${p.year}`;
    case "weekday":
      return `${WEEKDAYS[p.weekday]}, ${MONTHS[p.month]} ${p.day}`;
    case "month":
      return `${MONTHS_LONG[p.month]} ${p.year}`;
    case "iso":
      return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}`;
    case "auto": {
      const nowMs = parseTime(options.now ?? DEMO_NOW) ?? Date.parse(DEMO_NOW);
      const sameYear = partsOf(nowMs, options.timeZone).year === p.year;
      return sameYear ? `${MONTHS[p.month]} ${p.day}` : `${MONTHS[p.month]} ${p.day}, ${p.year}`;
    }
  }
}

export interface TimeFormatOptions extends TimeOptions {
  /** Append the zone ("UTC", "CDT"). Default false. */
  zone?: boolean;
  /** Include seconds ("2:00:05 PM"). Default false. */
  seconds?: boolean;
}

/** "2:00 PM" (12-hour, no leading zero on the hour). */
export function formatTime(input: TimeInput | null | undefined, options: TimeFormatOptions = {}): string {
  const ms = parseTime(input);
  if (ms === null) return NO_VALUE;
  const p = partsOf(ms, options.timeZone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const clock = `${h12}:${pad2(p.minute)}${options.seconds ? `:${pad2(p.second)}` : ""} ${p.hour < 12 ? "AM" : "PM"}`;
  return options.zone ? `${clock} ${zoneName(options.timeZone, ms)}` : clock;
}

/** "Oct 3, 2:00 PM UTC": date (year only when it is not this year) and time with the zone. */
export function formatDateTime(input: TimeInput | null | undefined, options: TimeFormatOptions = {}): string {
  const ms = parseTime(input);
  if (ms === null) return NO_VALUE;
  return `${formatDate(ms, "auto", options)}, ${formatTime(ms, { zone: true, ...options })}`;
}

/** "Sep 28 – Oct 4" for an ISO week label ("2026-W40"). Monday to Sunday, UTC. A malformed label comes back unchanged. */
export function formatIsoWeek(label: string): string {
  try {
    const start = isoWeekToStart(label);
    return `${formatDate(start, "short")} – ${formatDate(addDays(start, 6), "short")}`;
  } catch {
    return label;
  }
}

// ── "when does the money land" ─────────────────────────────────────────────────────────────────

/**
 * A dated clock label for ETAs: "Sat 2:00 PM" for anything within a week either side of now (the Money Clock wording), and
 * "Oct 14, 2:00 PM" beyond that, where a weekday alone would be ambiguous. UTC output matches the engine's `clockLabel` exactly.
 */
export function formatClockEta(input: TimeInput | null | undefined, options: TimeOptions = {}): string {
  const ms = parseTime(input);
  if (ms === null) return NO_VALUE;
  const nowMs = parseTime(options.now ?? DEMO_NOW) ?? Date.parse(DEMO_NOW);
  const near = Math.abs(ms - nowMs) < 7 * DAY_MS;
  const utc = !options.timeZone || options.timeZone === "UTC";
  if (near) {
    if (utc) return clockLabel(iso(ms));
    const p = partsOf(ms, options.timeZone);
    return `${WEEKDAYS[p.weekday]} ${formatTime(ms, { timeZone: options.timeZone })}`;
  }
  return `${formatDate(ms, "short", options)}, ${formatTime(ms, { timeZone: options.timeZone })}`;
}

/** The past tense of the verbs ETAs use. A verb not listed keeps its form. */
const PAST_VERB: Readonly<Record<string, string>> = {
  clears: "cleared",
  arrives: "arrived",
  lands: "landed",
  closes: "closed",
  decides: "decided",
  ends: "ended",
  expires: "expired",
  starts: "started",
  opens: "opened",
  drops: "dropped",
  settles: "settled",
  pays: "paid",
  "goes live": "went live",
};

export interface EtaOptions extends TimeOptions {
  /** Present-tense verb. Default "clears": "clears Sat 2:00 PM". */
  verb?: string;
  /** Overrides the past form used when the time has passed. */
  pastVerb?: string;
}

/**
 * "clears Sat 2:00 PM": a dated ETA. Once the time has passed the verb turns to the past ("cleared Fri 2:00 PM"), so a stale row
 * never promises something that already happened. Money rows always carry one of these, never a bare "pending".
 */
export function formatEta(input: TimeInput | null | undefined, options: EtaOptions = {}): string {
  const ms = parseTime(input);
  if (ms === null) return NO_VALUE;
  const nowMs = parseTime(options.now ?? DEMO_NOW) ?? Date.parse(DEMO_NOW);
  const verb = options.verb ?? "clears";
  const label = ms > nowMs ? verb : (options.pastVerb ?? PAST_VERB[verb] ?? verb);
  return `${label} ${formatClockEta(ms, options)}`;
}

/**
 * Days left on a term (a rights licence, a bounty, a streak freeze): "12 days left", "1 day left", "ends today", "ended 3 days ago".
 * Counts whole UTC days, rounding a partial day up, so "ends today" means the last day.
 */
export function formatDaysLeft(endsAt: TimeInput | null | undefined, now: TimeInput = DEMO_NOW): string {
  const end = parseTime(endsAt);
  const nowMs = parseTime(now);
  if (end === null || nowMs === null) return NO_VALUE;
  const diff = end - nowMs;
  if (diff < 0) {
    const days = Math.floor(-diff / DAY_MS);
    return days === 0 ? "ended today" : `ended ${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY_MS) return diff < HOUR_MS ? "ends within the hour" : "ends today";
  const days = Math.ceil(diff / DAY_MS);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

// ── relative ───────────────────────────────────────────────────────────────────────────────────

export interface RelativeOptions {
  /** "long": "3 hours ago". "short": "3h ago". Default "long". */
  style?: "long" | "short";
}

/**
 * Plain-English distance from now: "just now", "12 minutes ago", "in 3 hours", "yesterday", "5 days ago", "3 weeks ago", then a date
 * ("Aug 14", with the year when it is not this year). `now` defaults to the demo world's now.
 */
export function formatRelative(input: TimeInput | null | undefined, now: TimeInput = DEMO_NOW, options: RelativeOptions = {}): string {
  const target = parseTime(input);
  const base = parseTime(now);
  if (target === null || base === null) return NO_VALUE;
  const short = options.style === "short";
  const diff = target - base;
  const abs = Math.abs(diff);
  const future = diff > 0;
  const wrap = (body: string): string => (future ? `in ${body}` : `${body} ago`);

  if (abs < 45 * SECOND_MS) return future ? "in a moment" : "just now";
  if (abs < 60 * MINUTE_MS) {
    const m = Math.max(1, Math.round(abs / MINUTE_MS));
    return wrap(short ? `${m}m` : `${m} minute${m === 1 ? "" : "s"}`);
  }
  if (abs < 24 * HOUR_MS) {
    const h = Math.max(1, Math.round(abs / HOUR_MS));
    return wrap(short ? `${h}h` : `${h} hour${h === 1 ? "" : "s"}`);
  }
  if (abs < 48 * HOUR_MS) return short ? wrap("1d") : future ? "tomorrow" : "yesterday";
  if (abs < 14 * DAY_MS) {
    const d = Math.round(abs / DAY_MS);
    return wrap(short ? `${d}d` : `${d} days`);
  }
  if (abs < 56 * DAY_MS) {
    const w = Math.floor(abs / (7 * DAY_MS));
    return wrap(short ? `${w}w` : `${w} weeks`);
  }
  return formatDate(target, "auto", { now: base });
}

// ── durations and countdowns ───────────────────────────────────────────────────────────────────

/**
 * - `clock`   "0:03", "1:05", "1:02:03" (video timecodes)
 * - `short`   "45s", "1m 5s", "2h 5m"
 * - `long`    "45 seconds", "1 minute 5 seconds", "2 hours 5 minutes"
 * - `approx`  "about 22 s", "about 5 min", "about 2 h" (the Flo and script wording)
 */
export type DurationStyle = "clock" | "short" | "long" | "approx";

/** A length of time in seconds (fractions are rounded; negatives and non-finite values read as zero). */
export function formatDuration(seconds: number, style: DurationStyle = "clock"): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  switch (style) {
    case "clock":
      return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
    case "short": {
      if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
      if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
      return `${s}s`;
    }
    case "long": {
      const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
      if (h > 0) return m > 0 ? `${unit(h, "hour")} ${unit(m, "minute")}` : unit(h, "hour");
      if (m > 0) return s > 0 ? `${unit(m, "minute")} ${unit(s, "second")}` : unit(m, "minute");
      return unit(s, "second");
    }
    case "approx": {
      if (total < 90) return `about ${total} s`;
      if (total < 90 * 60) return `about ${Math.round(total / 60)} min`;
      return `about ${Math.round((total / 3600) * 10) / 10} h`.replace(/\.0 h$/, " h");
    }
  }
}

/** Same as `formatDuration`, from milliseconds. */
export const formatDurationMs = (ms: number, style: DurationStyle = "clock"): string => formatDuration(ms / 1000, style);

/** "1.9 s": a duration with one decimal, for hook timings and fill times ("lands by 2 seconds"). `null` reads "never". */
export function formatSecondsPrecise(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "never";
  return `${(Math.round(seconds * 10) / 10).toFixed(1)} s`;
}

/** The pieces of a countdown. A target in the past is all zeros with `done: true`. */
export interface CountdownParts {
  days: number;
  /** 0 to 23. */
  hours: number;
  /** 0 to 59. */
  minutes: number;
  /** 0 to 59. */
  seconds: number;
  /** Whole seconds remaining (never negative). */
  totalSeconds: number;
  done: boolean;
}

/** Splits milliseconds remaining into days, hours, minutes and seconds (rounded up to the next whole second, so 0:00 only happens at the moment it is due). */
export function countdownParts(remainingMs: number): CountdownParts {
  const totalSeconds = Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
    done: totalSeconds === 0,
  };
}

/** `clock` "02:14:09" (days prefix when over a day: "3d 04:12:09"), `compact` "2h 14m", `long` "2 hours 14 minutes". */
export type CountdownStyle = "clock" | "compact" | "long";

export function formatCountdown(remainingMs: number, style: CountdownStyle = "compact"): string {
  const p = countdownParts(remainingMs);
  if (style === "clock") {
    const body = `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
    return p.days > 0 ? `${p.days}d ${body}` : body;
  }
  if (style === "long") {
    const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
    if (p.days > 0) return p.hours > 0 ? `${unit(p.days, "day")} ${unit(p.hours, "hour")}` : unit(p.days, "day");
    if (p.hours > 0) return p.minutes > 0 ? `${unit(p.hours, "hour")} ${unit(p.minutes, "minute")}` : unit(p.hours, "hour");
    if (p.minutes > 0) return unit(p.minutes, "minute");
    return unit(p.seconds, "second");
  }
  if (p.days > 0) return p.hours > 0 ? `${p.days}d ${p.hours}h` : `${p.days}d`;
  if (p.hours > 0) return `${p.hours}h ${pad2(p.minutes)}m`;
  if (p.minutes > 0) return `${p.minutes}m ${pad2(p.seconds)}s`;
  return `${p.seconds}s`;
}

/** "Good morning" (5 to 11), "Good afternoon" (12 to 16), "Good evening" (17 to 4) in the person's zone. No guilt about late hours. */
export function greeting(input: TimeInput = DEMO_NOW, options: Pick<TimeOptions, "timeZone"> = {}): string {
  const ms = parseTime(input);
  if (ms === null) return "Hello";
  const hour = partsOf(ms, options.timeZone).hour;
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
