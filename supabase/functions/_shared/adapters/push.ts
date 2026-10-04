// Push adapter: APNs for the iOS app (alerts, and ActivityKit updates for the earnings Live Activity). FCM for Android is the same
// interface, added when the Android app ships (docs/ARCHITECTURE.md, "Android next").
//
// Authentication is APNs token-based: an ES256 JWT signed with the team's .p8 key (Web Crypto, no dependency), cached for 50 minutes
// (APNs rejects tokens older than an hour and refuses tokens refreshed more often than every 20 minutes).

import type { Env } from '../env.ts';
import { fromBase64 } from '../crypto.ts';

export interface PushDevice {
  platform: 'ios' | 'android' | 'web';
  token: string;
  environment: 'production' | 'sandbox';
}

export interface PushMessage {
  title: string;
  body: string;
  /** Deep link the app opens (flowd://wallet ...). */
  deepLink: string;
  /** "cash" notifications are time-sensitive (earnings, payouts); the rest are passive. */
  priority: 'cash' | 'normal' | 'digest';
  collapseId?: string;
}

export interface LiveActivityUpdate {
  /** ActivityKit content-state: the same JSON the widget decodes (pending_cents, cleared_cents, next_clear_at ...). */
  contentState: Record<string, unknown>;
  event: 'update' | 'end';
}

export type PushResult = { ok: true } | { ok: false; reason: 'invalid_token' | 'unreachable' | 'rejected'; detail: string };

export interface PushAdapter {
  readonly mode: 'mock' | 'live';
  send(device: PushDevice, message: PushMessage): Promise<PushResult>;
  updateLiveActivity(device: PushDevice, activityToken: string, update: LiveActivityUpdate): Promise<PushResult>;
}

export class MockPushAdapter implements PushAdapter {
  readonly mode = 'mock' as const;
  readonly sent: Array<{ token: string; message: PushMessage }> = [];

  send(device: PushDevice, message: PushMessage): Promise<PushResult> {
    this.sent.push({ token: device.token, message });
    console.log(JSON.stringify({ fn: 'push', event: 'mock_send', platform: device.platform, title: message.title, deep_link: message.deepLink }));
    return Promise.resolve({ ok: true });
  }

  updateLiveActivity(_device: PushDevice, _activityToken: string, _update: LiveActivityUpdate): Promise<PushResult> {
    return Promise.resolve({ ok: true });
  }
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class ApnsPushAdapter implements PushAdapter {
  readonly mode = 'live' as const;
  private readonly env: Pick<Env, 'apns'>;
  private jwt: { token: string; issuedAt: number } | null = null;
  private key: CryptoKey | null = null;

  constructor(env: Pick<Env, 'apns'>) {
    if (!env.apns.keyP8 || !env.apns.keyId || !env.apns.teamId) throw new Error('APNS_KEY_P8, APNS_KEY_ID and APNS_TEAM_ID are required for live push');
    this.env = env;
  }

  private async bearer(): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.jwt && nowSeconds - this.jwt.issuedAt < 50 * 60) return this.jwt.token;
    if (!this.key) {
      // the secret may carry the two characters backslash-n instead of real newlines (a one-line env value)
      const pem = (this.env.apns.keyP8 ?? '').split('\\n').join('\n');
      const der = fromBase64(pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, ''));
      this.key = await crypto.subtle.importKey('pkcs8', der as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    }
    const enc = new TextEncoder();
    const header = base64Url(enc.encode(JSON.stringify({ alg: 'ES256', kid: this.env.apns.keyId })));
    const claims = base64Url(enc.encode(JSON.stringify({ iss: this.env.apns.teamId, iat: nowSeconds })));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.key, enc.encode(`${header}.${claims}`)));
    const token = `${header}.${claims}.${base64Url(signature)}`;
    this.jwt = { token, issuedAt: nowSeconds };
    return token;
  }

  private host(device: PushDevice): string {
    return device.environment === 'sandbox' || this.env.apns.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  }

  private async post(device: PushDevice, token: string, headers: Record<string, string>, payload: unknown): Promise<PushResult> {
    try {
      const res = await fetch(`https://${this.host(device)}/3/device/${token}`, {
        method: 'POST',
        headers: { authorization: `bearer ${await this.bearer()}`, 'apns-topic': this.env.apns.topic, ...headers },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      const text = await res.text();
      if (res.status === 410 || text.includes('BadDeviceToken') || text.includes('Unregistered')) return { ok: false, reason: 'invalid_token', detail: text };
      return { ok: false, reason: 'rejected', detail: `${res.status} ${text}` };
    } catch (err) {
      return { ok: false, reason: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  send(device: PushDevice, message: PushMessage): Promise<PushResult> {
    const headers: Record<string, string> = { 'apns-push-type': 'alert', 'apns-priority': message.priority === 'cash' ? '10' : '5' };
    if (message.collapseId) headers['apns-collapse-id'] = message.collapseId;
    const payload = { aps: { alert: { title: message.title, body: message.body }, sound: message.priority === 'cash' ? 'default' : undefined, 'thread-id': message.collapseId }, deep_link: message.deepLink };
    return this.post(device, device.token, headers, payload);
  }

  updateLiveActivity(device: PushDevice, activityToken: string, update: LiveActivityUpdate): Promise<PushResult> {
    const headers = { 'apns-push-type': 'liveactivity', 'apns-topic': `${this.env.apns.topic}.push-type.liveactivity`, 'apns-priority': '5' };
    const payload = { aps: { timestamp: Math.floor(Date.now() / 1000), event: update.event, 'content-state': update.contentState } };
    return this.post(device, activityToken, headers, payload);
  }
}
