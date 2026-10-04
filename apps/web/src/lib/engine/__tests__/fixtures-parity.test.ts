/**
 * Fixture parity: the generated demo world (packages/contract/fixtures) must agree with the engine. The fixtures come from the contract's reference
 * generator; every check here is an invariant of DOMAIN.md that the engine implements independently, so a failure means the data and the formulas
 * have drifted apart (fix whichever is wrong). The suite skips itself when the fixtures have not been generated.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  Bounty,
  BrandScorecard,
  Conversion,
  Creator,
  CreatorReputation,
  HoldReason,
  LedgerEntry,
  MoneyClockReason,
  MoneyClockRow,
  OfferCode,
  Payout,
  Post,
  Referral,
  RightsGrant,
  SocialAccount,
} from "@/lib/contract/types";
import { validatePool } from "../attribution";
import { payMath } from "../earnings";
import { fraudBand } from "../fraud";
import { funnelFromConversions } from "../funnel";
import { balanceOf, reconcileBounty, verifyLedger } from "../ledger";
import { mulRate } from "../money";
import { conversionClockState, estimatePayoutArrival, instantPayout, moneyClockState, summarizeMoneyClock } from "../moneyclock";
import { isFunded } from "../pricing";
import { referralStatus } from "../referral";
import { brandReliability } from "../reputation";
import { deriveGrantStatus, renewalPricePer30 } from "../rights";
import { cpaMemo } from "../settlement";
import { approvalRate, tierFor, tierProgress } from "../tiers";

const DIR = fileURLToPath(new URL("../../../../../../packages/contract/fixtures/", import.meta.url));
const available = existsSync(`${DIR}ledger.json`) && existsSync(`${DIR}bounties.json`) && existsSync(`${DIR}money_clock.json`);
const load = <T>(name: string): T[] => JSON.parse(readFileSync(`${DIR}${name}.json`, "utf8")) as T[];
const NOW = "2026-10-03T14:00:00Z";

const HOLD: Partial<Record<MoneyClockReason, HoldReason>> = {
  held_fraud_review: "fraud_review",
  held_dispute: "dispute_open",
  held_tax_info: "tax_info_missing",
  held_identity_check: "identity_check",
  held_payout_method: "payout_method_missing",
  held_compliance: "compliance_fail",
};

describe.skipIf(!available)("engine vs the generated demo world", () => {
  const ledger = available ? load<LedgerEntry>("ledger") : [];
  const bounties = available ? load<Bounty>("bounties") : [];
  const creators = available ? load<Creator>("creators") : [];
  const posts = available ? load<Post>("posts") : [];
  const conversions = available ? load<Conversion>("conversions") : [];
  const payouts = available ? load<Payout>("payouts") : [];
  const bountyById = new Map(bounties.map((b) => [b.id, b]));
  const postById = new Map(posts.map((p) => [p.id, p]));
  const payoutById = new Map(payouts.map((p) => [p.id, p]));

  it("L-01 and L-17: every transaction nets to zero and platform accounts stay non-negative", () => {
    expect(verifyLedger(ledger)).toEqual({ ok: true, violations: [] });
    expect(ledger.length).toBeGreaterThan(1000);
  });

  it("L-03, L-04 and L-08: every bounty reconciles with its escrow legs", () => {
    const problems = bounties.flatMap((b) => reconcileBounty(ledger, b));
    expect(problems).toEqual([]);
  });

  it("L-05 and the fee reserve: Funded means escrow covers budget + reserve, and the reserve is round(budget x take rate)", () => {
    for (const b of bounties) {
      if (b.take_rate > 0) expect(mulRate(b.budget_cents, b.take_rate), b.id).toBe(b.fee_reserve_cents);
      if (!["draft", "awaiting_funding"].includes(b.status)) expect(isFunded({ escrow_funded_cents: b.escrow_funded_cents, budget_cents: b.budget_cents, fee_reserve_cents: b.fee_reserve_cents }), b.id).toBe(true);
    }
  });

  it("L-11: every settlement fee is round(pay x take rate), and CPA memos read like the engine's", () => {
    const byTxn = new Map<string, LedgerEntry[]>();
    for (const l of ledger) byTxn.set(l.txn_id, [...(byTxn.get(l.txn_id) ?? []), l]);
    let checked = 0;
    for (const l of ledger) {
      const b = l.bounty_id ? bountyById.get(l.bounty_id) : undefined;
      if (!b) continue;
      if (l.entry_type === "fee" && l.account === "platform:fees") {
        const pay = (byTxn.get(l.txn_id) ?? []).find((x) => x.account.startsWith("creator:"))?.amount_cents ?? 0;
        expect(l.amount_cents, `${l.txn_id}`).toBe(mulRate(pay, b.take_rate));
        checked += 1;
      }
      if (l.entry_type === "cpa" && l.account.startsWith("creator:")) {
        const c = conversions.find((x) => x.id === l.conversion_id);
        if (c) expect(l.memo, l.id).toBe(cpaMemo(c.kind, c.quantity, c.source, b.title));
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("T-03: every creator's tier and approval rate follow the thresholds (outside a grace hold)", () => {
    for (const c of creators) {
      if (c.tier_basis === "grace_hold") continue;
      const tier = tierFor({ lifetime_cleared_cents: c.lifetime_cleared_cents, approved_count: c.approved_count, approval_rate: c.approval_rate, reliability_score: c.reliability_score, elite_reviewed: Boolean(c.tier_review) });
      expect(tier, c.id).toBe(c.tier);
      expect(approvalRate(c.approved_count, c.decided_count), c.id).toBe(c.approval_rate);
    }
  });

  it("tier progress on the reputation cards is the bottleneck of the next tier's criteria", () => {
    const creatorById = new Map(creators.map((c) => [c.id, c]));
    for (const r of load<CreatorReputation>("creator_reputation")) {
      const c = creatorById.get(r.creator_id) as Creator;
      const tp = tierProgress({ lifetime_cleared_cents: c.lifetime_cleared_cents, approved_count: c.approved_count, approval_rate: c.approval_rate, reliability_score: c.reliability_score, elite_reviewed: Boolean(c.tier_review) }, c.tier);
      expect(tp.progress, r.creator_id).toBe(r.tier_progress.progress);
      expect(tp.next, r.creator_id).toBe(r.tier_progress.next);
      expect(tp.criteria.map((x) => [x.key, x.have, x.need, x.met]), r.creator_id).toEqual(r.tier_progress.criteria.map((x) => [x.key, x.have, x.need, x.met]));
    }
  });

  it("T-04: every Brand Scorecard recomputes from its components", () => {
    for (const s of load<BrandScorecard>("brand_scorecards")) {
      const r = brandReliability({ decisions_n: s.decisions_n, approved_n: s.approved_n, decision_hours_median: s.decision_hours_median, appeals_overturned: s.appeals_overturned, pays_on_time_ratio: s.pays_on_time_ratio, run_rate: s.run_rate, reply_hours_median: s.reply_hours_median });
      expect([r.score, r.band], s.brand_id).toEqual([s.reliability_score, s.band]);
    }
  });

  it("T-05: a post's fraud score is min(100, sum of its signal points) and its band follows", () => {
    for (const p of posts) {
      expect(p.fraud.score, p.id).toBe(Math.min(100, p.fraud.signals.reduce((s, x) => s + x.points, 0)));
      expect(fraudBand(p.fraud.score), p.id).toBe(p.fraud.band);
    }
  });

  it("M-02: a post's funnel is its tracked conversions, with the estimated ones counted apart", () => {
    const byPost = new Map<string, Conversion[]>();
    for (const c of conversions) byPost.set(c.post_id, [...(byPost.get(c.post_id) ?? []), c]);
    for (const p of posts) {
      const f = funnelFromConversions({ views: p.funnel.views, clicks: p.funnel.clicks }, byPost.get(p.id) ?? []);
      expect(f, p.id).toEqual({ ...p.funnel, views: p.funnel.views, clicks: p.funnel.clicks });
    }
  });

  it("L-10: an instant cash-out fee is the list fee, or zero when a perk makes it free", () => {
    let n = 0;
    for (const p of payouts) {
      if (p.kind !== "instant") continue;
      const q = instantPayout({ amount_cents: p.gross_cents, tier: p.tier_at_payout, free_instant_used_this_week: 0 });
      if (!q.ok) continue;
      expect(p.fee_cents, p.id).toBe(p.free_instant ? 0 : q.list_fee_cents);
      expect(p.net_cents, p.id).toBe(p.gross_cents - p.fee_cents);
      n += 1;
    }
    expect(n).toBeGreaterThan(10);
  });

  it("T-12: the offer-code pool respects Apple's 10 active codes per SKU", () => {
    expect(validatePool(load<OfferCode>("offer_code_pool"))).toEqual([]);
  });

  it("T-11: a rights grant's status and renewal price follow the term", () => {
    for (const g of load<RightsGrant>("rights_grants")) {
      expect(deriveGrantStatus({ status: g.status, ends_at: g.ends_at, revoked_at: g.revoked_at, now: NOW }), g.id).toBe(g.status);
      expect(renewalPricePer30(g.base_fee_cents, g.renewal_pct_per_30d), g.id).toBe(g.renewal_price_cents);
    }
  });

  it("every bounty's Pay Math is what the engine computes at the bounty's own take rate", () => {
    for (const b of bounties) {
      if (!b.pay_math) continue;
      const pm = payMath({
        cpm_cents: b.cpm_cents,
        rates: { install: b.cpa_install_cents, trial: b.cpa_trial_cents, paid: b.cpa_paid_cents },
        per_video_cap_cents: b.per_video_cap_cents,
        plan: "free",
        take_rate: b.take_rate,
        flat_fee_cents: b.flat_fee_cents,
        median_views: b.pay_math.expected_views_median,
        basis: b.pay_math.basis,
      });
      expect(pm, b.id).toEqual(b.pay_math);
    }
  });

  it("the Money Clock agrees with the engine for every post and conversion row", () => {
    const rows = load<MoneyClockRow>("money_clock");
    let checked = 0;
    for (const r of rows) {
      const payout = r.payout_id ? payoutById.get(r.payout_id) : undefined;
      const arrives = payout && (payout.status === "in_transit" || payout.status === "processing") && payout.initiated_at ? estimatePayoutArrival({ kind: payout.kind, initiated_at: payout.initiated_at }) : undefined;
      const held = r.state === "held";
      const hold_reason = held ? HOLD[r.reason] : undefined;
      if (r.source === "cpm" && r.post_id) {
        const p = postById.get(r.post_id) as Post;
        const c = moneyClockState({ posted_at: p.posted_at, now: NOW, held, hold_reason, paid_at: r.paid_at, payout_arrives_at: arrives, reversed: r.state === "reversed" });
        expect([c.state, c.reason, c.eta_at], r.id).toEqual([r.state, r.reason, r.eta_at]);
        checked += 1;
      } else if ((r.source === "cpa_install" || r.source === "cpa_trial" || r.source === "cpa_paid") && r.post_id) {
        const kind = r.source === "cpa_install" ? "install" : r.source === "cpa_trial" ? "trial" : "paid";
        const batch = (r.conversion_id ? conversions.find((x) => x.id === r.conversion_id) : undefined) ?? conversions.find((x) => x.post_id === r.post_id && x.kind === kind && x.first_at === r.earned_at) ?? conversions.find((x) => x.post_id === r.post_id && x.kind === kind);
        if (!batch) continue;
        const p = postById.get(r.post_id) as Post;
        const c = conversionClockState({ kind, occurred_at: batch.first_at, now: NOW, post_posted_at: p.posted_at, held, hold_reason, paid_at: r.paid_at, payout_arrives_at: arrives, reversed: r.state === "reversed" });
        expect([c.state, c.eta_at], r.id).toEqual([r.state, r.eta_at]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("P-01: Maya's wallet is $212.00 pending and $86.00 cleared, from her Money Clock rows", () => {
    const rows = load<MoneyClockRow>("money_clock").filter((r) => r.creator_id === "cr_maya");
    const s = summarizeMoneyClock(rows, NOW);
    expect([s.pending_cents, s.cleared_cents]).toEqual([21_200, 8600]);
    // and the ledger agrees she has earned at least what was paid out
    expect(balanceOf(ledger, "creator:cr_maya")).toBeGreaterThanOrEqual(0);
  });

  it("referral status follows the dates", () => {
    for (const r of load<Referral>("referrals")) {
      if (r.kind !== "creator") continue;
      expect(referralStatus({ invited_at: r.invited_at, joined_at: r.joined_at, first_dollar_at: r.first_dollar_at, reward_window_ends_at: r.reward_window_ends_at, reward_earned_cents: r.reward_earned_cents, now: NOW }), r.id).toBe(r.status);
    }
  });

  it("every social account the matcher reads has the fields it needs", () => {
    for (const a of load<SocialAccount>("social_accounts")) {
      expect(typeof a.median_views_28d, a.id).toBe("number");
      expect(typeof a.us_audience_ratio, a.id).toBe("number");
    }
  });
});
