// Shared helpers for the CORE generator stages (core-*.mjs). Pure functions over the seeded rng from lib.mjs. No Math.random, no Date.now.

import { NOW, NOW_EPOCH, iso, ms, addHours, addDays, dateOf, HOUR_MS, DAY_MS, clamp, mulRate, makeId, slugify, pad, sum } from './lib.mjs';
import { CONSTANTS as C } from '../../schema/constants.mjs';
import { clockLabel, nextWeeklyAt, prevWeeklyAt, dayStart } from '../../schema/time.mjs';

export { NOW, NOW_EPOCH, iso, ms, addHours, addDays, dateOf, HOUR_MS, DAY_MS, clamp, mulRate, makeId, slugify, pad, sum, C, clockLabel, nextWeeklyAt, prevWeeklyAt, dayStart };

/** timestamp helpers */
export const T = (isoStr) => ms(isoStr);
export const atMs = (t) => iso(t);
export const minMs = (...xs) => Math.min(...xs);
export const maxMs = (...xs) => Math.max(...xs);
export const hoursOf = (fromIso, toIso) => (ms(toIso) - ms(fromIso)) / HOUR_MS;
export const isFuture = (isoStr) => ms(isoStr) > NOW_EPOCH;
export const capNowIso = (isoStr) => (ms(isoStr) > NOW_EPOCH ? NOW : isoStr);
export const dayIndex = (isoOrDate) => Math.floor((ms(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : dayStart(isoOrDate)) - ms('2026-07-05T00:00:00Z')) / DAY_MS);

/** Round a cents amount to a "nice" budget step: multiples of $50 below $2,000, $100 above, $250 above $6,000. */
export function niceBudget(cents, mode = 'up') {
  const step = cents < 200_000 ? 5_000 : cents < 600_000 ? 10_000 : 25_000;
  const f = mode === 'down' ? Math.floor : Math.ceil;
  return Math.max(10_000, f(cents / step) * step);
}

/** Weighted pick without replacement style helpers. */
export function pickWeightedBy(rng, items, weightFn) {
  let total = 0;
  const w = items.map((it) => { const x = Math.max(0, weightFn(it)); total += x; return x; });
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}

/** median / quantile of numbers */
export function med(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function quant(values, q) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** Money formatting for memos */
export const money = (c) => `$${Math.floor(Math.abs(c) / 100).toLocaleString('en-US')}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
export const intFmt = (n) => Math.round(n).toLocaleString('en-US');

/** first / last */
export const last = (arr) => arr[arr.length - 1];
export const first = (arr) => arr[0];

/** log-normal with given median, bounded */
export function logn(rng, median, sigma, lo = 0, hi = Infinity) {
  return clamp(rng.logNormal(median, sigma), lo, hi);
}

/** pick n distinct from arr using rng */
export const pickN = (rng, arr, n) => rng.sample(arr, n);

/** deterministic short hex string of n chars */
export function hexString(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[rng.int(0, 15)];
  return s;
}
/** deterministic lowercase alphanumeric string */
export function alnum(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[rng.int(0, 35)];
  return s;
}

/** Clearing runs: 14:00Z on any day. The first run at or after t. */
export function runAtOrAfter(tIso) {
  const base = ms(dayStart(tIso)) + 14 * HOUR_MS;
  return iso(base >= ms(tIso) ? base : base + DAY_MS);
}
/** Friday 18:00Z at or after t (the weekly payout run that pays an item cleared at t) */
export function weeklyRunFor(clearedIso) {
  return nextWeeklyAt(iso(ms(clearedIso) - 1000), 5, 18);
}
/** all Friday 18:00Z runs from 2026-07-10 up to and including `toIso` */
export function weeklyRuns(toIso) {
  const out = [];
  for (let t = ms('2026-07-10T18:00:00Z'); t <= ms(toIso); t += 7 * DAY_MS) out.push(iso(t));
  return out;
}
export const runIdOf = (runIso) => `run_${dateOf(runIso)}`;

/** Business-day arrival: Friday 18:00 run -> Monday; any other -> +1 business day at 15:00Z */
export function arrivalAfter(startIso, businessDays = 1) {
  let t = ms(startIso);
  let n = 0;
  while (n < businessDays) {
    t += DAY_MS;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  const d = new Date(t);
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 0, 0));
}
