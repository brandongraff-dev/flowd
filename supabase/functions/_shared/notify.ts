// Notifications: an in-app row first (public.notifications, delivered to clients over Realtime), then a push to the person's devices
// when their preferences and Wellbeing Mode allow it. The row is the source of truth; a failed push never fails the job that caused it.
//
// Rules (notify-rules.ts; DECISIONS Wellbeing Mode, "no guilt notifications")
//   * notification_prefs.push = false, or the kind's category (money, reviews, drop, offers, tournaments, tips, safety) switched off -> row only
//   * quiet hours (prefs or Wellbeing, in the person's timezone) -> row only with `batched = true` (it is in the inbox, nothing buzzes),
//     except priority `cash` (earnings and payouts)
//   * Wellbeing numbers_off            -> amounts are removed from the row and from the push text
//   * invalid device token (APNs 410)  -> the device row is revoked

import type { PushAdapter, PushMessage } from './adapters/push.ts';
import { type Db, unwrap, unwrapMaybe } from './db.ts';
import { errorMessage } from './errors.ts';
import { log } from './http.ts';
import { categoryOf, inQuietHours, type NumbersOff, numbersHidden, type QuietHours, redactMoney } from './notify-rules.ts';

export type NotificationKind = string; // the notification_kind enum of 0001 (37 values); the database rejects anything else

export interface NotificationInput {
  recipientUserId: string;
  audience: 'creator' | 'brand' | 'admin' | 'system';
  kind: NotificationKind;
  priority: 'cash' | 'normal' | 'digest';
  title: string;
  body: string;
  amountCents?: number;
  deepLink: string;
  refKind?: string;
  refId?: string;
}

interface PrefsRow {
  push: boolean;
  quiet_hours: QuietHours | null;
  categories: Record<string, boolean> | null;
  batch_non_cash: boolean;
}

interface WellbeingRow {
  enabled: boolean;
  quiet_hours: QuietHours | null;
  numbers_off: NumbersOff;
}

/** Create the notification and push it. Returns the notification id. Never throws for push problems. */
export async function notify(db: Db, push: PushAdapter, input: NotificationInput, now: Date): Promise<string> {
  const user = unwrapMaybe(await db.from('users').select('id,timezone').eq('id', input.recipientUserId).maybeSingle()) as { id: string; timezone: string } | null;
  if (!user) throw new Error(`notification recipient ${input.recipientUserId} does not exist`);
  const prefs = unwrapMaybe(await db.from('notification_prefs').select('push,quiet_hours,categories,batch_non_cash').eq('user_id', user.id).maybeSingle()) as PrefsRow | null;
  const wellbeing = unwrapMaybe(
    await db.from('wellbeing_settings').select('enabled,quiet_hours,numbers_off,creators!inner(user_id)').eq('creators.user_id', user.id).maybeSingle(),
  ) as WellbeingRow | null;

  const muted = prefs?.categories?.[categoryOf(input.kind)] === false;
  const quietNow = inQuietHours(prefs?.quiet_hours, user.timezone, now) || (wellbeing?.enabled === true && inQuietHours(wellbeing.quiet_hours, user.timezone, now));
  const quiet = quietNow && input.priority !== 'cash' && (prefs?.batch_non_cash ?? true);
  const wantsPush = (prefs?.push ?? true) && !muted && !quiet;
  const hideNumbers = numbersHidden(wellbeing, now);
  const body = hideNumbers ? redactMoney(input.body) : input.body;

  const created = unwrap(
    await db.from('notifications').insert({
      recipient_user_id: input.recipientUserId, audience: input.audience, kind: input.kind, priority: input.priority, title: input.title, body,
      amount_cents: hideNumbers ? null : input.amountCents ?? null, deep_link: input.deepLink, ref_kind: input.refKind ?? null, ref_id: input.refId ?? null, batched: quiet,
    }).select('id'),
  ) as Array<{ id: string }>;
  const id = created[0]!.id;
  if (!wantsPush) return id;

  const devices = unwrap(await db.from('devices').select('id,platform,push_token,environment').eq('user_id', user.id).is('revoked_at', null)) as Array<{ id: string; platform: 'ios' | 'android' | 'web'; push_token: string; environment: 'production' | 'sandbox' }>;
  const message: PushMessage = { title: hideNumbers ? redactMoney(input.title) : input.title, body, deepLink: input.deepLink, priority: input.priority, collapseId: input.refId };
  let delivered = false;
  for (const d of devices) {
    try {
      const res = await push.send({ platform: d.platform, token: d.push_token, environment: d.environment }, message);
      if (res.ok) delivered = true;
      else if (res.reason === 'invalid_token') unwrap(await db.from('devices').update({ revoked_at: now.toISOString() }).eq('id', d.id).select('id'));
      else log('notify', 'warn', 'push_failed', { device: d.id, reason: res.reason, detail: res.detail });
    } catch (err) {
      log('notify', 'warn', 'push_error', { device: d.id, message: errorMessage(err) });
    }
  }
  if (delivered) unwrap(await db.from('notifications').update({ delivered_at: now.toISOString() }).eq('id', id).select('id'));
  return id;
}

/** Users who should hear about a brand event: active members holding the capability (for example finance.read or rights.manage). */
export async function brandRecipients(db: Db, brandId: string, capability: string): Promise<string[]> {
  const members = unwrap(await db.from('brand_members').select('user_id,role').eq('brand_id', brandId).eq('status', 'active')) as Array<{ user_id: string; role: string }>;
  if (members.length === 0) return [];
  const roles = unwrap(await db.from('brand_role_capabilities').select('role').eq('capability', capability)) as Array<{ role: string }>;
  const allowed = new Set(roles.map((r) => r.role));
  return members.filter((m) => allowed.has(m.role)).map((m) => m.user_id);
}
