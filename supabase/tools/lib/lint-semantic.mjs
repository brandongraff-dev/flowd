// Semantic checks on SQL statements against the schema model (used by supabase/tools/lint.mjs).
//
// Splits every migration (function and DO bodies included) into statements and checks, for the tables of the model:
//   * alias.column references,
//   * insert column lists, on conflict targets and update ... set column names,
//   * string literals compared with an enum-typed column ( = 'x', <> 'x', in ('x', 'y') ).
// Views, CTE names and PL/pgSQL variables are not tables of the model and are skipped, so the check never guesses.

const STOP = new Set([
  'on', 'where', 'set', 'using', 'left', 'right', 'inner', 'cross', 'full', 'join', 'for', 'group', 'order', 'limit', 'returning', 'values', 'select',
  'union', 'natural', 'lateral', 'as', 'and', 'or', 'when', 'then', 'else', 'end', 'filter', 'within', 'over', 'is', 'not', 'in', 'into', 'from',
  'having', 'except', 'intersect', 'do', 'nulls', 'cascade', 'loop', 'if', 'with', 'by', 'to', 'enable', 'force', 'add', 'alter', 'drop',
]);
const SKIP_QUALIFIERS = new Set(['public', 'private', 'excluded', 'extensions', 'auth', 'storage', 'new', 'old']);

function noComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (sql[i] === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    out += sql[i++];
  }
  return out;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Find dollar-quoted bodies in comment-free SQL: returns { outer, bodies } (outer has bodies blanked). */
function extractBodies(text) {
  const bodies = [];
  let outer = '';
  let i = 0;
  while (i < text.length) {
    const m = /^\$([A-Za-z_]*)\$/.exec(text.slice(i, i + 40));
    if (text[i] === '$' && m) {
      const tag = m[0];
      const e = text.indexOf(tag, i + tag.length);
      if (e < 0) break;
      bodies.push(text.slice(i + tag.length, e));
      outer += ' ';
      i = e + tag.length;
      continue;
    }
    if (text[i] === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= text.length) break;
        if (text[j] === "'") { if (text[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      outer += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    outer += text[i++];
  }
  return { outer, bodies };
}

export function lintStatements(sources, model, err) {
  const enumValues = new Map(model.enums.map((e) => [e.sql, new Set(e.values)]));
  const tableCols = new Map(model.tables.map((t) => [t.name, new Map(t.columns.map((c) => [c.name, c]))]));

  const checkStatement = (file, where, st) => {
    const aliases = new Map(); // alias -> Set of tables (an alias may be reused by different subqueries of one statement)
    const tablesInStmt = new Set();
    const addAlias = (a, t) => { if (!aliases.has(a)) aliases.set(a, new Set()); aliases.get(a).add(t); };
    const tableRe = /\b(?:from|join|update|into|table)\s+(?:only\s+)?public\.([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
    for (const m of st.matchAll(tableRe)) {
      const t = m[1].toLowerCase();
      let a = m[2] ? m[2].toLowerCase() : null;
      if (a && STOP.has(a)) a = null;
      if (tableCols.has(t)) { tablesInStmt.add(t); addAlias(a ?? t, t); addAlias(t, t); }
    }
    const noStr = st.replace(/'(?:[^']|'')*'/g, "''");
    for (const m of noStr.matchAll(/(?<![.\w])([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b(?!\s*\()/gi)) {
      const q = m[1].toLowerCase();
      const c = m[2].toLowerCase();
      if (SKIP_QUALIFIERS.has(q)) continue;
      const ts = aliases.get(q);
      if (ts && ![...ts].some((t) => tableCols.get(t).has(c))) err(`${file}${where}: "${q}.${c}" but ${[...ts].join('/')} has no column ${c}`);
    }
    for (const m of st.matchAll(/insert\s+into\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const t = m[1].toLowerCase();
      if (!tableCols.has(t)) continue;
      for (const raw of m[2].split(',')) {
        const c = raw.trim().toLowerCase();
        if (c && !tableCols.get(t).has(c)) err(`${file}${where}: insert into ${t} lists unknown column ${c}`);
      }
    }
    for (const m of st.matchAll(/on\s+conflict\s*\(([^)]*)\)/gi)) {
      const ins = /insert\s+into\s+public\.([a-z_][a-z0-9_]*)/i.exec(st);
      if (!ins || !tableCols.has(ins[1].toLowerCase())) continue;
      for (const raw of m[1].split(',')) {
        const c = raw.trim().toLowerCase();
        if (c && /^[a-z_][a-z0-9_]*$/.test(c) && !tableCols.get(ins[1].toLowerCase()).has(c)) err(`${file}${where}: on conflict uses unknown column ${c} of ${ins[1]}`);
      }
    }
    const upd = /\bupdate\s+public\.([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set\s+([\s\S]*?)(?=\s+(?:where|from|returning)\b|$)/i.exec(st);
    if (upd && tableCols.has(upd[1].toLowerCase())) {
      for (const part of splitTopLevel(upd[2])) {
        const mm = /^\s*([a-z_][a-z0-9_]*)\s*=/i.exec(part);
        if (mm && !tableCols.get(upd[1].toLowerCase()).has(mm[1].toLowerCase())) err(`${file}${where}: update ${upd[1]} sets unknown column ${mm[1]}`);
      }
    }
    const checkLits = (qual, col, lits) => {
      const q = qual ? qual.toLowerCase() : null;
      const candidates = q ? (aliases.has(q) ? [...aliases.get(q)] : []) : [...tablesInStmt];
      const types = new Set();
      for (const t of candidates) {
        const c = tableCols.get(t).get(col.toLowerCase());
        if (!c) continue;
        const em = /^public\.([a-z_]+)(\[\])?$/.exec(c.sql);
        if (em && enumValues.has(em[1])) types.add(em[1]);
      }
      if (!types.size) return;
      for (const lit of lits) {
        if (![...types].some((tn) => enumValues.get(tn).has(lit))) err(`${file}${where}: '${lit}' is not a value of ${[...types].join('/')} (compared with ${col})`);
      }
    };
    for (const m of st.matchAll(/(?<![.\w])(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*(?:=|<>|!=)\s*'([^']*)'/gi)) checkLits(m[1], m[2], [m[3]]);
    for (const m of st.matchAll(/(?<![.\w])(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+(?:not\s+)?in\s*\(([^()]*)\)/gi)) {
      const lits = [...m[3].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      if (lits.length) checkLits(m[1], m[2], lits);
    }
  };

  for (const [f, sql] of sources) {
    if (f.startsWith('tests/')) continue;
    const text = noComments(sql);
    const { outer, bodies } = extractBodies(text);
    const chunks = [{ where: '', t: outer }, ...bodies.map((b) => ({ where: ' (function body)', t: b }))];
    for (const { where, t } of chunks) {
      // nested bodies (dynamic SQL inside DO blocks) are checked as well
      const nested = extractBodies(t);
      for (const st of nested.outer.split(';')) if (st.trim()) checkStatement(f, where, st);
      for (const b of nested.bodies) for (const st of b.split(';')) if (st.trim()) checkStatement(f, where + ' (nested)', st);
    }
  }
}
