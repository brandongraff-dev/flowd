// Content tables: formats, hooks, Academy (lessons + progress), trends, changelog, testimonials, case studies, ML models, audits.
// The words come from pools-content.mjs / pools-text.mjs; every number that can be derived from the core fixtures is.

import { NOW, iso, ms, hoursAgo, daysAgo, artSeed, fill, fmtInt, fmtCompact, sentenceCase, median, groupBy, sum, uniq, slugify, hueOfHex, initials, clamp, round2 } from '../lib.mjs';
import * as P from '../pools.mjs';
import { priceCurve } from '../../../schema/formulas.mjs';
import { APPROVED_SUB } from './world.mjs';
import { LESSON_BLOCKS } from './lessons.mjs';

const CATEGORY_BY_KEY = new Map(P.CATEGORIES.map((c) => [c.key, c]));
const ALL_FORMATS = P.FORMAT_DEFS.map((f) => f.id);
const PATTERN_CYCLE = ['orbs', 'waves', 'spark', 'rings', 'grid', 'stripes'];
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
export const categoryByKey = (k) => CATEGORY_BY_KEY.get(k);

// ── formats ─────────────────────────────────────────────────────────────────────────────────────
/** A hook template that needs only {app} / {feature}, used to pre-fill the example scripts. */
function simpleHookFor(type) {
  const t = P.HOOK_TEMPLATES[type] ?? P.HOOK_TEMPLATES.confession;
  return t.find((x) => !/\{(noun|activity|pain|outcome|days|number)\}/.test(x)) ?? t[0];
}
/** Pre-fill every slot of an example script except {app} and {feature} with a neutral, honest default. */
function prefillScript(script, def) {
  const generic = {
    hook: simpleHookFor(def.hook_types[0]), noun: 'app', activity: 'doing it the hard way', pain: 'losing an hour to the same chore', outcome: 'the result I actually wanted', days: '7', cta: 'Link in my bio.',
  };
  return script.replace(/\{(hook|noun|activity|pain|outcome|days|cta)\}/g, (_m, k) => generic[k]);
}

/**
 * Hand-written example scripts, one per format. {app} and {feature} are the only slots (the Studio fills them from the bounty's app);
 * square brackets are stage directions and prompts for the creator's own real detail. Timecodes follow the format's beat structure.
 */
const FORMAT_SCRIPTS = {
  tmpl_screen_reaction: [
    '[0:00 · face to camera] I was wrong about every app I tried before {app}.',
    '[0:02 · cut to screen recording, face cam in the corner] So I opened {app} for the first time and tapped {feature}.',
    '[0:04 · demo, no cuts] Okay, watching what it does with my own stuff.',
    '[0:14 · reaction] Wait. No. That is exactly what I wanted, in one tap.',
    '[0:18 · result full-frame, hold two seconds] Look at that.',
    '[0:23 · face] There is a free trial, so you can try it before you pay for anything.',
    '[0:26 · face, link on screen] Link in my bio.',
  ].join('\n'),
  tmpl_hidden_gem: [
    '[0:00 · face] This app is so slept on, I almost feel bad telling you about it.',
    '[0:03 · screen recording] It is {app}, and it has {feature}.',
    '[0:05 · demo, one feature only] Watch this: one tap and it is done. I do not know how I lived without it.',
    '[0:16 · proof, your real before and after] Before: [your real number]. After: [your real number].',
    '[0:21 · face] And it is free to try, so there is nothing to lose.',
    '[0:24 · face] Link in my bio.',
  ].join('\n'),
  tmpl_confession: [
    '[0:00 · face] I did not expect to use {app} every single day, but here we are.',
    '[0:03 · b-roll of the problem] I used to think apps like this were a waste of money. I would download one, forget it and move on.',
    '[0:08 · screen recording] Then I tried {app}.',
    '[0:10 · demo, one real moment from your week] This is {feature}. Last week I used it for [the real thing you did] and it took about a minute.',
    '[0:20 · face] Where am I now? [One honest sentence about the result.] Still using it.',
    '[0:25 · face, code on screen] Use my code or the link in my bio.',
  ].join('\n'),
  tmpl_problem_solution: [
    '[0:00 · face or b-roll] Every week I lose an hour to [the chore you really hate].',
    '[0:04 · screen recording] Here is how {app} fixes it.',
    '[0:07 · demo, one workflow start to finish] You open it, tap {feature}, and that is the whole job.',
    '[0:17 · result close-up] [Show the number or the finished thing.] That hour is now about five minutes.',
    '[0:23 · face] It is free to try, so you can check my math.',
    '[0:26 · face] Link in my bio.',
  ].join('\n'),
  tmpl_faceless_slideshow: [
    'Slide 1 (0:00): "I tested [five] apps so you do not have to. One stayed."',
    'Slides 2 and 3 (0:03): "Most apps want your attention." / "I only keep the ones that are fast, honest and easy to quit."',
    'Slide 4 (0:09): "{app}" with a screenshot of {feature}.',
    'Slides 5 and 6 (0:13): a screenshot of the result and one real number from your own use.',
    'Slide 7 (0:20): "Free to try. Cancel any time."',
    'Last slide (0:24): "Comment LINK and I will send it."',
  ].join('\n'),
  tmpl_green_screen: [
    '[0:00 · green screen: the store page or a comment, point at it] Someone asked me if {app} is actually worth it.',
    '[0:03 · talk over the screenshot] Here is the thing: it does {feature}, and most apps in this space do not.',
    '[0:12 · cut to your phone] Watch. [Live demo of {feature}, no cuts.]',
    '[0:19 · face] The trial is free and the price after it is on the screen, no surprises.',
    '[0:23 · face] Link in my bio.',
  ].join('\n'),
  tmpl_results_update: [
    '[0:00 · face] Day [7 or 30] of using {app}. Here is the real update.',
    '[0:03 · before, on screen] This was me before: [one honest line and a screenshot].',
    '[0:08 · now, on screen] This is me now: [the same screenshot or number, updated].',
    '[0:12 · screen recording] The thing that did it was {feature}.',
    '[0:20 · face] Honestly? [One thing that changed and one thing that did not.]',
    '[0:25 · face] Link in my bio if you want to follow along.',
  ].join('\n'),
  tmpl_identity_shift: [
    '[0:00 · face] I became someone who [the new habit], and I did not see it coming.',
    '[0:03 · b-roll of the old routine] Six months ago I was the person who [the old habit, one honest line].',
    '[0:08 · screen recording] What changed was {app}.',
    '[0:12 · the habit in action] Every [morning or evening] I open it and use {feature}. It takes about [your real time].',
    '[0:20 · face, end on the win] Now I am someone who [the new habit]. Small, but it stuck.',
    '[0:25 · face] Link in my bio.',
  ].join('\n'),
  tmpl_free_trial_lead: [
    '[0:00 · face] You can try {app} free before paying for anything.',
    '[0:03 · screen recording] Here is what you get in the first minute: {feature}.',
    '[0:06 · quick demo, one feature, fast] Tap, tap, done.',
    '[0:16 · price screen] After the trial it is [read the real price off the app page], and you can cancel in two taps.',
    '[0:21 · face] Try it free. Link in my bio.',
  ].join('\n'),
  tmpl_reply_comment: [
    '[0:00 · reply-to-comment sticker, read it out loud] "Does {app} actually work or is it just hype?"',
    '[0:02 · face] Fair question. Let me show you instead of telling you.',
    '[0:03 · screen recording] This is {feature}. [Live demo, no cuts.]',
    '[0:15 · face] So yes, it works. One honest limit: [name one real thing it does not do].',
    '[0:21 · face] Comment "link" and I will send it.',
  ].join('\n'),
  tmpl_carousel_video: [
    'Slide 1 (0:00): "[One promise, one line.]"',
    'Slides 2 to 4 (0:03): three short tips, one idea each.',
    'Slide 5 (0:12): "Made with {app}" over a screenshot of {feature}.',
    'Slides 6 and 7 (0:16): the proof, a screenshot and one real number.',
    'Last slide (0:22): "Link in my bio."',
  ].join('\n'),
};

export function genFormats(W, rng) {
  const settled = W.settledPosts;
  const all = W.postStats(settled);
  const allDecided = W.subs.filter((s) => APPROVED_SUB.has(s.status) || s.status === 'rejected');
  const allApproval = allDecided.length ? allDecided.filter((s) => APPROVED_SUB.has(s.status)).length / allDecided.length : 0.74;
  const baseTrialRate = all.trial_rate > 0 ? all.trial_rate : 0.062;
  const baseViews = all.median_views > 0 ? all.median_views : 13800;
  return P.FORMAT_DEFS.map((def, i) => {
    const r = rng.fork(def.id);
    const mine = settled.filter((p) => p.tags?.format_id === def.id);
    const stats = W.postStats(mine);
    const subs = allDecided.filter((s) => s.format_id === def.id);
    const approval = subs.length >= 8 ? subs.filter((s) => APPROVED_SUB.has(s.status)).length / subs.length : clamp(allApproval + (def.lift - 1) * 0.12 + r.float(-0.03, 0.03), 0.4, 0.95);
    const enough = mine.length >= 8;
    const medianViews = enough ? stats.median_views : Math.round(baseViews * def.views_mult * r.float(0.96, 1.04));
    const trialRate = enough && stats.installs >= 30 ? stats.trial_rate : baseTrialRate * def.lift * r.float(0.97, 1.03);
    const byCat = P.CATEGORIES.map((cat) => {
      const inCat = mine.filter((p) => W.appById.get(p.app_id)?.category === cat.key);
      const cs = W.postStats(inCat);
      const prior = cat.install_to_trial * def.lift * (def.categories.includes(cat.key) ? 1.08 : 0.92);
      const k = 60; // pseudo-installs so thin cells lean on the prior
      return { category: cat.key, value: round2k((cs.trials + prior * k) / (cs.installs + k)) };
    });
    return {
      id: def.id,
      name: def.name,
      summary: def.summary,
      rank: def.rank,
      mvp: def.mvp,
      beats: def.beats.map(([beat, label, t0, t1, required, tip]) => ({ beat, label, t_start_s: t0, t_end_s: t1, required, tip })),
      min_duration_s: def.min_s,
      max_duration_s: def.max_s,
      difficulty: def.difficulty,
      faceless: def.faceless,
      best_for_categories: def.categories,
      best_for_niches: def.niches,
      hook_types: def.hook_types,
      recommended_cta: def.cta,
      example_script: FORMAT_SCRIPTS[def.id] ?? prefillScript(def.script, def),
      shot_list: def.shots,
      why_it_works: def.why,
      stats: {
        settled_posts: mine.length,
        median_views: medianViews,
        trial_rate: round4(trialRate),
        approval_rate: round4(approval),
        trial_rate_by_category: byCat,
      },
      art: artSeed(r, { pattern: PATTERN_CYCLE[i % PATTERN_CYCLE.length], label: def.name }),
    };
  });
}
const round4 = (x) => Math.round(x * 10000) / 10000;
const round2k = (x) => Math.round(x * 1000) / 1000;

// ── hooks ───────────────────────────────────────────────────────────────────────────────────────
const SLOT_RE = /\{([a-z_]+)\}/g;
/** one of the first two (headline) features, preferring the shorter one: it reads like a noun inside a hook */
function headlineFeature(app, r) {
  const two = app.features.slice(0, 2);
  const short = two.filter((f) => f.split(/\s+/).length <= 3);
  const list = short.length ? short : two;
  return list[r.int(0, list.length - 1)];
}
/**
 * Pains and outcomes as gerund phrases that read right inside every hook template ("POV: you stop {pain}", "Still {pain}?"): the pool
 * words for these categories are noun phrases or double negatives. First person here; second-person templates convert them.
 */
const PAIN_OVERRIDE = {
  music_audio: 'losing good ideas in a voice memo', lifestyle: 'planning in twelve different tabs', finance: 'wondering where my paycheck went', language: 'freezing in conversation',
};
const OUTCOME_OVERRIDE = { ai_assistant: 'a finished first draft' };
/** a believable number for the sentence it sits in (fifteen hours a week would be a lie, twelve seconds would not) */
const NUMBER_POOLS = [
  [/hours a week/, ['two', 'three', 'four', 'five']], [/minutes a day|extra minutes/, ['five', 'seven', '10', '12', '15', '20']], [/\{number\} seconds/, ['five', '10', '12', '15', '20', '30']],
  [/Under \{number\} minutes/, ['five', '10', '15', '20']], [/\{number\} steps/, ['three', 'five', '10', '12']], [/\{number\} things|\{number\} reasons|\{number\} apps|\{number\} \{noun\}s/, ['three', 'five', '10', '12']],
  [/\{number\} minutes\./, ['five', '10', '15']],
];
/**
 * The category activity as a gerund phrase ("I've been {activity} the hard way") and as a noun after "my" ("what {app} did to my {activity}").
 * The pool phrase for AI assistants ("writing and research") is not a gerund, so it is replaced.
 */
const ACTIVITY_WORDS = {
  ai_photo: { gerund: 'editing my photos', noun: 'photo editing' }, ai_assistant: { gerund: 'writing and researching', noun: 'writing' },
  fitness: { gerund: 'working out', noun: 'workouts' }, language: { gerund: 'learning a language', noun: 'language learning' },
  productivity: { gerund: 'planning my day', noun: 'daily planning' }, finance: { gerund: 'tracking my money', noun: 'budgeting' },
  sleep_mind: { gerund: 'winding down', noun: 'bedtime routine' }, music_audio: { gerund: 'making music', noun: 'beat making' },
  lifestyle: { gerund: 'planning my week', noun: 'weekly planning' },
};
const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** one to nine as words, ten and up as digits, so one sentence never mixes "Seven minutes" with "7 days" */
const numeral = (n) => (Number.isInteger(n) && n >= 0 && n <= 9 ? SMALL_NUMBERS[n] : String(n));
const isPlural = (f) => /(?<!s)s$/i.test(f.trim());
/** features that name one countable thing need an article inside a sentence ("the tone matcher"), the others read bare */
const COUNTABLE_FEATURE = /\b(matcher|blocker|finder|alarm|coach|log|machine|detector|player|scanner|timer|review|recorder)$/i;
const featureWithArticle = (feature, template, offset) => {
  if (!COUNTABLE_FEATURE.test(feature)) return feature;
  const before = template.slice(0, offset).trimEnd().split(/\s+/).pop().toLowerCase();
  if (/^(the|a|an|this|that|my|your)$/.test(before)) return feature;
  if (/^(has|have|had|got)$/.test(before)) return `${/^[aeiou]/i.test(feature) ? 'an' : 'a'} ${feature}`;
  return `the ${feature}`;
};
const capSentences = (s) => s.replace(/(^|[.!?]["']?\s+)([a-z])/g, (_m, p, ch) => p + ch.toUpperCase());
/**
 * Fill a hook template for a category and app. Questions, POVs and "you" templates turn "my" and "I" inside the category words into
 * "your" and "you"; a feature that is the grammatical subject ("{feature} is wild") must be singular, otherwise another feature stands in;
 * countable features get an article; numbers are words up to nine.
 */
export function fillHook(template, cat, app, r) {
  const second = /\b(you|your|we|friends?)\b/i.test(template) || /^(POV:|Still )/.test(template) || /\?\s*$/.test(template);
  const toYou = (s) => (second ? s.replace(/\bmy\b/g, 'your').replace(/\bI\b/g, 'you') : s);
  const subject = /\{feature\}\s+(is|was|does|are)\b/.test(template);
  let feature = lowerFirst(headlineFeature(app, r));
  if (subject && (isPlural(feature) || feature.split(/\s+/).length > 4)) {
    const alt = app.features.map((f) => lowerFirst(f)).find((f) => !isPlural(f) && f.split(/\s+/).length <= 4);
    feature = alt ?? app.name;
  }
  const words = ACTIVITY_WORDS[cat.key] ?? { gerund: cat.activity, noun: cat.activity };
  const afterMy = /\bmy \{activity\}/.test(template);
  const dayLabel = /\bday \{days\}/i.test(template);
  const body = template.replace(/\{feature\}/g, (_m, offset) => featureWithArticle(feature, template, offset));
  const values = {
    app: app.name, noun: cat.noun, activity: afterMy ? words.noun : toYou(words.gerund), pain: toYou(PAIN_OVERRIDE[cat.key] ?? cat.pain), outcome: toYou(OUTCOME_OVERRIDE[cat.key] ?? cat.outcome),
    days: dayLabel ? String(app.pricing.trial_days) : numeral(app.pricing.trial_days), number: r.pick(NUMBER_POOLS.find(([re]) => re.test(template))?.[1] ?? P.HOOK_NUMBER_WORDS),
  };
  return capSentences(sentenceCase(fill(body, values))).replace(/\ba AI\b/g, 'an AI');
}
const SLOT_NOTES = {
  number: 'Use a real number from your own week; a round one reads as made up.',
  days: 'State the trial length the app really has, in the first sentence.',
  feature: 'Name one feature, not the whole app.',
  pain: 'Say the pain the way you would say it to a friend.',
  outcome: 'Show the outcome on screen while you say it.',
  activity: 'Pick an activity your audience already does every week.',
};
const TYPE_NOTE = {
  confession: 'Keep it to one sentence and say it to camera.',
  curiosity_gap: 'Pay it off before 20 seconds or viewers feel tricked.',
  specific_number: 'Put the number on screen as text too.',
  pov: 'Film it over a screen recording so the app lands by 3 seconds.',
  direct_question: 'Answer the question before the demo ends.',
  risk_reversal: 'Say the trial and the cancel path in the same breath.',
  pattern_interrupt: 'Start mid-motion; cut the intro entirely.',
};

export function genHooks(W, rng) {
  const out = [];
  const typeStats = {};
  for (const type of Object.keys(P.HOOK_TEMPLATES)) {
    const mine = W.settledPosts.filter((p) => p.tags?.hook_type === type);
    const s = W.postStats(mine);
    const scores = mine.map((p) => W.subById.get(p.submission_id)?.hook_points).filter((x) => Number.isFinite(x));
    typeStats[type] = { n: mine.length, ...s, avg_hook: scores.length ? Math.round(sum(scores) / scores.length) : 68 };
  }
  const allStats = W.postStats(W.settledPosts);
  const catKeys = P.CATEGORIES.map((c) => c.key);
  for (const [type, templates] of Object.entries(P.HOOK_TEMPLATES)) {
    const ts = typeStats[type];
    const weights = templates.map((_, i) => 1 / (1 + i * 0.22));
    const wsum = sum(weights);
    const applies = P.FORMAT_DEFS.filter((f) => f.hook_types.includes(type)).map((f) => f.id);
    templates.forEach((template, i) => {
      const r = rng.fork(`hook:${type}:${i}`);
      const slots = uniq([...template.matchAll(SLOT_RE)].map((m) => m[1]));
      const cats = r.sample(catKeys, r.int(3, 4));
      const examples = cats.map((ck) => {
        const cat = CATEGORY_BY_KEY.get(ck);
        const apps = P.APPS.filter((a) => a.category === ck);
        const app = r.pick(apps);
        return { category: ck, text: fillHook(template, cat, app, r) };
      });
      const slotNote = slots.map((s) => SLOT_NOTES[s]).filter(Boolean)[0];
      const share = weights[i] / wsum;
      const baseViews = ts.median_views || allStats.median_views || 13000;
      const baseRate = ts.trial_rate || allStats.trial_rate || 0.062;
      out.push({
        id: `hook_${type}_${String(i + 1).padStart(2, '0')}`,
        hook_type: type,
        template,
        fill_slots: slots,
        applies_to: applies.length ? applies : ALL_FORMATS,
        examples,
        when_to_use: `${P.HOOK_WHEN_TO_USE[type]} ${slotNote ?? TYPE_NOTE[type]}`,
        stats: {
          uses: Math.max(3, Math.round(ts.n * share) + r.int(0, 2)),
          median_views: Math.round(baseViews * r.float(0.88, 1.14)),
          trial_rate: round4(baseRate * r.float(0.88, 1.14)),
          avg_hook_score: clamp(Math.round(ts.avg_hook + r.int(-4, 5)), 40, 96),
        },
      });
    });
  }
  return out;
}

// ── Academy ─────────────────────────────────────────────────────────────────────────────────────


export function genAcademy(W, rng) {
  const lessonSlugs = P.LESSON_OUTLINES.map((l) => `lsn_${slugify(l.slug)}`);
  const lessonByTopic = new Map(P.LESSON_OUTLINES.map((l, i) => [l.topic, { ...l, id: lessonSlugs[i], order: i + 1 }]));
  const reps = W.reputationByCreator;
  const anyBonus = [...reps.values()].some((r) => (r.academy_bonus_points ?? 0) > 0);
  const progress = [];
  const mayaPlan = ['first_video', 'briefs_and_rights', 'contract_red_flags', 'taxes', 'scams', 'rate_cards'];
  const mayaDates = ['2026-07-16T19:02:00Z', '2026-07-17T08:40:00Z', '2026-07-30T21:15:00Z', '2026-08-02T10:30:00Z', '2026-08-20T17:48:00Z', '2026-08-31T12:05:00Z'];
  const mayaId = W.maya?.id;
  const isGradOf = (c) => (c.badges ?? []).includes('academy_graduate');
  // How many lessons each creator completed: the core reputation rows credit 0.5 reliability points per lesson, so the two tables agree.
  // The table has a catalogue ceiling; if the credited lessons would pass it, non-graduates are trimmed in rounds (the E-01 warning then
  // names whose credit and progress differ, and the fix belongs in the core generator).
  const CEILING = 300;
  const planned = new Map();
  for (const c of W.creators) {
    const bonus = reps.get(c.id)?.academy_bonus_points;
    const fallback = rng.fork(`lsp:n:${c.id}`);
    if (c.id === mayaId) planned.set(c.id, 6);
    else if (isGradOf(c)) planned.set(c.id, 10);
    else if (anyBonus && bonus != null) planned.set(c.id, clamp(Math.round(bonus * 2), 0, 10));
    else planned.set(c.id, fallback.weighted([[0, 28], [1, 14], [2, 12], [3, 12], [4, 9], [5, 8], [6, 6], [7, 4], [8, 3], [10, 4]]));
  }
  let planTotal = sum([...planned.values()], (x) => x);
  const trimmable = W.creators.filter((c) => c.id !== mayaId && !isGradOf(c)).sort((a, b) => planned.get(b.id) - planned.get(a.id) || (a.id < b.id ? -1 : 1));
  for (let i = 0; planTotal > CEILING && trimmable.some((c) => planned.get(c.id) > 0); i++) {
    const c = trimmable[i % trimmable.length];
    if (planned.get(c.id) > 0) { planned.set(c.id, planned.get(c.id) - 1); planTotal--; }
  }
  for (const c of W.creators) {
    const r = rng.fork(`lsp:${c.id}`);
    let completed = [];
    let inProgress = null;
    const n = planned.get(c.id);
    const order = P.LESSON_OUTLINES.map((l) => l.topic);
    if (c.id === mayaId) completed = mayaPlan;
    else {
      // most creators go in order; some skip around
      const pool = r.chance(0.6) ? order : r.shuffle(order);
      completed = pool.slice(0, n);
    }
    if (c.id === mayaId) inProgress = 'analytics';
    else if (n < 10 && r.chance(0.3)) inProgress = order.find((t) => !completed.includes(t)) ?? null;
    const joined = ms(c.joined_at);
    completed.forEach((topic, k) => {
      const lesson = lessonByTopic.get(topic);
      let at;
      if (c.id === mayaId) at = mayaDates[k];
      else {
        const span = Math.max(DAY(2), ms(NOW) - joined - DAY(1));
        at = iso(joined + DAY(1) + Math.floor((span * (k + 1 + r.next() * 0.8)) / (completed.length + 1.5)));
        if (ms(at) > ms(NOW)) at = hoursAgo(r.int(2, 60));
      }
      const score = c.id === mayaId ? [1, 1, 0.67, 1, 1, 1][k] : r.weighted([[1, 62], [0.67, 38]]);
      progress.push({ creator_id: c.id, lesson_id: lesson.id, order: lesson.order, status: 'completed', quiz_score: score, started_at: addMinutes(at, -r.int(3, 11)), completed_at: at, badge_awarded: true });
    });
    if (inProgress) {
      const lesson = lessonByTopic.get(inProgress);
      const at = c.id === mayaId ? '2026-10-02T21:44:00Z' : hoursAgo(r.int(4, 24 * 9));
      progress.push({ creator_id: c.id, lesson_id: lesson.id, order: lesson.order, status: 'in_progress', started_at: at, badge_awarded: false });
    }
  }
  progress.sort((a, b) => (a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : a.order - b.order));
  const lessonProgress = progress.map((p, i) => {
    const { order, ...rest } = p;
    return { id: `lsp_${String(i + 1).padStart(4, '0')}`, ...rest };
  });
  const doneBy = groupBy(lessonProgress.filter((p) => p.status === 'completed'), 'lesson_id');
  const lessons = P.LESSON_OUTLINES.map((l, i) => {
    const r = rng.fork(`lesson:${l.topic}`);
    const done = doneBy.get(lessonSlugs[i]) ?? [];
    const scores = done.map((d) => d.quiz_score);
    const blocks = (LESSON_BLOCKS[l.topic] ?? l.blocks).map(([kind, title, body]) => (title ? { kind, title, body } : { kind, body }));
    return {
      id: lessonSlugs[i],
      slug: l.slug,
      topic: l.topic,
      order: i + 1,
      title: l.title,
      summary: l.summary,
      read_minutes: l.minutes,
      blocks,
      quiz: l.quiz.map(([prompt, options, answer_index, explanation]) => ({ prompt, options, answer_index, explanation })),
      badge_label: l.badge,
      badge_art: artSeed(r, { pattern: i % 2 ? 'spark' : 'rings', label: l.badge }),
      reliability_bonus_points: 0.5,
      completions: done.length,
      avg_quiz_score: scores.length ? round4(sum(scores) / scores.length) : 0.8,
      updated_at: `2026-09-${String(8 + (i % 18)).padStart(2, '0')}T10:00:00Z`,
    };
  });
  return { lessons, lesson_progress: lessonProgress };
}
const DAY = (d) => d * 86_400_000;
const addMinutes = (isoStr, m) => iso(ms(isoStr) + m * 60_000);

// ── trends ──────────────────────────────────────────────────────────────────────────────────────
export function genTrends(W, rng) {
  const out = [];
  P.TREND_DEFS.forEach((def, i) => {
    const r = rng.fork(`trend:${i}`);
    const matched = W.settledPosts.filter((p) => (def.format_id && p.tags?.format_id === def.format_id) || (def.hook_type && p.tags?.hook_type === def.hook_type) || (!def.format_id && !def.hook_type && def.categories.includes(W.appById.get(p.app_id)?.category)));
    const samples = def.format_id || def.hook_type ? matched.length : Math.round(matched.length * r.float(0.1, 0.22));
    // eight weekly usage points ending on the change ratio
    const last = r.int(70, 190);
    const prev = last / (1 + def.change);
    const pts = [last, prev];
    const drift = def.direction === 'rising' ? 0.9 : def.direction === 'fading' ? 1.1 : 1.0;
    for (let k = 2; k < 8; k++) pts.push(pts[k - 1] * drift * r.float(0.94, 1.06));
    const sparkline = pts.reverse().map((v) => Math.round(v * 10) / 10);
    sparkline[7] = last;
    sparkline[6] = Math.round(prev * 10) / 10;
    const row = {
      id: `trend_${String(i + 1).padStart(3, '0')}`,
      kind: def.kind,
      label: def.label,
      description: def.desc,
      why_it_works: def.why,
      direction: def.direction,
      weekly_change_ratio: def.change,
      sparkline,
      ...(def.format_id ? { format_id: def.format_id } : {}),
      ...(def.hook_type ? { hook_type: def.hook_type } : {}),
      categories: def.categories,
      niches: def.niches,
      sample_posts: Math.max(def.kind === 'sound' ? 6 : 12, samples),
      ...(def.kind === 'sound' ? { sound_licensed_for_ads: def.sound } : {}),
      art: artSeed(r, { pattern: def.kind === 'sound' ? 'waves' : def.kind === 'topic' ? 'orbs' : PATTERN_CYCLE[(i + 2) % 6], label: def.label }),
      first_seen_at: daysAgo(r.int(21, 70)),
      updated_at: hoursAgo(r.int(3, 20)),
    };
    out.push(row);
  });
  // rank: rising first (strongest first), then steady, then fading
  const dirOrder = { rising: 0, steady: 1, fading: 2 };
  out.sort((a, b) => dirOrder[a.direction] - dirOrder[b.direction] || b.weekly_change_ratio - a.weekly_change_ratio);
  return out.map((t, i) => ({ ...t, id: `trend_${String(i + 1).padStart(3, '0')}` }));
}

// ── changelog, testimonials, case studies ───────────────────────────────────────────────────────
const CHANGELOG_AUDIENCE = {
  'flowd is live': [], 'First weekly payout run': ['creator'], 'Timecoded feedback': [], 'Brief Lint': ['brand'], 'View Ledger and one-tap disputes': ['creator'], 'Rate cards and direct offers': [],
  'Daily Drop': ['creator'], 'Instant cash-out': ['creator'], 'Tiers go live': ['creator'], 'Winner promotion': ['brand'], 'Tax Desk': ['creator'], 'Auto-approve with guardrails': ['brand'], 'Auctions and the Spec Market': [], 'Wellbeing Mode': ['creator'],
};
export function genChangelog() {
  const rows = P.CHANGELOG_DEFS.map(([date, title, body, tags], i) => ({
    id: `chg_${String(i + 1).padStart(3, '0')}`,
    date,
    title,
    body,
    tags,
    audience: CHANGELOG_AUDIENCE[title] ?? [],
    version: `1.${i}.0`,
  }));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function genTestimonials(W, rng) {
  return P.TESTIMONIAL_DEFS.map((d, i) => {
    const r = rng.fork(`tst:${i}`);
    return {
      id: `tst_${String(i + 1).padStart(2, '0')}`,
      kind: d.kind,
      quote: d.quote,
      author: d.author,
      role: d.role,
      ...(d.stat_label ? { stat_label: d.stat_label, stat_value: d.stat_value } : {}),
      avatar: artSeed(r, { pattern: d.kind === 'creator' ? 'orbs' : 'rings', label: initials(d.author.replace('.', '')) }),
      fictional: true,
    };
  });
}

export function genCaseStudies(W, rng) {
  const rows = [];
  P.CASE_STUDY_DEFS.forEach((d, i) => {
    const r = rng.fork(`case:${d.app}`);
    const app = W.apps.find((a) => W.appSlug(a) === d.app);
    if (!app) return;
    const brand = W.brandById.get(app.brand_id);
    const posts = W.postsByApp.get(app.id) ?? [];
    const f = posts.reduce((a, p) => ({ views: a.views + p.views, installs: a.installs + (p.funnel?.installs ?? 0), trials: a.trials + (p.funnel?.trials ?? 0), paid: a.paid + (p.funnel?.paid ?? 0) }), { views: 0, installs: 0, trials: 0, paid: 0 });
    const creators = new Set(posts.map((p) => p.creator_id)).size;
    const bounties = W.bounties.filter((b) => b.app_id === app.id);
    const spend = sum(bounties, (b) => b.spent_cents);
    const trialCost = f.trials > 0 ? Math.round(spend / f.trials) : 0;
    const firstPost = posts.length ? posts.map((p) => p.posted_at).sort()[0] : daysAgo(60);
    const periodDays = Math.max(14, Math.min(90, Math.round((ms(NOW) - ms(firstPost)) / 86_400_000)));
    const title = `${app.name}: ${fmtCompact(f.views)} views, ${fmtInt(f.trials)} trials`;
    const summary = `${d.angle} Over ${periodDays} days ${app.name} funded ${bounties.length} ${bounties.length === 1 ? 'bounty' : 'bounties'} on flowd. ${fmtInt(creators)} creators posted ${fmtInt(posts.length)} videos that earned ${fmtCompact(f.views)} verified views, ${fmtInt(f.installs)} tracked installs and ${fmtInt(f.trials)} tracked trials${f.paid ? `, ${fmtInt(f.paid)} of them converting to paid` : ''}. Tracked means link and code only; estimated conversions are reported separately and never paid.`;
    rows.push({
      id: `case_${String(rows.length + 1).padStart(2, '0')}`,
      app_id: app.id,
      brand_id: brand.id,
      title,
      summary,
      quote: d.quote,
      quote_author: d.author,
      quote_role: d.role,
      metrics: { views: f.views, installs: f.installs, trials: f.trials, paid: f.paid, spend_cents: spend, cost_per_trial_cents: trialCost, creators, period_days: periodDays },
      art: artSeed(r, { pattern: i % 2 ? 'waves' : 'orbs', hue: hueOfHex(app.brand_colors?.primary ?? '#6C63FF'), label: app.name }),
      fictional: true,
      published_at: iso(ms('2026-09-04T09:00:00Z') + i * 4 * 86_400_000),
    });
  });
  return rows;
}

// ── ML models ───────────────────────────────────────────────────────────────────────────────────
export function genMlModels(W, rng, ext = {}) {
  const settled = W.settledPosts;
  const settledN = settled.length;
    const bands = ['A', 'B', 'C', 'D', 'E'];
  const calibration = bands.map((band) => {
    const mine = settled.filter((p) => p.flow_band === band);
    const s = W.postStats(mine);
    return { band, count: mine.length, median_views: s.median_views, trial_rate: round4(s.trial_rate) };
  });
  // settled posts come from approved work, so the low bands are empty: compare with the lowest band that has at least five posts
  const lowBand = [...calibration].reverse().find((x) => x.count >= 5) ?? calibration[calibration.length - 1];
  const withTag = (k) => (settledN ? settled.filter((p) => p.tags?.[k] !== undefined && p.tags?.[k] !== null).length / settledN : 0);
  const mk = (kind, extra) => {
    const def = P.MODEL_DEFS.find((m) => m.kind === kind);
    const r = rng.fork(`mdl:${kind}`);
    return {
      id: `mdl_${kind}`,
      kind,
      name: def.name,
      version: def.version,
      stage: def.stage,
      description: def.description,
      trained_on_n: 0,
      metrics: [],
      calibration: [],
      drift_score: round4(r.float(0.02, 0.09)),
      jobs: { queue_depth: r.int(0, 6), jobs_24h: r.int(60, 220), failed_24h: r.int(0, 3), median_latency_s: round2(r.float(2.1, 38)) },
      tag_coverage: {},
      learned_ready_at_posts: 1000,
      last_run_at: hoursAgo(r.int(1, 6)),
      updated_at: hoursAgo(r.int(6, 40)),
      ...extra(r),
    };
  };
  const analysed = W.analyses.length;
  const confirmed = (ext.fraud_flags ?? []).filter((f) => f.status === 'confirmed').length;
  return [
    mk('video_understanding', (r) => ({
      metrics: [{ label: 'Videos analysed', value: analysed, unit: 'count' }, { label: 'Tags agreeing with human check (5% sample)', value: 0.91, unit: 'ratio' }, { label: 'Median processing time', value: 34.6, unit: 's' }, { label: 'Settled posts tagged', value: settledN, unit: 'posts' }],
      tag_coverage: { format: round4(withTag('format_id')), hook: round4(withTag('hook_type')), cta: round4(withTag('cta_type')) },
      jobs: { queue_depth: r.int(0, 4), jobs_24h: Math.max(40, Math.round(analysed / 90 * 1.6)), failed_24h: r.int(0, 2), median_latency_s: 34.6 },
    })),
    mk('hook_coach', () => ({ metrics: [{ label: 'On-device runs (24 h)', value: 412, unit: 'count' }, { label: 'Median on-device latency', value: 0.18, unit: 's' }, { label: 'Face detected within 1 s, agreement with human check', value: 0.94, unit: 'ratio' }], jobs: { queue_depth: 0, jobs_24h: 412, failed_24h: 0, median_latency_s: 0.18 } })),
    mk('auto_qa', () => ({ metrics: [{ label: 'Disclosure check precision', value: 0.97, unit: 'ratio' }, { label: 'Duplicate detection recall (phash distance 6)', value: 0.93, unit: 'ratio' }, { label: 'Warnings waived by brands', value: 0.11, unit: 'ratio' }] })),
    mk('fraud', () => ({ metrics: [{ label: 'Posts scored', value: W.posts.length, unit: 'posts' }, { label: 'Share scoring under 20', value: round4(W.posts.length ? W.posts.filter((p) => (p.fraud?.score ?? 0) < 20).length / W.posts.length : 0.92), unit: 'ratio' }, { label: 'Flags later cleared by a human (false positives)', value: 0.31, unit: 'ratio' }, { label: 'Confirmed clawbacks', value: confirmed || 3, unit: 'count' }] })),
    mk('creative_scorer', () => ({
      calibration,
      metrics: [{ label: 'Settled posts available to learn from', value: settledN, unit: 'posts' }, { label: 'Needed before a learned model runs in shadow', value: 1000, unit: 'posts' }, { label: `A-band median views vs ${lowBand.band}-band`, value: calibration[0].median_views && lowBand.median_views ? round2(calibration[0].median_views / lowBand.median_views) : 2.4, unit: 'x' }],
    })),
    mk('matching', () => ({ metrics: [{ label: 'Feed taps from the top five matches', value: 0.62, unit: 'ratio' }, { label: 'Median match score of submitted bounties', value: 74, unit: 'points' }, { label: 'Bounties with no eligible creator', value: 0, unit: 'count' }] })),
    mk('pricing', () => ({ metrics: [{ label: 'Median absolute error of fill-time estimate', value: 7.8, unit: 'hours' }, { label: 'Categories with thin markets (under 8 bounties)', value: 1, unit: 'count' }, { label: 'Median confidence shown', value: 0.58, unit: 'ratio' }] })),
    mk('fatigue', () => ({ metrics: [{ label: 'Alerts raised (30 d)', value: 5, unit: 'count' }, { label: 'Alerts acknowledged', value: 0.8, unit: 'ratio' }, { label: 'Winners refreshed after an alert', value: 2, unit: 'count' }] })),
  ].map((m) => ({ ...m }));
}

// ── App UGC audits ──────────────────────────────────────────────────────────────────────────────
const AUDIT_EXTERNAL = [
  { name: 'Sketchpad AI', tagline: 'Sketches to polished art in one tap', category: 'ai_photo', features: ['Sketch to render', 'Style packs', 'Batch export', 'Layered files'], colors: { primary: '#7B61FF', secondary: '#38BDF8', accent: '#FFC15E' }, trial_days: 7, claimed: null, creator: 'creator' },
  { name: 'Brewlog', tagline: 'Coffee tracking for people who overthink coffee', category: 'lifestyle', features: ['Brew timer', 'Bean library', 'Taste notes', 'Grinder presets'], colors: { primary: '#B5651D', secondary: '#F4A261', accent: '#2A9D8F' }, trial_days: 7, claimed: null, creator: 'brand' },
  { name: 'Paceline', tagline: 'Interval training that adapts to your week', category: 'fitness', features: ['Adaptive intervals', 'Heart-rate zones', 'Audio cues', 'Weekly recap'], colors: { primary: '#FF5E3A', secondary: '#FFC857', accent: '#3DE0FF' }, trial_days: 14, claimed: null, creator: 'brand' },
];
const AUDIT_CUSTOMERS = ['lumi', 'dozely', 'parlo', 'budgetbee', 'tasklane'];

function makeBrief(app, cat, trialDays) {
  const bits = P.BRIEF_BITS.default;
  const catBits = P.BRIEF_BITS[cat.key] ?? { talking: [], dos: [], donts: [] };
  const f0 = lowerFirst(app.features[0]);
  const vals = { app: app.name, feature: f0, days: String(trialDays), code: 'CODE' };
  const f = (s) => fill(s, vals);
  return {
    summary: `Show ${app.name} doing one real job for you, start to finish, in under 30 seconds. ${sentenceCase(cat.noun)} videos work best when the viewer sees the result before the pitch.`,
    talking_points: [...catBits.talking, ...bits.talking.slice(0, 3)].map(f),
    dos: [...catBits.dos, ...bits.dos.slice(0, 2)].map(f),
    donts: [...catBits.donts, ...bits.donts.slice(0, 2)].map(f),
    beats: [
      { beat: 'hook', label: 'Hook (first line, by 2 seconds)', required: true, hint: 'A confession, a number or a question.' },
      { beat: 'app_reveal', label: 'App on screen by 3 seconds', required: true },
      { beat: 'demo', label: `Demo ${f0}`, required: true, hint: 'Screen recording, 5 seconds or more.' },
      { beat: 'payoff', label: 'Show the result', required: true },
      { beat: 'offer', label: `State the ${trialDays}-day free trial once`, required: false },
      { beat: 'cta', label: 'One call to action', required: true },
    ],
    cta: 'Link in bio',
    offer_line: `Try it free for ${trialDays} days.`,
    hashtags: [`#${slugify(app.name).replace(/_/g, '')}`, ...(cat.niches.slice(0, 2).map((n) => `#${n.replace(/_/g, '')}`))],
    mentions: [],
    tone: 'Honest, specific and a little playful. Say what you actually did.',
    disclosure_text: `#ad Paid partnership with ${app.name}`,
    banned_claims: ['Guaranteed results', 'Best app ever', 'Works for everyone'],
  };
}

export function genAuditReports(W, rng) {
  const rows = [];
  const targets = [
    ...AUDIT_CUSTOMERS.map((slug) => ({ kind: 'customer', slug })),
    ...AUDIT_EXTERNAL.map((e) => ({ kind: 'external', ext: e })),
  ];
  targets.forEach((tgt, i) => {
    const r = rng.fork(`audit:${i}`);
    let app;
    let catKey;
    let trialDays;
    let claimed;
    let createdBy;
    if (tgt.kind === 'customer') {
      const a = W.apps.find((x) => W.appSlug(x) === tgt.slug) ?? P.APPS.find((x) => x.slug === tgt.slug);
      if (!a) return;
      app = { name: a.name, tagline: a.tagline, features: a.features, colors: a.brand_colors ?? a.colors, store: a.store_url ?? `https://apps.apple.com/us/app/${slugify(a.name)}/id${6_448_900_000 + i * 7919}`, id: a.id };
      catKey = a.category;
      trialDays = a.pricing?.trial_days ?? 7;
      claimed = a.brand_id ?? `br_${tgt.slug}`;
      createdBy = 'brand';
    } else {
      const e = tgt.ext;
      app = { name: e.name, tagline: e.tagline, features: e.features, colors: e.colors, store: `https://apps.apple.com/us/app/${slugify(e.name)}/id${6_449_100_000 + i * 6007}` };
      catKey = e.category;
      trialDays = e.trial_days;
      claimed = null;
      createdBy = e.creator;
    }
    const cat = CATEGORY_BY_KEY.get(catKey);
    const slug = `${slugify(app.name)}-${slugify(cat.noun)}`.replace(/_/g, '-');
    const clearing = W.clearing(catKey);
    const clearingCpm = clearing?.clearing_cpm_cents ?? cat.base_cpm_cents;
    const p25 = clearing?.p25_cpm_cents ?? Math.round(clearingCpm * 0.82);
    const p75 = clearing?.p75_cpm_cents ?? Math.round(clearingCpm * 1.18);
    const fillHours = clearing?.median_fill_hours ?? cat.median_fill_hours;
    const sampleN = clearing?.sample_n ?? 14;
    const medViews = clearing?.median_views ?? cat.median_views;
    const R = W.C.funnel_defaults;
    const q = R.views_quantile_ratio;
    const costPerTrial = (views, k) => {
      const trials = views * R.view_to_visit * R.visit_to_install * R.install_to_trial * k;
      const cost = (views * clearingCpm) / 1000 * (1 + 0.1) * 1.029;
      return Math.round(cost / Math.max(trials, 0.25));
    };
    // ten hooks across the seven types, strongest first
    const types = Object.keys(P.HOOK_TEMPLATES);
    const hooks = [];
    for (let k = 0; k < 10; k++) {
      const type = types[k % types.length];
      const t = P.HOOK_TEMPLATES[type][(k * 5 + i) % P.HOOK_TEMPLATES[type].length];
      const catWords = cat;
      const fmts = P.FORMAT_DEFS.filter((f) => f.hook_types.includes(type) && f.categories.includes(catKey));
      const fmt = (fmts.length ? fmts : P.FORMAT_DEFS.filter((f) => f.hook_types.includes(type)) ).concat(P.FORMAT_DEFS.slice(0, 1))[0];
      const fakeApp = { name: app.name, features: app.features, pricing: { trial_days: trialDays } };
      hooks.push({ text: fillHook(t, catWords, fakeApp, r), hook_type: type, format_id: fmt.id, hook_points: clamp(92 - k * 2 - r.int(0, 3), 58, 94) });
    }
    hooks.sort((a, b) => b.hook_points - a.hook_points);
    const suggested = P.FORMAT_DEFS.filter((f) => f.categories.includes(catKey)).sort((a, b) => b.lift - a.lift).slice(0, 4).map((f) => f.id);
    const readyPool = W.creators.filter((c) => c.niches.some((n) => cat.niches.includes(n)) && W.tierRank(c.tier) >= 1 && c.reliability_score >= 80);
    const ready = r.sample(readyPool.length >= 6 ? readyPool : W.creators.filter((c) => W.tierRank(c.tier) >= 1), 7).map((c) => c.id).sort();
    const price = priceCurve({ clearing_cpm_cents: clearingCpm, median_fill_hours: fillHours, sample_n: sampleN });
    const conf = round2(clamp(sampleN / (sampleN + 20) * 0.9, 0.2, 0.7));
    rows.push({
      id: `aud_${slugify(app.name)}`,
      slug,
      app_name: app.name,
      tagline: app.tagline,
      category: catKey,
      store_url: app.store,
      icon: artSeed(r, { pattern: i % 2 ? 'spark' : 'grid', hue: hueOfHex(app.colors.primary), label: app.name[0] }),
      og_art: artSeed(r, { pattern: 'waves', hue: hueOfHex(app.colors.primary), label: app.name }),
      brief: makeBrief(app, cat, trialDays),
      hooks,
      suggested_format_ids: suggested,
      predicted_cpm_cents: { low: p25, median: clearingCpm, high: p75 },
      expected_views_per_post: { low: Math.round(medViews * q.p25), median: medViews, high: Math.round(medViews * q.p75) },
      expected_cost_per_trial_cents: { low: costPerTrial(medViews, 1.6), median: costPerTrial(medViews, 1), high: costPerTrial(medViews, 0.55) },
      confidence: conf,
      price_curve: price,
      creators_ready: ready,
      assumptions: [
        `Clearing CPM for ${cat.label} is the median of ${sampleN} recent bounties; low and high are the 25th and 75th percentiles.`,
        'Views per post are the category median with the 25th and 75th percentile ratios (0.40x and 2.55x). Your creators will differ.',
        'Cost per trial uses tracked conversions only (link and code), the platform fee for the Pro plan, and card processing. Estimated conversions are excluded.',
        `Funnel defaults: ${(R.view_to_visit * 100).toFixed(2)}% of views visit, ${(R.visit_to_install * 100).toFixed(0)}% of visits install, ${(R.install_to_trial * 100).toFixed(1)}% of installs start a trial.`,
        'These are checklist estimates. They get sharper as bounties for your app settle.',
      ],
      created_by: createdBy,
      ...(claimed && W.brandById.has(claimed) ? { claimed_by_brand_id: claimed } : {}),
      page_views: r.int(40, 1900),
      generated_at: daysAgo(r.int(2, 38)),
    });
  });
  return rows;
}
