// Flo copilot history: scripts, hook rewrites, brief TL;DRs, caption ideas, score fixes, rate advice, next actions and bounty drafts.
// Mock-engine outputs (model "flo-mock-1") built from the real bounties, submissions and scores, keyed by bounty or submission.

import { iso, ms, addHours, usd, fill, clamp, sum, sentenceCase } from '../lib.mjs';
import * as P from '../pools.mjs';
import { fillHook, categoryByKey } from './content.mjs';
import { suggestedFor } from './offers.mjs';

const pick = (r, arr) => arr[r.int(0, arr.length - 1)];
const HOOK_TYPES = Object.keys(P.HOOK_TEMPLATES);
const HOOK_TYPE_LABEL = { confession: 'Confession', curiosity_gap: 'Curiosity gap', specific_number: 'Specific number', pov: 'POV', direct_question: 'Direct question', risk_reversal: 'Risk reversal', pattern_interrupt: 'Pattern interrupt' };

export function genFloSuggestions(W, rng, ext) {
  const nowMs = ms(W.now);
  const maya = W.maya;
  const rows = [];
  const mayaSubs = (W.subsByCreator.get(maya?.id) ?? []).slice().sort((a, b) => (a.submitted_at < b.submitted_at ? -1 : 1));
  const latestAnalysis = (sid) => (W.analysesBySub.get(sid) ?? []).slice().sort((a, b) => b.version - a.version)[0];
  const appOf = (b) => W.appById.get(b.app_id);
  const catOf = (app) => categoryByKey(app?.category ?? 'lifestyle');
  const model = 'flo-mock-1';
  const add = (spec) => {
    const r = rng.fork(`flo:${rows.length}:${spec.kind}:${spec.context_id ?? ''}`);
    rows.push({
      surface: spec.surface, kind: spec.kind, ...(spec.creator_id ? { creator_id: spec.creator_id } : {}), ...(spec.brand_id ? { brand_id: spec.brand_id } : {}), ...(spec.context_kind ? { context_kind: spec.context_kind, context_id: spec.context_id } : {}),
      prompt: spec.prompt, title: spec.title, outputs: spec.outputs, actions: spec.actions ?? [], model, latency_ms: spec.latency ?? r.int(620, 2300), ...(spec.helpful !== undefined ? { helpful: spec.helpful } : (r.chance(0.55) ? { helpful: !r.chance(0.07) } : {})),
      created_at: spec.at,
    });
  };

  // ── building blocks ────────────────────────────────────────────────────────────────────────────────
  const scriptOptions = (bounty, app, r) => {
    const cat = catOf(app);
    const formats = (bounty.format_ids?.length ? bounty.format_ids : ['tmpl_screen_reaction', 'tmpl_confession', 'tmpl_hidden_gem']).slice(0, 3);
    const types = ['confession', 'curiosity_gap', 'specific_number'];
    return formats.map((fid, i) => {
      const def = P.FORMAT_DEFS.find((d) => d.id === fid) ?? P.FORMAT_DEFS[0];
      const hook = fillHook(pick(r, P.HOOK_TEMPLATES[def.hook_types.includes(types[i]) ? types[i] : def.hook_types[0]]), cat, { name: app.name, features: app.features, pricing: app.pricing }, r);
      const feature = app.features[i % app.features.length].toLowerCase();
      const lines = def.beats.slice(0, 6).map(([beat, label, t0, t1, , tip]) => {
        let text = tip;
        if (beat === 'hook') text = `Say it to camera and put the same words on screen: "${hook}"`;
        else if (beat === 'app_reveal') text = `Cut to a screen recording of ${app.name} by 0:03.`;
        else if (beat === 'demo' || beat === 'key_feature') text = `Show ${feature} for at least five seconds. Say what you tapped, not what the app does.`;
        else if (beat === 'payoff' || beat === 'win_state') text = `Hold on ${cat.outcome} for two full seconds.`;
        else if (beat === 'offer') text = app.pricing.trial_days > 0 ? `Say once: "${bounty.brief.offer_line ?? `Try it free for ${app.pricing.trial_days} days.`}"` : `${app.name} is free to use, so there is no trial to state. Skip this beat.`;
        else if (beat === 'cta') text = `One call to action: ${String(bounty.brief.cta).replace(/[.s]+$/, '')}. Then stop talking.`;
        return `${label} (${t0} to ${t1} s): ${text}`;
      });
      return `Option ${i + 1}: ${def.name}, about ${Math.round((def.min_s + def.max_s) / 2)} s\n${lines.join('\n')}`;
    });
  };
  const hookRewrites = (text, app, r, exclude) => {
    const cat = catOf(app);
    const types = r.shuffle(HOOK_TYPES.filter((t) => t !== exclude)).slice(0, 3);
    return types.map((t) => {
      let h = '';
      for (let k = 0; k < 14; k++) { h = fillHook(pick(r, P.HOOK_TEMPLATES[t]), cat, { name: app.name, features: app.features, pricing: app.pricing }, r); if (h.split(/\s+/).length <= 8) break; }
      const secs = Math.max(1, Math.round((h.split(/\s+/).length / 3.2) * 10) / 10);
      return `${h} (${HOOK_TYPE_LABEL[t] ?? sentenceCase(t.replace(/_/g, ' '))}, about ${secs} s to say${secs <= 2.4 ? ': it lands by 2 seconds' : ': trim a word or two to land by 2 seconds'}.)`;
    });
  };
  const briefTldr = (b, app) => {
    const pm = b.pay_math ?? {};
    const rate = b.cpm_cents > 0 ? `${usd(b.cpm_cents)} per 1,000 verified views` : b.flat_fee_cents > 0 ? `${usd(b.flat_fee_cents)} flat per video` : `${usd(b.cpa_trial_cents)} per tracked trial`;
    const cap = b.per_video_cap_cents ? ` Capped at ${usd(b.per_video_cap_cents)} per video.` : '';
    const median = pm.median_cents ? ` At the median creator's views that is about ${usd(pm.median_cents)} a video (an estimate).` : '';
    return [
      `What to make: ${b.brief.summary}`,
      `Must say and show: ${b.brief.talking_points.slice(0, 3).join(' ')}`,
      `Pay: ${rate}.${cap}${median}`,
      `Rights: ${b.rights_card.paid_ads_days > 0 ? `${b.rights_card.paid_ads_days} days of paid usage, renewal at ${Math.round(b.rights_card.renewal_pct_per_30d * 100)}% of the base fee per 30 days` : 'organic posting only'}. AI likeness is off.`,
      `Disclosure: ${b.brief.disclosure_text}. ${app.name} decides within ${b.review_sla_hours ?? 72} hours, with a reason code if it is a no.`,
    ];
  };
  const captions = (b, app, creator, r) => {
    const cat = catOf(app);
    const disclosure = b.brief.disclosure_text;
    const tags = [...(b.brief.hashtags ?? []), ...(app.default_hashtags ?? [])].filter((t, k, a) => !/^#ad$/i.test(t) && a.indexOf(t) === k).slice(0, 3).join(' ');
    const code = `${(creator?.handle ?? 'maya').split('.')[0].toUpperCase()}-${app.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)}`;
    const hooks = [0, 1, 2].map((i) => fillHook(pick(r, P.HOOK_TEMPLATES[HOOK_TYPES[(i * 2 + 1) % 7]]), cat, { name: app.name, features: app.features, pricing: app.pricing }, r));
    // the disclosure leads every caption (the Studio locks it there) and #ad appears once, inside it
    return [
      `${disclosure}
${hooks[0]} Link in bio. ${tags}`,
      `${disclosure}
${hooks[1]}

Use my code ${code}. ${tags}`,
      `${disclosure}
${hooks[2]} Try it free, link in my bio. ${tags}`,
    ];
  };
  const scoreFix = (sub, an) => {
    const items = (an?.hook_score?.items ?? []).filter((i) => !i.passed).sort((a, b) => b.max - b.points - (a.max - a.points));
    const fixes = items.slice(0, 3).map((i) => `${i.reason} ${i.fix ? `Fix: ${i.fix}` : ''}`.trim());
    if (fixes.length < 2) fixes.push('Move the app reveal into the first 3 seconds and mirror the spoken hook as on-screen text within one second.');
    if (fixes.length < 3) fixes.push('Cut dead air before your first word; speech should start inside one second.');
    return fixes;
  };

  // ── Maya ────────────────────────────────────────────────────────────────────────────────────────────
  if (maya) {
    const r0 = rng.fork('flo:maya');
    const subs = mayaSubs.filter((s) => W.bountyById.get(s.bounty_id));
    const at = (s, off) => iso(Math.max(ms(maya.joined_at) + 3_600_000, Math.min(nowMs - 3_600_000, ms(s.submitted_at) - off * 3_600_000)));
    // scripts
    subs.slice(0, 6).forEach((s, i) => {
      const b = W.bountyById.get(s.bounty_id);
      const app = appOf(b);
      const r = rng.fork(`flo:maya:script:${s.id}`);
      add({
        surface: 'studio', kind: 'script', creator_id: maya.id, context_kind: 'bounty', context_id: b.id, prompt: fill(P.FLO_PROMPTS.script[i % 2], { app: app.name, bounty: b.title }), title: `Three scripts for ${b.title}`,
        outputs: scriptOptions(b, app, r), actions: [{ label: 'Send to Studio', kind: 'open_studio', payload: b.id }, { label: 'Copy option 1', kind: 'copy', payload: '0' }], at: at(s, 3 + i), helpful: i !== 4,
      });
    });
    // hook rewrites
    subs.slice(3, 8).forEach((s, i) => {
      const b = W.bountyById.get(s.bounty_id);
      const app = appOf(b);
      const an = latestAnalysis(s.id);
      const r = rng.fork(`flo:maya:hook:${s.id}`);
      const original = an?.hook?.text ?? 'Hi guys, today I want to show you an app I have been using.';
      add({
        surface: 'studio', kind: 'hook_rewrite', creator_id: maya.id, context_kind: 'submission', context_id: s.id, prompt: fill(P.FLO_PROMPTS.hook_rewrite[i % 2], { hook: original }), title: 'Three sharper openings',
        outputs: hookRewrites(original, app, r, an?.hook?.hook_type), actions: [{ label: 'Apply to my script', kind: 'apply_fix', payload: s.id }, { label: 'Copy', kind: 'copy', payload: '0' }], at: at(s, 1.5 + i * 0.3),
      });
    });
    // brief TL;DRs for bounties she looked at (her own and a few live ones)
    const tldrBounties = [...new Set([...subs.slice(-3).map((s) => s.bounty_id), ...W.bounties.filter((b) => b.status === 'live' && b.type !== 'direct').slice(0, 2).map((b) => b.id)])].slice(0, 4);
    tldrBounties.forEach((bid, i) => {
      const b = W.bountyById.get(bid);
      add({
        surface: 'bounty_detail', kind: 'brief_tldr', creator_id: maya.id, context_kind: 'bounty', context_id: b.id, prompt: P.FLO_PROMPTS.brief_tldr[0], title: `TL;DR: ${b.title}`, outputs: briefTldr(b, appOf(b)),
        actions: [{ label: 'Make it', kind: 'open_studio', payload: b.id }, { label: 'Save for later', kind: 'save_bounty', payload: b.id }], at: iso(nowMs - (3 + i * 29) * 3_600_000 - (i % 2) * 600_000),
      });
    });
    // captions
    subs.slice(8, 11).forEach((s, i) => {
      const b = W.bountyById.get(s.bounty_id);
      const r = rng.fork(`flo:maya:cap:${s.id}`);
      add({ surface: 'studio', kind: 'caption', creator_id: maya.id, context_kind: 'bounty', context_id: b.id, prompt: P.FLO_PROMPTS.caption[0], title: 'Caption ideas with #ad', outputs: captions(b, appOf(b), maya, r), actions: [{ label: 'Use caption 1', kind: 'apply_fix', payload: '0' }], at: iso(ms(s.versions[s.versions.length - 1].submitted_at) + 3_600_000 > nowMs ? nowMs - 7_200_000 : ms(s.approved_at ?? s.submitted_at) + 2 * 3_600_000) });
    });
    // score fixes on her real submissions
    subs.filter((s) => s.hook_points < 80).slice(0, 3).forEach((s, i) => {
      add({ surface: 'studio', kind: 'score_fix', creator_id: maya.id, context_kind: 'submission', context_id: s.id, prompt: P.FLO_PROMPTS.score_fix[0], title: `Your Hook Score is ${s.hook_points}. Three fixes`, outputs: scoreFix(s, latestAnalysis(s.id)).slice(0, 3), actions: [{ label: 'Apply the first fix', kind: 'apply_fix', payload: s.id }], at: at(s, 0.7 + i * 0.2) });
    });
    // rate advice
    const rc = W.rateCardByCreator.get(maya.id);
    const sug = suggestedFor(W, maya, 1, 'ai_photo', r0);
    add({
      surface: 'rate_card', kind: 'rate_advice', creator_id: maya.id, context_kind: 'rate_card', context_id: rc?.id ?? 'rate_maya', prompt: P.FLO_PROMPTS.rate_advice[0], title: 'What to charge for two videos with paid usage',
      outputs: [`The market-suggested price for one video with 90 days of paid usage is about ${usd(sug.price_cents)} (middle band ${usd(sug.low_cents)} to ${usd(sug.high_cents)}). Basis: ${sug.basis}.`, `For two videos, ${usd(sug.price_cents * 2)} is the median ask; ${usd(Math.round(sug.price_cents * 1.8 / 500) * 500)} is a fair bundle price that rewards the brand for booking both.`, `Price paid usage up front: renewal at 25% of the base fee per extra 30 days is ${usd(Math.round(sug.price_cents * 0.25))} on one video.`],
      actions: [{ label: 'Set my rate card', kind: 'set_rate', payload: String(sug.price_cents) }], at: iso(nowMs - 9 * 24 * 3_600_000 - 4 * 3_600_000), helpful: true,
    });
    // next actions: today and a few days ago
    const lastLands = mayaSubs.filter((x) => ms(x.submitted_at) < ms('2026-09-29T09:05:00Z')).slice(-4).map((x) => latestAnalysis(x.id)?.hook?.lands_at_ms).filter((v) => Number.isFinite(v));
    const avgLands = lastLands.length ? (sum(lastLands) / lastLands.length / 1000).toFixed(1) : null;
    const todayDrop = ext.daily_drops.find((d) => d.date === W.now.slice(0, 10));
    const yDrop = ext.daily_drops.find((d) => d.status === 'live');
    const claim = yDrop?.items.find((it) => it.claims.some((c) => c.creator_id === maya.id));
    const claimBounty = claim && W.bountyById.get(claim.bounty_id);
    const claimAt = claim?.claims.find((c) => c.creator_id === maya.id)?.claimed_at;
    const claimUntil = claimAt ? `${addHours(claimAt, 24).slice(11, 16)}${addHours(claimAt, 24).slice(0, 10) === W.now.slice(0, 10) ? ' today' : ' tomorrow'}` : '';
    const revisionSub = mayaSubs.find((x) => x.status === 'changes_requested') ?? null;
    const openNotes = revisionSub ? ext.feedback_notes.filter((n) => n.submission_id === revisionSub.id && n.version === revisionSub.version && n.status === 'open') : [];
    const mayaOffer = ext.offers.find((o) => o.creator_id === maya.id && o.status === 'awaiting_creator');
    const next = [
      todayDrop ? `Today's Daily Drop opens at 16:00 UTC with ${todayDrop.items.length} bounties and ${todayDrop.spots_total} real spots. Set your reminder.` : 'Check the feed for new Funded bounties.',
      claimBounty ? `You hold a claim on "${claimBounty.title}" until ${claimUntil} UTC. Starting a script in Studio keeps your place.` : 'Pick one Funded bounty and film it today; one post this week keeps your streak at 6.',
      revisionSub ? `Revise "${revisionSub.title}": ${openNotes.filter((n) => n.severity === 'must_fix').length} must-fix and ${openNotes.filter((n) => n.severity === 'suggestion').length} suggestion (round ${Math.min(2, revisionSub.versions.length)} of 2).` : 'Nothing is waiting on you in review.',
      mayaOffer ? `Reply to ${W.brandName(mayaOffer.brand_id)}'s offer (${usd(mayaOffer.amount_cents)}). It expires ${mayaOffer.expires_at.slice(0, 10)}.` : 'No offers are waiting.',
    ].filter(Boolean);
    add({ surface: 'home', kind: 'next_action', creator_id: maya.id, prompt: P.FLO_PROMPTS.next_action[0], title: 'What to do today', outputs: next.slice(0, 4), actions: [{ label: 'Open the Daily Drop', kind: 'open_drop' }, { label: 'Open my revision', kind: 'open_submission', payload: revisionSub?.id ?? '' }].filter((a) => a.payload !== ''), at: '2026-10-03T08:42:00Z', helpful: true });
    add({ surface: 'home', kind: 'next_action', creator_id: maya.id, prompt: P.FLO_PROMPTS.next_action[0], title: 'What to do today', outputs: ['Your latest posts are still counting views. Nothing to do on them until their 72-hour windows close.', 'Five weeks in a row so far. One post this week makes it six, and a freeze is banked if the week gets away from you.', avgLands ? `Your last four openings landed at ${avgLands} seconds on average. The Hook Score gives full points at 2.0, so tighten the first line.` : 'Open on the hook line so it lands by 2 seconds.'], actions: [{ label: 'Open Studio', kind: 'open_studio' }], at: '2026-09-29T09:05:00Z' });
  }

  // ── Jordan and other brands ────────────────────────────────────────────────────────────────────────
  const brandDrafts = [
    { brand: W.lumi, url: 'https://apps.apple.com/us/app/lumi/id6448900000', days: 61 }, { brand: W.lumi, url: 'https://apps.apple.com/us/app/lumi/id6448900000', days: 33 },
    { brand: W.lumi, url: 'https://apps.apple.com/us/app/lumi/id6448900000', days: 17 }, { brand: W.lumi, url: 'https://apps.apple.com/us/app/lumi/id6448900000', days: 8 },
  ];
  const others = W.brands.filter((b) => b.kind === 'brand' && b.id !== W.lumi?.id).slice(2, 6);
  others.forEach((b, i) => brandDrafts.push({ brand: b, url: (W.appsByBrand.get(b.id) ?? [])[0]?.store_url ?? '', days: 40 - i * 7 }));
  brandDrafts.forEach((d, i) => {
    if (!d.brand) return;
    const app = (W.appsByBrand.get(d.brand.id) ?? [])[0];
    if (!app) return;
    const r = rng.fork(`flo:draft:${d.brand.id}:${i}`);
    const cat = catOf(app);
    const clearing = W.clearingCpm(app.category, 220);
    const types = [['confession', 'screen reaction'], ['curiosity_gap', 'hidden gem'], ['specific_number', 'results update'], ['risk_reversal', 'free-trial lead']];
    const [ht, fmtName] = types[i % 4];
    const hook = fillHook(pick(r, P.HOOK_TEMPLATES[ht]), cat, { name: app.name, features: app.features, pricing: app.pricing }, r);
    const budget = [150_000, 300_000, 200_000, 250_000][i % 4];
    add({
      surface: 'builder', kind: 'bounty_draft', brand_id: d.brand.id, context_kind: 'app', context_id: app.id, prompt: fill(P.FLO_PROMPTS.bounty_draft[0], { url: d.url }), title: `Draft bounty for ${app.name}`,
      outputs: [
        `Title: ${sentenceCase(pick(r, P.BOUNTY_TITLES[app.category]).replace('{app}', app.name))}`,
        `Brief: Show ${app.name} doing one real job in under 30 seconds. Lead with a ${ht.replace(/_/g, ' ')} opening such as "${hook}", show the app by second 3, demo ${app.features[0].toLowerCase()}, then one call to action.`,
        `Suggested pay: ${usd(clearing)} per 1,000 verified views (the clearing CPM for ${cat.label.toLowerCase()}), $0.40 per install, $1.50 per trial, $4.00 per paid, capped at $250 per video.`,
        `Budget: ${usd(budget)} funds about ${Math.round((budget / clearing) * 1000 / 1000).toLocaleString('en-US')}k views at the clearing price. Rights: 90 days of paid usage, organic always included.`,
        `Recommended formats: ${fmtName}, hidden gem, free-trial lead. Brief Lint passes; one warning: say the ${app.pricing.trial_days}-day trial only once.`,
      ],
      actions: [{ label: 'Apply the draft', kind: 'apply_draft', payload: app.id }, { label: 'Open the builder', kind: 'open_builder' }], at: iso(nowMs - d.days * 24 * 3_600_000 - r.int(0, 8) * 3_600_000),
    });
  });
  if (W.lumi) {
    add({ surface: 'home', kind: 'next_action', brand_id: W.lumi.id, prompt: P.FLO_PROMPTS.next_action[0], title: 'What to do today', outputs: ['Six submissions are waiting. Two are past 48 hours; decide those first to keep your 11.2 hour median.', 'A winning post is fatiguing: trial-start rate is down 34% from its peak. Consider a new hook from the same creator.', 'A Spark code on a promoted post expires in 14 days. Renewal is 25% of the base fee per 30 days.'], actions: [{ label: 'Open the review queue', kind: 'open_review' }], at: '2026-10-03T08:15:00Z', helpful: true });
    const flagged = W.subs.find((s) => s.brand_id === W.lumi.id && s.status === 'in_review');
    if (flagged) {
      const an = latestAnalysis(flagged.id);
      add({ surface: 'review', kind: 'score_fix', brand_id: W.lumi.id, context_kind: 'submission', context_id: flagged.id, prompt: 'Why is this a B and not an A?', title: `Why this video scores ${flagged.flow_band}`, outputs: scoreFix(flagged, an), actions: [{ label: 'Request changes with these notes', kind: 'draft_feedback', payload: flagged.id }], at: iso(nowMs - 20 * 3_600_000) });
    }
  }

  // ── other creators: scripts, hook rewrites, captions and TL;DRs on their real submissions ───────────
  const rc2 = rng.fork('flo:others');
  const creators = rc2.sample(W.creators.filter((c) => c.id !== maya?.id && (W.subsByCreator.get(c.id) ?? []).length >= 3), 8);
  creators.forEach((c, ci) => {
    const subs = (W.subsByCreator.get(c.id) ?? []).slice().sort((a, b) => (a.submitted_at < b.submitted_at ? -1 : 1)).slice(0, 4);
    subs.forEach((s, i) => {
      if (rows.length >= 62) return;
      const b = W.bountyById.get(s.bounty_id);
      if (!b) return;
      const app = appOf(b);
      const r = rng.fork(`flo:c:${c.id}:${s.id}`);
      const at = iso(clamp(ms(s.submitted_at) - (2 + i) * 3_600_000, ms(c.joined_at) + 3_600_000, nowMs - 3_600_000));
      const kinds = ['script', 'hook_rewrite', 'caption', 'brief_tldr'];
      const kind = kinds[(ci + i) % 4];
      if (kind === 'script') add({ surface: 'studio', kind, creator_id: c.id, context_kind: 'bounty', context_id: b.id, prompt: fill(P.FLO_PROMPTS.script[0], { app: app.name, bounty: b.title }), title: `Three scripts for ${b.title}`, outputs: scriptOptions(b, app, r), actions: [{ label: 'Send to Studio', kind: 'open_studio', payload: b.id }], at });
      else if (kind === 'hook_rewrite') { const an = latestAnalysis(s.id); add({ surface: 'studio', kind, creator_id: c.id, context_kind: 'submission', context_id: s.id, prompt: fill(P.FLO_PROMPTS.hook_rewrite[0], { hook: an?.hook?.text ?? 'Hi guys, today I want to show you an app.' }), title: 'Three sharper openings', outputs: hookRewrites(an?.hook?.text ?? '', app, r, an?.hook?.hook_type), actions: [{ label: 'Apply to my script', kind: 'apply_fix', payload: s.id }], at }); }
      else if (kind === 'caption') add({ surface: 'studio', kind, creator_id: c.id, context_kind: 'bounty', context_id: b.id, prompt: P.FLO_PROMPTS.caption[0], title: 'Caption ideas with #ad', outputs: captions(b, app, c, r), actions: [{ label: 'Use caption 1', kind: 'apply_fix', payload: '0' }], at });
      else add({ surface: 'bounty_detail', kind, creator_id: c.id, context_kind: 'bounty', context_id: b.id, prompt: P.FLO_PROMPTS.brief_tldr[0], title: `TL;DR: ${b.title}`, outputs: briefTldr(b, app), actions: [{ label: 'Make it', kind: 'open_studio', payload: b.id }], at });
    });
  });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return rows.map((row, i) => ({ id: `flo_${String(i + 1).padStart(4, '0')}`, ...row }));
}
