/**
 * Expected earnings (Pay Math), typical-vs-top copy, the income calendar and the Tax Desk numbers.
 *
 * Everything here is an ESTIMATE and is labelled that way. The typical (median) is always shown beside any top-earner figure; there is no
 * "guaranteed income" anywhere. Tracked conversions follow the funnel defaults: 0.45% of views visit, 38% of visits install, 6.2% of installs
 * start a trial, 34.8% of trials pay.
 */

import type { BountyType, IsoDate, IsoTimestamp, MoneyClockState, PayMath, Plan, ScoreBand } from "@/lib/contract/types";
import { CONSTANTS, rateForKind, takeRateFor, type CpaRates } from "./constants";
import { bps, divRound, formatMoney, mulRate } from "./money";
import { allInRate, DEFAULT_FUNNEL, type FunnelAssumptions } from "./pricing";
import { round2, typicalBand, type TypicalBand } from "./stats";
import { addDaysToDate, clockLabel, dateOf, dayLabel, toMs } from "./time";
import { nextWeeklyPayout, weeklyPayoutFor } from "./moneyclock";

// ── expected earnings per video ────────────────────────────────────────────────────────────────

export interface EarningsPoint {
  views: number;
  /** Expected tracked installs, trials and paid at these views (fractional: they are expectations). */
  installs: number;
  trials: number;
  paid: number;
  cpm_pay_cents: number;
  cpa_pay_cents: number;
  /** min(cap, CPM pay + CPA pay). */
  pay_cents: number;
  /** True when the per-video cap limits the estimate. */
  capped: boolean;
}

export interface ExpectedEarnings {
  p25: EarningsPoint;
  median: EarningsPoint;
  p75: EarningsPoint;
}

/**
 * Expected pay per video at the three view quantiles. Views at the median are the creator's own 28-day median (or the category median for a
 * new creator); p25 = 0.40x and p75 = 2.55x. pay = min(cap, round(views x cpm / 1000) + round(installs x r_i + trials x r_t + paid x r_p)).
 * Always labelled "estimate"; the cap applies.
 */
export function expectedEarnings(params: {
  base_median_views: number;
  cpm_cents: number;
  rates?: CpaRates;
  per_video_cap_cents: number;
  funnel?: FunnelAssumptions;
}): ExpectedEarnings {
  const { base_median_views, cpm_cents, rates = {}, per_video_cap_cents, funnel = DEFAULT_FUNNEL } = params;
  const at = (ratio: number): EarningsPoint => {
    const views = Math.round(base_median_views * ratio);
    const installs = views * funnel.view_to_visit * funnel.visit_to_install;
    const trials = installs * funnel.install_to_trial;
    const paid = trials * funnel.trial_to_paid;
    const cpm_pay_cents = Math.round((views * cpm_cents) / 1000);
    const cpa_pay_cents = Math.round(installs * rateForKind(rates, "install") + trials * rateForKind(rates, "trial") + paid * rateForKind(rates, "paid"));
    const gross = cpm_pay_cents + cpa_pay_cents;
    return { views, installs: round2(installs), trials: round2(trials), paid: round2(paid), cpm_pay_cents, cpa_pay_cents, pay_cents: Math.min(gross, per_video_cap_cents), capped: gross > per_video_cap_cents };
  };
  const q = funnel.views_quantile_ratio;
  return { p25: at(q.p25), median: at(q.median), p75: at(q.p75) };
}

/** Predicted views for a take: the creator's median views x the Flow Score band multiplier (A 1.6, B 1.15, C 0.85, D 0.5, E 0.3). */
export const predictedViews = (medianViews: number, band: ScoreBand): number => Math.round(medianViews * CONSTANTS.scores.band_view_multiplier[band]);

/**
 * Pay Math for a bounty, exactly the shape the contract stores.
 *
 * The take rate is the bounty's own when `take_rate` is given (a bounty keeps the rate it was created with: a platform-funded bounty is 0, a bounty
 * made on the Free plan stays 12% after the brand upgrades); otherwise it follows from `plan`, `type` and `first_bounty`. A flat fee (direct bounty)
 * is paid on top of any view pay, sits outside the per-video cap, and is the whole pay when the bounty has no CPM.
 *   creator_cpm   = round(median pay / median views x 1,000)
 *   all_in_cpm    = round(creator_cpm x (1 + take rate) x 1.029) · for a flat fee: round(median pay x (1 + take) x 1.029 x 1,000 / median views)
 */
export function payMath(params: {
  cpm_cents: number;
  rates?: CpaRates;
  per_video_cap_cents: number;
  plan: Plan;
  type?: BountyType;
  first_bounty?: boolean;
  /** The bounty's own take rate, overriding `plan`, `type` and `first_bounty`. */
  take_rate?: number;
  /** Flat fee for a direct bounty (cents). */
  flat_fee_cents?: number;
  /** The category's median verified views per post (7-day trailing), or the creator's own. */
  median_views: number;
  /** Where the estimate comes from, e.g. "AI photo & video, 38 comparable bounties". */
  basis: string;
  funnel?: FunnelAssumptions;
}): PayMath {
  const e = expectedEarnings({ base_median_views: params.median_views, cpm_cents: params.cpm_cents, rates: params.rates, per_video_cap_cents: params.per_video_cap_cents, funnel: params.funnel });
  const take = params.take_rate ?? takeRateFor({ plan: params.plan, type: params.type ?? "cpm", firstBountyWaived: params.first_bounty });
  const flat = Math.max(0, params.flat_fee_cents ?? 0);
  const median = e.median.pay_cents + flat;
  const creator_cpm_cents = e.median.views > 0 ? Math.round((median / e.median.views) * 1000) : 0;
  const all_in_cpm_cents =
    flat > 0 && e.median.views > 0
      ? divRound(median * (10_000 + bps(take)) * (10_000 + bps(CONSTANTS.fees.card_processing_rate)), 100_000 * e.median.views)
      : allInRate(creator_cpm_cents, take);
  return {
    expected_views_p25: e.p25.views,
    expected_views_median: e.median.views,
    expected_views_p75: e.p75.views,
    p25_cents: e.p25.pay_cents + flat,
    median_cents: median,
    p75_cents: e.p75.pay_cents + flat,
    creator_cpm_cents,
    all_in_cpm_cents,
    basis: params.basis,
  };
}

// ── typical beside top ─────────────────────────────────────────────────────────────────────────

export const EARNINGS_DISCLAIMER = "Results vary. Based on creators' cleared earnings; not a guarantee.";

/** p25 / median / p75 / p90 of cleared earnings (cents). The typical band every top-earner figure is shown beside. */
export const typicalEarnings = (values: readonly number[]): TypicalBand => typicalBand(values);

/**
 * The FTC-careful sentence for any top-earner figure: the typical (median) first, the top beside it, and the disclaimer. Never "guaranteed",
 * never a bare top number.
 */
export function typicalVsTop(p: { typical_cents: number; top_cents: number; top_label?: string; period?: string }): string {
  const period = p.period ?? "30 days";
  return `The typical creator earned ${formatMoney(p.typical_cents, { cents: "auto" })} in ${period}. The top ${p.top_label ?? "10%"} earned ${formatMoney(p.top_cents, { cents: "auto" })}. ${EARNINGS_DISCLAIMER}`;
}

/**
 * The creator earnings calculator (free tool): a monthly range from posts per month, approval rate and the per-video quantiles. Posts that are
 * not approved earn nothing, so the expected approved posts are posts x approval rate. Labelled an estimate.
 */
export function monthlyEarningsRange(p: {
  median_views: number;
  posts_per_month: number;
  /** Share of submissions approved. Typical is 60% to 92%; the default is the platform median. */
  approval_rate?: number;
  cpm_cents: number;
  rates?: CpaRates;
  per_video_cap_cents: number;
}): { approved_posts: number; per_video: ExpectedEarnings; monthly_cents: { p25: number; median: number; p75: number }; label: string } {
  const approval = p.approval_rate ?? 0.78;
  const approved_posts = round2(p.posts_per_month * approval);
  const per_video = expectedEarnings({ base_median_views: p.median_views, cpm_cents: p.cpm_cents, rates: p.rates, per_video_cap_cents: p.per_video_cap_cents });
  return {
    approved_posts,
    per_video,
    monthly_cents: {
      p25: Math.round(per_video.p25.pay_cents * approved_posts),
      median: Math.round(per_video.median.pay_cents * approved_posts),
      p75: Math.round(per_video.p75.pay_cents * approved_posts),
    },
    label: `Estimate. ${EARNINGS_DISCLAIMER}`,
  };
}

// ── income calendar ────────────────────────────────────────────────────────────────────────────

/** An earning row, reduced to what the calendar needs. */
export interface CalendarRow {
  amount_cents: number;
  state: MoneyClockState;
  /** The next date it moves: the clearing run for accruing and pending, the payout for cleared. */
  eta_at?: IsoTimestamp;
  /** True while accruing: the amount is a live estimate. */
  estimated?: boolean;
}

export interface CalendarDay {
  date: IsoDate;
  /** "Sat Oct 10". */
  label: string;
  /** Money clearing at the 14:00 UTC run that day. */
  clears_cents: number;
  /** Money paying out that day (Friday 18:00 UTC). */
  pays_cents: number;
  /** How much of the day's flows are estimates (still accruing). */
  estimated_cents: number;
}

export interface IncomeCalendar {
  /** One entry per day from today, only days with something happening are `active`. */
  days: CalendarDay[];
  /** The next weekly payout and what it will carry (everything cleared by then). */
  next_payout: { at: IsoTimestamp; amount_cents: number } | null;
  /** Pending money that will clear inside the horizon. */
  to_clear_cents: number;
  /** Everything that will have paid out by the end of the horizon. */
  to_pay_cents: number;
  /** Held money: it has no date, only a named next step. */
  held_cents: number;
}

/**
 * The income calendar: when pending money clears (14:00 UTC runs) and when cleared money pays out (Friday 18:00 UTC), for the next `horizon_days`.
 * Held money has no date and is reported separately. Pending and cleared are never summed into one number.
 */
export function incomeCalendar(p: { rows: readonly CalendarRow[]; now: IsoTimestamp; horizon_days?: number }): IncomeCalendar {
  const horizon = p.horizon_days ?? 14;
  const start = dateOf(p.now);
  const byDate = new Map<IsoDate, CalendarDay>();
  const day = (date: IsoDate): CalendarDay => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, label: `${clockLabel(`${date}T00:00:00Z`).split(" ")[0]} ${dayLabel(`${date}T00:00:00Z`)}`, clears_cents: 0, pays_cents: 0, estimated_cents: 0 };
      byDate.set(date, d);
    }
    return d;
  };
  let held = 0;
  let toClear = 0;
  const nextPay = nextWeeklyPayout(p.now);
  let nextPayAmount = 0;
  let paid = 0;
  const endMs = toMs(`${addDaysToDate(start, horizon)}T00:00:00Z`);
  for (const r of p.rows) {
    if (r.state === "held") {
      held += r.amount_cents;
      continue;
    }
    if (r.state === "paid" || r.state === "reversed") continue;
    let payAt: IsoTimestamp;
    if (r.state === "cleared") {
      payAt = r.eta_at ?? weeklyPayoutFor(p.now);
    } else {
      const clearAt = r.eta_at ?? p.now;
      if (toMs(clearAt) < endMs) {
        const d = day(dateOf(clearAt));
        d.clears_cents += r.amount_cents;
        if (r.estimated) d.estimated_cents += r.amount_cents;
        toClear += r.amount_cents;
      }
      payAt = weeklyPayoutFor(clearAt);
    }
    if (toMs(payAt) < endMs) {
      const d = day(dateOf(payAt));
      d.pays_cents += r.amount_cents;
      if (r.state !== "cleared" && r.estimated) d.estimated_cents += r.amount_cents;
      paid += r.amount_cents;
    }
    if (payAt === nextPay) nextPayAmount += r.amount_cents;
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days,
    next_payout: nextPayAmount > 0 ? { at: nextPay, amount_cents: nextPayAmount } : null,
    to_clear_cents: toClear,
    to_pay_cents: paid,
    held_cents: held,
  };
}

// ── Tax Desk ───────────────────────────────────────────────────────────────────────────────────

export interface TaxDeskNumbers {
  ytd_cleared_cents: number;
  /** What to set aside, an estimate at the chosen rate (default 25%). */
  set_aside_cents: number;
  set_aside_rate: number;
  /** The 1099-NEC threshold for 2026 payments ($2,000). */
  threshold_cents: number;
  /** Progress toward the threshold, 0 to 1 (capped). */
  progress_to_threshold: number;
  remaining_to_threshold_cents: number;
  over_threshold: boolean;
  /** Always shown with the numbers. */
  disclaimer: string;
}

/**
 * Tax Desk: year-to-date earnings, a set-aside estimate and progress to the 1099-NEC threshold. "Not tax advice." Free products and gifting are
 * taxable income too; the set-aside rate is the creator's to adjust.
 */
export function taxDesk(p: { ytd_cleared_cents: number; set_aside_rate?: number }): TaxDeskNumbers {
  const rate = p.set_aside_rate ?? CONSTANTS.tax.set_aside_rate;
  const threshold = CONSTANTS.tax.form_1099_nec_threshold_cents;
  return {
    ytd_cleared_cents: p.ytd_cleared_cents,
    set_aside_cents: mulRate(Math.max(0, p.ytd_cleared_cents), rate),
    set_aside_rate: rate,
    threshold_cents: threshold,
    progress_to_threshold: Math.min(1, Math.max(0, p.ytd_cleared_cents / threshold)),
    remaining_to_threshold_cents: Math.max(0, threshold - p.ytd_cleared_cents),
    over_threshold: p.ytd_cleared_cents >= threshold,
    disclaimer: `${CONSTANTS.tax.disclaimer} Estimate only.`,
  };
}
