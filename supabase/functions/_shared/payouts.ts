// Moving a payout through Stripe. Shared by weekly-payouts (the Friday run and the reconciler) and by the on-demand dispatch the API calls
// right after create_instant_payout().
//
//   processing --transfer--> platform balance -> creator's Connect account      (idempotent: transfer:<payout>:<attempt>)
//              --payout----> Connect account -> the creator's bank              (idempotent: payout:<payout>:<attempt>; "instant" or "standard")
//   in_transit  (mark_payout_in_transit records the transfer)
//   paid        complete_payout() posts the ledger transaction and marks the earning rows paid: called here when Stripe already says the
//               bank payout is paid (instant cash-outs, mocks) or later by the payout.paid webhook / the reconciler
//   failed      fail_payout(): weekly payouts retry at the next run, instant ones release their rows
//
// Every step is safe to repeat: the Stripe calls are idempotent, mark_payout_in_transit / complete_payout / fail_payout ignore a state they
// have already reached, so a crash anywhere is repaired by the next reconcile pass.

import type { PaymentsAdapter } from './adapters/payments.ts';
import { type Db, type PayoutRow, rpc, unwrap, unwrapMaybe } from './db.ts';
import { errorMessage } from './errors.ts';
import { log } from './http.ts';
import type { PushAdapter } from './adapters/push.ts';
import { notify } from './notify.ts';

export type DispatchOutcome = 'in_transit' | 'paid' | 'failed' | 'skipped';

export interface DispatchResult {
  payoutId: string;
  outcome: DispatchOutcome;
  detail?: string;
}

const PAYOUT_COLUMNS = 'id,creator_id,kind,status,gross_cents,fee_cents,net_cents,run_id,payout_method_id,stripe_transfer_id,stripe_payout_id,attempts,free_instant,initiated_at,scheduled_for';

export async function loadPayout(db: Db, payoutId: string): Promise<PayoutRow | null> {
  return unwrapMaybe(await db.from('payouts').select(PAYOUT_COLUMNS).eq('id', payoutId).maybeSingle()) as PayoutRow | null;
}

/** The Connect account to pay: the creator's stripe_account_id. In mock mode a deterministic account id stands in so the demo flows end to end. */
export async function destinationAccount(db: Db, payments: PaymentsAdapter, creatorId: string): Promise<string | null> {
  const row = unwrapMaybe(await db.from('creators').select('stripe_account_id').eq('id', creatorId).maybeSingle()) as { stripe_account_id: string | null } | null;
  if (row?.stripe_account_id) return row.stripe_account_id;
  return payments.mode === 'mock' ? `acct_mock_${creatorId}` : null;
}

/** Send one `processing` payout to Stripe. Anything else is skipped (already in flight, paid, held ...). */
export async function dispatchPayout(db: Db, payments: PaymentsAdapter, payoutId: string): Promise<DispatchResult> {
  const payout = await loadPayout(db, payoutId);
  if (!payout) return { payoutId, outcome: 'skipped', detail: 'not found' };
  if (payout.status !== 'processing') return { payoutId, outcome: 'skipped', detail: `status is ${payout.status}` };

  const account = await destinationAccount(db, payments, payout.creator_id);
  if (!account) {
    await rpc(db, 'fail_payout', { p_payout_id: payoutId, p_reason: 'The payout account is not connected. Finish payout setup and the next run pays this.', p_retry: payout.kind === 'weekly' });
    return { payoutId, outcome: 'failed', detail: 'no connected account' };
  }

  try {
    const transfer = payout.stripe_transfer_id
      ? { transferId: payout.stripe_transfer_id }
      : await payments.createTransfer({ payoutId, creatorId: payout.creator_id, destinationAccount: account, amountCents: payout.net_cents, attempt: payout.attempts });
    await rpc(db, 'mark_payout_in_transit', { p_payout_id: payoutId, p_stripe_transfer_id: transfer.transferId });
    const bank = await payments.createBankPayout({ payoutId, accountId: account, amountCents: payout.net_cents, method: payout.kind === 'instant' ? 'instant' : 'standard', attempt: payout.attempts });
    unwrap(await db.from('payouts').update({ stripe_payout_id: bank.stripePayoutId }).eq('id', payoutId).select('id'));
    if (bank.status === 'paid') {
      await rpc(db, 'complete_payout', { p_payout_id: payoutId, p_stripe_transfer_id: transfer.transferId, p_stripe_payout_id: bank.stripePayoutId });
      return { payoutId, outcome: 'paid' };
    }
    if (bank.status === 'failed' || bank.status === 'canceled') {
      await rpc(db, 'fail_payout', { p_payout_id: payoutId, p_reason: bank.failureMessage ?? 'The bank payout failed.', p_retry: payout.kind === 'weekly' });
      return { payoutId, outcome: 'failed', detail: bank.failureMessage ?? undefined };
    }
    return { payoutId, outcome: 'in_transit' };
  } catch (err) {
    // A thrown error leaves the payout `processing` (or `in_transit` if the transfer was recorded): the reconciler repeats the idempotent
    // calls. Only a definitive provider refusal fails it, and that is raised as FlowdError by the adapter.
    log('payouts', 'error', 'dispatch_error', { payout: payoutId, message: errorMessage(err) });
    return { payoutId, outcome: 'skipped', detail: errorMessage(err) };
  }
}

/** Ask Stripe about a payout that has been `in_transit` for a while and settle it (the webhook normally does this first). */
export async function reconcileInTransit(db: Db, payments: PaymentsAdapter, payoutId: string): Promise<DispatchResult> {
  const payout = await loadPayout(db, payoutId);
  if (!payout || payout.status !== 'in_transit' || !payout.stripe_payout_id) return { payoutId, outcome: 'skipped' };
  const account = await destinationAccount(db, payments, payout.creator_id);
  if (!account) return { payoutId, outcome: 'skipped', detail: 'no connected account' };
  const bank = await payments.retrievePayout(account, payout.stripe_payout_id);
  if (bank.status === 'paid') {
    await rpc(db, 'complete_payout', { p_payout_id: payoutId, p_stripe_transfer_id: payout.stripe_transfer_id, p_stripe_payout_id: bank.stripePayoutId });
    return { payoutId, outcome: 'paid' };
  }
  if (bank.status === 'failed' || bank.status === 'canceled') {
    await rpc(db, 'fail_payout', { p_payout_id: payoutId, p_reason: bank.failureMessage ?? 'The bank payout failed.', p_retry: payout.kind === 'weekly' });
    return { payoutId, outcome: 'failed', detail: bank.failureMessage ?? undefined };
  }
  return { payoutId, outcome: 'in_transit' };
}

const money = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Tell the creator a payout reached the bank. Called wherever a payout becomes paid (dispatch, reconciler, Stripe webhook); notifies once per payout. */
export async function notifyPayoutPaid(db: Db, push: PushAdapter, payoutId: string, now: Date): Promise<void> {
  const payout = await loadPayout(db, payoutId);
  if (!payout || payout.status !== 'paid') return;
  const creator = unwrapMaybe(await db.from('creators').select('user_id').eq('id', payout.creator_id).maybeSingle()) as { user_id: string } | null;
  if (!creator) return;
  const already = unwrap(await db.from('notifications').select('id').eq('recipient_user_id', creator.user_id).eq('kind', 'payout_paid').eq('ref_id', payoutId).limit(1)) as Array<{ id: string }>;
  if (already.length > 0) return;
  const detail = payout.fee_cents > 0 ? ` (instant fee ${money(payout.fee_cents)} already taken)` : '';
  await notify(db, push, { recipientUserId: creator.user_id, audience: 'creator', kind: 'payout_paid', priority: 'cash', title: `${money(payout.net_cents)} is on its way`, body: `Your ${payout.kind === 'instant' ? 'instant cash-out' : 'weekly payout'} was sent${detail}.`, amountCents: payout.net_cents, deepLink: `flowd://wallet/payouts/${payoutId}`, refKind: 'payout', refId: payoutId }, now);
}

/** Tell the creator a payout is held and exactly what unblocks it (the Money Clock names the same reason). */
export async function notifyPayoutHeld(db: Db, push: PushAdapter, payoutId: string, reason: string, now: Date): Promise<void> {
  const payout = await loadPayout(db, payoutId);
  if (!payout) return;
  const creator = unwrapMaybe(await db.from('creators').select('user_id').eq('id', payout.creator_id).maybeSingle()) as { user_id: string } | null;
  if (!creator) return;
  const fix: Record<string, string> = {
    identity_check: 'Finish your ID check',
    tax_info_missing: 'Add your tax form (W-9)',
    payout_method_missing: 'Add a payout method',
  };
  await notify(db, push, { recipientUserId: creator.user_id, audience: 'creator', kind: 'payout_held', priority: 'cash', title: `${money(payout.net_cents)} is waiting on you`, body: `${fix[reason] ?? 'Ops are reviewing it'} and the next payout includes this money.`, amountCents: payout.net_cents, deepLink: 'flowd://wallet', refKind: 'payout', refId: payoutId }, now);
}
