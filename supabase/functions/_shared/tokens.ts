// OAuth tokens of linked social accounts: sealed with AES-256-GCM (crypto.ts) in public.social_account_tokens, readable only by the
// service role. This module is the only place that opens them.
//
//   getAccessToken()   open the stored token set; if the access token is within 10 minutes of expiry, refresh it through the platform
//                      adapter first, re-seal and store the new set (rotated_at = now). A refresh the platform refuses
//                      (ReauthRequiredError) marks the account `needs_reauth` and tells the creator, once.
//   saveTokenSet()     seal and upsert (used by the OAuth callback in the API and by refresh)
//   rotateKeys()       re-seal every row that is not on the active key version (the housekeeping job calls this in batches)

import { bytea, type KeyRing, needsRotation, openJson, sealJson } from './crypto.ts';
import { type Db, unwrap, unwrapMaybe } from './db.ts';
import { ReauthRequiredError } from './errors.ts';
import type { PlatformAdapter, TokenSet } from './adapters/platform.ts';

interface TokenRow {
  social_account_id: string;
  ciphertext: string;
  nonce: string;
  key_version: number;
  scopes: string[];
  expires_at: string | null;
  refresh_expires_at: string | null;
}

interface StoredSecrets {
  access_token: string;
  refresh_token: string | null;
}

const aad = (socialAccountId: string): string => `social_account_tokens:${socialAccountId}`;
const REFRESH_WINDOW_MS = 10 * 60 * 1000;

export async function saveTokenSet(db: Db, ring: KeyRing, socialAccountId: string, tokens: TokenSet): Promise<void> {
  const sealed = await sealJson(ring, { access_token: tokens.accessToken, refresh_token: tokens.refreshToken } satisfies StoredSecrets, aad(socialAccountId));
  unwrap(
    await db.from('social_account_tokens').upsert({
      social_account_id: socialAccountId,
      ciphertext: bytea.encode(sealed.ciphertext),
      nonce: bytea.encode(sealed.nonce),
      key_version: sealed.keyVersion,
      scopes: tokens.scopes,
      expires_at: tokens.expiresAt,
      refresh_expires_at: tokens.refreshExpiresAt,
      rotated_at: new Date().toISOString(),
    }, { onConflict: 'social_account_id' }).select('social_account_id'),
  );
}

/** A usable access token for the account, refreshed when it is about to expire. Throws ReauthRequiredError when the creator must reconnect. */
export async function getAccessToken(db: Db, ring: KeyRing, adapter: PlatformAdapter, socialAccountId: string, now: Date): Promise<string> {
  const row = unwrapMaybe(await db.from('social_account_tokens').select('*').eq('social_account_id', socialAccountId).maybeSingle()) as TokenRow | null;
  if (!row) throw new ReauthRequiredError(adapter.platform, 'no token is stored for this account');
  const secrets = await openJson<StoredSecrets>(ring, { ciphertext: bytea.decode(row.ciphertext), nonce: bytea.decode(row.nonce), keyVersion: row.key_version }, aad(socialAccountId));
  const expiresMs = row.expires_at ? Date.parse(row.expires_at) : Number.POSITIVE_INFINITY;
  if (expiresMs - now.getTime() > REFRESH_WINDOW_MS) return secrets.access_token;
  if (!secrets.refresh_token) throw new ReauthRequiredError(adapter.platform, 'the access token expired and there is no refresh token');
  const refreshed = await adapter.refreshAccessToken(secrets.refresh_token);
  await saveTokenSet(db, ring, socialAccountId, refreshed);
  return refreshed.accessToken;
}

/** Re-seal up to `limit` rows still on an older key. Returns how many were rotated. */
export async function rotateKeys(db: Db, ring: KeyRing, limit = 100): Promise<number> {
  const rows = unwrap(await db.from('social_account_tokens').select('*').neq('key_version', ring.active).limit(limit)) as TokenRow[];
  let rotated = 0;
  for (const row of rows) {
    if (!needsRotation(ring, row.key_version)) continue;
    const secrets = await openJson<StoredSecrets>(ring, { ciphertext: bytea.decode(row.ciphertext), nonce: bytea.decode(row.nonce), keyVersion: row.key_version }, aad(row.social_account_id));
    const sealed = await sealJson(ring, secrets, aad(row.social_account_id));
    unwrap(
      await db.from('social_account_tokens').update({ ciphertext: bytea.encode(sealed.ciphertext), nonce: bytea.encode(sealed.nonce), key_version: sealed.keyVersion, rotated_at: new Date().toISOString() })
        .eq('social_account_id', row.social_account_id).eq('key_version', row.key_version).select('social_account_id'),
    );
    rotated++;
  }
  return rotated;
}

interface SecretRow {
  id: string;
  owner_table: string;
  owner_id: string;
  purpose: string;
  ciphertext: string;
  nonce: string;
  key_version: number;
}

/** Same for encrypted_secrets (webhook signing secrets, RevenueCat secrets, ad-account tokens). AAD = "encrypted_secrets:<owner_table>:<owner_id>:<purpose>". */
export async function rotateSecrets(db: Db, ring: KeyRing, limit = 100): Promise<number> {
  const rows = unwrap(await db.from('encrypted_secrets').select('id,owner_table,owner_id,purpose,ciphertext,nonce,key_version').neq('key_version', ring.active).limit(limit)) as SecretRow[];
  let rotated = 0;
  for (const row of rows) {
    const context = `encrypted_secrets:${row.owner_table}:${row.owner_id}:${row.purpose}`;
    const value = await openJson<unknown>(ring, { ciphertext: bytea.decode(row.ciphertext), nonce: bytea.decode(row.nonce), keyVersion: row.key_version }, context);
    const sealed = await sealJson(ring, value, context);
    unwrap(
      await db.from('encrypted_secrets').update({ ciphertext: bytea.encode(sealed.ciphertext), nonce: bytea.encode(sealed.nonce), key_version: sealed.keyVersion, rotated_at: new Date().toISOString() })
        .eq('id', row.id).eq('key_version', row.key_version).select('id'),
    );
    rotated++;
  }
  return rotated;
}
