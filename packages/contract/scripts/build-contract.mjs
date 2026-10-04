#!/usr/bin/env node
// build-contract: generates packages/contract/types.ts and the <!-- GENERATED:name --> blocks of DOMAIN.md from schema/*.mjs.
//
//   node packages/contract/scripts/build-contract.mjs           write types.ts and refresh DOMAIN.md blocks
//   node packages/contract/scripts/build-contract.mjs --check   exit 1 if either file is out of date (CI)
//
// types.ts is 100% generated. DOMAIN.md is hand-written prose with generated blocks between markers; never hand-edit a block.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENUMS, VALUE_TYPES, ENTITIES, ENUM_BY_NAME, VALUE_BY_NAME, ENTITY_BY_NAME, ENTITY_BY_TABLE, ID_PREFIXES, CONSTANTS, CONSTANT_NOTES,
  REASON_CODE_INFO, STATE_MACHINES, API_GROUPS, API_CONVENTIONS, API_TYPES_NOTE, WORLD, checkSchema, fixtureCatalogue, FIXTURE_META, toSnake, TONES,
} from '../schema/index.mjs';
import { parseType, describeType } from '../schema/dsl.mjs';
import * as F from '../schema/formulas.mjs';
import { FORMULA_DOCS } from '../schema/formulas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const schemaErrors = checkSchema();
if (schemaErrors.length) {
  console.error('Schema is inconsistent:\n' + schemaErrors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

// ── naming helpers ────────────────────────────────────────────────────────────────────────────
const GROUP_ORDER = ['Meta', 'Identity', 'Catalogues', 'Money', 'Bounties', 'Content', 'Submissions', 'Posts', 'Attribution', 'Ads', 'Market', 'Rights', 'Trust', 'Growth', 'Platform', 'Public', 'Admin'];
const sortGroups = (gs) => [...gs].sort((a, b) => (GROUP_ORDER.indexOf(a) + 100 * (GROUP_ORDER.indexOf(a) < 0)) - (GROUP_ORDER.indexOf(b) + 100 * (GROUP_ORDER.indexOf(b) < 0)));
const SCREAM = (name) => toSnake(name).toUpperCase();
function plural(name) {
  const s = SCREAM(name);
  if (s.endsWith('STATUS')) return `${s}ES`;
  if (s.endsWith('_ID')) return `${s}S`;
  if (/[^AEIOU]Y$/.test(s)) return `${s.slice(0, -1)}IES`;
  if (/(S|X|Z|CH|SH)$/.test(s)) return `${s}ES`;
  return `${s}S`;
}
const enumConst = (name) => plural(name);
const metaConst = (name) => `${SCREAM(name)}_META`;
const lit = (v) => JSON.stringify(v);

// Ids: every entity with an id gets an alias "<Entity>Id" unless an enum with that name exists (Format -> FormatId enum).
const idType = new Map(); // entity name -> TS type of its id
for (const e of ENTITIES) {
  if (!e.fields.some((f) => f.name === 'id')) continue;
  idType.set(e.name, ENUM_BY_NAME.has(`${e.name}Id`) ? `${e.name}Id` : `${e.name}Id`);
}
const aliasNames = new Set([...idType.entries()].filter(([n]) => !ENUM_BY_NAME.has(`${n}Id`)).map(([, t]) => t));

// Enum plural const uniqueness
{
  const seen = new Map();
  for (const en of ENUMS) {
    const c = enumConst(en.name);
    if (seen.has(c)) { console.error(`const name clash: ${c} (${seen.get(c)} and ${en.name})`); process.exit(1); }
    seen.set(c, en.name);
  }
}

function tsPrim(name) {
  switch (name) {
    case 'string': case 'text': case 'url': return 'string';
    case 'int': case 'number': case 'pct': return 'number';
    case 'cents': return 'Cents';
    case 'ratio': return 'Ratio';
    case 'bool': return 'boolean';
    case 'iso': return 'IsoTimestamp';
    case 'date': return 'IsoDate';
    case 'hex': return 'HexColor';
    case 'json': return 'Record<string, unknown>';
    default: throw new Error(`prim ${name}`);
  }
}
function tsOf(p, keys, ownEntity) {
  let t;
  switch (p.kind) {
    case 'id': t = ownEntity ? idType.get(ownEntity) : 'string'; break;
    case 'art': t = 'ArtSeed'; break;
    case 'prim': t = tsPrim(p.name); break;
    case 'enum': t = p.name; break;
    case 'obj': t = p.name; break;
    case 'ref': { const ent = ENTITY_BY_TABLE.get(p.table); t = idType.get(ent.name) ?? 'string'; break; }
    case 'map': { const inner = tsOf(p.inner, undefined, ownEntity); t = keys ? `Partial<Record<${keys}, ${inner}>>` : `Record<string, ${inner}>`; break; }
    default: throw new Error(`kind ${p.kind}`);
  }
  return p.array ? (t.includes('|') || t.includes('<') ? `Array<${t}>` : `${t}[]`) : t;
}
function fieldDoc(f, extra = '') {
  const parts = [f.doc, extra].filter(Boolean);
  return parts.length ? `  /** ${parts.join(' ').replace(/\*\//g, '* /')} */\n` : '';
}
function emitInterface(def, ownEntity, header) {
  let out = `/** ${def.doc.replace(/\*\//g, '* /')}${header ? ` ${header}` : ''} */\nexport interface ${def.name} {\n`;
  for (const f of def.fields) {
    const p = parseType(f.type);
    out += fieldDoc(f, p.kind === 'ref' ? `-> ${p.table}` : '');
    out += `  ${f.name}${f.required ? '' : '?'}: ${tsOf(p, f.keys, ownEntity)};\n`;
  }
  return `${out}}\n`;
}

// ── types.ts ──────────────────────────────────────────────────────────────────────────────────
const TONE_META = {
  neutral: { token: '--fd-fg-muted', fg: 'text-fg-muted', bg: 'bg-surface-hover' },
  accent: { token: '--fd-accent', fg: 'text-accent', bg: 'bg-accent-soft' },
  violet: { token: '--fd-violet', fg: 'text-violet', bg: 'bg-violet-soft' },
  info: { token: '--fd-info', fg: 'text-info', bg: 'bg-info-soft' },
  mint: { token: '--fd-mint', fg: 'text-mint', bg: 'bg-mint-soft' },
  ember: { token: '--fd-ember', fg: 'text-ember', bg: 'bg-ember-soft' },
  sun: { token: '--fd-sun', fg: 'text-sun', bg: 'bg-sun-soft' },
  rose: { token: '--fd-rose', fg: 'text-rose', bg: 'bg-rose-soft' },
};
const meaningFor = (name) => /(Status|State)$/.test(name) || ['Tier', 'BountyType', 'PayoutKind', 'ConversionSource', 'ConversionConfidence', 'ScoreBand', 'MoneyClockReason', 'HoldReason', 'ReasonCode', 'LedgerType', 'OfferKind', 'Visibility', 'FundingSource', 'DecisionAction', 'FraudBand', 'BrandBand'].includes(name);

function buildTypes() {
  const o = [];
  o.push(`/* eslint-disable */
// GENERATED by packages/contract/scripts/build-contract.mjs from packages/contract/schema/*.mjs. DO NOT EDIT.
// flowd domain contract ${WORLD.CONTRACT_VERSION}. Zero dependencies; passes tsc --strict.
// Canonical documentation: packages/contract/DOMAIN.md. Demo "now" = ${CONSTANTS.now}.
// Copied to apps/web/src/lib/contract/types.ts by \`npm run sync\`; the iOS models mirror these shapes (snake_case JSON).

export const CONTRACT_VERSION = ${lit(WORLD.CONTRACT_VERSION)} as const;
/** Demo world "now": every relative time in fixtures and the UI is relative to this instant. */
export const DEMO_NOW = ${lit(CONSTANTS.now)} as const;

/** ISO-8601 UTC with seconds and a trailing Z, e.g. "2026-10-03T14:00:00Z". */
export type IsoTimestamp = string;
/** Calendar date YYYY-MM-DD (UTC). */
export type IsoDate = string;
/** Integer money in cents (USD). Fields carry a _cents suffix. */
export type Cents = number;
/** 0..1 float. */
export type Ratio = number;
/** "#RRGGBB". */
export type HexColor = string;

// ── generated imagery ─────────────────────────────────────────────────────────────────────────
export const ART_PATTERNS = ['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes'] as const;
export type ArtPattern = (typeof ART_PATTERNS)[number];
/**
 * Seed for generated imagery: every avatar, thumbnail, app icon, spec cover and crew badge is described in JSON and rendered
 * as SVG/CSS on web and Canvas on iOS. No remote images anywhere. Same seed, same picture.
 */
export interface ArtSeed {
  /** 0-360 hue of the base colour. */
  hue_a: number;
  /** 0-360 hue of the second gradient stop. */
  hue_b: number;
  /** 0-360 hue of the accent shapes. */
  hue_c: number;
  pattern: ArtPattern;
  /** Integer driving every random choice of the pattern. */
  seed: number;
  /** Optional short text drawn on the art (thumbnail hook, initials, glyph). */
  label?: string;
}

// ── colour tones ──────────────────────────────────────────────────────────────────────────────
export const TONES = ${lit(TONES)} as const;
export type Tone = (typeof TONES)[number];
export interface EnumMeta {
  /** UI label. */
  label: string;
  /** Colour tone; map to tokens with TONE_CLASS. */
  tone: Tone;
  /** Plain-English meaning (status-like enums only). */
  meaning?: string;
}
/** Tone -> design token and Tailwind utility classes (tokens in packages/tokens; creators see mint for money, brands see neutral ink + arrows for deltas). */
export const TONE_CLASS: Record<Tone, { token: string; fg: string; bg: string }> = ${JSON.stringify(TONE_META, null, 2)};
`);

  // ids
  o.push('// ── id aliases (plain strings; the prefix is the entity prefix, see ID_PREFIXES) ─────────────');
  for (const t of [...aliasNames].sort()) o.push(`export type ${t} = string;`);
  o.push('');

  // enums
  o.push('// ── enumerations: string-literal unions, const arrays, label and tone maps ────────────────────');
  const groups = sortGroups([...new Set(ENUMS.map((e) => e.group))]);
  for (const g of groups) {
    o.push(`\n// ${g}`);
    for (const en of ENUMS.filter((e) => e.group === g)) {
      const vals = en.values.map((v) => lit(v.value));
      o.push(`/** ${en.doc.replace(/\*\//g, '* /')} */`);
      o.push(`export type ${en.name} = ${vals.join(' | ')};`);
      o.push(`export const ${enumConst(en.name)} = [${vals.join(', ')}] as const;`);
      const withM = meaningFor(en.name);
      o.push(`export const ${metaConst(en.name)}: Record<${en.name}, EnumMeta> = {`);
      for (const v of en.values) {
        o.push(`  ${/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.value) ? v.value : lit(v.value)}: { label: ${lit(v.label)}, tone: ${lit(v.tone)}${withM && v.meaning ? `, meaning: ${lit(v.meaning)}` : ''} },`);
      }
      o.push('};');
    }
  }
  o.push('\n/** Label / tone maps for every enum, keyed by enum name. */');
  o.push('export const STATUS_META = {');
  for (const en of ENUMS) o.push(`  ${en.name}: ${metaConst(en.name)},`);
  o.push('} as const;');
  o.push('\n/** Every enum\'s values, keyed by enum name (for generic validators and pickers). */');
  o.push('export const ENUM_VALUES = {');
  for (const en of ENUMS) o.push(`  ${en.name}: ${enumConst(en.name)},`);
  o.push('} as const;\n');

  // value types
  o.push('// ── nested value types (embedded objects) ─────────────────────────────────────────────────────');
  for (const v of VALUE_TYPES) o.push(emitInterface(v, null, ''));

  // entities
  o.push('// ── entities (one fixture file each; see FixtureMap) ──────────────────────────────────────────');
  for (const e of ENTITIES) o.push(emitInterface(e, e.name, `Fixture: ${e.table}.json (${e.owner}).`));

  // fixture map
  o.push('// ── fixtures ─────────────────────────────────────────────────────────────────────────────────');
  o.push('/** File name (without .json) -> parsed content type. Object-shaped files are single objects; the rest are arrays of rows. */');
  o.push('export interface FixtureMap {');
  for (const e of ENTITIES) o.push(`  ${e.table}: ${(e.shape ?? 'array') === 'object' ? e.name : `${e.name}[]`};`);
  o.push('}');
  o.push('export type FixtureName = keyof FixtureMap;');
  o.push('export interface FixtureFile {');
  o.push('  name: FixtureName;');
  o.push('  file: string;');
  o.push('  entity: string;');
  o.push("  owner: 'core' | 'ext';");
  o.push("  shape: 'array' | 'object';");
  o.push('}');
  o.push('export const FIXTURE_FILES: readonly FixtureFile[] = [');
  for (const e of ENTITIES) o.push(`  { name: ${lit(e.table)}, file: ${lit(`${e.table}.json`)}, entity: ${lit(e.name)}, owner: ${lit(e.owner)}, shape: ${lit(e.shape ?? 'array')} },`);
  o.push('];\n');
  o.push('/** Entity name -> id prefix ("usr", "cr", "bnty" ...). Ids are <prefix>_<slug-or-number>. */');
  o.push(`export const ID_PREFIXES = ${JSON.stringify(ID_PREFIXES, null, 2)} as const;`);
  o.push('/** Entity name -> fixture table (file name). */');
  o.push(`export const ENTITY_TABLES = ${JSON.stringify(Object.fromEntries(ENTITIES.map((e) => [e.name, e.table])), null, 2)} as const;\n`);

  // constants
  o.push('// ── CONSTANTS: every number the product depends on (DECISIONS.md); never hard-code them elsewhere ──');
  o.push(`export const CONSTANTS = ${JSON.stringify(CONSTANTS, null, 2)} as const;`);
  o.push('export type Constants = typeof CONSTANTS;\n');

  // reason codes
  o.push('// ── reason codes and state machines ──────────────────────────────────────────────────────────');
  o.push("export interface ReasonCodeInfo {\n  /** Whether the code may be used to request changes, to reject, or both ('admin' = Ops only). */\n  applies_to: 'both' | 'reject' | 'admin';\n  category: FeedbackCategory;\n  /** The QA check that usually detects it, if any. */\n  qa_check: QaCheckType | null;\n  /** Calm copy shown to the creator: about the video, never the person. */\n  creator_copy: string;\n  fix_hint: string;\n}");
  o.push(`export const REASON_CODE_INFO: Record<ReasonCode, ReasonCodeInfo> = ${JSON.stringify(REASON_CODE_INFO, null, 2)};`);
  o.push('export interface Transition {\n  from: string | null;\n  to: string;\n  actors: ActorKind[];\n  trigger: string;\n  guard: string;\n}');
  o.push('export interface StateMachine {\n  name: string;\n  /** The enum whose values are the states. */\n  enum: string;\n  initial: string;\n  terminal: string[];\n  doc: string;\n  transitions: Transition[];\n}');
  o.push(`export const STATE_MACHINES: StateMachine[] = ${JSON.stringify(STATE_MACHINES, null, 2)};`);
  o.push(`/** Allowed targets from a state for an actor (use null as \`from\` for creation). */
export function transitionsFrom(machine: string, from: string | null, actor?: ActorKind): Transition[] {
  const sm = STATE_MACHINES.find((m) => m.name === machine);
  if (!sm) return [];
  return sm.transitions.filter((t) => t.from === from && (actor === undefined || t.actors.includes(actor)));
}
export function canTransition(machine: string, from: string | null, to: string, actor: ActorKind): boolean {
  return transitionsFrom(machine, from, actor).some((t) => t.to === to);
}
`);
  return `${o.join('\n')}\n`;
}

// ── DOMAIN.md blocks ─────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (headers, rows) => `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}\n`;
const code = (s) => `\`${s}\``;
const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');

const ID_EXAMPLES = {
  World: 'world_flowd', User: 'usr_maya', Creator: 'cr_maya', SocialAccount: 'sa_maya_tiktok', RateCard: 'rate_maya', Brand: 'br_lumi', BrandMember: 'bm_lumi_jordan',
  App: 'app_lumi', Bounty: 'bnty_lumi_glowup', Submission: 'sub_0412', VideoAnalysis: 'va_0412_v2', Post: 'post_0307', ViewSnapshot: 'vsn_0307_012', Conversion: 'conv_00914',
  AttributionLink: 'lnk_maya_lumi7', Ad: 'ad_003', LedgerEntry: 'ledg_004217', Payout: 'pay_0188', Invoice: 'inv_0042', MoneyClockRow: 'mc_0211', MarketSeriesPoint: 'mkt_ai_photo_2026-10-03',
  BrandScorecard: 'bsc_lumi', CreatorReputation: 'rep_maya', Offer: 'offer_0014', Auction: 'auc_003', Spec: 'spec_011', RightsGrant: 'rg_0031', DailyDrop: 'drop_2026-10-03',
  Tournament: 'tour_hookbattle_05', TournamentEntry: 'tent_0044', Crew: 'crew_late_night_edits', CrewMember: 'cmem_0012', Streak: 'stk_maya', Leaderboard: 'lb_2026-w40_cohort_silver_ai_tools_earnings',
  Referral: 'ref_0009', Lesson: 'lsn_contract_red_flags', LessonProgress: 'lsp_0088', Trend: 'trend_007', Format: 'tmpl_screen_reaction', Hook: 'hook_confession_03', TierEvent: 'tev_0054',
  Wrapped: 'wrap_maya_2026-09', Proof: 'prf_k3x9m2qa', BountySave: 'save_0031', WellbeingSettings: 'wb_maya', NotificationPrefs: 'npref_maya', CaseStudy: 'case_03', Testimonial: 'tst_02',
  ChangelogEntry: 'chg_012', FeedbackNote: 'note_0233', Dispute: 'disp_007', ScamReport: 'scam_011', FraudFlag: 'flag_006', Verification: 'ver_021', TaxProfile: 'taxp_maya', TaxDoc: 'taxd_maya_w9',
  ComplianceAudit: 'cc_0307', PayoutRun: 'run_2026-10-02', Notification: 'ntf_0412', Integration: 'intg_lumi_revenuecat', ApiKey: 'key_lumi_live', Webhook: 'whk_lumi_01', ActivityEntry: 'act_0098',
  AutoApproveRule: 'rule_lumi_organic', TestPlan: 'tplan_lumi_01', FatigueAlert: 'fat_002', AuditReport: 'aud_lumi', FloSuggestion: 'flo_0031', MlModel: 'mdl_fraud', ChatThread: 'thr_0019',
  RevenueCatEvent: 'rce_000814', OfferCode: 'occ_lumi_007', BrandList: 'list_lumi_favourites',
};

function blockEnums() {
  const out = [];
  const groups = sortGroups([...new Set(ENUMS.map((e) => e.group))]);
  out.push(`${ENUMS.length} enumerations in ${groups.length} groups. Each is a lowercase snake string (or a single letter for ScoreBand, ISO code for Country). The generated const array and the label/tone map for each are in \`types.ts\` (\`TIERS\`, \`BOUNTY_STATUSES\`, \`BOUNTY_STATUS_META\` ...; all maps are also in \`STATUS_META\`).\n`);
  out.push('**Colour tones** (semantic; map to design tokens in `packages/tokens`):\n');
  out.push(table(['Tone', 'Token', 'Tailwind', 'Use'], [
    ['neutral', '--fd-fg-muted', 'text-fg-muted / bg-surface-hover', 'Inert, informational, closed or finished states.'],
    ['accent', '--fd-accent', 'text-accent / bg-accent-soft', 'Primary, in motion, selected, active work.'],
    ['violet', '--fd-violet', 'text-violet / bg-violet-soft', 'Flo, models, modelled or estimated figures.'],
    ['info', '--fd-info', 'text-info / bg-info-soft', 'Pending, informational, clock-driven (lagoon).'],
    ['mint', '--fd-mint', 'text-mint / bg-mint-soft', 'Money earned, success, verified, funded. Creators only see mint for money; brand surfaces use neutral ink + arrows for deltas.'],
    ['ember', '--fd-ember', 'text-ember / bg-ember-soft', 'Urgency, warning, Daily Drop, needs attention.'],
    ['sun', '--fd-sun', 'text-sun / bg-sun-soft', 'Featured, Gold and Elite, premium.'],
    ['rose', '--fd-rose', 'text-rose / bg-rose-soft', 'Alerts, rejected, destructive, blocking.'],
  ]));
  out.push('\n**Index of enumerations** (details below):\n');
  out.push(table(['Enum', 'Group', 'Values'], ENUMS.map((e) => [code(e.name), e.group, e.values.map((v) => code(v.value)).join(', ')])));
  for (const g of groups) {
    out.push(`\n### ${g}\n`);
    for (const en of ENUMS.filter((e) => e.group === g)) {
      out.push(`#### ${en.name}\n`);
      out.push(`${en.doc} Const: ${code(enumConst(en.name))}, labels: ${code(metaConst(en.name))}.\n`);
      out.push(table(['Value', 'UI label', 'Colour', 'Meaning'], en.values.map((v) => [code(v.value), v.label, v.tone, v.meaning])));
    }
  }
  return out.join('\n');
}

function fieldRows(def) {
  return def.fields.map((f) => [code(f.name), describeType(f.type) + (f.keys ? ` (keys: ${f.keys})` : ''), f.required ? 'yes' : 'no', f.doc]);
}
function blockValueTypes() {
  const out = [`${VALUE_TYPES.length} nested value types. They have no id and no file of their own; they appear inside entities.\n`];
  for (const v of VALUE_TYPES) {
    out.push(`#### ${v.name}\n`);
    out.push(`${v.doc}\n`);
    out.push(table(['Field', 'Type', 'Req', 'Notes'], fieldRows(v)));
  }
  return out.join('\n');
}
function blockEntities() {
  const out = [];
  const catalog = fixtureCatalogue();
  const byTable = new Map(catalog.map((c) => [c.table, c]));
  const groups = sortGroups([...new Set(ENTITIES.map((e) => e.group))]);
  out.push(`${ENTITIES.length} entities, each one fixture file (${ENTITIES.filter((e) => e.owner === 'core').length} core, ${ENTITIES.filter((e) => e.owner === 'ext').length} ext). Field types: ${code('-> table')} is a foreign key (a string id, validated); ${code('enum X')} an enumeration; a bare name is a nested value type; ${code('[]')} an array. Optional fields are omitted when empty, never null.\n`);
  const firstSentence = (t) => {
    const m = t.match(/^(.*?[.!?])(\s|$)/);
    const first = m ? m[1] : t;
    return first.length > 150 ? `${first.slice(0, 147)}...` : first;
  };
  out.push('**Index of entities**:\n');
  out.push(table(['Entity', 'File', 'Owner', 'Group', 'Id prefix', 'What it is'], ENTITIES.map((e) => [e.name, code(`${e.table}.json`), e.owner, e.group, e.prefix && e.fields.some((f) => f.name === 'id') ? code(`${e.prefix}_`) : '-', firstSentence(e.doc)])));
  out.push('\n**Relationship map** (arrow = holds a foreign key to):\n');
  const edges = [];
  for (const c of catalog) {
    const to = [...new Set(c.refs.map((r) => r.table))].filter((t) => t !== c.table);
    if (to.length) edges.push([c.table, to.join(', ')]);
  }
  out.push(table(['Table', 'References'], edges.map(([a, b]) => [code(a), b.split(', ').map(code).join(', ')])));
  for (const g of groups) {
    out.push(`\n### ${g}\n`);
    for (const e of ENTITIES.filter((x) => x.group === g)) {
      const c = byTable.get(e.table);
      out.push(`#### ${e.name} (${code(e.table)})\n`);
      out.push(`${e.doc}\n`);
      const key = e.key ? `Key: ${e.key.map(code).join(' + ')}. ` : '';
      out.push(`${key}Id prefix: ${e.prefix && e.fields.some((f) => f.name === 'id') ? code(`${e.prefix}_`) : 'none'}. Fixture: ${code(`${e.table}.json`)} (${c.shape}, owner ${e.owner}).\n`);
      out.push(table(['Field', 'Type', 'Req', 'Notes'], fieldRows(e)));
      const refs = [...new Set(c.refs.map((r) => `${r.path} -> ${r.table}`))];
      if (c.referencedBy.length) out.push(`Referenced by: ${c.referencedBy.map(code).join(', ')}.\n`);
      if (refs.length > 0 && refs.length <= 14) out.push(`References: ${refs.map(code).join(', ')}.\n`);
    }
  }
  return out.join('\n');
}
function blockStateMachines() {
  const out = [`${STATE_MACHINES.length} state machines. Each transition lists who triggers it (${code('creator')}, ${code('brand')}, ${code('admin')}, ${code('system')}). ${code('(create)')} means the row is created in that state. Anything not listed is not allowed (the mock API returns ${code('409 conflict')}).\n`];
  for (const sm of STATE_MACHINES) {
    out.push(`#### ${sm.name} (${code(sm.enum)})\n`);
    out.push(`${sm.doc}\n`);
    out.push(`Initial: ${code(sm.initial)}. Terminal: ${sm.terminal.length ? sm.terminal.map(code).join(', ') : 'none (can cycle)'}.\n`);
    out.push(table(['From', 'To', 'Actor', 'Trigger', 'Guard'], sm.transitions.map((t) => [t.from === null ? '(create)' : code(t.from), code(t.to), t.actors.join(' / '), t.trigger, t.guard])));
    // compact diagram line
    const states = ENUM_BY_NAME.get(sm.enum).values.map((v) => v.value);
    const happy = [sm.initial];
    const seen = new Set(happy);
    let cur = sm.initial;
    for (let i = 0; i < 12; i++) {
      const next = sm.transitions.find((t) => t.from === cur && !seen.has(t.to) && !['cancelled', 'rejected', 'withdrawn', 'declined', 'expired', 'failed', 'removed', 'clawed_back', 'reversed', 'killed', 'dismissed'].includes(t.to));
      if (!next) break;
      happy.push(next.to); seen.add(next.to); cur = next.to;
    }
    out.push(`Main path: ${happy.map(code).join(' -> ')}. States: ${states.map(code).join(', ')}.\n`);
  }
  return out.join('\n');
}
const flat = (obj, prefix = '') => {
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(...flat(v, p));
    else rows.push([p, v]);
  }
  return rows;
};
const showVal = (path, v) => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'number' && /cents/.test(path)) return `${v} (${`$${(v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`})`;
  if (typeof v === 'number' && /(rate|ratio|share|pct)/.test(path) && v <= 1) return `${v} (${Math.round(v * 1000) / 10}%)`;
  return String(v);
};
function blockConstants() {
  const out = [`CONSTANTS is the single place every number lives. It is exported from ${code('types.ts')} (${code('CONSTANTS')}), mirrored in ${code('apps/web/src/lib/engine/constants.ts')} and iOS ${code('Core/Engine/Constants.swift')}. Money is integer cents; ratios are 0..1; durations carry their unit in the name. Source tags: ${code('DECISIONS')} = fixed by docs/DECISIONS.md; ${code('CONTRACT')} = a contract-defined default to be tested with design partners.\n`];
  for (const [section, value] of Object.entries(CONSTANTS)) {
    out.push(`#### ${section}\n`);
    const notes = CONSTANT_NOTES.filter((n) => n.path === section || n.path.startsWith(`${section}.`));
    for (const n of notes) out.push(`- **${n.path}** (${n.source}): ${n.note}`);
    if (notes.length) out.push('');
    if (typeof value !== 'object') { out.push(`${code(section)} = ${code(value)}\n`); continue; }
    if (Array.isArray(value)) {
      out.push(table(['Item'], value.map((x) => [typeof x === 'object' ? JSON.stringify(x) : String(x)])));
      continue;
    }
    out.push(table(['Path', 'Value'], flat(value, section).map(([p, v]) => [code(p), showVal(p, v)])));
  }
  return out.join('\n');
}
function blockFormulas() {
  const out = [`${FORMULA_DOCS.length} formulas. The executable reference implementation is ${code('packages/contract/schema/formulas.mjs')} (pure functions); every example below is computed from it, so the numbers cannot drift. Rounding is half-up per ledger leg unless stated. Test vectors are in ${code('packages/contract/formula-vectors.json')}.\n`];
  for (const f of FORMULA_DOCS) {
    out.push(`#### ${f.title}\n`);
    for (const r of f.rules) out.push(`- ${r}`);
    out.push('');
    for (const ex of f.examples()) {
      out.push(`**Worked example: ${ex.title}**\n`);
      out.push(table(['Step', 'Calculation', 'Result'], ex.rows.map((r) => [r.label, r.expr, r.value])));
    }
  }
  return out.join('\n');
}
function blockReasonCodes() {
  const rows = ENUM_BY_NAME.get('ReasonCode').values.map((v) => {
    const i = REASON_CODE_INFO[v.value];
    return [code(v.value), v.label, i.applies_to, i.category, i.qa_check ? code(i.qa_check) : '-', i.creator_copy, i.fix_hint];
  });
  return `Reason codes explain why a video was not approved. They are always about the video, never the person. Rejection needs a code AND evidence (a timecode, a QA check, a quoted brief requirement or a transcript line). Request-changes needs a code and at least one must-fix timecoded note.\n\n${table(['Code', 'UI label', 'Applies to', 'Note category', 'QA check', 'Creator copy', 'Fix hint'], rows)}`;
}
function blockFixtures() {
  const cat = fixtureCatalogue();
  const out = [];
  const total = cat.length;
  const core = cat.filter((c) => c.owner === 'core');
  const ext = cat.filter((c) => c.owner === 'ext');
  out.push(`${total} fixture files in ${code('packages/contract/fixtures/')} (${core.length} core, ${ext.length} ext). Generated by ${code('node packages/contract/scripts/generate-fixtures.mjs')} (seed ${WORLD.WORLD_SEED}); never hand-edited. Key order within every row follows the schema field order; one compact JSON row per line (single-object files are 2-space indented); arrays sorted as stated. ${code('npm run sync')} copies them to ${code('apps/web/src/data/fixtures')} and ${code('apps/ios/Flowd/Resources/Fixtures')}. Total target size under 14 MB, no single file over 3.5 MB.\n`);
  const sizeRow = (c) => [code(`${c.table}.json`), c.owner, c.shape, c.entity.name, `${c.meta.count.target} (${c.meta.count.min}-${c.meta.count.max})`];
  out.push(table(['File', 'Owner', 'Shape', 'Entity', 'Rows (min-max)'], cat.map(sizeRow)));
  for (const owner of ['core', 'ext']) {
    out.push(`\n### ${owner === 'core' ? 'Core fixtures (identity and the marketplace money graph)' : 'Ext fixtures (everything else)'}\n`);
    for (const c of cat.filter((x) => x.owner === owner)) {
      const fields = c.entity.fields.map((f) => `${f.name}${f.required ? '' : '?'}`).join(', ');
      const refTables = [...new Set(c.refs.map((r) => r.table))].filter((t) => t !== c.table).sort();
      out.push(`#### ${c.table}.json\n`);
      out.push(`- **Path** ${code(c.file)}; **shape** ${c.shape === 'object' ? 'one object' : `array of ${c.entity.name}`}; **owner** ${c.owner}; **rows** ${c.meta.count.target} (min ${c.meta.count.min}, max ${c.meta.count.max}); **order** ${c.meta.order}.`);
      out.push(`- **Fields** (${c.entity.fields.length}, ${code('?')} = optional): ${fields}.`);
      out.push(`- **Cross-references** ${refTables.length ? refTables.map(code).join(', ') : 'none'}; **referenced by** ${c.referencedBy.length ? c.referencedBy.map(code).join(', ') : 'none'}.`);
      out.push(`- **Notes** ${c.meta.notes}\n`);
    }
  }
  return out.join('\n');
}
function blockInvariants() {
  const out = [`The validator ${code('packages/contract/scripts/validate-fixtures.mjs')} enforces every invariant marked ${code('base')}; invariants marked ${code('fixture')} are enforced by the fixture agents (extend the validator when the data exists). ${code('--strict')} turns warnings into errors.\n`];
  const groups = [...new Set(WORLD.INVARIANTS.map((i) => i.group))];
  for (const g of groups) {
    out.push(`#### ${g}\n`);
    out.push(table(['Id', 'Enforced', 'Invariant'], WORLD.INVARIANTS.filter((i) => i.group === g).map((i) => [code(i.id), i.check, i.text])));
  }
  return out.join('\n');
}
function blockScenarios() {
  return `${table(['Scenario', 'Who', 'What the data must show'], WORLD.SCENARIOS.map((s) => [code(s.id), code(s.who), s.text]))}`;
}
function blockWorld() {
  const P = WORLD.PERSONAS;
  const F = WORLD.PERSONA_FACTS;
  const out = [];
  out.push('**Personas** (ids are fixed; everything else about them is in the fixtures):\n');
  out.push(table(['Role', 'Display name', 'Ids', 'Who'], [
    ['Creator', P.creator.display_name, `${code(P.creator.user_id)}, ${code(P.creator.creator_id)}, @${P.creator.handle}`, P.creator.summary],
    ['Brand member', P.brand.display_name, `${code(P.brand.user_id)}, ${code(P.brand.member_id)}, ${code(P.brand.brand_id)}, ${code(P.brand.app_id)}`, P.brand.summary],
    ['Admin', P.admin.display_name, `${code(P.admin.user_id)}, ${P.admin.email}`, P.admin.summary],
  ]));
  out.push('\n**Maya (cr_maya) hard facts** (invariant P-01):\n');
  out.push(table(['Fact', 'Value'], flat(F.maya).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])));
  out.push('\n**Lumi (br_lumi) hard facts** (invariant P-02):\n');
  out.push(table(['Fact', 'Value'], flat(F.lumi).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v)])));
  out.push('\n**Scale**:\n');
  out.push(table(['Key', 'Target', 'Note'], WORLD.SCALE.map((s) => [code(s.key), String(s.target), s.note])));
  out.push(`\n**Creator tier distribution** (total 90): ${Object.entries(WORLD.TIER_DISTRIBUTION).filter(([k]) => k !== 'note').map(([k, v]) => `${k} ${v}`).join(', ')}. ${WORLD.TIER_DISTRIBUTION.note}\n`);
  out.push(`**Apps per category** (24): ${Object.entries(WORLD.CATEGORY_MIX).filter(([k]) => k !== 'note').map(([k, v]) => `${k} ${v}`).join(', ')}.\n`);
  out.push('**Status mixes** (approximate; fixture agents hit these within a few percent):\n');
  for (const [k, v] of Object.entries(WORLD.STATUS_MIX)) out.push(`- **${k}**: ${Object.entries(v).filter(([n]) => n !== 'note').map(([n, c]) => `${n} ${c}`).join(', ')}. ${v.note}`);
  out.push(`\n**Activity ramp**: ${WORLD.ACTIVITY_RAMP.weekly_share.map((s) => `${Math.round(s * 100)}%`).join(', ')} of submissions in weeks 1-13 since launch. ${WORLD.ACTIVITY_RAMP.note}\n`);
  out.push('**Day-90 target storyline** (admin control tower):\n');
  out.push(table(['Target', 'Actual', 'Status'], WORLD.TARGET_STORY.map((t) => [code(t.id), String(t.actual), t.status])));
  out.push('\n**Persona notes**:\n');
  for (const n of WORLD.PERSONA_NOTES) out.push(`- ${n}`);
  return out.join('\n');
}
function blockApi() {
  const out = [];
  out.push(API_CONVENTIONS.map((c) => `- **${c.title}.** ${c.body}`).join('\n'));
  out.push('');
  const total = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);
  out.push(`\n${total} endpoints in ${API_GROUPS.length} groups. Roles: ${code('public')}, ${code('creator')}, ${code('brand')}, ${code('admin')}, ${code('any')} (signed in). ${API_TYPES_NOTE}\n`);
  for (const g of API_GROUPS) {
    out.push(`#### ${g.title}\n`);
    out.push(`${g.note}\n`);
    out.push(table(['Verb', 'Path', 'Who', 'What', 'Returns', 'Errors'], g.endpoints.map((e) => [e.m, code(`/api/v1${e.p}`), e.who, e.summary, e.res, e.errs.join(', ')])));
  }
  return out.join('\n');
}
function blockIdPrefixes() {
  const rows = ENTITIES.filter((e) => e.fields.some((f) => f.name === 'id') && e.prefix).map((e) => [code(`${e.prefix}_`), e.name, code(e.table), code(ID_EXAMPLES[e.name] ?? `${e.prefix}_001`)]);
  return table(['Prefix', 'Entity', 'Fixture', 'Example id'], rows);
}
function blockLint() {
  const L = CONSTANTS.lint;
  const rows = ENUM_BY_NAME.get('BriefLintCode').values.map((v) => [code(v.value), v.label, L.rules[v.value].severity, L.rules[v.value].trigger, L.rules[v.value].fix]);
  const thresholds = Object.entries(L.thresholds).map(([k, v]) => `${k} = ${v}`).join(', ');
  return `Brief Lint runs on every draft (client and server share this ruleset, ${code('CONSTANTS.lint')}). A bounty with a blocker cannot be published; warnings and tips are shown with the fix. Thresholds: ${thresholds}.\n\n${table(['Code', 'Rule', 'Severity', 'Triggers when', 'Fix'], rows)}`;
}
function blockScoreItems() {
  const rows = [];
  for (const [list, name] of [[CONSTANTS.scores.hook_checklist, 'Hook Score'], [CONSTANTS.scores.flow_checklist, 'Flow Score']]) {
    for (const i of list) rows.push([name, code(i.id), i.label, String(i.weight), i.rule]);
  }
  return `Both scores are checklist scores: "${CONSTANTS.scores.checklist_label}" Bands: A ${CONSTANTS.scores.bands.A}+, B ${CONSTANTS.scores.bands.B}-${CONSTANTS.scores.bands.A - 1}, C ${CONSTANTS.scores.bands.C}-${CONSTANTS.scores.bands.B - 1}, D ${CONSTANTS.scores.bands.D}-${CONSTANTS.scores.bands.C - 1}, E under ${CONSTANTS.scores.bands.D}.\n\n${table(['Score', 'Item', 'Checklist line', 'Weight', 'Rule'], rows)}`;
}
function blockFraudSignals() {
  const rows = Object.entries(CONSTANTS.fraud.signals).map(([k, s]) => [code(k), String(s.max_points), s.rule]);
  return `Fraud score = min(100, sum of round(max_points x severity) over fired signals). Bands: clean ${CONSTANTS.fraud.bands.clean.join('-')}, watch ${CONSTANTS.fraud.bands.watch.join('-')}, review ${CONSTANTS.fraud.bands.review.join('-')}, high ${CONSTANTS.fraud.bands.high.join('-')}.\n\n${table(['Signal', 'Max points', 'Rule'], rows)}`;
}
function blockTiers() {
  const T = CONSTANTS.tiers;
  const rows = T.order.map((t) => {
    const th = T.thresholds[t];
    const p = T.perks[t];
    return [t, `$${(th.lifetime_cleared_cents / 100).toLocaleString('en-US')}`, String(th.approved_count), `${Math.round(th.approval_rate_min * 100)}%`, th.reliability_min ? String(th.reliability_min) : '-', th.manual_review ? 'yes' : '-',
      p.early_access_hours ? `${p.early_access_hours} h` : '-', p.rate_card ? 'yes' : '-', p.instant_cashout_unlimited ? 'unlimited' : p.instant_cashout_free_per_week ? `${p.instant_cashout_free_per_week} / week` : '-', p.crews_lead ? 'yes' : '-', p.auctions ? 'yes' : '-', p.featured_profile ? 'yes' : '-'];
  });
  return table(['Tier', 'Lifetime cleared', 'Approved', 'Approval', 'Reliability', 'Manual review', 'Early access', 'Rate card', 'Free instant', 'Crews lead', 'Auctions', 'Featured'], rows)
    + `\nNo tier drop for ${T.demotion_grace_days} days after a dip (grace hold). Founding creators' verified prior history counts toward the thresholds.\n`;
}
function blockPlans() {
  const P = CONSTANTS.plans;
  const feat = (p) => P[p].features.length;
  const rows = Object.entries(P).map(([k, p]) => [k, p.label, p.price_cents_month ? `$${(p.price_cents_month / 100).toLocaleString('en-US')}/mo` : '$0', `${Math.round(p.take_rate * 100)}%`, String(feat(k)), p.features.join(', ')]);
  return table(['Plan', 'Label', 'Price', 'Take rate', '# features', 'Features (PlanFeature keys)'], rows)
    + `\nCPA-only and install-only bounties: flat ${CONSTANTS.fees.cpa_only_take_rate * 100}%, taken only from cleared conversions. First bounty: fee waived and matched budget up to $${CONSTANTS.fees.matched_first_bounty_cap_cents / 100}. Winner promotion: ${CONSTANTS.fees.ad_spend_fee_rate * 100}% of ad spend. Creators always free. Weekly payout free; instant ${CONSTANTS.fees.instant_payout_rate * 100}% (min ${(CONSTANTS.fees.instant_payout_min_cents / 100).toFixed(2)}, max ${(CONSTANTS.fees.instant_payout_max_cents / 100).toFixed(2)}).\n`;
}

function blockGolden() {
  const rows = [];
  const add = (txn, step, account, amount, type, status = 'cleared') => rows.push([code(txn), step, code(account), F.usd(amount), type, status]);
  const f = F.funding({ budget_cents: 300_000, take_rate: 0.10 });
  add('txn_g01', 'Lumi tops up the wallet by card', 'external:card', -f.card_charge_cents, 'wallet_topup');
  add('txn_g01', '', 'wallet:br_lumi', f.escrow_total_cents, 'wallet_topup');
  add('txn_g01', '', 'platform:processing', f.processing_cents, 'processing');
  add('txn_g02', 'Lumi funds the bounty: $3,000.00 pool + $300.00 fee reserve (Funded badge, goes live)', 'wallet:br_lumi', -f.escrow_total_cents, 'escrow_fund');
  add('txn_g02', '', 'escrow:bnty_lumi_glowup', f.escrow_total_cents, 'escrow_fund');
  const unit = F.reservationUnit({ per_video_cap_cents: 25_000, take_rate: 0.10 });
  const cpm = F.settlePost({ window_views: 31_400, cpm_cents: 210, per_video_cap_cents: 25_000, take_rate: 0.10 });
  add('txn_g03', 'CPM leg at clearing: 31,400 verified views x $2.10 (reserved slot of ' + F.usd(unit) + ' released)', 'escrow:bnty_lumi_glowup', -(cpm.cpm_pay_cents + cpm.fee_cpm_cents), 'cpm');
  add('txn_g03', '', 'creator:cr_maya', cpm.cpm_pay_cents, 'cpm', 'pending -> cleared -> paid');
  add('txn_g03', '', 'platform:fees', cpm.fee_cpm_cents, 'fee');
  const batches = [['7 installs through the link', 7, 40, 'txn_g04'], ['2 installs through the code', 2, 40, 'txn_g05'], ['2 trials through the link', 2, 150, 'txn_g06'], ['1 paid through the code', 1, 400, 'txn_g07']];
  let paySum = cpm.cpm_pay_cents;
  let feeSum = cpm.fee_cpm_cents;
  for (const [label, q, rate, txn] of batches) {
    const pay = q * rate;
    const fee = F.mulRate(pay, 0.10);
    paySum += pay; feeSum += fee;
    add(txn, 'CPA leg: ' + label, 'escrow:bnty_lumi_glowup', -(pay + fee), 'cpa');
    add(txn, '', 'creator:cr_maya', pay, 'cpa', 'pending -> cleared -> paid');
    add(txn, '', 'platform:fees', fee, 'fee');
  }
  add('txn_g08', 'Friday 18:00Z weekly payout of the cleared earnings (free)', 'creator:cr_maya', -paySum, 'payout', 'paid');
  add('txn_g08', '', 'external:bank', paySum, 'payout', 'paid');
  const ip = F.instantPayout({ amount_cents: 16_000, tier: 'silver' });
  add('txn_g09', 'Maya cashes out $160.00 instantly (Silver): fee 1.5%, shown first', 'creator:cr_maya', -16_000, 'payout', 'paid');
  add('txn_g09', '', 'external:bank', ip.net_cents, 'payout', 'paid');
  add('txn_g09', '', 'platform:fees', ip.fee_cents, 'payout_fee');
  const com = F.adCommission({ revenue_in_window_cents: 31 * 3499 });
  add('txn_g10', 'Winner promotion: 10% commission on $1,084.69 of ad-attributed revenue (60-day window)', 'wallet:br_lumi', -com, 'commission');
  add('txn_g10', '', 'creator:cr_maya', com, 'commission', 'pending -> cleared -> paid');
  const adf = F.adPlatformFee(120_000);
  add('txn_g11', 'Winner promotion: 1% platform fee on $1,200.00 ad spend', 'wallet:br_lumi', -adf, 'ad_fee');
  add('txn_g11', '', 'platform:fees', adf, 'ad_fee');
  add('txn_g12', 'Clawback of a proven-fraud post (pay $40.00 + fee $4.00); reverses_txn_id = the original', 'creator:cr_other', -4_000, 'clawback', 'reversed');
  add('txn_g12', '', 'platform:fees', -400, 'clawback');
  add('txn_g12', '', 'wallet:br_lumi', 4_400, 'clawback');
  const refund = f.escrow_total_cents - 248_640 - 24_864;
  add('txn_g13', 'Settlement: after $2,486.40 pay and $248.64 fees were settled, the rest returns', 'escrow:bnty_lumi_glowup', -refund, 'escrow_refund');
  add('txn_g13', '', 'wallet:br_lumi', refund, 'escrow_refund');
  const intro = `The life of money in one bounty, computed from the formulas (every row is a ledger leg; every transaction nets to zero). Pro plan (10%), $3,000.00 pool, $2.10 CPM with $0.40 / $1.50 / $4.00 CPA, $250.00 cap. The walk-through post by @maya.makes earns ${F.usd(paySum)} of pool pay and Lumi pays ${F.usd(feeSum)} in fees, so its brand cost is ${F.usd(paySum + feeSum)}. A post that clears in several conversion batches rounds the fee per batch transaction (per ledger leg), so a post's fee can differ by a cent or two from the fee on its total.`;
  return `${intro}\n\n${table(['Txn', 'Step', 'Account', 'Amount', 'Type', 'Status'], rows)}`;
}

const BLOCKS = {
  idprefixes: blockIdPrefixes, enums: blockEnums, 'value-types': blockValueTypes, entities: blockEntities, 'state-machines': blockStateMachines,
  constants: blockConstants, plans: blockPlans, tiers: blockTiers, formulas: blockFormulas, 'reason-codes': blockReasonCodes, lint: blockLint,
  'score-items': blockScoreItems, 'fraud-signals': blockFraudSignals, fixtures: blockFixtures, invariants: blockInvariants, scenarios: blockScenarios,
  world: blockWorld, api: blockApi, golden: blockGolden,
};

function buildDomain(existing) {
  let out = existing;
  const missing = [];
  for (const [name, fn] of Object.entries(BLOCKS)) {
    const re = new RegExp(`(<!-- GENERATED:${name} -->)[\\s\\S]*?(<!-- /GENERATED:${name} -->)`);
    if (!re.test(out)) { missing.push(name); continue; }
    const body = fn().trimEnd();
    out = out.replace(re, (_m, a, b) => `${a}\n${body}\n${b}`);
  }
  if (missing.length) {
    console.error(`DOMAIN.md is missing generated block markers: ${missing.join(', ')}`);
    process.exit(1);
  }
  const stray = [...out.matchAll(/<!-- GENERATED:([a-z-]+) -->/g)].map((m) => m[1]).filter((n) => !BLOCKS[n]);
  if (stray.length) { console.error(`DOMAIN.md has unknown generated blocks: ${stray.join(', ')}`); process.exit(1); }
  return out;
}

// ── formula test vectors (for engine parity tests on web and iOS) ─────────────────────────────────
async function buildVectors() {
  const F = await import('../schema/formulas.mjs');
  const vectors = {
    contract_version: WORLD.CONTRACT_VERSION,
    note: 'Inputs and expected outputs of the reference formulas (schema/formulas.mjs). Engines on web (Vitest) and iOS (FlowdTests) must reproduce every case.',
    funding: [
      { in: { budget_cents: 500_000, take_rate: 0.12 }, out: F.funding({ budget_cents: 500_000, take_rate: 0.12 }) },
      { in: { budget_cents: 300_000, take_rate: 0.10 }, out: F.funding({ budget_cents: 300_000, take_rate: 0.10 }) },
      { in: { budget_cents: 120_000, take_rate: 0.06 }, out: F.funding({ budget_cents: 120_000, take_rate: 0.06 }) },
      { in: { brand_funds_cents: 150_000 }, out: F.firstBountyFunding({ brand_funds_cents: 150_000 }) },
      { in: { brand_funds_cents: 30_000 }, out: F.firstBountyFunding({ brand_funds_cents: 30_000 }) },
    ],
    settle_post: [
      { views: 48_200, cpm: 200, conv: { install: 14, trial: 6, paid: 2 }, rates: { install: 40, trial: 150, paid: 400 }, cap: 25_000, take_rate: 0.10 },
      { views: 150_000, cpm: 200, conv: { install: 40, trial: 10, paid: 3 }, rates: { install: 40, trial: 150, paid: 400 }, cap: 25_000, take_rate: 0.10 },
      { views: 9_999, cpm: 50, conv: {}, rates: {}, cap: 25_000, take_rate: 0.12 },
      { views: 12_345, cpm: 175, conv: { install: 3 }, rates: { install: 40 }, cap: 1_500, take_rate: 0.08 },
    ].map((c) => ({ in: c, out: F.settlePost({ window_views: c.views, cpm_cents: c.cpm, conversions: c.conv, rates: c.rates, per_video_cap_cents: c.cap, take_rate: c.take_rate }) })),
    instant_payout: [
      ['silver', 16_000, 0, false], ['silver', 2_000, 0, false], ['silver', 200_000, 0, false], ['gold', 16_000, 0, false], ['gold', 16_000, 1, false], ['platinum', 50_000, 3, false], ['bronze', 16_000, 0, true], ['silver', 499, 0, false],
    ].map(([tier, amount, used, founding]) => ({ in: { tier, amount_cents: amount, free_instant_used_this_week: used, founding_free: founding }, out: F.instantPayout({ amount_cents: amount, tier, free_instant_used_this_week: used, founding_free: founding }) })),
    expected_earnings: [
      { base_median_views: 14_200, cpm_cents: 210, rates: { install: 40, trial: 150, paid: 400 }, per_video_cap_cents: 25_000 },
      { base_median_views: 90_000, cpm_cents: 400, rates: {}, per_video_cap_cents: 25_000 },
    ].map((c) => ({ in: c, out: F.expectedEarnings(c) })),
    tier: [
      { lifetime_cleared_cents: 164_000, approved_count: 21, approval_rate: 0.78, reliability_score: 93, elite_reviewed: false },
      { lifetime_cleared_cents: 250_000, approved_count: 30, approval_rate: 0.8, reliability_score: 70, elite_reviewed: false },
      { lifetime_cleared_cents: 1_200_000, approved_count: 90, approval_rate: 0.82, reliability_score: 91, elite_reviewed: false },
      { lifetime_cleared_cents: 6_000_000, approved_count: 300, approval_rate: 0.9, reliability_score: 97, elite_reviewed: true },
      { lifetime_cleared_cents: 6_000_000, approved_count: 300, approval_rate: 0.9, reliability_score: 97, elite_reviewed: false },
    ].map((s) => ({ in: s, out: { tier: F.tierFor(s), progress: F.tierProgress(s) } })),
    fraud: [
      [{ signal: 'view_spike_no_engagement', severity: 0.8 }, { signal: 'bought_views_pattern', severity: 0.9 }, { signal: 'traffic_source_anomaly', severity: 0.7 }, { signal: 'curve_shape', severity: 0.6 }],
      [{ signal: 'new_account', severity: 1 }, { signal: 'engagement_anomaly', severity: 0.5 }],
      [],
    ].map((sig) => ({ in: sig, out: F.fraudScore(sig) })),
    hook_score: [
      { lands_ms: 2400, onscreen_ms: 900, spoken_matches_onscreen: true, face_ms: 300, faceless: false, app_ms: 2800, interrupt_ms: 1200, hook_type_known: true, hook_type_above_median: true, speech_ms: 400, captions_in_safe_zone: true },
      { lands_ms: 3600, onscreen_ms: null, spoken_matches_onscreen: false, face_ms: 3100, faceless: false, app_ms: 6200, interrupt_ms: null, hook_type_known: false, hook_type_above_median: false, speech_ms: 1700, captions_in_safe_zone: false },
    ].map((o) => ({ in: o, out: F.scoreHook(o) })),
    flow_score: [
      { hook_points: 90, beats_found: 4, beats_required: 5, app_ms: 2800, disclosure_audio: true, disclosure_onscreen: true, duration_s: 24, captions_in_safe_zone: true, single_cta: true, ends_on_win_state: true, audio_gaps: 0, format_order: 'in_order' },
      { hook_points: 34, beats_found: 2, beats_required: 5, app_ms: 9000, disclosure_audio: false, disclosure_onscreen: true, duration_s: 52, captions_in_safe_zone: false, single_cta: false, ends_on_win_state: false, audio_gaps: 3, format_order: 'out_of_order' },
    ].map((o) => ({ in: o, out: F.scoreFlow(o) })),
    money_clock: [
      '2026-09-29T21:00:00Z', '2026-09-30T09:00:00Z', '2026-10-02T18:30:00Z', '2026-10-03T13:59:00Z',
    ].map((posted_at) => ({ in: { posted_at, now: CONSTANTS.now }, out: F.moneyClockState({ posted_at, now: CONSTANTS.now }) })),
    conversion_clearing: [['install', '2026-10-02T09:00:00Z'], ['trial', '2026-10-01T08:15:00Z'], ['paid', '2026-09-28T20:00:00Z']].map(([kind, at]) => ({ in: { kind, occurred_at: at }, out: F.conversionClearingRun(kind, at) })),
    sla: [0, 47.99, 48, 72, 72.01].map((h) => ({ in: { hours: h }, out: F.slaState(h) })),
    brand_reliability: [
      { decisions_n: 64, approved_n: 49, decision_hours_median: 11.2, appeals_overturned: 1, pays_on_time_ratio: 0.99, run_rate: 0.93, reply_hours_median: 4.5 },
      { decisions_n: 22, approved_n: 9, decision_hours_median: 58, appeals_overturned: 3, pays_on_time_ratio: 0.8, run_rate: 0.5, reply_hours_median: 30 },
      { decisions_n: 6, approved_n: 6, decision_hours_median: 8, appeals_overturned: 0, pays_on_time_ratio: 1, run_rate: 1, reply_hours_median: 1 },
    ].map((i) => ({ in: i, out: F.brandReliability(i) })),
    price_curve: [{ clearing_cpm_cents: 240, median_fill_hours: 31, sample_n: 38 }, { clearing_cpm_cents: 170, median_fill_hours: 52, sample_n: 6 }].map((i) => ({ in: i, out: F.priceCurve(i) })),
    match_score: [
      { gates: { tier: true }, niche_overlap: 1, platform_fit: 1, region_fit: 1, price_ratio: 1.2, brand_reliability: 94, bounty_age_days: 2 },
      { gates: { tier: false }, niche_overlap: 1, platform_fit: 1, region_fit: 1, price_ratio: 1.2, brand_reliability: 94, bounty_age_days: 2 },
      { gates: { tier: true }, niche_overlap: 0.5, platform_fit: 1, region_fit: 0.6, price_ratio: 0.7, brand_reliability: 60, bounty_age_days: 20 },
    ].map((i) => ({ in: i, out: F.matchScore(i) })),
  };
  return `${JSON.stringify(vectors, null, 2)}\n`;
}

// ── write / check ─────────────────────────────────────────────────────────────────────────────
function writeOrCheck(file, content) {
  const abs = path.join(root, file);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (existing === content) { console.log(`  =  ${file} (unchanged)`); return false; }
  if (checkOnly) { console.log(`  !  ${file} is out of date`); return true; }
  fs.writeFileSync(abs, content);
  console.log(`  +  ${file} (${(content.length / 1024).toFixed(0)} KB)`);
  return false;
}

const domainPath = path.join(root, 'DOMAIN.md');
if (!fs.existsSync(domainPath)) { console.error('DOMAIN.md not found (it holds the hand-written prose and the block markers).'); process.exit(1); }
let stale = false;
stale = writeOrCheck('types.ts', buildTypes()) || stale;
stale = writeOrCheck('DOMAIN.md', buildDomain(fs.readFileSync(domainPath, 'utf8'))) || stale;
stale = writeOrCheck('formula-vectors.json', await buildVectors()) || stale;
console.log(`contract ${WORLD.CONTRACT_VERSION}: ${ENUMS.length} enums, ${VALUE_TYPES.length} value types, ${ENTITIES.length} entities, ${STATE_MACHINES.length} state machines, ${FORMULA_DOCS.length} formulas.`);
if (checkOnly && stale) process.exit(1);
