// Tournaments (hook battles and leaderboards) with entries. Free entry, prizes from flowd or a sponsor brand. Prizes of finished
// tournaments are paid from the promo account as ledger rows of type prize (core writes those); the prize amounts here sum to the pool.

import { iso, ms, addHours, artSeed, clamp, sum } from '../lib.mjs';
import * as P from '../pools.mjs';
import { bandFor } from '../../../schema/formulas.mjs';
import { fillHook, categoryByKey } from './content.mjs';

const T = (s) => `${s}:00Z`;
const PLAN = {
  'Hook Battle: Fitness Week': { status: 'complete', announced: '2026-08-03T15:00', open: '2026-08-06T14:00', starts: '2026-08-17T14:00', ends: '2026-08-25T20:00', entries: 24 },
  'Confession Season': { status: 'complete', announced: '2026-09-02T15:00', open: '2026-09-04T14:00', starts: '2026-09-14T14:00', ends: '2026-09-22T20:00', entries: 22 },
  'The 3-Second Open': { status: 'complete', announced: '2026-08-18T15:00', open: '2026-08-20T14:00', starts: '2026-08-31T14:00', ends: '2026-09-08T20:00', entries: 20 },
  'Back-to-school Study Hooks': { status: 'judging', announced: '2026-09-17T15:00', open: '2026-09-19T14:00', starts: '2026-09-24T14:00', ends: '2026-10-02T20:00', entries: 16 },
  'Screen Record Sprint': { status: 'live', announced: '2026-09-23T15:00', open: '2026-09-25T14:00', starts: '2026-09-29T14:00', ends: '2026-10-06T20:00', entries: 24, rounds: [['2026-09-29T14:00', '2026-10-01T14:00'], ['2026-10-01T14:00', '2026-10-04T14:00'], ['2026-10-04T14:00', '2026-10-06T20:00']] },
  'October Glow-up Brackets': { status: 'open', announced: '2026-09-28T15:00', open: '2026-10-01T14:00', starts: '2026-10-07T14:00', ends: '2026-10-13T20:00', entries: 14 },
  'Best First Trial': { status: 'announced', announced: '2026-10-02T15:00', open: '2026-10-06T14:00', starts: '2026-10-10T14:00', ends: '2026-10-17T20:00', entries: 0 },
  'Sleep Story Showdown': { status: 'cancelled', announced: '2026-09-10T15:00', open: '2026-09-12T14:00', starts: '2026-09-19T14:00', ends: '2026-09-25T20:00', entries: 7 },
};
const DESCRIPTIONS = {
  'Hook Battle: Fitness Week': 'Sixteen fitness hooks, head to head. The first three seconds decide it: judges look at the Hook Score checklist and the share of viewers still watching at second three. Stridely sponsors the pool.',
  'The 3-Second Open': 'Open on the hook. Every entry is one video whose first three seconds are scored by the Hook Score checklist and the measured 3-second hold rate. Any niche, any app, free to enter.',
  'Confession Season': 'Your best "I was wrong about..." opening. Confession hooks are among the strongest for app installs, so this bracket rewards the honest, specific, slightly funny ones.',
  'Best First Trial': 'The most tracked trials started in a week wins. Dozely sponsors the pool, and only link and code conversions count; estimated conversions never do.',
  'Screen Record Sprint': 'The fastest clean screen-record demo wins. Tasklane sponsors a bracket for demos that show the app by second three and finish on a result. Round 2 is live now.',
  'Back-to-school Study Hooks': 'Study apps, one great opener. Parlo sponsors this hook battle for creators in the study and language niches. Rounds are done; the judges are scoring the final.',
  'October Glow-up Brackets': 'Before and after, head to head. Lumi sponsors a glow-up bracket judged on the opening, the reveal and a clean #ad. Entries are open until the 7th.',
  'Sleep Story Showdown': 'The calmest 20 seconds on flowd. Cancelled before it started: fewer than the 20 entries needed to run a fair leaderboard, so nothing was paid and nobody lost a thing.',
};
const PRIZE_SPLIT = { bracket: [0.5, 0.25, 0.15, 0.1], hook_battle: [0.5, 0.25, 0.15, 0.1], leaderboard: [0.4, 0.25, 0.15, 0.1, 0.1] };
const LABELS = ['Champion', 'Runner-up', 'Semifinalist', 'Semifinalist', '5th place'];
const LEDGER_LABELS = ['Champion', 'Runner-up', 'Semifinalist', 'Semifinalist', 'Quarterfinalist', 'Quarterfinalist', 'Quarterfinalist'];

/** the prizes the core ledger paid for a finished tournament ("Prize: <title>, 3rd place"), by place */
function ledgerPrizes(W, title) {
  const out = [];
  for (const r of W.ledger) {
    if (r.entry_type !== 'prize' || !(r.amount_cents > 0) || !String(r.account).startsWith('creator:') || !r.memo?.startsWith(`Prize: ${title}, `)) continue;
    const m = /, (\d+)(?:st|nd|rd|th) place$/.exec(r.memo);
    if (m) out.push({ place: Number(m[1]), creator_id: r.creator_id ?? r.account.slice(8), amount_cents: r.amount_cents });
  }
  return out.sort((a, b) => a.place - b.place);
}
const METRIC = 'Hook Score + 3s hold rate';

/** prizes rounded to $5 that add up to the pool exactly */
function prizeList(pool, format) {
  const split = PRIZE_SPLIT[format] ?? PRIZE_SPLIT.bracket;
  const amounts = split.map((s) => Math.round((pool * s) / 500) * 500);
  amounts[0] += pool - sum(amounts, (x) => x);
  return amounts.map((amount_cents, i) => ({ place: i + 1, amount_cents, label: LABELS[i] }));
}

export function genTournaments(W, rng, seq) {
  const nowMs = ms(W.now);
  const maya = W.maya;
  const brandBySlug = new Map(W.brands.map((b) => [b.slug ?? W.slugOf(b.id), b]));
  const tournaments = [];
  const entries = [];
  const defs = [...P.TOURNAMENT_DEFS].sort((a, b) => (PLAN[a.title].starts < PLAN[b.title].starts ? -1 : 1));
  const mayaTarget = { 'Confession Season': 9, 'Screen Record Sprint': 5 };
  let entryN = 0;

  for (const def of defs) {
    const plan = PLAN[def.title];
    const r = rng.fork(`tour:${def.title}`);
    const id = `tour_${def.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    const sponsor = def.sponsor ? brandBySlug.get(def.sponsor) : undefined;
    const format = def.format;
    const bracketLike = format !== 'leaderboard';
    // a finished bracket pays exactly what the ledger paid: the same creators, places and amounts (core wrote those rows)
    const paid = plan.status === 'complete' && format !== 'leaderboard' ? ledgerPrizes(W, def.title).filter((p) => W.creatorById.has(p.creator_id)) : [];
    const ledgerMode = paid.length >= 4 && paid.every((p, i) => p.place === i + 1) && plan.entries >= 9;
    const prizes = ledgerMode ? paid.map((p) => ({ place: p.place, amount_cents: p.amount_cents, label: LEDGER_LABELS[p.place - 1] ?? `${p.place}th place` })) : prizeList(def.pool_cents, format);
    const paidIds = ledgerMode ? paid.map((p) => p.creator_id) : [];
    const niche = def.niche ?? undefined;
    const bounty = sponsor ? W.bounties.find((b) => b.brand_id === sponsor.id && ['live', 'filled', 'settled', 'ended'].includes(b.status) && b.type !== 'direct') : undefined;
    const startsAt = T(plan.starts);
    const endsAt = T(plan.ends);
    const status = plan.status;

    // rounds: three of them for bracket and hook-battle formats, none for a leaderboard
    let rounds = [];
    if (bracketLike) {
      const names = ['Quarterfinals', 'Semifinals', 'Final'];
      let win = plan.rounds?.map(([a, b]) => [T(a), T(b)]);
      if (!win) {
        const s = ms(startsAt);
        const third = (ms(endsAt) - s) / 3;
        win = [0, 1, 2].map((i) => [iso(s + third * i), iso(s + third * (i + 1))]);
      }
      rounds = win.map(([a, b], i) => ({ round: i + 1, name: names[i], starts_at: a, ends_at: b, matchups: [] }));
    }

    // entrants (Maya sits in two of them)
    const mayaIn = maya && mayaTarget[def.title] !== undefined;
    const n = plan.entries;
    const eligible = W.creators.filter((c) => c.id !== maya?.id && ms(c.joined_at) < ms(T(plan.open)) + 3 * 86_400_000);
    const pref = eligible.filter((c) => !niche || c.niches?.includes(niche));
    const rest = niche ? eligible.filter((c) => !c.niches?.includes(niche)) : [];
    const chosen = [...paidIds.map((id) => W.creatorById.get(id)), ...[...r.shuffle(pref), ...r.shuffle(rest)].filter((c) => !paidIds.includes(c.id))].slice(0, Math.max(0, n - (mayaIn ? 1 : 0)));
    if (mayaIn) chosen.push(maya);
    const rows = chosen.map((c, i) => {
      const catKeys = P.NICHES.find((nn) => nn.key === (niche ?? c.niches?.[0]))?.categories ?? ['lifestyle'];
      const sponsorApp = sponsor ? (W.appsByBrand.get(sponsor.id) ?? [])[0] : undefined;
      const catKey = sponsorApp?.category ?? catKeys[i % catKeys.length];
      const appPool = sponsor ? (W.appsByBrand.get(sponsor.id) ?? []) : P.APPS.filter((a) => a.category === catKey);
      const app = appPool[r.int(0, appPool.length - 1)];
      const type = def.title === 'Confession Season' ? 'confession' : r.pick(Object.keys(P.HOOK_TEMPLATES));
      const lo = Math.max(ms(T(plan.open)) + 120_000, ms(c.joined_at) + 3_600_000);
      const hi = Math.max(lo + 3_600_000, Math.min(ms(startsAt), nowMs) - 600_000);
      return {
        creator: c, hook_points: Math.round(clamp(r.normal(76, 8.5), 52, 97)),
        hook_text: fillHook(r.pick(P.HOOK_TEMPLATES[type]), categoryByKey(catKey), { name: app.name, features: app.features, pricing: app.pricing }, r),
        entered_at: iso(lo + (r.next() ** 1.4) * Math.max(0, hi - lo)),
      };
    });
    if (ledgerMode) {
      const order = [...paidIds, ...rows.filter((x) => !paidIds.includes(x.creator.id)).sort((a, b) => b.hook_points - a.hook_points).map((x) => x.creator.id)].slice(0, 8);
      order.forEach((id, k) => { rows.find((x) => x.creator.id === id).hook_points = Math.round(94 - k * 2.3); });
      for (const x of rows) if (!order.includes(x.creator.id)) x.hook_points = Math.min(x.hook_points, 73);
    }
    if (mayaIn) {
      const target = mayaTarget[def.title];
      const me = rows.find((x) => x.creator.id === maya.id);
      const others = rows.filter((x) => x !== me).sort((a, b) => b.hook_points - a.hook_points);
      const hiRow = others[target - 2];
      const lo = others[target - 1].hook_points;
      if (hiRow.hook_points - lo < 2) hiRow.hook_points = lo + 2;
      me.hook_points = lo + 1;
    }
    rows.sort((a, b) => b.hook_points - a.hook_points || (a.entered_at < b.entered_at ? -1 : a.entered_at > b.entered_at ? 1 : a.creator.id < b.creator.id ? -1 : 1));
    const ent = rows.map((x, i) => {
      entryN++;
      return {
        id: `tent_${String(entryN).padStart(4, '0')}`, tournament_id: id, creator_id: x.creator.id, status: 'entered', hook_text: x.hook_text,
        thumb: artSeed(r.fork(`thumb:${x.creator.id}`), { pattern: i % 2 ? 'spark' : 'orbs', label: x.hook_text }), hook_points: x.hook_points, hook_band: bandFor(x.hook_points),
        seed: i + 1, round_reached: 0, entered_at: x.entered_at, updated_at: x.entered_at,
      };
    });
    const bySeed = new Map(ent.map((e) => [e.seed, e]));
    const mayaEntry = maya ? ent.find((e) => e.creator_id === maya.id) : undefined;
    const roundEnd = (i) => iso(Math.min(nowMs - 60_000, ms(rounds[i].ends_at)));
    const compScore = (e, bump) => Math.round((e.hook_points * 0.6 + clamp(r.normal(74, 7), 50, 98) * 0.4 + bump) * 10) / 10;
    /** a decided matchup; `force` names the entry that must win */
    const decided = (a, b, force) => {
      let sa = compScore(a, a.seed < b.seed ? 0.8 : 0);
      let sb = compScore(b, b.seed < a.seed ? 0.8 : 0);
      if (force && ((force === a && sa < sb) || (force === b && sb < sa))) [sa, sb] = [sb, sa];
      const w = sa >= sb ? a : b;
      return { id: seq('mu'), entry_a_id: a.id, entry_b_id: b.id, score_a: sa, score_b: sb, metric: METRIC, winner_entry_id: w.id, _w: w, _l: w === a ? b : a };
    };
    const strip = ({ _w, _l, ...m }) => m;
    let champion;

    if (bracketLike && ent.length >= 8 && ['complete', 'judging', 'live'].includes(status)) {
      ent.forEach((e) => { e.status = e.seed <= 8 ? 'entered' : 'eliminated'; e.round_reached = e.seed <= 8 ? 1 : 0; });
      const qf = [[1, 8], [4, 5], [2, 7], [3, 6]].map(([a, b]) => {
        const ea = bySeed.get(a);
        const eb = bySeed.get(b);
        const force = status === 'live' && mayaEntry && (ea === mayaEntry || eb === mayaEntry) ? mayaEntry : undefined;
        return decided(ea, eb, ledgerMode ? (ea.seed < eb.seed ? ea : eb) : force);
      });
      qf.forEach((m) => { m._w.round_reached = 2; m._w.status = 'advancing'; m._l.status = 'eliminated'; m._l.round_reached = 1; });
      rounds[0].matchups = qf.map(strip);
      const sfPairs = [[qf[0]._w, qf[1]._w], [qf[2]._w, qf[3]._w]];
      if (status === 'live') {
        rounds[1].matchups = sfPairs.map(([a, b]) => ({ id: seq('mu'), entry_a_id: a.id, entry_b_id: b.id, score_a: compScore(a, 0), score_b: compScore(b, 0), metric: METRIC }));
      } else {
        const sf = sfPairs.map(([a, b]) => decided(a, b, ledgerMode ? (a.seed < b.seed ? a : b) : undefined));
        sf.forEach((m) => { m._w.round_reached = 3; m._w.status = 'advancing'; m._l.round_reached = 2; m._l.status = 'eliminated'; });
        rounds[1].matchups = sf.map(strip);
        const fin = decided(sf[0]._w, sf[1]._w, ledgerMode ? (sf[0]._w.seed < sf[1]._w.seed ? sf[0]._w : sf[1]._w) : undefined);
        if (status === 'complete') {
          fin._w.status = 'won'; fin._w.placement = 1; fin._l.status = 'eliminated'; fin._l.placement = 2; fin._l.round_reached = 3;
          const losers = sf.map((m) => m._l).sort((a, b) => b.hook_points - a.hook_points);
          losers.forEach((e, i) => { e.placement = 3 + i; });
          rounds[2].matchups = [strip(fin)];
          const qfLosers = qf.map((m) => m._l).sort((a, b) => b.hook_points - a.hook_points || a.seed - b.seed);
          if (ledgerMode) qfLosers.forEach((e, i) => { e.placement = 5 + i; });
          [fin._w, fin._l, ...losers, ...(ledgerMode ? qfLosers : [])].forEach((e, i) => { if (prizes[i]) e.prize_cents = prizes[i].amount_cents; });
          champion = fin._w;
        } else {
          const { winner_entry_id: _undecided, ...rest2 } = strip(fin);
          rounds[2].matchups = [rest2];
        }
      }
      // timestamps follow the rounds
      ent.forEach((e) => {
        if (e.seed > 8) e.updated_at = roundEnd(0);
        else if (e.round_reached === 1) e.updated_at = roundEnd(0);
        else if (e.round_reached === 2 && e.status === 'eliminated') e.updated_at = roundEnd(1);
        else if (e.status === 'advancing' && status === 'live') e.updated_at = roundEnd(0);
        else e.updated_at = iso(Math.min(nowMs - 60_000, ms(endsAt) + (status === 'complete' ? 4 * 3_600_000 : 0)));
      });
    }
    if (status === 'complete' && !bracketLike) throw new Error('a completed leaderboard tournament is not part of the demo world');

    tournaments.push({
      id, title: def.title, tagline: def.tagline, description: DESCRIPTIONS[def.title], status, format,
      art: artSeed(r, { pattern: 'spark', label: def.title }),
      ...(sponsor ? { sponsor_brand_id: sponsor.id } : {}), sponsor_label: sponsor?.name ?? 'flowd',
      prize_pool_cents: sum(prizes, (p) => p.amount_cents), prizes, rounds,
      rules: [
        ...P.TOURNAMENT_RULES,
        bracketLike ? 'The top 8 hook scores from the qualifier go into the bracket; seeds 1 and 8, 4 and 5, 2 and 7, 3 and 6 meet first.' : 'Ranked on tracked results only; estimated conversions never count.',
        ...(niche ? [`Open to every creator; ${P.NICHES.find((x) => x.key === niche)?.label ?? niche} creators are featured.`] : []),
      ],
      ...(def.title === 'Screen Record Sprint' ? { min_tier: 'silver' } : {}),
      ...(niche ? { niche } : {}),
      ...(bounty ? { bounty_id: bounty.id } : {}),
      entries_count: ent.length, announced_at: T(plan.announced), entries_open_at: T(plan.open), starts_at: startsAt, ends_at: endsAt,
      ...(champion ? { winner_creator_ids: [champion.creator_id] } : {}),
      created_at: addHours(T(plan.announced), -22),
    });
    entries.push(...ent);
  }
  return { tournaments: tournaments.sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)), entries };
}
