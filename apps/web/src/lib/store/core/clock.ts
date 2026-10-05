/**
 * The demo clock, as admin actions. Moving it runs the platform's scheduled jobs in order (window closes, fraud check, clearing runs, the Friday payout
 * run, SLA timeouts...), exactly as production would; see `tick.ts` for what happens at each step.
 */

import { hoursBetween, iso, nextWeeklyPayout, toMs } from "@/lib/engine";
import { requireAdmin } from "./guards";
import { advanceHours, advanceTo, MAX_ADVANCE_HOURS, type TickSummary } from "./tick";
import { ensure, type Tx } from "./tx";

/** Moves the demo clock forward by a number of hours (admin only). 24 hours closes a window or two; 72 hours reaches a clearing run. */
export function advanceClock(tx: Tx, input: { hours: number }): TickSummary {
  requireAdmin(tx);
  ensure(Number.isFinite(input.hours) && input.hours > 0, "invalid_time", "Pick a number of hours above zero.", undefined, 422);
  ensure(input.hours <= MAX_ADVANCE_HOURS, "too_far", `Advance at most ${Math.round(MAX_ADVANCE_HOURS / 24)} days at a time.`, undefined, 422);
  return advanceHours(tx, input.hours);
}

/** Moves the demo clock to a given instant (admin only). */
export function advanceClockTo(tx: Tx, input: { to: string }): TickSummary {
  requireAdmin(tx);
  ensure(Number.isFinite(toMs(input.to)), "invalid_time", "That is not a valid date and time.", undefined, 422);
  return advanceTo(tx, iso(toMs(input.to)));
}

/** Moves the demo clock to the next Friday 18:00 UTC payout run, running everything on the way, so the run is real: cleared money is paid, holds stay held. */
export function runPayoutRun(tx: Tx): TickSummary & { run_at: string; hours_ahead: number } {
  requireAdmin(tx);
  const at = nextWeeklyPayout(tx.now);
  const hours = hoursBetween(tx.now, at);
  const summary = advanceTo(tx, at);
  return { ...summary, run_at: at, hours_ahead: Math.round(hours * 10) / 10 };
}
