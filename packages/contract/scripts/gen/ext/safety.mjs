// Trust and safety queues: fraud flags (admin fraud queue), disputes and appeals, Scam Shield reports.

import { iso, ms, addHours, addDays, allocate, decayShares, clamp } from '../lib.mjs';
import * as P from '../pools.mjs';
import { fraudBand } from '../../../schema/formulas.mjs';

const DAY = 86_400_000;
const pick = (r, arr) => arr[r.int(0, arr.length - 1)];

// ── fraud flags ──────────────────────────────────────────────────────────────────────────────────────
const SHAPE_OF = { bought_views_pattern: 'stepped', view_spike_no_engagement: 'spiky', curve_shape: 'flat' };
function curveShape(signals) {
  for (const s of signals) if (SHAPE_OF[s.signal]) return SHAPE_OF[s.signal];
  return 'organic';
}
function envelope(W, post, shape, r) {
  const nowMs = ms(W.now);
  const total = post.window_views ?? post.views;
  const elapsed = clamp(Math.floor((nowMs - ms(post.posted_at)) / 3_600_000), 1, 72);
  const base = decayShares(72, 20);
  let weights;
  if (shape === 'stepped') {
    const k = r.int(5, 14);
    weights = base.map((b, h) => b * 0.06 + (h === k ? 5.5 : h === k + 1 ? 3.6 : 0));
  } else if (shape === 'spiky') {
    const k = r.int(12, 38);
    weights = base.map((b, h) => b + (h === k ? 2.6 : h === k + 1 ? 1.1 : 0));
  } else if (shape === 'flat') weights = base.map(() => 1 / 72 + r.float(0, 0.002));
  else weights = base.map((b) => b * r.float(0.92, 1.08));
  weights = weights.map((w, h) => (h < elapsed ? w : 0));
  const views = allocate(total, weights);
  const med = W.medianViews(post.creator_id);
  const low = base.map((b) => Math.round(b * med * 0.35));
  const high = base.map((b) => Math.round(b * med * 2.6));
  return { views, expected_low: low, expected_high: high };
}
const NOTES = {
  cleared: [
    'The hourly curve follows the expected decay once the repost spike is accounted for. Traffic came from a larger account sharing the video, not bought views. Cleared; the full pay stands.',
    'Engagement and audience region match the creator\'s 28-day norm. The flag came from a short spike after a feature on the For You page. Cleared with no change to pay.',
    'The duplicate hash points at the creator\'s own earlier draft, not another account. Cleared.',
  ],
  confirmed: [
    'Step-function curve: most views arrived in two hourly buckets and most of those from the "other" source, with almost no likes. Views delivered by real viewers stay paid; the invalid views are reversed and the creator is on a watch list.',
    'The video matches another creator\'s upload (distance 2) posted a day earlier. Pay for legitimate views stays; the duplicated post is removed and clawed back.',
  ],
};

export function genFraudFlags(W, rng) {
  const nowMs = ms(W.now);
  const cfg = W.C.fraud;
  const flagged = W.posts.filter((p) => (p.fraud?.score ?? 0) >= cfg.review_threshold).sort((a, b) => (a.posted_at < b.posted_at ? -1 : 1));
  const rows = [];
  // Unresolved posts (live, window closed or held) wait for a human: all of them are open, except that up to two of the lowest scores
  // are only being watched while the queue keeps at least six open flags (the Ops queue is never empty on a live market).
  const unresolved = flagged.filter((p) => ['live', 'window_closed', 'held'].includes(p.status)).sort((a, b) => a.fraud.score - b.fraud.score);
  const watching = new Set(unresolved.slice(0, Math.max(0, Math.min(2, unresolved.length - 6))).map((p) => p.id));
  for (const p of flagged) {
    const r = rng.fork(`flag:${p.id}`);
    const soc = W.socialsByCreator.get(p.creator_id)?.find((s) => s.id === p.social_account_id) ?? W.primarySocial(p.creator_id);
    const score = p.fraud.score;
    let status;
    if (p.status === 'clawed_back') status = 'confirmed';
    else if (p.status === 'removed') status = score >= 70 ? 'confirmed' : 'cleared';
    else if (['cleared', 'paid'].includes(p.status)) status = 'cleared';
    else status = watching.has(p.id) ? 'monitoring' : 'open';
    const shape = curveShape(p.fraud.signals);
    const live = p.status === 'live';
    const openedAt = iso(Math.min(nowMs - 20 * 60_000, live ? ms(p.posted_at) + r.int(22, 60) * 3_600_000 : ms(p.window_ends_at) + r.int(1, 11) * 3_600_000));
    const resolved = status === 'cleared' || status === 'confirmed';
    const reviewedAt = resolved ? iso(Math.min(nowMs - 10 * 60_000, ms(openedAt) + r.int(2, r.chance(0.8) ? 22 : 40) * 3_600_000)) : undefined;
    const dupSignal = p.fraud.signals.some((s) => s.signal === 'duplicate_hash');
    const dupPost = dupSignal ? W.posts.filter((o) => o.id !== p.id && o.creator_id !== p.creator_id && ms(o.posted_at) < ms(p.posted_at)).sort((a, b) => (a.bounty_id === p.bounty_id ? -1 : 1) - (b.bounty_id === p.bounty_id ? -1 : 1) || (a.posted_at < b.posted_at ? 1 : -1))[0] : undefined;
    const stake = Math.max(W.postPayCents(p), p.earnings?.total_cents ?? 0) || Math.round(((p.window_views ?? p.views) * (W.bountyById.get(p.bounty_id)?.cpm_cents ?? 150)) / 1000);
    rows.push({
      post_id: p.id, creator_id: p.creator_id, brand_id: p.brand_id, bounty_id: p.bounty_id, status, score, band: fraudBand(score), signals: p.fraud.signals, curve_shape: shape, curve: envelope(W, p, shape, r),
      money_at_stake_cents: stake, hold_placed: p.status === 'held' || score >= cfg.hold_threshold || status === 'confirmed', ...(dupPost ? { duplicate_of_post_id: dupPost.id } : {}),
      audience_us_ratio: soc?.us_audience_ratio ?? 0.5, account_age_days: soc ? Math.max(0, Math.round((nowMs - ms(soc.account_created_at)) / DAY)) : 400, opened_at: openedAt, sla_due_at: addHours(openedAt, cfg.review_sla_hours),
      ...(resolved ? { reviewed_at: reviewedAt, reviewed_by_user_id: r.chance(0.7) ? W.opsUserId : W.otherAdminId, decision_note: pick(r, NOTES[status]) } : {}),
      ...(status === 'confirmed' ? { invalid_views: p.views_invalid > 0 ? p.views_invalid : Math.round(p.views * r.float(0.35, 0.7)) } : {}),
    });
  }
  rows.sort((a, b) => (a.opened_at < b.opened_at ? -1 : a.opened_at > b.opened_at ? 1 : a.post_id < b.post_id ? -1 : 1));
  return rows.map((row, i) => ({ id: `flag_${String(i + 1).padStart(3, '0')}`, ...row }));
}

// ── disputes ─────────────────────────────────────────────────────────────────────────────────────────
export function genDisputes(W, rng, flags) {
  const nowMs = ms(W.now);
  const maya = W.maya;
  const rows = [];
  const ops = W.opsUserId;
  const ops2 = W.otherAdminId;
  const evt = (at, actor, action, text, userId) => ({ at, actor, action, text, ...(userId ? { user_id: userId } : {}) });
  const base = (spec) => {
    const r = rng.fork(`disp:${rows.length}:${spec.kind}`);
    const openedAt = spec.openedAt;
    const row = {
      kind: spec.kind, status: spec.status, opened_by: spec.opened_by ?? 'creator', ...(spec.creator_id ? { creator_id: spec.creator_id } : {}), brand_id: spec.brand_id, ...(spec.bounty_id ? { bounty_id: spec.bounty_id } : {}),
      ...(spec.submission_id ? { submission_id: spec.submission_id } : {}), ...(spec.post_id ? { post_id: spec.post_id } : {}), ...(spec.payout_id ? { payout_id: spec.payout_id } : {}),
      ...(spec.rejection_reason_code ? { rejection_reason_code: spec.rejection_reason_code } : {}), ...(spec.range_from ? { range_from: spec.range_from, range_to: spec.range_to } : {}),
      reason: spec.reason ?? pick(r, P.DISPUTE_TEXTS[spec.kind].reason), note: spec.note ?? pick(r, P.DISPUTE_TEXTS[spec.kind].note), evidence: spec.evidence ?? [], amount_in_dispute_cents: spec.amount ?? 0, events: spec.events,
      opened_at: openedAt, reply_due_at: addHours(openedAt, W.C.disputes.reply_sla_hours), ...(spec.firstReply ? { first_reply_at: spec.firstReply } : {}),
      resolution_due_at: spec.kind === 'rejection_appeal' ? addHours(openedAt, W.C.review.appeal_decision_sla_hours) : addDays(openedAt, W.C.disputes.resolution_sla_days),
      ...(spec.resolvedAt ? { resolved_at: spec.resolvedAt, outcome: spec.outcome, outcome_text: spec.outcomeText, ...(spec.adjust ? { adjustment_cents: spec.adjust } : {}) } : {}),
      assigned_admin_user_id: spec.admin ?? ops, updated_at: spec.updatedAt ?? spec.resolvedAt ?? spec.events[spec.events.length - 1].at,
    };
    rows.push(row);
    return row;
  };
  const H = (n) => iso(nowMs - n * 3_600_000);
  const snapEvidence = (post, hours) => {
    const snaps = (W.snapshotsByPost.get(post.id) ?? []).sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
    const at = snaps.find((s) => ms(s.taken_at) >= ms(post.posted_at) + hours * 3_600_000) ?? snaps[snaps.length - 1];
    const reported = at?.views_reported ?? Math.round((post.window_views ?? post.views) * 1.12);
    const verified = at?.views_verified ?? (post.window_views ?? post.views);
    // what the creator sees in their own platform analytics: higher than flowd's verified count (which counts logged-in, de-duplicated views)
    const claimed = Math.max(reported, Math.round(verified * 1.11));
    return { reported, verified, claimed, at: at?.taken_at ?? iso(ms(post.posted_at) + hours * 3_600_000) };
  };

  // 1. Maya: a view-count dispute on her cleared post, evidence requested
  if (maya) {
    const post = (W.postsByCreator.get(maya.id) ?? []).find((p) => p.status === 'cleared') ?? (W.postsByCreator.get(maya.id) ?? []).find((p) => ['paid', 'window_closed'].includes(p.status));
    if (post) {
      const b = W.bountyById.get(post.bounty_id);
      const e48 = snapEvidence(post, 48);
      const e72 = snapEvidence(post, 72);
      const diff = Math.max(900, e72.claimed - e72.verified);
      const openedAt = H(19);
      const events = [
        evt(openedAt, 'creator', 'opened', `Opened from the post screen. My platform analytics show ${e72.claimed.toLocaleString('en-US')} views at the end of the window and flowd counted ${e72.verified.toLocaleString('en-US')}.`, maya.user_id),
        evt(addHours(openedAt, 3), 'admin', 'reply', 'Thanks. Ops has your report and is comparing the snapshots with the platform API. A decision follows within five business days.', ops),
        evt(addHours(openedAt, 3.2), 'admin', 'evidence_requested', 'Please add a screenshot of your platform analytics for the 72-hour window (the audience and traffic-source tabs help most).', ops),
      ];
      base({
        kind: 'view_count', status: 'evidence_requested', creator_id: maya.id, brand_id: post.brand_id, bounty_id: post.bounty_id, post_id: post.id, range_from: post.posted_at, range_to: post.window_ends_at, openedAt,
        reason: 'Verified views look low against the platform count.', note: `My platform analytics show ${e72.claimed.toLocaleString('en-US')} and flowd shows ${e72.verified.toLocaleString('en-US')}. Can you check the snapshot at hour 48?`,
        evidence: [
          { kind: 'timecode', ref: 'Snapshot at hour 48', excerpt: `Platform API reported ${e48.reported.toLocaleString('en-US')}, verified ${e48.verified.toLocaleString('en-US')}.`, t_ms: 48 * 3_600_000 },
          { kind: 'timecode', ref: 'Snapshot at hour 72 (window end)', excerpt: `Platform API reported ${e72.reported.toLocaleString('en-US')}, verified ${e72.verified.toLocaleString('en-US')}. The creator's own analytics show ${e72.claimed.toLocaleString('en-US')}.`, t_ms: 72 * 3_600_000 },
        ],
        amount: Math.round((diff * (b?.cpm_cents ?? 200)) / 1000), events, firstReply: addHours(openedAt, 3),
      });
    }
  }

  // 2 to 4. rejection appeals
  const appealed = W.subs.filter((s) => s.creator_id !== maya?.id && ['appealed', 'rejected', 'posted', 'approved'].includes(s.status) && s.decision && (s.decision.action === 'appeal_overturn' || s.decision.action === 'appeal_uphold' || s.status === 'appealed' || s.decision.appeal_used));
  const overturned = appealed.find((s) => s.decision.action === 'appeal_overturn');
  const underReview = appealed.find((s) => s.status === 'appealed' && s !== overturned);
  const upheld = appealed.find((s) => s.decision.action === 'appeal_uphold' && s !== overturned && s !== underReview) ?? W.subs.find((s) => s.status === 'rejected' && s.creator_id !== maya?.id && s !== overturned && s !== underReview);
  const fallbackRejected = W.subs.filter((s) => s.status === 'rejected' && s.creator_id !== maya?.id && s.decision?.reason_code).slice(3, 8);
  [[overturned ?? fallbackRejected[0], 'overturned'], [underReview ?? fallbackRejected[1], 'review'], [upheld ?? fallbackRejected[2], 'rejected']].forEach(([s, kind], i) => {
    if (!s) return;
    const code = s.decision?.reason_code ?? 'app_not_shown_early';
    const decidedAt = s.decision?.decided_at ?? s.submitted_at;
    const openedAt = kind === 'review' ? H(30 + i * 5) : iso(Math.min(nowMs - 6 * DAY, ms(decidedAt) + 20 * 3_600_000));
    const r = rng.fork(`appeal:${s.id}`);
    const creator = W.creatorById.get(s.creator_id);
    const events = [evt(openedAt, 'creator', 'opened', 'Appeal opened from the rejection. One appeal is allowed per rejection.', creator.user_id), evt(addHours(openedAt, r.int(2, 9)), 'admin', 'review_started', 'An Ops reviewer is comparing the decision with the brief and the video.', ops2)];
    const spec = { kind: 'rejection_appeal', creator_id: s.creator_id, brand_id: s.brand_id, bounty_id: s.bounty_id, submission_id: s.id, rejection_reason_code: code, openedAt, evidence: [{ kind: 'brief_requirement', ref: 'The brief', excerpt: P.EVIDENCE_TEXTS.brief_requirement[0] }, ...(s.decision?.evidence ? [{ ...s.decision.evidence }] : [])], admin: ops2, firstReply: events[1].at, events };
    if (kind === 'overturned') {
      const at = iso(Math.min(nowMs - 3_600_000, ms(openedAt) + 22 * 3_600_000 + r.int(0, 20) * 3_600_000));
      events.push(evt(at, 'admin', 'decision', 'The app is on screen at 0:02 in v2. The decision is overturned and the submission goes back to review with the original deadline.', ops2));
      Object.assign(spec, { status: 'resolved', resolvedAt: at, outcome: 'upheld', outcomeText: P.DISPUTE_OUTCOMES.upheld[1], status_: 'resolved' });
    } else if (kind === 'rejected') {
      const at = iso(Math.min(nowMs - 3_600_000, ms(openedAt) + 1.6 * DAY));
      events.push(evt(at, 'admin', 'decision', P.DISPUTE_OUTCOMES.rejected[1], ops2));
      Object.assign(spec, { status: 'resolved', resolvedAt: at, outcome: 'rejected', outcomeText: P.DISPUTE_OUTCOMES.rejected[1] });
    } else spec.status = 'under_review';
    base(spec);
  });

  // 5 and 6. flagged-for-botting disputes tied to real fraud flags
  const flagFor = (st) => flags.find((f) => f.status === st && f.creator_id !== maya?.id);
  [['cleared', 'upheld'], ['confirmed', 'rejected']].forEach(([st, outcome], i) => {
    const f = flagFor(st);
    const post = f && W.postById.get(f.post_id);
    if (!post) return;
    const creator = W.creatorById.get(post.creator_id);
    const openedAt = iso(Math.min(nowMs - 4 * DAY, ms(f.opened_at) + (12 + i * 20) * 3_600_000));
    const reply = addHours(openedAt, 5);
    const at = iso(Math.min(nowMs - 3_600_000, ms(openedAt) + (1.5 + i * 1.1) * DAY));
    const text = outcome === 'upheld' ? P.DISPUTE_OUTCOMES.upheld[0] : P.DISPUTE_OUTCOMES.rejected[0];
    base({
      kind: 'flagged_botting', status: 'resolved', creator_id: post.creator_id, brand_id: post.brand_id, bounty_id: post.bounty_id, post_id: post.id, range_from: post.posted_at, range_to: post.window_ends_at, openedAt,
      evidence: [{ kind: 'timecode', ref: `Fraud score ${f.score}`, excerpt: f.signals.map((s) => s.detail ?? s.signal).slice(0, 1).join(' ') || 'View curve flagged for review.', t_ms: 0 }],
      amount: f.money_at_stake_cents, firstReply: reply, resolvedAt: at, outcome, outcomeText: text, adjust: outcome === 'upheld' ? f.money_at_stake_cents : undefined, admin: ops,
      events: [evt(openedAt, 'creator', 'opened', 'I was flagged for bot views and I did not buy any.', creator.user_id), evt(reply, 'admin', 'reply', 'We are reviewing the hourly curve and the traffic sources with the platform data.', ops), evt(at, 'admin', 'decision', text, ops)],
    });
  });

  // 7 and 8. late payment
  const lateCands = W.payouts.filter((p) => ['held', 'failed'].includes(p.status) || p.kind === 'weekly');
  [0, 1].forEach((i) => {
    const pay = lateCands.filter((p) => p.creator_id !== maya?.id && p.status === 'paid')[i * 7 + 3] ?? lateCands.filter((p) => p.creator_id !== maya?.id)[i];
    if (!pay) return;
    const creator = W.creatorById.get(pay.creator_id);
    const openedAt = iso(Math.min(nowMs - 9 * DAY, ms(pay.paid_at ?? pay.scheduled_for) + 2 * 3_600_000 + i * DAY));
    const at = iso(Math.min(nowMs - 2 * 3_600_000, ms(openedAt) + (1 + i * 0.6) * DAY + 7 * 3_600_000));
    const outcome = i === 0 ? 'upheld' : 'partially_upheld';
    const text = i === 0 ? 'The payout was delayed by a bank processing error on our side. It arrived on Saturday and we have credited the day as a goodwill note in your Money Clock.' : P.DISPUTE_OUTCOMES.partially_upheld[1];
    base({
      kind: 'late_payment', status: 'resolved', creator_id: pay.creator_id, brand_id: (W.earnByCreator.get(pay.creator_id) ?? []).find((x) => x.brand_id)?.brand_id ?? W.brands.find((b) => b.kind === 'brand').id, payout_id: pay.id, openedAt,
      evidence: [{ kind: 'timecode', ref: `Payout ${pay.id}`, excerpt: `Scheduled for ${pay.scheduled_for}, status ${pay.status}.` }], amount: pay.gross_cents, firstReply: addHours(openedAt, 4), resolvedAt: at, outcome, outcomeText: text, admin: ops2,
      events: [evt(openedAt, 'creator', 'opened', 'My weekly payout did not arrive on Friday.', creator.user_id), evt(addHours(openedAt, 4), 'admin', 'reply', 'We can see the run and are checking with the bank partner.', ops2), evt(at, 'admin', 'decision', text, ops2)],
    });
  });

  // 9. rights misuse (a licence that ended while the creator still saw the video running)
  const gLike = W.ads.find((a) => ['expired', 'ended'].includes(a.status)) ?? W.ads[0];
  if (gLike) {
    const post = W.postById.get(gLike.post_id);
    const creator = W.creatorById.get(post.creator_id);
    const openedAt = H(24 * 11 + 3);
    const at = iso(ms(openedAt) + 26 * 3_600_000);
    const text = 'The 90-day term ended and the ad kept delivering for about 36 hours because the platform paused it late. It is paused now, and the brand has been asked to renew or stop. Nothing further is owed.';
    base({
      kind: 'rights_misuse', status: 'resolved', creator_id: creator.id, brand_id: post.brand_id, bounty_id: post.bounty_id, post_id: post.id, openedAt, amount: 0, firstReply: addHours(openedAt, 6), resolvedAt: at, outcome: 'partially_upheld', outcomeText: text, admin: ops2,
      evidence: [{ kind: 'brief_requirement', ref: 'Rights Card', excerpt: 'Paid ads: 90 days from approval.' }],
      events: [evt(openedAt, 'creator', 'opened', 'My video is running as an ad after my rights ended.', creator.user_id), evt(addHours(openedAt, 6), 'admin', 'reply', 'We have asked the brand to stop the ad and are checking the end date.', ops2), evt(at, 'admin', 'decision', text, ops2)],
    });
  }

  // 10 and 11. wrong attribution (one from a creator, one from a brand)
  const convPost = W.posts.find((p) => (p.funnel?.trials ?? 0) > 2 && p.creator_id !== maya?.id && ['paid', 'cleared'].includes(p.status));
  if (convPost) {
    const creator = W.creatorById.get(convPost.creator_id);
    const openedAt = H(24 * 3 + 7);
    base({
      kind: 'wrong_attribution', status: 'under_review', creator_id: creator.id, brand_id: convPost.brand_id, bounty_id: convPost.bounty_id, post_id: convPost.id, openedAt, amount: 150,
      evidence: [{ kind: 'timecode', ref: 'Code lookup', excerpt: `Code ${convPost.promo_code ?? 'on the post'} was entered on Tuesday.`, t_ms: 0 }], firstReply: addHours(openedAt, 8), admin: ops,
      events: [evt(openedAt, 'creator', 'opened', P.DISPUTE_TEXTS.wrong_attribution.note[0], creator.user_id), evt(addHours(openedAt, 8), 'admin', 'review_started', 'We are matching the RevenueCat event to the code redemption log.', ops)],
    });
  }
  const brandPost = W.posts.find((p) => p.brand_id === W.lumi?.id && (p.funnel?.paid ?? 0) > 0 && p.creator_id !== maya?.id);
  if (brandPost) {
    const mem = W.ownerOf(brandPost.brand_id);
    const openedAt = H(24 * 6 + 2);
    const at = iso(Math.min(nowMs - 3_600_000, ms(openedAt) + 2 * DAY - 3 * 3_600_000));
    const text = P.DISPUTE_OUTCOMES.partially_upheld[1];
    base({
      kind: 'wrong_attribution', status: 'resolved', opened_by: 'brand', creator_id: brandPost.creator_id, brand_id: brandPost.brand_id, bounty_id: brandPost.bounty_id, post_id: brandPost.id, openedAt, amount: 400, reason: 'A conversion was credited to the wrong link.',
      note: 'Two paid conversions from the same device were credited to two different creators. We think the second one belongs to the first link.', evidence: [{ kind: 'timecode', ref: 'RevenueCat event', excerpt: 'Two initial purchases from one anonymous id within six minutes.', t_ms: 0 }],
      firstReply: addHours(openedAt, 5), resolvedAt: at, outcome: 'partially_upheld', outcomeText: text, admin: ops2,
      events: [evt(openedAt, 'brand', 'opened', 'Two paid conversions from the same device were credited to different creators.', mem?.user_id), evt(addHours(openedAt, 5), 'admin', 'reply', 'Thanks. We are comparing both events with the link click logs.', ops2), evt(at, 'admin', 'decision', text, ops2)],
    });
  }

  // 12. held funds (the W-9 was submitted but the hold stayed)
  const heldPay = W.payouts.find((p) => p.status === 'held' && p.creator_id !== maya?.id) ?? W.payouts.find((p) => p.kind === 'weekly' && p.creator_id !== maya?.id && p.status === 'paid');
  if (heldPay) {
    const creator = W.creatorById.get(heldPay.creator_id);
    const openedAt = H(24 * 2 + 5);
    base({
      kind: 'held_funds', status: 'open', creator_id: creator.id, brand_id: (W.earnByCreator.get(creator.id) ?? []).find((x) => x.brand_id)?.brand_id ?? W.brands.find((b) => b.kind === 'brand').id, payout_id: heldPay.id, openedAt, amount: heldPay.gross_cents,
      evidence: [{ kind: 'timecode', ref: `Payout ${heldPay.id}`, excerpt: `Held: ${heldPay.hold_reason ?? 'tax info'}.` }], admin: ops2,
      events: [evt(openedAt, 'creator', 'opened', P.DISPUTE_TEXTS.held_funds.note[0], creator.user_id)],
    });
  }

  // 13. a second view-count dispute, resolved in the creator's favour in part
  const vcPost = W.posts.find((p) => ['paid'].includes(p.status) && p.creator_id !== maya?.id && p.views > 8000 && p.fraud.score < 20 && !rows.some((x) => x.post_id === p.id));
  if (vcPost) {
    const creator = W.creatorById.get(vcPost.creator_id);
    const openedAt = H(24 * 14 + 6);
    const at = iso(ms(openedAt) + 3 * DAY + 4 * 3_600_000);
    const e = snapEvidence(vcPost, 72);
    const text = P.DISPUTE_OUTCOMES.partially_upheld[0];
    base({
      kind: 'view_count', status: 'resolved', creator_id: creator.id, brand_id: vcPost.brand_id, bounty_id: vcPost.bounty_id, post_id: vcPost.id, range_from: vcPost.posted_at, range_to: vcPost.window_ends_at, openedAt,
      evidence: [{ kind: 'timecode', ref: 'Snapshot at hour 72', excerpt: `Platform API reported ${e.reported.toLocaleString('en-US')}, verified ${e.verified.toLocaleString('en-US')}. The creator's own analytics show ${e.claimed.toLocaleString('en-US')}.`, t_ms: 72 * 3_600_000 }], amount: Math.round(((e.claimed - e.verified) * (W.bountyById.get(vcPost.bounty_id)?.cpm_cents ?? 200)) / 1000),
      firstReply: addHours(openedAt, 7), resolvedAt: at, outcome: 'partially_upheld', outcomeText: text, adjust: 480, admin: ops,
      events: [evt(openedAt, 'creator', 'opened', P.DISPUTE_TEXTS.view_count.note[0], creator.user_id), evt(addHours(openedAt, 7), 'admin', 'reply', 'We are pulling the platform snapshots for the full window.', ops), evt(at, 'admin', 'decision', text, ops)],
    });
  }

  // 14. a brand-opened "other": the invoice shows a PO number nobody entered (withdrawn once the finance owner found it)
  const poBrand = W.brands.find((b) => b.kind === 'brand' && b.plan === 'scale');
  if (poBrand) {
    const mem = W.membersOf(poBrand.id, ['finance'])[0] ?? W.ownerOf(poBrand.id);
    const openedAt = H(24 * 9 + 1);
    const at = addHours(openedAt, 20);
    base({
      kind: 'other', status: 'withdrawn', opened_by: 'brand', brand_id: poBrand.id, openedAt, reason: 'An invoice shows a PO number we did not enter.', note: 'The funding invoice for last month shows PO-7731 and nobody on our team set it. Can you check?', amount: 0, firstReply: addHours(openedAt, 3), admin: ops2, updatedAt: at,
      events: [evt(openedAt, 'brand', 'opened', 'The funding invoice shows a PO number we did not enter.', mem?.user_id), evt(addHours(openedAt, 3), 'admin', 'reply', 'It was added from the cost-centre default in Settings. You can edit it from the invoice screen.', ops2), evt(at, 'brand', 'withdrawn', 'Found it in our own defaults. Withdrawing, thank you.', mem?.user_id)],
    });
  }

  // a fresh dispute that is still waiting for its first reply (2 h old)
  const fresh = W.posts.find((p) => ['paid', 'cleared'].includes(p.status) && p.creator_id !== maya?.id && !rows.some((x) => x.post_id === p.id) && p.views > 3000);
  if (fresh) {
    const creator = W.creatorById.get(fresh.creator_id);
    const openedAt = H(2.2);
    base({
      kind: 'view_count', status: 'open', creator_id: creator.id, brand_id: fresh.brand_id, bounty_id: fresh.bounty_id, post_id: fresh.id, range_from: fresh.posted_at, range_to: fresh.window_ends_at, openedAt, reason: P.DISPUTE_TEXTS.view_count.reason[1],
      note: P.DISPUTE_TEXTS.view_count.note[1], evidence: [{ kind: 'timecode', ref: 'Snapshot at hour 48', excerpt: 'Views dropped between two snapshots.', t_ms: 48 * 3_600_000 }], amount: 520, admin: undefined,
      events: [evt(openedAt, 'creator', 'opened', P.DISPUTE_TEXTS.view_count.note[1], creator.user_id)],
    });
    delete rows[rows.length - 1].assigned_admin_user_id;
  }
  rows.sort((a, b) => (a.opened_at < b.opened_at ? -1 : a.opened_at > b.opened_at ? 1 : 0));
  return rows.map((row, i) => ({ id: `disp_${String(i + 1).padStart(3, '0')}`, ...row }));
}

// ── scam reports ─────────────────────────────────────────────────────────────────────────────────────
const ACTIONS = ['Brand suspended and the bounty removed', 'Warning sent to the brand; Brief Lint override revoked', 'Offer cancelled and the brand reminded of the in-app-only rule', 'Message hidden; account strike issued', 'Bounty removed; creators who joined were notified'];
const EXTRA = {
  pay_to_join: ['It also said the fee is "refunded after the first payout".', 'Nothing about this was in the brief.'],
  off_platform_chat: ['I did not reply and kept the thread here.', 'They said the contract "cannot be sent in the app".'],
  fake_brand: ['I looked up the company and the domain is two weeks old.'],
  burner_account_demand: ['The brief says to post from a fresh account with no other content.'],
  no_escrow_claim: ['There was no Funded badge on the bounty page.'],
  suspicious_link: ['I did not open it. The preview looked like a login page.'],
  harassment: ['It was in the review comments on my video.'],
  other: ['I am not sure it is a scam, but it felt off.'],
};
export function genScamReports(W, rng, threads, offers) {
  const nowMs = ms(W.now);
  const rows = [];
  const warnMsgs = threads.flatMap((t) => t.messages.filter((m) => m.kind === 'warning').map((m) => ({ t, m })));
  const plan = [
    ...Array(4).fill('pay_to_join'), ...Array(4).fill('off_platform_chat'), 'fake_brand', 'fake_brand', ...Array(3).fill('burner_account_demand'), 'no_escrow_claim', 'no_escrow_claim', ...Array(3).fill('suspicious_link'), 'harassment', 'harassment', 'other', 'other',
  ];
  const statuses = ['new', 'new', 'new', 'new', 'new', 'new', 'triaged', 'triaged', 'triaged', 'triaged', 'triaged', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'actioned', 'actioned', 'actioned', 'actioned', 'dismissed', 'dismissed'];
  const rp = rng.fork('scam:order');
  const order = rp.shuffle(plan.map((reason, i) => ({ reason, status: statuses[i] })));
  const unverified = W.brands.filter((b) => b.kind === 'brand' && b.verification !== 'verified');
  const lintBounty = W.bounties.find((b) => (b.lint_overrides ?? []).length) ?? W.bounties.find((b) => /new account|burner|fresh account|dedicated account/i.test(JSON.stringify(b.brief)));
  const warnUsed = new Set();
  const usedWording = new Set();
  order.forEach(({ reason, status }, i) => {
    const r = rng.fork(`scam:${i}:${reason}`);
    const ageDays = status === 'new' ? r.float(0.05, 0.9) : status === 'triaged' ? r.float(0.6, 3) : status === 'confirmed' ? r.float(2, 8) : r.float(4, 24);
    const createdAt = iso(nowMs - ageDays * DAY);
    const reporterBrand = i % 6 === 5;
    const creator = W.creators[(i * 13 + 5) % W.creators.length];
    let targetKind = 'message';
    let targetId;
    let evidence = [];
    const warn = warnMsgs.find((w) => w.m.warning_code === reason && !warnUsed.has(w.m.id));
    let reporterCreator = creator;
    if (warn && (reason === 'off_platform_chat' || reason === 'pay_to_join' || reason === 'suspicious_link')) {
      warnUsed.add(warn.m.id);
      targetKind = 'message';
      targetId = warn.t.messages[warn.t.messages.indexOf(warn.m) - 1]?.id ?? warn.m.id;
      evidence = [targetId, warn.m.id];
      reporterCreator = W.creatorById.get(warn.t.creator_id) ?? creator;
      const mTime = ms(warn.m.at);
      if (ms(createdAt) < mTime) { /* report cannot precede the message */ }
    } else if (reason === 'burner_account_demand' && lintBounty && i % 2 === 0) {
      targetKind = 'bounty'; targetId = lintBounty.id; evidence = ['brief-screenshot.png', 'lint-override-log'];
    } else if (reason === 'fake_brand' || reason === 'no_escrow_claim') {
      const b = unverified[(i + 1) % Math.max(1, unverified.length)] ?? W.brands.find((x) => x.kind === 'brand');
      targetKind = 'brand'; targetId = b.id; evidence = ['listing-screenshot.png', 'domain-whois.txt'];
    } else if (reason === 'harassment') {
      targetKind = reporterBrand ? 'creator' : 'brand'; targetId = reporterBrand ? creator.id : (W.brands.find((b) => b.kind === 'brand' && ['poor', 'fair'].includes(W.scorecardByBrand.get(b.id)?.band)) ?? W.brands[3]).id; evidence = ['comment-thread.png'];
    } else {
      const o = offers[(i * 7) % offers.length];
      targetKind = reason === 'suspicious_link' ? 'message' : 'offer'; targetId = reason === 'suspicious_link' ? (threads.find((t) => t.offer_id === o.id)?.messages[0]?.id ?? o.id) : o.id; evidence = ['screenshot-chat.png'];
      reporterCreator = W.creatorById.get(o.creator_id) ?? creator;
    }
    // no two reports in the queue read the same: re-pick a few times, then fall back to the first unused wording
    let text = pick(r, P.SCAM_TEXTS[reason]);
    let extra = pick(r, EXTRA[reason]);
    for (let tries = 0; tries < 12 && usedWording.has(`${text} ${extra}`); tries++) { text = pick(r, P.SCAM_TEXTS[reason]); extra = pick(r, EXTRA[reason]); }
    usedWording.add(`${text} ${extra}`);
    // a creator cannot report before the message it is about
    let created = createdAt;
    const targetMsg = threads.flatMap((t) => t.messages).find((m) => m.id === targetId);
    if (targetMsg && ms(created) < ms(targetMsg.at) + 20 * 60_000) created = iso(Math.min(nowMs - 60_000, ms(targetMsg.at) + r.int(1, 18) * 3_600_000));
    const triaged = ['triaged', 'confirmed', 'actioned', 'dismissed'].includes(status) ? iso(Math.min(nowMs - 30 * 60_000, ms(created) + r.int(1, 20) * 3_600_000)) : undefined;
    const resolved = ['actioned', 'dismissed'].includes(status) ? iso(Math.min(nowMs - 20 * 60_000, ms(triaged ?? created) + r.int(3, 70) * 3_600_000)) : undefined;
    rows.push({
      reporter_kind: reporterBrand ? 'brand' : 'creator', ...(reporterBrand ? { reporter_brand_id: W.lumi && i === 5 ? W.lumi.id : W.brands.filter((b) => b.kind === 'brand')[(i * 3) % 24].id } : { reporter_creator_id: reporterCreator.id }),
      target_kind: targetKind, target_id: targetId, reason, description: `${text} ${extra}`, evidence_refs: evidence, status, created_at: created, sla_due_at: addHours(created, 24),
      ...(triaged ? { triaged_at: triaged } : {}), ...(resolved ? { resolved_at: resolved } : {}),
      ...(status === 'actioned' ? { action_taken: pick(r, ACTIONS) } : status === 'dismissed' ? { action_taken: 'No violation found; reporter thanked' } : {}),
      ...(triaged ? { assigned_admin_user_id: i % 3 === 0 ? W.otherAdminId : W.opsUserId } : {}),
    });
  });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return rows.map((row, i) => ({ id: `scam_${String(i + 1).padStart(3, '0')}`, case_id: `SR-2026-${String(31 + i).padStart(4, '0')}`, ...row }));
}
