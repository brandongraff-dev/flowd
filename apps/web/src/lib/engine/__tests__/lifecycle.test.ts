/**
 * The life of money in one bounty, end to end across the engine: pricing, ledger, settlement, Reserved Slot, Money Clock, payouts, clawback and
 * the escrow refund. Every step is checked against the DOMAIN golden walk-through (Pro, $3,000 pool, $2.10 CPM, $0.40 / $1.50 / $4.00, $250 cap)
 * and against the ledger invariants (L-01 txns net to zero, L-03 and L-04 the escrow identity, L-08 spent equals the escrow debits).
 */

import { describe, expect, it } from "vitest";
import {
  balanceOf,
  clawbackTxn,
  creatorAccount,
  creatorLedgerMoney,
  escrowAccount,
  escrowFundTxn,
  fundedMemo,
  markCleared,
  markPaid,
  reconcileBounty,
  sequentialTxnIds,
  verifyLedger,
  walletAccount,
  walletTopUpTxn,
  weeklyPayoutTxn,
  type LedgerLeg,
  type LedgerTxn,
} from "../ledger";
import { formatMoney } from "../money";
import { moneyClockState, weeklyPayoutFor } from "../moneyclock";
import { fundingFor } from "../pricing";
import {
  emptyEscrow,
  escrowIdentityHolds,
  fundEscrow,
  releaseSlot,
  reservationUnit,
  reserveSlot,
  settleBounty,
  settlePostToLedger,
  settleReservation,
  spotsLeft,
  type EscrowState,
} from "../settlement";

const BRAND = "br_lumi";
const BOUNTY = "bnty_lumi_glowup";
const TITLE = "Glow-up reveal";
const RATES = { install: 40, trial: 150, paid: 400 };

describe("the golden bounty, from top-up to refund", () => {
  const next = sequentialTxnIds(1, "txn_g");
  const txns: LedgerTxn[] = [];
  const post = (t: LedgerTxn): LedgerTxn => {
    txns.push(t);
    return t;
  };
  const legs = (): LedgerLeg[] => txns.flatMap((t) => t.legs);

  // 1. Price and fund it
  const funding = fundingFor({ budget_cents: 300_000, plan: "pro", type: "stacked" });
  const unit = reservationUnit({ per_video_cap_cents: 25_000, take_rate: 0.1 });
  let state: EscrowState = emptyEscrow();

  it("prices the pool: $3,000 plus a $300 fee reserve, a $3,396.00 card charge", () => {
    expect(funding).toMatchObject({ fee_reserve_cents: 30_000, escrow_total_cents: 330_000, processing_cents: 9600, card_charge_cents: 339_600 });
    expect(unit).toBe(27_500);
  });

  it("txn_g01 and txn_g02: the card tops up the wallet, the wallet funds the escrow", () => {
    const g01 = post(walletTopUpTxn({ txn_id: next(), posted_at: "2026-08-02T10:00:00Z", brand_id: BRAND, amount_cents: funding.escrow_total_cents }));
    expect(g01.legs.map((l) => l.amount_cents)).toEqual([-339_600, 330_000, 9600]);
    const memo = fundedMemo(TITLE, 300_000, 30_000, (c) => formatMoney(c));
    expect(memo).toBe("Funded: Glow-up reveal ($3,000.00 pool + $300.00 fee reserve)");
    post(escrowFundTxn({ txn_id: next(), posted_at: "2026-08-02T10:05:00Z", brand_id: BRAND, bounty_id: BOUNTY, amount_cents: funding.escrow_total_cents, memo }));
    state = fundEscrow(state, funding.escrow_total_cents);
    expect(balanceOf(legs(), walletAccount(BRAND))).toBe(0);
    expect(balanceOf(legs(), escrowAccount(BOUNTY))).toBe(330_000);
    expect(spotsLeft({ remaining_cents: state.remaining_cents, per_video_cap_cents: 25_000, take_rate: 0.1 })).toBe(12);
  });

  it("four creators submit: each takes one Reserved Slot and the identity holds", () => {
    for (let i = 0; i < 4; i += 1) {
      const r = reserveSlot(state, unit);
      expect(r.ok).toBe(true);
      state = r.state;
    }
    expect(state).toMatchObject({ escrow_funded_cents: 330_000, reserved_cents: 110_000, remaining_cents: 220_000, spent_cents: 0, refunded_cents: 0 });
    expect(escrowIdentityHolds(state)).toBe(true);
    expect(reconcileBounty(legs(), { id: BOUNTY, ...state })).toEqual([]);
  });

  // 2. Maya's post clears: 31,400 verified views, 7 + 2 installs, 2 trials, 1 paid
  let mayaLedger: ReturnType<typeof settlePostToLedger>;

  it("txn_g03 to g07: Maya earns $76.54, flowd takes $7.65, the brand pays $84.19", () => {
    mayaLedger = settlePostToLedger({
      bounty: { id: BOUNTY, brand_id: BRAND, title: TITLE, cpm_cents: 210, per_video_cap_cents: 25_000, take_rate: 0.1, rates: RATES },
      post: { id: "post_maya_1", creator_id: "cr_maya", submission_id: "sub_maya_1" },
      posted_at: "2026-10-03T14:00:00Z",
      window_views: 31_400,
      conversions: [
        { id: "conv_1", kind: "install", source: "link", quantity: 7, status: "cleared" },
        { id: "conv_2", kind: "install", source: "code", quantity: 2, status: "cleared" },
        { id: "conv_3", kind: "trial", source: "link", quantity: 2, status: "cleared" },
        { id: "conv_4", kind: "paid", source: "code", quantity: 1, status: "cleared" },
        { id: "conv_5", kind: "install", source: "mmp", quantity: 40, status: "cleared" }, // estimated: never paid
      ],
      next_txn_id: next,
    });
    for (const t of mayaLedger.txns) post(t);
    expect(mayaLedger.txns).toHaveLength(5);
    expect(mayaLedger.summary).toMatchObject({ cpm_pay_cents: 6594, cpa_pay_cents: 1060, pay_cents: 7654, fee_cents: 765, brand_cost_cents: 8419, capped: false });
    expect(mayaLedger.skipped).toEqual([{ conversion_id: "conv_5", reason: "estimated_not_paid" }]);
    expect(mayaLedger.txns.map((t) => t.legs[0].amount_cents)).toEqual([-7253, -308, -88, -330, -440]);
    expect(mayaLedger.txns.map((t) => t.legs[1].amount_cents)).toEqual([6594, 280, 80, 300, 400]);
    expect(mayaLedger.txns.map((t) => t.legs[2].amount_cents)).toEqual([659, 28, 8, 30, 40]);
    for (const t of mayaLedger.txns) expect(t.legs.reduce((s, l) => s + l.amount_cents, 0)).toBe(0);
  });

  it("replaces her reservation with the actual cost, and the difference returns to remaining", () => {
    const r = settleReservation(state, { reserved_cents: unit, pay_cents: mayaLedger.summary.pay_cents, fee_cents: mayaLedger.summary.fee_cents });
    state = r.state;
    expect(r).toMatchObject({ covered_cents: 8419, released_cents: 19_081, shortfall_cents: 0 });
    expect(state).toMatchObject({ reserved_cents: 82_500, spent_cents: 8419, remaining_cents: 239_081 });
    expect(escrowIdentityHolds(state)).toBe(true);
    // the ledger agrees: balance = reserved + remaining, spent = the settlement debits (L-03, L-04, L-08)
    expect(reconcileBounty(legs(), { id: BOUNTY, ...state })).toEqual([]);
    expect(balanceOf(legs(), escrowAccount(BOUNTY))).toBe(321_581);
  });

  it("shows Maya's money by state: pending now, cleared at the run, paid by the weekly payout", () => {
    expect(creatorLedgerMoney(legs(), "cr_maya")).toMatchObject({ pending_cents: 7654, cleared_cents: 0, paid_cents: 0 });
    // Money Clock: the post went live 2026-09-30T09:00Z, so the window closed 10-03T09:00Z and it clears at the 14:00Z run
    const clock = moneyClockState({ posted_at: "2026-09-30T09:00:00Z", now: "2026-10-03T14:00:00Z" });
    expect(clock).toMatchObject({ state: "cleared", reason: "awaiting_weekly_payout", eta_at: "2026-10-09T18:00:00Z" });
    expect(clock.cleared_at).toBe("2026-10-03T14:00:00Z");
    expect(weeklyPayoutFor("2026-10-03T14:00:00Z")).toBe("2026-10-09T18:00:00Z");
    // the clearing run flips every Maya row to cleared
    const cleared = legs().map((l) => (l.account === creatorAccount("cr_maya") && l.status === "pending" ? markCleared(l, "2026-10-03T14:00:00Z") : l));
    expect(creatorLedgerMoney(cleared, "cr_maya")).toMatchObject({ pending_cents: 0, cleared_cents: 7654, paid_cents: 0 });
    // the weekly payout is free: creator -gross, bank +gross
    const payout = post(weeklyPayoutTxn({ txn_id: next(), posted_at: "2026-10-09T18:00:00Z", creator_id: "cr_maya", payout_id: "pay_1", gross_cents: 7654, run_id: "run_2026-10-09" }));
    expect(payout.legs.map((l) => l.amount_cents)).toEqual([-7654, 7654]);
    const paid = cleared.map((l) => (l.account === creatorAccount("cr_maya") && l.status === "cleared" ? markPaid(l, "2026-10-09T18:00:00Z", "pay_1") : l));
    expect(creatorLedgerMoney([...paid, ...payout.legs], "cr_maya")).toMatchObject({ pending_cents: 0, cleared_cents: 0, paid_cents: 7654, account_balance_cents: 0 });
  });

  it("txn_g12: a proven-fraud clawback reverses another creator's post in a new transaction", () => {
    const other = settlePostToLedger({
      bounty: { id: BOUNTY, brand_id: BRAND, title: TITLE, cpm_cents: 210, per_video_cap_cents: 25_000, take_rate: 0.1, rates: RATES },
      post: { id: "post_other_1", creator_id: "cr_other" },
      posted_at: "2026-10-03T14:00:00Z",
      window_views: 19_048, // $40.00 of pay at $2.10
      conversions: [],
      next_txn_id: next,
    });
    expect(other.summary).toMatchObject({ pay_cents: 4000, fee_cents: 400 });
    for (const t of other.txns) post(t);
    state = settleReservation(state, { reserved_cents: unit, pay_cents: 4000, fee_cents: 400 }).state;
    const claw = post(clawbackTxn({ txn_id: next(), posted_at: "2026-10-05T10:00:00Z", original: other.txns[0], brand_id: BRAND }));
    expect(claw.legs.map((l) => [l.account, l.amount_cents, l.status])).toEqual([
      [creatorAccount("cr_other"), -4000, "reversed"],
      ["platform:fees", -400, "cleared"],
      [walletAccount(BRAND), 4400, "cleared"],
    ]);
    expect(claw.legs.every((l) => l.reverses_txn_id === other.txns[0].txn_id)).toBe(true);
    // the creator's balance may go negative until future earnings recover it
    expect(creatorLedgerMoney(legs(), "cr_other").account_balance_cents).toBe(0);
  });

  it("txn_g13: at settlement the unspent budget and the unused fee reserve return together", () => {
    // the three other submissions were rejected or withdrawn: release their reservations (one of the four was settled above)
    for (let i = 0; i < 2; i += 1) state = releaseSlot(state, unit);
    const settled = settleBounty({ state, txn_id: next(), posted_at: "2026-10-20T00:00:00Z", brand_id: BRAND, bounty_id: BOUNTY, title: TITLE });
    expect(settled.txn).not.toBeNull();
    post(settled.txn as LedgerTxn);
    state = settled.state;
    // $3,300.00 funded, $84.19 + $44.00 spent (the clawed-back $44.00 stays spent: it went back to the wallet, not to escrow)
    expect(state).toMatchObject({ reserved_cents: 0, remaining_cents: 0, spent_cents: 8419 + 4400, refunded_cents: 330_000 - 8419 - 4400 });
    expect(escrowIdentityHolds(state)).toBe(true);
    expect(settled.refund_cents).toBe(330_000 - 8419 - 4400);
    expect(balanceOf(legs(), escrowAccount(BOUNTY))).toBe(0);
    expect(reconcileBounty(legs(), { id: BOUNTY, ...state })).toEqual([]);
  });

  it("leaves a ledger that balances: every txn nets to zero and platform accounts never go negative", () => {
    expect(verifyLedger(legs())).toEqual({ ok: true, violations: [] });
    // flowd kept $7.65 on Maya's post; the $4.00 fee on the clawed-back post was returned, so that fee is gone
    expect(balanceOf(legs(), "platform:fees")).toBe(765 + 400 - 400);
    expect(balanceOf(legs(), "platform:processing")).toBe(9600);
    // the wallet holds the escrow refund ($3,171.81) plus the $44.00 the clawback returned: $3,215.81
    expect(balanceOf(legs(), walletAccount(BRAND))).toBe(321_581);
    // all money is accounted for: nothing is left in escrow and the legs add up to exactly zero across the whole ledger
    expect(legs().reduce((s, l) => s + l.amount_cents, 0)).toBe(0);
  });
});
