// Tier history: promotions, Elite grants, grace holds and carry-over for founding creators, with the stats at each moment.

import { iso, ms, addDays, clamp, usd } from '../lib.mjs';
import { tierFor, approvalRate } from '../../../schema/formulas.mjs';
import { TIER_ORDER, APPROVED_SUB } from './world.mjs';

const DAY = 86_400_000;
const label = (t) => t[0].toUpperCase() + t.slice(1);

export function genTierHistory(W, rng) {
  const C = W.C.tiers;
  const nowMs = ms(W.now);
  const events = [];
  const subsBy = (cid) => W.subsByCreator.get(cid) ?? [];
  const decidedAt = (s) => s.decision?.decided_at ?? s.approved_at;

  /** creator stats at a moment, in the shape tierFor() takes */
  const statsAt = (c, at) => {
    const t = ms(at);
    const carry = c.carry_over;
    const mine = subsBy(c.id);
    const approved = (carry?.approved_count ?? 0) + mine.filter((s) => APPROVED_SUB.has(s.status) && s.approved_at && ms(s.approved_at) <= t).length;
    const rejected = mine.filter((s) => s.status === 'rejected' && decidedAt(s) && ms(decidedAt(s)) <= t).length;
    const decided = (carry ? carry.decided_count : 0) + (approved - (carry?.approved_count ?? 0)) + rejected;
    return {
      lifetime_cleared_cents: (carry?.cleared_cents ?? 0) + W.clearedUpTo(c.id, at), approved_count: approved, approval_rate: approvalRate(approved, decided),
      reliability_score: c.reliability_score, elite_reviewed: Boolean(c.tier_review) && ms(c.tier_review.reviewed_at) <= t,
    };
  };
  const snap = (s) => ({ lifetime_cleared_cents: s.lifetime_cleared_cents, approved_count: s.approved_count, approval_rate: s.approval_rate, reliability_score: s.reliability_score });
  const perks = (t) => {
    const p = C.perks[t];
    const bits = [];
    if (p.early_access_hours) bits.push(`${p.early_access_hours} hour${p.early_access_hours > 1 ? 's' : ''} of early access to new bounties`);
    if (p.rate_card && t === 'silver') bits.push('your own rate card');
    if (p.instant_cashout_unlimited) bits.push('free instant cash-outs');
    else if (p.instant_cashout_free_per_week) bits.push(`${p.instant_cashout_free_per_week} free instant cash-out a week`);
    if (p.crews_lead && t === 'gold') bits.push('crew leadership');
    if (p.auctions && t === 'platinum') bits.push('auction slots');
    if (p.featured_profile) bits.push('a featured profile');
    return bits.join(', ');
  };
  const meets = (t) => {
    const th = C.thresholds[t];
    return `${usd(th.lifetime_cleared_cents)} cleared, ${th.approved_count} approved${th.approval_rate_min ? `, ${Math.round(th.approval_rate_min * 100)}% approval` : ''}${th.reliability_min ? `, reliability ${th.reliability_min}+` : ''}`;
  };
  const push = (c, kind, from, to, basis, at, stats, note) => {
    events.push({ creator_id: c.id, kind, ...(from ? { from_tier: from } : {}), to_tier: to, basis, at, stats: snap(stats), note });
  };
  /** first day on which a creator's stats met a tier, scanning from their join date */
  const firstMeeting = (c, tier, notBefore) => {
    for (let t = Math.max(ms(c.joined_at) + DAY, ms(notBefore)); t <= nowMs; t += DAY) {
      const at = iso(t);
      if (tierFor(statsAt(c, at)) && W.tierRank(tierFor(statsAt(c, at))) >= W.tierRank(tier)) return at;
    }
    return null;
  };

  for (const c of W.creators) {
    if (c.tier === 'bronze' && !c.carry_over && c.tier_basis !== 'grace_hold') continue;
    const final = c.tier;
    const finalIdx = W.tierRank(final);
    let startIdx = 0;
    let t0Date = c.joined_at;
    if (c.carry_over) {
      // verified prior history counts from day one: it is counted before the tier it earns exists, so every promotion that follows lands after this row
      const verified = c.carry_over.verified_at && ms(c.carry_over.verified_at) <= nowMs ? ms(c.carry_over.verified_at) : ms(c.joined_at) + 3_600_000;
      const at = iso(clamp(Math.min(verified, ms(c.tier_since)), ms(c.joined_at), nowMs));
      const stat0 = statsAt(c, at);
      let t0 = tierFor({ ...stat0, elite_reviewed: false });
      if (W.tierRank(t0) > finalIdx) t0 = final;
      if (t0 === 'elite') t0 = 'platinum';
      const source = c.carry_over.source.replace(/ \(.*\)/, '').toLowerCase();
      if (W.tierRank(t0) > 0) {
        push(c, 'carry_over_applied', 'bronze', t0, 'earned', at, stat0, `Verified history from ${source} counted toward ${label(t0)}: ${usd(c.carry_over.cleared_cents)} cleared, ${c.carry_over.approved_count} approved. Reviewed by Ops.`);
        startIdx = W.tierRank(t0);
        t0Date = at;
      } else {
        // the history counts, but it is not enough to skip a tier yet: the row still tells the creator what was credited
        push(c, 'carry_over_applied', 'bronze', 'bronze', 'earned', at, stat0, `Verified history from ${source} counted toward your thresholds: ${usd(c.carry_over.cleared_cents)} cleared, ${c.carry_over.approved_count} approved. Reviewed by Ops. That is not yet enough for Silver, so you start at Bronze with a head start.`);
        t0Date = at;
      }
    }
    // promotions from startIdx to the final tier; the last one lands on tier_since
    const chain = TIER_ORDER.slice(startIdx + 1, finalIdx + 1);
    const finalAt = clamp(ms(c.tier_since), ms(c.joined_at), nowMs);
    let prev = TIER_ORDER[startIdx];
    const floor0 = ms(t0Date);
    // when each promotion happened: the first day the stats met the tier, spaced back from the last one, which lands exactly on tier_since
    const ats = chain.map((t, k) => {
      if (k === chain.length - 1) return finalAt;
      const found = firstMeeting(c, t, iso(floor0 + DAY)) ?? iso(floor0 + (finalAt - floor0) * ((k + 1) / (chain.length + 1)));
      return Math.min(ms(found), finalAt - (chain.length - k) * 2 * DAY);
    });
    const gap = Math.max(600_000, Math.min(6 * 3_600_000, (finalAt - floor0) / (chain.length + 1)));
    for (let k = chain.length - 2; k >= 0; k--) ats[k] = Math.min(Math.max(ats[k], floor0 + (k + 1) * gap * 0.5), ats[k + 1] - gap);
    if (ats.length > 1 && ats[0] <= floor0) ats.forEach((_, k) => { ats[k] = floor0 + ((finalAt - floor0) * (k + 1)) / chain.length; });
    chain.forEach((t, k) => {
      const at = iso(ats[k]);
      const stats = statsAt(c, at);
      // the stats at a promotion must actually meet the tier (reconcile tiny gaps in the core numbers)
      const th = C.thresholds[t];
      stats.lifetime_cleared_cents = Math.max(stats.lifetime_cleared_cents, th.lifetime_cleared_cents);
      stats.approved_count = Math.max(stats.approved_count, th.approved_count);
      stats.approval_rate = Math.max(stats.approval_rate, th.approval_rate_min);
      stats.reliability_score = Math.max(stats.reliability_score, th.reliability_min);
      const kind = t === 'elite' ? 'granted' : 'promoted';
      const who = c.tier_review?.reviewer_user_id ? W.userName(c.tier_review.reviewer_user_id) : 'Ops';
      push(c, kind, prev, t, 'earned', at, stats, t === 'elite'
        ? `Manual review approved by ${who}. Elite needs ${meets('elite')} plus a review.`
        : `Reached ${label(t)}: ${meets(t)}. Unlocked ${perks(t)}.`);
      prev = t;
    });
    if (c.tier_basis === 'grace_hold' && c.tier_hold_until) {
      const at = iso(ms(c.tier_hold_until) - W.C.tiers.demotion_grace_days * DAY);
      const s = statsAt(c, at);
      const need = C.thresholds[c.tier].approval_rate_min;
      push(c, 'hold_started', c.tier, c.tier, 'grace_hold', at, { ...s, approval_rate: Math.min(s.approval_rate, c.approval_rate) }, `Approval rate dipped to ${Math.round(Math.min(s.approval_rate, c.approval_rate) * 100)}%, below the ${Math.round(need * 100)}% ${label(c.tier)} needs. Tier held for 30 days; no drop before ${iso(ms(c.tier_hold_until)).slice(0, 10)}.`);
    }
  }
  // one earned-back hold: a Gold creator who dipped and recovered
  const rr = rng.fork('tier:hold-cleared');
  const goldEarned = W.creators.filter((c) => c.tier === 'gold' && c.tier_basis === 'earned' && ms(c.tier_since) < nowMs - 40 * DAY && c.approval_rate >= 0.78);
  const g = goldEarned[0] ? rr.pick(goldEarned) : null;
  if (g) {
    const startAt = iso(nowMs - 26 * DAY);
    const clearAt = iso(nowMs - 9 * DAY);
    const s1 = statsAt(g, startAt);
    const s2 = statsAt(g, clearAt);
    const dip = Math.min(0.74, s1.approval_rate);
    push(g, 'hold_started', 'gold', 'gold', 'grace_hold', startAt, { ...s1, approval_rate: dip }, `Approval rate dipped to ${Math.round(dip * 100)}%, below the 75% Gold needs. Tier held for 30 days.`);
    push(g, 'hold_cleared', 'gold', 'gold', 'earned', clearAt, { ...s2, approval_rate: Math.max(s2.approval_rate, 0.77) }, `Approval rate recovered to ${Math.round(Math.max(s2.approval_rate, 0.77) * 100)}% on finished work. The hold is cleared and Gold stays.`);
  }
  // more dips that recovered: Silver and Gold creators close to their approval-rate line sometimes slip under it for a while. A hold starts,
  // the creator keeps the tier (no drop for 30 days) and the next decisions bring the rate back.
  const rd = rng.fork('tier:dips');
  const dipPool = W.creators.filter((c) => ['silver', 'gold'].includes(c.tier) && c.tier_basis === 'earned' && c.id !== g?.id && ms(c.tier_since) < nowMs - 38 * DAY && (c.approval_rate ?? 0) >= C.thresholds[c.tier].approval_rate_min && (c.approval_rate ?? 0) < C.thresholds[c.tier].approval_rate_min + 0.1);
  rd.shuffle(dipPool).slice(0, 6).forEach((c) => {
    const th = C.thresholds[c.tier];
    const startAt = iso(nowMs - rd.int(21, 34) * DAY - rd.int(0, 20) * 3_600_000);
    const clearAt = iso(Math.min(nowMs - 3 * DAY, ms(startAt) + rd.int(11, 19) * DAY));
    const s1 = statsAt(c, startAt);
    const s2 = statsAt(c, clearAt);
    const dip = Math.round((th.approval_rate_min - rd.float(0.015, 0.045)) * 100) / 100;
    const back = Math.max(s2.approval_rate, Math.round((th.approval_rate_min + 0.01) * 100) / 100);
    push(c, 'hold_started', c.tier, c.tier, 'grace_hold', startAt, { ...s1, approval_rate: dip }, `Approval rate dipped to ${Math.round(dip * 100)}%, below the ${Math.round(th.approval_rate_min * 100)}% ${label(c.tier)} needs. Tier held for 30 days; no drop before ${addDays(startAt, W.C.tiers.demotion_grace_days).slice(0, 10)}.`);
    push(c, 'hold_cleared', c.tier, c.tier, 'earned', clearAt, { ...s2, approval_rate: back }, `Approval rate recovered to ${Math.round(back * 100)}% on finished work. The hold is cleared and ${label(c.tier)} stays.`);
  });
  // rows of one creator at the same instant keep their story order: carry-over first, then promotions, then holds
  const KIND_ORDER = { carry_over_applied: 0, promoted: 1, granted: 1, hold_started: 2, hold_cleared: 3 };
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
  return events.map((e, i) => ({ id: `tev_${String(i + 1).padStart(4, '0')}`, ...e }));
}
