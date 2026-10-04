// CORE stage 5: posts, view curves, daily/hourly metrics, View Ledger snapshots, funnel, conversions, attribution links, fraud assessments.

import { allocate, decayShares, fill, artSeed, hueOfHex, slugify, makeId } from './lib.mjs';
import { CATEGORIES, CAPTION_TEMPLATES, PLATFORM_URLS, NICHES } from './pools.mjs';
import { fraudScore, fraudBand, settlePost, mulRate } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, hexString, alnum, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, pickWeightedBy, runAtOrAfter, hoursOf } from './core-kit.mjs';
import { composeAnalysis } from './core-analysis.mjs';

const H = HOUR_MS;

// ── the view curve ──────────────────────────────────────────────────────────────────────────────
/** fraction of the ultimate views delivered by age h (hours). Two exponentials: a fast one (tau1) and a slow tail (tau2). */
export function cumulative(h, tau1 = 20, tau2 = 170, lam = 0.14) {
  if (h <= 0) return 0;
  return (1 - lam) * (1 - Math.exp(-h / tau1)) + lam * (1 - Math.exp(-h / tau2));
}
const diurnal = (hourUtc) => 0.72 + 0.5 * Math.sin(((hourUtc - 17) / 24) * 2 * Math.PI);

/** sample a Poisson count with a floor for large lambdas */
const pois = (r, lam) => (lam <= 0 ? 0 : r.poisson(lam));

function platformPostId(r, platform) {
  if (platform === 'tiktok') return `7${r.int(100_000_000, 999_999_999)}${r.int(100_000_000, 999_999_999)}`;
  return alnum(r, 11).replace(/[^a-z0-9]/g, 'x');
}

const CAT_INSTALL_MULT = { ai_photo: 1.25, ai_assistant: 0.95, fitness: 1.15, language: 0.9, productivity: 0.85, finance: 0.7, sleep_mind: 1.0, music_audio: 0.8, lifestyle: 0.9 };
const HOOK_FACTOR = { confession: 1.12, curiosity_gap: 1.06, specific_number: 1.04, pov: 1.0, direct_question: 0.97, risk_reversal: 0.98, pattern_interrupt: 0.95 };

/** Build all posts for submissions with status posted. */
export function buildPosts(W) {
  const rng = W.rng.fork('posts');
  const posts = [];
  for (const s of W.subs) {
    if (s.derived.status !== 'posted') continue;
    const r = rng.fork(`p-${s.key}`);
    const c = s.creator;
    const b = s.bounty;
    const plats = b.deliverables.platforms;
    const accts = c.accounts.filter((a) => plats.includes(a.platform) && a.status !== 'revoked');
    const acct = accts.length ? (c.persona ? (r.chance(0.78) ? accts[0] : accts[accts.length - 1]) : (r.chance(0.82) ? accts.find((a) => a.primary) ?? accts[0] : r.pick(accts))) : c.accounts[0];
    const postedAt = iso(s.derived.postedAt);
    const post = {
      s, sub: s, creator: c, bounty: b, brand: s.brand, app: s.app, account: acct, platform: acct.platform, postedAtMs: s.derived.postedAt, postedAt, windowEndsAt: addHours(postedAt, 72),
      r, special: {},
    };
    s.post = post;
    b.posts.push(post);
    c.posts.push(post);
    posts.push(post);
  }
  posts.sort((a, b) => a.postedAtMs - b.postedAtMs);
  W.posts = posts;
  return posts;
}

// ── removed / flagged roles ─────────────────────────────────────────────────────────────────────
/** pick posts for the scripted stories: removed, held, clawed back, flagged, winners. Called after buildPosts. */
export function assignPostRoles(W) {
  const r = W.rng.fork('roles');
  const posts = W.posts;
  const nowMs = NOW_EPOCH;
  const age = (p) => (nowMs - p.postedAtMs) / H;
  const notMaya = (p) => !p.creator.persona;
  const free = (p) => !p.role;
  const take = (pred, n, role, tweak) => {
    const pool = posts.filter((p) => free(p) && notMaya(p) && pred(p));
    const picked = r.sample(pool, n);
    for (const p of picked) { p.role = role; tweak?.(p); }
    return picked;
  };
  // Maya's removed post (the glowkit one)
  const mayaRemoved = W.maya.subs.find((s) => s.removedAt && s.post);
  if (mayaRemoved) { mayaRemoved.post.role = 'removed'; mayaRemoved.post.removedAt = iso(mayaRemoved.removedAt); }
  // other removed: five, spread over 30..80 days old (creator deleted, or taken down by the platform)
  take((p) => age(p) > 24 * 20 && age(p) < 24 * 80, 5, 'removed', (p) => { p.removedAt = iso(p.postedAtMs + r.float(20, 60) * H); });
  // clawed back: three by the suspect creator (new account, bought views), two refunds/duplicates by others
  const suspect = W.creators.find((c) => c.flagged === 'suspect') ?? r.pick(W.creators.filter((c) => c.tierTarget === 'bronze' && !c.persona));
  suspect.flagged = 'suspect';
  // the suspect's accounts are brand new: created a few days before they joined
  for (const a of suspect.accounts) a.createdAt = iso(ms(suspect.joinedAt) - r.int(3, 9) * DAY_MS);
  const sp = posts.filter((p) => p.creator === suspect && p.role == null && age(p) > 24 * 14);
  const clawPool = sp.length >= 3 ? sp.slice(0, 3) : sp;
  for (const p of clawPool) { p.role = 'clawback'; p.special.fraud = { target: r.int(72, 88), kind: 'bought' }; }
  take((p) => age(p) > 24 * 18 && age(p) < 24 * 60 && p.creator !== suspect, 5 - clawPool.length, 'clawback', (p) => { p.special.fraud = { target: r.int(60, 76), kind: 'bought' }; });
  // held: window closed within the last ~2 days (fraud review x3, compliance x1)
  const heldWindow = (p) => ms(p.windowEndsAt) <= nowMs && ms(p.windowEndsAt) > nowMs - 52 * H && p.platform;
  const heldFraud = take(heldWindow, 3, 'held_fraud', null);
  const targets = [78, 71, 62];
  heldFraud.forEach((p, i) => { p.special.fraud = { target: targets[i], kind: 'bought' }; });
  take(heldWindow, 1, 'held_compliance', null);
  // open flags on live / window_closed posts (cap-clustering creator, duplicate, spike) and two monitoring flags
  const liveish = (p) => ms(p.windowEndsAt) > nowMs - 2 * H;
  const capCreator = W.creators.filter((c) => c.tierTarget === 'elite').sort((a, b) => b.posts.length - a.posts.length)[0];
  const capPosts = posts.filter((p) => p.creator === capCreator && liveish(p) && free(p));
  if (capPosts.length) { capPosts[capPosts.length - 1].role = 'open_cap'; capPosts[capPosts.length - 1].special.fraud = { target: 44, kind: 'cap' }; }
  else take((p) => liveish(p), 1, 'open_cap', (p) => { p.special.fraud = { target: 44, kind: 'cap' }; });
  // the cap-clustering story is true: the creator's previous four CPM posts all landed within 2% of the per-video cap
  const capRole = posts.find((p) => p.role === 'open_cap');
  if (capRole) {
    const prior = capRole.creator.posts.filter((x) => x !== capRole && x.postedAtMs < capRole.postedAtMs && x.bounty.cpm_cents > 0 && !x.bounty.flat_fee_cents && !x.role).sort((a, b) => a.postedAtMs - b.postedAtMs).slice(-4);
    for (const x of prior) x.perf = { U: Math.ceil((x.bounty.per_video_cap_cents * 1000) / (x.bounty.cpm_cents * cumulative(72, 22)) * r.float(1.004, 1.02)), tau1: 22, viral: 1 };
  }
  take(liveish, 1, 'open_dup', (p) => { p.special.fraud = { target: 47, kind: 'duplicate' }; });
  take(liveish, 1, 'open_spike', (p) => { p.special.fraud = { target: 52, kind: 'spike' }; });
  take(liveish, 2, 'monitor', (p) => { p.special.fraud = { target: r.int(28, 38), kind: 'watch' }; });
  // cleared false positives
  take((p) => age(p) > 24 * 5 && age(p) < 24 * 25, 2, 'false_positive', (p) => { p.special.fraud = { target: r.int(41, 49), kind: 'spike' }; });
  // watch-band posts (20..39) so about 8% of posts are not clean
  take((p) => age(p) > 24 * 3, 20, 'watch', (p) => { p.special.fraud = { target: r.int(20, 34), kind: 'watch' }; });
}

// ── fraud assessment ────────────────────────────────────────────────────────────────────────────
const SIG_SETS = {
  bought: ['bought_views_pattern', 'view_spike_no_engagement', 'traffic_source_anomaly', 'curve_shape', 'engagement_anomaly', 'new_account'],
  spike: ['view_spike_no_engagement', 'traffic_source_anomaly', 'engagement_anomaly', 'curve_shape', 'geo_mismatch'],
  duplicate: ['duplicate_hash', 'engagement_anomaly', 'traffic_source_anomaly', 'curve_shape'],
  cap: ['cap_clustering', 'view_spike_no_engagement', 'engagement_anomaly'],
  watch: ['engagement_anomaly', 'traffic_source_anomaly', 'geo_mismatch'],
  noise: ['engagement_anomaly'],
};
const pc = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const money0 = (c) => `$${Math.floor(c / 100).toLocaleString('en-US')}`;
/**
 * Plain-language evidence for a fraud signal, written from the numbers the post actually has (so the Fraud evidence panel never contradicts the
 * metrics beside it). Called once the post's engagement, snapshots and earnings are final.
 */
export function fraudDetail(signal, p) {
  const views = Math.max(1, p.views);
  const likeRate = p.likes / views;
  const commentRate = p.comments / views;
  const snaps = p.snaps ?? [];
  const snap = [...snaps].reverse().find((s) => s.sources);
  const other = snap?.sources?.other;
  const firstInvalid = snaps.find((s) => s.views_invalid > 0);
  const hoursOf = (s) => Math.round((ms(s.taken_at) - p.postedAtMs) / H);
  const last = snaps[snaps.length - 1];
  switch (signal) {
    case 'engagement_anomaly': return likeRate < 0.004
      ? `Likes are ${pc(likeRate, 2)} of views, under the 0.4% floor and far below this account's usual ${pc(p.account.engagement)}.`
      : `Comments are ${pc(commentRate, 2)} of views, under this account's usual 0.32% range.`;
    case 'view_spike_no_engagement': return firstInvalid
      ? `${firstInvalid.views_invalid.toLocaleString('en-US')} views in the first ${hoursOf(firstInvalid)} hours were excluded as non-organic while likes stayed at ${pc(likeRate, 2)} of views.`
      : `Reported views spiked early while likes stayed at ${pc(likeRate, 2)} of views.`;
    case 'cap_clustering': {
      const cap = p.bounty.per_video_cap_cents;
      const mine = p.creator.posts.filter((x) => x.postedAtMs <= p.postedAtMs && x.earn && x.bounty.cpm_cents > 0).slice(-5);
      const near = mine.filter((x) => x.earn.cpm + x.earn.cpa >= 0.98 * x.bounty.per_video_cap_cents).length;
      return `${near} of this creator's last ${mine.length} CPM posts landed within 2% of their per-video cap (this one: ${money0(p.earn.cpm + p.earn.cpa)} of ${money0(cap)}).`;
    }
    case 'bought_views_pattern': return last && last.views_invalid > 0
      ? `${pc(last.views_invalid / Math.max(1, last.views_reported), 0)} of reported views were excluded as a bot pattern${other != null ? `, and ${pc(other, 0)} of views came from the "other" source` : ''}.`
      : 'Reported views followed a step pattern with most traffic from the "other" source.';
    case 'geo_mismatch': {
      const target = p.bounty.eligibility.countries;
      const share = snap?.geo ? Object.entries(snap.geo).filter(([k]) => target.includes(k)).reduce((a, [, v]) => a + v, 0) : null;
      return share != null ? `Only ${pc(share, 0)} of views came from the bounty's target countries (${target.join(', ')}).` : `Early views come mostly from outside the bounty's target countries (${target.join(', ')}).`;
    }
    case 'new_account': return `The ${p.platform} account was created ${Math.max(1, Math.round((p.postedAtMs - ms(p.account.createdAt)) / DAY_MS))} days before this post.`;
    case 'duplicate_hash': return p.s.dupOf ? `Perceptual hash is within distance ${p.s.dupOf.dist} of video ${p.s.dupOf.sub.id}, uploaded by another creator.` : "Perceptual hash is within distance 4 of another creator's video.";
    case 'traffic_source_anomaly': return other != null ? `${pc(other, 0)} of views came from external or "other" sources (typical posts: under 15%).` : 'Early traffic is dominated by external or "other" sources.';
    case 'curve_shape': {
      const steps = snaps.filter((s, i) => i > 0 && s.views_invalid > snaps[i - 1].views_invalid).slice(0, 2).map(hoursOf);
      return steps.length ? `Reported views rose in steps at hour${steps.length > 1 ? 's' : ''} ${steps.join(' and ')} instead of a smooth decay.` : 'Reported views rose in steps instead of a smooth decay.';
    }
    default: return 'Flagged by the fraud model.';
  }
}
/** compose signals that sum EXACTLY to the target score (details are filled in later by fraudDetail) */
function composeFraud(r, p, target, kind) {
  const allowed = (SIG_SETS[kind] ?? SIG_SETS.watch).filter((n) => n !== 'new_account' || (p.creator.flagged === 'suspect' && p.postedAtMs - ms(p.account.createdAt) < 30 * DAY_MS)).filter((n) => n !== 'geo_mismatch' || ['BR', 'MX', 'PH', 'FR', 'ES', 'NL', 'DE'].filter((x) => !p.bounty.eligibility.countries.includes(x)).length >= 3);
  const names = allowed.length ? allowed : SIG_SETS.watch;
  const picks = names.slice(0, Math.max(2, Math.min(names.length, 2 + Math.floor(target / 22))));
  const sigs = [];
  let left = target;
  const maxOf = (n) => C.fraud.signals[n].max_points;
  for (let i = 0; i < picks.length && left > 0; i++) {
    const n = picks[i];
    const max = maxOf(n);
    const want = i === picks.length - 1 ? left : Math.min(max, Math.max(1, Math.round(left * r.float(0.35, 0.7))));
    const pts = Math.min(want, max, left);
    if (pts <= 0) continue;
    // severity with two decimals such that round(max x severity) === pts
    let sev = Math.min(1, Math.round(((pts - 0.0) / max) * 100) / 100);
    let guard = 0;
    while (Math.round(max * sev) !== pts && guard++ < 30) sev = Math.min(1, Math.round((sev + (Math.round(max * sev) < pts ? 0.01 : -0.01)) * 100) / 100);
    if (Math.round(max * sev) !== pts) continue;
    sigs.push({ signal: n, severity: sev, points: pts, detail: '' });
    left -= pts;
  }
  // top up with any unused signal of the same family until exact
  for (const n of names) {
    if (left <= 0) break;
    if (sigs.some((x) => x.signal === n)) continue;
    const max = maxOf(n);
    const pts = Math.min(left, max);
    let sev = Math.round((pts / max) * 100) / 100;
    let guard = 0;
    while (Math.round(max * sev) !== pts && guard++ < 30) sev = Math.min(1, Math.round((sev + 0.01) * 100) / 100);
    if (Math.round(max * sev) !== pts) continue;
    sigs.push({ signal: n, severity: sev, points: pts, detail: '' });
    left -= pts;
  }
  const score = Math.min(100, sigs.reduce((a, x) => a + x.points, 0));
  return { score, band: fraudBand(score), signals: sigs };
}

// ── metrics for one post ────────────────────────────────────────────────────────────────────────
/** Draw the post's ultimate views and parameters. `override` lets scripted posts fix views. */
function drawPerformance(W, p, r) {
  const c = p.creator;
  const s = p.s;
  const acct = p.account;
  const catF = Math.pow(p.bounty.catDef.median_views / 14900, 0.55);
  const bandM = Math.pow(C.scores.band_view_multiplier[s.flowBand], 0.8);
  const hookF = HOOK_FACTOR[s.hookType] ?? 1;
  let noise = r.logNormal(1, 0.6);
  let viral = 1;
  if (r.chance(0.035)) viral = r.float(3.2, 5.5);
  else if (r.chance(0.07)) viral = r.float(0.18, 0.4);
  const base = acct.medianViews;
  let U = base * catF * bandM * hookF * noise * viral * W.viewScale;
  if (p.bounty.is_starter) U *= 0.55;
  if (p.creator.persona && p.target) U = p.target.views ?? U;
  return { U: Math.max(80, Math.round(U)), tau1: viral > 2.5 ? r.float(26, 44) : r.float(17, 25), viral };
}

/** Funnel counts for a post from its verified views (tracked = link + code; est = mmp, survey, modelled). */
export function drawCounts(W, p, r, viewsOverride) {
  const views = viewsOverride ?? p.views;
  const s = p.s;
  const rate = 1.7 * (CAT_INSTALL_MULT[p.bounty.category] ?? 1) * r.logNormal(1, 0.34) * (HOOK_FACTOR[s.hookType] ?? 1) * W.convScale;
  const visits = Math.max(0, pois(r, views * 0.0045 * r.logNormal(1, 0.28) * (rate / 1.7)));
  let installsT = Math.min(visits, pois(r, (views / 1000) * rate));
  if (p.fraud && p.fraud.score >= 70) installsT = Math.round(installsT * 0.15);
  const clicks = Math.max(visits, installsT);
  const cat = CATEGORIES.find((x) => x.key === p.bounty.category);
  const trialRate = cat.install_to_trial * r.logNormal(1, 0.22);
  const payRate = cat.trial_to_paid * r.logNormal(1, 0.2);
  const trialsT = Math.min(installsT, pois(r, installsT * trialRate));
  const paidT = Math.min(trialsT, pois(r, trialsT * payRate));
  const estInstalls = pois(r, installsT * r.float(0.2, 0.5));
  const estTrials = Math.min(estInstalls, pois(r, estInstalls * trialRate * 1.1));
  const estPaid = Math.min(estTrials, pois(r, estTrials * payRate));
  return { clicks, installsT, trialsT, paidT, estInstalls, estTrials, estPaid };
}

/** Compute views by age, daily and hourly, snapshots, funnel and conversions. */
export function buildPostMetrics(W) {
  const out = { daily: [], hourly: [], snapshots: [], conversions: [] };
  for (const p of W.posts) {
    const r = p.r.fork('metrics');
    genOne(W, p, r, out);
  }
  W.metrics = out;
  return out;
}

function genOne(W, p, r, out) {
  const c = p.creator;
  const s = p.s;
  const perf = p.perf ?? drawPerformance(W, p, r);
  p.perf = perf;
  const U = perf.U;
  const tau1 = perf.tau1;
  const posted = p.postedAtMs;
  const endMs = p.removedAt ? Math.min(NOW_EPOCH, ms(p.removedAt)) : NOW_EPOCH;
  const ageH = (endMs - posted) / H;
  const cum = (h) => cumulative(h, tau1);
  // fraud plan: scripted roles set a target; everyone else gets a small natural score
  let fr = p.special.fraud;
  const v72 = Math.round(U * cum(72));
  p.views = Math.round(U * cum(ageH));
  p.windowViews = ageH >= 72 ? v72 : p.views;
  const open = ageH < 72 && !p.removedAt;
  p.isLive = open;
  // ── fraud
  if (fr) p.fraud = composeFraud(r, p, fr.target, fr.kind);
  else {
    const n = r.chance(0.04) ? 1 : 0;
    p.fraud = n ? composeFraud(r, p, r.int(6, 9), 'noise') : { score: 0, band: 'clean', signals: [] };
    if (p.fraud.score === 0 && r.chance(0.6)) p.fraud = composeFraud(r, p, r.int(1, 9), 'noise');
  }
  p.fraud.assessed_at = open ? iso(Math.min(NOW_EPOCH, Math.max(posted + 3 * H, endMs - r.int(1, 5) * H))) : iso(Math.min(NOW_EPOCH, ms(p.windowEndsAt) + r.int(1, 9) * H));
  p.fraudKind = fr?.kind;
  // fraudulent posts: invalid views appear on top of the verified curve (reported > verified)
  if (p.fraud.score >= 40) {
    const shareInvalid = p.fraud.score >= 70 ? r.float(0.42, 0.62) : r.float(0.12, 0.3);
    p.invalidViewsFrac = shareInvalid;
  } else p.invalidViewsFrac = 0;

  // ── engagement
  // the engagement numbers follow the fraud signals (a bought-views post has under 0.4% likes, a mild comment signal means fewer comments)
  const sigOf = (n) => p.fraud.signals.find((x) => x.signal === n);
  const lowLikes = !!sigOf('view_spike_no_engagement') || (sigOf('engagement_anomaly')?.severity ?? 0) >= 0.5;
  let eLikes = clamp(r.normal(0.052, 0.013), 0.02, 0.09) * (p.fraud.score >= 40 ? 0.6 : 1);
  let eComments = clamp(r.normal(0.0032, 0.0012), 0.0004, 0.009) * (p.fraud.score >= 40 ? 0.5 : 1);
  if (lowLikes) { eLikes = r.float(0.0021, 0.0039); eComments = r.float(0.0002, 0.0006); } else if (sigOf('engagement_anomaly')) eComments = r.float(0.0012, 0.0022);
  p.likes = Math.round(p.views * eLikes);
  p.comments = Math.round(p.views * eComments);
  p.shares = Math.round(p.views * clamp(r.normal(0.0075, 0.003), 0.001, 0.02));
  p.saves = Math.round(p.views * clamp(r.normal(0.0095, 0.0035), 0.001, 0.025));

  // ── funnel (tracked = link + code; est = mmp, survey, modelled)
  const hasPromo = !!p.promo;
  const cnt = p.fixedCounts ?? drawCounts(W, p, r.fork('counts'));
  const { clicks, installsT, trialsT, paidT, estInstalls, estTrials, estPaid } = cnt;
  p.funnelRaw = cnt;

  // ── day grid
  const startDay = dateOf(p.postedAt);
  const endDay = dateOf(iso(endMs));
  const days = [];
  for (let t = ms(`${startDay}T00:00:00Z`); t <= ms(`${endDay}T00:00:00Z`); t += DAY_MS) days.push(iso(t).slice(0, 10));
  const hourly = posted >= ms('2026-09-30T00:00:00Z');
  p.hasHourly = hourly;
  // views per day from the cumulative curve; hourly posts get hourly weights first
  const dayViews = [];
  const dayEdges = days.map((d) => ms(`${d}T00:00:00Z`));
  const dayWeights = days.map((d, i) => {
    const a = Math.max(posted, dayEdges[i]);
    const b = Math.min(endMs, dayEdges[i] + DAY_MS);
    return Math.max(0, cum((b - posted) / H) - cum((a - posted) / H));
  });
  const jitter = (w) => w * r.float(0.88, 1.12);
  if (hourly) {
    const startHour = Math.floor(posted / H) * H;
    const nH = Math.ceil((endMs - startHour) / H);
    const wts = [];
    for (let k = 0; k < nH; k++) {
      const a = Math.max(posted, startHour + k * H);
      const b = Math.min(endMs, startHour + (k + 1) * H);
      const mass = Math.max(0, cum((b - posted) / H) - cum((a - posted) / H));
      const hourUtc = new Date(startHour + k * H).getUTCHours();
      wts.push(mass * diurnal(hourUtc) * r.float(0.85, 1.15));
    }
    let hv = allocate(p.views, wts);
    let hl = allocate(p.likes, hv.map((x) => x + 0.0001));
    let hc = allocate(p.comments, hv.map((x) => x + 0.0001));
    let hs = allocate(p.shares, hv.map((x) => x + 0.0001));
    p.hourlyRows = [];
    const finalScore = p.fraud.score;
    for (let k = 0; k < nH; k++) {
      const ts = iso(startHour + k * H);
      const ramp = finalScore === 0 ? 0 : Math.round(finalScore * clamp((k + 1) / Math.max(6, nH * 0.5), 0.15, 1));
      p.hourlyRows.push({ post_id: null, ts, views: hv[k], likes: hl[k], comments: hc[k], shares: hs[k], fraud_score: Math.min(finalScore, ramp) });
    }
    // daily from hourly
    const byDay = new Map();
    for (const row of p.hourlyRows) {
      const d = row.ts.slice(0, 10);
      const e = byDay.get(d) ?? { views: 0, likes: 0, comments: 0, shares: 0 };
      e.views += row.views; e.likes += row.likes; e.comments += row.comments; e.shares += row.shares;
      byDay.set(d, e);
    }
    p.dayBase = days.map((d) => ({ date: d, ...(byDay.get(d) ?? { views: 0, likes: 0, comments: 0, shares: 0 }) }));
  } else {
    const wv = dayWeights.map(jitter);
    const v = allocate(p.views, wv);
    const l = allocate(p.likes, v.map((x) => x + 0.0001));
    const cm = allocate(p.comments, v.map((x) => x + 0.0001));
    const sh = allocate(p.shares, v.map((x) => x + 0.0001));
    p.dayBase = days.map((d, i) => ({ date: d, views: v[i], likes: l[i], comments: cm[i], shares: sh[i] }));
  }
  const dv = p.dayBase.map((x) => x.views + 0.0001);
  const dSaves = allocate(p.saves, dv);
  const dClicks = allocate(clicks, dv);

  // ── conversions: batches (post, kind, source, day), at most 3 days per (kind, source)
  const convDays = days.slice(0, Math.min(days.length, 6));
  const convW = convDays.map((_, i) => dayWeights[i] + 0.0001);
  const mkBatches = (kind, source, q) => {
    if (q <= 0) return [];
    // tracked conversions arrive over a few days; estimated ones (mmp, survey, modelled) are reported as one weekly batch
    const k = source === 'link' || source === 'code' ? (q < 5 ? 1 : q < 16 ? 2 : 3) : 1;
    const idxs = [];
    const order = convW.map((w, i) => [w * r.float(0.6, 1.4), i]).sort((a, b) => b[0] - a[0]).slice(0, Math.min(k, convDays.length)).map((x) => x[1]).sort((a, b) => a - b);
    for (const i of order) idxs.push(i);
    const parts = allocate(q, idxs.map((i) => convW[i]));
    return idxs.map((i, j) => ({ kind, source, day: convDays[i], qty: parts[j] })).filter((x) => x.qty > 0);
  };
  const split = (total, share) => { const a = Math.round(total * share); return [total - a, a]; };
  const codeShareI = hasPromo ? 0.3 : 0;
  const codeShareT = hasPromo ? 0.36 : 0;
  const [iLink, iCode] = split(installsT, codeShareI);
  const [tLink, tCode] = split(trialsT, codeShareT);
  const [pLink, pCode] = split(paidT, codeShareT);
  const [eiMmp, eiRest] = split(estInstalls, 0.45);
  const [eiSurvey, eiModel] = split(eiRest, 0.4);
  const [etMmp, etRest] = split(estTrials, 0.5);
  const [etSurvey, etModel] = split(etRest, 0.5);
  const [epMmp, epRest] = split(estPaid, 0.55);
  const [epSurvey, epModel] = split(epRest, 0.6);
  let batches = [
    ...mkBatches('install', 'link', iLink), ...mkBatches('install', 'code', iCode), ...mkBatches('trial', 'link', tLink), ...mkBatches('trial', 'code', tCode), ...mkBatches('paid', 'link', pLink), ...mkBatches('paid', 'code', pCode),
    ...mkBatches('install', 'mmp', eiMmp), ...mkBatches('install', 'survey', eiSurvey), ...mkBatches('install', 'modelled', eiModel),
    ...mkBatches('trial', 'mmp', etMmp), ...mkBatches('trial', 'survey', etSurvey), ...mkBatches('trial', 'modelled', etModel),
    ...mkBatches('paid', 'mmp', epMmp), ...mkBatches('paid', 'survey', epSurvey), ...mkBatches('paid', 'modelled', epModel),
  ];
  // never in the future: a batch's first event is after the post and before now
  const convs = [];
  for (const bt of batches) {
    const dayStart = ms(`${bt.day}T00:00:00Z`);
    const lo = Math.max(posted + 20 * 60_000, dayStart);
    const hi = Math.min(endMs - 5 * 60_000, dayStart + DAY_MS - 60_000);
    if (hi <= lo) { continue; }
    const kindDelay = bt.kind === 'install' ? 0 : bt.kind === 'trial' ? r.float(0, 6) * H : r.float(2, 30) * H;
    const firstAt = Math.min(hi, lo + r.float(0.02, 0.9) * (hi - lo));
    convs.push({ ...bt, firstAtMs: firstAt, kindDelay });
  }
  p.convBatches = convs;
  // rebuild counts from batches actually kept (a tiny post-hoc loss if a day had no room)
  const tally = { installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 };
  const dayConv = new Map(days.map((d) => [d, { installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 }]));
  for (const bt of convs) {
    const det = bt.source === 'link' || bt.source === 'code';
    if (p.removedAt && det) continue; // a removed post keeps no tracked conversions in its funnel
    const key = `${det ? '' : 'est_'}${bt.kind === 'install' ? 'installs' : bt.kind === 'trial' ? 'trials' : 'paid'}`;
    tally[key] += bt.qty;
    dayConv.get(bt.day)[key] += bt.qty;
  }
  // enforce monotonic tracked funnel: clicks >= installs >= trials >= paid by trimming from the tail
  let adjClicks = Math.max(clicks, tally.installs);
  p.fn = { views: p.views, clicks: adjClicks, ...tally };
  // clicks may need to be re-allocated if raised
  const dClicks2 = adjClicks === clicks ? dClicks : allocate(adjClicks, dv);
  p.daily = p.dayBase.map((d, i) => ({ post_id: null, date: d.date, views: d.views, likes: d.likes, comments: d.comments, shares: d.shares, saves: dSaves[i], clicks: dClicks2[i], ...dayConv.get(d.date) }));
  // ── snapshots (View Ledger)
  p.snaps = buildSnapshots(W, p, r, ageH, cum, U);
}

function buildSnapshots(W, p, r, ageH, cum, U) {
  const out = [];
  const posted = p.postedAtMs;
  const times = [];
  for (let k = 0; k <= 12; k++) { const h = k * 6; if (h <= ageH) times.push(h); }
  if (ageH > 72) for (let h = 72 + 168; h <= ageH; h += 168) times.push(h);
  let prev = 0;
  const flagged = p.fraud.score >= 40;
  // invalid views arrive in two steps (about hour 6 and hour 12), the signature of bought traffic
  const invalidTotalAt = (h) => (flagged ? Math.round(U * cum(h) * p.invalidViewsFrac * (h < 5 ? 0 : h < 11 ? 0.45 : 1)) : 0);
  const hasSig = (n) => p.fraud.signals.some((x) => x.signal === n);
  const exCauses = p.fraudKind === 'duplicate' ? ['duplicate'] : p.fraud.score >= 70 ? ['bot_pattern'] : ['bot_pattern', 'geo_outlier'];
  const country = p.creator.countryCode;
  times.forEach((h, idx) => {
    const t = posted + h * H;
    if (t > NOW_EPOCH) return;
    let verified = Math.round(U * cum(h));
    // the last snapshot of a post cannot exceed its lifetime views; the window-end snapshot equals the window views
    if (h === 72) verified = p.windowViews;
    verified = Math.min(verified, p.views);
    verified = Math.max(verified, prev);
    const inv = invalidTotalAt(h);
    const reported = verified + inv;
    const flags = [];
    if (flagged && inv > 0) flags.push('bot_pattern');
    if (h >= 24 && flagged && inv > verified * 0.2) flags.push('spike');
    if (h >= 240 && !flagged && r.chance(0.35)) flags.push('plateau');
    if (h === 72) flags.push('reconciled');
    const row = {
      post_id: null, taken_at: iso(t), views_reported: reported, views_verified: verified, views_invalid: inv, delta_verified: verified - prev, source: r.chance(0.05) ? 'creator_screenshot' : 'platform_api', flags,
      fraud_score: flagged ? Math.min(p.fraud.score, Math.round(p.fraud.score * clamp((h + 3) / 40, 0.2, 1))) : Math.min(p.fraud.score, h >= 24 ? p.fraud.score : 0),
    };
    if (inv > 0) {
      const parts = exCauses.length === 2 ? allocate(inv, [0.7, 0.3]) : [inv];
      row.exclusions = exCauses.map((cause, i) => ({ cause, views: parts[i], detail: cause === 'bot_pattern' ? `${Math.round((parts[i] / Math.max(1, reported)) * 100)}% of reported views arrived in two hourly buckets from an unknown external source.` : cause === 'duplicate' ? 'Views on a re-uploaded copy of the video were removed.' : 'Views from outside the bounty target regions beyond the audience baseline.' })).filter((x) => x.views > 0);
      // exclusions must add to views_invalid exactly
      const sum = row.exclusions.reduce((a, x) => a + x.views, 0);
      if (sum !== inv) row.exclusions[0].views += inv - sum;
    }
    if (h >= 24 && (h === 72 || idx % 2 === 0 || h >= 240)) {
      const us = p.account.usRatio;
      const sources = { fyp: 0, following: 0, profile: 0, search: 0, sound: 0, share: 0, other: 0 };
      const fyp = clamp(0.64 + r.normal(0, 0.06) - (flagged || hasSig('traffic_source_anomaly') ? 0.3 : 0), 0.1, 0.85);
      const foll = clamp(0.1 + r.normal(0, 0.03), 0.03, 0.2);
      const prof = clamp(0.05 + r.normal(0, 0.015), 0.01, 0.1);
      const srch = clamp(0.06 + r.normal(0, 0.02), 0.01, 0.12);
      const snd = clamp(0.04 + r.normal(0, 0.015), 0.005, 0.09);
      const shr = clamp(0.04 + r.normal(0, 0.012), 0.005, 0.08);
      const oth = flagged || hasSig('traffic_source_anomaly') ? clamp(0.6 + r.normal(0, 0.05), 0.54, 0.78) : clamp(1 - (fyp + foll + prof + srch + snd + shr), 0.01, 0.2);
      let arr = [fyp, foll, prof, srch, snd, shr, oth];
      // when the "other" share is the evidence it keeps exactly its stated size, the rest scales into what is left
      if (flagged || hasSig('traffic_source_anomaly')) { const rest = arr.slice(0, 6); const rs = rest.reduce((a, x) => a + x, 0); arr = [...rest.map((x) => (x / rs) * (1 - oth)), oth]; }
      const tot = arr.reduce((a, x) => a + x, 0);
      ['fyp', 'following', 'profile', 'search', 'sound', 'share', 'other'].forEach((k, i) => { sources[k] = Math.round((arr[i] / tot) * 100) / 100; });
      const adj = Math.round((1 - Object.values(sources).reduce((a, x) => a + x, 0)) * 100) / 100;
      sources.fyp = Math.round((sources.fyp + adj) * 100) / 100;
      row.sources = sources;
      const geo = {};
      const others = ['GB', 'CA', 'AU', 'DE', 'BR', 'MX', 'PH', 'FR', 'ES', 'NL', 'IE'].filter((x) => x !== country);
      if (hasSig('geo_mismatch')) {
        // most views come from outside the bounty's target countries
        const target = p.bounty.eligibility.countries;
        const away = r.shuffle(['BR', 'MX', 'PH', 'FR', 'ES', 'NL', 'DE'].filter((x) => !target.includes(x) && x !== country)).slice(0, 3);
        const home = target.includes(country) ? country : target[0];
        geo[home] = Math.round(r.float(0.14, 0.27) * 100) / 100;
        if (home !== country) geo[country] = 0.06;
        geo[away[0]] = 0.34; geo[away[1]] = 0.24;
        geo[away[2]] = Math.round((1 - Object.values(geo).reduce((a, x) => a + x, 0)) * 100) / 100;
      } else {
        geo[country] = Math.round((country === 'US' ? us : clamp(0.55 + r.normal(0, 0.1), 0.2, 0.8)) * 100) / 100;
        if (country !== 'US') geo.US = Math.round(clamp(1 - geo[country] - 0.2, 0.05, 0.5) * 100) / 100;
        const rest = Math.round((1 - Object.values(geo).reduce((a, x) => a + x, 0)) * 100) / 100;
        const o1 = r.pick(others); const o2 = r.pick(others.filter((x) => x !== o1));
        if (rest > 0.02) { geo[o1] = Math.round(rest * 0.6 * 100) / 100; geo[o2] = Math.round((rest - geo[o1]) * 100) / 100; }
      }
      const gsum = Math.round(Object.values(geo).reduce((a, x) => a + x, 0) * 100) / 100;
      if (gsum !== 1) geo[country] = Math.round((geo[country] + (1 - gsum)) * 100) / 100;
      row.geo = geo;
    }
    if (h === 72 && p.fraud.score >= 70) row.note = 'Held for review: bot pattern detected, verified views exclude the flagged traffic.';
    prev = verified;
    out.push(row);
  });
  return out;
}
