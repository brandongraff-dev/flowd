// CORE stage 1: brands, apps, brand members, users, creators, social accounts.
// Internal objects keep pointers to each other (brand.app, creator.accounts ...); core.mjs maps them to schema rows at the end.

import { makeId, slugify, artSeed, hueOfHex, initials, pad, fill } from './lib.mjs';
import {
  APPS, FLOWD_APP, AGENCY, COUNTRIES, NICHES, CATEGORIES, FIRST_NAMES, LAST_NAMES, HANDLES, uniqueName, emailFor, bundleIdFor, appStoreIdFor,
  BIO_TEMPLATES, BIO_PET_PEEVES, BIO_CADENCES, CITIES, PORTFOLIO_TITLES, HOOK_TEMPLATES, DISCLOSURE_TEXT, skuFor,
} from './pools.mjs';
import { iso, ms, addDays, addHours, clamp, hexString, alnum, logn, DAY_MS, HOUR_MS, NOW, NOW_EPOCH, med } from './core-kit.mjs';

const LAUNCH = '2026-07-05T00:00:00Z';
const at = (dayOffset, hh = 9, mm = 0) => iso(ms(LAUNCH) + dayOffset * DAY_MS + hh * HOUR_MS + mm * 60_000);

// ── brands ──────────────────────────────────────────────────────────────────────────────────────
/** One row per product brand, in join order. plan, country, decision speed (median hours to decide), timeout policy. */
export const BRAND_PLAN = [
  { slug: 'lumi', plan: 'pro', country: 'US', decide: 11.2, members: 4, programme: true, planSince: '2026-08-12T10:05:00Z', verified: 'verified' },
  { slug: 'dozely', plan: 'scale', country: 'US', decide: 8.5, members: 3, programme: true, planSince: '2026-07-22T15:20:00Z', verified: 'verified' },
  { slug: 'stridely', plan: 'pro', country: 'AU', decide: 14, members: 2, programme: true, planSince: '2026-08-04T03:10:00Z', verified: 'verified' },
  { slug: 'budgetbee', plan: 'pro', country: 'CA', decide: 19, members: 3, programme: true, planSince: '2026-08-19T14:00:00Z', verified: 'verified' },
  { slug: 'parlo', plan: 'scale', country: 'DE', decide: 22, members: 3, programme: true, planSince: '2026-08-02T09:45:00Z', verified: 'verified', vat: 'DE318420657' },
  { slug: 'tasklane', plan: 'pro', country: 'US', decide: 17, members: 2, programme: true, planSince: '2026-08-27T16:30:00Z', verified: 'verified' },
  { slug: 'quillby', plan: 'pro', country: 'IE', decide: 27, members: 2, timeout: 'approve_if_clean', planSince: '2026-08-14T11:00:00Z', verified: 'verified', vat: 'IE6388047V' },
  { slug: 'focusfern', plan: 'pro', country: 'US', decide: 9.5, members: 2, planSince: '2026-08-21T13:25:00Z', verified: 'verified' },
  { slug: 'reelcraft', plan: 'scale', country: 'US', decide: 15, members: 3, planSince: '2026-08-09T17:15:00Z', verified: 'verified' },
  { slug: 'ironleaf', plan: 'pro', country: 'US', decide: 24, members: 2, planSince: '2026-09-01T10:00:00Z', verified: 'verified' },
  { slug: 'stillwater', plan: 'pro', country: 'GB', decide: 31, members: 2, planSince: '2026-09-03T08:40:00Z', verified: 'verified', vat: 'GB372846190' },
  { slug: 'wanderlist', plan: 'pro', country: 'GB', decide: 20, members: 2, planSince: '2026-09-08T12:10:00Z', verified: 'verified', vat: 'GB289417356' },
  { slug: 'glowkit', plan: 'free', country: 'US', decide: 33, members: 1, verified: 'verified' },
  { slug: 'scoutly', plan: 'free', country: 'US', decide: 26, members: 2, verified: 'verified' },
  { slug: 'loopnest', plan: 'pro', country: 'US', decide: 29, members: 2, planSince: '2026-09-11T14:50:00Z', verified: 'verified' },
  { slug: 'tunefox', plan: 'pro', country: 'US', decide: 21, members: 2, planSince: '2026-09-16T09:30:00Z', verified: 'verified' },
  { slug: 'pulsepath', plan: 'free', country: 'US', decide: 36, members: 1, verified: 'verified' },
  { slug: 'wordwave', plan: 'free', country: 'NL', decide: 58, members: 2, verified: 'verified', vat: 'NL863972150B01', poor: true },
  { slug: 'inkdock', plan: 'free', country: 'US', decide: 38, members: 1, verified: 'verified' },
  { slug: 'subhawk', plan: 'free', country: 'US', decide: 29, members: 1, verified: 'verified' },
  { slug: 'rainyday', plan: 'free', country: 'US', decide: 34, members: 1, verified: 'verified' },
  { slug: 'moodloom', plan: 'free', country: 'US', decide: 30, members: 1, verified: 'not_started' },
  { slug: 'pantrypal', plan: 'free', country: 'US', decide: 41, members: 1, verified: 'verified' },
  { slug: 'nestly', plan: 'free', country: 'CA', decide: 36, members: 1, verified: 'pending' },
];

const COMPETITORS = (cat) => APPS.filter((a) => a.category === cat);

/** brands, apps, members and member users */
export function buildBrands(W) {
  const rng = W.rng.fork('brands');
  const used = W.usedNames;
  const brands = [];
  const apps = [];
  const members = [];
  const users = W.users;

  // ── flowd (platform) and its app
  const flowdBrand = {
    id: 'br_flowd', key: 'flowd', kind: 'platform', name: 'flowd', slug: 'flowd', tagline: 'Money follows what works.', websiteHost: 'joinflowd.io', country: 'US', plan: 'scale',
    verification: 'verified', createdAt: '2026-07-05T05:30:00Z', decideH: 4, timeout: 'escalate', programme: false, appKey: 'flowd', members: [], first_bounty_waiver_used: false,
    logoHue: 242, legal: 'flowd, Inc.', billingEmail: 'billing.flowd@example.com',
  };
  const flowdApp = mkApp(FLOWD_APP, -1, flowdBrand, '2026-07-05T05:45:00Z', rng);
  flowdBrand.app = flowdApp;
  brands.push(flowdBrand);
  apps.push(flowdApp);

  // ── product brands in join order (join offsets 0.. about 32 days: every app is connected within the first five weeks)
  const joinOffsets = [];
  for (let i = 0; i < BRAND_PLAN.length; i++) joinOffsets.push(1 + i * 1.35);
  const agencyOffset = 12;
  BRAND_PLAN.forEach((bp, i) => {
    const appDef = APPS.find((a) => a.slug === bp.slug);
    const off = bp.slug === 'lumi' ? 1.6 : joinOffsets[i];
    const createdAt = bp.slug === 'lumi' ? '2026-07-06T15:12:00Z' : at(Math.floor(off), 8 + Math.floor((off % 1) * 9), rng.int(0, 59));
    const brand = {
      id: `br_${appDef.slug}`, key: appDef.slug, kind: 'brand', name: appDef.name, slug: appDef.slug, tagline: appDef.tagline, websiteHost: appDef.domain, country: bp.country,
      plan: bp.plan, planSince: bp.planSince, verification: bp.verified, createdAt, decideH: bp.decide, timeout: bp.timeout ?? 'escalate', programme: !!bp.programme, poor: !!bp.poor,
      vat: bp.vat, legal: appDef.company, billingEmail: `billing.${appDef.slug}@example.com`, members: [], first_bounty_waiver_used: false, matched_used: 0, index: i,
    };
    const connectedAt = iso(ms(createdAt) + rng.int(2, 20) * HOUR_MS);
    const app = mkApp(appDef, i, brand, connectedAt, rng);
    brand.app = app;
    brands.push(brand);
    apps.push(app);
  });

  // ── agency workspace managing three of them
  const agency = {
    id: 'br_northstar', key: 'northstar', kind: 'agency', name: AGENCY.name, slug: 'northstar', tagline: AGENCY.tagline, websiteHost: AGENCY.domain, country: 'US', plan: 'scale',
    planSince: at(agencyOffset, 10, 20), verification: 'verified', createdAt: at(agencyOffset, 9, 5), decideH: 12, timeout: 'escalate', programme: false, members: [], legal: 'Northstar Growth LLC',
    billingEmail: 'billing.northstar@example.com', agencyClients: AGENCY.manages,
  };
  brands.push(agency);
  for (const slug of AGENCY.manages) {
    const b = brands.find((x) => x.key === slug);
    b.agency = agency;
    b.createdAt = iso(Math.max(ms(b.createdAt), ms(agency.createdAt) + 3 * DAY_MS));
    b.app.connectedAt = iso(ms(b.createdAt) + 5 * HOUR_MS);
  }
  brands.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  apps.sort((a, b) => ms(a.connectedAt) - ms(b.connectedAt));

  // ── members and member users
  const TITLES = ['Growth lead', 'Head of Growth', 'Founder', 'Marketing manager', 'Creator partnerships lead', 'Performance marketer', 'Co-founder', 'Product marketing manager'];
  const mkMember = (brand, role, name, opts = {}) => {
    const [first, ...rest] = name.split(' ');
    const last = rest.join(' ');
    const slugFirst = slugify(first);
    const userId = opts.userId ?? `usr_${slugFirst}_${slugify(last)}`;
    // two members of one workspace can share a first name: the second id carries the surname
    const memberId = opts.memberId ?? (members.some((m) => m.id === `bm_${brand.slug}_${slugFirst}`) ? `bm_${brand.slug}_${slugFirst}_${slugify(last)}` : `bm_${brand.slug}_${slugFirst}`);
    const staff = brand.key === 'flowd';
    const user = {
      id: userId, role: 'brand_member', email: staff ? `${slugFirst}.${slugify(last)}@joinflowd.io` : emailFor(name), display_name: name, name,
      avatarArt: artSeed(rng, { pattern: rng.pick(['orbs', 'rings']), label: initials(name) }), auth_providers: [rng.weighted([['google', 5], ['email', 3], ['apple', 1]])],
      status: opts.status === 'invited' ? 'invited' : 'active', age_verified: true, locale: 'en-US',
      timezone: brand.country === 'GB' || brand.country === 'IE' ? 'Europe/London' : brand.country === 'AU' ? 'Australia/Sydney' : brand.country === 'DE' || brand.country === 'NL' ? 'Europe/Berlin' : brand.country === 'CA' ? 'America/Toronto' : rng.pick(['America/Los_Angeles', 'America/New_York', 'America/Chicago']),
      createdAt: opts.joinedAt ?? iso(ms(brand.createdAt) + rng.int(0, 5) * HOUR_MS), title: opts.title ?? rng.pick(TITLES),
    };
    users.push(user);
    const member = { id: memberId, brand, user, role, status: opts.status ?? 'active', joinedAt: user.createdAt, invitedBy: opts.invitedBy, code: opts.code };
    brand.members.push(member);
    members.push(member);
    return member;
  };

  for (const brand of brands) {
    if (brand.key === 'lumi') {
      const jordan = mkMember(brand, 'owner', 'Jordan Ellis', { userId: 'usr_jordan', memberId: 'bm_lumi_jordan', title: 'Growth lead', joinedAt: '2026-07-06T15:12:00Z' });
      mkMember(brand, 'reviewer', 'Maren Cole', { userId: 'usr_maren', memberId: 'bm_lumi_maren', title: 'Creator partnerships', joinedAt: '2026-07-07T09:30:00Z', invitedBy: jordan });
      mkMember(brand, 'finance', 'Tobias Lang', { userId: 'usr_tobias', memberId: 'bm_lumi_tobias', title: 'Finance and ops', joinedAt: '2026-08-12T09:50:00Z', invitedBy: jordan });
      mkMember(brand, 'viewer', 'Aiko Tanaka', { userId: 'usr_aiko', memberId: 'bm_lumi_aiko', title: 'Brand marketing', joinedAt: '2026-08-20T13:05:00Z', invitedBy: jordan });
      used.add('Jordan Ellis'); used.add('Maren Cole'); used.add('Tobias Lang'); used.add('Aiko Tanaka');
      continue;
    }
    if (brand.key === 'flowd') {
      const o = mkMember(brand, 'owner', uniqueName(rng, used), { title: 'Head of Partnerships' });
      mkMember(brand, 'reviewer', uniqueName(rng, used), { title: 'Creator success', invitedBy: o });
      continue;
    }
    if (brand.key === 'northstar') {
      const o = mkMember(brand, 'owner', uniqueName(rng, used), { title: 'Managing partner' });
      mkMember(brand, 'admin', uniqueName(rng, used), { title: 'Head of paid social', invitedBy: o });
      for (const [k, slug] of [[0, 'glowkit'], [1, 'subhawk']]) {
        const m = mkMember(brand, 'client_approver', uniqueName(rng, used), { title: `Client lead, ${APPS.find((a) => a.slug === slug).name}`, invitedBy: o, code: `ca-${slug}-${alnum(rng, 6)}` });
        m.clientOf = slug;
      }
      continue;
    }
    const bp = BRAND_PLAN.find((x) => x.slug === brand.key);
    const n = bp.members;
    const owner = mkMember(brand, 'owner', uniqueName(rng, used), { title: rng.pick(['Founder', 'Head of Growth', 'Growth lead', 'Co-founder', 'Marketing lead']) });
    if (n >= 2) mkMember(brand, rng.pick(['reviewer', 'reviewer', 'admin']), uniqueName(rng, used), { invitedBy: owner });
    if (n >= 3) mkMember(brand, rng.pick(['finance', 'viewer', 'reviewer']), uniqueName(rng, used), { invitedBy: owner, status: rng.chance(0.15) ? 'invited' : 'active' });
  }

  // reviewers (who decides): owner / admin / reviewer roles
  for (const b of brands) {
    b.reviewers = b.members.filter((m) => ['owner', 'admin', 'reviewer'].includes(m.role) && m.status === 'active');
    b.owner = b.members.find((m) => m.role === 'owner');
  }
  W.brands = brands;
  W.apps = apps;
  W.members = members;
  W.brandBy = new Map(brands.map((b) => [b.key, b]));
  W.appBy = new Map(apps.map((a) => [a.slug, a]));
}

function mkApp(def, index, brand, connectedAt, rng) {
  const hue = hueOfHex(def.colors.primary);
  const app = {
    id: `app_${def.slug}`, slug: def.slug, def, brand, name: def.name, category: def.category, connectedAt,
    icon: { ...artSeed(rng, { hue, pattern: rng.pick(['grid', 'spark']), label: def.name[0] }), hue_b: hueOfHex(def.colors.secondary), hue_c: hueOfHex(def.colors.accent) },
    appStoreId: appStoreIdFor(index + 1), pricing: def.pricing, avgFirstPayment: def.avg_first_payment_cents,
    status: 'connected', sdkStatus: 'verified', mmp: 'none',
  };
  return app;
}

// ── creators ────────────────────────────────────────────────────────────────────────────────────
/** tier mix with founding flag. Counts follow TIER_DISTRIBUTION (46/24/13/5/2). */
const ARCHETYPES = [
  { tier: 'elite', founding: true, n: 2 }, { tier: 'platinum', founding: true, n: 5 }, { tier: 'gold', founding: true, n: 10 }, { tier: 'gold', founding: false, n: 3 },
  { tier: 'silver', founding: true, n: 7 }, { tier: 'silver', founding: false, n: 16 }, { tier: 'bronze', founding: true, n: 11 }, { tier: 'bronze', founding: false, n: 36 },
];
/** median views of the primary account (28 days) and followers by tier */
const SIZE = {
  elite: { med: [78_000, 130_000], fol: [190_000, 380_000] }, platinum: { med: [38_000, 82_000], fol: [110_000, 230_000] }, gold: { med: [17_000, 52_000], fol: [60_000, 150_000] },
  silver: { med: [6_000, 19_000], fol: [24_000, 90_000] }, bronze: { med: [1_300, 7_000], fol: [2_400, 36_000] },
};
const QUALITY = { elite: [0.86, 0.95], platinum: [0.82, 0.92], gold: [0.76, 0.9], silver: [0.68, 0.86], bronze: [0.42, 0.8] };

export function buildCreators(W) {
  const rng = W.rng.fork('creators');
  const used = W.usedNames;
  const handles = rng.shuffle(HANDLES.filter((h) => h !== 'maya.makes')).slice(0, 89);
  const plan = [];
  for (const a of ARCHETYPES) for (let i = 0; i < a.n; i++) plan.push({ ...a });
  // Maya is silver, not founding; she is one of the 16 non-founding silvers
  const mayaSlot = plan.findIndex((p) => p.tier === 'silver' && !p.founding);
  plan.splice(mayaSlot, 1);

  const creators = [];
  const refCodes = new Set(['MAYA6']);
  const mkCreator = (p, i, persona) => {
    const founding = p.founding;
    let handle = persona ? 'maya.makes' : handles.pop();
    // name consistent with the handle when it contains a first name
    let name = persona ? 'Maya Reyes' : null;
    if (!name) {
      const toks = handle.split(/[._]/).map((t) => t.toLowerCase());
      const hit = toks.find((t) => FIRST_NAMES.some((f) => f.toLowerCase() === t));
      for (let tries = 0; tries < 50 && !name; tries++) {
        const first = hit ? FIRST_NAMES.find((f) => f.toLowerCase() === hit) : rng.pick(FIRST_NAMES);
        const cand = `${first} ${rng.pick(LAST_NAMES)}`;
        if (!used.has(cand) && !isBlocked(cand)) { used.add(cand); name = cand; }
      }
      if (!name) name = uniqueName(rng, used);
    } else used.add(name);
    const country = persona ? COUNTRIES[0] : rng.weighted(COUNTRIES.map((c) => [c, c.share]));
    const tierKey = p.tier;
    const size = SIZE[tierKey];
    const q = persona ? 0.78 : rng.float(QUALITY[tierKey][0], QUALITY[tierKey][1]);
    const medianViews = persona ? 14_200 : Math.round(Math.exp(rng.float(Math.log(size.med[0]), Math.log(size.med[1]))));
    const followers = persona ? 48_200 : Math.round(clamp(medianViews * rng.float(2.4, 9.5) * (tierKey === 'bronze' ? 1.3 : 1), size.fol[0], size.fol[1]));
    // niches
    const nicheCount = persona ? 2 : rng.weighted([[1, 3], [2, 5], [3, 2]]);
    const niches = persona ? ['lifestyle', 'ai_tools'] : [];
    while (niches.length < nicheCount) { const n = rng.weighted(NICHES.map((x) => [x.key, x.weight])); if (!niches.includes(n)) niches.push(n); }
    const firstName = name.split(' ')[0];
    let code = persona ? 'MAYA6' : null;
    while (!code) { const c = `${firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)}${rng.int(2, 9)}`; if (!refCodes.has(c)) { refCodes.add(c); code = c; } }
    const cr = {
      id: persona ? 'cr_maya' : makeId('cr', handle), idx: i, persona, handle, name, firstName, lastName: name.split(' ').slice(1).join(' '), country, countryCode: country.code, niches, tierTarget: tierKey, founding,
      quality: q, medianViews, followers, referralCode: code, accounts: [], subs: [], posts: [], usRatio: country.code === 'US' ? rng.float(0.58, 0.86) : rng.float(0.06, 0.38),
      fraudProneness: 0, joinedAt: null, trait: {},
    };
    if (persona) cr.usRatio = 0.71;
    return cr;
  };

  // Maya first, then everyone else in a shuffled order
  const maya = mkCreator({ tier: 'silver', founding: false }, 0, true);
  creators.push(maya);
  const rest = rng.shuffle(plan);
  rest.forEach((p, k) => creators.push(mkCreator(p, k + 1, false)));

  // ── join dates: founders in the first nine days; Maya on 07-14; everyone else along the ramp
  const founders = creators.filter((c) => c.founding);
  founders.forEach((c) => { c.joinedAt = iso(ms('2026-07-05T07:30:00Z') + Math.floor(rng.next() * 8.4 * DAY_MS)); });
  maya.joinedAt = '2026-07-14T16:42:00Z';
  const nonFounders = creators.filter((c) => !c.founding && !c.persona);
  const nfSorted = rng.shuffle(nonFounders);
  // gold and silver non-founders join early enough to earn their tier; bronze spread over the ramp
  const early = nfSorted.filter((c) => c.tierTarget === 'gold');
  early.forEach((c, i) => { c.joinedAt = iso(ms('2026-07-14T20:00:00Z') + (i * 2 + rng.float(0, 1.2)) * DAY_MS); });
  const silv = nfSorted.filter((c) => c.tierTarget === 'silver');
  silv.forEach((c, i) => { c.joinedAt = iso(ms('2026-07-16T10:00:00Z') + rng.float(0, 32) * DAY_MS); });
  const bronze = nfSorted.filter((c) => c.tierTarget === 'bronze');
  bronze.forEach((c) => {
    // later weeks get more joiners (ramp), the last few days included
    const wk = rng.weighted([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 12], [13, 5]]);
    c.joinedAt = iso(Math.min(NOW_EPOCH - 6 * HOUR_MS, ms(LAUNCH) + (wk - 1) * 7 * DAY_MS + rng.float(0.2, 6.8) * DAY_MS + 9 * HOUR_MS));
    if (ms(c.joinedAt) < ms('2026-07-14T21:00:00Z')) c.joinedAt = iso(ms('2026-07-14T21:00:00Z') + rng.float(0, 2) * DAY_MS);
  });
  creators.sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt));
  creators.forEach((c, i) => { c.joinIndex = i; });

  // ── social accounts
  const users = W.users;
  for (const c of creators) {
    const primaryFollowers = c.followers;
    const tiktok = mkAccount(rng, c, 'tiktok', primaryFollowers, c.medianViews, true, W);
    c.accounts.push(tiktok);
    const wantsIg = c.persona || rng.chance(c.tierTarget === 'bronze' ? 0.34 : 0.55);
    if (wantsIg) {
      const f = c.persona ? 21_400 : Math.round(primaryFollowers * rng.float(0.25, 0.8));
      const m = c.persona ? 6_100 : Math.round(c.medianViews * rng.float(0.22, 0.6));
      c.accounts.push(mkAccount(rng, c, 'instagram', f, m, false, W));
    }
    if (!c.persona && rng.chance(c.tierTarget === 'bronze' ? 0.08 : 0.2)) {
      c.accounts.push(mkAccount(rng, c, 'youtube', Math.round(primaryFollowers * rng.float(0.08, 0.35)), Math.round(c.medianViews * rng.float(0.3, 0.8)), false, W));
    }
  }
  // trim to about 150 accounts
  let total = creators.reduce((s, c) => s + c.accounts.length, 0);
  const trimTargets = rng.shuffle(creators.filter((c) => !c.persona && c.accounts.length > 1 && c.tierTarget === 'bronze'));
  while (total > 152 && trimTargets.length) { const c = trimTargets.pop(); c.accounts.pop(); total--; }
  W.creators = creators;
  W.creatorById = new Map(creators.map((c) => [c.id, c]));
  W.maya = maya;

  // ── users (creators)
  for (const c of creators) {
    const staffless = c.persona ? 'maya.reyes@example.com' : emailFor(c.name);
    const user = {
      id: c.persona ? 'usr_maya' : makeId('usr', c.handle), role: 'creator', email: staffless, display_name: c.name, name: c.name,
      avatarArt: artSeed(rng, { pattern: rng.pick(['orbs', 'rings']), label: initials(c.name) }), auth_providers: [rng.weighted([['apple', 5], ['google', 3], ['email', 2]])],
      status: 'active', age_verified: true, locale: c.country.locale, timezone: rng.pick(c.country.timezones), createdAt: iso(ms(c.joinedAt) - rng.int(2, 40) * 60_000), title: undefined,
    };
    if (c.persona) { user.auth_providers = ['apple', 'email']; user.timezone = 'America/Chicago'; }
    users.push(user);
    c.user = user;
  }
  // two Ops users
  const ops = {
    id: 'usr_ops', role: 'admin', email: 'sam@joinflowd.io', display_name: 'Sam Okafor', name: 'Sam Okafor', avatarArt: artSeed(rng, { pattern: 'rings', label: 'SO' }), auth_providers: ['google'], status: 'active',
    age_verified: true, locale: 'en-US', timezone: 'America/New_York', createdAt: '2026-07-01T12:00:00Z', title: 'Trust & Ops lead',
  };
  const ops2 = {
    id: 'usr_ops2', role: 'admin', email: 'dara@joinflowd.io', display_name: 'Dara Whitfield', name: 'Dara Whitfield', avatarArt: artSeed(rng, { pattern: 'orbs', label: 'DW' }), auth_providers: ['google'], status: 'active',
    age_verified: true, locale: 'en-GB', timezone: 'Europe/London', createdAt: '2026-07-01T12:30:00Z', title: 'Payments and compliance analyst',
  };
  users.push(ops, ops2);
  W.ops = ops;
  W.ops2 = ops2;
}

function isBlocked(full) { return false; }

function mkAccount(rng, c, platform, followers, medianViews, primary, W) {
  const ageYears = rng.float(0.8, 5);
  const handleBase = c.handle;
  const handle = platform === 'tiktok' ? handleBase : platform === 'instagram' ? (c.persona ? 'maya.makes' : handleBase.replace(/\./g, '_')) : `${handleBase.replace(/\./g, '')}`;
  const eng = clamp(rng.normal(0.058, 0.014), 0.03, 0.09);
  const us = platform === 'instagram' ? clamp(c.usRatio + rng.float(-0.06, 0.04), 0.03, 0.95) : c.usRatio;
  const acct = {
    id: `sa_${slugify(c.handle)}_${platform}`, creator: c, platform, handle, followers, medianViews, avgViews: Math.round(medianViews * rng.float(1.25, 1.9)), engagement: eng, usRatio: us,
    status: rng.chance(0.03) ? 'needs_reauth' : 'connected', verifiedByPlatform: followers > 80_000 && rng.chance(0.5), primary,
    createdAt: iso(ms('2026-07-05T00:00:00Z') - ageYears * 365 * DAY_MS), connectedAt: iso(ms(c.joinedAt) + rng.int(3, 90) * 60_000 * 4), health: null,
  };
  if (c.persona) {
    acct.id = platform === 'tiktok' ? 'sa_maya_tiktok' : 'sa_maya_instagram';
    acct.avgViews = platform === 'tiktok' ? 21_300 : 8_900;
    acct.engagement = platform === 'tiktok' ? 0.061 : 0.047;
    acct.createdAt = platform === 'tiktok' ? '2023-11-02T17:20:00Z' : '2022-06-19T10:05:00Z';
    acct.connectedAt = platform === 'tiktok' ? '2026-07-14T16:58:00Z' : '2026-07-14T17:03:00Z';
    acct.status = 'connected';
  }
  const score = clamp(Math.round(rng.normal(90, 6)), 62, 100);
  acct.health = { score, status: score >= 80 ? 'good' : score >= 70 ? 'watch' : 'at_risk', strikes: score < 72 ? rng.int(1, 2) : 0, unoriginal: score < 75 ? 1 : 0 };
  return acct;
}
