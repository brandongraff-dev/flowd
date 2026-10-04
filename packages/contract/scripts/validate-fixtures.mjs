#!/usr/bin/env node
// validate-fixtures: structural validation (from the schema) + referential integrity + reconciliation of the fixtures.
//
//   node packages/contract/scripts/validate-fixtures.mjs                 validate packages/contract/fixtures
//   node packages/contract/scripts/validate-fixtures.mjs --dir <path>    validate another folder
//   node packages/contract/scripts/validate-fixtures.mjs --strict        warnings become errors (use before handing off)
//   node packages/contract/scripts/validate-fixtures.mjs --self-test     prove the checks catch broken data (no fixtures needed)
//
// Invariant ids (S-01, L-03 ...) are defined in schema/world.mjs and documented in DOMAIN.md section 15. The fixture agents EXTEND this
// file: add a check function, register it in CHECKS with its invariant id, and flip the invariant's `check` to 'base' in world.mjs.
// Scaffold mode: when every collection is empty (the generators are still stubs) only the structure is checked.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENTITIES, ENTITY_BY_TABLE, VALUE_BY_NAME, ENUM_BY_NAME, CONSTANTS as C, FIXTURE_META, WORLD, enumValues, ID_PREFIXES,
} from '../schema/index.mjs';
import { parseType } from '../schema/dsl.mjs';
import {
  mulRate, instantPayout, tierFor, approvalRate, tierProgress, fraudScore, fraudBand, brandReliability, brandBadges, slaState, postClearingRun,
  funnelStats, clamp,
} from '../schema/formulas.mjs';
import { NOW_MS, NOW_ISO, ms, addHours, weekdayOf, hoursBetween, dateOf } from '../schema/time.mjs';
import { canonicalRow } from './gen/lib.mjs';
import { EXT_CHECKS, EXT_SCENARIO_CHECKS } from './validate-ext.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIR = path.resolve(here, '..', 'fixtures');

// ── reporter ──────────────────────────────────────────────────────────────────────────────────
export class Report {
  constructor() { this.errors = new Map(); this.warnings = new Map(); this.passed = new Set(); this.skipped = new Set(); this.notes = []; }
  note(text) { this.notes.push(text); }
  #add(map, id, key, msg) {
    const k = `${id}|${key}`;
    const e = map.get(k) ?? { id, key, count: 0, samples: [] };
    e.count++;
    if (e.samples.length < 3) e.samples.push(msg);
    map.set(k, e);
  }
  err(id, key, msg) { this.#add(this.errors, id, key, msg); }
  warn(id, key, msg) { this.#add(this.warnings, id, key, msg); }
  get errorCount() { return [...this.errors.values()].reduce((n, e) => n + e.count, 0); }
  get warningCount() { return [...this.warnings.values()].reduce((n, e) => n + e.count, 0); }
  hasError(id) { return [...this.errors.values()].some((e) => e.id === id); }
  format() {
    const lines = [];
    for (const [label, map] of [['ERROR', this.errors], ['WARN ', this.warnings]]) {
      for (const e of [...map.values()].sort((a, b) => a.id.localeCompare(b.id))) {
        lines.push(`${label} [${e.id}] ${e.key}${e.count > 1 ? ` (${e.count}x)` : ''}: ${e.samples[0]}`);
        for (const s of e.samples.slice(1)) lines.push(`        e.g. ${s}`);
      }
    }
    for (const n of this.notes) lines.push(`NOTE  ${n}`);
    return lines.join('\n');
  }
}

// ── dataset ───────────────────────────────────────────────────────────────────────────────────
/** raw: { table: rows | object }. Missing tables are treated as empty. */
export function makeDataset(raw) {
  const cache = new Map();
  const ds = {
    raw,
    t: (table) => (Array.isArray(raw[table]) ? raw[table] : []),
    obj: (table) => (raw[table] && !Array.isArray(raw[table]) ? raw[table] : null),
    byId(table) {
      if (!cache.has(table)) cache.set(table, new Map(ds.t(table).map((r) => [r.id, r])));
      return cache.get(table);
    },
    has: (table) => ds.t(table).length > 0 || ds.obj(table) !== null,
    ledgerByTxn() {
      if (!cache.has('ledger:txn')) cache.set('ledger:txn', groupBy(ds.t('ledger'), (r) => r.txn_id));
      return cache.get('ledger:txn');
    },
    ledgerByAccount() {
      if (!cache.has('ledger:acct')) cache.set('ledger:acct', groupBy(ds.t('ledger'), (r) => r.account));
      return cache.get('ledger:acct');
    },
  };
  return ds;
}
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

// ── structural validation (S-01 .. S-06) ─────────────────────────────────────────────────────
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z]{2,6}_[a-z0-9_.:-]+$/;
const FUTURE_OK = /(_until$|_due_at$|_ends_at$|^ends_at$|^starts_at$|^opens_at$|^closes_at$|^eta_at$|^due_at$|^expires_at$|_expires_at$|^release_at$|^scheduled_for$|^reset_at$|_renews_at$|^valid_until$|^entries_open_at$|^valid_from$|^rotation_due_at$|^featured_until$|^period_end$|^run_date$|^date$|^week_ends_at$|^next_|^expiration_at$)/;
const BAD_STRINGS = [/flowd\.(so|com|app)\b/i, /lorem ipsum/i, /\bundefined\b/, /\bNaN\b/, /\[object /];
const HOST_RE = /https?:\/\/([a-z0-9.-]+)/gi;
const HOST_OK = /(^|\.)(joinflowd\.io|example|tiktok\.com|instagram\.com|youtube\.com|apps\.apple\.com|example\.com)$/;

function checkValue(value, rawType, keysEnum, where, c) {
  const p = parseType(rawType);
  if (p.array) {
    if (!Array.isArray(value)) return c.rep.err('S-01', `${c.table} ${where}`, `${c.rowId}: expected array, got ${typeof value}`);
    value.forEach((v, i) => checkValue(v, rawType.slice(0, -2), keysEnum, `${where}[${i}]`, c));
    return;
  }
  const bad = (msg) => c.rep.err('S-01', `${c.table} ${where}`, `${c.rowId}: ${msg}`);
  switch (p.kind) {
    case 'id':
      if (typeof value !== 'string' || !ID_RE.test(value)) return bad(`bad id ${JSON.stringify(value)}`);
      return;
    case 'prim': {
      const n = p.name;
      if (n === 'string' || n === 'text' || n === 'url') { if (typeof value !== 'string') return bad(`expected string, got ${JSON.stringify(value)}`); scanString(value, where, c); return; }
      if (n === 'bool') { if (typeof value !== 'boolean') bad(`expected boolean, got ${JSON.stringify(value)}`); return; }
      if (n === 'int' || n === 'cents') { if (!Number.isInteger(value)) bad(`expected integer${n === 'cents' ? ' cents' : ''}, got ${JSON.stringify(value)}`); return; }
      if (n === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) bad(`expected number, got ${JSON.stringify(value)}`); return; }
      if (n === 'ratio') { if (typeof value !== 'number' || !(value >= 0 && value <= 1)) bad(`ratio out of 0..1: ${JSON.stringify(value)}`); return; }
      if (n === 'pct') { if (typeof value !== 'number' || !(value >= 0 && value <= 100)) bad(`pct out of 0..100: ${JSON.stringify(value)}`); return; }
      if (n === 'iso') {
        if (typeof value !== 'string' || !ISO_RE.test(value) || Number.isNaN(Date.parse(value))) return bad(`bad timestamp ${JSON.stringify(value)}`);
        const leaf = where.replace(/\[\d+\]$/, '').split('.').pop();
        if (ms(value) > NOW_MS && !FUTURE_OK.test(leaf)) c.rep.err('S-05', `${c.table} ${where}`, `${c.rowId}: ${value} is after now`);
        return;
      }
      if (n === 'date') { if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) bad(`bad date ${JSON.stringify(value)}`); return; }
      if (n === 'hex') { if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) bad(`bad colour ${JSON.stringify(value)}`); return; }
      if (n === 'json') { if (typeof value !== 'object' || value === null) bad('expected object'); return; }
      return;
    }
    case 'enum':
      if (!ENUM_BY_NAME.get(p.name).values.some((v) => v.value === value)) bad(`${JSON.stringify(value)} is not a ${p.name}`);
      return;
    case 'ref':
      if (typeof value !== 'string') return bad(`ref ${p.table} must be a string id`);
      (c.refs[p.table] ??= []).push({ value, where: `${c.table} ${where}`, rowId: c.rowId });
      return;
    case 'art': {
      if (typeof value !== 'object' || value === null) return bad('art must be an object');
      const ok = ['hue_a', 'hue_b', 'hue_c'].every((k) => Number.isInteger(value[k]) && value[k] >= 0 && value[k] <= 360)
        && ['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes'].includes(value.pattern) && Number.isInteger(value.seed);
      if (!ok) bad(`bad ArtSeed ${JSON.stringify(value)}`);
      if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 24)) bad('art.label must be a string of at most 24 characters');
      return;
    }
    case 'obj': {
      const def = VALUE_BY_NAME.get(p.name);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad(`${p.name} must be an object`);
      checkObject(value, def, where, c);
      return;
    }
    case 'map': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return bad('map must be an object');
      const inner = rawType.replace(/^map:/, '');
      const allowed = keysEnum ? enumValues(keysEnum) : null;
      for (const [k, v] of Object.entries(value)) {
        if (allowed && !allowed.includes(k)) bad(`map key ${k} is not a ${keysEnum}`);
        checkValue(v, inner, undefined, `${where}.${k}`, c);
      }
      return;
    }
    default:
  }
}
function scanString(s, where, c) {
  for (const re of BAD_STRINGS) if (re.test(s)) c.rep.err('S-06', `${c.table} ${where}`, `${c.rowId}: forbidden text ${re} in ${JSON.stringify(s.slice(0, 60))}`);
  for (const m of s.matchAll(HOST_RE)) if (!HOST_OK.test(m[1].toLowerCase())) c.rep.err('S-06', `${c.table} ${where}`, `${c.rowId}: remote host ${m[1]} (only joinflowd.io, .example and platform domains as text)`);
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(s) && /^https?:/.test(s)) c.rep.err('S-06', `${c.table} ${where}`, `${c.rowId}: remote image URL`);
  if (where.endsWith('email') && !/@(example\.com|joinflowd\.io)$/.test(s)) c.rep.err('S-06', `${c.table} ${where}`, `${c.rowId}: email must end @example.com or @joinflowd.io`);
}
function checkObject(obj, def, where, c) {
  const known = new Set(def.fields.map((f) => f.name));
  for (const f of def.fields) {
    const has = Object.prototype.hasOwnProperty.call(obj, f.name);
    if (!has || obj[f.name] === undefined) { if (f.required) c.rep.err('S-01', `${c.table} ${where ? `${where}.` : ''}${f.name}`, `${c.rowId}: missing required field`); continue; }
    if (obj[f.name] === null) { c.rep.err('S-01', `${c.table} ${where ? `${where}.` : ''}${f.name}`, `${c.rowId}: null (omit empty optional fields)`); continue; }
    checkValue(obj[f.name], f.type, f.keys, `${where ? `${where}.` : ''}${f.name}`, c);
  }
  for (const k of Object.keys(obj)) if (!known.has(k)) c.rep.warn('S-01', `${c.table} ${where ? `${where}.` : ''}${k}`, `${c.rowId}: unknown field (add it to the schema or remove it)`);
}

/** S-01..S-06 over every table; returns the id indexes used by the ref check. */
export function checkStructure(ds, rep, { scaffold = false } = {}) {
  const refs = {};
  const ids = {};
  for (const e of ENTITIES) {
    const raw = ds.raw[e.table];
    if (raw === undefined) { rep.err('S-01', e.table, 'fixture missing'); continue; }
    const shape = e.shape ?? 'array';
    if (shape === 'object') {
      if (Array.isArray(raw) || typeof raw !== 'object' || raw === null) { rep.err('S-01', e.table, 'must be a single object'); continue; }
      checkObject(raw, e, '', { rep, table: e.table, rowId: e.table, refs });
      continue;
    }
    if (!Array.isArray(raw)) { rep.err('S-01', e.table, 'must be an array'); continue; }
    const seen = new Set();
    const hasId = e.fields.some((f) => f.name === 'id');
    const keyFields = e.key ?? null;
    raw.forEach((row, i) => {
      const rowId = row?.id ?? (keyFields ? keyFields.map((k) => row?.[k]).join('+') : `#${i}`);
      if (typeof row !== 'object' || row === null) return rep.err('S-01', e.table, `row ${i} is not an object`);
      checkObject(row, e, '', { rep, table: e.table, rowId, refs });
      if (hasId && !e.key) {
        if (seen.has(row.id)) rep.err('S-02', e.table, `duplicate id ${row.id}`);
        seen.add(row.id);
        if (e.prefix && typeof row.id === 'string' && e.name !== 'Format' && !row.id.startsWith(`${e.prefix}_`)) rep.err('S-02', e.table, `${row.id} does not start with ${e.prefix}_`);
      }
      if (keyFields) {
        const k = keyFields.map((f) => row[f]).join('|');
        if (seen.has(k)) rep.err('S-02', e.table, `duplicate key ${k}`);
        seen.add(k);
      }
    });
    if (e.name === 'Format') raw.forEach((r) => { if (!enumValues('FormatId').includes(r.id)) rep.err('S-02', e.table, `${r.id} is not a FormatId`); });
    ids[e.table] = new Set(hasId ? raw.map((r) => r.id) : []);
  }
  for (const [table, list] of Object.entries(refs)) {
    const target = ids[table];
    if (!target || (scaffold && target.size === 0)) continue;
    for (const r of list) if (!target.has(r.value)) rep.err('S-03', `${r.where}`, `${r.rowId}: ${r.value} not found in ${table}`);
  }
}

// ── reconciliation checks ─────────────────────────────────────────────────────────────────────
const EARNING_TYPES = new Set(['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral']);
const POOL_TYPES = new Set(['cpm', 'cpa', 'flat_fee']);

function checkWorld(ds, rep) {
  const w = ds.obj('world');
  if (!w) return;
  if (w.now !== NOW_ISO) rep.err('S-07', 'world.now', `now must be ${NOW_ISO}, got ${w.now}`);
  for (const e of ENTITIES) {
    if (e.table === 'world') continue;
    const actual = (e.shape ?? 'array') === 'object' ? (ds.obj(e.table) ? 1 : 0) : ds.t(e.table).length;
    if (w.counts && w.counts[e.table] !== undefined && w.counts[e.table] !== actual) rep.err('S-07', `world.counts.${e.table}`, `says ${w.counts[e.table]}, actual ${actual}`);
  }
  const P = w.personas;
  if (P) {
    const must = [['users', P.creator?.user_id], ['creators', P.creator?.creator_id], ['users', P.brand?.user_id], ['brand_members', P.brand?.member_id], ['brands', P.brand?.brand_id], ['apps', P.brand?.app_id], ['users', P.admin?.user_id]];
    for (const [table, id] of must) if (ds.t(table).length && !ds.byId(table).has(id)) rep.err('S-07', 'world.personas', `${id} not found in ${table}`);
  }
}

function checkBounties(ds, rep) {
  const subsByBounty = groupBy(ds.t('submissions'), (s) => s.bounty_id);
  for (const b of ds.t('bounties')) {
    const id = b.id;
    for (const k of ['escrow_funded_cents', 'reserved_cents', 'spent_cents', 'remaining_cents', 'refunded_cents', 'matched_cents']) if (b[k] < 0) rep.err('L-03', 'bounties', `${id}: ${k} is negative`);
    if (b.escrow_funded_cents !== b.reserved_cents + b.spent_cents + b.remaining_cents + b.refunded_cents) rep.err('L-03', 'bounties', `${id}: escrow ${b.escrow_funded_cents} != reserved ${b.reserved_cents} + spent ${b.spent_cents} + remaining ${b.remaining_cents} + refunded ${b.refunded_cents}`);
    const fundedFlag = b.escrow_funded_cents >= b.budget_cents + b.fee_reserve_cents && b.escrow_funded_cents > 0;
    if (b.funded !== fundedFlag) rep.err('L-05', 'bounties.funded', `${id}: funded=${b.funded} but escrow ${b.escrow_funded_cents} vs budget+reserve ${b.budget_cents + b.fee_reserve_cents}`);
    const mustBeFunded = ['scheduled', 'live', 'paused', 'filled', 'ended', 'settled'].includes(b.status);
    if (mustBeFunded && !b.funded) rep.err('L-05', 'bounties.status', `${id}: ${b.status} but not funded`);
    if (['draft', 'awaiting_funding'].includes(b.status) && b.funded) rep.err('L-05', 'bounties.status', `${id}: ${b.status} but already funded`);
    if (b.fee_reserve_cents !== mulRate(b.budget_cents, b.take_rate)) rep.err('L-05', 'bounties.fee_reserve_cents', `${id}: ${b.fee_reserve_cents} != round(budget x take_rate) = ${mulRate(b.budget_cents, b.take_rate)}`);
    if (ds.t('submissions').length) {
      const reserved = sum(subsByBounty.get(b.id) ?? [], (s) => s.reserved_cents);
      if (reserved !== b.reserved_cents) rep.err('L-06', 'bounties.reserved_cents', `${id}: submissions ${reserved} vs row ${b.reserved_cents}`);
    }
    if (b.status === 'settled' && (b.reserved_cents !== 0 || b.remaining_cents !== 0)) rep.err('L-07', 'bounties', `${id}: settled but reserved ${b.reserved_cents} / remaining ${b.remaining_cents}`);
    if (b.status === 'settled' && b.refunded_cents + b.spent_cents !== b.escrow_funded_cents) rep.err('L-07', 'bounties', `${id}: settled but refunded + spent != escrow`);
  }
}

function checkLedger(ds, rep) {
  const ledger = ds.t('ledger');
  if (!ledger.length) { rep.skipped.add('L-*'); return; }
  // L-01
  for (const [txn, legs] of ds.ledgerByTxn()) {
    const net = sum(legs, (r) => r.amount_cents);
    if (net !== 0) rep.err('L-01', 'ledger', `${txn} nets to ${net}, not 0`);
    if (legs.length < 2) rep.err('L-01', 'ledger', `${txn} has a single leg`);
  }
  // L-02 wallet balances
  for (const b of ds.t('brands')) {
    const bal = sum(ds.ledgerByAccount().get(`wallet:${b.id}`) ?? [], (r) => r.amount_cents);
    if (bal !== b.wallet_balance_cents) rep.err('L-02', 'brands.wallet_balance_cents', `${b.id}: ledger ${bal} vs row ${b.wallet_balance_cents}`);
    if (bal < 0) rep.err('L-02', 'ledger wallet', `${b.id}: wallet balance is negative (${bal})`);
  }
  // L-03/L-04/L-08 per bounty: the bounty row against its escrow account
  for (const b of ds.t('bounties')) {
    const rows = ds.ledgerByAccount().get(`escrow:${b.id}`) ?? [];
    const funded = sum(rows.filter((r) => r.entry_type === 'escrow_fund' || r.entry_type === 'matched_budget'), (r) => r.amount_cents);
    const matched = sum(rows.filter((r) => r.entry_type === 'matched_budget'), (r) => r.amount_cents);
    const spent = -sum(rows.filter((r) => POOL_TYPES.has(r.entry_type)), (r) => r.amount_cents);
    const refunded = -sum(rows.filter((r) => r.entry_type === 'escrow_refund'), (r) => r.amount_cents);
    const bal = sum(rows, (r) => r.amount_cents);
    const id = b.id;
    if (b.escrow_funded_cents !== funded) rep.err('L-03', 'bounties.escrow_funded_cents', `${id}: ledger funded ${funded} vs row ${b.escrow_funded_cents}`);
    if (b.matched_cents !== matched) rep.err('L-03', 'bounties.matched_cents', `${id}: ledger ${matched} vs row ${b.matched_cents}`);
    if (bal !== b.reserved_cents + b.remaining_cents) rep.err('L-04', 'escrow balance', `${id}: ledger balance ${bal} != reserved ${b.reserved_cents} + remaining ${b.remaining_cents}`);
    if (b.spent_cents !== spent) rep.err('L-08', 'bounties.spent_cents', `${id}: ledger ${spent} vs row ${b.spent_cents}`);
    if (b.refunded_cents !== refunded) rep.err('L-08', 'bounties.refunded_cents', `${id}: ledger ${refunded} vs row ${b.refunded_cents}`);
  }
  // L-11 fee legs and L-12 cap
  const bountyById = ds.byId('bounties');
  for (const [txn, legs] of ds.ledgerByTxn()) {
    const esc = legs.find((l) => l.account.startsWith('escrow:') && POOL_TYPES.has(l.entry_type) && l.amount_cents < 0);
    if (!esc) continue;
    const b = bountyById.get(esc.account.slice(7));
    if (!b) continue;
    const creatorLeg = legs.find((l) => l.account.startsWith('creator:') && l.amount_cents > 0);
    const feeLeg = legs.find((l) => l.account === 'platform:fees' && l.amount_cents > 0);
    if (!creatorLeg) { rep.err('L-11', 'ledger', `${txn}: settlement without a creator leg`); continue; }
    const fee = feeLeg ? feeLeg.amount_cents : 0;
    const expected = mulRate(creatorLeg.amount_cents, b.take_rate);
    if (fee !== expected) rep.err('L-11', 'ledger fee leg', `${txn}: fee ${fee} != round(${creatorLeg.amount_cents} x ${b.take_rate}) = ${expected}`);
    if (esc.amount_cents !== -(creatorLeg.amount_cents + fee)) rep.err('L-11', 'ledger escrow leg', `${txn}: escrow leg ${esc.amount_cents} != -(pay + fee)`);
  }
  const payByPost = new Map();
  for (const r of ledger) if (r.account.startsWith('creator:') && (r.entry_type === 'cpm' || r.entry_type === 'cpa') && r.amount_cents > 0 && r.status !== 'reversed' && r.post_id) payByPost.set(r.post_id, (payByPost.get(r.post_id) ?? 0) + r.amount_cents);
  const postById = ds.byId('posts');
  for (const [pid, pay] of payByPost) {
    const p = postById.get(pid);
    const b = p && bountyById.get(p.bounty_id);
    if (b && pay > b.per_video_cap_cents) rep.err('L-12', 'ledger', `${pid}: settled pool pay ${pay} exceeds the per-video cap ${b.per_video_cap_cents}`);
  }
  // L-13 CPA rows
  const convById = ds.byId('conversions');
  for (const r of ledger) {
    if (!(r.account.startsWith('creator:') && r.entry_type === 'cpa' && r.amount_cents > 0)) continue;
    const cv = r.conversion_id ? convById.get(r.conversion_id) : null;
    if (!cv) { if (ds.t('conversions').length) rep.err('L-13', 'ledger', `${r.id}: cpa row without a conversion`); continue; }
    if (!['link', 'code'].includes(cv.source)) rep.err('L-13', 'ledger', `${r.id}: CPA paid on a ${cv.source} conversion (only link and code pay)`);
    if (!cv.payable || cv.status !== 'cleared') rep.err('L-13', 'ledger', `${r.id}: CPA paid on a conversion that is not payable and cleared`);
  }
  // L-17 platform accounts
  for (const [acct, rows] of ds.ledgerByAccount()) {
    if (!acct.startsWith('platform:') || acct === 'platform:promo' || acct === 'platform:matching') continue;
    const bal = sum(rows, (r) => r.amount_cents);
    if (bal < 0) rep.err('L-17', 'ledger', `${acct} balance is negative (${bal})`);
  }
}

/** L-18: a post's earnings are what its creator ledger rows say (settled) plus what the Money Clock still holds (pending, accruing, held). */
function checkPostEarnings(ds, rep) {
  if (!ds.t('ledger').length || !ds.t('posts').length || !ds.t('money_clock').length) return;
  const sums = new Map();
  const add = (id, v) => sums.set(id, (sums.get(id) ?? 0) + v);
  for (const r of ds.t('ledger')) {
    if (!r.account.startsWith('creator:') || r.amount_cents <= 0 || r.status === 'reversed' || !r.post_id) continue;
    if (['cpm', 'cpa', 'flat_fee', 'commission'].includes(r.entry_type)) add(r.post_id, r.amount_cents);
  }
  for (const m of ds.t('money_clock')) if (!m.ledger_id && m.post_id && ['accruing', 'pending', 'held'].includes(m.state)) add(m.post_id, m.amount_cents);
  for (const p of ds.t('posts')) {
    const e = p.earnings;
    if (e.total_cents !== e.cpm_cents + e.cpa_cents + e.commission_cents + e.flat_cents) rep.err('L-18', 'posts.earnings.total_cents', `${p.id}: total != cpm + cpa + commission + flat`);
    const expected = sums.get(p.id) ?? 0;
    if (e.total_cents !== expected) rep.err('L-18', 'posts.earnings', `${p.id}: earnings ${e.total_cents} vs ledger and Money Clock ${expected}`);
  }
}

function checkCreatorsMoney(ds, rep) {
  if (!ds.t('ledger').length || !ds.t('creators').length) return;
  for (const c of ds.t('creators')) {
    const rows = (ds.ledgerByAccount().get(`creator:${c.id}`) ?? []).filter((r) => EARNING_TYPES.has(r.entry_type) && r.amount_cents > 0 && (r.status === 'cleared' || r.status === 'paid'));
    const expected = (c.carry_over?.cleared_cents ?? 0) + sum(rows, (r) => r.amount_cents);
    if (expected !== c.lifetime_cleared_cents) rep.err('L-09', 'creators.lifetime_cleared_cents', `${c.id}: ledger ${expected} vs row ${c.lifetime_cleared_cents}`);
  }
}

function checkPayouts(ds, rep) {
  const payouts = ds.t('payouts');
  if (!payouts.length || !ds.t('ledger').length) return;
  const byPayout = groupBy(ds.t('ledger').filter((r) => r.payout_id), (r) => r.payout_id);
  for (const p of payouts) {
    const rows = (byPayout.get(p.id) ?? []).filter((r) => r.account.startsWith('creator:') && r.amount_cents > 0);
    const gross = sum(rows, (r) => r.amount_cents);
    if (!['scheduled', 'held', 'cancelled', 'failed'].includes(p.status) && gross !== p.gross_cents) rep.err('L-10', 'payouts.gross_cents', `${p.id}: earning rows ${gross} vs gross ${p.gross_cents}`);
    if (p.net_cents !== p.gross_cents - p.fee_cents) rep.err('L-10', 'payouts.net_cents', `${p.id}: net ${p.net_cents} != gross - fee`);
    if (p.kind === 'weekly') {
      if (p.fee_cents !== 0) rep.err('L-10', 'payouts.fee_cents', `${p.id}: weekly payouts are free`);
      const t = p.scheduled_for;
      if (weekdayOf(t) !== C.windows.weekly_payout_weekday_utc || t.slice(11) !== `${String(C.windows.weekly_payout_hour_utc).padStart(2, '0')}:00:00Z`) rep.err('L-10', 'payouts.scheduled_for', `${p.id}: weekly payouts run Fridays 18:00Z, got ${t}`);
      if (p.run_id !== `run_${dateOf(t)}`) rep.err('L-10', 'payouts.run_id', `${p.id}: run_id ${p.run_id} != run_${dateOf(t)}`);
    } else {
      const f = instantPayout({ amount_cents: p.gross_cents, tier: p.tier_at_payout, founding_free: p.free_instant, free_instant_used_this_week: p.free_instant ? 0 : 99 });
      if (f.ok && f.fee_cents !== p.fee_cents) rep.err('L-10', 'payouts.fee_cents', `${p.id}: instant fee ${p.fee_cents} != formula ${f.fee_cents}`);
      if (!f.ok) rep.err('L-10', 'payouts', `${p.id}: instant payout below the $5.00 minimum`);
    }
    if (p.status === 'paid' && !p.paid_at) rep.err('L-10', 'payouts.paid_at', `${p.id}: paid without paid_at`);
    if (p.status === 'held' && !p.hold_reason) rep.err('L-10', 'payouts.hold_reason', `${p.id}: held without a hold reason`);
    if (p.status === 'failed' && !p.failed_reason) rep.err('L-10', 'payouts.failed_reason', `${p.id}: failed without a reason`);
    if (['held', 'failed', 'cancelled', 'scheduled'].includes(p.status) && p.ledger_txn_id) rep.err('L-10', 'payouts.ledger_txn_id', `${p.id}: ${p.status} payouts move no money, so they have no ledger transaction`);
    if (['paid', 'in_transit', 'processing'].includes(p.status) && !p.ledger_txn_id) rep.err('L-10', 'payouts.ledger_txn_id', `${p.id}: ${p.status} payout without its ledger transaction`);
    if (p.ledger_txn_id) {
      const legs = ds.ledgerByTxn().get(p.ledger_txn_id) ?? [];
      const cr = legs.find((l) => l.account.startsWith('creator:'));
      if (cr && cr.amount_cents !== -p.gross_cents) rep.err('L-10', 'ledger payout leg', `${p.id}: creator leg ${cr.amount_cents} != -gross`);
      const bank = legs.find((l) => l.account === 'external:bank');
      if (bank && bank.amount_cents !== p.net_cents) rep.err('L-10', 'ledger payout leg', `${p.id}: bank leg ${bank.amount_cents} != net ${p.net_cents}`);
    }
  }
  for (const r of ds.t('ledger')) if (r.status === 'paid' && r.account.startsWith('creator:') && r.amount_cents > 0 && !r.payout_id) rep.err('L-10', 'ledger', `${r.id}: status paid without payout_id`);
}

function checkAds(ds, rep) {
  for (const a of ds.t('ads')) {
    const spend = sum(a.daily, (d) => d.spend_cents);
    if (spend !== a.spend_cents) rep.err('L-14', 'ads.spend_cents', `${a.id}: daily sum ${spend} vs ${a.spend_cents}`);
    if (a.platform_fee_cents !== mulRate(a.spend_cents, C.fees.ad_spend_fee_rate)) rep.err('L-14', 'ads.platform_fee_cents', `${a.id}: ${a.platform_fee_cents} != 1% of spend`);
    if (a.started_at) {
      const end = ms(a.started_at) + C.pay.ad_commission_days * 86_400_000;
      const inWin = sum(a.daily.filter((d) => ms(`${d.date}T00:00:00Z`) < end), (d) => d.revenue_cents);
      const exp = mulRate(inWin, a.commission_rate);
      if (a.commission_cents !== exp) rep.err('L-14', 'ads.commission_cents', `${a.id}: ${a.commission_cents} != round(rate x revenue in the 60-day window) = ${exp}`);
    }
  }
}

function checkInvoices(ds, rep) {
  for (const i of ds.t('invoices')) {
    if (i.total_cents !== i.subtotal_cents + i.processing_cents + i.tax_cents) rep.err('L-15', 'invoices.total_cents', `${i.id}: total != subtotal + processing + tax`);
    if (sum(i.line_items, (l) => l.amount_cents) !== i.subtotal_cents) rep.err('L-15', 'invoices.subtotal_cents', `${i.id}: lines do not add up to the subtotal`);
    for (const l of i.line_items) if (l.quantity * l.unit_cents !== l.amount_cents) rep.err('L-15', 'invoices.line_items', `${i.id}: ${l.description}: quantity x unit != amount`);
    if (i.status === 'paid' && i.kind === 'funding' && ds.t('ledger').length && !(i.ledger_txn_id && ds.ledgerByTxn().has(i.ledger_txn_id))) rep.err('L-15', 'invoices.ledger_txn_id', `${i.id}: paid funding invoice without a ledger transaction`);
    // the invoice total is what the ledger says was paid: the card charge, or the wallet debit when the wallet covered it
    const legs = i.ledger_txn_id ? ds.ledgerByTxn().get(i.ledger_txn_id) : null;
    if (legs) {
      const card = legs.find((l) => l.account === 'external:card');
      const wallet = legs.find((l) => l.account.startsWith('wallet:') && l.amount_cents < 0);
      const charged = card ? -card.amount_cents : wallet ? -wallet.amount_cents : null;
      if (charged !== null && charged !== i.total_cents) rep.err('L-15', 'invoices.total_cents', `${i.id}: total ${i.total_cents} but the ledger transaction moved ${charged}`);
    }
  }
}

function checkRunsAndClock(ds, rep) {
  const payouts = ds.t('payouts');
  for (const run of ds.t('payout_runs')) {
    const ps = payouts.filter((p) => p.run_id === run.id);
    if (ps.length !== run.payouts_count) rep.err('L-16', 'payout_runs.payouts_count', `${run.id}: payouts ${ps.length} vs ${run.payouts_count}`);
    const gross = sum(ps, (p) => p.gross_cents);
    if (gross !== run.total_gross_cents) rep.err('L-16', 'payout_runs.total_gross_cents', `${run.id}: ${gross} vs ${run.total_gross_cents}`);
    if (sum(ps, (p) => p.net_cents) !== run.total_net_cents) rep.err('L-16', 'payout_runs.total_net_cents', `${run.id}: net mismatch`);
    if (ps.filter((p) => p.status === 'paid').length !== run.paid_count) rep.err('L-16', 'payout_runs.paid_count', `${run.id}: paid_count mismatch`);
  }
  const mc = ds.t('money_clock');
  if (mc.length && ds.t('ledger').length) {
    const clearedByCreator = new Map();
    for (const r of ds.t('ledger')) if (r.account.startsWith('creator:') && EARNING_TYPES.has(r.entry_type) && r.amount_cents > 0 && r.status === 'cleared') clearedByCreator.set(r.creator_id ?? r.account.slice(8), (clearedByCreator.get(r.creator_id ?? r.account.slice(8)) ?? 0) + r.amount_cents);
    const mcCleared = new Map();
    for (const r of mc) if (r.state === 'cleared') mcCleared.set(r.creator_id, (mcCleared.get(r.creator_id) ?? 0) + r.amount_cents);
    for (const id of new Set([...clearedByCreator.keys(), ...mcCleared.keys()])) if ((clearedByCreator.get(id) ?? 0) !== (mcCleared.get(id) ?? 0)) rep.err('L-16', 'money_clock', `${id}: money clock cleared ${mcCleared.get(id) ?? 0} vs ledger cleared-unpaid ${clearedByCreator.get(id) ?? 0}`);
  }
  // every Money Clock row that points at a ledger row agrees with it: same creator, same amount, same state
  if (mc.length && ds.t('ledger').length) {
    const ledgerById = ds.byId('ledger');
    for (const r of mc) {
      if (!r.ledger_id) continue;
      const l = ledgerById.get(r.ledger_id);
      if (!l) { rep.err('L-16', 'money_clock.ledger_id', `${r.id}: ledger row ${r.ledger_id} not found`); continue; }
      if (l.account !== `creator:${r.creator_id}` || l.amount_cents !== r.amount_cents) rep.err('L-16', 'money_clock.amount_cents', `${r.id}: ${r.amount_cents} for ${r.creator_id} but ${l.id} is ${l.amount_cents} on ${l.account}`);
      const same = { pending: 'pending', cleared: 'cleared', paid: 'paid', held: 'held', reversed: 'reversed' }[r.state];
      if (same && l.status !== same) rep.err('L-16', 'money_clock.state', `${r.id}: state ${r.state} but ledger row ${l.id} is ${l.status}`);
    }
  }
  // T-06
  for (const r of mc) {
    if (['accruing', 'pending', 'cleared'].includes(r.state) && !r.eta_at) rep.err('T-06', 'money_clock.eta_at', `${r.id}: ${r.state} row without eta_at`);
    if (!r.reason || !r.reason_text) rep.err('T-06', 'money_clock.reason', `${r.id}: missing reason (never a bare pending)`);
    if (r.state === 'accruing' && !r.estimated) rep.err('T-06', 'money_clock.estimated', `${r.id}: accruing rows are estimates`);
    if (r.state === 'held' && !String(r.reason).startsWith('held_')) rep.err('T-06', 'money_clock.reason', `${r.id}: held row needs a held_* reason`);
  }
}

function checkMetrics(ds, rep) {
  const posts = ds.t('posts');
  if (!posts.length) return;
  const daily = groupBy(ds.t('post_metrics_daily'), (r) => r.post_id);
  if (ds.t('post_metrics_daily').length) {
    const keys = ['views', 'likes', 'comments', 'shares', 'saves'];
    const fkeys = ['clicks', 'installs', 'trials', 'paid', 'est_installs', 'est_trials', 'est_paid'];
    for (const p of posts) {
      const rows = daily.get(p.id) ?? [];
      for (const k of keys) { const s = sum(rows, (r) => r[k]); if (s !== p[k]) rep.err(k === 'views' ? 'M-01' : 'M-01', `posts.${k}`, `${p.id}: daily sum ${s} vs ${p[k]}`); }
      for (const k of fkeys) { const s = sum(rows, (r) => r[k]); if (s !== p.funnel[k]) rep.err('M-02', `posts.funnel.${k}`, `${p.id}: daily sum ${s} vs ${p.funnel[k]}`); }
      if (p.funnel.views !== p.views) rep.err('M-02', 'posts.funnel.views', `${p.id}: funnel.views ${p.funnel.views} != views ${p.views}`);
      if (p.window_views > p.views) rep.err('M-01', 'posts.window_views', `${p.id}: window_views ${p.window_views} > views ${p.views}`);
    }
  }
  // M-03
  const postsByBounty = groupBy(posts, (p) => p.bounty_id);
  const subsByBounty = groupBy(ds.t('submissions'), (s) => s.bounty_id);
  for (const b of ds.t('bounties')) {
    const ps = postsByBounty.get(b.id) ?? [];
    for (const k of ['views', 'clicks', 'installs', 'trials', 'paid', 'est_installs', 'est_trials', 'est_paid']) {
      const s = sum(ps, (p) => p.funnel[k]);
      if (s !== b.funnel[k]) rep.err('M-03', `bounties.funnel.${k}`, `${b.id}: posts ${s} vs ${b.funnel[k]}`);
    }
    if (ds.t('submissions').length) {
      const ss = subsByBounty.get(b.id) ?? [];
      const exp = {
        submissions: ss.length, creators: new Set(ss.map((s) => s.creator_id)).size, in_review: ss.filter((s) => s.status === 'in_review').length,
        approved: ss.filter((s) => ['approved', 'posted', 'released'].includes(s.status)).length, rejected: ss.filter((s) => s.status === 'rejected').length,
        posts: ps.length, live_posts: ps.filter((p) => p.status === 'live').length,
      };
      for (const [k, v] of Object.entries(exp)) if (b.counts[k] !== v) rep.err('M-03', `bounties.counts.${k}`, `${b.id}: counted ${v} vs ${b.counts[k]}`);
    }
  }
  // M-04
  const appDaily = ds.t('app_metrics_daily');
  if (appDaily.length && ds.t('post_metrics_daily').length) {
    const postApp = new Map(posts.map((p) => [p.id, p.app_id]));
    const agg = new Map();
    for (const r of ds.t('post_metrics_daily')) {
      const k = `${postApp.get(r.post_id)}|${r.date}`;
      const a = agg.get(k) ?? { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 };
      for (const f of Object.keys(a)) a[f] += r[f];
      agg.set(k, a);
    }
    for (const r of appDaily) {
      const a = agg.get(`${r.app_id}|${r.date}`) ?? { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 };
      for (const f of Object.keys(a)) if (a[f] !== r[f]) rep.err('M-04', `app_metrics_daily.${f}`, `${r.app_id} ${r.date}: posts ${a[f]} vs ${r[f]}`);
    }
  }
  // M-05 hourly
  const hourly = ds.t('post_metrics_hourly');
  if (hourly.length) {
    const dayAgg = new Map();
    const hoursByPost = new Map();
    for (const h of hourly) {
      const k = `${h.post_id}|${dateOf(h.ts)}`;
      dayAgg.set(k, (dayAgg.get(k) ?? 0) + h.views);
      (hoursByPost.get(h.post_id) ?? hoursByPost.set(h.post_id, new Set()).get(h.post_id)).add(h.ts);
      if (ms(h.ts) >= NOW_MS) rep.err('S-05', 'post_metrics_hourly.ts', `${h.post_id}: hour ${h.ts} is not before now`);
    }
    const dailyIdx = new Map(ds.t('post_metrics_daily').map((r) => [`${r.post_id}|${r.date}`, r]));
    const postById = ds.byId('posts');
    for (const [pid, set] of hoursByPost) {
      const p = postById.get(pid);
      if (!p) continue;
      if (ms(p.posted_at) < ms('2026-09-30T00:00:00Z')) rep.err('M-05', 'post_metrics_hourly', `${pid}: hourly rows exist only for posts posted since 2026-09-30`);
      const start = Math.floor(ms(p.posted_at) / 3_600_000) * 3_600_000;
      for (let t = start; t < NOW_MS; t += 3_600_000) if (!set.has(new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'))) { rep.err('M-05', 'post_metrics_hourly', `${pid}: missing hour ${new Date(t).toISOString()}`); break; }
    }
    for (const [k, v] of dayAgg) {
      const d = dailyIdx.get(k);
      if (d && d.views !== v) rep.err('M-05', 'post_metrics_hourly', `${k}: hourly sum ${v} vs daily ${d.views}`);
    }
  }
  // M-06 snapshots
  const snaps = groupBy(ds.t('view_snapshots'), (s) => s.post_id);
  const postById = ds.byId('posts');
  for (const [pid, rows] of snaps) {
    const p = postById.get(pid);
    const sorted = [...rows].sort((a, b) => ms(a.taken_at) - ms(b.taken_at));
    let prev = 0;
    for (const s of sorted) {
      if (s.views_verified < prev) rep.err('M-06', 'view_snapshots.views_verified', `${pid}: decreases at ${s.taken_at}`);
      if (s.delta_verified !== s.views_verified - prev) rep.err('M-06', 'view_snapshots.delta_verified', `${pid} ${s.taken_at}: delta ${s.delta_verified} != ${s.views_verified - prev}`);
      if (s.views_invalid !== s.views_reported - s.views_verified) rep.err('M-06', 'view_snapshots.views_invalid', `${pid} ${s.taken_at}: views_invalid ${s.views_invalid} != reported - verified ${s.views_reported - s.views_verified}`);
      if (s.exclusions && sum(s.exclusions, (x) => x.views) !== s.views_invalid) rep.err('M-06', 'view_snapshots.exclusions', `${pid} ${s.taken_at}: exclusions do not add up to views_invalid ${s.views_invalid}`);
      if (s.sources && Math.abs(sum(Object.values(s.sources), (x) => x) - 1) > 0.011) rep.err('M-06', 'view_snapshots.sources', `${pid} ${s.taken_at}: source mix does not sum to 1`);
      if (s.geo && Math.abs(sum(Object.values(s.geo), (x) => x) - 1) > 0.011) rep.err('M-06', 'view_snapshots.geo', `${pid} ${s.taken_at}: geo mix does not sum to 1`);
      prev = s.views_verified;
      if (p && ms(s.taken_at) < ms(p.posted_at)) rep.err('M-06', 'view_snapshots.taken_at', `${pid}: snapshot before the post`);
    }
    if (p) {
      const atEnd = sorted.find((s) => s.taken_at === p.window_ends_at);
      if (atEnd && atEnd.views_verified !== p.window_views) rep.err('M-06', 'view_snapshots', `${pid}: snapshot at window end ${atEnd.views_verified} != window_views ${p.window_views}`);
      if (prev > p.views) rep.err('M-06', 'view_snapshots', `${pid}: last snapshot ${prev} > views ${p.views}`);
    }
  }
  // M-07 monotonic funnel
  const mono = (f) => f.views >= f.clicks && f.clicks >= f.installs && f.installs >= f.trials && f.trials >= f.paid;
  for (const p of posts) if (!mono(p.funnel)) rep.err('M-07', 'posts.funnel', `${p.id}: funnel not monotonic (${p.funnel.views}/${p.funnel.clicks}/${p.funnel.installs}/${p.funnel.trials}/${p.funnel.paid})`);
  for (const b of ds.t('bounties')) if (!mono(b.funnel)) rep.err('M-07', 'bounties.funnel', `${b.id}: funnel not monotonic`);
  // M-08 conversions
  const convs = ds.t('conversions');
  if (convs.length) {
    const agg = new Map();
    for (const c of convs) {
      const det = c.source === 'link' || c.source === 'code';
      const expConf = { link: 'deterministic', code: 'deterministic', mmp: 'matched', survey: 'self_reported', modelled: 'modelled' }[c.source];
      if (c.confidence !== expConf) rep.err('M-08', 'conversions.confidence', `${c.id}: ${c.source} must be ${expConf}`);
      if (c.payable && (!det || ['rejected', 'refunded'].includes(c.status))) rep.err('M-08', 'conversions.payable', `${c.id}: payable but ${det ? c.status : c.source}`);
      if (!c.payable && det && c.status === 'cleared') rep.err('M-08', 'conversions.payable', `${c.id}: deterministic cleared conversion must be payable`);
      if (c.status === 'rejected' || c.status === 'refunded') continue;
      const k = `${c.post_id}|${det ? '' : 'est_'}${c.kind === 'install' ? 'installs' : c.kind === 'trial' ? 'trials' : 'paid'}`;
      agg.set(k, (agg.get(k) ?? 0) + c.quantity);
    }
    for (const p of posts) {
      for (const [f, kind] of [['installs', 'installs'], ['trials', 'trials'], ['paid', 'paid']]) {
        if ((agg.get(`${p.id}|${kind}`) ?? 0) !== p.funnel[f]) rep.err('M-08', `posts.funnel.${f}`, `${p.id}: conversions ${agg.get(`${p.id}|${kind}`) ?? 0} vs ${p.funnel[f]}`);
        if ((agg.get(`${p.id}|est_${kind}`) ?? 0) !== p.funnel[`est_${f}`]) rep.err('M-08', `posts.funnel.est_${f}`, `${p.id}: conversions ${agg.get(`${p.id}|est_${kind}`) ?? 0} vs ${p.funnel[`est_${f}`]}`);
      }
    }
  }
  // M-09 links
  const links = ds.t('attribution_links');
  const codes = new Set();
  for (const l of links) {
    if (codes.has(l.code)) rep.err('M-09', 'attribution_links.code', `${l.id}: duplicate code ${l.code}`);
    codes.add(l.code);
    if (l.short_url !== `joinflowd.io/r/${l.code}`) rep.err('M-09', 'attribution_links.short_url', `${l.id}: short_url must be joinflowd.io/r/<code>`);
    const p = l.post_id && postById.get(l.post_id);
    if (p) for (const [lf, pf] of [['clicks', 'clicks'], ['installs', 'installs'], ['trials', 'trials'], ['paid', 'paid']]) if (l[lf] !== p.funnel[pf]) rep.err('M-09', `attribution_links.${lf}`, `${l.id}: ${l[lf]} vs post funnel ${p.funnel[pf]}`);
  }
  const promo = new Map();
  for (const l of links) if (l.promo_code) { const k = `${l.app_id}|${l.promo_code}`; if (promo.has(k) && promo.get(k) !== l.creator_id) rep.warn('M-09', 'attribution_links.promo_code', `${l.id}: promo code ${l.promo_code} shared by creators (pooled codes rotate)`); promo.set(k, l.creator_id); }
}

function checkState(ds, rep) {
  // T-01 posts
  for (const p of ds.t('posts')) {
    if (p.window_ends_at !== addHours(p.posted_at, C.windows.view_window_hours)) rep.err('T-01', 'posts.window_ends_at', `${p.id}: window_ends_at must be posted_at + 72 h`);
    if (ms(p.posted_at) > NOW_MS) rep.err('T-01', 'posts.posted_at', `${p.id}: posted after now`);
    if (['held', 'removed', 'clawed_back'].includes(p.status)) { if (p.status === 'held' && !p.hold_reason) rep.err('T-01', 'posts.hold_reason', `${p.id}: held without hold_reason`); continue; }
    const open = NOW_MS < ms(p.window_ends_at);
    const run = postClearingRun(p.window_ends_at);
    const expected = open ? 'live' : ms(run) <= NOW_MS ? ['cleared', 'paid'] : 'window_closed';
    const ok = Array.isArray(expected) ? expected.includes(p.status) : p.status === expected;
    if (!ok) rep.err('T-01', 'posts.status', `${p.id}: status ${p.status} but expected ${Array.isArray(expected) ? expected.join('|') : expected} (window ends ${p.window_ends_at}, clearing run ${run})`);
    if (['cleared', 'paid'].includes(p.status) && p.cleared_at && ms(p.cleared_at) < ms(run)) rep.err('T-01', 'posts.cleared_at', `${p.id}: cleared before its clearing run ${run}`);
  }
  // T-02 submissions
  const postById = ds.byId('posts');
  for (const s of ds.t('submissions')) {
    if (s.version !== s.versions.length) rep.err('T-02', 'submissions.version', `${s.id}: version ${s.version} != versions.length ${s.versions.length}`);
    const cur = s.versions[s.versions.length - 1];
    if (s.status === 'in_review' || s.status === 'qa_pending') {
      if (s.status === 'in_review') {
        if (s.sla_due_at !== addHours(cur.submitted_at, s.versions ? C.review.sla_hours : 72)) rep.err('T-02', 'submissions.sla_due_at', `${s.id}: sla_due_at must be the current version submitted_at + 72 h`);
        const exp = slaState(hoursBetween(cur.submitted_at, NOW_ISO));
        if (s.sla_state !== exp) rep.err('T-02', 'submissions.sla_state', `${s.id}: sla_state ${s.sla_state} but ${hoursBetween(cur.submitted_at, NOW_ISO).toFixed(1)} h in queue is ${exp}`);
      }
    }
    if (['rejected', 'appealed'].includes(s.status)) {
      const d = s.decision;
      if (!d || !d.reason_code) rep.err('T-02', 'submissions.decision', `${s.id}: ${s.status} without a reason code`);
      else if (!d.evidence && d.action !== 'appeal_uphold') rep.err('T-02', 'submissions.decision', `${s.id}: rejection without evidence`);
    }
    if (s.status === 'changes_requested' && !(s.decision && s.decision.reason_code)) rep.err('T-02', 'submissions.decision', `${s.id}: changes requested without a reason code`);
    if (s.status === 'posted') { if (!s.post_id || (ds.t('posts').length && !postById.has(s.post_id))) rep.err('T-02', 'submissions.post_id', `${s.id}: posted without a post`); }
    if (['rejected', 'withdrawn', 'expired', 'released', 'posted'].includes(s.status) && s.reserved_cents !== 0) rep.err('T-02', 'submissions.reserved_cents', `${s.id}: ${s.status} must have reserved_cents 0`);
    if (['qa_pending', 'in_review', 'changes_requested', 'approved'].includes(s.status) && s.reserved_cents <= 0) rep.err('T-02', 'submissions.reserved_cents', `${s.id}: ${s.status} must hold a reservation`);
    if (s.revision_round > 2 && s.versions.length < 3) rep.warn('T-02', 'submissions.revision_round', `${s.id}: revision_round ${s.revision_round}`);
  }
  // T-03 creators
  const subsByCreator = groupBy(ds.t('submissions'), (s) => s.creator_id);
  for (const c of ds.t('creators')) {
    const stats = { lifetime_cleared_cents: c.lifetime_cleared_cents, approved_count: c.approved_count, approval_rate: c.approval_rate, reliability_score: c.reliability_score, elite_reviewed: !!c.tier_review };
    if (c.approval_rate !== approvalRate(c.approved_count, c.decided_count)) rep.err('T-03', 'creators.approval_rate', `${c.id}: ${c.approval_rate} != round(${c.approved_count}/${c.decided_count}, 2)`);
    if (c.decided_count < c.approved_count) rep.err('T-03', 'creators.decided_count', `${c.id}: decided < approved`);
    const computed = tierFor(stats);
    if (c.tier_basis === 'earned' && c.tier !== computed) rep.err('T-03', 'creators.tier', `${c.id}: tier ${c.tier} but stats earn ${computed}`);
    if (c.tier_basis === 'grace_hold') {
      if (!c.tier_hold_until || ms(c.tier_hold_until) <= NOW_MS) rep.err('T-03', 'creators.tier_hold_until', `${c.id}: grace hold needs a future tier_hold_until`);
      if (C.tiers.order.indexOf(c.tier) <= C.tiers.order.indexOf(computed)) rep.err('T-03', 'creators.tier', `${c.id}: grace_hold but tier ${c.tier} is not above ${computed}`);
    }
    if (c.tier === 'elite' && !c.tier_review) rep.err('T-03', 'creators.tier_review', `${c.id}: elite needs a manual review record`);
    if (ds.t('submissions').length) {
      const subs = subsByCreator.get(c.id) ?? [];
      const approved = subs.filter((s) => ['approved', 'posted', 'released'].includes(s.status)).length + (c.carry_over?.approved_count ?? 0);
      const decided = approved + subs.filter((s) => s.status === 'rejected').length + (c.carry_over ? c.carry_over.decided_count - c.carry_over.approved_count : 0);
      if (approved !== c.approved_count) rep.err('T-03', 'creators.approved_count', `${c.id}: submissions give ${approved} vs ${c.approved_count}`);
      if (decided !== c.decided_count) rep.err('T-03', 'creators.decided_count', `${c.id}: submissions give ${decided} vs ${c.decided_count}`);
    }
    if (ds.t('posts').length) {
      const live = ds.t('posts').filter((p) => p.creator_id === c.id && p.status === 'live').length;
      if (live !== c.live_posts_count) rep.err('T-03', 'creators.live_posts_count', `${c.id}: ${live} live posts vs ${c.live_posts_count}`);
    }
  }
  // T-04 reputation and scorecards
  const R = C.reliability.creator;
  for (const r of ds.t('creator_reputation')) {
    for (const c of r.components) if (R.weights[c.key] !== c.weight) rep.err('T-04', 'creator_reputation.components', `${r.id}: weight of ${c.key} must be ${R.weights[c.key]}`);
    const base = sum(r.components, (c) => 100 * c.weight * c.value);
    const exp = r.provisional ? R.provisional_score : Math.min(100, Math.round(base + r.academy_bonus_points));
    if (r.reliability_score !== exp) rep.err('T-04', 'creator_reputation.reliability_score', `${r.id}: ${r.reliability_score} != recomputed ${exp}`);
    if (r.provisional !== (r.finished_n < R.min_finished_for_score)) rep.err('T-04', 'creator_reputation.provisional', `${r.id}: provisional flag disagrees with finished_n ${r.finished_n}`);
    const cr = ds.byId('creators').get(r.creator_id);
    if (cr && cr.reliability_score !== r.reliability_score) rep.err('T-04', 'creator_reputation', `${r.id}: differs from creators.reliability_score (${cr.reliability_score})`);
  }
  for (const s of ds.t('brand_scorecards')) {
    const out = brandReliability({ decisions_n: s.decisions_n, approved_n: s.approved_n, decision_hours_median: s.decision_hours_median, appeals_overturned: s.appeals_overturned, pays_on_time_ratio: s.pays_on_time_ratio, run_rate: s.run_rate, reply_hours_median: s.reply_hours_median });
    if (out.score !== s.reliability_score) rep.err('T-04', 'brand_scorecards.reliability_score', `${s.id}: ${s.reliability_score} != recomputed ${out.score}`);
    if (out.band !== s.band) rep.err('T-04', 'brand_scorecards.band', `${s.id}: ${s.band} != recomputed ${out.band}`);
    if (Math.abs(s.rejection_rate - out.rejection_rate) > 0.011) rep.err('T-04', 'brand_scorecards.rejection_rate', `${s.id}: rejection_rate ${s.rejection_rate} != ${out.rejection_rate}`);
    const badges = brandBadges({ decision_hours_median: s.decision_hours_median, funded_always: s.funded_always, pays_on_time_ratio: s.pays_on_time_ratio, appeals_n: s.appeals_n, appeals_overturned: s.appeals_overturned, run_rate: s.run_rate, decisions_n: s.decisions_n });
    if ([...badges].sort().join() !== [...s.badges].sort().join()) rep.err('T-04', 'brand_scorecards.badges', `${s.id}: badges ${s.badges.join(',')} != ${badges.join(',')}`);
  }
  // T-05 fraud
  for (const p of ds.t('posts')) {
    const f = p.fraud;
    const total = Math.min(100, sum(f.signals, (h) => h.points));
    if (f.score !== total) rep.err('T-05', 'posts.fraud.score', `${p.id}: score ${f.score} != min(100, sum of points) ${total}`);
    if (f.band !== fraudBand(f.score)) rep.err('T-05', 'posts.fraud.band', `${p.id}: band ${f.band} != ${fraudBand(f.score)}`);
    for (const h of f.signals) {
      const max = C.fraud.signals[h.signal].max_points;
      if (h.points > max) rep.err('T-05', 'posts.fraud.signals', `${p.id}: ${h.signal} ${h.points} > max ${max}`);
      if (h.points !== Math.round(max * h.severity)) rep.err('T-05', 'posts.fraud.signals', `${p.id}: ${h.signal} points ${h.points} != round(${max} x ${h.severity})`);
    }
    if (f.score >= C.fraud.review_threshold && ['cleared', 'paid'].includes(p.status) && ds.t('fraud_flags').length) {
      const flag = ds.t('fraud_flags').find((x) => x.post_id === p.id);
      if (!flag || !['cleared', 'confirmed'].includes(flag.status)) rep.err('T-05', 'posts.status', `${p.id}: score ${f.score} cleared without a resolved fraud flag`);
    }
  }
  // T-12 offer codes
  const active = new Map();
  const seen = new Set();
  for (const o of ds.t('offer_code_pool')) {
    if (['available', 'assigned'].includes(o.status)) active.set(`${o.app_id}|${o.sku}`, (active.get(`${o.app_id}|${o.sku}`) ?? 0) + 1);
    const k = `${o.app_id}|${o.code}`;
    if (seen.has(k)) rep.err('T-12', 'offer_code_pool.code', `${o.id}: duplicate code ${o.code}`);
    seen.add(k);
  }
  for (const [k, n] of active) if (n > C.attribution.apple_active_offers_per_sku) rep.err('T-12', 'offer_code_pool', `${k}: ${n} active codes exceed the Apple cap of ${C.attribution.apple_active_offers_per_sku}`);
}

const COVERAGE_ENUMS = ['BountyType', 'BountyStatus', 'SubmissionStatus', 'PostStatus', 'LedgerType', 'PayoutKind', 'PayoutStatus', 'Tier', 'Platform', 'Category', 'Niche', 'ConversionSource', 'ConversionKind', 'AdStatus', 'ScoreBand', 'ReasonCode', 'FraudBand', 'HoldReason', 'MoneyClockState', 'Plan', 'BrandMemberRole', 'Visibility', 'FundingSource'];
function collectEnums(value, rawType, keysEnum, seen) {
  if (value === undefined || value === null) return;
  const p = parseType(rawType);
  if (p.array) { if (Array.isArray(value)) value.forEach((v) => collectEnums(v, rawType.slice(0, -2), keysEnum, seen)); return; }
  if (p.kind === 'enum') (seen[p.name] ??= new Set()).add(value);
  else if (p.kind === 'obj') { const def = VALUE_BY_NAME.get(p.name); if (def && typeof value === 'object') for (const f of def.fields) collectEnums(value[f.name], f.type, f.keys, seen); }
  else if (p.kind === 'map' && keysEnum && typeof value === 'object') for (const k of Object.keys(value)) (seen[keysEnum] ??= new Set()).add(k);
}
function checkPersonasAndScale(ds, rep) {
  const F = WORLD.PERSONA_FACTS;
  const maya = ds.byId('creators').get(WORLD.PERSONAS.creator.creator_id);
  if (maya) {
    const f = F.maya;
    const eq = (k, actual, expected) => { if (actual !== expected) rep.err('P-01', `maya.${k}`, `${actual} != ${expected}`); };
    eq('tier', maya.tier, f.tier); eq('lifetime_cleared_cents', maya.lifetime_cleared_cents, f.lifetime_cleared_cents); eq('approved_count', maya.approved_count, f.approved_count);
    eq('decided_count', maya.decided_count, f.decided_count); eq('approval_rate', maya.approval_rate, f.approval_rate); eq('live_posts_count', maya.live_posts_count, f.live_posts_count);
    eq('streak_weeks', maya.streak_weeks, f.streak_weeks); eq('handle', maya.handle, WORLD.PERSONAS.creator.handle); eq('founding', maya.founding, false);
    eq('reliability_score', maya.reliability_score, f.reliability_score);
    if (ds.t('ledger').length) {
      const rows = (ds.ledgerByAccount().get(`creator:${maya.id}`) ?? []).filter((r) => EARNING_TYPES.has(r.entry_type) && r.amount_cents > 0);
      eq('cleared_unpaid_cents', sum(rows.filter((r) => r.status === 'cleared'), (r) => r.amount_cents), f.cleared_unpaid_cents);
      eq('paid_out_cents', sum(rows.filter((r) => r.status === 'paid'), (r) => r.amount_cents), f.paid_out_cents);
    }
    if (ds.t('posts').length) {
      const mine = ds.t('posts').filter((p) => p.creator_id === maya.id);
      eq('posts_count', mine.length, f.posts_count);
      for (const [st, n] of Object.entries(f.posts_status)) eq(`posts_status.${st}`, mine.filter((p) => p.status === st).length, n);
    }
    if (ds.t('money_clock').length) {
      const pending = sum(ds.t('money_clock').filter((r) => r.creator_id === maya.id && ['accruing', 'pending', 'held'].includes(r.state)), (r) => r.amount_cents);
      eq('pending_cents', pending, f.pending_cents);
    }
    const prog = tierProgress({ lifetime_cleared_cents: maya.lifetime_cleared_cents, approved_count: maya.approved_count, approval_rate: maya.approval_rate, reliability_score: maya.reliability_score, elite_reviewed: false });
    eq('tier_progress_to_gold', prog.progress, f.tier_progress_to_gold);
  } else rep.err('P-01', 'creators', `${WORLD.PERSONAS.creator.creator_id} not found`);
  const lumi = ds.byId('brands').get(WORLD.PERSONAS.brand.brand_id);
  if (lumi) {
    if (lumi.plan !== F.lumi.plan) rep.err('P-02', 'lumi.plan', `${lumi.plan} != ${F.lumi.plan}`);
    const jordan = ds.byId('brand_members').get(WORLD.PERSONAS.brand.member_id);
    if (!jordan || jordan.role !== 'owner') rep.err('P-02', 'lumi.owner', 'Jordan Ellis must be the owner of br_lumi');
    const n = ds.t('bounties').filter((b) => b.brand_id === lumi.id).length;
    if (n < F.lumi.bounties) rep.err('P-02', 'lumi.bounties', `Lumi has ${n} bounties, needs ${F.lumi.bounties}`);
  } else rep.err('P-02', 'brands', `${WORLD.PERSONAS.brand.brand_id} not found`);
  if (!ds.byId('users').has(WORLD.PERSONAS.admin.user_id)) rep.err('P-02', 'users', `${WORLD.PERSONAS.admin.user_id} not found`);
  // Z-02 tier distribution
  const dist = {};
  for (const c of ds.t('creators')) dist[c.tier] = (dist[c.tier] ?? 0) + 1;
  for (const t of C.tiers.order) if (Math.abs((dist[t] ?? 0) - WORLD.TIER_DISTRIBUTION[t]) > 1) rep.warn('Z-02', 'creators.tier', `${t}: ${dist[t] ?? 0} vs target ${WORLD.TIER_DISTRIBUTION[t]}`);
}

/** Automated checkers for the demo scenarios (schema/world.mjs SCENARIOS). Return true when met, or a string saying what is missing. */
const SCENARIO_CHECKS = {
  'maya-money-clock': (ds) => {
    const mine = ds.t('posts').filter((p) => p.creator_id === 'cr_maya');
    return mine.filter((p) => p.status === 'live').length === 3 && mine.some((p) => p.status === 'window_closed') && mine.some((p) => p.status === 'cleared') || 'needs 3 live, 1 window_closed and 1 cleared post';
  },
  'maya-submission-states': (ds) => {
    const st = new Set(ds.t('submissions').filter((s) => s.creator_id === 'cr_maya').map((s) => s.status));
    return ['in_review', 'changes_requested', 'approved', 'rejected'].every((s) => st.has(s)) || 'needs in_review, changes_requested, approved and rejected submissions';
  },
  'maya-dispute': (ds) => ds.t('disputes').some((d) => d.creator_id === 'cr_maya' && d.kind === 'view_count' && ['open', 'evidence_requested'].includes(d.status)) || 'needs an open view_count dispute',
  'maya-offer': (ds) => {
    const o = ds.t('offers').filter((x) => x.creator_id === 'cr_maya');
    return (o.some((x) => x.brand_id === 'br_lumi' && x.status === 'awaiting_creator') && o.some((x) => x.status === 'awaiting_brand')) || 'needs a Lumi offer awaiting_creator and another awaiting_brand';
  },
  'maya-rights': (ds) => ds.t('rights_grants').some((g) => g.creator_id === 'cr_maya' && g.ends_at && Math.abs(hoursBetween(NOW_ISO, g.ends_at) / 24 - 14) < 1.5) || 'needs a Maya grant ending in about 14 days',
  'maya-streak': (ds) => ds.t('streaks').some((s) => s.creator_id === 'cr_maya' && s.current_weeks === 6 && s.freezes_banked === 1) || 'needs a 6-week streak with 1 banked freeze',
  'maya-drop': (ds) => ds.t('daily_drops').some((d) => d.date === dateOf(NOW_ISO) && d.status === 'upcoming') || 'needs today\'s drop as upcoming',
  'lumi-bounty-states': (ds) => {
    const b = ds.t('bounties').filter((x) => x.brand_id === 'br_lumi');
    return ['live', 'settled', 'awaiting_funding', 'filled'].every((s) => b.some((x) => x.status === s)) && ['cpm', 'stacked', 'cpa'].every((t) => b.some((x) => x.type === t)) || 'needs live, settled, awaiting_funding and filled bounties of types cpm, stacked and cpa';
  },
  'lumi-review-queue': (ds) => {
    const q = ds.t('submissions').filter((s) => s.brand_id === 'br_lumi' && s.status === 'in_review');
    const sc = ds.t('brand_scorecards').find((x) => x.brand_id === 'br_lumi');
    const ok = q.length === 6 && q.filter((s) => s.sla_state === 'stale').length >= 2 && q.filter((s) => s.sla_state === 'breached').length >= 1
      && q.some((s) => s.fraud_evidence.creator_fraud_band !== 'clean') && q.some((s) => s.fraud_evidence.duplicate_of_submission_id) && sc?.decision_hours_median === 11.2;
    return ok || `needs 6 in review (has ${q.length}): two stale, one breached, one fraud warning, one duplicate hash, and an 11.2 h median decision time (has ${sc?.decision_hours_median})`;
  },
  'platform-sla-breach': (ds) => {
    const breached = ds.t('submissions').filter((s) => s.status === 'in_review' && s.sla_state === 'breached');
    const byBrand = new Map();
    for (const s of breached) byBrand.set(s.brand_id, (byBrand.get(s.brand_id) ?? 0) + 1);
    return ([...byBrand.values()].some((n) => n >= 3) && ds.t('submissions').some((s) => s.decision?.action === 'timeout_approve')) || 'needs 3 breached reviews at one brand and one approve-if-clean timeout approval';
  },
  'lumi-winner-promotion': (ds) => (ds.t('ads').some((a) => a.brand_id === 'br_lumi' && a.status === 'live') && ds.t('ads').some((a) => a.brand_id === 'br_lumi' && a.status === 'fatigued')) || 'needs a live and a fatigued Lumi ad',
  'lumi-auto-approve': (ds) => (ds.t('auto_approve_rules').some((r) => r.brand_id === 'br_lumi' && r.status === 'active') && ds.t('auto_approve_rules').some((r) => r.brand_id === 'br_lumi' && r.status === 'killed')) || 'needs an active and a killed Lumi rule',
  'platform-fraud-queue': (ds) => ds.t('fraud_flags').filter((f) => f.status === 'open').length >= 6 || 'needs at least 6 open fraud flags',
  'platform-auction': (ds) => ['open', 'awarded', 'no_bids'].every((s) => ds.t('auctions').some((a) => a.status === s)) || 'needs an open, an awarded and a no_bids auction',
  'platform-tournament': (ds) => ['live', 'open', 'complete'].every((s) => ds.t('tournaments').some((t) => t.status === s)) || 'needs a live, an open and a complete tournament',
  'platform-tier-grace': (ds) => ds.t('creators').some((c) => c.tier_basis === 'grace_hold') || 'needs a creator in a grace hold',
  'platform-matched-first-bounty': (ds) => new Set(ds.t('bounties').filter((b) => b.matched_cents > 0).map((b) => b.brand_id)).size >= 3 || 'needs at least 3 brands with a matched first bounty',
  'platform-compliance-fail': (ds) => ds.t('posts').some((p) => p.status === 'held' && p.hold_reason === 'compliance_fail') || 'needs a post held for a failed disclosure audit',
  'platform-released-spec': (ds) => ds.t('specs').some((s) => s.source === 'released_from_bounty') || 'needs a spec released from a bounty',
  ...EXT_SCENARIO_CHECKS,
};
function checkScenarios(ds, rep) {
  const manual = [];
  for (const sc of WORLD.SCENARIOS) {
    const chk = SCENARIO_CHECKS[sc.id];
    if (!chk) { manual.push(sc.id); continue; }
    let res;
    try { res = chk(ds); } catch (err) { res = `checker threw: ${err.message}`; }
    if (res !== true) rep.warn('Z-04', sc.id, `scenario not met: ${res}`);
  }
  if (manual.length) rep.note(`Z-04: ${manual.length} scenario(s) have no automated checker, verify by hand: ${manual.join(', ')}`);
}

function checkScale(ds, rep, strict) {
  for (const e of ENTITIES) {
    const m = FIXTURE_META[e.table];
    const n = (e.shape ?? 'array') === 'object' ? (ds.obj(e.table) ? 1 : 0) : ds.t(e.table).length;
    if (n < m.count.min || n > m.count.max) (strict ? rep.err : rep.warn).call(rep, 'Z-01', e.table, `${n} rows, expected ${m.count.min}-${m.count.max} (target ${m.count.target})`);
  }
  const seen = {};
  for (const e of ENTITIES) {
    const rows = (e.shape ?? 'array') === 'object' ? (ds.obj(e.table) ? [ds.obj(e.table)] : []) : ds.t(e.table);
    for (const r of rows) for (const f of e.fields) collectEnums(r[f.name], f.type, f.keys, seen);
  }
  for (const name of COVERAGE_ENUMS) {
    const missing = enumValues(name).filter((v) => !seen[name]?.has(v));
    if (missing.length) rep.warn('Z-03', name, `enum values never used: ${missing.join(', ')}`);
  }
}

/** Register new checks here: { id, fn(ds, rep) }. */
export const CHECKS = [
  { id: 'S-07', fn: checkWorld }, { id: 'L-03', fn: checkBounties }, { id: 'L-*', fn: checkLedger }, { id: 'L-09', fn: checkCreatorsMoney }, { id: 'L-18', fn: checkPostEarnings }, { id: 'L-10', fn: checkPayouts }, { id: 'L-14', fn: checkAds },
  { id: 'L-15', fn: checkInvoices }, { id: 'L-16', fn: checkRunsAndClock }, { id: 'M-*', fn: checkMetrics }, { id: 'T-*', fn: checkState },
  ...EXT_CHECKS,
];

/** Run everything. raw = { table: rows | object }. Returns the Report. */
export function validate(raw, { strict = false } = {}) {
  const rep = new Report();
  const ds = makeDataset(raw);
  const total0 = ENTITIES.reduce((n, e) => n + ((e.shape ?? 'array') === 'array' ? ds.t(e.table).length : 0), 0);
  checkStructure(ds, rep, { scaffold: total0 === 0 });
  const total = ENTITIES.reduce((n, e) => n + ((e.shape ?? 'array') === 'array' ? ds.t(e.table).length : 0), 0);
  const scaffold = total === 0;
  if (scaffold) {
    rep.warn('Z-01', 'scaffold', 'every collection is empty: the generators are still stubs, so only the structure was checked');
    checkWorld(ds, rep);
    return rep;
  }
  for (const c of CHECKS) c.fn(ds, rep);
  checkPersonasAndScale(ds, rep);
  checkScenarios(ds, rep);
  checkScale(ds, rep, strict);
  return rep;
}

export function loadDir(dir) {
  const raw = {};
  for (const e of ENTITIES) {
    const f = path.join(dir, `${e.table}.json`);
    if (fs.existsSync(f)) {
      try { raw[e.table] = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { raw[e.table] = undefined; console.error(`could not parse ${f}: ${err.message}`); }
    }
  }
  return raw;
}

// ── synthetic rows (self-test only) ───────────────────────────────────────────────────────────
function synthValue(rawType, keysEnum, name, n, depth = 0) {
  if (depth > 8) throw new Error(`synthValue: recursion at ${rawType}`);
  const p = parseType(rawType);
  const wrap = (v) => (p.array ? [v] : v);
  switch (p.kind) {
    case 'id': return wrap(`xx_s${n}`);
    case 'art': return wrap({ hue_a: 10, hue_b: 120, hue_c: 300, pattern: 'orbs', seed: n, label: 'sample' });
    case 'enum': return wrap(ENUM_BY_NAME.get(p.name).values[0].value);
    case 'ref': { const e = ENTITY_BY_TABLE.get(p.table); return wrap(e.name === 'Format' ? 'tmpl_screen_reaction' : `${e.prefix}_s${n}`); }
    case 'obj': return wrap(synthObject(VALUE_BY_NAME.get(p.name), n, depth + 1));
    case 'map': { const inner = rawType.replace(/^map:/, '').replace(/\[\]$/, ''); const key = keysEnum ? enumValues(keysEnum)[0] : 'k'; return wrap({ [key]: synthValue(inner, undefined, name, n, depth + 1) }); }
    case 'prim':
      switch (p.name) {
        case 'string': case 'text': return wrap(String(name).endsWith('email') ? 'a@example.com' : 'sample');
        case 'url': return wrap('https://www.tiktok.com/@a/video/1');
        case 'int': case 'cents': return wrap(1);
        case 'number': return wrap(1.5);
        case 'ratio': return wrap(0.5);
        case 'pct': return wrap(50);
        case 'bool': return wrap(true);
        case 'iso': return wrap('2026-09-01T00:00:00Z');
        case 'date': return wrap('2026-09-01');
        case 'hex': return wrap('#112233');
        case 'json': return wrap({});
        default: throw new Error(p.name);
      }
    default: throw new Error(p.kind);
  }
}
function synthObject(def, n, depth = 0) {
  const o = {};
  for (const f of def.fields) o[f.name] = synthValue(f.type, f.keys, f.name, n, depth);
  return o;
}
function synthRow(entity, n) {
  const o = synthObject(entity, n);
  if (o.id !== undefined) o.id = entity.name === 'Format' ? enumValues('FormatId')[n - 1] : `${entity.prefix}_s${n}`;
  return o;
}

// ── self-test: prove the checks catch broken data ────────────────────────────────────────────
function selfTest() {
  const fails = [];
  const expectErr = (name, id, raw) => {
    const rep = new Report();
    const ds = makeDataset(raw);
    for (const c of CHECKS) c.fn(ds, rep);
    if (!rep.hasError(id)) fails.push(`${name}: expected an error ${id}, got ${[...rep.errors.values()].map((e) => e.id).join(',') || 'none'}`);
  };
  const expectClean = (name, raw) => {
    const rep = new Report();
    const ds = makeDataset(raw);
    for (const c of CHECKS) c.fn(ds, rep);
    if (rep.errorCount) fails.push(`${name}: expected no errors, got\n${rep.format()}`);
  };
  const base = () => ({
    brands: [{ id: 'br_t', wallet_balance_cents: 0 }],
    bounties: [{ id: 'bnty_t', brand_id: 'br_t', status: 'live', funded: true, budget_cents: 100_000, fee_reserve_cents: 10_000, take_rate: 0.10, escrow_funded_cents: 110_000, matched_cents: 0, reserved_cents: 0, spent_cents: 11_000, remaining_cents: 99_000, refunded_cents: 0, per_video_cap_cents: 25_000, funnel: { views: 1000, clicks: 10, installs: 5, trials: 2, paid: 1, est_installs: 0, est_trials: 0, est_paid: 0 }, counts: {} }],
    submissions: [],
    posts: [{ id: 'post_t', bounty_id: 'bnty_t', app_id: 'app_t', views: 1000, likes: 0, comments: 0, shares: 0, saves: 0, window_views: 1000, funnel: { views: 1000, clicks: 10, installs: 5, trials: 2, paid: 1, est_installs: 0, est_trials: 0, est_paid: 0 }, posted_at: '2026-09-20T10:00:00Z', window_ends_at: '2026-09-23T10:00:00Z', status: 'paid', fraud: { score: 0, band: 'clean', signals: [] } }],
    ledger: [
      { id: 'ledg_1', txn_id: 'txn_1', entry_type: 'wallet_topup', account: 'external:card', amount_cents: -113_280, status: 'cleared' },
      { id: 'ledg_2', txn_id: 'txn_1', entry_type: 'wallet_topup', account: 'wallet:br_t', amount_cents: 110_000, status: 'cleared' },
      { id: 'ledg_3', txn_id: 'txn_1', entry_type: 'processing', account: 'platform:processing', amount_cents: 3_280, status: 'cleared' },
      { id: 'ledg_4', txn_id: 'txn_2', entry_type: 'escrow_fund', account: 'wallet:br_t', amount_cents: -110_000, status: 'cleared' },
      { id: 'ledg_5', txn_id: 'txn_2', entry_type: 'escrow_fund', account: 'escrow:bnty_t', amount_cents: 110_000, status: 'cleared' },
      { id: 'ledg_6', txn_id: 'txn_3', entry_type: 'cpm', account: 'escrow:bnty_t', amount_cents: -11_000, status: 'cleared', post_id: 'post_t' },
      { id: 'ledg_7', txn_id: 'txn_3', entry_type: 'cpm', account: 'creator:cr_t', amount_cents: 10_000, status: 'cleared', post_id: 'post_t', creator_id: 'cr_t' },
      { id: 'ledg_8', txn_id: 'txn_3', entry_type: 'fee', account: 'platform:fees', amount_cents: 1_000, status: 'cleared' },
    ],
  });
  expectClean('clean base', base());
  { const r = base(); r.ledger[7].amount_cents = 900; expectErr('txn not netting zero', 'L-01', r); }
  { const r = base(); r.bounties[0].remaining_cents = 98_000; expectErr('escrow identity', 'L-03', r); }
  { const r = base(); r.bounties[0].escrow_funded_cents = 120_000; expectErr('escrow vs ledger', 'L-03', r); }
  { const r = base(); r.bounties[0].funded = false; expectErr('funded flag', 'L-05', r); }
  { const r = base(); r.bounties[0].status = 'live'; r.bounties[0].escrow_funded_cents = 0; r.ledger = []; r.bounties[0].funded = false; r.bounties[0].remaining_cents = 0; r.bounties[0].spent_cents = 0; expectErr('live but unfunded', 'L-05', r); }
  { const r = base(); r.brands[0].wallet_balance_cents = 5; expectErr('wallet balance', 'L-02', r); }
  { const r = base(); r.ledger[7].amount_cents = 1_100; r.ledger[5].amount_cents = -11_100; r.ledger[6].amount_cents = 10_000; r.ledger[7].amount_cents = 1_100; expectErr('fee leg', 'L-11', r); }
  { const r = base(); r.posts[0].views = 999; r.post_metrics_daily = [{ post_id: 'post_t', date: '2026-09-21', views: 1000, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 10, installs: 5, trials: 2, paid: 1, est_installs: 0, est_trials: 0, est_paid: 0 }]; expectErr('posts vs daily', 'M-01', r); }
  { const r = base(); r.posts[0].funnel.installs = 50; expectErr('funnel monotonic', 'M-07', r); }
  { const r = base(); r.posts[0].window_ends_at = '2026-09-23T11:00:00Z'; expectErr('window end', 'T-01', r); }
  { const r = base(); r.posts[0].status = 'live'; expectErr('post status vs time', 'T-01', r); }
  { const r = base(); r.posts[0].fraud = { score: 50, band: 'review', signals: [{ signal: 'curve_shape', severity: 1, points: 10 }] }; expectErr('fraud sum', 'T-05', r); }
  { const r = base(); r.conversions = [{ id: 'conv_1', post_id: 'post_t', kind: 'install', source: 'mmp', confidence: 'matched', quantity: 5, payable: true, status: 'cleared' }]; expectErr('payable mmp', 'M-08', r); }
  { const r = base(); r.creators = [{ id: 'cr_t', tier: 'gold', tier_basis: 'earned', lifetime_cleared_cents: 100, approved_count: 1, decided_count: 1, approval_rate: 1, reliability_score: 70, live_posts_count: 0, tier_review: undefined }]; expectErr('tier', 'T-03', r); }
  { const r = base(); r.offer_code_pool = Array.from({ length: 11 }, (_, i) => ({ id: `occ_${i}`, app_id: 'app_t', sku: 's', code: `C${i}`, status: 'assigned', assigned_creator_id: 'cr_t', assigned_link_id: 'lnk_t', redemptions: 0, max_redemptions: 50, valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-12-01T00:00:00Z' })); expectErr('apple cap', 'T-12', r); }
  { const r = base(); r.payouts = [{ id: 'pay_1', kind: 'weekly', status: 'paid', gross_cents: 10_000, fee_cents: 0, net_cents: 9_000, scheduled_for: '2026-10-02T18:00:00Z', run_id: 'run_2026-10-02', paid_at: '2026-10-03T10:00:00Z', tier_at_payout: 'silver', free_instant: false }]; expectErr('payout net', 'L-10', r); }
  // post earnings, Money Clock and invoices tie back to the ledger
  const withClock = () => {
    const r = base();
    r.posts[0].earnings = { cpm_cents: 10_000, cpa_cents: 0, commission_cents: 0, flat_cents: 0, total_cents: 10_000, capped: false, cap_remaining_cents: 0 };
    r.money_clock = [{ id: 'mc_1', creator_id: 'cr_t', post_id: 'post_t', state: 'cleared', amount_cents: 10_000, estimated: false, ledger_id: 'ledg_7', eta_at: '2026-10-09T18:00:00Z', reason: 'awaiting_weekly_payout', reason_text: 'Cleared. Pays out in the weekly run.' }];
    return r;
  };
  expectClean('earnings reconcile', withClock());
  { const r = withClock(); r.posts[0].earnings.total_cents = 9_000; r.posts[0].earnings.cpm_cents = 9_000; expectErr('post earnings vs ledger', 'L-18', r); }
  { const r = withClock(); r.money_clock[0].amount_cents = 9_999; expectErr('money clock vs ledger', 'L-16', r); }
  { const r = base(); r.invoices = [{ id: 'inv_1', brand_id: 'br_t', status: 'paid', kind: 'funding', line_items: [{ description: 'Escrow', quantity: 1, unit_cents: 100_000, amount_cents: 100_000 }], subtotal_cents: 100_000, processing_cents: 0, tax_cents: 0, total_cents: 100_000, ledger_txn_id: 'txn_2' }]; expectErr('invoice vs ledger', 'L-15', r); }
  { const r = base(); r.payouts = [{ id: 'pay_1', kind: 'weekly', status: 'held', gross_cents: 5_000, fee_cents: 0, net_cents: 5_000, scheduled_for: '2026-10-09T18:00:00Z', run_id: 'run_2026-10-09', tier_at_payout: 'silver', free_instant: false }]; expectErr('held payout without a reason', 'L-10', r); }
  // schema round trip: synthesise a valid row for every entity straight from the schema and require zero structural errors
  {
    const raw = {};
    for (const e of ENTITIES) {
      const rows = [1, 2].map((n) => synthRow(e, n));
      raw[e.table] = (e.shape ?? 'array') === 'object' ? rows[0] : rows;
    }
    const rep = new Report();
    checkStructure(makeDataset(raw), rep);
    const text = rep.format();
    if (rep.errorCount) fails.push(`schema round trip produced errors:\n${text.split('\n').slice(0, 12).join('\n')}`);
    // the canonical form of a schema-ordered row is the row itself (stable key order, nothing dropped)
    for (const e of ENTITIES) {
      const row = (e.shape ?? 'array') === 'object' ? raw[e.table] : raw[e.table][0];
      const again = canonicalRow(e.name, JSON.parse(JSON.stringify(row)));
      if (JSON.stringify(again) !== JSON.stringify(row)) fails.push(`canonicalRow changed a schema-ordered ${e.name} row`);
    }
    // every check must run on nonsense-but-well-typed data without throwing
    try { validate(raw); } catch (err) { fails.push(`a check threw on synthetic data: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }
  }
  // schema-level
  {
    const rep = new Report();
    const ds = makeDataset({ users: [{ id: 'usr_x', role: 'wizard', email: 'a@gmail.com', display_name: 'X', avatar: { hue_a: 1, hue_b: 2, hue_c: 400, pattern: 'orbs', seed: 1 }, auth_providers: ['apple'], status: 'active', age_verified: true, locale: 'en-US', timezone: 'UTC', created_at: '2027-01-01T00:00:00Z' }] });
    checkStructure(ds, rep);
    for (const id of ['S-01', 'S-05', 'S-06']) if (!rep.hasError(id)) fails.push(`structure: expected ${id} error`);
  }
  return fails;
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(`--${n}`);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  if (flag('self-test')) {
    const fails = selfTest();
    if (fails.length) { console.error(`self-test FAILED (${fails.length}):\n${fails.map((f) => `  - ${f}`).join('\n')}`); process.exit(1); }
    console.log('self-test passed: the validator accepts a clean ledger and flags every seeded defect.');
    process.exit(0);
  }
  const dir = path.resolve(opt('dir') ?? DEFAULT_DIR);
  const strict = flag('strict');
  if (!fs.existsSync(dir)) { console.error(`no fixtures folder at ${dir}`); process.exit(1); }
  const raw = loadDir(dir);
  const rep = validate(raw, { strict });
  const out = rep.format();
  if (out) console.log(out);
  const rows = ENTITIES.reduce((n, e) => n + ((e.shape ?? 'array') === 'array' ? (raw[e.table]?.length ?? 0) : 0), 0);
  console.log(`\nvalidate-fixtures: ${ENTITIES.length} files, ${rows.toLocaleString('en-US')} rows, ${rep.errorCount} error(s), ${rep.warningCount} warning(s)${strict ? ' (strict)' : ''}`);
  process.exit(rep.errorCount > 0 || (strict && rep.warningCount > 0) ? 1 : 0);
}
