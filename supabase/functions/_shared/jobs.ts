// Idempotent scheduled jobs.
//
// Every job run first CLAIMS its slot: an insert into public.job_runs on the unique (job, scheduled_for). pg_cron retries, overlapping
// runs and manual re-runs of the same slot find the row already there and skip, so a Friday payout run can never pay twice. (The SQL
// functions are idempotent on their own too: settle:cpm:<post>, payout:<id>, topup:<intent> ... are idempotency keys on the ledger.)
//
//   succeeded / skipped  -> the slot is done; later invocations skip
//   running              -> another invocation owns it, unless it started more than STALE_AFTER_MS ago (a crashed run is taken over)
//   failed               -> retryable: the next invocation of the slot takes it over
//
// Slots are floored to a boundary so a late or retried invocation lands on the same row: the top of the hour for hourly jobs, the
// scheduled hour of the day for daily ones. Multi-phase functions use "<function>:<phase>" as the job name.

import { type Db, unwrap, unwrapMaybe } from './db.ts';
import { errorMessage } from './errors.ts';
import { log } from './http.ts';
import { daySlot, hourSlot, minuteSlot } from './slots.ts';

export { daySlot, hourSlot, minuteSlot };

export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface Claim {
  id: string;
  takeover: boolean;
}

interface JobRunRow {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  started_at: string;
  stats: Record<string, unknown>;
}

export async function claimJob(db: Db, job: string, scheduledFor: string, now: Date): Promise<Claim | null> {
  const inserted = unwrap(
    await db.from('job_runs').upsert({ job, scheduled_for: scheduledFor, started_at: now.toISOString(), status: 'running' }, { onConflict: 'job,scheduled_for', ignoreDuplicates: true }).select('id'),
  ) as Array<{ id: string }>;
  if (inserted.length > 0) return { id: inserted[0]!.id, takeover: false };

  const existing = unwrapMaybe(await db.from('job_runs').select('id,status,started_at,stats').eq('job', job).eq('scheduled_for', scheduledFor).maybeSingle()) as JobRunRow | null;
  if (!existing) return null;
  const stale = existing.status === 'running' && now.getTime() - Date.parse(existing.started_at) > STALE_AFTER_MS;
  if (existing.status !== 'failed' && !stale) return null;
  // optimistic takeover: only one caller can flip the row from the state it just read
  const taken = unwrap(
    await db.from('job_runs').update({ status: 'running', started_at: now.toISOString(), finished_at: null, error: null, stats: { ...existing.stats, takeovers: Number(existing.stats.takeovers ?? 0) + 1 } })
      .eq('id', existing.id).eq('status', existing.status).eq('started_at', existing.started_at).select('id'),
  ) as Array<{ id: string }>;
  return taken.length > 0 ? { id: taken[0]!.id, takeover: true } : null;
}

export async function finishJob(db: Db, id: string, status: 'succeeded' | 'failed' | 'skipped', stats: Record<string, unknown>, error?: string): Promise<void> {
  unwrap(await db.from('job_runs').update({ status, finished_at: new Date().toISOString(), stats, error: error ?? null }).eq('id', id).select('id'));
}

export interface JobOutcome<T> {
  skipped: boolean;
  slot: string;
  job: string;
  stats?: T;
}

/**
 * Claim the slot, run `fn`, record the outcome. A thrown error marks the run failed (so the next invocation retries it) and is rethrown
 * so the HTTP layer reports it. `fn` should itself be safe to repeat: it will be, after a crash.
 */
export async function runJob<T extends Record<string, unknown>>(db: Db, job: string, slot: string, now: Date, fn: (claim: Claim) => Promise<T>): Promise<JobOutcome<T>> {
  const claim = await claimJob(db, job, slot, now);
  if (!claim) {
    log(job, 'info', 'slot_skipped', { slot });
    return { skipped: true, slot, job };
  }
  try {
    const stats = await fn(claim);
    await finishJob(db, claim.id, 'succeeded', stats);
    return { skipped: false, slot, job, stats };
  } catch (err) {
    await finishJob(db, claim.id, 'failed', {}, errorMessage(err)).catch((e) => log(job, 'error', 'finish_failed', { message: errorMessage(e) }));
    throw err;
  }
}
