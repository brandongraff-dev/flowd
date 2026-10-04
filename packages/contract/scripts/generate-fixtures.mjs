#!/usr/bin/env node
// generate-fixtures: the fixture orchestrator.
//
//   node packages/contract/scripts/generate-fixtures.mjs                 generate into packages/contract/fixtures and validate
//   node packages/contract/scripts/generate-fixtures.mjs --out <dir>     write somewhere else (nothing in fixtures/ is touched)
//   node packages/contract/scripts/generate-fixtures.mjs --seed 42       another seed (default 20261003: the demo world)
//   node packages/contract/scripts/generate-fixtures.mjs --strict        warnings fail the run (use before handing off)
//   node packages/contract/scripts/generate-fixtures.mjs --no-validate   skip validation
//   node packages/contract/scripts/generate-fixtures.mjs --determinism   generate twice and fail if the bytes differ
//   node packages/contract/scripts/generate-fixtures.mjs --dry           generate and validate but write nothing
//
// Pipeline: gen/core.mjs generate(ctx) -> gen/ext.mjs generate(ctx, core) -> world.counts -> canonical key order (schema field order,
// no nulls, ratios rounded to 4 dp) -> JSON files (one row per line) -> validate-fixtures. One file per entity, named after its table.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ENTITIES, ENTITY_BY_TABLE, WORLD } from '../schema/index.mjs';
import { createContext, canonicalRow, NOW, LAUNCH_DATE } from './gen/lib.mjs';
import { validate } from './validate-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const outDir = path.resolve(opt('out') ?? path.join(here, '..', 'fixtures'));
const seed = opt('seed') ? Number(opt('seed')) : WORLD.WORLD_SEED;
const strict = flag('strict');
const dry = flag('dry');
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

async function generateOnce() {
  const ctx = createContext({ seed });
  const coreMod = await import('./gen/core.mjs');
  const extMod = await import('./gen/ext.mjs');
  const core = await coreMod.generate(ctx);
  const ext = await extMod.generate(ctx, core);

  const problems = [];
  for (const [label, got, owner] of [['core', core, 'core'], ['ext', ext, 'ext']]) {
    if (!got || typeof got !== 'object') { problems.push(`${label}.generate() must return an object of tables`); continue; }
    const want = ENTITIES.filter((e) => e.owner === owner).map((e) => e.table);
    for (const t of want) if (!(t in got)) problems.push(`${label}.generate() is missing table "${t}"`);
    for (const t of Object.keys(got)) {
      const e = ENTITY_BY_TABLE.get(t);
      if (!e) problems.push(`${label}.generate() returned unknown table "${t}"`);
      else if (e.owner !== owner) problems.push(`${label}.generate() returned "${t}", which is owned by ${e.owner}`);
    }
  }
  if (problems.length) throw new Error(`generator contract violated:\n  - ${problems.join('\n  - ')}`);

  const data = { ...core, ...ext };
  // canonical form
  const canonical = {};
  for (const e of ENTITIES) {
    const v = data[e.table];
    if ((e.shape ?? 'array') === 'object') {
      if (Array.isArray(v) || typeof v !== 'object' || v === null) throw new Error(`table "${e.table}" must be a single object`);
      canonical[e.table] = canonicalRow(e.name, v);
    } else {
      if (!Array.isArray(v)) throw new Error(`table "${e.table}" must be an array`);
      canonical[e.table] = v.map((row) => canonicalRow(e.name, row));
    }
  }
  // world manifest: the orchestrator owns now, seed, version and counts
  const world = canonical.world;
  world.id = 'world_flowd';
  world.now = NOW;
  world.launch_date = LAUNCH_DATE;
  world.seed = seed;
  world.contract_version = WORLD.CONTRACT_VERSION;
  world.counts = {};
  for (const e of ENTITIES) if (e.table !== 'world') world.counts[e.table] = (e.shape ?? 'array') === 'object' ? 1 : canonical[e.table].length;
  canonical.world = canonicalRow('World', world);
  return canonical;
}

// compact but readable: one row per line for tables (diff-friendly, about 40% smaller); single-object files keep a 2-space indent
const serialise = (value) => (Array.isArray(value) && value.length > 0 && value.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))
  ? `[\n${value.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n]\n`
  : `${JSON.stringify(value, null, 2)}\n`);
const sha = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

const t0 = Date.now();
const canonical = await generateOnce();
const files = ENTITIES.map((e) => ({ table: e.table, text: serialise(canonical[e.table]) }));

if (flag('determinism')) {
  const again = await generateOnce();
  const bad = ENTITIES.filter((e) => serialise(again[e.table]) !== files.find((f) => f.table === e.table).text).map((e) => e.table);
  if (bad.length) { console.error(`NOT deterministic: ${bad.join(', ')} differ between two runs with seed ${seed}`); process.exit(1); }
  console.log(`deterministic: two runs with seed ${seed} produced identical bytes (${sha(files.map((f) => f.text).join(''))}).`);
}

let total = 0;
let big = 0;
for (const f of files) {
  total += Buffer.byteLength(f.text);
  if (Buffer.byteLength(f.text) > MAX_FILE_BYTES) { big++; console.warn(`WARN  ${f.table}.json is ${(Buffer.byteLength(f.text) / 1048576).toFixed(1)} MB (budget ${(MAX_FILE_BYTES / 1048576).toFixed(1)} MB)`); }
}
if (total > MAX_TOTAL_BYTES) console.warn(`WARN  fixtures total ${(total / 1048576).toFixed(1)} MB (budget ${(MAX_TOTAL_BYTES / 1048576).toFixed(0)} MB)`);

if (!dry) {
  fs.mkdirSync(outDir, { recursive: true });
  let written = 0;
  for (const f of files) {
    const p = path.join(outDir, `${f.table}.json`);
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === f.text) continue;
    fs.writeFileSync(p, f.text);
    written++;
  }
  console.log(`generate-fixtures: seed ${seed}, ${files.length} files (${written} written, ${files.length - written} unchanged), ${(total / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), outDir) || '.'} in ${Date.now() - t0} ms`);
} else {
  console.log(`generate-fixtures: seed ${seed}, ${files.length} files generated in memory (${(total / 1024).toFixed(0)} KB, dry run)`);
}

let failed = big > 0 && strict;
if (!flag('no-validate')) {
  const rep = validate(canonical, { strict });
  const text = rep.format();
  if (text) console.log(text);
  const rows = ENTITIES.reduce((n, e) => n + ((e.shape ?? 'array') === 'array' ? canonical[e.table].length : 0), 0);
  console.log(`validate-fixtures: ${ENTITIES.length} files, ${rows.toLocaleString('en-US')} rows, ${rep.errorCount} error(s), ${rep.warningCount} warning(s)${strict ? ' (strict)' : ''}`);
  failed = failed || rep.errorCount > 0 || (strict && rep.warningCount > 0);
}
process.exit(failed ? 1 : 0);
