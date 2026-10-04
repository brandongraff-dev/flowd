// RevenueCat webhook events -> flowd conversions. Pure functions (no I/O) so the rules are unit-tested (tests/revenuecat.test.ts).
//
// What RevenueCat can and cannot tell us
//   * It reports subscription lifecycle events for an app user. It does NOT report installs (the SDK's first-launch attribution call does,
//     POST /attribution/events), so this module only ever produces `trial` and `paid` conversions.
//   * The creator is identified by what the SDK snippet attaches to the subscriber (subscriber attribute `flowd_link`, the tracking code)
//     or by the offer code the customer redeemed (`offer_code`). Those two are DETERMINISTIC: CPA pays on them (source `link` / `code`).
//     An event that carries neither is `unmatched`: it is stored and reported, and never paid.
//   * Sandbox events are stored for the SDK health check ("last event seen") and never pay.
//
// What becomes a conversion
//   initial_purchase, period trial            -> trial   (quantity 1, revenue 0)
//   initial_purchase, period intro or normal  -> paid    (first payment; revenue = price in USD cents)
//   renewal with is_trial_conversion          -> paid    (the trial converted; revenue = price)
//   non_renewing_purchase                     -> paid    (one-time purchase; revenue = price)
//   everything else (later renewals, cancellations, billing issues, product changes, expirations, test) -> no conversion
// Revenue is the gross price in USD cents (what ROAS and payback are computed on); store fees are not subtracted.

export type RcEventType = 'initial_purchase' | 'renewal' | 'cancellation' | 'uncancellation' | 'expiration' | 'billing_issue' | 'product_change' | 'non_renewing_purchase' | 'test';
export type RcPeriodType = 'trial' | 'intro' | 'normal';
export type ConversionKind = 'trial' | 'paid';
export type ConversionSource = 'link' | 'code';

/** The relevant part of a RevenueCat webhook body ({ api_version, event }). Unknown fields are ignored. */
export interface RevenueCatPayload {
  api_version?: string;
  event?: {
    id?: string;
    type?: string;
    app_id?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    product_id?: string;
    period_type?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    event_timestamp_ms?: number;
    environment?: string;
    currency?: string;
    price?: number | null;
    price_in_purchased_currency?: number | null;
    is_trial_conversion?: boolean;
    offer_code?: string | null;
    country_code?: string | null;
    subscriber_attributes?: Record<string, { value?: string } | undefined>;
  };
}

export interface NormalizedRcEvent {
  eventId: string;
  type: RcEventType;
  periodType: RcPeriodType;
  appUserId: string;
  productId: string;
  priceCents: number;
  currency: string;
  isTrialConversion: boolean;
  offerCode: string | null;
  subscriberAttributes: Record<string, string>;
  environment: 'production' | 'sandbox';
  purchasedAt: string;
  expirationAt: string | null;
  receivedAt: string;
  countryCode: string | null;
}

export class UnsupportedEvent extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'UnsupportedEvent';
    this.reason = reason;
  }
}

const TYPE_MAP: Readonly<Record<string, RcEventType>> = {
  INITIAL_PURCHASE: 'initial_purchase',
  RENEWAL: 'renewal',
  CANCELLATION: 'cancellation',
  UNCANCELLATION: 'uncancellation',
  EXPIRATION: 'expiration',
  BILLING_ISSUE: 'billing_issue',
  PRODUCT_CHANGE: 'product_change',
  NON_RENEWING_PURCHASE: 'non_renewing_purchase',
  TEST: 'test',
};

const PERIOD_MAP: Readonly<Record<string, RcPeriodType>> = { TRIAL: 'trial', INTRO: 'intro', NORMAL: 'normal' };

/** Validate and flatten an event. Throws UnsupportedEvent for event types flowd does not model (they are kept in the inbox only). */
export function normalizeRevenueCatEvent(payload: RevenueCatPayload, receivedAt: Date): NormalizedRcEvent {
  const e = payload.event;
  if (!e || typeof e !== 'object') throw new UnsupportedEvent('The body has no event object.');
  if (!e.id) throw new UnsupportedEvent('The event has no id.');
  const type = e.type ? TYPE_MAP[e.type] : undefined;
  if (!type) throw new UnsupportedEvent(`Event type ${e.type ?? '(none)'} is not modelled.`);
  if (!e.app_user_id) throw new UnsupportedEvent('The event has no app_user_id.');
  const purchasedMs = e.purchased_at_ms ?? e.event_timestamp_ms;
  if (typeof purchasedMs !== 'number') throw new UnsupportedEvent('The event has no purchase time.');

  // Gross price in USD: RevenueCat's `price` is already converted to USD; `price_in_purchased_currency` is in the store currency.
  const usd = typeof e.price === 'number' ? e.price : e.currency === 'USD' && typeof e.price_in_purchased_currency === 'number' ? e.price_in_purchased_currency : 0;
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.subscriber_attributes ?? {})) {
    if (v && typeof v.value === 'string') attributes[k.replace(/^\$/, '')] = v.value;
  }

  return {
    eventId: e.id,
    type,
    periodType: PERIOD_MAP[(e.period_type ?? 'NORMAL').toUpperCase()] ?? 'normal',
    appUserId: e.app_user_id,
    productId: e.product_id ?? 'unknown',
    priceCents: Math.max(0, Math.round(usd * 100)),
    currency: 'USD',
    isTrialConversion: e.is_trial_conversion === true,
    offerCode: e.offer_code && e.offer_code.trim() !== '' ? e.offer_code.trim() : null,
    subscriberAttributes: attributes,
    environment: (e.environment ?? 'PRODUCTION').toUpperCase() === 'SANDBOX' ? 'sandbox' : 'production',
    purchasedAt: new Date(purchasedMs).toISOString(),
    expirationAt: typeof e.expiration_at_ms === 'number' ? new Date(e.expiration_at_ms).toISOString() : null,
    receivedAt: receivedAt.toISOString(),
    countryCode: e.country_code && /^[A-Z]{2}$/.test(e.country_code) ? e.country_code : null,
  };
}

export interface ConversionDraft {
  kind: ConversionKind;
  quantity: 1;
  revenueCents: number;
  occurredAt: string;
}

/** The conversion an event stands for, or null when it carries none (a later renewal, a cancellation ...). */
export function conversionFor(event: NormalizedRcEvent): ConversionDraft | null {
  if (event.environment === 'sandbox' || event.type === 'test') return null;
  if (event.type === 'initial_purchase' && event.periodType === 'trial') return { kind: 'trial', quantity: 1, revenueCents: 0, occurredAt: event.purchasedAt };
  if (event.type === 'initial_purchase' && event.periodType !== 'trial') return { kind: 'paid', quantity: 1, revenueCents: event.priceCents, occurredAt: event.purchasedAt };
  if (event.type === 'renewal' && event.isTrialConversion) return { kind: 'paid', quantity: 1, revenueCents: event.priceCents, occurredAt: event.purchasedAt };
  if (event.type === 'non_renewing_purchase') return { kind: 'paid', quantity: 1, revenueCents: event.priceCents, occurredAt: event.purchasedAt };
  return null;
}

/** Where the attribution evidence is, in priority order: an offer code the customer redeemed beats a tracking link they arrived by. */
export function attributionKeys(event: NormalizedRcEvent): { offerCode: string | null; linkCode: string | null } {
  return { offerCode: event.offerCode, linkCode: event.subscriberAttributes.flowd_link ?? null };
}

/** Compare the Authorization header RevenueCat sends with the configured secret. Accepts the secret as-is or with a "Bearer " prefix. */
export function authorizationMatches(header: string | null, secret: string, equal: (a: string, b: string) => boolean): boolean {
  if (!header || !secret) return false;
  const bare = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header.trim();
  return equal(bare, secret) || equal(header.trim(), secret);
}
