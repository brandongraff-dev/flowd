// Cryptography the edge functions need, on Web Crypto only (no dependencies, same code under Deno and Node):
//   * HMAC-SHA256 and constant-time comparison (webhook signatures in both directions)
//   * Stripe's webhook scheme:  Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]  over  "<t>.<raw body>"  with a 5 minute tolerance
//   * AES-256-GCM sealing of OAuth tokens and integration secrets (tables social_account_tokens and encrypted_secrets), with a key ring so
//     keys rotate without downtime: every row stores its key_version, the active version encrypts, every known version decrypts
//   * bytea helpers: PostgREST reads and writes bytea as a "\x<hex>" string
//
// Trust boundary: plaintext tokens exist only in memory inside an edge function. The database holds ciphertext, the key ring lives in
// the function secrets (TOKEN_ENCRYPTION_KEYS), and the AAD binds each ciphertext to its row so rows cannot be swapped.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error('invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** PostgREST bytea: "\x" followed by hex. */
export const bytea = {
  encode(bytes: Uint8Array): string {
    return '\\x' + toHex(bytes);
  },
  decode(value: string): Uint8Array {
    return fromHex(value.startsWith('\\x') ? value.slice(2) : value);
  },
};

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
}

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

/** Constant-time string comparison (length differences leak only the length, never the position of a mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % Math.max(1, x.length)] ?? 0) ^ (y[i % Math.max(1, y.length)] ?? 0);
  return diff === 0;
}

// ── Stripe webhook signatures ─────────────────────────────────────────────────────────────────────────────────────────

export interface ParsedStripeSignature {
  timestamp: number;
  signatures: string[];
}

export function parseStripeSignature(header: string): ParsedStripeSignature | null {
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') timestamp = Number(v);
    if (k === 'v1') signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * Verify a Stripe webhook. `rawBody` must be the exact bytes received (read with req.text() before any JSON.parse).
 * Returns true only when a v1 signature matches AND the timestamp is within the tolerance (replay protection).
 * `secrets` may hold more than one value so a signing secret can be rolled without dropping events.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secrets: readonly string[], nowSeconds: number, toleranceSeconds = 300): Promise<boolean> {
  if (!header) return false;
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;
  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  for (const secret of secrets) {
    const expected = await hmacSha256Hex(secret, signedPayload);
    if (parsed.signatures.some((sig) => timingSafeEqual(sig, expected))) return true;
  }
  return false;
}

/** Sign an outbound flowd webhook: header `X-Flowd-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over "<t>.<body>" (same scheme as Stripe). */
export async function signFlowdWebhook(secret: string, body: string, unixSeconds: number): Promise<string> {
  return `t=${unixSeconds},v1=${await hmacSha256Hex(secret, `${unixSeconds}.${body}`)}`;
}

// ── AES-256-GCM sealing ───────────────────────────────────────────────────────────────────────────────────────────────

export interface KeyRing {
  active: number;
  keys: ReadonlyMap<number, CryptoKey>;
}

/** Build the key ring from { "<version>": "<base64 of 32 bytes>" }. */
export async function loadKeyRing(keys: Readonly<Record<string, string>>, active: number): Promise<KeyRing> {
  const map = new Map<number, CryptoKey>();
  for (const [version, b64] of Object.entries(keys)) {
    const raw = fromBase64(b64);
    if (raw.length !== 32) throw new Error(`token key ${version} must be 32 bytes (AES-256), got ${raw.length}`);
    map.set(Number(version), await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
  }
  if (!map.has(active)) throw new Error(`the active token key version ${active} is not in the key ring`);
  return { active, keys: map };
}

export interface Sealed {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  keyVersion: number;
}

/** Encrypt a JSON value. `aad` should name the row ("social_account_tokens:sa_123") so a ciphertext cannot be moved to another row. */
export async function sealJson(ring: KeyRing, value: unknown, aad: string): Promise<Sealed> {
  const key = ring.keys.get(ring.active);
  if (!key) throw new Error('no active key');
  const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random nonce: unique per encryption
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(aad) }, key, encoder.encode(JSON.stringify(value))));
  return { ciphertext, nonce, keyVersion: ring.active };
}

export async function openJson<T>(ring: KeyRing, sealed: Sealed, aad: string): Promise<T> {
  const key = ring.keys.get(sealed.keyVersion);
  if (!key) throw new Error(`token key version ${sealed.keyVersion} is not in the key ring (was it retired too early?)`);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce as BufferSource, additionalData: encoder.encode(aad) }, key, sealed.ciphertext as BufferSource);
  return JSON.parse(decoder.decode(plain)) as T;
}

/** True when a row was sealed with an older key and should be re-sealed with the active one (the housekeeping job does this). */
export function needsRotation(ring: KeyRing, keyVersion: number): boolean {
  return keyVersion !== ring.active;
}
