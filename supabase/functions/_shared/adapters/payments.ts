// Payments adapter (Stripe Connect). One interface, a mock and a live implementation (FLOWD_ADAPTER_PAYMENTS = mock | live).
//
// How a creator payout travels (docs/ARCHITECTURE.md, "Money path"):
//   1. start_payout() gates the payout (identity, W-9, payout method) and moves it to `processing`
//   2. createTransfer():   flowd platform balance -> the creator's Connect (Express) account          metadata.flowd_payout_id
//   3. createBankPayout(): the Connect account -> the creator's bank (method "standard", or "instant" for instant cash-outs)
//                                                                                                       metadata.flowd_payout_id
//   4. mark_payout_in_transit() records the transfer;  payout.paid / payout.failed webhooks call complete_payout() / fail_payout()
// Both calls carry an idempotency key derived from the payout id and attempt, so a retry after a crash can never move money twice.
//
// Wallet top-ups and escrow funding are the reverse direction: the brand's card is charged with a PaymentIntent whose metadata names the
// brand and the amount; the `payment_intent.succeeded` webhook posts the wallet_topup ledger transaction (webhook-stripe).
//
// The client below is a ~100 line fetch wrapper (no SDK, no dependency) covering the five calls flowd makes.

import type { Env } from '../env.ts';
import { verifyStripeSignature } from '../crypto.ts';
import { FlowdError } from '../errors.ts';

export interface TransferInput {
  payoutId: string;
  creatorId: string;
  destinationAccount: string;
  amountCents: number;
  attempt: number;
}

export interface BankPayoutInput {
  payoutId: string;
  accountId: string;
  amountCents: number;
  method: 'standard' | 'instant';
  attempt: number;
}

export interface SavedCardCharge {
  brandId: string;
  customerId: string;
  /** Wallet credit X (cents). The card is charged X + processing, so processing is passed through at cost. */
  walletCreditCents: number;
  chargeCents: number;
  idempotencyKey: string;
}

export type StripePayoutStatus = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

export interface BankPayout {
  stripePayoutId: string;
  status: StripePayoutStatus;
  arrivalDate: string | null;
  failureMessage: string | null;
}

export interface PaymentIntentInfo {
  id: string;
  amountCents: number;
  status: 'requires_payment_method' | 'processing' | 'succeeded' | 'canceled' | 'requires_action';
  metadata: Record<string, string>;
  customerId: string | null;
}

export interface StripeEvent {
  id: string;
  type: string;
  /** Set on events from a connected account (Connect webhooks). */
  account?: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export interface PaymentsAdapter {
  readonly mode: 'mock' | 'live';
  createTransfer(input: TransferInput): Promise<{ transferId: string }>;
  createBankPayout(input: BankPayoutInput): Promise<BankPayout>;
  retrievePayout(accountId: string, stripePayoutId: string): Promise<BankPayout>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  /** Auto top-up: charge the brand's saved card off-session. The wallet is credited by the payment_intent.succeeded webhook, like any top-up. */
  chargeSavedCard(input: SavedCardCharge): Promise<{ paymentIntentId: string; status: 'succeeded' | 'processing' | 'failed'; failureMessage: string | null }>;
  /** Verify and parse a webhook. Throws FlowdError(invalid_signature) when the signature does not match. */
  verifyWebhook(rawBody: string, signatureHeader: string | null, nowSeconds: number): Promise<StripeEvent>;
}

/** Nested objects use Stripe's bracket notation: metadata[flowd_payout_id]=pay_123. */
export function encodeForm(params: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') parts.push(encodeForm(value as Record<string, unknown>, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.filter((p) => p !== '').join('&');
}

interface StripeRequestOptions {
  idempotencyKey?: string;
  stripeAccount?: string;
}

interface RawStripePayout {
  id: string;
  status: StripePayoutStatus;
  arrival_date?: number;
  failure_message?: string | null;
}

function toBankPayout(p: RawStripePayout): BankPayout {
  return {
    stripePayoutId: p.id,
    status: p.status,
    arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
    failureMessage: p.failure_message ?? null,
  };
}

export class StripeAdapter implements PaymentsAdapter {
  readonly mode = 'live' as const;
  private readonly secretKey: string;
  private readonly webhookSecrets: string[];

  constructor(env: Pick<Env, 'stripe'>) {
    if (!env.stripe.secretKey) throw new Error('STRIPE_SECRET_KEY is required for live payments');
    this.secretKey = env.stripe.secretKey;
    this.webhookSecrets = [env.stripe.webhookSecret, env.stripe.connectWebhookSecret].filter((s): s is string => Boolean(s));
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}, opts: StripeRequestOptions = {}): Promise<T> {
    // The API version is the one pinned on the Stripe account (Dashboard > Developers): upgrading it is a reviewed, deliberate change.
    const headers: Record<string, string> = { authorization: `Bearer ${this.secretKey}` };
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    if (opts.stripeAccount) headers['stripe-account'] = opts.stripeAccount;
    let url = `https://api.stripe.com/v1/${path}`;
    let body: string | undefined;
    if (method === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = encodeForm(params);
    } else if (Object.keys(params).length > 0) {
      url += `?${encodeForm(params)}`;
    }
    const res = await fetch(url, { method, headers, body });
    const json = (await res.json()) as T & { error?: { type: string; code?: string; message: string } };
    if (!res.ok) {
      const e = json.error;
      if (res.status === 429) throw new FlowdError('rate_limited', 'Stripe is rate limiting; retry shortly.', 429);
      throw new FlowdError(e?.code ?? 'stripe_error', e?.message ?? `Stripe responded ${res.status}`, res.status >= 500 ? 502 : 409, { hint: e?.type });
    }
    return json;
  }

  async createTransfer(input: TransferInput): Promise<{ transferId: string }> {
    const t = await this.request<{ id: string }>('POST', 'transfers', {
      amount: input.amountCents,
      currency: 'usd',
      destination: input.destinationAccount,
      transfer_group: input.payoutId,
      metadata: { flowd_payout_id: input.payoutId, flowd_creator_id: input.creatorId },
    }, { idempotencyKey: `transfer:${input.payoutId}:${input.attempt}` });
    return { transferId: t.id };
  }

  async createBankPayout(input: BankPayoutInput): Promise<BankPayout> {
    const p = await this.request<RawStripePayout>('POST', 'payouts', {
      amount: input.amountCents,
      currency: 'usd',
      method: input.method,
      metadata: { flowd_payout_id: input.payoutId },
    }, { idempotencyKey: `payout:${input.payoutId}:${input.attempt}`, stripeAccount: input.accountId });
    return toBankPayout(p);
  }

  async retrievePayout(accountId: string, stripePayoutId: string): Promise<BankPayout> {
    return toBankPayout(await this.request<RawStripePayout>('GET', `payouts/${encodeURIComponent(stripePayoutId)}`, {}, { stripeAccount: accountId }));
  }

  async retrievePaymentIntent(id: string): Promise<PaymentIntentInfo> {
    const p = await this.request<{ id: string; amount: number; status: PaymentIntentInfo['status']; metadata: Record<string, string>; customer: string | null }>('GET', `payment_intents/${encodeURIComponent(id)}`);
    return { id: p.id, amountCents: p.amount, status: p.status, metadata: p.metadata ?? {}, customerId: p.customer };
  }

  async chargeSavedCard(input: SavedCardCharge): Promise<{ paymentIntentId: string; status: 'succeeded' | 'processing' | 'failed'; failureMessage: string | null }> {
    const customer = await this.request<{ invoice_settings?: { default_payment_method?: string | null } }>('GET', `customers/${encodeURIComponent(input.customerId)}`);
    const method = customer.invoice_settings?.default_payment_method;
    if (!method) return { paymentIntentId: '', status: 'failed', failureMessage: 'The workspace has no default card on file.' };
    try {
      const pi = await this.request<{ id: string; status: string; last_payment_error?: { message?: string } }>('POST', 'payment_intents', {
        amount: input.chargeCents, currency: 'usd', customer: input.customerId, payment_method: method, off_session: true, confirm: true,
        metadata: { flowd_kind: 'wallet_topup', flowd_brand_id: input.brandId, flowd_amount_cents: input.walletCreditCents, flowd_auto_top_up: 'true' },
      }, { idempotencyKey: input.idempotencyKey });
      return { paymentIntentId: pi.id, status: pi.status === 'succeeded' ? 'succeeded' : pi.status === 'processing' ? 'processing' : 'failed', failureMessage: pi.last_payment_error?.message ?? null };
    } catch (err) {
      return { paymentIntentId: '', status: 'failed', failureMessage: err instanceof Error ? err.message : String(err) };
    }
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | null, nowSeconds: number): Promise<StripeEvent> {
    if (!(await verifyStripeSignature(rawBody, signatureHeader, this.webhookSecrets, nowSeconds))) {
      throw new FlowdError('invalid_signature', 'The Stripe signature does not match.', 400);
    }
    return JSON.parse(rawBody) as StripeEvent;
  }
}

/**
 * Mock payments: no network, deterministic ids derived from the payout id. A payout whose id contains "fail" makes the bank payout
 * fail (so the demo and the tests can exercise fail_payout), everything else succeeds. Webhooks are accepted when the signature header
 * is the literal `mock` or the body carries "livemode": false, so the local stack can POST events by hand.
 */
export class MockPaymentsAdapter implements PaymentsAdapter {
  readonly mode = 'mock' as const;

  createTransfer(input: TransferInput): Promise<{ transferId: string }> {
    return Promise.resolve({ transferId: `tr_mock_${input.payoutId}_${input.attempt}` });
  }

  createBankPayout(input: BankPayoutInput): Promise<BankPayout> {
    const failed = input.payoutId.includes('fail');
    return Promise.resolve({
      stripePayoutId: `po_mock_${input.payoutId}_${input.attempt}`,
      status: failed ? 'failed' : input.method === 'instant' ? 'paid' : 'in_transit',
      arrivalDate: null,
      failureMessage: failed ? 'The bank account could not be credited (mock).' : null,
    });
  }

  retrievePayout(_accountId: string, stripePayoutId: string): Promise<BankPayout> {
    return Promise.resolve({ stripePayoutId, status: stripePayoutId.includes('fail') ? 'failed' : 'paid', arrivalDate: null, failureMessage: null });
  }

  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo> {
    return Promise.resolve({ id, amountCents: 0, status: 'succeeded', metadata: {}, customerId: null });
  }

  chargeSavedCard(input: SavedCardCharge): Promise<{ paymentIntentId: string; status: 'succeeded' | 'processing' | 'failed'; failureMessage: string | null }> {
    return Promise.resolve({ paymentIntentId: `pi_mock_${input.idempotencyKey}`, status: 'succeeded', failureMessage: null });
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null, _nowSeconds: number): Promise<StripeEvent> {
    const event = JSON.parse(rawBody) as StripeEvent & { livemode?: boolean };
    if (signatureHeader !== 'mock' && event.livemode !== false) {
      return Promise.reject(new FlowdError('invalid_signature', 'Mock payments accept only Stripe-Signature: mock or livemode:false events.', 400));
    }
    return Promise.resolve(event);
  }
}
