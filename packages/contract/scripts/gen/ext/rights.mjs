// Rights grants (the Rights Vault) and brand CRM lists.

import { iso, ms, addDays, slugify } from '../lib.mjs';
import { mulRate } from '../../../schema/formulas.mjs';
import { SETTLED_POST } from './world.mjs';

const DAY = 86_400_000;

export function genRights(W, rng, seq) {
  const now = W.now;
  const nowMs = ms(now);
  const cfg = W.C.rights;
  const rows = [];
  const lumi = W.lumi;
  const maya = W.maya;
  const daysLeft = (endsAt) => (ms(endsAt) - nowMs) / DAY;
  const alertsFor = (endsAt) => {
    const d = daysLeft(endsAt);
    return cfg.expiry_alert_days.filter((x) => d <= x).sort((a, b) => b - a);
  };
  const statusFor = (endsAt) => {
    const d = daysLeft(endsAt);
    return d <= 0 ? 'expired' : d <= 30 ? 'expiring' : 'active';
  };
  const baseOf = (post) => W.postPayCents(post);

  const mk = (post, scope, extra) => {
    const sub = W.subById.get(post.submission_id);
    const bounty = W.bountyById.get(post.bounty_id);
    const base = baseOf(post);
    const pct = sub?.rights_card?.renewal_pct_per_30d ?? bounty?.rights_card?.renewal_pct_per_30d ?? cfg.renewal_fee_pct_of_base_per_30d;
    return {
      post_id: post.id, submission_id: post.submission_id, bounty_id: post.bounty_id, brand_id: post.brand_id, app_id: post.app_id, creator_id: post.creator_id,
      scope, base_fee_cents: base, renewal_pct_per_30d: pct, renewal_price_cents: mulRate(base, pct), renewals: [], ai_likeness: false, ...extra,
    };
  };
  const finish = (row, endsAt, startsAt) => {
    if (endsAt) {
      row.ends_at = endsAt;
      row.alerts_sent = alertsFor(endsAt);
      row.status = row.status ?? statusFor(endsAt);
    } else { row.alerts_sent = []; row.status = row.status ?? 'active'; }
    row.starts_at = startsAt;
    row.created_at = startsAt;
    const lastAlertAt = row.alerts_sent.length && endsAt ? addDays(endsAt, -Math.min(...row.alerts_sent)) : startsAt;
    row.updated_at = iso(Math.min(nowMs - 3_600_000, Math.max(ms(startsAt), ms(lastAlertAt), ...(row.renewals ?? []).map((x) => ms(x.at)))));
    rows.push(row);
    return row;
  };

  // ── 1. Maya's organic rows (the always-included licence on every one of her posts) ───────────────────
  if (maya) {
    for (const p of W.postsByCreator.get(maya.id) ?? []) {
      const sub = W.subById.get(p.submission_id);
      const row = mk(p, 'organic', { status: p.status === 'removed' ? 'revoked' : 'active' });
      if (p.status === 'removed') { row.revoked_at = p.removed_at ?? addDays(p.posted_at, 2); row.revoke_reason = 'Post removed by the creator'; }
      finish(row, undefined, sub?.approved_at ?? p.posted_at);
    }
  }

  // ── 2. promoted posts: the paid-ad licence, plus a Spark code or partnership permission ──────────────
  const adPostIds = new Set();
  for (const ad of W.ads) {
    const post = W.postById.get(ad.post_id);
    if (!post) continue;
    adPostIds.add(post.id);
    const sub = W.subById.get(post.submission_id);
    const cardTerm = sub?.rights_card?.paid_ads_days ?? W.bountyById.get(post.bounty_id)?.rights_card?.paid_ads_days;
    const term = cardTerm || 90;
    const startsAt = sub?.approved_at ?? post.posted_at;
    const endsAt = ad.rights_ends_at ?? addDays(startsAt, term);
    // a Rights Card with no paid usage grants no paid-ad licence: a request to promote such a post can only be declined or negotiated
    const hasLicence = cardTerm !== 0;
    if (hasLicence) {
      // the licence itself
      const lic = mk(post, 'paid_ads', { platform: ad.platform, ad_id: ad.id, status: ad.status === 'declined' ? 'revoked' : undefined });
      if (ad.status === 'declined') { lic.revoked_at = ad.permission_requested_at; lic.revoke_reason = 'The creator declined the permission request'; }
      finish(lic, endsAt, startsAt);
    }
    // the platform grant
    const spark = ad.kind === 'spark_ad';
    const stat = ad.status === 'requested' ? 'pending_permission' : ad.status === 'declined' ? 'revoked' : ad.status === 'expired' ? 'expired' : undefined;
    const g = mk(post, spark ? 'spark_code' : 'partnership_permission', {
      platform: ad.platform, ad_id: ad.id, ...(spark && ad.spark_code ? { spark_code: ad.spark_code, code_duration_days: ad.code_duration_days ?? 60 } : {}), ...(stat ? { status: stat } : {}),
    });
    const gStart = ad.permission_granted_at ?? ad.started_at ?? ad.permission_requested_at;
    const gEnd = spark ? ad.code_expires_at ?? addDays(gStart, g.code_duration_days ?? 60) : undefined;
    if (ad.status === 'declined') { g.revoked_at = ad.permission_requested_at; g.revoke_reason = 'The creator declined the permission request'; }
    if (ad.status === 'requested') { finish(g, gEnd, ad.permission_requested_at); g.alerts_sent = []; } else finish(g, gEnd ?? (hasLicence ? endsAt : undefined), gStart);
  }

  // ── 3. paid-ad licences for approved posts (the Rights Vault of every brand) ──────────────────────────
  const taken = new Set(rows.filter((x) => x.scope === 'paid_ads').map((x) => x.post_id));
  const cands = [];
  for (const p of W.posts) {
    if (taken.has(p.id)) continue;
    const sub = W.subById.get(p.submission_id);
    const term = sub?.rights_card?.paid_ads_days ?? W.bountyById.get(p.bounty_id)?.rights_card?.paid_ads_days ?? 0;
    if (!(term > 0) || baseOf(p) <= 0) continue;
    const startsAt = sub?.approved_at ?? p.posted_at;
    cands.push({ p, sub, term, startsAt, endsAt: addDays(startsAt, term), left: daysLeft(addDays(startsAt, term)) });
  }
  // keep the story honest: Lumi's licences all appear; a modest number of expiring ones; the rest sampled across brands
  const rr = rng.fork('rg:sample');
  const isExpiring = (c) => c.left > 0 && c.left <= 30;
  const expiringAll = cands.filter(isExpiring);
  const keepExpiring = new Set([...expiringAll.filter((c) => c.p.creator_id === maya?.id), ...expiringAll.filter((c) => c.p.brand_id === lumi?.id).slice(0, 4), ...rr.shuffle(expiringAll.filter((c) => c.p.brand_id !== lumi?.id && c.p.creator_id !== maya?.id)).slice(0, 3)]);
  const pool = cands.filter((c) => !isExpiring(c) || keepExpiring.has(c));
  const lumiC = pool.filter((c) => c.p.brand_id === lumi?.id);
  const mayaC = pool.filter((c) => c.p.creator_id === maya?.id);
  const rest = pool.filter((c) => c.p.brand_id !== lumi?.id && c.p.creator_id !== maya?.id);
  const expiringRest = rest.filter(isExpiring);
  const expiredRest = rr.shuffle(rest.filter((c) => c.left <= 0)).slice(0, 16);
  const activeRest = rr.shuffle(rest.filter((c) => c.left > 30));
  const want = 190 - rows.length;
  const picked = [...lumiC, ...mayaC, ...expiringRest, ...expiredRest];
  for (const c of activeRest) { if (picked.length >= want) break; picked.push(c); }
  // if there are too many (a big Lumi history), keep the most recent
  const final = picked.length > want ? picked.sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)).slice(0, want) : picked;
  for (const c of final) {
    const row = mk(c.p, 'paid_ads', { platform: c.sub?.rights_card?.ad_platforms?.[0] ?? 'tiktok' });
    if (['removed', 'clawed_back'].includes(c.p.status)) { row.status = 'revoked'; row.revoked_at = c.p.removed_at ?? addDays(c.p.posted_at, 3); row.revoke_reason = c.p.status === 'clawed_back' ? 'Post clawed back after a fraud decision' : 'Post removed by the creator'; }
    finish(row, c.endsAt, c.startsAt);
  }

  // ── 4. two renewals and three renewal requests on grants that are close to ending ────────────────────
  const rn = rng.fork('rg:renew');
  const closing = rows.filter((x) => x.scope === 'paid_ads' && !['revoked', 'pending_permission'].includes(x.status) && x.ends_at && daysLeft(x.ends_at) > -30 && daysLeft(x.ends_at) <= 30 && !x.ad_id);
  rn.shuffle(closing).slice(0, 3).forEach((g, i) => {
    if (i < 3) {
      g.status = 'renewal_requested';
    }
  });
  const toRenew = rows.filter((x) => x.scope === 'paid_ads' && x.status === 'expired' && x.renewal_price_cents > 0).slice(0, 1).concat(rows.filter((x) => x.scope === 'paid_ads' && x.status === 'expiring' && x.renewal_price_cents > 0 && !x.ad_id).slice(0, 1));
  toRenew.forEach((g) => {
    const days = 30;
    const at = addDays(g.ends_at, -rn.int(1, 6));
    if (ms(at) > nowMs) return;
    const brandMember = W.deciders(g.brand_id)[0];
    g.renewals = [{ at, days, fee_cents: g.renewal_price_cents * (days / 30), ...(brandMember ? { requested_by_member_id: brandMember.id } : {}) }];
    g.ends_at = addDays(g.ends_at, days);
    g.alerts_sent = alertsFor(g.ends_at);
    g.status = statusFor(g.ends_at);
    g.updated_at = iso(Math.min(nowMs - 3_600_000, Math.max(ms(at), ms(g.updated_at))));
  });

  rows.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : a.post_id < b.post_id ? -1 : 1));
  return rows.map((row, i) => ({ id: `rg_${String(i + 1).padStart(4, '0')}`, ...row }));
}

// ── CRM lists ──────────────────────────────────────────────────────────────────────────────────────────
const TAGS = ['fast turnaround', 'strong hooks', 'face on camera', 'screen-recording led', 'reliable', 'rebuy candidate', 'US audience', 'budget friendly'];
export function genBrandLists(W, rng) {
  const now = W.now;
  const rows = [];
  const brands = [W.lumi, ...W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== W.lumi?.id)].filter(Boolean);
  const perBrand = (b) => {
    const posts = (W.postsByBrand.get(b.id) ?? []).filter((p) => SETTLED_POST.has(p.status));
    const by = new Map();
    for (const p of posts) {
      const e = by.get(p.creator_id) ?? { id: p.creator_id, posts: 0, trials: 0, installs: 0, views: 0, first: p.posted_at, last: p.posted_at };
      e.posts++; e.trials += p.funnel?.trials ?? 0; e.installs += p.funnel?.installs ?? 0; e.views += p.views;
      if (p.posted_at < e.first) e.first = p.posted_at;
      if (p.posted_at > e.last) e.last = p.posted_at;
      by.set(p.creator_id, e);
    }
    return [...by.values()].sort((a, b) => b.trials - a.trials || b.views - a.views);
  };
  const noteFor = (e, b, rr) => {
    const top = (W.postsByBrand.get(b.id) ?? []).filter((p) => p.creator_id === e.id).sort((a, c) => (c.funnel?.trials ?? 0) - (a.funnel?.trials ?? 0))[0];
    const title = top && W.bountyById.get(top.bounty_id)?.title;
    if (e.posts === 0) return 'Strong hooks in AI-tools reviews. Not booked with us yet.';
    if (e.trials > 0 && e.installs > 0) return `${(100 * e.trials / e.installs).toFixed(1)}% of tracked installs started a trial across ${e.posts} post${e.posts > 1 ? 's' : ''}${title ? `, best on "${title}"` : ''}.`;
    return `${e.posts} approved post${e.posts > 1 ? 's' : ''}, median ${Math.round(e.views / e.posts / 100) / 10}k views${title ? `, strongest on "${title}"` : ''}.`;
  };
  brands.slice(0, 9).forEach((b, bi) => {
    const r = rng.fork(`list:${b.id}`);
    const mem = b.id === W.lumi?.id ? W.memberById.get(W.ctx.world.PERSONAS.brand.member_id) : W.ownerOf(b.id);
    const ranked = perBrand(b);
    if (!mem) return;
    const mkList = (name, isFav, members, createdAt) => {
      rows.push({
        brand_id: b.id, name, is_favourites: isFav,
        members: members.map((e, i) => ({
          creator_id: e.id, note: noteFor(e, b, r), tags: r.sample(TAGS, r.int(1, 3)),
          added_at: iso(Math.min(ms(now) - 3_600_000, ms(createdAt) + (i + 1) * r.int(12, 140) * 3_600_000)),
        })),
        created_by_member_id: mem.id, created_at: createdAt, updated_at: iso(Math.min(ms(now) - 3_600_000, Math.max(...members.map((_, i) => ms(createdAt) + (i + 1) * 90 * 3_600_000), ms(createdAt) + 3_600_000))),
      });
    };
    const favs = ranked.slice(0, Math.min(ranked.length, r.int(3, 7)));
    const created = iso(Math.max(ms(b.created_at) + 5 * DAY, ms(now) - r.int(20, 70) * DAY));
    if (favs.length >= 2) mkList('Favourites', true, favs, created);
    if (b.id === W.lumi?.id) {
      const hookers = (W.creators.filter((c) => c.niches?.some((n) => ['ai_tools', 'tech', 'beauty'].includes(n)) && ['silver', 'gold', 'platinum', 'elite'].includes(c.tier))).slice(0, 6).map((c) => ({ id: c.id, posts: 0, trials: 0, installs: 0, views: W.medianViews(c.id), first: now, last: now }));
      const sorted = hookers.map((e) => { const x = ranked.find((y) => y.id === e.id); return x ?? e; });
      mkList('AI-tools hooks', false, sorted, iso(ms(now) - 21 * DAY));
    } else if (bi % 3 === 1 && ranked.length > 5) mkList(bi % 2 ? 'Rebuy candidates' : 'Fast turnaround', false, ranked.slice(3, 8), iso(ms(created) + 6 * DAY));
  });
  rows.sort((a, b) => (a.brand_id < b.brand_id ? -1 : a.brand_id > b.brand_id ? 1 : a.is_favourites ? -1 : 1));
  return rows.map((row) => ({ id: `list_${row.brand_id.slice(3)}_${slugify(row.name)}`, ...row }));
}
