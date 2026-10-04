// Sealed-bid, second-price auctions for the top creators' weekly slots (Platinum and Elite).

import { iso, ms, addHours, artSeed, hoursAgo } from '../lib.mjs';
import * as P from '../pools.mjs';
import { allIn, deliverables, rightsCard, roundTo } from './util.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const BID_NOTES = [
  'We would book a three-video launch pack if the slot has room.', 'Happy to extend usage to 120 days at the same price.', 'Launch week is the 14th; this slot lines up perfectly.', 'Second slot for us this quarter. Your Day 7 format worked well last time.', 'We can brief within a day of award.',
];

/** Direct bounties whose delivering creator is Platinum or Elite: reserved for auction results so offers do not use them. */
export function auctionBounties(W) {
  return W.bounties.filter((b) => b.type === 'direct' && b.funded).filter((b) => (W.subsByBounty.get(b.id) ?? []).some((s) => ['platinum', 'elite'].includes(W.creatorById.get(s.creator_id)?.tier))).slice(0, 3);
}

export function genAuctions(W, rng, seq) {
  const now = W.now;
  const top = W.creators.filter((c) => ['platinum', 'elite'].includes(c.tier)).sort((a, b) => b.lifetime_cleared_cents - a.lifetime_cleared_cents);
  const gold = W.creators.filter((c) => c.tier === 'gold').sort((a, b) => b.lifetime_cleared_cents - a.lifetime_cleared_cents);
  const creators = top.length >= 4 ? top : [...top, ...gold].slice(0, 6);
  if (!creators.length) return [];
  const bidders = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.wallet_balance_cents >= 20_000);
  const reservedBounties = auctionBounties(W);
  const plan = [
    { status: 'open', opens: -54, closes: 78, slots: 2 },
    { status: 'open', opens: -30, closes: 96, slots: 1 },
    { status: 'scheduled', opens: 40, closes: 40 + 120, slots: 3 },
    { status: 'awarded', closes: -24 * 4, dur: 5 * 24, slots: 2, bounty: 0 },
    { status: 'awarded', closes: -24 * 11, dur: 6 * 24, slots: 1, bounty: 1 },
    { status: 'awarded', closes: -24 * 19, dur: 4 * 24, slots: 3, bounty: 2 },
    { status: 'no_bids', closes: -24 * 6, dur: 4 * 24, slots: 2 },
    { status: 'cancelled', opens: -48, closes: 24 * 4, slots: 1 },
  ];
  const rows = [];
  plan.forEach((p, i) => {
    const r = rng.fork(`auction:${i}`);
    const bounty = p.bounty !== undefined ? reservedBounties[p.bounty] : undefined;
    const bountyCreatorId = bounty ? (W.subsByBounty.get(bounty.id) ?? []).find((s) => ['platinum', 'elite'].includes(W.creatorById.get(s.creator_id)?.tier))?.creator_id : undefined;
    const creator = (bountyCreatorId && W.creatorById.get(bountyCreatorId)) ?? creators[i % creators.length];
    const rc = W.rateCardByCreator.get(creator.id);
    const base = rc ? rc.price_per_video_cents : roundTo((W.medianViews(creator.id) / 1000) * 260 * 2, 500);
    const reserve = Math.max(W.C.auctions.reserve_floor_cents, roundTo(base * r.float(0.55, 0.75), 500));
    const closesAt = p.dur ? iso(ms(now) + p.closes * 3_600_000) : addHours(now, p.closes);
    const opensAt = p.dur ? addHours(closesAt, -p.dur) : addHours(now, p.opens);
    // the pool says "campaign"; flowd's word is bounty
    const title = P.AUCTION_TITLES[i % P.AUCTION_TITLES.length].replace(/campaign/i, 'bounty');
    const slots = p.slots;
    const rights = rightsCard({ brandName: 'The winning brand', paid_ads_days: 90, exclusivity_days: r.chance(0.3) ? 14 : 0 });
    // a title that names a niche ("Weekend slot: fitness") sets who the slot is made for
    const niche = /: ([a-z]+)$/i.exec(title)?.[1] ?? P.NICHES.find((n) => n.key === creator.niches?.[0])?.label ?? 'app';
    const description = `${slots === 1 ? 'One slot' : `${slots} slots`} from @${creator.handle} (${creator.tier[0].toUpperCase()}${creator.tier.slice(1)}): ${title.toLowerCase()}, made for ${niche.toLowerCase()} apps. Sealed bids, second price: the ${slots === 1 ? 'highest bid wins and pays' : `${slots} highest bids win and all pay`} the highest losing bid, or the reserve if nobody outbids it. Organic posting plus 90 days of paid usage is included; renewals are 25% of the base fee per 30 days.`;
    const bids = [];
    const makeBids = (n, status) => {
      const pool = bidders.filter((b) => b.id !== W.lumi?.id || r.chance(0.5));
      const chosen = r.sample(bounty && !r.chance(0) ? [W.brandById.get(bounty.brand_id), ...pool.filter((b) => b.id !== bounty.brand_id)] : pool, n).filter(Boolean);
      if (bounty && !chosen.some((b) => b.id === bounty.brand_id)) chosen[0] = W.brandById.get(bounty.brand_id);
      const amounts = chosen.map((_, k) => roundTo(reserve * (1.05 + k * r.float(0.14, 0.32) + r.float(0, 0.1)), 500)).sort((a, b) => b - a);
      // the delivering brand of the resulting direct bounty always has the top bid
      chosen.sort((a, b) => (a.id === bounty?.brand_id ? -1 : b.id === bounty?.brand_id ? 1 : 0));
      chosen.forEach((b, k) => {
        const mem = W.deciders(b.id)[0] ?? W.membersOf(b.id)[0];
        const amount = amounts[k];
        const placed = iso(Math.min(ms(now) - 30 * 60_000, ms(opensAt) + (ms(status === 'open' ? now : closesAt) - ms(opensAt)) * r.float(0.08, 0.97)));
        const take = W.C.plans[b.plan]?.take_rate ?? 0.12;
        bids.push({
          id: seq('bid'), brand_id: b.id, bidder_member_id: mem.id, amount_cents: amount, status: 'sealed', placed_at: placed, escrow_hold_cents: allIn(amount, take),
          ...(r.chance(0.35) ? { note: pick(r, BID_NOTES) } : {}),
        });
      });
      bids.sort((a, b) => (a.placed_at < b.placed_at ? -1 : 1));
    };
    let clearing;
    let winners;
    let awardedAt;
    if (p.status === 'open') makeBids(r.int(3, 5), 'open');
    else if (p.status === 'awarded') {
      makeBids(Math.max(slots + 1, r.int(3, 6)), 'closed');
      const byAmt = [...bids].sort((a, b) => b.amount_cents - a.amount_cents);
      const win = byAmt.slice(0, slots);
      clearing = bids.length > slots ? byAmt[slots].amount_cents : reserve;
      winners = win.map((b) => b.id);
      bids.forEach((b) => {
        if (winners.includes(b.id)) { b.status = 'won'; b.pays_cents = clearing; } else b.status = 'lost';
      });
      awardedAt = addHours(closesAt, r.int(1, 3));
    } else if (p.status === 'cancelled') {
      makeBids(2, 'open');
      bids.forEach((b) => { b.status = 'withdrawn'; });
    }
    const lastBid = bids.length ? bids[bids.length - 1].placed_at : opensAt;
    const row = {
      _sort: closesAt,
      creator_id: creator.id, title, description, status: p.status, slots, reserve_cents: reserve,
      deliverables: deliverables({ videos: 1, min: 20, max: 40, platforms: ['tiktok', 'instagram'], regions: ['US', 'CA', 'GB'], face: true }),
      rights_card: rights, opens_at: opensAt, closes_at: closesAt, art: artSeed(r, { pattern: i % 2 ? 'orbs' : 'waves', label: title }),
      bids, bids_count: bids.length,
      ...(clearing !== undefined ? { clearing_price_cents: clearing, winning_bid_ids: winners } : {}),
      ...(awardedAt ? { awarded_at: awardedAt } : {}),
      created_at: p.status === 'scheduled' ? hoursAgo(r.int(6, 40)) : addHours(opensAt, -r.int(20, 70)),
      updated_at: awardedAt ?? (p.status === 'cancelled' ? hoursAgo(r.int(2, 20)) : p.status === 'open' ? lastBid : p.status === 'scheduled' ? hoursAgo(r.int(1, 5)) : addHours(closesAt, 1)),
    };
    if (p.status === 'awarded' && bounty) row.resulting_bounty_ids = [bounty.id];
    if (ms(row.created_at) < ms('2026-07-06T00:00:00Z')) row.created_at = '2026-07-06T00:00:00Z';
    rows.push(row);
  });
  rows.sort((a, b) => (a._sort < b._sort ? -1 : 1));
  return rows.map(({ _sort, ...rest }, i) => ({ id: `auc_${String(i + 1).padStart(3, '0')}`, ...rest }));
}
