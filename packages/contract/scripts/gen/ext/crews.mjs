// Crews: 3 to 20 creators with a shared leaderboard and a platform-funded weekly goal bonus. Led by Gold and above.

import { iso, ms, artSeed, clamp, sum } from '../lib.mjs';
import * as P from '../pools.mjs';
import { roundTo } from './util.mjs';

const DAY = 86_400_000;
const SIZES = [12, 11, 10, 9, 8, 7, 6, 5];
const TAGLINE_CODE = ['LATENIGHT', 'POCKET', 'SUNDAY', 'HOOKLAB', 'SCREENTIME', 'QUIETHRS', 'GOLDEN', 'BUDGET'];

export function genCrews(W, rng) {
  const now = W.now;
  const nowMs = ms(now);
  const maya = W.maya;
  const goldPlus = W.creators.filter((c) => W.tierRank(c.tier) >= 2).sort((a, b) => b.lifetime_cleared_cents - a.lifetime_cleared_cents);
  const taken = new Set();
  const crews = [];
  const members = [];
  const weekStart = ms(W.week.start);
  const cleared = (cid, from, to) => W.clearedBetween(cid, iso(from), iso(to));

  P.CREW_DEFS.forEach((def, i) => {
    const r = rng.fork(`crew:${def.name}`);
    const size = SIZES[i];
    const slug = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const createdAt = iso(ms('2026-07-28T16:00:00Z') + i * 6 * DAY + r.int(0, 20) * 3_600_000);
    // lead: the strongest unassigned Gold+ creator whose niche fits, else any
    const lead = goldPlus.find((c) => !taken.has(c.id) && c.niches?.includes(def.niche)) ?? goldPlus.find((c) => !taken.has(c.id));
    if (!lead) return;
    taken.add(lead.id);
    const crewMembers = [{ creator: lead, role: 'lead' }];
    // co-lead: another Gold+ if available
    const leadsStillNeeded = P.CREW_DEFS.length - i - 1;
    const goldLeft = goldPlus.filter((c) => !taken.has(c.id));
    const silverPool = W.creators.filter((c) => c.tier === 'silver' && !taken.has(c.id) && c.id !== maya?.id).sort((a, b) => b.lifetime_cleared_cents - a.lifetime_cleared_cents);
    const co = size >= 6
      ? (goldLeft.length > leadsStillNeeded ? goldLeft.find((c) => c.niches?.some((n) => lead.niches?.includes(n))) ?? goldLeft[goldLeft.length - 1] : undefined) ?? silverPool.find((c) => c.niches?.some((n) => lead.niches?.includes(n))) ?? silverPool[0]
      : undefined;
    if (co) { taken.add(co.id); crewMembers.push({ creator: co, role: 'co_lead' }); }
    if (i === 0 && maya && !taken.has(maya.id)) { taken.add(maya.id); crewMembers.push({ creator: maya, role: 'member' }); }
    const pool = W.creators.filter((c) => !taken.has(c.id) && c.id !== maya?.id && ms(c.joined_at) < ms(createdAt) + 25 * DAY);
    const fit = pool.filter((c) => c.niches?.includes(def.niche));
    const order = [...r.shuffle(fit), ...r.shuffle(pool.filter((c) => !c.niches?.includes(def.niche)))];
    for (const c of order) {
      if (crewMembers.length >= size) break;
      taken.add(c.id);
      crewMembers.push({ creator: c, role: 'member' });
    }
    // member rows
    const rowsM = crewMembers.map(({ creator, role }, k) => {
      const joinedAt = iso(clamp(Math.max(ms(createdAt) + (role === 'lead' ? 0 : (k + 1) * r.int(10, 60) * 3_600_000), ms(creator.joined_at) + 6 * 3_600_000), ms(createdAt), nowMs - 2 * DAY));
      return {
        creator_id: creator.id, role, joined_at: role === 'lead' ? createdAt : joinedAt,
        week_cleared_cents: cleared(creator.id, weekStart, nowMs + 1000),
        lifetime_cleared_cents: cleared(creator.id, ms(role === 'lead' ? createdAt : joinedAt), nowMs + 1000),
      };
    });
    if (i === 0 && maya) { const mm = rowsM.find((x) => x.creator_id === maya.id); if (mm) mm.joined_at = '2026-09-02T18:30:00Z'; }
    // goal: a touch above the crew's recent weekly average, bonus accrues when it is met
    const weeks = [];
    for (let w = 1; w <= 8; w++) {
      const from = weekStart - w * 7 * DAY;
      if (from < ms(createdAt) - 6 * DAY) break;
      weeks.push(sum(rowsM, (m) => cleared(m.creator_id, Math.max(from, ms(m.joined_at)), from + 7 * DAY)));
    }
    const avg = weeks.length ? sum(weeks, (x) => x) / weeks.length : 0;
    const goal = Math.max(5000, roundTo(avg * r.float(0.95, 1.15), 2500));
    const bonusTotal = sum(weeks, (w) => (w >= goal ? Math.min(W.C.crews.weekly_goal_bonus_cap_cents, Math.round(w * W.C.crews.weekly_goal_bonus_rate)) : 0));
    crews.push({
      _i: i, id: `crew_${slug}`, name: def.name, tagline: def.tagline, art: artSeed(r, { pattern: i % 2 ? 'spark' : 'rings', label: def.name }), niche: def.niche, lead_creator_id: lead.id,
      member_count: rowsM.length, open: i % 3 !== 1, invite_code: `${TAGLINE_CODE[i]}${r.int(2, 9)}`, weekly_goal_cents: goal,
      week_cleared_cents: sum(rowsM, (m) => m.week_cleared_cents), week_rank: 0, bonus_earned_total_cents: bonusTotal,
      lifetime_cleared_cents: sum(rowsM, (m) => m.lifetime_cleared_cents), created_at: createdAt, _members: rowsM,
    });
  });
  // rank by this week's cleared, ties by lifetime
  [...crews].sort((a, b) => b.week_cleared_cents - a.week_cleared_cents || b.lifetime_cleared_cents - a.lifetime_cleared_cents || (a.id < b.id ? -1 : 1)).forEach((c, k) => { c.week_rank = k + 1; });
  crews.sort((a, b) => a.week_rank - b.week_rank);
  let n = 0;
  for (const c of crews) {
    const rolesOrder = { lead: 0, co_lead: 1, member: 2 };
    for (const m of [...c._members].sort((a, b) => rolesOrder[a.role] - rolesOrder[b.role] || (a.joined_at < b.joined_at ? -1 : 1))) {
      n++;
      members.push({ id: `cmem_${String(n).padStart(4, '0')}`, crew_id: c.id, ...m });
    }
  }
  return { crews: crews.map(({ _i, _members, ...c }) => c), crew_members: members };
}
