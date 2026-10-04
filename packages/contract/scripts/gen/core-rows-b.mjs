// CORE stage 9b: posts, metrics, conversions, links, ads, ledger, payouts, invoices, money clock, market, ticker, scorecards, reputation.

import { artSeed, fill, slugify, timecode } from './lib.mjs';
import { CAPTION_TEMPLATES, PLATFORM_URLS, DISCLOSURE_TEXT } from './pools.mjs';
import { tierProgress, approvalRate, mulRate, postClearingRun } from '../../schema/formulas.mjs';
import { iso, ms, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, money, clockLabel, alnum, runAtOrAfter } from './core-kit.mjs';
import { composeAnalysis } from './core-analysis.mjs';
import { fraudDetail } from './core-posts.mjs';
import { APPROVED_FAMILY } from './core-subs.mjs';

const ART = (a) => ({ hue_a: a.hue_a, hue_b: a.hue_b, hue_c: a.hue_c, pattern: a.pattern, seed: a.seed, ...(a.label ? { label: a.label } : {}) });
const pad = (n, w = 4) => String(n).padStart(w, '0');
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

// ── finalise internal flags before rows ─────────────────────────────────────────────────────────
export function finalizeEntities(W) {
  const rng = W.rng.fork('finalize');
  // duplicates: submissions rejected for duplicate content, the Lumi duplicate special and the suspected-fraud auto-reject
  const wantsDup = (s) => s.special === 'lumi_duplicate' || s.special === 'suspected_fraud' || s.post?.fraudKind === 'duplicate' || s.vers.some((v) => v.reason === 'duplicate_content' || v.reason === 'unoriginal_clip');
  for (const s of W.subs) {
    if (!wantsDup(s)) continue;
    const others = s.bounty.subs.filter((o) => o !== s && o.creator !== s.creator && o.derived.versions[0].at < s.derived.versions[0].at);
    const other = others.length ? rng.pick(others) : null;
    if (!other) continue;
    const dist = rng.int(1, 5);
    const a = other.vers[other.vers.length - 1].analysis.phash.split('');
    for (let k = 0; k < dist; k++) { const i = rng.int(0, 15); a[i] = '0123456789abcdef'[rng.int(0, 15)]; }
    s.dupOf = { sub: other, dist, phash: a.join('') };
  }
  // posts: earnings, retention, captions, winners
  for (const p of W.posts) {
    const b = p.bounty;
    const rows = (p.rows ?? []).filter((r) => r.status !== 'reversed');
    let cpm = rows.filter((r) => r.type === 'cpm').reduce((a, r) => a + r.amt, 0);
    let cpa = rows.filter((r) => r.type === 'cpa').reduce((a, r) => a + r.amt, 0);
    const flat = rows.filter((r) => r.type === 'flat_fee').reduce((a, r) => a + r.amt, 0);
    if (p.isLive && p.plan?.estimate) { cpm += p.plan.estimate.cpm ?? 0; }
    for (const bt of p.plan?.cpa ?? []) if (!bt.cleared) cpa += bt.pay;
    let flatT = flat + (p.isLive && p.plan?.estimate?.flat ? p.plan.estimate.flat : 0);
    const commission = p.ad ? p.ad.commission : 0;
    const pool = cpm + cpa;
    p.earn = { cpm, cpa, commission, flat: flatT, total: cpm + cpa + commission + flatT, capped: !!(p.removedAt ? false : (b.flat_fee_cents > 0 ? false : (pool >= b.per_video_cap_cents || (p.plan?.cpa ?? []).some((x) => x.capped) || (p.plan?.cpm && p.plan.cpm.uncapped > b.per_video_cap_cents)))), capRemaining: b.flat_fee_cents > 0 ? 0 : Math.max(0, b.per_video_cap_cents - pool) };
  }
  // winners: top ~12% on trial rate per bounty plus every ad post
  const byB = new Map();
  for (const p of W.posts) { if (p.removedAt || p.role === 'clawback' || p.isLive || p.fn.views < 3000 || p.bounty.is_starter) continue; if (!byB.has(p.bounty)) byB.set(p.bounty, []); byB.get(p.bounty).push(p); }
  for (const [b, ps] of byB) {
    if (ps.length < 4) continue;
    const sorted = [...ps].sort((x, y) => (y.fn.trials * 3 + y.fn.paid * 8 + y.fn.installs) / y.fn.views - (x.fn.trials * 3 + x.fn.paid * 8 + x.fn.installs) / x.fn.views);
    const k = Math.max(1, Math.round(ps.length * 0.12));
    sorted.slice(0, k).forEach((p) => { p.isWinner = true; });
  }
  for (const p of W.posts) if (p.ad) p.isWinner = true;
  for (const p of W.posts) {
    if (!p.isWinner) continue;
    const an = p.s.vers[p.s.vers.length - 1].analysis.obs;
    const reasons = [];
    reasons.push(`Hook landed at ${(an.hook.lands_ms / 1000).toFixed(1)} s`);
    if (an.hook.app_ms != null && an.hook.app_ms <= 3000) reasons.push(`App on screen by 0:0${Math.min(3, Math.ceil(an.hook.app_ms / 1000))}`);
    reasons.push(`${p.s.hookType.replace(/_/g, ' ')} opening`);
    if (an.flow.single_cta && an.flow.ends_on_win_state) reasons.push('One call to action after the win');
    reasons.push(`Trial rate ${(100 * p.fn.trials / Math.max(1, p.fn.installs)).toFixed(1)}% of installs`);
    p.why = reasons.slice(0, 4);
  }
  // creators: badges, verification, payout readiness, payout method, flags
  const prizeWinner = new Set(W.prizes.filter((x) => x.place === 1).map((x) => x.creator));
  const heldCreators = new Set(W.heldCreators);
  let pmN = 100;
  for (const c of W.creators) {
    const badges = [];
    if (c.founding) badges.push('founding_creator');
    if (c.firstDollarMs) badges.push('first_dollar');
    if (c.streak >= 4) badges.push('streak_4');
    if (c.streak >= 8) badges.push('streak_8');
    if (c.streak >= 12) badges.push('streak_12');
    const hooks = c.subs.map((s) => s.hookPts);
    if (c.subs.length >= 6 && hooks.filter((x) => x >= 80).length >= 4) badges.push('hook_master');
    if (c.posts.reduce((a, p) => a + p.views, 0) >= 1_000_000) badges.push('million_views');
    if (c.posts.some((p) => p.fn.trials >= 1)) badges.push('first_trial');
    if (c.rep.components.find((x) => x.key === 'on_time').value >= 0.98 && c.rep.finished_n >= 8) badges.push('always_on_time');
    if (prizeWinner.has(c)) badges.push('tournament_winner');
    if (c.academy >= 10) badges.push('academy_graduate');
    // verification and payout readiness
    let verification = c.approvedP > 0 ? 'verified' : c.subs.length > 0 ? 'pending' : 'not_started';
    if (c.holdReason === 'identity_check') verification = c === [...heldCreators].find((x) => x.holdReason === 'identity_check') ? 'pending' : 'needs_info';
    if (c.flagged === 'suspect') { verification = 'rejected'; c.user.status = 'suspended'; }
    if (verification === 'verified') badges.push('id_verified');
    c.verification = verification;
    c.badges = [...new Set(badges)];
    const hasMethod = c.approvedP > 0 && c.holdReason !== 'payout_method_missing' && c.flagged !== 'suspect';
    if (hasMethod) c.payoutMethodRow = { id: `pm_${pmN++}`, kind: c.payoutMethod.kind, label: c.payoutMethod.label, last4: c.payoutMethod.last4, status: c.failedPayout ? 'failed' : 'active', instant_capable: c.payoutMethod.instantCapable, verified_at: iso(Math.min(NOW_EPOCH, (c.firstDollarMs ?? ms(c.joinedAt)) - 6 * HOUR_MS)) };
    c.payoutReady = hasMethod && verification === 'verified' && !['tax_info_missing', 'identity_check', 'payout_method_missing', 'admin_hold'].includes(c.holdReason) && !c.failedPayout;
    c.openToOffers = c.rateCardInfo ? true : c.tier !== 'bronze' ? false : c.idx % 3 !== 0;
  }
  // brands
  for (const b of W.brands) {
    const first = W.bounties.find((x) => x.brand === b && x.is_first_bounty);
    b.firstWaiverUsed = !!first;
    b.matchedUsed = first ? first.matchedC ?? 0 : 0;
    b.logoArt = b.kind === 'platform' ? { hue_a: 252, hue_b: 214, hue_c: 168, pattern: 'spark', seed: 1201, label: 'f' } : b.kind === 'agency' ? { hue_a: 222, hue_b: 262, hue_c: 38, pattern: 'rings', seed: 4402, label: 'N' } : b.app.icon;
  }
  // bounty updated_at
  for (const b of W.bounties) {
    let t = Math.max(ms(b.createdAt), b.fundedAtMs ?? 0);
    for (const s of b.subs) for (const e of s.history) if (e.t <= NOW_EPOCH) t = Math.max(t, e.t);
    for (const p of b.posts) t = Math.max(t, p.postedAtMs);
    for (const k of ['pausedAt', 'cancelledAt']) if (b[k]) t = Math.max(t, ms(b[k]));
    if (b.settledAtMs) t = Math.max(t, b.settledAtMs);
    b.updatedMs = Math.min(NOW_EPOCH, t);
  }
  // brand member activity
  const lastDecision = new Map();
  for (const s of W.subs) for (const d of s.derived.decisions) if (d.reviewer) lastDecision.set(d.reviewer, Math.max(lastDecision.get(d.reviewer) ?? 0, d.t));
  for (const m of W.members) m.lastActiveMs = m.status === 'invited' ? undefined : Math.min(NOW_EPOCH, Math.max(lastDecision.get(m) ?? 0, ms(m.joinedAt) + 3 * DAY_MS, m.role === 'owner' ? NOW_EPOCH - (m.brand.index ?? 2) * 5 * HOUR_MS : 0));
  for (const m of W.members) { m.user.lastSeenMs = m.lastActiveMs; }
  W.ops.lastSeenMs = NOW_EPOCH - 26 * 60_000; W.ops2.lastSeenMs = NOW_EPOCH - 3 * HOUR_MS;
  W.brandBy.get('lumi').members.find((m) => m.role === 'owner').lastActiveMs = NOW_EPOCH - 47 * 60_000;
  W.brandBy.get('lumi').members.find((m) => m.role === 'owner').user.lastSeenMs = NOW_EPOCH - 47 * 60_000;
}

// ── posts ─────────────────────────────────────────────────────────────────────────────────────
function retentionFor(r, craft, durS) {
  const k = clamp(1.25 - craft, 0.25, 1.1) * r.float(0.85, 1.15);
  const curve = [];
  let prev = 1;
  for (let i = 0; i < 10; i++) {
    const v = i === 0 ? 1 : clamp(Math.exp(-k * (i / 9) * 1.15) * r.float(0.97, 1.0), 0.04, prev - 0.005);
    curve.push(Math.round(Math.min(prev, v) * 1000) / 1000);
    prev = curve[curve.length - 1];
  }
  let biggest = 0; let at = 0;
  for (let i = 1; i < curve.length; i++) { const d = curve[i - 1] - curve[i]; if (d > biggest) { biggest = d; at = i; } }
  const avg = curve.reduce((a, x) => a + x, 0) / curve.length;
  return { curve, avg_watch_ratio: r4(avg * 0.78), biggest_drop_at_s: Math.round(((at / 9) * durS) * 10) / 10 };
}

export function rowsPosts(W) {
  const rng = W.rng.fork('post-rows');
  const posts = [];
  const snaps = [];
  const daily = [];
  const hourly = [];
  const NICHE_TAG = { ai_tools: '#aitools', tech: '#techtok', fitness: '#fitnesstok', wellness: '#wellness', productivity: '#productivity', study: '#studytok', money: '#moneytok', lifestyle: '#dayinmylife', beauty: '#glowup', travel: '#traveltok', food: '#foodtok', parenting: '#parenttok' };
  for (const p of W.postsSorted) {
    const r = rng.fork(`p-${p.s.key}`);
    const s = p.s;
    const b = p.bounty;
    const last = s.vers[s.vers.length - 1];
    const comp = composeAnalysis(W, s, last, r.fork('comp'));
    const disclosure = b.brief.disclosure_text;
    const tags = [...new Set([...b.brief.hashtags.filter((h) => h !== '#ad'), NICHE_TAG[p.creator.niches[0]] ?? '#appreview', '#ad'])];
    const code = s.link?.promo ?? s.link?.code ?? 'link';
    const tpl = r.pick(CAPTION_TEMPLATES);
    const caption = fill(tpl, { hook: s.hookText, disclosure, tags: tags.join(' '), code });
    const platId = p.platformId ?? (p.platform === 'tiktok' ? `7${r.int(100_000_000, 999_999_999)}${r.int(100_000_000, 999_999_999)}` : alnum(r, 11));
    const url = p.platform === 'tiktok' ? PLATFORM_URLS.tiktok(p.account.handle, platId) : p.platform === 'instagram' ? PLATFORM_URLS.instagram(p.account.handle, platId) : PLATFORM_URLS.youtube(p.account.handle, platId);
    const e = p.earn;
    // views excluded as invalid: what the View Ledger shows at window end (or the latest snapshot while the window is open)
    const settledSnap = p.snaps.find((x) => x.flags.includes('reconciled')) ?? p.snaps[p.snaps.length - 1];
    const clawViews = p.role === 'clawback' ? Math.round((p.plan?.cpm?.views ?? 0) * (p.invalidViewsFrac || 0)) : (settledSnap?.views_invalid ?? 0);
    const row = {
      id: p.id, submission_id: s.id, creator_id: p.creator.id, brand_id: p.brand.id, app_id: p.app.id, bounty_id: b.id, social_account_id: p.account.id, platform: p.platform, platform_post_id: platId, url, caption, hashtags: tags,
      thumb: ART(artSeed(r, { hue: undefined, pattern: r.pick(['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes']), label: s.hookText })), duration_ms: comp.durMs, posted_at: p.postedAt, window_ends_at: p.windowEndsAt, status: p.status,
      ...(p.holdReason ? { hold_reason: p.holdReason } : {}), ...(p.clearedAt ? { cleared_at: p.clearedAt } : {}), ...(p.paidAt ? { paid_at: p.paidAt } : {}), ...(p.removedAt ? { removed_at: p.removedAt } : {}), tracking_link_id: s.link.id, ...(s.link.promo ? { promo_code: s.link.promo } : {}),
      views: p.views, window_views: p.windowViews, views_invalid: clawViews, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves, retention: retentionFor(r, last.craft, comp.durMs / 1000),
      funnel: { views: p.fn.views, clicks: p.fn.clicks, installs: p.fn.installs, trials: p.fn.trials, paid: p.fn.paid, est_installs: p.fn.est_installs, est_trials: p.fn.est_trials, est_paid: p.fn.est_paid },
      earnings: { cpm_cents: e.cpm, cpa_cents: e.cpa, commission_cents: e.commission, flat_cents: e.flat, total_cents: e.total, capped: e.capped, cap_remaining_cents: e.capRemaining },
      fraud: { score: p.fraud.score, band: p.fraud.band, signals: p.fraud.signals.map((x) => ({ signal: x.signal, points: x.points, severity: x.severity, detail: fraudDetail(x.signal, p) })), assessed_at: p.fraud.assessed_at },
      flow_band: s.flowBand, ...(p.ad ? { ad_id: p.ad.id } : {}), is_winner: !!p.isWinner, ...(p.why ? { why_it_won: p.why } : {}), tags: comp.tags,
    };
    posts.push(row);
    p.snaps.forEach((sn, i) => snaps.push({ id: `vsn_${pad(p.num)}_${pad(i + 1, 3)}`, post_id: p.id, taken_at: sn.taken_at, views_reported: sn.views_reported, views_verified: sn.views_verified, views_invalid: sn.views_invalid, ...(sn.exclusions ? { exclusions: sn.exclusions } : {}), delta_verified: sn.delta_verified, source: sn.source, ...(sn.sources ? { sources: sn.sources } : {}), ...(sn.geo ? { geo: sn.geo } : {}), flags: sn.flags, fraud_score: sn.fraud_score, ...(sn.note ? { note: sn.note } : {}) }));
    for (const d of p.daily) daily.push({ ...d, post_id: p.id });
    if (p.hourlyRows) for (const h of p.hourlyRows) hourly.push({ ...h, post_id: p.id });
  }
  return { posts, view_snapshots: snaps, post_metrics_daily: daily, post_metrics_hourly: hourly };
}

// ── conversions / links / ads ───────────────────────────────────────────────────────────────────
export function rowsAttribution(W) {
  const conf = { link: 'deterministic', code: 'deterministic', mmp: 'matched', survey: 'self_reported', modelled: 'modelled' };
  const conversions = W.convs.map((c) => ({
    id: c.id, post_id: c.post.id, link_id: c.link.id, app_id: c.app.id, bounty_id: c.bounty.id, creator_id: c.creator.id, kind: c.kind, source: c.source, confidence: conf[c.source], quantity: c.qty, occurred_on: c.occurredOn, first_at: c.firstAt, revenue_cents: c.revenue,
    ...(c.country ? { country: c.country } : {}), status: c.status, payable: c.payable, capped: c.capped, ...(c.status === 'cleared' && c.clearedAt ? { cleared_at: c.clearedAt } : {}), ...(c.bt?.txn ? { ledger_txn_id: c.bt.txn.id } : {}), ...(c.rejectReason ? { reject_reason: c.rejectReason } : {}),
  }));
  const links = [...W.links].sort((a, b) => ms(a.createdAt) - ms(b.createdAt) || (a.id < b.id ? -1 : 1)).map((l) => ({
    id: l.id, creator_id: l.creator.id, bounty_id: l.bounty.id, app_id: l.app.id, ...(l.post ? { post_id: l.post.id } : {}), code: l.code, short_url: `joinflowd.io/r/${l.code}`, deep_link: `${l.app.slug === 'flowd' ? 'flowd' : l.app.slug}://r/${l.code}`, ...(l.promo ? { promo_code: l.promo } : {}),
    status: l.status, created_at: l.createdAt, clicks: l.clicks ?? 0, installs: l.installs ?? 0, trials: l.trials ?? 0, paid: l.paid ?? 0, ...(l.lastClickAt ? { last_click_at: l.lastClickAt } : {}),
  }));
  const ads = [...W.ads].sort((a, b) => (a.startedAt ?? a.requestedAt) - (b.startedAt ?? b.requestedAt)).map((a) => ({
    id: a.id, post_id: a.post.id, brand_id: a.brand.id, app_id: a.app.id, bounty_id: a.bounty.id, creator_id: a.creator.id, platform: a.platform, kind: a.kind, status: a.status, ...(a.externalId ? { external_ad_id: a.externalId } : {}), ...(a.sparkCode ? { spark_code: a.sparkCode } : {}),
    ...(a.codeDays ? { code_duration_days: a.codeDays } : {}), ...(a.codeExpires ? { code_expires_at: iso(a.codeExpires) } : {}), permission_requested_at: iso(a.requestedAt), ...(a.grantedAt ? { permission_granted_at: iso(a.grantedAt) } : {}),
    ...(a.startedAt ? { started_at: iso(a.startedAt) } : {}), ...(a.endedAt ? { ended_at: iso(a.endedAt) } : {}), daily_budget_cents: a.dailyBudget, spend_cents: a.spend, impressions: a.impressions, clicks: a.clicks, installs: a.installs, trials: a.trials, paid: a.paid, revenue_cents: a.revenue,
    commission_rate: C.pay.ad_commission_rate, ...(a.startedAt ? { commission_window_ends_at: iso(a.windowEnds) } : {}), commission_cents: a.commission, platform_fee_cents: a.fee, daily: a.daily,
    ...(a.fatigue ? { fatigue: { peak_trial_rate: a.fatigue.peak, current_trial_rate: a.fatigue.current, drop_ratio: a.fatigue.drop, flagged_at: a.fatigue.flaggedAt } } : {}), ...(a.rightsEnds ? { rights_ends_at: iso(a.rightsEnds) } : {}),
  }));
  return { conversions, attribution_links: links, ads };
}

// ── ledger, payouts, invoices, money clock ───────────────────────────────────────────────────────
export function rowsMoney(W) {
  const L = W.L;
  // transaction ids in time order
  const txns = [...L.txns].sort((a, b) => a.at - b.at || a.seq - b.seq);
  txns.forEach((t, i) => { t.id = `txn_${pad(i + 1, 6)}`; });
  // invoice -> txn legs
  for (const inv of W.invoices) { if (inv.txn) for (const l of inv.txn.legs) l.invoice = inv; if (inv.kind === 'funding' && inv.bounty?.fundTxn) for (const l of inv.bounty.fundTxn.legs) l.invoice = inv; }
  const legs = [];
  for (const t of txns) t.legs.forEach((l, j) => legs.push({ l, t, j }));
  legs.sort((a, b) => a.l.postedMs - b.l.postedMs || a.t.at - b.t.at || a.t.seq - b.t.seq || a.j - b.j);
  legs.forEach((x, i) => { x.l.id = `ledg_${pad(i + 1, 6)}`; });
  const payouts = [...W.payouts].sort((a, b) => a.requestedMs - b.requestedMs || a.scheduledMs - b.scheduledMs);
  const ledger = legs.map(({ l, t }) => {
    const isEarning = !!l.earning || l.acct.startsWith('creator:');
    const row = {
      id: l.id, txn_id: t.id, entry_type: l.type, account: l.acct, amount_cents: l.amt, status: l.status ?? 'cleared', posted_at: iso(l.postedMs),
      ...(isEarning && l.clearedMs && ['cleared', 'paid', 'held', 'reversed'].includes(l.status) && l.amt > 0 ? { cleared_at: iso(l.clearedMs) } : {}), ...(l.paidMs && l.status === 'paid' ? { paid_at: iso(l.paidMs) } : {}),
      ...(l.brand ? { brand_id: l.brand.id } : {}), ...(l.bounty ? { bounty_id: l.bounty.id } : {}), ...(l.post ? { post_id: l.post.id } : {}), ...(l.sub ? { submission_id: l.sub.id } : {}), ...(l.creator ? { creator_id: l.creator.id } : {}),
      ...(l.conv?.row ? { conversion_id: l.conv.row.id } : {}), ...(l.ad ? { ad_id: l.ad.id } : {}), ...(l.payout?.id ? { payout_id: l.payout.id } : {}), ...(l.invoice ? { invoice_id: l.invoice.id } : {}), ...(l.reverses ? { reverses_txn_id: l.reverses.id } : {}), memo: l.memo ?? '',
    };
    if (l.acct.startsWith('wallet:') || l.acct.startsWith('escrow:') || l.acct.startsWith('platform:') || l.acct.startsWith('external:')) { delete row.cleared_at; }
    return row;
  });
  // brand-level ids for legs without a brand: derive from account
  for (const row of ledger) { if (!row.brand_id && (row.account.startsWith('wallet:'))) row.brand_id = row.account.slice(7); }
  const payoutRows = payouts.map((p) => ({
    id: p.id, creator_id: p.creator.id, kind: p.kind, status: p.status, gross_cents: p.gross, fee_cents: p.fee, net_cents: p.net, ...(p.runId ? { run_id: p.runId } : {}), requested_at: iso(p.requestedMs), scheduled_for: iso(p.scheduledMs),
    ...(p.initiatedMs ? { initiated_at: iso(p.initiatedMs) } : {}), ...(p.paidMs && p.status === 'paid' ? { paid_at: iso(p.paidMs) } : {}), ...(p.failedReason ? { failed_reason: p.failedReason } : {}), ...(p.holdReason ? { hold_reason: p.holdReason } : {}), method_label: p.creator.payoutMethod.method_label,
    ...(p.transfer ? { stripe_transfer_id: p.transfer } : {}), ...(p.txn?.id ? { ledger_txn_id: p.txn.id } : {}), item_count: p.itemCount, tier_at_payout: p.tier, free_instant: !!p.freeInstant, proof_id: p.proof,
  }));
  const invoiceRows = W.invoices.map((i) => ({
    id: i.id, brand_id: i.brand.id, number: i.number, kind: i.kind, status: i.status, ...(i.bounty ? { bounty_id: i.bounty.id } : {}), line_items: i.lines.map((x) => ({ description: x.description, quantity: x.quantity, unit_cents: x.unit_cents, amount_cents: x.amount_cents, ...(x.bounty ? { bounty_id: x.bounty.id } : {}), ...(x.ad ? { ad_id: x.ad.id } : {}) })),
    subtotal_cents: i.subtotal, processing_cents: i.processing, tax_cents: i.tax, total_cents: i.subtotal + i.processing + i.tax, ...(i.po ? { po_number: i.po } : {}), ...(i.cost ? { cost_center: i.cost } : {}), ...(i.vat ? { vat_id: i.vat } : {}), reverse_charge: !!i.rc, issued_at: iso(i.issuedAt), due_at: iso(i.dueAt), ...(i.paidAt ? { paid_at: iso(i.paidAt) } : {}), ...(i.txn?.id ? { ledger_txn_id: i.txn.id } : {}), pdf_ref: `${i.number}.pdf`,
  }));
  const clock = W.clock.map((m) => {
    const b = m.bounty ?? W.bountyBy.get('flowd_about_us');
    const app = m.app ?? b.app;
    return {
      id: m.id, creator_id: m.creator.id, bounty_id: b.id, app_id: app.id, ...(m.post ? { post_id: m.post.id } : {}), ...(m.conv ? { conversion_id: m.conv.id } : {}), source: m.source, state: m.state, amount_cents: m.amount, estimated: m.estimated, earned_at: iso(Math.min(NOW_EPOCH, m.earnedAt)),
      ...(m.eta ? { eta_at: iso(m.eta) } : {}), reason: m.reason, reason_text: m.text, label: m.label, ...(m.leg?.id ? { ledger_id: m.leg.id } : {}), ...(m.payout?.id ? { payout_id: m.payout.id } : {}), ...(m.clearedMs ? { cleared_at: iso(m.clearedMs) } : {}), ...(m.paidMs ? { paid_at: iso(m.paidMs) } : {}),
    };
  });
  return { ledger, payouts: payoutRows, invoices: invoiceRows, money_clock: clock };
}

// ── market, ticker, scorecards, reputation ───────────────────────────────────────────────────────
export function rowsMarket(W) {
  const rows = W.market.map((m) => ({
    id: `mkt_${m.cat}_${m.date}`, category: m.cat, date: m.date, clearing_cpm_cents: m.clearing, p25_cpm_cents: m.p25, p75_cpm_cents: m.p75, open_bounties: m.open, open_budget_cents: m.openBudget, new_bounties: m.newB, submissions: m.subs,
    median_fill_hours: m.fill, median_views: m.views, trial_rate: m.trialRate, sample_n: m.sample,
  }));
  rows.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : a.date < b.date ? -1 : 1));
  const t = W.ticker;
  const ticker = {
    totals: { total_paid_cents: t.totals.total, paid_today_cents: t.totals.today, paid_7d_cents: t.totals.d7, creators_paid: t.totals.creatorsPaid, payouts_count: t.totals.payoutsCount, posts_cleared: t.totals.postsCleared, typical_creator_30d_cents: t.totals.typical, p25_creator_30d_cents: t.totals.p25, p75_creator_30d_cents: t.totals.p75, top_decile_creator_30d_cents: t.totals.p90, active_creators_30d: t.totals.active, updated_at: NOW },
    events: t.events.map((e) => ({ id: e.id, kind: e.kind, at: iso(e.at), text: e.text, ...(e.amount != null ? { amount_cents: e.amount } : {}), ...(e.creator ? { creator_id: e.creator.id } : {}), ...(e.handle ? { handle: e.handle } : {}), ...(e.tier ? { tier: e.tier } : {}), ...(e.bounty ? { bounty_id: e.bounty.id } : {}), ...(e.app ? { app_name: e.app } : {}), ...(e.proof ? { proof_id: e.proof } : {}) })),
  };
  return { market_series: rows, ticker };
}

export function rowsTrust(W) {
  const scorecards = W.scorecards.sort((a, b) => (a.brand.id < b.brand.id ? -1 : 1)).map((s) => ({
    id: `bsc_${s.brand.slug}`, brand_id: s.brand.id, window_days: 90, as_of: NOW, decisions_n: s.n, approved_n: s.approved, decision_hours_median: s.dm, decision_hours_p90: s.p90, sla_breaches: s.breaches, approval_rate: r4(s.approved / s.n), rejection_rate: r4(s.rejected / s.n), appeals_n: s.appeals, appeals_overturned: s.overturned,
    run_rate: s.runRate, pays_on_time_ratio: s.pays, pay_speed_hours_median: s.payHours, reply_hours_median: s.reply, funded_always: true, reliability_score: s.rel.score, band: s.rel.band, badges: s.badges, trend_30d: s.trend,
  }));
  const rep = [...W.creators].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => {
    const r = c.rep;
    const stats = { lifetime_cleared_cents: c.lifetime, approved_count: c.approvedAll, approval_rate: c.rate, reliability_score: r.score, elite_reviewed: c.tier === 'elite' };
    const prog = tierProgress(stats, c.tier);
    const comp = Object.fromEntries(r.components.map((x) => [x.key, x]));
    const finishedN = r.finished_n;
    return {
      id: `rep_${c.id.slice(3)}`, creator_id: c.id, as_of: NOW, provisional: r.provisional, reliability_score: r.score, approval_rate_finished: comp.finished_approval.value, approval_rate_raw: r.approval_rate_raw, on_time_ratio: comp.on_time.value, post_through_ratio: comp.post_through.value,
      compliance_ratio: comp.compliance.value, clean_record_ratio: comp.clean_record.value, finished_n: finishedN, fraud_flags_90d: c.repInput.fraud_confirmed_90d, clawbacks_90d: c.repInput.clawbacks_90d, disputes_lost_90d: 0, academy_bonus_points: r.academy_bonus_points,
      components: r.components.map((x) => ({ key: x.key, label: x.label, value: x.value, weight: x.weight, points: x.points, reason: x.reason })),
      reasons: r.provisional ? [`Building history: ${finishedN} finished video${finishedN === 1 ? '' : 's'} so far. Brands see a range until there are 5.`, ...r.components.slice(1, 3).map((x) => x.reason)] : r.components.slice(0, 5).map((x) => x.reason).concat(r.academy_bonus_points > 0 ? [`Academy bonus: +${r.academy_bonus_points} points for ${c.academy} lessons.`] : []),
      tier_progress: { current: prog.current, ...(prog.next ? { next: prog.next } : {}), criteria: prog.criteria.map((x) => ({ key: x.key, label: x.label, have: x.have, need: x.need, met: x.met })), progress: prog.progress },
    };
  });
  return { brand_scorecards: scorecards, creator_reputation: rep };
}
