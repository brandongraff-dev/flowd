/**
 * The demo clock. Advancing it runs the platform's scheduled jobs in order, exactly as production would:
 *
 *   hourly      views and conversions accrue; View Ledger snapshots every 6 hours inside the 72-hour window
 *   at 72 h     a post's window closes: the CPM (or flat) leg is settled; a flagged or non-compliant post is held with a named reason
 *   daily 14:00 clearing run: posts that passed the check clear, conversions clear after their own windows, platform earnings clear
 *   Fri 18:00   weekly payout run: cleared money is paid (free); holds stay held with their reason
 *   continuous  review SLA and its timeout policy, expiries, bounties starting / ending / settling, rights alerts, auctions, the Daily Drop
 *
 * It needs the heavy tables `conversions`, `post_metrics_daily`, `app_metrics_daily` and `view_snapshots` (the store loads them first).
 */

import type { IsoTimestamp } from "@/lib/contract/types";
import {
  CONSTANTS,
  DAY_MS,
  HOUR_MS,
  dateOf,
  formatMoney,
  hoursBetween,
  iso,
  isoWeek,
  postClearingRun,
  toMs,
  weekdayOf,
} from "@/lib/engine";
import { refreshAdminDoc, openFraudFlag } from "./admin";
import { clearConversions, clearDueRows, clearPostEarnings, completeTransfers, earningRows, executeWeeklyRun, scheduleWeekly, settlePostWindow } from "./earnings";
import { advanceAds, advanceBounties, advanceDrops, advanceReviewSla, advanceRights, advanceTournaments, expireStale, refreshAffectedCreators, settleAds } from "./lifecycle";
import { advanceAuctions, advanceSpecs } from "./marketplace";
import { expireOffers } from "./offers";
import { applyReferralRewards } from "./referrals";
import { growPosts } from "./simulate";
import { rolloverStreaks } from "./streaks";
import { ensure, type Tx } from "./tx";

/** The heavy tables the clock reads and writes. */
export const TICK_TABLES = ["conversions", "post_metrics_daily", "app_metrics_daily", "view_snapshots"] as const;

export interface TickSummary {
  from: IsoTimestamp;
  to: IsoTimestamp;
  hours: number;
  clearing_runs: number;
  payout_runs: number;
  views_added: number;
  conversions_added: number;
  windows_closed: number;
  posts_cleared: number;
  cleared_cents: number;
  payouts_paid: number;
  payouts_held: number;
  paid_out_cents: number;
  sla_breached: number;
  auto_approved: number;
  expired_submissions: number;
  released_to_spec_market: number;
  bounties_settled: number;
  rights_alerts: number;
  /** Plain-English lines for the admin demo-clock panel, in order. */
  log: string[];
}

/** The most the clock moves in one call (about five weeks): enough for a month-end demo, small enough to stay instant. */
export const MAX_ADVANCE_HOURS = 24 * 35;

/** Every scheduled instant in (from, to]: midnight, the 14:00 clearing run, the 16:00 Daily Drop and Friday 18:00 payout. */
export function scheduledInstants(from: IsoTimestamp, to: IsoTimestamp): IsoTimestamp[] {
  const out = new Set<number>();
  const start = Math.floor(toMs(from) / DAY_MS) * DAY_MS;
  for (let day = start; day <= toMs(to); day += DAY_MS) {
    const hours = [0, CONSTANTS.windows.clearing_run_hour_utc, CONSTANTS.daily_drop.hour_utc];
    if (new Date(day).getUTCDay() === CONSTANTS.windows.weekly_payout_weekday_utc) hours.push(CONSTANTS.windows.weekly_payout_hour_utc);
    for (const h of hours) {
      const t = day + h * HOUR_MS;
      if (t > toMs(from) && t <= toMs(to)) out.add(t);
    }
  }
  return [...out].sort((a, b) => a - b).map(iso);
}

const isClearingRun = (t: IsoTimestamp): boolean => t.slice(11, 19) === `${String(CONSTANTS.windows.clearing_run_hour_utc).padStart(2, "0")}:00:00`;
const isPayoutRun = (t: IsoTimestamp): boolean => weekdayOf(t) === CONSTANTS.windows.weekly_payout_weekday_utc && t.slice(11, 19) === `${String(CONSTANTS.windows.weekly_payout_hour_utc).padStart(2, "0")}:00:00`;

/** Closes the 72-hour window of every live post whose window ended by `at`. */
function closeWindows(tx: Tx, at: IsoTimestamp, summary: TickSummary): void {
  for (const p of tx.all("posts")) {
    if (p.status !== "live" || toMs(p.window_ends_at) > toMs(at)) continue;
    const r = settlePostWindow(tx, p.id);
    summary.windows_closed += 1;
    if (r.held === "fraud_review") openFraudFlag(tx, r.post);
    if (r.held) summary.log.push(`${r.post.id}: window closed, ${formatMoney(r.pay_cents)} held (${r.held.replace(/_/g, " ")})`);
  }
}

/** The 14:00 UTC clearing run. */
function clearingRun(tx: Tx, at: IsoTimestamp, summary: TickSummary): void {
  const affected = new Set<string>();
  for (const p of tx.all("posts")) {
    if (p.status !== "window_closed" || toMs(postClearingRun(p.window_ends_at)) > toMs(at)) continue;
    const { cleared_cents } = clearPostEarnings(tx, p.id, at);
    summary.posts_cleared += 1;
    summary.cleared_cents += cleared_cents;
    affected.add(p.creator_id);
  }
  const conv = clearConversions(tx, at);
  summary.cleared_cents += conv.cleared_cents;
  clearDueRows(tx, at);
  for (const e of tx.all("ledger")) if (e.status === "cleared" && !e.payout_id && e.cleared_at === at && e.account.startsWith("creator:")) affected.add(e.account.slice("creator:".length));
  refreshAffectedCreators(tx, affected);
  for (const id of affected) applyReferralRewards(tx, id, at);
  for (const id of affected) scheduleWeekly(tx, id);
  summary.clearing_runs += 1;
  summary.log.push(`${at.slice(0, 16).replace("T", " ")} UTC clearing run: ${summary.posts_cleared} posts, ${conv.batches} conversion batches cleared`);
}

/** The Friday 18:00 UTC weekly payout run, then the settlement of running ads. */
function payoutRun(tx: Tx, at: IsoTimestamp, summary: TickSummary): void {
  const r = executeWeeklyRun(tx, at);
  summary.payout_runs += 1;
  summary.payouts_paid += r.paid;
  summary.payouts_held += r.held;
  summary.paid_out_cents += r.net_cents;
  // A post whose earnings are all paid reads "paid".
  for (const p of tx.all("posts")) {
    if (p.status !== "cleared") continue;
    const open = earningRows(tx, p.creator_id).some((e) => e.post_id === p.id && (e.status === "pending" || e.status === "cleared" || e.status === "held"));
    if (!open) tx.patch("posts", p.id, { status: "paid", paid_at: at });
  }
  settleAds(tx);
  summary.log.push(`${at.slice(0, 16).replace("T", " ")} UTC payout run: ${r.paid} paid (${formatMoney(r.net_cents)}), ${r.held} held`);
}

/** The state-only steps that run at every instant. */
function everyInstant(tx: Tx, prev: IsoTimestamp, summary: TickSummary): void {
  const sla = advanceReviewSla(tx);
  summary.sla_breached += sla.breached;
  summary.auto_approved += sla.auto_approved;
  const stale = expireStale(tx);
  summary.expired_submissions += stale.expired;
  summary.released_to_spec_market += stale.released;
  const bounties = advanceBounties(tx);
  summary.bounties_settled += bounties.settled;
  const rights = advanceRights(tx);
  summary.rights_alerts += rights.alerts;
  advanceAuctions(tx);
  advanceSpecs(tx);
  expireOffers(tx);
  advanceDrops(tx);
  advanceTournaments(tx);
  advanceAds(tx, dateOf(prev), dateOf(tx.now));
  completeTransfers(tx);
  if (isoWeek(prev) !== isoWeek(tx.now)) rolloverStreaks(tx);
}

/** Advances the demo clock to `target`, running every scheduled job on the way. */
export function advanceTo(tx: Tx, target: IsoTimestamp): TickSummary {
  const from = tx.now;
  const hours = hoursBetween(from, target);
  ensure(hours > 0, "invalid_time", "The demo clock only moves forward.", undefined, 422);
  ensure(hours <= MAX_ADVANCE_HOURS, "too_far", `Advance at most ${Math.round(MAX_ADVANCE_HOURS / 24)} days at a time.`, undefined, 422);
  for (const t of TICK_TABLES) ensure(tx.state.loaded[t] === true, "tables_not_loaded", "The demo data for the clock is still loading.", "Try again in a moment.", 409);
  const summary: TickSummary = {
    from, to: target, hours: Math.round(hours * 10) / 10, clearing_runs: 0, payout_runs: 0, views_added: 0, conversions_added: 0, windows_closed: 0, posts_cleared: 0, cleared_cents: 0, payouts_paid: 0, payouts_held: 0, paid_out_cents: 0, sla_breached: 0, auto_approved: 0, expired_submissions: 0, released_to_spec_market: 0, bounties_settled: 0, rights_alerts: 0, log: [],
  };
  const startAdvanced = tx.state.clock.advanced_hours;
  const stops = [...scheduledInstants(from, target), target].filter((t, i, a) => a.indexOf(t) === i);
  for (const at of stops) {
    const prev = tx.now;
    const grown = growPosts(tx, prev, at);
    summary.views_added += grown.views;
    summary.conversions_added += grown.conversions;
    tx.setClock(at, startAdvanced + hoursBetween(from, at));
    closeWindows(tx, at, summary);
    if (isClearingRun(at)) clearingRun(tx, at, summary);
    if (isPayoutRun(at)) payoutRun(tx, at, summary);
    everyInstant(tx, prev, summary);
  }
  refreshAdminDoc(tx);
  return summary;
}

/** Advances by a number of hours. */
export const advanceHours = (tx: Tx, hours: number): TickSummary => advanceTo(tx, iso(toMs(tx.now) + Math.round(hours * HOUR_MS)));
