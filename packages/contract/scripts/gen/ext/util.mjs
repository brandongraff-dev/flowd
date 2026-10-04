// Small shared builders for the ext generators: Rights Card, deliverables, money phrases, ids and timestamps.

import { iso, ms, addHours, addDays, usd, pad, sum } from '../lib.mjs';
import { mulRate } from '../../../schema/formulas.mjs';

/** $210 or $210.40, for messages */
export const money = (cents) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-US')}` : usd(cents));
export const roundTo = (cents, step = 500) => Math.max(step, Math.round(cents / step) * step);

/** a counter that hands out sequential ids of a prefix: seq('omsg') -> omsg_1, omsg_2 ... */
export function makeSeq() {
  const n = new Map();
  return (prefix) => {
    const k = (n.get(prefix) ?? 0) + 1;
    n.set(prefix, k);
    return `${prefix}_${k}`;
  };
}

export const hoursBefore = (isoStr, h) => addHours(isoStr, -h);
export const capNow = (isoStr, now) => (ms(isoStr) > ms(now) ? now : isoStr);
export const clampTime = (isoStr, lo, hi) => iso(Math.min(ms(hi), Math.max(ms(lo), ms(isoStr))));
/** deterministic pick of an element by index (wraps) */
export const at = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

export const PLATFORM_LABEL = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', meta: 'Meta' };
const TERRITORY_NAME = 'Worldwide';

/** The plain-language paragraph of a Rights Card. */
export function rightsSummary(card, brandName) {
  const plats = (card.ad_platforms ?? []).map((p) => PLATFORM_LABEL[p] ?? p);
  const usage = card.paid_ads_days > 0
    ? `${brandName} may run the video as a paid ad on ${plats.join(' and ') || 'the listed platforms'} for ${card.paid_ads_days} days from approval${card.whitelisting ? ', using a Spark code or partnership permission you approve' : ''}. Renewal is priced at ${Math.round(card.renewal_pct_per_30d * 100)}% of the base fee per extra 30 days.`
    : `${brandName} does not get paid-ad usage with this card; it is organic posting only.`;
  const excl = card.exclusivity_days > 0 ? ` You agree not to make a competing app video for ${card.exclusivity_days} days.` : ' No exclusivity.';
  return `Organic posting on your own account is always included. ${usage}${excl} AI likeness is ${card.ai_likeness ? 'on by agreement' : 'off'}.`;
}

/** Build a RightsCard value with a generated summary. */
export function rightsCard({ brandName, paid_ads_days = 90, ad_platforms = ['tiktok', 'meta'], whitelisting = true, exclusivity_days = 0, renewal = 0.25, territory = TERRITORY_NAME }) {
  const card = { organic: true, paid_ads_days, ad_platforms: paid_ads_days > 0 ? ad_platforms : [], whitelisting: paid_ads_days > 0 && whitelisting, renewal_pct_per_30d: renewal, exclusivity_days, ai_likeness: false, territory };
  return { ...card, summary: rightsSummary(card, brandName) };
}

/** Deliverables for offers and auctions. */
export function deliverables({ videos = 1, min = 15, max = 30, platforms = ['tiktok'], regions = ['US'], face = true } = {}) {
  return { videos_per_creator: videos, min_duration_s: min, max_duration_s: max, aspect: '9:16', platforms, regions, require_face: face, music_policy: 'commercial_library', ai_policy: 'not_allowed' };
}

/** all-in price: amount + round(amount x take rate) */
export const allIn = (amount, takeRate) => amount + mulRate(amount, takeRate);

export const dayCount = (fromIso, toIso) => Math.round((ms(toIso) - ms(fromIso)) / 86_400_000);
export { sum, pad, addDays, addHours, mulRate };

/** The tier multiplier used when a market price is suggested for a creator (basis text in RateSuggestion). */
export const TIER_MULT = { bronze: 1.0, silver: 1.3, gold: 1.6, platinum: 2.0, elite: 2.6 };
