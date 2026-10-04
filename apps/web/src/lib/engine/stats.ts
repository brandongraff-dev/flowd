/**
 * Small numeric helpers shared by every engine module. Pure and deterministic.
 */

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Clamp to 0..1. */
export const clamp01 = (x: number): number => clamp(x, 0, 1);

/** Round to two decimals (half away from zero is not needed here: callers only pass non-negative display ratios). */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Round to `digits` decimals. */
export function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export const sum = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0);

export const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : sum(values) / values.length);

/** Linear-interpolation quantile (type 7) of an unsorted numeric array. q in 0..1. Empty input gives 0. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  const pos = (a.length - 1) * clamp01(q);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export const median = (values: readonly number[]): number => quantile(values, 0.5);

/** Typical-earnings band shown beside any top-earner figure. Values are cents when the input is cents. */
export interface TypicalBand {
  n: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

/** p25 / median / p75 / p90 of a list, rounded to whole units. */
export function typicalBand(values: readonly number[]): TypicalBand {
  return {
    n: values.length,
    p25: Math.round(quantile(values, 0.25)),
    median: Math.round(quantile(values, 0.5)),
    p75: Math.round(quantile(values, 0.75)),
    p90: Math.round(quantile(values, 0.9)),
  };
}

/** Linear interpolation between a and b. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Maps x from [inLo, inHi] to [outLo, outHi], clamped. Handles inLo === inHi by returning outLo. */
export function mapRange(x: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  if (inHi === inLo) return outLo;
  const t = clamp01((x - inLo) / (inHi - inLo));
  return lerp(outLo, outHi, t);
}

/** Ratio helper that returns 0 instead of NaN or Infinity when the denominator is 0. */
export const safeRatio = (num: number, den: number): number => (den > 0 ? num / den : 0);

/** Counts how many items of a list satisfy a predicate. */
export const countWhere = <T>(items: readonly T[], pred: (item: T) => boolean): number => {
  let n = 0;
  for (const item of items) if (pred(item)) n += 1;
  return n;
};

/** Groups items by a string key, preserving encounter order inside each group. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
