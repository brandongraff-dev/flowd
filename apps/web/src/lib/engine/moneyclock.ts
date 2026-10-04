/**
 * The Money Clock: when earnings clear, when they pay, and why.
 *
 * Post earnings accrue while the 72-hour window is open (a live estimate), then window_closed, then an automated fraud and
 * disclosure check (done within 12 hours), then they clear at the first daily clearing run (14:00 UTC) at or after window end + 2 h,
 * then pay out on the next weekly run (Friday 18:00 UTC) or an instant cash-out. Conversion (CPA) earnings clear after the clearing
 * window of their kind (install 24 h, trial 72 h, paid 168 h), then at the next 14:00 UTC run.
 *
 * Every non-final state carries a dated ETA and a named reason. A bare "pending" is a bug.
 */

import {
  MONEY_CLOCK_REASON_META,
  type ConversionKind,
  type HoldReason,
  type IsoTimestamp,
  type MoneyClockReason,
  type MoneyClockRow,
  type MoneyClockState,
  type Payout,
  type Tier,
} from "@/lib/contract/types";
import { CONSTANTS, tierPerks } from "./constants";
import { formatMoney, formatPercent, mulRate } from "./money";
import { clamp } from "./stats";
import { addHours, addMinutes, clockLabel, dateOf, hoursBetween, isoWeek, iso, nextWeeklyAt, toMs, HOUR_MS, DAY_MS, dayStart } from "./time";

// ── the schedule ───────────────────────────────────────────────────────────────────────────────

/** First daily clearing run (14:00:00Z) at or after an instant. */
export function firstRunAtOrAfter(isoStr: IsoTimestamp, hourUtc: number = CONSTANTS.windows.clearing_run_hour_utc): IsoTimestamp {
  const base = toMs(dayStart(isoStr)) + hourUtc * HOUR_MS;
  return iso(base >= toMs(isoStr) ? base : base + DAY_MS);
}

/** When a post's window closes: posted + 72 h. */
export const windowEndsAt = (postedAt: IsoTimestamp): IsoTimestamp => addHours(postedAt, CONSTANTS.windows.view_window_hours);

/** Clearing run for a post: the first daily run at or after window end + 2 h buffer (if the fraud check passes). */
export const postClearingRun = (windowEnd: IsoTimestamp): IsoTimestamp => firstRunAtOrAfter(addHours(windowEnd, CONSTANTS.windows.clearing_buffer_hours));

/** Clearing run for a conversion: occurred + 24 h (install) / 72 h (trial) / 168 h (paid), then the next run. */
export const conversionClearingRun = (kind: ConversionKind, occurredAt: IsoTimestamp): IsoTimestamp =>
  firstRunAtOrAfter(addHours(occurredAt, CONSTANTS.windows.cpa_clear_hours[kind]));

/**
 * Clearing run of a CPA conversion on a post: its own clearing window, but never before the post's own clearing run. The CPM leg is settled first and
 * the per-video cap applies to CPM and CPA together, so a conversion cannot be paid ahead of the views it shares a cap with.
 */
export function conversionRunOnPost(kind: ConversionKind, occurredAt: IsoTimestamp, postedAt: IsoTimestamp): IsoTimestamp {
  const own = conversionClearingRun(kind, occurredAt);
  const post = postClearingRun(windowEndsAt(postedAt));
  return toMs(own) >= toMs(post) ? own : post;
}

/** The weekly payout run (Friday 18:00Z) that pays an item cleared at `clearedAt`: the first Friday run at or after it. */
export function weeklyPayoutFor(clearedAt: IsoTimestamp): IsoTimestamp {
  return nextWeeklyAt(iso(toMs(clearedAt) - 1000), CONSTANTS.windows.weekly_payout_weekday_utc, CONSTANTS.windows.weekly_payout_hour_utc);
}

/** The next weekly payout run strictly after `now`. */
export const nextWeeklyPayout = (now: IsoTimestamp): IsoTimestamp => nextWeeklyAt(now, CONSTANTS.windows.weekly_payout_weekday_utc, CONSTANTS.windows.weekly_payout_hour_utc);

/** The next `count` weekly payout runs after `now`, oldest first. */
export function payoutSchedule(now: IsoTimestamp, count: number): IsoTimestamp[] {
  const out: IsoTimestamp[] = [];
  let cursor = now;
  for (let i = 0; i < count; i += 1) {
    const next = nextWeeklyPayout(cursor);
    out.push(next);
    cursor = next;
  }
  return out;
}

/** The next daily clearing run strictly after `now`. */
export const nextClearingRun = (now: IsoTimestamp): IsoTimestamp => firstRunAtOrAfter(iso(toMs(now) + 1000));

/** The run id of a weekly payout: "run_2026-10-09". */
export const payoutRunId = (runAt: IsoTimestamp): string => `run_${dateOf(runAt)}`;

// ── state of one earning ───────────────────────────────────────────────────────────────────────

/** Maps a hold to the Money Clock reason that names it. Manual Ops holds read as a compliance-style hold with the reason shown. */
export const HOLD_TO_REASON: Readonly<Record<HoldReason, MoneyClockReason>> = {
  fraud_review: "held_fraud_review",
  dispute_open: "held_dispute",
  tax_info_missing: "held_tax_info",
  identity_check: "held_identity_check",
  payout_method_missing: "held_payout_method",
  compliance_fail: "held_compliance",
  admin_hold: "held_compliance",
};

export interface EarningClock {
  state: MoneyClockState;
  reason: MoneyClockReason;
  /** When it moves to the next state. Absent for held, paid and reversed rows. */
  eta_at?: IsoTimestamp;
  /** The 72-hour window end (post earnings only). */
  window_ends_at?: IsoTimestamp;
  cleared_at?: IsoTimestamp;
  /** When the payout that carries this money was initiated. */
  paid_at?: IsoTimestamp;
  /** A payout in transit: when it lands in the bank (reason `payout_in_transit`). */
  arrives_at?: IsoTimestamp;
}

/**
 * Paid, or paid and still on its way: once a payout is initiated the money is `paid`, and the reason reads `payout_in_transit` (with the arrival)
 * until the transfer lands.
 */
function paidClock(p: { cleared_at: IsoTimestamp; paid_at: IsoTimestamp; now: IsoTimestamp; payout_arrives_at?: IsoTimestamp }): EarningClock {
  if (p.payout_arrives_at && toMs(p.payout_arrives_at) > toMs(p.now)) return { state: "paid", reason: "payout_in_transit", cleared_at: p.cleared_at, paid_at: p.paid_at, arrives_at: p.payout_arrives_at };
  return { state: "paid", reason: "paid_out", cleared_at: p.cleared_at, paid_at: p.paid_at };
}

/**
 * Money Clock state of a post's CPM earnings at `now`.
 *   accruing  while the window is open (reason window_open, eta = the clearing run after it)
 *   held      when a hold applies (reason names it; no ETA, the next step is named instead)
 *   pending   window closed, before the clearing run (reason fraud_check for the first 12 h, then awaiting_clearing_run)
 *   cleared   run executed; waits for the weekly payout (reason awaiting_weekly_payout, eta = Friday 18:00 UTC)
 *   paid      when `paid_at` (the payout's initiation) is given, or `assume_weekly_payout` and the weekly run has executed; while the transfer is
 *             still on its way (`payout_arrives_at` in the future) the reason is payout_in_transit
 *   reversed  after a clawback
 */
export function moneyClockState(p: {
  posted_at: IsoTimestamp;
  now: IsoTimestamp;
  held?: boolean;
  hold_reason?: HoldReason;
  paid_at?: IsoTimestamp;
  /** When the payout that carries this money lands in the bank. Omit once it has landed. */
  payout_arrives_at?: IsoTimestamp;
  reversed?: boolean;
  assume_weekly_payout?: boolean;
}): EarningClock {
  const windowEnd = windowEndsAt(p.posted_at);
  const base = { window_ends_at: windowEnd };
  if (p.reversed) return { state: "reversed", reason: "reversed_clawback", ...base };
  if (toMs(p.now) < toMs(windowEnd)) {
    if (p.held) return { state: "held", reason: HOLD_TO_REASON[p.hold_reason ?? "fraud_review"], ...base };
    return { state: "accruing", reason: "window_open", eta_at: postClearingRun(windowEnd), ...base };
  }
  if (p.held) return { state: "held", reason: HOLD_TO_REASON[p.hold_reason ?? "fraud_review"], ...base };
  const run = postClearingRun(windowEnd);
  if (toMs(run) <= toMs(p.now)) {
    const payAt = weeklyPayoutFor(run);
    if (p.paid_at && toMs(p.paid_at) <= toMs(p.now)) return { ...paidClock({ cleared_at: run, paid_at: p.paid_at, now: p.now, payout_arrives_at: p.payout_arrives_at }), ...base };
    if (p.assume_weekly_payout && toMs(payAt) <= toMs(p.now)) return { state: "paid", reason: "paid_out", cleared_at: run, paid_at: payAt, ...base };
    return { state: "cleared", reason: "awaiting_weekly_payout", eta_at: payAt, cleared_at: run, ...base };
  }
  const fraudDeadline = addHours(windowEnd, CONSTANTS.windows.fraud_check_max_hours);
  return { state: "pending", reason: toMs(p.now) < toMs(fraudDeadline) ? "fraud_check" : "awaiting_clearing_run", eta_at: run, ...base };
}

/**
 * Money Clock state of a CPA conversion at `now`: pending (reason conversion_clearing) until the first 14:00 UTC run after its
 * clearing window, then cleared and waiting for the weekly payout; paid (or in transit) once a payout carries it.
 * Pass `post_posted_at` for a conversion on a post: it then waits for the post's own clearing run too (accruing, reason window_open, while the
 * post's 72-hour window is still open), because the CPM leg settles first and the per-video cap covers both.
 */
export function conversionClockState(p: {
  kind: ConversionKind;
  occurred_at: IsoTimestamp;
  now: IsoTimestamp;
  post_posted_at?: IsoTimestamp;
  held?: boolean;
  hold_reason?: HoldReason;
  paid_at?: IsoTimestamp;
  payout_arrives_at?: IsoTimestamp;
  reversed?: boolean;
}): EarningClock {
  if (p.reversed) return { state: "reversed", reason: "reversed_clawback" };
  if (p.held) return { state: "held", reason: HOLD_TO_REASON[p.hold_reason ?? "fraud_review"] };
  const run = p.post_posted_at ? conversionRunOnPost(p.kind, p.occurred_at, p.post_posted_at) : conversionClearingRun(p.kind, p.occurred_at);
  if (toMs(run) > toMs(p.now)) {
    const windowEnd = p.post_posted_at ? windowEndsAt(p.post_posted_at) : undefined;
    if (windowEnd && toMs(p.now) < toMs(windowEnd)) return { state: "accruing", reason: "window_open", eta_at: run, window_ends_at: windowEnd };
    return { state: "pending", reason: "conversion_clearing", eta_at: run };
  }
  if (p.paid_at && toMs(p.paid_at) <= toMs(p.now)) return paidClock({ cleared_at: run, paid_at: p.paid_at, now: p.now, payout_arrives_at: p.payout_arrives_at });
  return { state: "cleared", reason: "awaiting_weekly_payout", eta_at: weeklyPayoutFor(run), cleared_at: run };
}

/**
 * When a payout that was initiated at `initiatedAt` is expected to land: an instant cash-out in about 30 minutes, a weekly bank payout at
 * 15:00 UTC on the next banking day (a Friday run arrives Monday). An estimate for the "arrives" copy; the payment partner's own date wins when known.
 */
export function estimatePayoutArrival(p: { kind: "weekly" | "instant"; initiated_at: IsoTimestamp }): IsoTimestamp {
  if (p.kind === "instant") return addMinutes(p.initiated_at, 30);
  let day = toMs(dayStart(p.initiated_at)) + DAY_MS;
  while (new Date(day).getUTCDay() === 0 || new Date(day).getUTCDay() === 6) day += DAY_MS;
  return iso(day + 15 * HOUR_MS);
}

// ── words ──────────────────────────────────────────────────────────────────────────────────────

/** The UI shows accruing and pending together as Pending; the data keeps them apart. */
export type UiMoneyState = "Pending" | "Cleared" | "Paid" | "Held" | "Reversed";

export function uiState(state: MoneyClockState): UiMoneyState {
  switch (state) {
    case "accruing":
    case "pending":
      return "Pending";
    case "cleared":
      return "Cleared";
    case "paid":
      return "Paid";
    case "held":
      return "Held";
    case "reversed":
      return "Reversed";
  }
}

/** "Sat 2:00 PM UTC". */
const utc = (isoStr: IsoTimestamp): string => `${clockLabel(isoStr)} UTC`;

/** The named next step for a hold. Every hold names what releases it. */
const HOLD_STEP: Partial<Record<MoneyClockReason, string>> = {
  held_fraud_review: "A person is reviewing the views and decides within 24 hours.",
  held_dispute: "Held while your dispute is open. It releases as soon as the dispute is resolved.",
  held_tax_info: "Add your W-9 to release this payout.",
  held_identity_check: "Verify your identity to release this payout.",
  held_payout_method: "Add a bank account or debit card to release this payout.",
  held_compliance: "The posted video failed the disclosure check. Fix the caption to release it.",
};

/**
 * Plain English for a Money Clock row, always with the date. Never a bare "pending".
 *  - "Views still counting until Tue 6:30 PM UTC. Clears Wed 2:00 PM UTC after the view check."
 *  - "Cleared. Pays out Fri 6:00 PM UTC (weekly payout, free)."
 */
export function reasonText(p: { reason: MoneyClockReason; eta_at?: IsoTimestamp; window_ends_at?: IsoTimestamp; arrives_at?: IsoTimestamp }): string {
  const eta = p.eta_at ? utc(p.eta_at) : null;
  switch (p.reason) {
    case "window_open":
      return p.window_ends_at && eta ? `Views still counting until ${utc(p.window_ends_at)}. Clears ${eta} after the view check.` : eta ? `Views still counting. Clears ${eta} after the view check.` : "Views still counting.";
    case "fraud_check":
      return eta ? `View check running (done within ${CONSTANTS.windows.fraud_check_max_hours} hours). Clears ${eta}.` : "View check running.";
    case "awaiting_clearing_run":
      return eta ? `Clears at the next daily run, ${eta}.` : "Waiting for the next daily clearing run.";
    case "conversion_clearing":
      return eta ? `Conversion in its clearing window. Clears ${eta}.` : "Conversion in its clearing window.";
    case "awaiting_weekly_payout":
      return eta ? `Cleared. Pays out ${eta} (weekly payout, free).` : "Cleared. Pays out on the next weekly run.";
    case "payout_in_transit":
      return p.arrives_at ? `On its way to your bank. Arrives ${utc(p.arrives_at)}.` : "On its way to your bank.";
    case "paid_out":
      return "Paid out.";
    case "reversed_clawback":
      return "Reversed: views or conversions were found invalid. Legitimate views already delivered are still paid.";
    default:
      return HOLD_STEP[p.reason] ?? MONEY_CLOCK_REASON_META[p.reason].meaning ?? MONEY_CLOCK_REASON_META[p.reason].label;
  }
}

/** True when a reason is one of the named holds. */
export const isHoldReason = (reason: MoneyClockReason): boolean => reason.startsWith("held_");

export interface EarningDescription {
  ui_state: UiMoneyState;
  state: MoneyClockState;
  reason: MoneyClockReason;
  /** "Views still counting", "Next weekly payout". */
  reason_label: string;
  /** The full dated sentence. */
  reason_text: string;
  eta_at?: IsoTimestamp;
  /** "Clears Sat 2:00 PM UTC" / "Pays Fri 6:00 PM UTC" / "Arrives Mon 3:00 PM UTC", absent when there is no date. */
  eta_label?: string;
}

/** Everything a row needs to render: state chip, dated ETA, named reason. */
export function describeEarning(clock: EarningClock): EarningDescription {
  const verb = clock.state === "cleared" ? "Pays" : "Clears";
  return {
    ui_state: uiState(clock.state),
    state: clock.state,
    reason: clock.reason,
    reason_label: MONEY_CLOCK_REASON_META[clock.reason].label,
    reason_text: reasonText({ reason: clock.reason, eta_at: clock.eta_at, window_ends_at: clock.window_ends_at, arrives_at: clock.arrives_at }),
    eta_at: clock.eta_at,
    eta_label: clock.eta_at ? `${verb} ${utc(clock.eta_at)}` : clock.arrives_at ? `Arrives ${utc(clock.arrives_at)}` : undefined,
  };
}

/** A violation message when a row would render as a bare "pending" (no ETA or no reason on a non-final state). Null when fine. */
export function bareStateProblem(row: Pick<MoneyClockRow, "state" | "eta_at" | "reason">): string | null {
  const needsEta = row.state === "accruing" || row.state === "pending" || row.state === "cleared";
  if (!row.reason) return `A ${row.state} row has no reason.`;
  if (needsEta && !row.eta_at) return `A ${row.state} row has no dated ETA.`;
  if (row.state === "held" && !isHoldReason(row.reason)) return "A held row must carry a held_* reason.";
  return null;
}

// ── totals ─────────────────────────────────────────────────────────────────────────────────────

export interface MoneyClockSummary {
  /** accruing + pending, shown together as Pending (a live estimate while accruing). */
  pending_cents: number;
  accruing_cents: number;
  /** Cleared and waiting for the weekly payout. */
  cleared_cents: number;
  held_cents: number;
  paid_cents: number;
  /** Earliest ETA among accruing and pending rows: the next clearing run that matters. */
  next_clearing_at?: IsoTimestamp;
  /** The weekly payout that will carry the cleared money, when there is any. */
  next_payout_at?: IsoTimestamp;
}

/**
 * Totals per state. Pending and cleared are returned side by side and never summed: the wallet shows them as two numbers.
 * `now` is used to name the next weekly payout.
 */
export function summarizeMoneyClock(rows: readonly Pick<MoneyClockRow, "state" | "amount_cents" | "eta_at">[], now: IsoTimestamp): MoneyClockSummary {
  const out: MoneyClockSummary = { pending_cents: 0, accruing_cents: 0, cleared_cents: 0, held_cents: 0, paid_cents: 0 };
  let nextClearing: IsoTimestamp | undefined;
  for (const r of rows) {
    if (r.state === "accruing") {
      out.accruing_cents += r.amount_cents;
      out.pending_cents += r.amount_cents;
    } else if (r.state === "pending") out.pending_cents += r.amount_cents;
    else if (r.state === "cleared") out.cleared_cents += r.amount_cents;
    else if (r.state === "held") out.held_cents += r.amount_cents;
    else if (r.state === "paid") out.paid_cents += r.amount_cents;
    if ((r.state === "accruing" || r.state === "pending") && r.eta_at && (!nextClearing || toMs(r.eta_at) < toMs(nextClearing))) nextClearing = r.eta_at;
  }
  if (nextClearing) out.next_clearing_at = nextClearing;
  if (out.cleared_cents > 0) out.next_payout_at = nextWeeklyPayout(now);
  return out;
}

// ── the timeline of one post ───────────────────────────────────────────────────────────────────

export interface TimelineStep {
  id: "posted" | "window_closes" | "fraud_check" | "cleared" | "paid";
  label: string;
  /** The instant, or the planned instant when not done yet. */
  at: IsoTimestamp;
  done: boolean;
}

/** posted, window closes, fraud check, cleared, payout, each with a timestamp and whether it has happened by `now`. */
export function postTimeline(p: { posted_at: IsoTimestamp; now: IsoTimestamp }): TimelineStep[] {
  const windowEnd = windowEndsAt(p.posted_at);
  const check = addHours(windowEnd, CONSTANTS.windows.fraud_check_max_hours);
  const run = postClearingRun(windowEnd);
  const pay = weeklyPayoutFor(run);
  const done = (at: IsoTimestamp): boolean => toMs(at) <= toMs(p.now);
  return [
    { id: "posted", label: "Posted. The 72-hour view window opens.", at: p.posted_at, done: done(p.posted_at) },
    { id: "window_closes", label: "View window closes. Verified views are final.", at: windowEnd, done: done(windowEnd) },
    { id: "fraud_check", label: "View and disclosure check finishes (within 12 hours).", at: check, done: done(check) },
    { id: "cleared", label: "Cleared at the daily 14:00 UTC run.", at: run, done: done(run) },
    { id: "paid", label: "Paid in the weekly payout (Friday 18:00 UTC).", at: pay, done: done(pay) },
  ];
}

// ── instant cash-out ───────────────────────────────────────────────────────────────────────────

export type InstantRefusal = "below_minimum" | "exceeds_cleared";

export interface InstantPayoutQuote {
  ok: boolean;
  reason?: InstantRefusal;
  /** What the creator pays: 0 when a perk makes it free. */
  fee_cents: number;
  net_cents: number;
  free_instant: boolean;
  /** The fee without perks: clamp(round(1.5% x amount), $0.50, $15). Shown struck through when free. */
  list_fee_cents: number;
}

/**
 * Instant cash-out: fee = clamp(round(1.5% x amount), $0.50, $15). Free for Platinum and Elite (unlimited), for Gold once per ISO
 * week, and for Founding creators during their first 12 months. Weekly payouts are always free. Minimum cash-out $5.00.
 * The fee and the net are shown before the confirm button enables.
 */
export function instantPayout(p: {
  amount_cents: number;
  tier: Tier;
  founding_free?: boolean;
  free_instant_used_this_week?: number;
  /** When given, an amount above what is cleared is refused. */
  cleared_cents?: number;
}): InstantPayoutQuote {
  const F = CONSTANTS.fees;
  if (p.amount_cents < F.instant_min_amount_cents) return { ok: false, reason: "below_minimum", fee_cents: 0, net_cents: 0, free_instant: false, list_fee_cents: 0 };
  if (p.cleared_cents !== undefined && p.amount_cents > p.cleared_cents) return { ok: false, reason: "exceeds_cleared", fee_cents: 0, net_cents: 0, free_instant: false, list_fee_cents: 0 };
  const perks = tierPerks(p.tier);
  const free = Boolean(p.founding_free) || perks.instant_cashout_unlimited || (p.free_instant_used_this_week ?? 0) < perks.instant_cashout_free_per_week;
  const list = clamp(mulRate(p.amount_cents, F.instant_payout_rate), F.instant_payout_min_cents, F.instant_payout_max_cents);
  const fee = free ? 0 : list;
  return { ok: true, fee_cents: fee, net_cents: p.amount_cents - fee, free_instant: free, list_fee_cents: list };
}

/** True while a founding creator's 12 free instant cash-out months run. */
export const foundingFreeActive = (p: { founding: boolean; founding_perks_until?: IsoTimestamp; now: IsoTimestamp }): boolean =>
  p.founding && p.founding_perks_until !== undefined && toMs(p.now) < toMs(p.founding_perks_until);

/** Free instant cash-outs a creator has already used in the ISO week of `now` (Gold gets one a week). */
export function freeInstantUsedThisWeek(payouts: readonly Pick<Payout, "kind" | "free_instant" | "requested_at" | "status">[], now: IsoTimestamp): number {
  const week = isoWeek(now);
  return payouts.filter((x) => x.kind === "instant" && x.free_instant && x.status !== "failed" && x.status !== "cancelled" && isoWeek(x.requested_at) === week).length;
}

export interface InstantCashOutPreview extends InstantPayoutQuote {
  /** "Fee $2.40 (1.5%). You get $157.60." or "Free instant cash-out. You get $160.00." */
  summary: string;
  /** Why it is free, when it is ("Gold: one free instant cash-out a week"). */
  free_reason?: string;
}

/** The text and numbers shown before the creator confirms an instant cash-out. */
export function instantCashOutPreview(p: Parameters<typeof instantPayout>[0]): InstantCashOutPreview {
  const quote = instantPayout(p);
  if (!quote.ok) {
    const summary = quote.reason === "below_minimum" ? `The minimum instant cash-out is ${formatMoney(CONSTANTS.fees.instant_min_amount_cents)}. Your weekly payout is free and has no minimum.` : "That is more than you have cleared.";
    return { ...quote, summary };
  }
  if (quote.free_instant) {
    const perks = tierPerks(p.tier);
    const free_reason = p.founding_free
      ? "Founding creator: free instant cash-outs for 12 months"
      : perks.instant_cashout_unlimited
        ? `${p.tier === "elite" ? "Elite" : "Platinum"}: unlimited free instant cash-outs`
        : `${p.tier === "gold" ? "Gold" : "Your tier"}: ${perks.instant_cashout_free_per_week} free instant cash-out a week`;
    return { ...quote, free_reason, summary: `Free instant cash-out. You get ${formatMoney(quote.net_cents)}.` };
  }
  return { ...quote, summary: `Fee ${formatMoney(quote.fee_cents)} (${formatPercent(CONSTANTS.fees.instant_payout_rate)}). You get ${formatMoney(quote.net_cents)}. Or wait for the free weekly payout.` };
}

/** Hours until the next weekly payout, rounded down: for countdown copy. */
export const hoursToNextPayout = (now: IsoTimestamp): number => Math.max(0, Math.floor(hoursBetween(now, nextWeeklyPayout(now))));
