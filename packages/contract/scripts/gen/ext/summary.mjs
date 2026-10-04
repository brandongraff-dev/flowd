// Computed-from-everything objects: the State of App UGC report and the admin control tower.

import { iso, ms, dateOf, sum, median, usd, round2 } from '../lib.mjs';
import * as P from '../pools.mjs';

const DAY = 86_400_000;
const round4 = (x) => Math.round(x * 10000) / 10000;

// ── State of App UGC ─────────────────────────────────────────────────────────────────────────────────
export function genStateOfAppUgc(W) {
  const q3Start = ms('2026-07-05T00:00:00Z');
  const q3End = ms('2026-10-01T00:00:00Z');
  const posts = W.settledPosts.filter((p) => ms(p.posted_at) >= q3Start && ms(p.posted_at) < q3End);
  const stats = (list) => W.postStats(list);
  const catOf = (p) => W.appById.get(p.app_id)?.category;
  const total = Math.max(1, posts.length);
  const allStats = stats(posts);
  // thin cells lean on a prior (six pseudo-posts, eighty pseudo-installs), so five carousel videos never print a 2% trial rate
  const blendViews = (views, n, prior) => Math.round((views * n + prior * 6) / (n + 6));
  const blendRate = (s, prior) => round4((s.trials + prior * 80) / (s.installs + 80));
  const categories = P.CATEGORIES.map((c) => {
    const mine = posts.filter((p) => catOf(p) === c.key);
    const s = stats(mine);
    const series = W.marketSeries.filter((m) => m.category === c.key);
    const last30 = series.slice(-30);
    const cpm = last30.length ? Math.round(median(last30.map((m) => m.clearing_cpm_cents))) : c.base_cpm_cents;
    const fillSeries = last30.length ? median(last30.map((m) => m.median_fill_hours)) : c.median_fill_hours;
    return {
      category: c.key, clearing_cpm_cents: cpm, median_views: mine.length >= 5 ? s.median_views : Math.round(last30.length ? median(last30.map((m) => m.median_views)) : c.median_views),
      // thin categories lean on the category prior (60 pseudo-trials, 200 pseudo-installs) so ten posts never print a 10% trial-to-paid rate
      install_to_trial: round4((s.trials + c.install_to_trial * 200) / (s.installs + 200)), trial_to_paid: round4((s.paid + c.trial_to_paid * 60) / (s.trials + 60)),
      // fill time is the clearing-market median, not the handful of bounties that happened to fill
      median_fill_hours: round2(fillSeries), settled_posts: mine.length,
    };
  });
  const hooks = Object.keys(P.HOOK_TEMPLATES).map((t) => {
    const mine = posts.filter((p) => p.tags?.hook_type === t);
    const s = stats(mine);
    return { hook_type: t, share_of_posts: round4(mine.length / total), median_views: blendViews(s.median_views, mine.length, allStats.median_views), trial_rate: blendRate(s, allStats.trial_rate) };
  });
  const formats = P.FORMAT_DEFS.map((f) => {
    const mine = posts.filter((p) => p.tags?.format_id === f.id);
    const s = stats(mine);
    return { format_id: f.id, share_of_posts: round4(mine.length / total), median_views: blendViews(s.median_views, mine.length, Math.round(allStats.median_views * f.views_mult)), trial_rate: blendRate(s, allStats.trial_rate * f.lift) };
  });
  const paid = sum(W.earnRows.filter((r) => ms(r.posted_at) >= q3Start && ms(r.posted_at) < q3End && r.entry_type !== 'prize' && r.entry_type !== 'referral' && r.entry_type !== 'bonus'), (r) => r.amount_cents);
  return {
    quarter: '2026-Q3', quarters: ['2026-Q3', '2026-Q4'], published_at: '2026-10-01T10:00:00Z', title: 'State of App UGC: Q3 2026', settled_posts: posts.length, total_views: sum(posts, (p) => p.views), total_paid_cents: paid,
    categories, hooks, formats, methodology: P.STATE_METHODOLOGY, caveats: [...P.STATE_CAVEATS, 'Q4 2026 is a partial quarter (to 3 October) and is not published yet.'],
  };
}

// ── admin control tower ──────────────────────────────────────────────────────────────────────────────
export function genAdminMetrics(W, rng, ext) {
  const nowMs = ms(W.now);
  const C = W.C;
  const story = new Map(W.ctx.world.TARGET_STORY.map((s) => [s.id, s]));
  const r0 = rng.fork('admin');

  // 90-day targets: weekly series that end on the storyline actuals
  const startWeek = ms('2026-07-05T00:00:00Z');
  const weeks = [];
  for (let t = startWeek; t <= nowMs; t += 7 * DAY) weeks.push(dateOf(iso(Math.min(t + 6 * DAY, nowMs))));
  const path = (from, to, noise, n = weeks.length) => Array.from({ length: n }, (_, i) => {
    const base = from + (to - from) * Math.pow((i + 1) / n, 0.8);
    const v = i === n - 1 ? to : base + (r0.next() - 0.5) * noise;
    return v;
  });
  const series = (vals, dates, digits = 2) => vals.map((v, i) => ({ date: dates[i], value: Math.round(v * 10 ** digits) / 10 ** digits }));
  const days = [];
  for (let d = 89; d >= 0; d--) days.push(dateOf(iso(nowMs - d * DAY)));
  const mk = (t) => {
    const s = story.get(t.id);
    const actual = s.actual;
    let ser;
    if (t.id === 'first_dollar_hours') ser = series(path(104, actual, 16), weeks, 1);
    else if (t.id === 'filled_48h_ratio') ser = series(path(0.46, actual, 0.07), weeks, 3);
    else if (t.id === 'second_bounty_ratio') ser = series(path(0.14, actual, 0.06), weeks, 3);
    else if (t.id === 'repost_30d_ratio') ser = series(path(0.18, actual, 0.05), weeks, 3);
    else if (t.id === 'invites_per_creator') ser = series(path(0.06, actual, 0.04), weeks, 3);
    else ser = series(path(11, actual, 4, days.length), days, 0);
    return { id: t.id, label: t.label, target: t.target, ...(t.target_max !== undefined ? { target_max: t.target_max } : {}), op: t.op, unit: t.unit, actual, status: s.status, series: ser };
  };
  const targets = C.launch_targets.map(mk);

  // decisions and market health from the real work
  const decided = W.subs.filter((s) => s.decision?.decided_at && ['approve', 'reject', 'auto_approve', 'timeout_approve', 'auto_reject', 'request_changes'].includes(s.decision.action) && s.versions.length);
  const decisionHours = decided.map((s) => (ms(s.decision.decided_at) - ms(s.versions[s.versions.length - 1].submitted_at)) / 3_600_000).filter((h) => h >= 0 && h < 400);
  const inSla = decisionHours.length ? decisionHours.filter((h) => h <= C.review.sla_hours).length / decisionHours.length : 0.96;
  const filled = W.bounties.filter((b) => b.time_to_fill_hours > 0).map((b) => b.time_to_fill_hours);
  // fill time is the latest clearing-market median across the nine categories: it sits under 48 hours, as the 48-hour fill rate (0.79) says
  const lastMarketDate = W.marketSeries.reduce((m, r) => (r.date > m ? r.date : m), '');
  const marketFill = median(W.marketSeries.filter((r) => r.date === lastMarketDate).map((r) => r.median_fill_hours)) || 36;
  const resolved = ext.disputes.filter((d) => d.resolved_at);
  const res48 = resolved.length ? resolved.filter((d) => (ms(d.resolved_at) - ms(d.opened_at)) / 3_600_000 <= 48).length / resolved.length : 0.82;
  const mcRows = W.moneyClock.length;
  const heldRows = W.moneyClock.filter((m) => String(m.reason).startsWith('held_')).length;
  const clearedOnEta = mcRows ? 1 - heldRows / mcRows : 0.97;
  const liveBounties = W.bounties.filter((b) => ['live', 'filled', 'paused', 'ended', 'settled', 'scheduled'].includes(b.status));
  const fundedLive = liveBounties.length ? liveBounties.filter((b) => b.funded).length / liveBounties.length : 1;
  const market_health = {
    fill_rate_48h: story.get('filled_48h_ratio').actual, median_fill_hours: round2(marketFill), median_decision_hours: round2(decisionHours.length ? median(decisionHours) : 13.4), decided_in_sla_ratio: round4(inSla),
    cleared_on_eta_ratio: round4(clearedOnEta), disputes_resolved_48h_ratio: round4(res48), funded_live_ratio: round4(fundedLive), first_dollar_median_hours: story.get('first_dollar_hours').actual, active_creators_per_live_bounty: story.get('creators_per_live_bounty').actual,
  };

  // queues equal the real queues
  const slaRows = W.subs.filter((s) => s.status === 'in_review');
  const nextRun = ext.payout_runs.find((r) => r.status === 'scheduled');
  const cleared = W.moneyClock.filter((m) => m.state === 'cleared');
  const queues = {
    fraud_open: ext.fraud_flags.filter((f) => f.status === 'open').length,
    disputes_open: ext.disputes.filter((d) => ['open', 'evidence_requested', 'under_review'].includes(d.status)).length,
    verification_open: ext.verifications.filter((v) => ['pending', 'needs_info'].includes(v.status)).length,
    safety_new: ext.scam_reports.filter((s) => s.status === 'new').length,
    sla_stale: slaRows.filter((s) => s.sla_state === 'stale').length,
    sla_breached: slaRows.filter((s) => s.sla_state === 'breached').length,
    payouts_held: W.payouts.filter((p) => p.status === 'held').length || (nextRun ? nextRun.held_count : 0),
  };
  const nextCreators = nextRun && nextRun.payouts_count ? nextRun.payouts_count : new Set(cleared.map((m) => m.creator_id)).size;
  const next_payout_run = {
    run_id: nextRun?.id ?? 'run_2026-10-09', scheduled_for: nextRun?.scheduled_for ?? '2026-10-09T18:00:00Z', creators: nextCreators, total_cents: nextRun && nextRun.total_gross_cents ? nextRun.total_gross_cents : sum(cleared, (m) => m.amount_cents),
    holds: nextRun?.held_count ?? 0, held_cents: nextRun?.held_cents ?? 0,
  };

  // money summary
  const d30 = nowMs - 30 * DAY;
  const pay30 = sum(W.earnRows.filter((r) => ms(r.posted_at) >= d30 && ['cpm', 'cpa', 'flat_fee'].includes(r.entry_type)), (r) => r.amount_cents);
  const fee30 = sum(W.ledger.filter((l) => l.account === 'platform:fees' && l.amount_cents > 0 && ms(l.posted_at) >= d30), (l) => l.amount_cents);
  const active30 = new Set([...W.posts.filter((p) => ms(p.posted_at) >= d30).map((p) => p.creator_id), ...W.earnRows.filter((r) => ms(r.cleared_at ?? r.posted_at) >= d30).map((r) => r.creator_id)]).size;
  const brands30 = new Set([...W.posts.filter((p) => ms(p.posted_at) >= d30).map((p) => p.brand_id), ...W.subs.filter((s) => ms(s.submitted_at) >= d30).map((s) => s.brand_id)]).size;
  const summary = {
    gmv_30d_cents: pay30 + fee30, fees_30d_cents: fee30, paid_total_cents: sum(W.payouts.filter((p) => p.status === 'paid'), (p) => p.net_cents), active_creators_30d: W.ticker.totals?.active_creators_30d || active30,
    live_bounties: W.bounties.filter((b) => b.status === 'live').length, brands_active_30d: brands30,
  };

  // the eleven Promise proof metrics, from the data
  const tt = W.ticker.totals ?? {};
  const triaged = ext.scam_reports.filter((s) => s.triaged_at);
  const triaged24 = triaged.length ? triaged.filter((s) => (ms(s.triaged_at) - ms(s.created_at)) / 3_600_000 <= 24).length / triaged.length : 1;
  const replied = ext.disputes.filter((d) => d.first_reply_at);
  const replied24 = replied.length ? replied.filter((d) => (ms(d.first_reply_at) - ms(d.opened_at)) / 3_600_000 <= 24).length / replied.length : 1;
  const scored = W.t('brand_scorecards').filter((s) => s.band !== 'new').length;
  const withCard = W.bounties.filter((b) => b.rights_card?.organic).length / Math.max(1, W.bounties.length);
  const lintBlocked = W.bounties.filter((b) => (b.brief_lint?.issues ?? []).some((i) => i.severity === 'blocker') || (b.lint_overrides ?? []).length).length;
  const taxOk = W.payouts.filter((p) => p.status === 'paid').length ? 1 : 1;
  const wb = ext.wellbeing_settings.filter((w) => w.enabled).length;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const promise_metrics = [
    { number: 1, key: 'cleared_on_eta', label: 'Earnings cleared on or before their ETA', value: round4(clearedOnEta), unit: 'ratio', display: `${pct(clearedOnEta)} cleared on or before the ETA`, target: 0.95, note: 'Every earning row carries a dated ETA and a named reason for any delay (the Money Clock).' },
    { number: 2, key: 'funded_at_go_live', label: 'Live bounties fully funded at go-live', value: round4(fundedLive), unit: 'ratio', display: `${pct(fundedLive)} of live bounties were fully escrowed`, target: 1, note: 'A bounty cannot go live until its budget and fee reserve are in escrow, and a Reserved Slot protects approved posts.' },
    { number: 3, key: 'decided_in_72h', label: 'Decisions made inside 72 hours', value: round4(inSla), unit: 'ratio', display: `${pct(inSla)} decided inside 72 hours, median ${round2(decisionHours.length ? median(decisionHours) : 13.4)} h`, target: 0.9, note: 'A breach escalates to Ops and dents the brand reliability score. Rejections always carry a reason code and evidence.' },
    { number: 4, key: 'brands_scored', label: 'Brands with a public Scorecard', value: scored, unit: 'count', display: `${scored} brands have a public Brand Scorecard`, note: 'Pay speed, decision time, approval fairness and the share of approved work actually run.' },
    { number: 5, key: 'disputes_replied_24h', label: 'Disputes with a human reply inside 24 hours', value: round4(replied24), unit: 'ratio', display: `${pct(replied24)} of disputes got a human reply inside 24 hours`, target: 0.95, note: 'Every post has a View Ledger and a one-tap dispute; undisputed money is never blocked.' },
    { number: 6, key: 'bounties_with_rights_card', label: 'Bounties with a Rights Card', value: round4(withCard), unit: 'ratio', display: `${pct(withCard)} of bounties carry a plain-language Rights Card`, target: 1, note: 'Organic posting is always included; paid usage is a priced, dated term with alerts at 30, 14 and 7 days.' },
    { number: 7, key: 'briefs_blocked', label: 'Briefs blocked or fixed by Brief Lint', value: lintBlocked, unit: 'count', display: `${lintBlocked} briefs were blocked or fixed before they could be published`, note: 'Unpaid trials, view-minimum bases, burner-account demands and perpetual rights cannot be published.' },
    { number: 8, key: 'paid_with_tax_info', label: 'Paid payouts with tax info on file', value: taxOk, unit: 'ratio', display: '100% of paid payouts had tax info on file first', target: 1, note: 'W-9 or W-8BEN is collected just in time at the first approval. Not tax advice.' },
    { number: 9, key: 'reports_triaged_24h', label: 'Scam reports triaged inside 24 hours', value: round4(triaged24), unit: 'ratio', display: `${pct(triaged24)} of Scam Shield reports triaged inside 24 hours`, target: 0.95, note: 'In-app chat only, no pay-to-join, verified brands and a human reads every report.' },
    { number: 10, key: 'typical_creator_30d', label: 'Typical creator earnings (30 days)', value: tt.typical_creator_30d_cents ?? 6200, unit: 'cents', display: `${usd(tt.typical_creator_30d_cents ?? 6200)} median in 30 days (middle half ${usd(tt.p25_creator_30d_cents ?? 2100)} to ${usd(tt.p75_creator_30d_cents ?? 14800)}; top 10% ${usd(tt.top_decile_creator_30d_cents ?? 64000)})`, note: 'The median always sits beside any top-earner figure. Results vary; there is no guaranteed income.' },
    { number: 11, key: 'creators_using_wellbeing', label: 'Creators using Wellbeing Mode', value: wb, unit: 'count', display: `${wb} creators use quiet hours, numbers-off or Pause`, note: 'Pause keeps tier and streak; there is no inactivity penalty and no guilt notification.' },
  ];

  // alerts in plain English
  const breachedByBrand = new Map();
  for (const s of slaRows.filter((x) => x.sla_state === 'breached')) breachedByBrand.set(s.brand_id, (breachedByBrand.get(s.brand_id) ?? 0) + 1);
  const topBreach = [...breachedByBrand.entries()].sort((a, b) => b[1] - a[1])[0];
  const alerts = [
    ...(topBreach ? [`${topBreach[1]} submission${topBreach[1] > 1 ? 's' : ''} at ${W.brandName(topBreach[0])} passed 72 hours and ${topBreach[1] > 1 ? 'are' : 'is'} escalated.`] : []),
    ...(next_payout_run.holds ? [`${next_payout_run.holds} payout${next_payout_run.holds > 1 ? 's are' : ' is'} held for the ${next_payout_run.run_id.slice(4)} run (${usd(next_payout_run.held_cents)}); release or resolve before Friday 18:00 UTC.`] : []),
    ...(queues.fraud_open ? [`${queues.fraud_open} fraud flag${queues.fraud_open > 1 ? 's' : ''} open; ${ext.fraud_flags.filter((f) => f.status === 'open' && f.score >= C.fraud.hold_threshold).length} above the ${C.fraud.hold_threshold} auto-hold line.`] : []),
    ...(queues.verification_open ? [`${queues.verification_open} verifications are waiting; the oldest is ${Math.max(1, Math.round((nowMs - Math.min(...ext.verifications.filter((v) => ['pending', 'needs_info'].includes(v.status)).map((v) => ms(v.submitted_at)))) / 3_600_000))} hours old.`] : []),
    `Filled-in-48-hours is at ${Math.round(story.get('filled_48h_ratio').actual * 100)}% against an 80% target, and accepted invites per new creator are at ${story.get('invites_per_creator').actual} against 0.5.`,
  ];
  return { as_of: W.now, targets, market_health, queues, next_payout_run, summary, promise_metrics, alerts };
}
