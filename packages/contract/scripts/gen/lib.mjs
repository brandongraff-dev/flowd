// Shared helpers for the fixture generators: seeded PRNG, id builders, time and money helpers, art seeds, allocation utilities.
// Zero dependencies. Everything is deterministic for a given seed. Import from here, never from Math.random or Date.now().
//
//   import { createContext, mulberry32, makeRng, NOW, iso, addHours, mulRate, artSeed, allocate } from './lib.mjs';

import { CONSTANTS } from '../../schema/constants.mjs';
import { parseType } from '../../schema/dsl.mjs';
import { ENTITIES, ENTITY_BY_NAME, ENTITY_BY_TABLE, VALUE_BY_NAME, ENUM_BY_NAME, enumValues } from '../../schema/index.mjs';
import * as WORLD from '../../schema/world.mjs';

export * from '../../schema/time.mjs';
export { bps, mulRate, clamp, round2, usd, quantile, median, typicalEarnings } from '../../schema/formulas.mjs';
export { CONSTANTS };

import { NOW_ISO, NOW_MS, DAY_MS, HOUR_MS, iso, ms, addDays, addHours, dateOf } from '../../schema/time.mjs';

export const NOW = NOW_ISO;
export const NOW_EPOCH = NOW_MS;
export const LAUNCH_DATE = CONSTANTS.world.launch_date; // 2026-07-05
export const LAUNCH_ISO = `${LAUNCH_DATE}T00:00:00Z`;
export const HISTORY_DAYS = CONSTANTS.world.history_days;

// ── seeded PRNG ─────────────────────────────────────────────────────────────────────────────────
/** mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a 32-bit hash of a string (used to derive independent streams and art seeds). */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A seeded random toolbox. `fork(label)` derives an independent stream, so adding rows to one generator never reshuffles another:
 *   const rng = ctx.rng.fork('creators');
 */
export function makeRng(seed) {
  const base = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  const next = mulberry32(base);
  const rng = {
    seed: base,
    /** float in [0, 1) */
    next,
    /** integer in [lo, hi] inclusive */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** float in [lo, hi) */
    float: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** pick from [[value, weight], ...] or { value: weight } */
    weighted(entries) {
      const pairs = Array.isArray(entries) ? entries : Object.entries(entries);
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of pairs) {
        r -= w;
        if (r < 0) return v;
      }
      return pairs[pairs.length - 1][0];
    },
    /** Fisher-Yates on a copy */
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** n distinct items */
    sample(arr, n) {
      return rng.shuffle(arr).slice(0, Math.min(n, arr.length));
    },
    /** normal(mean, sd) via Box-Muller */
    normal(mean = 0, sd = 1) {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /** log-normal with the given MEDIAN and sigma (of the underlying normal): median x exp(sigma x N(0,1)) */
    logNormal(median, sigma) {
      return median * Math.exp(rng.normal(0, sigma));
    },
    /** Poisson(lambda) (Knuth for small lambda, normal approximation above 40) */
    poisson(lambda) {
      if (lambda <= 0) return 0;
      if (lambda > 40) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
    /** independent child stream */
    fork: (label) => makeRng((base ^ hash32(String(label))) >>> 0),
  };
  return rng;
}

// ── ids ─────────────────────────────────────────────────────────────────────────────────────────
export const pad = (n, width = 4) => String(n).padStart(width, '0');
/** lowercase [a-z0-9_] slug; dots and dashes become underscores */
export const slugify = (s) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
/** `${prefix}_${slug}` */
export const makeId = (prefix, slug) => `${prefix}_${slugify(slug)}`;
/** Sequential ids per prefix: ids.next('sub') -> sub_0001, sub_0002 ... */
export function idFactory() {
  const counters = new Map();
  return {
    next(prefix, width = 4) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${pad(n, width)}`;
    },
    peek: (prefix) => (counters.get(prefix) ?? 0) + 1,
    of: makeId,
  };
}

// ── time ────────────────────────────────────────────────────────────────────────────────────────
export { iso, ms, addDays, addHours, dateOf };
export const hoursAgo = (h) => iso(NOW_MS - h * HOUR_MS);
export const daysAgo = (d) => iso(NOW_MS - d * DAY_MS);
/** random timestamp between two ISO times (inclusive of from, exclusive of to) */
export const between = (rng, fromIso, toIso) => iso(ms(fromIso) + Math.floor(rng.next() * (ms(toIso) - ms(fromIso))));
/** never later than now */
export const capNow = (isoStr) => (ms(isoStr) > NOW_MS ? NOW : isoStr);
/** ISO times at an hour of the day on a date */
export const atHour = (date, hour, minute = 0) => `${date}T${pad(hour, 2)}:${pad(minute, 2)}:00Z`;
/** list of "YYYY-MM-DD" dates from launch to the day of now, inclusive (91 dates) */
export function historyDates() {
  const out = [];
  for (let t = ms(LAUNCH_DATE); t <= NOW_MS; t += DAY_MS) out.push(dateOf(iso(t)));
  return out;
}
/** weekly share of activity since launch (ACTIVITY_RAMP) -> relative weight for a date (day-level) */
export function rampWeight(dateStr) {
  const week = Math.min(12, Math.floor((ms(dateStr) - ms(LAUNCH_DATE)) / (7 * DAY_MS)));
  return WORLD.ACTIVITY_RAMP.weekly_share[week] / 7;
}
/** A timestamp drawn from the ramp (later weeks are busier) and the daily rhythm (afternoons and evenings busier). */
export function rampTimestamp(rng, { from = LAUNCH_ISO, to = NOW } = {}) {
  for (let i = 0; i < 40; i++) {
    const t = between(rng, from, to);
    const d = dateOf(t);
    const w = rampWeight(d) / 0.13;
    const hour = Number(t.slice(11, 13));
    const hourW = hour < 6 ? 0.25 : hour < 11 ? 0.7 : hour < 22 ? 1 : 0.5;
    if (rng.next() < w * hourW) return t;
  }
  return between(rng, from, to);
}

// ── money ───────────────────────────────────────────────────────────────────────────────────────
/** dollars (float) -> integer cents */
export const cents = (dollars) => Math.round(dollars * 100);
/** "$12.40" for memos and labels */
export const fmtMoney = (c) => `${c < 0 ? '-' : ''}$${Math.floor(Math.abs(c) / 100).toLocaleString('en-US')}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
/** compact count: 12400 -> "12.4k", 2100000 -> "2.1M" */
export function fmtCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

/**
 * Split an integer `total` across `weights` so the parts are non-negative integers that sum EXACTLY to total (largest remainder).
 * Use for hourly -> daily -> lifetime roll-ups and for splitting a pay amount across rows: sums always reconcile.
 */
export function allocate(total, weights) {
  const w = weights.map((x) => Math.max(0, x));
  const s = w.reduce((a, b) => a + b, 0);
  if (w.length === 0) return [];
  if (s === 0) {
    const out = new Array(w.length).fill(0);
    out[0] = total;
    return out;
  }
  const raw = w.map((x) => (x / s) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) base[order[k][1]]++;
  return base;
}
/**
 * Hourly share of a post's lifetime views: exponential decay with time constant tau (hours) from the posting hour, normalised over
 * `hours` hours so the shares sum to 1. 70% of views land in the first 24 hours at tau = 20.
 */
export function decayShares(hours, tauHours = 20) {
  const raw = Array.from({ length: hours }, (_, h) => Math.exp(-h / tauHours));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / s);
}
/** cumulative share of lifetime views delivered by hour h for an infinite exponential decay */
export const cumulativeShare = (h, tauHours = 20) => 1 - Math.exp(-h / tauHours);

// ── generated imagery (ArtSeed) ─────────────────────────────────────────────────────────────────
export const ART_PATTERNS = ['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes'];
const mod360 = (h) => ((Math.round(h) % 360) + 360) % 360;
/**
 * A harmonious ArtSeed: hue_b is hue_a +/- 25..70, hue_c roughly the complement (+150..210). Pass `hue` to anchor the palette
 * (brand colours), `pattern` to force a look, `label` for text on the art (24 characters at most).
 * @returns {{hue_a:number,hue_b:number,hue_c:number,pattern:string,seed:number,label?:string}}
 */
export function artSeed(rng, { hue, pattern, label } = {}) {
  const hue_a = mod360(hue ?? rng.int(0, 359));
  const hue_b = mod360(hue_a + rng.int(25, 70) * (rng.chance(0.5) ? 1 : -1));
  const hue_c = mod360(hue_a + rng.int(150, 210));
  const out = { hue_a, hue_b, hue_c, pattern: pattern ?? rng.pick(ART_PATTERNS), seed: rng.int(1, 999_999) };
  if (label) {
    // keep whole words when a label has to be cut to fit the art
    const cut = label.slice(0, 23);
    const space = cut.lastIndexOf(' ');
    out.label = label.length > 24 ? `${(space >= 10 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…` : label;
  }
  return out;
}
/** hue (0-360) of a "#RRGGBB" colour */
export function hueOfHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return mod360(h * 60);
}
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// ── text helpers ────────────────────────────────────────────────────────────────────────────────
export const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
export const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const oxford = (items) => (items.length <= 1 ? items.join('') : items.length === 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`);
export const plural = (n, word, pluralWord = `${word}s`) => `${fmtInt(n)} ${n === 1 ? word : pluralWord}`;
/** replace {slots} in a template from a values map; unknown slots throw so typos are caught */
export function fill(template, values) {
  return template.replace(/\{([a-z_]+)\}/g, (_m, k) => {
    if (!(k in values)) throw new Error(`fill: missing slot {${k}} in "${template}"`);
    return values[k];
  });
}
/** e.g. 83000 ms -> "01:23"; 3100 -> "00:03" */
export const timecode = (tMs) => `${pad(Math.floor(tMs / 60000), 2)}:${pad(Math.floor((tMs % 60000) / 1000), 2)}`;

// ── collections ─────────────────────────────────────────────────────────────────────────────────
export const range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));
export const indexBy = (rows, key = 'id') => new Map(rows.map((r) => [typeof key === 'function' ? key(r) : r[key], r]));
export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
export const uniq = (arr) => [...new Set(arr)];
export const sortBy = (rows, key, dir = 1) => [...rows].sort((a, b) => {
  const x = typeof key === 'function' ? key(a) : a[key];
  const y = typeof key === 'function' ? key(b) : b[key];
  return (x < y ? -1 : x > y ? 1 : 0) * dir;
});
export const chunk = (arr, n) => range(Math.ceil(arr.length / n), (i) => arr.slice(i * n, (i + 1) * n));

// ── canonical JSON (stable key order following the schema) ──────────────────────────────────────
function canonValue(value, rawType, keysEnum) {
  if (value === undefined || value === null) return undefined;
  const p = parseType(rawType);
  if (p.array) {
    if (!Array.isArray(value)) return value;
    return value.map((v) => canonValue(v, rawType.slice(0, -2), keysEnum)).filter((v) => v !== undefined);
  }
  switch (p.kind) {
    case 'obj': return canonObject(value, VALUE_BY_NAME.get(p.name));
    case 'art': return canonObject(value, { fields: [{ name: 'hue_a', type: 'int' }, { name: 'hue_b', type: 'int' }, { name: 'hue_c', type: 'int' }, { name: 'pattern', type: 'string' }, { name: 'seed', type: 'int' }, { name: 'label', type: 'string' }] });
    case 'map': {
      if (typeof value !== 'object') return value;
      const order = keysEnum && ENUM_BY_NAME.has(keysEnum) ? enumValues(keysEnum) : null;
      const keys = Object.keys(value).sort((a, b) => (order ? (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 999 : order.indexOf(b)) || a.localeCompare(b) : a.localeCompare(b)));
      const out = {};
      for (const k of keys) {
        const v = canonValue(value[k], rawType.replace(/^map:/, ''), undefined);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    case 'prim':
      if (typeof value === 'number' && ['ratio', 'number', 'pct'].includes(p.name)) return Math.round(value * 10000) / 10000;
      return value;
    default:
      return value;
  }
}
function canonObject(obj, def) {
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  const known = new Set();
  for (const f of def.fields) {
    known.add(f.name);
    if (!(f.name in obj)) continue;
    const v = canonValue(obj[f.name], f.type, f.keys);
    if (v !== undefined) out[f.name] = v;
  }
  for (const k of Object.keys(obj).sort()) if (!known.has(k) && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}
/** Canonicalise one row (or the object of an object-shaped file) of an entity: schema field order, no null/undefined, ratios rounded to 4 dp. */
export function canonicalRow(entityName, row) {
  return canonObject(row, ENTITY_BY_NAME.get(entityName));
}

// ── generation context ──────────────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} Context
 * @property {number} seed             root seed (WORLD.WORLD_SEED unless overridden)
 * @property {ReturnType<typeof makeRng>} rng   root stream; call ctx.rng.fork('label') for an independent stream
 * @property {string} now              "2026-10-03T14:00:00Z"
 * @property {number} nowMs
 * @property {typeof CONSTANTS} C      the constants (never hard-code numbers)
 * @property {typeof WORLD} world      personas, scale, scenarios, invariants
 * @property {ReturnType<typeof idFactory>} ids   sequential id factory
 * @property {(table:string)=>any} emptyFor       an empty (valid) value for a table: [] or a minimal object
 * @property {(owner:'core'|'ext')=>string[]} tablesOf  fixture table names by owner
 */
export function createContext({ seed = WORLD.WORLD_SEED } = {}) {
  const rng = makeRng(seed);
  return {
    seed, rng, now: NOW, nowMs: NOW_MS, C: CONSTANTS, world: WORLD, ids: idFactory(),
    tablesOf: (owner) => ENTITIES.filter((e) => e.owner === owner).map((e) => e.table),
    emptyFor(table) {
      const e = ENTITY_BY_TABLE.get(table);
      if (!e) throw new Error(`unknown table ${table}`);
      if ((e.shape ?? 'array') === 'array') return [];
      if (table === 'world') {
        const P = WORLD.PERSONAS;
        return {
          id: 'world_flowd', now: NOW, launch_date: LAUNCH_DATE, seed, contract_version: WORLD.CONTRACT_VERSION,
          personas: {
            creator: { user_id: P.creator.user_id, creator_id: P.creator.creator_id, handle: P.creator.handle },
            brand: { user_id: P.brand.user_id, member_id: P.brand.member_id, brand_id: P.brand.brand_id, app_id: P.brand.app_id },
            admin: { user_id: P.admin.user_id },
          },
          counts: {},
        };
      }
      if (table === 'ticker') {
        return { totals: { total_paid_cents: 0, paid_today_cents: 0, paid_7d_cents: 0, creators_paid: 0, payouts_count: 0, posts_cleared: 0, typical_creator_30d_cents: 0, p25_creator_30d_cents: 0, p75_creator_30d_cents: 0, top_decile_creator_30d_cents: 0, active_creators_30d: 0, updated_at: NOW }, events: [] };
      }
      if (table === 'waitlist') return { totals: { creators: 0, brands: 0, invites_accepted: 0, updated_at: NOW }, leaders: [], demo_position: 1, demo_referrals: 0 };
      if (table === 'state_of_app_ugc') return { quarter: '2026-Q3', quarters: ['2026-Q3'], published_at: NOW, title: 'State of App UGC', settled_posts: 0, total_views: 0, total_paid_cents: 0, categories: [], hooks: [], formats: [], methodology: '', caveats: [] };
      if (table === 'admin_metrics') return { as_of: NOW, targets: [], market_health: { fill_rate_48h: 0, median_fill_hours: 0, median_decision_hours: 0, decided_in_sla_ratio: 0, cleared_on_eta_ratio: 0, disputes_resolved_48h_ratio: 0, funded_live_ratio: 1, first_dollar_median_hours: 0, active_creators_per_live_bounty: 0 }, queues: { fraud_open: 0, disputes_open: 0, verification_open: 0, safety_new: 0, sla_stale: 0, sla_breached: 0, payouts_held: 0 }, next_payout_run: { run_id: 'run_2026-10-09', scheduled_for: '2026-10-09T18:00:00Z', creators: 0, total_cents: 0, holds: 0, held_cents: 0 }, summary: { gmv_30d_cents: 0, fees_30d_cents: 0, paid_total_cents: 0, active_creators_30d: 0, live_bounties: 0, brands_active_30d: 0 }, promise_metrics: [], alerts: [] };
      return {};
    },
  };
}
