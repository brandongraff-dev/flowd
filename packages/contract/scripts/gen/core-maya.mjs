// CORE: the Maya persona. Her posts are scripted to hit the hard facts in DOMAIN.md (lifetime cleared $1,640.00, cleared unpaid $86.00, paid out $1,554.00,
// pending $212.00, Silver reached on 2026-08-29). Views for three posts are solved exactly so the cents reconcile.

import { cumulative, drawCounts } from './core-posts.mjs';
import { C, NOW_EPOCH } from './core-kit.mjs';

const TAU = 21;
/** target pool pay per post in cents (the exact pay of three posts is solved by calibrate()) */
export const MAYA_PAY = {
  flowd_starter_1: 0, tasklane_plan60: 2400, flowd_about_us: 1900, quillby_onetake: 3900, subhawk_forgot: 2700, lumi_headshots: 5200, glowkit_nostudio: 0, focusfern_study: 9800, dozely_direct: 0,
  reelcraft_rawclips: 9400, wanderlist_trip: 8900, lumi_retouch30: 14600, lumi_glowup: 15600, quillby_voice: 10200, focusfern_system: 8100, lumi_fixbadphoto: 8600, parlo_spoke: 7500,
  pantrypal_scan: 6900, stillwater_calm: 5900, ironleaf_skipping: 4100,
};
const FLAT_VIEWS = { flowd_starter_1: 9000, dozely_direct: 31000, glowkit_nostudio: 12500 };
/** the three solved posts */
export const TUNED = { paid: 'reelcraft_rawclips', cleared: 'lumi_fixbadphoto', pending: 'parlo_spoke' };

export const windowViews = (U, tau = TAU) => Math.round(U * cumulative(72, tau));
export const cpmLeg = (U, cpm, cap, tau = TAU) => Math.min(Math.round((windowViews(U, tau) * cpm) / 1000), cap);
/** smallest integer U whose CPM leg equals `target` cents (scans near the analytic guess) */
export function solveU(target, cpm, cap, tau = TAU) {
  const guess = Math.round((target * 1000) / cpm / cumulative(72, tau));
  for (let d = 0; d < 80; d++) for (const u of [guess + d, guess - d]) if (u > 0 && cpmLeg(u, cpm, cap, tau) === target) return u;
  return guess;
}

/** set views and fixed funnel counts for Maya's posts before metrics are generated */
export function mayaPrepare(W) {
  const tune = W.tune;
  tune.mayaU ??= {};
  tune.counts ??= {};
  for (const p of W.maya.posts) {
    const key = p.bounty.key;
    const b = p.bounty;
    const cpm = b.cpm_cents;
    let U;
    if (tune.mayaU[key]) U = tune.mayaU[key];
    else if (FLAT_VIEWS[key]) U = FLAT_VIEWS[key];
    else {
      const target = MAYA_PAY[key] ?? 4000;
      const share = b.type === 'stacked' ? 0.26 : 0;
      U = cpm > 0 ? Math.round((target * 1000) / (cpm * (1 + share)) / cumulative(72, TAU)) : 20000;
      // cpa-only bounties: views follow her usual range
      if (cpm === 0) U = 24000;
    }
    p.perf = { U, tau1: TAU, viral: 1 };
    if (!tune.counts[key]) {
      const rr = p.r.fork('metrics').fork('counts');
      p.views = windowViews(U);
      tune.counts[key] = drawCounts(W, p, rr, windowViews(U));
    }
    p.fixedCounts = tune.counts[key];
  }
}

/** facts about Maya at the end of a pipeline run */
export function measureMaya(W) {
  const maya = W.maya;
  const EARN = new Set(['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral']);
  const rows = W.earnRows.filter((r) => r.creator === maya && EARN.has(r.type) && r.amt > 0);
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + r.amt, 0);
  const pending = W.clock.filter((m) => m.creator === maya && ['accruing', 'pending', 'held'].includes(m.state)).reduce((a, m) => a + m.amount, 0);
  return { paid: sum('paid'), cleared: sum('cleared'), pending, lifetime: sum('paid') + sum('cleared') };
}

/** one calibration step: returns true when every fact is exact */
export function calibrate(W) {
  const m = measureMaya(W);
  const T = W.world.PERSONA_FACTS.maya;
  const tune = W.tune;
  const key = (k) => W.bountyBy.get(k);
  const legOf = (k) => W.maya.posts.find((p) => p.bounty.key === k);
  const done = m.paid === T.paid_out_cents && m.cleared === T.cleared_unpaid_cents && m.pending === T.pending_cents;
  if (done) return true;
  const solve = (bk, delta) => {
    const p = legOf(bk);
    const b = p.bounty;
    const cur = cpmLeg(p.perf.U, b.cpm_cents, b.per_video_cap_cents);
    const want = Math.max(300, cur + delta);
    tune.mayaU[bk] = solveU(want, b.cpm_cents, b.per_video_cap_cents);
  };
  solve(TUNED.paid, T.paid_out_cents - m.paid);
  solve(TUNED.cleared, T.cleared_unpaid_cents - m.cleared);
  solve(TUNED.pending, T.pending_cents - m.pending);
  return false;
}
