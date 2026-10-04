import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { attributionKeys, authorizationMatches, conversionFor, normalizeRevenueCatEvent, type RevenueCatPayload, UnsupportedEvent } from '../_shared/revenuecat.ts';

const NOW = new Date('2026-10-03T14:00:00Z');
const T0 = Date.parse('2026-10-01T08:15:00Z');

function event(over: Record<string, unknown>): RevenueCatPayload {
  return {
    api_version: '1.0',
    event: {
      id: 'evt-1', type: 'INITIAL_PURCHASE', app_id: 'app123', app_user_id: '$RCAnonymousID:3f9a', product_id: 'lumi_pro_annual', period_type: 'TRIAL', purchased_at_ms: T0,
      expiration_at_ms: T0 + 3 * 86_400_000, environment: 'PRODUCTION', currency: 'USD', price: 0, price_in_purchased_currency: 0, country_code: 'US',
      subscriber_attributes: { flowd_link: { value: 'maya-glowup' }, $email: { value: 'x@example.test' } },
      ...over,
    } as RevenueCatPayload['event'],
  };
}

test('a trial start is a trial conversion with no revenue', () => {
  const e = normalizeRevenueCatEvent(event({}), NOW);
  assert.equal(e.type, 'initial_purchase');
  assert.equal(e.periodType, 'trial');
  assert.equal(e.environment, 'production');
  assert.equal(e.purchasedAt, '2026-10-01T08:15:00.000Z');
  assert.deepEqual(conversionFor(e), { kind: 'trial', quantity: 1, revenueCents: 0, occurredAt: '2026-10-01T08:15:00.000Z' });
});

test('a first payment (no trial) is a paid conversion at the gross USD price', () => {
  const e = normalizeRevenueCatEvent(event({ period_type: 'NORMAL', price: 34.99, price_in_purchased_currency: 34.99 }), NOW);
  assert.deepEqual(conversionFor(e), { kind: 'paid', quantity: 1, revenueCents: 3499, occurredAt: e.purchasedAt });
});

test('a trial that converts (RENEWAL with is_trial_conversion) is a paid conversion', () => {
  const e = normalizeRevenueCatEvent(event({ type: 'RENEWAL', period_type: 'NORMAL', is_trial_conversion: true, price: 59.99 }), NOW);
  assert.equal(conversionFor(e)?.kind, 'paid');
  assert.equal(conversionFor(e)?.revenueCents, 5999);
});

test('later renewals, cancellations, billing issues and expirations carry no conversion', () => {
  for (const type of ['RENEWAL', 'CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION', 'PRODUCT_CHANGE', 'UNCANCELLATION']) {
    assert.equal(conversionFor(normalizeRevenueCatEvent(event({ type, period_type: 'NORMAL', price: 59.99 }), NOW)), null, type);
  }
});

test('a one-time purchase is a paid conversion', () => {
  assert.equal(conversionFor(normalizeRevenueCatEvent(event({ type: 'NON_RENEWING_PURCHASE', period_type: 'NORMAL', price: 9.99 }), NOW))?.revenueCents, 999);
});

test('sandbox and test events never pay', () => {
  assert.equal(conversionFor(normalizeRevenueCatEvent(event({ environment: 'SANDBOX' }), NOW)), null);
  assert.equal(conversionFor(normalizeRevenueCatEvent(event({ type: 'TEST' }), NOW)), null);
});

test('non-USD prices use the converted USD price; without one they count as zero (never guessed)', () => {
  assert.equal(normalizeRevenueCatEvent(event({ period_type: 'NORMAL', currency: 'EUR', price: 32.4, price_in_purchased_currency: 29.99 }), NOW).priceCents, 3240);
  assert.equal(normalizeRevenueCatEvent(event({ period_type: 'NORMAL', currency: 'EUR', price: null, price_in_purchased_currency: 29.99 }), NOW).priceCents, 0);
});

test('attribution keys: the tracking link attribute and the redeemed offer code; "$" attributes are normalised', () => {
  const e = normalizeRevenueCatEvent(event({ offer_code: ' MAYA-LUMI ' }), NOW);
  assert.deepEqual(attributionKeys(e), { offerCode: 'MAYA-LUMI', linkCode: 'maya-glowup' });
  assert.equal(e.subscriberAttributes.email, 'x@example.test');
  const none = normalizeRevenueCatEvent(event({ subscriber_attributes: {} }), NOW);
  assert.deepEqual(attributionKeys(none), { offerCode: null, linkCode: null });
});

test('country codes: two capital letters or null', () => {
  assert.equal(normalizeRevenueCatEvent(event({ country_code: 'US' }), NOW).countryCode, 'US');
  assert.equal(normalizeRevenueCatEvent(event({ country_code: 'usa' }), NOW).countryCode, null);
});

test('unsupported or malformed events are named, not guessed', () => {
  assert.throws(() => normalizeRevenueCatEvent({}, NOW), UnsupportedEvent);
  assert.throws(() => normalizeRevenueCatEvent(event({ id: undefined }), NOW), /no id/);
  assert.throws(() => normalizeRevenueCatEvent(event({ type: 'SUBSCRIPTION_PAUSED' }), NOW), /not modelled/);
  assert.throws(() => normalizeRevenueCatEvent(event({ app_user_id: undefined }), NOW), /app_user_id/);
  assert.throws(() => normalizeRevenueCatEvent(event({ purchased_at_ms: undefined, event_timestamp_ms: undefined }), NOW), /purchase time/);
});

test('the Authorization header may carry the bare secret or "Bearer <secret>"', () => {
  assert.equal(authorizationMatches('s3cret', 's3cret', timingSafeEqual), true);
  assert.equal(authorizationMatches('Bearer s3cret', 's3cret', timingSafeEqual), true);
  assert.equal(authorizationMatches('bearer s3cret', 's3cret', timingSafeEqual), true);
  assert.equal(authorizationMatches('Bearer nope', 's3cret', timingSafeEqual), false);
  assert.equal(authorizationMatches(null, 's3cret', timingSafeEqual), false);
  assert.equal(authorizationMatches('s3cret', '', timingSafeEqual), false);
});
