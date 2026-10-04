// The contract's field-type grammar (packages/contract/schema/dsl.mjs) -> JSON Schema 2020-12 (OpenAPI 3.1), so every schema in openapi.yaml is
// derived from the same definitions as types.ts and the names match exactly.
//
//   id            -> $ref <Entity>Id
//   ref:table     -> $ref <Entity>Id of the entity stored in that table
//   enum:Name     -> $ref Name
//   obj:Name      -> $ref Name   (a value type, an entity or one of the API read models: they share the components namespace)
//   art           -> $ref ArtSeed
//   map:<type>    -> object with additionalProperties (propertyNames when the keys are an enum)
//   prims         -> string | integer | number | boolean | date-time | date | pattern ...

import { parseType } from '../../../../packages/contract/schema/dsl.mjs';

export function idSchemaName(entityName) {
  return `${entityName}Id`;
}

export function makeMapper({ entityByTable }) {
  function prim(name) {
    switch (name) {
      case 'string': return { type: 'string' };
      case 'text': return { type: 'string' };
      case 'url': return { type: 'string', description: 'A URL (joinflowd.io, a platform domain or an .example host; short links omit the scheme).' };
      case 'iso': return { type: 'string', format: 'date-time', description: 'ISO-8601 UTC timestamp, e.g. 2026-10-03T14:00:00Z.' };
      case 'date': return { type: 'string', format: 'date', description: 'Calendar day, YYYY-MM-DD (UTC).' };
      case 'hex': return { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' };
      case 'int': return { type: 'integer' };
      case 'number': return { type: 'number' };
      case 'bool': return { type: 'boolean' };
      case 'cents': return { type: 'integer', minimum: 0, description: 'Integer cents (USD). Never a formatted amount.' };
      case 'ratio': return { type: 'number', minimum: 0, maximum: 1, description: 'A ratio from 0 to 1.' };
      case 'pct': return { type: 'number', minimum: 0, maximum: 100, description: 'A percentage from 0 to 100.' };
      case 'json': return { type: 'object', additionalProperties: true, description: 'Opaque object (a third-party payload echo).' };
      default: throw new Error(`unknown primitive ${name}`);
    }
  }

  /** @param {string} raw contract field type  @param {{ entityName?: string, keys?: string }} ctx */
  function schemaFor(raw, ctx = {}) {
    const p = parseType(raw);
    let s;
    switch (p.kind) {
      case 'id': s = ctx.entityName ? { $ref: `#/components/schemas/${idSchemaName(ctx.entityName)}` } : { type: 'string' }; break;
      case 'art': s = { $ref: '#/components/schemas/ArtSeed' }; break;
      case 'enum': s = { $ref: `#/components/schemas/${p.name}` }; break;
      case 'obj': s = { $ref: `#/components/schemas/${p.name}` }; break;
      case 'ref': {
        const target = entityByTable.get(p.table);
        s = target && target.prefix ? { $ref: `#/components/schemas/${idSchemaName(target.name)}` } : { type: 'string', description: `-> ${p.table}` };
        break;
      }
      case 'map': {
        const inner = schemaFor(rebuild(p.inner));
        s = { type: 'object', additionalProperties: inner };
        if (ctx.keys) s.propertyNames = { $ref: `#/components/schemas/${ctx.keys}` };
        break;
      }
      case 'prim': s = prim(p.name); break;
      default: throw new Error(`unsupported kind ${p.kind}`);
    }
    return p.array ? { type: 'array', items: s } : s;
  }

  /** parseType returns structured inner types; turn one back into a grammar string so schemaFor can recurse. */
  function rebuild(p) {
    const arr = p.array ? '[]' : '';
    switch (p.kind) {
      case 'id': return 'id' + arr;
      case 'art': return 'art' + arr;
      case 'prim': return p.name + arr;
      case 'enum': return `enum:${p.name}` + arr;
      case 'ref': return `ref:${p.table}` + arr;
      case 'obj': return `obj:${p.name}` + arr;
      case 'map': return `map:${rebuild(p.inner)}` + arr;
      default: throw new Error(`cannot rebuild ${p.kind}`);
    }
  }

  /** Object schema from contract-style fields (req/opt descriptors). */
  function objectSchema({ doc, fields, entityName, strict = false, extra = {} }) {
    const properties = {};
    const required = [];
    for (const f of fields) {
      const s = schemaFor(f.type, { entityName, keys: f.keys });
      properties[f.name] = f.doc ? { ...s, description: f.doc } : s; // OpenAPI 3.1 (JSON Schema 2020-12) allows a description next to a $ref
      if (f.required) required.push(f.name);
    }
    const out = { type: 'object' };
    if (doc) out.description = doc;
    if (required.length) out.required = required;
    out.properties = properties;
    if (strict) out.additionalProperties = false;
    return { ...out, ...extra };
  }

  return { schemaFor, objectSchema };
}

/**
 * A compact notation for request bodies and read models:
 *   "name:type -- doc; other?:type; list?:enum:Foo[] -- doc"
 * `name?` marks optional; the type is the contract grammar. Fields are separated by ";" (never used inside a type).
 */
export function parseFields(text) {
  const t = String(text).trim();
  if (t === '') return [];
  return t.split(/;\s*(?=[a-z_][a-z0-9_]*\??:)/i).map((chunk) => {
    const [head, ...docParts] = chunk.split(/\s--\s/);
    const m = /^([a-z_][a-z0-9_]*)(\?)?:(.+)$/i.exec(head.trim());
    if (!m) throw new Error(`bad field spec: ${chunk}`);
    return { name: m[1], type: m[3].trim(), required: !m[2], doc: docParts.join(' -- ').trim() };
  });
}
