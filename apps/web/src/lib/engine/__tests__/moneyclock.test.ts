import { describe, expect, it } from "vitest";
import { MONEY_CLOCK_REASONS } from "@/lib/contract/types";
import {
  HOLD_TO_REASON,
  bareStateProblem,
  conversionClearingRun,
  conversionClockState,
  conversionRunOnPost,
  describeEarning,
  estimatePayoutArrival,
  firstRunAtOrAfter,
  foundingFreeActive,
  freeInstantUsedThisWeek,
  hoursToNextPayout,
  instantCashOutPreview,
  instantPayout,
  isHoldReason,
  moneyClockState,
  nextClearingRun,
  nextWeeklyPayout,
  payoutRunId,
  payoutSchedule,
  postClearingRun,
  postTimeline,
  reasonText,
  summarizeMoneyClock,
  uiState,
  weeklyPayoutFor,
  windowEndsAt,
} from "../moneyclock";

const NOW = "2026-10-03T14:00:00Z"; // Saturday

describe("the schedule", () => {
  it("finds the first 14:00 UTC run at or after an instant", () => {
    expect(firstRunAtOrAfter("2026-10-03T13:59:59Z")).toBe("2026-10-03T14:00:00Z");
    expect(firstRunAtOrAfter("2026-10-03T14:00:00Z")).toBe("2026-10-03T14:00:00Z");
    expect(firstRunAtOrAfter("2026-10-03T14:00:01Z")).toBe("2026-10-04T14:00:00Z");
    expect(firstRunAtOrAfter("2026-10-03T00:00:00Z")).toBe("2026-10-03T14:00:00Z");
    expect(firstRunAtOrAfter("2026-12-31T20:00:00Z")).toBe("2027-01-01T14:00:00Z");
  });

  it("runs the post timeline from DOMAIN: posted 2026-09-30T09:00Z", () => {
    const posted = "2026-09-30T09:00:00Z";
    expect(windowEndsAt(posted)).toBe("2026-10-03T09:00:00Z");
    // window end + 2 h = 11:00, so the same-day 14:00 run clears it
    expect(postClearingRun(windowEndsAt(posted))).toBe("2026-10-03T14:00:00Z");
    expect(weeklyPayoutFor("2026-10-03T14:00:00Z")).toBe("2026-10-09T18:00:00Z");
  });

  it("clears a window that ends after 12:00 UTC at the next day's run (the 2 h buffer)", () => {
    expect(postClearingRun("2026-10-03T12:00:00Z")).toBe("2026-10-03T14:00:00Z");
    expect(postClearingRun("2026-10-03T12:00:01Z")).toBe("2026-10-04T14:00:00Z");
  });

  it("clears conversions after their window: install 24 h, trial 72 h, paid 168 h", () => {
    expect(conversionClearingRun("trial", "2026-10-01T08:15:00Z")).toBe("2026-10-04T14:00:00Z");
    expect(conversionClearingRun("install", "2026-10-02T09:00:00Z")).toBe("2026-10-03T14:00:00Z");
    expect(conversionClearingRun("paid", "2026-09-28T20:00:00Z")).toBe("2026-10-06T14:00:00Z");
  });

  it("pays the weekly run on the first Friday 18:00 at or after clearing", () => {
    expect(weeklyPayoutFor("2026-10-09T18:00:00Z")).toBe("2026-10-09T18:00:00Z");
    expect(weeklyPayoutFor("2026-10-09T18:00:01Z")).toBe("2026-10-16T18:00:00Z");
    expect(weeklyPayoutFor("2026-10-09T14:00:00Z")).toBe("2026-10-09T18:00:00Z");
    expect(weeklyPayoutFor("2026-10-04T14:00:00Z")).toBe("2026-10-09T18:00:00Z");
  });

  it("names the next payout and clearing run, and lists the next runs", () => {
    expect(nextWeeklyPayout(NOW)).toBe("2026-10-09T18:00:00Z");
    expect(nextWeeklyPayout("2026-10-09T18:00:00Z")).toBe("2026-10-16T18:00:00Z"); // strictly after
    expect(nextClearingRun(NOW)).toBe("2026-10-04T14:00:00Z");
    expect(nextClearingRun("2026-10-03T13:59:59Z")).toBe("2026-10-03T14:00:00Z");
    expect(payoutSchedule(NOW, 3)).toEqual(["2026-10-09T18:00:00Z", "2026-10-16T18:00:00Z", "2026-10-23T18:00:00Z"]);
    expect(payoutSchedule(NOW, 0)).toEqual([]);
    expect(payoutRunId("2026-10-09T18:00:00Z")).toBe("run_2026-10-09");
    expect(hoursToNextPayout(NOW)).toBe(148);
  });
});

describe("moneyClockState (DOMAIN worked examples)", () => {
  it("a live post is accruing with reason window_open and clears at the next run after the window", () => {
    expect(moneyClockState({ posted_at: "2026-10-02T18:30:00Z", now: NOW })).toEqual({
      state: "accruing",
      reason: "window_open",
      eta_at: "2026-10-06T14:00:00Z",
      window_ends_at: "2026-10-05T18:30:00Z",
    });
    expect(moneyClockState({ posted_at: "2026-10-03T13:59:00Z", now: NOW }).eta_at).toBe("2026-10-07T14:00:00Z");
  });

  it("a closed post whose run executed is cleared, waiting for the weekly payout", () => {
    expect(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW })).toEqual({
      state: "cleared",
      reason: "awaiting_weekly_payout",
      eta_at: "2026-10-09T18:00:00Z",
      cleared_at: "2026-10-03T14:00:00Z",
      window_ends_at: "2026-10-02T21:00:00Z",
    });
    expect(moneyClockState({ posted_at: "2026-09-30T09:00:00Z", now: NOW }).cleared_at).toBe("2026-10-03T14:00:00Z");
  });

  it("is pending with a named reason between the window closing and the clearing run", () => {
    // window closed at 2026-10-03T13:30Z, 30 minutes ago: the check is still running
    const check = moneyClockState({ posted_at: "2026-09-30T13:30:00Z", now: NOW });
    expect(check).toMatchObject({ state: "pending", reason: "fraud_check", eta_at: "2026-10-04T14:00:00Z" });
  });

  it("is pending (awaiting the run) after the 12 h check and before the run", () => {
    const s = moneyClockState({ posted_at: "2026-09-29T22:00:00Z", now: "2026-10-03T13:00:00Z" });
    // window ended 2026-10-02T22:00Z; +2 h = 00:00 on 10-03; first run at/after is 10-03T14:00Z, still ahead of 13:00
    expect(s).toMatchObject({ state: "pending", reason: "awaiting_clearing_run", eta_at: "2026-10-03T14:00:00Z" });
  });

  it("holds money with the named reason and no ETA", () => {
    const held = moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW, held: true });
    expect(held).toEqual({ state: "held", reason: "held_fraud_review", window_ends_at: "2026-10-02T21:00:00Z" });
    expect(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW, held: true, hold_reason: "tax_info_missing" }).reason).toBe("held_tax_info");
    expect(moneyClockState({ posted_at: "2026-10-02T21:00:00Z", now: NOW, held: true, hold_reason: "dispute_open" })).toMatchObject({ state: "held", reason: "held_dispute" });
  });

  it("is paid once a payout includes it, and reversed after a clawback", () => {
    const paid = moneyClockState({ posted_at: "2026-09-20T09:00:00Z", now: NOW, paid_at: "2026-09-25T18:00:00Z" });
    expect(paid).toMatchObject({ state: "paid", reason: "paid_out", paid_at: "2026-09-25T18:00:00Z" });
    expect(moneyClockState({ posted_at: "2026-09-20T09:00:00Z", now: NOW, reversed: true })).toMatchObject({ state: "reversed", reason: "reversed_clawback" });
    // a paid_at in the future is not paid yet
    expect(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW, paid_at: "2026-10-09T18:00:00Z" }).state).toBe("cleared");
  });

  it("can project the weekly payout as paid once its run has executed", () => {
    const afterPayout = "2026-10-09T18:00:00Z";
    expect(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: afterPayout, assume_weekly_payout: true })).toMatchObject({ state: "paid", paid_at: "2026-10-09T18:00:00Z" });
    expect(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: afterPayout })).toMatchObject({ state: "cleared" });
  });

  it("never returns a bare state: every non-final row has a reason, and dated ETAs where they are needed", () => {
    const posts = ["2026-09-25T10:00:00Z", "2026-09-29T21:00:00Z", "2026-09-30T13:30:00Z", "2026-10-01T10:00:00Z", "2026-10-02T18:30:00Z", "2026-10-03T13:59:00Z"];
    for (const posted_at of posts) {
      for (const now of ["2026-10-03T14:00:00Z", "2026-10-03T20:00:00Z", "2026-10-05T09:00:00Z"]) {
        const c = moneyClockState({ posted_at, now });
        expect(bareStateProblem({ state: c.state, reason: c.reason, eta_at: c.eta_at })).toBeNull();
        expect(describeEarning(c).reason_text.length).toBeGreaterThan(5);
      }
    }
  });
});

describe("conversionClockState", () => {
  it("is pending with reason conversion_clearing until the run after its window", () => {
    expect(conversionClockState({ kind: "trial", occurred_at: "2026-10-02T08:15:00Z", now: NOW })).toEqual({ state: "pending", reason: "conversion_clearing", eta_at: "2026-10-05T14:00:00Z" });
  });

  it("clears at the run and then waits for the weekly payout", () => {
    expect(conversionClockState({ kind: "install", occurred_at: "2026-10-02T09:00:00Z", now: NOW })).toEqual({
      state: "cleared",
      reason: "awaiting_weekly_payout",
      eta_at: "2026-10-09T18:00:00Z",
      cleared_at: "2026-10-03T14:00:00Z",
    });
  });

  it("can be held, paid or reversed", () => {
    expect(conversionClockState({ kind: "paid", occurred_at: "2026-09-01T00:00:00Z", now: NOW, held: true, hold_reason: "identity_check" })).toEqual({ state: "held", reason: "held_identity_check" });
    expect(conversionClockState({ kind: "paid", occurred_at: "2026-09-01T00:00:00Z", now: NOW, paid_at: "2026-09-11T18:00:00Z" }).state).toBe("paid");
    expect(conversionClockState({ kind: "paid", occurred_at: "2026-09-01T00:00:00Z", now: NOW, reversed: true }).state).toBe("reversed");
  });
});

describe("words", () => {
  it("shows accruing and pending together as Pending", () => {
    expect(uiState("accruing")).toBe("Pending");
    expect(uiState("pending")).toBe("Pending");
    expect(uiState("cleared")).toBe("Cleared");
    expect(uiState("paid")).toBe("Paid");
    expect(uiState("held")).toBe("Held");
    expect(uiState("reversed")).toBe("Reversed");
  });

  it("writes the dated sentence for every reason", () => {
    const eta = "2026-10-03T14:00:00Z";
    const end = "2026-10-02T18:30:00Z";
    expect(reasonText({ reason: "window_open", eta_at: "2026-10-06T14:00:00Z", window_ends_at: "2026-10-05T18:30:00Z" })).toBe("Views still counting until Mon 6:30 PM UTC. Clears Tue 2:00 PM UTC after the view check.");
    expect(reasonText({ reason: "awaiting_weekly_payout", eta_at: "2026-10-09T18:00:00Z" })).toBe("Cleared. Pays out Fri 6:00 PM UTC (weekly payout, free).");
    expect(reasonText({ reason: "awaiting_clearing_run", eta_at: eta })).toBe("Clears at the next daily run, Sat 2:00 PM UTC.");
    expect(reasonText({ reason: "fraud_check", eta_at: eta })).toContain("within 12 hours");
    expect(reasonText({ reason: "conversion_clearing", eta_at: eta })).toContain("Sat 2:00 PM UTC");
    expect(reasonText({ reason: "paid_out" })).toBe("Paid out.");
    expect(reasonText({ reason: "payout_in_transit" })).toMatch(/on its way/i);
    expect(reasonText({ reason: "reversed_clawback" })).toMatch(/still paid/);
    expect(reasonText({ reason: "window_open", window_ends_at: end })).toBe("Views still counting.");
    for (const reason of MONEY_CLOCK_REASONS) expect(reasonText({ reason, eta_at: eta, window_ends_at: end }).length).toBeGreaterThan(5);
  });

  it("every hold names the next step", () => {
    expect(reasonText({ reason: "held_tax_info" })).toBe("Add your W-9 to release this payout.");
    expect(reasonText({ reason: "held_identity_check" })).toMatch(/Verify your identity/);
    expect(reasonText({ reason: "held_payout_method" })).toMatch(/bank account/);
    expect(reasonText({ reason: "held_fraud_review" })).toMatch(/24 hours/);
    expect(reasonText({ reason: "held_dispute" })).toMatch(/dispute/);
    expect(reasonText({ reason: "held_compliance" })).toMatch(/disclosure/);
    for (const hold of Object.values(HOLD_TO_REASON)) expect(isHoldReason(hold)).toBe(true);
    expect(isHoldReason("window_open")).toBe(false);
  });

  it("describes a row with its chip, reason and dated ETA label", () => {
    const d = describeEarning(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW }));
    expect(d).toMatchObject({ ui_state: "Cleared", reason_label: "Next weekly payout", eta_label: "Pays Fri 6:00 PM UTC" });
    const live = describeEarning(moneyClockState({ posted_at: "2026-10-02T18:30:00Z", now: NOW }));
    expect(live).toMatchObject({ ui_state: "Pending", reason_label: "Views still counting", eta_label: "Clears Tue 2:00 PM UTC" });
    const held = describeEarning(moneyClockState({ posted_at: "2026-09-29T21:00:00Z", now: NOW, held: true }));
    expect(held.eta_label).toBeUndefined();
    expect(held.ui_state).toBe("Held");
  });

  it("flags a bare pending as a bug", () => {
    expect(bareStateProblem({ state: "pending", reason: "awaiting_clearing_run", eta_at: undefined })).toMatch(/no dated ETA/);
    expect(bareStateProblem({ state: "pending", reason: "" as never, eta_at: "2026-10-04T14:00:00Z" })).toMatch(/no reason/);
    expect(bareStateProblem({ state: "held", reason: "window_open", eta_at: undefined })).toMatch(/held_/);
    expect(bareStateProblem({ state: "held", reason: "held_tax_info", eta_at: undefined })).toBeNull();
    expect(bareStateProblem({ state: "paid", reason: "paid_out", eta_at: undefined })).toBeNull();
  });
});

describe("summarizeMoneyClock", () => {
  const rows = [
    { state: "accruing" as const, amount_cents: 6000, eta_at: "2026-10-06T14:00:00Z" },
    { state: "accruing" as const, amount_cents: 9000, eta_at: "2026-10-05T14:00:00Z" },
    { state: "pending" as const, amount_cents: 6200, eta_at: "2026-10-04T14:00:00Z" },
    { state: "cleared" as const, amount_cents: 8600, eta_at: "2026-10-09T18:00:00Z" },
    { state: "paid" as const, amount_cents: 155_400, eta_at: undefined },
    { state: "held" as const, amount_cents: 700, eta_at: undefined },
  ];

  it("returns pending and cleared side by side (Maya: $212.00 pending, $86.00 cleared)", () => {
    const s = summarizeMoneyClock(rows, NOW);
    expect(s.pending_cents).toBe(21_200);
    expect(s.accruing_cents).toBe(15_000);
    expect(s.cleared_cents).toBe(8600);
    expect(s.held_cents).toBe(700);
    expect(s.paid_cents).toBe(155_400);
    expect(s.next_clearing_at).toBe("2026-10-04T14:00:00Z");
    expect(s.next_payout_at).toBe("2026-10-09T18:00:00Z");
  });

  it("omits the dates it does not have", () => {
    const s = summarizeMoneyClock([{ state: "paid", amount_cents: 100, eta_at: undefined }], NOW);
    expect(s.next_clearing_at).toBeUndefined();
    expect(s.next_payout_at).toBeUndefined();
    expect(summarizeMoneyClock([], NOW)).toEqual({ pending_cents: 0, accruing_cents: 0, cleared_cents: 0, held_cents: 0, paid_cents: 0 });
  });
});

describe("postTimeline", () => {
  it("lists the five steps with timestamps and what has happened", () => {
    const t = postTimeline({ posted_at: "2026-09-30T09:00:00Z", now: NOW });
    expect(t.map((s) => s.id)).toEqual(["posted", "window_closes", "fraud_check", "cleared", "paid"]);
    expect(t.map((s) => s.at)).toEqual(["2026-09-30T09:00:00Z", "2026-10-03T09:00:00Z", "2026-10-03T21:00:00Z", "2026-10-03T14:00:00Z", "2026-10-09T18:00:00Z"]);
    expect(t.map((s) => s.done)).toEqual([true, true, false, true, false]);
  });
});

describe("instant cash-out (DOMAIN worked example)", () => {
  it("$160.00 cleared, Silver: fee $2.40, net $157.60", () => {
    expect(instantPayout({ amount_cents: 16_000, tier: "silver" })).toEqual({ ok: true, fee_cents: 240, net_cents: 15_760, free_instant: false, list_fee_cents: 240 });
  });

  it("applies the fee floor ($0.50) and cap ($15.00)", () => {
    expect(instantPayout({ amount_cents: 2000, tier: "silver" })).toMatchObject({ fee_cents: 50, net_cents: 1950 });
    expect(instantPayout({ amount_cents: 200_000, tier: "silver" })).toMatchObject({ fee_cents: 1500, net_cents: 198_500 });
    expect(instantPayout({ amount_cents: 500, tier: "bronze" })).toMatchObject({ fee_cents: 50, net_cents: 450 });
  });

  it("is free for Gold once per ISO week, then charged", () => {
    expect(instantPayout({ amount_cents: 16_000, tier: "gold", free_instant_used_this_week: 0 })).toMatchObject({ fee_cents: 0, net_cents: 16_000, free_instant: true, list_fee_cents: 240 });
    expect(instantPayout({ amount_cents: 16_000, tier: "gold", free_instant_used_this_week: 1 })).toMatchObject({ fee_cents: 240, net_cents: 15_760, free_instant: false });
  });

  it("is free for Platinum and Elite without limit, and for founding creators", () => {
    expect(instantPayout({ amount_cents: 50_000, tier: "platinum", free_instant_used_this_week: 9 })).toMatchObject({ fee_cents: 0, free_instant: true, list_fee_cents: 750 });
    expect(instantPayout({ amount_cents: 50_000, tier: "elite" }).free_instant).toBe(true);
    expect(instantPayout({ amount_cents: 16_000, tier: "bronze", founding_free: true })).toMatchObject({ fee_cents: 0, free_instant: true });
    expect(instantPayout({ amount_cents: 16_000, tier: "silver", free_instant_used_this_week: 0 }).free_instant).toBe(false);
  });

  it("refuses under $5.00 and above what is cleared", () => {
    expect(instantPayout({ amount_cents: 499, tier: "silver" })).toEqual({ ok: false, reason: "below_minimum", fee_cents: 0, net_cents: 0, free_instant: false, list_fee_cents: 0 });
    expect(instantPayout({ amount_cents: 500, tier: "silver" }).ok).toBe(true);
    expect(instantPayout({ amount_cents: 9000, tier: "silver", cleared_cents: 8600 })).toMatchObject({ ok: false, reason: "exceeds_cleared" });
    expect(instantPayout({ amount_cents: 8600, tier: "silver", cleared_cents: 8600 }).ok).toBe(true);
  });

  it("shows the fee and the net before confirm, in plain words", () => {
    expect(instantCashOutPreview({ amount_cents: 16_000, tier: "silver" }).summary).toBe("Fee $2.40 (1.5%). You get $157.60. Or wait for the free weekly payout.");
    const free = instantCashOutPreview({ amount_cents: 16_000, tier: "gold" });
    expect(free.summary).toBe("Free instant cash-out. You get $160.00.");
    expect(free.free_reason).toBe("Gold: 1 free instant cash-out a week");
    expect(instantCashOutPreview({ amount_cents: 16_000, tier: "platinum" }).free_reason).toBe("Platinum: unlimited free instant cash-outs");
    expect(instantCashOutPreview({ amount_cents: 16_000, tier: "elite" }).free_reason).toMatch(/Elite/);
    expect(instantCashOutPreview({ amount_cents: 16_000, tier: "bronze", founding_free: true }).free_reason).toMatch(/Founding/);
    expect(instantCashOutPreview({ amount_cents: 100, tier: "silver" }).summary).toMatch(/minimum instant cash-out is \$5\.00/);
    expect(instantCashOutPreview({ amount_cents: 9000, tier: "silver", cleared_cents: 100 }).summary).toMatch(/more than you have cleared/);
  });

  it("knows when a founding creator's free months end, and counts free instants this week", () => {
    expect(foundingFreeActive({ founding: true, founding_perks_until: "2027-07-01T00:00:00Z", now: NOW })).toBe(true);
    expect(foundingFreeActive({ founding: true, founding_perks_until: "2026-10-03T14:00:00Z", now: NOW })).toBe(false);
    expect(foundingFreeActive({ founding: false, founding_perks_until: "2027-07-01T00:00:00Z", now: NOW })).toBe(false);
    expect(foundingFreeActive({ founding: true, now: NOW })).toBe(false);
    const payouts = [
      { kind: "instant" as const, free_instant: true, requested_at: "2026-09-29T10:00:00Z", status: "paid" as const }, // Tuesday of W40
      { kind: "instant" as const, free_instant: true, requested_at: "2026-09-27T10:00:00Z", status: "paid" as const }, // Sunday of W39
      { kind: "instant" as const, free_instant: false, requested_at: "2026-10-01T10:00:00Z", status: "paid" as const },
      { kind: "weekly" as const, free_instant: false, requested_at: "2026-10-02T10:00:00Z", status: "paid" as const },
      { kind: "instant" as const, free_instant: true, requested_at: "2026-10-02T10:00:00Z", status: "failed" as const },
    ];
    expect(freeInstantUsedThisWeek(payouts, NOW)).toBe(1);
  });
});

describe("a payout on its way", () => {

  it("is paid with the reason payout_in_transit until the transfer lands", () => {
    const initiated = "2026-10-02T18:01:30Z";
    const arrives = "2026-10-05T15:00:00Z";
    const c = moneyClockState({ posted_at: "2026-09-26T09:00:00Z", now: NOW, paid_at: initiated, payout_arrives_at: arrives });
    expect(c).toMatchObject({ state: "paid", reason: "payout_in_transit", paid_at: initiated, arrives_at: arrives });
    expect(c.eta_at).toBeUndefined();
    // once it has landed (no arrival date, or one in the past) it reads paid_out
    expect(moneyClockState({ posted_at: "2026-09-26T09:00:00Z", now: NOW, paid_at: initiated })).toMatchObject({ state: "paid", reason: "paid_out" });
    expect(moneyClockState({ posted_at: "2026-09-26T09:00:00Z", now: NOW, paid_at: initiated, payout_arrives_at: NOW })).toMatchObject({ reason: "paid_out" });
  });

  it("describes the arrival in plain words", () => {
    const d = describeEarning({ state: "paid", reason: "payout_in_transit", paid_at: "2026-10-02T18:01:30Z", arrives_at: "2026-10-05T15:00:00Z" });
    expect(d).toMatchObject({ ui_state: "Paid", reason_text: "On its way to your bank. Arrives Mon 3:00 PM UTC.", eta_label: "Arrives Mon 3:00 PM UTC" });
    expect(reasonText({ reason: "payout_in_transit" })).toBe("On its way to your bank.");
    expect(bareStateProblem({ state: "paid", reason: "payout_in_transit" })).toBeNull();
  });

  it("applies to a conversion as well", () => {
    const c = conversionClockState({ kind: "install", occurred_at: "2026-09-26T10:00:00Z", now: NOW, paid_at: "2026-10-02T18:01:30Z", payout_arrives_at: "2026-10-05T15:00:00Z" });
    expect(c).toMatchObject({ state: "paid", reason: "payout_in_transit", arrives_at: "2026-10-05T15:00:00Z" });
  });

  it("estimates the arrival: an instant cash-out in 30 minutes, a weekly payout at 15:00 UTC the next banking day", () => {
    expect(estimatePayoutArrival({ kind: "instant", initiated_at: "2026-10-03T14:00:00Z" })).toBe("2026-10-03T14:30:00Z");
    expect(estimatePayoutArrival({ kind: "weekly", initiated_at: "2026-10-02T18:01:30Z" })).toBe("2026-10-05T15:00:00Z"); // Friday run, Monday arrival
    expect(estimatePayoutArrival({ kind: "weekly", initiated_at: "2026-10-05T18:00:00Z" })).toBe("2026-10-06T15:00:00Z");
    expect(estimatePayoutArrival({ kind: "weekly", initiated_at: "2026-10-03T10:00:00Z" })).toBe("2026-10-05T15:00:00Z"); // Saturday: Monday
  });
});

describe("a conversion on a post waits for the post's own clearing run", () => {
  // posted Sep 30 09:00: window closes Oct 3 09:00, the post clears at the Oct 3 14:00 run
  const posted = "2026-09-30T09:00:00Z";

  it("clears at the later of its own window and the post's run", () => {
    expect(conversionRunOnPost("install", "2026-10-01T08:00:00Z", posted)).toBe("2026-10-03T14:00:00Z"); // own run Oct 2, post run Oct 3
    expect(conversionRunOnPost("paid", "2026-09-30T20:00:00Z", posted)).toBe("2026-10-08T14:00:00Z"); // own run is later (168 h refund window)
    expect(conversionRunOnPost("install", "2026-10-02T20:00:00Z", posted)).toBe("2026-10-04T14:00:00Z"); // own run (Oct 3 20:00, then the Oct 4 run) is later
  });

  it("is accruing (window_open) while the post's window is open, with the later run as its date", () => {
    const live = "2026-10-02T18:30:00Z"; // window closes Oct 5 18:30, clears Oct 6 14:00
    const c = conversionClockState({ kind: "install", occurred_at: "2026-10-02T19:00:00Z", now: NOW, post_posted_at: live });
    expect(c).toMatchObject({ state: "accruing", reason: "window_open", eta_at: "2026-10-06T14:00:00Z", window_ends_at: "2026-10-05T18:30:00Z" });
  });

  it("is pending (conversion_clearing) once the window closes, and cleared at the run", () => {
    const closed = "2026-09-29T21:00:00Z"; // window closed Oct 2 21:00, post cleared Oct 3 14:00
    expect(conversionClockState({ kind: "paid", occurred_at: "2026-09-29T22:00:00Z", now: NOW, post_posted_at: closed })).toMatchObject({ state: "pending", reason: "conversion_clearing", eta_at: "2026-10-07T14:00:00Z" });
    expect(conversionClockState({ kind: "install", occurred_at: "2026-09-29T22:00:00Z", now: NOW, post_posted_at: closed })).toMatchObject({ state: "cleared", reason: "awaiting_weekly_payout", cleared_at: "2026-10-03T14:00:00Z", eta_at: "2026-10-09T18:00:00Z" });
  });

  it("is unchanged without a post", () => {
    expect(conversionClockState({ kind: "install", occurred_at: "2026-10-03T08:00:00Z", now: NOW })).toMatchObject({ state: "pending", reason: "conversion_clearing", eta_at: "2026-10-04T14:00:00Z" });
  });
});
