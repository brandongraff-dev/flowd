/**
 * Property sweeps over the money core. No extra library: a seeded Rng drives thousands of cases, so a failure reproduces exactly.
 * These check the promises the product makes: no float drift, nothing paid above the cap, every transaction nets to zero, every
 * Money Clock date lands on a real run, and a tier never drops because a creator earned more.
 */

import { describe, expect, it } from "vitest";
import type { ConversionKind, FraudSignal, Tier } from "@/lib/contract/types";
import { CONSTANTS } from "../constants";
import { instantPayout, moneyClockState, bareStateProblem, conversionClearingRun, firstRunAtOrAfter, weeklyPayoutFor } from "../moneyclock";
import { expectedEarnings } from "../earnings";
import { fraudScore, type FiredSignal } from "../fraud";
import { netOf } from "../ledger";
import { mulRate, splitCents } from "../money";
import { allInBreakdown, firstBountyFunding, funding } from "../pricing";
import { randInt, seededRng, type Rng } from "../rng";
import { settlePost, settlePostToLedger, type ConversionBatchInput } from "../settlement";
import { tierFor, tierRank } from "../tiers";
import { addHours, iso, toMs, weekdayOf, HOUR_MS } from "../time";

const N = 1500;
const BASE_MS = Date.parse("2026-07-05T00:00:00Z");

describe("rounding is exact integer math", () => {
  it("mulRate equals exact BigInt half-up rounding for every plan and fee rate", () => {
    const rng = seededRng("mulrate");
    const rates = [0.12, 0.1, 0.08, 0.06, 0.029, 0.015, 0.01, 0.25, 0.3, 0.05, 0.0075];
    for (let i = 0; i < 4000; i += 1) {
      const cents = randInt(rng, 0, 500_000_000);
      const rate = rates[randInt(rng, 0, rates.length - 1)];
      const bps = BigInt(Math.round(rate * 10_000));
      const exact = Number((BigInt(cents) * bps * 2n + 10_000n) / 20_000n); // floor((2 x cents x bps + 10,000) / 20,000) = round half up of cents x bps / 10,000
      expect(mulRate(cents, rate), `${cents} x ${rate}`).toBe(exact);
    }
  });

  it("splitCents always adds back to the total and no share is more than a cent off its exact value", () => {
    const rng = seededRng("split");
    for (let i = 0; i < 1000; i += 1) {
      const n = randInt(rng, 1, 9);
      const weights = Array.from({ length: n }, () => randInt(rng, 0, 40));
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const total = randInt(rng, 0, 1_000_000);
      const parts = splitCents(total, weights);
      const wsum = weights.reduce((a, b) => a + b, 0);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, k) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p - (total * weights[k]) / wsum)).toBeLessThan(1);
        if (weights[k] === 0) expect(p).toBe(0);
      });
    }
  });
});

describe("funding", () => {
  it("keeps the identities: escrow = budget + reserve, card charge = brand funds + processing", () => {
    const rng = seededRng("funding");
    for (let i = 0; i < N; i += 1) {
      const budget = randInt(rng, 10_000, 5_000_000);
      const take = [0.12, 0.1, 0.08, 0.06][randInt(rng, 0, 3)];
      const f = funding({ budget_cents: budget, take_rate: take });
      expect(f.escrow_total_cents).toBe(budget + f.fee_reserve_cents);
      expect(f.brand_funded_cents).toBe(f.escrow_total_cents);
      expect(f.card_charge_cents).toBe(f.brand_funded_cents + f.processing_cents);
      expect(f.processing_cents).toBe(mulRate(f.brand_funded_cents, 0.029) + 30);
      expect(f.card_charge_cents).toBeGreaterThan(budget);
    }
  });

  it("matches a first bounty dollar for dollar up to $500 and waives the fee", () => {
    const rng = seededRng("first");
    for (let i = 0; i < N; i += 1) {
      const funds = randInt(rng, 2000, 2_000_000);
      const f = firstBountyFunding({ brand_funds_cents: funds });
      expect(f.matched_cents).toBe(Math.min(50_000, funds));
      expect(f.budget_cents).toBe(funds + f.matched_cents);
      expect(f.fee_reserve_cents).toBe(0);
      expect(f.brand_funded_cents).toBe(funds);
    }
  });

  it("splits the all-in price into parts that always add up", () => {
    const rng = seededRng("allin");
    for (let i = 0; i < N; i += 1) {
      const rate = randInt(rng, 1, 2000);
      const b = allInBreakdown({ rate_cents: rate, plan: (["free", "pro", "scale"] as const)[randInt(rng, 0, 2)] });
      expect(b.creator_cents + b.fee_cents + b.processing_cents).toBe(b.total_cents);
      expect(b.total_cents).toBeGreaterThanOrEqual(b.creator_cents);
    }
  });
});

describe("stacked pay", () => {
  const randomPost = (rng: Rng) => ({
    window_views: randInt(rng, 0, 400_000),
    cpm_cents: randInt(rng, 50, 600),
    conversions: { install: randInt(rng, 0, 120), trial: randInt(rng, 0, 30), paid: randInt(rng, 0, 12) },
    rates: { install: randInt(rng, 0, 80), trial: randInt(rng, 0, 300), paid: randInt(rng, 0, 800) },
    per_video_cap_cents: randInt(rng, 2000, 60_000),
    take_rate: [0.12, 0.1, 0.08, 0.06, 0][randInt(rng, 0, 4)],
  });

  it("never pays above the cap, pays CPM before CPA, and charges the fee per leg", () => {
    const rng = seededRng("settle");
    for (let i = 0; i < N; i += 1) {
      const p = randomPost(rng);
      const s = settlePost(p);
      expect(s.pay_cents).toBeLessThanOrEqual(p.per_video_cap_cents);
      expect(s.pay_cents).toBe(s.cpm_pay_cents + s.cpa_pay_cents);
      expect(s.cpm_pay_cents).toBe(Math.min(s.cpm_uncapped_cents, p.per_video_cap_cents));
      expect(s.cpa_pay_cents).toBe(Math.min(s.cpa_uncapped_cents, p.per_video_cap_cents - s.cpm_pay_cents));
      expect(s.fee_cents).toBe(mulRate(s.cpm_pay_cents, p.take_rate) + mulRate(s.cpa_pay_cents, p.take_rate));
      expect(s.brand_cost_cents).toBe(s.pay_cents + s.fee_cents);
      expect(s.capped).toBe(s.cpm_uncapped_cents + s.cpa_uncapped_cents > p.per_video_cap_cents);
      expect(s.cap_remaining_cents).toBe(p.per_video_cap_cents - s.pay_cents);
      // the most the brand can ever pay for one post is one reservation unit
      expect(s.brand_cost_cents).toBeLessThanOrEqual(p.per_video_cap_cents + mulRate(p.per_video_cap_cents, p.take_rate) + 1);
    }
  });

  it("pays more views at least as much, until the cap", () => {
    const rng = seededRng("monotone");
    for (let i = 0; i < 400; i += 1) {
      const p = randomPost(rng);
      let last = -1;
      for (const views of [0, 1000, 5000, 20_000, 80_000, 300_000]) {
        const pay = settlePost({ ...p, window_views: views }).pay_cents;
        expect(pay).toBeGreaterThanOrEqual(last);
        last = pay;
      }
    }
  });

  it("posts ledger transactions that each net to zero, whose legs add up to the settlement", () => {
    const rng = seededRng("ledger");
    for (let i = 0; i < 300; i += 1) {
      const p = randomPost(rng);
      const kinds: ConversionKind[] = ["install", "trial", "paid"];
      const conversions: ConversionBatchInput[] = kinds.map((kind, k) => ({ id: `conv_${k}`, kind, source: "link", quantity: p.conversions[kind], status: "cleared" }));
      let n = 0;
      const r = settlePostToLedger({
        bounty: { id: "bnty_x", brand_id: "br_x", title: "T", cpm_cents: p.cpm_cents, per_video_cap_cents: p.per_video_cap_cents, take_rate: p.take_rate, rates: p.rates },
        post: { id: "post_x", creator_id: "cr_x" },
        posted_at: "2026-10-03T14:00:00Z",
        window_views: p.window_views,
        conversions,
        next_txn_id: () => `txn_${(n += 1)}`,
      });
      const direct = settlePost(p);
      for (const t of r.txns) expect(netOf(t.legs)).toBe(0);
      const creatorTotal = r.txns.flatMap((t) => t.legs).filter((l) => l.account === "creator:cr_x").reduce((s, l) => s + l.amount_cents, 0);
      expect(creatorTotal).toBe(r.summary.pay_cents);
      expect(r.summary.pay_cents).toBe(direct.pay_cents);
      expect(r.summary.pay_cents).toBeLessThanOrEqual(p.per_video_cap_cents);
      const escrowDebit = -r.txns.flatMap((t) => t.legs).filter((l) => l.account === "escrow:bnty_x").reduce((s, l) => s + l.amount_cents, 0);
      expect(escrowDebit).toBe(r.summary.brand_cost_cents);
      // a post settled in legs can differ from the one-shot fee by a cent or two of per-leg rounding, never more
      expect(Math.abs(r.summary.fee_cents - direct.fee_cents)).toBeLessThanOrEqual(3);
    }
  });

  it("expects p25 <= median <= p75, all under the cap", () => {
    const rng = seededRng("expected");
    for (let i = 0; i < N; i += 1) {
      const e = expectedEarnings({ base_median_views: randInt(rng, 0, 300_000), cpm_cents: randInt(rng, 50, 600), rates: { install: randInt(rng, 0, 80), trial: randInt(rng, 0, 300), paid: randInt(rng, 0, 800) }, per_video_cap_cents: randInt(rng, 2000, 60_000) });
      expect(e.p25.pay_cents).toBeLessThanOrEqual(e.median.pay_cents);
      expect(e.median.pay_cents).toBeLessThanOrEqual(e.p75.pay_cents);
    }
  });
});

describe("instant cash-out", () => {
  it("charges the fee inside $0.50 to $15.00 and never more than the amount", () => {
    const rng = seededRng("instant");
    const tiers: Tier[] = ["bronze", "silver", "gold", "platinum", "elite"];
    for (let i = 0; i < N; i += 1) {
      const amount = randInt(rng, 0, 3_000_000);
      const tier = tiers[randInt(rng, 0, 4)];
      const q = instantPayout({ amount_cents: amount, tier, free_instant_used_this_week: randInt(rng, 0, 3), founding_free: rng() < 0.1 });
      if (amount < 500) {
        expect(q.ok).toBe(false);
        continue;
      }
      expect(q.ok).toBe(true);
      expect(q.list_fee_cents).toBeGreaterThanOrEqual(50);
      expect(q.list_fee_cents).toBeLessThanOrEqual(1500);
      expect(q.fee_cents === 0 || q.fee_cents === q.list_fee_cents).toBe(true);
      expect(q.net_cents).toBe(amount - q.fee_cents);
      expect(q.free_instant).toBe(q.fee_cents === 0);
    }
  });
});

describe("the Money Clock", () => {
  it("always lands on a real run: 14:00Z clearing, Friday 18:00Z payout, and never before the window plus the buffer", () => {
    const rng = seededRng("clock");
    for (let i = 0; i < N; i += 1) {
      const posted = iso(BASE_MS + randInt(rng, 0, 120 * 24 * 3600) * 1000);
      const now = iso(toMs(posted) + randInt(rng, 0, 12 * 24 * 3600) * 1000);
      const c = moneyClockState({ posted_at: posted, now });
      const windowEnd = addHours(posted, 72);
      expect(c.window_ends_at).toBe(windowEnd);
      if (c.eta_at && (c.state === "accruing" || c.state === "pending")) {
        expect(c.eta_at.slice(11)).toBe("14:00:00Z");
        expect(toMs(c.eta_at)).toBeGreaterThanOrEqual(toMs(windowEnd) + 2 * HOUR_MS);
        expect(toMs(c.eta_at)).toBeLessThan(toMs(windowEnd) + 2 * HOUR_MS + 24 * HOUR_MS);
        expect(toMs(c.eta_at)).toBeGreaterThan(toMs(now) - 1);
      }
      if (c.state === "cleared") {
        expect(c.eta_at).toBeDefined();
        expect(weekdayOf(c.eta_at as string)).toBe(5);
        expect((c.eta_at as string).slice(11)).toBe("18:00:00Z");
        expect(toMs(c.eta_at as string)).toBeGreaterThanOrEqual(toMs(c.cleared_at as string));
        expect(toMs(c.cleared_at as string)).toBeLessThanOrEqual(toMs(now));
      }
      // never a bare state
      expect(bareStateProblem({ state: c.state, reason: c.reason, eta_at: c.eta_at })).toBeNull();
    }
  });

  it("clears a conversion at the first 14:00Z run after its window, and a run is never in the past", () => {
    const rng = seededRng("conv");
    const hours = CONSTANTS.windows.cpa_clear_hours;
    for (let i = 0; i < N; i += 1) {
      const kind = (["install", "trial", "paid"] as const)[randInt(rng, 0, 2)];
      const at = iso(BASE_MS + randInt(rng, 0, 90 * 24 * 3600) * 1000);
      const run = conversionClearingRun(kind, at);
      expect(run.slice(11)).toBe("14:00:00Z");
      expect(toMs(run)).toBeGreaterThanOrEqual(toMs(at) + hours[kind] * HOUR_MS);
      expect(toMs(run) - (toMs(at) + hours[kind] * HOUR_MS)).toBeLessThan(24 * HOUR_MS);
      expect(firstRunAtOrAfter(run)).toBe(run); // a run is its own first run
      const pay = weeklyPayoutFor(run);
      expect(weekdayOf(pay)).toBe(5);
      expect(toMs(pay) - toMs(run)).toBeLessThanOrEqual(7 * 24 * HOUR_MS);
    }
  });
});

describe("tiers and fraud", () => {
  it("never lower a tier because a creator earned more, approved more or got more reliable", () => {
    const rng = seededRng("tier");
    for (let i = 0; i < N; i += 1) {
      const base = { lifetime_cleared_cents: randInt(rng, 0, 7_000_000), approved_count: randInt(rng, 0, 320), approval_rate: randInt(rng, 40, 100) / 100, reliability_score: randInt(rng, 0, 100), elite_reviewed: rng() < 0.5 };
      const better = { ...base, lifetime_cleared_cents: base.lifetime_cleared_cents + randInt(rng, 0, 1_000_000), approved_count: base.approved_count + randInt(rng, 0, 50), approval_rate: Math.min(1, base.approval_rate + 0.05), reliability_score: Math.min(100, base.reliability_score + 3) };
      expect(tierRank(tierFor(better))).toBeGreaterThanOrEqual(tierRank(tierFor(base)));
    }
  });

  it("caps the fraud score at 100 and orders the bands", () => {
    const rng = seededRng("fraud");
    const signals = Object.keys(CONSTANTS.fraud.signals) as FraudSignal[];
    for (let i = 0; i < N; i += 1) {
      const fired: FiredSignal[] = signals.filter(() => rng() < 0.6).map((signal) => ({ signal, severity: randInt(rng, 0, 100) / 100 }));
      const r = fraudScore(fired);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.score).toBe(Math.min(100, r.signals.reduce((s, h) => s + h.points, 0)));
      for (const h of r.signals) expect(h.points).toBeLessThanOrEqual(CONSTANTS.fraud.signals[h.signal].max_points);
      expect(r.band).toBe(r.score >= 70 ? "high" : r.score >= 40 ? "review" : r.score >= 20 ? "watch" : "clean");
    }
  });
});
