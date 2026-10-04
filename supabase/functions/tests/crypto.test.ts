// Run:  node --test supabase/functions/tests/*.test.ts      (Node 22.18+ strips types)      or      deno test --allow-read supabase/functions/tests/
// Pure modules only: no network, no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bytea, fromBase64, fromHex, hmacSha256Hex, loadKeyRing, needsRotation, openJson, parseStripeSignature, sealJson, sha256Hex, signFlowdWebhook, timingSafeEqual, toBase64, toHex, verifyStripeSignature,
} from '../_shared/crypto.ts';

test('hex and base64 round-trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.equal(toHex(bytes), '000102faff');
  assert.deepEqual(fromHex('000102faff'), bytes);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.throws(() => fromHex('abc'));
  assert.throws(() => fromHex('zz'));
});

test('bytea uses the PostgREST \\x form', () => {
  assert.equal(bytea.encode(new Uint8Array([1, 171])), '\\x01ab');
  assert.deepEqual(bytea.decode('\\x01ab'), new Uint8Array([1, 171]));
  assert.deepEqual(bytea.decode('01ab'), new Uint8Array([1, 171]));
});

test('sha256 and HMAC-SHA256 match the published vectors', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // RFC 4231, test case 2: key "Jefe", data "what do ya want for nothing?"
  assert.equal(await hmacSha256Hex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('timingSafeEqual', () => {
  assert.equal(timingSafeEqual('secret', 'secret'), true);
  assert.equal(timingSafeEqual('secret', 'secreT'), false);
  assert.equal(timingSafeEqual('secret', 'secret!'), false);
  assert.equal(timingSafeEqual('', ''), true);
  assert.equal(timingSafeEqual('', 'x'), false);
});

test('Stripe signatures: valid, tampered, wrong secret, expired and rolled secrets', async () => {
  const secret = 'whsec_test_123';
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const t = 1_760_000_000;
  const v1 = await hmacSha256Hex(secret, `${t}.${body}`);
  const header = `t=${t},v1=${v1}`;
  assert.deepEqual(parseStripeSignature(header), { timestamp: t, signatures: [v1] });
  assert.equal(await verifyStripeSignature(body, header, [secret], t + 10), true);
  assert.equal(await verifyStripeSignature(body + ' ', header, [secret], t + 10), false, 'a changed body fails');
  assert.equal(await verifyStripeSignature(body, header, ['whsec_other'], t + 10), false, 'a wrong secret fails');
  assert.equal(await verifyStripeSignature(body, header, [secret], t + 301), false, 'older than 5 minutes is a replay');
  assert.equal(await verifyStripeSignature(body, header, [secret], t - 301), false, 'a timestamp from the future is refused too');
  assert.equal(await verifyStripeSignature(body, header, ['whsec_old', secret], t), true, 'any configured secret may match (rolling secrets)');
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${v1}`, [secret], t), true, 'Stripe may send several v1 values');
  assert.equal(await verifyStripeSignature(body, null, [secret], t), false);
  assert.equal(await verifyStripeSignature(body, 'garbage', [secret], t), false);
});

test('flowd outbound signature is the same scheme', async () => {
  const header = await signFlowdWebhook('whsec_brand', '{"a":1}', 1_760_000_000);
  assert.match(header, /^t=1760000000,v1=[0-9a-f]{64}$/);
  assert.equal(await verifyStripeSignature('{"a":1}', header, ['whsec_brand'], 1_760_000_000), true);
});

const KEY_1 = toBase64(new Uint8Array(32).fill(7));
const KEY_2 = toBase64(new Uint8Array(32).fill(9));

test('AES-256-GCM: seal, open, bind to the row, detect tampering', async () => {
  const ring = await loadKeyRing({ '1': KEY_1 }, 1);
  const secret = { access_token: 'at_123', refresh_token: 'rt_456' };
  const sealed = await sealJson(ring, secret, 'social_account_tokens:sa_1');
  assert.equal(sealed.keyVersion, 1);
  assert.equal(sealed.nonce.length, 12);
  assert.notEqual(toHex(sealed.ciphertext), toHex(new TextEncoder().encode(JSON.stringify(secret))));
  assert.deepEqual(await openJson(ring, sealed, 'social_account_tokens:sa_1'), secret);
  await assert.rejects(openJson(ring, sealed, 'social_account_tokens:sa_2'), 'a ciphertext cannot be moved to another row');
  const flipped = new Uint8Array(sealed.ciphertext);
  flipped[0] = (flipped[0] ?? 0) ^ 1;
  await assert.rejects(openJson(ring, { ...sealed, ciphertext: flipped }, 'social_account_tokens:sa_1'), 'a modified ciphertext fails authentication');
  const again = await sealJson(ring, secret, 'social_account_tokens:sa_1');
  assert.notEqual(toHex(again.nonce), toHex(sealed.nonce), 'every encryption uses a fresh nonce');
});

test('key ring: rotation keeps old rows readable, the active key encrypts', async () => {
  const v1 = await loadKeyRing({ '1': KEY_1 }, 1);
  const old = await sealJson(v1, { token: 'x' }, 'row');
  const v2 = await loadKeyRing({ '1': KEY_1, '2': KEY_2 }, 2);
  assert.deepEqual(await openJson(v2, old, 'row'), { token: 'x' });
  assert.equal(needsRotation(v2, old.keyVersion), true);
  const fresh = await sealJson(v2, { token: 'x' }, 'row');
  assert.equal(fresh.keyVersion, 2);
  assert.equal(needsRotation(v2, fresh.keyVersion), false);
  await assert.rejects(openJson(v1, fresh, 'row'), /not in the key ring/);
  await assert.rejects(loadKeyRing({ '1': KEY_1 }, 2), /active/);
  await assert.rejects(loadKeyRing({ '1': toBase64(new Uint8Array(16)) }, 1), /32 bytes/);
});
