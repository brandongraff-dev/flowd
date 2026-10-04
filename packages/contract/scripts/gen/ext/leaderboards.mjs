// Weekly leaderboards: peer cohorts of about 30 by tier and niche (a promotion zone, never a demotion zone), public niche boards and
// the global boards. Resets Monday 00:00 UTC. Creators who opted out of rankings are excluded everywhere.

import { iso, ms, sum } from '../lib.mjs';
import * as P from '../pools.mjs';
import { predictedViews } from '../../../schema/formulas.mjs';

const DAY = 86_400_000;
const NICHE_LABEL = Object.fromEntries(P.NICHES.map((n) => [n.key, n.label]));
const round4 = (x) => Math.round(x * 10000) / 10000;

export function genLeaderboards(W, rng) {
  const nowMs = ms(W.now);
  const weekStart = ms(W.week.start);
  const prevStart = ms(W.prevWeek.start);
  const cfg = W.C.leaderboards;
  const maya = W.maya;
  const posts28 = (cid, asOf) => (W.postsByCreator.get(cid) ?? []).filter((p) => ms(p.posted_at) <= asOf && ms(p.posted_at) > asOf - 28 * DAY && !['removed', 'clawed_back'].includes(p.status));

  /** the ranked quantity of a creator for a metric at a week (asOf = end of the window) */
  const value = (c, metric, wk) => {
    const startMs = wk === 'cur' ? weekStart : prevStart;
    const asOf = wk === 'cur' ? nowMs : weekStart;
    // LeaderboardMetric earnings = cleared earnings in the week (pending and accruing money is not ranked until it clears)
    if (metric === 'earnings') return W.clearedBetween(c.id, iso(startMs), iso(startMs + 7 * DAY));
    if (metric === 'conversion_rate') {
      // LeaderboardMetric conversion_rate = tracked installs per 1,000 verified views over the last 28 days
      const ps = posts28(c.id, asOf);
      const installs = sum(ps, (p) => p.funnel?.installs ?? 0);
      const views = sum(ps, (p) => p.views);
      return installs >= 3 && views >= 2000 ? Math.round((installs / views) * 100_000) / 100 : 0;
    }
    const ps = (W.postsByCreator.get(c.id) ?? []).filter((p) => ms(p.posted_at) <= asOf && ['paid', 'cleared'].includes(p.status));
    if (ps.length < 3) return 0;
    const med = W.medianViews(c.id);
    return round4(sum(ps, (p) => { const pred = predictedViews(med, p.flow_band ?? 'C'); return 1 - Math.min(1, Math.abs(p.views - pred) / Math.max(1, pred)); }) / ps.length);
  };
  const cmpFor = (metric, wk) => (a, b) => value(b, metric, wk) - value(a, metric, wk) || b.lifetime_cleared_cents - a.lifetime_cleared_cents || (a.id < b.id ? -1 : 1);
  const rank = (members, metric, wk) => [...members].sort(cmpFor(metric, wk));

  // ── who is in the Silver cohort, and who opts out of rankings ────────────────────────────────────────
  const optOut = new Set();
  const silver = W.creators.filter((c) => c.tier === 'silver');
  let silverCohort = [];
  if (maya) {
    const beats = (c) => cmpFor('earnings', 'cur')(c, maya) < 0; // c ranks above Maya
    const sMembers = silver.filter((c) => c.id !== maya.id);
    let above = sMembers.filter(beats);
    // more than six above Maya: those creators opted for private mode (a legitimate wellbeing setting)
    const excess = Math.max(0, above.length - 6);
    for (const c of rank(above, 'earnings', 'cur').reverse().slice(0, excess)) optOut.add(c.id);
    above = above.filter((c) => !optOut.has(c.id));
    const below = sMembers.filter((c) => !beats(c));
    const outsiders = W.creators.filter((c) => c.tier !== 'silver' && ['bronze', 'gold'].includes(c.tier));
    const needAbove = 6 - above.length;
    const fillAbove = needAbove > 0 ? rank(outsiders.filter((c) => c.tier === 'gold' && beats(c)), 'earnings', 'cur').reverse().slice(0, needAbove) : [];
    if (fillAbove.length < needAbove) fillAbove.push(...rank(outsiders.filter((c) => c.tier === 'bronze' && beats(c) && !fillAbove.includes(c)), 'earnings', 'cur').reverse().slice(0, needAbove - fillAbove.length));
    const used = new Set([...above, ...below, ...fillAbove, maya].map((c) => c.id));
    const nBelow = cfg.cohort_target_size - 1 - above.length - fillAbove.length - below.length;
    // below-fillers: Bronze creators about to be promoted (AI tools first), earning less than Maya this week
    const bronzeBelow = outsiders.filter((c) => c.tier === 'bronze' && !used.has(c.id) && !beats(c) && !optOut.has(c.id));
    const pref = bronzeBelow.sort((a, b) => Number(b.niches?.includes('ai_tools')) - Number(a.niches?.includes('ai_tools')) || b.lifetime_cleared_cents - a.lifetime_cleared_cents || (a.id < b.id ? -1 : 1));
    const fillBelow = pref.slice(0, Math.max(0, nBelow));
    silverCohort = [maya, ...above, ...below, ...fillAbove, ...fillBelow];
  } else silverCohort = silver;
  const inSilver = new Set(silverCohort.map((c) => c.id));

  // a couple of other creators choose private mode too
  const rOpt = rng.fork('optout');
  for (const c of rOpt.sample(W.creators.filter((x) => x.id !== maya?.id && !inSilver.has(x.id) && W.tierRank(x.tier) >= 1), 2)) optOut.add(c.id);
  const visible = (c) => !optOut.has(c.id);

  // ── cohorts ───────────────────────────────────────────────────────────────────────────────────────────
  const cohorts = [{ tier: 'silver', niche: 'ai_tools', label: 'Silver · AI tools · Cohort 1', members: silverCohort.filter(visible) }];
  const bronze = W.creators.filter((c) => c.tier === 'bronze' && visible(c) && !inSilver.has(c.id));
  const techSet = new Set(['ai_tools', 'tech', 'productivity', 'study']);
  const bronzeA = bronze.filter((c) => c.niches?.some((n) => techSet.has(n)));
  const bronzeB = bronze.filter((c) => !c.niches?.some((n) => techSet.has(n)));
  const dominant = (list, banned = []) => {
    const count = new Map();
    for (const c of list) for (const n of c.niches ?? []) count.set(n, (count.get(n) ?? 0) + 1);
    return [...count.entries()].filter(([n]) => !banned.includes(n)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? 'lifestyle';
  };
  const nA = dominant(bronzeA, ['ai_tools']);
  const nB = dominant(bronzeB, [nA]);
  cohorts.push({ tier: 'bronze', niche: nA, label: `Bronze · ${NICHE_LABEL[nA]} · Cohort 1`, members: bronzeA });
  cohorts.push({ tier: 'bronze', niche: nB, label: `Bronze · ${NICHE_LABEL[nB]} · Cohort 2`, members: bronzeB });
  const gold = W.creators.filter((c) => W.tierRank(c.tier) >= 2 && visible(c) && !inSilver.has(c.id));
  const gN = dominant(gold);
  cohorts.push({ tier: 'gold', niche: gN, label: `Gold and above · ${NICHE_LABEL[gN]} · Cohort 1`, members: gold });

  const boards = [];
  const boardId = (wkId, scope, tier, niche, metric) => `lb_${wkId.toLowerCase()}_${scope}_${tier ?? 'all'}_${niche ?? 'all'}_${metric}`;
  const makeBoard = ({ scope, tier, niche, metric, label, members, zoneSize, limit, wk = 'cur', requirePositive = false }) => {
    const keep = (c, w) => !requirePositive || value(c, metric, w) > 0;
    const ranked = rank(members, metric, wk).filter((c) => keep(c, wk)).slice(0, limit ?? 999);
    const prevRank = new Map(rank(members, metric, 'prev').filter((c) => keep(c, 'prev')).map((c, i) => [c.id, i + 1]));
    const isoWeekId = wk === 'cur' ? W.week.id : W.prevWeek.id;
    const zone = zoneSize ?? cfg.promotion_zone_size;
    return {
      id: boardId(isoWeekId, scope, tier, niche, metric), scope, iso_week: isoWeekId,
      week_starts_at: iso(wk === 'cur' ? weekStart : prevStart), reset_at: iso(wk === 'cur' ? weekStart + 7 * DAY : weekStart), metric,
      ...(tier ? { tier } : {}), ...(niche ? { niche } : {}), label, cohort_size: ranked.length, promotion_zone_size: scope === 'cohort' ? zone : 0,
      entries: ranked.map((c, i) => ({
        creator_id: c.id, rank: i + 1, value: value(c, metric, wk), delta_rank: wk === 'prev' || !prevRank.has(c.id) ? 0 : prevRank.get(c.id) - (i + 1),
        zone: scope === 'cohort' && i < zone ? 'promotion' : 'steady',
      })),
      updated_at: iso(wk === 'cur' ? nowMs - 14 * 60_000 : weekStart - 3_600_000),
    };
  };
  for (const c of cohorts) if (c.members.length >= cfg.cohort_min_size) boards.push(makeBoard({ scope: 'cohort', tier: c.tier, niche: c.niche, metric: 'earnings', label: c.label, members: c.members }));
  // niche boards (public, top 50) and conversion boards for the biggest niches
  const nicheList = P.NICHES.map((n) => n.key);
  for (const n of nicheList) {
    const members = W.creators.filter((c) => c.niches?.includes(n) && visible(c));
    if (members.length >= cfg.cohort_min_size - 2) boards.push(makeBoard({ scope: 'niche', niche: n, metric: 'earnings', label: `${NICHE_LABEL[n]} · This week`, members, limit: cfg.global_board_size }));
  }
  for (const n of ['ai_tools', 'lifestyle', 'fitness', 'money']) {
    const members = W.creators.filter((c) => c.niches?.includes(n) && visible(c));
    if (members.length >= 6) boards.push(makeBoard({ scope: 'niche', niche: n, metric: 'conversion_rate', label: `${NICHE_LABEL[n]} · Conversion rate`, members, limit: cfg.global_board_size, requirePositive: true }));
  }
  const everyone = W.creators.filter(visible);
  for (const [metric, label] of [['earnings', 'Global · Earnings'], ['conversion_rate', 'Global · Conversion rate'], ['score_accuracy', 'Global · Score accuracy']]) {
    boards.push(makeBoard({ scope: 'global', metric, label, members: everyone, limit: cfg.global_board_size, requirePositive: true }));
  }
  // last week: the Silver cohort and the global earnings board, so rank deltas have something to point at
  boards.push(makeBoard({ scope: 'cohort', tier: 'silver', niche: 'ai_tools', metric: 'earnings', label: 'Silver · AI tools · Cohort 1', members: cohorts[0].members, wk: 'prev' }));
  boards.push(makeBoard({ scope: 'global', metric: 'earnings', label: 'Global · Earnings', members: everyone, limit: cfg.global_board_size, requirePositive: true, wk: 'prev' }));
  const rows = boards.sort((a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : (a.tier ?? '') < (b.tier ?? '') ? -1 : (a.tier ?? '') > (b.tier ?? '') ? 1 : (a.niche ?? '') < (b.niche ?? '') ? -1 : (a.niche ?? '') > (b.niche ?? '') ? 1 : a.id < b.id ? -1 : 1));
  return { leaderboards: rows, optOut, mayaRank: maya ? (rows.find((b) => b.id.includes('cohort_silver') && b.iso_week === W.week.id)?.entries.find((e) => e.creator_id === maya.id)?.rank ?? null) : null };
}
