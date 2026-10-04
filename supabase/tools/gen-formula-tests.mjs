#!/usr/bin/env node
// Generates supabase/tests/formulas.test.sql from packages/contract/formula-vectors.json.
//
// The vectors are the executable agreement between the contract's reference formulas (schema/formulas.mjs), the web engine (Vitest),
// the iOS engine (FlowdTests) and the database (supabase/migrations/0003_functions.sql). Every case here replays one vector against the
// SQL function that mirrors the formula, so a change to a constant or a rounding rule fails loudly in all four places.
//
// Usage:  node supabase/tools/gen-formula-tests.mjs            write the file
//         node supabase/tools/gen-formula-tests.mjs --check    exit 1 when the file on disk is stale
//
// Not covered here on purpose (no SQL implementation exists; they live in services/ml and apps/web/src/lib/engine): expected_earnings,
// hook_score, flow_score. The count of skipped vectors is printed in the generated header.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const vectors = JSON.parse(fs.readFileSync(path.resolve(root, '../packages/contract/formula-vectors.json'), 'utf8'));
const check = process.argv.includes('--check');

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const n = (v) => (v === null || v === undefined ? 'null' : String(v));

const blocks = [];
let cases = 0;
function block(title, body) {
  blocks.push(`-- ${title}\ndo $t$\nbegin\n${body.trimEnd()}\nend\n$t$;\n`);
}

// ── funding ───────────────────────────────────────────────────────────────────────────────────
block(`funding (${vectors.funding.length} vectors): fee reserve, escrow total, matched budget, processing, card charge`, vectors.funding.map((v, i) => {
  cases++;
  const call = v.in.brand_funds_cents !== undefined
    ? `public.first_bounty_funding(${n(v.in.brand_funds_cents)})`
    : `public.funding(${n(v.in.budget_cents)}, ${n(v.in.take_rate)}::numeric, ${n(v.in.matched_cents ?? 0)})`;
  return `  perform tap.same('funding[${i}]', (select to_jsonb(f) from ${call} f), ${j(v.out)});`;
}).join('\n'));

// ── settle_post ───────────────────────────────────────────────────────────────────────────────
block(`settle_post (${vectors.settle_post.length} vectors): stacked CPM + CPA pay, per-video cap, fee per leg`, vectors.settle_post.map((v, i) => {
  cases++;
  const c = v.in.conv ?? {};
  const r = v.in.rates ?? {};
  const call = `public.settle_post_math(${n(v.in.views)}, ${n(v.in.cpm)}, ${n(c.install ?? 0)}, ${n(c.trial ?? 0)}, ${n(c.paid ?? 0)}, ${n(r.install ?? 0)}, ${n(r.trial ?? 0)}, ${n(r.paid ?? 0)}, ${n(v.in.cap)}, ${n(v.in.take_rate)}::numeric, ${n(v.in.already_paid_cents ?? 0)})`;
  return `  perform tap.same('settle_post[${i}]', (select to_jsonb(s) from ${call} s), ${j(v.out)});`;
}).join('\n'));

// ── instant payout ────────────────────────────────────────────────────────────────────────────
block(`instant_payout (${vectors.instant_payout.length} vectors): 1.5% fee, $0.50 floor, $15 cap, free allowances`, vectors.instant_payout.map((v, i) => {
  cases++;
  const call = `public.instant_payout_math(${n(v.in.amount_cents)}, ${q(v.in.tier)}::public.tier, ${v.in.founding_free ? 'true' : 'false'}, ${n(v.in.free_instant_used_this_week ?? 0)})`;
  return `  perform tap.same('instant_payout[${i}]', (select to_jsonb(p) from ${call} p), ${j(v.out)});`;
}).join('\n'));

// ── tiers ─────────────────────────────────────────────────────────────────────────────────────
block(`tier (${vectors.tier.length} vectors): highest tier whose thresholds are all met, progress to the next`, vectors.tier.map((v, i) => {
  cases++;
  const a = v.in;
  const args = `${n(a.lifetime_cleared_cents)}, ${n(a.approved_count)}, ${n(a.approval_rate)}::numeric, ${n(a.reliability_score)}, ${a.elite_reviewed ? 'true' : 'false'}`;
  return `  perform tap.eq('tier[${i}].tier', public.tier_for(${args})::text, ${q(v.out.tier)});\n  perform tap.same('tier[${i}].progress', public.tier_progress(${args}), ${j(v.out.progress)});`;
}).join('\n'));

// ── fraud ─────────────────────────────────────────────────────────────────────────────────────
block(`fraud (${vectors.fraud.length} vectors): score = min(100, sum(round(max_points x severity))), band`, vectors.fraud.map((v, i) => {
  cases++;
  return `  perform tap.same('fraud[${i}]', public.fraud_score(${j(v.in)}), ${j(v.out)});`;
}).join('\n'));

// ── money clock ───────────────────────────────────────────────────────────────────────────────
block(`money_clock (${vectors.money_clock.length} vectors): window end, clearing run, weekly payout ETA`, vectors.money_clock.map((v, i) => {
  cases++;
  const o = v.out;
  const checks = [
    `r.state::text = ${q(o.state)}`,
    `r.reason::text = ${q(o.reason)}`,
    `r.window_ends_at = ${q(o.window_ends_at)}::timestamptz`,
    o.eta_at ? `r.eta_at = ${q(o.eta_at)}::timestamptz` : 'r.eta_at is null',
    o.cleared_at ? `r.cleared_at = ${q(o.cleared_at)}::timestamptz` : 'r.cleared_at is null',
  ].join(' and ');
  return `  perform tap.ok('money_clock[${i}]', (select ${checks} from public.money_clock_state_for(${q(v.in.posted_at)}::timestamptz, ${q(v.in.now)}::timestamptz) r));`;
}).join('\n'));

// ── conversion clearing ───────────────────────────────────────────────────────────────────────
block(`conversion_clearing (${vectors.conversion_clearing.length} vectors): install 24 h, trial 72 h, paid 168 h, then the next 14:00Z run`, vectors.conversion_clearing.map((v, i) => {
  cases++;
  return `  perform tap.ok('conversion_clearing[${i}]', public.conversion_clearing_run(${q(v.in.kind)}::public.conversion_kind, ${q(v.in.occurred_at)}::timestamptz) = ${q(v.out)}::timestamptz);`;
}).join('\n'));

// ── sla ───────────────────────────────────────────────────────────────────────────────────────
block(`sla (${vectors.sla.length} vectors): on_track under 48 h, stale to 72 h, breached after`, vectors.sla.map((v, i) => {
  cases++;
  return `  perform tap.eq('sla[${i}]', public.sla_state_for(${n(v.in.hours)}::numeric)::text, ${q(v.out)});`;
}).join('\n'));

// ── brand reliability ─────────────────────────────────────────────────────────────────────────
block(`brand_reliability (${vectors.brand_reliability.length} vectors): weights, bands, "new" under 10 decisions`, vectors.brand_reliability.map((v, i) => {
  cases++;
  const a = v.in;
  const call = `public.brand_reliability_calc(${n(a.decisions_n)}, ${n(a.approved_n)}, ${n(a.decision_hours_median)}::numeric, ${n(a.appeals_overturned)}, ${n(a.pays_on_time_ratio)}::numeric, ${n(a.run_rate)}::numeric, ${n(a.reply_hours_median)}::numeric)`;
  return `  perform tap.same('brand_reliability[${i}]', ${call}, ${j(v.out)});`;
}).join('\n'));

// ── price vs fill time ────────────────────────────────────────────────────────────────────────
block(`price_curve (${vectors.price_curve.length} vectors): p50 / p80 fill hours and confidence at six CPMs`, vectors.price_curve.map((v, i) => {
  cases++;
  return `  perform tap.same('price_curve[${i}]', public.price_curve(${n(v.in.clearing_cpm_cents)}, ${n(v.in.median_fill_hours)}, ${n(v.in.sample_n)}), ${j(v.out)});`;
}).join('\n'));

// ── match score ───────────────────────────────────────────────────────────────────────────────
block(`match_score (${vectors.match_score.length} vectors): niche 40, platform 15, region 15, price 15, brand 10, recency 5; null when a gate fails`, vectors.match_score.map((v, i) => {
  cases++;
  const a = v.in;
  const gates = Object.values(a.gates).every(Boolean);
  const call = `public.match_score(${gates}, ${n(a.niche_overlap)}, ${n(a.platform_fit)}, ${n(a.region_fit)}, ${n(a.price_ratio)}, ${n(a.brand_reliability)}, ${n(a.bounty_age_days)})`;
  return v.out === null
    ? `  perform tap.ok('match_score[${i}]', ${call} is null);`
    : `  perform tap.eq('match_score[${i}]', ${call}::text, ${q(v.out)});`;
}).join('\n'));

const skipped = ['expected_earnings', 'hook_score', 'flow_score'].reduce((s, k) => s + (vectors[k]?.length ?? 0), 0);

const header = `-- flowd tests: formula parity with packages/contract/formula-vectors.json
-- GENERATED by supabase/tools/gen-formula-tests.mjs (npm run supabase:gen). Do not edit by hand.
--
-- ${cases} vector cases replayed against the SQL formulas of 0003_functions.sql. ${skipped} further vectors (expected_earnings, hook_score,
-- flow_score) have no SQL implementation by design: they run in services/ml and in the web and iOS engines.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_helpers.sql -f supabase/tests/formulas.test.sql
--       node supabase/tools/verify-pglite.mjs            (no Docker: in-process Postgres 18 with pgvector)
-- Every *.test.sql file is plain SQL that rolls back, so it is safe against a dev database.

begin;
`;

const content = header + '\n' + blocks.join('\n') + `\nselect 'formulas.test.sql: ${cases} vector cases passed' as result;\nrollback;\n`;

const file = path.join(root, 'tests', 'formulas.test.sql');
if (check) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== content) { console.error('stale: supabase/tests/formulas.test.sql (run: node supabase/tools/gen-formula-tests.mjs)'); process.exit(1); }
  console.log('supabase/tests/formulas.test.sql is up to date');
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`wrote supabase/tests/formulas.test.sql (${cases} cases)`);
}
