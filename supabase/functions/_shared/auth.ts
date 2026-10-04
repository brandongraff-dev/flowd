// Who may call an edge function.
//
//   Scheduled jobs (settle-window, sync-views, weekly-payouts, expiry-alerts, daily-drop, housekeeping): pg_cron calls them through
//   private.invoke_edge_function() (migration 0006), which sends the shared secret as `x-cron-secret`. The API server and Ops may also call
//   them (for example to dispatch an instant payout) with the service-role key as a bearer token.
//
//   Provider webhooks (webhook-revenuecat, webhook-stripe): no flowd credential exists, so they authenticate the PROVIDER instead
//   (signature or shared secret) and are deployed with verify_jwt = false (supabase/config.toml).

import { timingSafeEqual } from './crypto.ts';
import { FlowdError } from './errors.ts';
import type { Env } from './env.ts';

export type Caller = 'cron' | 'service';

export function requireCaller(req: Request, env: Pick<Env, 'cronSecret' | 'serviceRoleKey'>): Caller {
  const cron = req.headers.get('x-cron-secret');
  if (cron && env.cronSecret && timingSafeEqual(cron, env.cronSecret)) return 'cron';
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (env.serviceRoleKey && timingSafeEqual(token, env.serviceRoleKey)) return 'service';
  }
  throw new FlowdError('forbidden', 'This endpoint is for scheduled jobs and the flowd API only.', 403);
}
