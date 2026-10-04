// Aggregates the contract schema and checks it for internal consistency.
// Single entry point for scripts/build-contract.mjs, scripts/validate-fixtures.mjs and the fixture generators.

import { parseType } from './dsl.mjs';
import { CONSTANTS, CONSTANT_NOTES } from './constants.mjs';
import { ENUMS_IDENTITY } from './enums-identity.mjs';
import { ENUMS_MONEY } from './enums-money.mjs';
import { ENUMS_WORK } from './enums-work.mjs';
import { ENUMS_PLATFORM } from './enums-platform.mjs';
import { ENUMS_EXTRA } from './enums-extra.mjs';
import { VALUE_TYPES as VALUE_TYPES_BASE } from './value-types.mjs';
import { VALUE_TYPES_EXT } from './value-types-ext.mjs';
import { ENTITIES_IDENTITY } from './entities-identity.mjs';
import { ENTITIES_MONEY } from './entities-money.mjs';
import { ENTITIES_WORK } from './entities-work.mjs';
import { ENTITIES_MARKET } from './entities-market.mjs';
import { ENTITIES_GROWTH } from './entities-growth.mjs';
import { ENTITIES_TRUST } from './entities-trust.mjs';
import { ENTITIES_PLATFORM } from './entities-platform.mjs';
import { REASON_CODE_INFO, STATE_MACHINES } from './tables.mjs';
import { FIXTURE_META } from './fixtures.mjs';
import * as WORLD_MOD from './world.mjs';
import { API_GROUPS, API_CONVENTIONS, API_TYPES_NOTE } from './api.mjs';
import { TONES } from './dsl.mjs';

export { CONSTANTS, CONSTANT_NOTES, REASON_CODE_INFO, STATE_MACHINES, FIXTURE_META, API_GROUPS, API_CONVENTIONS, API_TYPES_NOTE, TONES };
export const WORLD = WORLD_MOD;

export const ENUMS = [...ENUMS_IDENTITY, ...ENUMS_MONEY, ...ENUMS_WORK, ...ENUMS_PLATFORM, ...ENUMS_EXTRA];
export const VALUE_TYPES = [...VALUE_TYPES_BASE, ...VALUE_TYPES_EXT];
export const ENTITIES = [
  ...ENTITIES_IDENTITY, ...ENTITIES_MONEY, ...ENTITIES_WORK, ...ENTITIES_MARKET, ...ENTITIES_GROWTH, ...ENTITIES_TRUST, ...ENTITIES_PLATFORM,
];

export const ENUM_BY_NAME = new Map(ENUMS.map((e) => [e.name, e]));
export const VALUE_BY_NAME = new Map(VALUE_TYPES.map((v) => [v.name, v]));
export const ENTITY_BY_NAME = new Map(ENTITIES.map((e) => [e.name, e]));
export const ENTITY_BY_TABLE = new Map(ENTITIES.map((e) => [e.table, e]));

/** Entities with an id field and the prefix it carries: { Bounty: 'bnty', ... }. */
export const ID_PREFIXES = Object.fromEntries(ENTITIES.filter((e) => e.fields.some((f) => f.name === 'id') && e.prefix).map((e) => [e.name, e.prefix]));

/** Names of the enum values, in order. */
export const enumValues = (name) => ENUM_BY_NAME.get(name).values.map((v) => v.value);

/** All ref fields of an entity (including inside nested value types): [{ path, table, array }]. Depth limited to avoid cycles. */
export function refsOf(typeName, kind = 'entity', depth = 0, prefix = '', seen = new Set()) {
  const def = kind === 'entity' ? ENTITY_BY_NAME.get(typeName) : VALUE_BY_NAME.get(typeName);
  if (!def || depth > 4) return [];
  const out = [];
  for (const f of def.fields) {
    out.push(...refsOfField(f.type, `${prefix}${f.name}`, depth, seen));
  }
  return out;
}
function refsOfField(rawType, path, depth, seen) {
  const p = parseType(rawType);
  const arr = p.array ? '[]' : '';
  if (p.kind === 'ref') return [{ path: path + arr, table: p.table }];
  if (p.kind === 'obj') {
    const key = `${p.name}@${path}`;
    if (seen.has(key)) return [];
    return refsOf(p.name, 'value', depth + 1, `${path}${arr}.`, new Set([...seen, key]));
  }
  if (p.kind === 'map') return refsOfField(rawType.replace(/^map:/, '').replace(/\[\]$/, ''), `${path}{}`, depth, seen);
  return [];
}

/** Fixture catalogue: one row per fixture file with owner, shape, fields, counts and derived cross-references. */
export function fixtureCatalogue() {
  const refsTo = new Map();
  const rows = ENTITIES.map((e) => {
    const refs = refsOf(e.name);
    for (const r of refs) {
      if (!refsTo.has(r.table)) refsTo.set(r.table, new Set());
      refsTo.get(r.table).add(e.table);
    }
    return { entity: e, table: e.table, file: `packages/contract/fixtures/${e.table}.json`, owner: e.owner, shape: e.shape ?? 'array', refs, meta: FIXTURE_META[e.table] };
  });
  return rows.map((r) => ({ ...r, referencedBy: [...(refsTo.get(r.table) ?? [])].sort() }));
}

/** Check the schema for internal consistency. Returns a list of error strings (empty when the schema is sound). */
export function checkSchema() {
  const errs = [];
  const dup = (names, what) => {
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) errs.push(`duplicate ${what} name: ${n}`);
      seen.add(n);
    }
  };
  dup(ENUMS.map((e) => e.name), 'enum');
  dup(VALUE_TYPES.map((e) => e.name), 'value type');
  dup(ENTITIES.map((e) => e.name), 'entity');
  dup(ENTITIES.map((e) => e.table), 'table');
  const overlap = ENTITIES.map((e) => e.name).filter((n) => VALUE_BY_NAME.has(n));
  for (const n of overlap) errs.push(`name used as both entity and value type: ${n}`);

  const prefixes = new Map();
  for (const e of ENTITIES) {
    if (!e.fields.some((f) => f.name === 'id') || !e.prefix) continue;
    if (prefixes.has(e.prefix)) errs.push(`id prefix "${e.prefix}" used by ${prefixes.get(e.prefix)} and ${e.name}`);
    prefixes.set(e.prefix, e.name);
    if (!/^[a-z]{2,6}$/.test(e.prefix)) errs.push(`bad prefix "${e.prefix}" on ${e.name}`);
  }
  for (const en_ of ENUMS) {
    dup(en_.values.map((v) => v.value), `value in enum ${en_.name}`);
    for (const v of en_.values) if (!TONES.includes(v.tone)) errs.push(`enum ${en_.name}.${v.value}: bad tone ${v.tone}`);
    if (en_.values.length === 0) errs.push(`enum ${en_.name} is empty`);
  }
  const checkType = (raw, where, keys) => {
    let p;
    try { p = parseType(raw); } catch (err) { errs.push(`${where}: ${err.message}`); return; }
    const walk = (t) => {
      if (t.kind === 'enum' && !ENUM_BY_NAME.has(t.name)) errs.push(`${where}: unknown enum ${t.name}`);
      if (t.kind === 'obj' && !VALUE_BY_NAME.has(t.name)) errs.push(`${where}: unknown value type ${t.name}`);
      if (t.kind === 'ref' && !ENTITY_BY_TABLE.has(t.table)) errs.push(`${where}: unknown table ${t.table}`);
      if (t.kind === 'map') walk(t.inner);
    };
    walk(p);
    if (keys && !ENUM_BY_NAME.has(keys)) errs.push(`${where}: unknown key enum ${keys}`);
  };
  for (const e of ENTITIES) {
    if (!e.table) errs.push(`entity ${e.name} has no table`);
    if (!['core', 'ext'].includes(e.owner)) errs.push(`entity ${e.name}: bad owner ${e.owner}`);
    dup(e.fields.map((f) => f.name), `field in ${e.name}`);
    for (const f of e.fields) checkType(f.type, `${e.name}.${f.name}`, f.keys);
    if (!FIXTURE_META[e.table]) errs.push(`fixtures.mjs has no entry for table ${e.table}`);
    if (e.key) for (const k of e.key) if (!e.fields.some((f) => f.name === k)) errs.push(`entity ${e.name}: key field ${k} missing`);
  }
  for (const t of Object.keys(FIXTURE_META)) if (!ENTITY_BY_TABLE.has(t)) errs.push(`fixtures.mjs: unknown table ${t}`);
  for (const v of VALUE_TYPES) {
    dup(v.fields.map((f) => f.name), `field in ${v.name}`);
    for (const f of v.fields) checkType(f.type, `${v.name}.${f.name}`, f.keys);
  }
  // reason codes
  const rc = enumValues('ReasonCode');
  for (const k of rc) if (!REASON_CODE_INFO[k]) errs.push(`REASON_CODE_INFO missing ${k}`);
  for (const k of Object.keys(REASON_CODE_INFO)) if (!rc.includes(k)) errs.push(`REASON_CODE_INFO has unknown ${k}`);
  // state machines
  const actors = enumValues('ActorKind');
  for (const sm of STATE_MACHINES) {
    const en_ = ENUM_BY_NAME.get(sm.enum);
    if (!en_) { errs.push(`state machine ${sm.name}: unknown enum ${sm.enum}`); continue; }
    const vals = en_.values.map((v) => v.value);
    if (!vals.includes(sm.initial)) errs.push(`state machine ${sm.name}: bad initial ${sm.initial}`);
    for (const t of sm.terminal) if (!vals.includes(t)) errs.push(`state machine ${sm.name}: bad terminal ${t}`);
    for (const t of sm.transitions) {
      if (t.from !== null && !vals.includes(t.from)) errs.push(`state machine ${sm.name}: bad from ${t.from}`);
      if (!vals.includes(t.to)) errs.push(`state machine ${sm.name}: bad to ${t.to}`);
      for (const a of t.actors) if (!actors.includes(a)) errs.push(`state machine ${sm.name}: bad actor ${a}`);
    }
  }
  // constants sanity
  const sum = (a) => a.reduce((s, i) => s + i.weight, 0);
  if (sum(CONSTANTS.scores.hook_checklist) !== 100) errs.push('hook checklist weights must sum to 100');
  if (sum(CONSTANTS.scores.flow_checklist) !== 100) errs.push('flow checklist weights must sum to 100');
  const wsum = (o) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 1000) / 1000;
  if (wsum(CONSTANTS.reliability.creator.weights) !== 1) errs.push('creator reliability weights must sum to 1');
  if (wsum(CONSTANTS.reliability.brand.weights) !== 1) errs.push('brand reliability weights must sum to 1');
  if (wsum(CONSTANTS.matching.weights) !== 100) errs.push('match score weights must sum to 100');
  for (const t of CONSTANTS.tiers.order) if (!CONSTANTS.tiers.thresholds[t] || !CONSTANTS.tiers.perks[t]) errs.push(`tier ${t} missing thresholds or perks`);
  const tierVals = enumValues('Tier').join(',');
  if (tierVals !== CONSTANTS.tiers.order.join(',')) errs.push('Tier enum order differs from CONSTANTS.tiers.order');
  for (const k of enumValues('BriefLintCode')) {
    const rule = CONSTANTS.lint.rules[k];
    if (!rule) errs.push(`lint rule missing for ${k}`);
    else if (!enumValues('LintSeverity').includes(rule.severity)) errs.push(`lint rule ${k}: bad severity ${rule.severity}`);
  }
  for (const k of enumValues('FraudSignal')) if (!CONSTANTS.fraud.signals[k]) errs.push(`fraud signal ${k} missing in CONSTANTS.fraud.signals`);
  for (const k of enumValues('ScoreItemId')) {
    const inHook = CONSTANTS.scores.hook_checklist.some((i) => i.id === k);
    const inFlow = CONSTANTS.scores.flow_checklist.some((i) => i.id === k);
    if (!inHook && !inFlow) errs.push(`ScoreItemId ${k} is in neither checklist`);
  }
  for (const group of API_GROUPS) for (const ep of group.endpoints) if (!/^[A-Z]+$/.test(ep.m) || !ep.p.startsWith('/')) errs.push(`bad endpoint ${ep.m} ${ep.p}`);
  return errs;
}

/** snake_case / PascalCase helpers shared by the build scripts. */
export const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
