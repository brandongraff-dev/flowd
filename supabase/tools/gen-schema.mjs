#!/usr/bin/env node
// Generates the database schema from the contract (packages/contract/schema/*.mjs):
//
//   supabase/migrations/0001_schema.sql          extensions, enums, domains, tables, FKs, indexes, triggers, invariants
//   supabase/migrations/0005_reference_data.sql  state machines as data, flowd_constants, brand role capabilities
//   supabase/SCHEMA.md                           the data dictionary (every table and column with its contract field)
//
// Usage:  node supabase/tools/gen-schema.mjs            write the files
//         node supabase/tools/gen-schema.mjs --check    exit 1 when a file on disk is stale (CI)
//
// 0001 is generated while flowd is pre-launch. After the first production deploy it is frozen; further changes ship as
// new migration files (0007_...) written by hand or by diffing this output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, STATE_MACHINES, SM_BINDINGS, SM_EXTENSIONS, SM_NOT_ENFORCED, constantRows } from './lib/model.mjs';
import { commentText, lit, jsonLit, banner } from './lib/sqlkit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const check = process.argv.includes('--check');

const model = buildModel();
const { enums, tables, byName } = model;

const read = (f) => fs.readFileSync(path.join(here, 'sql', f), 'utf8').trimEnd() + '\n';

// ── helpers ────────────────────────────────────────────────────────────────────────────────────
const qual = (t) => (t.includes('.') ? t : `public.${t}`);
const NAME_MAX = 63;
const problems = [];
const seenNames = new Set();
function claimName(name, where) {
  if (name.length > NAME_MAX) problems.push(`${where}: identifier "${name}" is ${name.length} chars (max ${NAME_MAX})`);
  if (seenNames.has(name)) problems.push(`${where}: duplicate relation/constraint name "${name}"`);
  seenNames.add(name);
}

// ── enums ──────────────────────────────────────────────────────────────────────────────────────
function enumsSql() {
  const out = [banner('Enumerations', `${enums.length} Postgres enums generated from packages/contract/schema/enums-*.mjs.\nAdding a value later: alter type public.<name> add value '<v>' (values are never removed or renamed).`)];
  for (const e of enums) {
    out.push(`create type public.${e.sql} as enum (${e.values.map(lit).join(', ')});`);
    out.push(`comment on type public.${e.sql} is ${commentText(`${e.name}: ${e.doc}`)};`);
  }
  return out.join('\n') + '\n';
}

// ── tables ─────────────────────────────────────────────────────────────────────────────────────
function colLine(c) {
  const parts = [c.name, c.sql];
  if (c.generated) parts.push(c.generated);
  const isIdentity = /identity/.test(c.generated ?? '');
  if (c.notNull && !isIdentity) parts.push('not null');
  if (c.default !== undefined && !c.generated) parts.push(`default ${c.default}`);
  return parts.join(' ');
}

function leadingColumns(t) {
  const lead = new Set();
  if (t.primaryKey?.length) lead.add(t.primaryKey[0]);
  for (const u of t.uniques) {
    if (u.cols?.length) lead.add(u.cols[0]);
    else if (u.expr) { const m = /^\(?\s*([a-z_0-9]+)\s*[,)]?/.exec(u.expr); if (m) lead.add(m[1]); }
  }
  for (const i of t.indexes) {
    const m = /^\s*(?:using\s+\w+\s*)?\(\s*([a-z_0-9]+)/.exec(i.def);
    if (m) lead.add(m[1]);
  }
  for (const f of t.compositeFks ?? []) lead.add(f.columns[0]);
  return lead;
}

function tableSql(t) {
  const lines = t.columns.map((c) => '  ' + colLine(c));
  lines.push(`  constraint ${t.name}_pkey primary key (${t.primaryKey.join(', ')})`);
  claimName(`${t.name}_pkey`, t.name);
  const checkNames = new Set();
  for (const k of t.checks) {
    if (checkNames.has(k.name)) { problems.push(`${t.name}: duplicate check ${k.name}`); continue; }
    checkNames.add(k.name);
    claimName(k.name, t.name);
    lines.push(`  constraint ${k.name} check (${k.expr})`);
  }
  let sql = `create table public.${t.name} (\n${lines.join(',\n')}\n)`;
  if (t.partition) sql += ` partition by ${t.partition}`;
  sql += ';\n';
  if (t.partition) sql += `create table public.${t.name}_default partition of public.${t.name} default;\n`;
  const doc = t.comment ?? t.doc;
  sql += `comment on table public.${t.name} is ${commentText(doc)};\n`;
  for (const c of t.columns) {
    const bits = [];
    if (c.doc) bits.push(c.doc);
    if (c.contractField && c.contractField !== c.name) bits.push(`Contract field: ${c.contractField}.`);
    if (bits.length) sql += `comment on column public.${t.name}.${c.name} is ${commentText(bits.join(' '))};\n`;
  }
  return sql;
}

function fksSql() {
  const out = [banner('Foreign keys', 'All DEFERRABLE INITIALLY IMMEDIATE: the seed loader runs SET CONSTRAINTS ALL DEFERRED to load circular references\n(submission <-> post <-> attribution link <-> ad). ON DELETE is NO ACTION except pure children, which cascade.')];
  for (const t of tables) {
    for (const fk of t.fks) {
      const name = `${t.name}_${fk.column}_fkey`;
      claimName(name, t.name);
      out.push(`alter table public.${t.name} add constraint ${name} foreign key (${fk.column}) references ${qual(fk.table)} (${fk.column2}) on delete ${fk.onDelete} deferrable initially ${fk.deferred ? 'deferred' : 'immediate'};`);
    }
    for (const f of t.compositeFks ?? []) {
      claimName(f.name, t.name);
      out.push(`alter table public.${t.name} add constraint ${f.name} foreign key (${f.columns.join(', ')}) references public.${f.table} (${f.refColumns.join(', ')}) on delete ${f.onDelete ?? 'no action'} deferrable initially immediate;`);
    }
  }
  return out.join('\n') + '\n';
}

function indexesSql() {
  const out = [banner('Indexes', 'Unique indexes (partial where soft delete or state applies), query indexes for the hot paths named in docs/ARCHITECTURE.md,\nGIN for array columns, HNSW for pgvector, BRIN for append-only time columns, and one index per foreign key column.')];
  for (const t of tables) {
    for (const u of t.uniques) {
      claimName(u.name, t.name);
      const target = u.expr ? `(${u.expr})` : `(${u.cols.join(', ')})`;
      out.push(`create unique index ${u.name} on public.${t.name} ${target}${u.nullsNotDistinct ? ' nulls not distinct' : ''}${u.where ? ` where ${u.where}` : ''};`);
    }
    for (const i of t.indexes) {
      claimName(i.name, t.name);
      out.push(`create index ${i.name} on public.${t.name} ${i.def};`);
    }
    // an index on every foreign key column that no other index already leads with
    const lead = leadingColumns(t);
    for (const fk of t.fks) {
      if (lead.has(fk.column)) continue;
      const col = t.columns.find((c) => c.name === fk.column);
      const name = `${t.name}_${fk.column}_fk_idx`;
      claimName(name, t.name);
      out.push(`create index ${name} on public.${t.name} (${fk.column})${col?.notNull ? '' : ` where ${fk.column} is not null`};`);
      lead.add(fk.column);
    }
  }
  return out.join('\n') + '\n';
}

function triggersSql() {
  const out = [banner('Generic triggers', 'updated_at on every table that has the column, state-machine enforcement for the contract machines, append-only guards.')];
  for (const t of tables) {
    if (t.flags.updatedAt) out.push(`create trigger ${t.name}_touch_updated_at before update on public.${t.name} for each row execute function private.touch_updated_at();`);
  }
  out.push('');
  for (const b of SM_BINDINGS) {
    const t = byName.get(b.table);
    if (!t) throw new Error(`state machine binding for unknown table ${b.table}`);
    if (!t.columns.some((c) => c.name === b.column)) throw new Error(`state machine binding: ${b.table}.${b.column} missing`);
    const base = `${b.table}_${b.column === 'status' ? '' : b.column + '_'}sm`;
    out.push(`create trigger ${base}_ins before insert on public.${b.table} for each row execute function private.enforce_state_machine('${b.machine}', '${b.column}');`);
    out.push(`create trigger ${base}_upd before update of ${b.column} on public.${b.table} for each row when (old.${b.column} is distinct from new.${b.column}) execute function private.enforce_state_machine('${b.machine}', '${b.column}');`);
  }
  out.push('');
  for (const t of tables) {
    if (t.flags.appendOnly !== true) continue; // 'dedicated' tables (the ledger) attach their own guard in sql/20-triggers.sql
    const allowed = (t.flags.appendOnlyColumns ?? []).map(lit).join(', ');
    out.push(`create trigger ${t.name}_append_only before update or delete on public.${t.name} for each row execute function private.append_only_guard(${allowed});`);
    out.push(`create trigger ${t.name}_no_truncate before truncate on public.${t.name} for each statement execute function private.no_truncate();`);
  }
  return out.join('\n') + '\n';
}

function realtimeSql() {
  const names = tables.filter((t) => t.flags.realtime && !t.partition).map((t) => t.name);
  return `${banner('Realtime', 'Tables published to Supabase Realtime. RLS still applies: a client only receives rows it could select.')}
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[${names.map(lit).join(', ')}] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;
`;
}

// ── 0001 ───────────────────────────────────────────────────────────────────────────────────────
function schemaMigration() {
  const header = `-- flowd 0001: schema
-- GENERATED by supabase/tools/gen-schema.mjs from packages/contract/schema/*.mjs. Do not edit by hand:
-- change the contract or supabase/tools/lib/table-*.mjs and regenerate (npm run supabase:gen).
--
-- ${enums.length} enums, ${tables.length} tables (${tables.filter((t) => t.source === 'contract').length} contract entities, ${tables.filter((t) => t.source !== 'contract').length} normalised / infrastructure tables).
-- Contract version 1.0.0. Money is bigint cents. Ids are text "<prefix>_<slug>".
`;
  const parts = [header, banner('0. Bootstrap'), read('00-bootstrap.sql'), enumsSql(), banner('Tables')];
  const groups = new Map();
  for (const t of tables) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group).push(t);
  }
  for (const [g, ts] of groups) {
    parts.push(`-- ---- ${g} ${'-'.repeat(Math.max(2, 68 - g.length))}`);
    for (const t of ts) parts.push(tableSql(t));
  }
  parts.push(fksSql(), indexesSql(), banner('Invariants and trigger functions'), read('10-invariants.sql'), triggersSql(), banner('Table-specific triggers'), read('20-triggers.sql'), realtimeSql());
  return parts.join('\n') + '\n';
}

// ── 0005 ───────────────────────────────────────────────────────────────────────────────────────
const CAPABILITIES = {
  owner: ['read', 'bounty.write', 'offers.write', 'review', 'review.approve', 'finance.read', 'finance.write', 'billing.manage', 'team.manage', 'api.manage', 'integrations.manage', 'promote', 'rights.manage', 'workspace.manage'],
  admin: ['read', 'bounty.write', 'offers.write', 'review', 'review.approve', 'finance.read', 'finance.write', 'team.manage', 'api.manage', 'integrations.manage', 'promote', 'rights.manage'],
  reviewer: ['read', 'review', 'review.approve'],
  finance: ['read', 'finance.read', 'finance.write', 'billing.manage', 'rights.manage'],
  viewer: ['read'],
  client_approver: ['read', 'review.approve'],
};

function referenceMigration() {
  const out = [`-- flowd 0005: reference data
-- GENERATED by supabase/tools/gen-schema.mjs. State machines (contract + backend extensions), every contract constant,
-- and the brand role capability matrix. Re-running the generator rewrites this file; applied databases change through a
-- new migration that updates these rows.
`];
  // state machines
  out.push(banner('State machines', `${STATE_MACHINES.length} contract machines. Rows with source = backend_extension are transitions the backend needs that the contract omits (docs/ARCHITECTURE.md, DOMAIN issues).`));
  const rows = [];
  for (const sm of STATE_MACHINES) {
    const hasCreation = sm.transitions.some((t) => t.from === null);
    if (!hasCreation) rows.push({ machine: sm.name, from: null, to: sm.initial, actors: ['system'], trigger: 'Created', guard: '', source: 'contract' });
    for (const t of sm.transitions) rows.push({ machine: sm.name, from: t.from, to: t.to, actors: t.actors, trigger: t.trigger, guard: t.guard ?? '', source: 'contract' });
  }
  for (const x of SM_EXTENSIONS) rows.push({ machine: x.machine, from: x.from, to: x.to, actors: x.actors, trigger: x.trigger, guard: x.guard, source: 'backend_extension' });
  out.push('insert into public.state_transitions (machine, from_state, to_state, actors, trigger_text, guard_text, source) values');
  out.push(rows.map((r) => `  (${lit(r.machine)}, ${r.from === null ? 'null' : lit(r.from)}, ${lit(r.to)}, array[${r.actors.map(lit).join(', ')}]::text[], ${r.trigger ? lit(r.trigger) : 'null'}, ${r.guard ? lit(r.guard) : 'null'}, ${lit(r.source)})`).join(',\n') + ';');
  out.push('');
  // constants
  const consts = constantRows();
  out.push(banner('Constants', `${consts.length} flattened leaves of CONSTANTS (packages/contract/schema/constants.mjs). Money in cents, rates as 0..1 ratios.`));
  out.push('insert into public.flowd_constants (path, value, source, note) values');
  out.push(consts.map((c) => `  (${lit(c.path)}, ${jsonLit(c.value)}::jsonb, ${c.source ? lit(c.source) : 'null'}, ${c.note ? lit(c.note) : 'null'})`).join(',\n') + ';');
  out.push('');
  // capabilities
  out.push(banner('Brand role capabilities'));
  const caps = [];
  for (const [role, list] of Object.entries(CAPABILITIES)) for (const c of list) caps.push(`  (${lit(role)}::public.brand_member_role, ${lit(c)})`);
  out.push('insert into public.brand_role_capabilities (role, capability) values');
  out.push(caps.join(',\n') + ';');
  return out.join('\n') + '\n';
}

// ── SCHEMA.md ──────────────────────────────────────────────────────────────────────────────────
function schemaDoc() {
  const out = [];
  out.push('# flowd database schema (data dictionary)\n');
  out.push('> Generated by `supabase/tools/gen-schema.mjs` from `packages/contract/schema/*.mjs`. Do not edit. See `supabase/README.md`.\n');
  out.push(`**${tables.length} tables** (${tables.filter((t) => t.source === 'contract').length} contract entities, ${tables.filter((t) => t.source !== 'contract').length} normalised or infrastructure) and **${enums.length} enums**. Money is bigint cents; ids are \`text\` with the contract prefix; every foreign key is deferrable.\n`);
  out.push('## Table index\n');
  out.push('| Table | Group | Source | Columns | Notes |');
  out.push('|---|---|---|---|---|');
  for (const t of tables) {
    const notes = [t.flags.appendOnly && 'append-only', t.flags.softDelete && 'soft delete', t.flags.stateMachines?.length && `state machine: ${t.flags.stateMachines.map((s) => s.machine).join(', ')}`, t.flags.realtime && 'realtime', t.partition && 'partitioned', t.columns.some((c) => /vector/.test(c.sql)) && 'pgvector'].filter(Boolean).join('; ');
    out.push(`| \`${t.name}\` | ${t.group} | ${t.source} | ${t.columns.length} | ${notes} |`);
  }
  out.push('\n## Renamed and normalised columns\n');
  out.push('| Contract | SQL |');
  out.push('|---|---|');
  for (const t of tables) {
    for (const r of t.renames ?? []) out.push(`| \`${t.name}.${r.from}\` | \`${t.name}.${r.to}\` (reserved word or clearer name) |`);
    for (const s of t.skipped ?? []) out.push(`| \`${t.name}.${s}\` | normalised into a child table (see below) |`);
  }
  out.push('\n## Tables\n');
  for (const t of tables) {
    out.push(`### \`${t.name}\`\n`);
    out.push(`${t.comment ?? t.doc}\n`);
    out.push(`Primary key: \`${t.primaryKey.join(', ')}\`.${t.partition ? ` Partitioned by ${t.partition}.` : ''}\n`);
    out.push('| Column | Type | Null | Default | Notes |');
    out.push('|---|---|---|---|---|');
    for (const c of t.columns) {
      const fk = t.fks.find((f) => f.column === c.name);
      const notes = [c.doc, fk && `FK -> \`${fk.table}\``].filter(Boolean).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      out.push(`| \`${c.name}\` | \`${c.sql}\`${c.generated ? ' (generated)' : ''} | ${c.notNull ? 'no' : 'yes'} | ${c.default !== undefined ? '`' + String(c.default).replace(/\|/g, '\\|') + '`' : ''} | ${notes} |`);
    }
    if (t.checks.length) {
      out.push('\nChecks: ' + t.checks.map((k) => `\`${k.name}\``).join(', ') + '.');
    }
    out.push('');
  }
  out.push('## State machines enforced by trigger\n');
  out.push('| Machine | Table.column |');
  out.push('|---|---|');
  for (const b of SM_BINDINGS) out.push(`| ${b.machine} | \`${b.table}.${b.column}\` |`);
  out.push('');
  for (const [m, why] of Object.entries(SM_NOT_ENFORCED)) out.push(`* \`${m}\`: ${why}.`);
  out.push('');
  return out.join('\n');
}

// ── write / check ──────────────────────────────────────────────────────────────────────────────
const outputs = [
  ['migrations/0001_schema.sql', schemaMigration()],
  ['migrations/0005_reference_data.sql', referenceMigration()],
  ['SCHEMA.md', schemaDoc()],
];

if (problems.length) {
  console.error('gen-schema: problems found\n  ' + problems.join('\n  '));
  process.exit(2);
}

let stale = 0;
for (const [rel, content] of outputs) {
  const file = path.join(root, rel);
  if (check) {
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (cur !== content) { console.error(`stale: supabase/${rel}`); stale++; }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`wrote supabase/${rel} (${content.split('\n').length} lines)`);
  }
}
if (check) {
  if (stale) { console.error(`${stale} generated file(s) are stale. Run: node supabase/tools/gen-schema.mjs`); process.exit(1); }
  console.log('supabase generated files are up to date');
} else {
  console.log(`${enums.length} enums, ${tables.length} tables`);
}
