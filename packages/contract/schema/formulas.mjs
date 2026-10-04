// FORMULAS: the executable reference implementation of every number-producing rule in flowd.
// Pure functions, zero dependencies beyond CONSTANTS and the time helpers. The web engine (apps/web/src/lib/engine),
// the iOS engine (Core/Engine) and the fixture generators port or call these; the validator recomputes against them.
// Money is integer cents; rates are 0..1 ratios; rounding is half-up per leg unless stated.
//
// DOMAIN.md section FORMULAS prints the rules and worked examples from this file (see FORMULA_DOCS at the bottom).

import { CONSTANTS as C } from './constants.mjs';
import { addHours, ms, iso, HOUR_MS, DAY_MS, dayStart, nextWeeklyAt } from './time.mjs';

// ── primitives ────────────────────────────────────────────────────────────────────────────────
/** Basis points of a rate (0.12 -> 1200). */
export const bps = (rate) => Math.round(rate * 10000);
/** round-half-up(cents x rate) using integer basis-point math (no float drift). */
export const mulRate = (cents, rate) => Math.round((cents * bps(rate)) / 10000);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round2 = (x) => Math.round(x * 100) / 100;
/** "$1,234.56" for docs and memos (the app formats money at the edge with its own formatMoney). */
export function usd(cents) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = `$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}
/** Linear-interpolation quantile (type 7) of an unsorted numeric array. q in 0..1. */
export function quantile(values, q) {
  if (values.length === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
export const median = (values) => quantile(values, 0.5);
/** Typical-earnings band shown beside any top-earner figure (all in cents). */
export function typicalEarnings(values) {
  return { n: values.length, p25: Math.round(quantile(values, 0.25)), median: Math.round(quantile(values, 0.5)), p75: Math.round(quantile(values, 0.75)), p90: Math.round(quantile(values, 0.9)) };
}

// ── 1. funding: take rate, fee reserve, escrow total, card charge, all-in price ───────────────────
/** Plan take rate for a bounty. First bounty: waived (0). CPA-only and install-only bounties: flat 6%. */
export function takeRate({ plan, type, firstBountyWaived = false }) {
  if (firstBountyWaived) return 0;
  if (type === 'cpa' || type === 'install_only') return C.fees.cpa_only_take_rate;
  return C.plans[plan].take_rate;
}
/** Card processing passed through at cost, shown in the all-in price: round(2.9% x amount) + $0.30. */
export function cardProcessing(amountCents) {
  return amountCents > 0 ? mulRate(amountCents, C.fees.card_processing_rate) + C.fees.card_processing_fixed_cents : 0;
}
/**
 * Escrow funding for a bounty budget B (the creator-pay pool).
 *   fee_reserve  = round(B x take_rate)            held in escrow with the budget; only the used part is ever taken
 *   escrow_total = B + fee_reserve                 the Funded badge needs escrow_funded >= escrow_total
 *   brand_funded = escrow_total - matched          what the brand wallet puts in (matched = flowd match, first bounty)
 *   processing   = card_processing(brand_funded)
 *   card_charge  = brand_funded + processing
 */
export function funding({ budget_cents, take_rate, matched_cents = 0 }) {
  const fee_reserve_cents = mulRate(budget_cents, take_rate);
  const escrow_total_cents = budget_cents + fee_reserve_cents;
  const brand_funded_cents = escrow_total_cents - matched_cents;
  const processing_cents = cardProcessing(brand_funded_cents);
  return {
    budget_cents, take_rate, fee_reserve_cents, escrow_total_cents, matched_cents, brand_funded_cents, processing_cents,
    card_charge_cents: brand_funded_cents + processing_cents,
  };
}
/** First bounty: fee waived and flowd matches dollar for dollar up to $500, on top of what the brand funds. */
export function firstBountyFunding({ brand_funds_cents }) {
  const matched_cents = Math.min(C.fees.matched_first_bounty_cap_cents, brand_funds_cents);
  return funding({ budget_cents: brand_funds_cents + matched_cents, take_rate: 0, matched_cents });
}
/** Bounty-level all-in effective CPM: card_charge x cpm / budget (what the brand pays per 1,000 views when the pool is used). 0 when cpm is 0. */
export function allInCpm({ cpm_cents, budget_cents, card_charge_cents }) {
  return cpm_cents > 0 && budget_cents > 0 ? Math.round((card_charge_cents * cpm_cents) / budget_cents) : 0;
}
/** All-in price of a flat rate or a CPA event: rate x (1 + take_rate) x (1 + 2.9%). The $0.30 fixed fee is excluded (it amortises over the top-up). */
export function allInRate(rate_cents, take_rate) {
  return Math.round((rate_cents * (10000 + bps(take_rate)) * (10000 + bps(C.fees.card_processing_rate))) / 1e8);
}
/** Reserved Slot: one reservation unit = per-video cap + the fee on it. */
export function reservationUnit({ per_video_cap_cents, take_rate }) {
  return per_video_cap_cents + mulRate(per_video_cap_cents, take_rate);
}
/** Spots a pool can still take: floor(remaining / reservation unit). */
export const spotsLeft = ({ remaining_cents, per_video_cap_cents, take_rate }) => Math.floor(remaining_cents / reservationUnit({ per_video_cap_cents, take_rate }));
/** The escrow identity every bounty must satisfy. */
export const escrowIdentity = (b) => b.escrow_funded_cents === b.reserved_cents + b.spent_cents + b.remaining_cents + b.refunded_cents;

// ── 2. settlement of a post: stacked pay with the per-video cap ──────────────────────────────────
/**
 * Pool pay for one post. CPM leg first, then CPA legs, both inside the per-video cap.
 *   cpm_pay = min(round(window_views x cpm / 1000), cap_left)
 *   cpa_pay = min(installs x r_i + trials x r_t + paid x r_p, cap_left - cpm_pay)    (payable = link and code only)
 *   fee     = round(cpm_pay x take_rate) + round(cpa_pay x take_rate)               (per ledger leg)
 *   brand_cost = pay + fee. Ad commission and flat fees sit outside the cap.
 */
export function settlePost({ window_views, cpm_cents, conversions = {}, rates = {}, per_video_cap_cents, take_rate, already_paid_cents = 0 }) {
  const cap_left = Math.max(0, per_video_cap_cents - already_paid_cents);
  const cpm_uncapped = Math.round((window_views * cpm_cents) / 1000);
  const cpa_uncapped = (conversions.install ?? 0) * (rates.install ?? 0) + (conversions.trial ?? 0) * (rates.trial ?? 0) + (conversions.paid ?? 0) * (rates.paid ?? 0);
  const cpm_pay_cents = Math.min(cpm_uncapped, cap_left);
  const cpa_pay_cents = Math.min(cpa_uncapped, cap_left - cpm_pay_cents);
  const pay_cents = cpm_pay_cents + cpa_pay_cents;
  const fee_cpm_cents = mulRate(cpm_pay_cents, take_rate);
  const fee_cpa_cents = mulRate(cpa_pay_cents, take_rate);
  return {
    cpm_uncapped_cents: cpm_uncapped, cpa_uncapped_cents: cpa_uncapped, cpm_pay_cents, cpa_pay_cents, pay_cents,
    capped: cpm_uncapped + cpa_uncapped > cap_left, cap_remaining_cents: cap_left - pay_cents,
    fee_cpm_cents, fee_cpa_cents, fee_cents: fee_cpm_cents + fee_cpa_cents, brand_cost_cents: pay_cents + fee_cpm_cents + fee_cpa_cents,
  };
}

// ── 3. ad commission and winner-promotion fee ────────────────────────────────────────────────────
/** Ad commission: 10% of ad-attributed revenue earned inside the 60 days after the ad first goes live; paid from the brand wallet, outside the cap. */
export function adCommission({ revenue_in_window_cents, rate = C.pay.ad_commission_rate }) {
  return mulRate(revenue_in_window_cents, rate);
}
export const adCommissionWindowEnds = (startedAtIso) => iso(ms(startedAtIso) + C.pay.ad_commission_days * DAY_MS);
/** Winner promotion platform fee: 1% of ad spend. */
export const adPlatformFee = (spend_cents) => mulRate(spend_cents, C.fees.ad_spend_fee_rate);
/** Brand-side ROAS of a promoted ad: attributed revenue / (spend + platform fee + commission). */
export function adRoas({ spend_cents, revenue_cents, commission_cents, platform_fee_cents }) {
  const cost = spend_cents + commission_cents + platform_fee_cents;
  return cost > 0 ? round2(revenue_cents / cost) : 0;
}

// ── 4. instant payout fee ─────────────────────────────────────────────────────────────────────────
/**
 * Instant cash-out: fee = clamp(round(1.5% x amount), $0.50, $15). Free for Platinum and Elite, free once a week for Gold,
 * and free for Founding creators during their first 12 months. Weekly payouts are always free. Minimum amount $5.
 */
export function instantPayout({ amount_cents, tier, founding_free = false, free_instant_used_this_week = 0 }) {
  if (amount_cents < C.fees.instant_min_amount_cents) return { ok: false, reason: 'below_minimum', fee_cents: 0, net_cents: 0, free_instant: false };
  const perks = C.tiers.perks[tier];
  const free = founding_free || perks.instant_cashout_unlimited || free_instant_used_this_week < perks.instant_cashout_free_per_week;
  const raw = clamp(mulRate(amount_cents, C.fees.instant_payout_rate), C.fees.instant_payout_min_cents, C.fees.instant_payout_max_cents);
  const fee_cents = free ? 0 : raw;
  return { ok: true, fee_cents, net_cents: amount_cents - fee_cents, free_instant: free, list_fee_cents: raw };
}

// ── 5. expected earnings (Pay Math): p25 / median / p75 ──────────────────────────────────────────
/**
 * Expected pay per video at the three view quantiles. Views at the median are the creator's own 28-day median (or the category median
 * for a new creator); p25 = 0.40x and p75 = 2.55x. Tracked conversions follow the funnel defaults (views -> visits -> installs -> trials -> paid).
 * Everything is an ESTIMATE and is labelled that way; the cap applies.
 */
export function expectedEarnings({ base_median_views, cpm_cents, rates = {}, per_video_cap_cents, funnel = C.funnel_defaults }) {
  const out = {};
  for (const [name, ratio] of Object.entries(funnel.views_quantile_ratio)) {
    const views = Math.round(base_median_views * ratio);
    const visits = views * funnel.view_to_visit;
    const installs = visits * funnel.visit_to_install;
    const trials = installs * funnel.install_to_trial;
    const paid = trials * funnel.trial_to_paid;
    const cpm_pay = Math.round((views * cpm_cents) / 1000);
    const cpa_pay = Math.round(installs * (rates.install ?? 0) + trials * (rates.trial ?? 0) + paid * (rates.paid ?? 0));
    const gross = cpm_pay + cpa_pay;
    out[name] = {
      views, installs: round2(installs), trials: round2(trials), paid: round2(paid), cpm_pay_cents: cpm_pay, cpa_pay_cents: cpa_pay,
      pay_cents: Math.min(gross, per_video_cap_cents), capped: gross > per_video_cap_cents,
    };
  }
  return out;
}
/** Predicted views for a creator and a Flow Score band: median views x band multiplier. */
export const predictedViews = (median_views, band) => Math.round(median_views * C.scores.band_view_multiplier[band]);
/** Smart Budget planner: what a pool buys. Median stage counts follow the funnel defaults; low / high scale every stage by 0.55 / 1.6. */
export function budgetPlan({ budget_cents, take_rate, cpm_cents, avg_first_payment_cents, matched_cents = 0, funnel = C.funnel_defaults }) {
  const f = funding({ budget_cents, take_rate, matched_cents });
  const views = cpm_cents > 0 ? Math.round((budget_cents / cpm_cents) * 1000) : 0;
  const band = {};
  for (const [name, k] of Object.entries(funnel.conversion_band_ratio)) {
    const installs = views * funnel.view_to_visit * funnel.visit_to_install;
    const trials = installs * funnel.install_to_trial;
    const paid = trials * funnel.trial_to_paid;
    band[name] = {
      installs: Math.round(installs * k), trials: Math.round(trials * k), paid: Math.round(paid * k),
      cost_per_trial_cents: trials * k >= 1 ? Math.round(f.card_charge_cents / (trials * k)) : null,
      revenue_cents: Math.round(paid * k * avg_first_payment_cents),
    };
  }
  return { funding: f, views, band };
}

// ── 6. scores: Hook Score and Flow Score checklist, bands ───────────────────────────────────────
export function bandFor(points) {
  const b = C.scores.bands;
  return points >= b.A ? 'A' : points >= b.B ? 'B' : points >= b.C ? 'C' : points >= b.D ? 'D' : 'E';
}
const sec = (ms_) => (ms_ == null ? 'never' : `${(ms_ / 1000).toFixed(1)}s`);
const grade = (full, half, max) => (full ? max : half ? Math.round(max / 2) : 0);
function item(list, id, points, reason, fix) {
  const def = list.find((i) => i.id === id);
  const out = { id, label: def.label, points, max: def.weight, passed: points === def.weight, reason };
  if (fix && points < def.weight) out.fix = fix;
  return out;
}
/**
 * Hook Score (first 3 seconds), 0..100, checklist weights 20/15/15/15/10/10/10/5. All times in ms from the start of the video;
 * null = never happens. obs: { lands_ms, onscreen_ms, spoken_matches_onscreen, face_ms, faceless, app_ms, interrupt_ms,
 * hook_type_known, hook_type_above_median, speech_ms, captions_in_safe_zone }.
 */
export function scoreHook(obs) {
  const L = C.scores.hook_checklist;
  const lands = obs.lands_ms;
  const items = [
    item(L, 'hook_lands_2s', grade(lands != null && lands <= 2000, lands != null && lands <= 3000, 20), lands == null ? 'The hook never lands.' : `Hook lands at ${sec(lands)}.`, 'Open on the hook line; trim the intro.'),
    item(L, 'onscreen_text_matches', grade(obs.onscreen_ms != null && obs.onscreen_ms <= 1000 && obs.spoken_matches_onscreen, obs.onscreen_ms != null && obs.onscreen_ms <= 2000, 15),
      obs.onscreen_ms == null ? 'No on-screen hook text.' : `Hook text appears at ${sec(obs.onscreen_ms)}${obs.spoken_matches_onscreen ? '' : ' and differs from what you say'}.`, 'Burn the spoken hook in as text in the first second.'),
    item(L, 'face_early', obs.faceless ? 15 : grade(obs.face_ms != null && obs.face_ms <= 1000, obs.face_ms != null && obs.face_ms <= 2000, 15),
      obs.faceless ? 'Faceless format: no face needed.' : obs.face_ms == null ? 'No face on screen.' : obs.face_ms <= 1000 ? `Face on screen at ${sec(obs.face_ms)}.` : `No face until ${sec(obs.face_ms)}.`, 'Start on your face, then cut to the app.'),
    item(L, 'app_visible_3s', grade(obs.app_ms != null && obs.app_ms <= 3000, obs.app_ms != null && obs.app_ms <= 5000, 15), obs.app_ms == null ? 'The app never appears.' : `App visible at ${sec(obs.app_ms)}.`, 'Move the app reveal into the first 3 seconds.'),
    item(L, 'pattern_interrupt', obs.interrupt_ms != null && obs.interrupt_ms <= 1500 ? 10 : 0, obs.interrupt_ms == null ? 'No cut or motion in the first 1.5s.' : `Pattern interrupt at ${sec(obs.interrupt_ms)}.`, 'Add a cut or a zoom in the first 1.5 seconds.'),
    item(L, 'proven_hook_type', grade(obs.hook_type_known && obs.hook_type_above_median, obs.hook_type_known, 10), obs.hook_type_known ? 'Library hook type.' : 'Not a library hook type.', 'Try a confession, curiosity-gap or specific-number opening.'),
    item(L, 'speech_starts_fast', grade(obs.speech_ms != null && obs.speech_ms <= 1000, obs.speech_ms != null && obs.speech_ms <= 2000, 10), obs.speech_ms == null ? 'No speech found.' : `Speech starts at ${sec(obs.speech_ms)}.`, 'Cut the dead air before your first word.'),
    item(L, 'captions_safe_zone', obs.captions_in_safe_zone ? 5 : 0, obs.captions_in_safe_zone ? 'Captions inside the safe zones.' : 'Captions outside the safe zones.', 'Move captions above the platform UI.'),
  ];
  const points = items.reduce((s, i) => s + i.points, 0);
  return { band: bandFor(points), points, items, label: C.scores.checklist_label };
}
/**
 * Flow Score (overall predicted performance band), 0..100, weights 30/25/10/10/5/5/5/5/5.
 * obs: { hook_points, beats_found, beats_required, app_ms, disclosure_audio, disclosure_onscreen, duration_s, captions_in_safe_zone,
 * single_cta, ends_on_win_state, audio_gaps (dead-air gaps over 1s), format_order ('in_order' | 'one_off' | 'out_of_order') }.
 */
export function scoreFlow(obs) {
  const L = C.scores.flow_checklist;
  const beats = obs.beats_required > 0 ? Math.round((25 * obs.beats_found) / obs.beats_required) : 25;
  const disc = (obs.disclosure_audio ? 5 : 0) + (obs.disclosure_onscreen ? 5 : 0);
  const d = obs.duration_s;
  const items = [
    item(L, 'hook_score', Math.round(obs.hook_points * 0.3), `Hook Score ${obs.hook_points} scaled to 30.`, 'Fix the Hook Score items first.'),
    item(L, 'required_beats', beats, `${obs.beats_found} of ${obs.beats_required} required beats found.`, 'Add the missing beat from the shot checklist.'),
    item(L, 'app_visible_early', grade(obs.app_ms != null && obs.app_ms <= 3000, obs.app_ms != null && obs.app_ms <= 8000, 10), obs.app_ms == null ? 'The app never appears.' : `App on screen at ${sec(obs.app_ms)}.`, 'Show the app by 3 seconds.'),
    item(L, 'disclosure', disc, disc === 10 ? '#ad spoken and on screen.' : disc === 5 ? '#ad is only ' + (obs.disclosure_audio ? 'spoken' : 'on screen') + '.' : 'No #ad.', 'Say and show #ad.'),
    item(L, 'length_ok', grade(d >= 15 && d <= 30, (d >= 10 && d < 15) || (d > 30 && d <= 45), 5), `Length ${d.toFixed(0)}s.`, 'Aim for 15 to 30 seconds.'),
    item(L, 'captions_safe_zone', obs.captions_in_safe_zone ? 5 : 0, obs.captions_in_safe_zone ? 'Captions inside the safe zones.' : 'Captions outside the safe zones.', 'Move captions above the platform UI.'),
    item(L, 'single_cta_win_state', grade(obs.single_cta && obs.ends_on_win_state, obs.single_cta || obs.ends_on_win_state, 5), obs.single_cta ? (obs.ends_on_win_state ? 'One CTA, ends on a win.' : 'One CTA but no win state at the end.') : 'More than one CTA.', 'End on the win, then one CTA.'),
    item(L, 'audio_clear', grade(obs.audio_gaps === 0, obs.audio_gaps === 1, 5), obs.audio_gaps === 0 ? 'Clear audio.' : `${obs.audio_gaps} dead-air gap(s) over 1s.`, 'Cut the silences.'),
    item(L, 'format_fit', grade(obs.format_order === 'in_order', obs.format_order === 'one_off', 5), obs.format_order === 'in_order' ? 'Follows the format.' : 'Beats are out of order for the format.', 'Re-order to the format\'s beats.'),
  ];
  const points = items.reduce((s, i) => s + i.points, 0);
  return { band: bandFor(points), points, items, label: C.scores.checklist_label };
}

// ── 7. fraud score composition ────────────────────────────────────────────────────────────────────
export function fraudBand(score) {
  const b = C.fraud.bands;
  return score <= b.clean[1] ? 'clean' : score <= b.watch[1] ? 'watch' : score <= b.review[1] ? 'review' : 'high';
}
/** fraud score = min(100, sum over signals of round(max_points x severity)). signals: [{ signal, severity 0..1, detail }]. */
export function fraudScore(signals) {
  const hits = signals.map((s) => ({
    signal: s.signal, severity: s.severity, points: Math.round(C.fraud.signals[s.signal].max_points * s.severity), detail: s.detail ?? C.fraud.signals[s.signal].rule,
  })).filter((h) => h.points > 0);
  const score = Math.min(100, hits.reduce((n, h) => n + h.points, 0));
  return { score, band: fraudBand(score), signals: hits };
}
/** What a fraud band does to money. */
export const fraudAction = (score) => (score >= C.fraud.hold_threshold ? 'auto_hold_and_queue' : score >= C.fraud.review_threshold ? 'hold_for_human_review' : 'auto_clear');

// ── 8. tiers ──────────────────────────────────────────────────────────────────────────────────────
/** stats: { lifetime_cleared_cents, approved_count, approval_rate, reliability_score, elite_reviewed }. */
export function meetsTier(tier, s) {
  const t = C.tiers.thresholds[tier];
  return s.lifetime_cleared_cents >= t.lifetime_cleared_cents && s.approved_count >= t.approved_count && s.approval_rate >= t.approval_rate_min
    && s.reliability_score >= t.reliability_min && (!t.manual_review || s.elite_reviewed === true);
}
/** Highest tier whose thresholds are all met. */
export function tierFor(s) {
  let best = 'bronze';
  for (const tier of C.tiers.order) if (meetsTier(tier, s)) best = tier;
  return best;
}
export const nextTier = (tier) => C.tiers.order[C.tiers.order.indexOf(tier) + 1] ?? null;
/** approval_rate = approved / decided (finished work only: approved + rejected), rounded to 2 decimals. */
export const approvalRate = (approved, decided) => (decided > 0 ? Math.round((approved / decided) * 100) / 100 : 0);
/**
 * Progress to the next tier: every criterion with have / need; progress = the bottleneck, min(1, have/need) over the numeric criteria.
 * Tier is never dropped for 30 days after a dip (grace hold): see tierWithGrace.
 */
export function tierProgress(s, current = tierFor(s)) {
  const next = nextTier(current);
  if (!next) return { current, criteria: [], progress: 1 };
  const t = C.tiers.thresholds[next];
  const criteria = [
    { key: 'lifetime_cleared', label: 'Lifetime cleared', have: s.lifetime_cleared_cents, need: t.lifetime_cleared_cents, met: s.lifetime_cleared_cents >= t.lifetime_cleared_cents },
    { key: 'approved', label: 'Approved posts', have: s.approved_count, need: t.approved_count, met: s.approved_count >= t.approved_count },
    { key: 'approval_rate', label: 'Approval rate', have: s.approval_rate, need: t.approval_rate_min, met: s.approval_rate >= t.approval_rate_min },
  ];
  if (t.reliability_min > 0) criteria.push({ key: 'reliability', label: 'Reliability', have: s.reliability_score, need: t.reliability_min, met: s.reliability_score >= t.reliability_min });
  if (t.manual_review) criteria.push({ key: 'review', label: 'Manual review', have: s.elite_reviewed ? 1 : 0, need: 1, met: s.elite_reviewed === true });
  const numeric = criteria.filter((c) => c.key !== 'review');
  const progress = round2(Math.min(...numeric.map((c) => clamp(c.have / c.need, 0, 1))));
  return { current, next, criteria, progress };
}
/** Grace: a creator whose computed tier is below their held tier keeps it until tier_hold_until (dip start + 30 days). */
export function tierWithGrace({ held_tier, computed_tier, dip_started_at, now }) {
  const order = C.tiers.order;
  if (order.indexOf(computed_tier) >= order.indexOf(held_tier)) return { tier: computed_tier, tier_basis: 'earned' };
  const hold_until = addHours(dip_started_at, C.tiers.demotion_grace_days * 24);
  return ms(now) < ms(hold_until) ? { tier: held_tier, tier_basis: 'grace_hold', tier_hold_until: hold_until } : { tier: computed_tier, tier_basis: 'earned' };
}

// ── 9. reliability: creator and brand ────────────────────────────────────────────────────────────
/**
 * Creator reliability 0..100 from finished work only (never penalises multi-brand work or pending samples).
 * inputs: { decisions: [{ approved: bool, decided_at }], now, on_time: { ok, total }, post_through: { posted, approved }, compliance: { passed, total },
 * fraud_confirmed_90d, clawbacks_90d, disputes_lost_90d, academy_lessons }. Recency half-life 45 days. Fewer than 5 finished = provisional (70).
 */
export function creatorReliability(inp) {
  const R = C.reliability.creator;
  const w = (d) => Math.pow(0.5, (ms(inp.now) - ms(d.decided_at)) / DAY_MS / R.recency_half_life_days);
  const sumW = inp.decisions.reduce((s, d) => s + w(d), 0);
  const approvedW = inp.decisions.filter((d) => d.approved).reduce((s, d) => s + w(d), 0);
  const finished_n = inp.decisions.length;
  const ratio = (ok, total) => (total > 0 ? ok / total : 1);
  const v = {
    finished_approval: sumW > 0 ? approvedW / sumW : 0,
    on_time: ratio(inp.on_time.ok, inp.on_time.total),
    post_through: ratio(inp.post_through.posted, inp.post_through.approved),
    compliance: ratio(inp.compliance.passed, inp.compliance.total),
    clean_record: clamp(1 - 0.4 * inp.fraud_confirmed_90d - 0.3 * inp.clawbacks_90d - 0.15 * inp.disputes_lost_90d, 0, 1),
  };
  const labels = { finished_approval: 'Finished-work approval (recency-weighted)', on_time: 'Revisions and deadlines on time', post_through: 'Approved videos posted within 7 days', compliance: 'Disclosure right first time', clean_record: 'Clean record (90 days)' };
  const components = Object.entries(R.weights).map(([key, weight]) => ({
    key, label: labels[key], value: round2(v[key]), weight, points: round2(100 * weight * v[key]),
    reason: key === 'finished_approval' ? `${Math.round(v[key] * 100)}% of ${finished_n} finished posts approved, recent ones count more.`
      : key === 'on_time' ? `${inp.on_time.ok} of ${inp.on_time.total} on time.`
        : key === 'post_through' ? `${inp.post_through.posted} of ${inp.post_through.approved} approved videos posted within ${R.post_through_days} days.`
          : key === 'compliance' ? `${inp.compliance.passed} of ${inp.compliance.total} posts passed the disclosure check first time.`
            : `${inp.fraud_confirmed_90d} confirmed fraud, ${inp.clawbacks_90d} clawbacks, ${inp.disputes_lost_90d} lost disputes.`,
  }));
  const base = components.reduce((s, c) => s + 100 * c.weight * v[c.key], 0);
  const academy_bonus_points = Math.min(R.academy_bonus_cap, R.academy_bonus_per_lesson * inp.academy_lessons);
  const provisional = finished_n < R.min_finished_for_score;
  const score = provisional ? R.provisional_score : Math.min(100, Math.round(base + academy_bonus_points));
  return {
    score, provisional, finished_n, components, academy_bonus_points,
    approval_rate_finished: round2(v.finished_approval), approval_rate_raw: round2(inp.decisions.filter((d) => d.approved).length / Math.max(1, finished_n)),
  };
}
/**
 * Brand reliability 0..100 (Brand Scorecard). inputs: { decisions_n, approved_n, decision_hours_median, appeals_overturned,
 * pays_on_time_ratio, run_rate, reply_hours_median }. decisions = approve + reject (request-changes excluded). Fewer than 10 = "new".
 */
export function brandReliability(inp) {
  const B = C.reliability.brand;
  const rejected_n = inp.decisions_n - inp.approved_n;
  const rejection_rate = inp.decisions_n > 0 ? rejected_n / inp.decisions_n : 0;
  const decision_speed = clamp((B.decision_worst_hours - inp.decision_hours_median) / (B.decision_worst_hours - B.decision_best_hours), 0, 1);
  const base = clamp(1 - (rejection_rate - B.rejection_rate_free_pass) / (B.rejection_rate_zero_at - B.rejection_rate_free_pass), 0, 1);
  const overturn_share = inp.appeals_overturned / Math.max(1, rejected_n);
  const approval_fairness = clamp(base - 0.5 * overturn_share, 0, 1);
  const reply_speed = clamp((B.reply_worst_hours - inp.reply_hours_median) / (B.reply_worst_hours - B.reply_best_hours), 0, 1);
  const v = { decision_speed, approval_fairness, pays_on_time: inp.pays_on_time_ratio, run_rate: inp.run_rate, reply_speed };
  const labels = { decision_speed: 'Decision speed', approval_fairness: 'Approval fairness', pays_on_time: 'Pays on time', run_rate: 'Runs what it approves', reply_speed: 'Reply speed' };
  const reasons = {
    decision_speed: `Median ${inp.decision_hours_median.toFixed(1)} h to decide (best ${B.decision_best_hours} h, worst ${B.decision_worst_hours} h).`,
    approval_fairness: `${Math.round(rejection_rate * 100)}% of decisions were rejections; ${inp.appeals_overturned} overturned on appeal.`,
    pays_on_time: `${Math.round(inp.pays_on_time_ratio * 100)}% of commissions, offers and top-ups funded on time.`,
    run_rate: `${Math.round(inp.run_rate * 100)}% of approved work was posted or used within 30 days.`,
    reply_speed: `Median ${inp.reply_hours_median.toFixed(1)} h to reply.`,
  };
  const components = Object.entries(B.weights).map(([key, weight]) => ({ key, label: labels[key], value: round2(v[key]), weight, points: round2(100 * weight * v[key]), reason: reasons[key] }));
  const score = Math.round(components.reduce((s, c) => s + 100 * c.weight * v[c.key], 0));
  const band = inp.decisions_n < B.min_decisions_for_score ? 'new' : score >= B.bands.excellent ? 'excellent' : score >= B.bands.good ? 'good' : score >= B.bands.fair ? 'fair' : 'poor';
  return { score, band, components, rejection_rate: round2(rejection_rate) };
}
export function brandBadges({ decision_hours_median, funded_always, pays_on_time_ratio, appeals_n, appeals_overturned, run_rate, decisions_n }) {
  const out = [];
  if (decisions_n >= C.reliability.brand.min_decisions_for_score) {
    if (decision_hours_median < 24) out.push('fast_decisions');
    if (appeals_n === 0 || appeals_overturned / appeals_n <= 0.1) out.push('fair_reviews');
    if (run_rate > 0.9) out.push('runs_what_it_approves');
  }
  if (funded_always) out.push('funded_always');
  if (pays_on_time_ratio >= 0.98) out.push('pays_on_time');
  return out;
}

// ── 10. Money Clock: when things clear and pay ───────────────────────────────────────────────────
/** First daily clearing run (14:00:00Z) at or after `isoStr`. */
export function firstRunAtOrAfter(isoStr, hourUtc = C.windows.clearing_run_hour_utc) {
  const base = ms(dayStart(isoStr)) + hourUtc * HOUR_MS;
  return iso(base >= ms(isoStr) ? base : base + DAY_MS);
}
/** Clearing run for a post: the first daily run at or after window_end + 2 h buffer (if the fraud check passes). */
export const postClearingRun = (windowEndsAt) => firstRunAtOrAfter(addHours(windowEndsAt, C.windows.clearing_buffer_hours));
/** Clearing run for a conversion: occurred + 24 h (install) / 72 h (trial) / 168 h (paid), then the next run. */
export const conversionClearingRun = (kind, occurredAt) => firstRunAtOrAfter(addHours(occurredAt, C.windows.cpa_clear_hours[kind]));
/** Weekly payout run (Friday 18:00Z) that pays an item cleared at `clearedAt` (first Friday run at or after it). */
export function weeklyPayoutFor(clearedAt) {
  return nextWeeklyAt(iso(ms(clearedAt) - 1000), C.windows.weekly_payout_weekday_utc, C.windows.weekly_payout_hour_utc);
}
/** Money Clock state of a post's CPM earnings at `now`. */
export function moneyClockState({ posted_at, now, held = false }) {
  const window_ends_at = addHours(posted_at, C.windows.view_window_hours);
  if (ms(now) < ms(window_ends_at)) return { state: 'accruing', reason: 'window_open', eta_at: postClearingRun(window_ends_at), window_ends_at };
  const run = postClearingRun(window_ends_at);
  if (held) return { state: 'held', reason: 'held_fraud_review', window_ends_at };
  if (ms(run) <= ms(now)) return { state: 'cleared', reason: 'awaiting_weekly_payout', eta_at: weeklyPayoutFor(run), cleared_at: run, window_ends_at };
  const fraud_deadline = addHours(window_ends_at, C.windows.fraud_check_max_hours);
  return { state: 'pending', reason: ms(now) < ms(fraud_deadline) ? 'fraud_check' : 'awaiting_clearing_run', eta_at: run, window_ends_at };
}

// ── 11. review SLA ────────────────────────────────────────────────────────────────────────────────
/** Position in the 72 h review SLA by hours since the current version entered review. */
export function slaState(hours_in_queue, decided = false) {
  if (decided) return hours_in_queue <= C.review.sla_hours ? 'met' : 'breached';
  return hours_in_queue < C.review.stale_after_hours ? 'on_track' : hours_in_queue <= C.review.sla_hours ? 'stale' : 'breached';
}
export const slaDueAt = (submittedAtIso, sla_hours = C.review.sla_hours) => addHours(submittedAtIso, sla_hours);

// ── 12. pricing: price vs fill time, market suggestion ──────────────────────────────────────────
/**
 * Day-one pricing heuristic. clearing = the category's clearing CPM; H = the category's median fill hours at that price.
 *   p50 = max(6, H x (clearing / cpm)^1.6)     p80 = p50 x 1.8
 *   confidence = sample_n / (sample_n + 20), damped by distance from the clearing price: x (1 - min(0.5, |ln(cpm / clearing)|))
 */
export function fillTime({ cpm_cents, clearing_cpm_cents, median_fill_hours, sample_n }) {
  const P = C.pricing_model;
  const p50 = Math.max(P.min_fill_hours, median_fill_hours * Math.pow(clearing_cpm_cents / cpm_cents, P.fill_exponent));
  const distance = Math.min(0.5, Math.abs(Math.log(cpm_cents / clearing_cpm_cents)));
  const confidence = round2((sample_n / (sample_n + P.confidence_k)) * (1 - distance));
  return { fill_hours_p50: round2(p50), fill_hours_p80: round2(p50 * P.p80_multiplier), confidence, thin_market: sample_n < P.thin_market_min_sample };
}
/** The price-vs-fill curve: six CPM points at 0.6x .. 2.0x of the clearing CPM. */
export function priceCurve({ clearing_cpm_cents, median_fill_hours, sample_n }) {
  return C.pricing_model.curve_cpm_multipliers.map((m) => {
    const cpm_cents = Math.round(clearing_cpm_cents * m);
    const f = fillTime({ cpm_cents, clearing_cpm_cents, median_fill_hours, sample_n });
    return { cpm_cents, fill_hours_p50: f.fill_hours_p50, fill_hours_p80: f.fill_hours_p80, confidence: f.confidence, sample_n };
  });
}

// ── 13. match score for the creator's bounty feed ────────────────────────────────────────────────
/**
 * Match score 0..100 = niche 40 + platform 15 + region 15 + price 15 + brand reliability 10 + recency 5.
 * Gates (applied first, result null when any fails): eligible tier, country, linked account on a bounty platform, funded, not already submitted.
 * inputs: { gates: { ... booleans }, niche_overlap 0..1, platform_fit 0..1, region_fit 0..1, price_ratio, brand_reliability 0..100, bounty_age_days }.
 */
export function matchScore(inp) {
  const M = C.matching;
  if (!Object.values(inp.gates).every(Boolean)) return null;
  const f = {
    niche: inp.niche_overlap, platform: inp.platform_fit, region: inp.region_fit,
    price: clamp(inp.price_ratio, 0, M.price_ratio_cap) / M.price_ratio_cap,
    brand_reliability: clamp(inp.brand_reliability / 100, 0, 1),
    recency: Math.pow(0.5, inp.bounty_age_days / M.recency_half_life_days),
  };
  return Math.round(Object.entries(M.weights).reduce((s, [k, w]) => s + w * f[k], 0));
}

// ── 14. funnel and payback (brand analytics) ─────────────────────────────────────────────────────
/**
 * Brand cost = creator pay + platform fee (+ ad commission and ad spend for promoted posts). Stage costs divide cost by TRACKED counts (link + code).
 * Estimated counts (MMP, survey, modelled) are shown separately and never mixed in. ROAS Dn = revenue within n days of the post / cost.
 * payback_day = the first day on which cumulative tracked revenue >= cumulative cost (null if not yet).
 */
export function funnelStats({ cost_cents, views, clicks, installs, trials, paid, revenue_by_day_cents }) {
  const per = (n) => (n > 0 ? Math.round(cost_cents / n) : null);
  const cum = [];
  let run = 0;
  for (const r of revenue_by_day_cents) { run += r; cum.push(run); }
  const roas = (d) => (cost_cents > 0 ? round2((cum[Math.min(d, cum.length) - 1] ?? 0) / cost_cents) : 0);
  const idx = cum.findIndex((x) => x >= cost_cents);
  return {
    cpm_effective_cents: views > 0 ? Math.round((cost_cents / views) * 1000) : null,
    cost_per_click_cents: per(clicks), cost_per_install_cents: per(installs), cost_per_trial_cents: per(trials), cost_per_paid_cents: per(paid),
    view_to_click: views > 0 ? round2(clicks / views) : 0, trial_to_paid: trials > 0 ? round2(paid / trials) : 0,
    roas_d7: roas(7), roas_d30: roas(30), roas_d90: roas(90), payback_day: idx === -1 ? null : idx + 1,
  };
}

// ── FORMULA_DOCS: rules + worked examples printed into DOMAIN.md ───────────────────────────────
const row = (label, expr, value) => ({ label, expr, value });

export const FORMULA_DOCS = [
  {
    id: 'funding', title: 'Escrow total, fee reserve, matched budget and card charge',
    rules: [
      'take_rate = plan rate (Free 12%, Pro 10%, Scale 8%); 6% for CPA-only and install-only bounties; 0% on the first bounty (fee waived).',
      'fee_reserve = round(budget x take_rate). It is held in escrow with the budget; the fee actually taken is take_rate x creator pay settled, and the unused reserve is refunded at settlement.',
      'escrow_total = budget + fee_reserve. The Funded badge (and going live) needs escrow_funded >= escrow_total.',
      'First bounty: matched = min($500, brand funds) is added to the pool on top of what the brand funds; fee waived. Brand funded = escrow_total - matched.',
      'processing = round(2.9% x brand funded) + $0.30, passed through at cost and shown in the all-in price; card_charge = brand funded + processing.',
      'all_in_cpm = round(card_charge x cpm / budget): what the brand pays per 1,000 verified views when the pool is fully used.',
    ],
    examples: () => {
      const f = funding({ budget_cents: 500_000, take_rate: 0.12 });
      const a = allInCpm({ cpm_cents: 200, budget_cents: 500_000, card_charge_cents: f.card_charge_cents });
      const m = firstBountyFunding({ brand_funds_cents: 150_000 });
      const aM = allInCpm({ cpm_cents: 200, budget_cents: m.budget_cents, card_charge_cents: m.card_charge_cents });
      return [
        { title: 'Free plan, $5,000 pool at $2.00 CPM', rows: [
          row('budget', 'B', usd(f.budget_cents)), row('take_rate', 'Free plan', '12%'), row('fee_reserve', 'round(500000 x 0.12)', usd(f.fee_reserve_cents)),
          row('escrow_total', 'B + fee_reserve', usd(f.escrow_total_cents)), row('processing', 'round(560000 x 0.029) + 30', usd(f.processing_cents)),
          row('card_charge', 'escrow_total + processing', usd(f.card_charge_cents)), row('all_in_cpm', 'round(576270 x 200 / 500000)', usd(a)),
        ] },
        { title: 'First bounty on Pro: brand funds $1,500, flowd matches $500', rows: [
          row('matched', 'min($500, $1,500)', usd(m.matched_cents)), row('budget', '$1,500 + $500', usd(m.budget_cents)), row('fee_reserve', 'fee waived', usd(m.fee_reserve_cents)),
          row('escrow_total', 'budget', usd(m.escrow_total_cents)), row('brand_funded', 'escrow_total - matched', usd(m.brand_funded_cents)),
          row('processing', 'round(150000 x 0.029) + 30', usd(m.processing_cents)), row('card_charge', 'brand_funded + processing', usd(m.card_charge_cents)),
          row('all_in_cpm', 'round(154380 x 200 / 200000)', usd(aM)),
        ] },
      ];
    },
  },
  {
    id: 'reservation', title: 'Reserved Slot',
    rules: [
      'reservation_unit = per_video_cap + round(per_video_cap x take_rate). A submission reserves one unit on submit and releases it on rejection, withdrawal or expiry; on settlement the reservation is replaced by the actual pay + fee and the difference returns to remaining.',
      'spots_left = floor(remaining / reservation_unit). The bounty becomes filled when spots_left is 0 and live again when a unit is released.',
      'Identity: escrow_funded = reserved + spent + remaining + refunded (all >= 0). Approved posts are paid even if remaining is later 0.',
    ],
    examples: () => {
      const unit = reservationUnit({ per_video_cap_cents: 25_000, take_rate: 0.10 });
      const f = funding({ budget_cents: 300_000, take_rate: 0.10 });
      const left = spotsLeft({ remaining_cents: f.escrow_total_cents - 4 * unit - 61_000, per_video_cap_cents: 25_000, take_rate: 0.10 });
      return [{ title: 'Pro, $3,000 pool, $250 cap', rows: [
        row('reservation_unit', '25000 + round(25000 x 0.10)', usd(unit)), row('escrow_total', '300000 + 30000', usd(f.escrow_total_cents)),
        row('with 4 open submissions and $610 spent', 'remaining = 330000 - 4 x 27500 - 61000', usd(f.escrow_total_cents - 4 * unit - 61_000)),
        row('spots_left', 'floor(159000 / 27500)', String(left)),
      ] }];
    },
  },
  {
    id: 'settle', title: 'Stacked pay settlement of a post',
    rules: [
      'CPM leg: cpm_pay = round(window_views x cpm / 1000), where window_views are the verified views at the end of the 72-hour window.',
      'CPA legs (cleared conversions through a link or code only): installs x install rate + trials x trial rate + paid x paid rate, inside 30 days of posting.',
      'The per-video cap limits pool pay (CPM + CPA together). CPM is applied first, then CPA until the cap is reached. Anything above the cap is unpaid and the post is marked capped.',
      'Fee per ledger leg = round(leg pay x take_rate). Brand cost = pay + fees. Ad commission and flat fees sit outside the cap.',
    ],
    examples: () => {
      const a = settlePost({ window_views: 48_200, cpm_cents: 200, conversions: { install: 14, trial: 6, paid: 2 }, rates: { install: 40, trial: 150, paid: 400 }, per_video_cap_cents: 25_000, take_rate: 0.10 });
      const b = settlePost({ window_views: 150_000, cpm_cents: 200, conversions: { install: 40, trial: 10, paid: 3 }, rates: { install: 40, trial: 150, paid: 400 }, per_video_cap_cents: 25_000, take_rate: 0.10 });
      return [
        { title: 'Typical stacked post: 48,200 views, 14 installs, 6 trials, 2 paid (Pro, $2.00 CPM, $250 cap)', rows: [
          row('cpm_pay', 'round(48200 x 200 / 1000)', usd(a.cpm_pay_cents)), row('cpa_pay', '14 x 40 + 6 x 150 + 2 x 400', usd(a.cpa_pay_cents)), row('pay', 'cpm_pay + cpa_pay (under the cap)', usd(a.pay_cents)),
          row('fee', 'round(9640 x 0.10) + round(2260 x 0.10)', usd(a.fee_cents)), row('brand_cost', 'pay + fee', usd(a.brand_cost_cents)),
        ] },
        { title: 'A viral post hits the cap: 150,000 views, 40 installs, 10 trials, 3 paid', rows: [
          row('cpm_uncapped', 'round(150000 x 200 / 1000)', usd(b.cpm_uncapped_cents)), row('cpm_pay', 'min(30000, 25000)', usd(b.cpm_pay_cents)),
          row('cpa_pay', 'min(2800 + 1500 + 1200 = 5500, 25000 - 25000)', usd(b.cpa_pay_cents)), row('pay', 'cap reached', usd(b.pay_cents)), row('capped', 'true', String(b.capped)),
          row('fee', 'round(25000 x 0.10)', usd(b.fee_cents)), row('brand_cost', 'pay + fee', usd(b.brand_cost_cents)),
        ] },
      ];
    },
  },
  {
    id: 'ad', title: 'Ad commission and winner-promotion fee',
    rules: [
      'commission = round(10% x ad-attributed revenue inside the 60 days after the ad first goes live). Paid by the brand wallet to the creator (ledger type commission), outside the per-video cap.',
      'platform fee = round(1% x ad spend). The creator is never charged.',
      'Ads stop automatically when the Spark code or the rights term ends.',
    ],
    examples: () => {
      const rev = 31 * 3499;
      const com = adCommission({ revenue_in_window_cents: rev });
      const fee = adPlatformFee(120_000);
      return [{ title: '14 days live: $1,200 spend, 31 paid conversions at $34.99 first payment', rows: [
        row('revenue_in_window', '31 x 3499', usd(rev)), row('commission', 'round(108469 x 0.10)', usd(com)), row('platform_fee', 'round(120000 x 0.01)', usd(fee)),
        row('brand cost of the ad', 'spend + fee + commission', usd(120_000 + fee + com)), row('ad ROAS', 'revenue / cost', String(adRoas({ spend_cents: 120_000, revenue_cents: rev, commission_cents: com, platform_fee_cents: fee }))),
      ] }];
    },
  },
  {
    id: 'instant', title: 'Instant payout fee',
    rules: [
      'fee = clamp(round(1.5% x amount), $0.50, $15.00). Minimum cash-out $5.00. The fee and the net are shown before confirm.',
      'Free: Platinum and Elite (unlimited), Gold once per ISO week, Founding creators for 12 months. Weekly payouts (Fridays 18:00 UTC) are always free.',
    ],
    examples: () => {
      const cases = [
        ['$160.00 cleared, Silver', instantPayout({ amount_cents: 16_000, tier: 'silver' })],
        ['$20.00, Silver (fee floor)', instantPayout({ amount_cents: 2_000, tier: 'silver' })],
        ['$2,000.00, Silver (fee cap)', instantPayout({ amount_cents: 200_000, tier: 'silver' })],
        ['$160.00, Gold, first this week', instantPayout({ amount_cents: 16_000, tier: 'gold', free_instant_used_this_week: 0 })],
        ['$160.00, Gold, second this week', instantPayout({ amount_cents: 16_000, tier: 'gold', free_instant_used_this_week: 1 })],
      ];
      return [{ title: 'Instant cash-out', rows: cases.map(([label, r]) => row(label, `fee ${usd(r.list_fee_cents)} list`, `fee ${usd(r.fee_cents)}, net ${usd(r.net_cents)}${r.free_instant ? ' (free)' : ''}`)) }];
    },
  },
  {
    id: 'expected', title: 'Expected earnings: p25 / median / p75 (Pay Math)',
    rules: [
      'Views: median = the creator\'s 28-day median views (category median for a new creator); p25 = 0.40 x median; p75 = 2.55 x median (CONSTANTS.funnel_defaults).',
      'Tracked funnel per view: 0.45% visits, 38% of visits install, 6.2% of installs start a trial, 34.8% of trials pay.',
      'pay = min(cap, round(views x cpm / 1000) + round(installs x r_i + trials x r_t + paid x r_p)). Always labelled "estimate"; the typical (median) is shown beside any top-earner example.',
      'Predicted views for a take = median views x band multiplier (A 1.6, B 1.15, C 0.85, D 0.5, E 0.3).',
    ],
    examples: () => {
      const e = expectedEarnings({ base_median_views: 14_200, cpm_cents: 210, rates: { install: 40, trial: 150, paid: 400 }, per_video_cap_cents: 25_000 });
      return [{ title: 'Stacked bounty $2.10 CPM + $0.40 / $1.50 / $4.00, creator median 14,200 views, $250 cap', rows: ['p25', 'median', 'p75'].map((k) => row(k, `${e[k].views.toLocaleString('en-US')} views, ${e[k].installs} installs, ${e[k].trials} trials`, `${usd(e[k].pay_cents)} (CPM ${usd(e[k].cpm_pay_cents)} + CPA ${usd(e[k].cpa_pay_cents)})`)).concat([row('predicted views, band B', 'round(14200 x 1.15)', predictedViews(14_200, 'B').toLocaleString('en-US'))]) }];
    },
  },
  {
    id: 'tier', title: 'Tier, progress and grace',
    rules: [
      'A creator holds the highest tier whose thresholds are ALL met: lifetime cleared, approved posts, approval rate (approved / finished), reliability (Platinum+), manual review (Elite).',
      'lifetime cleared = carry-over (verified prior history, founding creators) + cleared and paid earnings in the ledger. Approval rate counts finished work only: approved / (approved + rejected); withdrawn and expired are excluded.',
      'progress to the next tier = the bottleneck: the lowest min(1, have / need) over the numeric criteria.',
      'No tier drop for 30 days after a dip: tier_basis becomes grace_hold and tier_hold_until = dip start + 30 days. Recovery inside the window clears the hold.',
    ],
    examples: () => {
      const s = { lifetime_cleared_cents: 164_000, approved_count: 21, approval_rate: approvalRate(21, 27), reliability_score: 93, elite_reviewed: false };
      const p = tierProgress(s);
      return [{ title: '@maya.makes: $1,640 cleared, 21 approved of 27 finished, reliability 93', rows: [
        row('tier', 'highest tier fully met', tierFor(s)), row('approval_rate', 'round(21 / 27, 2)', String(s.approval_rate)),
        ...p.criteria.map((c) => row(`${p.next}: ${c.label}`, `${c.key === 'lifetime_cleared' ? usd(c.have) : c.have} / ${c.key === 'lifetime_cleared' ? usd(c.need) : c.need}`, c.met ? 'met' : `${Math.round(clamp(c.have / c.need, 0, 1) * 100)}%`)),
        row('progress to gold', 'bottleneck = min(0.82, 0.84, 1)', String(p.progress)),
      ] }];
    },
  },
  {
    id: 'creator_reliability', title: 'Creator reliability (0 to 100)',
    rules: [
      'Components (weights): finished-work approval 30% (recency-weighted, half-life 45 days), on-time revisions and deadlines 20%, approved videos posted within 7 days 20%, disclosure right first time 20%, clean record 10% (1 - 0.4 x confirmed fraud - 0.3 x clawbacks - 0.15 x lost disputes, 90 days).',
      'score = round(100 x sum(weight x value) + Academy bonus), the bonus being 0.5 per completed lesson up to 5; capped at 100.',
      'Fewer than 5 finished decisions: provisional score 70, shown as "Building history"; brands see a range, not a verdict. Multi-brand work and pending samples are never penalised.',
    ],
    examples: () => {
      const now = '2026-10-03T14:00:00Z';
      const decisions = [];
      const mk = (d, a) => decisions.push({ approved: a, decided_at: `${d}T12:00:00Z` });
      ['2026-07-24', '2026-07-30', '2026-08-04', '2026-08-09', '2026-08-13', '2026-08-18', '2026-08-22', '2026-08-26', '2026-08-30', '2026-09-03', '2026-09-06', '2026-09-10', '2026-09-13', '2026-09-16', '2026-09-19', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].forEach((d) => mk(d, true));
      ['2026-07-27', '2026-08-06', '2026-08-20', '2026-09-01', '2026-09-08', '2026-09-20'].forEach((d) => mk(d, false));
      const r = creatorReliability({ decisions, now, on_time: { ok: 17, total: 19 }, post_through: { posted: 20, approved: 21 }, compliance: { passed: 20, total: 21 }, fraud_confirmed_90d: 0, clawbacks_90d: 0, disputes_lost_90d: 0, academy_lessons: 6 });
      return [{ title: 'A creator with 21 of 27 finished posts approved, 6 Academy lessons', rows: [
        ...r.components.map((c) => row(c.label, `${c.value} x ${c.weight}`, `${c.points} pts`)), row('Academy bonus', '6 x 0.5', `${r.academy_bonus_points} pts`), row('score', 'round(sum + bonus)', String(r.score)),
      ] }];
    },
  },
  {
    id: 'brand_reliability', title: 'Brand reliability (Brand Scorecard, 0 to 100)',
    rules: [
      'Components (weights): decision speed 30% (median hours to decide: 12 h = 1.0, 72 h = 0.0, linear), approval fairness 25%, pays on time 20%, runs what it approves 15%, reply speed 10% (2 h = 1.0, 48 h = 0.0).',
      'Approval fairness = clamp(1 - (rejection rate - 0.30) / 0.40, 0, 1) - 0.5 x (appeals overturned / rejections). A rejection rate up to 30% is free; 70% scores 0.',
      'Decisions are approvals and rejections (request-changes excluded). Fewer than 10 decisions: band "new", shown as "New brand", never a misleading figure.',
      'Bands: excellent 90+, good 75 to 89, fair 60 to 74, poor under 60. An SLA breach (decision after 72 h) counts toward decision speed through the median and creates an escalation.',
    ],
    examples: () => {
      const r = brandReliability({ decisions_n: 64, approved_n: 49, decision_hours_median: 11.2, appeals_overturned: 1, pays_on_time_ratio: 0.99, run_rate: 0.93, reply_hours_median: 4.5 });
      return [{ title: 'Lumi: 64 decisions, 49 approved, median 11.2 h, 1 appeal overturned', rows: [
        ...r.components.map((c) => row(c.label, `${c.value} x ${c.weight}`, `${c.points} pts`)), row('score', 'round(sum)', String(r.score)), row('band', '', r.band),
      ] }];
    },
  },
  {
    id: 'fraud', title: 'Fraud score composition',
    rules: [
      'Ten signals, each with a maximum number of points (CONSTANTS.fraud.signals). A fired signal has a severity 0..1; points = round(max_points x severity).',
      'score = min(100, sum of points). Bands: clean 0-19 (auto-clear), watch 20-39 (auto-clear, logged), review 40-69 (held for a human review within 24 h), high 70+ (auto-hold and queued for Ops).',
      'Only proven fraud is clawed back, and delivered legitimate views are still paid. Every score shows its signals as evidence.',
    ],
    examples: () => {
      const r = fraudScore([
        { signal: 'view_spike_no_engagement', severity: 0.8 }, { signal: 'bought_views_pattern', severity: 0.9 }, { signal: 'traffic_source_anomaly', severity: 0.7 }, { signal: 'curve_shape', severity: 0.6 },
      ]);
      return [{ title: 'A spiky post with no engagement and 62% "other" traffic', rows: [...r.signals.map((h) => row(h.signal, `round(${C.fraud.signals[h.signal].max_points} x ${h.severity})`, `${h.points} pts`)), row('score', 'min(100, sum)', String(r.score)), row('band', '', `${r.band} -> ${fraudAction(r.score)}`)] }];
    },
  },
  {
    id: 'scores', title: 'Hook Score and Flow Score (checklist scores)',
    rules: [
      'Both are CHECKLIST scores, labelled "Checklist score. It gets smarter as bounties settle." until a learned model beats them on held-out apps (about 1,000 settled posts).',
      'Hook Score weights: hook lands by 2.0 s 20, on-screen text mirrors the spoken hook 15, face in the first second 15, app by 3 s 15, pattern interrupt 10, proven hook type 10, speech starts fast 10, captions in safe zones 5 (sum 100). Each item scores full, half or zero (rules in CONSTANTS.scores).',
      'Flow Score weights: Hook Score scaled 30, required beats 25, app early 10, disclosure 10, length 5, safe-zone captions 5, one CTA and win state 5, clear audio 5, format fit 5 (sum 100).',
      'Bands: A 85+, B 70-84, C 55-69, D 40-54, E under 40. Every band comes with timecoded reasons and a one-tap fix; never a bare number.',
    ],
    examples: () => {
      const h = scoreHook({ lands_ms: 2400, onscreen_ms: 900, spoken_matches_onscreen: true, face_ms: 300, faceless: false, app_ms: 2800, interrupt_ms: 1200, hook_type_known: true, hook_type_above_median: true, speech_ms: 400, captions_in_safe_zone: true });
      const f = scoreFlow({ hook_points: h.points, beats_found: 4, beats_required: 5, app_ms: 2800, disclosure_audio: true, disclosure_onscreen: true, duration_s: 24, captions_in_safe_zone: true, single_cta: true, ends_on_win_state: true, audio_gaps: 0, format_order: 'in_order' });
      return [
        { title: 'Hook Score: hook lands at 2.4 s, everything else on time', rows: [...h.items.map((i) => row(i.label, i.reason, `${i.points} / ${i.max}`)), row('points', 'sum', String(h.points)), row('band', 'A 85+', h.band)] },
        { title: 'Flow Score for the same video (4 of 5 beats, 24 s)', rows: [...f.items.map((i) => row(i.label, i.reason, `${i.points} / ${i.max}`)), row('points', 'sum', String(f.points)), row('band', 'A 85+', f.band)] },
      ];
    },
  },
  {
    id: 'moneyclock', title: 'Money Clock: when money clears and pays',
    rules: [
      'Post earnings: accruing while the 72-hour window is open (live estimate) -> window_closed -> automated fraud and disclosure check (done within 12 h) -> cleared at the first daily clearing run (14:00 UTC) at or after window end + 2 h -> paid by the next weekly run (Friday 18:00 UTC) or an instant cash-out.',
      'Conversion earnings (CPA) clear after the clearing window of their kind: install 24 h, trial 72 h, paid 168 h, then the next 14:00 UTC run.',
      'Every non-final row carries a dated ETA and a named reason (MoneyClockReason); a bare "pending" is a bug. Holds name the next step: fraud review (24 h), dispute, tax info, identity check, payout method, disclosure failure.',
      'Demo clock: now = 2026-10-03T14:00:00Z. A run whose time is <= now has executed: its items are cleared with cleared_at = the run time.',
    ],
    examples: () => {
      const posted = '2026-09-30T09:00:00Z';
      const end = addHours(posted, 72);
      const run = postClearingRun(end);
      const st = moneyClockState({ posted_at: '2026-10-02T18:30:00Z', now: '2026-10-03T14:00:00Z' });
      const st2 = moneyClockState({ posted_at: '2026-09-29T21:00:00Z', now: '2026-10-03T14:00:00Z' });
      const trial = conversionClearingRun('trial', '2026-10-01T08:15:00Z');
      return [{ title: 'Timeline for a post (all UTC)', rows: [
        row('posted', '', posted), row('window ends', 'posted + 72 h', end), row('clearing run', 'first 14:00Z at or after window end + 2 h', `${run} (cleared)`),
        row('weekly payout', 'first Friday 18:00Z at or after clearing', weeklyPayoutFor(run)),
        row('live post at now', 'posted 2026-10-02T18:30Z', `${st.state}, reason ${st.reason}, clears ${st.eta_at}`),
        row('closed post at now', 'posted 2026-09-29T21:00Z (window ended 2026-10-02T21:00Z)', `${st2.state}, reason ${st2.reason}, clears ${st2.eta_at}`),
        row('trial at 2026-10-01T08:15Z', 'occurred + 72 h, next 14:00Z', trial),
      ] }];
    },
  },
  {
    id: 'sla', title: 'Review SLA',
    rules: [
      'sla_due_at = the time the current version entered review + 72 h. on_track under 48 h; stale 48 to 72 h; breached over 72 h (escalated, and the brand reliability score takes a hit).',
      'Timeout policy (per brand): escalate (default) or approve-if-clean (auto-approve only when every QA check passes). Approved-but-unused after 30 days is released to the Spec Market; the brand keeps first refusal for 7 days.',
    ],
    examples: () => [{ title: 'Position by hours in the queue', rows: [10, 47.9, 48, 72, 72.5].map((h) => row(`${h} h`, '', slaState(h))) }],
  },
  {
    id: 'pricing', title: 'Price vs fill time (day-one pricing heuristic)',
    rules: [
      'p50 fill hours = max(6, H x (clearing_cpm / cpm)^1.6); p80 = p50 x 1.8. H = the category\'s median fill hours at the clearing price.',
      'confidence = sample_n / (sample_n + 20) x (1 - min(0.5, |ln(cpm / clearing_cpm)|)). Under 8 comparable bounties = thin market warning.',
      'The curve has six points at 0.6x, 0.8x, 1.0x, 1.2x, 1.5x, 2.0x of the clearing CPM. Replaced by a regression once enough bounties settle.',
    ],
    examples: () => [{ title: 'AI photo & video: clearing CPM $2.40, median fill 31 h, 38 comparable bounties', rows: priceCurve({ clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38 }).map((p) => row(usd(p.cpm_cents), 'CPM', `p50 ${p.fill_hours_p50} h, p80 ${p.fill_hours_p80} h, confidence ${p.confidence}`)) }],
  },
  {
    id: 'match', title: 'Match score (bounty feed ranking)',
    rules: [
      'Gates first (any failure hides the bounty or shows it locked): creator tier meets the bounty minimum, country, a linked account on a bounty platform, bounty funded, not already submitted.',
      'match = niche overlap x 40 + platform fit x 15 + audience-region fit x 15 + price fit x 15 + brand reliability x 10 + recency x 5, all factors 0..1. Price fit = min(bounty expected pay / creator\'s usual pay, 1.5) / 1.5. Recency halves every 14 days.',
    ],
    examples: () => [{ title: 'Maya x a fresh stacked AI-photo bounty', rows: [row('niche overlap', '1 of 1 niche', '1.00'), row('platform fit', 'TikTok linked', '1.00'), row('region fit', '71% US audience vs 50% needed', '1.00'), row('price fit', 'min(1.2, 1.5) / 1.5', '0.80'), row('brand reliability', '94 / 100', '0.94'), row('recency', '2 days old', '0.91'),
      row('match', '40 + 15 + 15 + 12 + 9.4 + 4.55', String(matchScore({ gates: { a: true }, niche_overlap: 1, platform_fit: 1, region_fit: 1, price_ratio: 1.2, brand_reliability: 94, bounty_age_days: 2 })))] }],
  },
  {
    id: 'funnel', title: 'Funnel, cost per stage, ROAS and payback',
    rules: [
      'cost = creator pay + platform fee (+ ad spend and commission for promoted posts). Stage costs divide cost by TRACKED counts (link + code, deterministic). Estimated counts (MMP, survey, modelled) are shown separately and never mixed in or paid.',
      'ROAS Dn = tracked revenue in the first n days after posting / cost. payback_day = the first day cumulative tracked revenue >= cost.',
    ],
    examples: () => {
      const rev = Array.from({ length: 30 }, (_, i) => (i < 3 ? 2000 : i < 12 ? 4200 : 1800));
      const f = funnelStats({ cost_cents: 52_000, views: 410_000, clicks: 1_850, installs: 700, trials: 112, paid: 41, revenue_by_day_cents: rev });
      return [{ title: '$520.00 cost, 410,000 views, 1,850 clicks, 700 installs, 112 trials, 41 paid', rows: [row('effective CPM', 'cost / views x 1000', usd(f.cpm_effective_cents)), row('cost per install', 'round(52000 / 700)', usd(f.cost_per_install_cents)), row('cost per trial', 'round(52000 / 112)', usd(f.cost_per_trial_cents)), row('cost per paid', 'round(52000 / 41)', usd(f.cost_per_paid_cents)), row('ROAS D7', 'revenue in 7 days / cost', String(f.roas_d7)), row('ROAS D30', '', String(f.roas_d30)), row('payback day', 'first day cumulative revenue >= cost', String(f.payback_day))] }];
    },
  },
  {
    id: 'budget', title: 'Smart Budget planner',
    rules: [
      'views = budget / cpm x 1000. Median: installs = views x 0.45% x 38%; trials = installs x 6.2%; paid = trials x 34.8%. The low and high bands multiply every stage count by k = 0.55 and 1.6. cost per trial = card charge / trials.',
      'Always labelled "estimate"; the band is a planning range, not a promise.',
    ],
    examples: () => {
      const p = budgetPlan({ budget_cents: 500_000, take_rate: 0.10, cpm_cents: 200, avg_first_payment_cents: 3499 });
      return [{ title: 'Pro, $5,000 pool at $2.00 CPM (card charge ' + usd(p.funding.card_charge_cents) + ')', rows: ['low', 'median', 'high'].map((k) => row(k, `${p.band[k].installs} installs, ${p.band[k].trials} trials, ${p.band[k].paid} paid`, `cost per trial ${p.band[k].cost_per_trial_cents == null ? 'n/a' : usd(p.band[k].cost_per_trial_cents)}`)).concat([row('views', 'budget / cpm x 1000', p.views.toLocaleString('en-US'))]) }];
    },
  },
];
