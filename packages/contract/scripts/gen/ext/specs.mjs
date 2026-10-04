// Spec Market: pre-made, pre-scored videos. Ten are approved-but-unused submissions released from bounties (the original brand keeps
// first refusal for 7 days); twenty are creator uploads.

import { iso, ms, addDays, artSeed, fill, hoursAgo, clamp, between, sentenceCase } from '../lib.mjs';
import * as P from '../pools.mjs';
import { bandFor } from '../../../schema/formulas.mjs';
import { rightsCard, roundTo } from './util.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const FORMAT_TITLE = { tmpl_results_update: 'Day 7 results update', tmpl_reply_comment: 'Reply: does this really work?', tmpl_faceless_slideshow: 'Faceless tips, five slides', tmpl_free_trial_lead: 'Free trial lead: seven days', tmpl_confession: 'I owe this app an apology', tmpl_hidden_gem: 'Slept-on feature, one tap', tmpl_green_screen: 'The 3-second open' };
const CATEGORY_TITLES = {
  ai_photo: ['The 20-second glow-up', 'Before and after, no filter', 'Retouch it live, one tap', 'Camera roll rescue'],
  ai_assistant: ['Morning pages, but fast', 'Draft to done in ten minutes', 'Five prompts that actually work', 'Inbox cleared before coffee'],
  fitness: ['My first run with a coach', 'Rep counting, no spreadsheet', 'Ten minutes, no excuses', 'Recovery day with a plan'],
  language: ['Study with me, 25 minutes', 'Day one, out loud', 'Ordering lunch in a new language', 'Pronunciation score, live'],
  productivity: ['Sunday reset in one app', 'Plan the day in 60 seconds', 'Focus session, start to finish', 'Notes that file themselves'],
  finance: ['Subscription audit, live', 'Budget in ten seconds', 'Where my paycheck went', 'The bill I almost missed'],
  sleep_mind: ['Night routine, calmer', 'Five calm minutes', 'Asleep before the story ends', 'A calmer Monday'],
  music_audio: ['Beat in five minutes', 'Chord detector, live', 'Learn the riff by ear', 'Loop pack challenge'],
  lifestyle: ['Plan the trip, split the cost', 'Pantry scan, no waste', 'What is for dinner, solved', 'Weekend trip in ten minutes'],
};
// a second round of titles per category, so thirty specs rarely need a "take 2"
const MORE_TITLES = {
  ai_photo: ['One-tap relight, real photo', 'Background swap in five seconds', 'Headshot from six selfies', 'Retouch, but still me'],
  ai_assistant: ['Reply in my voice', 'Meeting notes without the meeting', 'Research with sources', 'The email I kept putting off'],
  fitness: ['Couch to 5K, week one', 'Form check from my phone', 'Streak day thirty', 'The gym timer I actually use'],
  language: ['Ten phrases for the airport', 'Flashcards from my camera', 'Talking to an AI tutor', 'Five-minute daily lesson'],
  productivity: ['Inbox zero in one Sunday', 'The weekly review in ten minutes', 'Blocking apps for a deadline', 'Handwriting to text, live'],
  finance: ['Round-ups, one month in', 'Cancel what I forgot', 'The price-hike alert', 'A goal bucket for the trip'],
  sleep_mind: ['Sleep stories for adults', 'Breath coach before bed', 'Mood log in thirty seconds', 'The smart alarm test'],
  music_audio: ['Drum pattern from a hum', 'Slow it down, learn the solo', 'Voice memo to loop', 'Export stems, no fuss'],
  lifestyle: ['Shared itinerary, zero arguments', 'Chore rotation that sticks', 'Leftovers into dinner', 'Plant care reminders'],
};
for (const [k, list] of Object.entries(MORE_TITLES)) CATEGORY_TITLES[k].push(...list);
const usedTitles = new Set();
function specTitle(formatId, catKey, catLabel) {
  const options = [...(CATEGORY_TITLES[catKey] ?? []), FORMAT_TITLE[formatId]].filter(Boolean);
  const free = options.find((t) => !usedTitles.has(t));
  const title = free ?? `${options[0] ?? 'Ready-made video'}, take 2`;
  usedTitles.add(title);
  return title;
}
const CTAS = ['link_in_bio', 'use_code', 'try_free', 'download_now', 'search_app_store', 'comment_for_link'];
const HOOK_WORDS = { confession: 'I was wrong about', curiosity_gap: 'Wait until you see', specific_number: 'I used it for', pov: 'POV: you finally', direct_question: 'Why is nobody talking', risk_reversal: 'I did not pay for', pattern_interrupt: 'Stop scrolling.' };

function priceFor(points, r, released) {
  const dollars = points >= 85 ? r.float(110, 240) : points >= 70 ? r.float(58, 130) : r.float(28, 72);
  return clamp(roundTo(dollars * 100 * (released ? 0.6 : 1), 500), 1500, 50000);
}
function qaCounts(r, clean) {
  const fail = clean ? 0 : r.chance(0.3) ? 1 : 0;
  const warn = clean ? r.int(0, 2) : r.int(1, 3);
  return { qa_pass: 14 - fail - warn, qa_warn: warn, qa_fail: fail };
}
function videoMeta(r, idx, durationMs, art, uploadedAt) {
  return { asset_id: `vid_spec_${String(idx).padStart(3, '0')}`, duration_ms: durationMs, width: 1080, height: 1920, size_bytes: Math.round(durationMs * r.float(560, 780)), fps: 30, has_captions: true, language: 'en', art, uploaded_at: uploadedAt };
}

export function genSpecs(W, rng) {
  usedTitles.clear();
  const now = W.now;
  const rows = [];
  const brandsPro = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free');
  const makeLicenses = (spec, n, r, paidDays, exclusive) => {
    const pool = brandsPro.filter((b) => b.id !== spec.source_brand_id);
    return r.sample(pool, n).map((b, i) => {
      const at = iso(Math.min(ms(now) - 3 * 3_600_000, ms(spec.listed_at ?? spec.created_at) + (i + 1) * r.int(20, 90) * 3_600_000));
      return { brand_id: b.id, licensed_at: at, price_cents: spec.price_cents, paid_ads_days: paidDays, ends_at: addDays(at, paidDays), ...(exclusive ? {} : {}) };
    });
  };

  // ── released from bounties ─────────────────────────────────────────────────────────────────────────────
  const released = W.subs
    .filter((s) => s.status === 'released')
    .map((s) => ({ s, at: s.released_at ?? addDays(s.approved_at ?? s.submitted_at, W.C.review.unused_release_days) }))
    .filter((x) => ms(x.at) <= ms(now))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const recent = released.filter((x) => ms(now) - ms(x.at) < W.C.review.first_refusal_days * 86_400_000);
  const older = released.filter((x) => ms(now) - ms(x.at) >= W.C.review.first_refusal_days * 86_400_000);
  const chosen = [...recent.slice(0, 1), ...older.slice(0, 9)].slice(0, 10);
  const releasedStatuses = ['first_refusal', 'licensed', 'licensed', 'listed', 'listed', 'listed', 'listed', 'listed', 'listed', 'withdrawn'];
  chosen.forEach(({ s, at }, k) => {
    const r = rng.fork(`spec:rel:${s.id}`);
    const cur = s.versions[s.versions.length - 1];
    const bounty = W.bountyById.get(s.bounty_id);
    const app = W.appById.get(s.app_id);
    const analysis = (W.analysesBySub.get(s.id) ?? []).find((a) => a.version === cur.version) ?? (W.analysesBySub.get(s.id) ?? [])[0];
    const hookText = analysis?.hook?.text ?? fill(pick(r, P.HOOK_TEMPLATES.confession), { app: app?.name ?? 'the app', noun: 'app', activity: 'it', pain: 'it', outcome: 'it', feature: 'it', days: '7', number: 'three' });
    const hookType = analysis?.hook?.hook_type ?? analysis?.tags?.hook_type ?? 'confession';
    const status = recent.length && k === 0 ? 'first_refusal' : releasedStatuses[1 + ((k - (recent.length ? 1 : 0)) % (releasedStatuses.length - 1))] ?? 'listed';
    let st = status;
    if (cur.flow_points < W.C.specs.min_flow_points_to_list && ['listed', 'licensed'].includes(st)) st = 'withdrawn';
    if (st === 'licensed' && ms(now) - ms(at) < 12 * 86_400_000) st = 'listed';
    const price = priceFor(cur.flow_points, r, true);
    const paidDays = Math.min(90, s.rights_card?.paid_ads_days || 90);
    const exclusive = st === 'licensed' && r.chance(0.5);
    const art = cur.video?.art ?? artSeed(r, { pattern: 'stripes', label: hookText });
    const spec = {
      _sort: at,
      creator_id: s.creator_id, title: specTitle(s.format_id, app?.category ?? 'lifestyle', P.CATEGORIES.find((c) => c.key === app?.category)?.label ?? 'App'), description: `Released after 30 days unused on ${bounty?.title ?? 'a bounty'}. ${app?.name ?? 'The app'} had first refusal for 7 days. Already approved by the brand, so it passed their review: ${cur.qa_warn ? `${cur.qa_warn} minor warning${cur.qa_warn > 1 ? 's' : ''} on file` : 'a clean QA pass'}.`,
      status: st, source: 'released_from_bounty', art: { ...art, pattern: art.pattern === 'orbs' ? 'stripes' : art.pattern },
      video: { ...cur.video },
      ...(s.format_id ? { format_id: s.format_id } : {}),
      hook_text: hookText, hook_type: hookType, category: app?.category ?? 'lifestyle', flow_band: cur.flow_band, flow_points: cur.flow_points, hook_band: cur.hook_band, hook_points: cur.hook_points,
      qa_pass: cur.qa_pass, qa_warn: cur.qa_warn, qa_fail: cur.qa_fail,
      tags: { ...(s.format_id ? { format_id: s.format_id } : {}), hook_type: hookType, hook_words: analysis?.tags?.hook_words ?? HOOK_WORDS[hookType], time_to_app_reveal_ms: analysis?.tags?.time_to_app_reveal_ms ?? r.int(1800, 3600), cta_type: analysis?.tags?.cta_type ?? pick(r, CTAS) },
      price_cents: price, paid_ads_days: paidDays, exclusive, rights_card: rightsCard({ brandName: 'The licensing brand', paid_ads_days: paidDays, exclusivity_days: exclusive ? 30 : 0 }),
      source_submission_id: s.id, source_bounty_id: s.bounty_id, source_brand_id: s.brand_id, first_refusal_ends_at: addDays(at, W.C.review.first_refusal_days),
      ...(st === 'listed' || st === 'licensed' ? { listed_at: addDays(at, W.C.review.first_refusal_days) } : {}),
      created_at: at, updated_at: st === 'first_refusal' ? hoursAgo(r.int(2, 60)) : iso(Math.min(ms(now) - 3_600_000, ms(addDays(at, 8)))),
    };
    spec.licenses = st === 'licensed' ? makeLicenses({ ...spec, listed_at: spec.listed_at }, exclusive ? 1 : r.int(1, 2), r, paidDays, exclusive) : [];
    spec.stats = { previews: r.int(14, 190), saves: r.int(1, 26), licenses: spec.licenses.length };
    rows.push(spec);
  });

  // ── creator uploads ────────────────────────────────────────────────────────────────────────────────────
  const uploadStatuses = ['licensed', 'licensed', 'licensed', 'licensed', 'listed', 'listed', 'listed', 'listed', 'listed', 'listed', 'listed', 'listed', 'listed', 'scoring', 'scoring', 'scoring', 'draft', 'draft', 'withdrawn', 'withdrawn'];
  const need = 30 - rows.length;
  const creators = W.creators.filter((c) => c.reliability_score >= 70 && W.tierRank(c.tier) >= 0);
  for (let k = 0; k < need; k++) {
    const r = rng.fork(`spec:up:${k}`);
    const creator = creators[(k * 11 + 3) % creators.length];
    const status = uploadStatuses[k % uploadStatuses.length];
    const nicheKey = creator.niches?.[0];
    const catKeys = P.NICHES.find((n) => n.key === nicheKey)?.categories ?? ['lifestyle'];
    const catKey = catKeys[k % catKeys.length];
    const cat = P.CATEGORIES.find((c) => c.key === catKey) ?? P.CATEGORIES[0];
    const apps = P.APPS.filter((a) => a.category === catKey);
    const app = pick(r, apps);
    const hookType = pick(r, Object.keys(P.HOOK_TEMPLATES));
    const hookText = sentenceCase(fill(pick(r, P.HOOK_TEMPLATES[hookType]), { app: app.name, feature: app.features[0].toLowerCase(), noun: cat.noun, activity: cat.activity, pain: cat.pain, outcome: cat.outcome, days: String(app.pricing.trial_days), number: pick(r, P.HOOK_NUMBER_WORDS) }));
    const listedLike = ['listed', 'licensed'].includes(status);
    const flow = Math.round(clamp(listedLike ? r.normal(74, 8) : r.normal(66, 12), listedLike ? 56 : 38, 96));
    const hook = Math.round(clamp(flow + r.normal(2, 6), 38, 97));
    const fmts = P.FORMAT_DEFS.filter((f) => f.hook_types.includes(hookType) && f.categories.includes(catKey));
    const fmt = (fmts.length ? fmts : P.FORMAT_DEFS)[r.int(0, (fmts.length ? fmts : P.FORMAT_DEFS).length - 1)];
    const createdAt = between(r, W.maxIso([creator.joined_at, '2026-07-20T00:00:00Z']), hoursAgo(r.int(30, 24 * 12)));
    const dur = r.int(16_500, 29_500);
    const art = artSeed(r, { pattern: k % 2 ? 'waves' : 'stripes', hue: undefined, label: hookText });
    const paidDays = 90;
    const exclusive = status === 'licensed' && r.chance(0.35);
    const price = priceFor(flow, r, false);
    const qa = qaCounts(r, listedLike);
    const spec = {
      _sort: createdAt,
      creator_id: creator.id, title: specTitle(fmt.id, catKey, cat.label),
      description: `${sentenceCase(fmt.name.toLowerCase())}, made without a brief for ${cat.label.toLowerCase()} apps. ${fmt.summary} Shot on a phone, captions burned in, #ad and your app name added at licence time.`,
      status, source: 'creator_upload', art, video: videoMeta(r, k + 1, dur, art, createdAt), format_id: fmt.id,
      hook_text: hookText, hook_type: hookType, category: catKey, flow_band: bandFor(flow), flow_points: flow, hook_band: bandFor(hook), hook_points: hook, ...qa,
      tags: { format_id: fmt.id, hook_type: hookType, hook_words: HOOK_WORDS[hookType], time_to_app_reveal_ms: r.int(1700, 4200), cta_type: pick(r, fmt.cta) },
      price_cents: price, paid_ads_days: paidDays, exclusive, rights_card: rightsCard({ brandName: 'The licensing brand', paid_ads_days: paidDays, exclusivity_days: exclusive ? 30 : 0 }),
      ...(listedLike ? { listed_at: iso(Math.min(ms(now) - 3_600_000, ms(createdAt) + r.int(2, 30) * 3_600_000)) } : {}),
      created_at: createdAt, updated_at: status === 'scoring' ? hoursAgo(r.int(1, 8)) : status === 'draft' ? hoursAgo(r.int(10, 200)) : iso(Math.min(ms(now) - 3_600_000, ms(createdAt) + r.int(30, 500) * 3_600_000)),
    };
    spec.licenses = status === 'licensed' ? makeLicenses(spec, exclusive ? 1 : r.int(1, 3), r, paidDays, exclusive) : [];
    if (status === 'licensed' && spec.licenses.length) spec.updated_at = spec.licenses[spec.licenses.length - 1].licensed_at;
    spec.stats = { previews: status === 'draft' || status === 'scoring' ? 0 : r.int(9, 240), saves: status === 'draft' || status === 'scoring' ? 0 : r.int(0, 31), licenses: spec.licenses.length };
    rows.push(spec);
  }
  rows.sort((a, b) => (a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0));
  return rows.map(({ _sort, ...rest }, i) => ({ id: `spec_${String(i + 1).padStart(3, '0')}`, ...rest }));
}
