// Weekly streaks (earned freezes, rest weeks, no guilt), Wellbeing Mode and notification preferences.
// Streaks are simulated week by week from each creator's real posts and must land on creators.streak_weeks.

import { iso, ms, isoWeek, isoWeekEnd, clamp } from '../lib.mjs';

const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const QUIET = (tz, enabled = true) => ({ enabled, start: '22:00', end: '08:00', timezone: tz });

// ── wellbeing ─────────────────────────────────────────────────────────────────────────────────────
export function genWellbeing(W, rng, optOut) {
  const maya = W.maya;
  const last10 = W.weekIds(11).slice(0, 10); // completed weeks only
  const tzOf = (c) => W.userById.get(c.user_id)?.timezone ?? 'America/Chicago';
  const chosen = new Map();
  const add = (c, patch) => { if (c) chosen.set(c.id, { ...(chosen.get(c.id) ?? {}), ...patch }); };
  const r = rng.fork('wellbeing');
  const emptyWeeks = (c) => last10.filter((w) => !(W.weeklyPosts(c.id).get(w) > 0) && ms(c.joined_at) < ms(W.week.start) - 14 * DAY);

  if (maya) add(maya, { enabled: true });
  for (const c of W.creators) if (c.paused_until) add(c, { enabled: true, paused_until: c.paused_until });
  for (const id of optOut) add(W.creatorById.get(id), { enabled: true, leaderboard_opt_out: true });
  const rest = W.creators.filter((c) => c.id !== maya?.id && !chosen.has(c.id) && emptyWeeks(c).length >= 1 && (W.postsByCreator.get(c.id) ?? []).length >= 3);
  const pool = r.shuffle(W.creators.filter((c) => c.id !== maya?.id && !chosen.has(c.id) && (W.postsByCreator.get(c.id) ?? []).length >= 2));
  // two creators who declared a rest week in the past and one who is resting this week
  r.shuffle(rest).slice(0, 2).forEach((c) => add(c, { enabled: true, rest_weeks: [pick(r, emptyWeeks(c))], slack_mode: true }));
  const resting = pool.find((c) => !chosen.has(c.id));
  if (resting) add(resting, { enabled: true, rest_weeks: [W.week.id] });
  pool.filter((c) => !chosen.has(c.id)).slice(0, 2).forEach((c) => add(c, { enabled: true, numbers_off: true }));
  pool.filter((c) => !chosen.has(c.id)).slice(0, 2).forEach((c, i) => add(c, { enabled: true, pace: i + 2 }));
  pool.filter((c) => !chosen.has(c.id)).slice(0, 1).forEach((c) => add(c, { enabled: false }));
  while (chosen.size < 12) { const c = pool.find((x) => !chosen.has(x.id)); if (!c) break; add(c, { enabled: true, slack_mode: true }); }

  const rows = [...chosen.entries()].map(([id, p]) => {
    const c = W.creatorById.get(id);
    const tz = tzOf(c);
    const isMaya = c.id === maya?.id;
    const created = iso(clamp(ms(c.joined_at) + 3 * DAY + r.int(0, 20) * 3_600_000, ms(c.joined_at), ms(W.now) - 3 * 3_600_000));
    return {
      creator_id: c.id, enabled: p.enabled ?? true,
      quiet_hours: QUIET(tz, p.enabled === false ? false : true),
      numbers_off: p.numbers_off ? { enabled: true, from: '18:00', to: '09:00' } : { enabled: false },
      pace_goal: p.pace ? { enabled: true, posts_per_week: p.pace } : { enabled: false },
      ...(p.paused_until ? { paused_until: p.paused_until } : {}),
      rest_weeks: p.rest_weeks ?? [], leaderboard_opt_out: Boolean(p.leaderboard_opt_out), slack_mode: Boolean(p.slack_mode),
      updated_at: isMaya ? '2026-09-12T20:15:00Z' : created,
    };
  }).sort((a, b) => (a.creator_id < b.creator_id ? -1 : 1));
  return rows.map((row) => ({ id: `wb_${W.slugOf(row.creator_id)}`, ...row }));
}

// ── streaks ───────────────────────────────────────────────────────────────────────────────────────
export function genStreaks(W, rng, wellbeing) {
  const nowMs = ms(W.now);
  const cfg = W.C.streaks;
  const wbBy = new Map(wellbeing.map((w) => [w.creator_id, w]));
  const allWeeks = (() => {
    const out = [];
    for (let t = ms('2026-07-06T00:00:00Z'); t <= ms(W.week.start); t += 7 * DAY) out.push(isoWeek(iso(t)));
    return out;
  })();
  const hist12 = W.weekIds(12);
  const curWeek = W.week.id;
  const rows = [];
  for (const c of W.creators) {
    const mine = W.postsByCreator.get(c.id) ?? [];
    if (!mine.length) continue;
    const counts = W.weeklyPosts(c.id);
    const wb = wbBy.get(c.id);
    const rest = new Set(wb?.rest_weeks ?? []);
    const slack = wb?.slack_mode;
    const firstWeek = isoWeek(c.joined_at);
    // simulate week by week
    let streak = 0;
    let best = 0;
    let banked = 0;
    let earned = 0;
    let used = 0;
    const outcome = new Map();
    for (const w of allWeeks) {
      if (w < firstWeek) continue;
      const posts = counts.get(w) ?? 0;
      const isCur = w === curWeek;
      if (posts > 0) {
        streak++;
        best = Math.max(best, streak);
        if (streak % cfg.freeze_earned_every_weeks === 0 && banked < cfg.freeze_bank_max) { banked++; earned++; }
        outcome.set(w, 'posted');
      } else if (isCur) outcome.set(w, 'missed'); // the week is still open; the streak is untouched until Sunday ends
      else if (rest.has(w)) outcome.set(w, 'rest');
      else if (banked > 0 && (slack || true)) { banked--; used++; outcome.set(w, 'freeze_used'); }
      else { streak = 0; outcome.set(w, 'missed'); }
    }
    let current = streak;
    // reconcile with the core snapshot: the run must end on creators.streak_weeks
    const target = c.streak_weeks;
    if (target !== current) {
      const weeks = allWeeks.filter((w) => w >= firstWeek);
      outcome.clear();
      used = 0;
      let remaining = target;
      for (let i = weeks.length - 1; i >= 0; i--) {
        const w = weeks[i];
        const hasPost = (counts.get(w) ?? 0) > 0;
        if (i === weeks.length - 1) { outcome.set(w, hasPost ? 'posted' : 'missed'); if (hasPost) remaining--; continue; }
        if (remaining > 0) {
          if (hasPost) { outcome.set(w, 'posted'); remaining--; } else { outcome.set(w, rest.has(w) ? 'rest' : 'freeze_used'); if (!rest.has(w)) used++; }
        } else outcome.set(w, remaining === 0 ? ((remaining = -1), 'missed') : hasPost ? 'posted' : 'missed');
      }
      current = target;
      // the best run is read off the reconciled weeks (a freeze or a rest week holds a run without adding to it)
      best = 0;
      let run = 0;
      for (const w of weeks) {
        const o = outcome.get(w);
        if (o === 'posted') { run++; best = Math.max(best, run); } else if (o !== 'freeze_used' && o !== 'rest') run = 0;
      }
      best = Math.max(best, target);
      earned = Math.max(used, Math.floor(target / cfg.freeze_earned_every_weeks) + used);
      banked = Math.min(cfg.freeze_bank_max, Math.max(0, earned - used));
      earned = used + banked;
    }
    const history = hist12.map((w) => ({ iso_week: w, outcome: w < firstWeek ? 'missed' : outcome.get(w) ?? 'missed', posts: counts.get(w) ?? 0 }));
    const lastDone = history[history.length - 2];
    const postedThis = (counts.get(curWeek) ?? 0) > 0;
    const restThis = rest.has(curWeek);
    const total = mine.length;
    const joinedDays = (nowMs - ms(c.joined_at)) / DAY;
    const status = restThis ? 'resting' : lastDone?.outcome === 'freeze_used' && !postedThis ? 'frozen' : current === 0 && best > 0 ? 'broken' : total <= 1 || joinedDays < 10 ? 'new' : 'active';
    const lastPost = mine.map((p) => p.posted_at).sort().pop();
    rows.push({
      creator_id: c.id, status, current_weeks: current, best_weeks: Math.max(best, current), freezes_banked: banked, freezes_earned_total: earned, freezes_used_total: used,
      rest_weeks_used_quarter: Math.min(cfg.rest_weeks_per_quarter, history.filter((h) => h.outcome === 'rest').length), iso_week: curWeek, posts_this_week: counts.get(curWeek) ?? 0,
      posted_this_week: postedThis, week_ends_at: isoWeekEnd(W.now), next_freeze_in_weeks: (cfg.freeze_earned_every_weeks - (current % cfg.freeze_earned_every_weeks)) % cfg.freeze_earned_every_weeks,
      history, updated_at: iso(Math.min(nowMs - 60_000, ms(lastPost))),
    });
  }
  rows.sort((a, b) => (a.creator_id < b.creator_id ? -1 : 1));
  return rows.map((row) => ({ id: `stk_${W.slugOf(row.creator_id)}`, ...row }));
}

// ── notification preferences ───────────────────────────────────────────────────────────────────────
export function genNotificationPrefs(W, rng, wellbeing) {
  const rows = [];
  const tz = (userId) => W.userById.get(userId)?.timezone ?? 'America/Chicago';
  const P = W.ctx.world.PERSONAS;
  const mk = (userId, p) => rows.push({ user_id: userId, push: p.push ?? true, email_digest: p.email_digest ?? false, categories: p.categories, quiet_hours: p.quiet_hours, batch_non_cash: p.batch_non_cash ?? true, drop_reminder: p.drop_reminder ?? false, updated_at: p.updated_at });
  const creatorCats = { money: true, reviews: true, drop: true, offers: true, tournaments: true, tips: true, safety: true };
  mk(P.creator.user_id, { categories: { ...creatorCats, tips: false }, quiet_hours: QUIET(tz(P.creator.user_id)), drop_reminder: true, updated_at: '2026-09-12T20:15:00Z' });
  mk(P.brand.user_id, { email_digest: true, categories: { money: true, reviews: true, drop: false, offers: true, tournaments: false, tips: false, safety: true }, quiet_hours: QUIET(tz(P.brand.user_id), false), batch_non_cash: false, updated_at: '2026-08-14T15:02:00Z' });
  mk(P.admin.user_id, { email_digest: true, categories: { money: true, reviews: true, drop: false, offers: false, tournaments: false, tips: false, safety: true }, quiet_hours: QUIET(tz(P.admin.user_id), false), batch_non_cash: false, updated_at: '2026-07-05T09:00:00Z' });
  const maren = W.membersOf(W.lumi?.id ?? '').find((m) => m.role === 'reviewer');
  if (maren) mk(maren.user_id, { categories: { money: false, reviews: true, drop: false, offers: true, tournaments: false, tips: false, safety: true }, quiet_hours: QUIET(tz(maren.user_id)), batch_non_cash: true, updated_at: '2026-08-02T13:40:00Z' });
  const r = rng.fork('nprefs');
  for (const w of wellbeing.filter((x) => x.creator_id !== W.maya?.id).slice(0, 3)) {
    const c = W.creatorById.get(w.creator_id);
    mk(c.user_id, { push: r.chance(0.8), categories: { ...creatorCats, tournaments: r.chance(0.5), tips: r.chance(0.4), drop: r.chance(0.6) }, quiet_hours: w.quiet_hours, drop_reminder: r.chance(0.4), updated_at: w.updated_at });
  }
  return rows.map((row) => ({ id: `npref_${W.slugOf(row.user_id)}`, ...row }));
}
