/** One observed or modelled point on a cohort curve. */
export interface CohortPoint {
  /** Days since install. */
  day: number;
  /** `retention`: a 0..1 share still active. `payback`: cumulative revenue divided by cost (1 = break-even). */
  value: number;
  /** Modelled rather than observed (the projected tail of a young cohort). Drawn dotted. */
  estimated?: boolean;
}

/** Day on which a cohort crosses `target`, linearly interpolated between the two observed points; `null` if it has not yet. */
export function paybackDay(points: readonly CohortPoint[], target = 1): number | null {
  const sorted = [...points].sort((a, b) => a.day - b.day);
  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1];
    const after = sorted[index];
    if (!before || !after) continue;
    if (before.value < target && after.value >= target) {
      const span = after.value - before.value;
      return Math.round(before.day + ((target - before.value) / (span || 1)) * (after.day - before.day));
    }
  }
  return null;
}
