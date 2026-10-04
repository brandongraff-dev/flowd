/**
 * Weekly streaks, with freezes and rest weeks, and no guilt.
 *
 * A week counts when the creator posts at least once in the ISO week (Monday to Sunday, UTC). Earned freezes: one for every 4 weeks of streak,
 * at most 2 banked. A missed week spends a freeze if one is banked; otherwise the streak starts again (the best streak is kept). Declared rest
 * weeks (2 per quarter), paused periods and Wellbeing "slack mode" keep the streak without counting a week. There is no inactivity penalty and no
 * guilt copy: nothing here ever says "you'll lose your streak".
 */

import type { IsoTimestamp, StreakStatus, WeekOutcome } from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { addDays, isoWeek, isoWeekAdd, isoWeekEnd, isoWeekToStart, toMs } from "./time";

export interface StreakInput {
  /** Every posting instant (any platform). Only posts at or before `now` count. */
  post_times: readonly IsoTimestamp[];
  now: IsoTimestamp;
  /** ISO weeks the creator declared as rest ("2026-W36"). */
  rest_weeks?: readonly string[];
  /** Pause windows. A week that overlaps a pause is a rest week; pausing preserves tier and streak. */
  pauses?: readonly { from: IsoTimestamp; until: IsoTimestamp }[];
  /** Wellbeing slack mode: a missed week becomes a rest week, up to 2 in a row, without spending a freeze. */
  slack_mode?: boolean;
  /** Freezes already banked before the first week evaluated. */
  starting_freezes?: number;
  /** First week to evaluate (default: the week of the first post). */
  start_week?: string;
}

/** One week of history. `open` is the current week while it has no post yet. */
export interface StreakWeek {
  iso_week: string;
  outcome: WeekOutcome | "open";
  posts: number;
}

export interface StreakState {
  status: StreakStatus;
  /** Weeks of streak: posted weeks since the last break. Rest, pause and freeze weeks neither add nor break. */
  current_weeks: number;
  best_weeks: number;
  /** 0 to 2. */
  freezes_banked: number;
  freezes_earned_total: number;
  freezes_used_total: number;
  /** The ISO week of `now`. */
  iso_week: string;
  posts_this_week: number;
  posted_this_week: boolean;
  /** Sunday 23:59:59Z of the current week. */
  week_ends_at: IsoTimestamp;
  /** Weeks until the next freeze is earned, 0 to 3 as the contract defines it (0 right after one is earned or with no streak). */
  next_freeze_in_weeks: number;
  /** The same on a 1 to 4 scale, for copy ("next freeze in 2 weeks"). */
  weeks_to_next_freeze: number;
  /** The last 12 weeks, oldest first, ending at the current week (an unposted current week is `open`). */
  history: StreakWeek[];
  /** Declared rest weeks used in the current quarter (at most 2). */
  rest_weeks_used_quarter: number;
}

const HISTORY_WEEKS = 12;

/** "2026-Q4": the calendar quarter an ISO week belongs to (decided by its Thursday, as ISO weeks are). */
export function quarterOfWeek(week: string): string {
  const thursday = addDays(isoWeekToStart(week), 3);
  const month = Number(thursday.slice(5, 7));
  return `${thursday.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** How many of the declared rest weeks fall in the same quarter as `week`. */
export const restWeeksUsedInQuarter = (restWeeks: readonly string[], week: string): number => restWeeks.filter((w) => quarterOfWeek(w) === quarterOfWeek(week)).length;

/** Whether a creator may declare `week` as a rest week: 2 per quarter, and not twice. */
export function canDeclareRestWeek(p: { rest_weeks: readonly string[]; week: string }): { ok: boolean; used: number; remaining: number; reason?: string } {
  const quota = CONSTANTS.streaks.rest_weeks_per_quarter;
  const used = restWeeksUsedInQuarter(p.rest_weeks, p.week);
  if (p.rest_weeks.includes(p.week)) return { ok: false, used, remaining: Math.max(0, quota - used), reason: "That week is already a rest week." };
  if (used >= quota) return { ok: false, used, remaining: 0, reason: `You have used both rest weeks for this quarter (${quota} per quarter).` };
  return { ok: true, used, remaining: quota - used - 1 };
}

/** A pause touches a week when it starts before the week ends and ends after the week starts (a pause that ends the instant a week begins does not touch it). */
const overlaps = (weekStart: number, weekEnd: number, from: IsoTimestamp, until: IsoTimestamp): boolean => toMs(from) < weekEnd && toMs(until) > weekStart;

/**
 * Evaluates a weekly streak from posting times. Completed weeks are settled in order; the current week is open until it ends, so a creator is
 * never marked as having missed a week that is still running.
 */
export function evaluateStreak(input: StreakInput): StreakState {
  const S = CONSTANTS.streaks;
  const nowMs = toMs(input.now);
  const currentWeek = isoWeek(input.now);
  const week_ends_at = isoWeekEnd(input.now);
  const posts = new Map<string, number>();
  for (const t of input.post_times) {
    if (toMs(t) > nowMs) continue;
    const w = isoWeek(t);
    posts.set(w, (posts.get(w) ?? 0) + 1);
  }
  const rest = new Set(input.rest_weeks ?? []);
  const pauses = input.pauses ?? [];
  const isPaused = (w: string): boolean => {
    const monday = isoWeekToStart(w);
    const start = toMs(monday);
    const end = toMs(isoWeekEnd(monday));
    return pauses.some((p) => overlaps(start, end, p.from, p.until));
  };

  const postedWeeks = [...posts.keys()].sort();
  const firstWeek = input.start_week ?? postedWeeks[0];
  const base = {
    iso_week: currentWeek,
    week_ends_at,
    posts_this_week: posts.get(currentWeek) ?? 0,
    posted_this_week: (posts.get(currentWeek) ?? 0) >= S.min_posts_per_week,
    rest_weeks_used_quarter: restWeeksUsedInQuarter([...rest], currentWeek),
  };
  if (!firstWeek || firstWeek > currentWeek) {
    const banked = Math.min(S.freeze_bank_max, input.starting_freezes ?? 0);
    return { ...base, status: "new", current_weeks: 0, best_weeks: 0, freezes_banked: banked, freezes_earned_total: 0, freezes_used_total: 0, next_freeze_in_weeks: 0, weeks_to_next_freeze: S.freeze_earned_every_weeks, history: [] };
  }

  let streak = 0;
  let best = 0;
  let run = 0; // posted weeks since the last break: what freezes are earned from
  let banked = Math.min(S.freeze_bank_max, input.starting_freezes ?? 0);
  let earned = 0;
  let used = 0;
  let slackRun = 0;
  const weeks: StreakWeek[] = [];

  const earnFreezeIfDue = (): void => {
    if (run > 0 && run % S.freeze_earned_every_weeks === 0 && banked < S.freeze_bank_max) {
      banked += 1;
      earned += 1;
    }
  };

  for (let w = firstWeek; w <= currentWeek; w = isoWeekAdd(w, 1)) {
    const count = posts.get(w) ?? 0;
    const isCurrent = w === currentWeek;
    if (count >= S.min_posts_per_week) {
      streak += 1;
      run += 1;
      best = Math.max(best, streak);
      slackRun = 0;
      earnFreezeIfDue();
      weeks.push({ iso_week: w, outcome: "posted", posts: count });
    } else if (rest.has(w) || isPaused(w)) {
      weeks.push({ iso_week: w, outcome: "rest", posts: count });
    } else if (isCurrent) {
      weeks.push({ iso_week: w, outcome: "open", posts: count });
    } else if (input.slack_mode && slackRun < S.slack_mode_weeks) {
      slackRun += 1;
      weeks.push({ iso_week: w, outcome: "rest", posts: count });
    } else if (banked > 0) {
      banked -= 1;
      used += 1;
      weeks.push({ iso_week: w, outcome: "freeze_used", posts: count });
    } else {
      streak = 0;
      run = 0;
      weeks.push({ iso_week: w, outcome: "missed", posts: count });
    }
  }

  const current = weeks[weeks.length - 1];
  const lastCompleted = weeks[weeks.length - 2];
  let status: StreakStatus;
  if (current.outcome === "posted") status = "active";
  else if (current.outcome === "rest") status = "resting";
  else if (!lastCompleted) status = streak > 0 ? "active" : "new";
  else if (lastCompleted.outcome === "freeze_used") status = "frozen";
  else if (lastCompleted.outcome === "rest") status = "resting";
  else if (lastCompleted.outcome === "missed") status = "broken";
  else status = "active";

  const history = weeks.filter((x) => !(x.iso_week === currentWeek && x.outcome === "open")).slice(-HISTORY_WEEKS);
  const toNext = (S.freeze_earned_every_weeks - (run % S.freeze_earned_every_weeks)) % S.freeze_earned_every_weeks;
  return {
    ...base,
    status,
    current_weeks: streak,
    best_weeks: best,
    freezes_banked: banked,
    freezes_earned_total: earned,
    freezes_used_total: used,
    next_freeze_in_weeks: toNext,
    weeks_to_next_freeze: toNext === 0 ? S.freeze_earned_every_weeks : toNext,
    history,
  };
}

/** Copy for the streak card. Calm and factual: it never says a streak can be "lost" and never nags. */
export function streakCopy(s: Pick<StreakState, "status" | "current_weeks" | "best_weeks" | "freezes_banked" | "weeks_to_next_freeze" | "posted_this_week">): { headline: string; detail: string } {
  const weeks = `${s.current_weeks}-week streak`;
  const freeze = s.freezes_banked > 0 ? `${s.freezes_banked} freeze${s.freezes_banked === 1 ? "" : "s"} banked.` : "No freezes banked yet.";
  const next = `Next freeze in ${s.weeks_to_next_freeze} week${s.weeks_to_next_freeze === 1 ? "" : "s"}.`;
  switch (s.status) {
    case "new":
      return { headline: "Start a streak", detail: "Post once this week to begin. A week counts when you post at least once." };
    case "active":
      return s.posted_this_week
        ? { headline: weeks, detail: `You have posted this week. ${freeze} ${next}` }
        : { headline: weeks, detail: `Post any time before the week ends to add a week. ${freeze}` };
    case "frozen":
      return { headline: weeks, detail: `A freeze covered last week, so your streak carried on. ${freeze}` };
    case "resting":
      return { headline: `${weeks}, resting`, detail: "Rest weeks keep your streak safe. Come back whenever you like." };
    case "broken":
      return { headline: "Fresh start", detail: `Your best was ${s.best_weeks} week${s.best_weeks === 1 ? "" : "s"}. Post once this week to begin a new streak.` };
  }
}
