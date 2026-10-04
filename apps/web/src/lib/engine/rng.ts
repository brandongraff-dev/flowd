/**
 * Seeded randomness. The engine never calls Math.random: anything that needs randomness (spot-check sampling,
 * audit generation, tie-breaks) takes an injected `Rng`, so results are reproducible in tests and across web and iOS.
 */

/** A function returning a float in [0, 1). */
export type Rng = () => number;

/** FNV-1a 32-bit hash of a string. Stable across platforms. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a tiny, fast, well-distributed 32-bit PRNG (the same stream the generated art uses). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded Rng from a string or number seed. */
export function seededRng(seed: string | number): Rng {
  return mulberry32(typeof seed === "number" ? seed : hashString(seed));
}

/** Integer in [lo, hi] inclusive. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Float in [lo, hi). */
export function randRange(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** One element of a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty list");
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** A shuffled copy (Fisher-Yates). The input is not modified. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** n distinct elements chosen uniformly (n is clamped to the list length). Order follows the shuffle. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  return shuffled(rng, items).slice(0, Math.max(0, Math.min(n, items.length)));
}
