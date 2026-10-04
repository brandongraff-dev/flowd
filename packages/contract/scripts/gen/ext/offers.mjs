// Offers (invites, direct offers, re-buys) with negotiation threads. Every accepted offer rests on real work in the core fixtures:
// a direct bounty and the creator who delivered on it, or an open bounty and a real submission.

import { iso, ms, addHours, addDays, usd, fill, clamp, sum, hoursAgo } from '../lib.mjs';
import { allIn, deliverables, money, rightsCard, roundTo, TIER_MULT } from './util.mjs';
import { APPROVED_SUB } from './world.mjs';
import * as P from '../pools.mjs';

const NICHE_TOPIC = {
  ai_tools: 'AI tools', tech: 'app review', fitness: 'workout', wellness: 'wind-down', productivity: 'planning', study: 'study-with-me', money: 'budgeting', lifestyle: 'day-in-my-life', beauty: 'glow-up', travel: 'trip planning', food: 'meal prep', parenting: 'family routine',
};
const OPENING_DIRECT = [
  'Hi {creator}, we loved your {topic} video. We would like {videos} on {app} for {amount}. Rights are in the card; renewals are priced up front.',
  'Hey {creator}! Your last post drove the best trial rate we have seen on {app}. Would you make a follow-up with a different hook at {amount}?',
  '{creator}, your {topic} style is exactly what {app} needs this month. {amount} for {videos}, organic plus paid usage as per the card. A {turn}-day turnaround works for us.',
  'Hi {creator}. Your hooks keep coming through our review queue as the clean ones. Offer for {app}: {videos} for {amount}, rights and renewal price on the card.',
  'Hello {creator}, we would like to book you directly for {app}: {videos} for {amount}, no view minimum. Happy to shape the hook angle together.',
];
const OPENING_REBUY = [
  'We are re-buying your winning video with three new openings. {amount} for the set, organic posting plus a {days}-day paid usage term.',
  'Your "{title}" video is our best performer on {app}. Could you film two alternate hooks on the same body? {amount} for both.',
  '{creator}, the first version carried a lot of trials. We would like two new hooks on the same structure for {amount}, same rights as before.',
];
const OPENING_INVITE = [
  'We have a funded bounty live: "{title}". Your {topic} content fits the brief, so we wanted you to see it before it fills. It pays {rate}, and we decide in about {hours} hours.',
  'Invite for "{title}" on {app}. It is Funded, pays {rate}, and your {topic} videos are exactly the style we are after.',
  '{creator}, would you take a look at "{title}"? We think your audience is a strong fit and would love a submission from you.',
];
const COUNTER_CREATOR = [
  'Thanks! My usual rate for {videos} with paid usage is {amount}. Happy to do {days} days of usage.',
  'I can do it at {amount} if the turnaround is {turn} days.',
  'Could we do {amount} with a {days}-day usage term instead? That keeps it fair for both of us.',
  'Appreciate the offer. For {videos} plus paid usage my rate is {amount}.',
  'I would love to. {amount} covers the edit and the paid-usage term. Rights as written otherwise.',
];
const COUNTER_BRAND = [
  'We can meet you at {amount}.', 'We cannot go higher than {amount}, but we can add a second video next month.', '{amount} is the top of our budget for this one. Does that work?', 'We can do {amount} if usage stays at {days} days.',
];
const ACCEPT_CREATOR = ['Sounds good, accepted.', 'Deal. I will start on the script today.', 'Accepted. I can have the first cut to you in {turn} days.', 'Happy with that. Accepting now.'];
const ACCEPT_BRAND = ['That works for us. We have funded the offer from our wallet.', 'Great, accepted at {amount}. Escrow is funded and the brief is attached.', 'Perfect. Accepted at {amount}; funding the escrow now.'];
const DECLINE_CREATOR = ['Thank you, I am fully booked this month.', 'Not a fit for my audience right now, thanks for thinking of me.', 'I will pass on this one. The usage term is longer than I am comfortable with.', 'Thanks, but the price is below what I can do for paid usage. Happy to revisit later.'];
const DECLINE_BRAND = ['Thanks for the counter. It is above what we can do this quarter, so we will pass for now.', 'We have gone another direction on creative. Thank you for the quick reply.'];
const WITHDRAW_BRAND = ['We are pausing creative for this launch and withdrawing the offer. Thank you for the quick replies.', 'Our budget moved to a different channel this month. Withdrawing the offer with apologies.', 'The release date moved, so we are withdrawing this offer and will send a new one when it is set.'];
const INVITE_ACCEPT = ['Thanks for the invite. I will make one this week.', 'Looks great. I am on it.', 'Accepted. Starting the script now.'];
const INVITE_DECLINE = ['Thank you, this one is outside my niche.', 'I am out of capacity this week, but thank you.', 'Not for me this time. Good luck with the launch.'];

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const hrs = (r, lo, hi) => r.int(lo, hi) * 3_600_000;
const mins = (r, lo, hi) => r.int(lo, hi) * 60_000;
const clampIso = (isoStr, lo, hi) => iso(Math.min(ms(hi), Math.max(ms(lo), ms(isoStr))));

/** Market-suggested band for a creator, scaled to the number of videos. */
export function suggestedFor(W, creator, videos, categoryKey, r) {
  const rc = W.rateCardByCreator.get(creator.id);
  if (rc?.suggested) {
    const s = rc.suggested;
    return { price_cents: roundTo(s.price_cents * videos), low_cents: roundTo(s.low_cents * videos), high_cents: roundTo(s.high_cents * videos), basis: videos > 1 ? `${s.basis}, ${videos} videos` : s.basis, confidence: s.confidence, computed_at: s.computed_at };
  }
  const med = W.medianViews(creator.id);
  const cpm = W.clearingCpm(categoryKey, 200);
  const mult = TIER_MULT[creator.tier] ?? 1;
  const price = roundTo((med / 1000) * cpm * mult * videos * 1.4);
  return {
    price_cents: price, low_cents: roundTo(price * 0.78), high_cents: roundTo(price * 1.3),
    basis: `Median ${(med / 1000).toFixed(1)}k views x ${usd(cpm)} market CPM, ${mult.toFixed(1)}x ${creator.tier[0].toUpperCase()}${creator.tier.slice(1)}`,
    confidence: Math.round(clamp(0.45 + r.next() * 0.25, 0, 1) * 100) / 100, computed_at: hoursAgo(r.int(2, 30)),
  };
}

const FLOWS = {
  direct: {
    awaiting_creator: [['offer'], ['offer', 'counter_c', 'counter_b']],
    awaiting_brand: [['offer', 'counter_c'], ['offer', 'counter_c', 'counter_b', 'counter_c']],
    accepted: [['offer', 'accept_c', 'system_funded'], ['offer', 'counter_c', 'accept_b', 'system_funded']],
    completed: [['offer', 'accept_c', 'system_funded'], ['offer', 'counter_c', 'accept_b', 'system_funded']],
    declined: [['offer', 'decline_c'], ['offer', 'counter_c', 'decline_b']],
    expired: [['offer'], ['offer', 'counter_c']],
    withdrawn: [['offer', 'withdraw_b'], ['offer', 'counter_c', 'withdraw_b']],
  },
  invite: { awaiting_creator: [['invite']], accepted: [['invite', 'accept_c']], completed: [['invite', 'accept_c']], declined: [['invite', 'decline_c']], expired: [['invite']] },
};
FLOWS.rebuy = FLOWS.direct;
const flowFor = (kind, status, r) => pick(r, FLOWS[kind][status] ?? FLOWS.direct[status]);
const lastAtFor = (status, r) => {
  switch (status) {
    case 'awaiting_creator': return hoursAgo(r.int(3, 50));
    case 'awaiting_brand': return hoursAgo(r.int(5, 70));
    case 'accepted': return hoursAgo(r.int(24 * 5, 24 * 19));
    case 'completed': return hoursAgo(r.int(24 * 20, 24 * 50));
    case 'declined': return hoursAgo(r.int(24 * 2, 24 * 26));
    case 'expired': return hoursAgo(r.int(24 * 9, 24 * 32));
    case 'withdrawn': return hoursAgo(r.int(24 * 3, 24 * 22));
    default: return hoursAgo(24);
  }
};

export function genOffers(W, rng, seq) {
  const now = W.now;
  const launch = '2026-07-06T00:00:00Z';
  const offers = [];
  const buyers = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free');
  // brands book creators whose ask sits near the market band; a rate-card floor far above the suggestion (a $80 floor on a 2k-view creator) is not a deal anyone sends
  const nearMarket = (c) => { const rc = W.rateCardByCreator.get(c.id); return !rc?.suggested || rc.price_per_video_cents <= rc.suggested.high_cents * 1.5; };
  const rcCreators = W.creators.filter((c) => W.rateCardByCreator.has(c.id) && c.open_to_offers !== false && nearMarket(c));
  const topicOf = (c) => NICHE_TOPIC[c.niches?.[0]] ?? 'app review';
  // a brand books creators whose niche covers its app's category (an AI writing app does not send a direct offer to a fitness creator)
  const fitting = (brand) => {
    const app = (W.appsByBrand.get(brand.id) ?? [])[0];
    const fit = app ? rcCreators.filter((c) => (c.niches ?? []).some((n) => P.NICHES.find((x) => x.key === n)?.categories.includes(app.category))) : [];
    return fit.length >= 3 ? fit : rcCreators;
  };
  const usedPairs = new Set();
  const bountyRate = (b) => (b.cpm_cents > 0 ? `${usd(b.cpm_cents)} per 1,000 views` : b.flat_fee_cents > 0 ? `${usd(b.flat_fee_cents)} flat` : `${usd(b.cpa_trial_cents)} per tracked trial`);
  const memberFor = (brandId, r) => {
    const d = W.deciders(brandId);
    if (brandId === W.lumi?.id) return W.memberById.get(W.ctx.world.PERSONAS.brand.member_id) ?? d[0];
    return d.length ? (r.chance(0.6) ? d[0] : pick(r, d)) : W.membersOf(brandId)[0];
  };

  /** Build one offer from a spec and push it. */
  function build(spec) {
    const r = rng.fork(`offer:${offers.length}:${spec.creator.id}:${spec.brand.id}`);
    const { kind, status, brand, creator, flow } = spec;
    const app = spec.app ?? (spec.bounty && W.appById.get(spec.bounty.app_id)) ?? (W.appsByBrand.get(brand.id) ?? [])[0];
    const mem = spec.member ?? memberFor(brand.id, r);
    if (!app || !mem) return null;
    const videos = spec.videos ?? (kind === 'rebuy' ? 2 : r.weighted([[1, 60], [2, 30], [3, 10]]));
    const rc = W.rateCardByCreator.get(creator.id);
    const cat = app.category ?? 'lifestyle';
    const takeRate = spec.bounty && kind === 'invite' ? spec.bounty.take_rate : W.C.plans[brand.plan]?.take_rate ?? 0.12;
    let rightsDays = spec.rightsDays ?? r.weighted([[90, 74], [60, 12], [30, 10], [180, 4]]);
    const turn = rc?.turnaround_days ?? r.int(4, 9);
    const suggested = kind === 'invite' ? undefined : suggestedFor(W, creator, videos, cat, r);
    const ask = kind === 'invite' ? 0 : spec.agreed ?? (rc ? roundTo(rc.price_per_video_cents * videos) : roundTo((suggested?.price_cents ?? 20000) * 1.1));
    const hasCounter = flow.some((s) => s.startsWith('counter'));
    // the brand's opening price: a little under the ask (or the agreed price when no negotiation follows)
    const openAmt = kind === 'invite' ? 0 : spec.openAmount ?? (spec.agreed ? (hasCounter ? roundTo(spec.agreed * 0.85) : spec.agreed) : roundTo(ask * r.float(0.74, 0.98)));
    const vals = { creator: W.firstName(creator.display_name), app: app.name, topic: topicOf(creator), videos: videos === 1 ? 'one video' : `${videos} videos`, turn: String(turn), days: String(rightsDays), title: spec.title ?? spec.bounty?.title ?? spec.postTitle ?? '', hours: '11', rate: spec.bounty ? bountyRate(spec.bounty) : '' };

    // timeline backwards from the last message: creators reply in hours, brands in a day, the system in minutes
    const rawGaps = flow.map((step, i) => (i === 0 ? 0 : step.startsWith('system') ? mins(r, 1, 9) : step.endsWith('_c') ? hrs(r, 3, 22) : hrs(r, 2, 30)));
    // the last message keeps its place (an expired offer must really be a week old); a long exchange is compressed into the room that exists
    // after both parties had joined, and an offer with no room at all is not built
    const cap = ms(now) - 20 * 60_000;
    const lastAt = ms(spec.lastAt) > cap ? iso(cap) : spec.lastAt;
    const floorMs = Math.max(ms(launch), ms(creator.joined_at) + 2 * 3_600_000, ms(brand.created_at) + 2 * 3_600_000);
    const need = sum(rawGaps, (g) => g);
    let gaps = rawGaps;
    if (ms(lastAt) - need < floorMs) {
      const room = ms(lastAt) - floorMs;
      if (room < 20 * 60_000 * Math.max(1, flow.length - 1)) return null;
      gaps = rawGaps.map((g) => (g * room) / need);
    }
    const times = [];
    let t = ms(lastAt) - sum(gaps, (g) => g);
    gaps.forEach((g) => { t += g; times.push(iso(t)); });

    const messages = [];
    let amount = openAmt;
    let brandPrice = openAmt;
    let creatorPrice = ask;
    let rounds = 0;
    const msg = (type, role, at_, extra = {}) => {
      const m = { id: seq('omsg'), author_role: role, type, ...extra, at: at_ };
      if (role === 'brand') m.author_user_id = mem.user_id;
      if (role === 'creator') m.author_user_id = creator.user_id;
      return m;
    };
    flow.forEach((step, i) => {
      const at_ = times[i];
      if (step === 'invite') messages.push(msg('offer', 'brand', at_, { body: fill(pick(r, OPENING_INVITE), { ...vals, amount: '' }) }));
      else if (step === 'offer') messages.push(msg('offer', 'brand', at_, { amount_cents: amount, rights_days: rightsDays, body: fill(pick(r, kind === 'rebuy' ? OPENING_REBUY : OPENING_DIRECT), { ...vals, amount: money(amount) }) }));
      else if (step === 'counter_c') {
        rounds++;
        creatorPrice = rounds === 1 ? (spec.agreed ?? roundTo(Math.max(ask * r.float(0.97, 1.04), brandPrice + 500))) : roundTo(brandPrice + (creatorPrice - brandPrice) * 0.4);
        amount = Math.max(creatorPrice, brandPrice + 500);
        if (rounds === 1 && r.chance(0.35) && rightsDays > 60) rightsDays = 60;
        messages.push(msg('counter', 'creator', at_, { amount_cents: amount, rights_days: rightsDays, body: fill(pick(r, COUNTER_CREATOR), { ...vals, amount: money(amount), days: String(rightsDays) }) }));
      } else if (step === 'counter_b') {
        rounds++;
        brandPrice = roundTo(brandPrice + (creatorPrice - brandPrice) * r.float(0.35, 0.6));
        amount = brandPrice;
        messages.push(msg('counter', 'brand', at_, { amount_cents: amount, rights_days: rightsDays, body: fill(pick(r, COUNTER_BRAND), { ...vals, amount: money(amount), days: String(rightsDays) }) }));
      } else if (step === 'accept_c') messages.push(msg('accept', 'creator', at_, { ...(kind === 'invite' ? {} : { amount_cents: amount, rights_days: rightsDays }), body: fill(pick(r, kind === 'invite' ? INVITE_ACCEPT : ACCEPT_CREATOR), vals) }));
      else if (step === 'accept_b') messages.push(msg('accept', 'brand', at_, { amount_cents: amount, rights_days: rightsDays, body: fill(pick(r, ACCEPT_BRAND), { ...vals, amount: money(amount) }) }));
      else if (step === 'decline_c') messages.push(msg('decline', 'creator', at_, { body: pick(r, kind === 'invite' ? INVITE_DECLINE : DECLINE_CREATOR) }));
      else if (step === 'decline_b') messages.push(msg('decline', 'brand', at_, { body: pick(r, DECLINE_BRAND) }));
      else if (step === 'withdraw_b') messages.push(msg('withdraw', 'brand', at_, { body: pick(r, WITHDRAW_BRAND) }));
      else if (step === 'system_funded') {
        const total = allIn(amount, takeRate);
        messages.push(msg('system', 'system', at_, { amount_cents: total, body: `Escrow funded: ${usd(total)} reserved from the ${brand.name} wallet (${money(amount)} to you, ${money(total - amount)} platform fee).` }));
      }
    });
    const createdAt = messages[0].at;
    const lastActivity = messages[messages.length - 1].at;
    const expiresAt = addDays(lastActivity, 7);
    const accepted = status === 'accepted' || status === 'completed';
    const acceptMsg = messages.find((m) => m.type === 'accept');
    const finalAmount = kind === 'invite' ? 0 : amount;
    const row = {
      _sort: createdAt,
      kind, status, brand_id: brand.id, app_id: app.id, creator_id: creator.id, created_by_member_id: mem.id,
      title: spec.title ?? (kind === 'invite' ? `Invite: ${spec.bounty.title}` : kind === 'rebuy' ? `Two new hooks on ${spec.postTitle ?? 'a winner'}` : `${videos === 1 ? 'One video' : `${videos} videos`} for ${app.name}`),
      ...(spec.bounty && (kind === 'invite' || accepted) ? { bounty_id: spec.bounty.id } : {}),
      ...(rc && kind === 'direct' && spec.useRateCard !== false ? { rate_card_id: rc.id } : {}),
      ...(kind === 'rebuy' && spec.post ? { rebuy_of_post_id: spec.post.id } : {}),
      amount_cents: finalAmount,
      original_amount_cents: openAmt,
      ...(kind === 'invite' ? {} : { ask_cents: ask, suggested }),
      take_rate: takeRate,
      all_in_cents: kind === 'invite' ? 0 : allIn(finalAmount, takeRate),
      deliverables: deliverables({
        videos: kind === 'invite' ? spec.bounty?.deliverables?.videos_per_creator ?? 1 : videos, min: 15, max: pick(r, [30, 30, 45]),
        platforms: [...new Set((W.socialsByCreator.get(creator.id) ?? []).map((s) => s.platform))].slice(0, 2).length ? [...new Set((W.socialsByCreator.get(creator.id) ?? []).map((s) => s.platform))].slice(0, 2) : ['tiktok'],
        regions: [...new Set([creator.country, 'US'])], face: r.chance(0.6),
      }),
      rights_card: spec.bounty && kind === 'invite' ? spec.bounty.rights_card : rightsCard({ brandName: brand.name, paid_ads_days: rightsDays, exclusivity_days: r.weighted([[0, 70], [14, 15], [30, 15]]) }),
      turnaround_days: turn,
      message: messages[0].body,
      rounds,
      escrow_funded: accepted,
      thread: messages,
      expires_at: expiresAt,
      created_at: createdAt,
      updated_at: lastActivity,
      ...(accepted && acceptMsg ? { accepted_at: acceptMsg.at } : {}),
      ...(status === 'completed' ? { closed_at: spec.closedAt ?? iso(Math.min(ms(now) - 3_600_000, ms(lastActivity) + 9 * 86_400_000)) } : {}),
      ...(status === 'declined' || status === 'withdrawn' ? { closed_at: lastActivity } : {}),
      ...(status === 'expired' ? { closed_at: expiresAt } : {}),
    };
    if (kind === 'invite' && spec.bounty?.funded && !accepted) row.escrow_funded = true;
    offers.push(row);
    usedPairs.add(`${creator.id}|${brand.id}|${kind}|${spec.bounty?.id ?? ''}`);
    return row;
  }

  // ── 1. offers that rest on real work: direct bounties and the creators who delivered on them ─────────
  const directBounties = W.bounties.filter((b) => b.type === 'direct' && b.funded);
  directBounties.forEach((D, idx) => {
    const subs = (W.subsByBounty.get(D.id) ?? []).filter((s) => !['withdrawn', 'expired'].includes(s.status));
    const s = subs[0];
    const creator = s && W.creatorById.get(s.creator_id);
    const brand = W.brandById.get(D.brand_id);
    if (!s || !creator || !brand) return;
    const r = rng.fork(`dd:${D.id}`);
    const post = W.postBySub.get(s.id);
    const status = post && ['paid', 'cleared'].includes(post.status) ? 'completed' : 'accepted';
    const kind = idx % 3 === 2 && post ? 'rebuy' : 'direct';
    const winnerPost = kind === 'rebuy' ? (W.postsByCreator.get(creator.id) ?? []).filter((p) => p.brand_id === brand.id && p.id !== post?.id).sort((a, b) => b.funnel.trials - a.funnel.trials)[0] : undefined;
    const acceptAt = clampIso(addHours(D.funded_at ?? D.created_at, 1), launch, now);
    build({
      kind: kind === 'rebuy' && winnerPost ? 'rebuy' : 'direct', status, brand, creator, bounty: D, app: W.appById.get(D.app_id), flow: flowFor('direct', status, r), lastAt: acceptAt,
      videos: Math.max(1, D.deliverables?.videos_per_creator ?? 1), agreed: D.flat_fee_cents > 0 ? D.flat_fee_cents : undefined,
      title: D.title, post: winnerPost, postTitle: winnerPost ? W.bountyById.get(winnerPost.bounty_id)?.title : undefined,
      closedAt: post ? clampIso(post.paid_at ?? post.cleared_at ?? addDays(post.posted_at, 5), launch, addHours(now, -2)) : undefined,
    });
  });

  // ── 2. Maya (the persona): four offers, each telling a different part of her inbox story ──────────────
  const maya = W.maya;
  const lumi = W.lumi;
  if (maya && lumi) {
    const jordan = W.memberById.get(W.ctx.world.PERSONAS.brand.member_id);
    const mayaCats = ['ai_assistant', 'productivity', 'lifestyle', 'language'];
    const fits = (b) => (W.appsByBrand.get(b.id) ?? []).some((a) => mayaCats.includes(a.category));
    const second = buyers.find((b) => b.id !== lumi.id && fits(b)) ?? buyers.find((b) => b.id !== lumi.id);
    const third = buyers.find((b) => b.id !== lumi.id && b.id !== second?.id && fits(b));
    const fourth = buyers.find((b) => ![lumi.id, second?.id, third?.id].includes(b.id));
    build({ kind: 'direct', status: 'awaiting_creator', brand: lumi, creator: maya, member: jordan, videos: 2, flow: ['offer'], lastAt: hoursAgo(26), rightsDays: 90, app: W.appById.get('app_lumi') });
    if (second) build({ kind: 'direct', status: 'awaiting_brand', brand: second, creator: maya, videos: 1, flow: ['offer', 'counter_c'], lastAt: hoursAgo(19), rightsDays: 60 });
    const liveFor = (b) => W.bounties.find((x) => x.brand_id === b.id && x.status === 'live' && ['open', 'invite_only'].includes(x.visibility) && !(W.subsByBounty.get(x.id) ?? []).some((s) => s.creator_id === maya.id));
    if (third && liveFor(third)) build({ kind: 'invite', status: 'expired', brand: third, creator: maya, bounty: liveFor(third), flow: ['invite'], lastAt: hoursAgo(24 * 12) });
    if (fourth) build({ kind: 'direct', status: 'declined', brand: fourth, creator: maya, videos: 1, flow: ['offer', 'decline_c'], lastAt: hoursAgo(24 * 8), openAmount: 7500 });
  }

  // ── 3. Lumi's other offers (Jordan sends most of them) ────────────────────────────────────────────────
  if (lumi) {
    const lumiApp = W.appById.get('app_lumi');
    const liveOpen = W.bounties.filter((b) => b.brand_id === lumi.id && b.status === 'live' && b.type !== 'direct');
    const pool = rcCreators.filter((c) => c.id !== maya?.id && c.niches.some((n) => ['ai_tools', 'beauty', 'lifestyle', 'tech'].includes(n)));
    const wins = W.posts.filter((p) => p.brand_id === lumi.id && p.is_winner && ['paid', 'cleared'].includes(p.status) && p.creator_id !== maya?.id).sort((a, b) => b.funnel.trials - a.funnel.trials);
    const take = (arr, i) => arr[i % arr.length];
    const w = wins[0];
    if (w) build({ kind: 'rebuy', status: 'awaiting_brand', brand: lumi, creator: W.creatorById.get(w.creator_id), post: w, postTitle: W.bountyById.get(w.bounty_id)?.title ?? 'a winner', videos: 2, flow: ['offer', 'counter_c'], lastAt: hoursAgo(31), app: lumiApp });
    if (pool.length) build({ kind: 'direct', status: 'awaiting_creator', brand: lumi, creator: take(pool, 3), videos: 1, flow: ['offer'], lastAt: hoursAgo(8), app: lumiApp });
    if (pool.length > 5) build({ kind: 'direct', status: 'declined', brand: lumi, creator: take(pool, 5), videos: 1, flow: ['offer', 'counter_c', 'decline_b'], lastAt: hoursAgo(24 * 6), app: lumiApp });
    if (liveOpen.length && pool.length > 7) build({ kind: 'invite', status: 'awaiting_creator', brand: lumi, creator: take(pool, 7), bounty: liveOpen[0], flow: ['invite'], lastAt: hoursAgo(14) });
  }

  // ── 4. fill the remaining quota with a believable spread across the Pro and Scale brands ─────────────
  const quota = {
    invite: { awaiting_creator: 3, accepted: 2, completed: 3, declined: 3, expired: 3 },
    direct: { awaiting_creator: 4, awaiting_brand: 5, accepted: 1, completed: 2, declined: 2, expired: 1, withdrawn: 1 },
    rebuy: { awaiting_creator: 1, awaiting_brand: 1, accepted: 1, completed: 1, withdrawn: 2 },
  };
  const have = (kind, status) => offers.filter((o) => o.kind === kind && o.status === status).length;
  const wanted = [];
  for (const [kind, st] of Object.entries(quota)) for (const [status, n] of Object.entries(st)) for (let k = have(kind, status); k < n; k++) wanted.push({ kind, status });
  const winnerPosts = W.posts.filter((p) => p.is_winner && ['paid', 'cleared'].includes(p.status));
  let cursor = 0;
  const target = 36;
  const queue = [...wanted];
  // accepted / completed invites rest on real submissions; direct and re-buy ones only exist where a direct bounty did
  for (const w of queue) {
    if (offers.length >= target + 2) break;
    cursor++;
    const r = rng.fork(`fill:${cursor}:${w.kind}:${w.status}`);
    const lastAt = lastAtFor(w.status, r);
    const brand = buyers[(cursor * 5 + 1) % buyers.length];
    if (!brand) continue;
    if (w.kind === 'invite') {
      if (w.status === 'accepted' || w.status === 'completed') {
        const cands = W.subs.filter((s) => APPROVED_SUB.has(s.status) && W.bountyById.get(s.bounty_id)?.type !== 'direct' && W.bountyById.get(s.bounty_id)?.visibility !== 'private' && !usedPairs.has(`${s.creator_id}|${s.brand_id}|invite|${s.bounty_id}`));
        const s = cands[(cursor * 37) % Math.max(1, cands.length)];
        if (!s) continue;
        const bounty = W.bountyById.get(s.bounty_id);
        const post = W.postBySub.get(s.id);
        build({
          kind: 'invite', status: w.status, brand: W.brandById.get(bounty.brand_id), creator: W.creatorById.get(s.creator_id), bounty, flow: flowFor('invite', w.status, r),
          lastAt: clampIso(addHours(s.submitted_at, -r.int(2, 30)), launch, now),
          closedAt: w.status === 'completed' ? clampIso(post?.paid_at ?? post?.cleared_at ?? addDays(s.submitted_at, 6), launch, addHours(now, -2)) : undefined,
        });
        continue;
      }
      const bounty = W.bounties.find((b) => b.brand_id === brand.id && b.status === 'live' && ['open', 'invite_only'].includes(b.visibility));
      if (!bounty) continue;
      const cands = W.creators.filter((c) => c.id !== maya?.id && !(W.subsByBounty.get(bounty.id) ?? []).some((s) => s.creator_id === c.id) && c.niches.some((n) => bounty.eligibility?.niches?.includes(n)));
      const creator = cands[(cursor * 11) % Math.max(1, cands.length)];
      if (!creator || usedPairs.has(`${creator.id}|${brand.id}|invite|${bounty.id}`)) continue;
      build({ kind: 'invite', status: w.status, brand, creator, bounty, flow: flowFor('invite', w.status, r), lastAt });
      continue;
    }
    if (w.status === 'accepted' || w.status === 'completed') continue;
    if (w.kind === 'rebuy') {
      const wp = winnerPosts.filter((p) => !usedPairs.has(`${p.creator_id}|${p.brand_id}|rebuy|`) && W.brandById.get(p.brand_id)?.plan !== 'free');
      const p = wp[(cursor * 13) % Math.max(1, wp.length)];
      if (!p) continue;
      build({ kind: 'rebuy', status: w.status, brand: W.brandById.get(p.brand_id), creator: W.creatorById.get(p.creator_id), post: p, postTitle: W.bountyById.get(p.bounty_id)?.title ?? 'a winner', videos: 2, flow: flowFor('rebuy', w.status, r), lastAt });
      continue;
    }
    const fit = fitting(brand);
    const creator = fit[(cursor * 17) % fit.length];
    if (!creator || usedPairs.has(`${creator.id}|${brand.id}|direct|`)) continue;
    build({ kind: 'direct', status: w.status, brand, creator, flow: flowFor('direct', w.status, r), lastAt });
  }

  // top up with plain direct offers if the quotas above could not be met from the data
  let extra = 0;
  while (offers.length < target && extra < 40) {
    extra++;
    const r = rng.fork(`topup:${extra}`);
    const brand = buyers[(extra * 3) % buyers.length];
    const fit = brand ? fitting(brand) : rcCreators;
    const creator = fit[(extra * 19 + 3) % fit.length];
    if (!brand || !creator || usedPairs.has(`${creator.id}|${brand.id}|direct|`)) continue;
    const status = ['awaiting_creator', 'declined', 'expired', 'awaiting_brand', 'withdrawn'][extra % 5];
    build({ kind: 'direct', status, brand, creator, flow: flowFor('direct', status, r), lastAt: lastAtFor(status, r) });
  }

  offers.sort((a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
  return offers.map(({ _sort, ...rest }, i) => ({ id: `offer_${String(i + 1).padStart(4, '0')}`, ...rest }));
}
