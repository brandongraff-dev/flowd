// weekly-payouts: the Friday payout run, the reconciler and the on-demand dispatch.   POST /functions/v1/weekly-payouts  { "phase": "run" | "reconcile" | "dispatch" }
//
//   phase "run"        pg_cron: Fridays 18:00 UTC. Weekly payouts are FREE and run on the cleared money parked on each creator's scheduled payout
//                      (attached the moment it cleared, so the Wallet could always say "pays Friday"). For every payout due:
//                        start_payout()   gates it: identity verified, tax info on file (W-9), an active payout method. Pass -> `processing`,
//                                         fail -> `held` with a NAMED reason, and the creator is told exactly what unblocks it
//                        dispatchPayout() Stripe transfer to the creator's Connect account, then the bank payout (idempotent keys), then
//                                         mark_payout_in_transit(); a payout Stripe already reports paid is completed on the spot
//                      and the payout_runs row records totals, counts and the holds.
//   phase "reconcile"  pg_cron: every 30 minutes at :15 and :45. Repairs and closes the loop:
//                        - `processing` payouts older than 10 minutes (a crash between steps) are dispatched again (the calls are idempotent)
//                        - `in_transit` payouts Stripe has settled but whose webhook we missed are completed or failed
//                        - held payouts whose cause was fixed (ID verified, W-9 filed, method added) go back to `scheduled` for the next run
//                        - runs with nothing left in flight are marked complete
//   phase "dispatch"   the API calls it right after create_instant_payout() (service-role bearer): { "payout_id": "pay_..." } sends that
//                      one payout now. Instant cash-outs: 1.5% fee (min $0.50, max $15) shown before confirm and already netted in the payout.
//
// Money safety: the ledger moves only in complete_payout() (creator -gross, bank +net, platform fee +fee, rows marked paid) and only after
// Stripe confirms; a failed payout leaves every row exactly where it was.

import { type Adapters, buildAdapters } from '../_shared/adapters/index.ts';
import { requireCaller } from '../_shared/auth.ts';
import { type Db, rpc, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { loadEnv, now as clock } from '../_shared/env.ts';
import { errorMessage, FlowdError } from '../_shared/errors.ts';
import { handle, log, readJson, requireMethod } from '../_shared/http.ts';
import { daySlot, minuteSlot, runJob } from '../_shared/jobs.ts';
import { mapLimit } from '../_shared/pool.ts';
import { currentRunAt } from './run-at.ts';
import { dispatchPayout, type DispatchResult, loadPayout, notifyPayoutHeld, notifyPayoutPaid, reconcileInTransit } from '../_shared/payouts.ts';

interface Body {
  phase?: 'run' | 'reconcile' | 'dispatch';
  payout_id?: string;
  scheduled_for?: string;
  /** Run on a non-Friday (manual catch-up by Ops). */
  force?: boolean;
}

export interface RunStats extends Record<string, unknown> {
  run_id: string | null;
  due: number;
  started: number;
  held: number;
  paid: number;
  in_transit: number;
  failed: number;
  gross_cents: number;
  net_cents: number;
  held_cents: number;
  holds: Array<{ payout_id: string; creator_id: string; reason: string; cents: number }>;
}

export interface ReconcileStats extends Record<string, unknown> {
  redispatched: number;
  settled: number;
  released_holds: number;
  runs_completed: number;
  failures: number;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export async function runWeekly(db: Db, adapters: Adapters, now: Date, force: boolean): Promise<RunStats> {
  const stats: RunStats = { run_id: null, due: 0, started: 0, held: 0, paid: 0, in_transit: 0, failed: 0, gross_cents: 0, net_cents: 0, held_cents: 0, holds: [] };
  if (!force && now.getUTCDay() !== 5) return stats; // not a payout day: nothing to do (cron only fires on Fridays; this guards manual calls)
  const runAt = currentRunAt(now);
  const runId = `run_${isoDate(runAt)}`;
  stats.run_id = runId;
  unwrap(await db.from('payout_runs').upsert({ id: runId, run_date: isoDate(runAt), scheduled_for: runAt.toISOString(), status: 'scheduled' }, { onConflict: 'id', ignoreDuplicates: true }).select('id'));
  unwrap(await db.from('payout_runs').update({ status: 'running', initiated_at: now.toISOString() }).eq('id', runId).select('id'));

  const due = unwrap(
    await db.from('payouts').select('id,creator_id,gross_cents,net_cents').eq('kind', 'weekly').eq('status', 'scheduled').lte('scheduled_for', now.toISOString()).order('scheduled_for').limit(5000),
  ) as Array<{ id: string; creator_id: string; gross_cents: number; net_cents: number }>;
  stats.due = due.length;

  const results = await mapLimit(due, 4, async (p) => {
    // a payout rolled over from an earlier run joins this one
    unwrap(await db.from('payouts').update({ run_id: runId }).eq('id', p.id).neq('run_id', runId).select('id'));
    const started = await rpc<{ status: string; hold_reason?: string }>(db, 'start_payout', { p_payout_id: p.id });
    if (started.status === 'held') {
      stats.held++;
      stats.held_cents += p.net_cents;
      stats.holds.push({ payout_id: p.id, creator_id: p.creator_id, reason: started.hold_reason ?? 'admin_hold', cents: p.net_cents });
      await notifyPayoutHeld(db, adapters.push, p.id, started.hold_reason ?? 'admin_hold', now);
      return;
    }
    if (started.status !== 'processing') return;
    stats.started++;
    stats.gross_cents += p.gross_cents;
    stats.net_cents += p.net_cents;
    const res = await dispatchPayout(db, adapters.payments, p.id);
    if (res.outcome === 'paid') {
      stats.paid++;
      await notifyPayoutPaid(db, adapters.push, p.id, now);
    } else if (res.outcome === 'in_transit') stats.in_transit++;
    else if (res.outcome === 'failed') stats.failed++;
  });
  for (const r of results) if (!r.ok) log('weekly-payouts', 'error', 'payout_failed', { message: errorMessage(r.error) });

  unwrap(
    await db.from('payout_runs').update({
      payouts_count: stats.due, total_gross_cents: stats.gross_cents, total_fee_cents: 0, total_net_cents: stats.gross_cents,
      paid_count: stats.paid, failed_count: stats.failed, held_count: stats.held, held_cents: stats.held_cents, holds: stats.holds,
    }).eq('id', runId).select('id'),
  );
  return stats;
}

/** Which held payouts can go back to scheduled because their cause is fixed. */
async function releaseResolvedHolds(db: Db, limit: number): Promise<number> {
  const held = unwrap(await db.from('payouts').select('id,creator_id,hold_reason').eq('status', 'held').limit(limit)) as Array<{ id: string; creator_id: string; hold_reason: string | null }>;
  let released = 0;
  for (const h of held) {
    let fixed = false;
    if (h.hold_reason === 'identity_check') {
      const c = unwrapMaybe(await db.from('creators').select('verification_status').eq('id', h.creator_id).maybeSingle()) as { verification_status: string } | null;
      fixed = c?.verification_status === 'verified';
    } else if (h.hold_reason === 'payout_method_missing') {
      const m = unwrap(await db.from('payout_methods').select('id').eq('creator_id', h.creator_id).eq('status', 'active').is('deleted_at', null).limit(1)) as Array<{ id: string }>;
      fixed = m.length > 0;
    } else if (h.hold_reason === 'tax_info_missing') {
      const t = unwrap(await db.from('tax_profiles').select('status').eq('creator_id', h.creator_id).in('status', ['submitted', 'verified']).limit(1)) as Array<{ status: string }>;
      fixed = t.length > 0;
    }
    if (fixed) {
      await rpc(db, 'release_payout_hold', { p_payout_id: h.id });
      released++;
    }
  }
  return released;
}

export async function runReconcile(db: Db, adapters: Adapters, now: Date): Promise<ReconcileStats> {
  const stats: ReconcileStats = { redispatched: 0, settled: 0, released_holds: 0, runs_completed: 0, failures: 0 };
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();

  const stuck = unwrap(await db.from('payouts').select('id').eq('status', 'processing').lte('initiated_at', tenMinutesAgo).limit(200)) as Array<{ id: string }>;
  for (const r of await mapLimit(stuck, 4, (p) => dispatchPayout(db, adapters.payments, p.id))) {
    if (r.ok) {
      stats.redispatched++;
      if (r.value.outcome === 'paid') await notifyPayoutPaid(db, adapters.push, r.value.payoutId, now);
    } else stats.failures++;
  }

  // weekly bank payouts take days; instant ones minutes. Ask Stripe about anything that has been in transit past its expected time.
  const instantCutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
  const weeklyCutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const transit = unwrap(await db.from('payouts').select('id,kind,initiated_at').eq('status', 'in_transit').limit(500)) as Array<{ id: string; kind: 'weekly' | 'instant'; initiated_at: string | null }>;
  const dueCheck = transit.filter((p) => p.initiated_at !== null && p.initiated_at <= (p.kind === 'instant' ? instantCutoff : weeklyCutoff));
  for (const r of await mapLimit(dueCheck, 4, (p) => reconcileInTransit(db, adapters.payments, p.id))) {
    if (r.ok) {
      if (r.value.outcome === 'paid') {
        stats.settled++;
        await notifyPayoutPaid(db, adapters.push, r.value.payoutId, now);
      } else if (r.value.outcome === 'failed') stats.settled++;
    } else {
      stats.failures++;
      log('weekly-payouts', 'error', 'reconcile_failed', { message: errorMessage(r.error) });
    }
  }

  stats.released_holds = await releaseResolvedHolds(db, 500);

  const running = unwrap(await db.from('payout_runs').select('id').eq('status', 'running')) as Array<{ id: string }>;
  for (const run of running) {
    const open = unwrap(await db.from('payouts').select('id').eq('run_id', run.id).in('status', ['scheduled', 'processing', 'in_transit']).limit(1)) as Array<{ id: string }>;
    if (open.length > 0) continue;
    const all = unwrap(await db.from('payouts').select('status,gross_cents,net_cents').eq('run_id', run.id)) as Array<{ status: string; gross_cents: number; net_cents: number }>;
    const paid = all.filter((p) => p.status === 'paid');
    unwrap(
      await db.from('payout_runs').update({
        status: 'complete', completed_at: now.toISOString(), paid_count: paid.length, failed_count: all.filter((p) => p.status === 'failed').length,
        total_gross_cents: all.reduce((a, p) => a + p.gross_cents, 0), total_net_cents: all.reduce((a, p) => a + p.gross_cents, 0),
      }).eq('id', run.id).select('id'),
    );
    stats.runs_completed++;
  }
  return stats;
}

export const handler = handle('weekly-payouts', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'stripe', 'push']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  const phase = body.phase ?? 'run';
  const now = clock(env);
  const db = serviceClient(env);
  const adapters = buildAdapters(env);

  if (phase === 'dispatch') {
    if (!body.payout_id) throw new FlowdError('validation_failed', 'payout_id is required.', 422);
    const payout = await loadPayout(db, body.payout_id);
    if (!payout) throw new FlowdError('not_found', `Payout ${body.payout_id} does not exist.`, 404);
    const res: DispatchResult = await dispatchPayout(db, adapters.payments, body.payout_id);
    if (res.outcome === 'paid') await notifyPayoutPaid(db, adapters.push, body.payout_id, now);
    return { ...res };
  }
  if (phase === 'reconcile') {
    const outcome = await runJob<ReconcileStats>(db, 'weekly-payouts:reconcile', body.scheduled_for ?? minuteSlot(now, 30), now, () => runReconcile(db, adapters, now));
    return { ...outcome };
  }
  if (phase !== 'run') throw new FlowdError('validation_failed', 'phase must be "run", "reconcile" or "dispatch".', 422);
  const outcome = await runJob<RunStats>(db, 'weekly-payouts:run', body.scheduled_for ?? daySlot(now, 18), now, () => runWeekly(db, adapters, now, body.force === true));
  return { ...outcome };
});
