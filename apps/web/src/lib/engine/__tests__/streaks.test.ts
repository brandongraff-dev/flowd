import { describe, expect, it } from "vitest";
import { canDeclareRestWeek, evaluateStreak, quarterOfWeek, restWeeksUsedInQuarter, streakCopy } from "../streaks";
import { addDays, addHours, isoWeekAdd, isoWeekToStart } from "../time";
import { NOW } from "./helpers";

/** Noon on the Wednesday of an ISO week. */
const postIn = (week: string): string => addHours(addDays(isoWeekToStart(week), 2), 12);
const weeks = (...ws: string[]): string[] => ws.map(postIn);
const range = (from: string, n: number): string[] => Array.from({ length: n }, (_, i) => isoWeekAdd(from, i));

describe("a six-week streak (the demo: @maya.makes, W35 to W40)", () => {
  const s = evaluateStreak({ post_times: weeks(...range("2026-W35", 6)), now: NOW });

  it("counts six weeks, banks one freeze and is 2 weeks from the next", () => {
    expect(s).toMatchObject({
      status: "active",
      current_weeks: 6,
      best_weeks: 6,
      freezes_banked: 1,
      freezes_earned_total: 1,
      freezes_used_total: 0,
      iso_week: "2026-W40",
      posts_this_week: 1,
      posted_this_week: true,
      week_ends_at: "2026-10-04T23:59:59Z",
      next_freeze_in_weeks: 2,
      weeks_to_next_freeze: 2,
      rest_weeks_used_quarter: 0,
    });
  });

  it("lists the weeks oldest first, ending at the current week", () => {
    expect(s.history.map((h) => h.iso_week)).toEqual(range("2026-W35", 6));
    expect(s.history.every((h) => h.outcome === "posted" && h.posts === 1)).toBe(true);
  });

  it("copy is calm and never uses guilt words", () => {
    const c = streakCopy(s);
    expect(c.headline).toBe("6-week streak");
    expect(c.detail).toBe("You have posted this week. 1 freeze banked. Next freeze in 2 weeks.");
    for (const state of ["new", "active", "frozen", "resting", "broken"] as const) {
      const text = JSON.stringify(streakCopy({ ...s, status: state, posted_this_week: false })).toLowerCase();
      expect(text).not.toMatch(/lose|lost|don't break|dont break|ruin|miss(?:ed)? out|hurry|last chance/);
    }
  });
});

describe("weeks and boundaries", () => {
  it("counts a post by its UTC week: Sunday 23:59:59 is the old week, Monday 00:00:00 the new one", () => {
    const s = evaluateStreak({ post_times: ["2026-09-27T23:59:59Z", "2026-09-28T00:00:00Z"], now: "2026-09-30T12:00:00Z" });
    expect(s.history.map((h) => [h.iso_week, h.posts])).toEqual([["2026-W39", 1], ["2026-W40", 1]]);
    expect(s.current_weeks).toBe(2);
  });

  it("ignores posts after now", () => {
    const s = evaluateStreak({ post_times: ["2026-10-03T14:00:01Z", "2026-10-10T10:00:00Z"], now: NOW });
    expect(s.status).toBe("new");
    expect(s.current_weeks).toBe(0);
  });

  it("counts several posts in a week as one week", () => {
    const s = evaluateStreak({ post_times: ["2026-09-28T09:00:00Z", "2026-09-29T09:00:00Z", "2026-10-02T09:00:00Z"], now: NOW });
    expect(s.current_weeks).toBe(1);
    expect(s.posts_this_week).toBe(3);
  });

  it("has no streak and a calm state with no posts yet", () => {
    const s = evaluateStreak({ post_times: [], now: NOW, starting_freezes: 5 });
    expect(s).toMatchObject({ status: "new", current_weeks: 0, best_weeks: 0, freezes_banked: 2, history: [], posted_this_week: false, next_freeze_in_weeks: 0, weeks_to_next_freeze: 4 });
  });
});

describe("the current week is open until it ends", () => {
  it("does not mark a creator as having missed a week that is still running", () => {
    const s = evaluateStreak({ post_times: weeks(...range("2026-W37", 3)), now: NOW });
    expect(s.status).toBe("active");
    expect(s.current_weeks).toBe(3);
    expect(s.posted_this_week).toBe(false);
    expect(s.history.map((h) => h.iso_week)).toEqual(range("2026-W37", 3)); // the open week is not in the history
    expect(streakCopy(s).detail).toMatch(/Post any time before the week ends/);
  });
});

describe("freezes", () => {
  it("earns one freeze for every 4 weeks and spends it on a missed week without breaking the streak", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W34", "2026-W35", "2026-W36", "2026-W37", "2026-W39", "2026-W40"), now: NOW });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "posted", "posted", "posted", "freeze_used", "posted", "posted"]);
    expect(s).toMatchObject({ current_weeks: 6, freezes_banked: 0, freezes_earned_total: 1, freezes_used_total: 1, status: "active" });
  });

  it("is frozen when the last completed week used a freeze and this week is still open", () => {
    // W34 to W37 posted (freeze earned), W38 skipped (freeze used), now in W39 with no post yet
    const s = evaluateStreak({ post_times: weeks("2026-W34", "2026-W35", "2026-W36", "2026-W37"), now: "2026-09-22T12:00:00Z" });
    expect(s.status).toBe("frozen");
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "posted", "posted", "posted", "freeze_used"]);
    expect(s.current_weeks).toBe(4);
    expect(streakCopy(s).detail).toMatch(/A freeze covered last week/);
  });

  it("caps the bank at 2: a third freeze is not earned while two are banked", () => {
    const s = evaluateStreak({ post_times: weeks(...range("2026-W26", 12)), now: "2026-09-19T12:00:00Z" }); // W26..W37
    expect(s.current_weeks).toBe(12);
    expect(s.freezes_banked).toBe(2);
    expect(s.freezes_earned_total).toBe(2);
    expect(s.next_freeze_in_weeks).toBe(0);
    expect(s.weeks_to_next_freeze).toBe(4);
  });

  it("earns again once a banked freeze is spent", () => {
    // 8 posted weeks bank 2; a skipped week spends one; 4 more posted weeks earn another
    const posts = weeks(...range("2026-W22", 8), ...range("2026-W31", 4));
    const s = evaluateStreak({ post_times: posts, now: "2026-08-26T12:00:00Z" }); // W35 is open; W30 was skipped
    expect(s.freezes_used_total).toBe(1);
    expect(s.freezes_earned_total).toBe(3);
    expect(s.freezes_banked).toBe(2);
  });

  it("starts from a bank the creator already has", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W37", "2026-W38"), now: "2026-09-22T12:00:00Z", starting_freezes: 1 });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "freeze_used", "posted", "posted"]);
    expect(s.freezes_banked).toBe(0);
    expect(s.current_weeks).toBe(3);
  });
});

describe("a broken streak starts again, and the best is kept", () => {
  it("restarts after a missed week with no freeze", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W36", "2026-W38"), now: "2026-09-22T12:00:00Z" });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "posted", "missed", "posted"]);
    expect(s).toMatchObject({ current_weeks: 1, best_weeks: 2, status: "active" });
  });

  it("is broken, with fresh-start copy, when the last completed week was missed and nothing is posted yet", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W36"), now: "2026-09-22T12:00:00Z" }); // W37 missed, W38 missed, W39 open
    expect(s.status).toBe("broken");
    expect(s.current_weeks).toBe(0);
    expect(s.best_weeks).toBe(2);
    expect(streakCopy(s)).toEqual({ headline: "Fresh start", detail: "Your best was 2 weeks. Post once this week to begin a new streak." });
  });

  it("needs a new run of 4 weeks to earn another freeze", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W30", "2026-W31", "2026-W32", "2026-W33", "2026-W35", "2026-W36", "2026-W37"), now: "2026-09-19T12:00:00Z" });
    // W34 spends the freeze earned at W33; W35 to W37 are three more posted weeks in the same unbroken run, so the run is 7 and the freeze count follows
    expect(s.freezes_earned_total).toBe(1);
    expect(s.current_weeks).toBe(7);
  });
});

describe("rest weeks, pauses and slack mode keep the streak without counting a week", () => {
  it("a declared rest week neither adds nor breaks", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W36", "2026-W38"), now: "2026-09-22T12:00:00Z", rest_weeks: ["2026-W37"] });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "posted", "rest", "posted"]);
    expect(s.current_weeks).toBe(3);
    expect(s.freezes_used_total).toBe(0);
  });

  it("is resting while the current week is a declared rest week", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W36", "2026-W37", "2026-W38"), now: "2026-09-22T12:00:00Z", rest_weeks: ["2026-W39"] });
    expect(s.status).toBe("resting");
    expect(streakCopy(s).detail).toMatch(/Rest weeks keep your streak safe/);
    expect(streakCopy(s).headline).toBe("3-week streak, resting");
  });

  it("a pause preserves the streak for every week it touches", () => {
    const s = evaluateStreak({
      post_times: weeks("2026-W35", "2026-W36", "2026-W39"),
      now: "2026-09-24T12:00:00Z",
      pauses: [{ from: "2026-09-10T00:00:00Z", until: "2026-09-21T00:00:00Z" }], // covers W37 and W38 (09-07 to 09-20); it ends the instant W39 begins, so W39 is untouched
    });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "posted", "rest", "rest", "posted"]);
    expect(s.current_weeks).toBe(3);
  });

  it("a week with a post still counts even inside a pause", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W36"), now: "2026-09-10T12:00:00Z", pauses: [{ from: "2026-08-30T00:00:00Z", until: "2026-09-20T00:00:00Z" }] });
    expect(s.history[0].outcome).toBe("posted");
  });

  it("slack mode turns up to two missed weeks in a row into rest weeks, then falls back to freezes and breaks", () => {
    const posts = weeks("2026-W33", "2026-W34", "2026-W35", "2026-W36");
    const slack = evaluateStreak({ post_times: posts, now: "2026-09-22T12:00:00Z", slack_mode: true, starting_freezes: 0 });
    // W37 and W38 are rest (slack), W39 is the open current week
    expect(slack.history.map((h) => h.outcome)).toEqual(["posted", "posted", "posted", "posted", "rest", "rest"]);
    expect(slack.current_weeks).toBe(4);
    const third = evaluateStreak({ post_times: posts, now: "2026-09-29T12:00:00Z", slack_mode: true });
    // W37, W38 slack; W39 a third miss: the freeze earned at W36 covers it
    expect(third.history.map((h) => h.outcome).slice(-3)).toEqual(["rest", "rest", "freeze_used"]);
    expect(third.freezes_used_total).toBe(1);
  });

  it("resets the slack counter after a posted week", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W38"), now: "2026-09-29T12:00:00Z", slack_mode: true });
    expect(s.history.map((h) => h.outcome)).toEqual(["posted", "rest", "rest", "posted", "rest"]);
  });

  it("starts at a given week", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W35", "2026-W39"), now: "2026-09-22T12:00:00Z", start_week: "2026-W36" });
    expect(s.history[0].iso_week).toBe("2026-W36");
  });
});

describe("rest-week quota", () => {
  it("places an ISO week in its calendar quarter by its Thursday", () => {
    expect(quarterOfWeek("2026-W40")).toBe("2026-Q4");
    expect(quarterOfWeek("2026-W01")).toBe("2026-Q1");
    expect(quarterOfWeek("2026-W14")).toBe("2026-Q2"); // Thursday 2026-04-02
    expect(quarterOfWeek("2026-W13")).toBe("2026-Q1"); // Thursday 2026-03-26
    expect(quarterOfWeek("2026-W53")).toBe("2026-Q4");
    expect(quarterOfWeek("2027-W01")).toBe("2027-Q1");
  });

  it("allows 2 per quarter and refuses a repeat or a third", () => {
    expect(restWeeksUsedInQuarter(["2026-W41", "2026-W20"], "2026-W40")).toBe(1);
    expect(restWeeksUsedInQuarter(["2026-W39"], "2026-W40")).toBe(0); // W39 is the last week of Q3
    expect(canDeclareRestWeek({ rest_weeks: [], week: "2026-W40" })).toEqual({ ok: true, used: 0, remaining: 1 });
    expect(canDeclareRestWeek({ rest_weeks: ["2026-W41"], week: "2026-W40" })).toEqual({ ok: true, used: 1, remaining: 0 });
    expect(canDeclareRestWeek({ rest_weeks: ["2026-W41", "2026-W42"], week: "2026-W40" })).toMatchObject({ ok: false, used: 2, remaining: 0 });
    expect(canDeclareRestWeek({ rest_weeks: ["2026-W41"], week: "2026-W41" })).toMatchObject({ ok: false, reason: "That week is already a rest week." });
    expect(canDeclareRestWeek({ rest_weeks: ["2026-W20", "2026-W21"], week: "2026-W40" }).ok).toBe(true);
  });

  it("reports the declared rest weeks used this quarter", () => {
    const s = evaluateStreak({ post_times: weeks("2026-W39"), now: NOW, rest_weeks: ["2026-W41", "2026-W42", "2026-W20"] });
    expect(s.rest_weeks_used_quarter).toBe(2);
  });
});

describe("copy", () => {
  const base = { current_weeks: 3, best_weeks: 5, freezes_banked: 0, weeks_to_next_freeze: 1, posted_this_week: false };

  it("starts gently", () => {
    expect(streakCopy({ ...base, status: "new", current_weeks: 0 })).toEqual({ headline: "Start a streak", detail: "Post once this week to begin. A week counts when you post at least once." });
  });

  it("pluralises freezes and weeks", () => {
    expect(streakCopy({ ...base, status: "active", posted_this_week: true, freezes_banked: 2, weeks_to_next_freeze: 4 }).detail).toBe("You have posted this week. 2 freezes banked. Next freeze in 4 weeks.");
    expect(streakCopy({ ...base, status: "active", posted_this_week: true, freezes_banked: 1 }).detail).toBe("You have posted this week. 1 freeze banked. Next freeze in 1 week.");
    expect(streakCopy({ ...base, status: "broken", best_weeks: 1 }).detail).toBe("Your best was 1 week. Post once this week to begin a new streak.");
  });
});
