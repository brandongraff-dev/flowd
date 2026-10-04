// CORE stage 6d: referral / bonus / prize / adjustment rows, weekly and instant payouts (with holds for the next run), payout ledger transactions.

import { groupBy } from './lib.mjs';
import { instantPayout, mulRate, tierFor, approvalRate } from '../../schema/formulas.mjs';
import { TOURNAMENT_DEFS } from './pools-content.mjs';
import { iso, ms, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, money, runAtOrAfter, weeklyRuns, runIdOf, arrivalAfter, alnum, quant } from './core-kit.mjs';
import { APPROVED_FAMILY } from './core-subs.mjs';

const leg = (acct, type, amt, o = {}) => ({ acct, type, amt, ...o });
const EARNER_TYPES = new Set(['cpm', 'cpa', 'flat_fee', 'commission']);
const fmtDay = (t) => new Date(t).toUTCString().slice(5, 11);

/** referral pairs, welcome bonuses, tournament prizes and one manual adjustment */
export function buildExtras(W) {
  const rng = W.rng.fork('extras');
  const L = W.L;
  const acct = (c) => `creator:${c.id}`;
  const rowsOf = (c) => W.earnRows.filter((r) => r.creator === c && r.status !== 'reversed');
  const earnedBefore = (c) => rowsOf(c).filter((r) => r.type !== 'bonus').reduce((a, r) => a + r.amt, 0);
  const non = W.creators.filter((c) => !c.persona);
  const earners = non.filter((c) => !c.founding && earnedBefore(c) > 20_000);

  // ── referrals (single level, platform-funded): 5% of the referee's cleared earnings for 90 days, capped at $100 per referee
  const pairs = [];
  const refA = non.find((c) => c.tierTarget === 'silver' && !c.founding && earnedBefore(c) > 25_000 && earnedBefore(c) < 110_000 && ms(c.joinedAt) > ms('2026-07-16T00:00:00Z') && ms(c.joinedAt) < ms('2026-08-22T00:00:00Z'));
  const refB = [...non].reverse().find((c) => c.tierTarget === 'bronze' && !c.founding && ms(c.joinedAt) > ms('2026-09-26T00:00:00Z'));
  if (refA) pairs.push([W.maya, refA]);
  if (refB) pairs.push([W.maya, refB]);
  const referrers = non.filter((c) => ['gold', 'platinum', 'elite', 'silver'].includes(c.tierTarget) && c.founding);
  const referees = rng.sample(non.filter((c) => !c.founding && !pairs.some((p) => p[1] === c) && ms(c.joinedAt) > ms('2026-07-20T00:00:00Z')), 14);
  for (const ee of referees) {
    const er = rng.pick(referrers.filter((x) => ms(x.joinedAt) < ms(ee.joinedAt)));
    if (er) pairs.push([er, ee]);
  }
  W.referralPairs = [];
  for (const [er, ee] of pairs) {
    ee.referredBy = er;
    const base = rowsOf(ee).filter((r) => EARNER_TYPES.has(r.type) && (r.clearedMs ?? Infinity) <= NOW_EPOCH && r.status !== 'pending').sort((a, b) => a.clearedMs - b.clearedMs);
    let paid = 0;
    let total = 0;
    const win = ms(ee.joinedAt) + C.referrals.creator_share_days * DAY_MS;
    for (let f = ms('2026-07-10T10:00:00Z'); f <= NOW_EPOCH - 4 * HOUR_MS; f += 7 * DAY_MS) {
      const wk = base.filter((r) => r.clearedMs > f - 7 * DAY_MS && r.clearedMs <= f && r.clearedMs <= win).reduce((a, r) => a + r.amt, 0);
      if (wk <= 0) continue;
      let amt = mulRate(wk, C.referrals.creator_share_rate);
      amt = Math.min(amt, C.referrals.creator_share_cap_per_referee_cents - paid);
      if (amt <= 0) continue;
      paid += amt; total += wk;
      const memo = `Referral reward: 5% of @${ee.handle}'s cleared earnings, week to ${fmtDay(f)}`;
      const cr = leg(acct(er), 'referral', amt, { creator: er, memo, status: 'cleared', clearedMs: ms(`${dateOf(iso(f))}T14:00:00Z`), earning: true });
      L.add(f, [leg('platform:promo', 'referral', -amt, { memo, status: 'cleared' }), cr], 'referral');
      W.earnRows.push(cr);
    }
    W.referralPairs.push({ referrer: er, referee: ee, paid, basis: total, since: ee.joinedAt });
  }

  // ── welcome bonus for founding creators (platform promo)
  const bonusBy = { elite: 5_000, platinum: 4_000, gold: 3_000, silver: 2_500, bronze: 2_000 };
  for (const c of W.creators.filter((x) => x.founding)) {
    const first = W.earnRows.filter((r) => r.creator === c && r.status !== 'reversed').sort((a, b) => (a.clearedMs ?? a.postedMs) - (b.clearedMs ?? b.postedMs))[0];
    const at = Math.max(ms(c.joinedAt) + 9 * DAY_MS, (first?.clearedMs ?? ms(c.joinedAt)) + 3 * DAY_MS);
    if (at > NOW_EPOCH - 36 * HOUR_MS) continue;
    const amt = bonusBy[c.tierTarget];
    const memo = 'Founding creator bonus: welcome to flowd';
    const clearedMs = ms(runAtOrAfter(iso(at)));
    const cr = leg(acct(c), 'bonus', amt, { creator: c, memo, status: clearedMs <= NOW_EPOCH ? 'cleared' : 'pending', clearedMs: clearedMs <= NOW_EPOCH ? clearedMs : undefined, earning: true });
    L.add(at, [leg('platform:promo', 'bonus', -amt, { memo, status: 'cleared' }), cr], 'bonus');
    W.earnRows.push(cr);
  }

  // ── tournament prizes: the first three tournaments are complete
  const winnersPool = non.filter((c) => ['gold', 'platinum', 'elite', 'silver'].includes(c.tierTarget));
  const split = [0.4, 0.25, 0.15, 0.05, 0.05, 0.05, 0.05];
  const prizeAt = ['2026-08-26T12:00:00Z', '2026-09-09T12:00:00Z', '2026-09-23T12:00:00Z'];
  W.prizes = [];
  TOURNAMENT_DEFS.slice(0, 3).forEach((def, i) => {
    const ws = rng.sample(winnersPool.filter((c) => ms(c.joinedAt) < ms(prizeAt[i]) - 12 * DAY_MS), split.length);
    const amounts = split.map((s) => Math.round((def.pool_cents * s) / 100) * 100);
    amounts[0] += def.pool_cents - amounts.reduce((a, x) => a + x, 0);
    ws.forEach((c, k) => {
      const place = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][k];
      const memo = `Prize: ${def.title}, ${place} place`;
      const at = ms(prizeAt[i]);
      const clearedMs = ms(runAtOrAfter(iso(at)));
      const cr = leg(acct(c), 'prize', amounts[k], { creator: c, memo, status: clearedMs <= NOW_EPOCH ? 'cleared' : 'pending', clearedMs: clearedMs <= NOW_EPOCH ? clearedMs : undefined, earning: true });
      L.add(at, [leg('platform:promo', 'prize', -amounts[k], { memo, status: 'cleared' }), cr], 'prize');
      W.earnRows.push(cr);
      W.prizes.push({ tournament: def.title, place: k + 1, creator: c, amount: amounts[k], at: prizeAt[i] });
    });
  });

  // ── one manual adjustment (Ops): a trial credited to the wrong link
  const adjC = rng.pick(non.filter((c) => c.tierTarget === 'silver' && !c.founding && earnedBefore(c) > 40_000));
  if (adjC) {
    const at = ms('2026-09-14T15:20:00Z');
    const memo = 'Adjustment: trial credited to the wrong link (dispute resolved), reviewed by Ops';
    const cr = leg(acct(adjC), 'adjustment', 1_240, { creator: adjC, memo, status: 'cleared', clearedMs: ms('2026-09-15T14:00:00Z'), earning: false, adjustment: true });
    L.add(at, [leg('platform:promo', 'adjustment', -1_240, { memo, status: 'cleared' }), cr], 'adjustment');
    W.earnRows.push(cr);
    W.adjustment = { creator: adjC, amount: 1_240, at };
  }
}

// ── tier at a point in time (for payout fees) ──────────────────────────────────────────────────
export function tierAtMs(W, c, t) {
  if (c.founding) return c.tierTarget;
  const rows = (c._rows ??= W.earnRows.filter((r) => r.creator === c && r.status !== 'reversed' && TYPE_OK.has(r.type)));
  const lifetime = rows.filter((r) => (r.clearedMs ?? Infinity) <= t && r.status !== 'pending').reduce((a, r) => a + r.amt, 0);
  let approved = 0; let rejected = 0;
  for (const s of c.subs) {
    for (const d of s.derived.decisions) {
      if (d.t > t) continue;
      if (['approve', 'auto_approve', 'timeout_approve', 'appeal_overturn'].includes(d.action)) approved++;
      else if (d.action === 'reject' || d.action === 'auto_reject' || d.action === 'appeal_uphold') rejected++;
    }
  }
  const rate = approvalRate(approved, approved + rejected);
  const tier = tierFor({ lifetime_cleared_cents: lifetime, approved_count: approved, approval_rate: rate, reliability_score: 100, elite_reviewed: false });
  const order = C.tiers.order;
  return order.indexOf(tier) > order.indexOf(c.tierTarget) ? c.tierTarget : tier;
}
const TYPE_OK = new Set(['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral']);

// ── payouts ─────────────────────────────────────────────────────────────────────────────────────
export function buildPayouts(W) {
  const rng = W.rng.fork('payouts');
  const L = W.L;
  const payouts = [];
  W.payouts = payouts;
  const usedProof = new Set();
  const proof = () => { let s; do { s = `prf_${alnum(rng, 8)}`; } while (usedProof.has(s)); usedProof.add(s); return s; };
  // payout methods
  for (const c of W.creators) {
    const last4 = c.persona ? '4821' : String(rng.int(1000, 9999));
    const debit = !c.persona && rng.chance(0.3);
    c.payoutMethod = { kind: debit ? 'debit_card' : 'bank', label: debit ? 'Debit card' : 'Bank account', last4, instantCapable: debit || rng.chance(0.8) || c.persona, method_label: `${debit ? 'Debit card' : 'Bank account'} ••${last4}` };
  }
  const runs = weeklyRuns('2026-10-02T18:00:00Z');
  const lastRunMs = ms(runs[runs.length - 1]);
  const cand = W.earnRows.filter((r) => r.status === 'cleared' && (r.clearedMs ?? Infinity) <= NOW_EPOCH && TYPE_OK.has(r.type) || (r.adjustment && r.status === 'cleared'));
  const byCreator = groupBy(cand, (r) => r.creator);
  const mkTxn = (p, c, gross, fee, net, at, memo) => {
    const legs = [leg(`creator:${c.id}`, 'payout', -gross, { creator: c, memo, status: 'paid', payout: p, paidMs: at }), leg('external:bank', 'payout', net, { memo, status: 'paid', payout: p, paidMs: at })];
    if (fee > 0) legs.push(leg('platform:fees', 'payout_fee', fee, { creator: c, memo: `Instant cash-out fee (${money(fee)})`, status: 'cleared', payout: p }));
    p.txn = L.add(at, legs, 'payout');
  };
  const weekKey = (t) => Math.floor((t - ms('2026-07-06T00:00:00Z')) / (7 * DAY_MS));
  const rowsOfC = (c) => byCreator.get(c) ?? [];
  const totalOf = (c) => rowsOfC(c).reduce((a, r) => a + r.amt, 0);

  // ── who is held at the next run (Fri 2026-10-09). Held creators stop being paid: their cleared money keeps accumulating until the hold lifts.
  const holds = new Map();
  const taken = new Set();
  const pool = (since, min, tiers = ['bronze', 'silver'], active = false) => [...byCreator.keys()].filter((c) => !c.persona && !c.founding && c.flagged !== 'suspect' && !taken.has(c) && ms(c.joinedAt) > ms(since) && totalOf(c) >= min && tiers.includes(c.tierTarget) && (!active || rowsOfC(c).some((r) => r.clearedMs > ms('2026-09-25T18:00:00Z'))));
  const hold = (c, reason, from) => { holds.set(c, { reason, from }); taken.add(c); c.holdReason = reason; };
  // each hold tries progressively looser candidate pools until it has its quota
  const pickHolds = (n, reason, from, specs, active) => {
    let left = n;
    for (const [since, min, tiers] of specs) {
      if (left <= 0) break;
      const picks = rng.sample(pool(since, min, tiers, active), left);
      for (const c of picks) hold(c, reason, from);
      left -= picks.length;
    }
  };
  pickHolds(2, 'identity_check', -Infinity, [['2026-08-10T00:00:00Z', 500, ['bronze']], ['2026-07-20T00:00:00Z', 500, ['bronze']], ['2026-07-14T00:00:00Z', 300, ['bronze', 'silver']]]);
  pickHolds(3, 'tax_info_missing', -Infinity, [['2026-07-20T00:00:00Z', 2500, ['bronze']], ['2026-07-14T00:00:00Z', 1500, ['bronze', 'silver']], ['2026-07-14T00:00:00Z', 300, ['bronze', 'silver']]]);
  pickHolds(1, 'dispute_open', ms('2026-09-26T00:00:00Z'), [['2026-07-20T00:00:00Z', 3000, ['silver', 'bronze']], ['2026-07-14T00:00:00Z', 800, ['silver', 'bronze']], ['2026-07-01T00:00:00Z', 600, ['bronze', 'silver', 'gold']]], true);
  pickHolds(1, 'admin_hold', ms('2026-10-02T09:00:00Z'), [['2026-07-20T00:00:00Z', 3000, ['silver', 'bronze']], ['2026-07-14T00:00:00Z', 800, ['silver', 'bronze']], ['2026-07-01T00:00:00Z', 600, ['bronze', 'silver', 'gold']]], true);
  const fraudCreators = [];
  for (const p of [...W.posts].filter((x) => x.role === 'held_fraud').sort((a, b2) => b2.fraud.score - a.fraud.score)) if (!fraudCreators.includes(p.creator) && !taken.has(p.creator)) fraudCreators.push(p.creator);
  for (const c of fraudCreators.slice(0, 2)) hold(c, 'fraud_review', ms('2026-10-02T09:00:00Z'));
  // one weekly transfer bounced on Friday: the bank returned it, so the creator's payout method needs fixing and the money waits
  const failedCreator = rng.sample([...byCreator.keys()].filter((c) => !c.persona && !c.founding && !taken.has(c) && c.flagged !== 'suspect'
    && rowsOfC(c).filter((r) => r.clearedMs > lastRunMs - 7 * DAY_MS && r.clearedMs <= lastRunMs).reduce((a, r) => a + r.amt, 0) >= 1500
    && !rowsOfC(c).some((r) => r.clearedMs > lastRunMs)), 1)[0];
  if (failedCreator) { failedCreator.holdReason = 'payout_method_missing'; failedCreator.failedPayout = true; taken.add(failedCreator); }

  for (const [c, rows0] of byCreator) {
    const rows = [...rows0].sort((a, b) => a.clearedMs - b.clearedMs);
    const events = runs.map((t) => ({ t: ms(t), kind: 'weekly' }));
    // instant cash-outs at random days after the first cleared item
    const first = rows[0].clearedMs;
    const pI = c.founding ? 0.05 : c.tierTarget === 'gold' ? 0.12 : 0.08;
    for (let t = first + DAY_MS; t < NOW_EPOCH - DAY_MS; t += DAY_MS) if (rng.chance(pI)) events.push({ t: t + rng.int(9, 22) * HOUR_MS + rng.int(0, 59) * 60_000, kind: 'instant' });
    if (c.persona) events.push({ t: ms('2026-09-17T15:40:00Z'), kind: 'instant', forced: true });
    events.sort((a, b2) => a.t - b2.t);
    const usedFreeWeek = new Set();
    const h = holds.get(c);
    for (const e of events) {
      if (h && (e.t >= h.from || (e.kind === 'instant' && e.t > ms('2026-09-25T18:00:00Z')))) continue;
      const take = rows.filter((r) => !r.payout && r.clearedMs <= e.t);
      const gross = take.reduce((a, r) => a + r.amt, 0);
      if (take.length === 0 || gross <= 0) continue;
      if (e.kind === 'weekly' && gross < 100) continue; // balances under $1.00 roll over to the next weekly run
      const tier = tierAtMs(W, c, e.t);
      if (e.kind === 'instant') {
        if (!(c.payoutMethod.instantCapable)) continue;
        const wk = weekKey(e.t);
        const free = c.founding || ['platinum', 'elite'].includes(tier) || (tier === 'gold' && !usedFreeWeek.has(wk));
        const f = instantPayout({ amount_cents: gross, tier, founding_free: c.founding, free_instant_used_this_week: usedFreeWeek.has(wk) ? 99 : 0 });
        if (!f.ok) continue;
        if (tier === 'gold' && f.free_instant) usedFreeWeek.add(wk);
        const p = { id: null, creator: c, kind: 'instant', status: 'paid', gross, fee: f.fee_cents, net: f.net_cents, runId: undefined, requestedMs: e.t, scheduledMs: e.t, initiatedMs: e.t + 60_000, paidMs: e.t + rng.int(3, 25) * 60_000, tier, freeInstant: f.free_instant || free && f.fee_cents === 0, rows: take, itemCount: take.length };
        if (p.fee === 0) p.freeInstant = true; else p.freeInstant = false;
        for (const r of take) { r.payout = p; r.status = 'paid'; r.paidMs = p.initiatedMs; }
        mkTxn(p, c, gross, p.fee, p.net, p.initiatedMs, `Instant cash-out${p.fee > 0 ? ` (fee ${money(p.fee)})` : ''}`);
        payouts.push(p);
      } else if (c === failedCreator && e.t === lastRunMs) {
        // the transfer was created and bounced: no ledger movement, the rows stay cleared and join the next run
        payouts.push({ id: null, creator: c, kind: 'weekly', status: 'failed', gross, fee: 0, net: gross, runId: runIdOf(iso(e.t)), requestedMs: Math.max(take[0].clearedMs, e.t - 6 * DAY_MS), scheduledMs: e.t, initiatedMs: e.t + 90_000, failedReason: 'Your bank returned the transfer (account closed). Update your payout method and flowd retries it on the next run.', tier, freeInstant: false, rows: [], itemCount: take.length });
      } else {
        const initiated = e.t + 90_000;
        const arrival = ms(arrivalAfter(iso(e.t), 1));
        const paid = arrival <= NOW_EPOCH;
        const p = { id: null, creator: c, kind: 'weekly', status: paid ? 'paid' : 'in_transit', gross, fee: 0, net: gross, runId: runIdOf(iso(e.t)), requestedMs: Math.max(take[0].clearedMs, e.t - 6 * DAY_MS), scheduledMs: e.t, initiatedMs: initiated, paidMs: paid ? arrival : undefined, tier, freeInstant: false, rows: take, itemCount: take.length };
        for (const r of take) { r.payout = p; r.status = 'paid'; r.paidMs = initiated; }
        mkTxn(p, c, gross, 0, gross, initiated, `Weekly payout ${p.runId}`);
        payouts.push(p);
      }
    }
  }
  // ── a cancelled instant cash-out (the creator changed their mind before it was processed): no money moves
  {
    const cands = [...byCreator.keys()].filter((c) => !c.persona && c.payoutMethod.instantCapable && !holds.has(c) && c !== failedCreator && ['silver', 'gold', 'bronze'].includes(c.tierTarget) && totalOf(c) > 6000);
    const c = rng.sample(cands, 1)[0];
    if (c) {
      const rows = [...rowsOfC(c)].sort((a, b) => a.clearedMs - b.clearedMs);
      for (let t = rows[0].clearedMs + 12 * HOUR_MS; t < NOW_EPOCH - 6 * DAY_MS; t += DAY_MS) {
        const open = rows.filter((r) => r.clearedMs <= t && (!r.payout || r.payout.initiatedMs > t));
        const gross = open.reduce((a, r) => a + r.amt, 0);
        if (gross < 1500) continue;
        const tier = tierAtMs(W, c, t);
        const f = instantPayout({ amount_cents: gross, tier, founding_free: c.founding, free_instant_used_this_week: 99 });
        if (!f.ok) continue;
        payouts.push({ id: null, creator: c, kind: 'instant', status: 'cancelled', gross, fee: f.fee_cents, net: f.net_cents, requestedMs: t, scheduledMs: t, tier, freeInstant: f.fee_cents === 0, rows: [], itemCount: open.length });
        break;
      }
    }
  }
  // ── an instant cash-out that was started a moment ago (the 14:00 clearing run just cleared its money): still processing
  {
    const remainingNow = new Map();
    for (const r of W.earnRows) if (r.status === 'cleared' && !r.payout && (r.clearedMs ?? Infinity) <= NOW_EPOCH && TYPE_OK.has(r.type)) { if (!remainingNow.has(r.creator)) remainingNow.set(r.creator, []); remainingNow.get(r.creator).push(r); }
    const cands = [...remainingNow.entries()].filter(([c, rs]) => !c.persona && !holds.has(c) && c !== failedCreator && c.payoutMethod.instantCapable && c.tierTarget !== 'bronze' && rs.reduce((a, r) => a + r.amt, 0) >= 800);
    const pick = cands.length ? rng.pick(cands) : null;
    if (pick) {
      const [c, take] = pick;
      const gross = take.reduce((a, r) => a + r.amt, 0);
      const tier = tierAtMs(W, c, NOW_EPOCH);
      const f = instantPayout({ amount_cents: gross, tier, founding_free: c.founding, free_instant_used_this_week: 0 });
      if (f.ok) {
        const p = { id: null, creator: c, kind: 'instant', status: 'processing', gross, fee: f.fee_cents, net: f.net_cents, runId: undefined, requestedMs: NOW_EPOCH, scheduledMs: NOW_EPOCH, initiatedMs: NOW_EPOCH, paidMs: undefined, tier, freeInstant: f.fee_cents === 0, rows: take, itemCount: take.length };
        for (const r of take) { r.payout = p; r.status = 'paid'; r.paidMs = NOW_EPOCH; }
        mkTxn(p, c, gross, p.fee, p.net, NOW_EPOCH, `Instant cash-out${p.fee > 0 ? ` (fee ${money(p.fee)})` : ''}`);
        payouts.push(p);
      }
    }
  }
  // ── the next run (Fri 2026-10-09 18:00Z): cleared money not yet paid; held creators carry everything they have accumulated
  const nextRun = ms('2026-10-09T18:00:00Z');
  const remaining = new Map();
  for (const r of W.earnRows) if (r.status === 'cleared' && !r.payout && (r.clearedMs ?? Infinity) <= NOW_EPOCH && (TYPE_OK.has(r.type))) { if (!remaining.has(r.creator)) remaining.set(r.creator, []); remaining.get(r.creator).push(r); }
  // fraud-held posts: the held pay is part of that creator's held payout even when nothing else has cleared
  for (const c of fraudCreators.slice(0, 2)) {
    const heldRows = W.earnRows.filter((r) => r.creator === c && r.status === 'held' && !r.payout && TYPE_OK.has(r.type) && r.amt > 0);
    if (heldRows.length) remaining.set(c, [...(remaining.get(c) ?? []), ...heldRows]);
  }
  const creatorsWith = [...remaining.keys()].filter((c) => !c.persona);
  for (const [c, rows] of remaining) {
    const gross = rows.reduce((a, r) => a + r.amt, 0);
    if (gross <= 0 || (gross < 100 && !c.holdReason)) continue;
    const tier = tierAtMs(W, c, NOW_EPOCH);
    const held = c.holdReason;
    const p = { id: null, creator: c, kind: 'weekly', status: held ? 'held' : 'scheduled', gross, fee: 0, net: gross, runId: runIdOf(iso(nextRun)), requestedMs: Math.min(...rows.map((r) => r.clearedMs ?? r.postedMs)), scheduledMs: nextRun, tier, freeInstant: false, holdReason: held, rows, itemCount: rows.length, future: true };
    if (held) for (const r of rows) r.status = 'held';
    payouts.push(p);
  }
  // ids and proofs in requested order
  payouts.sort((a, b2) => a.requestedMs - b2.requestedMs || a.scheduledMs - b2.scheduledMs);
  payouts.forEach((p, i) => { p.id = `pay_${String(i + 1).padStart(4, '0')}`; p.proof = proof(); p.transfer = p.initiatedMs ? `tr_${alnum(rng, 16)}` : undefined; });
  W.heldCreators = creatorsWith.filter((c) => c.holdReason);
  return payouts;
}
