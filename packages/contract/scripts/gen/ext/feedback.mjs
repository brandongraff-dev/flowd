// Timecoded feedback notes on submission versions that were sent back or turned down. About the video, never the person.
// Must-fix notes carry to the next version until the creator ticks them off; each note anchors to a second of the video.

import { iso, ms, fill, clamp } from '../lib.mjs';
import * as P from '../pools.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const REASON_CATEGORY = {
  app_not_shown_early: 'hook', hook_too_late: 'hook', face_not_shown: 'hook', missing_required_beat: 'pacing', off_brief: 'pacing', low_video_quality: 'pacing', wrong_format: 'pacing',
  missing_disclosure: 'disclosure', ai_content_undisclosed: 'disclosure', offer_not_stated: 'offer', other_requirement: 'offer', audio_unclear: 'audio', music_not_licensed: 'audio',
  banned_claim: 'claims', brand_safety: 'claims', suspected_fraud: 'claims', duplicate_content: 'brand', unoriginal_clip: 'brand', watermark_present: 'brand', competitor_shown: 'brand', region_mismatch: 'brand',
};
/** where in the video a note about this category usually sits (fractions of the duration) */
const POSITION = { hook: [0.02, 0.12], offer: [0.7, 0.92], disclosure: [0.05, 0.9], audio: [0.1, 0.9], brand: [0.1, 0.95], pacing: [0.25, 0.8], captions: [0.1, 0.9], claims: [0.15, 0.85] };
const EXTRA_CATEGORIES = [['hook', 3], ['pacing', 3], ['captions', 3], ['audio', 2], ['offer', 2], ['claims', 1], ['brand', 1], ['disclosure', 1]];

export function genFeedbackNotes(W, rng) {
  const nowMs = ms(W.now);
  const notes = [];
  const maya = W.maya;
  const authorFor = (s, decisionUserId) => {
    const byUser = decisionUserId && W.memberByUser.get(`${s.brand_id}|${decisionUserId}`);
    return byUser ?? W.deciders(s.brand_id)[0] ?? W.membersOf(s.brand_id)[0];
  };
  const make = (s, version, count, opts = {}) => {
    const r = rng.fork(`note:${s.id}:${version}:${opts.tag ?? ''}`);
    const ver = s.versions[version - 1];
    const next = s.versions[version];
    const app = W.appById.get(s.app_id);
    const dur = ver.video?.duration_ms ?? 24000;
    const reason = opts.reason ?? s.decision?.reason_code;
    const author = authorFor(s, s.decision?.decided_by_user_id);
    if (!author) return;
    const decidedAt = opts.decidedAt ?? (s.decision && version === s.version ? s.decision.decided_at : iso(Math.min(ms(next?.submitted_at ?? W.now) - 40 * 60_000, ms(ver.submitted_at) + r.int(3, 36) * 3_600_000)));
    const vals = { app: app?.name ?? 'the app', feature: (app?.features?.[0] ?? 'the feature').toLowerCase() };
    const cats = [];
    const first = reason ? REASON_CATEGORY[reason] ?? 'hook' : r.weighted(EXTRA_CATEGORIES);
    cats.push([first, 'must_fix']);
    for (let i = 1; i < count; i++) cats.push([r.weighted(EXTRA_CATEGORIES.filter(([c]) => c !== first)), i === 1 && count === 3 ? 'must_fix' : r.chance(0.6) ? 'suggestion' : 'must_fix']);
    if (opts.shape) { cats.length = 0; cats.push(...opts.shape); }
    cats.forEach(([category, severity], i) => {
      const [lo, hi] = POSITION[category] ?? [0.1, 0.9];
      const t = Math.round(clamp(dur * r.float(lo, hi), 300, dur - 600));
      const range = r.chance(0.28) ? clamp(t + r.int(1200, 4200), t + 600, dur - 100) : undefined;
      const resolvedLater = next && ver.version < s.version;
      let status = 'open';
      let resolvedIn;
      let resolvedAt;
      if (resolvedLater) {
        if (severity === 'must_fix' && r.chance(0.86)) { status = 'resolved'; resolvedIn = ver.version + 1; resolvedAt = iso(Math.min(nowMs - 60_000, ms(next.submitted_at) + r.int(2, 40) * 60_000)); }
        else if (severity === 'suggestion') { status = r.chance(0.55) ? 'resolved' : 'dismissed'; if (status === 'resolved') { resolvedIn = ver.version + 1; resolvedAt = iso(Math.min(nowMs - 60_000, ms(next.submitted_at) + r.int(2, 40) * 60_000)); } }
      }
      const createdAt = iso(Math.min(nowMs - 60_000, ms(decidedAt) + i * r.int(20, 240) * 1000));
      notes.push({
        _s: s, submission_id: s.id, bounty_id: s.bounty_id, creator_id: s.creator_id, version: ver.version, author_member_id: author.id, t_ms: t, ...(range ? { t_end_ms: range } : {}), category, severity, status,
        body: fill(pick(r, P.FEEDBACK_TEXTS[category][severity]), vals), ...(i === 0 && reason && ver.version === s.version ? { reason_code: reason } : {}), ...(resolvedIn ? { resolved_in_version: resolvedIn, resolved_at: resolvedAt } : {}), created_at: createdAt,
      });
    });
  };

  // ── Maya's open revision: three notes, two must-fix and one suggestion (round 1 of 2) ──────────────────
  const taken = new Set();
  if (maya) {
    const s = (W.subsByCreator.get(maya.id) ?? []).find((x) => x.status === 'changes_requested');
    if (s) {
      taken.add(s.id);
      make(s, s.version, 3, { shape: [[REASON_CATEGORY[s.decision?.reason_code] ?? 'hook', 'must_fix'], ['offer', 'must_fix'], ['captions', 'suggestion']], tag: 'maya' });
    }
  }
  // ── everything currently with changes requested ─────────────────────────────────────────────────────────
  const rp = rng.fork('note:pick');
  const open = W.subs.filter((s) => s.status === 'changes_requested' && !taken.has(s.id));
  open.forEach((s) => { taken.add(s.id); make(s, s.version, rp.weighted([[1, 2], [2, 5], [3, 3]])); });
  // ── earlier versions that were revised (v1 had notes, v2 fixed them) ────────────────────────────────────
  const revised = rp.shuffle(W.subs.filter((s) => s.versions.length >= 2 && !taken.has(s.id) && s.creator_id !== maya?.id));
  // ── rejected and appealed (the notes behind the reason code) ────────────────────────────────────────────
  const rejected = rp.shuffle(W.subs.filter((s) => ['rejected', 'appealed'].includes(s.status) && !taken.has(s.id) && s.creator_id !== maya?.id));
  const maxNotes = 270;
  let ri = 0;
  let xi = 0;
  while (notes.length < maxNotes && (ri < revised.length || xi < rejected.length)) {
    if (ri < revised.length && (ri <= xi * 1.4 || xi >= rejected.length)) {
      const s = revised[ri++];
      make(s, 1, rp.weighted([[1, 3], [2, 5], [3, 2]]), { reason: s.versions.length >= 2 ? undefined : s.decision?.reason_code });
    } else if (xi < rejected.length) {
      const s = rejected[xi++];
      make(s, s.version, rp.weighted([[1, 4], [2, 4], [3, 1]]));
    }
  }
  // Maya's earlier revised or rejected submissions get notes too
  if (maya) for (const s of W.subsByCreator.get(maya.id) ?? []) if (!taken.has(s.id) && (s.versions.length >= 2 || s.status === 'rejected')) { taken.add(s.id); make(s, s.versions.length >= 2 ? 1 : s.version, 2, { tag: 'maya-hist' }); }

  notes.sort((a, b) => (a.submission_id < b.submission_id ? -1 : a.submission_id > b.submission_id ? 1 : a.version - b.version || a.t_ms - b.t_ms));
  return notes.map(({ _s, ...n }, i) => ({ id: `note_${String(i + 1).padStart(4, '0')}`, ...n }));
}
