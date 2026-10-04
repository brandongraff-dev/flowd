// Slot boundaries for job_runs (pure; tests/slots.test.ts). A slot is the instant a job run is FOR: floored to a boundary so a late or retried
// invocation lands on the same job_runs row as the first one.

export function hourSlot(now: Date): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/** Floor to a multiple of `minutes` within the hour (30 for the payout reconciler, 5 for outbound webhooks). */
export function minuteSlot(now: Date, minutes: number): string {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / minutes) * minutes);
  return d.toISOString();
}

/** The most recent occurrence of hourUtc:00:00Z at or before `now`. */
export function daySlot(now: Date, hourUtc: number): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(hourUtc);
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}
