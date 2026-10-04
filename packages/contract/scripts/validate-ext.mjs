// validate-ext: reconciliation checks for the EXT fixtures (owner ext in the catalogue). Registered in validate-fixtures.mjs (CHECKS and
// SCENARIO_CHECKS). Every function takes (ds, rep): ds = the dataset helper of validate-fixtures, rep = the Report.
//
// Invariant ids: T-07 .. T-11, T-13, T-14 (streaks, leaderboards, offers, drops, rights, library, queues) exist in schema/world.mjs and
// E-01 .. E-09 are the ext-specific ones added with this generator (academy, tax, compliance and fraud, growth, platform, public pages,
// trust queues, notifications, Maya).

import { CONSTANTS as C, WORLD, enumValues } from '../schema/index.mjs';
import { mulRate, tierFor, spotsLeft, fraudBand } from '../schema/formulas.mjs';
import { NOW_MS, NOW_ISO, ms, addHours, addDays, dateOf, isoWeek, isoWeekEnd } from '../schema/time.mjs';

const DAY = 86_400_000;
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const group = (rows, f) => { const m = new Map(); for (const r of rows) { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
const near = (a, b, eps = 0.0051) => Math.abs(a - b) <= eps;

// ── T-07 streaks ─────────────────────────────────────────────────────────────────────────────────────
function checkStreaks(ds, rep) {
  const creators = ds.byId('creators');
  const week = isoWeek(NOW_ISO);
  const seen = new Set();
  for (const s of ds.t('streaks')) {
    if (seen.has(s.creator_id)) rep.err('T-07', 'streaks.creator_id', `${s.id}: more than one streak for ${s.creator_id}`);
    seen.add(s.creator_id);
    const c = creators.get(s.creator_id);
    if (c && c.streak_weeks !== s.current_weeks) rep.err('T-07', 'streaks.current_weeks', `${s.id}: ${s.current_weeks} != creators.streak_weeks ${c.streak_weeks}`);
    if (s.freezes_banked > C.streaks.freeze_bank_max) rep.err('T-07', 'streaks.freezes_banked', `${s.id}: ${s.freezes_banked} banked, max ${C.streaks.freeze_bank_max}`);
    if (s.freezes_earned_total - s.freezes_used_total !== s.freezes_banked) rep.err('T-07', 'streaks.freezes', `${s.id}: earned ${s.freezes_earned_total} - used ${s.freezes_used_total} != banked ${s.freezes_banked}`);
    if (s.history.length !== 12) rep.err('T-07', 'streaks.history', `${s.id}: history has ${s.history.length} weeks, needs 12`);
    const last = s.history[s.history.length - 1];
    if (!last || last.iso_week !== week || s.iso_week !== week) rep.err('T-07', 'streaks.iso_week', `${s.id}: history must end at ${week}`);
    for (let i = 1; i < s.history.length; i++) if (s.history[i].iso_week <= s.history[i - 1].iso_week) rep.err('T-07', 'streaks.history', `${s.id}: history not oldest first`);
    if (s.week_ends_at !== isoWeekEnd(NOW_ISO)) rep.err('T-07', 'streaks.week_ends_at', `${s.id}: ${s.week_ends_at}`);
    if (s.next_freeze_in_weeks !== (C.streaks.freeze_earned_every_weeks - (s.current_weeks % C.streaks.freeze_earned_every_weeks)) % C.streaks.freeze_earned_every_weeks) rep.err('T-07', 'streaks.next_freeze_in_weeks', `${s.id}: ${s.next_freeze_in_weeks} for a ${s.current_weeks}-week streak`);
    if (s.posted_this_week !== (s.posts_this_week > 0)) rep.err('T-07', 'streaks.posted_this_week', `${s.id}: flag disagrees with posts_this_week`);
    if (s.best_weeks < s.current_weeks) rep.err('T-07', 'streaks.best_weeks', `${s.id}: best < current`);
    if (s.rest_weeks_used_quarter > C.streaks.rest_weeks_per_quarter) rep.err('T-07', 'streaks.rest_weeks_used_quarter', `${s.id}: ${s.rest_weeks_used_quarter} > ${C.streaks.rest_weeks_per_quarter}`);
    if (c && s.posts_this_week !== ds.t('posts').filter((p) => p.creator_id === s.creator_id && isoWeek(p.posted_at) === week).length) rep.warn('T-07', 'streaks.posts_this_week', `${s.id}: differs from the creator's posts this week`);
  }
  const withPosts = new Set(ds.t('posts').map((p) => p.creator_id));
  for (const id of withPosts) if (!seen.has(id)) rep.warn('T-07', 'streaks', `${id} has posts but no streak row`);
}

// ── T-08 leaderboards ────────────────────────────────────────────────────────────────────────────────
function checkLeaderboards(ds, rep) {
  const wb = new Map(ds.t('wellbeing_settings').map((w) => [w.creator_id, w]));
  for (const b of ds.t('leaderboards')) {
    if (b.cohort_size !== b.entries.length) rep.err('T-08', 'leaderboards.cohort_size', `${b.id}: ${b.cohort_size} != ${b.entries.length} entries`);
    const ids = new Set();
    b.entries.forEach((e, i) => {
      if (e.rank !== i + 1) rep.err('T-08', 'leaderboards.rank', `${b.id}: rank ${e.rank} at position ${i + 1}`);
      if (i > 0 && e.value > b.entries[i - 1].value) rep.err('T-08', 'leaderboards.value', `${b.id}: values are not in descending order at rank ${e.rank}`);
      if (ids.has(e.creator_id)) rep.err('T-08', 'leaderboards.entries', `${b.id}: ${e.creator_id} appears twice`);
      ids.add(e.creator_id);
      if (wb.get(e.creator_id)?.leaderboard_opt_out) rep.err('T-08', 'leaderboards.entries', `${b.id}: ${e.creator_id} opted out of rankings`);
      if (e.zone === 'promotion' && b.scope !== 'cohort') rep.err('T-08', 'leaderboards.zone', `${b.id}: promotion zone on a ${b.scope} board`);
      if (b.scope === 'cohort' && (e.zone === 'promotion') !== (e.rank <= b.promotion_zone_size)) rep.err('T-08', 'leaderboards.zone', `${b.id}: zone of rank ${e.rank} does not follow promotion_zone_size ${b.promotion_zone_size}`);
    });
    if (b.scope !== 'cohort' && b.promotion_zone_size !== 0) rep.err('T-08', 'leaderboards.promotion_zone_size', `${b.id}: only cohort boards have a promotion zone`);
    if (b.scope === 'cohort' && b.entries.length > C.leaderboards.cohort_max_size) rep.err('T-08', 'leaderboards.cohort_size', `${b.id}: ${b.entries.length} exceeds ${C.leaderboards.cohort_max_size}`);
    if (b.scope === 'cohort' && b.entries.length < C.leaderboards.cohort_min_size) rep.warn('T-08', 'leaderboards.cohort_size', `${b.id}: ${b.entries.length} is under the minimum cohort size`);
    if (b.reset_at !== addDays(b.week_starts_at, 7) && b.iso_week === isoWeek(NOW_ISO)) rep.err('T-08', 'leaderboards.reset_at', `${b.id}: reset_at must be the next Monday 00:00Z`);
    if (!b.id.startsWith(`lb_${b.iso_week.toLowerCase()}_${b.scope}_`)) rep.err('T-08', 'leaderboards.id', `${b.id}: id does not follow lb_<week>_<scope>_...`);
  }
}

// ── T-09 offers ──────────────────────────────────────────────────────────────────────────────────────
function checkOffers(ds, rep) {
  const bounties = ds.byId('bounties');
  for (const o of ds.t('offers')) {
    const counters = o.thread.filter((m) => m.type === 'counter').length;
    if (o.rounds !== counters) rep.err('T-09', 'offers.rounds', `${o.id}: rounds ${o.rounds} != ${counters} counters in the thread`);
    if (o.rounds > C.windows.max_counter_rounds) rep.err('T-09', 'offers.rounds', `${o.id}: ${o.rounds} rounds > ${C.windows.max_counter_rounds}`);
    for (let i = 1; i < o.thread.length; i++) if (ms(o.thread[i].at) < ms(o.thread[i - 1].at)) rep.err('T-09', 'offers.thread', `${o.id}: thread is not ordered by time`);
    const lastAt = o.thread[o.thread.length - 1].at;
    if (o.expires_at !== addDays(lastAt, C.windows.offer_expiry_days)) rep.err('T-09', 'offers.expires_at', `${o.id}: expires_at ${o.expires_at} != last activity + 7 days (${addDays(lastAt, 7)})`);
    if (o.updated_at !== lastAt) rep.err('T-09', 'offers.updated_at', `${o.id}: updated_at != last message`);
    if (o.created_at !== o.thread[0].at) rep.err('T-09', 'offers.created_at', `${o.id}: created_at != first message`);
    if (['accepted', 'completed'].includes(o.status)) {
      if (!o.escrow_funded) rep.err('T-09', 'offers.escrow_funded', `${o.id}: ${o.status} without funded escrow`);
      if (!o.bounty_id) rep.err('T-09', 'offers.bounty_id', `${o.id}: ${o.status} without a bounty`);
      if (!o.accepted_at) rep.err('T-09', 'offers.accepted_at', `${o.id}: missing accepted_at`);
    }
    if (o.bounty_id && !bounties.has(o.bounty_id)) rep.err('T-09', 'offers.bounty_id', `${o.id}: unknown bounty`);
    if (o.status === 'expired' && ms(o.expires_at) > NOW_MS) rep.err('T-09', 'offers.status', `${o.id}: expired but expires_at is in the future`);
    if (['awaiting_creator', 'awaiting_brand'].includes(o.status) && ms(o.expires_at) <= NOW_MS) rep.err('T-09', 'offers.status', `${o.id}: ${o.status} but already past expires_at`);
    if (o.kind === 'invite') { if (o.amount_cents !== 0 || !o.bounty_id) rep.err('T-09', 'offers.kind', `${o.id}: an invite pays the bounty rates (amount 0) and names its bounty`); }
    else if (o.all_in_cents !== o.amount_cents + mulRate(o.amount_cents, o.take_rate)) rep.err('T-09', 'offers.all_in_cents', `${o.id}: all-in ${o.all_in_cents} != amount + fee`);
    const who = o.status === 'awaiting_creator' ? 'brand' : o.status === 'awaiting_brand' ? 'creator' : null;
    const lastHuman = [...o.thread].reverse().find((m) => m.author_role !== 'system');
    if (who && lastHuman && lastHuman.author_role !== who) rep.err('T-09', 'offers.status', `${o.id}: ${o.status} but the last message is from the ${lastHuman.author_role}`);
    if (o.kind === 'rebuy' && !o.rebuy_of_post_id) rep.err('T-09', 'offers.rebuy_of_post_id', `${o.id}: re-buy without the winning post`);
    if (['declined', 'withdrawn', 'expired', 'completed'].includes(o.status) !== Boolean(o.closed_at)) rep.err('T-09', 'offers.closed_at', `${o.id}: closed_at must be set exactly when the offer is closed`);
    if (o.closed_at && ms(o.closed_at) < ms(lastAt) - 1000) rep.err('T-09', 'offers.closed_at', `${o.id}: closed before the last message`);
  }
  const threads = ds.t('threads');
  const offerIds = new Set(ds.t('offers').map((o) => o.id));
  const byOffer = new Map();
  for (const t of threads) {
    for (let i = 1; i < t.messages.length; i++) if (ms(t.messages[i].at) < ms(t.messages[i - 1].at)) rep.err('T-09', 'threads.messages', `${t.id}: messages not ordered by time`);
    if (t.last_message_at !== t.messages[t.messages.length - 1].at) rep.err('T-09', 'threads.last_message_at', `${t.id}: last_message_at != last message`);
    if (t.created_at !== t.messages[0].at) rep.err('T-09', 'threads.created_at', `${t.id}: created_at != first message`);
    if (t.kind === 'offer') { if (!t.offer_id || !offerIds.has(t.offer_id)) rep.err('T-09', 'threads.offer_id', `${t.id}: offer thread without a real offer`); else byOffer.set(t.offer_id, (byOffer.get(t.offer_id) ?? 0) + 1); }
    if (t.kind === 'submission' && !t.submission_id) rep.err('T-09', 'threads.submission_id', `${t.id}: submission thread without a submission`);
    for (const m of t.messages) if ((m.kind === 'warning') !== Boolean(m.warning_code)) rep.err('T-09', 'threads.messages', `${t.id}: ${m.id}: warning_code must be set exactly on warning messages`);
    for (const m of t.messages) if (/whatsapp|telegram|gift card/i.test(m.body) && m.author_role === 'system' && m.kind !== 'warning' && m.kind !== 'system') rep.warn('T-09', 'threads.messages', `${t.id}: ${m.id}: risky wording without a Scam Shield warning`);
  }
  for (const id of offerIds) if (byOffer.get(id) !== 1) rep.warn('T-09', 'threads', `offer ${id} has ${byOffer.get(id) ?? 0} threads (expected 1)`);
  // auctions: sealed bids, second price
  for (const a of ds.t('auctions')) {
    if (a.bids_count !== a.bids.length) rep.err('T-09', 'auctions.bids_count', `${a.id}: ${a.bids_count} != ${a.bids.length}`);
    const dur = (ms(a.closes_at) - ms(a.opens_at)) / 3_600_000;
    if (dur < C.auctions.min_duration_hours - 0.01 || dur > C.auctions.max_duration_days * 24 + 0.01) rep.err('T-09', 'auctions.closes_at', `${a.id}: ${dur} h between open and close`);
    if (a.slots < C.auctions.min_slots || a.slots > C.auctions.max_slots) rep.err('T-09', 'auctions.slots', `${a.id}: ${a.slots} slots`);
    if (a.reserve_cents < C.auctions.reserve_floor_cents) rep.err('T-09', 'auctions.reserve_cents', `${a.id}: reserve below the floor`);
    for (const b of a.bids) if (b.amount_cents < a.reserve_cents) rep.err('T-09', 'auctions.bids', `${a.id}: ${b.id} is below the reserve`);
    if (a.status === 'awarded') {
      const sorted = [...a.bids].sort((x, y) => y.amount_cents - x.amount_cents);
      const winners = sorted.slice(0, Math.min(a.slots, sorted.length));
      const clearing = sorted.length > a.slots ? sorted[a.slots].amount_cents : a.reserve_cents;
      if (a.clearing_price_cents !== clearing) rep.err('T-09', 'auctions.clearing_price_cents', `${a.id}: clearing ${a.clearing_price_cents} != second price ${clearing}`);
      if ([...(a.winning_bid_ids ?? [])].sort().join() !== winners.map((b) => b.id).sort().join()) rep.err('T-09', 'auctions.winning_bid_ids', `${a.id}: winners are not the top ${a.slots} bids`);
      for (const b of a.bids) if ((b.status === 'won') !== (a.winning_bid_ids ?? []).includes(b.id) || (b.status === 'won' && b.pays_cents !== clearing)) rep.err('T-09', 'auctions.bids', `${a.id}: ${b.id} status or pays_cents disagree with the award`);
    }
    if (a.status === 'open' && !(ms(a.opens_at) <= NOW_MS && ms(a.closes_at) > NOW_MS)) rep.err('T-09', 'auctions.status', `${a.id}: open outside its window`);
    if (a.status === 'scheduled' && ms(a.opens_at) <= NOW_MS) rep.err('T-09', 'auctions.status', `${a.id}: scheduled but already open`);
    if (a.status === 'no_bids' && a.bids.length) rep.err('T-09', 'auctions.status', `${a.id}: no_bids with bids`);
    if (a.status === 'open' && a.bids.some((b) => b.status !== 'sealed')) rep.err('T-09', 'auctions.bids', `${a.id}: bids of an open auction stay sealed`);
    const tier = ds.byId('creators').get(a.creator_id)?.tier;
    if (tier && !['platinum', 'elite'].includes(tier)) rep.warn('T-09', 'auctions.creator_id', `${a.id}: creator is ${tier}, auctions are Platinum and Elite`);
  }
  // specs
  for (const s of ds.t('specs')) {
    if (s.stats.licenses !== s.licenses.length) rep.err('T-09', 'specs.stats.licenses', `${s.id}: stats.licenses ${s.stats.licenses} != ${s.licenses.length}`);
    if (['listed', 'licensed', 'first_refusal'].includes(s.status) && s.flow_points < C.specs.min_flow_points_to_list) rep.err('T-09', 'specs.flow_points', `${s.id}: ${s.status} with flow points ${s.flow_points} < ${C.specs.min_flow_points_to_list}`);
    if (s.price_cents < C.specs.price_floor_cents || s.price_cents > C.specs.price_cap_cents) rep.err('T-09', 'specs.price_cents', `${s.id}: price ${s.price_cents} outside the floor and cap`);
    if (s.qa_pass + s.qa_warn + s.qa_fail !== 14) rep.err('T-09', 'specs.qa', `${s.id}: qa counts do not add up to 14`);
    if (s.status === 'licensed' && !s.licenses.length) rep.err('T-09', 'specs.status', `${s.id}: licensed without a licence`);
    if (s.status !== 'licensed' && s.licenses.length && s.exclusive) rep.err('T-09', 'specs.status', `${s.id}: an exclusive spec with a licence is licensed`);
    if (s.source === 'released_from_bounty') {
      if (!s.source_submission_id || !s.source_brand_id || !s.first_refusal_ends_at) rep.err('T-09', 'specs.source', `${s.id}: released spec needs source ids and first_refusal_ends_at`);
      else if (s.first_refusal_ends_at !== addDays(s.created_at, C.review.first_refusal_days)) rep.err('T-09', 'specs.first_refusal_ends_at', `${s.id}: must be released_at + 7 days`);
      if (s.status === 'first_refusal' !== (ms(s.first_refusal_ends_at) > NOW_MS)) rep.err('T-09', 'specs.status', `${s.id}: first_refusal status disagrees with the window`);
    }
    for (const l of s.licenses) { if (l.price_cents !== s.price_cents) rep.err('T-09', 'specs.licenses', `${s.id}: licence price differs`); if (l.ends_at && l.ends_at !== addDays(l.licensed_at, l.paid_ads_days)) rep.err('T-09', 'specs.licenses', `${s.id}: licence end != start + term`); }
    if (!(s.flow_band === 'A' ? s.flow_points >= 85 : s.flow_band === 'B' ? s.flow_points >= 70 && s.flow_points < 85 : s.flow_band === 'C' ? s.flow_points >= 55 && s.flow_points < 70 : s.flow_band === 'D' ? s.flow_points >= 40 && s.flow_points < 55 : s.flow_points < 40)) rep.err('T-09', 'specs.flow_band', `${s.id}: band ${s.flow_band} does not match ${s.flow_points} points`);
  }
}

// ── T-10 daily drops ─────────────────────────────────────────────────────────────────────────────────
function checkDrops(ds, rep) {
  const bounties = ds.byId('bounties');
  const today = dateOf(NOW_ISO);
  for (const d of ds.t('daily_drops')) {
    if (d.id !== `drop_${d.date}`) rep.err('T-10', 'daily_drops.id', `${d.id}: id must be drop_<date>`);
    if (d.release_at !== `${d.date}T${String(C.daily_drop.hour_utc).padStart(2, '0')}:00:00Z`) rep.err('T-10', 'daily_drops.release_at', `${d.id}: release at ${d.release_at}`);
    if (d.claim_window_ends_at !== addHours(d.release_at, C.daily_drop.claim_window_hours)) rep.err('T-10', 'daily_drops.claim_window_ends_at', `${d.id}: window end != release + 24 h`);
    let total = 0;
    let left = 0;
    for (const it of d.items) {
      total += it.spots_total;
      left += it.spots_left;
      if (it.spots_left !== it.spots_total - it.claims.length) rep.err('T-10', 'daily_drops.items', `${d.id}/${it.bounty_id}: spots_left ${it.spots_left} != total ${it.spots_total} - claims ${it.claims.length}`);
      const ids = new Set();
      for (const c of it.claims) {
        if (ids.has(c.creator_id)) rep.err('T-10', 'daily_drops.claims', `${d.id}/${it.bounty_id}: ${c.creator_id} claimed twice`);
        ids.add(c.creator_id);
        if (ms(c.claimed_at) < ms(d.release_at) || ms(c.claimed_at) > ms(d.claim_window_ends_at)) rep.err('T-10', 'daily_drops.claims', `${d.id}/${it.bounty_id}: claim outside the claim window`);
      }
      const b = bounties.get(it.bounty_id);
      if (!b) rep.err('T-10', 'daily_drops.items', `${d.id}: unknown bounty ${it.bounty_id}`);
      else if (ms(d.release_at) > NOW_MS && it.spots_total > spotsLeft({ remaining_cents: b.remaining_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate }) && it.spots_total > 1) rep.err('T-10', 'daily_drops.items', `${d.id}/${it.bounty_id}: ${it.spots_total} spots exceed the pool's real inventory`);
    }
    if (d.spots_total !== total || d.spots_left !== left || d.claims_total !== total - left) rep.err('T-10', 'daily_drops.spots', `${d.id}: totals do not add up (${d.spots_total}/${d.spots_left}/${d.claims_total} vs ${total}/${left})`);
    const upcoming = ms(d.release_at) > NOW_MS;
    const live = !upcoming && ms(d.claim_window_ends_at) > NOW_MS;
    const exp = upcoming ? 'upcoming' : left === 0 ? 'sold_out' : live ? 'live' : 'closed';
    if (d.status !== exp) rep.err('T-10', 'daily_drops.status', `${d.id}: status ${d.status}, expected ${exp}`);
    if (upcoming && d.claims_total !== 0) rep.err('T-10', 'daily_drops.claims_total', `${d.id}: an upcoming drop has no claims`);
    if (d.date === today && d.status !== 'upcoming') rep.err('T-10', 'daily_drops.status', `${d.id}: today's drop must be upcoming`);
  }
  const dates = ds.t('daily_drops').map((d) => d.date);
  if (new Set(dates).size !== dates.length) rep.err('T-10', 'daily_drops.date', 'two drops on one day');
  for (const s of ds.t('bounty_saves')) {
    if (s.stage === 'submitted' && !s.submission_id) rep.err('T-10', 'bounty_saves.submission_id', `${s.id}: submitted without a submission`);
    if (s.claimed_until && !s.drop_id) rep.err('T-10', 'bounty_saves.drop_id', `${s.id}: claimed_until without a drop`);
    if (s.drop_id) { const d = ds.byId('daily_drops').get(s.drop_id); const item = d?.items.find((i) => i.bounty_id === s.bounty_id); if (!item?.claims.some((c) => c.creator_id === s.creator_id)) rep.err('T-10', 'bounty_saves.drop_id', `${s.id}: no matching claim in ${s.drop_id}`); }
  }
}

// ── T-11 rights grants ───────────────────────────────────────────────────────────────────────────────
function checkRights(ds, rep) {
  const subs = ds.byId('submissions');
  const ads = ds.byId('ads');
  for (const g of ds.t('rights_grants')) {
    if (g.renewal_price_cents !== mulRate(g.base_fee_cents, g.renewal_pct_per_30d)) rep.err('T-11', 'rights_grants.renewal_price_cents', `${g.id}: ${g.renewal_price_cents} != round(base x pct)`);
    if (g.ai_likeness) rep.err('T-11', 'rights_grants.ai_likeness', `${g.id}: AI likeness is never granted in this build`);
    if (g.scope === 'organic') { if (g.ends_at) rep.err('T-11', 'rights_grants.ends_at', `${g.id}: organic posting has no end`); continue; }
    if (!g.ends_at) { if (!(g.status === 'pending_permission' || g.scope === 'partnership_permission')) rep.err('T-11', 'rights_grants.ends_at', `${g.id}: ${g.scope} grant without ends_at`); continue; }
    if (ms(g.ends_at) <= ms(g.starts_at)) rep.err('T-11', 'rights_grants.ends_at', `${g.id}: ends before it starts`);
    const left = (ms(g.ends_at) - NOW_MS) / DAY;
    const expected = C.rights.expiry_alert_days.filter((x) => left <= x);
    if (g.status !== 'revoked' && g.status !== 'pending_permission' && [...g.alerts_sent].sort((a, b) => a - b).join() !== [...expected].sort((a, b) => a - b).join()) rep.err('T-11', 'rights_grants.alerts_sent', `${g.id}: alerts ${g.alerts_sent.join(',')} but ${left.toFixed(1)} days left`);
    if (g.status === 'expired' && left > 0) rep.err('T-11', 'rights_grants.status', `${g.id}: expired but ${left.toFixed(1)} days left`);
    if (g.status === 'active' && left <= 30) rep.err('T-11', 'rights_grants.status', `${g.id}: active with ${left.toFixed(1)} days left`);
    if (g.status === 'expiring' && !(left > 0 && left <= 30)) rep.err('T-11', 'rights_grants.status', `${g.id}: expiring with ${left.toFixed(1)} days left`);
    if (g.scope === 'paid_ads') {
      const sub = subs.get(g.submission_id);
      const term = sub?.rights_card?.paid_ads_days;
      const renew = sum(g.renewals, (r) => r.days);
      if (term && !g.ad_id && g.ends_at !== addDays(g.starts_at, term + renew)) rep.err('T-11', 'rights_grants.ends_at', `${g.id}: ends_at != starts_at + ${term} days + ${renew} renewed`);
      if (term === 0) rep.err('T-11', 'rights_grants.scope', `${g.id}: paid-ad grant on a bounty with no paid usage`);
    }
    for (const r of g.renewals) { if (r.fee_cents !== g.renewal_price_cents * (r.days / 30)) rep.err('T-11', 'rights_grants.renewals', `${g.id}: renewal fee ${r.fee_cents} != price x months`); if (r.days % 30) rep.err('T-11', 'rights_grants.renewals', `${g.id}: renewal days must be multiples of 30`); }
    if (g.ad_id && g.scope === 'paid_ads') { const ad = ads.get(g.ad_id); if (ad?.rights_ends_at && ms(ad.rights_ends_at) > ms(g.ends_at) + 1000) rep.err('T-11', 'rights_grants.ad_id', `${g.id}: the ad runs past its licence (${ad.rights_ends_at} > ${g.ends_at})`); }
    if (['spark_code', 'partnership_permission'].includes(g.scope) && !g.ad_id) rep.err('T-11', 'rights_grants.ad_id', `${g.id}: a ${g.scope} grant belongs to a promoted post`);
  }
}

// ── T-13 library ─────────────────────────────────────────────────────────────────────────────────────
function checkLibrary(ds, rep) {
  const formats = ds.t('formats');
  if (formats.length) {
    const ids = new Set(formats.map((f) => f.id));
    for (const id of enumValues('FormatId')) if (!ids.has(id)) rep.err('T-13', 'formats', `missing format ${id}`);
    formats.forEach((f) => {
      f.beats.forEach((b, i) => { if (b.t_end_s <= b.t_start_s || (i && b.t_start_s < f.beats[i - 1].t_start_s)) rep.err('T-13', 'formats.beats', `${f.id}: beat ${b.beat} has a bad time range`); });
      if (f.beats[f.beats.length - 1].t_end_s > f.max_duration_s + 2) rep.err('T-13', 'formats.beats', `${f.id}: beats run past max_duration_s`);
      if (f.stats.trial_rate_by_category.length !== enumValues('Category').length) rep.err('T-13', 'formats.stats', `${f.id}: trial_rate_by_category needs one row per category`);
      if (!/\{app\}/.test(f.example_script) || !/\{feature\}/.test(f.example_script)) rep.err('T-13', 'formats.example_script', `${f.id}: script needs {app} and {feature} slots`);
      if (/\{(hook|noun|activity|pain|outcome|days|cta)\}/.test(f.example_script)) rep.err('T-13', 'formats.example_script', `${f.id}: script has an unfilled slot other than {app} and {feature}`);
    });
    if (formats.filter((f) => f.mvp).length !== 6) rep.err('T-13', 'formats.mvp', 'exactly the first six formats are mvp');
  }
  const hooks = ds.t('hooks');
  if (hooks.length) {
    for (const t of enumValues('HookType')) { const n = hooks.filter((h) => h.hook_type === t).length; if (n < 10) rep.err('T-13', 'hooks', `${t}: ${n} hooks, needs at least 10`); }
    for (const h of hooks) {
      if (h.examples.length < 3) rep.err('T-13', 'hooks.examples', `${h.id}: needs 3 or more category examples`);
      for (const e of h.examples) if (/\{[a-z_]+\}/.test(e.text)) rep.err('T-13', 'hooks.examples', `${h.id}: unfilled slot in "${e.text}"`);
      for (const s of h.fill_slots) if (!h.template.includes(`{${s}}`)) rep.err('T-13', 'hooks.fill_slots', `${h.id}: slot ${s} is not in the template`);
    }
  }
  const lessons = ds.t('lessons');
  if (lessons.length) {
    if (lessons.length !== 10) rep.err('T-13', 'lessons', `${lessons.length} lessons, needs exactly 10`);
    const progress = ds.t('lesson_progress');
    for (const l of lessons) {
      if (l.quiz.length !== 3) rep.err('T-13', 'lessons.quiz', `${l.id}: ${l.quiz.length} questions, needs 3`);
      l.quiz.forEach((q) => { if (q.answer_index < 0 || q.answer_index >= q.options.length) rep.err('T-13', 'lessons.quiz', `${l.id}: answer_index out of range`); });
      if (l.read_minutes > 5) rep.err('T-13', 'lessons.read_minutes', `${l.id}: ${l.read_minutes} minutes`);
      const words = l.blocks.reduce((n, b) => n + b.body.split(/\s+/).length + (b.title?.split(/\s+/).length ?? 0), 0);
      if (words > 700) rep.err('T-13', 'lessons.blocks', `${l.id}: ${words} words is too long for 5 minutes`);
      const done = progress.filter((p) => p.lesson_id === l.id && p.status === 'completed');
      if (l.completions !== done.length) rep.err('E-01', 'lessons.completions', `${l.id}: completions ${l.completions} != ${done.length} completed rows`);
    }
  }
}

// ── E-01 academy and creator-level alignment ─────────────────────────────────────────────────────────
function checkAcademy(ds, rep) {
  const prog = ds.t('lesson_progress');
  const reps = ds.byId('creator_reputation');
  const byCreator = group(prog.filter((p) => p.status === 'completed'), (p) => p.creator_id);
  const creators = ds.byId('creators');
  const seen = new Set();
  for (const p of prog) {
    const k = `${p.creator_id}|${p.lesson_id}`;
    if (seen.has(k)) rep.err('E-01', 'lesson_progress', `${p.creator_id} has two rows for ${p.lesson_id}`);
    seen.add(k);
    if ((p.status === 'completed') !== Boolean(p.completed_at) || (p.status === 'completed') !== p.badge_awarded) rep.err('E-01', 'lesson_progress', `${p.id}: completed_at and badge_awarded must follow the status`);
    if (p.status === 'completed' && (p.quiz_score ?? 0) < 0.66) rep.err('E-01', 'lesson_progress.quiz_score', `${p.id}: completed with quiz score ${p.quiz_score}`);
  }
  for (const c of creators.values()) {
    const n = byCreator.get(c.id)?.length ?? 0;
    const rep_ = [...reps.values()].find((r) => r.creator_id === c.id);
    if (rep_ && rep_.academy_bonus_points > 0 && Math.min(5, 0.5 * n) !== rep_.academy_bonus_points) rep.warn('E-01', 'lesson_progress', `${c.id}: ${n} completed lessons vs academy bonus ${rep_.academy_bonus_points}`);
    if ((c.badges ?? []).includes('academy_graduate') && n < 10) rep.warn('E-01', 'lesson_progress', `${c.id}: academy_graduate badge with ${n} of 10 lessons`);
  }
}

// ── E-02 Tax Desk ────────────────────────────────────────────────────────────────────────────────────
function checkTax(ds, rep) {
  const earn = group(ds.t('ledger').filter((r) => r.account?.startsWith('creator:') && r.amount_cents > 0 && ['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral'].includes(r.entry_type) && (r.status === 'cleared' || r.status === 'paid')), (r) => r.creator_id ?? r.account.slice(8));
  const creators = ds.byId('creators');
  const profiles = new Set();
  for (const t of ds.t('tax_profiles')) {
    profiles.add(t.creator_id);
    const rows = earn.get(t.creator_id) ?? [];
    if (ds.t('ledger').length) {
      if (t.ytd_cleared_cents !== sum(rows, (r) => r.amount_cents)) rep.err('E-02', 'tax_profiles.ytd_cleared_cents', `${t.id}: ${t.ytd_cleared_cents} != ledger ${sum(rows, (r) => r.amount_cents)}`);
      if (t.ytd_paid_cents !== sum(rows.filter((r) => r.status === 'paid'), (r) => r.amount_cents)) rep.err('E-02', 'tax_profiles.ytd_paid_cents', `${t.id}: paid total does not match the ledger`);
    }
    if (t.set_aside_cents !== Math.round(t.ytd_cleared_cents * t.set_aside_rate)) rep.err('E-02', 'tax_profiles.set_aside_cents', `${t.id}: set-aside != round(ytd x rate)`);
    if (!near(t.threshold_progress, Math.min(1, t.ytd_paid_cents / t.threshold_cents), 0.0051)) rep.err('E-02', 'tax_profiles.threshold_progress', `${t.id}: ${t.threshold_progress} != paid / threshold`);
    const us = creators.get(t.creator_id)?.country === 'US';
    if (t.form_1099_required !== (us && t.ytd_paid_cents >= t.threshold_cents)) rep.err('E-02', 'tax_profiles.form_1099_required', `${t.id}: 1099 flag disagrees with the threshold`);
    if (t.form && t.form !== (us ? 'w9' : 'w8ben')) rep.err('E-02', 'tax_profiles.form', `${t.id}: ${t.form} for a ${us ? 'US' : 'non-US'} creator`);
    if (t.tin_last4 && !/^\d{4}$/.test(t.tin_last4)) rep.err('E-02', 'tax_profiles.tin_last4', `${t.id}: only the last four digits are ever stored`);
    if (t.status === 'verified' && !(t.verified_at && t.submitted_at)) rep.err('E-02', 'tax_profiles.status', `${t.id}: verified without timestamps`);
    if (t.status === 'requested' && (t.form || t.legal_name)) rep.err('E-02', 'tax_profiles.status', `${t.id}: requested profiles have no form yet`);
    if (ds.byId('creators').size && !creators.has(t.creator_id)) rep.err('E-02', 'tax_profiles.creator_id', `${t.id}: unknown creator`);
  }
  for (const d of ds.t('tax_docs')) {
    if (!profiles.has(d.creator_id)) rep.err('E-02', 'tax_docs.creator_id', `${d.id}: no profile for ${d.creator_id}`);
    if (d.kind === 'form_1099_nec' && d.status === 'issued') rep.err('E-02', 'tax_docs.status', `${d.id}: no 1099-NEC is issued while tax year ${C.tax.tax_year} is in progress`);
    if (d.kind === 'form_1099_nec' && !(d.amount_cents >= C.tax.form_1099_nec_threshold_cents)) rep.err('E-02', 'tax_docs.amount_cents', `${d.id}: a 1099-NEC draft needs at least the threshold`);
  }
}

// ── E-03 compliance and fraud ────────────────────────────────────────────────────────────────────────
function checkComplianceFraud(ds, rep) {
  const posts = ds.byId('posts');
  const cc = ds.t('compliance_checks');
  const types = enumValues('ComplianceCheckType');
  const per = new Map();
  for (const a of cc) {
    per.set(a.post_id, (per.get(a.post_id) ?? 0) + 1);
    if (a.checks.length !== types.length || types.some((t) => !a.checks.some((c) => c.type === t))) rep.err('E-03', 'compliance_checks.checks', `${a.id}: needs one item per check type`);
    const overall = a.checks.some((c) => c.result === 'fail') ? 'fail' : a.checks.some((c) => c.result === 'warn') ? 'warn' : 'pass';
    if (a.overall !== overall) rep.err('E-03', 'compliance_checks.overall', `${a.id}: overall ${a.overall} but checks say ${overall}`);
    const blocking = a.overall === 'fail' && !a.fixed_at && !a.waived_by_member_id;
    if (a.blocks_settlement !== blocking) rep.err('E-03', 'compliance_checks.blocks_settlement', `${a.id}: blocks_settlement ${a.blocks_settlement} but fail/fixed/waived says ${blocking}`);
    if (a.waived_by_member_id && !a.waive_reason) rep.err('E-03', 'compliance_checks.waive_reason', `${a.id}: a waiver needs a logged reason`);
    const p = posts.get(a.post_id);
    if (p && ms(a.checked_at) < ms(p.posted_at)) rep.err('E-03', 'compliance_checks.checked_at', `${a.id}: checked before the post existed`);
    if (a.fixed_at && ms(a.fixed_at) < ms(a.checked_at)) rep.err('E-03', 'compliance_checks.fixed_at', `${a.id}: fixed before it was checked`);
  }
  if (posts.size && cc.length) {
    for (const p of posts.values()) if (!per.has(p.id)) rep.err('E-03', 'compliance_checks', `${p.id} has no compliance audit`);
    for (const p of posts.values()) if (p.status === 'held' && p.hold_reason === 'compliance_fail' && !cc.some((a) => a.post_id === p.id && a.blocks_settlement)) rep.err('E-03', 'compliance_checks', `${p.id}: held for compliance without a blocking audit`);
  }
  // fraud flags
  const flags = ds.t('fraud_flags');
  const byPost = new Map(flags.map((f) => [f.post_id, f]));
  for (const f of flags) {
    const p = posts.get(f.post_id);
    if (p && (f.score !== p.fraud.score || f.band !== fraudBand(f.score))) rep.err('E-03', 'fraud_flags.score', `${f.id}: score or band differs from the post (${p.fraud.score})`);
    if (f.score < C.fraud.review_threshold) rep.err('E-03', 'fraud_flags.score', `${f.id}: only scores of ${C.fraud.review_threshold}+ are queued`);
    for (const k of ['views', 'expected_low', 'expected_high']) if (f.curve[k].length !== 72) rep.err('E-03', 'fraud_flags.curve', `${f.id}: ${k} has ${f.curve[k].length} values`);
    if (f.curve.views.some((v, i) => v < 0 || (f.curve.expected_low[i] > f.curve.expected_high[i]))) rep.err('E-03', 'fraud_flags.curve', `${f.id}: invalid envelope`);
    if (f.sla_due_at !== addHours(f.opened_at, C.fraud.review_sla_hours)) rep.err('E-03', 'fraud_flags.sla_due_at', `${f.id}: sla_due_at != opened + 24 h`);
    if (['cleared', 'confirmed'].includes(f.status) && !(f.reviewed_at && f.reviewed_by_user_id && f.decision_note)) rep.err('E-03', 'fraud_flags.reviewed_at', `${f.id}: a resolved flag needs reviewer, time and note`);
    if (['open', 'monitoring'].includes(f.status) && f.reviewed_at) rep.err('E-03', 'fraud_flags.reviewed_at', `${f.id}: ${f.status} flags are not reviewed yet`);
    if (f.status === 'confirmed' && !(f.invalid_views > 0)) rep.err('E-03', 'fraud_flags.invalid_views', `${f.id}: confirmed flag without reversed views`);
    if (p && f.status === 'confirmed' && !['clawed_back', 'removed'].includes(p.status)) rep.warn('E-03', 'fraud_flags.status', `${f.id}: confirmed but the post is ${p.status}`);
    if (p && ['open', 'monitoring'].includes(f.status) && ['paid'].includes(p.status)) rep.err('E-03', 'fraud_flags.status', `${f.id}: ${f.status} flag on a paid post`);
    if (f.signals.some((s) => s.signal === 'duplicate_hash') && !f.duplicate_of_post_id) rep.warn('E-03', 'fraud_flags.duplicate_of_post_id', `${f.id}: duplicate signal without the original post`);
  }
  for (const p of posts.values()) if (p.fraud.score >= C.fraud.review_threshold && !byPost.has(p.id)) rep.err('E-03', 'fraud_flags', `${p.id}: fraud score ${p.fraud.score} without a flag`);
}

// ── E-04 growth: crews, tournaments, referrals, proofs ───────────────────────────────────────────────
function checkGrowth(ds, rep) {
  const creators = ds.byId('creators');
  const members = group(ds.t('crew_members'), (m) => m.crew_id);
  const inCrew = new Set();
  for (const c of ds.t('crews')) {
    const ms_ = members.get(c.id) ?? [];
    if (c.member_count !== ms_.length) rep.err('E-04', 'crews.member_count', `${c.id}: ${c.member_count} != ${ms_.length} members`);
    if (ms_.length < C.crews.min_members || ms_.length > C.crews.max_members) rep.err('E-04', 'crews.member_count', `${c.id}: ${ms_.length} members outside 3 to 20`);
    const lead = ms_.find((m) => m.role === 'lead');
    if (!lead || lead.creator_id !== c.lead_creator_id) rep.err('E-04', 'crews.lead_creator_id', `${c.id}: lead row missing or different`);
    const tier = creators.get(c.lead_creator_id)?.tier;
    if (tier && !['gold', 'platinum', 'elite'].includes(tier)) rep.err('E-04', 'crews.lead_creator_id', `${c.id}: lead is ${tier}, crews are led by Gold or above`);
    if (c.week_cleared_cents !== sum(ms_, (m) => m.week_cleared_cents)) rep.err('E-04', 'crews.week_cleared_cents', `${c.id}: not the sum of its members`);
    if (c.lifetime_cleared_cents !== sum(ms_, (m) => m.lifetime_cleared_cents)) rep.err('E-04', 'crews.lifetime_cleared_cents', `${c.id}: not the sum of its members`);
    for (const m of ms_) { if (inCrew.has(m.creator_id)) rep.err('E-04', 'crew_members', `${m.creator_id} is in two crews`); inCrew.add(m.creator_id); }
  }
  const ranks = ds.t('crews').map((c) => c.week_rank).sort((a, b) => a - b);
  if (ranks.some((r, i) => r !== i + 1)) rep.err('E-04', 'crews.week_rank', 'week_rank must be 1..n without gaps');
  // tournaments
  const entries = group(ds.t('tournament_entries'), (e) => e.tournament_id);
  const entryById = ds.byId('tournament_entries');
  for (const t of ds.t('tournaments')) {
    const es = entries.get(t.id) ?? [];
    if (t.entries_count !== es.length) rep.err('E-04', 'tournaments.entries_count', `${t.id}: ${t.entries_count} != ${es.length} entries`);
    if (t.prize_pool_cents !== sum(t.prizes, (p) => p.amount_cents) || t.prize_pool_cents < C.tournaments.min_prize_pool_cents) rep.err('E-04', 'tournaments.prize_pool_cents', `${t.id}: pool must equal the prizes and be at least $250`);
    if (new Set(es.map((e) => e.seed)).size !== es.length) rep.err('E-04', 'tournament_entries.seed', `${t.id}: duplicate seeds`);
    if (new Set(es.map((e) => e.creator_id)).size !== es.length) rep.err('E-04', 'tournament_entries.creator_id', `${t.id}: a creator entered twice`);
    for (const e of es) {
      if (ms(e.entered_at) < ms(t.entries_open_at)) rep.err('E-04', 'tournament_entries.entered_at', `${e.id}: entered before entries opened`);
      if (e.status === 'won' && t.status !== 'complete') rep.err('E-04', 'tournament_entries.status', `${e.id}: a winner in a ${t.status} tournament`);
      if (e.prize_cents && t.status !== 'complete') rep.err('E-04', 'tournament_entries.prize_cents', `${e.id}: prize before completion`);
    }
    if (t.status === 'complete') {
      const winners = es.filter((e) => e.status === 'won');
      if (winners.length !== 1 || [...(t.winner_creator_ids ?? [])].join() !== winners.map((e) => e.creator_id).join()) rep.err('E-04', 'tournaments.winner_creator_ids', `${t.id}: complete tournaments have one winner listed`);
      const paid = sum(es, (e) => e.prize_cents ?? 0);
      if (paid !== t.prize_pool_cents) rep.err('E-04', 'tournament_entries.prize_cents', `${t.id}: prizes paid ${paid} != pool ${t.prize_pool_cents}`);
    }
    if (t.status === 'cancelled' && es.some((e) => e.status !== 'entered')) rep.err('E-04', 'tournament_entries.status', `${t.id}: cancelled tournaments never ran a round`);
    if (['announced', 'open'].includes(t.status) && t.rounds.some((r) => r.matchups.length)) rep.err('E-04', 'tournaments.rounds', `${t.id}: ${t.status} tournaments have no matchups yet`);
    if (t.format === 'leaderboard' && t.rounds.length) rep.err('E-04', 'tournaments.rounds', `${t.id}: leaderboard format has no rounds`);
    for (const r of t.rounds) for (const m of r.matchups) {
      const a = entryById.get(m.entry_a_id);
      const b = entryById.get(m.entry_b_id);
      if (!a || !b || a.tournament_id !== t.id || b.tournament_id !== t.id) rep.err('E-04', 'tournaments.rounds', `${t.id}: ${m.id} points outside its tournament`);
      if (m.winner_entry_id && ![m.entry_a_id, m.entry_b_id].includes(m.winner_entry_id)) rep.err('E-04', 'tournaments.rounds', `${t.id}: ${m.id} winner is not a participant`);
      if (m.winner_entry_id && m.score_a !== undefined && (m.winner_entry_id === m.entry_a_id) !== (m.score_a >= m.score_b)) rep.err('E-04', 'tournaments.rounds', `${t.id}: ${m.id} winner does not have the higher score`);
    }
    if (t.status === 'live') { const live = t.rounds.find((r) => ms(r.starts_at) <= NOW_MS && ms(r.ends_at) > NOW_MS); if (!live) rep.err('E-04', 'tournaments.rounds', `${t.id}: live tournament without a live round`); }
  }
  // referrals
  const refCreators = ds.byId('creators');
  for (const r of ds.t('referrals')) {
    if (r.kind === 'creator' && (r.reward_rate !== C.referrals.creator_share_rate || r.reward_cap_cents !== C.referrals.creator_share_cap_per_referee_cents)) rep.err('E-04', 'referrals.reward_rate', `${r.id}: creator referral terms differ from CONSTANTS`);
    if (r.kind !== 'creator' && r.reward_rate !== C.referrals.brand_partner_share_rate) rep.err('E-04', 'referrals.reward_rate', `${r.id}: partner share is ${C.referrals.brand_partner_share_rate}`);
    if (r.reward_earned_cents > r.reward_cap_cents) rep.err('E-04', 'referrals.reward_earned_cents', `${r.id}: reward above its cap`);
    if (['earning', 'complete', 'first_dollar'].includes(r.status) && !r.first_dollar_at) rep.err('E-04', 'referrals.first_dollar_at', `${r.id}: ${r.status} without first_dollar_at`);
    if (r.first_dollar_at && r.reward_window_ends_at !== (r.kind === 'creator' ? addDays(r.first_dollar_at, C.referrals.creator_share_days) : addDays(r.first_dollar_at, 365))) rep.err('E-04', 'referrals.reward_window_ends_at', `${r.id}: window end != first dollar + term`);
    if (r.referrer_creator_id && r.referee_creator_id) { const ref = refCreators.get(r.referee_creator_id); if (ref && ref.referred_by_creator_id !== r.referrer_creator_id) rep.err('E-04', 'referrals.referee_creator_id', `${r.id}: the referee's referred_by_creator_id differs`); }
    if (r.referrer_creator_id && r.referrer_creator_id === r.referee_creator_id) rep.err('E-04', 'referrals', `${r.id}: self-referral`);
    if (r.status === 'invited' && (r.joined_at || r.referee_creator_id || r.referee_brand_id)) rep.err('E-04', 'referrals.status', `${r.id}: invited but already joined`);
  }
  // proofs and wrapped
  const proofs = ds.byId('proofs');
  const payouts = ds.byId('payouts');
  const ledger = ds.t('ledger');
  for (const p of ds.t('proofs')) {
    if (!/^prf_[a-z0-9]{8}$/.test(p.id)) rep.err('E-04', 'proofs.id', `${p.id}: not prf_ + 8 lowercase alphanumerics`);
    if (!/^[0-9a-f]{12}$/.test(p.ledger_hash)) rep.err('E-04', 'proofs.ledger_hash', `${p.id}: ledger_hash is 12 hex characters`);
    if (p.typical_p25_cents > p.typical_median_cents || p.typical_median_cents > p.typical_p75_cents) rep.err('E-04', 'proofs.typical', `${p.id}: p25 <= median <= p75 fails`);
    if (p.anonymous !== p.handle.startsWith('A ')) rep.err('E-04', 'proofs.anonymous', `${p.id}: anonymous flag and handle disagree`);
    if (p.payout_id) { const pay = payouts.get(p.payout_id); if (pay && (pay.proof_id !== p.id || pay.gross_cents !== p.amount_cents)) rep.err('E-04', 'proofs.payout_id', `${p.id}: differs from payout ${p.payout_id}`); }
  }
  for (const pay of ds.t('payouts')) if (pay.proof_id && ds.t('proofs').length && !proofs.has(pay.proof_id) && ds.obj('ticker')?.events?.some((e) => e.proof_id === pay.proof_id)) rep.err('E-04', 'proofs', `ticker proof ${pay.proof_id} (payout ${pay.id}) has no proofs row`);
  for (const e of ds.obj('ticker')?.events ?? []) if (e.proof_id && !proofs.has(e.proof_id)) rep.err('E-04', 'proofs', `ticker event ${e.id} points at a proof that does not exist (${e.proof_id})`);
  const rev = ds.t('proofs').filter((p) => p.revoked).length;
  const anon = ds.t('proofs').filter((p) => p.anonymous).length;
  if (ds.t('proofs').length && (rev < 6 || rev > 10)) rep.warn('E-04', 'proofs.revoked', `${rev} revoked proofs (catalogue says 8)`);
  if (ds.t('proofs').length && (anon < 9 || anon > 15)) rep.warn('E-04', 'proofs.anonymous', `${anon} anonymised proofs (catalogue says 12)`);
  for (const w of ds.t('wrapped')) {
    if (w.cards.length < 8 || w.cards.length > 10) rep.err('E-04', 'wrapped.cards', `${w.id}: ${w.cards.length} cards, needs 8 to 10`);
    if (!w.cards.some((c) => c.kind === 'typical')) rep.err('E-04', 'wrapped.cards', `${w.id}: the typical-creator card is always included`);
    if (w.proof_id && !proofs.has(w.proof_id)) rep.err('E-04', 'wrapped.proof_id', `${w.id}: proof ${w.proof_id} does not exist`);
    if (ledger.length) {
      const got = sum(ledger.filter((r) => r.account === `creator:${w.creator_id}` && r.amount_cents > 0 && ['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral'].includes(r.entry_type) && (r.status === 'cleared' || r.status === 'paid') && ms(r.cleared_at ?? r.posted_at) >= ms(`${w.period_start}T00:00:00Z`) && ms(r.cleared_at ?? r.posted_at) < ms(`${w.period_end}T00:00:00Z`) + DAY), (r) => r.amount_cents);
      if (got !== w.total_cleared_cents) rep.err('E-04', 'wrapped.total_cleared_cents', `${w.id}: ${w.total_cleared_cents} != ledger ${got}`);
    }
  }
  // tier history stats meet the tier they promote to
  for (const e of ds.t('tier_history')) {
    if (['promoted', 'granted', 'carry_over_applied'].includes(e.kind)) {
      const t = C.tiers.thresholds[e.to_tier];
      if (e.stats.lifetime_cleared_cents < t.lifetime_cleared_cents || e.stats.approved_count < t.approved_count || e.stats.approval_rate < t.approval_rate_min || e.stats.reliability_score < t.reliability_min) rep.err('E-04', 'tier_history.stats', `${e.id}: stats do not meet ${e.to_tier}`);
      if (tierFor({ ...e.stats, elite_reviewed: true }) !== e.to_tier && e.kind !== 'carry_over_applied' && C.tiers.order.indexOf(tierFor({ ...e.stats, elite_reviewed: true })) < C.tiers.order.indexOf(e.to_tier)) rep.err('E-04', 'tier_history.stats', `${e.id}: stats only earn ${tierFor({ ...e.stats, elite_reviewed: true })}`);
    }
    if (e.from_tier && e.kind === 'promoted' && C.tiers.order.indexOf(e.to_tier) !== C.tiers.order.indexOf(e.from_tier) + 1) rep.err('E-04', 'tier_history', `${e.id}: promotions climb one tier at a time`);
  }
  const lastTier = new Map();
  for (const e of ds.t('tier_history')) if (['promoted', 'granted', 'carry_over_applied'].includes(e.kind)) lastTier.set(e.creator_id, e);
  for (const [cid, e] of lastTier) { const c = creators.get(cid); if (c && c.tier_basis === 'earned' && e.to_tier !== c.tier) rep.warn('E-04', 'tier_history', `${cid}: history ends at ${e.to_tier} but the creator is ${c.tier}`); if (c && e.at !== c.tier_since && c.tier_basis === 'earned' && !c.carry_over) rep.warn('E-04', 'tier_history', `${cid}: last promotion ${e.at} != tier_since ${c.tier_since}`); }
}

// ── E-05 platform and attribution ────────────────────────────────────────────────────────────────────
function checkPlatform(ds, rep) {
  const conv = ds.byId('conversions');
  const links = ds.byId('attribution_links');
  const keys = new Map();
  for (const e of ds.t('revenuecat_events')) {
    if (e.match_status === 'matched') {
      const c = e.matched_conversion_id && conv.get(e.matched_conversion_id);
      if (ds.t('conversions').length && (!c || !['link', 'code'].includes(c.source))) rep.err('E-05', 'revenuecat_events.matched_conversion_id', `${e.id}: a matched event must point at a link or code conversion`);
      if (e.matched_link_id && ds.t('attribution_links').length && !links.has(e.matched_link_id)) rep.err('E-05', 'revenuecat_events.matched_link_id', `${e.id}: unknown link`);
      if (!e.matched_creator_id) rep.err('E-05', 'revenuecat_events.matched_creator_id', `${e.id}: matched without a creator`);
    } else if (e.matched_conversion_id || e.matched_link_id || e.matched_creator_id) rep.err('E-05', 'revenuecat_events.match_status', `${e.id}: ${e.match_status} events carry no match ids`);
    if (e.match_status === 'ignored' && e.environment !== 'sandbox') rep.err('E-05', 'revenuecat_events.environment', `${e.id}: ignored events are sandbox tests`);
    if (e.event_type === 'initial_purchase' && e.period_type === 'trial' && e.price_cents !== 0) rep.err('E-05', 'revenuecat_events.price_cents', `${e.id}: a trial costs nothing`);
    if (e.is_trial_conversion && (e.event_type !== 'renewal' || e.price_cents <= 0)) rep.err('E-05', 'revenuecat_events.is_trial_conversion', `${e.id}: a trial conversion is a paid renewal`);
    if (e.expiration_at && ms(e.expiration_at) < ms(e.purchased_at)) rep.err('E-05', 'revenuecat_events.expiration_at', `${e.id}: expires before purchase`);
    if (ms(e.received_at) < ms(e.purchased_at)) rep.err('E-05', 'revenuecat_events.received_at', `${e.id}: received before it happened`);
    const k = keys.get(e.idempotency_key);
    if (k) { if (e.match_status !== 'duplicate' && k.match_status !== 'duplicate') rep.err('E-05', 'revenuecat_events.idempotency_key', `${e.id}: key shared with ${k.id} but neither is a duplicate`); }
    else keys.set(e.idempotency_key, e);
    if (e.match_status === 'duplicate' && !keys.get(e.idempotency_key)) rep.err('E-05', 'revenuecat_events.match_status', `${e.id}: a duplicate without its original`);
  }
  const dupOrig = new Set(ds.t('revenuecat_events').filter((e) => e.match_status !== 'duplicate').map((e) => e.idempotency_key));
  for (const e of ds.t('revenuecat_events')) if (e.match_status === 'duplicate' && !dupOrig.has(e.idempotency_key)) rep.err('E-05', 'revenuecat_events.match_status', `${e.id}: duplicate of nothing`);
  // offer codes
  for (const o of ds.t('offer_code_pool')) {
    if (o.status === 'assigned' && !(o.assigned_creator_id && o.assigned_link_id)) rep.err('E-05', 'offer_code_pool.status', `${o.id}: assigned without a creator and link`);
    if (o.status !== 'assigned' && (o.assigned_creator_id || o.assigned_link_id)) rep.err('E-05', 'offer_code_pool.status', `${o.id}: ${o.status} code still points at a creator`);
    if (o.status === 'exhausted' && o.redemptions < o.max_redemptions) rep.err('E-05', 'offer_code_pool.redemptions', `${o.id}: exhausted below the redemption cap`);
    if (o.redemptions > o.max_redemptions) rep.err('E-05', 'offer_code_pool.redemptions', `${o.id}: over the cap`);
    if (ms(o.valid_until) <= ms(o.valid_from)) rep.err('E-05', 'offer_code_pool.valid_until', `${o.id}: valid_until before valid_from`);
    if (o.status === 'expired' && ms(o.valid_until) > NOW_MS) rep.err('E-05', 'offer_code_pool.status', `${o.id}: expired but still valid`);
  }
  // keys and webhooks
  for (const k of ds.t('api_keys')) {
    if (!k.prefix.startsWith(k.mode === 'live' ? 'fd_live_' : 'fd_test_')) rep.err('E-05', 'api_keys.prefix', `${k.id}: prefix does not match mode`);
    if (k.last4.length !== 4) rep.err('E-05', 'api_keys.last4', `${k.id}: last4 is four characters`);
    if (k.revoked_at && k.last_used_at && ms(k.last_used_at) > ms(k.revoked_at)) rep.err('E-05', 'api_keys.last_used_at', `${k.id}: used after revocation`);
    const brand = ds.byId('brands').get(k.brand_id);
    if (brand && brand.plan === 'free') rep.err('E-05', 'api_keys.brand_id', `${k.id}: the API is a Pro and Scale feature`);
  }
  for (const w of ds.t('webhooks')) {
    if (w.deliveries.length > 20) rep.err('E-05', 'webhooks.deliveries', `${w.id}: keeps the last 20 deliveries`);
    for (let i = 1; i < w.deliveries.length; i++) if (ms(w.deliveries[i].at) > ms(w.deliveries[i - 1].at)) rep.err('E-05', 'webhooks.deliveries', `${w.id}: deliveries are newest first`);
    if (!/^https:\/\/[a-z0-9.-]+\.example\//.test(w.url)) rep.err('E-05', 'webhooks.url', `${w.id}: webhook hosts end in .example`);
    if (w.status === 'failing' && !(w.failure_count > 0)) rep.err('E-05', 'webhooks.failure_count', `${w.id}: failing without failures`);
  }
  // rules, test plans, fatigue
  for (const r of ds.t('auto_approve_rules')) {
    if (r.status !== 'draft' && !r.dry_run) rep.err('E-05', 'auto_approve_rules.dry_run', `${r.id}: a dry run on the last ${C.auto_approve.dry_run_sample} is required before ${r.status}`);
    if (r.dry_run && r.dry_run.would_approve + r.dry_run.would_send_to_human + r.dry_run.would_block !== r.dry_run.sample_size) rep.err('E-05', 'auto_approve_rules.dry_run', `${r.id}: dry-run outcomes do not add up to the sample`);
    if (r.guardrails.spot_check_ratio < C.auto_approve.spot_check_ratio) rep.err('E-05', 'auto_approve_rules.guardrails', `${r.id}: spot checks below 10%`);
    if (r.status === 'killed' && !(r.killed_at && r.kill_reason)) rep.err('E-05', 'auto_approve_rules.killed_at', `${r.id}: killed without time and reason`);
    if (r.status === 'active' && !r.enabled_at) rep.err('E-05', 'auto_approve_rules.enabled_at', `${r.id}: active without enabled_at`);
    for (let i = 1; i < r.audit.length; i++) if (ms(r.audit[i].at) < ms(r.audit[i - 1].at)) rep.err('E-05', 'auto_approve_rules.audit', `${r.id}: audit log not oldest first`);
    const brand = ds.byId('brands').get(r.brand_id);
    if (brand && brand.plan === 'free') rep.err('E-05', 'auto_approve_rules.brand_id', `${r.id}: guarded auto-approve is a Pro feature`);
  }
  for (const t of ds.t('test_plans')) {
    const cells = t.hooks.length * t.bodies.length * t.ctas.length;
    if (t.cells.length > cells) rep.err('E-05', 'test_plans.cells', `${t.id}: ${t.cells.length} cells > hooks x bodies x ctas ${cells}`);
    for (const c of t.cells) if (['measured', 'live'].includes(c.status) && !c.post_id) rep.err('E-05', 'test_plans.cells', `${t.id}/${c.id}: ${c.status} without a post`);
    for (const c of t.cells) if (c.status === 'measured' && !c.results) rep.err('E-05', 'test_plans.cells', `${t.id}/${c.id}: measured without results`);
    if (t.winner_cell_id && !t.cells.some((c) => c.id === t.winner_cell_id)) rep.err('E-05', 'test_plans.winner_cell_id', `${t.id}: winner is not a cell`);
    const posts = t.cells.map((c) => c.post_id).filter(Boolean);
    if (new Set(posts).size !== posts.length) rep.err('E-05', 'test_plans.cells', `${t.id}: a post stands for two cells`);
  }
  for (const f of ds.t('fatigue_alerts')) {
    if (!near(f.drop_ratio, 1 - f.current_value / f.peak_value, 0.002)) rep.err('E-05', 'fatigue_alerts.drop_ratio', `${f.id}: drop_ratio != 1 - current / peak`);
    if (f.drop_ratio < 0.3 - 1e-9) rep.err('E-05', 'fatigue_alerts.drop_ratio', `${f.id}: alerts fire at a 30% drop or more`);
    if (f.status !== 'open' && !f.acknowledged_at) rep.err('E-05', 'fatigue_alerts.acknowledged_at', `${f.id}: ${f.status} without acknowledged_at`);
  }
  for (const a of ds.t('audit_reports')) {
    if (a.hooks.length !== 10) rep.err('E-05', 'audit_reports.hooks', `${a.id}: ${a.hooks.length} hooks, needs exactly 10`);
    if (a.price_curve.length !== 6) rep.err('E-05', 'audit_reports.price_curve', `${a.id}: ${a.price_curve.length} points, needs 6`);
    for (const b of [a.predicted_cpm_cents, a.expected_views_per_post, a.expected_cost_per_trial_cents]) if (!(b.low <= b.median && b.median <= b.high)) rep.err('E-05', 'audit_reports', `${a.id}: a band is not ordered low <= median <= high`);
    if (a.price_curve.some((p, i) => i && (p.cpm_cents <= a.price_curve[i - 1].cpm_cents || p.fill_hours_p50 > a.price_curve[i - 1].fill_hours_p50 + 1e-9))) rep.err('E-05', 'audit_reports.price_curve', `${a.id}: higher prices fill faster`);
  }
  const act = ds.t('activity_log');
  for (let i = 1; i < act.length; i++) if (ms(act[i].at) < ms(act[i - 1].at)) { rep.err('E-05', 'activity_log.at', `${act[i].id}: not ordered by time`); break; }
  // an agency workspace member may act inside a client workspace the agency manages (brands.agency_id)
  for (const a of act) if (a.actor_member_id) { const m = ds.byId('brand_members').get(a.actor_member_id); if (m && m.brand_id !== a.brand_id && ds.byId('brands').get(a.brand_id)?.agency_id !== m.brand_id) rep.err('E-05', 'activity_log.actor_member_id', `${a.id}: actor belongs to another workspace`); }
  for (const i of ds.t('integrations')) {
    if (i.status === 'disconnected' && i.last_sync_at) rep.err('E-05', 'integrations.status', `${i.id}: disconnected integrations do not sync`);
    if (i.status === 'connected' && !(i.connected_at && i.last_sync_at)) rep.err('E-05', 'integrations.status', `${i.id}: connected without connected_at and last_sync_at`);
  }
  const unmatchedLumi = ds.t('revenuecat_events').filter((e) => e.app_id === WORLD.PERSONAS.brand.app_id && e.match_status === 'unmatched').length;
  if (ds.t('revenuecat_events').length && unmatchedLumi !== 1) rep.warn('E-05', 'revenuecat_events', `Lumi has ${unmatchedLumi} unmatched events (scenario: one)`);
}

// ── E-07 trust queues (SLA arithmetic) ───────────────────────────────────────────────────────────────
function checkTrustQueues(ds, rep) {
  for (const d of ds.t('disputes')) {
    if (d.reply_due_at !== addHours(d.opened_at, C.disputes.reply_sla_hours)) rep.err('E-07', 'disputes.reply_due_at', `${d.id}: reply_due_at != opened + 24 h`);
    const due = d.kind === 'rejection_appeal' ? addHours(d.opened_at, C.review.appeal_decision_sla_hours) : addDays(d.opened_at, C.disputes.resolution_sla_days);
    if (d.resolution_due_at !== due) rep.err('E-07', 'disputes.resolution_due_at', `${d.id}: ${d.resolution_due_at} != ${due}`);
    if (d.first_reply_at && ms(d.first_reply_at) - ms(d.opened_at) > C.disputes.reply_sla_hours * 3_600_000 && d.status === 'resolved') rep.warn('E-07', 'disputes.first_reply_at', `${d.id}: resolved with a reply later than 24 h`);
    if (d.status === 'resolved' && !(d.resolved_at && d.outcome && d.outcome_text)) rep.err('E-07', 'disputes.outcome', `${d.id}: resolved without time, outcome and text`);
    if (d.status !== 'resolved' && (d.outcome || d.resolved_at)) rep.err('E-07', 'disputes.outcome', `${d.id}: ${d.status} with an outcome`);
    if (d.kind === 'rejection_appeal' && !(d.submission_id && d.rejection_reason_code)) rep.err('E-07', 'disputes.submission_id', `${d.id}: an appeal needs the submission and the reason code`);
    if (d.events[0]?.action !== 'opened') rep.err('E-07', 'disputes.events', `${d.id}: the timeline starts with opened`);
    for (let i = 1; i < d.events.length; i++) if (ms(d.events[i].at) < ms(d.events[i - 1].at)) rep.err('E-07', 'disputes.events', `${d.id}: timeline out of order`);
    if (d.status === 'evidence_requested' && !d.events.some((e) => e.action === 'evidence_requested')) rep.err('E-07', 'disputes.events', `${d.id}: evidence_requested status without the event`);
    if (['view_count', 'flagged_botting'].includes(d.kind) && !(d.range_from && d.range_to)) rep.err('E-07', 'disputes.range_from', `${d.id}: ${d.kind} covers a snapshot range`);
    if (d.updated_at !== (d.resolved_at ?? d.events[d.events.length - 1].at)) rep.warn('E-07', 'disputes.updated_at', `${d.id}: updated_at is not the last activity`);
  }
  const caseIds = new Set();
  for (const s of ds.t('scam_reports')) {
    if (caseIds.has(s.case_id)) rep.err('E-07', 'scam_reports.case_id', `${s.id}: duplicate case id`);
    caseIds.add(s.case_id);
    if (!/^SR-2026-\d{4}$/.test(s.case_id)) rep.err('E-07', 'scam_reports.case_id', `${s.id}: ${s.case_id}`);
    if (s.sla_due_at !== addHours(s.created_at, 24)) rep.err('E-07', 'scam_reports.sla_due_at', `${s.id}: sla_due_at != created + 24 h`);
    if (s.status === 'new' && (s.triaged_at || s.resolved_at)) rep.err('E-07', 'scam_reports.status', `${s.id}: new reports are not triaged`);
    if (['actioned', 'dismissed'].includes(s.status) !== Boolean(s.resolved_at)) rep.err('E-07', 'scam_reports.resolved_at', `${s.id}: resolved_at must be set exactly for actioned and dismissed`);
    if (s.status === 'actioned' && !s.action_taken) rep.err('E-07', 'scam_reports.action_taken', `${s.id}: actioned without an action`);
    if (s.reporter_kind === 'creator' && !s.reporter_creator_id) rep.err('E-07', 'scam_reports.reporter_creator_id', `${s.id}: creator reports name the creator`);
    if (s.reporter_kind === 'brand' && !s.reporter_brand_id) rep.err('E-07', 'scam_reports.reporter_brand_id', `${s.id}: brand reports name the brand`);
  }
  for (const v of ds.t('verifications')) {
    if (v.sla_due_at !== addHours(v.submitted_at, 24)) rep.err('E-07', 'verifications.sla_due_at', `${v.id}: sla_due_at != submitted + 24 h`);
    if (['needs_info', 'rejected'].includes(v.status) && !v.reason) rep.err('E-07', 'verifications.reason', `${v.id}: ${v.status} needs a reason code`);
    if (['verified', 'rejected', 'needs_info'].includes(v.status) !== Boolean(v.decided_at)) rep.err('E-07', 'verifications.decided_at', `${v.id}: decided_at must be set exactly when decided`);
    if ((v.subject_kind === 'creator') !== Boolean(v.creator_id) || (v.subject_kind === 'brand') !== Boolean(v.brand_id)) rep.err('E-07', 'verifications.subject_kind', `${v.id}: subject ids disagree with subject_kind`);
    if (v.kind === 'business' && v.subject_kind !== 'brand') rep.err('E-07', 'verifications.kind', `${v.id}: business checks are for brands`);
    if (v.blocks_payout !== ['pending', 'needs_info', 'rejected'].includes(v.status)) rep.err('E-07', 'verifications.blocks_payout', `${v.id}: blocks_payout disagrees with the status`);
  }
  const cs = ds.byId('creators');
  for (const v of ds.t('verifications')) if (v.kind === 'identity' && v.creator_id && cs.get(v.creator_id) && cs.get(v.creator_id).verification_status !== v.status && !['verified'].includes(cs.get(v.creator_id).verification_status)) rep.warn('E-07', 'verifications.status', `${v.id}: ${v.status} but the creator is ${cs.get(v.creator_id).verification_status}`);
  // notes
  const subs = ds.byId('submissions');
  for (const n of ds.t('feedback_notes')) {
    const s = subs.get(n.submission_id);
    if (s) {
      const ver = s.versions[n.version - 1];
      if (!ver) rep.err('E-07', 'feedback_notes.version', `${n.id}: version ${n.version} does not exist`);
      else if (n.t_ms > ver.video.duration_ms || (n.t_end_ms && (n.t_end_ms > ver.video.duration_ms || n.t_end_ms <= n.t_ms))) rep.err('E-07', 'feedback_notes.t_ms', `${n.id}: note outside the ${ver.video.duration_ms} ms video`);
      if (s.creator_id !== n.creator_id || s.bounty_id !== n.bounty_id) rep.err('E-07', 'feedback_notes', `${n.id}: creator or bounty differs from the submission`);
      if (n.status === 'resolved' && !(n.resolved_in_version > n.version && n.resolved_at)) rep.err('E-07', 'feedback_notes.resolved_in_version', `${n.id}: resolved needs a later version and a time`);
      if (n.status === 'open' && n.resolved_at) rep.err('E-07', 'feedback_notes.status', `${n.id}: open note with resolved_at`);
      if (n.created_at && ver && ms(n.created_at) < ms(ver.submitted_at)) rep.err('E-07', 'feedback_notes.created_at', `${n.id}: written before the version existed`);
    }
  }
}

// ── E-08 notifications ───────────────────────────────────────────────────────────────────────────────
function checkNotifications(ds, rep) {
  const prefs = new Map(ds.t('notification_prefs').map((p) => [p.user_id, p]));
  const users = ds.byId('users');
  for (const n of ds.t('notifications')) {
    const u = users.get(n.recipient_user_id);
    if (u) { const aud = u.role === 'creator' ? 'creator' : u.role === 'brand_member' ? 'brand' : 'admin'; if (n.audience !== aud) rep.err('E-08', 'notifications.audience', `${n.id}: audience ${n.audience} but the recipient is ${aud}`); }
    if (n.audience === 'creator' && !n.deep_link.startsWith('flowd://')) rep.err('E-08', 'notifications.deep_link', `${n.id}: creator links are flowd://`);
    if (n.audience !== 'creator' && !n.deep_link.startsWith('/')) rep.err('E-08', 'notifications.deep_link', `${n.id}: web routes start with /`);
    if (/\{[a-z_]+\}|\+\s*$|undefined/.test(n.title + n.body)) rep.err('E-08', 'notifications.title', `${n.id}: unfilled slot in "${n.title}"`);
    if ((n.priority === 'cash') !== ['cash_event', 'payout_cleared', 'payout_paid', 'payout_held', 'rights_renewed'].includes(n.kind)) rep.err('E-08', 'notifications.priority', `${n.id}: ${n.kind} has priority ${n.priority}`);
    if (['cash_event', 'payout_paid', 'payout_cleared'].includes(n.kind) && !(n.amount_cents > 0)) rep.err('E-08', 'notifications.amount_cents', `${n.id}: cash events carry amount_cents`);
    if (n.kind === 'cash_event' && !n.title.includes('$')) rep.err('E-08', 'notifications.title', `${n.id}: cash event title shows the amount`);
    if (n.delivered_at && ms(n.delivered_at) < ms(n.created_at)) rep.err('E-08', 'notifications.delivered_at', `${n.id}: delivered before it was created`);
    if (n.read_at && (!n.delivered_at || ms(n.read_at) < ms(n.delivered_at))) rep.err('E-08', 'notifications.read_at', `${n.id}: read before delivery`);
    if (n.batched && !n.delivered_at) rep.err('E-08', 'notifications.batched', `${n.id}: batched notifications are delivered later`);
    if (n.batched && n.priority === 'cash') rep.err('E-08', 'notifications.batched', `${n.id}: cash events are never batched`);
    const p = prefs.get(n.recipient_user_id);
    if (n.batched && p && !p.quiet_hours.enabled) rep.err('E-08', 'notifications.batched', `${n.id}: batched for a recipient without quiet hours`);
  }
  for (const p of ds.t('notification_prefs')) for (const k of ['money', 'reviews', 'drop', 'offers', 'tournaments', 'tips', 'safety']) if (typeof p.categories[k] !== 'boolean') rep.err('E-08', 'notification_prefs.categories', `${p.id}: missing category ${k}`);
}

// ── T-14 queues and admin metrics ────────────────────────────────────────────────────────────────────
function checkAdmin(ds, rep) {
  const m = ds.obj('admin_metrics');
  if (!m) return;
  const q = m.queues;
  const subs = ds.t('submissions').filter((s) => s.status === 'in_review');
  const exp = {
    fraud_open: ds.t('fraud_flags').filter((f) => f.status === 'open').length,
    disputes_open: ds.t('disputes').filter((d) => ['open', 'evidence_requested', 'under_review'].includes(d.status)).length,
    verification_open: ds.t('verifications').filter((v) => ['pending', 'needs_info'].includes(v.status)).length,
    safety_new: ds.t('scam_reports').filter((s) => s.status === 'new').length,
    sla_stale: subs.filter((s) => s.sla_state === 'stale').length, sla_breached: subs.filter((s) => s.sla_state === 'breached').length,
  };
  for (const [k, v] of Object.entries(exp)) if (q[k] !== v) rep.err('T-14', `admin_metrics.queues.${k}`, `${q[k]} != ${v} in the real queue`);
  const held = ds.t('payouts').filter((p) => p.status === 'held').length;
  if (ds.t('payouts').length && q.payouts_held !== (held || ds.t('payout_runs').find((r) => r.status === 'scheduled')?.held_count || 0)) rep.err('T-14', 'admin_metrics.queues.payouts_held', `${q.payouts_held} != ${held} held payouts`);
  const next = ds.t('payout_runs').find((r) => r.status === 'scheduled');
  if (next && (m.next_payout_run.run_id !== next.id || m.next_payout_run.holds !== next.held_count || m.next_payout_run.held_cents !== next.held_cents)) rep.err('T-14', 'admin_metrics.next_payout_run', 'differs from the scheduled payout run');
  if (m.targets.length !== C.launch_targets.length) rep.err('T-14', 'admin_metrics.targets', `${m.targets.length} targets, needs ${C.launch_targets.length}`);
  for (const t of m.targets) {
    const st = WORLD.TARGET_STORY.find((s) => s.id === t.id);
    if (st && (t.actual !== st.actual || t.status !== st.status)) rep.err('T-14', 'admin_metrics.targets', `${t.id}: actual/status differ from TARGET_STORY`);
    if (t.series.length < 8 || t.series[t.series.length - 1].value !== t.actual) rep.err('T-14', 'admin_metrics.targets.series', `${t.id}: the series must end on the actual value`);
    const lastDate = t.series[t.series.length - 1].date;
    if (ms(`${lastDate}T00:00:00Z`) > NOW_MS) rep.err('T-14', 'admin_metrics.targets.series', `${t.id}: series ends in the future`);
  }
  if (m.promise_metrics.length !== 11 || m.promise_metrics.some((p, i) => p.number !== i + 1)) rep.err('T-14', 'admin_metrics.promise_metrics', 'needs the 11 commitments, numbered 1 to 11');
  if (m.market_health.funded_live_ratio !== 1 && ds.t('bounties').some((b) => ['live', 'filled', 'settled'].includes(b.status) && !b.funded)) rep.err('T-14', 'admin_metrics.market_health.funded_live_ratio', 'a live bounty is not funded');
  const pr = ds.obj('state_of_app_ugc');
  if (pr) {
    if (pr.categories.length !== 9 || pr.hooks.length !== 7 || pr.formats.length !== 11) rep.err('E-06', 'state_of_app_ugc', 'needs 9 categories, 7 hook types and 11 formats');
    if (Math.abs(sum(pr.hooks, (h) => h.share_of_posts) - 1) > 0.02 && pr.settled_posts > 0) rep.err('E-06', 'state_of_app_ugc.hooks', 'hook shares should add up to 1');
    if (Math.abs(sum(pr.formats, (h) => h.share_of_posts) - 1) > 0.02 && pr.settled_posts > 0) rep.warn('E-06', 'state_of_app_ugc.formats', 'format shares should add up to about 1 (untagged posts excluded)');
  }
}

// ── E-09 Maya ────────────────────────────────────────────────────────────────────────────────────────
function checkMayaExt(ds, rep) {
  const id = WORLD.PERSONAS.creator.creator_id;
  const uid = WORLD.PERSONAS.creator.user_id;
  const F = WORLD.PERSONA_FACTS.maya;
  if (!ds.byId('creators').has(id)) return;
  const eq = (k, a, b) => { if (a !== b) rep.err('E-09', `maya.${k}`, `${a} != ${b}`); };
  const warnEq = (k, a, b) => { if (a !== b) rep.warn('E-09', `maya.${k}`, `${a} != ${b}`); };
  const streak = ds.t('streaks').find((s) => s.creator_id === id);
  if (ds.t('streaks').length) { eq('streak.current_weeks', streak?.current_weeks, F.streak_weeks); eq('streak.freezes_banked', streak?.freezes_banked, F.freezes_banked); eq('streak.next_freeze_in_weeks', streak?.next_freeze_in_weeks, 2); }
  const done = ds.t('lesson_progress').filter((p) => p.creator_id === id && p.status === 'completed').length;
  if (ds.t('lesson_progress').length) { eq('academy_lessons_completed', done, F.academy_lessons_completed); eq('academy.in_progress', ds.t('lesson_progress').filter((p) => p.creator_id === id && p.status === 'in_progress').length, 1); }
  const tax = ds.t('tax_profiles').find((t) => t.creator_id === id);
  if (ds.t('tax_profiles').length) { eq('tax.status', tax?.status, 'verified'); eq('tax.form', tax?.form, 'w9'); eq('tax.set_aside_rate', tax?.set_aside_rate, C.tax.set_aside_rate); warnEq('tax.threshold_progress', tax?.threshold_progress, Math.round((F.paid_out_cents / C.tax.form_1099_nec_threshold_cents) * 100) / 100); warnEq('tax.ytd_cleared_cents', tax?.ytd_cleared_cents, F.paid_out_cents + F.cleared_unpaid_cents); }
  const wb = ds.t('wellbeing_settings').find((w) => w.creator_id === id);
  if (ds.t('wellbeing_settings').length) { eq('wellbeing.enabled', wb?.enabled, true); eq('wellbeing.quiet_start', wb?.quiet_hours.start, C.wellbeing.quiet_hours_start); eq('wellbeing.quiet_end', wb?.quiet_hours.end, C.wellbeing.quiet_hours_end); eq('wellbeing.rest_weeks', wb?.rest_weeks.length, 0); }
  if (ds.t('leaderboards').length) {
    const b = ds.t('leaderboards').find((x) => x.scope === 'cohort' && x.tier === 'silver' && x.niche === 'ai_tools' && x.iso_week === isoWeek(NOW_ISO));
    const e = b?.entries.find((x) => x.creator_id === id);
    if (!b) rep.err('E-09', 'maya.leaderboard', 'no current Silver · AI tools cohort board');
    else {
      // the persona fact is "7 of 30": the rank is data (cleared earnings this week against her real peers), so it can only be steered by who
      // sits in the cohort. It must exist and stay in the top ten; the cohort stays at 30.
      if (!e || e.rank > 10) rep.warn('E-09', 'maya.leaderboard.rank', `${e?.rank ?? 'no rank'} (persona fact: 7 of 30, top ten at worst)`);
      warnEq('leaderboard.cohort_size', b.cohort_size, 30);
    }
  }
  const saves = ds.t('bounty_saves').filter((s) => s.creator_id === id);
  if (ds.t('bounty_saves').length) { const nSaved = saves.filter((s) => s.stage === 'saved').length; if (nSaved < 3) rep.warn('E-09', 'maya.saves.saved', `${nSaved} saved bounties (catalogue: 5; she has already submitted to most open bounties, so 3 is the floor)`); warnEq('saves.joined', saves.filter((s) => s.stage === 'joined').length, 2); if (!saves.some((s) => s.stage === 'joined' && s.drop_id && s.claimed_until && ms(s.claimed_until) > NOW_MS)) rep.warn('E-09', 'maya.saves', 'Maya has no active Daily Drop claim'); }
  if (ds.t('proofs').length) { eq('proofs', ds.t('proofs').filter((p) => p.creator_id === id).length, 5); }
  if (ds.t('wrapped').length) { eq('wrapped.september', ds.t('wrapped').some((w) => w.creator_id === id && w.period_start === '2026-09-01'), true); eq('wrapped.august', ds.t('wrapped').some((w) => w.creator_id === id && w.period_start === '2026-08-01'), true); }
  if (ds.t('threads').length) warnEq('threads', ds.t('threads').filter((t) => t.creator_id === id).length, 9);
  const mine = ds.t('notifications').filter((n) => n.recipient_user_id === uid);
  if (ds.t('notifications').length) { if (mine.length < 40) rep.err('E-09', 'maya.notifications', `${mine.length} notifications, needs at least 40`); if (!mine.some((n) => n.priority === 'cash')) rep.err('E-09', 'maya.notifications', 'no cash events'); }
  // the notes that need action are the open ones on a submission that is still waiting for a revision (rejected ones stay as evidence)
  const subStatus = new Map(ds.t('submissions').map((s) => [s.id, s.status]));
  const notes = ds.t('feedback_notes').filter((n) => n.creator_id === id && n.status === 'open' && subStatus.get(n.submission_id) === 'changes_requested');
  if (ds.t('feedback_notes').length) { warnEq('open_notes', notes.length, 3); warnEq('open_notes.must_fix', notes.filter((n) => n.severity === 'must_fix').length, 2); }
  const wk = ds.t('daily_drops').find((d) => d.items.some((i) => i.claims.some((c) => c.creator_id === id) && d.status === 'live'));
  if (ds.t('daily_drops').length && !wk) rep.warn('E-09', 'maya.drop', 'no live drop with a Maya claim');
}

// ── scenario checkers (Z-04) for the scenarios the ext files own ─────────────────────────────────────
export const EXT_SCENARIO_CHECKS = {
  'lumi-attribution': (ds) => {
    const codes = ds.t('offer_code_pool').filter((o) => o.app_id === WORLD.PERSONAS.brand.app_id && o.sku.endsWith('_annual') && ['available', 'assigned'].includes(o.status)).length;
    const rc = ds.t('integrations').find((i) => i.brand_id === WORLD.PERSONAS.brand.brand_id && i.kind === 'revenuecat');
    const unmatched = ds.t('revenuecat_events').filter((e) => e.app_id === WORLD.PERSONAS.brand.app_id && e.match_status === 'unmatched').length;
    return (codes === 8 && rc?.status === 'connected' && unmatched === 1) || `needs RevenueCat connected, 8 active annual codes (has ${codes}) and one unmatched event (has ${unmatched})`;
  },
  'platform-holds': (ds) => {
    const run = ds.t('payout_runs').find((r) => r.status === 'scheduled');
    const n = (r) => run?.holds.find((h) => h.reason === r)?.count ?? 0;
    return (n('tax_info_missing') === 3 && n('identity_check') === 2 && n('dispute_open') === 1 && n('fraud_review') === 2) || `the next run's holds are tax ${n('tax_info_missing')}, identity ${n('identity_check')}, dispute ${n('dispute_open')}, fraud ${n('fraud_review')} (scenario: 3, 2, 1, 2)`;
  },
  'platform-scam': (ds) => ['pay_to_join', 'off_platform_chat', 'burner_account_demand'].every((r) => ds.t('scam_reports').some((s) => s.reason === r)) || 'needs pay_to_join, off_platform_chat and burner_account_demand reports',
  'maya-first-dollar-done': (ds) => (ds.t('wrapped').some((w) => w.creator_id === WORLD.PERSONAS.creator.creator_id && w.period_start === '2026-09-01') && ds.t('proofs').some((p) => p.creator_id === WORLD.PERSONAS.creator.creator_id)) || 'needs Maya\'s September Wrapped and a public proof page',
  'maya-tier-progress': (ds) => ds.t('tier_history').some((e) => e.creator_id === WORLD.PERSONAS.creator.creator_id && e.to_tier === 'silver' && e.at.startsWith('2026-08-29')) || 'needs Maya\'s Bronze to Silver promotion on 2026-08-29',
};

/** Register in validate-fixtures.mjs CHECKS. */
export const EXT_CHECKS = [
  { id: 'T-07', fn: checkStreaks }, { id: 'T-08', fn: checkLeaderboards }, { id: 'T-09', fn: checkOffers }, { id: 'T-10', fn: checkDrops }, { id: 'T-11', fn: checkRights },
  { id: 'T-13', fn: checkLibrary }, { id: 'E-01', fn: checkAcademy }, { id: 'E-02', fn: checkTax }, { id: 'E-03', fn: checkComplianceFraud }, { id: 'E-04', fn: checkGrowth },
  { id: 'E-05', fn: checkPlatform }, { id: 'E-07', fn: checkTrustQueues }, { id: 'E-08', fn: checkNotifications }, { id: 'T-14', fn: checkAdmin }, { id: 'E-09', fn: checkMayaExt },
];
