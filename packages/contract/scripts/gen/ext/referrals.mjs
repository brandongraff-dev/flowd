// Referrals (single level, platform-funded; the referred person is never charged) and the ranked waitlist.

import { iso, ms, sum } from '../lib.mjs';
import * as P from '../pools.mjs';

const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const CHANNELS = ['link', 'code', 'qr'];
const CAT_PHRASE = { ai_photo: 'photo', ai_assistant: 'AI assistant', fitness: 'fitness', language: 'language-learning', productivity: 'productivity', finance: 'budgeting', sleep_mind: 'sleep', music_audio: 'music', lifestyle: 'lifestyle' };

export function genReferrals(W, rng) {
  const now = W.now;
  const nowMs = ms(now);
  const cfg = W.C.referrals;
  const rows = [];
  const refereeIds = new Set();
  // the rewards the core ledger paid out ("Referral reward: 5% of @handle's cleared earnings, week to ..."): the programme page must equal them
  const refLedger = W.ledger.filter((l) => l.entry_type === 'referral' && l.amount_cents > 0 && String(l.account).startsWith('creator:'));
  const ledgerReward = (referrerId, handle) => sum(refLedger.filter((l) => (l.creator_id ?? l.account.slice(8)) === referrerId && String(l.memo).includes(`@${handle}'s`)), (l) => l.amount_cents);

  // ── creators who joined through a referrer (core says who) ───────────────────────────────────────────
  for (const c of W.creators) {
    if (!c.referred_by_creator_id) continue;
    const referrer = W.creatorById.get(c.referred_by_creator_id);
    if (!referrer) continue;
    const r = rng.fork(`ref:${c.id}`);
    refereeIds.add(c.id);
    const joinedAt = c.joined_at;
    const invitedAt = iso(Math.max(ms(referrer.joined_at) + DAY, ms(joinedAt) - r.int(2, 70) * 3_600_000));
    const firstDollar = c.first_dollar_at && ms(c.first_dollar_at) <= nowMs ? c.first_dollar_at : undefined;
    const windowEnd = firstDollar ? iso(ms(firstDollar) + cfg.creator_share_days * DAY) : undefined;
    const earnedRows = (W.earnByCreator.get(c.id) ?? []).filter((x) => (x.status === 'cleared' || x.status === 'paid') && firstDollar && ms(W.earnedAt(x)) >= ms(firstDollar) && ms(W.earnedAt(x)) <= Math.min(nowMs, ms(windowEnd)));
    const estimate = Math.min(cfg.creator_share_cap_per_referee_cents, Math.round(sum(earnedRows, (x) => x.amount_cents) * cfg.creator_share_rate));
    const paidOut = ledgerReward(referrer.id, c.handle);
    const earned = Math.min(cfg.creator_share_cap_per_referee_cents, refLedger.length ? paidOut : estimate);
    let status = 'joined';
    if (firstDollar) {
      if (earned >= cfg.creator_share_cap_per_referee_cents || ms(windowEnd) <= nowMs) status = 'complete';
      else if (earned > 0) status = 'earning';
      else status = 'first_dollar';
    }
    const updated = [invitedAt, joinedAt, firstDollar, status === 'earning' ? earnedRows.map((x) => W.earnedAt(x)).sort().pop() : undefined].filter(Boolean).sort().pop();
    rows.push({
      kind: 'creator', status, code: referrer.referral_code, referrer_creator_id: referrer.id, referee_creator_id: c.id, referee_label: `@${c.handle}`, channel: pick(r, CHANNELS), invited_at: invitedAt, joined_at: joinedAt,
      ...(firstDollar ? { first_dollar_at: firstDollar, reward_window_ends_at: windowEnd } : {}), reward_rate: cfg.creator_share_rate, reward_cap_cents: cfg.creator_share_cap_per_referee_cents, reward_earned_cents: firstDollar ? earned : 0,
      created_at: invitedAt, updated_at: iso(Math.min(nowMs - 3_600_000, ms(updated))),
    });
  }

  // ── invites that have not joined yet (pending) or lapsed after 30 days ───────────────────────────────
  const rI = rng.fork('ref:invites');
  const referrers = W.creators.filter((c) => c.referral_code && W.tierRank(c.tier) >= 1 && c.id !== W.maya?.id);
  const everyone = W.creators.filter((c) => c.referral_code);
  let n = 0;
  const target = 55;
  while (rows.filter((x) => x.kind === 'creator').length < target - 5 && n++ < 400) {
    const pool = rI.chance(0.6) ? referrers : everyone;
    const referrer = pick(rI, pool);
    const expired = rI.chance(0.35);
    const invitedAt = iso(nowMs - (expired ? rI.int(32, 80) * DAY : rI.int(1, 28) * DAY) - rI.int(0, 20) * 3_600_000);
    if (ms(invitedAt) < ms(referrer.joined_at) + DAY) continue;
    rows.push({
      kind: 'creator', status: expired ? 'expired' : 'invited', code: referrer.referral_code, referrer_creator_id: referrer.id, referee_label: 'Invite sent', channel: pick(rI, CHANNELS), invited_at: invitedAt,
      reward_rate: cfg.creator_share_rate, reward_cap_cents: cfg.creator_share_cap_per_referee_cents, reward_earned_cents: 0, created_at: invitedAt, updated_at: expired ? iso(ms(invitedAt) + 30 * DAY) : invitedAt,
    });
  }

  // ── brands and agencies: a partner earns 10% of the platform fees for 12 months ──────────────────────
  const feeRows = W.ledger.filter((l) => l.account === 'platform:fees' && l.amount_cents > 0 && l.brand_id);
  const feeFor = (brandId) => feeRows.filter((l) => l.brand_id === brandId);
  const brandRefs = W.brands.filter((b) => b.referral_partner_brand_id);
  for (const b of brandRefs) {
    const partner = W.brandById.get(b.referral_partner_brand_id);
    if (!partner) continue;
    const r = rng.fork(`ref:brand:${b.id}`);
    const fees = feeFor(b.id);
    const first = [...(W.bountiesByBrand.get(b.id) ?? [])].map((x) => x.funded_at ?? x.published_at).filter(Boolean).sort()[0] ?? b.created_at;
    const firstDollar = ms(first) <= nowMs ? first : undefined;
    const windowEnd = firstDollar ? iso(ms(firstDollar) + 365 * DAY) : undefined;
    const earned = Math.round(sum(fees.filter((l) => firstDollar && ms(l.posted_at) >= ms(firstDollar) && ms(l.posted_at) <= ms(windowEnd)), (l) => l.amount_cents) * cfg.brand_partner_share_rate);
    const invitedAt = iso(Math.max(ms(partner.created_at) + DAY, ms(b.created_at) - r.int(2, 9) * DAY));
    const status = firstDollar ? (earned > 0 ? 'earning' : 'first_dollar') : 'joined';
    rows.push({
      kind: partner.kind === 'agency' ? 'agency' : 'brand', status, code: `${W.slugOf(partner.id).toUpperCase().slice(0, 9)}-${r.int(10, 99)}`, referrer_brand_id: partner.id, referee_brand_id: b.id,
      referee_label: `A ${CAT_PHRASE[(W.appsByBrand.get(b.id) ?? [])[0]?.category] ?? 'subscription'} app`, channel: 'link', invited_at: invitedAt, joined_at: b.created_at,
      ...(firstDollar ? { first_dollar_at: firstDollar, reward_window_ends_at: windowEnd } : {}), reward_rate: cfg.brand_partner_share_rate, reward_cap_cents: 1_000_000, reward_earned_cents: Math.min(1_000_000, earned),
      created_at: invitedAt, updated_at: iso(Math.min(nowMs - 3_600_000, Math.max(ms(b.created_at), ms(firstDollar ?? b.created_at)))),
    });
  }
  // two pending partner invites so the programme page has an invited and an expired example
  const agency = W.brands.find((b) => b.kind === 'agency');
  if (agency) {
    const r = rng.fork('ref:agency-invites');
    ['invited', 'expired'].forEach((status, i) => {
      const invitedAt = iso(nowMs - (status === 'invited' ? 6 : 52) * DAY);
      rows.push({ kind: 'agency', status, code: `${W.slugOf(agency.id).toUpperCase().slice(0, 9)}-${r.int(10, 99)}`, referrer_brand_id: agency.id, referee_label: i ? 'A sleep app' : 'A language-learning app', channel: 'link', invited_at: invitedAt, reward_rate: cfg.brand_partner_share_rate, reward_cap_cents: 1_000_000, reward_earned_cents: 0, created_at: invitedAt, updated_at: status === 'expired' ? iso(ms(invitedAt) + 30 * DAY) : invitedAt });
    });
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.code < b.code ? -1 : 1));
  return rows.map((row, i) => ({ id: `ref_${String(i + 1).padStart(4, '0')}`, ...row }));
}

// ── waitlist ─────────────────────────────────────────────────────────────────────────────────────────
const BRAND_LEADERS = ['sparkloop.studio', 'tidepool.growth', 'nimbus.labs', 'orchard.apps'];
export function genWaitlist(W, rng, referrals) {
  const r = rng.fork('waitlist');
  const used = new Set(W.creators.map((c) => c.handle));
  const handles = P.HANDLES.filter((h) => !used.has(h));
  const leaders = [];
  let refs = 212;
  for (let i = 0; i < 25; i++) {
    const brand = i === 3 || i === 9 || i === 16 || i === 21;
    refs = Math.max(6, Math.round(refs * r.float(0.79, 0.93)));
    leaders.push({
      position: i + 1, kind: brand ? 'brand' : 'creator', handle: brand ? BRAND_LEADERS[[3, 9, 16, 21].indexOf(i)] : handles[i % handles.length], referrals: refs,
      joined_at: iso(ms('2026-04-14T12:00:00Z') + i * 3 * DAY + r.int(0, 20) * 3_600_000),
    });
  }
  const total = referrals.filter((x) => x.kind === 'creator' && x.status !== 'invited' && x.status !== 'expired').length;
  return {
    totals: { creators: 18412, brands: 1347, invites_accepted: 2206 + total, updated_at: iso(ms(W.now) - 9 * 60_000) },
    leaders, demo_position: 1284, demo_referrals: 3,
  };
}
