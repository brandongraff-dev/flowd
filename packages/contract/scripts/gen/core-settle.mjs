// CORE stage 6a: settlement planning. For every post: CPM / flat / CPA legs with the per-video cap, clearing times, and per-bounty budget sizing.

import { allocate } from './lib.mjs';
import { mulRate, funding, allInCpm, reservationUnit, postClearingRun, conversionClearingRun } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, runAtOrAfter, niceBudget, hoursOf } from './core-kit.mjs';
import { cumulative } from './core-posts.mjs';
import { OPEN_STATUSES } from './core-subs.mjs';

const KIND_ORDER = { install: 0, trial: 1, paid: 2 };
const RATE_IDX = { install: 0, trial: 1, paid: 2 };

/** time a conversion batch reaches payout eligibility: its own clearing run, but never before the post's CPM clearing */
export function convClearMs(p, bt) {
  const own = ms(conversionClearingRun(bt.kind, iso(bt.firstAtMs)));
  const postRun = ms(postClearingRun(p.windowEndsAt));
  return Math.max(own, postRun);
}

/** plan the money of one post (no ledger yet) */
export function planPost(W, p) {
  const b = p.bounty;
  const rate = b.take_rate;
  const cap = b.per_video_cap_cents;
  const cpm = b.cpm_cents;
  const out = { cpm: null, flat: null, cpa: [], estimate: null };
  p.plan = out;
  if (p.removedAt) {
    // a post taken down inside its 72-hour window accrues no pay: tracked conversions are rejected, estimated ones keep their own clearing status
    for (const bt of p.convBatches) {
      const det = bt.source === 'link' || bt.source === 'code';
      bt.capped = false; bt.pay = 0; bt.fee = 0;
      if (det) { bt.status = 'rejected'; bt.payable = false; bt.rejectReason = 'Post removed before the 72-hour window closed, so no pay accrues'; }
      else { bt.status = ms(conversionClearingRun(bt.kind, iso(bt.firstAtMs))) <= NOW_EPOCH ? 'cleared' : 'pending'; bt.payable = false; }
    }
    p.poolPay = 0; p.cpaPay = 0;
    return out;
  }
  const live = p.isLive;
  const windowEnd = ms(p.windowEndsAt);
  const postRun = ms(postClearingRun(p.windowEndsAt));
  const heldAny = p.role === 'held_fraud' || p.role === 'held_compliance';
  const rates = { install: b.cpa[0], trial: b.cpa[1], paid: b.cpa[2] };
  // ── CPM / flat leg
  let pool = 0;
  if (b.flat_fee_cents > 0) {
    const pay = b.flat_fee_cents;
    pool = pay;
    if (b.is_starter) {
      const approvedAt = p.s.derived.approvedAt;
      const clearAt = ms(runAtOrAfter(iso(approvedAt + 48 * HOUR_MS)));
      out.flat = { pay, fee: mulRate(pay, rate), postedMs: approvedAt + HOUR_MS, runMs: clearAt, cleared: clearAt <= NOW_EPOCH, held: false };
    } else if (!live) {
      out.flat = { pay, fee: mulRate(pay, rate), postedMs: windowEnd, runMs: postRun, cleared: postRun <= NOW_EPOCH && !heldAny, held: heldAny };
    } else out.estimate = { flat: pay, cpm: 0 };
  } else if (cpm > 0) {
    const wv = p.windowViews;
    const uncapped = Math.round((wv * cpm) / 1000);
    const pay = Math.min(uncapped, cap);
    pool = pay;
    if (!live) {
      out.cpm = { views: wv, uncapped, pay, fee: mulRate(pay, rate), postedMs: windowEnd, runMs: postRun, cleared: postRun <= NOW_EPOCH && !heldAny, held: heldAny };
    } else out.estimate = { cpm: pay, views: wv };
  }
  // ── CPA batches (payable = link / code, not rejected)
  const capAfterCpm = Math.max(0, cap - pool);
  let capLeft = capAfterCpm;
  const payable = p.convBatches.filter((x) => x.source === 'link' || x.source === 'code');
  const seq = payable.map((x) => ({ bt: x, clearMs: convClearMs(p, x) })).sort((a, b2) => a.clearMs - b2.clearMs || KIND_ORDER[a.bt.kind] - KIND_ORDER[b2.bt.kind] || a.bt.firstAtMs - b2.bt.firstAtMs);
  for (const { bt, clearMs } of seq) {
    const r1 = rates[bt.kind] ?? 0;
    const potential = bt.qty * r1;
    const pay = Math.min(potential, capLeft);
    capLeft -= pay;
    bt.capped = pay < potential;
    bt.pay = pay;
    bt.fee = mulRate(pay, rate);
    bt.clearMs = clearMs;
    bt.cleared = !live && !heldAny && clearMs <= NOW_EPOCH && ms(p.windowEndsAt) <= NOW_EPOCH;
    bt.status = bt.cleared ? 'cleared' : 'pending';
    bt.payable = true;
    out.cpa.push(bt);
  }
  // estimated / non-payable batches still need a status
  for (const bt of p.convBatches) {
    if (bt.source === 'link' || bt.source === 'code') continue;
    const own = ms(conversionClearingRun(bt.kind, iso(bt.firstAtMs)));
    bt.status = own <= NOW_EPOCH ? 'cleared' : 'pending';
    bt.payable = false;
    bt.capped = false;
    bt.pay = 0; bt.fee = 0;
  }
  p.poolPay = pool + out.cpa.reduce((a, x) => a + x.pay, 0);
  p.cpaPay = out.cpa.reduce((a, x) => a + x.pay, 0);
  return out;
}

/** projected pay + fee that a live post will still settle (for budget sizing) */
export function projectedLiveSettle(W, p) {
  const b = p.bounty;
  if (!p.isLive) return 0;
  const rate = b.take_rate;
  const cum72 = cumulative(72, p.perf.tau1);
  const ageH = (NOW_EPOCH - p.postedAtMs) / HOUR_MS;
  const cumNow = cumulative(ageH, p.perf.tau1);
  const proj = b.flat_fee_cents > 0 ? b.flat_fee_cents : Math.min(b.per_video_cap_cents, Math.round((p.perf.U * cum72 * b.cpm_cents) / 1000));
  const cpaNow = p.cpaPay ?? 0;
  const cpaProj = Math.round(cpaNow * (cum72 / Math.max(0.05, cumNow)));
  const total = Math.min(b.per_video_cap_cents, proj + cpaProj);
  return total + mulRate(total, rate);
}

/** size every bounty's pool from what actually happened (S spent, R reserved, E live-to-settle) */
export function sizeBudgets(W) {
  const rng = W.rng.fork('budgets');
  for (const b of W.bounties) {
    const r1 = b.take_rate;
    const unit = reservationUnit({ per_video_cap_cents: b.per_video_cap_cents, take_rate: r1 });
    b.unit = unit;
    // S: legs settled at NOW (cpm/flat legs including pending/held, cleared CPA legs) with their fees; E: live posts still to settle
    let S = 0; let E = 0; let R = 0;
    for (const p of b.posts) {
      if (!p.plan) continue;
      const legPay = (p.plan.cpm?.pay ?? 0) + (p.plan.flat?.pay ?? 0);
      const legFee = (p.plan.cpm?.fee ?? 0) + (p.plan.flat?.fee ?? 0);
      S += legPay + legFee;
      for (const bt of p.plan.cpa) if (bt.cleared) S += bt.pay + bt.fee;
      if (p.isLive) E += projectedLiveSettle(W, p);
      else for (const bt of p.plan.cpa) if (!bt.cleared) E += bt.pay + bt.fee;
    }
    for (const s of b.subs) if (OPEN_STATUSES.has(s.derived.status)) R += unit;
    b.S = S; b.E = E; b.R = R;
    const row = b.row;
    const noMoney = ['draft', 'awaiting_funding'].includes(b.status);
    // a private direct bounty is one creator at a flat price: it is funded for exactly that price plus the fee
    if (b.direct) { b.budget = b.flat_fee_cents; b.matched = 0; b.fee_reserve = mulRate(b.budget, r1); b.escrowTotal = b.budget + b.fee_reserve; continue; }
    let T; // escrow total target
    const need = S + R + E;
    const stepFor = (cents) => (cents < 200_000 ? 5_000 : cents < 600_000 ? 10_000 : 25_000);
    if (b.is_first_bounty) {
      // fee waived, matched: brandFunds + min($500, brandFunds)
      let funds = b.brandFunds;
      while (funds + Math.min(C.fees.matched_first_bounty_cap_cents, funds) < need + (b.status === 'settled' ? 0 : unit) + 2_000) funds += 5_000;
      b.matched = Math.min(C.fees.matched_first_bounty_cap_cents, funds);
      b.budget = funds + b.matched;
      b.brandFunds = funds;
    } else if (b.status === 'cancelled' || b.status === 'scheduled' || noMoney) {
      b.budget = row.budget ?? row.pool ?? 150_000;
      b.matched = 0;
    } else {
      let target;
      if (b.status === 'settled') target = (need || unit) / rng.float(0.58, 0.93);
      else if (b.status === 'ended') target = (need || unit) / rng.float(0.6, 0.92);
      else if (b.fillPlan === 'full' || b.status === 'filled') target = need;
      else if (b.fillPlan === 'near') target = need + unit;
      else if (b.status === 'paused') target = need + unit * rng.float(1.6, 3.4);
      else target = need + unit * rng.float(2.2, 8.5);
      if (row.budget && (b.status === 'live')) target = Math.max(target, need + unit);
      if (b.funding_source === 'platform') target = Math.max(target, need + unit * 6, row.pool ?? 0);
      // convert the escrow target to a nice budget under take rate r1
      const fills = b.fillPlan === 'full' || b.status === 'filled';
      // a bounty that is filled at now is funded to the nearest $10 so that less than one reservation unit is left over
      let B = fills ? Math.max(6_000, Math.ceil(target / (1 + r1) / 1_000) * 1_000) : niceBudget(Math.ceil(target / (1 + r1)));
      if (row.budget && b.status === 'live' && B < row.budget && row.budget >= need / (1 + r1)) B = row.budget; // honour the stated pool (Glow-up reveal $3,000)
      // make sure remaining >= E (live posts still pay out) and, for filled bounties, remaining < one reservation unit
      const step = fills ? 1_000 : stepFor(B);
      let guard = 0;
      while (B + mulRate(B, r1) - S - R < E && guard++ < 400) B += step;
      b.budget = B;
      b.matched = 0;
    }
    b.fee_reserve = mulRate(b.budget, r1);
    b.escrowTotal = b.budget + b.fee_reserve;
  }
}
