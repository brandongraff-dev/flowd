import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  SECOND_MS,
  addDays,
  addDaysToDate,
  addHours,
  addMinutes,
  addMonths,
  clockLabel,
  dateOf,
  dateRange,
  datedClockLabel,
  dayLabel,
  dayStart,
  daysBetween,
  hoursBetween,
  iso,
  isoWeek,
  isoWeekAdd,
  isoWeekEnd,
  isoWeekStart,
  isoWeekToStart,
  nextDailyAt,
  nextWeekStart,
  nextWeeklyAt,
  prevWeeklyAt,
  relativeLabel,
  timeLabel,
  toMs,
  weekdayOf,
} from "../time";
import { NOW } from "./helpers";

describe("conversion", () => {
  it("has the unit constants", () => {
    expect([SECOND_MS, MINUTE_MS, HOUR_MS, DAY_MS]).toEqual([1000, 60_000, 3_600_000, 86_400_000]);
  });

  it("formats epoch milliseconds as second-precision UTC", () => {
    expect(iso(Date.UTC(2026, 9, 3, 14, 0, 0))).toBe("2026-10-03T14:00:00Z");
    expect(iso(Date.UTC(2026, 9, 3, 14, 0, 0, 999))).toBe("2026-10-03T14:00:00Z");
    expect(iso(Date.UTC(2027, 0, 5, 3, 4, 5))).toBe("2027-01-05T03:04:05Z");
  });

  it("parses timestamps and plain dates, and fails loudly on junk", () => {
    expect(toMs("2026-10-03T14:00:00Z")).toBe(Date.UTC(2026, 9, 3, 14));
    expect(toMs("2026-10-03")).toBe(Date.UTC(2026, 9, 3));
    expect(() => toMs("not a date")).toThrow("Bad timestamp: not a date");
    expect(() => toMs("2026-13-45")).toThrow();
  });
});

describe("arithmetic", () => {
  it("adds hours, days and minutes, forwards and back", () => {
    expect(addHours(NOW, 72)).toBe("2026-10-06T14:00:00Z");
    expect(addHours(NOW, -14)).toBe("2026-10-03T00:00:00Z");
    expect(addDays(NOW, 90)).toBe("2027-01-01T14:00:00Z");
    expect(addDays(NOW, -3)).toBe("2026-09-30T14:00:00Z");
    expect(addMinutes(NOW, 90)).toBe("2026-10-03T15:30:00Z");
  });

  it("adds calendar months, clamping to the end of a short month", () => {
    expect(addMonths("2026-01-31T10:00:00Z", 1)).toBe("2026-02-28T10:00:00Z");
    expect(addMonths("2028-01-31T10:00:00Z", 1)).toBe("2028-02-29T10:00:00Z");
    expect(addMonths("2026-10-03T14:00:00Z", 12)).toBe("2027-10-03T14:00:00Z");
    expect(addMonths("2026-11-30T00:00:00Z", 3)).toBe("2027-02-28T00:00:00Z");
    expect(addMonths("2026-01-15T00:00:00Z", -2)).toBe("2025-11-15T00:00:00Z");
    expect(addMonths("2026-10-03T14:00:00Z", 0)).toBe("2026-10-03T14:00:00Z");
  });

  it("measures the gap in hours and days", () => {
    expect(hoursBetween("2026-10-03T00:00:00Z", NOW)).toBe(14);
    expect(hoursBetween(NOW, "2026-10-03T00:00:00Z")).toBe(-14);
    expect(daysBetween("2026-09-30T14:00:00Z", NOW)).toBe(3);
    expect(daysBetween("2026-10-03T02:00:00Z", NOW)).toBeCloseTo(0.5, 9);
  });
});

describe("dates", () => {
  it("takes the date and day start of a timestamp", () => {
    expect(dateOf(NOW)).toBe("2026-10-03");
    expect(dayStart(NOW)).toBe("2026-10-03T00:00:00Z");
    expect(addDaysToDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lists dates inclusively, and nothing for a reversed range", () => {
    expect(dateRange("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(dateRange("2026-10-03", "2026-10-03")).toEqual(["2026-10-03"]);
    expect(dateRange("2026-10-04", "2026-10-03")).toEqual([]);
    expect(dateRange("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("names the weekday (0 is Sunday)", () => {
    expect(weekdayOf("2026-10-03T14:00:00Z")).toBe(6); // Saturday
    expect(weekdayOf("2026-10-02T18:00:00Z")).toBe(5); // Friday
    expect(weekdayOf("2026-10-04T00:00:00Z")).toBe(0);
  });
});

describe("ISO weeks (Monday to Sunday, UTC)", () => {
  it("labels the week of a timestamp", () => {
    expect(isoWeek(NOW)).toBe("2026-W40");
    expect(isoWeek("2026-09-28T00:00:00Z")).toBe("2026-W40"); // Monday
    expect(isoWeek("2026-10-04T23:59:59Z")).toBe("2026-W40"); // Sunday
    expect(isoWeek("2026-10-05T00:00:00Z")).toBe("2026-W41");
  });

  it("handles the year boundaries", () => {
    expect(isoWeek("2025-12-29T00:00:00Z")).toBe("2026-W01"); // 1 Jan 2026 is a Thursday
    expect(isoWeek("2026-01-01T12:00:00Z")).toBe("2026-W01");
    expect(isoWeek("2027-01-01T00:00:00Z")).toBe("2026-W53"); // 2026 has 53 ISO weeks
    expect(isoWeek("2024-12-30T00:00:00Z")).toBe("2025-W01");
    expect(isoWeek("2021-01-03T00:00:00Z")).toBe("2020-W53");
  });

  it("finds the Monday start, the next week's start and the Sunday end", () => {
    expect(isoWeekStart(NOW)).toBe("2026-09-28T00:00:00Z");
    expect(isoWeekStart("2026-10-04T23:00:00Z")).toBe("2026-09-28T00:00:00Z");
    expect(isoWeekStart("2026-09-28T00:00:00Z")).toBe("2026-09-28T00:00:00Z");
    expect(nextWeekStart(NOW)).toBe("2026-10-05T00:00:00Z");
    expect(isoWeekEnd(NOW)).toBe("2026-10-04T23:59:59Z");
  });

  it("goes from a label to its Monday, and adds weeks across years", () => {
    expect(isoWeekToStart("2026-W40")).toBe("2026-09-28T00:00:00Z");
    expect(isoWeekToStart("2026-W01")).toBe("2025-12-29T00:00:00Z");
    expect(() => isoWeekToStart("2026-40")).toThrow("Bad ISO week");
    expect(isoWeekAdd("2026-W40", 1)).toBe("2026-W41");
    expect(isoWeekAdd("2026-W40", 0)).toBe("2026-W40");
    expect(isoWeekAdd("2026-W01", -1)).toBe("2025-W52");
    expect(isoWeekAdd("2026-W52", 1)).toBe("2026-W53");
    expect(isoWeekAdd("2026-W53", 1)).toBe("2027-W01");
    expect(isoWeekAdd("2026-W40", 13)).toBe("2026-W53");
  });
});

describe("recurring runs", () => {
  it("finds the next daily run strictly after an instant", () => {
    expect(nextDailyAt("2026-10-03T13:59:59Z", 14)).toBe("2026-10-03T14:00:00Z");
    expect(nextDailyAt("2026-10-03T14:00:00Z", 14)).toBe("2026-10-04T14:00:00Z");
    expect(nextDailyAt("2026-10-03T23:00:00Z", 14)).toBe("2026-10-04T14:00:00Z");
  });

  it("finds the next weekly run (Friday 18:00 UTC) strictly after an instant", () => {
    expect(nextWeeklyAt(NOW, 5, 18)).toBe("2026-10-09T18:00:00Z");
    expect(nextWeeklyAt("2026-10-09T17:59:59Z", 5, 18)).toBe("2026-10-09T18:00:00Z");
    expect(nextWeeklyAt("2026-10-09T18:00:00Z", 5, 18)).toBe("2026-10-16T18:00:00Z");
  });

  it("finds the previous weekly run at or before an instant", () => {
    expect(prevWeeklyAt(NOW, 5, 18)).toBe("2026-10-02T18:00:00Z");
    expect(prevWeeklyAt("2026-10-09T18:00:00Z", 5, 18)).toBe("2026-10-09T18:00:00Z");
    expect(prevWeeklyAt("2026-10-09T17:00:00Z", 5, 18)).toBe("2026-10-02T18:00:00Z");
  });
});

describe("labels", () => {
  it("writes a 12-hour time", () => {
    expect(timeLabel("2026-10-04T14:00:00Z")).toBe("2:00 PM");
    expect(timeLabel("2026-10-04T00:05:00Z")).toBe("12:05 AM");
    expect(timeLabel("2026-10-04T12:00:00Z")).toBe("12:00 PM");
    expect(timeLabel("2026-10-04T09:30:00Z")).toBe("9:30 AM");
  });

  it("writes the Money Clock labels", () => {
    expect(clockLabel("2026-10-04T14:00:00Z")).toBe("Sun 2:00 PM");
    expect(clockLabel("2026-10-09T18:00:00Z")).toBe("Fri 6:00 PM");
    expect(dayLabel("2026-10-04T14:00:00Z")).toBe("Oct 4");
    expect(datedClockLabel("2026-10-09T18:00:00Z")).toBe("Fri Oct 9, 6:00 PM UTC");
  });

  it("says how far away something is, in plain English", () => {
    const at = (offsetMs: number) => relativeLabel(iso(toMs(NOW) + offsetMs), NOW);
    expect(at(30 * SECOND_MS)).toBe("in a moment");
    expect(at(-30 * SECOND_MS)).toBe("a moment ago");
    expect(at(10 * MINUTE_MS)).toBe("in 10 minutes");
    expect(at(-59 * MINUTE_MS)).toBe("59 minutes ago");
    expect(at(-89 * MINUTE_MS)).toBe("1 hour ago");
    expect(at(HOUR_MS)).toBe("in 1 hour");
    expect(at(100 * MINUTE_MS)).toBe("in 2 hours");
    expect(at(2 * HOUR_MS)).toBe("in 2 hours");
    expect(at(-5 * HOUR_MS)).toBe("5 hours ago");
    expect(at(47 * HOUR_MS)).toBe("in 47 hours");
    expect(at(50 * HOUR_MS)).toBe("in 2 days");
    expect(at(-9 * DAY_MS)).toBe("9 days ago");
    expect(relativeLabel(NOW, NOW)).toBe("in a moment");
  });
});
