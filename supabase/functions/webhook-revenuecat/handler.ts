// webhook-revenuecat: RevenueCat -> flowd.   POST /functions/v1/webhook-revenuecat?app=<flowd app id>
// (public URL: https://api.joinflowd.io/webhooks/revenuecat?app=app_lumi, the "webhook_url" of the app's RevenueCat integration)
//
// A brand pastes that URL and a secret into RevenueCat's webhook settings; RevenueCat sends the secret back in the Authorization header on
// every event. This function
//   1. authenticates the PROVIDER (secret compare in constant time; unauthenticated requests are dropped with 401 and never stored)
//   2. writes the raw event to the inbox (inbound_events, unique on the RevenueCat event id): redeliveries are idempotent
//   3. normalises it (_shared/revenuecat.ts), matches it to a creator's tracking link or offer code, stores it in revenuecat_events
//   4. turns trial and first-payment events into conversions through public.record_conversion(): CPA pays on link and code only
//   5. tells the brand (conversion_tracked webhook) and keeps the integration's health fields current
// It always answers 200 once the event is safely stored, even when it is unmatched or ignored, so RevenueCat does not retry what we have
// already understood. A processing failure after storage answers 500 so RevenueCat retries, and the housekeeping job replays it too.

import { timingSafeEqual } from '../_shared/crypto.ts';
import { loadEnv } from '../_shared/env.ts';
import { type Db, rpc, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { errorMessage, FlowdError } from '../_shared/errors.ts';
import { handle, jsonResponse, log, readJson, requireMethod } from '../_shared/http.ts';
import { markInbound, storeInbound } from '../_shared/inbox.ts';
import { attributionKeys, authorizationMatches, conversionFor, type NormalizedRcEvent, normalizeRevenueCatEvent, type RevenueCatPayload, UnsupportedEvent } from '../_shared/revenuecat.ts';
import { enqueueEvent } from '../_shared/webhooks-out.ts';
import { bytea, loadKeyRing, openJson } from '../_shared/crypto.ts';
import type { Env } from '../_shared/env.ts';

/** Countries the database models (public.country). Anything else is stored without a country. */
const COUNTRIES = new Set(['US', 'CA', 'GB', 'AU', 'IE', 'DE', 'FR', 'ES', 'NL', 'BR', 'MX', 'PH']);

interface LinkRow {
  id: string;
  creator_id: string;
  bounty_id: string;
  post_id: string | null;
}

export interface ProcessResult {
  matchStatus: 'matched' | 'unmatched' | 'duplicate' | 'ignored';
  source: 'link' | 'code' | null;
  kind: 'trial' | 'paid' | null;
  conversionId: string | null;
}

/** The secret configured for this app: the sealed one in encrypted_secrets (purpose revenuecat_webhook), else the project-wide env secret (demo and local). */
async function secretFor(db: Db, env: Env, appId: string): Promise<string | null> {
  if (Object.keys(env.tokenKeys).length > 0) {
    const row = unwrapMaybe(
      await db.from('encrypted_secrets').select('ciphertext,nonce,key_version').eq('owner_table', 'apps').eq('owner_id', appId).eq('purpose', 'revenuecat_webhook').maybeSingle(),
    ) as { ciphertext: string; nonce: string; key_version: number } | null;
    if (row) {
      const ring = await loadKeyRing(env.tokenKeys, env.tokenKeyActive);
      const opened = await openJson<{ secret: string }>(ring, { ciphertext: bytea.decode(row.ciphertext), nonce: bytea.decode(row.nonce), keyVersion: row.key_version }, `encrypted_secrets:apps:${appId}:revenuecat_webhook`);
      return opened.secret;
    }
  }
  return env.revenuecat.webhookSecret ?? null;
}

/** Store, match and (when it carries one) book the conversion of one authenticated event. Safe to call again for the same event. */
export async function processEvent(db: Db, appId: string, event: NormalizedRcEvent, raw: RevenueCatPayload, now: Date): Promise<ProcessResult> {
  const app = unwrapMaybe(await db.from('apps').select('id,brand_id,sdk_status').eq('id', appId).maybeSingle()) as { id: string; brand_id: string; sdk_status: string } | null;
  if (!app) throw new FlowdError('not_found', `App ${appId} does not exist.`, 404);

  // 1. who brought this customer? An offer code redeemed beats a tracking link followed.
  const keys = attributionKeys(event);
  let link: LinkRow | null = null;
  let source: 'link' | 'code' | null = null;
  if (keys.offerCode) {
    const code = unwrapMaybe(await db.from('offer_code_pool').select('assigned_link_id').eq('app_id', appId).eq('code', keys.offerCode).maybeSingle()) as { assigned_link_id: string | null } | null;
    if (code?.assigned_link_id) {
      link = unwrapMaybe(await db.from('attribution_links').select('id,creator_id,bounty_id,post_id').eq('id', code.assigned_link_id).maybeSingle()) as LinkRow | null;
      if (link) source = 'code';
    }
  }
  if (!link && keys.linkCode) {
    link = unwrapMaybe(await db.from('attribution_links').select('id,creator_id,bounty_id,post_id').eq('app_id', appId).eq('code', keys.linkCode).maybeSingle()) as LinkRow | null;
    if (link) source = 'link';
  }

  const draft = conversionFor(event);
  const matched = link !== null && link.post_id !== null;
  const matchStatus: ProcessResult['matchStatus'] = draft === null ? 'ignored' : matched ? 'matched' : 'unmatched';

  // 2. the typed copy of the event (unique on app + event id). A repeat of a fully booked event books nothing; a repeat of one that stopped
  //    half way (stored, conversion not yet booked) resumes at step 3.
  const bookable = draft !== null && link !== null && link.post_id !== null && source !== null;
  let rowId: string;
  const existing = unwrapMaybe(await db.from('revenuecat_events').select('id,matched_conversion_id').eq('app_id', appId).eq('idempotency_key', event.eventId).maybeSingle()) as { id: string; matched_conversion_id: string | null } | null;
  if (existing) {
    if (existing.matched_conversion_id || !bookable) return { matchStatus: 'duplicate', source: null, kind: null, conversionId: existing.matched_conversion_id };
    rowId = existing.id;
  } else {
    const inserted = unwrap(
      await db.from('revenuecat_events').upsert({
        app_id: appId, event_type: event.type, period_type: event.periodType, app_user_id: event.appUserId, product_id: event.productId, price_cents: event.priceCents,
        currency: event.currency, is_trial_conversion: event.isTrialConversion, offer_code: event.offerCode, subscriber_attributes: event.subscriberAttributes,
        environment: event.environment, purchased_at: event.purchasedAt, expiration_at: event.expirationAt, received_at: event.receivedAt,
        match_status: matchStatus === 'matched' ? 'unmatched' : matchStatus, // flipped to matched by book_rc_conversion, in the same transaction as the booking
        matched_link_id: link?.id ?? null, matched_creator_id: link?.creator_id ?? null, idempotency_key: event.eventId, payload: raw,
      }, { onConflict: 'app_id,idempotency_key', ignoreDuplicates: true }).select('id'),
    ) as Array<{ id: string }>;
    if (inserted.length === 0) return { matchStatus: 'duplicate', source: null, kind: null, conversionId: null };
    rowId = inserted[0]!.id;
  }

  // 3. the conversion, booked through the SQL function that records, batches, labels confidence and stamps the event in one transaction
  let conversionId: string | null = null;
  if (bookable && draft && link && source) {
    const country = event.countryCode && COUNTRIES.has(event.countryCode) ? event.countryCode : null;
    conversionId = await rpc<string>(db, 'book_rc_conversion', {
      p_rc_event_id: rowId, p_link_id: link.id, p_kind: draft.kind, p_source: source, p_occurred_at: draft.occurredAt, p_revenue_cents: draft.revenueCents, p_country: country,
    });
    if (source === 'code' && event.offerCode) {
      const pool = unwrapMaybe(await db.from('offer_code_pool').select('id,redemptions').eq('app_id', appId).eq('code', event.offerCode).maybeSingle()) as { id: string; redemptions: number } | null;
      if (pool && draft.kind === 'trial') unwrap(await db.from('offer_code_pool').update({ redemptions: pool.redemptions + 1 }).eq('id', pool.id).eq('redemptions', pool.redemptions).select('id'));
    }
    await enqueueEvent(db, app.brand_id, 'conversion_tracked', { app_id: appId, bounty_id: link.bounty_id, creator_id: link.creator_id, kind: draft.kind, source, revenue_cents: draft.revenueCents, occurred_at: draft.occurredAt }, now);
  }

  // 4. integration health: the SDK is "verified" once an event carries our link attribute; every authenticated event updates last_event_at
  if (event.subscriberAttributes.flowd_link && app.sdk_status !== 'verified') unwrap(await db.from('apps').update({ sdk_status: 'verified' }).eq('id', appId).select('id'));
  unwrap(await db.from('integrations').update({ last_event_at: now.toISOString(), status: 'connected' }).eq('app_id', appId).eq('kind', 'revenuecat').is('deleted_at', null).select('id'));

  return { matchStatus, source, kind: draft?.kind ?? null, conversionId };
}

export const handler = handle('webhook-revenuecat', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['revenuecat']);
  const db = serviceClient(env);
  const now = new Date();
  const appId = new URL(req.url).searchParams.get('app');
  if (!appId) throw new FlowdError('validation_failed', 'Add ?app=<your flowd app id> to the webhook URL.', 422);

  const secret = await secretFor(db, env, appId);
  if (!secret || !authorizationMatches(req.headers.get('authorization'), secret, timingSafeEqual)) {
    throw new FlowdError('invalid_signature', 'The Authorization header does not match the webhook secret of this app.', 401);
  }

  const payload = await readJson<RevenueCatPayload>(req);
  const eventId = payload.event?.id;
  if (!eventId) throw new FlowdError('validation_failed', 'The body must be a RevenueCat webhook with event.id.', 422);

  // the inbox keeps the raw event plus the app id from the URL, so housekeeping can replay a failed event without the request
  const stored = await storeInbound(db, { provider: 'revenuecat', eventId, eventType: payload.event?.type ?? null, payload: { ...payload, flowd_app_id: appId }, signatureValid: true });
  if (stored.duplicate && (stored.status === 'processed' || stored.status === 'ignored' || stored.status === 'dead')) {
    return jsonResponse({ received: true, duplicate: true });
  }

  try {
    const event = normalizeRevenueCatEvent(payload, now);
    const result = await processEvent(db, appId, event, payload, now);
    await markInbound(db, stored.id, result.matchStatus === 'matched' || result.matchStatus === 'duplicate' ? 'processed' : 'ignored');
    log('webhook-revenuecat', 'info', 'event', { event_id: eventId, type: event.type, match: result.matchStatus, source: result.source, kind: result.kind });
    return jsonResponse({ received: true, match: result.matchStatus, source: result.source, kind: result.kind, conversion_id: result.conversionId });
  } catch (err) {
    if (err instanceof UnsupportedEvent) {
      await markInbound(db, stored.id, 'ignored', err.reason);
      return jsonResponse({ received: true, ignored: err.reason });
    }
    await markInbound(db, stored.id, 'failed', errorMessage(err));
    throw err;
  }
});
