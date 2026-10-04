// Housekeeping rules that are pure (tests/housekeeping.test.ts).

export type SlaState = 'on_track' | 'stale' | 'breached';

export const SLA_HOURS = 72;
export const STALE_AFTER_HOURS = 48;

/** Position in the 72-hour review clock (mirrors public.sla_state_for; the SQL parity vectors are in packages/contract/formula-vectors.json). */
export function slaState(hoursInReview: number): SlaState {
  if (hoursInReview < STALE_AFTER_HOURS) return 'on_track';
  if (hoursInReview <= SLA_HOURS) return 'stale';
  return 'breached';
}

/** Hours since the current version entered review. submissions.sla_due_at is "entered review + 72 h". */
export function hoursInReview(slaDueAt: string, now: Date): number {
  return (now.getTime() - (Date.parse(slaDueAt) - SLA_HOURS * 3_600_000)) / 3_600_000;
}

export interface QaCounts {
  qa_pass: number;
  qa_warn: number;
  qa_fail: number;
}

/** Timeout policy "approve if clean": only when every QA check passed (no warning, no failure, at least one check ran). */
export function isClean(qa: QaCounts): boolean {
  return qa.qa_fail === 0 && qa.qa_warn === 0 && qa.qa_pass > 0;
}

/** The licence price of a released video: the bounty's median Pay Math pay, kept inside the Spec Market's $15 to $500 range. */
export function releasedSpecPriceCents(medianPayCents: number | null | undefined): number {
  const base = typeof medianPayCents === 'number' && medianPayCents > 0 ? medianPayCents : 4000;
  return Math.max(1500, Math.min(50000, Math.round(base)));
}

/** A released video may be listed only with a Flow Score of 55 or more and no failed QA check (the Spec Market's listing rule). */
export function canListAsSpec(flowPoints: number, qa: QaCounts): boolean {
  return flowPoints >= 55 && qa.qa_fail === 0;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
