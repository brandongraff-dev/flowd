// CORE stage 2: bounty specs (identity, rates, brief, rights, schedule). Money fields (budget, escrow, reserved, spent ...) are derived later from the ledger.

import { makeId, slugify, artSeed, hueOfHex, fill, fmtMoney, oxford, sentenceCase } from './lib.mjs';
import { CATEGORIES, NICHES, APPS, BRIEF_BITS, BOUNTY_TITLES, DISCLOSURE_TEXT, CTA_LINES, OFFER_LINES, PLATFORM_URLS } from './pools.mjs';
import { FORMAT_DEFS } from './pools-content.mjs';
import { iso, ms, addDays, addHours, clamp, DAY_MS, HOUR_MS, NOW, NOW_EPOCH, C, money, quant } from './core-kit.mjs';
import { expectedEarnings, funding, allInCpm, reservationUnit } from '../../schema/formulas.mjs';

const D = (md, hh = 9, mm = 0) => `2026-${md}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`;

/**
 * The 49 bounties. key = id suffix. status = planned status (the generator verifies it against the money). direct = private flat-fee bounty.
 * pop = popularity weight for submissions. fill: 'full' (reaches the filled state), 'near' (one spot left), undefined (natural).
 */
export const BOUNTY_TABLE = [
  // ── flowd (platform): always-on content bounty and three starters
  { key: 'flowd_about_us', brand: 'flowd', title: 'Tell your followers what flowd feels like', type: 'cpm', status: 'live', created: D('07-04', 20), start: D('07-05', 6), ends: '2027-01-05T23:59:59Z', cpm: 150, cap: 10_000, pop: 3.2, funding: 'platform', category: 'lifestyle', pool: 250_000, visibility: 'open', always: true },
  { key: 'flowd_starter_1', brand: 'flowd', title: 'Starter: show us one app you actually keep', type: 'direct', status: 'live', created: D('07-04', 20), start: D('07-05', 6), ends: '2027-01-05T23:59:59Z', flat: 500, cap: 500, pop: 6, funding: 'platform', category: 'productivity', pool: 30_000, starter: true, visibility: 'open', always: true },
  { key: 'flowd_starter_2', brand: 'flowd', title: 'Starter: a 15-second honest review', type: 'direct', status: 'live', created: D('08-09', 15), start: D('08-10', 9), ends: '2027-01-05T23:59:59Z', flat: 500, cap: 500, pop: 4, funding: 'platform', category: 'lifestyle', pool: 25_000, starter: true, visibility: 'open', always: true },
  { key: 'flowd_starter_3', brand: 'flowd', title: 'Starter: your first three-second hook', type: 'direct', status: 'live', created: D('09-06', 16), start: D('09-07', 9), ends: '2027-01-05T23:59:59Z', flat: 500, cap: 500, pop: 3, funding: 'platform', category: 'ai_assistant', pool: 20_000, starter: true, visibility: 'open', always: true },

  // ── Lumi (7)
  { key: 'lumi_headshots', brand: 'lumi', title: 'Headshots in 60 seconds', type: 'cpm', status: 'settled', created: D('07-07', 14, 20), start: D('07-08', 10), ends: D('08-19', 23, 59), cpm: 200, cap: 25_000, pop: 2.6, first: true, brandFunds: 150_000, visibility: 'open', ad: true },
  { key: 'lumi_retouch30', brand: 'lumi', title: '30-second retouch challenge', type: 'cpm', status: 'filled', created: D('09-07', 11, 5), start: D('09-08', 9), ends: D('10-20', 23, 59), cpm: 230, cap: 25_000, pop: 2.2, fill: 'full', visibility: 'open' },
  { key: 'lumi_glowup', brand: 'lumi', title: 'Glow-up reveal', type: 'stacked', status: 'live', created: D('09-12', 16, 30), start: D('09-14', 9), ends: D('10-26', 23, 59), cpm: 210, cap: 25_000, pop: 3.4, budget: 300_000, visibility: 'open', featured: true },
  { key: 'lumi_fixbadphoto', brand: 'lumi', title: 'Fix a bad photo live', type: 'cpm', status: 'live', created: D('09-19', 15), start: D('09-21', 9), ends: D('10-31', 23, 59), cpm: 220, cap: 25_000, pop: 2.4, fill: 'near', visibility: 'open' },
  { key: 'lumi_beforeafter', brand: 'lumi', title: 'Before and after, one tap', type: 'cpa', status: 'live', created: D('09-22', 13), start: D('09-23', 9), ends: D('11-02', 23, 59), cpa: [60, 200, 500], cap: 12_000, pop: 1.5, visibility: 'open' },
  { key: 'lumi_editwithme', brand: 'lumi', title: 'Edit with me', type: 'install_only', status: 'live', created: D('09-24', 10), start: D('09-25', 9), ends: D('11-05', 23, 59), cpa: [75, 0, 0], cap: 6_000, pop: 1.1, visibility: 'open' },
  { key: 'lumi_almostdeleted', brand: 'lumi', title: 'The photo I almost deleted', type: 'stacked', status: 'awaiting_funding', created: D('10-01', 16, 40), start: D('10-05', 9), ends: D('11-22', 23, 59), cpm: 220, cap: 25_000, pop: 0, budget: 300_000, visibility: 'open', lintOk: true },

  // ── design-partner first bounties (matched, fee waived), all settled
  { key: 'dozely_asleep', brand: 'dozely', title: 'Asleep before the story ends', type: 'cpm', status: 'settled', created: D('07-09', 13), start: D('07-10', 9), ends: D('08-14', 23, 59), cpm: 185, cap: 20_000, pop: 2.0, first: true, brandFunds: 100_000, visibility: 'open' },
  { key: 'stridely_firstweek', brand: 'stridely', title: 'My first week with Stridely', type: 'cpm', status: 'settled', created: D('07-11', 6), start: D('07-12', 9), ends: D('08-16', 23, 59), cpm: 210, cap: 20_000, pop: 1.7, first: true, brandFunds: 80_000, visibility: 'open' },
  { key: 'budgetbee_paycheck', brand: 'budgetbee', title: 'Where my paycheck went', type: 'cpm', status: 'settled', created: D('07-14', 17), start: D('07-15', 9), ends: D('08-19', 23, 59), cpm: 250, cap: 20_000, pop: 1.6, first: true, brandFunds: 75_000, visibility: 'open' },
  { key: 'parlo_day1', brand: 'parlo', title: 'Day 1 vs day 30', type: 'cpm', status: 'settled', created: D('07-16', 8), start: D('07-17', 9), ends: D('08-21', 23, 59), cpm: 190, cap: 20_000, pop: 1.8, first: true, brandFunds: 100_000, visibility: 'open' },
  { key: 'tasklane_plan60', brand: 'tasklane', title: 'Plan my day in 60 seconds', type: 'cpm', status: 'settled', created: D('07-20', 12), start: D('07-21', 9), ends: D('08-25', 23, 59), cpm: 195, cap: 20_000, pop: 1.5, first: true, brandFunds: 60_000, visibility: 'open' },

  // ── other settled
  { key: 'glowkit_nostudio', brand: 'glowkit', title: 'Headshots, no studio', type: 'stacked', status: 'settled', created: D('07-28', 10), start: D('07-29', 9), ends: D('08-26', 23, 59), cpm: 215, cap: 20_000, pop: 1.3, visibility: 'open', ad: true },
  { key: 'scoutly_research', brand: 'scoutly', title: 'Research in 10 minutes', type: 'cpm', status: 'settled', created: D('08-02', 14), start: D('08-03', 9), ends: D('08-28', 23, 59), cpm: 240, cap: 20_000, pop: 1.1, visibility: 'open' },
  { key: 'subhawk_forgot', brand: 'subhawk', title: 'The subscription I forgot for a year', type: 'cpm', status: 'settled', created: D('07-30', 11), start: D('07-31', 9), ends: D('08-25', 23, 59), cpm: 230, cap: 20_000, pop: 1.2, visibility: 'open' },
  { key: 'dozely_direct', brand: 'dozely', title: 'Direct: two new hooks on Asleep before the story ends', type: 'direct', status: 'settled', created: D('08-24', 10), start: D('08-25', 9), ends: D('09-08', 23, 59), flat: 36_000, cap: 36_000, pop: 0, visibility: 'private', direct: true },
  { key: 'reelcraft_direct', brand: 'reelcraft', title: 'Direct: launch-week hook set', type: 'direct', status: 'settled', created: D('08-29', 15), start: D('08-30', 9), ends: D('09-10', 23, 59), flat: 42_000, cap: 42_000, pop: 0, visibility: 'private', direct: true },

  // ── ended (windows still open)
  { key: 'quillby_onetake', brand: 'quillby', title: 'Write it in one take', type: 'stacked', status: 'ended', created: D('07-29', 10), start: D('07-30', 9), ends: D('09-22', 23, 59), cpm: 255, cap: 25_000, pop: 2.0, visibility: 'open' },
  { key: 'focusfern_study', brand: 'focusfern', title: 'Study with Focusfern', type: 'stacked', status: 'ended', created: D('08-07', 13), start: D('08-08', 9), ends: D('09-19', 23, 59), cpm: 195, cap: 20_000, pop: 1.5, visibility: 'open' },
  { key: 'pulsepath_tenmin', brand: 'pulsepath', title: '10 minutes, no excuses', type: 'cpa', status: 'ended', created: D('08-23', 16), start: D('08-24', 9), ends: D('09-24', 23, 59), cpa: [60, 180, 450], cap: 10_000, pop: 0.35, visibility: 'open' },
  { key: 'wanderlist_direct', brand: 'wanderlist', title: 'Direct: itinerary demo with a 4-day turnaround', type: 'direct', status: 'ended', created: D('09-27', 12), start: D('09-28', 9), ends: D('10-02', 23, 59), flat: 18_000, cap: 18_000, pop: 0, visibility: 'private', direct: true },

  // ── live
  { key: 'dozely_winddown', brand: 'dozely', title: 'My wind-down routine', type: 'stacked', status: 'live', created: D('08-17', 11), start: D('08-19', 9), ends: D('10-30', 23, 59), cpm: 190, cap: 25_000, pop: 2.4, visibility: 'drop' },
  { key: 'stridely_runclub', brand: 'stridely', title: 'Run club test drive', type: 'install_only', status: 'live', created: D('09-01', 22), start: D('09-02', 9), ends: D('10-14', 23, 59), cpa: [80, 0, 0], cap: 8_000, pop: 0.9, visibility: 'open' },
  { key: 'budgetbee_direct', brand: 'budgetbee', title: 'Direct: month-end check-in video', type: 'direct', status: 'live', created: D('09-14', 14), start: D('09-15', 9), ends: D('10-14', 23, 59), flat: 24_000, cap: 24_000, pop: 0, visibility: 'private', direct: true },
  { key: 'parlo_spoke', brand: 'parlo', title: 'I spoke it on day one', type: 'stacked', status: 'filled', created: D('09-04', 15), start: D('09-05', 9), ends: D('11-01', 23, 59), cpm: 200, cap: 25_000, pop: 1.9, fill: 'full', visibility: 'invite_only', minTier: 'silver' },
  { key: 'tasklane_focus', brand: 'tasklane', title: 'Focus session with me', type: 'cpa', status: 'live', created: D('09-14', 10), start: D('09-15', 9), ends: D('10-27', 23, 59), cpa: [50, 160, 420], cap: 12_000, pop: 0.9, visibility: 'open' },
  { key: 'quillby_voice', brand: 'quillby', title: 'Reply in my voice', type: 'cpm', status: 'live', created: D('09-18', 9), start: D('09-19', 9), ends: D('11-10', 23, 59), cpm: 265, cap: 25_000, pop: 1.5, visibility: 'open' },
  { key: 'focusfern_system', brand: 'focusfern', title: 'The system that finally stuck', type: 'stacked', status: 'live', created: D('09-21', 14), start: D('09-22', 9), ends: D('11-03', 23, 59), cpm: 200, cap: 20_000, pop: 1.4, visibility: 'open' },
  { key: 'reelcraft_rawclips', brand: 'reelcraft', title: 'Edit with me: raw clips to reel', type: 'stacked', status: 'live', created: D('08-25', 12), start: D('08-26', 9), ends: D('10-28', 23, 59), cpm: 260, cap: 25_000, pop: 2.2, visibility: 'drop' },
  { key: 'ironleaf_skipping', brand: 'ironleaf', title: 'The workout I stopped skipping', type: 'cpm', status: 'live', created: D('09-09', 13), start: D('09-10', 9), ends: D('10-22', 23, 59), cpm: 215, cap: 20_000, pop: 1.5, visibility: 'open' },
  { key: 'wanderlist_trip', brand: 'wanderlist', title: 'Plan the whole trip in one place', type: 'stacked', status: 'filled', created: D('08-31', 15), start: D('09-01', 9), ends: D('10-20', 23, 59), cpm: 185, cap: 20_000, pop: 1.3, fill: 'full', visibility: 'open' },
  { key: 'loopnest_beat5', brand: 'loopnest', title: 'A beat in 5 minutes', type: 'cpm', status: 'live', created: D('09-18', 16), start: D('09-19', 9), ends: D('11-02', 23, 59), cpm: 175, cap: 20_000, pop: 1.1, visibility: 'open' },
  { key: 'tunefox_riff', brand: 'tunefox', title: 'Learn the riff by ear', type: 'cpa', status: 'live', created: D('09-23', 11), start: D('09-24', 9), ends: D('11-08', 23, 59), cpa: [55, 170, 420], cap: 10_000, pop: 0.8, visibility: 'open' },
  { key: 'wordwave_flashcards', brand: 'wordwave', title: 'Flashcards from my camera', type: 'cpm', status: 'live', created: D('08-30', 13), start: D('08-31', 9), ends: D('10-16', 23, 59), cpm: 165, cap: 15_000, pop: 1.5, visibility: 'open' },
  { key: 'inkdock_notes', brand: 'inkdock', title: 'Notes that file themselves', type: 'install_only', status: 'live', created: D('09-01', 18), start: D('09-02', 9), ends: D('10-14', 23, 59), cpa: [70, 0, 0], cap: 6_000, pop: 0.8, visibility: 'open' },
  { key: 'pantrypal_scan', brand: 'pantrypal', title: 'Pantry scan, no waste', type: 'cpm', status: 'live', created: D('09-20', 12), start: D('09-21', 9), ends: D('11-02', 23, 59), cpm: 170, cap: 15_000, pop: 0.45, visibility: 'open' },

  // ── filled, paused, scheduled
  { key: 'stridely_plantopr', brand: 'stridely', title: 'Plan to PR', type: 'stacked', status: 'live', created: D('09-17', 12), start: D('09-18', 9), ends: D('10-30', 23, 59), cpm: 205, cap: 20_000, pop: 1.9, fill: 'near', visibility: 'open' },
  { key: 'stillwater_calm', brand: 'stillwater', title: 'Five calm minutes', type: 'cpm', status: 'filled', created: D('09-13', 10), start: D('09-14', 9), ends: D('10-26', 23, 59), cpm: 190, cap: 20_000, pop: 1.5, fill: 'full', visibility: 'open' },
  { key: 'rainyday_roundup', brand: 'rainyday', title: 'Round-up saving, tested', type: 'cpa', status: 'live', created: D('09-16', 13), start: D('09-17', 9), ends: D('10-29', 23, 59), cpa: [60, 190, 460], cap: 8_000, pop: 0.35, fill: 'near', visibility: 'open' },
  { key: 'reelcraft_templates', brand: 'reelcraft', title: 'Template library challenge', type: 'cpm', status: 'paused', created: D('09-09', 14), start: D('09-10', 9), ends: D('10-24', 23, 59), cpm: 250, cap: 25_000, pop: 1.2, pausedAt: D('09-28', 10), visibility: 'open' },
  { key: 'tunefox_slowdown', brand: 'tunefox', title: 'Slow it down, play it back', type: 'install_only', status: 'scheduled', created: D('09-30', 15), start: D('10-07', 9), ends: D('11-20', 23, 59), cpa: [65, 0, 0], cap: 6_000, pop: 0, visibility: 'open', budget: 100_000 },

  // ── cancelled, awaiting funding, drafts
  { key: 'rainyday_vault', brand: 'rainyday', title: 'Goal vault challenge', type: 'cpm', status: 'cancelled', created: D('09-25', 15), start: D('09-27', 9), ends: D('11-10', 23, 59), cpm: 170, cap: 15_000, pop: 0, cancelledAt: D('09-27', 7, 30), budget: 80_000, visibility: 'open' },
  { key: 'nestly_chorechart', brand: 'nestly', title: 'The chore chart we both use', type: 'stacked', status: 'awaiting_funding', created: D('10-02', 11, 20), start: D('10-06', 9), ends: D('11-24', 23, 59), cpm: 165, cap: 15_000, pop: 0, budget: 120_000, visibility: 'open', lintOk: true },
  { key: 'moodloom_moodlog', brand: 'moodloom', title: 'Mood log, week one', type: 'cpm', status: 'draft', created: D('10-01', 14, 15), start: D('10-08', 9), ends: D('11-12', 23, 59), cpm: 175, cap: 15_000, pop: 0, budget: 150_000, visibility: 'open', lint: 'burner' },
  { key: 'pantrypal_mealplan', brand: 'pantrypal', title: 'Meal plan Sunday', type: 'stacked', status: 'draft', created: D('10-02', 9, 40), start: D('10-09', 9), ends: D('11-13', 23, 59), cpm: 170, cap: 15_000, pop: 0, budget: 100_000, visibility: 'open', lint: 'viewmin' },
];

// ── category for each bounty (drives brief, market CPM and views) ──────────────────────────────
const catOf = (W, row) => row.category ?? W.brandBy.get(row.brand).app.category;

/** brief text for a bounty */
function makeBrief(rng, app, cat, row, disclosureText) {
  const def = app.def;
  const bits = BRIEF_BITS[cat] ?? BRIEF_BITS.default;
  const feature = rng.pick(def.features);
  const catDef = CATEGORIES.find((c) => c.key === cat);
  const talking = [...BRIEF_BITS.default.talking.slice(0, 3), ...bits.talking].slice(0, 5).map((t) => fill(t, { app: def.name, feature }));
  const dos = [...bits.dos, ...BRIEF_BITS.default.dos.slice(0, 2)].slice(0, 5).map((t) => fill(t, { app: def.name, feature }));
  const donts = [...bits.donts, ...BRIEF_BITS.default.donts.slice(0, 2)].slice(0, 5).map((t) => fill(t, { app: def.name, feature }));
  const trial = def.pricing.trial_days;
  const cta = rng.pick(['link_in_bio', 'try_free', 'use_code', 'search_app_store']);
  const ctaLine = fill(rng.pick(CTA_LINES[cta]), { code: 'YOURCODE', days: String(trial), app: def.name });
  const offer = trial > 0 ? fill(rng.pick(OFFER_LINES), { days: String(trial) }) : undefined;
  const summary = row.direct
    ? `One dedicated ${catDef.noun} video for ${def.name}: ${row.title.replace(/^Direct: /, '')}. ${sentenceCase(bits.talking[0] ?? 'Show the app early.')}`
    : row.starter
      ? `Your first flowd video. Pick any app you actually use, show it on screen within three seconds, say why you kept it and add #ad. Flat $5.00 when it is approved. This is the First-Dollar Path starter: one take, no brand brief.`
      : row.key === 'flowd_about_us'
        ? `Make a video about using flowd: how a bounty works, the Money Clock and the weekly payout. Show your own screen and your own numbers. Paid per 1,000 verified views, with the typical earnings shown beside any top-earner example.`
        : `Show ${def.name}, ${def.tagline.toLowerCase()}, doing one real thing: ${catDef.activity}. ${sentenceCase(bits.talking[0] ?? 'Show the app early.')} Keep it honest and under 30 seconds.`.replace(/\{app\}/g, def.name);
  const beatPlan = [['hook', 'Hook', true], ['problem', 'The pain in one line', false], ['app_reveal', 'Show the app by 0:03', true], ['demo', `Demo ${feature}`, true], ['payoff', 'The result', true], ['offer', 'State the trial once', trial > 0], ['cta', 'One call to action', true]];
  const beats = beatPlan.filter(([b]) => (row.starter ? ['hook', 'app_reveal', 'payoff', 'cta'].includes(b) : true)).map(([beat, label, required]) => ({ beat, label, required, ...(beat === 'app_reveal' ? { hint: 'On screen within the first 3 seconds.' } : beat === 'offer' ? { hint: 'Once, before the call to action.' } : {}) }));
  const brief = {
    summary, talking_points: talking, dos, donts, beats, cta: ctaLine, ...(offer ? { offer_line: offer } : {}), hashtags: [...def.hashtags.slice(0, 2), '#ad'], mentions: [`@${def.slug}`],
    tone: rng.pick(['Honest and a little playful', 'Calm and specific', 'Fast and curious', 'Warm, like telling a friend']), disclosure_text: disclosureText,
    banned_claims: row.starter ? ['guaranteed income', 'get paid to scroll'] : [...BRIEF_BANNED[cat]],
  };
  return { brief, feature, cta };
}
const BRIEF_BANNED = {
  ai_photo: ['perfect results', 'no editing skills needed to fool anyone'], ai_assistant: ['replaces your job', '100% accurate'], fitness: ['lose 10 pounds in a week', 'guaranteed results'],
  language: ['fluent in 30 days', 'guaranteed fluency'], productivity: ['double your income', 'guaranteed productivity'], finance: ['guaranteed returns', 'get rich'], sleep_mind: ['cures insomnia', 'treats anxiety'],
  music_audio: ['become a professional overnight'], lifestyle: ['the only app you will ever need'],
};

function rightsFor(rng, brand, row) {
  const paidDays = row.starter ? 0 : row.direct ? 90 : row.key === 'flowd_about_us' ? 0 : rng.weighted([[90, 12], [60, 2], [120, 1], [0, 2]]);
  const platforms = paidDays > 0 ? (rng.chance(0.7) ? ['tiktok', 'meta'] : ['tiktok']) : [];
  const excl = rng.weighted([[0, 7], [14, 2], [30, 1]]);
  const summary = paidDays > 0
    ? `Organic posting on your own account is always included. ${brand.name} may run your approved video as a paid ad for ${paidDays} days with your permission (a Spark code or partnership request). Renewals are priced at 25% of your base fee per 30 days. No AI likeness. ${excl > 0 ? `You may not post for a competing app for ${excl} days.` : 'No exclusivity.'}`
    : `Organic posting on your own account only. ${brand.name} cannot run this video as an ad. No AI likeness. No exclusivity.`;
  return { organic: true, paid_ads_days: paidDays, ad_platforms: platforms, whitelisting: paidDays > 0, renewal_pct_per_30d: C.rights.renewal_fee_pct_of_base_per_30d, exclusivity_days: excl, ai_likeness: false, territory: 'Worldwide', summary };
}

export function buildBounties(W) {
  const rng = W.rng.fork('bounties');
  const bounties = [];
  for (const row of BOUNTY_TABLE) {
    const brand = W.brandBy.get(row.brand);
    const app = brand.app;
    const cat = catOf(W, row);
    const catDef = CATEGORIES.find((c) => c.key === cat);
    const members = brand.members;
    const owner = brand.owner;
    const creatorMember = brand.key === 'glowkit' || brand.key === 'subhawk' || brand.key === 'moodloom' ? W.brandBy.get('northstar').members[1] : (brand.reviewers[rng.int(0, Math.max(0, brand.reviewers.length - 1))] ?? owner);
    const planRate = C.plans[brand.plan].take_rate;
    const first = !!row.first;
    let take = row.funding === 'platform' ? 0 : first ? 0 : (row.type === 'cpa' || row.type === 'install_only') ? C.fees.cpa_only_take_rate : planRate;
    // plan at publish time: Lumi was Free before 08-12, other brands upgraded on their own dates
    if (!first && row.funding !== 'platform' && brand.planSince && ms(row.created) < ms(brand.planSince) && !(row.type === 'cpa' || row.type === 'install_only')) take = C.plans.free.take_rate;
    const disclosure = fill(DISCLOSURE_TEXT, { brand: app.name });
    const { brief, feature, cta } = makeBrief(rng, app, cat, row, disclosure);
    const rights = rightsFor(rng, brand, row);
    const isCpa = row.type === 'cpa' || row.type === 'install_only';
    const rates = row.cpa ?? (row.type === 'stacked' ? [C.pay.default_cpa_install_cents, C.pay.default_cpa_trial_cents, C.pay.default_cpa_paid_cents] : [0, 0, 0]);
    const cpm = row.cpm ?? 0;
    const formats = FORMAT_DEFS.filter((f) => f.categories.includes(cat)).sort((a, b) => a.rank - b.rank).slice(0, 4).map((f) => f.id);
    if (!formats.length) formats.push('tmpl_screen_reaction', 'tmpl_hidden_gem');
    const regions = row.starter || row.key === 'flowd_about_us' ? ['US', 'CA', 'GB', 'AU', 'IE', 'DE', 'FR', 'ES', 'NL', 'BR', 'MX', 'PH'] : brand.country === 'DE' ? ['US', 'GB', 'DE', 'CA', 'AU'] : ['US', 'CA', 'GB', 'AU', 'IE'];
    const niches = NICHES.filter((n) => n.categories.includes(cat) || catDef.niches.includes(n.key)).map((n) => n.key).slice(0, 4);
    const minUs = row.starter || row.direct ? undefined : rng.weighted([[undefined, 4], [0.5, 4], [0.6, 1]]);
    const eligibility = { ...(row.minTier ? { min_tier: row.minTier } : row.direct ? { min_tier: 'silver' } : {}), ...(row.starter ? {} : rng.chance(0.4) ? { min_followers: rng.pick([1000, 2500, 5000]) } : {}), countries: regions, niches, ...(minUs ? { min_us_audience_ratio: minUs } : {}), burner_accounts_allowed: false };
    const durMin = row.starter ? 10 : 15;
    const durMax = row.starter ? 25 : rng.weighted([[30, 7], [45, 2], [60, 1]]);
    const deliverables = { videos_per_creator: row.direct ? 1 : 1, min_duration_s: durMin, max_duration_s: durMax, aspect: '9:16', platforms: row.starter ? ['tiktok', 'instagram', 'youtube'] : rng.weighted([[['tiktok', 'instagram'], 5], [['tiktok'], 3], [['tiktok', 'instagram', 'youtube'], 2]]), regions, require_face: row.starter ? false : cat === 'finance' ? rng.chance(0.3) : rng.chance(0.55), music_policy: rng.chance(0.65) ? 'original_only' : 'commercial_library', ai_policy: cat === 'ai_photo' ? 'allowed_disclosed' : 'not_allowed' };
    const creatorsSkew = Math.max(1, row.pop);
    const b = {
      id: `bnty_${slugify(row.key)}`, row, key: row.key, brand, app, category: cat, catDef, title: row.title, type: row.type, status: row.status, visibility: row.visibility ?? 'open',
      funding_source: row.funding ?? (first ? 'brand_matched' : 'brand'), is_first_bounty: first, is_starter: !!row.starter, featured: !!row.featured, featured_until: row.featured ? '2026-10-10T23:59:59Z' : undefined,
      cpm_cents: cpm, cpa: rates, flat_fee_cents: row.flat ?? 0, ad_commission_rate: C.pay.ad_commission_rate, per_video_cap_cents: row.cap, take_rate: take,
      brandFunds: row.brandFunds, budgetPlan: row.budget ?? row.pool, brief, rights_card: rights, deliverables, eligibility, format_ids: formats, art: artSeed(rng, { hue: hueOfHex(app.def.colors.primary), pattern: rng.pick(['orbs', 'waves']), label: undefined }),
      createdAt: row.created, startsAt: row.start, endsAt: row.ends, publishedAt: ['draft', 'awaiting_funding', 'cancelled'].includes(row.status) ? (row.status === 'cancelled' ? row.start : undefined) : (ms(row.start) <= NOW_EPOCH ? row.start : row.created),
      pausedAt: row.pausedAt, cancelledAt: row.cancelledAt, owner: row.funding === 'platform' ? undefined : owner, creatorMember: row.funding === 'platform' ? undefined : creatorMember,
      subs: [], posts: [], pop: row.pop, fillPlan: row.fill, always: !!row.always, direct: !!row.direct, adCandidate: !!row.ad, feature, ctaType: cta, lintPlan: row.lint, lintOk: !!row.lintOk,
      reviewSlaH: 72,
    };
    bounties.push(b);
  }
  bounties.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  W.bounties = bounties;
  W.bountyBy = new Map(bounties.map((b) => [b.key, b]));
  return bounties;
}

/** Brief Lint result, pay math and all-in CPM (needs the market CPM, so it runs after the market baseline exists). */
export function finishBountyStatics(W) {
  const rng = W.rng.fork('bounty-statics');
  const { LINT } = { LINT: C.lint.rules };
  for (const b of W.bounties) {
    const rules = C.lint.rules;
    const issues = [];
    const add = (code, message, field) => issues.push({ code, severity: rules[code].severity, message, ...(field ? { field } : {}) });
    if (b.lintPlan === 'burner') {
      b.brief.talking_points = [...b.brief.talking_points.slice(0, 3), 'Post from a new account dedicated to this app so the audience stays clean.'];
      b.brief.dos = [...b.brief.dos.slice(0, 3), 'Create a separate account just for us before you start.'];
      add('burner_account', 'The brief asks creators to post from a new, dedicated account. Bounties may not require this.', 'brief.talking_points');
      add('fresh_account_demand', 'Remove "a separate account just for us": creators post from their own accounts.', 'brief.dos');
      add('unclear_cta', 'Two calls to action are named. Pick exactly one.', 'brief.cta');
    } else if (b.lintPlan === 'viewmin') {
      b.brief.talking_points = [...b.brief.talking_points.slice(0, 3), 'Creators must reach 10,000 views to qualify for base pay.'];
      add('view_minimum_base', 'Base pay cannot depend on a minimum view count. Pay from the first verified view, or move the threshold to a bonus.', 'brief.talking_points');
      add('low_effective_pay', 'Median expected pay is under $15.00 per video at this CPM. Raise the CPM or add a CPA bonus.', 'pay_math.median_cents');
    } else if (b.status === 'awaiting_funding' || b.status === 'scheduled') {
      if (b.lintOk) { if (rng.chance(0.5)) add('short_window', 'The window is under five days between funding and the start. Allow at least 5 days so revisions fit.', 'starts_at'); }
    } else if (rng.chance(0.18) && !b.direct && !b.is_starter) add(rng.pick(['unclear_cta', 'low_effective_pay', 'no_disclosure_text'].slice(0, 2)), rules.unclear_cta.fix, 'brief.cta');
    // dedupe issues
    const seen = new Set();
    b.lint = { passed: !issues.some((i) => i.severity === 'blocker'), checked_at: b.status === 'draft' || b.status === 'awaiting_funding' ? addHours(b.createdAt, 1) : addHours(b.createdAt, 2), issues: issues.filter((i) => (seen.has(i.code) ? false : (seen.add(i.code), true))) };
    // pay math from the category's median views and the bounty's rates
    const medianViews = Math.round(b.catDef.median_views * (b.category === 'ai_photo' ? 1.02 : 1));
    const rates = { install: b.cpa[0], trial: b.cpa[1], paid: b.cpa[2] };
    const flat = b.flat_fee_cents;
    const e = expectedEarnings({ base_median_views: medianViews, cpm_cents: b.cpm_cents, rates, per_video_cap_cents: b.per_video_cap_cents });
    const fixedBudget = b.budgetPlan ?? 300_000;
    const f = funding({ budget_cents: fixedBudget, take_rate: b.take_rate });
    const allIn = b.cpm_cents > 0 ? allInCpm({ cpm_cents: b.cpm_cents, budget_cents: fixedBudget, card_charge_cents: f.card_charge_cents }) : 0;
    const creatorCpm = b.cpm_cents > 0 ? Math.round(b.cpm_cents + (e.median.cpa_pay_cents * 1000) / Math.max(1, e.median.views)) : Math.round((e.median.cpa_pay_cents * 1000) / Math.max(1, e.median.views));
    b.payMath = flat > 0
      ? { expected_views_p25: Math.round(medianViews * 0.4), expected_views_median: medianViews, expected_views_p75: Math.round(medianViews * 2.55), p25_cents: flat, median_cents: flat, p75_cents: flat, creator_cpm_cents: Math.round((flat * 1000) / medianViews), all_in_cpm_cents: Math.round((flat * (1 + b.take_rate) * 1000 * 1.029) / medianViews), basis: `Flat fee ${money(flat)} per video, agreed up front; views are not part of the pay.` }
      : { expected_views_p25: e.p25.views, expected_views_median: e.median.views, expected_views_p75: e.p75.views, p25_cents: e.p25.pay_cents, median_cents: e.median.pay_cents, p75_cents: e.p75.pay_cents, creator_cpm_cents: creatorCpm, all_in_cpm_cents: Math.max(allIn, 0) + (b.cpm_cents === 0 ? Math.round(creatorCpm * (1 + b.take_rate) * 1.029) : Math.round((creatorCpm - b.cpm_cents) * (1 + b.take_rate))), basis: `${b.catDef.label} market: median ${(medianViews / 1000).toFixed(1)}k verified views per post, tracked funnel from the category defaults. An estimate, not a promise.` };
    if (b.cpm_cents > 0 && !flat) b.payMath.all_in_cpm_cents = Math.max(allIn, Math.round(creatorCpm * (1 + b.take_rate) * 1.029));
  }
}
