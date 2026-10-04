// A read-only "world view" over the core fixtures: indexes, lookups and small derived numbers shared by every ext generator.
// Everything here is derived from `core` (never invented) and tolerant of optional fields, so the ext modules stay short.

import { NOW, NOW_EPOCH, ms, iso, groupBy, indexBy, sum, median, quantile, slugify, fmtMoney, isoWeek, isoWeekStart, nextWeekStart, DAY_MS, HOUR_MS } from '../lib.mjs';

/** earning types that credit a creator account */
export const EARNING_TYPES = new Set(['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral']);
export const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'elite'];
export const SETTLED_POST = new Set(['cleared', 'paid']);
export const APPROVED_SUB = new Set(['approved', 'posted', 'released']);

const rowsOf = (core, t) => (Array.isArray(core[t]) ? core[t] : []);

/**
 * Build the world view.
 * @param {import('../lib.mjs').Context} ctx
 * @param {Record<string, any>} core
 */
export function buildWorld(ctx, core) {
  const t = (name) => rowsOf(core, name);
  const W = { ctx, core, now: NOW, nowMs: NOW_EPOCH, C: ctx.C, t };

  // ── people ─────────────────────────────────────────────────────────────────────────────────
  W.users = t('users');
  W.userById = indexBy(W.users);
  W.creators = t('creators');
  W.creatorById = indexBy(W.creators);
  W.maya = W.creatorById.get(ctx.world.PERSONAS.creator.creator_id) ?? null;
  W.creatorByHandle = indexBy(W.creators, 'handle');
  W.creatorOfUser = indexBy(W.creators, 'user_id');
  W.socials = t('social_accounts');
  W.socialsByCreator = groupBy(W.socials, 'creator_id');
  W.rateCards = t('rate_cards');
  W.rateCardByCreator = indexBy(W.rateCards, 'creator_id');
  W.reputationByCreator = indexBy(t('creator_reputation'), 'creator_id');

  // ── brands ─────────────────────────────────────────────────────────────────────────────────
  W.brands = t('brands');
  W.brandById = indexBy(W.brands);
  W.lumi = W.brandById.get(ctx.world.PERSONAS.brand.brand_id) ?? null;
  W.members = t('brand_members').map((m) => ({ ...m, user: W.userById.get(m.user_id) }));
  W.memberById = indexBy(W.members);
  W.membersByBrand = groupBy(W.members, 'brand_id');
  W.memberByUser = new Map(W.members.map((m) => [`${m.brand_id}|${m.user_id}`, m]));
  W.apps = t('apps');
  W.appById = indexBy(W.apps);
  W.appsByBrand = groupBy(W.apps, 'brand_id');
  W.scorecardByBrand = indexBy(t('brand_scorecards'), 'brand_id');

  // ── work ───────────────────────────────────────────────────────────────────────────────────
  W.bounties = t('bounties');
  W.bountyById = indexBy(W.bounties);
  W.bountiesByBrand = groupBy(W.bounties, 'brand_id');
  W.subs = t('submissions');
  W.subById = indexBy(W.subs);
  W.subsByCreator = groupBy(W.subs, 'creator_id');
  W.subsByBounty = groupBy(W.subs, 'bounty_id');
  W.subsByBrand = groupBy(W.subs, 'brand_id');
  W.analyses = t('video_analyses');
  W.analysesBySub = groupBy(W.analyses, 'submission_id');
  W.posts = t('posts');
  W.postById = indexBy(W.posts);
  W.postBySub = indexBy(W.posts, 'submission_id');
  W.postsByCreator = groupBy(W.posts, 'creator_id');
  W.postsByBounty = groupBy(W.posts, 'bounty_id');
  W.postsByBrand = groupBy(W.posts, 'brand_id');
  W.postsByApp = groupBy(W.posts, 'app_id');
  W.snapshotsByPost = groupBy(t('view_snapshots'), 'post_id');
  W.dailyByPost = groupBy(t('post_metrics_daily'), 'post_id');
  W.ads = t('ads');
  W.adById = indexBy(W.ads);
  W.links = t('attribution_links');
  W.linkById = indexBy(W.links);
  W.conversions = t('conversions');

  // ── money ──────────────────────────────────────────────────────────────────────────────────
  W.ledger = t('ledger');
  W.earnRows = W.ledger.filter((r) => typeof r.account === 'string' && r.account.startsWith('creator:') && EARNING_TYPES.has(r.entry_type) && r.amount_cents > 0 && r.status !== 'reversed');
  W.earnByCreator = groupBy(W.earnRows, (r) => r.creator_id ?? r.account.slice(8));
  W.earnByPost = groupBy(W.earnRows.filter((r) => r.post_id), 'post_id');
  W.payouts = t('payouts');
  W.payoutById = indexBy(W.payouts);
  W.payoutsByCreator = groupBy(W.payouts, 'creator_id');
  W.moneyClock = t('money_clock');
  W.marketSeries = t('market_series');
  W.ticker = core.ticker ?? { totals: {}, events: [] };

  // ── time ───────────────────────────────────────────────────────────────────────────────────
  W.week = { id: isoWeek(NOW), start: isoWeekStart(NOW), next: nextWeekStart(NOW) };
  W.prevWeek = { id: isoWeek(iso(ms(W.week.start) - DAY_MS)), start: iso(ms(W.week.start) - 7 * DAY_MS) };

  /** ISO week ids of the last n weeks, oldest first, ending with the current week */
  W.weekIds = (n) => Array.from({ length: n }, (_, k) => isoWeek(iso(ms(W.week.start) - (n - 1 - k) * 7 * DAY_MS)));
  let wp = null;
  /** posts per ISO week of a creator: Map<'2026-W40', count> */
  W.weeklyPosts = (creatorId) => {
    wp ??= new Map();
    if (!wp.has(creatorId)) {
      const m = new Map();
      for (const p of W.postsByCreator.get(creatorId) ?? []) { const k = isoWeek(p.posted_at); m.set(k, (m.get(k) ?? 0) + 1); }
      wp.set(creatorId, m);
    }
    return wp.get(creatorId);
  };

  // ── lookups ────────────────────────────────────────────────────────────────────────────────
  W.creatorName = (id) => W.creatorById.get(id)?.display_name ?? id;
  W.handle = (id) => W.creatorById.get(id)?.handle ?? String(id).replace(/^cr_/, '');
  W.brandName = (id) => W.brandById.get(id)?.name ?? id;
  W.appName = (id) => W.appById.get(id)?.name ?? id;
  W.appSlug = (idOrApp) => String(typeof idOrApp === 'string' ? idOrApp : idOrApp.id).replace(/^app_/, '');
  W.firstName = (full) => String(full).split(/\s+/)[0];
  W.slugOf = (id) => String(id).replace(/^[a-z]+_/, '');
  W.userName = (userId) => W.userById.get(userId)?.display_name ?? userId;
  W.memberName = (memberId) => W.memberById.get(memberId)?.user?.display_name ?? memberId;
  W.membersOf = (brandId, roles) => (W.membersByBrand.get(brandId) ?? []).filter((m) => m.status !== 'removed' && (!roles || roles.includes(m.role)));
  /** the decision-making members of a brand, owner first */
  W.deciders = (brandId) => {
    const ms_ = W.membersOf(brandId, ['owner', 'admin', 'reviewer']);
    return ms_.length ? ms_ : W.membersOf(brandId);
  };
  W.ownerOf = (brandId) => W.membersOf(brandId, ['owner'])[0] ?? W.membersOf(brandId)[0] ?? null;
  W.adminUsers = W.users.filter((u) => u.role === 'admin');
  W.opsUserId = W.userById.has(ctx.world.PERSONAS.admin.user_id) ? ctx.world.PERSONAS.admin.user_id : (W.adminUsers[0]?.id ?? 'usr_ops');
  W.otherAdminId = W.adminUsers.find((u) => u.id !== W.opsUserId)?.id ?? W.opsUserId;
  W.tierRank = (tier) => TIER_ORDER.indexOf(tier);
  W.primarySocial = (creatorId) => {
    const list = W.socialsByCreator.get(creatorId) ?? [];
    return list.find((s) => s.primary) ?? list[0] ?? null;
  };
  W.medianViews = (creatorId) => {
    const s = W.primarySocial(creatorId);
    return s?.median_views_28d ?? s?.avg_views_28d ?? 9000;
  };
  W.categoryOfBounty = (b) => W.appById.get(b.app_id)?.category ?? 'lifestyle';
  W.clearing = (category) => {
    let best = null;
    for (const r of W.marketSeries) if (r.category === category && (!best || r.date > best.date)) best = r;
    return best;
  };
  W.clearingCpm = (category, fallback = 200) => W.clearing(category)?.clearing_cpm_cents ?? fallback;

  // ── derived money ──────────────────────────────────────────────────────────────────────────
  /** timestamp an earning row counted as cleared (or its posting time) */
  W.earnedAt = (r) => r.cleared_at ?? r.posted_at;
  /** creator pay actually settled on a post (cleared and paid rows, all earning types) */
  W.postPayCents = (post) => {
    const rows = W.earnByPost.get(post.id);
    if (rows?.length) return sum(rows, (r) => r.amount_cents);
    const e = post.earnings;
    return e ? e.total_cents : 0;
  };
  /** cleared + paid earnings of a creator with cleared_at in [fromIso, toIso) */
  W.clearedBetween = (creatorId, fromIso, toIso) => {
    const a = ms(fromIso);
    const b = ms(toIso);
    return sum((W.earnByCreator.get(creatorId) ?? []).filter((r) => (r.status === 'cleared' || r.status === 'paid') && ms(W.earnedAt(r)) >= a && ms(W.earnedAt(r)) < b), (r) => r.amount_cents);
  };
  /** lifetime cleared (ledger only, no carry-over) up to a time */
  W.clearedUpTo = (creatorId, toIso) => W.clearedBetween(creatorId, '2026-01-01T00:00:00Z', toIso);
  /** earned this week including pending and accruing (money clock first, ledger as the fallback) */
  W.earnedInRange = (creatorId, fromIso, toIso) => {
    const a = ms(fromIso);
    const b = ms(toIso);
    if (W.moneyClock.length) {
      return sum((W.mcByCreator().get(creatorId) ?? []).filter((r) => ms(r.earned_at) >= a && ms(r.earned_at) < b && r.state !== 'reversed'), (r) => r.amount_cents);
    }
    return sum((W.earnByCreator.get(creatorId) ?? []).filter((r) => ms(r.posted_at) >= a && ms(r.posted_at) < b), (r) => r.amount_cents);
  };
  let mc = null;
  W.mcByCreator = () => (mc ??= groupBy(W.moneyClock, 'creator_id'));
  /** share of settled posts: used for tag-based stats */
  W.settledPosts = W.posts.filter((p) => SETTLED_POST.has(p.status));
  W.liveBounties = W.bounties.filter((b) => b.status === 'live');

  // ── stats helpers ──────────────────────────────────────────────────────────────────────────
  /** median views, trial rate (trials per tracked install), approval rate of a post set */
  W.postStats = (posts) => {
    const views = posts.map((p) => p.views);
    const installs = sum(posts, (p) => p.funnel?.installs ?? 0);
    const trials = sum(posts, (p) => p.funnel?.trials ?? 0);
    const paid = sum(posts, (p) => p.funnel?.paid ?? 0);
    return { n: posts.length, median_views: Math.round(median(views)), installs, trials, paid, trial_rate: installs > 0 ? trials / installs : 0, trial_to_paid: trials > 0 ? paid / trials : 0 };
  };
  W.maxIso = (list) => iso(Math.max(...list.filter(Boolean).map((x) => ms(x))));
  W.minIso = (list) => iso(Math.min(...list.filter(Boolean).map((x) => ms(x))));
  W.money = fmtMoney;
  W.quantile = quantile;
  W.DAY = DAY_MS;
  W.HOUR = HOUR_MS;
  W.slug = slugify;
  return W;
}
