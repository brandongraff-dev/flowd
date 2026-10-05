/**
 * Creator money: the Money Clock, the wallet, payouts, the instant cash-out preview and the Tax Desk.
 *
 * Pending and cleared are always separate numbers, never summed. Every row carries a dated ETA and a named reason (never a bare "pending").
 */

import type { App, Bounty, Creator, HoldReason, LedgerEntry, MoneyClockRow, MoneyClockState, Payout, PayoutMethod, Post, Proof, TaxProfile } from "@/lib/contract/types";
import {
  dateOf,
  dateRange,
  describeEarning,
  estimatePayoutArrival,
  foundingFreeActive,
  freeInstantUsedThisWeek,
  hoursBetween,
  incomeCalendar,
  instantCashOutPreview,
  nextWeeklyPayout,
  payoutRunId,
  postTimeline,
  summarizeMoneyClock,
  taxDesk,
  creatorLedgerMoney,
  addDaysToDate,
  type CreatorLedgerMoney,
  type EarningDescription,
  type IncomeCalendar,
  type InstantCashOutPreview,
  type MoneyClockSummary,
  type TaxDeskNumbers,
  type TimelineStep,
} from "@/lib/engine";
import { holdNextStep, payoutHoldFor } from "@/lib/store/core/earnings";
import { isEarning } from "@/lib/store/core/creator-stats";
import { asList, asc, defineSelector, desc, groupBy, joinView, valuesOf, viewCache, type Db } from "../select";

export interface MoneyClockView extends MoneyClockRow {
  /** State chip, reason label and the full dated sentence. */
  description: EarningDescription;
  bounty?: Bounty;
  app?: App;
  post?: Post;
  /** True when an instant cash-out can include it: cleared and not yet in a payout. */
  payable: boolean;
  /** Settlement path of the row's post: 72-hour window, fraud check, cleared, paid. */
  path?: readonly TimelineStep[];
}

type MoneyDb = Db<"money_clock" | "bounties" | "apps" | "posts" | "ledger" | "payouts" | "clock">;

const rowCache = viewCache<MoneyClockRow, MoneyClockView>();

function clockView(db: MoneyDb, row: MoneyClockRow): MoneyClockView {
  const bounty = db.bounties[row.bounty_id];
  const app = db.apps[row.app_id];
  const post = row.post_id ? db.posts[row.post_id] : undefined;
  const ledgerRow = row.ledger_id ? db.ledger[row.ledger_id] : undefined;
  const payout = row.payout_id ? db.payouts[row.payout_id] : undefined;
  const now = db.clock.now;
  return joinView(rowCache, row, [bounty, app, post, ledgerRow, payout, now], () => {
    const arrives = row.reason === "payout_in_transit" && payout?.initiated_at ? estimatePayoutArrival({ kind: payout.kind, initiated_at: payout.initiated_at }) : undefined;
    return {
      ...row,
      description: describeEarning({ state: row.state, reason: row.reason, eta_at: row.eta_at, window_ends_at: post?.window_ends_at, cleared_at: row.cleared_at, paid_at: row.paid_at, arrives_at: arrives }),
      ...(bounty ? { bounty } : {}),
      ...(app ? { app } : {}),
      ...(post ? { post } : {}),
      payable: row.state === "cleared" && !row.payout_id && ledgerRow?.status === "cleared" && !ledgerRow.payout_id,
      ...(post ? { path: postTimeline({ posted_at: post.posted_at, now }) } : {}),
    };
  });
}

const STATE_ORDER: Record<MoneyClockState, number> = { held: 0, accruing: 1, pending: 1, cleared: 2, paid: 3, reversed: 4 };

export interface MoneyClockFilter {
  /** A creator id; defaults to the signed-in creator. */
  creator?: string;
  state?: MoneyClockState | readonly MoneyClockState[];
  bounty?: string;
  limit?: number;
}

const creatorOf = (db: Db<"session">, id: string | undefined): string | null => (id && id !== "mine" ? id : db.session.creator_id);

/** The Money Clock rows of a creator, with the dated ETA and named reason on every row. Held first, then pending by date, cleared, then paid (newest first). */
export const selectMoneyClock = defineSelector(["money_clock", "bounties", "apps", "posts", "ledger", "payouts", "clock", "session"] as const, (db: MoneyDb & Db<"session">, f: MoneyClockFilter | undefined): readonly MoneyClockView[] => {
  const creatorId = creatorOf(db, f?.creator);
  if (!creatorId) return [];
  const states = asList(f?.state);
  const rows = groupBy(db.money_clock, "creator", (r) => r.creator_id)
    .get(creatorId)
    .filter((r) => (!states || states.includes(r.state)) && (!f?.bounty || r.bounty_id === f.bounty));
  const views = rows.map((r) => clockView(db, r));
  views.sort((a, b) => {
    const s = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (s !== 0) return s;
    if (a.state === "paid" || a.state === "reversed") return desc(a.paid_at ?? a.earned_at, b.paid_at ?? b.earned_at);
    return asc(a.eta_at ?? a.earned_at, b.eta_at ?? b.earned_at);
  });
  return f?.limit ? views.slice(0, f.limit) : views;
});

export interface PayoutView extends Payout {
  /** The earning rows this payout carries. */
  items: readonly LedgerEntry[];
  proof?: Proof;
  /** Why a held payout is held and what releases it. */
  hold_text?: string;
  /** For weekly: hours until the run; for an instant payout in transit: null. */
  hours_until_run: number | null;
}

type PayoutDb = Db<"payouts" | "ledger" | "proofs" | "clock">;
const payoutCache = viewCache<Payout, PayoutView>();

function payoutView(db: PayoutDb, p: Payout): PayoutView {
  const items = groupBy(db.ledger, "payout", (e) => e.payout_id).get(p.id);
  const proof = db.proofs[p.proof_id];
  const now = db.clock.now;
  return joinView(payoutCache, p, [proof, now, ...items], () => ({
    ...p,
    items: items.filter((e) => e.account.startsWith("creator:") && e.amount_cents > 0),
    ...(proof ? { proof } : {}),
    ...(p.hold_reason ? { hold_text: holdNextStep(p.hold_reason) } : {}),
    hours_until_run: p.status === "scheduled" || p.status === "held" ? Math.max(0, hoursBetween(now, p.scheduled_for)) : null,
  }));
}

/** A creator's payouts, newest first. */
export const selectPayouts = defineSelector(["payouts", "ledger", "proofs", "clock", "session"] as const, (db: PayoutDb & Db<"session">, creator: string | undefined): readonly PayoutView[] => {
  const id = creatorOf(db, creator);
  if (!id) return [];
  return groupBy(db.payouts, "creator", (p) => p.creator_id)
    .get(id)
    .map((p) => payoutView(db, p))
    .sort((a, b) => desc(a.requested_at, b.requested_at));
});

/** One payout with its earning rows and proof page. */
export const selectPayout = defineSelector(["payouts", "ledger", "proofs", "clock"] as const, (db: PayoutDb, id: string | undefined): PayoutView | undefined => {
  const p = id ? db.payouts[id] : undefined;
  return p ? payoutView(db, p) : undefined;
});

export interface InstantPreview extends InstantCashOutPreview {
  gross_cents: number;
  row_count: number;
  /** Whether the confirm button should be enabled, and if not, why in plain words. */
  can_confirm: boolean;
  blocked_reason?: string;
  /** Free instant cash-outs used this ISO week (Gold gets one). */
  free_used_this_week: number;
}

type WalletDb = Db<"creators" | "ledger" | "payouts" | "tax_profiles" | "clock">;

function instantFor(db: WalletDb, creator: Creator, rowIds?: readonly string[]): InstantPreview {
  const all = groupBy(db.ledger, "account", (e) => e.account).get(`creator:${creator.id}`);
  const cleared = all.filter((e) => isEarning(e) && e.status === "cleared" && !e.payout_id);
  const picked = rowIds && rowIds.length > 0 ? cleared.filter((e) => rowIds.includes(e.id)) : cleared;
  const gross = picked.reduce((s, e) => s + e.amount_cents, 0);
  const clearedTotal = cleared.reduce((s, e) => s + e.amount_cents, 0);
  const used = freeInstantUsedThisWeek(groupBy(db.payouts, "creator", (p) => p.creator_id).get(creator.id), db.clock.now);
  const preview = instantCashOutPreview({
    amount_cents: gross,
    tier: creator.tier,
    founding_free: foundingFreeActive({ founding: creator.founding, founding_perks_until: creator.founding_perks_until, now: db.clock.now }),
    free_instant_used_this_week: used,
    cleared_cents: clearedTotal,
  });
  const tax = groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(creator.id)[0];
  const hold = payoutHoldFor(creator, tax);
  let blocked: string | undefined;
  if (hold) blocked = holdNextStep(hold);
  else if (creator.payout_method?.instant_capable !== true) blocked = "Add a debit card to cash out instantly, or wait for the free weekly payout.";
  else if (!preview.ok) blocked = preview.summary;
  return { ...preview, gross_cents: gross, row_count: picked.length, can_confirm: blocked === undefined, ...(blocked ? { blocked_reason: blocked } : {}), free_used_this_week: used };
}

/** What an instant cash-out would do now: the fee, the net, why it is free if it is, and whether the confirm button is enabled. */
export const selectInstantPreview = defineSelector(["creators", "ledger", "payouts", "tax_profiles", "clock", "session"] as const, (db: WalletDb & Db<"session">, arg: { creator?: string; row_ids?: string[] } | undefined): InstantPreview | null => {
  const id = creatorOf(db, arg?.creator);
  const creator = id ? db.creators[id] : undefined;
  return creator ? instantFor(db, creator, arg?.row_ids) : null;
});

export interface EarningsDay {
  date: string;
  /** Earnings that landed on the ledger that day (any state). */
  earned_cents: number;
  /** Earnings that cleared that day. */
  cleared_cents: number;
  /** Earnings paid out that day. */
  paid_cents: number;
}

export interface CreatorWallet {
  creator?: Creator;
  /** Pending (accruing + pending), cleared, held and paid from the Money Clock, side by side. */
  summary: MoneyClockSummary;
  /** Lifetime totals straight from the ledger: the figure `summary` must agree with. */
  ledger: CreatorLedgerMoney;
  rows: readonly MoneyClockView[];
  /** The next free weekly payout. */
  next_payout: { at: string; hours: number; amount_cents: number; payout?: Payout; held: boolean } | null;
  payouts: readonly PayoutView[];
  /** A payout-level hold (tax info, identity, payout method), with the step that releases it. */
  hold: { reason: HoldReason; text: string } | null;
  method?: PayoutMethod;
  instant: InstantPreview | null;
  /** Earnings per day for the chart (default last 30 days). */
  series: readonly EarningsDay[];
  calendar: IncomeCalendar;
  /** Shareable proofs of this creator's payouts and months. */
  proofs: readonly Proof[];
  tax: (TaxDeskNumbers & { profile?: TaxProfile }) | null;
}

type CreatorWalletDb = MoneyDb & WalletDb & Db<"proofs" | "session">;

/** Everything the creator wallet page shows. `useCreatorWallet()` for the signed-in creator. */
export const selectCreatorWallet = defineSelector(
  ["money_clock", "bounties", "apps", "posts", "ledger", "payouts", "clock", "creators", "tax_profiles", "proofs", "session"] as const,
  (db: CreatorWalletDb, arg: { creator?: string; days?: number } | undefined): CreatorWallet => {
    const id = creatorOf(db, arg?.creator);
    const creator = id ? db.creators[id] : undefined;
    const now = db.clock.now;
    const empty = (): CreatorWallet => ({ summary: summarizeMoneyClock([], now), ledger: { pending_cents: 0, cleared_cents: 0, held_cents: 0, paid_cents: 0, account_balance_cents: 0 }, rows: [], next_payout: null, payouts: [], hold: null, instant: null, series: [], calendar: incomeCalendar({ rows: [], now }), proofs: [], tax: null });
    if (!id || !creator) return empty();
    const rows = selectMoneyClock(db, { creator: id });
    const account = groupBy(db.ledger, "account", (e) => e.account).get(`creator:${id}`);
    const payouts = selectPayouts(db, id);
    const runAt = nextWeeklyPayout(now);
    const runId = payoutRunId(runAt);
    const scheduled = payouts.find((p) => p.kind === "weekly" && p.run_id === runId && (p.status === "scheduled" || p.status === "held"));
    const summary = summarizeMoneyClock(rows, now);
    const taxProfile = groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(id)[0];
    const holdReason = payoutHoldFor(creator, taxProfile);
    const days = arg?.days ?? 30;
    const from = addDaysToDate(dateOf(now), -(days - 1));
    const byDay = new Map<string, EarningsDay>(dateRange(from, dateOf(now)).map((d) => [d, { date: d, earned_cents: 0, cleared_cents: 0, paid_cents: 0 }]));
    for (const e of account) {
      if (!isEarning(e)) continue;
      const posted = byDay.get(dateOf(e.posted_at));
      if (posted) posted.earned_cents += e.amount_cents;
      const cleared = e.cleared_at ? byDay.get(dateOf(e.cleared_at)) : undefined;
      if (cleared) cleared.cleared_cents += e.amount_cents;
      const paid = e.paid_at ? byDay.get(dateOf(e.paid_at)) : undefined;
      if (paid) paid.paid_cents += e.amount_cents;
    }
    const ytd = account.filter((e) => isEarning(e) && (e.status === "cleared" || e.status === "paid") && e.posted_at.startsWith(now.slice(0, 4))).reduce((s, e) => s + e.amount_cents, 0);
    const clearedUnpaid = rows.filter((r) => r.state === "cleared" && !r.payout_id).reduce((s, r) => s + r.amount_cents, 0);
    return {
      creator,
      summary,
      ledger: creatorLedgerMoney(account, id),
      rows,
      next_payout: scheduled || clearedUnpaid > 0 ? { at: runAt, hours: Math.max(0, hoursBetween(now, runAt)), amount_cents: scheduled?.gross_cents ?? clearedUnpaid, ...(scheduled ? { payout: scheduled } : {}), held: scheduled?.status === "held" } : null,
      payouts,
      hold: holdReason ? { reason: holdReason, text: holdNextStep(holdReason) } : null,
      ...(creator.payout_method ? { method: creator.payout_method } : {}),
      instant: instantFor(db, creator),
      series: [...byDay.values()],
      calendar: incomeCalendar({ rows: rows.map((r) => ({ amount_cents: r.amount_cents, state: r.state, eta_at: r.eta_at, estimated: r.estimated })), now }),
      proofs: valuesOf(db.proofs).filter((p) => p.creator_id === id).sort((a, b) => desc(a.created_at, b.created_at)),
      tax: { ...taxDesk({ ytd_cleared_cents: ytd, set_aside_rate: taxProfile?.set_aside_rate }), ...(taxProfile ? { profile: taxProfile } : {}) },
    };
  },
);

/** The Tax Desk of the signed-in creator: year-to-date, the 1099-NEC threshold, the set-aside estimate, the W-9 state ("not tax advice"). */
export interface CreatorTaxDesk extends TaxDeskNumbers {
  profile?: TaxProfile;
  /** Year-to-date paid (cash that left flowd), which the 1099-NEC threshold is measured on. */
  ytd_paid_cents: number;
  /** "Add your W-9 before your first payout" and similar, from the profile state. */
  next_step: string | null;
  /** A CSV of the year's earnings rows, ready to download. */
  csv_rows: readonly { date: string; label: string; type: string; amount_cents: number; status: string }[];
}

export const selectTaxDesk = defineSelector(["ledger", "tax_profiles", "creators", "money_clock", "clock", "session"] as const, (db: Db<"ledger" | "tax_profiles" | "creators" | "money_clock" | "clock" | "session">, creator: string | undefined): CreatorTaxDesk | null => {
  const id = creatorOf(db, creator);
  const c = id ? db.creators[id] : undefined;
  if (!id || !c) return null;
  const year = db.clock.now.slice(0, 4);
  const account = groupBy(db.ledger, "account", (e) => e.account).get(`creator:${id}`);
  const earnings = account.filter((e) => isEarning(e) && e.posted_at.startsWith(year));
  const profile = groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(id)[0];
  const ytdCleared = earnings.filter((e) => e.status === "cleared" || e.status === "paid").reduce((s, e) => s + e.amount_cents, 0);
  const ytdPaid = earnings.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount_cents, 0);
  const nextStep = !profile || profile.status === "none" || profile.status === "rejected" || profile.status === "expired" ? `Add your ${c.country === "US" ? "W-9" : "W-8BEN"} before your first payout. It takes about two minutes.` : profile.status === "requested" ? `Your ${profile.form === "w8ben" ? "W-8BEN" : "W-9"} is waiting for you.` : profile.status === "submitted" ? "Your tax form is being checked." : null;
  const desk = taxDesk({ ytd_cleared_cents: ytdCleared, set_aside_rate: profile?.set_aside_rate });
  return {
    ...desk,
    ...(profile ? { profile } : {}),
    ytd_paid_cents: ytdPaid,
    next_step: nextStep,
    csv_rows: earnings
      .slice()
      .sort((a, b) => asc(a.posted_at, b.posted_at))
      .map((e) => ({ date: dateOf(e.posted_at), label: e.memo, type: e.entry_type, amount_cents: e.amount_cents, status: e.status })),
  };
});

/** Pending and cleared of a creator, always separate: the figures on the wallet chip. Cheap; use it in shells. */
export interface WalletChip {
  pending_cents: number;
  cleared_cents: number;
  held_cents: number;
  next_clear_at?: string;
  next_payout_at?: string;
}

export const selectWalletChip = defineSelector(["money_clock", "clock", "session"] as const, (db: Db<"money_clock" | "clock" | "session">, creator: string | undefined): WalletChip => {
  const id = creatorOf(db, creator);
  const rows = id ? groupBy(db.money_clock, "creator", (r) => r.creator_id).get(id) : [];
  const s = summarizeMoneyClock(rows, db.clock.now);
  return { pending_cents: s.pending_cents, cleared_cents: s.cleared_cents, held_cents: s.held_cents, ...(s.next_clearing_at ? { next_clear_at: s.next_clearing_at } : {}), ...(s.next_payout_at ? { next_payout_at: s.next_payout_at } : {}) };
});

