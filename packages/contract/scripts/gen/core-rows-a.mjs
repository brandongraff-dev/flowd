// CORE stage 9a: map internal objects to schema rows. Identity, catalogue and work graph (users ... video_analyses).

import { artSeed, hueOfHex, fill, slugify, timecode, groupBy } from './lib.mjs';
import { APPS, CATEGORIES, PORTFOLIO_TITLES, BIO_TEMPLATES, BIO_PET_PEEVES, BIO_CADENCES, CITIES, NICHES, REASON_SUMMARIES, EVIDENCE_TEXTS, FEEDBACK_REPLIES, DISCLOSURE_TEXT, QA_TEXTS } from './pools.mjs';
import { FORMAT_DEFS } from './pools-content.mjs';
import { REASON_CODE_INFO } from '../../schema/tables.mjs';
import { tierProgress, approvalRate, slaState, funding, reservationUnit } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, money, intFmt, alnum } from './core-kit.mjs';
import { isoWeek as isoWeekOf } from '../../schema/time.mjs';
import { composeAnalysis } from './core-analysis.mjs';
import { APPROVED_FAMILY } from './core-subs.mjs';

const ART = (a) => ({ hue_a: a.hue_a, hue_b: a.hue_b, hue_c: a.hue_c, pattern: a.pattern, seed: a.seed, ...(a.label ? { label: a.label } : {}) });
const pad = (n, w = 4) => String(n).padStart(w, '0');
const r2 = (x) => Math.round(x * 100) / 100;

// ── ids for the work graph ──────────────────────────────────────────────────────────────────────
export function assignWorkIds(W) {
  const subs = [...W.subs].sort((a, b) => a.derived.versions[0].at - b.derived.versions[0].at || a.key - b.key);
  subs.forEach((s, i) => { s.id = `sub_${pad(i + 1)}`; s.num = i + 1; });
  W.subsSorted = subs;
  const posts = [...W.posts].sort((a, b) => a.postedAtMs - b.postedAtMs || a.s.key - b.s.key);
  posts.forEach((p, i) => { p.id = `post_${pad(i + 1)}`; p.num = i + 1; });
  W.postsSorted = posts;
  let vid = 0;
  const vers = [];
  for (const s of subs) for (const v of s.vers) vers.push({ s, v });
  vers.sort((a, b) => a.v.at - b.v.at || a.s.key - b.s.key);
  vers.forEach((x, i) => { x.v.assetId = `vid_${pad(i + 1)}`; });
  for (const l of W.links) l.id = `lnk_${slugify(l.code)}`;
}

// ── streaks ───────────────────────────────────────────────────────────────────────────────────
export function deriveStreaks(W) {
  const cur = isoWeekOf(NOW);
  const prev = isoWeekOf(iso(NOW_EPOCH - 7 * DAY_MS));
  for (const c of W.creators) {
    const weeks = new Set(c.posts.map((p) => isoWeekOf(p.postedAt)));
    let w = weeks.has(cur) ? cur : prev;
    let n = 0;
    let t = weeks.has(cur) ? NOW_EPOCH : NOW_EPOCH - 7 * DAY_MS;
    while (weeks.has(isoWeekOf(iso(t)))) { n++; t -= 7 * DAY_MS; }
    c.streak = n;
  }
}

// ── tier history (replay) ───────────────────────────────────────────────────────────────────────
export function deriveTierSince(W) {
  const order = C.tiers.order;
  for (const c of W.creators) {
    if (c.founding) {
      c.tierSinceMs = c.promotedAtMs ?? ms(c.joinedAt);
      continue;
    }
    if (c.tier === 'bronze') { c.tierSinceMs = ms(c.joinedAt); continue; }
    const events = new Set();
    const rows = W.earnRows.filter((r) => r.creator === c && ['cleared', 'paid'].includes(r.status) && ['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral'].includes(r.type) && r.amt > 0);
    for (const r of rows) events.add(r.clearedMs);
    for (const s of c.subs) for (const d of s.derived.decisions) events.add(d.t);
    let found = null;
    for (const t of [...events].sort((a, b) => a - b)) {
      const lifetime = rows.filter((r) => r.clearedMs <= t).reduce((a, r) => a + r.amt, 0);
      let ap = 0; let rj = 0;
      for (const s of c.subs) for (const d of s.derived.decisions) { if (d.t > t) continue; if (['approve', 'auto_approve', 'timeout_approve', 'appeal_overturn'].includes(d.action)) ap++; else if (['reject', 'auto_reject', 'appeal_uphold'].includes(d.action)) rj++; }
      const rate = approvalRate(ap, ap + rj);
      const th = C.tiers.thresholds[c.tier];
      if (lifetime >= th.lifetime_cleared_cents && ap >= th.approved_count && rate >= th.approval_rate_min) { found = t; break; }
    }
    c.tierSinceMs = found ?? ms(c.joinedAt);
  }
}

// ── identity rows ──────────────────────────────────────────────────────────────────────────────
export function rowsIdentity(W) {
  const out = {};
  // users
  const roleOrder = { admin: 0, brand_member: 1, creator: 2 };
  out.users = [...W.users].sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || ms(a.createdAt) - ms(b.createdAt)).map((u) => {
    const lastSeen = u.role === 'creator' ? W.creatorById.get(u.id === 'usr_maya' ? 'cr_maya' : u.creatorId ?? '')?.lastActiveMs : undefined;
    return { id: u.id, role: u.role, email: u.email, display_name: u.display_name, avatar: ART(u.avatarArt), auth_providers: u.auth_providers, status: u.status, age_verified: u.age_verified, locale: u.locale, timezone: u.timezone, created_at: u.createdAt, ...(u.lastSeenMs ? { last_seen_at: iso(u.lastSeenMs) } : {}), ...(u.title ? { title: u.title } : {}) };
  });
  // social accounts
  out.social_accounts = W.creators.flatMap((c) => c.accounts).sort((a, b) => (a.creator.id < b.creator.id ? -1 : a.creator.id > b.creator.id ? 1 : 0) || a.platform.localeCompare(b.platform)).map((a) => ({
    id: a.id, creator_id: a.creator.id, platform: a.platform, handle: a.handle, followers: a.followers, avg_views_28d: a.avgViews, median_views_28d: a.medianViews, engagement_rate: a.engagement, us_audience_ratio: r2(a.usRatio),
    status: a.status, verified_by_platform: a.verifiedByPlatform, primary: a.primary, account_created_at: a.createdAt, connected_at: a.connectedAt, last_synced_at: iso(NOW_EPOCH - Math.round((1 + (a.followers % 7)) * 37 * 60_000)),
    health: { score: a.health.score, status: a.health.status, strikes: a.health.strikes, unoriginal_flags: a.health.unoriginal, notes: a.health.strikes ? [`${a.health.strikes} community-guideline strike${a.health.strikes > 1 ? 's' : ''} in the last 90 days.`] : ['No strikes or unoriginal-content flags in 90 days.'] },
  }));
  // brands
  const brandsSorted = [...W.brands].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  out.brands = brandsSorted.map((b) => {
    const comp = COMPETITORS_OF(b);
    const row = {
      id: b.id, kind: b.kind, name: b.name, slug: b.slug, tagline: b.tagline, logo: ART(b.logoArt ?? b.app?.icon ?? artSeed(W.rng.fork(`logo-${b.id}`), { hue: b.logoHue ?? 250, pattern: 'grid', label: b.name[0] })), website: `https://${b.websiteHost}`, country: b.country, plan: b.plan,
      ...(b.plan !== 'free' && b.planRenewsAt ? { plan_renews_at: b.planRenewsAt } : {}), verification: b.verification, created_at: b.createdAt, ...(b.agency ? { agency_id: b.agency.id } : {}), first_bounty_waiver_used: !!b.firstWaiverUsed, matched_budget_used_cents: b.matchedUsed ?? 0,
      wallet_balance_cents: b.walletBal ?? 0,
      ...(b.plan !== 'free' && b.kind === 'brand' && (b.index ?? 0) % 3 === 0 ? { auto_top_up: { enabled: true, threshold_cents: 50_000, amount_cents: 100_000 } } : {}),
      billing: { legal_name: b.legal, billing_email: b.billingEmail, ...(b.kind !== 'platform' ? { payment_method: { kind: b.index % 5 === 4 ? 'ach' : 'card', label: b.index % 5 === 4 ? 'Bank (ACH)' : ['Visa', 'Mastercard', 'Visa', 'Amex'][(b.index ?? 0) % 4], last4: String(1000 + (((b.index ?? 3) + 2) * 3571 + 1297) % 9000), ...(b.index % 5 === 4 ? {} : { exp: `${String(1 + ((b.index ?? 1) % 12)).padStart(2, '0')}/${28 + ((b.index ?? 0) % 3)}` }) } } : {}), ...(b.vat ? { vat_id: b.vat } : {}), po_required: b.plan === 'scale', ...(b.plan === 'scale' ? { cost_center: b.kind === 'agency' ? 'CLIENT-GROWTH' : 'GROWTH-UGC' } : {}) },
      timeout_policy: b.timeout, review_sla_hours: 72,
      compliance_defaults: { disclosure_text: b.kind === 'platform' ? '#ad Paid partnership with flowd' : fill(DISCLOSURE_TEXT, { brand: b.name }), banned_claims: b.app ? (b.app.def ? defaultBanned(b.app.category) : []) : [], competitor_names: comp, music_policy: (b.index ?? 0) % 3 === 0 ? 'commercial_library' : 'original_only', ai_policy: b.app?.category === 'ai_photo' ? 'allowed_disclosed' : 'not_allowed' },
    };
    if (b.agency) row.referral_partner_brand_id = b.agency.id;
    return row;
  });
  // brand members
  out.brand_members = [...W.members].sort((a, b) => (a.brand.id < b.brand.id ? -1 : a.brand.id > b.brand.id ? 1 : 0) || ['owner', 'admin', 'reviewer', 'finance', 'viewer', 'client_approver'].indexOf(a.role) - ['owner', 'admin', 'reviewer', 'finance', 'viewer', 'client_approver'].indexOf(b.role)).map((m) => ({
    id: m.id, brand_id: m.brand.id, user_id: m.user.id, role: m.role, status: m.status, ...(m.invitedBy ? { invited_by_member_id: m.invitedBy.id } : {}), ...(m.code ? { approval_link_code: m.code } : {}), joined_at: m.joinedAt, ...(m.lastActiveMs ? { last_active_at: iso(m.lastActiveMs) } : {}),
  }));
  // apps
  out.apps = [...W.apps].sort((a, b) => ms(a.connectedAt) - ms(b.connectedAt)).map((a, i) => {
    const def = a.def;
    const statusOf = a.brand.verification === 'not_started' || a.slug === 'nestly' ? 'pending' : 'connected';
    const sdk = a.slug === 'lumi' ? 'verified' : statusOf === 'pending' ? 'not_installed' : (a.brand.index ?? 0) % 3 === 0 ? 'installed' : 'verified';
    const mmp = a.slug === 'reelcraft' ? 'appsflyer' : a.slug === 'dozely' ? 'adjust' : a.slug === 'parlo' ? 'branch' : 'none';
    return {
      id: a.id, brand_id: a.brand.id, name: a.name, tagline: def.tagline, category: a.category, icon: ART(a.icon), brand_colors: { primary: def.colors.primary, secondary: def.colors.secondary, accent: def.colors.accent },
      features: def.features, app_store_id: a.appStoreId, bundle_id: a.slug === 'flowd' ? 'io.joinflowd.creator' : `com.${def.company.toLowerCase().replace(/[^a-z0-9]+/g, '')}.${def.slug}`, store_url: `https://apps.apple.com/us/app/${def.slug}/id${a.appStoreId}`,
      pricing: { ...(a.slug !== 'flowd' && (a.brand.index ?? 0) % 4 === 1 ? { weekly_cents: Math.round(def.pricing.monthly_cents / 3.2 / 10) * 10 + 9 } : {}), monthly_cents: def.pricing.monthly_cents, annual_cents: def.pricing.annual_cents, trial_days: def.pricing.trial_days },
      avg_first_payment_cents: def.avg_first_payment_cents, rating: def.rating, rating_count: def.rating_count, status: statusOf, connected_at: a.connectedAt, ...(sdk !== 'not_installed' && a.slug !== 'flowd' ? { revenuecat_project_id: `proj_${1000 + ((a.brand.index ?? 0) * 137) % 9000}` } : {}),
      mmp, sdk_status: a.slug === 'flowd' ? 'verified' : sdk, default_hashtags: def.hashtags,
    };
  });
  return out;
}
const COMPETITORS_OF = (b) => (b.app && b.app.def ? APPS.filter((x) => x.category === b.app.category && x.slug !== b.app.slug).slice(0, 3).map((x) => x.name) : []);
const defaultBanned = (cat) => ({ ai_photo: ['perfect results'], ai_assistant: ['replaces your job'], fitness: ['guaranteed results'], language: ['fluent in 30 days'], productivity: ['guaranteed productivity'], finance: ['guaranteed returns'], sleep_mind: ['cures insomnia'], music_audio: ['become a pro overnight'], lifestyle: ['the only app you need'] })[cat] ?? [];

// ── creators ───────────────────────────────────────────────────────────────────────────────────
export function rowsCreators(W) {
  const out = {};
  const rng = W.rng.fork('creator-rows');
  const rate = (c) => c.rateCardInfo;
  out.creators = [...W.creators].sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt)).map((c) => {
    const rep = c.rep;
    const lastActive = Math.max(ms(c.joinedAt), ...c.subs.map((s) => s.derived.lastSubmit ?? 0), ...c.posts.map((p) => p.postedAtMs), c.firstDollarMs ?? 0);
    c.lastActiveMs = Math.min(NOW_EPOCH, lastActive + 20 * 60_000 * (c.idx % 5));
    c.user.lastSeenMs = Math.min(NOW_EPOCH, c.lastActiveMs + (c.idx % 4) * 3 * 60_000);
    const car = c.carry;
    const tier = c.tier;
    const graced = c.graceHold;
    const posts = [...c.posts].sort((a, b) => b.views - a.views).slice(0, 3);
    const city = rng.pick(CITIES[c.countryCode] ?? ['Austin']);
    const bio = c.persona ? '22. Lifestyle and AI tools. Posting three times a week. Austin. I film what I actually use.' : fill(rng.pick(c.niches.length > 1 ? BIO_TEMPLATES : BIO_TEMPLATES.filter((x) => !x.includes('{niche_b}'))), { age: String(rng.int(19, 34)), niche_a: NICHES.find((n) => n.key === c.niches[0]).bio[0], niche_b: NICHES.find((n) => n.key === (c.niches[1] ?? c.niches[0])).bio[0], city, cadence: rng.pick(BIO_CADENCES), pet_peeve: rng.pick(BIO_PET_PEEVES) });
    const verification = c.verification ?? 'verified';
    const hasApproval = c.approvedP > 0;
    const stage = c.firstDollarMs ? 'first_dollar' : c.approvedP > 0 ? 'first_approval' : c.subs.length > 0 ? 'first_submission' : 'accounts_linked';
    const payoutReady = c.payoutReady;
    return {
      id: c.id, user_id: c.user.id, handle: c.handle, display_name: c.name, bio: bio.length > 160 ? bio.slice(0, 157) + '...' : bio, avatar: ART(c.user.avatarArt), niches: c.niches, country: c.countryCode, languages: [...new Set(['en', c.country.language])], tier, tier_basis: graced ? 'grace_hold' : 'earned',
      tier_since: iso(c.tierSinceMs), ...(graced ? { tier_hold_until: graced.until } : {}), ...(tier === 'elite' ? { tier_review: { status: 'approved', reviewer_user_id: 'usr_ops', reviewed_at: iso(Math.max(c.tierSinceMs, ms('2026-08-30T00:00:00Z'))), note: 'Verified prior statements and delivery record; no open disputes.' } } : {}),
      lifetime_cleared_cents: c.lifetime, approved_count: c.approvedAll, decided_count: c.decidedAll, approval_rate: c.rate, reliability_score: rep.score, posts_count: c.posts.length, live_posts_count: c.livePosts,
      ...(c.firstDollarMs ? { first_dollar_at: iso(c.firstDollarMs) } : {}), joined_at: c.joinedAt, last_active_at: iso(c.lastActiveMs), founding: c.founding, ...(c.founding ? { founding_perks_until: iso(ms(c.joinedAt) + 365 * DAY_MS) } : {}),
      badges: c.badges, verification_status: verification, onboarding_stage: stage, payout_ready: payoutReady, ...(c.payoutMethodRow ? { payout_method: c.payoutMethodRow, stripe_account_id: `acct_${1_000_000 + (c.idx * 7919) % 8_999_999}` } : {}),
      referral_code: c.referralCode, ...(c.referredBy ? { referred_by_creator_id: c.referredBy.id } : {}), streak_weeks: c.streak,
      ...(car ? { carry_over: { source: 'Verified earnings statements (other platforms)', cleared_cents: car.cleared_cents, approved_count: car.approved_count, decided_count: car.decided_count, verified_by_user_id: 'usr_ops', verified_at: iso(ms(c.joinedAt) + 2 * DAY_MS) } } : {}),
      storefront: { slug: c.handle, headline: c.persona ? 'AI tools and everyday apps, tested on camera' : `${NICHES.find((n) => n.key === c.niches[0]).label} creator. Honest app videos.`, ...(c.persona ? { about: 'I test apps on camera and only post the ones I would keep. My numbers on this page come straight from the ledger.' } : {}), featured_post_ids: posts.map((p) => p.id), show_stats: true, cta_label: 'Work with me', theme: ['aurora', 'ink', 'sunrise', 'lagoon'][c.idx % 4] },
      portfolio: portfolioFor(rng, c), open_to_offers: !!rate(c) || c.tier !== 'bronze' ? c.openToOffers !== false : false, ...(c.pausedUntil ? { paused_until: c.pausedUntil } : {}),
    };
  });
  return out;
}
function portfolioFor(rng, c) {
  const n = c.persona ? 4 : c.tier === 'bronze' ? rng.int(0, 2) : rng.int(2, 5);
  const titles = rng.sample(PORTFOLIO_TITLES, n);
  return titles.map((t, i) => ({ title: t, art: ART(artSeed(rng, { pattern: rng.pick(['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes']), label: t })), duration_s: rng.int(14, 34), platform: i === 0 || rng.chance(0.7) ? 'tiktok' : 'instagram', ...(rng.chance(0.7) ? { views: Math.round(c.medianViews * rng.float(0.6, 2.2)) } : {}) }));
}

// ── rate cards ─────────────────────────────────────────────────────────────────────────────────
export function rowsRateCards(W, marketAt) {
  const rng = W.rng.fork('rate-cards');
  const tierMult = { silver: 1.0, gold: 1.18, platinum: 1.4, elite: 1.65 };
  const cards = [];
  const eligible = W.creators.filter((c) => c.tier !== 'bronze' && !c.pausedUntil);
  const optOut = new Set(rng.sample(eligible.filter((c) => !c.persona && c.tier === 'silver'), 4));
  const dm = new Map();
  for (const c of [...eligible].sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt))) {
    if (optOut.has(c)) continue;
    const acct = c.accounts.find((a) => a.primary);
    const cat = c.niches.map((n) => NICHES.find((x) => x.key === n).categories[0])[0] ?? 'productivity';
    const cpm = marketAt(cat);
    const suggested = Math.round((acct.medianViews / 1000) * cpm * 3.9 * tierMult[c.tier]);
    const ask = c.persona ? 14_000 : clamp(Math.round((suggested * rng.float(0.92, 1.28)) / 500) * 500, 8_000, 90_000);
    const low = Math.round((suggested * 0.82) / 100) * 100;
    const high = Math.round((suggested * 1.2) / 100) * 100;
    c.rateCardInfo = { price: ask, suggested: Math.round(suggested / 100) * 100, low, high, cpm };
    const formats = rng.sample(['tmpl_screen_reaction', 'tmpl_hidden_gem', 'tmpl_confession', 'tmpl_problem_solution', 'tmpl_faceless_slideshow', 'tmpl_green_screen', 'tmpl_results_update'], rng.int(2, 4));
    cards.push({
      id: `rate_${slugify(c.handle)}`, creator_id: c.id, status: c.persona ? 'open' : rng.weighted([['open', 6], ['limited', 3], ['paused', 1]]), price_per_video_cents: ask, min_cpm_cents: c.persona ? 220 : clamp(Math.round((cpm * rng.float(0.82, 1.1)) / 5) * 5, 120, 420),
      paid_usage_days: 90, paid_usage_pct_per_30d: 0.25, turnaround_days: c.persona ? 4 : rng.int(2, 7), max_videos_per_month: c.persona ? 8 : rng.int(4, 16), platforms: c.accounts.map((a) => a.platform).slice(0, 2), format_ids: formats, categories_excluded: rng.chance(0.3) ? rng.sample(['finance', 'fitness', 'sleep_mind'], 1) : [],
      accepts_direct_offers: c.persona ? true : rng.chance(0.88),
      suggested: { price_cents: Math.round(suggested / 100) * 100, low_cents: low, high_cents: high, basis: `Median ${(acct.medianViews / 1000).toFixed(1)}k views x $${(cpm / 100).toFixed(2)} market CPM x 3.9 for 90-day paid usage, ${c.tier === 'silver' ? 'Silver' : c.tier[0].toUpperCase() + c.tier.slice(1)} ${tierMult[c.tier].toFixed(2)}x`, confidence: r2(clamp(0.55 + rng.float(0, 0.3), 0.4, 0.9)), computed_at: iso(NOW_EPOCH - 2 * DAY_MS) },
      packages: [{ label: 'Single video', videos: 1, price_per_video_cents: ask }, { label: '3-video pack', videos: 3, price_per_video_cents: Math.round((ask * 0.9) / 100) * 100 }, ...(rng.chance(0.5) ? [{ label: 'Monthly 8-pack', videos: 8, price_per_video_cents: Math.round((ask * 0.8) / 100) * 100 }] : [])],
      stats: { offers_received: c.persona ? 4 : rng.int(0, 9), accepted: c.persona ? 1 : rng.int(0, 3), median_response_hours: c.persona ? 6.5 : Math.round(rng.float(2, 30) * 10) / 10 },
      updated_at: iso(NOW_EPOCH - rng.int(1, 20) * DAY_MS),
    });
  }
  return cards;
}

// ── bounties ───────────────────────────────────────────────────────────────────────────────────
export function rowsBounties(W) {
  const out = [];
  for (const b of [...W.bounties].sort((a, b2) => ms(a.createdAt) - ms(b2.createdAt))) {
    const unfunded = ['draft', 'awaiting_funding'].includes(b.status);
    const f = b.fundingCalc ?? funding({ budget_cents: b.budget, take_rate: b.take_rate, matched_cents: b.matched ?? 0 });
    const published = b.publishedAt;
    const row = {
      id: b.id, app_id: b.app.id, brand_id: b.brand.id, ...(b.owner ? { owner_member_id: b.owner.id } : {}), ...(b.creatorMember ? { created_by_member_id: b.creatorMember.id } : {}), title: b.title, type: b.type, status: b.status, visibility: b.visibility, funding_source: b.funding_source,
      is_first_bounty: b.is_first_bounty, is_starter: b.is_starter, featured: b.featured, ...(b.featured_until ? { featured_until: b.featured_until } : {}),
      cpm_cents: b.cpm_cents, cpa_install_cents: b.cpa[0], cpa_trial_cents: b.cpa[1], cpa_paid_cents: b.cpa[2], flat_fee_cents: b.flat_fee_cents, ad_commission_rate: b.ad_commission_rate, per_video_cap_cents: b.per_video_cap_cents,
      ...(b.row.starter || b.direct ? {} : b.type === 'cpa' || b.type === 'install_only' ? {} : { per_creator_cap_cents: b.per_video_cap_cents * 2 }),
      budget_cents: b.budget, take_rate: b.take_rate, fee_reserve_cents: b.fee_reserve, escrow_funded_cents: b.escrow_funded ?? 0, matched_cents: b.matchedC ?? 0, funded: !!b.funded, ...(b.fundedAtMs ? { funded_at: iso(b.fundedAtMs) } : {}),
      reserved_cents: b.reserved ?? 0, spent_cents: b.spent ?? 0, remaining_cents: b.remaining ?? 0, refunded_cents: b.refunded ?? 0,
      brief: b.brief, rights_card: b.rights_card, deliverables: b.deliverables, eligibility: b.eligibility,
      brief_lint: { passed: b.lint.passed, checked_at: b.lint.checked_at, issues: b.lint.issues }, pay_math: b.payMath, format_ids: b.format_ids, art: ART(b.art),
      starts_at: b.startsAt, ends_at: b.endsAt, ...(published ? { published_at: published } : {}), ...(b.firstSubmissionAt ? { first_submission_at: b.firstSubmissionAt } : {}), ...(b.filledAtMs ? { filled_at: iso(b.filledAtMs), time_to_fill_hours: b.timeToFillH } : {}),
      ...(b.endedAt ? { ended_at: b.endedAt } : {}), ...(b.settledAt ? { settled_at: b.settledAt } : {}), review_sla_hours: 72, counts: b.counts, funnel: b.funnel, all_in_cpm_cents: b.allIn, created_at: b.createdAt, updated_at: iso(b.updatedMs),
    };
    out.push(row);
  }
  return out;
}

// ── submissions and analyses ─────────────────────────────────────────────────────────────────────
function evidenceFor(r, reason, t_ms_hint, bounty) {
  const info = REASON_CODE_INFO[reason] ?? {};
  const t = t_ms_hint ?? 2000 + r.int(0, 12000);
  const roll = r.next();
  if (info.qa_check && roll < 0.55) return { kind: 'qa_check', ref: info.qa_check };
  if (['off_brief', 'other_requirement', 'missing_required_beat', 'offer_not_stated', 'wrong_format'].includes(reason) && roll < 0.8 && bounty?.brief) {
    // quote the line of THIS bounty's brief that the video does not meet
    const brief = bounty.brief;
    const dv = bounty.deliverables;
    let ex;
    if (reason === 'offer_not_stated') ex = brief.offer_line ?? 'State the free trial once, before the call to action.';
    else if (reason === 'missing_required_beat') { const beat = r.pick(brief.beats.filter((x) => x.required && x.beat !== 'hook')); ex = `${beat.label}${beat.hint ? `: ${beat.hint}` : ''}`; }
    else if (reason === 'wrong_format') ex = `${dv.aspect} video, ${dv.min_duration_s} to ${dv.max_duration_s} seconds.`;
    else if (reason === 'off_brief') ex = r.pick(brief.talking_points);
    else ex = r.pick(brief.dos);
    return { kind: 'brief_requirement', ref: ex.slice(0, 70), excerpt: `"${ex}"` };
  }
  if (reason === 'banned_claim') { const ex = r.pick(EVIDENCE_TEXTS.transcript); return { kind: 'transcript', ref: timecode(t), excerpt: ex, t_ms: t }; }
  return { kind: 'timecode', ref: timecode(t), t_ms: t };
}

export function rowsWork(W) {
  const out = {};
  const rng = W.rng.fork('work-rows');
  const submissions = [];
  const analyses = [];
  for (const s of W.subsSorted) {
    const r = rng.fork(`sub-${s.key}`);
    const d = s.derived;
    const b = s.bounty;
    const c = s.creator;
    const lastV = d.versions[d.versions.length - 1];
    const lastSub = d.lastSubmit;
    const versions = s.vers.map((v, i) => {
      const a = v.analysis;
      const vr = rng.fork(`ver-${s.key}-${v.n}`);
      const durMs = a.durS * 1000;
      const resolution = a.obs.lowRes ? [720, 1280] : [1080, 1920];
      const row = {
        version: v.n, submitted_at: iso(v.at),
        video: { asset_id: v.assetId, duration_ms: durMs, width: resolution[0], height: resolution[1], size_bytes: Math.round(durMs * vr.float(900, 1500)), fps: vr.weighted([[30, 7], [60, 1.5], [24, 1]]), has_captions: a.obs.hook.captions_in_safe_zone || vr.chance(0.5), language: 'en', art: ART(artSeed(vr, { pattern: vr.pick(['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes']), label: s.hookText })), uploaded_at: iso(v.at - vr.int(1, 12) * 60_000) },
        flow_band: v.flowBand, flow_points: v.flowPts, hook_band: v.hookBand, hook_points: v.hookPts, qa_pass: a.counts.pass, qa_warn: a.counts.warn, qa_fail: a.counts.fail,
        ...(i > 0 ? { changes_summary: vr.pick(FEEDBACK_REPLIES) } : {}),
      };
      return row;
    });
    // decision
    let decision;
    const ld = d.decision;
    if (ld) {
      const reason = ld.reason;
      const needsEv = ['reject', 'auto_reject'].includes(ld.action) || (ld.action === 'request_changes' && r.chance(0.4));
      const ver = s.vers.find((x) => x.reason === reason);
      const evidence = reason && (needsEv || ld.action === 'appeal_uphold' || ld.action === 'appeal_overturn') ? (ld.action === 'appeal_uphold' ? undefined : evidenceFor(r, reason, ver?.analysis?.obs?.hook?.app_ms, b)) : undefined;
      const sumPool = REASON_SUMMARIES[reason];
      const summary = sumPool && ['reject', 'request_changes', 'auto_reject'].includes(ld.action) ? fill(r.pick(sumPool), { t: timecode(evidence?.t_ms ?? 3500), app: s.app.name, feature: b.feature }) : ld.action === 'approve' && r.chance(0.35) ? r.pick(['Approved. Good first three seconds.', 'Approved, thank you. The offer is clear.', 'Approved. Post when ready.']) : ld.action === 'appeal_overturn' ? 'Ops reviewed the video against the brief and the reason does not hold. The decision is reversed and the video is approved.' : ld.action === 'appeal_uphold' ? 'Ops reviewed the appeal. The brief requirement is not met in the video, so the rejection stands.' : ld.action === 'timeout_approve' ? 'Approved automatically: every QA check passed and the 72-hour review window ended (approve-if-clean policy).' : ld.action === 'auto_approve' ? 'Approved by a guarded auto-approve rule: every guardrail passed.' : undefined;
      decision = {
        action: ld.action, decided_at: iso(ld.t),
        ...(ld.by === 'brand' ? { decided_by_user_id: ld.reviewer.user.id } : ld.by === 'admin' ? { decided_by_user_id: 'usr_ops' } : {}),
        ...(reason && ['reject', 'request_changes', 'auto_reject', 'appeal_overturn', 'appeal_uphold'].includes(ld.action) ? { reason_code: reason } : {}), ...(evidence ? { evidence } : {}), ...(summary ? { summary } : {}),
        sla_met: ld.sla_met, appeal_used: d.appealUsed && ['reject', 'appeal_uphold', 'appeal_overturn'].includes(ld.action),
      };
      if (ld.action === 'reject' && !decision.evidence) decision.evidence = evidenceFor(r, reason, null, b);
      if (ld.action === 'auto_reject' && !decision.evidence) decision.evidence = { kind: 'qa_check', ref: 'duplicate' };
      if (ld.action === 'reject' || ld.action === 'auto_reject') decision.reason_code = reason;
      if (ld.action === 'request_changes') decision.reason_code = reason;
    }
    // fraud evidence
    const score = c.flagged === 'suspect' ? 72 : c.flagged === 'warning' ? 45 : clamp(Math.round(r.normal(5, 4)), 0, 14);
    const dup = s.dupOf;
    const fe = {
      creator_fraud_score: dup ? Math.max(score, 21) : score, creator_fraud_band: score >= 70 ? 'high' : score >= 40 || dup ? (dup && score < 40 ? 'watch' : 'review') : score >= 20 ? 'watch' : 'clean', audience_us_ratio: r2(c.accounts[0].usRatio), view_curve_shape: c.flagged === 'suspect' ? 'stepped' : c.flagged === 'warning' ? 'spiky' : r.weighted([['organic', 14], ['spiky', 1], ['flat', 0.4]]),
      ...(dup ? { duplicate_of_submission_id: dup.sub.id, phash_distance: dup.dist } : {}), follower_quality: r2(clamp(c.flagged ? r.float(0.35, 0.55) : r.normal(0.84, 0.08), 0.3, 0.99)),
    };
    if (fe.creator_fraud_band === 'clean' && fe.creator_fraud_score >= 20) fe.creator_fraud_band = 'watch';
    if (fe.creator_fraud_band === 'review' && fe.creator_fraud_score < 40) fe.creator_fraud_score = 41;
    const inReview = d.status === 'in_review';
    const hoursQ = (NOW_EPOCH - lastSub) / HOUR_MS;
    let slaStateV;
    if (d.status === 'in_review') slaStateV = slaState(hoursQ);
    else if (d.status === 'qa_pending') slaStateV = 'on_track';
    else slaStateV = ld ? (ld.sla_met ? 'met' : 'breached') : 'met';
    const breachedAt = inReview && hoursQ > 72 ? iso(lastSub + 72 * HOUR_MS) : ld && !ld.sla_met && ld.by !== 'admin' ? iso(lastSub ? d.versions.filter((v) => v.at <= ld.t).pop().at + 72 * HOUR_MS : ld.t) : undefined;
    const lastEvent = Math.max(...s.history.filter((e) => e.t <= NOW_EPOCH).map((e) => e.t));
    const row = {
      id: s.id, bounty_id: b.id, creator_id: c.id, brand_id: s.brand.id, app_id: s.app.id, status: d.status, version: d.versions.length, versions, source: s.source, format_id: s.formatId,
      title: b.is_starter ? `Starter take v${d.versions.length}` : `${s.format.name} v${d.versions.length}`, revision_round: d.round, reserved_cents: s.reserved ?? 0, flow_band: s.flowBand, flow_points: s.flowPts, hook_band: s.hookBand, hook_points: s.hookPts,
      rights_card: JSON.parse(JSON.stringify(b.rights_card)), rights_accepted_at: iso(d.versions[0].at), fraud_evidence: fe, submitted_at: iso(d.versions[0].at),
      ...(inReview ? { sla_due_at: iso(lastSub + 72 * HOUR_MS) } : {}), sla_state: slaStateV, ...(breachedAt ? { sla_breached_at: breachedAt } : {}), ...(decision ? { decision } : {}), auto_approved: d.auto,
      ...(d.approvedAt ? { approved_at: iso(d.approvedAt) } : {}), ...(s.post ? { post_id: s.post.id } : {}), ...(s.link ? { link_id: s.link.id } : {}), ...(d.postedAt ? { posted_at: iso(d.postedAt) } : {}), ...(d.releasedAt ? { released_at: iso(d.releasedAt) } : {}), updated_at: iso(lastEvent),
    };
    submissions.push(row);
    // analyses
    for (const v of s.vers) {
      const ar = rng.fork(`an-${s.key}-${v.n}`);
      const a = v.analysis;
      const comp = composeAnalysis(W, s, v, ar);
      const hookDup = s.dupOf && v.n === s.vers.length;
      const phash = hookDup ? s.dupOf.phash : a.phash;
      analyses.push({
        id: `va_${pad(s.num)}_v${v.n}`, submission_id: s.id, version: v.n, duration_ms: comp.durMs, language: 'en', transcript: comp.transcript, transcript_text: comp.transcript.map((x) => x.text).join(' '), on_screen_text: comp.onscreen, scenes: comp.scenes,
        hook: comp.hook, beats: comp.beats, tags: comp.tags, checks: a.checks.map((k) => (hookDup && k.check === 'duplicate' ? { ...k, result: 'fail', message: `Matches another submission already on this bounty (distance ${s.dupOf.dist}).`, blocks_settlement: false, evidence: { kind: 'qa_check', ref: 'duplicate' } } : k)),
        hook_score: { band: a.sc.hook.band, points: a.sc.hook.points, items: a.sc.hook.items, label: a.sc.hook.label }, flow_score: { band: a.sc.flow.band, points: a.sc.flow.points, items: a.sc.flow.items, label: a.sc.flow.label },
        phash, ...(hookDup ? { duplicate_of_submission_id: s.dupOf.sub.id } : {}), analysed_at: iso(Math.min(NOW_EPOCH, v.at + (s.qaDelay ?? 8 * 60_000))),
      });
    }
  }
  out.submissions = submissions;
  out.video_analyses = analyses;
  return out;
}
