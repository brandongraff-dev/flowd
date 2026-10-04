// The webhook inbox. Every inbound provider event is written to public.inbound_events BEFORE it is processed, unique on
// (provider, event_id). That gives three guarantees:
//   * redeliveries are idempotent: the second delivery finds the row and returns 200 without doing anything
//   * a failure while processing is not lost: the row stays `failed` with the error, and the housekeeping job replays it (up to 5 times,
//     then `dead` for a human)
//   * we can prove what a provider told us, byte for byte, long after the fact (payload is the raw event)

import { type Db, unwrap, unwrapMaybe } from './db.ts';

export type InboundProvider = 'revenuecat' | 'stripe' | 'tiktok' | 'instagram' | 'meta' | 'mmp' | 'other';
export type InboundStatus = 'received' | 'processed' | 'ignored' | 'failed' | 'dead';

export const MAX_ATTEMPTS = 5;

export interface StoredInbound {
  id: string;
  duplicate: boolean;
  /** Status of the existing row for a duplicate (so a `failed` redelivery can be retried right away). */
  status: InboundStatus;
}

export async function storeInbound(
  db: Db,
  input: { provider: InboundProvider; eventId: string; eventType: string | null; payload: unknown; signatureValid: boolean },
): Promise<StoredInbound> {
  const inserted = unwrap(
    await db.from('inbound_events')
      .upsert(
        { provider: input.provider, event_id: input.eventId, event_type: input.eventType, payload: input.payload, signature_valid: input.signatureValid, status: 'received' },
        { onConflict: 'provider,event_id', ignoreDuplicates: true },
      )
      .select('id,status'),
  ) as Array<{ id: string; status: InboundStatus }>;
  if (inserted.length > 0) return { id: inserted[0]!.id, duplicate: false, status: inserted[0]!.status };
  const existing = unwrapMaybe(await db.from('inbound_events').select('id,status').eq('provider', input.provider).eq('event_id', input.eventId).maybeSingle()) as { id: string; status: InboundStatus } | null;
  if (!existing) throw new Error('inbound event vanished between insert and select');
  return { id: existing.id, duplicate: true, status: existing.status };
}

export async function markInbound(db: Db, id: string, status: Exclude<InboundStatus, 'received'>, error?: string): Promise<void> {
  const row = unwrapMaybe(await db.from('inbound_events').select('attempts').eq('id', id).maybeSingle()) as { attempts: number } | null;
  const attempts = (row?.attempts ?? 0) + (status === 'failed' || status === 'dead' ? 1 : 0);
  const finalStatus: InboundStatus = status === 'failed' && attempts >= MAX_ATTEMPTS ? 'dead' : status;
  unwrap(await db.from('inbound_events').update({ status: finalStatus, error: error ?? null, attempts, processed_at: finalStatus === 'processed' || finalStatus === 'ignored' ? new Date().toISOString() : null }).eq('id', id).select('id'));
}
