// CORE stage 7: derived state. Post statuses, conversions and links, bounty money fields (from the ledger), creator stats / tiers / reputation, brand scorecards.

import { groupBy } from './lib.mjs';
import { postClearingRun, conversionClearingRun, tierFor, tierProgress, approvalRate, creatorReliability, brandReliability, brandBadges, funding, allInCpm, round2, slaState } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, med, quant, hoursOf, alnum, slugify } from './core-kit.mjs';
import { APPROVED_FAMILY, OPEN_STATUSES } from './core-subs.mjs';

// ── posts ───────────────────────────────────────────────────────────────────────────────────────
export function derivePosts(W) {
  for (const p of W.posts) {
    const run = ms(postClearingRun(p.windowEndsAt));
    let status;
    if (p.removedAt) status = 'removed';
    else if (p.role === 'clawback') status = 'clawed_back';
    else if (p.isLive) status = 'live';
    else if (p.role === 'held_fraud' || p.role === 'held_compliance') status = 'held';
    else if (run > NOW_EPOCH) status = 'window_closed';
    else {
      const rows = (p.rows ?? []).filter((r) => r.status !== 'reversed');
      const pending = (p.plan?.cpa ?? []).some((bt) => !bt.cleared && bt.pay > 0);
      const allPaid = rows.every((r) => r.status === 'paid') && !pending;
      status = allPaid ? 'paid' : 'cleared';
    }
    p.status = status;
    if (status === 'held') p.holdReason = p.role === 'held_compliance' ? 'compliance_fail' : 'fraud_review';
    if (['cleared', 'paid', 'clawed_back'].includes(status) && run <= NOW_EPOCH) p.clearedAt = iso(run);
    if (status === 'paid') p.paidAt = iso(Math.max(...(p.rows ?? []).filter((r) => r.paidMs).map((r) => r.paidMs), run));
    if (status === 'clawed_back') { const paidRows = (p.rows ?? []).filter((r) => r.paidMs); if (paidRows.length) p.paidAt = iso(Math.max(...paidRows.map((r) => r.paidMs))); }
  }
}

// ── conversions and links ─────────────────────────────────────────────────────────────────────────
export function deriveConversions(W) {
  const rng = W.rng.fork('conv');
  const convs = [];
  for (const p of W.posts) {
    const link = p.s.link;
    if (!link) continue;
    const country = p.creator.countryCode;
    const extra = [];
    for (const bt of p.convBatches) {
      const det = bt.source === 'link' || bt.source === 'code';
      bt.row = {
        post: p, link, app: p.app, bounty: p.bounty, creator: p.creator, kind: bt.kind, source: bt.source, qty: bt.qty, occurredOn: bt.day, firstAt: iso(bt.firstAtMs), bt,
        revenue: bt.kind === 'paid' ? Math.round(bt.qty * p.app.avgFirstPayment * (0.94 + rng.next() * 0.12)) : 0,
        country: rng.chance(0.55) ? (rng.chance(p.account.usRatio) ? 'US' : country) : undefined,
        status: bt.status, payable: det && !!bt.payable, capped: !!bt.capped, rejectReason: bt.rejectReason,
      };
      if (bt.status === 'cleared') bt.row.clearedAt = iso(bt.clearMs ?? ms(conversionClearingRun(bt.kind, iso(bt.firstAtMs))));
      if (bt.status === 'cleared' && !det) bt.row.clearedAt = conversionClearingRun(bt.kind, iso(bt.firstAtMs));
      convs.push(bt.row);
    }
    // a few rejected / refunded batches that never reach the funnel
    if (p.convBatches.length && rng.chance(0.06) && !p.creator.persona) {
      const base = p.convBatches.find((x) => x.source === 'link' && x.kind === 'install');
      if (base) {
        const day = new Date(ms(`${base.day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
        if (ms(`${day}T00:00:00Z`) < NOW_EPOCH && !p.convBatches.some((x) => x.kind === 'install' && x.source === 'link' && x.day === day)) {
          const firstAt = iso(Math.min(NOW_EPOCH - 10 * 60_000, ms(`${day}T00:00:00Z`) + rng.int(3, 20) * HOUR_MS));
          convs.push({ post: p, link, app: p.app, bounty: p.bounty, creator: p.creator, kind: 'install', source: 'link', qty: rng.int(1, 3), occurredOn: day, firstAt, revenue: 0, status: 'rejected', payable: false, capped: false, rejectReason: rng.pick(['Duplicate device fingerprint', 'Emulator install detected', 'Same device installed through two links']), bt: null });
        }
      }
    }
    for (const bt of p.convBatches) {
      if (bt.kind === 'paid' && (bt.source === 'link' || bt.source === 'code') && bt.status === 'cleared' && rng.chance(0.045) && !p.creator.persona) {
        const day = new Date(ms(`${bt.day}T00:00:00Z`) + 2 * DAY_MS).toISOString().slice(0, 10);
        if (ms(`${day}T00:00:00Z`) < NOW_EPOCH - 12 * HOUR_MS) convs.push({ post: p, link, app: p.app, bounty: p.bounty, creator: p.creator, kind: 'paid', source: bt.source, qty: 1, occurredOn: day, firstAt: iso(ms(`${day}T00:00:00Z`) + 9 * HOUR_MS), revenue: 0, status: 'refunded', payable: false, capped: false, rejectReason: 'Refunded within the 7-day window', bt: null });
        break;
      }
    }
  }
  convs.sort((a, b) => a.post.postedAtMs - b.post.postedAtMs || (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0) || a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source));
  convs.forEach((c, i) => { c.id = `conv_${String(i + 1).padStart(5, '0')}`; });
  W.convs = convs;
  // links counters
  for (const p of W.posts) {
    const l = p.s.link;
    if (!l) continue;
    l.post = p;
    l.clicks = p.fn.clicks; l.installs = p.fn.installs; l.trials = p.fn.trials; l.paid = p.fn.paid;
    l.lastClickAt = p.fn.clicks > 0 ? iso(Math.min(NOW_EPOCH - 5 * 60_000, Math.max(p.postedAtMs + 3 * HOUR_MS, p.postedAtMs + Math.min(30 * DAY_MS, NOW_EPOCH - p.postedAtMs) * (0.55 + 0.4 * rng.next())))) : undefined;
  }
  return convs;
}

// ── bounties ─────────────────────────────────────────────────────────────────────────────────────
export function deriveBounties(W) {
  const L = W.L;
  const byEscrow = new Map();
  for (const t of L.txns) for (const l of t.legs) if (l.acct.startsWith('escrow:')) { const k = l.acct.slice(7); if (!byEscrow.has(k)) byEscrow.set(k, []); byEscrow.get(k).push(l); }
  for (const b of W.bounties) {
    const legs = byEscrow.get(b.id) ?? [];
    const funded = legs.filter((l) => l.type === 'escrow_fund' || l.type === 'matched_budget').reduce((a, l) => a + l.amt, 0);
    const matched = legs.filter((l) => l.type === 'matched_budget').reduce((a, l) => a + l.amt, 0);
    const spent = -legs.filter((l) => ['cpm', 'cpa', 'flat_fee'].includes(l.type)).reduce((a, l) => a + l.amt, 0);
    const refunded = -legs.filter((l) => l.type === 'escrow_refund').reduce((a, l) => a + l.amt, 0);
    const balance = legs.reduce((a, l) => a + l.amt, 0);
    const unit = b.unit;
    let reserved = 0;
    for (const s of b.subs) { s.reserved = OPEN_STATUSES.has(s.derived.status) ? unit : 0; reserved += s.reserved; }
    b.escrow_funded = funded; b.matchedC = matched; b.spent = spent; b.refunded = refunded; b.reserved = reserved; b.remaining = balance - reserved;
    b.funded = funded >= b.budget + b.fee_reserve && funded > 0;
    // status check: filled iff remaining < one reservation unit
    if (['live', 'filled'].includes(b.status)) {
      const full = b.remaining < unit;
      if (full && b.status === 'live') b.statusNote = 'live->filled';
      if (!full && b.status === 'filled') b.statusNote = 'filled->live';
      b.status = full ? 'filled' : 'live';
    }
    // pool replay: first time remaining fell below one unit
    const events = [];
    for (const l of legs) if (l.type === 'escrow_fund' || l.type === 'matched_budget') events.push([l.postedMs, l.amt]);
    for (const l of legs) if (['cpm', 'cpa', 'flat_fee'].includes(l.type)) events.push([l.postedMs, l.amt]);
    for (const s of b.subs) {
      const d = s.derived;
      events.push([d.versions[0].at, -unit]);
      const rel = s.derived.status === 'rejected' ? d.decisions.find((x) => x.action === 'reject' || x.action === 'auto_reject')?.t : s.derived.status === 'withdrawn' ? d.withdrawnAt : s.derived.status === 'expired' ? d.expiredAt : s.derived.status === 'released' ? d.releasedAt : s.derived.status === 'posted' ? d.postedAt : undefined;
      if (rel) events.push([rel, unit]);
    }
    events.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
    // filled_at: the first time the pool fell below one unit; a bounty that is filled now was filled for good at the start of its last stretch below one unit
    let bal = 0; let started = false; let firstCross; let persist = null;
    for (const [t, delta] of events) {
      bal += delta;
      if (!started && b.fundedAtMs && t >= b.fundedAtMs) started = true;
      if (started && b.fundedAtMs && t > b.fundedAtMs + 60_000) {
        if (bal < unit) { firstCross ??= t; persist ??= t; } else persist = null;
      }
    }
    b.filledAtMs = b.status === 'filled' ? (persist ?? firstCross) : ['live', 'paused', 'scheduled', 'draft', 'awaiting_funding', 'cancelled'].includes(b.status) ? undefined : firstCross;
    if (b.filledAtMs && b.status !== 'draft') b.timeToFillH = Math.round(((b.filledAtMs - ms(b.publishedAt ?? b.startsAt)) / HOUR_MS) * 10) / 10;
    // counts and funnel
    const ss = b.subs;
    b.counts = {
      creators: new Set(ss.map((s) => s.creator)).size, submissions: ss.length, in_review: ss.filter((s) => s.derived.status === 'in_review').length,
      approved: ss.filter((s) => APPROVED_FAMILY.has(s.derived.status)).length, rejected: ss.filter((s) => s.derived.status === 'rejected').length, posts: b.posts.length, live_posts: b.posts.filter((p) => p.status === 'live').length,
    };
    const fn = { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 };
    for (const p of b.posts) for (const k of Object.keys(fn)) fn[k] += p.fn[k];
    b.funnel = fn;
    const f = funding({ budget_cents: b.budget, take_rate: b.take_rate, matched_cents: b.matched ?? 0 });
    b.allIn = allInCpm({ cpm_cents: b.cpm_cents, budget_cents: b.budget, card_charge_cents: f.card_charge_cents });
    b.fundingCalc = f;
    // dates
    b.firstSubmissionAt = ss.length ? iso(Math.min(...ss.map((s) => s.derived.versions[0].at))) : undefined;
    if (['ended', 'settled'].includes(b.status)) b.endedAt = b.endsAt;
    if (b.status === 'settled') b.settledAt = iso(b.settledAtMs);
    // pool lifecycle sanity
    if (b.remaining < 0) b.moneyError = `negative remaining ${b.remaining}`;
  }
}

// ── creators ─────────────────────────────────────────────────────────────────────────────────────
const TIER_RANK = { bronze: 0, silver: 1, gold: 2, platinum: 3, elite: 4 };

export function deriveCreators(W) {
  const rng = W.rng.fork('creators-derive');
  const rowsBy = groupBy(W.earnRows.filter((r) => ['cleared', 'paid'].includes(r.status) && ['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral'].includes(r.type) && r.amt > 0), (r) => r.creator);
  for (const c of W.creators) {
    const rows = rowsBy.get(c) ?? [];
    c.platformCleared = rows.reduce((a, r) => a + r.amt, 0);
    c.approvedP = c.subs.filter((s) => APPROVED_FAMILY.has(s.derived.status)).length;
    c.rejectedP = c.subs.filter((s) => s.derived.status === 'rejected').length;
    c.postsCount = c.posts.length;
    c.livePosts = c.posts.filter((p) => p.status === 'live').length;
    c.firstDollarMs = rows.length ? Math.min(...rows.map((r) => r.clearedMs)) : undefined;
    // academy lessons completed (the ext fixture agrees: Maya 6)
    c.academy = c.persona ? 6 : c.tierTarget === 'bronze' ? rng.weighted([[0, 30], [1, 22], [2, 18], [3, 12], [4, 8], [5, 6], [6, 4]]) : rng.weighted([[0, 8], [1, 10], [2, 14], [3, 16], [4, 14], [5, 12], [6, 10], [7, 6], [8, 4], [10, 6]]);
    // reputation inputs
    const decisions = [];
    for (const s of c.subs) {
      const d = s.derived;
      if (APPROVED_FAMILY.has(d.status)) decisions.push({ approved: true, decided_at: iso(d.approvedAt) });
      else if (d.status === 'rejected') { const rd = [...d.decisions].reverse().find((x) => ['reject', 'auto_reject', 'appeal_uphold'].includes(x.action)); decisions.push({ approved: false, decided_at: iso(rd?.t ?? d.lastSubmit) }); }
    }
    let onOk = 0; let onTotal = 0;
    for (const s of c.subs) {
      const vs = s.derived.versions;
      for (let i = 1; i < vs.length; i++) {
        const prev = s.derived.decisions.find((x) => x.action === 'request_changes' && x.t < vs[i].at && x.t >= vs[i - 1].at);
        if (prev) { onTotal++; if ((vs[i].at - prev.t) / HOUR_MS <= C.reliability.creator.on_time_resubmit_hours) onOk++; }
      }
      if (s.derived.status === 'expired') onTotal++;
    }
    let ptPosted = 0; let ptApproved = 0;
    for (const s of c.subs) {
      const d = s.derived;
      if (!APPROVED_FAMILY.has(d.status)) continue;
      if (d.status === 'approved' && NOW_EPOCH - d.approvedAt < 7 * DAY_MS) continue;
      ptApproved++;
      if (d.postedAt && d.postedAt - d.approvedAt <= C.reliability.creator.post_through_days * DAY_MS) ptPosted++;
    }
    let compOk = 0; let compTotal = 0;
    for (const p of c.posts) { compTotal++; const v = p.s.vers[p.s.vers.length - 1]; const bad = v.analysis.checks.some((k) => (k.check === 'disclosure_audio' || k.check === 'disclosure_onscreen') && k.result === 'fail'); if (!bad) compOk++; }
    const clawbacks = c.posts.filter((p) => p.status === 'clawed_back').length;
    c.repInput = { decisions, now: NOW, on_time: { ok: onOk, total: onTotal }, post_through: { posted: ptPosted, approved: ptApproved }, compliance: { passed: compOk, total: compTotal }, fraud_confirmed_90d: clawbacks, clawbacks_90d: clawbacks, disputes_lost_90d: 0, academy_lessons: c.academy };
    c.rep = creatorReliability(c.repInput);
  }
  // Maya's reliability is a fixed fact (93): nudge her scripted on-time / compliance counts, never her decisions
  const maya = W.maya;
  if (maya.rep.score !== 93) {
    for (let okAdj = 0; okAdj <= 6; okAdj++) {
      for (let compFail = 0; compFail <= 3; compFail++) {
        const inp = { ...maya.repInput, on_time: { ok: Math.max(0, maya.repInput.on_time.total + 12 - okAdj), total: maya.repInput.on_time.total + 12 }, compliance: { passed: maya.repInput.compliance.total - compFail, total: maya.repInput.compliance.total } };
        const r = creatorReliability(inp);
        // recompute from rounded component values, as the validator does
        const rs = Math.min(100, Math.round(r.components.reduce((a, x) => a + 100 * x.weight * x.value, 0) + r.academy_bonus_points));
        if (rs === 93) { maya.repInput = inp; maya.rep = { ...r, score: 93 }; okAdj = 99; break; }
      }
    }
  }
  // recompute scores from rounded component values (what the validator recomputes)
  for (const c of W.creators) {
    const r = c.rep;
    const base = r.components.reduce((a, x) => a + 100 * x.weight * x.value, 0);
    r.score = r.provisional ? C.reliability.creator.provisional_score : Math.min(100, Math.round(base + r.academy_bonus_points));
  }

  // ── tiers: non-founders are data-driven; founders are assigned to balance 46/24/13/5/2 and carry verified prior history
  const dist = { bronze: 46, silver: 24, gold: 13, platinum: 5, elite: 2 };
  const stats = (c) => ({ lifetime_cleared_cents: c.platformCleared, approved_count: c.approvedP, approval_rate: approvalRate(c.approvedP, c.approvedP + c.rejectedP), reliability_score: c.rep.score, elite_reviewed: false });
  const nonF = W.creators.filter((c) => !c.founding);
  const counts = { bronze: 0, silver: 0, gold: 0, platinum: 0, elite: 0 };
  for (const c of nonF) { c.tier = tierFor(stats(c)); counts[c.tier]++; }
  const founders = W.creators.filter((c) => c.founding);
  const need = { elite: dist.elite, platinum: dist.platinum, gold: dist.gold - counts.gold, silver: dist.silver - counts.silver, bronze: dist.bronze - counts.bronze };
  // the top tiers go to the founders with the cleanest record (reliability 95+ for Elite, 90+ for Platinum), then by size
  const left = new Set(founders);
  const take = (n, test, rank) => { const picks = [...left].filter(test).sort(rank).slice(0, Math.max(0, n)); for (const c of picks) left.delete(c); return picks; };
  const bySize = (a, b) => TIER_RANK[b.tierTarget] - TIER_RANK[a.tierTarget] || b.rep.score - a.rep.score || b.platformCleared - a.platformCleared;
  for (const c of take(need.elite, (x) => !x.rep.provisional && x.rep.score >= 95, bySize)) c.tier = 'elite';
  for (const c of take(need.platinum, (x) => !x.rep.provisional && x.rep.score >= 90, bySize)) c.tier = 'platinum';
  const strength = (c) => TIER_RANK[c.tierTarget] * 1e9 + c.platformCleared + c.rep.score * 1000;
  const sorted = [...left].sort((a, b) => strength(b) - strength(a));
  let i = 0;
  for (const t of ['gold', 'silver', 'bronze']) {
    for (let k = 0; k < Math.max(0, need[t]); k++) { const c = sorted[i++]; if (c) c.tier = t; }
  }
  while (i < sorted.length) sorted[i++].tier = 'bronze';
  // one Gold founder is in a 30-day grace hold after an approval-rate dip (the dip started 11 days ago): tier stays Gold, the computed tier is lower
  const graceCreator = founders.filter((c) => c.tier === 'gold').sort((a, b) => strength(a) - strength(b))[0];
  if (graceCreator) graceCreator.graceHold = { until: iso(NOW_EPOCH + 19 * DAY_MS) };
  // one Platinum founder crossed $10,000 lifetime cleared this week (own platform earnings pushed the verified history over the bar)
  const week = NOW_EPOCH - 6.5 * DAY_MS;
  const promo = founders.filter((c) => c.tier === 'platinum').map((c) => ({ c, row: rowsBy.get(c)?.filter((r) => r.clearedMs > week && r.clearedMs <= NOW_EPOCH).sort((a, b) => a.clearedMs - b.clearedMs)[0] })).filter((x) => x.row).sort((a, b) => b.c.platformCleared - a.c.platformCleared)[0];
  // carry-over: verified prior history that lifts each founder to (just above) their tier thresholds
  for (const c of founders) {
    const t = C.tiers.thresholds[c.tier];
    const own = stats(c);
    let carry = null;
    if (c.tier === 'bronze') {
      // stays bronze: prior history is small
      const cc = rng.int(2, 28) * 1000 / 10;
      const ap = rng.int(0, 3);
      carry = { cleared_cents: Math.round(cc / 100) * 100, approved_count: ap, decided_count: ap + rng.int(0, 2) };
      // must still be bronze overall
      const total = { lifetime_cleared_cents: own.lifetime_cleared_cents + carry.cleared_cents, approved_count: own.approved_count + carry.approved_count };
      if (total.lifetime_cleared_cents >= 25_000 && total.approved_count >= 5) { carry.cleared_cents = Math.max(0, 24_000 - own.lifetime_cleared_cents); carry.approved_count = Math.max(0, 4 - own.approved_count); carry.decided_count = carry.approved_count; }
      if (carry.cleared_cents < 0) carry.cleared_cents = 0;
    } else {
      let clearedNeed = Math.max(0, Math.round(t.lifetime_cleared_cents * rng.float(1.04, 1.35)) - own.lifetime_cleared_cents);
      if (promo && promo.c === c) {
        // lifetime (carry + own) first reaches the Platinum bar at the chosen clearing row
        const before = (rowsBy.get(c) ?? []).filter((r) => r.clearedMs < promo.row.clearedMs).reduce((a, r) => a + r.amt, 0);
        clearedNeed = Math.max(0, t.lifetime_cleared_cents - before - rng.int(40, Math.max(41, Math.floor(promo.row.amt / 2))));
        c.promotedAtMs = promo.row.clearedMs;
      }
      const ownDec = c.approvedP + c.rejectedP;
      const base = c.tier === 'elite' ? 0.9 : c.tier === 'platinum' ? 0.86 : c.tier === 'gold' ? 0.82 : 0.78;
      const ratio = c === graceCreator ? 0.72 : clamp(base + rng.float(-0.02, 0.05), t.approval_rate_min + 0.035, 0.96);
      const wantAppr = Math.round(t.approved_count * rng.float(1.05, 1.3));
      const kRate = Math.ceil((ratio * ownDec - c.approvedP) / (1 - ratio));
      const k = Math.max(0, wantAppr - c.approvedP, kRate);
      const totalAppr = c.approvedP + k;
      const totalDec = Math.max(ownDec + k, Math.round(totalAppr / ratio));
      carry = { cleared_cents: Math.round(clearedNeed / 100) * 100, approved_count: k, decided_count: totalDec - ownDec };
    }
    c.carry = carry;
  }
  for (const c of W.creators) {
    const car = c.carry ?? { cleared_cents: 0, approved_count: 0, decided_count: 0 };
    c.lifetime = c.platformCleared + car.cleared_cents;
    c.approvedAll = c.approvedP + car.approved_count;
    c.decidedAll = c.approvedP + c.rejectedP + car.decided_count;
    c.rate = approvalRate(c.approvedAll, c.decidedAll);
    c.tierOnly = tierFor({ lifetime_cleared_cents: c.lifetime, approved_count: c.approvedAll, approval_rate: c.rate, reliability_score: c.rep.score, elite_reviewed: c.tier === 'elite' });
  }
  return W.creators;
}

// ── brand scorecards ─────────────────────────────────────────────────────────────────────────────
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
export function deriveBrands(W) {
  const rng = W.rng.fork('scorecards');
  const out = [];
  for (const brand of W.brands) {
    if (brand.kind !== 'brand') continue;
    const subs = W.subs.filter((s) => s.brand === brand);
    // decisions: approve + reject (request-changes excluded); hours from the version submit to the decision
    const hours = [];
    let approved = 0; let rejected = 0; let breaches = 0; let appeals = 0; let overturned = 0; let posted = 0; let unused = 0;
    for (const s of subs) {
      const d = s.derived;
      for (const dec of d.decisions) {
        if (dec.by === 'admin') { if (dec.action === 'appeal_overturn') overturned++; continue; }
        if (dec.action === 'approve' || dec.action === 'auto_approve' || dec.action === 'timeout_approve') { approved++; if (dec.action === 'approve') hours.push(dec.hours); if (dec.hours > 72) breaches++; }
        else if (dec.action === 'reject') { rejected++; hours.push(dec.hours); if (dec.hours > 72) breaches++; }
      }
      if (d.appealUsed) appeals++;
      if (d.status === 'in_review') { const h = (NOW_EPOCH - d.lastSubmit) / HOUR_MS; if (h > 72) breaches++; }
      if (d.status === 'posted') posted++;
      if (d.status === 'released') unused++;
    }
    const n = approved + rejected;
    if (n === 0) continue;
    const dm = r1(med(hours));
    const p90 = r1(quant(hours, 0.9));
    const strict = brand.poor ? 0.8 : 1;
    const runRate = r2(clamp((posted + 0.0001) / Math.max(1, posted + unused), 0, 1));
    let reply = r1(clamp(brand.decideH * 0.42 + rng.float(-0.6, 1.2), 1.1, 40));
    const base = { decisions_n: n, approved_n: approved, decision_hours_median: dm, appeals_overturned: overturned, run_rate: runRate, reply_hours_median: reply };
    let pays = brand.poor ? 0.83 : r2(clamp(rng.normal(0.965, 0.03), 0.85, 1));
    if (brand.key === 'lumi') {
      // Lumi is Excellent at 97 with a perfect pay record: the reply time is what lands the score
      search: for (const v of [0.99, 0.98]) for (let rp = 4; rp <= 16; rp = r1(rp + 0.1)) { const o = brandReliability({ ...base, reply_hours_median: rp, pays_on_time_ratio: v }); if (o.score === 97) { pays = v; reply = rp; base.reply_hours_median = rp; break search; } }
    }
    const rel = brandReliability({ ...base, pays_on_time_ratio: pays });
    // score recomputed from the stored (rounded) inputs, exactly as the validator does
    const badges = brandBadges({ decision_hours_median: dm, funded_always: true, pays_on_time_ratio: pays, appeals_n: appeals, appeals_overturned: overturned, run_rate: runRate, decisions_n: n });
    out.push({ brand, n, approved, rejected, breaches, appeals, overturned, dm, p90, runRate, reply, pays, payHours: r1(brand.poor ? 31 : clamp(rng.normal(3.2, 2), 0.4, 14)), rel, badges, trend: r1(brand.key === 'lumi' ? 2.4 : rng.float(-4.5, 6)), hoursRaw: hours });
  }
  W.scorecards = out;
  return out;
}
