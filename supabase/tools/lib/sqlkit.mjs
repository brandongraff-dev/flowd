// Small helpers shared by the supabase generators. Zero dependencies, Node 20+.

/** Postgres reserved words that must never be used as bare column names (renamed in table-config instead of quoted). */
export const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric', 'both', 'case', 'cast', 'check', 'collate', 'column',
  'constraint', 'create', 'current_catalog', 'current_date', 'current_role', 'current_time', 'current_timestamp', 'current_user',
  'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'from', 'grant',
  'group', 'having', 'in', 'initially', 'intersect', 'into', 'lateral', 'leading', 'limit', 'localtime', 'localtimestamp', 'not',
  'null', 'offset', 'on', 'only', 'or', 'order', 'placing', 'primary', 'references', 'returning', 'select', 'session_user', 'some',
  'symmetric', 'system_user', 'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'when',
  'where', 'window', 'with',
]);

/** Quote a SQL string literal. */
export const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Escape a comment for `comment on ... is '...'` (also collapses whitespace). */
export const commentText = (s) => lit(String(s).replace(/\s+/g, ' ').trim());

/** snake_case from PascalCase (same rule as the contract's toSnake). */
export const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();

/** Indent every non-empty line. */
export const indent = (s, n = 2) => s.split('\n').map((l) => (l.length ? ' '.repeat(n) + l : l)).join('\n');

/** Section banner used in generated files. */
export function banner(title, sub = '') {
  const bar = '-- ' + '='.repeat(76);
  return `${bar}\n-- ${title}\n${sub ? sub.split('\n').map((l) => `-- ${l}`).join('\n') + '\n' : ''}${bar}\n`;
}

/** Flatten an object into dotted leaf paths. Arrays and scalars are leaves. */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

/** Stable JSON for SQL jsonb literals. */
export const jsonLit = (v) => lit(JSON.stringify(v));

/** True when `name` is a safe bare identifier. */
export const isBare = (name) => /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name);
