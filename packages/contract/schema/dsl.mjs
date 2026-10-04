// flowd contract DSL. The schema/*.mjs modules are the SINGLE SOURCE OF TRUTH for the domain contract.
//
//   schema/*.mjs  --(scripts/build-contract.mjs)-->  types.ts  +  generated blocks inside DOMAIN.md
//   schema/*.mjs  --(scripts/validate-fixtures.mjs)-->  structural fixture validation
//
// Never hand-edit types.ts or the <!-- BEGIN GENERATED --> blocks in DOMAIN.md. Edit the schema and run
//   node packages/contract/scripts/build-contract.mjs
//
// ── Field type grammar (strings) ────────────────────────────────────────────────────────────────
//   id                  this entity's own id (prefix is the entity's `prefix`)
//   string | text       short / long text
//   int | number        integer / any JSON number
//   bool
//   iso | date          ISO-8601 UTC timestamp "2026-10-03T14:00:00Z" / calendar day "2026-10-03"
//   cents               integer money in cents (field names end in _cents)
//   ratio | pct         0..1 float / 0..100 number (prefer ratio; pct only when the field name ends _pct)
//   hex                 "#RRGGBB"
//   url                 text URL (only joinflowd.io, platform domains, *.example)
//   json                opaque object (avoid; used only for third-party payload echoes)
//   art                 ArtSeed (generated imagery, never a remote image)
//   enum:Name           value of the enum Name
//   ref:table           foreign key to another fixture table (a string id, validated)
//   obj:Name            nested value type Name (see value-types.mjs)
//   map:<type>          string-keyed map whose values are <type> (e.g. map:ratio, map:int)
//   any of the above + "[]"   array
// Required fields must be present; optional fields are OMITTED when empty (never null).

export const TONES = ['neutral', 'accent', 'violet', 'info', 'mint', 'ember', 'sun', 'rose'];

/** enum value: (value, UI label, colour tone, plain-English meaning) */
export const ev = (value, label, tone, meaning) => ({ value, label, tone, meaning });

/** required field. extra: { keys: 'EnumName' } types the keys of a map field. */
export const req = (name, type, doc = '', extra = {}) => ({ name, type, required: true, doc, ...extra });
/** optional field (omitted when empty) */
export const opt = (name, type, doc = '', extra = {}) => ({ name, type, required: false, doc, ...extra });

/** Enum (group = DOMAIN.md section it is documented under). */
export const en = (name, group, doc, values) => ({ name, group, doc, values });

/** Entity (a fixture row type). `owner` = which fixture agent generates the file. */
export const entity = (name, prefix, doc, fields, extra = {}) => ({ name, prefix, doc, fields, ...extra });
/** Nested value type (no id, no table). */
export const value = (name, doc, fields) => ({ name, doc, fields });

/** Parse a field type string into a structured descriptor. */
export function parseType(raw) {
  let t = String(raw).trim();
  let array = false;
  if (t.endsWith('[]')) {
    array = true;
    t = t.slice(0, -2);
  }
  if (t.startsWith('map:')) return { kind: 'map', inner: parseType(t.slice(4)), array };
  if (t.startsWith('enum:')) return { kind: 'enum', name: t.slice(5), array };
  if (t.startsWith('ref:')) return { kind: 'ref', table: t.slice(4), array };
  if (t.startsWith('obj:')) return { kind: 'obj', name: t.slice(4), array };
  if (t === 'id') return { kind: 'id', array };
  if (t === 'art') return { kind: 'art', array };
  const prims = ['string', 'text', 'int', 'number', 'bool', 'iso', 'date', 'cents', 'ratio', 'pct', 'hex', 'url', 'json'];
  if (prims.includes(t)) return { kind: 'prim', name: t, array };
  throw new Error(`Unknown field type "${raw}"`);
}

/** Human description of a type for DOMAIN.md tables. */
export function describeType(raw) {
  const p = parseType(raw);
  const arr = p.array ? '[]' : '';
  switch (p.kind) {
    case 'id': return 'id' + arr;
    case 'art': return 'ArtSeed' + arr;
    case 'prim': return p.name + arr;
    case 'enum': return `enum ${p.name}` + arr;
    case 'ref': return `-> ${p.table}` + arr;
    case 'obj': return p.name + arr;
    case 'map': return `map<${describeType(raw.replace(/^map:/, '').replace(/\[\]$/, ''))}>` + arr;
    default: return raw;
  }
}
