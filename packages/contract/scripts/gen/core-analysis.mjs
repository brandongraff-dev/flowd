// CORE stage 4: video analyses (one per submission version): observations -> Hook Score / Flow Score checklists, QA checks, transcript, tags.

import { fill, artSeed, hueOfHex, timecode, sortBy } from './lib.mjs';
import { FORMAT_DEFS } from './pools-content.mjs';
import { HOOK_TEMPLATES, HOOK_NUMBER_WORDS, QA_TEXTS, TRANSCRIPT_LINES, CTA_LINES, OFFER_LINES, CATEGORIES } from './pools.mjs';
import { REASON_CODE_INFO } from '../../schema/tables.mjs';
import { scoreHook, scoreFlow, bandFor } from '../../schema/formulas.mjs';
import { iso, ms, clamp, hexString, C, HOUR_MS } from './core-kit.mjs';

const QA_ORDER = ['disclosure_audio', 'disclosure_onscreen', 'music_licence', 'banned_claims', 'ai_content', 'duplicate', 'watermark', 'brief_beats', 'safe_zone', 'aspect_ratio', 'length', 'resolution', 'audio_clarity', 'moderation'];
const HOOK_ABOVE_MEDIAN = new Set(['confession', 'curiosity_gap', 'specific_number']);
const BEAT_ORDER = ['hook', 'problem', 'app_reveal', 'demo', 'key_feature', 'proof', 'payoff', 'reaction', 'win_state', 'offer', 'cta', 'end_card'];

/** hook text for an app and hook type */
export function makeHook(r, app, catDef, hookType, feature) {
  const tpl = r.pick(HOOK_TEMPLATES[hookType]);
  // a feature name reads as a plain phrase mid-sentence ("I tried batch edit 50 photos for a week")
  const midSentence = !tpl.startsWith('{feature}') && /^[A-Z][a-z]/.test(feature) ? feature[0].toLowerCase() + feature.slice(1) : feature;
  return fill(tpl, { app: app.name, feature: midSentence, noun: catDef.noun, activity: catDef.activity, pain: catDef.pain, outcome: catDef.outcome, days: String(app.def.pricing.trial_days || 7), number: r.pick(HOOK_NUMBER_WORDS) });
}

/** which reasons force which observation failures */
const REASON_FX = {
  app_not_shown_early: (o) => { o.hook.app_ms = o.appLate; o.flow.app_ms = o.appLate; o.beatsMissing = Math.max(o.beatsMissing, 1); },
  hook_too_late: (o) => { o.hook.lands_ms = o.late3; o.hook.onscreen_ms = o.late3 + 300; o.hook.speech_ms = 2200; },
  missing_disclosure: (o) => { o.flow.disclosure_audio = false; if (o.r.chance(0.5)) o.flow.disclosure_onscreen = false; },
  offer_not_stated: (o) => { o.beatsMissing = Math.max(o.beatsMissing, 1); o.offerMissing = true; },
  missing_required_beat: (o) => { o.beatsMissing = Math.max(o.beatsMissing, 1); },
  face_not_shown: (o) => { o.hook.face_ms = 3600; o.hook.faceless = false; },
  audio_unclear: (o) => { o.flow.audio_gaps = o.r.int(2, 3); o.hook.speech_ms = 1700; },
  off_brief: (o) => { o.flow.format_order = 'out_of_order'; o.beatsMissing = Math.max(o.beatsMissing, 2); },
  low_video_quality: (o) => { o.lowRes = true; o.hook.captions_in_safe_zone = false; },
  wrong_format: (o) => { o.wrongFormat = true; },
  captions: (o) => { o.hook.captions_in_safe_zone = false; },
};

function sampleObs(r, craft, cal, fmt, beatsRequired, reason, durRange) {
  // the hook observations follow the craft directly; cal = { shift, spread } shapes the rest of the flow (spread widens the craft
  // distribution so that weak videos fail several checks at once)
  const qh = clamp(craft - 0.22, 0.04, 0.99);
  const q = clamp(0.5 + (craft - 0.5) * cal.spread + cal.shift, 0.04, 0.99);
  const o = { r, hook: {}, flow: {}, beatsMissing: 0, appLate: 4300 + r.int(0, 4800), late3: 3300 + r.int(0, 1800) };
  const lands = clamp(Math.round(r.normal(3700 - 3000 * qh, 520)), 280, 7000);
  o.hook.lands_ms = lands;
  o.hook.onscreen_ms = clamp(lands + r.int(-300, 700), 150, 7000);
  o.hook.spoken_matches_onscreen = r.chance(0.35 + 0.6 * qh);
  o.hook.faceless = !!fmt?.faceless || r.chance(0.05);
  o.hook.face_ms = clamp(Math.round(r.normal(300 + (1 - qh) * 2400, 380)), 100, 5200);
  o.hook.app_ms = clamp(Math.round(r.normal(1600 + (1 - qh) * 4300, 650)), 600, 12000);
  o.hook.interrupt_ms = r.chance(0.3 + 0.6 * qh) ? r.int(300, 1500) : r.chance(0.5) ? r.int(1700, 4000) : null;
  o.hook.hook_type_known = r.chance(0.93);
  o.hook.hook_type_above_median = false; // set by the caller from the hook type
  o.hook.speech_ms = clamp(Math.round(r.normal(300 + (1 - qh) * 1900, 280)), 100, 4000);
  o.hook.captions_in_safe_zone = r.chance(0.5 + 0.45 * qh);
  o.flow.disclosure_audio = r.chance(0.8 + 0.18 * q);
  o.flow.disclosure_onscreen = r.chance(0.82 + 0.16 * q);
  o.flow.duration_s = clamp(Math.round(r.normal((durRange[0] + durRange[1]) / 2 + 1, 3.5 + 5 * (1 - q))), 10, 52);
  o.flow.single_cta = r.chance(0.35 + 0.6 * q);
  o.flow.ends_on_win_state = r.chance(0.3 + 0.65 * q);
  o.flow.audio_gaps = r.chance(0.5 + 0.47 * q) ? 0 : r.chance(0.6) ? 1 : 2;
  o.flow.format_order = r.chance(0.35 + 0.6 * q) ? 'in_order' : r.chance(0.7) ? 'one_off' : 'out_of_order';
  o.beatsMissing = r.chance(0.12 + 0.82 * q) ? 0 : r.chance(0.65) ? 1 : 2;
  // a rushed, low-effort upload misses most of the checklist at once (this is what puts videos in the D and E bands)
  if (craft < 0.4 && r.chance(0.6)) {
    if (r.chance(0.55)) o.flow.disclosure_audio = false;
    o.beatsMissing = Math.max(o.beatsMissing, 2);
    o.hook.app_ms = Math.max(o.hook.app_ms, 7000 + r.int(0, 3000));
    o.flow.single_cta = false;
    o.flow.ends_on_win_state = false;
    o.flow.format_order = 'out_of_order';
    o.flow.audio_gaps = 2;
    o.hook.captions_in_safe_zone = false;
  }
  if (reason && REASON_FX[reason]) REASON_FX[reason](o);
  o.hook.app_ms = o.hook.app_ms;
  o.flow.beats_required = beatsRequired;
  o.flow.beats_found = clamp(beatsRequired - o.beatsMissing, 0, beatsRequired);
  return o;
}

/** a video the brand approved passed the disclosure checks and missed at most one beat (the review would have caught more) */
const approves = (v) => !!v.dec && ['approve', 'auto_approve', 'timeout_approve'].includes(v.dec.action);
function observe(r, v, cal, s, req) {
  const o = sampleObs(r, v.craft, cal, s.format, req, v.reason, [s.format.min_s, s.format.max_s]);
  if (approves(v)) {
    o.flow.disclosure_audio = true;
    o.flow.disclosure_onscreen = true;
    if (o.beatsMissing > 1) { o.beatsMissing = 1; o.flow.beats_found = clamp(req - 1, 0, req); }
    if (o.flow.audio_gaps > 1) o.flow.audio_gaps = 1;
  }
  return o;
}

/** score a sampled observation set */
function scoreObs(o, hookType) {
  const hookObs = { ...o.hook, hook_type_above_median: HOOK_ABOVE_MEDIAN.has(hookType) };
  const hook = scoreHook(hookObs);
  const flow = scoreFlow({ hook_points: hook.points, beats_found: o.flow.beats_found, beats_required: o.flow.beats_required, app_ms: o.flow.app_ms ?? o.hook.app_ms, disclosure_audio: o.flow.disclosure_audio, disclosure_onscreen: o.flow.disclosure_onscreen, duration_s: o.wrongFormat ? 47 : o.flow.duration_s, captions_in_safe_zone: o.hook.captions_in_safe_zone, single_cta: o.flow.single_cta, ends_on_win_state: o.flow.ends_on_win_state, audio_gaps: o.flow.audio_gaps, format_order: o.flow.format_order });
  return { hook, flow, hookObs };
}

const qaMsg = (r, check, result, vars) => {
  const pool = QA_TEXTS[check][result];
  return fill(r.pick(pool), vars);
};

/** build the checks array (all 14 types) */
function buildChecks(r, o, reason, vars, creatorWaiver) {
  const info = REASON_CODE_INFO[reason ?? ''];
  const failCheck = info?.qa_check ?? null;
  const T = (ms_) => timecode(ms_);
  const checks = [];
  const mk = (check, result, extra = {}) => {
    const t = extra.t ?? o.hook.lands_ms + 2000;
    const entry = { check, result, message: qaMsg(r, check, result, { t: T(t), n: String(extra.n ?? vars.beatsRequired) }), blocks_settlement: (check === 'disclosure_audio' || check === 'disclosure_onscreen') && result === 'fail' };
    if (result === 'fail') entry.evidence = { kind: 'timecode', ref: T(t), t_ms: t };
    if (result === 'warn' && creatorWaiver && r.chance(0.12)) entry.waived_by_user_id = creatorWaiver;
    checks.push(entry);
  };
  for (const check of QA_ORDER) {
    let result = 'pass';
    let extra = {};
    switch (check) {
      case 'disclosure_audio': result = !o.flow.disclosure_audio ? 'fail' : r.chance(0.03) ? 'warn' : 'pass'; extra.t = 18000; break;
      case 'disclosure_onscreen': result = !o.flow.disclosure_onscreen ? 'fail' : r.chance(0.03) ? 'warn' : 'pass'; extra.t = 17000; break;
      case 'music_licence': result = reason === 'music_not_licensed' ? 'fail' : r.chance(0.04) ? 'warn' : 'pass'; extra.t = 3000 + r.int(0, 9000); break;
      case 'banned_claims': result = reason === 'banned_claim' ? 'fail' : r.chance(0.025) ? 'warn' : 'pass'; extra.t = 6000 + r.int(0, 8000); break;
      case 'ai_content': result = reason === 'ai_content_undisclosed' ? 'fail' : r.chance(vars.aiPhoto ? 0.05 : 0.01) ? 'warn' : 'pass'; extra.t = 5000 + r.int(0, 8000); break;
      case 'duplicate': result = reason === 'duplicate_content' || reason === 'unoriginal_clip' || vars.duplicate ? 'fail' : r.chance(0.03) ? 'warn' : 'pass'; extra.n = vars.dupPool; break;
      case 'watermark': result = reason === 'watermark_present' ? 'fail' : r.chance(0.02) ? 'warn' : 'pass'; extra.t = 2000 + r.int(0, 9000); break;
      case 'brief_beats': result = o.flow.beats_found < o.flow.beats_required ? (o.flow.beats_required - o.flow.beats_found > 1 || reason === 'missing_required_beat' || reason === 'app_not_shown_early' || reason === 'offer_not_stated' ? 'fail' : 'warn') : 'pass'; extra.t = (o.hook.app_ms ?? 3000); extra.n = o.flow.beats_required; break;
      case 'safe_zone': result = o.hook.captions_in_safe_zone ? 'pass' : r.chance(0.5) ? 'warn' : 'fail'; extra.t = 4000 + r.int(0, 8000); break;
      case 'aspect_ratio': result = o.wrongFormat ? 'fail' : r.chance(0.015) ? 'warn' : 'pass'; break;
      case 'length': result = (o.wrongFormat || o.flow.duration_s > 45 || o.flow.duration_s < 10) ? 'fail' : (o.flow.duration_s > 30 || o.flow.duration_s < 15) ? 'warn' : 'pass'; extra.n = o.wrongFormat ? 47 : o.flow.duration_s; break;
      case 'resolution': result = o.lowRes ? 'fail' : r.chance(0.035) ? 'warn' : 'pass'; break;
      case 'audio_clarity': result = o.flow.audio_gaps === 0 ? 'pass' : o.flow.audio_gaps === 1 ? 'warn' : 'fail'; extra.t = 7000 + r.int(0, 6000); break;
      case 'moderation': result = reason === 'brand_safety' ? 'fail' : r.chance(0.012) ? 'warn' : 'pass'; extra.t = 9000 + r.int(0, 6000); break;
      default:
    }
    mk(check, result, extra);
  }
  return checks;
}

export function buildAnalyses(W) {
  const rng = W.rng.fork('analysis');
  // map each version to the decision that followed it
  const items = [];
  for (const s of W.subs) {
    const d = s.derived;
    const fmtCandidates = FORMAT_DEFS.filter((f) => s.bounty.format_ids.includes(f.id));
    const fmt = fmtCandidates.length ? rng.fork(`fmt-${s.key}`).pick(fmtCandidates) : FORMAT_DEFS[0];
    s.format = fmt;
    s.formatId = fmt.id;
    s.hookType = rng.fork(`ht-${s.key}`).pick(fmt.hook_types);
    const hr = rng.fork(`hook-${s.key}`);
    s.hookText = makeHook(hr, s.app, s.bounty.catDef, s.hookType, s.bounty.feature);
    s.vers = d.versions.map((v, i) => {
      const next = d.versions[i + 1];
      const dec = d.decisions.find((x) => x.t >= v.at && (!next || x.t < next.at) && x.by !== 'admin');
      const reason = dec && (dec.action === 'request_changes' || dec.action === 'reject' || dec.action === 'auto_reject') ? dec.reason : null;
      return { ...v, reason, dec };
    });
    for (const v of s.vers) items.push({ s, v });
  }
  // calibrate the craft shift so the flow bands follow A 12 / B 34 / C 30 / D 17 / E 7
  const target = { A: 0.12, B: 0.34, C: 0.30, D: 0.17, E: 0.07 };
  const evalShift = (cal) => {
    const hist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const { s, v } of items) {
      const r = rng.fork(`obs-${s.key}-${v.n}`);
      const req = s.bounty.brief.beats.filter((b) => b.required).length;
      const o = observe(r, v, cal, s, req);
      const sc = scoreObs(o, s.hookType);
      hist[sc.flow.band]++;
    }
    const n = items.length;
    // the two lowest bands are hard to reach with a day-one checklist, so they weigh less
    const weight = { A: 1, B: 1, C: 1, D: 0.6, E: 0.3 };
    return Object.keys(target).reduce((e, k) => e + weight[k] * Math.abs(hist[k] / n - target[k]), 0);
  };
  let best = { shift: 0, spread: 1, err: 9 };
  for (const spread of [1, 1.5, 2, 2.5, 3, 3.5, 4]) for (let sft = -0.9; sft <= 0.1; sft += 0.05) { const e = evalShift({ shift: sft, spread }); if (e < best.err) best = { shift: sft, spread, err: e }; }
  W.analysisShift = best.shift;
  W.analysisErr = best.err;

  const analyses = [];
  for (const { s, v } of items) {
    const r = rng.fork(`obs-${s.key}-${v.n}`);
    const req = s.bounty.brief.beats.filter((b) => b.required).length;
    const o = observe(r, v, best, s, req);
    const sc = scoreObs(o, s.hookType);
    const r2 = rng.fork(`rest-${s.key}-${v.n}`);
    const vars = { beatsRequired: req, aiPhoto: s.bounty.category === 'ai_photo', duplicate: false, dupPool: 12 + r2.int(0, 140) };
    const reviewerUser = s.brand.reviewers[0]?.user?.id;
    const checks = buildChecks(r2, o, v.reason, vars, reviewerUser);
    const counts = { pass: 0, warn: 0, fail: 0 };
    for (const c of checks) counts[c.result]++;
    const durS = o.wrongFormat ? 47 : o.flow.duration_s;
    v.analysis = { obs: o, sc, checks, counts, durS, phash: hexString(r2, 16) };
    v.hookPts = sc.hook.points; v.hookBand = sc.hook.band; v.flowPts = sc.flow.points; v.flowBand = sc.flow.band;
    analyses.push(v.analysis);
  }
  // current-version scores on the submission
  for (const s of W.subs) {
    const v = s.vers[s.vers.length - 1];
    s.flowBand = v.flowBand; s.flowPts = v.flowPts; s.hookBand = v.hookBand; s.hookPts = v.hookPts;
  }
  return analyses;
}

/** the burned-in caption shows the first words of the hook that fit on two lines (42 characters), never a cut-off word */
function onScreenCaption(text) {
  if (text.length <= 42) return text;
  const words = text.split(' ');
  let out = '';
  for (const w of words) { if (`${out} ${w}`.trim().length > 42) break; out = `${out} ${w}`.trim(); }
  return out.replace(/[,.;:!?-]+$/, '');
}

/** assemble the analysis row parts that need structure (transcript, scenes, beats, tags) */
export function composeAnalysis(W, s, v, r) {
  const a = v.analysis;
  const o = a.obs;
  const durMs = a.durS * 1000;
  const app = s.app;
  const brief = s.bounty.brief;
  const feature = s.bounty.feature;
  const catDef = s.bounty.catDef;
  const beats = brief.beats.map((b) => b.beat);
  // which beats are found: the first beats_found required beats in order; optional ones usually found
  const requiredBeats = brief.beats.filter((b) => b.required).map((b) => b.beat);
  const missing = new Set(requiredBeats.slice(requiredBeats.length - (o.flow.beats_required - o.flow.beats_found)));
  if (o.offerMissing) missing.add('offer');
  const present = beats.filter((b) => !missing.has(b));
  // timeline across duration
  const order = BEAT_ORDER.filter((b) => present.includes(b));
  const seg = [];
  const hookEnd = Math.min(durMs * 0.2, o.hook.lands_ms + 2200);
  let cursor = Math.min(o.hook.speech_ms, 1500);
  const slice = (durMs - cursor) / Math.max(1, order.length);
  const lineFor = (beat, i) => {
    const vars = { app: app.name, feature, activity: catDef.activity, pain: catDef.pain, outcome: catDef.outcome, noun: catDef.noun, days: String(app.def.pricing.trial_days || 7) };
    if (beat === 'hook') return s.hookText;
    if (beat === 'offer') return fill(r.pick(OFFER_LINES), vars);
    if (beat === 'cta') return fill(r.pick(CTA_LINES[s.bounty.ctaType] ?? CTA_LINES.link_in_bio), { code: 'YOURCODE', days: vars.days, app: app.name });
    const pool = TRANSCRIPT_LINES[beat] ?? TRANSCRIPT_LINES.demo;
    return fill(r.pick(pool), vars);
  };
  order.forEach((beat, i) => {
    const start = i === 0 ? cursor : Math.round(cursor + i * slice);
    const end = i === order.length - 1 ? durMs - 800 : Math.round(cursor + (i + 1) * slice - 400);
    if (end > start) seg.push({ t_start_ms: Math.round(start), t_end_ms: Math.round(end), text: lineFor(beat, i) });
  });
  if (o.flow.disclosure_audio) {
    const st = Math.max(0, durMs - 4200);
    seg.push({ t_start_ms: st, t_end_ms: Math.min(durMs, st + 2600), text: fill(r.pick(TRANSCRIPT_LINES.disclosure), { app: app.name }) });
  }
  seg.sort((x, y) => x.t_start_ms - y.t_start_ms);
  // keep segments non-overlapping
  for (let i = 1; i < seg.length; i++) if (seg[i].t_start_ms < seg[i - 1].t_end_ms) seg[i - 1].t_end_ms = Math.max(seg[i - 1].t_start_ms + 400, seg[i].t_start_ms - 50);
  const onscreen = [{ t_start_ms: Math.round(o.hook.onscreen_ms), t_end_ms: Math.round(o.hook.onscreen_ms + 2400), text: onScreenCaption(s.hookText), in_safe_zone: o.hook.captions_in_safe_zone }];
  if (o.flow.disclosure_onscreen) onscreen.push({ t_start_ms: Math.max(0, durMs - 5200), t_end_ms: Math.max(0, durMs - 2800), text: `#ad Paid partnership with ${app.name}`, in_safe_zone: true });
  onscreen.push({ t_start_ms: Math.round(Math.min(durMs - 3000, (o.hook.app_ms ?? 3000) + 200)), t_end_ms: Math.round(Math.min(durMs - 1000, (o.hook.app_ms ?? 3000) + 2600)), text: app.name, in_safe_zone: true });
  const scenes = [];
  const kindSeq = s.format.faceless ? ['slide', 'text_card', 'slide', 'screen_recording', 'slide'] : ['face', 'screen_recording', 'broll', 'screen_recording', 'face'];
  const n = Math.max(3, Math.min(5, Math.round(durMs / 6500)));
  for (let i = 0; i < n; i++) scenes.push({ t_start_ms: Math.round((durMs / n) * i), t_end_ms: Math.round((durMs / n) * (i + 1)), kind: kindSeq[i % kindSeq.length] });
  const hook = { text: s.hookText, hook_type: s.hookType, lands_at_ms: o.hook.lands_ms, ...(o.hook.faceless ? {} : { face_at_ms: o.hook.face_ms }), ...(o.hook.app_ms != null ? { app_at_ms: o.hook.app_ms } : {}), caption_at_ms: o.hook.onscreen_ms, spoken_matches_onscreen: o.hook.spoken_matches_onscreen };
  const beatHits = brief.beats.map((b) => {
    const found = !missing.has(b.beat);
    const base = b.beat === 'hook' ? o.hook.lands_ms : b.beat === 'app_reveal' ? o.hook.app_ms : Math.round((durMs / (brief.beats.length + 1)) * (brief.beats.findIndex((x) => x.beat === b.beat) + 1));
    return { beat: b.beat, required: b.required, found, ...(found ? { t_ms: Math.round(base) } : {}) };
  });
  const hookWords = s.hookText.split(/\s+/).slice(0, 4).join(' ').replace(/[,.;:!?"]+$/, '');
  const tags = { format_id: s.formatId, hook_type: s.hookType, hook_words: hookWords, time_to_app_reveal_ms: Math.round(o.hook.app_ms ?? 9000), cta_type: s.bounty.ctaType };
  return { transcript: seg, onscreen, scenes, hook, beats: beatHits, tags, durMs };
}
