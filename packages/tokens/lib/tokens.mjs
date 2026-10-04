// Loading + alias resolution for tokens.json. Zero dependencies.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadRaw(file = path.join(PKG_DIR, 'tokens.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const ALIAS = /^\{([^{}]+)\}$/;

function lookup(root, dotted) {
  let cur = root;
  for (const part of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) throw new Error(`Unresolved token alias {${dotted}} (missing "${part}")`);
    cur = cur[part];
  }
  return cur;
}

/** Deep-resolve "{a.b.c}" aliases (aliases may point at other aliases). Returns a new tree. */
export function resolveAliases(raw) {
  const walk = (v, trail) => {
    if (typeof v === 'string') {
      const m = v.match(ALIAS);
      if (!m) return v;
      if (trail.includes(m[1])) throw new Error(`Circular token alias: ${[...trail, m[1]].join(' -> ')}`);
      return walk(lookup(raw, m[1]), [...trail, m[1]]);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, trail));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, trail);
      return out;
    }
    return v;
  };
  return walk(raw, []);
}

export function loadTokens(file) {
  const raw = loadRaw(file);
  return { raw, tokens: resolveAliases(raw) };
}

/** 'bg-elevated' -> 'bgElevated' */
export const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
/** 'bgElevated' | 'bg-elevated' -> 'bg-elevated' */
export const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
