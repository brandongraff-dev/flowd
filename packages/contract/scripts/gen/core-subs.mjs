// CORE stage 3: submissions. Every submission is an event history (submit, decide, resubmit, post ...); status and every derived field come from
// replaying that history up to NOW. Simulated histories use per-brand review speed and per-creator craft; the demo personas are scripted.

import { rampTimestamp, rampWeight, sortBy, groupBy } from './lib.mjs';
import { REASON_CODE_INFO } from '../../schema/tables.mjs';
import { slaState } from '../../schema/formulas.mjs';
import { iso, ms, addHours, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, clamp, C, pickWeightedBy, hoursOf, med } from './core-kit.mjs';

const H = HOUR_MS;
const min = 60_000;

/** reason weights for requested changes / rejections (admin-only suspected_fraud and reject-only codes handled by the caller) */
const REASON_W = [
  ['app_not_shown_early', 14, 'both'], ['hook_too_late', 11, 'both'], ['missing_disclosure', 12, 'both'], ['offer_not_stated', 10, 'both'], ['missing_required_beat', 9, 'both'], ['off_brief', 8, 'both'],
  ['audio_unclear', 7, 'both'], ['face_not_shown', 5, 'both'], ['banned_claim', 4, 'both'], ['music_not_licensed', 4, 'both'], ['low_video_quality', 4, 'both'], ['wrong_format', 4, 'both'],
  ['watermark_present', 3, 'both'], ['competitor_shown', 2, 'both'], ['ai_content_undisclosed', 2, 'both'], ['other_requirement', 3, 'both'],
  ['duplicate_content', 3, 'reject'], ['unoriginal_clip', 2, 'reject'], ['brand_safety', 1.2, 'reject'], ['region_mismatch', 2, 'reject'],
];
export function pickReason(rng, kind, ctx = {}) {
  const pool = REASON_W.filter(([, , a]) => kind === 'reject' || a === 'both').filter(([r]) => r !== 'region_mismatch' || ctx.regionOk === false);
  return rng.weighted(pool.map(([r, w]) => [r, w]));
}

// ── slot planning ────────────────────────────────────────────────────────────────────────────────
const NSUB = { elite: [24, 4], platinum: [15, 3], gold_f: [9, 2], gold_n: [33, 2], silver_f: [8, 2], silver_n: [8.4, 1.5], bronze_f: [3, 2], bronze_n: [3.2, 2] };
const nsubKey = (c) => (c.tierTarget === 'bronze' || c.tierTarget === 'silver' || c.tierTarget === 'gold') ? `${c.tierTarget}_${c.founding ? 'f' : 'n'}` : c.tierTarget;

export function planSlots(W) {
  const rng = W.rng.fork('slots');
  for (const c of W.creators) {
    if (c.persona) continue;
    const [mean, sd] = NSUB[nsubKey(c)];
    const wk = Math.min(1, Math.max(0.12, (NOW_EPOCH - ms(c.joinedAt)) / (80 * DAY_MS)));
    // bronze non-founders joined later submit less; everyone gets at least one slot unless they joined in the last day
    let n = Math.round(rng.normal(mean, sd));
    if (c.tierTarget === 'bronze' && !c.founding) n = Math.round(n * (0.35 + 0.9 * wk));
    n = Math.max(c.tierTarget === 'bronze' ? 0 : 3, n);
    if (c.tierTarget === 'gold' && !c.founding) n = Math.max(32, n);
    c.nSub = n;
  }
  W.slotRng = rng;
}

/** bounties open for submissions at time t (ms) */
function openAt(b, t) {
  if (['draft', 'awaiting_funding', 'cancelled', 'scheduled'].includes(b.status)) return false;
  if (b.direct) return false;
  const start = ms(b.startsAt);
  let end = Math.min(ms(b.endsAt), NOW_EPOCH);
  if (b.pausedAt) end = Math.min(end, ms(b.pausedAt));
  return t >= start && t <= end;
}

// ── event helpers ───────────────────────────────────────────────────────────────────────────────
const ev = (t, type, extra = {}) => ({ t, type, ...extra });

function decisionLatencyH(rng, brand, sigma = 0.72) {
  return clamp(rng.logNormal(brand.decideH, sigma), 0.5, brand.poor ? 140 : 92);
}
function pickReviewer(rng, brand) {
  const r = brand.reviewers;
  if (!r.length) return brand.members[0];
  if (r.length === 1) return r[0];
  return rng.chance(0.62) ? r[0] : rng.pick(r.slice(1));
}
const POST_MEDIAN_H = 14;

/** Simulate one submission's event history (no persona scripting). Returns { history, craft }. */
export function simulateHistory(rng, c, b, t0, o = {}) {
  const brand = b.brand;
  const craft = clamp(rng.normal(c.quality, 0.13), 0.12, 0.99);
  const strict = brand.poor ? 0.26 : brand.strict ?? 0;
  const history = [ev(t0, 'submit', { version: 1, craft })];
  let t = t0;
  let version = 1;
  let round = 0;
  const qaDelay = rng.int(3, 18) * min;
  // hard QA failure
  if (!o.noQaFail && rng.chance(0.012)) {
    history.push(ev(t0 + qaDelay, 'decide', { action: 'auto_reject', by: 'system', reason: rng.pick(['duplicate_content', 'brand_safety']) }));
    return { history, craft };
  }
  const regionOk = c.usRatio >= (b.eligibility.min_us_audience_ratio ?? 0);
  for (let guard = 0; guard < 6; guard++) {
    const L = (o.forceLatencyH && guard === 0) ? o.forceLatencyH : decisionLatencyH(rng, brand);
    const subAt = t;
    // withdraw before a decision
    if (guard === 0 && rng.chance(0.035)) { history.push(ev(subAt + rng.float(0.2, 0.9) * L * H, 'withdraw')); return { history, craft }; }
    const decideAt = subAt + L * H;
    // brand times out after 72 h with approve-if-clean policy
    if (L > 72 && brand.timeout === 'approve_if_clean' && craft > 0.62 && !o.noTimeout && b.brand.key === 'quillby') {
      history.push(ev(subAt + 72 * H, 'decide', { action: 'timeout_approve', by: 'system' }));
      return finishApproved(rng, history, c, b, subAt + 72 * H, o, craft);
    }
    const pRej = clamp(1 / (1 + Math.exp(9 * (craft - 0.5))) + strict + 0.012 + (regionOk ? 0 : 0.5), 0.02, 0.88);
    const pChg = round >= 2 ? 0 : clamp(0.2 + (0.8 - craft) * 0.3, 0.07, 0.45) * (version === 1 ? 1 : 0.55);
    const u = rng.next();
    let action = u < pRej ? 'reject' : u < pRej + (1 - pRej) * pChg ? 'request_changes' : 'approve';
    if (o.forceAction) action = o.forceAction;
    if (action === 'reject') {
      const reason = pickReason(rng, 'reject', { regionOk });
      history.push(ev(decideAt, 'decide', { action: 'reject', by: 'brand', reason, reviewer: pickReviewer(rng, brand) }));
      // appeal path
      if (rng.chance(0.13)) {
        const appealAt = decideAt + rng.float(0.5, 5) * DAY_MS;
        history.push(ev(appealAt, 'appeal'));
        const resolveAt = appealAt + rng.float(10, 70) * H;
        const overturn = rng.chance(0.28);
        history.push(ev(resolveAt, 'decide', { action: overturn ? 'appeal_overturn' : 'appeal_uphold', by: 'admin', reason }));
        if (overturn) return finishApproved(rng, history, c, b, resolveAt, o, craft);
      }
      return { history, craft };
    }
    if (action === 'request_changes') {
      round++;
      const reason = pickReason(rng, 'both');
      history.push(ev(decideAt, 'decide', { action: 'request_changes', by: 'brand', reason, reviewer: pickReviewer(rng, brand) }));
      if (!rng.chance(0.72)) {
        if (rng.chance(0.62)) history.push(ev(decideAt + 14 * DAY_MS, 'expire'));
        else history.push(ev(decideAt + rng.float(0.5, 6) * DAY_MS, 'withdraw'));
        return { history, craft };
      }
      const resubAt = decideAt + clamp(rng.logNormal(28, 0.95), 2, 300) * H;
      version++;
      history.push(ev(resubAt, 'submit', { version, craft: clamp(craft + rng.float(0.06, 0.2), 0, 0.99) }));
      t = resubAt;
      continue;
    }
    // approve
    // Lumi guarded auto-approve after 2026-09-19 for proven creators
    if (b.brand.key === 'lumi' && decideAt > ms('2026-09-20T00:00:00Z') && c.approvedSoFar >= 3 && craft > 0.75 && rng.chance(0.55) && !o.noAuto) {
      const at = subAt + rng.int(6, 30) * min;
      history.push(ev(at, 'decide', { action: 'auto_approve', by: 'system' }));
      return finishApproved(rng, history, c, b, at, o, craft);
    }
    history.push(ev(decideAt, 'decide', { action: 'approve', by: 'brand', reviewer: pickReviewer(rng, brand) }));
    return finishApproved(rng, history, c, b, decideAt, o, craft);
  }
  return { history, craft };
}

function finishApproved(rng, history, c, b, approvedAt, o, craft) {
  c.approvedSoFar = (c.approvedSoFar ?? 0) + 1;
  const skip = o.neverPost ?? rng.chance(0.088);
  if (skip) {
    if (approvedAt + 30 * DAY_MS <= NOW_EPOCH) history.push(ev(approvedAt + 30 * DAY_MS, 'release'));
    return { history, craft };
  }
  const med = b.is_starter ? 5 : POST_MEDIAN_H;
  const delay = clamp(rng.logNormal(med, b.is_starter ? 0.9 : 1.15), 0.6, 26 * 24);
  history.push(ev(approvedAt + delay * H, 'post'));
  return { history, craft };
}

// ── deriving a submission's state from its history ──────────────────────────────────────────────
/** status and derived fields at NOW. history events with t > NOW are ignored. */
export function deriveState(sub) {
  const evs = sub.history.filter((e) => e.t <= NOW_EPOCH).sort((a, b) => a.t - b.t);
  const versions = [];
  let status = 'qa_pending';
  let round = 0;
  let decision = null;
  const decisions = [];
  let approvedAt = null;
  let postedAt = null;
  let releasedAt = null;
  let appealUsed = false;
  let withdrawnAt = null;
  let expiredAt = null;
  let lastSubmit = null;
  let auto = false;
  for (const e of evs) {
    if (e.type === 'submit') { versions.push({ n: e.version, at: e.t, craft: e.craft }); lastSubmit = e.t; status = 'qa_pending'; }
    else if (e.type === 'decide') {
      const hours = lastSubmit != null ? (e.t - lastSubmit) / H : 0;
      const d = { ...e, hours, sla_met: e.action === 'auto_approve' || e.action === 'auto_reject' ? true : e.action === 'timeout_approve' ? false : e.by === 'admin' ? true : hours <= C.review.sla_hours };
      decisions.push(d);
      decision = d;
      if (e.action === 'approve' || e.action === 'auto_approve' || e.action === 'timeout_approve' || e.action === 'appeal_overturn') { status = 'approved'; approvedAt = e.t; if (e.action === 'auto_approve') auto = true; }
      else if (e.action === 'request_changes') { status = 'changes_requested'; round++; }
      else if (e.action === 'reject' || e.action === 'auto_reject' || e.action === 'appeal_uphold') status = 'rejected';
    } else if (e.type === 'appeal') { status = 'appealed'; appealUsed = true; }
    else if (e.type === 'post') { if (status === 'approved') { status = 'posted'; postedAt = e.t; } }
    else if (e.type === 'release') { if (status === 'approved') { status = 'released'; releasedAt = e.t; } }
    else if (e.type === 'withdraw') { status = 'withdrawn'; withdrawnAt = e.t; }
    else if (e.type === 'expire') { if (status === 'changes_requested') { status = 'expired'; expiredAt = e.t; } }
  }
  // qa_pending becomes in_review after the QA delay
  if (status === 'qa_pending') {
    const qaDone = lastSubmit + (sub.qaDelay ?? 8 * min);
    if (NOW_EPOCH >= qaDone) status = 'in_review';
  }
  // the version after a decision keeps its in_review status; the version submitted but not decided is the current one
  sub.derived = { status, versions, round, decision, decisions, approvedAt, postedAt, releasedAt, appealUsed, withdrawnAt, expiredAt, lastSubmit, auto };
  return sub.derived;
}

export const OPEN_STATUSES = new Set(['qa_pending', 'in_review', 'changes_requested', 'approved', 'appealed']);
export const APPROVED_FAMILY = new Set(['approved', 'posted', 'released']);

// ── assignment of slots to bounties ─────────────────────────────────────────────────────────────
export function buildSubmissions(W) {
  const rng = W.rng.fork('subs');
  const creators = W.creators;
  const bounties = W.bounties;
  const subs = [];
  const nextKey = (() => { let k = 0; return () => ++k; })();
  W.subKey = nextKey;
  const countsByBounty = new Map(bounties.map((b) => [b, 0]));
  const capacity = (b) => Math.max(2, b.pop * 6.2);
  const startersOf = bounties.filter((b) => b.is_starter);
  const mainBounties = bounties.filter((b) => !b.is_starter && !b.direct);

  // ── persona and specials first (they occupy slots of their creators)
  scriptMaya(W, subs, nextKey, rng);
  scriptDirects(W, subs, nextKey);
  planSlots(W);
  const specials = scriptSpecials(W, subs, nextKey, rng);

  // ── generic simulation per creator, in join order; retry creators whose tier constraints fail
  const tierCheck = (c, mine) => {
    if (c.founding || c.persona) return true;
    const approved = mine.filter((s) => APPROVED_FAMILY.has(s.derived.status)).length;
    const rejected = mine.filter((s) => s.derived.status === 'rejected').length;
    const rate = approved + rejected > 0 ? approved / (approved + rejected) : 0;
    if (c.tierTarget === 'gold') return approved >= 28 && rate >= 0.8;
    if (c.tierTarget === 'silver') return approved >= 5 && rate >= 0.74;
    return approved < 5 || rate >= 0 ; // bronze: tier computed later; must not accidentally qualify for silver
  };
  const bronzeOk = (c, mine) => {
    const approved = mine.filter((s) => APPROVED_FAMILY.has(s.derived.status)).length;
    const rejected = mine.filter((s) => s.derived.status === 'rejected').length;
    return approved < 5;
  };

  for (const c of creators) {
    if (c.persona) continue;
    const already = specials.filter((s) => s.creator === c);
    let result = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      const r = W.rng.fork(`sim-${c.id}-${attempt}`);
      const mine = genForCreator(W, r, c, already, { startersOf, mainBounties, countsByBounty, capacity, nextKey, dry: true });
      if (tierCheck(c, [...already, ...mine]) && (c.tierTarget !== 'bronze' || bronzeOk(c, [...already, ...mine]) || c.founding)) { result = { mine, r }; break; }
      if (attempt === 79) result = { mine, r };
    }
    // quota counters advance only for the accepted draw
    for (const s of result.mine) { countsByBounty.set(s.bounty, (countsByBounty.get(s.bounty) ?? 0) + 1); s.bounty.subs.push(s); s.creator.subs.push(s); subs.push(s); }
  }
  for (const s of subs) { if (!s.bounty.subs.includes(s)) s.bounty.subs.push(s); if (!s.creator.subs.includes(s)) s.creator.subs.push(s); }
  W.subs = subs;
  scriptQueue(W, subs, nextKey);
  calibrateLumi(W);
  return subs;
}

// ── scripted: the live queue ─────────────────────────────────────────────────────────────────────
/**
 * Fills the review screens with what a busy Saturday looks like: a handful of QA-pending uploads, fresh in-review submissions,
 * recent change requests nobody has answered yet, six open appeals, and one example each of the two rarer reason codes.
 * Lumi is left alone: its queue (Maya's upload plus five scripted stories) is hand-shaped in scriptSpecials.
 */
function scriptQueue(W, subs, nextKey) {
  const r = W.rng.fork('queue');
  const pairs = new Set(subs.map((s) => `${s.creator.id}|${s.bounty.id}`));
  const live = W.bounties.filter((b) => b.status === 'live' && !b.direct && !b.is_starter && b.brand.key !== 'lumi' && b.visibility !== 'invite_only' && b.key !== 'flowd_about_us');
  const eligible = (c, b) => !pairs.has(`${c.id}|${b.id}`) && !c.persona && c.flagged !== 'suspect' && ms(c.joinedAt) < NOW_EPOCH - 3 * DAY_MS && b.eligibility.countries.includes(c.countryCode)
    && tierOk(c, b) && !(b.eligibility.min_us_audience_ratio && c.usRatio < b.eligibility.min_us_audience_ratio) && c.tierTarget !== 'elite';
  const pickPair = (want) => {
    for (let g = 0; g < 400; g++) {
      const b = want ? W.bountyBy.get(want) : pickWeightedBy(r, live, (x) => x.pop + 0.3);
      const c = r.pick(W.creators);
      if (b && eligible(c, b)) { pairs.add(`${c.id}|${b.id}`); return [c, b]; }
    }
    return null;
  };
  const add = (c, b, history, craft, extra = {}) => {
    const s = makeSub(W, nextKey, c, b, history, craft, r, extra);
    b.subs.push(s); c.subs.push(s); subs.push(s);
    return s;
  };
  const craftOf = (c) => clamp(r.normal(c.quality, 0.1), 0.3, 0.95);
  // QA still running: uploaded in the last few minutes, the automated checks take up to 18
  for (let i = 0; i < 5; i++) {
    const pair = pickPair();
    if (!pair) continue;
    const [c, b] = pair;
    const t0 = NOW_EPOCH - r.int(3, 9) * min;
    const craft = craftOf(c);
    add(c, b, [ev(t0, 'submit', { version: 1, craft })], craft, { qaDelay: 16 * min, special: 'qa_pending' });
  }
  // fresh in review (well inside the 72 h SLA)
  for (let i = 0; i < 17; i++) {
    const pair = pickPair();
    if (!pair) continue;
    const [c, b] = pair;
    const t0 = NOW_EPOCH - r.float(0.5, 44) * H;
    const craft = craftOf(c);
    add(c, b, [ev(t0, 'submit', { version: 1, craft })], craft, { qaDelay: r.int(3, 14) * min, special: 'fresh' });
  }
  // changes requested, no new version yet (round 1 of 2)
  for (let i = 0; i < 17; i++) {
    const forced = i === 0;
    const pair = pickPair(forced ? 'quillby_voice' : undefined);
    if (!pair) continue;
    const [c, b] = pair;
    const latency = decisionLatencyH(r, b.brand);
    const decideAge = r.float(3, 9 * 24);
    const decideT = NOW_EPOCH - decideAge * H;
    const t0 = Math.max(decideT - latency * H, ms(b.startsAt) + HOUR_MS, ms(c.joinedAt) + 2 * HOUR_MS);
    const decideAt = Math.max(decideT, t0 + 20 * min);
    if (decideAt > NOW_EPOCH - H) continue;
    const reason = forced ? 'ai_content_undisclosed' : pickReason(r, 'both');
    const craft = craftOf(c);
    add(c, b, [ev(t0, 'submit', { version: 1, craft }), ev(decideAt, 'decide', { action: 'request_changes', by: 'brand', reason, reviewer: pickReviewer(r, b.brand) })], craft, { special: 'changes' });
  }
  // an unoriginal clip, rejected three days ago
  {
    const pair = pickPair('reelcraft_rawclips');
    if (pair) {
      const [c, b] = pair;
      const decideAt = NOW_EPOCH - 3.2 * DAY_MS;
      const t0 = decideAt - decisionLatencyH(r, b.brand) * H;
      add(c, b, [ev(t0, 'submit', { version: 1, craft: 0.4 }), ev(decideAt, 'decide', { action: 'reject', by: 'brand', reason: 'unoriginal_clip', reviewer: pickReviewer(r, b.brand) })], 0.4, { special: 'unoriginal' });
    }
  }
  // six open appeals: recent brand rejections the creator has taken to Ops (one appeal per rejection)
  const rejected = subs.filter((s) => {
    const d = s.derived;
    if (d.status !== 'rejected' || s.creator.persona || d.appealUsed) return false;
    const last = d.decisions[d.decisions.length - 1];
    return last && last.action === 'reject' && last.by === 'brand' && NOW_EPOCH - last.t > 6 * H && NOW_EPOCH - last.t < 6 * DAY_MS;
  });
  for (const s of r.sample(rejected, 6)) {
    const last = s.derived.decisions[s.derived.decisions.length - 1];
    const appealAt = Math.min(NOW_EPOCH - 30 * min, last.t + r.float(2, 30) * H);
    s.history.push(ev(appealAt, 'appeal'));
    s.history.push(ev(NOW_EPOCH + r.float(6, 40) * H, 'decide', { action: r.chance(0.3) ? 'appeal_overturn' : 'appeal_uphold', by: 'admin', reason: last.reason }));
    deriveState(s);
  }
}

/** Lumi's published median decision time is 11.2 hours: scale its human decisions, then pin the middle ones exactly. */
function calibrateLumi(W) {
  const lumi = W.brandBy.get('lumi');
  const items = [];
  const collect = () => {
    items.length = 0;
    for (const s of W.subs) {
      if (s.brand !== lumi) continue;
      s.history.sort((a, b) => a.t - b.t);
      let lastSubmit = null;
      for (const e of s.history) {
        if (e.type === 'submit') lastSubmit = e.t;
        else if (e.type === 'decide' && e.by === 'brand' && (e.action === 'approve' || e.action === 'reject') && e.t <= NOW_EPOCH) items.push({ s, e, sub: lastSubmit, hours: (e.t - lastSubmit) / H, scripted: !!s.scripted });
      }
    }
  };
  const shift = (it, newT) => {
    const delta = newT - it.e.t;
    const old = it.e.t;
    for (const e of it.s.history) if (e.t >= old) e.t += delta;
  };
  collect();
  if (items.length < 4) return;
  const medOf = () => { const a = items.map((x) => x.hours).sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const k = 11.2 / medOf();
  for (const it of items) {
    if (it.scripted) continue;
    const lat = it.e.t - it.sub;
    const newLat = Math.max(25 * 60_000, lat * k);
    const newT = Math.max(it.sub + 25 * 60_000, Math.min(it.sub + newLat, NOW_EPOCH - 30 * 60_000));
    if (Math.abs(newT - it.e.t) > 1) shift(it, newT);
  }
  for (let iter = 0; iter < 6; iter++) {
    collect();
    const sorted = [...items].sort((x, y) => x.hours - y.hours);
    const m = Math.floor(sorted.length / 2);
    const ranks = sorted.length % 2 ? [m] : [m - 1, m];
    const mids = [];
    for (const r of ranks) { let j = r; let best = null; for (let d = 0; d < sorted.length && !best; d++) { for (const c of [j - d, j + d]) if (c >= 0 && c < sorted.length && !sorted[c].scripted && !mids.includes(sorted[c])) { best = sorted[c]; break; } } if (best) mids.push(best); }
    for (const it of mids) shift(it, it.sub + 40_320_000);
    collect();
    if (Math.abs(medOf() - 11.2) < 1e-9) break;
  }
  for (const s of W.subs) if (s.brand === lumi) deriveState(s);
  for (const s of W.subs) if (s.brand !== lumi) continue;
}

function genForCreator(W, r, c, already, ctx) {
  const { startersOf, mainBounties, countsByBounty, capacity, nextKey } = ctx;
  const out = [];
  const need = Math.max(0, (c.nSub ?? 0) - already.length);
  if (need === 0) return out;
  const from = Math.max(ms(c.joinedAt) + rng0(r, 20, 150) * min, ms('2026-07-05T09:00:00Z'));
  const to = NOW_EPOCH - 25 * min;
  const times = [];
  for (let i = 0; i < need; i++) times.push(ms(rampTimestamp(r, { from: iso(from), to: iso(to) })));
  times.sort((a, b) => a - b);
  // first slot: a starter for most creators
  const used = new Set(already.map((s) => s.bounty));
  const localCounts = new Map();
  c.approvedSoFar = 0;
  const myStarters = [];
  times.forEach((t, i) => {
    let bounty = null;
    const startersOpen = startersOf.filter((b) => openAt(b, t) && !used.has(b));
    const wantStarter = startersOpen.length > 0 && ((i === 0 && r.chance(0.86)) || (myStarters.length < 2 && i < 3 && r.chance(0.16)));
    if (wantStarter) {
      bounty = pickWeightedBy(r, startersOpen, (b) => b.pop);
      myStarters.push(bounty);
    } else {
      const cand = mainBounties.filter((b) => openAt(b, t) && !used.has(b) && b.eligibility.countries.includes(c.countryCode) && tierOk(c, b) && !(b.visibility === 'invite_only' && c.tierTarget === 'bronze'));
      const pool = cand.length ? cand : mainBounties.filter((b) => openAt(b, t) && !used.has(b));
      bounty = pickWeightedBy(r, pool, (b) => bountyWeight(c, b, t, countsByBounty, localCounts, capacity));
      if (!bounty) bounty = pickWeightedBy(r, mainBounties.filter((b) => !used.has(b) && b.status !== 'draft' && b.status !== 'awaiting_funding' && b.status !== 'cancelled' && b.status !== 'scheduled'), () => 1);
    }
    if (!bounty) return;
    used.add(bounty);
    localCounts.set(bounty, (localCounts.get(bounty) ?? 0) + 1);
    // early access: higher tiers see a new bounty before the others (bronze waits 12 h)
    const head = { elite: 12, platinum: 6, gold: 3, silver: 1, bronze: 0 }[c.tierTarget];
    const earliest = ms(bounty.startsAt) + (12 - head) * H;
    const tt = Math.max(t, Math.min(earliest, NOW_EPOCH - 30 * min));
    const { history, craft } = simulateHistory(r, c, bounty, tt);
    // Lumi's review queue is hand-shaped (scriptSpecials): nothing else may be left waiting there
    if (bounty.brand.key === 'lumi') settleBeforeNow(history, r);
    out.push(makeSub(W, nextKey, c, bounty, history, craft, r));
  });
  return out;
}
/** pull the first outcome (decision or withdrawal) and everything after it back so that it lands before now; a very recent submission moves earlier too */
function settleBeforeNow(history, r) {
  const cap = NOW_EPOCH - 40 * min;
  const first = history.find((e) => e.type !== 'submit');
  if (!first || first.t <= cap) return;
  const submit = history.filter((e) => e.type === 'submit' && e.t < first.t).pop();
  const target = Math.max(submit.t + 25 * min, cap - r.int(0, 240) * min);
  const delta = first.t - target;
  for (const e of history) if (e.t >= first.t) e.t -= delta;
  if (first.t - submit.t < 25 * min) { const shift = 25 * min - (first.t - submit.t); for (const e of history) if (e.t <= submit.t) e.t -= shift; }
}
const rng0 = (r, a, b) => r.int(a, b);
const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'elite'];
function tierOk(c, b) {
  const min = b.eligibility.min_tier;
  return !min || TIER_ORDER.indexOf(c.tierTarget) >= TIER_ORDER.indexOf(min);
}
function bountyWeight(c, b, t, counts, local, capacity) {
  const nicheHit = b.eligibility.niches.filter((n) => c.niches.includes(n)).length;
  const affinity = 0.5 + 1.1 * nicheHit;
  const ageDays = (t - ms(b.startsAt)) / DAY_MS;
  const recency = Math.pow(0.5, Math.max(0, ageDays) / 24) * 0.8 + 0.2;
  const load = counts.get(b) ?? 0;
  const cap = capacity(b);
  const room = Math.max(0.06, 1 - load / cap);
  const speed = b.brand.decideH > 45 ? 0.8 : 1;
  const sameBrandPenalty = (local.get(b.brand) ?? 0) > 0 ? 0.7 : 1;
  const priceBoost = b.cpm_cents > 0 ? 0.85 + (b.cpm_cents / 220) * 0.3 : 0.7;
  const usGate = b.eligibility.min_us_audience_ratio && c.usRatio < b.eligibility.min_us_audience_ratio ? 0.08 : 1;
  return b.pop * affinity * recency * room * speed * sameBrandPenalty * priceBoost * usGate;
}

/** create the submission object from a history */
export function makeSub(W, nextKey, creator, bounty, history, craft, r, extra = {}) {
  const sub = {
    key: nextKey(), creator, bounty, brand: bounty.brand, app: bounty.app, history, craft, qaDelay: (r ? r.int(3, 18) : 8) * min, source: null, ...extra,
  };
  if (!sub.source) sub.source = r ? r.weighted([['studio', 6], ['web_studio', 1.4], ['camera_roll', 1.8], ['capcut', 1.2]]) : 'studio';
  deriveState(sub);
  return sub;
}

// ── scripted: Maya ──────────────────────────────────────────────────────────────────────────────
const d = (md, hh, mm = 0) => ms(`2026-${md}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
/** [bounty key, submitted-at ms, decided-after hours, decider ('human'), posted-at ms, options] */
function scriptMaya(W, subs, nextKey, rng) {
  const maya = W.maya;
  const r = W.rng.fork('maya');
  const B = (k) => W.bountyBy.get(k);
  const reviewerOf = (b) => pickReviewer(r, b.brand);
  const mk = (bkey, history, craft, extra = {}) => {
    const bounty = B(bkey);
    const s = makeSub(W, nextKey, maya, bounty, history, craft, r, { ...extra, scripted: true });
    bounty.subs.push(s); maya.subs.push(s); subs.push(s);
    return s;
  };
  const hist = (bkey, t0, ops) => {
    const b = B(bkey);
    const h = [ev(t0, 'submit', { version: 1, craft: 0.78 })];
    for (const o of ops) h.push(o);
    return h;
  };
  const rev = (bkey) => reviewerOf(B(bkey));
  // 20 posted submissions: [bounty, posted_at, decision latency h, approval->post h, revision?]
  const posts = [
    ['flowd_starter_1', d('07-24', 20, 40), 0, { revision: { submit: d('07-16', 18, 20), changes: d('07-17', 11, 30), resubmit: d('07-23', 19, 10), approve: d('07-24', 20, 0), reason: 'missing_disclosure' } }],
    ['tasklane_plan60', d('07-29', 15, 10), 13.5],
    ['flowd_about_us', d('08-01', 17, 30), 6.2],
    ['quillby_onetake', d('08-04', 14, 0), 24.5, { revisionH: 20, reason: 'offer_not_stated' }],
    ['subhawk_forgot', d('08-08', 19, 20), 16.3],
    ['lumi_headshots', d('08-11', 13, 30), 9.4],
    ['glowkit_nostudio', d('08-13', 16, 45), 30.1, { removedAt: d('08-15', 12, 10) }],
    ['focusfern_study', d('08-26', 10, 20), 7.9],
    ['dozely_direct', d('08-30', 11, 0), 9.0],
    ['reelcraft_rawclips', d('09-05', 20, 10), 11.7, { revisionH: 26, reason: 'hook_too_late' }],
    ['wanderlist_trip', d('09-09', 14, 25), 19.6],
    ['lumi_retouch30', d('09-15', 18, 15), 10.9, { revisionH: 9, reason: 'app_not_shown_early' }],
    ['lumi_glowup', d('09-18', 13, 45), 10.4],
    ['quillby_voice', d('09-21', 16, 5), 22.8],
    ['focusfern_system', d('09-23', 19, 30), 6.7],
    ['lumi_fixbadphoto', d('09-29', 20, 40), 11.6],
    ['parlo_spoke', d('09-30', 13, 5), 15.5],
    ['pantrypal_scan', d('10-01', 12, 10), 23.2],
    ['stillwater_calm', d('10-02', 18, 20), 14.1],
    ['ironleaf_skipping', d('10-03', 9, 30), 6.0],
  ];
  for (const [bkey, postedAt, decideH, o = {}] of posts) {
    const b = B(bkey);
    let t0; let h;
    if (o.revision) {
      const x = o.revision;
      h = [ev(x.submit, 'submit', { version: 1, craft: 0.66 }), ev(x.changes, 'decide', { action: 'request_changes', by: 'brand', reason: x.reason, reviewer: rev(bkey) }), ev(x.resubmit, 'submit', { version: 2, craft: 0.8 }), ev(x.approve, 'decide', { action: 'approve', by: 'brand', reviewer: rev(bkey) }), ev(postedAt, 'post')];
      mk(bkey, h, 0.8);
      continue;
    }
    const approvedAt = postedAt - r.float(2.5, 15) * H;
    if (o.revisionH) {
      const decideAt1 = approvedAt - o.revisionH * H - r.float(3, 12) * H;
      const sub1 = decideAt1 - decideH * H * 0.5;
      const resub = approvedAt - decideH * H * 0.55;
      h = [ev(sub1, 'submit', { version: 1, craft: 0.64 }), ev(decideAt1, 'decide', { action: 'request_changes', by: 'brand', reason: o.reason, reviewer: rev(bkey) }), ev(resub, 'submit', { version: 2, craft: 0.8 }), ev(approvedAt, 'decide', { action: 'approve', by: 'brand', reviewer: rev(bkey) }), ev(postedAt, 'post')];
    } else {
      t0 = approvedAt - decideH * H;
      h = [ev(t0, 'submit', { version: 1, craft: clamp(r.normal(0.8, 0.07), 0.6, 0.97) }), ev(approvedAt, 'decide', { action: bkey === 'lumi_glowup' && approvedAt > d('09-20', 0) ? 'approve' : 'approve', by: 'brand', reviewer: rev(bkey) }), ev(postedAt, 'post')];
    }
    const s = mk(bkey, h, 0.8, { removedAt: o.removedAt });
    s.removedAt = o.removedAt;
  }
  // approved, not posted yet (link, code and #ad ready)
  mk('lumi_beforeafter', hist('lumi_beforeafter', d('10-02', 5, 40), [ev(d('10-02', 16, 10), 'decide', { action: 'approve', by: 'brand', reviewer: rev('lumi_beforeafter') })]), 0.82);
  // two in review: one at Lumi (decides in about 11 h), one at a slow brand
  mk('lumi_editwithme', hist('lumi_editwithme', d('10-03', 13, 50), []), 0.8, { qaDelay: 4 * min });
  mk('wordwave_flashcards', hist('wordwave_flashcards', d('10-02', 22, 30), []), 0.74);
  // one with changes requested (round 1 of 2)
  mk('loopnest_beat5', hist('loopnest_beat5', d('10-01', 10, 0), [ev(d('10-02', 9, 10), 'decide', { action: 'request_changes', by: 'brand', reason: 'offer_not_stated', reviewer: rev('loopnest_beat5') })]), 0.66);
  // rejected two days ago, appeal not used yet; five older rejections
  mk('tasklane_focus', hist('tasklane_focus', d('10-01', 9, 20), [ev(d('10-01', 16, 0), 'decide', { action: 'reject', by: 'brand', reason: 'offer_not_stated', reviewer: rev('tasklane_focus') })]), 0.58);
  mk('parlo_day1', hist('parlo_day1', d('07-27', 10, 0), [ev(d('07-28', 12, 20), 'decide', { action: 'reject', by: 'brand', reason: 'off_brief', reviewer: rev('parlo_day1') })]), 0.55);
  mk('pulsepath_tenmin', hist('pulsepath_tenmin', d('09-04', 15, 20), [ev(d('09-06', 8, 30), 'decide', { action: 'reject', by: 'brand', reason: 'missing_disclosure', reviewer: rev('pulsepath_tenmin') })]), 0.6);
  mk('tunefox_riff', hist('tunefox_riff', d('09-26', 11, 0), [ev(d('09-27', 10, 40), 'decide', { action: 'reject', by: 'brand', reason: 'hook_too_late', reviewer: rev('tunefox_riff') })]), 0.57);
  mk('inkdock_notes', hist('inkdock_notes', d('09-20', 14, 30), [ev(d('09-22', 8, 15), 'decide', { action: 'reject', by: 'brand', reason: 'app_not_shown_early', reviewer: rev('inkdock_notes') })]), 0.56);
  // note: sixth rejection above is tasklane_focus; add one more older rejection plus a withdrawal
  mk('stridely_firstweek', hist('stridely_firstweek', d('08-02', 11, 0), [ev(d('08-03', 10, 20), 'decide', { action: 'reject', by: 'brand', reason: 'audio_unclear', reviewer: rev('stridely_firstweek') })]), 0.55);
  mk('stridely_runclub', hist('stridely_runclub', d('09-12', 15, 0), [ev(d('09-12', 21, 0), 'withdraw')]), 0.7);
  maya.approvedSoFar = 21;
}

// ── scripted specials: review-queue stories ─────────────────────────────────────────────────────
function scriptSpecials(W, subs, nextKey, rng) {
  const r = W.rng.fork('specials');
  const out = [];
  const pickCreator = (pred) => {
    const pool = W.creators.filter((c) => !c.persona && pred(c));
    return r.pick(pool);
  };
  const add = (c, bkey, tAgoH, opts = {}) => {
    const b = W.bountyBy.get(bkey);
    const t0 = NOW_EPOCH - tAgoH * H;
    const history = [ev(t0, 'submit', { version: 1, craft: opts.craft ?? clamp(r.normal(c.quality, 0.1), 0.3, 0.95) })];
    const s = makeSub(W, nextKey, c, b, history, history[0].craft, r, { special: opts.tag, ...opts.extra });
    b.subs.push(s); c.subs.push(s); subs.push(s); out.push(s);
    c.nSubSpecial = (c.nSubSpecial ?? 0) + 1;
    return s;
  };
  // Lumi queue (Maya's is the sixth): two stale, one breached, one fraud-evidence warning, one duplicate hash
  const bronzeLumi = W.creators.filter((c) => !c.persona && ['bronze', 'silver'].includes(c.tierTarget) && ms(c.joinedAt) < ms('2026-09-10T00:00:00Z') && c.countryCode === 'US');
  const pick = () => { const c = r.pick(bronzeLumi); return c; };
  const cA = pick(); add(cA, 'lumi_glowup', 52.5, { tag: 'lumi_stale' });
  let cB = pick(); while (cB === cA) cB = pick(); add(cB, 'lumi_fixbadphoto', 61.2, { tag: 'lumi_stale' });
  let cC = pick(); while (cC === cA || cC === cB) cC = pick(); add(cC, 'lumi_retouch30', 76.4, { tag: 'lumi_breached' });
  let cD = pick(); while ([cA, cB, cC].includes(cD)) cD = pick(); add(cD, 'lumi_glowup', 5.2, { tag: 'lumi_fraud_warning', craft: 0.7 });
  cD.fraudProneness = 0.55; cD.flagged = 'warning';
  let cE = pick(); while ([cA, cB, cC, cD].includes(cE)) cE = pick(); add(cE, 'lumi_fixbadphoto', 9.1, { tag: 'lumi_duplicate', craft: 0.66 });
  // wordwave: three breached (escalated), one more stale
  const wordPool = W.creators.filter((c) => !c.persona && c.tierTarget === 'bronze' && ms(c.joinedAt) < ms('2026-09-20T00:00:00Z'));
  const used = new Set([cA, cB, cC, cD, cE]);
  const pw = () => { let c = r.pick(wordPool); while (used.has(c)) c = r.pick(wordPool); used.add(c); return c; };
  add(pw(), 'wordwave_flashcards', 81.5, { tag: 'breached' });
  add(pw(), 'wordwave_flashcards', 86.2, { tag: 'breached' });
  add(pw(), 'wordwave_flashcards', 93.4, { tag: 'breached' });
  add(pw(), 'wordwave_flashcards', 55.0, { tag: 'stale' });
  // stale at other brands
  for (const [bk, h] of [['ironleaf_skipping', 57.3], ['stillwater_calm', 64.8], ['loopnest_beat5', 49.6]]) add(pw(), bk, h, { tag: 'stale' });
  // quillby approve-if-clean timeout approval: a submission sat 72h and was approved by the system policy
  const qc = pw();
  const qb = W.bountyBy.get('quillby_voice');
  const qt = NOW_EPOCH - 6.2 * DAY_MS;
  const qh = [ev(qt, 'submit', { version: 1, craft: 0.7 }), ev(qt + 72 * H, 'decide', { action: 'timeout_approve', by: 'system' }), ev(qt + 72 * H + 9 * H, 'post')];
  const qs = makeSub(W, nextKey, qc, qb, qh, 0.7, r, { special: 'timeout' }); qb.subs.push(qs); qc.subs.push(qs); subs.push(qs); out.push(qs); qc.nSubSpecial = (qc.nSubSpecial ?? 0) + 1;
  // one auto_reject for suspected fraud (hard QA failure with a new account)
  const fc = pw();
  const fb = W.bountyBy.get('lumi_glowup');
  const ft = NOW_EPOCH - 3.4 * DAY_MS;
  const fh = [ev(ft, 'submit', { version: 1, craft: 0.35 }), ev(ft + 11 * min, 'decide', { action: 'auto_reject', by: 'system', reason: 'suspected_fraud' })];
  fc.fraudProneness = 0.8; fc.flagged = 'suspect';
  const fs = makeSub(W, nextKey, fc, fb, fh, 0.35, r, { special: 'suspected_fraud' }); fb.subs.push(fs); fc.subs.push(fs); subs.push(fs); out.push(fs); fc.nSubSpecial = (fc.nSubSpecial ?? 0) + 1;
  return out;
}

// ── scripted: the three other private direct bounties (flat fee, one creator each, Silver and above with a rate card) ──────────────
function scriptDirects(W, subs, nextKey) {
  const r = W.rng.fork('directs');
  const founders = W.creators.filter((c) => c.founding && ['gold', 'platinum', 'elite'].includes(c.tierTarget) && !c.persona);
  const plan = [
    ['reelcraft_direct', ms('2026-09-01T11:00:00Z'), 8.5, 12],
    ['budgetbee_direct', ms('2026-10-02T09:30:00Z'), 14, 9],
    ['wanderlist_direct', ms('2026-10-01T10:30:00Z'), 9, 7],
  ];
  const used = new Set();
  for (const [bkey, postAt, decideH, rankIdx] of plan) {
    const b = W.bountyBy.get(bkey);
    let c = founders.filter((x) => !used.has(x)).sort((a, b2) => a.idx - b2.idx)[rankIdx % Math.max(1, founders.length - used.size)];
    used.add(c);
    const approvedAt = postAt - r.float(3, 9) * H;
    const t0 = approvedAt - decideH * H;
    const reviewer = pickReviewer(r, b.brand);
    const h = [ev(t0, 'submit', { version: 1, craft: clamp(r.normal(0.84, 0.05), 0.7, 0.95) }), ev(approvedAt, 'decide', { action: 'approve', by: 'brand', reviewer }), ev(postAt, 'post')];
    const s = makeSub(W, nextKey, c, b, h, h[0].craft, r, { scripted: false, direct: true });
    b.subs.push(s); c.subs.push(s); subs.push(s);
    c.nSubDirect = (c.nSubDirect ?? 0) + 1;
  }
}
