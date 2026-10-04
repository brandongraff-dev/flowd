import { describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  adCommissionTxn,
  adFeeTxn,
  balanceOf,
  balances,
  bountyLedgerMoney,
  clawbackTxn,
  creatorAccount,
  creatorLedgerMoney,
  escrowAccount,
  escrowFundTxn,
  escrowRefundTxn,
  fundedMemo,
  rightsRenewalMemo,
  subscriptionMemo,
  instantPayoutTxn,
  makeTxn,
  markCleared,
  markPaid,
  matchedBudgetTxn,
  netOf,
  parseAccount,
  promoTxn,
  reconcileBounty,
  recoverFromEarnings,
  rightsRenewalTxn,
  sequentialTxnIds,
  settlementTxn,
  subscriptionTxn,
  verifyLedger,
  walletAccount,
  walletTopUpTxn,
  weeklyPayoutTxn,
  type LedgerLeg,
  type LedgerTxn,
} from "../ledger";
import { formatMoney } from "../money";

const AT = "2026-10-03T14:00:00Z";

const settlement = (txn_id: string, pay: number, fee: number): LedgerTxn =>
  settlementTxn({
    txn_id,
    posted_at: AT,
    brand_id: "br_lumi",
    bounty_id: "bnty_lumi_glowup",
    creator_id: "cr_other",
    post_id: "post_0001",
    type: "cpm",
    pay_cents: pay,
    fee_cents: fee,
    pay_memo: "Views pay: Glow-up reveal (20,000 verified views)",
    fee_memo: "Platform fee 10%: Glow-up reveal",
  });

describe("accounts and ids", () => {
  it("builds and parses account strings", () => {
    expect(walletAccount("br_lumi")).toBe("wallet:br_lumi");
    expect(escrowAccount("bnty_x")).toBe("escrow:bnty_x");
    expect(creatorAccount("cr_maya")).toBe("creator:cr_maya");
    expect(parseAccount("escrow:bnty_x")).toEqual({ kind: "escrow", id: "bnty_x" });
    expect(parseAccount(ACCOUNTS.fees)).toEqual({ kind: "platform", id: "fees" });
    expect(() => parseAccount("nonsense")).toThrow();
    expect(() => parseAccount("vault:x")).toThrow();
  });

  it("hands out sequential transaction ids", () => {
    const next = sequentialTxnIds(7);
    expect([next(), next(), next()]).toEqual(["txn_000007", "txn_000008", "txn_000009"]);
    expect(sequentialTxnIds(1, "t_")()).toBe("t_000001");
  });

  it("refuses a transaction that does not net to zero", () => {
    const bad: LedgerLeg[] = [
      { txn_id: "txn_x", entry_type: "fee", account: ACCOUNTS.fees, amount_cents: 100, status: "cleared", posted_at: AT, memo: "x" },
    ];
    expect(() => makeTxn("txn_x", bad)).toThrow(/does not net to zero/);
    expect(netOf(bad)).toBe(100);
  });
});

describe("funding legs (golden walk-through)", () => {
  it("wallet top-up by card: $3,300 lands, $96.00 processing", () => {
    const t = walletTopUpTxn({ txn_id: "txn_g01", posted_at: AT, brand_id: "br_lumi", amount_cents: 330_000 });
    expect(t.legs.map((l) => [l.account, l.amount_cents])).toEqual([
      ["external:card", -339_600],
      ["wallet:br_lumi", 330_000],
      ["platform:processing", 9_600],
    ]);
    expect(netOf(t.legs)).toBe(0);
    expect(t.legs.map((l) => l.entry_type)).toEqual(["wallet_topup", "wallet_topup", "processing"]);
    // the memos the demo ledger shows
    expect(t.legs.map((l) => l.memo)).toEqual(["Wallet top-up by card ($3,300.00)", "Wallet top-up by card ($3,300.00)", "Card processing (2.9% + $0.30)"]);
  });

  it("escrow funding moves the wallet into escrow", () => {
    const memo = fundedMemo("Glow-up reveal", 300_000, 30_000, formatMoney);
    expect(memo).toBe("Funded: Glow-up reveal ($3,000.00 pool + $300.00 fee reserve)");
    const t = escrowFundTxn({ txn_id: "txn_g02", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_lumi_glowup", amount_cents: 330_000, memo });
    expect(t.legs.map((l) => [l.account, l.amount_cents])).toEqual([
      ["wallet:br_lumi", -330_000],
      ["escrow:bnty_lumi_glowup", 330_000],
    ]);
    expect(t.legs[0].memo).toBe(memo);
    expect(fundedMemo("Glow-up reveal", 200_000, 0, formatMoney)).toBe("Funded: Glow-up reveal ($2,000.00 pool + $0.00 fee reserve)");
    expect(fundedMemo("Tell your followers", 250_000, 0, formatMoney, "platform")).toBe("Funded by flowd: Tell your followers ($2,500.00 pool)");
  });

  it("matched budget comes from the platform matching treasury", () => {
    const t = matchedBudgetTxn({ txn_id: "txn_m", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_lumi_first", amount_cents: 50_000 });
    expect(t.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
      ["platform:matching", -50_000, "matched_budget"],
      ["escrow:bnty_lumi_first", 50_000, "matched_budget"],
    ]);
    expect(t.legs[1].memo).toBe("Matched budget (first bounty)");
  });

  it("subscription fees go from the card to platform:subscriptions", () => {
    const t = subscriptionTxn({ txn_id: "txn_s", posted_at: AT, brand_id: "br_lumi", amount_cents: 29_900, memo: "Pro plan, October" });
    expect(t.legs.map((l) => [l.account, l.amount_cents])).toEqual([
      ["external:card", -29_900],
      ["platform:subscriptions", 29_900],
    ]);
  });

  it("writes plan and renewal memos the way the demo ledger does", () => {
    expect(subscriptionMemo("Pro", "2026-07-17T00:00:00Z", "2026-08-16T00:00:00Z")).toBe("flowd Pro plan, 17 Jul to 16 Aug");
    expect(subscriptionMemo("Scale", "2026-10-02T09:00:00Z", "2026-11-01T09:00:00Z")).toBe("flowd Scale plan, 2 Oct to 1 Nov");
    expect(rightsRenewalMemo(30, "Headshots in 60 seconds")).toBe("Rights renewal, 30 days: Headshots in 60 seconds");
  });
});

describe("settlement legs", () => {
  it("posts escrow -(pay + fee), creator +pay pending, fees +fee", () => {
    const t = settlement("txn_g03", 6594, 659);
    expect(t.legs.map((l) => [l.account, l.amount_cents, l.entry_type, l.status])).toEqual([
      ["escrow:bnty_lumi_glowup", -7253, "cpm", "cleared"],
      ["creator:cr_other", 6594, "cpm", "pending"],
      ["platform:fees", 659, "fee", "cleared"],
    ]);
    expect(t.legs.every((l) => l.bounty_id === "bnty_lumi_glowup" && l.brand_id === "br_lumi")).toBe(true);
    expect(t.legs[1].post_id).toBe("post_0001");
  });

  it("omits the fee leg when the fee is zero (waived first bounty)", () => {
    const t = settlement("txn_w", 5000, 0);
    expect(t.legs).toHaveLength(2);
    expect(netOf(t.legs)).toBe(0);
  });

  it("can draw from the brand wallet when the pool has emptied, and can start cleared", () => {
    const t = settlementTxn({
      txn_id: "txn_w2",
      posted_at: AT,
      brand_id: "br_lumi",
      bounty_id: "bnty_lumi_glowup",
      creator_id: "cr_maya",
      type: "cpa",
      pay_cents: 400,
      fee_cents: 40,
      pay_memo: "Paid bonus x1 (tracked code): Glow-up reveal",
      fee_memo: "Platform fee 10%: Glow-up reveal",
      source: "wallet",
      creator_status: "cleared",
    });
    expect(t.legs[0].account).toBe("wallet:br_lumi");
    expect(t.legs[1].status).toBe("cleared");
    expect(t.legs[1].cleared_at).toBe(AT);
  });

  it("posts ad commission from the wallet and the 1% ad fee to platform fees", () => {
    const c = adCommissionTxn({ txn_id: "txn_g10", posted_at: AT, brand_id: "br_lumi", creator_id: "cr_maya", ad_id: "ad_003", commission_cents: 10_847 });
    expect(c.legs.map((l) => [l.account, l.amount_cents, l.entry_type, l.status])).toEqual([
      ["wallet:br_lumi", -10_847, "commission", "cleared"],
      ["creator:cr_maya", 10_847, "commission", "pending"],
    ]);
    const f = adFeeTxn({ txn_id: "txn_g11", posted_at: AT, brand_id: "br_lumi", ad_id: "ad_003", fee_cents: 1200 });
    expect(f.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
      ["wallet:br_lumi", -1200, "ad_fee"],
      ["platform:fees", 1200, "ad_fee"],
    ]);
    expect(c.legs[0].memo).toBe("Ad commission: 10% of ad-attributed revenue");
    expect(f.legs[0].memo).toBe("Winner promotion fee: 1% of ad spend");
  });

  it("names the bounty in the ad memos when it is given", () => {
    const c = adCommissionTxn({ txn_id: "txn_c", posted_at: AT, brand_id: "br_lumi", creator_id: "cr_maya", ad_id: "ad_003", commission_cents: 320, title: "My first week with Stridely" });
    expect(c.legs[0].memo).toBe("Ad commission: 10% of ad-attributed revenue (My first week with Stridely)");
    const f = adFeeTxn({ txn_id: "txn_f", posted_at: AT, brand_id: "br_lumi", ad_id: "ad_003", fee_cents: 120, title: "My first week with Stridely" });
    expect(f.legs[1].memo).toBe("Winner promotion fee: 1% of ad spend (My first week with Stridely)");
    expect(adFeeTxn({ txn_id: "txn_g", posted_at: AT, brand_id: "br_lumi", ad_id: "ad_003", fee_cents: 120, memo: "custom" }).legs[0].memo).toBe("custom");
  });

  it("posts a rights renewal with its fee, and bonus, prize and referral from the promo treasury", () => {
    const r = rightsRenewalTxn({ txn_id: "txn_r", posted_at: AT, brand_id: "br_lumi", creator_id: "cr_maya", price_cents: 2000, fee_cents: 200, memo: "Rights renewal: 30 days" });
    expect(r.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
      ["wallet:br_lumi", -2200, "rights_fee"],
      ["creator:cr_maya", 2000, "rights_fee"],
      ["platform:fees", 200, "fee"],
    ]);
    expect(r.legs[2].memo).toBe("Rights renewal: 30 days");
    const withFeeMemo = rightsRenewalTxn({ txn_id: "txn_r2", posted_at: AT, brand_id: "br_lumi", creator_id: "cr_maya", price_cents: 2000, fee_cents: 240, memo: rightsRenewalMemo(30, "Headshots in 60 seconds"), fee_memo: "Platform fee 12%: rights renewal" });
    expect(withFeeMemo.legs.map((l) => l.memo)).toEqual(["Rights renewal, 30 days: Headshots in 60 seconds", "Rights renewal, 30 days: Headshots in 60 seconds", "Platform fee 12%: rights renewal"]);
    for (const type of ["bonus", "prize", "referral"] as const) {
      const p = promoTxn({ txn_id: `txn_${type}`, posted_at: AT, creator_id: "cr_maya", type, amount_cents: 500, memo: type });
      expect(p.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
        ["platform:promo", -500, type],
        ["creator:cr_maya", 500, type],
      ]);
    }
  });
});

describe("payout legs (golden walk-through)", () => {
  it("weekly payout is free: creator -gross, bank +gross", () => {
    const t = weeklyPayoutTxn({ txn_id: "txn_g08", posted_at: AT, creator_id: "cr_maya", payout_id: "pay_0188", gross_cents: 7654, run_id: "run_2026-10-02" });
    expect(t.legs.map((l) => [l.account, l.amount_cents, l.status])).toEqual([
      ["creator:cr_maya", -7654, "paid"],
      ["external:bank", 7654, "paid"],
    ]);
    expect(t.legs[0].memo).toBe("Weekly payout run_2026-10-02");
    expect(t.legs[0].payout_id).toBe("pay_0188");
  });

  it("instant cash-out: bank gets gross - fee and platform fees get the fee", () => {
    const t = instantPayoutTxn({ txn_id: "txn_g09", posted_at: AT, creator_id: "cr_maya", payout_id: "pay_0189", gross_cents: 16_000, fee_cents: 240, fee_label: "$2.40" });
    expect(t.legs.map((l) => [l.account, l.amount_cents, l.entry_type])).toEqual([
      ["creator:cr_maya", -16_000, "payout"],
      ["external:bank", 15_760, "payout"],
      ["platform:fees", 240, "payout_fee"],
    ]);
    expect(t.legs[0].memo).toBe("Instant cash-out (fee $2.40)");
    expect(t.legs[1].memo).toBe("Instant cash-out (fee $2.40)");
    expect(t.legs[2].memo).toBe("Instant cash-out fee ($2.40)");
  });

  it("a free instant cash-out has no fee leg", () => {
    const t = instantPayoutTxn({ txn_id: "txn_f", posted_at: AT, creator_id: "cr_maya", payout_id: "pay_1", gross_cents: 16_000, fee_cents: 0, fee_label: "$0.00" });
    expect(t.legs).toHaveLength(2);
    expect(t.legs[0].memo).toBe("Instant cash-out");
  });
});

describe("clawbacks and refunds", () => {
  it("reverses a settlement in a new transaction that references the original (golden txn_g12)", () => {
    const original = settlement("txn_orig", 4000, 400);
    const t = clawbackTxn({ txn_id: "txn_g12", posted_at: AT, original, brand_id: "br_lumi" });
    expect(t.legs.map((l) => [l.account, l.amount_cents, l.entry_type, l.status])).toEqual([
      ["creator:cr_other", -4000, "clawback", "reversed"],
      ["platform:fees", -400, "clawback", "cleared"],
      ["wallet:br_lumi", 4400, "clawback", "cleared"],
    ]);
    expect(t.legs.every((l) => l.reverses_txn_id === "txn_orig")).toBe(true);
    expect(netOf(t.legs)).toBe(0);
    expect(t.legs[0].memo).toMatch(/Clawback/);
  });

  it("claws back only the invalid share and still nets to zero", () => {
    const original = settlement("txn_orig", 6594, 659);
    const t = clawbackTxn({ txn_id: "txn_part", posted_at: AT, original, brand_id: "br_lumi", fraction: 0.3 });
    expect(t.legs[0].amount_cents).toBe(-1978); // 1978.2
    expect(t.legs[1].amount_cents).toBe(-198); // 197.7
    expect(netOf(t.legs)).toBe(0);
    const none = clawbackTxn({ txn_id: "txn_none", posted_at: AT, original, brand_id: "br_lumi", fraction: 0 });
    expect(none.legs).toHaveLength(1 + 1); // creator leg 0 and wallet leg 0
    expect(netOf(none.legs)).toBe(0);
  });

  it("clamps the fraction and handles a waived fee", () => {
    const original = settlement("txn_w", 5000, 0);
    const t = clawbackTxn({ txn_id: "txn_c", posted_at: AT, original, brand_id: "br_lumi", fraction: 7 });
    expect(t.legs.map((l) => l.amount_cents)).toEqual([-5000, 5000]);
  });

  it("refuses to claw back a transaction with no creator earning", () => {
    const refund = escrowRefundTxn({ txn_id: "txn_rf", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_x", unspent_cents: 100, memo: "Refund" });
    expect(refund).not.toBeNull();
    expect(() => clawbackTxn({ txn_id: "txn_bad", posted_at: AT, original: refund as LedgerTxn, brand_id: "br_lumi" })).toThrow();
  });

  it("recovers a negative balance from future earnings", () => {
    expect(recoverFromEarnings({ cleared_cents: 10_000, owed_cents: 4000 })).toEqual({ payable_cents: 6000, recovered_cents: 4000, remaining_owed_cents: 0 });
    expect(recoverFromEarnings({ cleared_cents: 1000, owed_cents: 4000 })).toEqual({ payable_cents: 0, recovered_cents: 1000, remaining_owed_cents: 3000 });
    expect(recoverFromEarnings({ cleared_cents: 0, owed_cents: 0 })).toEqual({ payable_cents: 0, recovered_cents: 0, remaining_owed_cents: 0 });
  });

  it("refunds unspent budget and unused fee reserve together (golden txn_g13)", () => {
    const t = escrowRefundTxn({ txn_id: "txn_g13", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_lumi_glowup", unspent_cents: 56_496, memo: "Refund of unspent budget: Glow-up reveal" });
    expect(t?.legs.map((l) => [l.account, l.amount_cents])).toEqual([
      ["escrow:bnty_lumi_glowup", -56_496],
      ["wallet:br_lumi", 56_496],
    ]);
    expect(escrowRefundTxn({ txn_id: "txn_none", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_x", unspent_cents: 0, memo: "" })).toBeNull();
  });
});

describe("row transitions", () => {
  it("clearing and paying change only status and dates", () => {
    const leg = settlement("txn_t", 1000, 100).legs[1];
    const cleared = markCleared(leg, "2026-10-04T14:00:00Z");
    expect(cleared).toMatchObject({ status: "cleared", cleared_at: "2026-10-04T14:00:00Z", amount_cents: 1000, memo: leg.memo });
    const paid = markPaid(cleared, "2026-10-09T18:00:00Z", "pay_1");
    expect(paid).toMatchObject({ status: "paid", paid_at: "2026-10-09T18:00:00Z", payout_id: "pay_1", cleared_at: "2026-10-04T14:00:00Z" });
    expect(leg.status).toBe("pending"); // the original is untouched
  });
});

describe("balances and invariants", () => {
  const ledger = (): LedgerLeg[] => [
    ...walletTopUpTxn({ txn_id: "txn_1", posted_at: AT, brand_id: "br_lumi", amount_cents: 330_000 }).legs,
    ...escrowFundTxn({ txn_id: "txn_2", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_lumi_glowup", amount_cents: 330_000, memo: "Funded" }).legs,
    ...settlement("txn_3", 6594, 659).legs,
    ...settlement("txn_4", 1000, 100).legs,
  ];

  it("computes account balances", () => {
    const l = ledger();
    expect(balanceOf(l, "wallet:br_lumi")).toBe(0);
    expect(balanceOf(l, "escrow:bnty_lumi_glowup")).toBe(330_000 - 7253 - 1100);
    expect(balanceOf(l, "platform:fees")).toBe(659 + 100);
    expect(balances(l).get("platform:processing")).toBe(9_600);
    expect(balanceOf(l, "creator:nobody")).toBe(0);
  });

  it("verifies that every txn nets to zero and platform accounts stay non-negative", () => {
    expect(verifyLedger(ledger())).toEqual({ ok: true, violations: [] });
    const broken = [...ledger(), { txn_id: "txn_bad", account: "wallet:br_lumi", amount_cents: 5 }];
    const r = verifyLedger(broken);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatchObject({ rule: "L-01" });
    const negative = verifyLedger([
      { txn_id: "txn_n", account: "platform:fees", amount_cents: -50 },
      { txn_id: "txn_n", account: "wallet:br_lumi", amount_cents: 50 },
    ]);
    expect(negative.violations.map((v) => v.rule)).toContain("L-17");
  });

  it("allows the treasury accounts to run negative", () => {
    const l = matchedBudgetTxn({ txn_id: "txn_m", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_a", amount_cents: 50_000 }).legs;
    expect(verifyLedger(l).ok).toBe(true);
    const p = promoTxn({ txn_id: "txn_p", posted_at: AT, creator_id: "cr_maya", type: "bonus", amount_cents: 500, memo: "x" }).legs;
    expect(verifyLedger(p).ok).toBe(true);
  });

  it("reads a bounty's money from its escrow legs", () => {
    const m = bountyLedgerMoney(ledger(), "bnty_lumi_glowup");
    expect(m).toEqual({ funded_cents: 330_000, spent_cents: 7253 + 1100, refunded_cents: 0, balance_cents: 330_000 - 8353 });
  });

  it("reconciles a bounty against its ledger (L-03, L-04, L-08)", () => {
    const l = ledger();
    const ok = { id: "bnty_lumi_glowup", escrow_funded_cents: 330_000, reserved_cents: 27_500, spent_cents: 8353, remaining_cents: 330_000 - 8353 - 27_500, refunded_cents: 0 };
    expect(reconcileBounty(l, ok)).toEqual([]);
    const bad = reconcileBounty(l, { ...ok, spent_cents: 9000 });
    expect(bad.map((v) => v.rule).sort()).toEqual(["L-03", "L-08"]);
    const wrongBalance = reconcileBounty(l, { ...ok, remaining_cents: 1, escrow_funded_cents: 27_500 + 8353 + 1 });
    expect(wrongBalance.map((v) => v.rule)).toContain("L-04");
  });

  it("counts a creator's money by state without summing pending and cleared", () => {
    const rows: LedgerLeg[] = [
      ...settlement("txn_a", 1000, 100).legs,
      ...settlementTxn({ txn_id: "txn_b", posted_at: AT, brand_id: "br_lumi", bounty_id: "bnty_x", creator_id: "cr_other", type: "cpa", pay_cents: 400, fee_cents: 0, pay_memo: "a", fee_memo: "f", creator_status: "cleared" }).legs,
      ...weeklyPayoutTxn({ txn_id: "txn_c", posted_at: AT, creator_id: "cr_other", payout_id: "pay_1", gross_cents: 300, run_id: "run_x" }).legs,
    ];
    const m = creatorLedgerMoney(rows, "cr_other");
    expect(m.pending_cents).toBe(1000);
    expect(m.cleared_cents).toBe(400);
    expect(m.paid_cents).toBe(0);
    expect(m.account_balance_cents).toBe(1000 + 400 - 300);
    const withHeld = creatorLedgerMoney([{ account: "creator:cr_other", amount_cents: 700, status: "held", entry_type: "cpm" }, { account: "creator:cr_other", amount_cents: 900, status: "paid", entry_type: "cpm" }], "cr_other");
    expect(withHeld.held_cents).toBe(700);
    expect(withHeld.paid_cents).toBe(900);
  });
});
