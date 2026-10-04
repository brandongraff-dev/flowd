// Outbound webhooks (the brand developer surface): an outbox in public.webhook_deliveries, signed at send time.
//
//   enqueueEvent()  called by any function when something a brand may subscribe to happens (bounty_funded, post_cleared, rights_expiring ...).
//                   One delivery row per active endpoint subscribed to the event; the rows are the outbox, so enqueueing is a plain insert.
//   deliverDue()    sends rows whose next_retry_at has passed (housekeeping, every 5 minutes). Body = the event JSON; header
//                   X-Flowd-Signature: t=<unix>,v1=<hmac-sha256 hex of "<t>.<body>"> (same scheme as Stripe's, verified the same way);
//                   X-Flowd-Event, X-Flowd-Delivery and a stable event id so receivers can dedupe.
//
// Retries: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h, then `failed`. A 2xx is success; anything else (including a timeout after 10 s) retries.
// An endpoint that fails 20 deliveries in a row is marked `failing` and the brand is told; the next success clears it.

import { bytea, type KeyRing, openJson, signFlowdWebhook } from './crypto.ts';
import { type Db, unwrap, unwrapMaybe } from './db.ts';
import { errorMessage } from './errors.ts';
import { log } from './http.ts';
import { FAILING_AFTER, nextRetryDelaySeconds } from './retry.ts';

export async function enqueueEvent(db: Db, brandId: string, event: string, data: Record<string, unknown>, now: Date): Promise<number> {
  const endpoints = unwrap(
    await db.from('webhooks').select('id').eq('brand_id', brandId).eq('status', 'active').is('deleted_at', null).contains('events', [event]),
  ) as Array<{ id: string }>;
  if (endpoints.length === 0) return 0;
  const eventId = crypto.randomUUID();
  const payload = { id: eventId, type: event, created: now.toISOString(), data };
  unwrap(
    await db.from('webhook_deliveries').insert(
      endpoints.map((e) => ({ webhook_id: e.id, event, event_id: eventId, payload, status: 'retrying', attempt: 0, next_retry_at: now.toISOString() })),
    ).select('id'),
  );
  return endpoints.length;
}

interface DueDelivery {
  id: string;
  webhook_id: string;
  event: string;
  event_id: string;
  payload: unknown;
  attempt: number;
}

interface WebhookRow {
  id: string;
  brand_id: string;
  url: string;
  status: 'active' | 'paused' | 'failing' | 'disabled';
  failure_count: number;
}

export interface DeliveryStats {
  delivered: number;
  retrying: number;
  failed: number;
  skipped: number;
}

async function signingSecret(db: Db, ring: KeyRing, webhookId: string): Promise<string | null> {
  const row = unwrapMaybe(
    await db.from('encrypted_secrets').select('ciphertext,nonce,key_version').eq('owner_table', 'webhooks').eq('owner_id', webhookId).eq('purpose', 'signing').maybeSingle(),
  ) as { ciphertext: string; nonce: string; key_version: number } | null;
  if (!row) return null;
  const opened = await openJson<{ secret: string }>(ring, { ciphertext: bytea.decode(row.ciphertext), nonce: bytea.decode(row.nonce), keyVersion: row.key_version }, `encrypted_secrets:webhooks:${webhookId}:signing`);
  return opened.secret;
}

export async function deliverDue(db: Db, ring: KeyRing, now: Date, userAgent: string, limit = 50): Promise<DeliveryStats> {
  const stats: DeliveryStats = { delivered: 0, retrying: 0, failed: 0, skipped: 0 };
  const due = unwrap(
    await db.from('webhook_deliveries').select('id,webhook_id,event,event_id,payload,attempt').eq('status', 'retrying').lte('next_retry_at', now.toISOString()).order('next_retry_at').limit(limit),
  ) as DueDelivery[];

  for (const d of due) {
    const hook = unwrapMaybe(await db.from('webhooks').select('id,brand_id,url,status,failure_count').eq('id', d.webhook_id).maybeSingle()) as WebhookRow | null;
    if (!hook || hook.status === 'paused' || hook.status === 'disabled') {
      unwrap(await db.from('webhook_deliveries').update({ status: 'failed', response_excerpt: 'The endpoint was paused or removed.', next_retry_at: null }).eq('id', d.id).select('id'));
      stats.skipped++;
      continue;
    }
    const secret = await signingSecret(db, ring, hook.id);
    if (!secret) {
      unwrap(await db.from('webhook_deliveries').update({ status: 'failed', response_excerpt: 'No signing secret is stored for this endpoint.', next_retry_at: null }).eq('id', d.id).select('id'));
      stats.failed++;
      continue;
    }
    const body = JSON.stringify(d.payload);
    const unix = Math.floor(now.getTime() / 1000);
    const started = Date.now();
    let code: number | null = null;
    let excerpt: string | null = null;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'content-type': 'application/json',
          'user-agent': userAgent,
          'x-flowd-event': d.event,
          'x-flowd-delivery': d.id,
          'x-flowd-signature': await signFlowdWebhook(secret, body, unix),
        },
        body,
      });
      code = res.status;
      excerpt = (await res.text()).slice(0, 512);
    } catch (err) {
      excerpt = errorMessage(err).slice(0, 512);
    }
    const attempt = d.attempt + 1;
    const ok = code !== null && code >= 200 && code < 300;
    const delay = ok ? null : nextRetryDelaySeconds(attempt);
    unwrap(
      await db.from('webhook_deliveries').update({
        status: ok ? 'delivered' : delay === null ? 'failed' : 'retrying',
        status_code: code, attempt, attempted_at: now.toISOString(), latency_ms: Date.now() - started, response_excerpt: excerpt,
        next_retry_at: delay === null ? null : new Date(now.getTime() + delay * 1000).toISOString(),
      }).eq('id', d.id).select('id'),
    );
    if (ok) {
      stats.delivered++;
      unwrap(await db.from('webhooks').update({ failure_count: 0, last_success_at: now.toISOString(), status: hook.status === 'failing' ? 'active' : hook.status }).eq('id', hook.id).select('id'));
    } else {
      if (delay === null) stats.failed++;
      else stats.retrying++;
      const failures = hook.failure_count + 1;
      unwrap(await db.from('webhooks').update({ failure_count: failures, status: failures >= FAILING_AFTER && hook.status === 'active' ? 'failing' : hook.status }).eq('id', hook.id).select('id'));
      log('webhooks-out', 'warn', 'delivery_failed', { delivery: d.id, webhook: hook.id, status: code, attempt });
    }
  }
  return stats;
}
