#!/usr/bin/env node
// Verifies the Swift models against the real fixture JSON without a Swift compiler.
//
//   node scripts/check-ios-models.mjs            check every fixture row against the Swift struct that decodes it
//   node scripts/check-ios-models.mjs --verbose  also print every checked struct and the optional properties that never appear
//
// What it does (this is how we know a fixture will decode):
//   1. parses every struct (stored properties, their types) and every String enum (raw values) in apps/ios/Flowd/Core/Models/*.swift;
//   2. maps each fixture file to its Swift struct (schema entity table -> name, see scripts/lib/ios-names.mjs);
//   3. walks EVERY row of EVERY fixture: each JSON key must map (convertFromSnakeCase) to a Swift property, each non-optional property
//      must be present, and each value must match the Swift type (String, Int, Double, Bool, Date, enum raw value, nested struct,
//      arrays and string-keyed dictionaries, recursively).
// Exit code 1 on any drift. Also fails when a fixture has no Swift struct or a Swift entity has no fixture.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { camelFromSnake, swiftTypeName } from "./lib/ios-names.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");
const modelsDir = process.env.IOS_MODELS_DIR ? path.resolve(process.env.IOS_MODELS_DIR) : path.join(root, "apps/ios/Flowd/Core/Models");
const fixturesDir = path.join(root, "packages/contract/fixtures");

// ── tiny Swift scanner (strings and comments aware) ──────────────────────────────────────────────
/** Replace comments and string literal contents with spaces, preserving offsets and newlines. */
function blank(text) {
  const out = text.split("");
  let i = 0;
  const n = text.length;
  const fill = (a, b) => {
    for (let k = a; k < b; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "/" && c2 === "/") {
      let j = i;
      while (j < n && text[j] !== "\n") j += 1;
      fill(i, j);
      i = j;
    } else if (c === "/" && c2 === "*") {
      let j = i + 2;
      while (j < n && !(text[j] === "*" && text[j + 1] === "/")) j += 1;
      fill(i, Math.min(n, j + 2));
      i = j + 2;
    } else if (c === "#" && text.startsWith('#"""', i)) {
      let j = text.indexOf('"""#', i + 4);
      if (j < 0) j = n;
      fill(i + 1, j + 3);
      i = j + 4;
    } else if (c === '"' && text.startsWith('"""', i)) {
      let j = text.indexOf('"""', i + 3);
      if (j < 0) j = n;
      fill(i + 1, j + 2);
      i = j + 3;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"' && text[j] !== "\n") {
        if (text[j] === "\\") j += 1;
        j += 1;
      }
      fill(i + 1, j);
      i = j + 1;
    } else i += 1;
  }
  return out.join("");
}

/** Find top-level declarations `struct|enum Name ... {` and return { kind, name, start, bodyStart, end } using blanked text for braces. */
function topLevelTypes(original) {
  const clean = blank(original);
  const decl = /^(?:public |internal |fileprivate |private |final )*(struct|enum)\s+([A-Za-z_]\w*)\b[^{\n]*\{/gm;
  const found = [];
  let m;
  while ((m = decl.exec(clean)) !== null) {
    // only depth-0 declarations
    let depth = 0;
    for (let k = 0; k < m.index; k += 1) {
      if (clean[k] === "{") depth += 1;
      else if (clean[k] === "}") depth -= 1;
    }
    if (depth !== 0) continue;
    const bodyStart = m.index + m[0].length;
    let d = 1;
    let k = bodyStart;
    while (k < clean.length && d > 0) {
      if (clean[k] === "{") d += 1;
      else if (clean[k] === "}") d -= 1;
      k += 1;
    }
    found.push({ kind: m[1], name: m[2], bodyStart, end: k, header: m[0] });
  }
  return { clean, found };
}

/** Parse the top-level (depth 1) stored properties of a struct body. */
function parseStruct(original, clean, t) {
  const props = [];
  let depth = 0;
  let lineStart = t.bodyStart;
  const body = clean.slice(t.bodyStart, t.end - 1);
  const orig = original.slice(t.bodyStart, t.end - 1);
  // walk lines, tracking depth
  const lines = body.split("\n");
  const origLines = orig.split("\n");
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (depth === 0) {
      const m = /^\s*(?:(?:public|internal|fileprivate|private)\s+)?(var|let)\s+(`?)([A-Za-z_]\w*)\2\s*:\s*([^=]+?)\s*(=.*)?$/.exec(line);
      if (m && !/\{\s*$/.test(line.replace(/\s+$/, "")) && !/^\s*static\b/.test(line)) {
        props.push({ name: m[3], type: m[4].trim(), hasDefault: Boolean(m[5]) });
      }
    }
    for (const ch of line) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
    void origLines;
    void lineStart;
  }
  return props;
}

/** Parse the String raw values of an enum body: `case name = "raw"` (raw values read from the original text). */
function parseEnum(original, clean, t) {
  const body = original.slice(t.bodyStart, t.end - 1);
  const cleanBody = clean.slice(t.bodyStart, t.end - 1);
  const raws = new Set();
  const names = new Set();
  const lines = body.split("\n");
  const cleanLines = cleanBody.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*case\s+(`?)([A-Za-z_]\w*)\1\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(lines[i]);
    if (m && /^\s*case\b/.test(cleanLines[i])) {
      raws.add(m[3]);
      names.add(m[2]);
      continue;
    }
    const bare = /^\s*case\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*$/.exec(cleanLines[i]);
    if (bare) for (const nm of bare[1].split(",")) {
      raws.add(nm.trim());
      names.add(nm.trim());
    }
  }
  const hasUnknown = names.has("unknown");
  return { raws, hasUnknown, isString: /:\s*String\b/.test(t.header) };
}

// ── parse models ─────────────────────────────────────────────────────────────────────────────────
const structs = new Map();
const enums = new Map();
for (const f of fs.readdirSync(modelsDir).filter((x) => x.endsWith(".swift")).sort()) {
  const original = fs.readFileSync(path.join(modelsDir, f), "utf8");
  const { clean, found } = topLevelTypes(original);
  for (const t of found) {
    if (t.kind === "struct") structs.set(t.name, { file: f, props: parseStruct(original, clean, t) });
    else enums.set(t.name, { file: f, ...parseEnum(original, clean, t) });
  }
}

// ── schema -> fixture table mapping ──────────────────────────────────────────────────────────────
const S = await import(pathToFileURL(path.join(root, "packages/contract/schema/index.mjs")).href);
const tableToStruct = new Map(S.ENTITIES.map((e) => [e.table, swiftTypeName(e.name)]));

// ── type handling ────────────────────────────────────────────────────────────────────────────────
/** "[String: [Foo]]?" -> { optional, kind: 'dict'|'array'|'named', inner, name } */
function parseSwiftType(raw) {
  let t = raw.trim();
  let optional = false;
  if (t.endsWith("?")) {
    optional = true;
    t = t.slice(0, -1).trim();
  }
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    // dictionary? top-level colon
    let depth = 0;
    let colon = -1;
    for (let i = 0; i < inner.length; i += 1) {
      if (inner[i] === "[") depth += 1;
      else if (inner[i] === "]") depth -= 1;
      else if (inner[i] === ":" && depth === 0) {
        colon = i;
        break;
      }
    }
    if (colon >= 0) return { optional, kind: "dict", value: parseSwiftType(inner.slice(colon + 1)) };
    return { optional, kind: "array", element: parseSwiftType(inner) };
  }
  return { optional, kind: "named", name: t };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const problems = new Map(); // fixture -> Map(message -> {count, example})
const note = (fixture, message, example) => {
  if (!problems.has(fixture)) problems.set(fixture, new Map());
  const m = problems.get(fixture);
  const cur = m.get(message);
  if (cur) cur.count += 1;
  else m.set(message, { count: 1, example });
};
const everSeen = new Map(); // struct.prop -> count

const kindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function checkValue(fixture, where, t, value, rowId) {
  if (value === null || value === undefined) {
    note(fixture, `${where}: JSON null/undefined (Swift decodes null only into an optional)`, rowId);
    return;
  }
  if (t.kind === "array") {
    if (!Array.isArray(value)) return note(fixture, `${where}: expected array, got ${kindOf(value)}`, rowId);
    for (const el of value) checkValue(fixture, `${where}[]`, t.element, el, rowId);
    return;
  }
  if (t.kind === "dict") {
    if (kindOf(value) !== "object") return note(fixture, `${where}: expected object (dictionary), got ${kindOf(value)}`, rowId);
    for (const v of Object.values(value)) checkValue(fixture, `${where}{}`, t.value, v, rowId);
    return;
  }
  const name = t.name;
  switch (name) {
    case "String":
      if (typeof value !== "string") note(fixture, `${where}: expected String, got ${kindOf(value)}`, rowId);
      return;
    case "Int":
      if (typeof value !== "number" || !Number.isInteger(value)) note(fixture, `${where}: expected Int, got ${JSON.stringify(value)}`, rowId);
      return;
    case "Double":
      if (typeof value !== "number") note(fixture, `${where}: expected Double, got ${kindOf(value)}`, rowId);
      return;
    case "Bool":
      if (typeof value !== "boolean") note(fixture, `${where}: expected Bool, got ${kindOf(value)}`, rowId);
      return;
    case "Date":
      if (typeof value !== "string" || !ISO.test(value)) note(fixture, `${where}: expected ISO-8601 date, got ${JSON.stringify(value)}`, rowId);
      return;
    case "ArtSeed":
      if (!["object", "string", "number"].includes(kindOf(value))) note(fixture, `${where}: ArtSeed must be object, string or integer`, rowId);
      return;
    default:
  }
  if (enums.has(name)) {
    const e = enums.get(name);
    if (typeof value !== "string") return note(fixture, `${where}: expected ${name} raw String, got ${kindOf(value)}`, rowId);
    if (!e.raws.has(value)) note(fixture, `${where}: value "${value}" is not a case of ${name} (would decode to .unknown)`, rowId);
    return;
  }
  if (structs.has(name)) {
    if (kindOf(value) !== "object") return note(fixture, `${where}: expected object for ${name}, got ${kindOf(value)}`, rowId);
    checkStruct(fixture, `${where}`, name, value, rowId);
    return;
  }
  note(fixture, `${where}: Swift type ${name} is not declared in Core/Models`, rowId);
}

function checkStruct(fixture, where, structName, obj, rowId) {
  const s = structs.get(structName);
  const byName = new Map(s.props.map((p) => [p.name, p]));
  for (const [key, value] of Object.entries(obj)) {
    const prop = camelFromSnake(key);
    const p = byName.get(prop);
    if (!p) {
      note(fixture, `${where}.${key}: no Swift property "${prop}" on ${structName}`, rowId);
      continue;
    }
    everSeen.set(`${structName}.${prop}`, (everSeen.get(`${structName}.${prop}`) ?? 0) + 1);
    checkValue(fixture, `${where}.${key}`, parseSwiftType(p.type), value, rowId);
  }
  for (const p of s.props) {
    const t = parseSwiftType(p.type);
    if (t.optional || p.hasDefault) continue;
    const snakeKeys = Object.keys(obj).map(camelFromSnake);
    if (!snakeKeys.includes(p.name)) note(fixture, `${where}: required property "${p.name}" (${p.type}) of ${structName} is missing`, rowId);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).sort();
const rowsChecked = new Map();
const unmatched = [];
for (const file of fixtureFiles) {
  const table = file.replace(/\.json$/, "");
  const structName = tableToStruct.get(table);
  if (!structName || !structs.has(structName)) {
    unmatched.push(`${file} -> ${structName ?? "(no entity in schema)"} (struct not found in Core/Models)`);
    continue;
  }
  const json = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
  const rows = Array.isArray(json) ? json : [json];
  rowsChecked.set(table, rows.length);
  rows.forEach((row, i) => {
    const id = row && typeof row === "object" && "id" in row ? String(row.id) : `#${i}`;
    if (kindOf(row) !== "object") return note(table, "row is not an object", id);
    checkStruct(table, "$", structName, row, id);
  });
}
for (const [table, structName] of tableToStruct) {
  if (!structs.has(structName)) unmatched.push(`${table}: schema entity ${structName} has no Swift struct`);
  if (!fixtureFiles.includes(`${table}.json`)) unmatched.push(`${table}: no fixture file`);
}

let totalProblems = 0;
for (const [fixture, map] of problems) {
  console.log(`\n${fixture}.json`);
  for (const [message, { count, example }] of map) {
    totalProblems += 1;
    console.log(`  x ${message}  (${count} time${count === 1 ? "" : "s"}; e.g. row ${example})`);
  }
}
if (unmatched.length > 0) {
  console.log("\nUnmatched:");
  for (const u of unmatched) console.log(`  x ${u}`);
}
const rowTotal = [...rowsChecked.values()].reduce((a, b) => a + b, 0);
if (verbose) {
  console.log("\nOptional or defaulted properties that never appear in any fixture row:");
  for (const [name, s] of structs) {
    for (const p of s.props) {
      if (!everSeen.has(`${name}.${p.name}`) && [...tableToStruct.values()].includes(name)) console.log(`  - ${name}.${p.name}: ${p.type}`);
    }
  }
}
console.log(
  `\ncheck-ios-models: ${structs.size} structs, ${enums.size} enums parsed; ${fixtureFiles.length} fixtures / ${rowTotal} rows checked; ` +
    `${totalProblems} distinct problem(s), ${unmatched.length} unmatched`,
);
if (totalProblems > 0 || unmatched.length > 0) process.exit(1);
console.log("check-ios-models: OK, every fixture row matches its Swift struct.");
