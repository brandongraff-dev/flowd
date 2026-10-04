// Daily Drop (one a day at 16:00 UTC, real inventory) and the creators' saved / joined / submitted bounties.

import { iso, ms, addHours, dateOf, clamp, sum } from '../lib.mjs';
import { spotsLeft } from '../../../schema/formulas.mjs';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const TIER_RANK = { bronze: 0, silver: 1, gold: 2, platinum: 3, elite: 4 };
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);
const CAT_NAME = { ai_photo: 'photo', ai_assistant: 'AI assistant', fitness: 'fitness', language: 'language', productivity: 'productivity', finance: 'money', sleep_mind: 'sleep', music_audio: 'music', lifestyle: 'lifestyle' };

export function genDrops(W, rng) {
  const now = W.now;
  const nowMs = ms(now);
  const hour = W.C.daily_drop.hour_utc;
  const today = dateOf(now);
  const dates = [];
  for (let d = -31; d <= 3; d++) dates.push(dateOf(iso(ms(`${today}T00:00:00Z`) + d * DAY)));
  const mayaId = W.maya?.id;
  const bountyOk = (b) => b && b.funded && b.type !== 'direct' && b.visibility !== 'private' && b.visibility !== 'invite_only';
  const releaseOf = (date) => ms(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const claimable = (b, c, releaseMs) => {
    const minTier = b.eligibility?.min_tier;
    if (minTier && (TIER_RANK[c.tier] ?? 0) < (TIER_RANK[minTier] ?? 0)) return false;
    if (b.eligibility?.countries?.length && !b.eligibility.countries.includes(c.country)) return false;
    return ms(c.joined_at) < releaseMs;
  };
  // Maya's claim that became a real submission: the closed drop whose 24-hour window holds one of her submissions
  let mayaPast = null;
  if (W.maya) {
    for (const s of W.subsByCreator.get(mayaId) ?? []) {
      const sa = ms(s.submitted_at);
      const day = dateOf(iso(sa - hour * 3_600_000));
      const rel = releaseOf(day);
      const b = W.bountyById.get(s.bounty_id);
      if (!dates.includes(day) || sa - rel >= DAY || rel + DAY >= nowMs || !bountyOk(b) || ms(b.published_at ?? b.starts_at) > rel) continue;
      if (!mayaPast || rel > releaseOf(mayaPast.day)) mayaPast = { day, sub: s, bounty: b };
    }
  }
  const lastFeatured = new Map();
  const upcomingAllocated = new Map();
  const drops = [];
  const claimsByCreator = [];

  dates.forEach((date, di) => {
    const r = rng.fork(`drop:${date}`);
    const releaseMs = releaseOf(date);
    const releaseAt = iso(releaseMs);
    const claimEnds = addHours(releaseAt, W.C.daily_drop.claim_window_hours);
    const upcoming = releaseMs > nowMs;
    const live = !upcoming && ms(claimEnds) > nowMs;
    const remainingSpots = (b) => spotsLeft({ remaining_cents: b.remaining_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate }) - (upcomingAllocated.get(b.id) ?? 0);
    let pool = W.bounties.filter((b) => bountyOk(b) && ms(b.published_at ?? b.starts_at) <= releaseMs && ms(b.ends_at) >= releaseMs);
    if (upcoming) {
      const live = pool.filter((b) => b.status === 'live' || (b.status === 'scheduled' && ms(b.starts_at) <= releaseMs));
      const roomy = live.filter((b) => remainingSpots(b) >= 4);
      pool = roomy.length >= 3 ? roomy : live.filter((b) => remainingSpots(b) >= 1);
    }
    else pool = pool.filter((b) => !['draft', 'awaiting_funding', 'cancelled'].includes(b.status));
    const key = new Map(pool.map((b) => [b.id, r.next()]));
    pool.sort((a, b) => {
      const va = a.visibility === 'drop' ? 0 : 1;
      const vb = b.visibility === 'drop' ? 0 : 1;
      return va - vb || (lastFeatured.get(a.id) ?? -99) - (lastFeatured.get(b.id) ?? -99) || key.get(a.id) - key.get(b.id);
    });
    const want = W.C.daily_drop.items_per_drop;
    const picked = [];
    if (mayaPast && mayaPast.day === date) picked.push({ b: mayaPast.bounty, maya: { kind: 'submitted', sub: mayaPast.sub } });
    if (live && W.maya) {
      const b = pool.find((x) => x.status === 'live' && !(W.subsByBounty.get(x.id) ?? []).some((s) => s.creator_id === mayaId));
      if (b) picked.push({ b, maya: { kind: 'joined' } });
    }
    for (const b of pool) { if (picked.length >= want) break; if (!picked.some((p) => p.b.id === b.id)) picked.push({ b }); }
    if (picked.length < (upcoming ? 1 : 3)) return;
    const hotDay = !upcoming && !live && r.chance(0.28);
    const items = picked.map(({ b, maya }, k) => {
      const ir = r.fork(`item:${b.id}`);
      lastFeatured.set(b.id, di);
      if (upcoming) {
        const free = remainingSpots(b);
        const share = di === dates.indexOf(today) ? 0.7 : 0.5;
        const total = Math.max(1, Math.min(ir.int(8, 32), free <= 3 ? free : Math.ceil(free * share)));
        upcomingAllocated.set(b.id, (upcomingAllocated.get(b.id) ?? 0) + total);
        return { bounty_id: b.id, spots_total: total, spots_left: total, claims: [] };
      }
      const cap = spotsLeft({ remaining_cents: b.budget_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate });
      const total = clamp(ir.int(8, 24), 4, Math.max(8, Math.min(40, cap)));
      let fraction = hotDay ? 1 : ir.weighted([[1, 22], [0.9, 18], [0.75, 24], [0.6, 20], [0.45, 12], [0.3, 4]]);
      if (live) fraction = k === 1 ? 1 : clamp(fraction * 0.55, 0.12, 0.7);
      const n = Math.min(total, Math.max(1, Math.round(total * fraction)));
      const claimWindow = Math.min(DAY, live ? nowMs - releaseMs : DAY);
      const claimers = new Map();
      // creators who really submitted inside the window claimed first
      for (const s of (W.subsByBounty.get(b.id) ?? []).filter((x) => ms(x.submitted_at) >= releaseMs && ms(x.submitted_at) < releaseMs + claimWindow && x.creator_id !== mayaId).slice(0, n)) {
        claimers.set(s.creator_id, iso(clamp(ms(s.submitted_at) - ir.int(8, 200) * 60_000, releaseMs + 30_000, releaseMs + claimWindow - 60_000)));
      }
      if (maya && mayaId) {
        const at = maya.kind === 'joined' ? `${date}T16:11:42Z` : iso(Math.max(releaseMs + 4 * 60_000, ms(maya.sub.submitted_at) - 25 * 60_000));
        claimers.set(mayaId, at);
      }
      const extra = ir.sample(W.creators.filter((c) => !claimers.has(c.id) && c.id !== mayaId && claimable(b, c, releaseMs)), Math.max(0, n - claimers.size));
      for (const c of extra) {
        const mean = 3.2 - (TIER_RANK[c.tier] ?? 0) * 0.5; // higher tiers have a head start, so they claim sooner
        const delay = Math.min(claimWindow - 60_000, -Math.log(1 - ir.next() * 0.98) * mean * 3_600_000);
        claimers.set(c.id, iso(releaseMs + Math.max(30_000, delay)));
      }
      const claims = [...claimers.entries()].map(([creator_id, claimed_at]) => ({ creator_id, claimed_at }))
        .sort((a, c) => (a.claimed_at < c.claimed_at ? -1 : a.claimed_at > c.claimed_at ? 1 : a.creator_id < c.creator_id ? -1 : 1)).slice(0, total);
      for (const c of claims) claimsByCreator.push({ creator_id: c.creator_id, bounty_id: b.id, drop_date: date, claimed_at: c.claimed_at, live });
      return { bounty_id: b.id, spots_total: total, spots_left: total - claims.length, claims };
    });
    const spotsTotal = sum(items, (i) => i.spots_total);
    const left = sum(items, (i) => i.spots_left);
    const allSold = !upcoming && left === 0;
    const status = upcoming ? 'upcoming' : allSold ? 'sold_out' : live ? 'live' : 'closed';
    const catsIn = [...new Set(items.map((i) => W.appById.get(W.bountyById.get(i.bounty_id).app_id)?.category ?? 'lifestyle'))];
    const nWord = cap1(WORDS[items.length] ?? String(items.length));
    const headline = date === today ? `${nWord} new bounties. ${spotsTotal} real spots.`
      : di % 3 === 0 ? `${nWord} bounties. ${spotsTotal} real spots.`
        : di % 3 === 1 ? `${cap1(CAT_NAME[catsIn[0]] ?? catsIn[0])}${catsIn[1] ? ` and ${CAT_NAME[catsIn[1]] ?? catsIn[1]}` : ''} first. ${spotsTotal} real spots.`
          : `${spotsTotal} spots across ${items.length} bounties.`;
    drops.push({
      date, release_at: releaseAt, claim_window_ends_at: claimEnds, status, headline, items, spots_total: spotsTotal, spots_left: left, claims_total: spotsTotal - left,
      created_at: iso(Math.min(nowMs - (dates.length - di) * 3 * 60_000 - 3_600_000, releaseMs - 18 * 3_600_000)),
    });
  });
  return { drops: drops.sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({ id: `drop_${d.date}`, ...d })), claimsByCreator };
}

// ── bounty saves ─────────────────────────────────────────────────────────────────────────────────────
export function genSaves(W, rng, drops, claimsByCreator) {
  const nowMs = ms(W.now);
  const rows = [];
  const maya = W.maya;
  const liveBounties = W.bounties.filter((b) => b.status === 'live' && b.type !== 'direct' && b.visibility !== 'private');
  const dropById = new Map(drops.map((d) => [d.id, d]));
  const submittedBy = (c, b) => (W.subsByBounty.get(b.id) ?? []).find((s) => s.creator_id === c.id);
  const has = (cid, bid) => rows.some((x) => x.creator_id === cid && x.bounty_id === bid);
  const r0 = rng.fork('saves:active');

  // active Daily Drop claims (inside their 24 hours): Maya's, plus a dozen others
  const active = claimsByCreator.filter((c) => c.live && ms(c.claimed_at) + DAY > nowMs);
  const act = [...active.filter((c) => c.creator_id === maya?.id), ...r0.shuffle(active.filter((c) => c.creator_id !== maya?.id)).slice(0, 13)];
  for (const c of act) {
    const drop = dropById.get(`drop_${c.drop_date}`);
    const sub = submittedBy({ id: c.creator_id }, { id: c.bounty_id });
    if (sub && ms(sub.submitted_at) <= nowMs) rows.push({ creator_id: c.creator_id, bounty_id: c.bounty_id, stage: 'submitted', saved_at: c.claimed_at, claimed_until: iso(ms(c.claimed_at) + DAY), drop_id: drop.id, submission_id: sub.id, updated_at: sub.submitted_at });
    else rows.push({ creator_id: c.creator_id, bounty_id: c.bounty_id, stage: 'joined', saved_at: c.claimed_at, claimed_until: iso(ms(c.claimed_at) + DAY), drop_id: drop.id, updated_at: c.claimed_at });
  }

  // Maya: five saved bounties and two joined (one is the active Daily Drop claim above)
  if (maya) {
    const r = rng.fork('saves:maya');
    const joined = rows.filter((x) => x.creator_id === maya.id && x.stage === 'joined').length;
    const fresh = (b) => !submittedBy(maya, b) && !has(maya.id, b.id) && b.type !== 'direct' && b.visibility !== 'private' && !(b.eligibility?.min_tier && (TIER_RANK[maya.tier] ?? 0) < (TIER_RANK[b.eligibility.min_tier] ?? 0));
    const mix = r.shuffle(liveBounties.filter(fresh));
    for (let i = joined; i < 2 && mix.length; i++) {
      const b = mix.shift();
      const at = iso(nowMs - r.int(5, 40) * 3_600_000);
      rows.push({ creator_id: maya.id, bounty_id: b.id, stage: 'joined', saved_at: iso(ms(at) - r.int(2, 30) * 3_600_000), updated_at: at });
    }
    // a busy creator has already submitted to most open bounties, so the saved list also holds bounties that are paused or filled since she
    // saved them: the app shows those greyed out with the reason, never silently dropped
    const closing = W.bounties.filter((b) => ['paused', 'filled', 'scheduled'].includes(b.status) && fresh(b));
    const savedPool = [...mix, ...r.shuffle(closing)];
    for (let i = 0; i < 5 && savedPool.length; i++) {
      const b = savedPool.shift();
      // a scheduled bounty is announced before it opens ("coming soon"), so it can be saved from the day it was funded
      const visibleFrom = b.status === 'scheduled' ? (b.funded_at ?? b.created_at) : (b.published_at ?? b.starts_at);
      const lo = Math.max(ms(visibleFrom) + 3_600_000, nowMs - 12 * DAY);
      const hi = Math.min(nowMs - 3_600_000, ms(b.filled_at ?? iso(nowMs)) - 3_600_000);
      if (hi <= lo) { i--; continue; }
      const at = iso(lo + r.next() * (hi - lo));
      rows.push({ creator_id: maya.id, bounty_id: b.id, stage: 'saved', saved_at: at, updated_at: at });
    }
  }

  // everyone else: saved bounties, in-flight submissions and a few Studio joins
  const r2 = rng.fork('saves:others');
  const others = W.creators.filter((c) => c.id !== maya?.id);
  let guard = 0;
  while (rows.filter((x) => x.stage === 'saved').length < 56 && guard++ < 800) {
    const c = pick(r2, others);
    const b = pick(r2, liveBounties);
    if (!b || submittedBy(c, b) || has(c.id, b.id)) continue;
    if (b.eligibility?.countries?.length && !b.eligibility.countries.includes(c.country)) continue;
    const at = iso(nowMs - r2.int(2, 24 * 14) * 3_600_000);
    if (ms(at) < ms(b.published_at ?? b.starts_at) || ms(at) < ms(c.joined_at)) continue;
    rows.push({ creator_id: c.id, bounty_id: b.id, stage: 'saved', saved_at: at, updated_at: at });
  }
  const inFlight = W.subs.filter((s) => ['in_review', 'changes_requested', 'approved', 'qa_pending'].includes(s.status) && s.creator_id !== maya?.id);
  for (const s of r2.shuffle(inFlight).slice(0, 18)) {
    if (has(s.creator_id, s.bounty_id)) continue;
    const savedAt = iso(Math.max(ms(W.creatorById.get(s.creator_id).joined_at) + 3_600_000, ms(s.submitted_at) - r2.int(2, 60) * 3_600_000));
    rows.push({ creator_id: s.creator_id, bounty_id: s.bounty_id, stage: 'submitted', saved_at: savedAt, submission_id: s.id, updated_at: s.versions[s.versions.length - 1].submitted_at });
  }
  for (let i = 0; i < 12 && rows.filter((x) => x.stage === 'joined' && !x.drop_id).length < 6; i++) {
    const c = pick(r2, others);
    const b = pick(r2, liveBounties);
    if (!b || submittedBy(c, b) || has(c.id, b.id)) continue;
    const at = iso(nowMs - r2.int(3, 70) * 3_600_000);
    if (ms(at) < ms(b.published_at ?? b.starts_at) || ms(at) < ms(c.joined_at)) continue;
    rows.push({ creator_id: c.id, bounty_id: b.id, stage: 'joined', saved_at: iso(ms(at) - r2.int(1, 30) * 3_600_000), updated_at: at });
  }
  rows.sort((a, b) => (a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : a.saved_at < b.saved_at ? -1 : 1));
  return rows.map((row, i) => ({ id: `save_${String(i + 1).padStart(4, '0')}`, ...row }));
}
