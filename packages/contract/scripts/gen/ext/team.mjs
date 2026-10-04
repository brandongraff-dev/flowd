// Brand-side tooling: guarded auto-approve rules, hook x body x CTA test plans, fatigue alerts and the team activity log.

import { iso, ms, addDays, addHours, fill, usd, clamp, hoursAgo, round2 } from '../lib.mjs';
import * as P from '../pools.mjs';
import { fillHook, categoryByKey } from './content.mjs';
import { SETTLED_POST } from './world.mjs';

const DAY = 86_400_000;
const round4 = (x) => Math.round(x * 10000) / 10000;

// ── auto-approve rules ───────────────────────────────────────────────────────────────────────────────
export function genAutoApproveRules(W, rng) {
  const nowMs = ms(W.now);
  const cfg = W.C.auto_approve;
  const rows = [];
  const lumi = W.lumi;
  const jordan = W.memberById.get(W.ctx.world.PERSONAS.brand.member_id);
  const maren = W.membersOf(lumi?.id ?? '', ['reviewer'])[0];
  const baseCond = (over = {}) => ({ min_flow_band: cfg.default_min_flow_band, require_all_beats: true, require_disclosure_pass: true, require_no_duplicate: true, require_music_pass: true, max_fraud_score: cfg.default_max_fraud_score, min_us_audience_ratio: cfg.default_min_us_audience_ratio, min_creator_approved_posts: cfg.default_min_creator_approved_posts, min_creator_approval_rate: cfg.default_min_creator_approval_rate, ...over });
  const guard = (over = {}) => ({ daily_cap: 12, budget_cap_cents: 150_000, spot_check_ratio: cfg.spot_check_ratio, pause_on_fraud: true, ...over });
  const audit = (member, entries) => entries.map(([at, action, note, who]) => ({ at, ...(who !== null && (who ?? member) ? { actor_member_id: (who ?? member).id } : {}), action, note }));
  const autoCount = (brandId) => W.subs.filter((s) => s.brand_id === brandId && s.auto_approved).length;
  if (lumi && jordan) {
    const liveIds = W.bounties.filter((b) => b.brand_id === lumi.id && ['live', 'filled'].includes(b.status) && b.type !== 'direct').map((b) => b.id);
    const createdAt = iso(nowMs - 21 * DAY);
    const dryAt = addHours(createdAt, 3);
    const enabledAt = addHours(createdAt, 26);
    const spotChecked = 5;
    rows.push({
      brand_id: lumi.id, name: 'Organic fast-track: B or better, proven creators', status: 'active', conditions: baseCond(), scope: { bounty_ids: liveIds, tiers: ['silver', 'gold', 'platinum', 'elite'], platforms: ['tiktok', 'instagram'] },
      guardrails: guard(), timeout_policy: 'escalate',
      dry_run: { ran_at: dryAt, sample_size: cfg.dry_run_sample, would_approve: 31, would_send_to_human: 16, would_block: 3 },
      stats: { auto_approved: autoCount(lumi.id) || 47, spot_checked: spotChecked, spot_check_overturned: 0, last_triggered_at: iso(nowMs - 5 * 3_600_000) },
      audit: audit(jordan, [[createdAt, 'created', 'Rule created from the review queue: B or better, all beats, disclosure passed, fraud under 20.'], [dryAt, 'dry_run', 'Dry run on the last 50 submissions: would approve 31, send 16 to a human, block 3.'], [enabledAt, 'enabled', 'Enabled for organic rights only. 10% of auto-approvals are spot-checked by a human.'], [iso(nowMs - 9 * DAY), 'spot_check', 'Spot check of 2 auto-approved videos: both confirmed.', maren ?? jordan], [iso(nowMs - 3 * DAY), 'spot_check', 'Spot check of 3 auto-approved videos: all confirmed.', maren ?? jordan]]),
      created_by_member_id: jordan.id, created_at: createdAt, updated_at: iso(nowMs - 3 * DAY), enabled_at: enabledAt,
    });
    const k = iso(nowMs - 12 * DAY);
    const c2 = iso(nowMs - 40 * DAY);
    rows.push({
      brand_id: lumi.id, name: 'Weekend fast-track', status: 'killed', conditions: baseCond({ min_flow_band: 'C', min_creator_approved_posts: 1, min_creator_approval_rate: 0.8 }), scope: { bounty_ids: liveIds.slice(0, 2), tiers: ['bronze', 'silver', 'gold'], platforms: ['tiktok'] },
      guardrails: guard({ daily_cap: 20, budget_cap_cents: 80_000 }), timeout_policy: 'approve_if_clean',
      dry_run: { ran_at: addHours(c2, 2), sample_size: cfg.dry_run_sample, would_approve: 38, would_send_to_human: 9, would_block: 3 },
      stats: { auto_approved: 12, spot_checked: 2, spot_check_overturned: 1, last_triggered_at: iso(ms(k) - 2 * 3_600_000) },
      audit: audit(jordan, [[c2, 'created', 'Looser rule for weekends when the team is offline.'], [addHours(c2, 2), 'dry_run', 'Dry run on the last 50: would approve 38, send 9 to a human, block 3.'], [addHours(c2, 20), 'enabled', 'Enabled for weekends.'], [addDays(k, -1), 'spot_check_overturned', 'A spot check found a duplicate hash the rule had let through. Overturned and sent back to review.', maren ?? jordan], [k, 'killed', 'Kill switch used: the first overturn on a weekend rule is enough. Reviewing the last 12 approvals by hand.']]),
      created_by_member_id: jordan.id, created_at: c2, updated_at: k, enabled_at: addHours(c2, 20), killed_at: k, kill_reason: 'A spot check found a duplicate the rule had approved. Killed to review the last 12 approvals by hand.',
    });
  }
  // other brands: a draft, a dry run, a paused rule and one more
  const others = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== lumi?.id);
  const plan = [['draft', 'Starter rule: A-band only'], ['dry_run', 'Proven creators, organic only'], ['paused', 'Daily cap of 8 for the Drop bounties'], ['dry_run', 'Faceless slideshow fast-track']];
  plan.forEach(([status, name], i) => {
    const b = others[i * 2 + 1] ?? others[i];
    if (!b) return;
    const mem = W.ownerOf(b.id);
    const r = rng.fork(`rule:${b.id}`);
    const createdAt = iso(nowMs - r.int(5, 30) * DAY);
    const ids = W.bounties.filter((x) => x.brand_id === b.id && ['live', 'filled'].includes(x.status) && x.type !== 'direct').map((x) => x.id);
    const ranAt = addHours(createdAt, r.int(2, 30));
    // a paused rule was enabled after its dry run and stopped after it had run for a while
    const enabledAt = iso(Math.max(ms(ranAt) + 3_600_000, nowMs - 6 * DAY));
    const pausedAt = iso(Math.max(ms(enabledAt) + 20 * 3_600_000, nowMs - 2 * DAY));
    const dry = status === 'draft' ? undefined : { ran_at: ranAt, sample_size: cfg.dry_run_sample, would_approve: r.int(18, 36), would_send_to_human: r.int(10, 24), would_block: r.int(1, 5) };
    if (dry) dry.would_send_to_human = Math.max(0, cfg.dry_run_sample - dry.would_approve - dry.would_block);
    rows.push({
      brand_id: b.id, name, status, conditions: baseCond(status === 'draft' ? { min_flow_band: 'A' } : {}), scope: { bounty_ids: ids.slice(0, 3), tiers: ['silver', 'gold', 'platinum', 'elite'], platforms: ['tiktok', 'instagram'] },
      guardrails: guard({ daily_cap: status === 'paused' ? 8 : 10, budget_cap_cents: 60_000 + i * 20_000 }), timeout_policy: status === 'paused' ? 'approve_if_clean' : 'escalate', ...(dry ? { dry_run: dry } : {}),
      stats: status === 'paused' ? { auto_approved: 9, spot_checked: 1, spot_check_overturned: 0, last_triggered_at: pausedAt } : { auto_approved: 0, spot_checked: 0, spot_check_overturned: 0 },
      audit: audit(mem, [[createdAt, 'created', status === 'draft' ? 'Draft saved. A dry run on the last 50 submissions is required before it can go live.' : 'Rule created.'], ...(dry ? [[ranAt, 'dry_run', `Dry run on the last 50: would approve ${dry.would_approve}, send ${dry.would_send_to_human} to a human, block ${dry.would_block}.`]] : []), ...(status === 'paused' ? [[enabledAt, 'enabled', 'Enabled.'], [pausedAt, 'paused', 'Paused while the team changes the brief.']] : [])]),
      created_by_member_id: mem.id, created_at: createdAt, updated_at: status === 'paused' ? pausedAt : dry ? ranAt : createdAt, ...(status === 'paused' ? { enabled_at: enabledAt } : {}),
    });
  });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rows.map((row) => ({ id: `rule_${W.slugOf(row.brand_id)}_${row.status === 'killed' ? 'weekend' : row.status === 'active' ? 'organic' : row.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3).join('_')}`, ...row }));
}

// ── test plans ───────────────────────────────────────────────────────────────────────────────────────
export function genTestPlans(W, rng, offers) {
  const nowMs = ms(W.now);
  const rows = [];
  const hookIds = (type) => P.HOOK_TEMPLATES[type].map((_, i) => `hook_${type}_${String(i + 1).padStart(2, '0')}`);
  const mkPlan = (brand, spec) => {
    const r = rng.fork(`tplan:${brand.id}:${spec.name}`);
    const app = (W.appsByBrand.get(brand.id) ?? [])[0];
    const cat = categoryByKey(app.category);
    const posts = (W.postsByBrand.get(brand.id) ?? []).filter((p) => !['removed', 'clawed_back'].includes(p.status));
    const typeCount = new Map();
    for (const p of posts) typeCount.set(p.tags?.hook_type, (typeCount.get(p.tags?.hook_type) ?? 0) + 1);
    const hookTypes = spec.hookTypes ?? [...typeCount.entries()].filter(([t]) => t).sort((a, b) => b[1] - a[1]).map(([t]) => t).concat(['confession', 'curiosity_gap', 'specific_number']).filter((t, i, a) => a.indexOf(t) === i).slice(0, 3);
    const fmtCount = new Map();
    for (const p of posts) fmtCount.set(p.tags?.format_id, (fmtCount.get(p.tags?.format_id) ?? 0) + 1);
    const formats = spec.formats ?? [...fmtCount.entries()].filter(([f]) => f).sort((a, b) => b[1] - a[1]).map(([f]) => f).concat(['tmpl_screen_reaction', 'tmpl_free_trial_lead']).filter((t, i, a) => a.indexOf(t) === i).slice(0, 2);
    const ctas = spec.ctas ?? ['link_in_bio', 'use_code'];
    const hooks = hookTypes.map((t, i) => {
      const id = hookIds(t)[(i * 3 + 1) % 12];
      const text = fillHook(P.HOOK_TEMPLATES[t][(i * 3 + 1) % 12], cat, { name: app.name, features: app.features, pricing: app.pricing }, r);
      return { id, label: text, type: t };
    });
    const bodies = formats.map((f) => ({ id: f, label: P.FORMAT_DEFS.find((d) => d.id === f).name }));
    const cells = [];
    let cellN = 0;
    const liveBounties = W.bounties.filter((b) => b.brand_id === brand.id && ['live', 'filled', 'ended', 'settled'].includes(b.status) && b.type !== 'direct');
    const usedBounties = new Set();
    const usedPosts = new Set();
    for (const h of hooks) for (const b of bodies) for (const cta of ctas) {
      cellN++;
      const match = posts.filter((p) => p.tags?.hook_type === h.type && p.tags?.format_id === b.id && p.tags?.cta_type === cta);
      const relaxed = posts.filter((p) => p.tags?.hook_type === h.type && p.tags?.format_id === b.id);
      const use = (match.length ? match : relaxed).filter((p) => !usedPosts.has(p.id));
      let status = 'planned';
      let post;
      let results;
      if (spec.measureAll || (use.length && r.chance(spec.measuredShare ?? 0.55))) {
        post = use.find((p) => SETTLED_POST.has(p.status)) ?? use[0];
        if (post) {
          status = SETTLED_POST.has(post.status) ? 'measured' : 'live';
          const f = post.funnel ?? {};
          results = { views: post.views, installs: f.installs ?? 0, trials: f.trials ?? 0, paid: f.paid ?? 0, trial_rate: f.installs > 0 ? round4(f.trials / f.installs) : 0 };
          if (status === 'live') results = undefined;
        }
      }
      if (!post) status = r.pick(['planned', 'briefed', 'submitted', 'briefed']);
      const cell = { id: `cell_${cellN}`, hook_ref: h.id, body_ref: b.id, cta, status };
      if (post) { cell.submission_id = post.submission_id; cell.post_id = post.id; usedBounties.add(post.bounty_id); usedPosts.add(post.id); }
      else if (status === 'submitted') {
        const s = W.subs.find((x) => x.brand_id === brand.id && ['in_review', 'qa_pending', 'approved'].includes(x.status) && !cells.some((c) => c.submission_id === x.id));
        if (s) cell.submission_id = s.id; else cell.status = 'briefed';
      }
      if (results) cell.results = results;
      cells.push(cell);
    }
    const measured = cells.filter((c) => c.results);
    const bountyIds = [...usedBounties, ...liveBounties.slice(0, 2).map((b) => b.id)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    const offerIds = offers.filter((o) => o.brand_id === brand.id && ['accepted', 'completed', 'awaiting_creator', 'awaiting_brand'].includes(o.status)).slice(0, 2).map((o) => o.id);
    const row = {
      brand_id: brand.id, app_id: app.id, name: spec.name, status: spec.status, spend_tier: spec.tier, budget_cents: spec.budget, hooks: hooks.map(({ id, label }) => ({ id, label })), bodies: bodies.map(({ id, label }) => ({ id, label })), ctas, cells,
      bounty_ids: bountyIds, offer_ids: offerIds,
      caution: measured.length < cells.length ? `Small sample: ${Math.max(1, Math.round(measured.length / hooks.length))} video${measured.length / hooks.length > 1.5 ? 's' : ''} per hook so far. Treat the results as directional until more cells are measured.` : 'Small sample: one video per cell. Treat this as directional, not proof.',
      created_at: iso(nowMs - spec.ageDays * DAY), updated_at: iso(nowMs - spec.updatedHours * 3_600_000),
    };
    if (spec.status === 'complete' && measured.length) {
      const best = [...measured].sort((a, b) => b.results.trial_rate - a.results.trial_rate)[0];
      const med = [...measured].map((c) => c.results.trial_rate).sort((a, b) => a - b)[Math.floor(measured.length / 2)] || 0.0001;
      row.winner_cell_id = best.id; row.lift_ratio = round2(best.results.trial_rate / med - 1); row.confidence = round4(clamp(0.35 + measured.length * 0.04, 0.3, 0.8));
    }
    rows.push(row);
  };
  const lumi = W.lumi;
  if (lumi) mkPlan(lumi, { name: 'Q4 hooks x bodies x CTAs', status: 'running', tier: 'growth', budget: 400_000, ageDays: 18, updatedHours: 6, measuredShare: 0.5 });
  const pros = W.brands.filter((b) => b.kind === 'brand' && b.plan !== 'free' && b.id !== lumi?.id && (W.postsByBrand.get(b.id) ?? []).length >= 8);
  const specs = [{ name: 'Which opening wins for first-time users', status: 'complete', tier: 'growth', budget: 250_000, ageDays: 48, updatedHours: 24 * 9, measureAll: true }, { name: 'Free-trial lead vs problem-solution', status: 'draft', tier: 'starter', budget: 100_000, ageDays: 4, updatedHours: 30, measuredShare: 0 }, { name: 'Summer promo hooks', status: 'archived', tier: 'starter', budget: 80_000, ageDays: 70, updatedHours: 24 * 31, measuredShare: 0.8 }];
  specs.forEach((s, i) => { if (pros[i]) mkPlan(pros[i], s); });
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rows.map((row) => ({ id: `tplan_${W.slugOf(row.brand_id)}_${String(rows.filter((x) => x.brand_id === row.brand_id && x.created_at <= row.created_at).length).padStart(2, '0')}`, ...row }));
}

// ── fatigue alerts ───────────────────────────────────────────────────────────────────────────────────
export function genFatigueAlerts(W, rng) {
  const nowMs = ms(W.now);
  const rows = [];
  const metricLabel = { trial_rate: 'trial-start rate', ctr: 'click-through rate', install_rate: 'install rate' };
  const seriesFor = (r, dates, peak, current, peakIdx) => dates.map((date, i) => {
    let v;
    if (i <= peakIdx) v = peak * (0.7 + 0.3 * (i / Math.max(1, peakIdx)));
    else v = peak + (current - peak) * ((i - peakIdx) / Math.max(1, dates.length - 1 - peakIdx));
    return { date, value: round4(clamp(v * r.float(0.97, 1.03), 0.001, 0.99)) };
  });
  const mk = (spec) => {
    const r = rng.fork(`fat:${spec.post.id}`);
    const p = spec.post;
    const bounty = W.bountyById.get(p.bounty_id);
    const dailyDates = spec.ad?.daily?.map((d) => d.date) ?? (W.dailyByPost.get(p.id) ?? []).map((d) => d.date).slice(0, 14);
    const dates = dailyDates.length >= 6 ? dailyDates : Array.from({ length: 12 }, (_, i) => iso(nowMs - (12 - i) * DAY).slice(0, 10));
    const drop = spec.drop;
    const peak = spec.peak;
    const current = round4(peak * (1 - drop));
    const peakIdx = Math.max(1, Math.floor(dates.length * 0.3));
    const detectedAt = spec.detectedAt ?? iso(nowMs - r.int(10, 40) * 3_600_000);
    const row = {
      brand_id: p.brand_id, app_id: p.app_id, bounty_id: p.bounty_id, post_id: p.id, ...(spec.ad ? { ad_id: spec.ad.id } : {}), creator_id: p.creator_id, metric: spec.metric, status: spec.status, peak_value: peak, current_value: current, drop_ratio: round4(drop),
      peak_on: dates[peakIdx], series: seriesFor(r, dates, peak, current, peakIdx),
      message: `${metricLabel[spec.metric][0].toUpperCase()}${metricLabel[spec.metric].slice(1)} is down ${Math.round(drop * 100)}% from its peak on ${bounty?.title ?? 'this video'}. ${{ refreshing: 'A refresh bounty is open for a new hook on the same body.', open: 'Consider a new hook from the same creator, or rest the ad for a week.', acknowledged: 'Acknowledged by the team, who are watching the next seven days.', resolved: 'Resolved: a new hook went live and the rate recovered.', dismissed: 'Dismissed: the dip matched a weekend and a holiday.' }[spec.status] ?? 'Handled.'}`,
      detected_at: detectedAt, ...(spec.ack ? { acknowledged_at: iso(Math.min(nowMs - 3_600_000, ms(detectedAt) + r.int(3, 40) * 3_600_000)) } : {}),
      ...(spec.refresh ? { refresh_bounty_id: spec.refresh } : {}),
    };
    rows.push(row);
  };
  const fatigued = W.ads.filter((a) => a.status === 'fatigued' || a.fatigue);
  const lumiAd = fatigued.find((a) => a.brand_id === W.lumi?.id) ?? fatigued[0];
  if (lumiAd) {
    const post = W.postById.get(lumiAd.post_id);
    const f = lumiAd.fatigue ?? { peak_trial_rate: 0.092, drop_ratio: 0.34, flagged_at: hoursAgo(26) };
    mk({ post, ad: lumiAd, metric: 'trial_rate', status: 'open', peak: f.peak_trial_rate, drop: f.drop_ratio, detectedAt: f.flagged_at ?? hoursAgo(26) });
  }
  const winners = W.posts.filter((p) => p.is_winner && !rows.some((r) => r.post_id === p.id) && SETTLED_POST.has(p.status) && (p.funnel?.installs ?? 0) > 5);
  const rf = rng.fork('fat:others');
  const pickW = rf.shuffle(winners);
  const plans = [
    { status: 'acknowledged', metric: 'ctr', drop: 0.33, peak: 0.021, ack: true, age: 6 }, { status: 'refreshing', metric: 'trial_rate', drop: 0.41, peak: 0.081, ack: true, age: 12, refresh: true },
    { status: 'resolved', metric: 'install_rate', drop: 0.36, peak: 0.34, ack: true, age: 20 }, { status: 'dismissed', metric: 'trial_rate', drop: 0.3, peak: 0.07, ack: true, age: 27 },
  ];
  plans.forEach((pl, i) => {
    const post = pickW.find((p) => p.brand_id !== W.lumi?.id && !rows.some((r) => r.brand_id === p.brand_id)) ?? pickW[i];
    if (!post) return;
    const ad = W.ads.find((a) => a.post_id === post.id);
    const refresh = pl.refresh ? W.bounties.find((b) => b.brand_id === post.brand_id && b.id !== post.bounty_id && ['live', 'scheduled', 'awaiting_funding', 'draft'].includes(b.status)) : undefined;
    mk({ post, ad, metric: pl.metric, status: pl.status, peak: pl.peak, drop: pl.drop, ack: pl.ack, detectedAt: iso(nowMs - pl.age * DAY - 5 * 3_600_000), refresh: refresh?.id });
    if (pl.refresh && !refresh) rows[rows.length - 1].status = 'acknowledged';
  });
  rows.sort((a, b) => (a.detected_at < b.detected_at ? -1 : 1));
  return rows.map((row, i) => ({ id: `fat_${String(i + 1).padStart(3, '0')}`, ...row }));
}

// ── activity log ─────────────────────────────────────────────────────────────────────────────────────
export function genActivityLog(W, rng, ext) {
  const nowMs = ms(W.now);
  const rows = [];
  const lumiId = W.lumi?.id;
  const push = (brandId, member, action, target, meta = {}, at, targetKind, targetId) => {
    if (ms(at) > nowMs - 60_000) return;
    const actor = member ? W.memberName(member.id) : 'flowd';
    const tpl = P.ACTIVITY_TEXTS[action];
    if (!tpl) return;
    const summary = fill(tpl, { actor, target: target ?? '', amount: meta.amount ?? '' }).replace(/\s+/g, ' ').trim();
    rows.push({ brand_id: brandId, ...(member ? { actor_member_id: member.id } : {}), action, summary, ...(targetKind ? { target_kind: targetKind, target_id: targetId } : {}), metadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])), at });
  };
  const memberOfUser = (brandId, userId) => W.memberByUser.get(`${brandId}|${userId}`);
  const sampleDecisions = (brandId, limit, r) => {
    const subs = (W.subsByBrand.get(brandId) ?? []).filter((s) => s.decision && ['approve', 'request_changes', 'reject'].includes(s.decision.action));
    return r.shuffle(subs).slice(0, limit);
  };
  for (const brand of W.brands.filter((b) => b.kind === 'brand')) {
    const r = rng.fork(`act:${brand.id}`);
    const isLumi = brand.id === lumiId;
    const owner = isLumi ? W.memberById.get(W.ctx.world.PERSONAS.brand.member_id) : W.ownerOf(brand.id);
    const deciders = W.deciders(brand.id);
    const finance = W.membersOf(brand.id, ['finance'])[0] ?? owner;
    if (!owner) continue;
    // team
    for (const m of W.membersOf(brand.id)) if (m.id !== owner.id) push(brand.id, owner, 'member_invited', W.memberName(m.id), {}, iso(Math.max(ms(brand.created_at) + 3_600_000, ms(m.joined_at) - 2 * 3_600_000)), 'brand_member', m.id);
    // bounties
    for (const b of W.bountiesByBrand.get(brand.id) ?? []) {
      const by = (b.created_by_member_id && W.memberById.get(b.created_by_member_id)) ?? owner;
      push(brand.id, by, 'bounty_created', b.title, {}, b.created_at, 'bounty', b.id);
      if (b.funded_at) push(brand.id, finance && r.chance(0.35) ? finance : by, 'bounty_funded', b.title, { amount: usd(b.escrow_funded_cents) }, b.funded_at, 'bounty', b.id);
      if (b.published_at) push(brand.id, by, 'bounty_published', b.title, {}, b.published_at, 'bounty', b.id);
      if (b.status === 'paused') push(brand.id, by, 'bounty_paused', b.title, {}, addDays(b.published_at ?? b.created_at, 6), 'bounty', b.id);
      if (['ended', 'settled'].includes(b.status) && b.ended_at) push(brand.id, by, 'bounty_ended', b.title, {}, b.ended_at, 'bounty', b.id);
    }
    // decisions: the real ones, sampled
    for (const s of sampleDecisions(brand.id, isLumi ? 26 : 6, r)) {
      const m = (s.decision.decided_by_user_id && memberOfUser(brand.id, s.decision.decided_by_user_id)) ?? r.pick(deciders);
      const action = { approve: 'submission_approved', request_changes: 'submission_changes_requested', reject: 'submission_rejected' }[s.decision.action];
      push(brand.id, m, action, `@${W.handle(s.creator_id)}`, { submission: s.id }, s.decision.decided_at, 'submission', s.id);
    }
    // wallet top-ups from the ledger
    const topups = W.ledger.filter((l) => l.account === `wallet:${brand.id}` && l.entry_type === 'wallet_topup' && l.amount_cents > 0);
    for (const l of topups.slice(0, isLumi ? 6 : 2)) push(brand.id, finance, 'wallet_topped_up', null, { amount: usd(l.amount_cents) }, l.posted_at, 'ledger', l.id);
    // winner promotion
    for (const ad of W.ads.filter((a) => a.brand_id === brand.id)) push(brand.id, owner, 'ad_promoted', `@${W.handle(ad.creator_id)}'s video`, {}, addHours(ad.permission_requested_at, -3), 'ad', ad.id);
    // offers
    for (const o of ext.offers.filter((x) => x.brand_id === brand.id)) {
      const m = W.memberById.get(o.created_by_member_id);
      push(brand.id, m, 'offer_sent', `@${W.handle(o.creator_id)}`, { amount: usd(o.original_amount_cents) }, o.created_at, 'offer', o.id);
      const acc = o.thread.find((t) => t.type === 'accept' && t.author_role === 'brand');
      if (acc) push(brand.id, m, 'offer_accepted', `@${W.handle(o.creator_id)}`, {}, acc.at, 'offer', o.id);
    }
    // rights renewals
    for (const g of ext.rights_grants.filter((x) => x.brand_id === brand.id && x.renewals.length)) for (const rn of g.renewals) push(brand.id, rn.requested_by_member_id ? W.memberById.get(rn.requested_by_member_id) : owner, 'rights_renewed', `@${W.handle(g.creator_id)}'s video`, { amount: usd(rn.fee_cents) }, rn.at, 'rights_grant', g.id);
    // rules, keys, webhooks, integrations
    for (const rule of ext.auto_approve_rules.filter((x) => x.brand_id === brand.id)) {
      const mem = W.memberById.get(rule.created_by_member_id);
      push(brand.id, mem, 'rule_created', rule.name, {}, rule.created_at, 'rule', rule.id);
      if (rule.enabled_at) push(brand.id, mem, 'rule_enabled', rule.name, {}, rule.enabled_at, 'rule', rule.id);
      if (rule.killed_at) push(brand.id, mem, 'rule_killed', rule.name, {}, rule.killed_at, 'rule', rule.id);
    }
    for (const k of ext.api_keys.filter((x) => x.brand_id === brand.id)) { push(brand.id, W.memberById.get(k.created_by_member_id), 'api_key_created', k.name, {}, k.created_at, 'api_key', k.id); if (k.revoked_at) push(brand.id, owner, 'api_key_revoked', k.name, {}, k.revoked_at, 'api_key', k.id); }
    for (const w of ext.webhooks.filter((x) => x.brand_id === brand.id)) push(brand.id, owner, 'webhook_created', w.url.replace('https://', ''), {}, w.created_at, 'webhook', w.id);
    for (const it of ext.integrations.filter((x) => x.brand_id === brand.id && x.connected_at)) push(brand.id, owner, 'integration_connected', it.label.split(' · ')[0], {}, it.connected_at, 'integration', it.id);
    // plan changes and misc
    if (brand.plan !== 'free') push(brand.id, owner, 'plan_changed', brand.plan === 'pro' ? 'Pro' : 'Scale', {}, isLumi ? '2026-08-12T15:20:00Z' : iso(Math.max(ms(brand.created_at) + 7 * DAY, nowMs - r.int(12, 60) * DAY)), 'brand', brand.id);
    if (isLumi) {
      const tobias = finance;
      push(brand.id, tobias, 'export_created', 'the September ledger (CSV)', {}, '2026-10-01T15:12:00Z', 'export', 'ledger_csv');
      push(brand.id, tobias, 'invoice_downloaded', 'invoice FD-2026-0042', {}, '2026-09-30T14:05:00Z', 'invoice', 'inv_0042');
      push(brand.id, tobias, 'invoice_downloaded', 'the subscription invoice for September', {}, '2026-09-12T16:40:00Z', 'invoice', 'sub_invoice_sep');
      push(brand.id, owner, 'auto_topup_changed', null, { threshold: '$500.00', amount: '$2,000.00' }, '2026-09-02T17:30:00Z', 'brand', brand.id);
      for (const d of ext.disputes.filter((x) => x.brand_id === brand.id && x.status !== 'open')) push(brand.id, owner, 'dispute_responded', `@${W.handle(d.creator_id ?? W.maya?.id)}`, {}, addHours(d.opened_at, 6), 'dispute', d.id);
    }
  }
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.summary < b.summary ? -1 : 1));
  // keep the Lumi history rich and the others sparse: cap the total near the target
  const lumi = rows.filter((x) => x.brand_id === lumiId);
  const rest = rows.filter((x) => x.brand_id !== lumiId);
  const rr = rng.fork('act:trim');
  const keepRest = rest.length > 120 ? rr.shuffle(rest).slice(0, 120) : rest;
  const kept = [...lumi.slice(-70), ...keepRest].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.summary < b.summary ? -1 : 1));
  return kept.map((row, i) => ({ id: `act_${String(i + 1).padStart(4, '0')}`, ...row }));
}
