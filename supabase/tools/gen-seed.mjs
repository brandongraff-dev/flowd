#!/usr/bin/env node
// Generates supabase/seed.full.sql: the whole demo world of packages/contract/fixtures (80 files) as one SQL transaction.
//
//   node supabase/tools/gen-seed.mjs                       write supabase/seed.full.sql
//   node supabase/tools/gen-seed.mjs --out some/file.sql   write somewhere else
//   node supabase/tools/gen-seed.mjs --stats               print what would be written, write nothing
//   node supabase/tools/gen-seed.mjs --tests-only          write only supabase/tests/seed-full/full-world.test.sql (fast; it is committed, the seed is not)
//   node supabase/tools/gen-seed.mjs --check               fail if the committed test file is out of date with the fixtures
//
// Load it into an EMPTY database (it is not idempotent: ids are the fixture ids, so a second run hits primary keys):
//   supabase db reset --no-seed && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.full.sql        (the database URL is in `supabase status`)
//   node supabase/tools/verify-pglite.mjs --seed-file seed.full.sql                                          (in-process Postgres, then tests/seed-full)
// or point supabase/config.toml [db.seed] sql_paths at it for `supabase db reset`.
//
// What it does
//   * auth.users first (a trigger creates a public.users row, which the seed replaces with the fixture row), then every table in foreign-key order,
//     each as `insert ... select ... from jsonb_populate_recordset(null::public.<table>, <the fixture rows as JSON>)`. The database does all the type
//     conversion (enums, arrays, domains, timestamps) and every constraint and trigger runs, so a fixture that breaks a rule fails the seed.
//   * flowd.seed_mode = on (transaction local): the *soft* rules (state-machine edges, claim guards, snapshot order, pricing recompute) are skipped so
//     rows can be loaded in any historical state. The money rules are NOT skipped: every ledger transaction must net to zero, every escrow must reconcile
//     with its bounty, and no wallet or escrow may end below zero. They are checked at COMMIT.
//   * the mapping (renames, child tables, read models, backend columns) lives in tools/lib/seed-map.mjs; nothing is dropped silently.
// The output is about the size of the fixtures (~20 MB) and is gitignored: generate it, do not commit it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from './lib/model.mjs';
import { buildSeedRows, uuidFrom, waitlistPlan } from './lib/seed-map.mjs';
import { buildFullWorldTest } from './lib/seed-tests.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const fixturesDir = path.join(root, 'packages/contract/fixtures');
const args = process.argv.slice(2);
const outPath = path.resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'supabase/seed.full.sql');
const statsOnly = args.includes('--stats');
const testsOnly = args.includes('--tests-only');
const checkOnly = args.includes('--check');
const testPath = path.join(root, 'supabase/tests/seed-full/full-world.test.sql');

const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixturesDir, `${name}.json`), 'utf8'));

const model = buildModel();
const { rows, unmapped, notes } = buildSeedRows(model, readFixture);
if (unmapped.length) {
  console.error(`gen-seed: fixture fields that map to no column (add a rename in table-config.mjs, or list them in seed-map.mjs DERIVED):\n  ${unmapped.join('\n  ')}`);
  process.exit(1);
}
const world = readFixture('world');
const users = readFixture('users');
const waitlist = waitlistPlan(readFixture('waitlist'));

// ---- table order: parents before children (every foreign key is deferrable, but BEFORE triggers may read a parent) ----------------
const deps = new Map(model.tables.map((t) => [t.name, new Set([...t.fks, ...(t.compositeFks ?? [])].map((f) => f.table).filter((x) => x !== t.name && model.byName.has(x)))]));
const order = [];
const state = new Map();
const visit = (n) => {
  if (state.get(n) === 'done') return;
  if (state.get(n) === 'busy') return; // a cycle: the foreign keys are deferrable, so any order inside it is fine
  state.set(n, 'busy');
  for (const d of [...deps.get(n)].sort()) visit(d);
  state.set(n, 'done');
  order.push(n);
};
for (const t of model.tables.map((x) => x.name).sort()) visit(t);

// ---- SQL writers -------------------------------------------------------------------------------------------------------------------
const TAG = '$fx$';
const literal = (rowsChunk) => {
  const json = JSON.stringify(rowsChunk);
  if (json.includes(TAG)) throw new Error('a fixture value contains the dollar-quote tag $fx$');
  return `${TAG}${json}${TAG}::jsonb`;
};
const ident = (s) => `"${s}"`;
const CHUNK_BYTES = 1_500_000;

function insertStatements(table, list) {
  if (!list.length) return [];
  const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
  const known = new Set(model.byName.get(table).columns.map((c) => c.name));
  const bad = cols.filter((c) => !known.has(c));
  if (bad.length) throw new Error(`${table}: seed rows carry columns the table does not have: ${bad.join(', ')}`);
  const colSql = cols.map(ident).join(', ');
  const out = [];
  let chunk = [];
  let size = 0;
  const flush = () => {
    if (!chunk.length) return;
    out.push(`insert into public.${table} (${colSql})\nselect ${colSql} from jsonb_populate_recordset(null::public.${table}, ${literal(chunk)});`);
    chunk = []; size = 0;
  };
  for (const r of list) {
    const n = JSON.stringify(r).length;
    if (size + n > CHUNK_BYTES) flush();
    chunk.push(r); size += n;
  }
  flush();
  return out;
}

// ---- the file -------------------------------------------------------------------------------------------------------------------------
const personaIds = new Set([world.personas.creator.user_id, world.personas.brand.user_id, world.personas.admin.user_id]);
const authRows = users.map((u) => ({ id: uuidFrom(u.id), email: u.email, role: u.role, name: u.display_name, login: personaIds.has(u.id) }));

const parts = [];
parts.push(`-- flowd full demo seed: every packages/contract fixture, ${rows.size + 1} tables. GENERATED by supabase/tools/gen-seed.mjs: do not edit, do not commit.
-- Load into an EMPTY database: supabase db reset --no-seed && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.full.sql
-- World "now" is ${world.now} (fixtures are dated relative to it; the Money Clock views use the real clock, so they read as history unless you pin it).
-- Local sign-in (Supabase Auth, local development only): ${world.personas.creator.user_id.replace('usr_', '')}, ${world.personas.brand.user_id.replace('usr_', '')} and ${world.personas.admin.user_id.replace('usr_', '')} with the password "flowd-demo-local"; the other users have an auth row and no password.
begin;
select set_config('flowd.seed_mode', 'on', true);
set constraints all deferred;
`);

parts.push(`-- 1. auth.users (a trigger creates a public.users row for each; step 2 replaces them with the fixture rows) -----------------------------------------
do $auth$
declare
  r record;
  v_full boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password');
begin
  for r in select * from jsonb_to_recordset(${literal(authRows)}) as t(id uuid, email text, role text, name text, login boolean) loop
    if v_full then
      -- a real Supabase Auth schema: GoTrue needs empty strings (not NULL) in the token columns, and an identity row to sign in with a password
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
              case when r.login then extensions.crypt('flowd-demo-local', extensions.gen_salt('bf')) else '' end, now(),
              jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', case when r.role = 'brand_member' then 'brand_member' else 'creator' end),
              jsonb_build_object('full_name', r.name), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), r.id, jsonb_build_object('sub', r.id::text, 'email', r.email), 'email', r.id::text, now(), now(), now());
    else
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (r.id, r.email, jsonb_build_object('role', case when r.role = 'brand_member' then 'brand_member' else 'creator' end), jsonb_build_object('full_name', r.name));
    end if;
  end loop;
  -- the trigger's rows carry generated ids and defaults: the fixture rows (readable ids, real profiles) replace them
  delete from public.users;
end
$auth$;
`);

let n = 2;
const counts = {};
for (const table of order) {
  const list = rows.get(table);
  if (!list || !list.length) continue;
  counts[table] = list.length;
  parts.push(`-- ${n++}. ${table} (${list.length}) ${'-'.repeat(Math.max(4, 110 - table.length - String(list.length).length))}`);
  parts.push(...insertStatements(table, list));
  parts.push('');
}

// the waitlist: the leaders as literal rows, the rest deterministic filler so that v_waitlist_totals reproduces the read model
counts.waitlist_entries = waitlist.leaders.length + waitlist.fillCreators + waitlist.fillBrands;
parts.push(`-- ${n++}. waitlist_entries (${counts.waitlist_entries}): ${waitlist.leaders.length} leaders as in the fixture, then filler rows (no handle, a .test address) up to the fixture totals ${'-'.repeat(8)}`);
parts.push(...insertStatements('waitlist_entries', waitlist.leaders));
parts.push(`insert into public.waitlist_entries (id, email, kind, handle, referral_code, referrals_count, joined_at, invite_accepted_at)
select 'wl_' || t.kind || '_' || lpad(t.i::text, 6, '0'),
       t.kind || t.i || '@waitlist.example.test', t.kind::public.party_kind, null,
       t.kind || lpad(t.i::text, 6, '0'),
       (t.i % ${Math.max(1, waitlist.leaderMinReferrals)}),
       timestamptz '${waitlist.leaderLatestJoin}' - (t.i || ' minutes')::interval,
       case when t.i <= ${waitlist.invitesAccepted} and t.kind = 'creator' then timestamptz '${waitlist.leaderLatestJoin}' else null end
from (
  select 'creator' as kind, g as i from generate_series(1, ${waitlist.fillCreators}) g
  union all
  select 'brand', g from generate_series(1, ${waitlist.fillBrands}) g
) t;
`);

parts.push(`-- ${n++}. finish ----------------------------------------------------------------------------------------------------------------------------------------
select public.refresh_market_views();
commit;

-- the deferred money rules (balanced transactions, escrow reconciliation, balance floors) ran at COMMIT. This proves the result from the legs:
do $audit$
declare v_audit jsonb := public.audit_ledger();
begin
  if not (v_audit ->> 'ok')::boolean then
    raise exception 'ledger audit failed after the full seed: %', v_audit;
  end if;
end
$audit$;
analyze;
`);

const sql = parts.join('\n');
for (const note of notes) console.log(`note: ${note}`);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const testSql = buildFullWorldTest({ rows, readFixture, world, waitlist, counts });

if (checkOnly) {
  const current = fs.existsSync(testPath) ? fs.readFileSync(testPath, 'utf8') : '';
  if (current !== testSql) {
    console.error('supabase/tests/seed-full/full-world.test.sql is out of date: run node supabase/tools/gen-seed.mjs --tests-only');
    process.exit(1);
  }
  console.log('supabase/tests/seed-full/full-world.test.sql is up to date');
} else if (statsOnly) {
  console.log(`${Object.keys(counts).length} tables, ${total} rows, ${(Buffer.byteLength(sql) / 1e6).toFixed(1)} MB (not written)`);
} else {
  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  fs.writeFileSync(testPath, testSql);
  console.log(`wrote ${path.relative(root, testPath)}`);
  if (!testsOnly) {
    fs.writeFileSync(outPath, sql);
    console.log(`wrote ${path.relative(root, outPath)}: ${Object.keys(counts).length} tables, ${total} rows, ${(Buffer.byteLength(sql) / 1e6).toFixed(1)} MB`);
  }
}
