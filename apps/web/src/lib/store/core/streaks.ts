/**
 * Weekly streaks, kept honest and incremental.
 *
 * A week counts when the creator posts at least once in the ISO week (Monday to Sunday UTC). One freeze is earned for every 4 weeks of streak (at most 2
 * banked); a missed week spends a freeze if one is banked, otherwise the streak restarts (the best streak is kept). Declared rest weeks, pause and
 * Wellbeing slack mode keep the streak without counting a week. There is no inactivity penalty and no guilt copy: the current week with no post yet is
 * just "open".
 *
 * The streak row is updated from events (a post, a week ending) rather than recomputed from scratch, so the numbers a creator already sees do not
 * jump; creators without a streak row get one from the engine's `evaluateStreak` over their post history.
 */

import type { IsoTimestamp, Streak, WeekRecord } from "@/lib/contract/types";
import { CONSTANTS, evaluateStreak, isoWeek, isoWeekAdd, isoWeekEnd, isoWeekToStart, toMs } from "@/lib/engine";
import type { Tx } from "./tx";

const HISTORY = 12;

/** Sunday 23:59:59Z that ends an ISO week label ("2026-W41"). */
const weekEndsAt = (label: string): IsoTimestamp => isoWeekEnd(isoWeekToStart(label));

const weeksToNextFreeze = (current: number): number => (current % CONSTANTS.streaks.freeze_earned_every_weeks === 0 ? 0 : CONSTANTS.streaks.freeze_earned_every_weeks - (current % CONSTANTS.streaks.freeze_earned_every_weeks)) % 4;

function fromHistory(tx: Tx, creatorId: string): Streak {
  const creator = tx.must("creators", creatorId, "Creator");
  const wb = tx.all("wellbeing_settings").find((w) => w.creator_id === creatorId);
  const postTimes = tx.all("posts").filter((p) => p.creator_id === creatorId && p.status !== "removed").map((p) => p.posted_at);
  const state = evaluateStreak({ post_times: postTimes, now: tx.now, rest_weeks: wb?.rest_weeks ?? [], slack_mode: wb?.slack_mode ?? false });
  const history: WeekRecord[] = state.history.map((w) => ({ iso_week: w.iso_week, outcome: w.outcome === "open" ? "missed" : w.outcome, posts: w.posts }));
  return {
    id: `stk_${creator.handle.replace(/\./g, "_")}`,
    creator_id: creatorId,
    status: state.status,
    current_weeks: state.current_weeks,
    best_weeks: state.best_weeks,
    freezes_banked: state.freezes_banked,
    freezes_earned_total: state.freezes_earned_total,
    freezes_used_total: state.freezes_used_total,
    rest_weeks_used_quarter: state.rest_weeks_used_quarter,
    iso_week: state.iso_week,
    posts_this_week: state.posts_this_week,
    posted_this_week: state.posted_this_week,
    week_ends_at: state.week_ends_at,
    next_freeze_in_weeks: state.next_freeze_in_weeks,
    history,
    updated_at: tx.now,
  };
}

/** A post was made: this week counts, the streak grows if it is the first post of the week, and a freeze is earned at every 4th week. */
export function recordPostInStreak(tx: Tx, creatorId: string): Streak {
  const existing = tx.all("streaks").find((s) => s.creator_id === creatorId);
  const week = isoWeek(tx.now);
  let row = existing ? rollWeek(existing, tx.now) : fromHistory(tx, creatorId);
  if (existing) {
    const first = !row.posted_this_week;
    let current = row.current_weeks;
    let banked = row.freezes_banked;
    let earned = row.freezes_earned_total;
    if (first) {
      current = row.status === "broken" || row.status === "new" ? 1 : current + 1;
      if (current % CONSTANTS.streaks.freeze_earned_every_weeks === 0) {
        earned += 1;
        banked = Math.min(CONSTANTS.streaks.freeze_bank_max, banked + 1);
      }
    }
    const history = row.history.map((w) => (w.iso_week === week ? { ...w, outcome: "posted" as const, posts: w.posts + 1 } : w));
    if (!history.some((w) => w.iso_week === week)) history.push({ iso_week: week, outcome: "posted", posts: 1 });
    row = {
      ...row,
      status: "active",
      current_weeks: current,
      best_weeks: Math.max(row.best_weeks, current),
      freezes_banked: banked,
      freezes_earned_total: earned,
      posts_this_week: row.posts_this_week + 1,
      posted_this_week: true,
      next_freeze_in_weeks: weeksToNextFreeze(current),
      history: history.slice(-HISTORY),
      updated_at: tx.now,
    };
  }
  tx.put("streaks", row);
  const creator = tx.must("creators", creatorId);
  if (creator.streak_weeks !== row.current_weeks) tx.patch("creators", creatorId, { streak_weeks: row.current_weeks });
  return row;
}

/** Brings a streak row up to the ISO week of `now`: the weeks that ended since it was last touched are scored (posted, freeze used, rest or missed). */
function rollWeek(row: Streak, now: IsoTimestamp): Streak {
  const week = isoWeek(now);
  if (row.iso_week === week) return row;
  let current = row.current_weeks;
  let banked = row.freezes_banked;
  let used = row.freezes_used_total;
  let status = row.status;
  const history = [...row.history];
  // The week the row stood on has ended: score it, then any whole weeks in between were missed.
  let cursor = row.iso_week;
  let posted = row.posted_this_week;
  for (let guard = 0; cursor !== week && guard < 60; guard += 1) {
    const idx = history.findIndex((w) => w.iso_week === cursor);
    if (posted) {
      if (idx >= 0) history[idx] = { ...history[idx], outcome: "posted" };
    } else if (banked > 0 && current > 0) {
      banked -= 1;
      used += 1;
      status = "frozen";
      if (idx >= 0) history[idx] = { ...history[idx], outcome: "freeze_used" };
      else history.push({ iso_week: cursor, outcome: "freeze_used", posts: 0 });
    } else {
      current = 0;
      status = "broken";
      if (idx >= 0) history[idx] = { ...history[idx], outcome: "missed" };
      else history.push({ iso_week: cursor, outcome: "missed", posts: 0 });
    }
    cursor = isoWeekAdd(cursor, 1);
    posted = false;
  }
  if (!history.some((w) => w.iso_week === week)) history.push({ iso_week: week, outcome: "missed", posts: 0 });
  return {
    ...row,
    status,
    current_weeks: current,
    freezes_banked: banked,
    freezes_used_total: used,
    iso_week: week,
    posts_this_week: 0,
    posted_this_week: false,
    week_ends_at: weekEndsAt(week),
    next_freeze_in_weeks: weeksToNextFreeze(current),
    history: history.slice(-HISTORY),
  };
}

/** Called when the demo clock crosses into a new ISO week: every streak is scored for the weeks that ended. */
export function rolloverStreaks(tx: Tx): number {
  let changed = 0;
  for (const s of tx.all("streaks")) {
    if (s.iso_week === isoWeek(tx.now)) continue;
    const creator = tx.get("creators", s.creator_id);
    if (!creator) continue;
    const paused = creator.paused_until && toMs(creator.paused_until) > toMs(tx.now);
    const next = paused ? { ...s, iso_week: isoWeek(tx.now), posts_this_week: 0, posted_this_week: false, week_ends_at: weekEndsAt(isoWeek(tx.now)), status: "resting" as const } : rollWeek(s, tx.now);
    tx.put("streaks", { ...next, updated_at: tx.now });
    if (creator.streak_weeks !== next.current_weeks) tx.patch("creators", creator.id, { streak_weeks: next.current_weeks });
    changed += 1;
  }
  return changed;
}
