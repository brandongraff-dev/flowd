// expiry-alerts: Rights Vault expiry and "ads stop when the rights do".   pg_cron: daily 09:00 UTC  ->  POST /functions/v1/expiry-alerts
//
// Rights are a promise to creators and a deadline for brands (DECISIONS section 3): organic posting is always included; paid-ad usage defaults to
// 90 days, renewable at 25% of the base fee per 30 days; alerts at 30, 14 and 7 days; ads stop automatically at the end of the term or of the
// Spark code. This job keeps those promises.
//
//   alerts     a grant with an end date inside 30 days becomes `expiring` and the brand's rights managers get one alert per threshold crossed
//              (30, 14, 7; rights_grants.alerts_sent records which, so nothing is sent twice and a missed day catches up with the tightest one).
//              The alert says what ends, the price to renew (renewal_price_cents per 30 days) and that ads will stop.
//   spark      the same for an ad whose Spark code ends within 7 days
//   expire     a grant past its end becomes `expired`; every ad running on it (and every ad whose Spark code ended) is stopped on the ad
//              platform through the AdsAdapter and marked expired (or ended when it was paused), and the brand is told it stopped
//
// Idempotent: the slot is the day; alerts_sent and the grant/ad statuses make a repeat a no-op.

import { type AdAccount, type AdPlatform } from '../_shared/adapters/ads.ts';
import { buildAdapters, type Adapters } from '../_shared/adapters/index.ts';
import { requireCaller } from '../_shared/auth.ts';
import { bytea, loadKeyRing, type KeyRing, openJson } from '../_shared/crypto.ts';
import { type Db, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { loadEnv, now as clock } from '../_shared/env.ts';
import { errorMessage } from '../_shared/errors.ts';
import { handle, log, readJson, requireMethod } from '../_shared/http.ts';
import { daySlot, runJob } from '../_shared/jobs.ts';
import { brandRecipients, notify } from '../_shared/notify.ts';
import { enqueueEvent } from '../_shared/webhooks-out.ts';
import { alertToSend } from './thresholds.ts';

interface Body {
  scheduled_for?: string;
}

export interface ExpiryStats extends Record<string, unknown> {
  alerts_sent: number;
  became_expiring: number;
  spark_alerts: number;
  grants_expired: number;
  ads_stopped: number;
  ads_failed: number;
}

interface GrantRow {
  id: string;
  post_id: string;
  bounty_id: string;
  brand_id: string;
  creator_id: string;
  scope: string;
  status: 'pending_permission' | 'active' | 'expiring' | 'renewal_requested' | 'expired' | 'revoked';
  platform: AdPlatform | null;
  ends_at: string | null;
  renewal_price_cents: number;
  alerts_sent: number[];
  ad_id: string | null;
}

interface AdRow {
  id: string;
  brand_id: string;
  post_id: string;
  platform: AdPlatform;
  status: 'requested' | 'authorised' | 'live' | 'paused' | 'fatigued' | 'ended' | 'expired' | 'declined';
  external_ad_id: string | null;
  code_expires_at: string | null;
}

const money = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (iso: string): string => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));

/** The brand's ad-account credentials: integrations(kind tiktok_ads | meta_ads) + the sealed token. Mock mode needs none. */
async function adAccountFor(db: Db, adapters: Adapters, ring: KeyRing | null, brandId: string, platform: AdPlatform): Promise<AdAccount | null> {
  if (adapters.ads.mode === 'mock') return { platform, accessToken: 'mock', accountId: 'mock' };
  const integration = unwrapMaybe(
    await db.from('integrations').select('id,config').eq('brand_id', brandId).eq('kind', platform === 'tiktok' ? 'tiktok_ads' : 'meta_ads').eq('status', 'connected').is('deleted_at', null).maybeSingle(),
  ) as { id: string; config: { account_id?: string } } | null;
  if (!integration || !ring || !integration.config.account_id) return null;
  const secret = unwrapMaybe(
    await db.from('encrypted_secrets').select('ciphertext,nonce,key_version').eq('owner_table', 'integrations').eq('owner_id', integration.id).eq('purpose', 'oauth').maybeSingle(),
  ) as { ciphertext: string; nonce: string; key_version: number } | null;
  if (!secret) return null;
  const opened = await openJson<{ access_token: string }>(ring, { ciphertext: bytea.decode(secret.ciphertext), nonce: bytea.decode(secret.nonce), keyVersion: secret.key_version }, `encrypted_secrets:integrations:${integration.id}:oauth`);
  return { platform, accessToken: opened.access_token, accountId: integration.config.account_id };
}

async function stopAd(db: Db, adapters: Adapters, ring: KeyRing | null, ad: AdRow, reason: string, now: Date, stats: ExpiryStats): Promise<void> {
  if (ad.status === 'ended' || ad.status === 'expired' || ad.status === 'declined' || ad.status === 'requested') return;
  try {
    if (ad.external_ad_id && (ad.status === 'live' || ad.status === 'paused' || ad.status === 'fatigued')) {
      const account = await adAccountFor(db, adapters, ring, ad.brand_id, ad.platform);
      if (!account) throw new Error(`no connected ${ad.platform} ad account for brand ${ad.brand_id}`);
      await adapters.ads.stopAd(account, ad.external_ad_id);
    }
    // live and fatigued ads expire; a paused ad has no edge to expired, so it ends; an authorised ad that never launched expires
    const next = ad.status === 'paused' ? 'ended' : 'expired';
    unwrap(await db.from('ads').update({ status: next, ended_at: now.toISOString() }).eq('id', ad.id).eq('status', ad.status).select('id'));
    stats.ads_stopped++;
    for (const userId of await brandRecipients(db, ad.brand_id, 'promote')) {
      await notify(db, adapters.push, { recipientUserId: userId, audience: 'brand', kind: 'rights_expiring', priority: 'normal', title: 'A promoted ad stopped', body: `${reason} The ad was stopped on ${ad.platform === 'tiktok' ? 'TikTok' : 'Meta'}. Renew the rights to run it again.`, deepLink: `flowd://promotions/${ad.id}`, refKind: 'ad', refId: ad.id }, now);
    }
  } catch (err) {
    stats.ads_failed++;
    // An ad that could not be stopped is retried tomorrow AND raised to Ops: money is being spent outside the rights term.
    log('expiry-alerts', 'error', 'ad_stop_failed', { ad: ad.id, message: errorMessage(err) });
    unwrap(await db.from('audit_log').insert({ actor_kind: 'system', action: 'ads.stop_failed', target_table: 'ads', target_id: ad.id, reason: errorMessage(err) }).select('id'));
  }
}

export async function runExpiry(db: Db, adapters: Adapters, ring: KeyRing | null, now: Date): Promise<ExpiryStats> {
  const stats: ExpiryStats = { alerts_sent: 0, became_expiring: 0, spark_alerts: 0, grants_expired: 0, ads_stopped: 0, ads_failed: 0 };
  const nowIso = now.toISOString();
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  // 1. grants ending within 30 days: expiring + one alert per threshold crossed
  const upcoming = unwrap(
    await db.from('rights_grants').select('id,post_id,bounty_id,brand_id,creator_id,scope,status,platform,ends_at,renewal_price_cents,alerts_sent,ad_id').in('status', ['active', 'expiring', 'renewal_requested']).not('ends_at', 'is', null).gt('ends_at', nowIso).lte('ends_at', in30),
  ) as GrantRow[];
  for (const g of upcoming) {
    const decision = alertToSend(now, g.ends_at as string, g.alerts_sent);
    if (!decision) continue;
    if (g.status === 'active') {
      unwrap(await db.from('rights_grants').update({ status: 'expiring' }).eq('id', g.id).eq('status', 'active').select('id'));
      stats.became_expiring++;
    }
    const days = decision.daysLeft;
    const bounty = unwrapMaybe(await db.from('bounties').select('title').eq('id', g.bounty_id).maybeSingle()) as { title: string } | null;
    const label = bounty?.title ?? 'a video';
    for (const userId of await brandRecipients(db, g.brand_id, 'rights.manage')) {
      await notify(db, adapters.push, {
        recipientUserId: userId, audience: 'brand', kind: 'rights_expiring', priority: 'normal',
        title: `Rights end in ${days} day${days === 1 ? '' : 's'}`,
        body: `Paid-ad rights for "${label}" end ${dateText(g.ends_at as string)}. Renew for ${money(g.renewal_price_cents)} per 30 days, or the ad stops automatically.`,
        deepLink: `flowd://rights/${g.id}`, refKind: 'rights_grant', refId: g.id,
      }, now);
    }
    await enqueueEvent(db, g.brand_id, 'rights_expiring', { rights_grant_id: g.id, post_id: g.post_id, ends_at: g.ends_at, days_left: days, renewal_price_cents: g.renewal_price_cents }, now);
    unwrap(await db.from('rights_grants').update({ alerts_sent: decision.alertsSent }).eq('id', g.id).select('id'));
    stats.alerts_sent++;
  }

  // 2. Spark codes ending within 7 days
  const sparks = unwrap(await db.from('ads').select('id,brand_id,post_id,platform,status,external_ad_id,code_expires_at').in('status', ['authorised', 'live', 'paused', 'fatigued']).not('code_expires_at', 'is', null).gt('code_expires_at', nowIso).lte('code_expires_at', new Date(now.getTime() + 7 * 86_400_000).toISOString())) as AdRow[];
  for (const ad of sparks) {
    const key = `spark:${ad.id}`;
    const sent = unwrap(await db.from('notifications').select('id').eq('kind', 'rights_expiring').eq('ref_kind', 'ad_code').eq('ref_id', key).limit(1)) as Array<{ id: string }>;
    if (sent.length > 0) continue;
    for (const userId of await brandRecipients(db, ad.brand_id, 'promote')) {
      await notify(db, adapters.push, { recipientUserId: userId, audience: 'brand', kind: 'rights_expiring', priority: 'normal', title: 'A Spark code ends within 7 days', body: `The ad stops on ${dateText(ad.code_expires_at as string)} unless the creator shares a new code.`, deepLink: `flowd://promotions/${ad.id}`, refKind: 'ad_code', refId: key }, now);
    }
    stats.spark_alerts++;
  }

  // 3. past the end: expire the grant, stop its ads
  const over = unwrap(
    await db.from('rights_grants').select('id,post_id,bounty_id,brand_id,creator_id,scope,status,platform,ends_at,renewal_price_cents,alerts_sent,ad_id').in('status', ['active', 'expiring', 'renewal_requested']).not('ends_at', 'is', null).lte('ends_at', nowIso),
  ) as GrantRow[];
  for (const g of over) {
    unwrap(await db.from('rights_grants').update({ status: 'expired' }).eq('id', g.id).eq('status', g.status).select('id'));
    stats.grants_expired++;
    const ads = unwrap(await db.from('ads').select('id,brand_id,post_id,platform,status,external_ad_id,code_expires_at').eq('post_id', g.post_id).in('status', ['authorised', 'live', 'paused', 'fatigued'])) as AdRow[];
    for (const ad of ads) await stopAd(db, adapters, ring, ad, 'The paid-ad rights for this video ended.', now, stats);
  }
  const codeOver = unwrap(await db.from('ads').select('id,brand_id,post_id,platform,status,external_ad_id,code_expires_at').in('status', ['authorised', 'live', 'paused', 'fatigued']).not('code_expires_at', 'is', null).lte('code_expires_at', nowIso)) as AdRow[];
  for (const ad of codeOver) await stopAd(db, adapters, ring, ad, 'The Spark code ended.', now, stats);
  return stats;
}

export const handler = handle('expiry-alerts', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'push']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  const now = clock(env);
  const db = serviceClient(env);
  const adapters = buildAdapters(env);
  const ring = Object.keys(env.tokenKeys).length > 0 ? await loadKeyRing(env.tokenKeys, env.tokenKeyActive) : null;
  const outcome = await runJob<ExpiryStats>(db, 'expiry-alerts', body.scheduled_for ?? daySlot(now, 9), now, () => runExpiry(db, adapters, ring, now));
  return { ...outcome };
});
