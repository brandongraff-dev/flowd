import { describe, expect, it } from "vitest";
import { DEMO_NOW } from "@/lib/constants";
import { DEMO_NOW as ENGINE_NOW, clockLabel } from "@/lib/engine";
import {
  countdownParts,
  formatClockEta,
  formatDate,
  formatDateTime,
  formatDaysLeft,
  formatDuration,
  formatDurationMs,
  formatEta,
  formatCountdown,
  formatIsoWeek,
  formatRelative,
  formatSecondsPrecise,
  formatTime,
  greeting,
  parseTime,
} from "../time";

const NOW = DEMO_NOW; // Sat 2026-10-03 14:00 UTC
const at = (offsetMs: number): number => Date.parse(NOW) + offsetMs;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("the demo clock", () => {
  it("matches the engine's demo now", () => {
    expect(DEMO_NOW).toBe(ENGINE_NOW);
  });
});

describe("parseTime", () => {
  it("reads ISO timestamps, bare dates, epoch ms and Dates", () => {
    expect(parseTime("2026-10-03T14:00:00Z")).toBe(Date.parse(NOW));
    expect(parseTime("2026-10-03")).toBe(Date.parse("2026-10-03T00:00:00Z"));
    expect(parseTime(1_000)).toBe(1_000);
    expect(parseTime(new Date(5))).toBe(5);
  });
  it("returns null for anything unreadable", () => {
    expect(parseTime("soon")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime(Number.NaN)).toBeNull();
    expect(parseTime(new Date("nope"))).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats every style in UTC", () => {
    expect(formatDate(NOW, "short")).toBe("Oct 3");
    expect(formatDate(NOW, "medium")).toBe("Oct 3, 2026");
    expect(formatDate(NOW, "long")).toBe("October 3, 2026");
    expect(formatDate(NOW, "weekday")).toBe("Sat, Oct 3");
    expect(formatDate(NOW, "month")).toBe("October 2026");
    expect(formatDate(NOW, "iso")).toBe("2026-10-03");
  });
  it("auto shows the year only when it is not the current year", () => {
    expect(formatDate("2026-08-14T10:00:00Z")).toBe("Aug 14");
    expect(formatDate("2025-12-31T23:00:00Z")).toBe("Dec 31, 2025");
    expect(formatDate("2026-08-14T10:00:00Z", "auto", { now: "2027-01-02T00:00:00Z" })).toBe("Aug 14, 2026");
  });
  it("respects a time zone when asked", () => {
    // 02:30 UTC on Oct 4 is still Oct 3 in Chicago (UTC-5 in October).
    expect(formatDate("2026-10-04T02:30:00Z", "short")).toBe("Oct 4");
    expect(formatDate("2026-10-04T02:30:00Z", "short", { timeZone: "America/Chicago" })).toBe("Oct 3");
  });
  it("falls back to UTC for an unknown zone and to a dash for a bad value", () => {
    expect(formatDate(NOW, "short", { timeZone: "Mars/Olympus" })).toBe("Oct 3");
    expect(formatDate("garbage")).toBe("—");
  });
});

describe("formatTime and formatDateTime", () => {
  it("uses a 12-hour clock without a leading zero", () => {
    expect(formatTime("2026-10-03T14:00:00Z")).toBe("2:00 PM");
    expect(formatTime("2026-10-03T00:05:00Z")).toBe("12:05 AM");
    expect(formatTime("2026-10-03T12:00:00Z")).toBe("12:00 PM");
    expect(formatTime("2026-10-03T09:07:05Z", { seconds: true })).toBe("9:07:05 AM");
  });
  it("labels the zone when asked", () => {
    expect(formatTime(NOW, { zone: true })).toBe("2:00 PM UTC");
    expect(formatTime(NOW, { timeZone: "America/Chicago" })).toBe("9:00 AM");
    expect(formatDateTime(NOW)).toBe("Oct 3, 2:00 PM UTC");
  });
});

describe("formatIsoWeek", () => {
  it("shows Monday to Sunday", () => {
    expect(formatIsoWeek("2026-W40")).toBe("Sep 28 – Oct 4");
  });
  it("returns a malformed label unchanged", () => {
    expect(formatIsoWeek("week 40")).toBe("week 40");
  });
});

describe("formatClockEta and formatEta", () => {
  it("matches the engine's clock label within a week", () => {
    const clears = "2026-10-03T14:00:00Z";
    expect(formatClockEta(clears)).toBe(clockLabel(clears));
    expect(formatClockEta("2026-10-03T14:00:00Z")).toBe("Sat 2:00 PM");
    expect(formatClockEta("2026-10-09T18:00:00Z")).toBe("Fri 6:00 PM");
  });
  it("adds the date beyond a week, where a weekday alone is ambiguous", () => {
    expect(formatClockEta("2026-10-14T14:00:00Z")).toBe("Oct 14, 2:00 PM");
  });
  it("writes the clears-at copy from the Money Clock spec", () => {
    expect(formatEta("2026-10-03T14:00:00Z", { now: at(-HOUR) })).toBe("clears Sat 2:00 PM");
    expect(formatEta("2026-10-09T18:00:00Z")).toBe("clears Fri 6:00 PM");
  });
  it("switches to the past tense once the time has passed", () => {
    expect(formatEta("2026-10-02T14:00:00Z")).toBe("cleared Fri 2:00 PM");
    expect(formatEta("2026-10-02T14:00:00Z", { verb: "arrives" })).toBe("arrived Fri 2:00 PM");
    expect(formatEta("2026-10-02T14:00:00Z", { verb: "decides" })).toBe("decided Fri 2:00 PM");
    expect(formatEta("2026-10-02T14:00:00Z", { verb: "wraps", pastVerb: "wrapped" })).toBe("wrapped Fri 2:00 PM");
  });
  it("converts to a person's zone", () => {
    expect(formatClockEta("2026-10-03T14:00:00Z", { timeZone: "America/Chicago" })).toBe("Sat 9:00 AM");
  });
  it("never throws on a bad value", () => {
    expect(formatEta("nope")).toBe("—");
    expect(formatClockEta(undefined)).toBe("—");
  });
});

describe("formatDaysLeft", () => {
  it("counts whole days, rounding a partial day up", () => {
    expect(formatDaysLeft(at(12 * DAY - HOUR))).toBe("12 days left");
    expect(formatDaysLeft(at(DAY + HOUR))).toBe("2 days left");
    expect(formatDaysLeft(at(DAY))).toBe("1 day left");
  });
  it("says so when the last day or hour has come", () => {
    expect(formatDaysLeft(at(5 * HOUR))).toBe("ends today");
    expect(formatDaysLeft(at(20 * MIN))).toBe("ends within the hour");
  });
  it("reports an ended term", () => {
    expect(formatDaysLeft(at(-3 * DAY - HOUR))).toBe("ended 3 days ago");
    expect(formatDaysLeft(at(-DAY - HOUR))).toBe("ended 1 day ago");
    expect(formatDaysLeft(at(-HOUR))).toBe("ended today");
  });
});

describe("formatRelative", () => {
  it("handles moments, minutes and hours", () => {
    expect(formatRelative(at(-10_000))).toBe("just now");
    expect(formatRelative(at(10_000))).toBe("in a moment");
    expect(formatRelative(at(-MIN))).toBe("1 minute ago");
    expect(formatRelative(at(-12 * MIN))).toBe("12 minutes ago");
    expect(formatRelative(at(30 * MIN))).toBe("in 30 minutes");
    expect(formatRelative(at(-HOUR))).toBe("1 hour ago");
    expect(formatRelative(at(3 * HOUR))).toBe("in 3 hours");
  });
  it("uses yesterday and tomorrow between one and two days", () => {
    expect(formatRelative(at(-30 * HOUR))).toBe("yesterday");
    expect(formatRelative(at(30 * HOUR))).toBe("tomorrow");
  });
  it("then counts days and weeks", () => {
    expect(formatRelative(at(-5 * DAY))).toBe("5 days ago");
    expect(formatRelative(at(3 * DAY))).toBe("in 3 days");
    expect(formatRelative(at(-21 * DAY))).toBe("3 weeks ago");
  });
  it("falls back to a date after eight weeks, with the year when needed", () => {
    expect(formatRelative("2026-07-05T12:00:00Z")).toBe("Jul 5");
    expect(formatRelative("2025-07-05T12:00:00Z")).toBe("Jul 5, 2025");
  });
  it("has a short style", () => {
    expect(formatRelative(at(-3 * HOUR), NOW, { style: "short" })).toBe("3h ago");
    expect(formatRelative(at(-12 * MIN), NOW, { style: "short" })).toBe("12m ago");
    expect(formatRelative(at(2 * DAY), NOW, { style: "short" })).toBe("in 2d");
    expect(formatRelative(at(-30 * HOUR), NOW, { style: "short" })).toBe("1d ago");
  });
  it("takes an explicit now, and a bad value gives a dash", () => {
    expect(formatRelative("2026-10-03T10:00:00Z", "2026-10-03T12:00:00Z")).toBe("2 hours ago");
    expect(formatRelative("x")).toBe("—");
  });
});

describe("formatDuration", () => {
  it("clock style is a video timecode", () => {
    expect(formatDuration(3)).toBe("0:03");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(0)).toBe("0:00");
  });
  it("short and long styles drop zero units", () => {
    expect(formatDuration(45, "short")).toBe("45s");
    expect(formatDuration(65, "short")).toBe("1m 5s");
    expect(formatDuration(120, "short")).toBe("2m");
    expect(formatDuration(7500, "short")).toBe("2h 5m");
    expect(formatDuration(1, "long")).toBe("1 second");
    expect(formatDuration(65, "long")).toBe("1 minute 5 seconds");
    expect(formatDuration(7200, "long")).toBe("2 hours");
  });
  it("approx style matches the Flo wording", () => {
    expect(formatDuration(22, "approx")).toBe("about 22 s");
    expect(formatDuration(300, "approx")).toBe("about 5 min");
    expect(formatDuration(7200, "approx")).toBe("about 2 h");
    expect(formatDuration(9000, "approx")).toBe("about 2.5 h");
  });
  it("clamps negatives and non-finite input to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN, "short")).toBe("0s");
  });
  it("formats milliseconds and precise seconds", () => {
    expect(formatDurationMs(65_000)).toBe("1:05");
    expect(formatSecondsPrecise(1.94)).toBe("1.9 s");
    expect(formatSecondsPrecise(2)).toBe("2.0 s");
    expect(formatSecondsPrecise(null)).toBe("never");
  });
});

describe("countdowns", () => {
  it("splits time remaining, rounding up to the next second", () => {
    expect(countdownParts(2 * HOUR)).toEqual({ days: 0, hours: 2, minutes: 0, seconds: 0, totalSeconds: 7200, done: false });
    expect(countdownParts(1_500)).toMatchObject({ seconds: 2, done: false });
    expect(countdownParts(26 * HOUR + 5 * MIN)).toMatchObject({ days: 1, hours: 2, minutes: 5 });
  });
  it("is done at zero and for the past", () => {
    expect(countdownParts(0).done).toBe(true);
    expect(countdownParts(-5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, done: true });
    expect(countdownParts(Number.NaN).done).toBe(true);
  });
  it("formats compact, clock and long", () => {
    expect(formatCountdown(2 * HOUR + 14 * MIN)).toBe("2h 14m");
    expect(formatCountdown(14 * MIN + 9_000)).toBe("14m 09s");
    expect(formatCountdown(42_000)).toBe("42s");
    expect(formatCountdown(3 * DAY + 4 * HOUR)).toBe("3d 4h");
    expect(formatCountdown(2 * HOUR + 14 * MIN + 9_000, "clock")).toBe("02:14:09");
    expect(formatCountdown(3 * DAY + 4 * HOUR + 12 * MIN + 9_000, "clock")).toBe("3d 04:12:09");
    expect(formatCountdown(2 * HOUR + 14 * MIN, "long")).toBe("2 hours 14 minutes");
    expect(formatCountdown(0, "clock")).toBe("00:00:00");
  });
});

describe("greeting", () => {
  it("follows the hour in the person's zone", () => {
    expect(greeting("2026-10-03T08:00:00Z")).toBe("Good morning");
    expect(greeting("2026-10-03T14:00:00Z")).toBe("Good afternoon");
    expect(greeting("2026-10-03T20:00:00Z")).toBe("Good evening");
    expect(greeting("2026-10-03T14:00:00Z", { timeZone: "America/Chicago" })).toBe("Good morning");
    expect(greeting("2026-10-03T03:00:00Z")).toBe("Good evening");
  });
});
