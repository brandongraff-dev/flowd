import { describe, expect, it } from "vitest";
import { clamp, clamp01, countWhere, groupBy, lerp, mapRange, mean, median, quantile, round2, roundTo, safeRatio, sum, typicalBand } from "../stats";
import { hashString, mulberry32, pick, randInt, randRange, sample, seededRng, shuffled } from "../rng";

describe("stats", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp01(1.4)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it("rounds", () => {
    expect(round2(0.785)).toBeCloseTo(0.79, 9);
    expect(round2(1.004)).toBe(1);
    expect(roundTo(3.14159, 3)).toBe(3.142);
    expect(roundTo(1234.5, 0)).toBe(1235);
    expect(roundTo(0.12345, 4)).toBe(0.1235);
  });

  it("sums and averages, with an empty list giving 0", () => {
    expect(sum([1, 2, 3.5])).toBe(6.5);
    expect(sum([])).toBe(0);
    expect(mean([2, 4, 9])).toBe(5);
    expect(mean([])).toBe(0);
  });

  it("takes linear-interpolated quantiles of an unsorted list", () => {
    const v = [9, 1, 5, 3, 7];
    expect(quantile(v, 0)).toBe(1);
    expect(quantile(v, 1)).toBe(9);
    expect(quantile(v, 0.5)).toBe(5);
    expect(quantile(v, 0.25)).toBe(3);
    expect(quantile(v, 0.75)).toBe(7);
    expect(quantile([1, 2], 0.5)).toBe(1.5);
    expect(quantile([10], 0.9)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile(v, 7)).toBe(9); // q is clamped
    expect(v).toEqual([9, 1, 5, 3, 7]); // the input is untouched
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("builds the typical-earnings band", () => {
    expect(typicalBand([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toEqual({ n: 10, p25: 33, median: 55, p75: 78, p90: 91 });
    expect(typicalBand([])).toEqual({ n: 0, p25: 0, median: 0, p75: 0, p90: 0 });
    expect(typicalBand([4200])).toEqual({ n: 1, p25: 4200, median: 4200, p75: 4200, p90: 4200 });
  });

  it("interpolates and maps ranges", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(15, 0, 10, 0, 100)).toBe(100);
    expect(mapRange(-5, 0, 10, 0, 100)).toBe(0);
    expect(mapRange(5, 3, 3, 7, 9)).toBe(7);
    expect(mapRange(0.25, 0, 1, 10, 0)).toBe(7.5);
  });

  it("divides safely, counts and groups", () => {
    expect(safeRatio(3, 4)).toBe(0.75);
    expect(safeRatio(3, 0)).toBe(0);
    expect(safeRatio(3, -2)).toBe(0);
    expect(countWhere([1, 2, 3, 4], (n) => n % 2 === 0)).toBe(2);
    const g = groupBy(["apple", "avocado", "banana", "blueberry", "cherry"], (w) => w[0]);
    expect([...g.keys()]).toEqual(["a", "b", "c"]);
    expect(g.get("a")).toEqual(["apple", "avocado"]);
    expect(groupBy([], (x: string) => x).size).toBe(0);
  });
});

describe("seeded randomness (the engine never calls Math.random)", () => {
  it("hashes strings stably (FNV-1a, 32 bit)", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).toBe(0xe40c292c);
    expect(hashString("foobar")).toBe(0xbf9cf968);
    expect(hashString("Lumi")).toBe(hashString("Lumi"));
    expect(hashString("Lumi")).not.toBe(hashString("lumi"));
  });

  it("makes a reproducible stream in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mean(xs)).toBeGreaterThan(0.45);
    expect(mean(xs)).toBeLessThan(0.55);
    expect(new Set(xs).size).toBeGreaterThan(990);
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(xs.slice(0, 5));
  });

  it("seeds from a string or a number, and treats them as different seeds", () => {
    expect(seededRng("lumi")()).toBe(seededRng("lumi")());
    expect(seededRng(7)()).toBe(mulberry32(7)());
    expect(seededRng("lumi")()).not.toBe(seededRng("lumo")());
  });

  it("draws integers inclusive of both ends, and floats in a range", () => {
    const rng = seededRng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(randInt(rng, 3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    expect(randInt(seededRng("one"), 5, 5)).toBe(5);
    for (let i = 0; i < 100; i += 1) {
      const f = randRange(rng, 2, 4);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThan(4);
    }
  });

  it("picks, shuffles and samples without touching the input", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(items).toContain(pick(seededRng("p"), items));
    expect(() => pick(seededRng("p"), [])).toThrow("pick: empty list");
    expect(pick(() => 0.9999999, items)).toBe("f");
    const s = shuffled(seededRng("s"), items);
    expect([...s].sort()).toEqual(items);
    expect(shuffled(seededRng("s"), items)).toEqual(s);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f"]);
    const some = sample(seededRng("n"), items, 3);
    expect(some).toHaveLength(3);
    expect(new Set(some).size).toBe(3);
    expect(sample(seededRng("n"), items, 99)).toHaveLength(6);
    expect(sample(seededRng("n"), items, -2)).toEqual([]);
    expect(sample(seededRng("n"), [], 3)).toEqual([]);
  });
});
