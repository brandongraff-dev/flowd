// webhook-stripe: Stripe -> flowd.   POST /functions/v1/webhook-stripe   (Stripe-Signature verified; verify_jwt = false)
// One endpoint receives both the platform events and the Connect events (event.account is set on the latter).
//
//   payment_intent.succeeded     a brand paid by card. metadata.flowd_kind = wallet_topup, flowd_brand_id, flowd_amount_cents (the wallet credit),
//                                optional flowd_bounty_id. Posts the wallet_topup ledger transaction (idempotent on the PaymentIntent), writes the
//                                paid funding invoice, and funds the bounty when one is named (Funded badge, goes live).
//   payout.paid / payout.failed  Connect: the creator's bank payout (metadata.flowd_payout_id) -> complete_payout() / fail_payout()
//   account.updated              Connect: onboarding finished or requirements changed -> payout_ready, payout method verified, identity verified
//   invoice.paid                 a Pro / Scale subscription payment (price metadata flowd_plan) -> subscription_fee transaction, plan + renewal date
//   customer.subscription.deleted  back to the Free plan
//   charge.dispute.created, charge.refunded   written to the audit log and raised to Ops: money coming back out of the platform is never
//                                automatic (the ledger is append-only; a refund is a reviewed reversing transaction)
// Everything else is stored in the inbox and ignored.
//
// Idempotency: the inbox (provider + Stripe event id) stops redeliveries; the ledger transaction key `topup:<payment_intent>` and the unique
// index on invoices.stripe_payment_intent_id make a replay after a crash harmless.

import { buildAdapters } from '../_shared/adapters/index.ts';
import type { StripeEvent } from '../_shared/adapters/payments.ts';
import { loadEnv } from '../_shared/env.ts';
import { type Db, rpc, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { errorMessage, FlowdError } from '../_shared/errors.ts';
import { handle, jsonResponse, log, requireMethod } from '../_shared/http.ts';
import { markInbound, storeInbound } from '../_shared/inbox.ts';
import { brandRecipients, notify } from '../_shared/notify.ts';
import type { PushAdapter } from '../_shared/adapters/push.ts';
import { notifyPayoutPaid } from '../_shared/payouts.ts';
import { enqueueEvent } from '../_shared/webhooks-out.ts';

export type Outcome = 'processed' | 'ignored';

interface Ctx {
  db: Db;
  push: PushAdapter;
  now: Date;
}

const PLANS = new Set(['pro', 'scale']);

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function audit(db: Db, action: string, targetTable: string, targetId: string, reason: string, after: Record<string, unknown>): Promise<void> {
  unwrap(await db.from('audit_log').insert({ actor_kind: 'system', action, target_table: targetTable, target_id: targetId, reason, after }).select('id'));
}

// ── payment_intent.succeeded: wallet top-up (and optional escrow funding) ───────────────────────────────────────────────────

export async function onPaymentIntentSucceeded(ctx: Ctx, pi: Record<string, unknown>): Promise<Outcome> {
  const { db, now } = ctx;
  const meta = asRecord(pi.metadata);
  if (meta.flowd_kind !== 'wallet_topup') return 'ignored';
  const piId = str(pi.id);
  const brandId = str(meta.flowd_brand_id);
  const credit = Number(meta.flowd_amount_cents);
  const charged = num(pi.amount);
  if (!piId || !brandId || !Number.isInteger(credit) || credit <= 0 || charged === null) {
    throw new FlowdError('validation_failed', 'The PaymentIntent metadata is missing flowd_brand_id or flowd_amount_cents.', 422);
  }

  // The card is charged the credit plus processing at cost (2.9% + $0.30). Any other amount is a bug or tampering: do not credit, tell Ops.
  const processing = await rpc<number>(db, 'card_processing', { p_amount_cents: credit });
  if (charged !== credit + processing) {
    await audit(db, 'stripe.amount_mismatch', 'brands', brandId, `PaymentIntent ${piId} charged ${charged} but credit ${credit} + processing ${processing} = ${credit + processing}`, { payment_intent: piId });
    throw new FlowdError('conflict', `The charged amount (${charged}) does not equal credit + processing (${credit + processing}).`, 409);
  }

  const brand = unwrapMaybe(await db.from('brands').select('id,deleted_at').eq('id', brandId).maybeSingle()) as { id: string; deleted_at: string | null } | null;
  if (!brand) throw new FlowdError('not_found', `Brand ${brandId} does not exist.`, 404);

  const txnId = await rpc<string>(db, 'post_ledger_txn', {
    p_kind: 'wallet_topup',
    p_legs: [
      { account: 'external:card', amount_cents: -(credit + processing), entry_type: 'wallet_topup', brand_id: brandId, memo: 'Wallet top-up by card' },
      { account: `wallet:${brandId}`, amount_cents: credit, entry_type: 'wallet_topup', memo: 'Wallet top-up by card' },
      { account: 'platform:processing', amount_cents: processing, entry_type: 'processing', brand_id: brandId, memo: 'Card processing passed through at cost' },
    ],
    p_memo: 'Wallet top-up by card',
    p_idempotency_key: `topup:${piId}`,
  });

  const existing = unwrapMaybe(await db.from('invoices').select('id').eq('stripe_payment_intent_id', piId).maybeSingle()) as { id: string } | null;
  if (!existing) {
    const number = await rpc<string>(db, 'next_invoice_number', { p_at: now.toISOString() });
    unwrap(
      await db.from('invoices').insert({
        brand_id: brandId, number, kind: 'funding', status: 'paid', bounty_id: str(meta.flowd_bounty_id),
        line_items: [
          { description: 'Wallet top-up', quantity: 1, unit_cents: credit, amount_cents: credit },
          { description: 'Card processing (2.9% + $0.30)', quantity: 1, unit_cents: processing, amount_cents: processing },
        ],
        subtotal_cents: credit, processing_cents: processing, tax_cents: 0, total_cents: credit + processing,
        issued_at: now.toISOString(), due_at: now.toISOString(), paid_at: now.toISOString(), ledger_txn_id: txnId,
        pdf_ref: `invoices/${brandId}/${number}.pdf`, stripe_payment_intent_id: piId,
      }).select('id'),
    );
  }

  await enqueueEvent(db, brandId, 'invoice_paid', { payment_intent: piId, wallet_credit_cents: credit, processing_cents: processing, ledger_txn_id: txnId }, now);

  // Fund the named bounty now that the money is in the wallet. A bounty that cannot be funded (already live, cancelled ...) must not undo the top-up.
  const bountyId = str(meta.flowd_bounty_id);
  if (bountyId) {
    try {
      const funded = await rpc<{ status: string; funded: boolean; idempotent?: boolean }>(db, 'fund_bounty', { p_bounty_id: bountyId });
      if (funded.funded && !funded.idempotent) {
        await enqueueEvent(db, brandId, 'bounty_funded', { bounty_id: bountyId, status: funded.status }, now);
        if (funded.status === 'live') await enqueueEvent(db, brandId, 'bounty_live', { bounty_id: bountyId }, now);
        for (const userId of await brandRecipients(db, brandId, 'finance.read')) {
          await notify(db, ctx.push, { recipientUserId: userId, audience: 'brand', kind: 'bounty_funded', priority: 'normal', title: 'Bounty funded', body: 'Your bounty is funded and escrowed. It shows the Funded badge.', deepLink: `flowd://bounties/${bountyId}`, refKind: 'bounty', refId: bountyId }, now);
        }
      }
    } catch (err) {
      log('webhook-stripe', 'warn', 'fund_after_topup_failed', { bounty: bountyId, message: errorMessage(err) });
    }
  }
  return 'processed';
}

// ── Connect: payouts ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function onPayoutEvent(ctx: Ctx, type: string, obj: Record<string, unknown>): Promise<Outcome> {
  const { db } = ctx;
  const stripePayoutId = str(obj.id);
  let payoutId = str(asRecord(obj.metadata).flowd_payout_id);
  if (!payoutId && stripePayoutId) {
    const row = unwrapMaybe(await db.from('payouts').select('id').eq('stripe_payout_id', stripePayoutId).maybeSingle()) as { id: string } | null;
    payoutId = row?.id ?? null;
  }
  if (!payoutId) return 'ignored'; // not a flowd payout (for example a payout the creator configured themselves)
  if (type === 'payout.paid') {
    await rpc(db, 'complete_payout', { p_payout_id: payoutId, p_stripe_transfer_id: null, p_stripe_payout_id: stripePayoutId });
    await notifyPayoutPaid(db, ctx.push, payoutId, ctx.now);
    return 'processed';
  }
  const reason = str(obj.failure_message) ?? str(obj.failure_code) ?? 'The bank payout failed.';
  const kind = unwrapMaybe(await db.from('payouts').select('kind').eq('id', payoutId).maybeSingle()) as { kind: 'weekly' | 'instant' } | null;
  await rpc(db, 'fail_payout', { p_payout_id: payoutId, p_reason: reason, p_retry: kind?.kind !== 'instant' });
  return 'processed';
}

// ── Connect: account.updated ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function onAccountUpdated(ctx: Ctx, account: Record<string, unknown>): Promise<Outcome> {
  const { db, now } = ctx;
  const accountId = str(account.id);
  if (!accountId) return 'ignored';
  const creator = unwrapMaybe(await db.from('creators').select('id,user_id,verification_status,payout_ready').eq('stripe_account_id', accountId).maybeSingle()) as
    | { id: string; user_id: string; verification_status: string; payout_ready: boolean }
    | null;
  if (!creator) return 'ignored';

  const ready = account.payouts_enabled === true && account.details_submitted === true;
  const requirements = asRecord(account.requirements);
  const due = Array.isArray(requirements.currently_due) ? requirements.currently_due.length : 0;
  const idVerified = str(asRecord(asRecord(account.individual).verification).status) === 'verified';

  if (ready !== creator.payout_ready) unwrap(await db.from('creators').update({ payout_ready: ready }).eq('id', creator.id).select('id'));
  if (ready) {
    unwrap(await db.from('payout_methods').update({ status: 'active', verified_at: now.toISOString() }).eq('creator_id', creator.id).is('deleted_at', null).neq('status', 'active').select('id'));
  }
  // identity: not_started -> pending -> verified follow the contract's verification machine one edge at a time
  if (idVerified && creator.verification_status !== 'verified') {
    if (creator.verification_status === 'not_started') unwrap(await db.from('creators').update({ verification_status: 'pending' }).eq('id', creator.id).select('id'));
    unwrap(await db.from('creators').update({ verification_status: 'verified' }).eq('id', creator.id).select('id'));
    await notify(db, ctx.push, { recipientUserId: creator.user_id, audience: 'creator', kind: 'system_notice', priority: 'normal', title: 'You are verified', body: 'Your ID check is done. Payouts can go out.', deepLink: 'flowd://wallet', refKind: 'creator', refId: creator.id }, now);
  } else if (due > 0 && !ready) {
    await notify(db, ctx.push, { recipientUserId: creator.user_id, audience: 'creator', kind: 'tax_info_needed', priority: 'normal', title: 'One more step to get paid', body: `Stripe needs ${due} more detail${due === 1 ? '' : 's'} to switch payouts on.`, deepLink: 'flowd://wallet/payout-setup', refKind: 'creator', refId: creator.id }, now);
  }
  return 'processed';
}

// ── Subscriptions (Pro, Scale) ──────────────────────────────────────────────────────────────────────────────────────────────

function planOfInvoice(invoice: Record<string, unknown>): { plan: string; periodEnd: string | null } | null {
  const lines = asRecord(invoice.lines);
  const data = Array.isArray(lines.data) ? lines.data : [];
  for (const raw of data) {
    const line = asRecord(raw);
    const price = asRecord(line.price);
    const plan = str(asRecord(price.metadata).flowd_plan) ?? str(asRecord(asRecord(price.product).metadata).flowd_plan);
    if (plan && PLANS.has(plan)) {
      const end = num(asRecord(line.period).end);
      return { plan, periodEnd: end ? new Date(end * 1000).toISOString() : null };
    }
  }
  return null;
}

export async function onInvoicePaid(ctx: Ctx, invoice: Record<string, unknown>): Promise<Outcome> {
  const { db, now } = ctx;
  const invoiceId = str(invoice.id);
  const customer = str(invoice.customer);
  const paid = num(invoice.amount_paid);
  const plan = planOfInvoice(invoice);
  if (!invoiceId || !customer || paid === null || paid <= 0 || !plan) return 'ignored'; // not a flowd plan invoice
  const brand = unwrapMaybe(await db.from('brands').select('id').eq('stripe_customer_id', customer).maybeSingle()) as { id: string } | null;
  if (!brand) throw new FlowdError('not_found', `No brand has Stripe customer ${customer}.`, 404);

  const txnId = await rpc<string>(db, 'post_ledger_txn', {
    p_kind: 'subscription_fee',
    p_legs: [
      { account: 'external:card', amount_cents: -paid, entry_type: 'subscription_fee', brand_id: brand.id, memo: `${plan.plan} plan` },
      { account: 'platform:subscriptions', amount_cents: paid, entry_type: 'subscription_fee', brand_id: brand.id, memo: `${plan.plan} plan` },
    ],
    p_memo: `flowd ${plan.plan} plan`,
    p_idempotency_key: `sub:${invoiceId}`,
  });
  unwrap(await db.from('brands').update({ plan: plan.plan, plan_renews_at: plan.periodEnd }).eq('id', brand.id).select('id'));
  const existing = unwrapMaybe(await db.from('invoices').select('id').eq('stripe_invoice_id', invoiceId).maybeSingle()) as { id: string } | null;
  if (!existing) {
    const number = await rpc<string>(db, 'next_invoice_number', { p_at: now.toISOString() });
    unwrap(
      await db.from('invoices').insert({
        brand_id: brand.id, number, kind: 'subscription', status: 'paid',
        line_items: [{ description: `flowd ${plan.plan} plan`, quantity: 1, unit_cents: paid, amount_cents: paid }],
        subtotal_cents: paid, processing_cents: 0, tax_cents: num(invoice.tax) ?? 0, total_cents: paid + (num(invoice.tax) ?? 0),
        issued_at: now.toISOString(), due_at: now.toISOString(), paid_at: now.toISOString(), ledger_txn_id: txnId, pdf_ref: `invoices/${brand.id}/${number}.pdf`, stripe_invoice_id: invoiceId,
      }).select('id'),
    );
  }
  return 'processed';
}

export async function onSubscriptionDeleted(ctx: Ctx, sub: Record<string, unknown>): Promise<Outcome> {
  const customer = str(sub.customer);
  if (!customer) return 'ignored';
  unwrap(await ctx.db.from('brands').update({ plan: 'free', plan_renews_at: null }).eq('stripe_customer_id', customer).select('id'));
  return 'processed';
}

// ── Money coming back out: raise it, never automate it ─────────────────────────────────────────────────────────────────────────

export async function onChargeTrouble(ctx: Ctx, type: string, charge: Record<string, unknown>): Promise<Outcome> {
  const chargeId = str(charge.id) ?? 'unknown';
  await audit(ctx.db, type === 'charge.dispute.created' ? 'stripe.dispute_opened' : 'stripe.charge_refunded', 'stripe_charges', chargeId, 'Needs a reviewed reversing transaction (the ledger is append-only).', {
    amount: num(charge.amount), payment_intent: str(charge.payment_intent),
  });
  const admins = unwrap(await ctx.db.from('users').select('id').eq('role', 'admin').eq('status', 'active')) as Array<{ id: string }>;
  for (const a of admins) {
    await notify(ctx.db, ctx.push, { recipientUserId: a.id, audience: 'admin', kind: 'system_notice', priority: 'normal', title: type === 'charge.dispute.created' ? 'Card dispute opened' : 'Charge refunded', body: `Stripe ${chargeId}: review the ledger impact in the Ops console.`, deepLink: 'flowd://admin/ledger', refKind: 'charge', refId: chargeId }, ctx.now);
  }
  return 'processed';
}

/** Route a verified event to its handler. */
export async function dispatch(ctx: Ctx, event: StripeEvent): Promise<Outcome> {
  const obj = event.data.object;
  switch (event.type) {
    case 'payment_intent.succeeded': return onPaymentIntentSucceeded(ctx, obj);
    case 'payout.paid':
    case 'payout.failed':
    case 'payout.canceled': return onPayoutEvent(ctx, event.type === 'payout.paid' ? 'payout.paid' : 'payout.failed', obj);
    case 'account.updated': return onAccountUpdated(ctx, obj);
    case 'invoice.paid': return onInvoicePaid(ctx, obj);
    case 'customer.subscription.deleted': return onSubscriptionDeleted(ctx, obj);
    case 'charge.dispute.created':
    case 'charge.refunded': return onChargeTrouble(ctx, event.type, obj);
    default: return 'ignored';
  }
}

export const handler = handle('webhook-stripe', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['stripe']);
  const adapters = buildAdapters(env);
  const rawBody = await req.text();
  const now = new Date();
  const event = await adapters.payments.verifyWebhook(rawBody, req.headers.get('stripe-signature'), Math.floor(now.getTime() / 1000));
  const db = serviceClient(env);

  const stored = await storeInbound(db, { provider: 'stripe', eventId: event.id, eventType: event.type, payload: event, signatureValid: true });
  if (stored.duplicate && (stored.status === 'processed' || stored.status === 'ignored' || stored.status === 'dead')) return jsonResponse({ received: true, duplicate: true });

  try {
    const outcome = await dispatch({ db, push: adapters.push, now }, event);
    await markInbound(db, stored.id, outcome);
    log('webhook-stripe', 'info', 'event', { event_id: event.id, type: event.type, outcome });
    return jsonResponse({ received: true, outcome });
  } catch (err) {
    await markInbound(db, stored.id, 'failed', errorMessage(err));
    throw err;
  }
});
