import { describe, expect, it } from "vitest";
import { sequentialTxnIds, verifyLedger, type LedgerTxn } from "../ledger";
import { seededRng } from "../rng";
import {
  batchSkipReason,
  cpaMemo,
  cpmMemo,
  emptyEscrow,
  escrowBurn,
  escrowIdentityHolds,
  escrowStateOf,
  feeMemo,
  fundEscrow,
  isFilled,
  maxBrandCostPerPost,
  releaseSlot,
  reservationUnit,
  reserveSlot,
  settleBounty,
  settleCpaBatch,
  settleCpmLeg,
  settleFlatFee,
  settlePost,
  settlePostToLedger,
  settleReservation,
  skipReasonText,
  spendFromRemaining,
  spotsLeft,
  withinCpaWindow,
  type ConversionBatchInput,
  type EscrowState,
  type SettleContext,
} from "../settlement";

const RATES = { install: 40, trial: 150, paid: 400 };
const AT = "2026-10-03T14:00:00Z";

const ctx = (over: Partial<SettleContext["bounty"]> = {}): SettleContext => ({
  bounty: { id: "bnty_lumi_glowup", brand_id: "br_lumi", title: "Glow-up reveal", cpm_cents: 210, per_video_cap_cents: 25_000, take_rate: 0.1, rates: RATES, ...over },
  post: { id: "post_0307", creator_id: "cr_maya", submission_id: "sub_0307" },
  posted_at: AT,
});

describe("settlePost: stacked pay (DOMAIN worked examples)", () => {
  it("typical stacked post: 48,200 views, 14 installs, 6 trials, 2 paid (Pro, $2.00 CPM, $250 cap)", () => {
    const r = settlePost({ window_views: 48_200, cpm_cents: 200, conversions: { install: 14, trial: 6, paid: 2 }, rates: RATES, per_video_cap_cents: 25_000, take_rate: 0.1 });
    expect(r.cpm_pay_cents).toBe(9640);
    expect(r.cpa_pay_cents).toBe(2260);
    expect(r.pay_cents).toBe(11_900);
    expect(r.fee_cpm_cents).toBe(964);
    expect(r.fee_cpa_cents).toBe(226);
    expect(r.fee_cents).toBe(1190);
    expect(r.brand_cost_cents).toBe(13_090);
    expect(r.capped).toBe(false);
    expect(r.cap_remaining_cents).toBe(13_100);
  });

  it("a viral post hits the cap: CPM first, then CPA gets nothing", () => {
    const r = settlePost({ window_views: 150_000, cpm_cents: 200, conversions: { install: 40, trial: 10, paid: 3 }, rates: RATES, per_video_cap_cents: 25_000, take_rate: 0.1 });
    expect(r.cpm_uncapped_cents).toBe(30_000);
    expect(r.cpa_uncapped_cents).toBe(4300); // 40 x 40 + 10 x 150 + 3 x 400
    expect(r.cpm_pay_cents).toBe(25_000);
    expect(r.cpa_pay_cents).toBe(0);
    expect(r.pay_cents).toBe(25_000);
    expect(r.capped).toBe(true);
    expect(r.fee_cents).toBe(2500);
    expect(r.brand_cost_cents).toBe(27_500);
    expect(r.cap_remaining_cents).toBe(0);
  });

  it("pays the minimum rate and rounds the fee per leg", () => {
    const r = settlePost({ window_views: 9999, cpm_cents: 50, per_video_cap_cents: 25_000, take_rate: 0.12 });
    expect(r.cpm_pay_cents).toBe(500);
    expect(r.fee_cents).toBe(60);
    expect(r.brand_cost_cents).toBe(560);
  });

  it("caps a small cap with CPA unpaid", () => {
    const r = settlePost({ window_views: 12_345, cpm_cents: 175, conversions: { install: 3 }, rates: { install: 40 }, per_video_cap_cents: 1500, take_rate: 0.08 });
    expect(r.cpm_uncapped_cents).toBe(2160);
    expect(r.pay_cents).toBe(1500);
    expect(r.fee_cents).toBe(120);
    expect(r.capped).toBe(true);
  });

  it("lets CPA fill what CPM leaves under the cap", () => {
    const r = settlePost({ window_views: 100_000, cpm_cents: 200, conversions: { install: 100 }, rates: { install: 40 }, per_video_cap_cents: 21_000, take_rate: 0.1 });
    expect(r.cpm_pay_cents).toBe(20_000);
    expect(r.cpa_pay_cents).toBe(1000); // 4000 uncapped, only 1000 of cap left
    expect(r.capped).toBe(true);
  });

  it("respects pay already settled on the post", () => {
    const r = settlePost({ window_views: 10_000, cpm_cents: 200, per_video_cap_cents: 25_000, take_rate: 0.1, already_paid_cents: 24_000 });
    expect(r.cpm_pay_cents).toBe(1000);
    expect(r.capped).toBe(true);
    expect(settlePost({ window_views: 10_000, cpm_cents: 200, per_video_cap_cents: 25_000, take_rate: 0.1, already_paid_cents: 30_000 }).pay_cents).toBe(0);
  });

  it("pays nothing on zero views and handles a waived fee", () => {
    expect(settlePost({ window_views: 0, cpm_cents: 200, per_video_cap_cents: 25_000, take_rate: 0.1 }).brand_cost_cents).toBe(0);
    const w = settlePost({ window_views: 10_000, cpm_cents: 200, per_video_cap_cents: 25_000, take_rate: 0 });
    expect(w.fee_cents).toBe(0);
    expect(w.brand_cost_cents).toBe(2000);
  });

  it("bounds the brand cost of one post by one reservation unit (cap + fee on the cap)", () => {
    expect(maxBrandCostPerPost(25_000, 0.1)).toBe(27_500);
    expect(maxBrandCostPerPost(25_000, 0)).toBe(25_000);
  });
});

describe("conversion batches", () => {
  const batch = (over: Partial<ConversionBatchInput> = {}): ConversionBatchInput => ({ id: "conv_1", kind: "install", source: "link", quantity: 7, status: "cleared", ...over });

  it("pays only cleared link and code batches", () => {
    expect(batchSkipReason(batch(), RATES)).toBeNull();
    expect(batchSkipReason(batch({ source: "code" }), RATES)).toBeNull();
    expect(batchSkipReason(batch({ source: "mmp" }), RATES)).toBe("estimated_not_paid");
    expect(batchSkipReason(batch({ source: "survey" }), RATES)).toBe("estimated_not_paid");
    expect(batchSkipReason(batch({ source: "modelled" }), RATES)).toBe("estimated_not_paid");
    expect(batchSkipReason(batch({ status: "pending" }), RATES)).toBe("still_clearing");
    expect(batchSkipReason(batch({ status: "rejected" }), RATES)).toBe("rejected");
    expect(batchSkipReason(batch({ status: "refunded" }), RATES)).toBe("refunded");
    expect(batchSkipReason(batch({ quantity: 0 }), RATES)).toBe("empty");
    expect(batchSkipReason(batch({ kind: "trial" }), { install: 40 })).toBe("no_rate");
  });

  it("explains each skip in plain English", () => {
    for (const reason of ["estimated_not_paid", "still_clearing", "rejected", "refunded", "no_rate", "empty"] as const) {
      expect(skipReasonText(reason).length).toBeGreaterThan(10);
    }
    expect(skipReasonText("estimated_not_paid")).toMatch(/never paid/);
  });

  it("checks the 30-day CPA window", () => {
    expect(withinCpaWindow("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z")).toBe(true);
    expect(withinCpaWindow("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe(true);
    expect(withinCpaWindow("2026-09-01T00:00:00Z", "2026-10-01T00:00:01Z")).toBe(false);
    expect(withinCpaWindow("2026-09-01T00:00:00Z", "2026-08-31T00:00:00Z")).toBe(false);
  });
});

describe("ledger postings", () => {
  it("memos read like the Wallet ledger", () => {
    expect(cpmMemo("Glow-up reveal", 31_400)).toBe("Views pay: Glow-up reveal (31,400 verified views)");
    expect(cpaMemo("install", 7, "link", "Glow-up reveal")).toBe("Install bonus x7 (tracked link): Glow-up reveal");
    expect(cpaMemo("paid", 1, "code", "Glow-up reveal")).toBe("Paid conversion bonus x1 (tracked code): Glow-up reveal");
    expect(cpaMemo("trial", 2, "link", "Glow-up reveal")).toBe("Trial bonus x2 (tracked link): Glow-up reveal");
    expect(feeMemo(0.1, "Glow-up reveal")).toBe("Platform fee 10%: Glow-up reveal");
  });

  it("settles a post exactly like the golden walk-through (Pro, $2.10 CPM, @maya.makes)", () => {
    const conversions: ConversionBatchInput[] = [
      { id: "conv_a", kind: "install", source: "link", quantity: 7, status: "cleared" },
      { id: "conv_b", kind: "install", source: "code", quantity: 2, status: "cleared" },
      { id: "conv_c", kind: "trial", source: "link", quantity: 2, status: "cleared" },
      { id: "conv_d", kind: "paid", source: "code", quantity: 1, status: "cleared" },
    ];
    const r = settlePostToLedger({ ...ctx(), window_views: 31_400, conversions, next_txn_id: sequentialTxnIds(3, "txn_g0") });
    expect(r.txns).toHaveLength(5);
    const row = (t: LedgerTxn) => t.legs.map((l) => l.amount_cents);
    expect(row(r.txns[0])).toEqual([-7253, 6594, 659]); // txn_g03: $72.53, $65.94, $6.59
    expect(row(r.txns[1])).toEqual([-308, 280, 28]); // txn_g04: 7 installs through the link
    expect(row(r.txns[2])).toEqual([-88, 80, 8]); // txn_g05: 2 installs through the code
    expect(row(r.txns[3])).toEqual([-330, 300, 30]); // txn_g06: 2 trials through the link
    expect(row(r.txns[4])).toEqual([-440, 400, 40]); // txn_g07: 1 paid through the code
    expect(r.summary.pay_cents).toBe(7654); // $76.54 of pool pay
    expect(r.summary.fee_cents).toBe(765); // $7.65 of fees
    expect(r.summary.brand_cost_cents).toBe(8419); // $84.19 brand cost
    expect(r.summary.capped).toBe(false);
    expect(r.summary.cap_remaining_cents).toBe(25_000 - 7654);
    expect(r.skipped).toEqual([]);
    expect(r.txns.map((t) => t.legs[0].entry_type)).toEqual(["cpm", "cpa", "cpa", "cpa", "cpa"]);
    expect(r.txns[1].legs[1].conversion_id).toBe("conv_a");
    expect(r.txns[1].legs[0].memo).toBe("Install bonus x7 (tracked link): Glow-up reveal");
    expect(r.txns[0].legs[0].memo).toBe("Views pay: Glow-up reveal (31,400 verified views)");
    expect(verifyLedger(r.txns.flatMap((t) => t.legs)).ok).toBe(true);
    expect(r.txns[0].legs[1].status).toBe("pending");
  });

  it("settles only what is payable and says why the rest was skipped", () => {
    const conversions: ConversionBatchInput[] = [
      { id: "conv_ok", kind: "install", source: "link", quantity: 5, status: "cleared" },
      { id: "conv_mmp", kind: "install", source: "mmp", quantity: 40, status: "cleared" },
      { id: "conv_wait", kind: "trial", source: "code", quantity: 2, status: "pending" },
      { id: "conv_ref", kind: "paid", source: "link", quantity: 1, status: "refunded" },
    ];
    const r = settlePostToLedger({ ...ctx(), window_views: 1000, conversions, next_txn_id: sequentialTxnIds() });
    expect(r.txns).toHaveLength(2);
    expect(r.skipped).toEqual([
      { conversion_id: "conv_mmp", reason: "estimated_not_paid" },
      { conversion_id: "conv_wait", reason: "still_clearing" },
      { conversion_id: "conv_ref", reason: "refunded" },
    ]);
    expect(r.summary.cpa_pay_cents).toBe(200);
  });

  it("applies the cap across batches in order and flags the batch it stopped", () => {
    const conversions: ConversionBatchInput[] = [
      { id: "conv_1", kind: "trial", source: "link", quantity: 10, status: "cleared" }, // 1500
      { id: "conv_2", kind: "paid", source: "link", quantity: 5, status: "cleared" }, // 2000, only 500 left under the cap
      { id: "conv_3", kind: "install", source: "code", quantity: 5, status: "cleared" }, // nothing left
    ];
    const r = settlePostToLedger({ ...ctx({ per_video_cap_cents: 5000, cpm_cents: 100 }), window_views: 30_000, conversions, next_txn_id: sequentialTxnIds() });
    // CPM: round(30000 x 100 / 1000) = 3000, then CPA 1500 hits the cap at 4500, then 500 of the next batch.
    expect(r.summary.cpm_pay_cents).toBe(3000);
    expect(r.summary.cpa_pay_cents).toBe(2000);
    expect(r.summary.pay_cents).toBe(5000);
    expect(r.summary.capped).toBe(true);
    expect(r.summary.cap_remaining_cents).toBe(0);
    expect(r.capped_conversion_ids).toEqual(["conv_2", "conv_3"]);
    expect(r.txns).toHaveLength(3); // cpm, conv_1, partial conv_2 (conv_3 pays nothing, no txn)
  });

  it("omits the fee leg everywhere when the first bounty fee is waived", () => {
    const r = settlePostToLedger({
      ...ctx({ take_rate: 0 }),
      window_views: 10_000,
      conversions: [{ id: "conv_1", kind: "install", source: "link", quantity: 3, status: "cleared" }],
      next_txn_id: sequentialTxnIds(),
    });
    expect(r.txns.every((t) => t.legs.length === 2)).toBe(true);
    expect(r.summary.fee_cents).toBe(0);
  });

  it("can settle a late CPA batch on its own against the pay already made", () => {
    const first = settleCpmLeg({ ...ctx({ per_video_cap_cents: 3000 }), txn_id: "txn_a", window_views: 10_000 });
    expect(first.pay_cents).toBe(2100);
    expect(first.capped).toBe(false);
    const late = settleCpaBatch({
      ...ctx({ per_video_cap_cents: 3000 }),
      txn_id: "txn_b",
      already_paid_cents: first.pay_cents,
      batch: { id: "conv_late", kind: "paid", source: "code", quantity: 5, status: "cleared" },
    });
    expect(late.pay_cents).toBe(900); // 2000 uncapped, 900 under the cap
    expect(late.capped).toBe(true);
    expect(late.cap_remaining_cents).toBe(0);
    expect(late.txn?.legs.map((l) => l.amount_cents)).toEqual([-990, 900, 90]);
  });

  it("returns no transaction for zero views or a skipped batch", () => {
    const none = settleCpmLeg({ ...ctx(), txn_id: "txn_z", window_views: 0 });
    expect(none.txn).toBeNull();
    expect(none.pay_cents).toBe(0);
    const skipped = settleCpaBatch({ ...ctx(), txn_id: "txn_s", batch: { id: "c", kind: "install", source: "survey", quantity: 9, status: "cleared" } });
    expect(skipped.txn).toBeNull();
    expect(skipped.skipped).toBe("estimated_not_paid");
  });

  it("can add only CPA batches to a post whose CPM leg already settled", () => {
    const r = settlePostToLedger({
      ...ctx(),
      include_cpm: false,
      already_paid_cents: 6594,
      window_views: 31_400,
      conversions: [{ id: "conv_a", kind: "install", source: "link", quantity: 7, status: "cleared" }],
      next_txn_id: sequentialTxnIds(),
    });
    expect(r.txns).toHaveLength(1);
    expect(r.summary.cpm_pay_cents).toBe(0);
    expect(r.summary.cap_remaining_cents).toBe(25_000 - 6594 - 280);
  });

  it("settles the same input to the same legs (deterministic, idempotent on (post, leg))", () => {
    const input = { ...ctx(), window_views: 31_400, conversions: [] as ConversionBatchInput[] };
    const a = settlePostToLedger({ ...input, next_txn_id: sequentialTxnIds() });
    const b = settlePostToLedger({ ...input, next_txn_id: sequentialTxnIds() });
    expect(a).toEqual(b);
  });

  it("pays a flat fee from escrow, or from the wallet for a spec licence", () => {
    const offer = settleFlatFee({ txn_id: "txn_o", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_direct", creator_id: "cr_maya", price_cents: 30_000, take_rate: 0.1, title: "Two new hooks" });
    expect(offer.fee_cents).toBe(3000);
    expect(offer.brand_cost_cents).toBe(33_000);
    expect(offer.txn.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
      ["escrow:bnty_direct", -33_000, "flat_fee"],
      ["creator:cr_maya", 30_000, "flat_fee"],
      ["platform:fees", 3000, "fee"],
    ]);
    const spec = settleFlatFee({ txn_id: "txn_p", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_direct", creator_id: "cr_maya", price_cents: 4500, take_rate: 0.1, title: "Spec licence", source: "wallet" });
    expect(spec.txn.legs[0].account).toBe("wallet:br_lumi");
    expect(offer.txn.legs[1].memo).toBe("Flat fee: Two new hooks");
    // the First-Dollar Path starter is labelled as one in the wallet ledger
    const starter = settleFlatFee({ txn_id: "txn_s", posted_at: AT, brand_id: "br_flowd", bounty_id: "bnty_starter", creator_id: "cr_maya", price_cents: 500, take_rate: 0, title: "show us one app you actually keep", label: "Starter bounty" });
    expect(starter.txn.legs[1].memo).toBe("Starter bounty: show us one app you actually keep");
    expect(starter.txn.legs).toHaveLength(2); // no fee leg when the fee is 0
  });
});

describe("Reserved Slot (DOMAIN worked example: Pro, $3,000 pool, $250 cap)", () => {
  const unit = reservationUnit({ per_video_cap_cents: 25_000, take_rate: 0.1 });

  it("reserves a cap plus its fee per submission", () => {
    expect(unit).toBe(27_500);
    expect(reservationUnit({ per_video_cap_cents: 25_000, take_rate: 0 })).toBe(25_000);
    expect(reservationUnit({ per_video_cap_cents: 1500, take_rate: 0.08 })).toBe(1620);
  });

  it("counts spots left: 4 open submissions and $610 spent leaves 5 spots", () => {
    const remaining = 330_000 - 4 * unit - 61_000;
    expect(remaining).toBe(159_000);
    expect(spotsLeft({ remaining_cents: remaining, per_video_cap_cents: 25_000, take_rate: 0.1 })).toBe(5);
    expect(spotsLeft({ remaining_cents: 27_499, per_video_cap_cents: 25_000, take_rate: 0.1 })).toBe(0);
    expect(isFilled({ remaining_cents: 27_499, per_video_cap_cents: 25_000, take_rate: 0.1 })).toBe(true);
    expect(isFilled({ remaining_cents: 27_500, per_video_cap_cents: 25_000, take_rate: 0.1 })).toBe(false);
  });

  it("reserve, release and settle keep the identity", () => {
    let s = fundEscrow(emptyEscrow(), 330_000);
    expect(s).toMatchObject({ escrow_funded_cents: 330_000, remaining_cents: 330_000 });
    const a = reserveSlot(s, unit);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    s = a.state;
    expect(s).toMatchObject({ reserved_cents: 27_500, remaining_cents: 302_500 });
    expect(escrowIdentityHolds(s)).toBe(true);
    // the post settles at $65.94 + $6.59: the reservation is replaced and the difference returns to remaining
    const done = settleReservation(s, { reserved_cents: unit, pay_cents: 6594, fee_cents: 659 });
    expect(done.covered_cents).toBe(7253);
    expect(done.released_cents).toBe(27_500 - 7253);
    expect(done.shortfall_cents).toBe(0);
    expect(done.state).toMatchObject({ reserved_cents: 0, spent_cents: 7253, remaining_cents: 330_000 - 7253 });
    expect(escrowIdentityHolds(done.state)).toBe(true);
    // a rejection gives the slot back
    const b = reserveSlot(done.state, unit);
    if (!b.ok) throw new Error("expected a slot");
    const back = releaseSlot(b.state, unit);
    expect(back).toEqual(done.state);
  });

  it("refuses a reservation when the pool cannot cover a unit", () => {
    const s: EscrowState = { escrow_funded_cents: 30_000, reserved_cents: 0, spent_cents: 5000, remaining_cents: 25_000, refunded_cents: 0 };
    const r = reserveSlot(s, unit);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_remaining");
    expect(r.state).toBe(s);
    expect(reserveSlot(s, 0).ok).toBe(false);
  });

  it("pays an approved post even if the pool later empties: the wallet covers the shortfall", () => {
    // 1 reserved unit of $275 in a pool with nothing left, but the post settles $293 because of per-leg rounding... or a late CPA batch
    const s: EscrowState = { escrow_funded_cents: 27_500, reserved_cents: 27_500, spent_cents: 0, remaining_cents: 0, refunded_cents: 0 };
    const exact = settleReservation(s, { reserved_cents: 27_500, pay_cents: 25_000, fee_cents: 2500 });
    expect(exact.shortfall_cents).toBe(0);
    expect(exact.state).toMatchObject({ reserved_cents: 0, spent_cents: 27_500, remaining_cents: 0 });
    // A late CPA batch with nothing left in escrow
    const late = spendFromRemaining(exact.state, { pay_cents: 400, fee_cents: 40 });
    expect(late.covered_cents).toBe(0);
    expect(late.shortfall_cents).toBe(440);
    expect(late.state).toEqual(exact.state);
    expect(escrowIdentityHolds(late.state)).toBe(true);
    // Partly covered
    const partial = spendFromRemaining({ ...exact.state, escrow_funded_cents: 27_700, remaining_cents: 200 }, { pay_cents: 400, fee_cents: 40 });
    expect(partial.covered_cents).toBe(200);
    expect(partial.shortfall_cents).toBe(240);
    expect(partial.state.remaining_cents).toBe(0);
    expect(escrowIdentityHolds(partial.state)).toBe(true);
  });

  it("draws a fee-rounding overage from remaining", () => {
    const s: EscrowState = { escrow_funded_cents: 100_000, reserved_cents: 100, spent_cents: 0, remaining_cents: 99_900, refunded_cents: 0 };
    const r = settleReservation(s, { reserved_cents: 100, pay_cents: 91, fee_cents: 10 });
    expect(r.covered_cents).toBe(101);
    expect(r.released_cents).toBe(0);
    expect(r.state.remaining_cents).toBe(99_899);
    expect(escrowIdentityHolds(r.state)).toBe(true);
  });

  it("property: any sequence of submit, approve and reject keeps funded = reserved + spent + remaining + refunded and reserved + spent <= funded", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const rng = seededRng(`escrow-${seed}`);
      const takeRate = [0.12, 0.1, 0.08, 0.06, 0][Math.floor(rng() * 5)];
      const cap = 5000 + Math.floor(rng() * 40_000);
      const u = reservationUnit({ per_video_cap_cents: cap, take_rate: takeRate });
      let state = fundEscrow(emptyEscrow(), Math.round(cap * (4 + rng() * 20) * (1 + takeRate)));
      const open: number[] = [];
      for (let step = 0; step < 300; step += 1) {
        const roll = rng();
        if (roll < 0.45) {
          const r = reserveSlot(state, u);
          if (r.ok) open.push(u);
          state = r.state;
        } else if (roll < 0.75 && open.length > 0) {
          const reserved = open.splice(Math.floor(rng() * open.length), 1)[0];
          const pay = Math.floor(rng() * cap);
          const fee = Math.round(pay * takeRate);
          state = settleReservation(state, { reserved_cents: reserved, pay_cents: pay, fee_cents: fee }).state;
        } else if (open.length > 0) {
          const reserved = open.splice(Math.floor(rng() * open.length), 1)[0];
          state = releaseSlot(state, reserved);
        }
        expect(escrowIdentityHolds(state)).toBe(true);
        expect(state.reserved_cents + state.spent_cents).toBeLessThanOrEqual(state.escrow_funded_cents);
        expect(state.reserved_cents).toBe(open.reduce((a, b) => a + b, 0));
      }
    }
  });

  it("returns the unspent budget and unused fee reserve together at settlement (golden txn_g13)", () => {
    // $3,300.00 funded, $2,486.40 pay + $248.64 fees settled, nothing reserved
    const s: EscrowState = { escrow_funded_cents: 330_000, reserved_cents: 0, spent_cents: 248_640 + 24_864, remaining_cents: 330_000 - 248_640 - 24_864, refunded_cents: 0 };
    const r = settleBounty({ state: s, txn_id: "txn_g13", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_lumi_glowup", title: "Glow-up reveal" });
    expect(r.refund_cents).toBe(56_496); // $564.96
    expect(r.state).toMatchObject({ reserved_cents: 0, remaining_cents: 0, refunded_cents: 56_496, spent_cents: 273_504 });
    expect(r.state.refunded_cents + r.state.spent_cents).toBe(r.state.escrow_funded_cents);
    expect(r.txn?.legs.map((l) => [l.account, l.amount_cents])).toEqual([
      ["escrow:bnty_lumi_glowup", -56_496],
      ["wallet:br_lumi", 56_496],
    ]);
    expect(r.txn?.legs[0].memo).toBe("Refund of unspent budget: Glow-up reveal");
  });

  it("releases open reservations before refunding, and has no txn when nothing is left", () => {
    const s: EscrowState = { escrow_funded_cents: 100_000, reserved_cents: 27_500, spent_cents: 72_500, remaining_cents: 0, refunded_cents: 0 };
    const r = settleBounty({ state: s, txn_id: "txn_x", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_x", title: "X" });
    expect(r.refund_cents).toBe(27_500);
    expect(escrowIdentityHolds(r.state)).toBe(true);
    const spent: EscrowState = { escrow_funded_cents: 100_000, reserved_cents: 0, spent_cents: 100_000, remaining_cents: 0, refunded_cents: 0 };
    const none = settleBounty({ state: spent, txn_id: "txn_y", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_x", title: "X" });
    expect(none.txn).toBeNull();
    expect(none.refund_cents).toBe(0);
  });

  it("describes the burn bar and rejects negative funding", () => {
    const s: EscrowState = { escrow_funded_cents: 1000, reserved_cents: 100, spent_cents: 300, remaining_cents: 600, refunded_cents: 0 };
    expect(escrowBurn(s)).toEqual({ spent: 0.3, reserved: 0.1, remaining: 0.6, refunded: 0 });
    expect(escrowBurn(emptyEscrow())).toEqual({ spent: 0, reserved: 0, remaining: 0, refunded: 0 });
    expect(() => fundEscrow(emptyEscrow(), -1)).toThrow();
    expect(escrowStateOf({ ...s, extra: 1 } as EscrowState & { extra: number })).toEqual(s);
    expect(escrowIdentityHolds({ ...s, spent_cents: 301 })).toBe(false);
    expect(escrowIdentityHolds({ escrow_funded_cents: 0, reserved_cents: -1, spent_cents: 1, remaining_cents: 0, refunded_cents: 0 })).toBe(false);
  });
});
