#!/usr/bin/env node
// Applies every migration to an in-process Postgres 18 (PGlite, WASM) with pgvector, then runs every supabase/tests/*.test.sql.
// No Docker, no Supabase CLI, no network after the one-time install. This is how the migrations and the money path are verified
// on a machine without Docker; on a real Postgres run `supabase db reset --no-seed && sh supabase/tools/test-psql.sh` (same files, psql runner;
// the tests use their own tiny "tap" helpers, not pgTAP, so `supabase test db` does not run them). See supabase/README.md.
//
//   npm i --no-save @electric-sql/pglite @electric-sql/pglite-pgvector      (anywhere; nothing is added to the repo)
//   node supabase/tools/verify-pglite.mjs                  apply migrations, run every test file
//   node supabase/tools/verify-pglite.mjs --only money     run only test files whose name contains "money"
//   node supabase/tools/verify-pglite.mjs --seed           load supabase/seed.sql, then run tests/seed/*.test.sql (instead of the other tests: they
//                                                          build their own worlds with the same ids)
//   node supabase/tools/verify-pglite.mjs --seed-file seed.full.sql   the full fixture world (generate it first: node supabase/tools/gen-seed.mjs), then
//                                                          tests/seed-full/*.test.sql: counts, the ledger audit and what each persona may see
//   node supabase/tools/verify-pglite.mjs --migrations     apply the migrations only
//
// If the packages are installed outside the repo, point PGLITE_DIR at the folder that holds node_modules/@electric-sql.
//
// What is real here: the SQL, the PL/pgSQL, the constraints, the triggers, the deferred constraint triggers, RLS (roles are switched with
// SET ROLE inside the tests), pgvector columns and HNSW indexes. What is not: pg_cron / pg_net / Vault (migration 0006 skips itself),
// the Supabase auth schema (0001 creates the same minimal shim it creates on any vanilla Postgres) and Realtime.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const seedFileArg = args.includes('--seed-file') ? args[args.indexOf('--seed-file') + 1] : null;
const withSeed = args.includes('--seed') || seedFileArg !== null;
const migrationsOnly = args.includes('--migrations');

async function load(spec, relative) {
  try {
    return await import(spec);
  } catch (err) {
    const dir = process.env.PGLITE_DIR;
    if (!dir) {
      console.error(`Cannot load ${spec}. Install once with:\n  npm i --no-save @electric-sql/pglite @electric-sql/pglite-pgvector\nor set PGLITE_DIR to the folder that holds node_modules/@electric-sql.`);
      process.exit(2);
    }
    const req = createRequire(path.join(dir, 'x.js'));
    void req;
    return import(pathToFileURL(path.join(dir, 'node_modules', relative)).href);
  }
}

const { PGlite } = await load('@electric-sql/pglite', '@electric-sql/pglite/dist/index.js');
const { vector } = await load('@electric-sql/pglite-pgvector', '@electric-sql/pglite-pgvector/dist/index.js');
const { pg_trgm } = await load('@electric-sql/pglite/contrib/pg_trgm', '@electric-sql/pglite/dist/contrib/pg_trgm.js');
const { pgcrypto } = await load('@electric-sql/pglite/contrib/pgcrypto', '@electric-sql/pglite/dist/contrib/pgcrypto.js');

const db = new PGlite({ extensions: { vector, pg_trgm, pgcrypto } });

function report(file, err, sql) {
  console.error(`FAIL ${file}: ${err.message}`);
  if (err.position && sql) {
    const line = sql.slice(0, Number(err.position)).split('\n').length;
    console.error(`  at line ${line}:\n    ${sql.split('\n').slice(Math.max(0, line - 2), line + 1).join('\n    ')}`);
  }
  for (const k of ['detail', 'hint', 'where']) if (err[k]) console.error(`  ${k}: ${err[k]}`);
}

let failed = 0;
const t0 = Date.now();

// 1. migrations
const migDir = path.join(root, 'migrations');
for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
  const t = Date.now();
  try {
    await db.exec(sql);
    console.log(`ok   migration ${f} (${Date.now() - t} ms)`);
  } catch (err) {
    report(f, err, sql);
    process.exit(1);
  }
}

// 2. seed (optional)
if (withSeed) {
  const seedFile = path.resolve(root, seedFileArg ?? 'seed.sql');
  if (!fs.existsSync(seedFile)) {
    console.error(`${seedFile} does not exist. The full fixture seed is generated: node supabase/tools/gen-seed.mjs`);
    process.exit(1);
  }
  const sql = fs.readFileSync(seedFile, 'utf8');
  const t = Date.now();
  try {
    await db.exec(sql);
    console.log(`ok   ${path.basename(seedFile)} (${Date.now() - t} ms)`);
  } catch (err) {
    report(path.basename(seedFile), err, sql);
    process.exit(1);
  }
}

// 3. tests
if (!migrationsOnly) {
  const helpersDir = path.join(root, 'tests');
  // seed.sql has its own assertions (tests/seed); the generated full world has its (tests/seed-full, expectations computed from the fixtures)
  const testDir = withSeed ? path.join(helpersDir, seedFileArg ? 'seed-full' : 'seed') : helpersDir;
  const files = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((x) => x.endsWith('.test.sql')).sort() : [];
  const helpers = path.join(helpersDir, '00_helpers.sql');
  if (fs.existsSync(helpers)) {
    try {
      await db.exec(fs.readFileSync(helpers, 'utf8'));
      console.log('ok   tests/00_helpers.sql');
    } catch (err) {
      report('00_helpers.sql', err, fs.readFileSync(helpers, 'utf8'));
      process.exit(1);
    }
  }
  for (const f of files) {
    if (only && !f.includes(only)) continue;
    const sql = fs.readFileSync(path.join(testDir, f), 'utf8');
    const t = Date.now();
    try {
      const results = await db.exec(sql);
      const last = results.at(-2) ?? results.at(-1);
      const line = last?.rows?.[0] ? Object.values(last.rows[0])[0] : 'passed';
      console.log(`ok   test ${f}: ${line} (${Date.now() - t} ms)`);
    } catch (err) {
      failed++;
      report(f, err, sql);
      try { await db.exec('rollback'); } catch { /* nothing to roll back */ }
      try { await db.exec('reset role'); } catch { /* ignore */ }
    }
  }
}

console.log(failed ? `\n${failed} test file(s) failed` : `\nall good (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
