// Builds the SQL model (enums, tables, columns, foreign keys, checks, indexes) from the contract schema
// (packages/contract/schema/*.mjs) plus the per-table decisions in table-config*.mjs.
//
// The contract is the single source of truth for column names, types and nullability. Everything the contract
// cannot say (indexes, uniqueness, soft delete, check constraints, normalised child tables, infrastructure tables,
// pgvector columns, state machines) lives in the table-config files. gen-schema.mjs turns this model into SQL.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESERVED, toSnake, flatten } from './sqlkit.mjs';
import { TABLE_CONFIG } from './table-config.mjs';
import { LOCAL_TABLES } from './table-local.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(here, '../../../packages/contract/schema');

const idx = await import(pathToFileURL(path.join(schemaDir, 'index.mjs')).href);
const dsl = await import(pathToFileURL(path.join(schemaDir, 'dsl.mjs')).href);

export const { ENUMS, ENTITIES, VALUE_TYPES, STATE_MACHINES, CONSTANTS, CONSTANT_NOTES, API_GROUPS, API_CONVENTIONS } = idx;
export const { parseType } = dsl;
export { toSnake };

/** Enum -> SQL type name. */
export const enumSql = (name) => toSnake(name);

/** Fields whose int type must stay signed (everything else is the `nat` domain >= 0). */
const SIGNED_INTS = new Set(['delta_rank', 'delta_verified']);
/** Fields that need bigint instead of integer. */
const BIGINT_FIELDS = new Set(['app_metrics_daily.views', 'state_of_app_ugc.total_views', 'ads.impressions', 'ad_daily.impressions', 'state_of_app_ugc.settled_posts']);

/** Which tables / columns follow which contract state machine (column holds the SM enum). */
export const SM_BINDINGS = [
  { machine: 'bounty', table: 'bounties', column: 'status' },
  { machine: 'submission', table: 'submissions', column: 'status' },
  { machine: 'post', table: 'posts', column: 'status' },
  { machine: 'payout', table: 'payouts', column: 'status' },
  { machine: 'offer', table: 'offers', column: 'status' },
  { machine: 'auction', table: 'auctions', column: 'status' },
  { machine: 'dispute', table: 'disputes', column: 'status' },
  { machine: 'rights_grant', table: 'rights_grants', column: 'status' },
  { machine: 'ad', table: 'ads', column: 'status' },
  { machine: 'verification', table: 'verifications', column: 'status' },
  { machine: 'verification', table: 'creators', column: 'verification_status' },
  { machine: 'verification', table: 'brands', column: 'verification' },
  { machine: 'conversion', table: 'conversions', column: 'status' },
  { machine: 'daily_drop', table: 'daily_drops', column: 'status' },
  { machine: 'tournament', table: 'tournaments', column: 'status' },
  { machine: 'auto_approve_rule', table: 'auto_approve_rules', column: 'status' },
  { machine: 'fatigue_alert', table: 'fatigue_alerts', column: 'status' },
  { machine: 'spec', table: 'specs', column: 'status' },
  { machine: 'referral', table: 'referrals', column: 'status' },
  { machine: 'fraud_flag', table: 'fraud_flags', column: 'status' },
  { machine: 'scam_report', table: 'scam_reports', column: 'status' },
  { machine: 'invoice', table: 'invoices', column: 'status' },
  { machine: 'tax_profile', table: 'tax_profiles', column: 'status' },
];
/** Contract machines that exist but are NOT enforced by a generic trigger (reason in the value). */
export const SM_NOT_ENFORCED = {
  ledger: 'enforced by the dedicated ledger append-only trigger (private.ledger_guard)',
  money_clock: 'a projection recomputed by jobs; never edited directly, so it carries no transition trigger',
};

/** Contract transitions the backend needs in addition (flagged in DOMAIN issues, source = backend_extension). */
export const SM_EXTENSIONS = [
  { machine: 'post', from: 'paid', to: 'clawed_back', actors: ['admin'], trigger: 'Proven fraud found after payout', guard: 'The creator balance may go negative and is recovered from future earnings (DOMAIN section 10, Clawback).' },
  { machine: 'ledger', from: 'paid', to: 'reversed', actors: ['admin'], trigger: 'Ops correction of a paid row', guard: 'Reserved for reviewed corrections. A clawback after payout does NOT use this edge: it leaves the original row paid and posts a cleared negative row (a debt) that the next payout nets (claw_back() in 0003).' },
  { machine: 'daily_drop', from: 'sold_out', to: 'closed', actors: ['system'], trigger: 'Claim window ended', guard: 'A sold-out drop closes with the rest when its 24 h claim window ends; the contract only lets a live drop close.' },
  { machine: 'rights_grant', from: 'renewal_requested', to: 'expired', actors: ['system'], trigger: 'Term ended with no renewal', guard: 'The renewal was requested but never accepted before ends_at: the grant expires and its ads stop (expiry-alerts).' },
  // Rows that are created already past their machine's first state (a verification is created when submitted, a W-9 is created when requested,
  // invoices are created by the payment webhook as open or paid).
  { machine: 'verification', from: null, to: 'pending', actors: ['creator', 'brand', 'system'], trigger: 'Submitted at creation', guard: 'The queue row is created when the person submits.' },
  { machine: 'tax_profile', from: null, to: 'requested', actors: ['system'], trigger: 'Requested at creation', guard: 'Created just in time at the first approval.' },
  { machine: 'invoice', from: null, to: 'open', actors: ['system'], trigger: 'Issued at creation', guard: 'Subscription and ad-fee invoices are issued directly.' },
  { machine: 'invoice', from: null, to: 'paid', actors: ['system'], trigger: 'Paid at creation', guard: 'Card top-ups are charged before the invoice is written.' },
];

/** Map a parsed contract type to a SQL type and optional column-level check. */
function mapType(p, ctx) {
  const { table, field } = ctx;
  const arr = p.array;
  const key = `${table}.${field}`;
  switch (p.kind) {
    case 'id': return { sql: 'text', jsonb: false };
    case 'art': return arr ? { sql: 'jsonb', jsonbKind: 'array' } : { sql: 'public.art_seed' };
    case 'enum': return { sql: `public.${enumSql(p.name)}${arr ? '[]' : ''}` };
    case 'ref': return { sql: arr ? 'text[]' : 'text', ref: arr ? null : p.table };
    case 'obj': return arr ? { sql: 'jsonb', jsonbKind: 'array' } : { sql: 'jsonb', jsonbKind: 'object' };
    case 'map': return arr ? { sql: 'jsonb', jsonbKind: 'array' } : { sql: 'jsonb', jsonbKind: 'object' };
    case 'prim': {
      const n = p.name;
      if (n === 'string' || n === 'text' || n === 'url' || n === 'hex') return { sql: arr ? 'text[]' : 'text' };
      if (n === 'bool') return { sql: arr ? 'boolean[]' : 'boolean' };
      if (n === 'iso') return { sql: arr ? 'timestamptz[]' : 'timestamptz' };
      if (n === 'date') return { sql: arr ? 'date[]' : 'date' };
      if (n === 'json') return { sql: 'jsonb', jsonbKind: 'object' };
      if (n === 'cents') return { sql: arr ? 'bigint[]' : 'public.cents' };
      if (n === 'ratio') return { sql: arr ? 'numeric[]' : 'public.ratio' };
      if (n === 'pct') return { sql: arr ? 'numeric[]' : 'numeric(6,3)' };
      if (n === 'number') return { sql: arr ? 'numeric[]' : (field === 'rating' ? 'numeric(3,2)' : 'numeric(14,4)') };
      if (n === 'int') {
        if (arr) return { sql: 'integer[]' };
        if (/_cents$/.test(field)) return { sql: 'bigint' };
        if (BIGINT_FIELDS.has(key)) return { sql: 'public.bignat' };
        if (SIGNED_INTS.has(field)) return { sql: 'integer' };
        return { sql: 'public.nat' };
      }
      throw new Error(`mapType: unsupported primitive ${n}`);
    }
    default: throw new Error(`mapType: unknown kind ${p.kind}`);
  }
}

/** Default expression for a required column (so API inserts stay small) or undefined. */
function defaultFor(sqlType, p, f, cfg, table) {
  if (cfg.defaults && f.name in cfg.defaults) return cfg.defaults[f.name];
  if (!f.required) return undefined;
  if (/(^|\.)(nat|bignat)$/.test(sqlType) || sqlType === 'integer' || sqlType === 'bigint') return '0';
  if (sqlType === 'public.cents') return '0';
  if (sqlType === 'boolean') return 'false';
  if (p.array && p.kind !== 'obj' && p.kind !== 'art') return `'{}'`;
  if (p.array && (p.kind === 'obj' || p.kind === 'art')) return `'[]'::jsonb`;
  if (p.kind === 'map') return `'{}'::jsonb`;
  if (f.name === 'created_at' || f.name === 'updated_at') return 'now()';
  return undefined;
}

/** Build one table spec from a contract entity. */
function fromEntity(ent) {
  const cfg = TABLE_CONFIG[ent.table] ?? {};
  const table = ent.table;
  const spec = {
    name: table, entity: ent.name, doc: ent.doc, group: ent.group ?? '', source: 'contract', prefix: ent.prefix,
    columns: [], fks: [], checks: [...(cfg.checks ?? [])], uniques: [...(cfg.uniques ?? [])], indexes: [...(cfg.indexes ?? [])],
    primaryKey: null, flags: { ...(cfg.flags ?? {}) }, partition: cfg.partition ?? null, renames: [], skipped: [], compositeFks: [...(cfg.compositeFks ?? [])],
    comment: cfg.comment, extraSql: cfg.extraSql ?? [],
  };
  const fieldNames = new Set(ent.fields.map((f) => f.name));
  for (const f of ent.fields) {
    if (cfg.skip?.includes(f.name)) { spec.skipped.push(f.name); continue; }
    const name = cfg.rename?.[f.name] ?? f.name;
    if (name !== f.name) spec.renames.push({ from: f.name, to: name });
    if (RESERVED.has(name)) throw new Error(`${table}.${name} is a reserved word; add a rename in table-config.mjs`);
    const p = parseType(f.type);
    const m = mapType(p, { table, field: f.name });
    let notNull = f.required && !(cfg.nullable?.includes(f.name));
    const col = { name, contractField: f.name, sql: m.sql, notNull, doc: f.doc, jsonbKind: m.jsonbKind, parsed: p };
    // id column
    if (p.kind === 'id') {
      col.sql = cfg.idType ?? 'text';
      if (ent.prefix && cfg.idDefault !== false) col.default = `public.new_id('${ent.prefix}')`;
      notNull = true;
      col.notNull = true;
      if (ent.prefix && cfg.idPattern !== false) {
        spec.checks.push({ name: `${table}_id_format_chk`, expr: `id ~ '^${ent.prefix}_[a-z0-9_.-]+$'` });
      }
    } else {
      const d = defaultFor(col.sql, p, f, cfg, table);
      if (d !== undefined) col.default = d;
    }
    if (cfg.columnOverrides?.[f.name]) Object.assign(col, cfg.columnOverrides[f.name]);
    // jsonb shape checks
    if (col.jsonbKind) {
      const want = col.jsonbKind;
      const dom = cfg.jsonDomains?.[f.name];
      if (dom) col.sql = dom;
      else spec.checks.push({ name: `${table}_${name}_json_chk`, expr: `jsonb_typeof(${name}) = '${want}'` });
    }
    if (m.ref) {
      spec.fks.push({ column: name, table: m.ref, column2: 'id', onDelete: cfg.fkDelete?.[f.name] ?? 'no action', deferred: !!cfg.fkDeferred?.includes(f.name) });
    }
    // sm default status
    spec.columns.push(col);
  }
  // timestamps defaults
  for (const c of spec.columns) {
    if ((c.name === 'created_at' || c.name === 'updated_at') && !c.default && c.notNull) c.default = 'now()';
  }
  // state machine default status
  for (const b of SM_BINDINGS) {
    if (b.table !== table) continue;
    const sm = STATE_MACHINES.find((s) => s.name === b.machine);
    const c = spec.columns.find((x) => x.name === b.column);
    if (c && !c.default && c.notNull) c.default = `'${sm.initial}'`;
    spec.flags.stateMachines = [...(spec.flags.stateMachines ?? []), { machine: b.machine, column: b.column }];
  }
  // primary key
  const keyFields = ent.key ?? (fieldNames.has('id') ? ['id'] : null);
  if (cfg.primaryKey) spec.primaryKey = cfg.primaryKey;
  else if (keyFields) spec.primaryKey = keyFields.map((k) => cfg.rename?.[k] ?? k);
  // extra columns (infrastructure columns the contract does not carry)
  for (const e of cfg.extra ?? []) {
    spec.columns.push({ ...e, extra: true });
    if (e.fk) spec.fks.push({ column: e.name, table: e.fk.table, column2: e.fk.column ?? 'id', onDelete: e.fk.onDelete ?? 'no action', deferred: false });
    if (e.jsonbKind) spec.checks.push({ name: `${table}_${e.name}_json_chk`, expr: `jsonb_typeof(${e.name}) = '${e.jsonbKind}'` });
  }
  // contract string columns that are really foreign keys to infrastructure tables
  for (const e of cfg.extraFks ?? []) spec.fks.push({ column: e.column, table: e.table, column2: e.column2 ?? 'id', onDelete: e.onDelete ?? 'no action', deferred: !!e.deferred });
  if (cfg.softDelete && !spec.columns.some((c) => c.name === 'deleted_at')) spec.columns.push({ name: 'deleted_at', sql: 'timestamptz', notNull: false, doc: 'Soft delete: the row is hidden by RLS and by partial indexes. Never set on rows that carry money (ledger, payouts, invoices, posts).', extra: true });
  if (spec.columns.some((c) => c.name === 'updated_at')) spec.flags.updatedAt = true;
  if (cfg.softDelete) spec.flags.softDelete = true;
  return spec;
}

/** Build a table from a local (non-contract) description in table-local.mjs. */
function fromLocal(t) {
  const spec = {
    name: t.name, entity: t.entity ?? null, doc: t.doc, group: t.group ?? 'Infrastructure', source: t.source ?? 'backend',
    columns: [], fks: [], checks: [...(t.checks ?? [])], uniques: [...(t.uniques ?? [])], indexes: [...(t.indexes ?? [])],
    primaryKey: t.primaryKey ?? ['id'], flags: { ...(t.flags ?? {}) }, partition: t.partition ?? null, renames: [], skipped: [],
    compositeFks: [...(t.compositeFks ?? [])], extraSql: t.extraSql ?? [],
  };
  for (const c of t.columns) {
    const col = { name: c.name, sql: c.sql, notNull: c.notNull ?? false, default: c.default, doc: c.doc, jsonbKind: c.jsonbKind, generated: c.generated, extra: false };
    if (c.jsonbKind) spec.checks.push({ name: `${t.name}_${c.name}_json_chk`, expr: `jsonb_typeof(${c.name}) = '${c.jsonbKind}'` });
    if (c.ref) spec.fks.push({ column: c.name, table: c.ref, column2: c.refColumn ?? 'id', onDelete: c.onDelete ?? 'no action', deferred: !!c.deferred });
    if (c.check) spec.checks.push({ name: `${t.name}_${c.name}_chk`, expr: c.check });
    spec.columns.push(col);
  }
  if (spec.columns.some((c) => c.name === 'updated_at')) spec.flags.updatedAt = true;
  return spec;
}

/** Build the whole SQL model. */
export function buildModel() {
  const enums = ENUMS.map((e) => ({ name: e.name, sql: enumSql(e.name), values: e.values.map((v) => v.value), doc: e.doc, group: e.group }));
  const tables = [...ENTITIES.filter((e) => !TABLE_CONFIG[e.table]?.replaced).map(fromEntity), ...LOCAL_TABLES.map(fromLocal)];
  // renamed object-shaped entities have no PK of their own: handled via primaryKey config
  const byName = new Map(tables.map((t) => [t.name, t]));
  // Validate the whole model
  const errs = [];
  const enumNames = new Set(enums.map((e) => e.sql));
  for (const t of tables) {
    const colNames = new Set(t.columns.map((c) => c.name));
    if (colNames.size !== t.columns.length) errs.push(`${t.name}: duplicate column names`);
    if (!t.primaryKey) errs.push(`${t.name}: no primary key`);
    else for (const k of t.primaryKey) if (!colNames.has(k)) errs.push(`${t.name}: primary key column ${k} missing`);
    for (const fk of t.fks) {
      if (!byName.has(fk.table) && !['auth.users'].includes(fk.table)) errs.push(`${t.name}.${fk.column}: FK target ${fk.table} is not a table`);
    }
    for (const c of t.columns) {
      const m = /^public\.([a-z_]+)(\[\])?$/.exec(c.sql);
      if (m && !enumNames.has(m[1]) && !['cents', 'ratio', 'art_seed', 'nat', 'bignat', 'signed_cents', 'rights_card', 'rights_card_t'].includes(m[1])) errs.push(`${t.name}.${c.name}: unknown type ${c.sql}`);
    }
    if (enumNames.has(t.name)) errs.push(`${t.name}: table name collides with an enum type name`);
  }
  if (errs.length) throw new Error('model errors:\n  ' + errs.join('\n  '));
  return { enums, tables, byName };
}

/** Flattened CONSTANTS for the flowd_constants reference table. */
export function constantRows() {
  const flat = flatten(CONSTANTS);
  const notes = CONSTANT_NOTES;
  const noteFor = (p) => notes.find((n) => p === n.path || p.startsWith(n.path))?.note ?? null;
  const srcFor = (p) => notes.find((n) => p === n.path || p.startsWith(n.path))?.source ?? 'CONTRACT';
  return Object.entries(flat).filter(([p]) => !p.startsWith('lint.rules')).map(([path_, value]) => ({ path: path_, value, source: srcFor(path_), note: noteFor(path_) }));
}
