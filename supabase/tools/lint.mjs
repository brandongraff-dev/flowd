#!/usr/bin/env node
// Static checks for the supabase migrations: a fast pass that needs no database. It catches the mistakes a database would reject at
// apply time: unbalanced quotes or parentheses, references to objects that do not exist, tables without RLS, unknown identifiers in
// generated checks and indexes, duplicate names.
//
// Usage: node supabase/tools/lint.mjs            (exit 1 on any error)
// It does NOT replace applying the migrations: node supabase/tools/verify-pglite.mjs does that in-process (Postgres 18), and
// `supabase db reset` against the real Supabase image (Postgres 17) is the final authority (see supabase/README.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from './lib/model.mjs';
import { lintStatements } from './lib/lint-semantic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);

// ── load migrations ────────────────────────────────────────────────────────────────────────────
const migDir = path.join(root, 'migrations');
const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(migDir, f), 'utf8')]));
const seedFile = path.join(root, 'seed.sql');
if (fs.existsSync(seedFile)) sources.set('seed.sql', fs.readFileSync(seedFile, 'utf8'));
const testsDir = path.join(root, 'tests');
if (fs.existsSync(testsDir)) for (const f of fs.readdirSync(testsDir).filter((x) => x.endsWith('.sql'))) sources.set(`tests/${f}`, fs.readFileSync(path.join(testsDir, f), 'utf8'));

/**
 * Remove comments, string literals and dollar-quoted bodies so structural checks do not trip on their contents.
 * Returns { code, bodies } where bodies are the dollar-quoted function bodies (checked separately).
 */
function strip(sql, file) {
  let out = '';
  const bodies = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === '-' && d === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = sql.indexOf('*/', i + 2); if (e < 0) { err(`${file}: unterminated block comment`); break; } i = e + 2; continue; }
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= n) { err(`${file}: unterminated string literal near "${sql.slice(i, i + 40).replace(/\n/g, ' ')}"`); i = n; break; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      out += "''";
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]*)\$/.exec(sql.slice(i, i + 40));
      if (m) {
        const tag = m[0];
        const e = sql.indexOf(tag, i + tag.length);
        if (e < 0) { err(`${file}: unterminated dollar-quoted body ${tag} near "${sql.slice(i, i + 50).replace(/\n/g, ' ')}"`); break; }
        bodies.push(sql.slice(i + tag.length, e));
        out += '$$$$';
        i = e + tag.length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return { code: out, bodies };
}

function balanced(code, file, label) {
  let depth = 0;
  for (const ch of code) {
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) { err(`${file}${label}: unbalanced ")"`); return; } }
  }
  if (depth !== 0) err(`${file}${label}: ${depth} unclosed "("`);
}

const defined = { tables: new Set(), types: new Set(), functions: new Set(), views: new Set(), sequences: new Set(), all: new Set() };
const stripped = new Map();
for (const [f, sql] of sources) {
  const s = strip(sql, f);
  stripped.set(f, s);
  balanced(s.code, f, '');
  s.bodies.forEach((b, k) => {
    const inner = strip(b, f + ` body#${k}`);
    balanced(inner.code, f, ` body#${k}`);
  });
  // statements must end with ; (loose: the last non-space char of the file)
  const tail = s.code.trimEnd().slice(-1);
  if (tail !== ';' && s.code.trim().length) err(`${f}: file does not end with a semicolon`);
}

// definitions (top-level and inside DO blocks' dynamic SQL are ignored)
for (const [f, s] of stripped) {
  for (const m of s.code.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|partitioned table)\s+(?:if\s+not\s+exists\s+)?(public|private|auth)\.([a-z_][a-z0-9_]*)/gi)) { defined.tables.add(`${m[1]}.${m[2]}`.toLowerCase()); defined.all.add(`${m[1]}.${m[2]}`.toLowerCase()); }
  for (const m of s.code.matchAll(/create\s+(?:type|domain)\s+(public|private)\.([a-z_][a-z0-9_]*)/gi)) { defined.types.add(`${m[1]}.${m[2]}`.toLowerCase()); defined.all.add(`${m[1]}.${m[2]}`.toLowerCase()); }
  for (const m of s.code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public|private|auth)\.([a-z_][a-z0-9_]*)/gi)) { defined.functions.add(`${m[1]}.${m[2]}`.toLowerCase()); defined.all.add(`${m[1]}.${m[2]}`.toLowerCase()); }
  for (const m of s.code.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(public|private)\.([a-z_][a-z0-9_]*)/gi)) { defined.views.add(`${m[1]}.${m[2]}`.toLowerCase()); defined.all.add(`${m[1]}.${m[2]}`.toLowerCase()); }
  for (const m of s.code.matchAll(/create\s+sequence\s+(?:if\s+not\s+exists\s+)?(public|private)\.([a-z_][a-z0-9_]*)/gi)) { defined.sequences.add(`${m[1]}.${m[2]}`.toLowerCase()); defined.all.add(`${m[1]}.${m[2]}`.toLowerCase()); }
}
// partitions created dynamically in DO blocks are named post_metrics_hourly_YYYY_MM and post_metrics_hourly_default
defined.all.add('public.post_metrics_hourly_default');

// references: schema.name used in code or in function bodies
const REF_OK_EXTRA = new Set(['auth.users', 'auth.uid', 'auth.jwt', 'auth.role', 'public.post_metrics_hourly_default']);
for (const [f, s] of stripped) {
  const scan = (text, where) => {
    for (const m of text.matchAll(/\b(public|private)\.([a-z_][a-z0-9_]*)\b/gi)) {
      const key = `${m[1]}.${m[2]}`.toLowerCase();
      if (defined.all.has(key) || REF_OK_EXTRA.has(key)) continue;
      // column-qualified references like public.x.y are matched by their first two parts; allow supabase_realtime names
      err(`${f}${where}: reference to ${key} which no migration defines`);
    }
  };
  scan(s.code, '');
  s.bodies.forEach((b, k) => scan(strip(b, f).code, ` body#${k}`));
}

// create trigger ... execute function X must resolve
for (const [f, s] of stripped) {
  for (const m of s.code.matchAll(/execute\s+(?:function|procedure)\s+(public|private)\.([a-z_][a-z0-9_]*)/gi)) {
    if (!defined.functions.has(`${m[1]}.${m[2]}`.toLowerCase())) err(`${f}: trigger executes undefined function ${m[1]}.${m[2]}`);
  }
}

// ── RLS coverage: every public table created in 0001 has RLS enabled in 0002 (or is a partition) ──
const rlsSql = [...stripped].filter(([f]) => /^0002/.test(f)).map(([, s]) => s.code).join('\n');
const rlsEnabled = new Set([...rlsSql.matchAll(/alter\s+table\s+public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1].toLowerCase()));
const policyTables = new Set([...rlsSql.matchAll(/create\s+policy\s+"?[^"\s]+"?\s+on\s+public\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase()));
let model = null;
try { model = buildModel(); } catch (e) { err(`model: ${e.message}`); }
if (model) {
  const serviceOnly = new Set(['ledger_balances', 'social_account_tokens', 'encrypted_secrets', 'idempotency_keys', 'inbound_events', 'job_runs', 'state_transitions', 'audit_log', 'fraud_flags', 'payout_runs', 'ml_models', 'admin_metrics', 'waitlist_entries']);
  for (const t of model.tables) {
    if (/^0002/.test([...stripped.keys()].find((k) => /^0002/.test(k)) ?? '')) {
      if (!rlsEnabled.has(t.name)) err(`0002: public.${t.name} has no "enable row level security"`);
      if (!policyTables.has(t.name) && !serviceOnly.has(t.name)) warnings.push(`0002: public.${t.name} has RLS enabled but no policy (service role only)`);
    }
  }
  // generated identifiers: names used in checks, indexes and uniques must be columns of the table
  const KEYWORDS = new Set(('and or not in is null between case when then else end true false where using btree gin hnsw brin desc asc nulls extract epoch from interval hours hour minute second day days at time zone round coalesce lower upper cardinality jsonb_typeof char_length split_part substr strpos array int integer bigint numeric text boolean timestamptz date timestamp jsonb extensions vector_cosine_ops utc isodow like ilike ' +
    'greatest least abs now current_date length concat position any all some exists select count sum min max distinct limit order by group having over partition as on public private to for with') .split(' '));
  for (const t of model.tables) {
    const cols = new Set(t.columns.map((c) => c.name));
    const scanExpr = (expr, where) => {
      const noStr = expr.replace(/'(?:[^']|'')*'/g, "''");
      for (const m of noStr.matchAll(/(?<![.\w$])([a-z_][a-z0-9_]*)\b(?!\s*\()/g)) {
        const w = m[1];
        if (cols.has(w) || KEYWORDS.has(w)) continue;
        if (/^[0-9]/.test(w)) continue;
        err(`${t.name}: ${where} mentions "${w}" which is neither a column nor a known keyword (expr: ${expr.slice(0, 120)})`);
      }
    };
    for (const k of t.checks) scanExpr(k.expr, `check ${k.name}`);
    for (const u of t.uniques) { if (u.cols) for (const c of u.cols) if (!cols.has(c)) err(`${t.name}: unique ${u.name} uses unknown column ${c}`); if (u.expr) scanExpr(u.expr, `unique ${u.name}`); if (u.where) scanExpr(u.where, `unique ${u.name} where`); }
    for (const i of t.indexes) scanExpr(i.def, `index ${i.name}`);
    for (const c of t.columns) if (c.generated && /\(/.test(c.generated)) scanExpr(c.generated.replace(/^generated always as/i, '').replace(/stored$/i, ''), `generated ${c.name}`);
    for (const k of t.primaryKey) if (!cols.has(k)) err(`${t.name}: primary key column ${k} is missing`);
    for (const f of t.fks) if (!cols.has(f.column)) err(`${t.name}: foreign key on missing column ${f.column}`);
    for (const f of t.compositeFks ?? []) for (const c of f.columns) if (!cols.has(c)) err(`${t.name}: composite FK uses missing column ${c}`);
  }
}

if (model) lintStatements(sources, model, err);

// ── report ─────────────────────────────────────────────────────────────────────────────────────
const stats = [...stripped.keys()].map((f) => `${f}: ${sources.get(f).split('\n').length} lines`).join(', ');
console.log(`checked ${stripped.size} sql files (${stats})`);
console.log(`defined: ${defined.tables.size} tables, ${defined.types.size} types/domains, ${defined.functions.size} functions, ${defined.views.size} views, ${defined.sequences.size} sequences`);
for (const w of warnings.slice(0, 40)) console.warn(`warn: ${w}`);
if (warnings.length > 40) console.warn(`warn: ... and ${warnings.length - 40} more`);
if (errors.length) {
  for (const e of errors.slice(0, 120)) console.error(`error: ${e}`);
  if (errors.length > 120) console.error(`error: ... and ${errors.length - 120} more`);
  console.error(`${errors.length} error(s)`);
  process.exit(1);
}
console.log('supabase lint: ok');
