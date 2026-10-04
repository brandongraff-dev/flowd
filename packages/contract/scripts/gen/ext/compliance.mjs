// Post-level compliance audit (8 checks per post) and the weekly payout runs.

import { iso, ms, addHours, fill, sum, timecode } from '../lib.mjs';
import { dateOf } from '../lib.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const TYPES = ['caption_disclosure', 'spoken_disclosure', 'onscreen_disclosure', 'platform_label', 'music_licence', 'banned_claims', 'ai_label', 'tracking_link'];
const QA_MAP = { spoken_disclosure: 'disclosure_audio', onscreen_disclosure: 'disclosure_onscreen', music_licence: 'music_licence', banned_claims: 'banned_claims', ai_label: 'ai_content' };
const MESSAGES = {
  caption_disclosure: { pass: ['#ad and the brand wording lead the caption.', 'Caption starts with "#ad Paid partnership with {brand}".'], warn: ['#ad is in the caption but not in the first line.'], fail: ['The caption has no #ad and no brand wording.', 'The caption says "sponsored" but not #ad with the brand wording.'] },
  spoken_disclosure: { pass: ['Spoken disclosure heard at {t}.'], warn: ['Disclosure is spoken but very quietly at {t}.'], fail: ['No spoken disclosure found in the audio.'] },
  onscreen_disclosure: { pass: ['#ad is on screen for {s} seconds from {t}.'], warn: ['#ad is on screen for under 1 second at {t}.'], fail: ['No on-screen #ad found.'] },
  platform_label: { pass: ['The platform paid-partnership label is on.'], warn: ['The paid-partnership label was off at posting and switched on after a reminder.'], fail: ['The paid-partnership label is off.'] },
  music_licence: { pass: ['Original audio only.', 'Audio matches commercial-library tracks only.'], warn: ['A background track could not be matched to the commercial library.'], fail: ['A track outside the commercial music library plays from {t}.'] },
  banned_claims: { pass: ['No disallowed claims in the transcript or on-screen text.'], warn: ['"Best app ever" at {t} may read as an unsubstantiated claim.'], fail: ['"Guaranteed results" at {t} is on the brand\'s do-not-say list.'] },
  ai_label: { pass: ['No AI-generated media detected.', 'AI-generated b-roll is labelled on screen.'], warn: ['Possible AI-generated voice; confirm the label.'], fail: ['AI-generated imagery at {t} is not labelled.'] },
  tracking_link: { pass: ['The tracking link and code are in the bio and caption.', 'Tracking link is live and resolves to the app store.'], warn: ['The link is in the bio only; the caption has the code.'], fail: ['The tracking link in the caption is broken.'] },
};
const WAIVE_REASONS = ['The track is the brand\'s own licensed sound; confirmed with their music team.', 'The claim is the brand\'s approved tagline from the brief.'];

export function genCompliance(W, rng) {
  const nowMs = ms(W.now);
  const rows = [];
  const posts = [...W.posts].sort((a, b) => (a.posted_at < b.posted_at ? -1 : a.posted_at > b.posted_at ? 1 : a.id < b.id ? -1 : 1));
  const heldCompliance = posts.find((p) => p.status === 'held' && p.hold_reason === 'compliance_fail');
  const rq = rng.fork('compliance:quota');
  // who fails and who warns: the held post fails and blocks; four more fail and were fixed, one was waived; twenty warn
  const eligible = posts.filter((p) => p.id !== heldCompliance?.id && p.status !== 'live');
  const shuffled = rq.shuffle(eligible);
  const qaTypes = (p) => {
    const an = (W.analysesBySub.get(p.submission_id) ?? []).slice().sort((a, b) => b.version - a.version)[0];
    return Object.entries(QA_MAP).filter(([, qa]) => an?.checks?.some((c) => c.check === qa && c.result !== 'pass')).map(([t]) => t);
  };
  const withQa = shuffled.filter((p) => qaTypes(p).length);
  const failFixed = new Set(shuffled.slice(0, 4).map((p) => p.id));
  const failWaived = shuffled[4]?.id;
  const rest = shuffled.slice(5);
  const warnPicks = [...withQa.filter((p) => rest.includes(p)), ...rest.filter((p) => !withQa.includes(p))].slice(0, 20);
  const warnSet = new Set(warnPicks.map((p) => p.id));
  const failTypes = ['caption_disclosure', 'spoken_disclosure', 'onscreen_disclosure', 'music_licence', 'banned_claims'];
  for (const p of posts) {
    const r = rng.fork(`cc:${p.id}`);
    const brand = W.brandById.get(p.brand_id);
    const an = (W.analysesBySub.get(p.submission_id) ?? []).slice().sort((a, b) => b.version - a.version)[0];
    const dur = an?.duration_ms ?? p.duration_ms ?? 24000;
    const isFailFixed = failFixed.has(p.id);
    const isWaived = p.id === failWaived;
    const isBlocking = p.id === heldCompliance?.id;
    const isWarn = warnSet.has(p.id);
    const failType = isBlocking ? 'caption_disclosure' : isWaived ? 'music_licence' : isFailFixed ? failTypes[[...failFixed].indexOf(p.id) % failTypes.length] : undefined;
    const warnType = isWarn ? pick(r, qaTypes(p).length ? qaTypes(p) : ['caption_disclosure', 'spoken_disclosure', 'onscreen_disclosure', 'platform_label', 'music_licence', 'banned_claims', 'tracking_link']) : undefined;
    const vals = { brand: brand?.name ?? 'the brand', t: timecode(Math.round(dur * r.float(0.08, 0.85))), s: String(r.int(2, 3)) };
    const items = TYPES.map((type) => {
      let result = 'pass';
      if (type === failType) result = 'fail';
      else if (type === warnType) result = 'warn';
      const caption = String(p.caption ?? '');
      if (type === 'caption_disclosure' && result === 'pass' && !/#ad\b/i.test(caption)) result = 'warn';
      return {
        type, result, message: fill(pick(r, MESSAGES[type][result]), vals),
        ...(result === 'fail' ? { evidence: { kind: type === 'caption_disclosure' ? 'transcript' : 'timecode', ref: type === 'caption_disclosure' ? 'caption' : vals.t, excerpt: type === 'caption_disclosure' ? caption.slice(0, 80) || 'Caption missing the disclosure line' : undefined, t_ms: type === 'caption_disclosure' ? undefined : Math.round(dur * 0.4) } } : {}),
        blocks_settlement: result === 'fail',
      };
    });
    const overall = items.some((i) => i.result === 'fail') ? 'fail' : items.some((i) => i.result === 'warn') ? 'warn' : 'pass';
    // the audit runs a few minutes to a few hours after the post goes live, never before it and never after now
    const checkedAt = iso(Math.min(nowMs, Math.max(ms(p.posted_at) + 60_000, Math.min(nowMs - 30 * 60_000, ms(p.posted_at) + r.int(20, 14 * 60) * 60_000))));
    const row = { post_id: p.id, submission_id: p.submission_id, bounty_id: p.bounty_id, brand_id: p.brand_id, creator_id: p.creator_id, checks: items, overall, blocks_settlement: overall === 'fail', checked_at: checkedAt };
    if (overall === 'fail' && !isBlocking) {
      const decider = W.deciders(p.brand_id)[0];
      if (isWaived && decider) {
        row.blocks_settlement = false; row.waived_by_member_id = decider.id; row.waive_reason = pick(r, WAIVE_REASONS);
        row.checks.forEach((i) => { i.blocks_settlement = false; });
      } else {
        row.blocks_settlement = false; row.fixed_at = iso(Math.min(nowMs - 20 * 60_000, ms(checkedAt) + r.int(2, 30) * 3_600_000));
        row.checks.forEach((i) => { i.blocks_settlement = false; });
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => (a.checked_at < b.checked_at ? -1 : a.checked_at > b.checked_at ? 1 : a.post_id < b.post_id ? -1 : 1));
  return rows.map((row) => ({ id: `cc_${W.slugOf(row.post_id)}`, ...row }));
}

// ── payout runs ──────────────────────────────────────────────────────────────────────────────────────
const HOLD_OF = { held_fraud_review: 'fraud_review', held_dispute: 'dispute_open', held_tax_info: 'tax_info_missing', held_identity_check: 'identity_check', held_payout_method: 'payout_method_missing', held_compliance: 'compliance_fail' };
export function genPayoutRuns(W) {
  const nowMs = ms(W.now);
  const runs = new Map();
  const fridays = [];
  for (let t = ms('2026-07-10T18:00:00Z'); t <= ms('2026-10-09T18:00:00Z'); t += 7 * 86_400_000) fridays.push(iso(t));
  for (const f of fridays) runs.set(`run_${dateOf(f)}`, { f, payouts: [] });
  for (const p of W.payouts) if (p.run_id && runs.has(p.run_id)) runs.get(p.run_id).payouts.push(p);
  const mcHeld = W.moneyClock.filter((m) => m.state === 'held');
  const out = [];
  for (const [id, { f, payouts }] of runs) {
    const isFuture = ms(f) > nowMs;
    const held = payouts.filter((p) => p.status === 'held');
    let holds = [];
    if (held.length) {
      const by = new Map();
      for (const p of held) { const k = p.hold_reason ?? 'admin_hold'; const e = by.get(k) ?? { reason: k, count: 0, cents: 0 }; e.count++; e.cents += p.gross_cents; by.set(k, e); }
      holds = [...by.values()];
    } else if (isFuture && mcHeld.length) {
      const by = new Map();
      for (const m of mcHeld) { const k = HOLD_OF[m.reason] ?? 'admin_hold'; const e = by.get(k) ?? { reason: k, count: 0, cents: 0 }; e.count++; e.cents += m.amount_cents; by.set(k, e); }
      holds = [...by.values()];
    }
    const sumHeld = sum(holds, (h) => h.cents);
    const cntHeld = sum(holds, (h) => h.count);
    out.push({
      id, run_date: dateOf(f), scheduled_for: f, status: isFuture ? 'scheduled' : 'complete', payouts_count: payouts.length,
      total_gross_cents: sum(payouts, (p) => p.gross_cents), total_fee_cents: sum(payouts, (p) => p.fee_cents), total_net_cents: sum(payouts, (p) => p.net_cents),
      paid_count: payouts.filter((p) => p.status === 'paid').length, failed_count: payouts.filter((p) => p.status === 'failed').length, held_count: cntHeld, held_cents: sumHeld, holds,
      ...(isFuture ? {} : { initiated_at: addHours(f, 0), completed_at: addHours(f, 1) }),
    });
  }
  return out.sort((a, b) => (a.run_date < b.run_date ? -1 : 1));
}
