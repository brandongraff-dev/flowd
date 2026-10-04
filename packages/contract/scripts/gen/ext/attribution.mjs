// Attribution plumbing: the offer-code pool, ingested RevenueCat events, integrations, API keys and webhooks.
// Apple allows 10 active offer codes per subscription SKU, so flowd rotates a pool and always falls back to the deterministic link.

import crypto from 'node:crypto';
import { iso, ms, addDays, addHours, groupBy, sum, slugify } from '../lib.mjs';
import * as P from '../pools.mjs';

const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const hex = (seed, n) => crypto.createHash('sha1').update(seed).digest('hex').slice(0, n);
const uuidLike = (seed) => { const h = crypto.createHash('sha1').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const skuOf = (app, period) => `${W_slug(app)}_pro_${period}`;
const W_slug = (app) => String(app.id).replace(/^app_/, '');

// ── offer-code pool ──────────────────────────────────────────────────────────────────────────────────
export function genOfferCodes(W, rng) {
  const nowMs = ms(W.now);
  const cap = W.C.attribution.apple_active_offers_per_sku;
  const rows = [];
  const byApp = groupBy(W.links.filter((l) => l.promo_code), 'app_id');
  const convByLink = groupBy(W.conversions.filter((c) => c.source === 'code' && ['trial', 'paid'].includes(c.kind)), 'link_id');
  let n = 0;
  for (const app of W.apps) {
    if (app.id === 'app_flowd') continue;
    const r = rng.fork(`occ:${app.id}`);
    const isLumi = app.id === W.ctx.world.PERSONAS.brand.app_id;
    const links = (byApp.get(app.id) ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // one entry per distinct code, most recent first
    const seen = new Set();
    const uniq = [];
    for (const l of links) { if (!seen.has(l.promo_code)) { seen.add(l.promo_code); uniq.push(l); } }
    const annual = skuOf(app, 'annual');
    const monthly = skuOf(app, 'monthly');
    const trial = app.pricing?.trial_days ?? 7;
    const offerName = (k) => (k % 4 === 3 ? 'First month free' : `${trial}-day free trial`);
    const activeTarget = isLumi ? 8 : Math.min(cap, r.int(2, 3));
    const assignedLinks = uniq.slice(0, activeTarget);
    const histLinks = uniq.slice(activeTarget, activeTarget + (isLumi ? 3 : 1));
    const make = (l, k, sku, status, extra = {}) => {
      n++;
      const createdAt = iso(Math.max(ms(app.connected_at) + 3_600_000, (l ? ms(l.created_at) : nowMs - r.int(5, 60) * DAY) - r.int(1, 5) * DAY));
      const redemptions = l ? sum(convByLink.get(l.id) ?? [], (c) => c.quantity) : 0;
      const max = status === 'exhausted' ? Math.max(25, redemptions || 25) : W.C.attribution.apple_custom_code_max_redemptions;
      const expiredAt = addDays(createdAt, 75);
      rows.push({
        app_id: app.id, sku, offer_name: offerName(k), code: l ? l.promo_code : extra.code, status,
        ...(l && status === 'assigned' ? { assigned_creator_id: l.creator_id, assigned_bounty_id: l.bounty_id, assigned_link_id: l.id, assigned_at: l.created_at } : {}),
        redemptions: status === 'exhausted' ? max : redemptions, max_redemptions: max,
        valid_from: createdAt, valid_until: status === 'expired' ? (ms(expiredAt) < nowMs ? expiredAt : iso(nowMs - 2 * DAY)) : addDays(createdAt, 365),
        ...(status === 'assigned' ? { rotation_due_at: addDays(l.created_at, 45) } : {}), created_at: createdAt,
      });
    };
    assignedLinks.forEach((l, k) => make(l, k, annual, 'assigned'));
    histLinks.forEach((l, k) => make(l, k + 1, k % 2 ? annual : monthly, ['retired', 'expired', 'exhausted'][(k + (isLumi ? 0 : 1)) % 3]));
    // pre-minted pool codes waiting for the next creator (Lumi tops up to exactly eight active)
    const minted = isLumi ? Math.max(0, 8 - assignedLinks.length) : Math.max(1, activeTarget - assignedLinks.length);
    for (let m = 0; m < minted; m++) {
      const code = `${app.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${hex(`${app.id}${m}`, 4).toUpperCase()}`;
      if (rows.some((x) => x.app_id === app.id && x.code === code)) continue;
      make(null, 90 + m, annual, 'available', { code });
    }
  }
  // hard guarantee: never more than the Apple cap active per (app, sku): demote the oldest extras to retired
  const active = new Map();
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  for (const r2 of rows) {
    if (!['available', 'assigned'].includes(r2.status)) continue;
    const k = `${r2.app_id}|${r2.sku}`;
    const c = (active.get(k) ?? 0) + 1;
    active.set(k, c);
    if (c > cap) { r2.status = 'retired'; delete r2.rotation_due_at; }
  }
  rows.sort((a, b) => (a.app_id < b.app_id ? -1 : a.app_id > b.app_id ? 1 : a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.created_at < b.created_at ? -1 : 1));
  const seq = new Map();
  return rows.map((row) => { const k = (seq.get(row.app_id) ?? 0) + 1; seq.set(row.app_id, k); return { id: `occ_${W_slug({ id: row.app_id })}_${String(k).padStart(3, '0')}`, ...row }; });
}

// ── RevenueCat events ────────────────────────────────────────────────────────────────────────────────
export function genRevenueCatEvents(W, rng) {
  const nowMs = ms(W.now);
  const events = [];
  const lumiApp = W.ctx.world.PERSONAS.brand.app_id;
  const linkById = W.linkById;
  const sdkOk = (app) => ['installed', 'verified'].includes(app?.sdk_status);
  // only apps that connected RevenueCat and charge for a subscription send these webhooks (flowd's own app is free)
  const rcApp = (id) => { const a = W.appById.get(id); return Boolean(a?.revenuecat_project_id) && (a.pricing?.monthly_cents ?? 0) > 0; };
  const tracked = W.conversions.filter((c) => ['link', 'code'].includes(c.source) && ['trial', 'paid'].includes(c.kind) && ['cleared', 'pending'].includes(c.status) && rcApp(c.app_id));
  const trialByPost = new Map();
  for (const c of tracked) if (c.kind === 'trial') trialByPost.set(c.post_id, (trialByPost.get(c.post_id) ?? 0) + c.quantity);
  const paidSeen = new Map();
  const mk = (r, o) => {
    const e = {
      app_id: o.app.id, event_type: o.type, period_type: o.period, app_user_id: `$RCAnonymousID:${hex(`${o.key}:user`, 32)}`, product_id: o.sku, price_cents: o.price, currency: 'USD', is_trial_conversion: Boolean(o.trialConv),
      ...(o.offer_code ? { offer_code: o.offer_code } : {}), subscriber_attributes: o.attrs ?? {}, environment: o.env ?? 'production', purchased_at: o.at, ...(o.expires ? { expiration_at: o.expires } : {}),
      received_at: iso(Math.min(nowMs - 30_000, ms(o.at) + r.int(2, 40) * 1000)), match_status: o.match ?? 'unmatched', ...(o.convId ? { matched_conversion_id: o.convId } : {}), ...(o.linkId ? { matched_link_id: o.linkId } : {}), ...(o.creatorId ? { matched_creator_id: o.creatorId } : {}),
      idempotency_key: uuidLike(o.key),
    };
    events.push(e);
    return e;
  };
  const priceFor = (app, period) => Math.round((period === 'annual' ? app.pricing.annual_cents : app.pricing.monthly_cents) * 0.85);
  const life = []; // matched subscriptions that may renew or cancel later

  // 1. every tracked trial and paid conversion unit gets an event
  for (const c of tracked) {
    const app = W.appById.get(c.app_id);
    if (!app) continue;
    const link = linkById.get(c.link_id);
    const creator = W.creatorById.get(c.creator_id);
    const trialDays = app.pricing?.trial_days ?? 7;
    for (let i = 0; i < c.quantity; i++) {
      const key = `${c.id}:${i}`;
      const r = rng.fork(`rce:${key}`);
      const at = iso(Math.min(nowMs - 60_000, ms(c.first_at) + i * r.int(10, 160) * 60_000 + r.int(0, 40) * 60_000));
      const attrs = sdkOk(app) && c.source === 'link' && link ? { flowd_link: link.code, flowd_creator: creator?.handle ?? '' } : {};
      const period = r.chance(0.58) ? 'annual' : 'monthly';
      const sku = skuOf(app, period);
      const code = c.source === 'code' ? link?.promo_code : undefined;
      if (c.kind === 'trial') {
        mk(r, { app, key, type: 'initial_purchase', period: 'trial', sku, price: 0, at, expires: addDays(at, trialDays), attrs, offer_code: code, match: 'matched', convId: c.id, linkId: c.link_id, creatorId: c.creator_id });
        life.push({ app, key, at, kind: 'trial', c, r, sku, period, attrs, code, converts: false });
      } else {
        const hadTrial = (trialByPost.get(c.post_id) ?? 0) > (paidSeen.get(c.post_id) ?? 0);
        paidSeen.set(c.post_id, (paidSeen.get(c.post_id) ?? 0) + 1);
        const price = priceFor(app, period);
        if (hadTrial) {
          mk(r, { app, key, type: 'renewal', period: 'normal', sku, price, at, expires: addDays(at, period === 'annual' ? 365 : 30), attrs, offer_code: code, trialConv: true, match: 'matched', convId: c.id, linkId: c.link_id, creatorId: c.creator_id });
        } else {
          mk(r, { app, key, type: 'initial_purchase', period: 'normal', sku, price, at, expires: addDays(at, period === 'annual' ? 365 : 30), attrs, offer_code: code, match: 'matched', convId: c.id, linkId: c.link_id, creatorId: c.creator_id });
        }
        life.push({ app, key, at, kind: 'paid', c, r, sku, period, attrs, code, price });
      }
    }
  }
  // 2. what happens next: monthly renewals, cancellations, expirations of trials that did not convert
  for (const s of life) {
    const { app, c, r } = s;
    const trialDays = app.pricing?.trial_days ?? 7;
    const mkNext = (type, period, at, extra = {}) => {
      if (ms(at) > nowMs - 5 * 60_000) return;
      mk(r, { app, key: `${s.key}:${type}:${extra.n ?? 0}`, type, period, sku: s.sku, price: extra.price ?? 0, at, expires: extra.expires, attrs: s.attrs, offer_code: undefined, match: 'matched', convId: c.id, linkId: c.link_id, creatorId: c.creator_id });
    };
    if (s.kind === 'trial') {
      if (r.chance(0.5)) { mkNext('cancellation', 'trial', addHours(s.at, r.int(20, trialDays * 24 - 6))); mkNext('expiration', 'trial', addDays(s.at, trialDays)); }
    } else if (s.period === 'monthly') {
      for (let m = 1; m <= 3; m++) {
        const at = addDays(s.at, 30 * m);
        if (ms(at) > nowMs) break;
        if (r.chance(m === 1 ? 0.78 : 0.86)) mkNext('renewal', 'normal', at, { n: m, price: s.price, expires: addDays(at, 30) });
        else { mkNext('cancellation', 'normal', addDays(at, -r.int(2, 14)), { n: m }); mkNext('expiration', 'normal', at, { n: m }); break; }
      }
      if (r.chance(0.04)) mkNext('billing_issue', 'normal', addDays(s.at, 30 + r.int(0, 3)), { n: 9 });
    } else if (r.chance(0.07)) mkNext('cancellation', 'normal', addDays(s.at, r.int(20, 60)), { n: 5 });
  }

  // The webhook log keeps the most recent events: cut it so the table stays near its catalogue size whatever the conversion volume is
  const LOG_TARGET = 1380;
  if (events.length > LOG_TARGET) {
    const cutoff = events.map((e) => ms(e.purchased_at)).sort((a, b) => b - a)[LOG_TARGET - 1];
    for (let i = events.length - 1; i >= 0; i--) if (ms(events[i].purchased_at) < cutoff) events.splice(i, 1);
  }
  const logHours = Math.max(48, Math.floor((nowMs - Math.min(nowMs - 48 * 3_600_000, ...events.map((e) => ms(e.purchased_at)))) / 3_600_000));

  // 3. organic subscriptions that no creator link explains (unmatched), duplicates (redeliveries) and ignored test events
  const matchedN = events.length;
  const orgApps = W.apps.filter((a) => rcApp(a.id));
  // Lumi has exactly one unmatched event; other apps get the rest
  const scale = Math.max(1, matchedN) / 0.9;
  const needUnmatched = Math.max(2, Math.round(scale * 0.06));
  const organic = [];
  const addOrganic = (app, i) => {
    const r = rng.fork(`rce:org:${app.id}:${i}`);
    const period = r.chance(0.6) ? 'annual' : 'monthly';
    const at = iso(nowMs - r.int(1, logHours) * 3_600_000 - r.int(0, 59) * 60_000);
    if (ms(at) < ms(app.connected_at) + 3_600_000) return;
    const trial = r.chance(0.62);
    const key = `org:${app.id}:${i}`;
    organic.push({ r, app, key, at, trial, period });
  };
  const nonLumi = orgApps.filter((a) => a.id !== lumiApp);
  for (let i = 0; i < needUnmatched - 1; i++) addOrganic(nonLumi[i % nonLumi.length], i);
  if (W.appById.has(lumiApp)) addOrganic(W.appById.get(lumiApp), 999);
  for (const o of organic) {
    const { r, app } = o;
    const sku = skuOf(app, o.period);
    const trialDays = app.pricing?.trial_days ?? 7;
    if (o.trial) mk(r, { app, key: o.key, type: 'initial_purchase', period: 'trial', sku, price: 0, at: o.at, expires: addDays(o.at, trialDays), attrs: {}, match: 'unmatched' });
    else mk(r, { app, key: o.key, type: 'initial_purchase', period: 'normal', sku, price: priceFor(app, o.period), at: o.at, expires: addDays(o.at, o.period === 'annual' ? 365 : 30), attrs: {}, match: 'unmatched' });
  }
  // duplicates: RevenueCat redelivers a webhook (same idempotency key, a few minutes later)
  const rd = rng.fork('rce:dup');
  const dupN = Math.round(scale * 0.03);
  for (const src of rd.sample(events.filter((e) => e.match_status === 'matched'), dupN)) {
    events.push({ ...src, received_at: iso(Math.min(nowMs - 20_000, ms(src.received_at) + rd.int(2, 40) * 60_000)), match_status: 'duplicate', matched_conversion_id: undefined, matched_link_id: undefined, matched_creator_id: undefined });
  }
  // ignored: sandbox test events
  const ig = Math.round(scale * 0.01);
  for (let i = 0; i < ig; i++) {
    const app = orgApps[(i * 5) % orgApps.length];
    const r = rng.fork(`rce:test:${i}`);
    const at = iso(nowMs - r.int(1, logHours) * 3_600_000);
    if (ms(at) < ms(app.connected_at)) continue;
    mk(r, { app, key: `test:${i}`, type: 'test', period: 'normal', sku: skuOf(app, 'monthly'), price: 0, at, attrs: {}, env: 'sandbox', match: 'ignored' });
  }
  events.sort((a, b) => (a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : a.idempotency_key < b.idempotency_key ? -1 : 1));
  return events.map((e, i) => {
    const { ...rest } = e;
    for (const k of Object.keys(rest)) if (rest[k] === undefined) delete rest[k];
    return { id: `rce_${String(i + 1).padStart(6, '0')}`, ...rest };
  });
}

// ── integrations ─────────────────────────────────────────────────────────────────────────────────────
export function genIntegrations(W, rng, rcEvents) {
  const nowMs = ms(W.now);
  const rows = [];
  const rcBy = groupBy(rcEvents.filter((e) => e.match_status !== 'ignored'), 'app_id');
  const events24 = (appId) => (rcBy.get(appId) ?? []).filter((e) => ms(e.received_at) > nowMs - DAY).length;
  const lastEvt = (appId) => (rcBy.get(appId) ?? []).map((e) => e.received_at).sort().pop();
  const adBrands = new Map();
  for (const ad of W.ads) { const s = adBrands.get(ad.brand_id) ?? new Set(); s.add(ad.platform); adBrands.set(ad.brand_id, s); }
  const brandOf = (app) => W.brandById.get(app.brand_id);
  const add = (spec) => {
    const r = rng.fork(`intg:${spec.brand.id}:${spec.kind}`);
    const def = P.INTEGRATION_DEFS[spec.kind];
    const connectedAt = iso(Math.max(ms(spec.app?.connected_at ?? spec.brand.created_at) + 2 * 3_600_000, ms(spec.brand.created_at) + (spec.kind === 'slack' ? 8 : 1) * DAY));
    const status = spec.status ?? 'connected';
    const syncAgeH = status === 'needs_attention' ? r.int(60, 110) : status === 'error' ? r.int(30, 50) : r.int(1, 9);
    const lastSync = status === 'disconnected' ? undefined : iso(Math.max(ms(connectedAt), nowMs - syncAgeH * 3_600_000));
    const e24 = spec.kind === 'revenuecat' && spec.app ? events24(spec.app.id) : spec.kind === 'slack' ? r.int(4, 40) : status === 'connected' ? r.int(0, 60) : 0;
    const lastEvent = spec.kind === 'revenuecat' && spec.app ? lastEvt(spec.app.id) : spec.kind === 'slack' ? iso(nowMs - r.int(1, 30) * 3_600_000) : undefined;
    const token = hex(`${spec.brand.id}${spec.kind}`, 6);
    rows.push({
      brand_id: spec.brand.id, ...(spec.app ? { app_id: spec.app.id } : {}), kind: spec.kind, status, label: `${def.label}${spec.app ? ` · ${spec.app.name}` : ''}`, scopes: def.scopes, config: spec.config ?? {},
      ...(spec.kind === 'revenuecat' ? { webhook_url: `https://api.joinflowd.io/v1/webhooks/revenuecat/${W_slug(spec.app)}_${token}`, secret_last4: hex(`${spec.app.id}sec`, 4) } : {}),
      ...(spec.coverage !== undefined ? { coverage_ratio: spec.coverage } : {}), events_24h: e24, health_note: spec.note, ...(status === 'disconnected' ? {} : { connected_at: connectedAt }), ...(lastSync ? { last_sync_at: lastSync } : {}), ...(lastEvent ? { last_event_at: lastEvent } : {}),
    });
  };
  const apps = W.apps.filter((a) => a.id !== 'app_flowd');
  let rcErrorDone = false;
  let rcStaleDone = false;
  apps.forEach((app, i) => {
    const brand = brandOf(app);
    if (!brand) return;
    const r = rng.fork(`intg:cfg:${app.id}`);
    const isLumi = app.id === W.ctx.world.PERSONAS.brand.app_id;
    // RevenueCat
    if (app.revenuecat_project_id) {
      let status = 'connected';
      let note = `Webhook events are flowing. ${isLumi ? 'One recent event had no creator link and was left unmatched.' : 'Every tracked trial and paid event is matched to a link or a code.'}`;
      if (!isLumi && !rcErrorDone && i % 7 === 4) { status = 'error'; rcErrorDone = true; note = 'The webhook returned 401 on the last 6 deliveries. Rotate the ingest secret in RevenueCat and paste the new one here.'; }
      else if (!isLumi && !rcStaleDone && i % 9 === 6) { status = 'needs_attention'; rcStaleDone = true; note = 'No events for 3 days. Check that the RevenueCat webhook still points at the flowd URL and that the SDK snippet is in the latest build.'; }
      add({ brand, app, kind: 'revenuecat', status, coverage: isLumi ? 0.88 : Math.round(r.float(0.64, 0.93) * 100) / 100, note, config: { project_id: app.revenuecat_project_id, environment: 'production', sdk: app.sdk_status === 'verified' ? 'verified' : 'installed' } });
    }
    if (isLumi) {
      add({ brand, app, kind: 'slack', note: 'Approvals and daily digests post to #growth-ugc. 3 people approved from Slack this week.', config: { channel: '#growth-ugc', digest: 'daily 09:00', approvals: 'on' } });
      add({ brand, app, kind: 'tiktok_ads', note: 'Spark authorisation codes are synced. Two promoted posts are running.', config: { advertiser: 'Lumi Labs (TikTok)', region: 'US' } });
      add({ brand, app, kind: 'meta_ads', note: 'Partnership ad permissions are synced.', config: { ad_account: 'act_lumi_demo', page: 'Lumi' } });
      add({ brand, app, kind: 'app_store_connect', note: 'Offer codes are synced: 8 of 10 active on the annual SKU.', config: { sku: skuOf(app, 'annual'), codes: '8 of 10 active' } });
      add({ brand, app, kind: 'zapier', note: 'Two Zaps run on post_cleared and wallet_low.', config: { zaps: '2' } });
    }
  });
  // other brands: Slack for Pro and Scale, a few MMPs, ad accounts for brands with ads, App Store Connect for a few, Zapier for two
  const proBrands = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== W.lumi?.id);
  proBrands.slice(0, 5).forEach((b, i) => add({ brand: b, kind: 'slack', status: 'connected', note: 'Approvals and digests post to the growth channel.', config: { channel: pick(rng.fork(`slackch:${b.id}`), ['#growth', '#ugc-approvals', '#creative-review', '#marketing-ops']), digest: i % 2 ? 'weekly Mon 09:00' : 'daily 09:00' } }));
  for (const app of apps.filter((a) => a.mmp && a.mmp !== 'none' && a.id !== W.ctx.world.PERSONAS.brand.app_id)) {
    const brand = brandOf(app);
    add({ brand, app, kind: app.mmp, status: 'connected', coverage: Math.round(rng.fork(`mmpcov:${app.id}`).float(0.55, 0.8) * 100) / 100, note: 'Installs sync every hour. MMP numbers are shown as Estimated and never trigger CPA pay.', config: { attribution_window: '7-day click' } });
  }
  for (const [brandId, plats] of adBrands) {
    if (brandId === W.lumi?.id) continue;
    const brand = W.brandById.get(brandId);
    const app = (W.appsByBrand.get(brandId) ?? [])[0];
    for (const p of plats) add({ brand, app, kind: p === 'tiktok' ? 'tiktok_ads' : 'meta_ads', note: 'Authorisation codes and permissions are synced.', config: p === 'tiktok' ? { advertiser: `${brand.name} (TikTok)` } : { ad_account: `act_${slugify(brand.name)}` } });
  }
  proBrands.slice(2, 4).forEach((b) => { const app = (W.appsByBrand.get(b.id) ?? [])[0]; add({ brand: b, app, kind: 'app_store_connect', note: 'Offer codes are synced to the pool.', config: { sku: skuOf(app, 'annual') } }); });
  proBrands.slice(5, 7).forEach((b, i) => add({ brand: b, kind: 'zapier', status: i ? 'disconnected' : 'connected', note: i ? 'Disconnected by the workspace owner. Webhooks are not forwarded.' : 'One Zap runs on submission_created.', config: i ? {} : { zaps: '1' } }));
  rows.sort((a, b) => (a.brand_id < b.brand_id ? -1 : a.brand_id > b.brand_id ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return rows.map((row) => ({ id: `intg_${W.slugOf(row.brand_id)}_${row.kind}${row.app_id && !['revenuecat'].includes(row.kind) ? '' : ''}`, ...row }));
}

// ── API keys ─────────────────────────────────────────────────────────────────────────────────────────
const FAKE_LAST4 = ['d3m0', 'f4k3', 't3st', 'n0pe', 's4mp', 'x0x0', 'fake', 'z3r0', 'demo', 'n0ne'];
export function genApiKeys(W, rng) {
  const nowMs = ms(W.now);
  const rows = [];
  const lumi = W.lumi;
  const jordan = W.memberById.get(W.ctx.world.PERSONAS.brand.member_id);
  let k = 0;
  const mk = (brand, member, spec) => {
    const r = rng.fork(`key:${brand.id}:${spec.name}`);
    const createdAt = iso(Math.max(ms(brand.created_at) + 3 * DAY, nowMs - spec.ageDays * DAY));
    rows.push({
      brand_id: brand.id, name: spec.name, mode: spec.mode, scopes: spec.scopes, prefix: spec.mode === 'live' ? 'fd_live_' : 'fd_test_', last4: FAKE_LAST4[k++ % FAKE_LAST4.length], created_by_member_id: member.id,
      rate_limit_per_minute: W.C.api.rate_limit_per_minute[brand.plan] ?? 60, requests_30d: spec.revoked ? r.int(0, 800) : spec.mode === 'test' ? r.int(20, 900) : r.int(1200, 38000), created_at: createdAt,
      ...(spec.revoked ? {} : { last_used_at: iso(nowMs - r.int(1, 60) * 3_600_000) }), ...(spec.expires ? { expires_at: addDays(createdAt, spec.expires) } : {}), ...(spec.revoked ? { revoked_at: iso(Math.min(nowMs - 3_600_000, ms(createdAt) + spec.revoked * DAY)) } : {}),
    });
  };
  if (lumi && jordan) {
    mk(lumi, jordan, { name: 'Growth automation', mode: 'live', scopes: ['read', 'write'], ageDays: 44 });
    mk(lumi, jordan, { name: 'Sandbox', mode: 'test', scopes: ['read', 'write', 'financial'], ageDays: 51 });
  }
  const others = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== lumi?.id);
  const specs = [['Zapier connector', 'live', ['read'], 38], ['Finance export', 'live', ['read', 'financial'], 30], ['Internal dashboard', 'live', ['read'], 26], ['Review bot', 'live', ['read', 'write'], 22], ['Staging', 'test', ['read', 'write'], 33], ['Old agency key', 'live', ['read', 'write'], 60, true]];
  others.slice(0, specs.length).forEach((b, i) => {
    const [name, mode, scopes, age, revoked] = specs[i];
    const mem = W.ownerOf(b.id);
    if (mem) mk(b, mem, { name, mode, scopes, ageDays: age, revoked: revoked ? 17 : undefined, expires: i === 1 ? 90 : undefined });
  });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rows.map((row) => ({ id: `key_${W.slugOf(row.brand_id)}_${row.mode === 'test' ? 'test' : row.brand_id === lumi?.id && row.scopes.length === 2 ? 'live' : slugify(row.name)}`, ...row }));
}

// ── webhooks ─────────────────────────────────────────────────────────────────────────────────────────
export function genWebhooks(W, rng) {
  const nowMs = ms(W.now);
  const rows = [];
  let whd = 0;
  const mk = (brand, member, spec) => {
    const r = rng.fork(`whk:${brand.id}:${spec.name}`);
    const createdAt = iso(Math.max(ms(brand.created_at) + 5 * DAY, nowMs - spec.ageDays * DAY));
    const deliveries = [];
    let t = nowMs - r.int(5, 90) * 60_000;
    for (let i = 0; i < 20; i++) {
      const ev = spec.events[(i + r.int(0, 3)) % spec.events.length];
      let status = 'delivered';
      let code = 200;
      if (spec.status === 'failing' && i < 7) { status = i < 3 ? 'retrying' : 'failed'; code = i % 2 ? 500 : 503; }
      else if (spec.status === 'failing' && r.chance(0.12)) { status = 'failed'; code = 502; }
      else if (r.chance(0.03)) code = 204;
      deliveries.push({ id: `whd_${++whd}`, event: ev, status, status_code: code, at: iso(t), latency_ms: status === 'delivered' ? r.int(60, 420) : r.int(2000, 10000) });
      t -= r.int(25, 300) * 60_000;
    }
    const lastOk = deliveries.find((d) => d.status === 'delivered');
    rows.push({
      brand_id: brand.id, url: spec.url, events: spec.events, status: spec.status, secret_last4: hex(`${brand.id}${spec.name}`, 4), failure_count: spec.status === 'failing' ? 7 : 0, deliveries, created_at: createdAt, ...(lastOk && spec.status !== 'disabled' ? { last_success_at: lastOk.at } : {}),
    });
  };
  const jordan = W.memberById.get(W.ctx.world.PERSONAS.brand.member_id);
  if (W.lumi && jordan) {
    mk(W.lumi, jordan, { name: 'relay', url: 'https://hooks.lumi.example/flowd/events', events: ['submission_created', 'submission_approved', 'post_cleared', 'wallet_low'], status: 'active', ageDays: 41 });
    mk(W.lumi, jordan, { name: 'ledger', url: 'https://finance.lumi.example/webhooks/flowd-ledger', events: ['invoice_paid', 'wallet_low', 'post_cleared'], status: 'failing', ageDays: 27 });
  }
  const specs = [
    ['events', ['bounty_live', 'bounty_filled', 'submission_created'], 'active', 'https://ops.{b}.example/hooks/flowd'], ['review', ['submission_created', 'submission_changes_requested'], 'active', 'https://api.{b}.example/flowd/review'],
    ['finance', ['invoice_paid', 'wallet_low'], 'paused', 'https://billing.{b}.example/flowd'], ['ads', ['ad_live', 'ad_fatigued', 'rights_expiring'], 'active', 'https://growth.{b}.example/promote'], ['legacy', ['post_cleared'], 'disabled', 'https://old.{b}.example/hooks'], ['trial', ['conversion_tracked'], 'active', 'https://data.{b}.example/flowd/conversions'],
  ];
  W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== W.lumi?.id).slice(0, specs.length).forEach((b, i) => {
    const mem = W.ownerOf(b.id);
    if (mem) mk(b, mem, { name: specs[i][0], url: specs[i][3].replace('{b}', W.slugOf(b.id)), events: specs[i][1], status: specs[i][2], ageDays: 20 + i * 5 });
  });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const nth = new Map();
  return rows.map((row) => {
    const k = (nth.get(row.brand_id) ?? 0) + 1;
    nth.set(row.brand_id, k);
    return { id: `whk_${W.slugOf(row.brand_id)}_${String(k).padStart(2, '0')}`, ...row };
  });
}
