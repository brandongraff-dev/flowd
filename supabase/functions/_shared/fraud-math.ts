// The arithmetic behind the fraud gate's inputs (pure; tests/fraud-math.test.ts): hourly view series, the reference band drawn behind the Ops
// chart, and the curve shape label stored on a fraud flag.

export interface HourlyRow {
  ts: string;
  views: number;
}

/** Hourly view deltas from the posting hour, zero-filled so the array index is the hour since posting. */
export function hourlySeries(postedAt: string, until: string, rows: ReadonlyArray<HourlyRow>): number[] {
  const start = Math.floor(Date.parse(postedAt) / 3_600_000);
  const end = Math.floor(Date.parse(until) / 3_600_000);
  const out = new Array<number>(Math.max(0, end - start + 1)).fill(0);
  for (const r of rows) {
    const i = Math.floor(Date.parse(r.ts) / 3_600_000) - start;
    if (i >= 0 && i < out.length) out[i] = (out[i] ?? 0) + r.views;
  }
  return out;
}

/** A reference band for the Ops chart: an organic post decays; the band is 0.4x to 2.2x of that decay, scaled to the post's own volume. */
export function expectedEnvelope(hourly: ReadonlyArray<number>): { expected_low: number[]; expected_high: number[] } {
  const total = hourly.reduce((a, b) => a + b, 0);
  const tau = 22;
  const norm = total > 0 ? total / hourly.reduce((a, _, h) => a + Math.exp(-h / tau), 0) : 0;
  const mid = hourly.map((_, h) => norm * Math.exp(-h / tau));
  return { expected_low: mid.map((v) => Math.round(v * 0.4)), expected_high: mid.map((v) => Math.round(v * 2.2)) };
}

export function curveShape(hourly: ReadonlyArray<number>): 'organic' | 'spiky' | 'flat' | 'stepped' {
  const total = hourly.reduce((a, b) => a + b, 0);
  if (hourly.length < 6 || total === 0) return 'organic';
  const top2 = [...hourly].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
  if (top2 / total >= 0.8) return 'stepped';
  const first = hourly.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const rest = hourly.slice(3);
  const restMean = rest.reduce((a, b) => a + b, 0) / Math.max(1, rest.length);
  if (first > restMean * 12) return 'spiky';
  const tail = hourly.slice(-24);
  if (tail.length >= 24 && Math.min(...tail) > 0 && Math.max(...tail) <= Math.min(...tail) * 1.15) return 'flat';
  return 'organic';
}
