// Which payout run is "now" in? (pure; tests/run-at.test.ts) The weekly run is Friday 18:00:00Z; this is the most recent one at or before `now`.

/** Friday 18:00:00Z of the run containing `now` (the most recent one at or before it). */
export function currentRunAt(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(18, 0, 0, 0);
  while (d.getUTCDay() !== 5 || d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
