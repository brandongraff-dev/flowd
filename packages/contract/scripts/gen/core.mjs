// CORE fixture generator: identity and the marketplace money graph.
// The orchestrator (scripts/generate-fixtures.mjs) calls generate(ctx) first, then gen/ext.mjs generate(ctx, core).
//
// Pipeline (every stage uses its own forked RNG stream, so adding rows to one stage never reshuffles another):
//   people (core-people)  ->  bounties (core-bounties)  ->  submissions as event histories (core-subs)  ->  video analyses (core-analysis)
//   -> attribution links (core-links) -> posts, view curves, metrics, conversions (core-posts) -> settlement plan (core-settle) -> winner ads (core-ads)
//   -> double-entry ledger and wallets (core-ledger) -> referrals / bonuses / prizes / payouts (core-payouts) -> derived state (core-derive)
//   -> Money Clock, invoices, market, ticker, app metrics (core-finish) -> schema rows (core-rows-a / core-rows-b).
// Maya's three solved posts make her facts exact; the pipeline runs a few times until they reconcile to the cent.
// Knobs: tune.viewScale (0.9) puts the typical active creator near $65 to $75 of cleared pay in 30 days; core-analysis calibrates the Flow band
// mix (shift/spread); core-subs scripts the review queue (Lumi's six waiting submissions, 6 open appeals, change requests); core-payouts holds the
// creators the admin scenarios need (tax 3, ID 2, dispute 1, fraud 2) and one failed, one cancelled and one processing payout.
//
// generate() returns EXACTLY the tables owned by core (see the typedef). Extra information for the ext generator rides along on a
// non-enumerable property `__meta` (referral pairs, prizes, direct bounties, renewals ...): it never reaches the JSON files.

import { buildBrands, buildCreators } from './core-people.mjs';
import { buildBounties, finishBountyStatics } from './core-bounties.mjs';
import { buildSubmissions } from './core-subs.mjs';
import { buildAnalyses } from './core-analysis.mjs';
import { buildLinks } from './core-links.mjs';
import { buildPosts, assignPostRoles, buildPostMetrics } from './core-posts.mjs';
import { planPost, sizeBudgets } from './core-settle.mjs';
import { buildAds } from './core-ads.mjs';
import { buildLedger, runWallets } from './core-ledger.mjs';
import { buildExtras, buildPayouts } from './core-payouts.mjs';
import { derivePosts, deriveConversions, deriveBounties, deriveCreators, deriveBrands } from './core-derive.mjs';
import { buildMoneyClock, buildInvoices, buildMarket, buildTicker, buildAppMetrics, clearingCpmModel } from './core-finish.mjs';
import { assignWorkIds, deriveStreaks, deriveTierSince, rowsIdentity, rowsCreators, rowsRateCards, rowsBounties, rowsWork } from './core-rows-a.mjs';
import { finalizeEntities, rowsPosts, rowsAttribution, rowsMoney, rowsMarket, rowsTrust } from './core-rows-b.mjs';
import { mayaPrepare, calibrate, measureMaya } from './core-maya.mjs';
import { CATEGORIES } from './pools.mjs';
import { NOW_EPOCH, DAY_MS, iso } from './core-kit.mjs';

/**
 * @typedef {import('../../types').FixtureMap} FixtureMap
 * @typedef {Pick<FixtureMap,
 *   'world' | 'users' | 'creators' | 'social_accounts' | 'rate_cards' | 'brands' | 'brand_members' | 'apps' | 'bounties' |
 *   'submissions' | 'video_analyses' | 'posts' | 'view_snapshots' | 'post_metrics_daily' | 'post_metrics_hourly' | 'app_metrics_daily' |
 *   'conversions' | 'attribution_links' | 'ads' | 'ledger' | 'payouts' | 'invoices' | 'money_clock' | 'market_series' | 'ticker' |
 *   'brand_scorecards' | 'creator_reputation'
 * >} CoreFixtures
 */

const debug = (...a) => { if (process.env.FLOWD_CORE_DEBUG) console.error('[core]', ...a); };

/** one full pass of the pipeline */
export function pipeline(ctx, tune) {
  const W = { ctx, world: ctx.world, rng: ctx.rng, users: [], usedNames: new Set(['Maya Reyes']), viewScale: tune.viewScale ?? 1, convScale: tune.convScale ?? 1, tune };
  buildBrands(W);
  buildCreators(W);
  buildBounties(W);
  finishBountyStatics(W);
  buildSubmissions(W);
  buildAnalyses(W);
  buildLinks(W);
  buildPosts(W);
  for (const p of W.posts) p.promo = p.s.link?.promo;
  assignPostRoles(W);
  mayaPrepare(W);
  buildPostMetrics(W);
  for (const p of W.posts) planPost(W, p);
  buildAds(W);
  sizeBudgets(W);
  buildLedger(W);
  runWallets(W);
  buildExtras(W);
  buildPayouts(W);
  derivePosts(W);
  deriveConversions(W);
  deriveBounties(W);
  deriveCreators(W);
  deriveBrands(W);
  deriveStreaks(W);
  deriveTierSince(W);
  buildMoneyClock(W);
  return W;
}

/** @param {import('./lib.mjs').Context} ctx @returns {CoreFixtures} */
export function generate(ctx) {
  const tune = { viewScale: 0.9 };
  let W = pipeline(ctx, tune);
  for (let i = 0; i < 8; i++) {
    const exact = calibrate(W);
    debug('maya', JSON.stringify(measureMaya(W)), exact ? 'exact' : 'tuning');
    if (exact) break;
    W = pipeline(ctx, tune);
  }
  debug('maya final', JSON.stringify(measureMaya(W)));
  // ── remaining stages that only read the settled world
  buildInvoices(W);
  buildMarket(W);
  buildTicker(W);
  buildAppMetrics(W);
  // one Silver or Gold creator is on a 12-day pause (Wellbeing Mode): tier and streak are kept, no new work, no rate card
  const onPause = W.creators.filter((c) => !c.persona && ['silver', 'gold'].includes(c.tier) && c.posts.length >= 4 && c.streak >= 1 && !c.livePosts && !c.holdReason && c.posts.every((p) => NOW_EPOCH - p.postedAtMs > 10 * DAY_MS)).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (onPause) onPause.pausedUntil = iso(NOW_EPOCH + 12 * DAY_MS);
  const marketAt = (cat) => { const c = CATEGORIES.find((x) => x.key === cat); return Math.round(clearingCpmModel(c, '2026-10-03')); };
  const rateCards = rowsRateCards(W, marketAt).sort((a, b) => (a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : 0));
  finalizeEntities(W);
  assignWorkIds(W);
  const identity = rowsIdentity(W);
  const creators = rowsCreators(W);
  const work = rowsWork(W);
  const postsPack = rowsPosts(W);
  const attr = rowsAttribution(W);
  const money = rowsMoney(W);
  const market = rowsMarket(W);
  const trust = rowsTrust(W);
  const world = ctx.emptyFor('world');
  const out = {
    world, ...identity, ...creators, rate_cards: rateCards, bounties: rowsBounties(W), ...work, ...postsPack, ...attr, ...money, ...market, ...trust,
    app_metrics_daily: [...W.appDaily].sort((a, b) => (a.app.id < b.app.id ? -1 : a.app.id > b.app.id ? 1 : a.date < b.date ? -1 : 1)).map((r) => ({ app_id: r.app.id, date: r.date, views: r.views, clicks: r.clicks, installs: r.installs, trials: r.trials, paid: r.paid, est_installs: r.est_installs, est_trials: r.est_trials, est_paid: r.est_paid, revenue_cents: r.revenue, posts_live: r.live, new_posts: r.newPosts, new_submissions: r.newSubs, approvals: r.approvals, creator_pay_cents: r.pay, fee_cents: r.fee })),
  };
  Object.defineProperty(out, '__meta', {
    enumerable: false,
    value: {
      referralPairs: W.referralPairs.map((x) => ({ referrer_id: x.referrer.id, referee_id: x.referee.id, paid_cents: x.paid, since: x.since })),
      prizes: W.prizes.map((x) => ({ tournament: x.tournament, place: x.place, creator_id: x.creator.id, amount_cents: x.amount, at: x.at })),
      directBounties: W.bounties.filter((b) => b.direct).map((b) => ({ bounty_id: b.id, brand_id: b.brand.id, app_id: b.app.id, creator_id: b.subs[0]?.creator.id, amount_cents: b.flat_fee_cents })),
      renewals: W.renewals.map((x) => ({ post_id: x.post.id, creator_id: x.post.creator.id, brand_id: x.post.brand.id, fee_cents: x.price, at: x.at })),
      heldPayoutCreators: W.heldCreators.map((c) => ({ creator_id: c.id, reason: c.holdReason })),
      fraudRoles: W.posts.filter((p) => p.role).map((p) => ({ post_id: p.id, role: p.role, score: p.fraud.score })),
      adjustment: W.adjustment ? { creator_id: W.adjustment.creator.id, amount_cents: W.adjustment.amount } : null,
    },
  });
  return /** @type {CoreFixtures} */ (out);
}
