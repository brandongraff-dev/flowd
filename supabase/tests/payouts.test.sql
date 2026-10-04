-- flowd tests: payouts, instant cash-out, holds, failures and clawbacks
--
-- Weekly payouts (Fridays 18:00Z) are free; instant cash-out costs 1.5% (min $0.50, max $15) unless the tier or the founding perk covers
-- it. Cleared money is parked on the creator's scheduled weekly payout the moment it clears; an instant cash-out takes it back.
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_creator('maya');                 -- bronze: pays the instant fee
select tap.mk_creator('gia', 'gold');          -- gold: one free instant cash-out per ISO week
select tap.mk_creator('noah');                 -- will fail every gate in turn
select tap.top_up('lumi', 1100000);
select tap.mk_bounty('bnty_p1', 'lumi', 1000000, 200, 25000);
select tap.fund_open('bnty_p1');
select tap.settle();

-- 1. Instant cash-out of $160.00 (the DOMAIN example): fee 1.5% = $2.40, shown before confirm -----------------------------------------
select tap.eq('80,000 views at $2.00 CPM clear $160.00', tap.cleared_post('m1', 'bnty_p1', 'lumi', 'maya', 80000) ->> 'cleared_cents', '16000');
select tap.settle();
select tap.eq('the cleared money is parked on the scheduled weekly payout', (select status::text || '/' || gross_cents::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), 'scheduled/16000');
select tap.same('quote: fee and net are known before the creator confirms', public.instant_payout_quote('cr_maya'),
  '{"ok": true, "amount_cents": 16000, "fee_cents": 240, "net_cents": 15760, "free_instant": false, "list_fee_cents": 240, "available_cents": 16000, "tier": "bronze"}'::jsonb);

select tap.eq('instant cash-out is processing', public.create_instant_payout('cr_maya', 'k1') ->> 'status', 'processing');
select tap.settle();
select tap.same('the instant payout', (select to_jsonb(p) from public.payouts p where creator_id = 'cr_maya' and kind = 'instant'),
  '{"gross_cents": 16000, "fee_cents": 240, "net_cents": 15760, "item_count": 1, "free_instant": false, "status": "processing"}'::jsonb);
select tap.eq('the weekly payout it emptied is cancelled and its key freed', (select status::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), 'cancelled');
select tap.eq('the same Idempotency-Key returns the same payout', (select (public.create_instant_payout('cr_maya', 'k1') ->> 'idempotent')), 'true');
select tap.eq('only one instant payout exists', (select count(*)::text from public.payouts where creator_id = 'cr_maya' and kind = 'instant'), '1');
select tap.eq('nothing is left to cash out', public.instant_payout_quote('cr_maya') ->> 'blocked_reason', 'below_minimum');

select tap.eq('Stripe confirms: paid', public.complete_payout((select id from public.payouts where creator_id = 'cr_maya' and kind = 'instant'), 'tr_i1') ->> 'status', 'paid');
select tap.settle();
select tap.eq('creator -16,000, bank +15,760, fee +240 (payout_fee)', tap.bal('creator:cr_maya')::text || '/' || tap.bal('external:bank')::text || '/' || (select sum(amount_cents)::text from public.ledger where entry_type = 'payout_fee'), '0/15760/240');
select tap.eq('platform:fees = 10% of pay + the instant fee', tap.bal('platform:fees')::text, '1840');
select tap.ok('audit_ledger is clean after the instant payout', (public.audit_ledger() ->> 'ok')::boolean);

-- new money clears after the cash-out: a fresh weekly payout is created (the cancelled one freed the key)
select tap.eq('a second post clears $40.00', tap.cleared_post('m2', 'bnty_p1', 'lumi', 'maya', 20000) ->> 'cleared_cents', '4000');
select tap.eq('and gets its own scheduled weekly payout', (select count(*)::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly' and status = 'scheduled' and gross_cents = 4000), '1');

-- 2. Gold: the first instant cash-out of the ISO week is free, the second is not ------------------------------------------------------
select tap.cleared_post('g1', 'bnty_p1', 'lumi', 'gia', 80000);
select tap.same('gold quote: free once a week', public.instant_payout_quote('cr_gia'), '{"ok": true, "fee_cents": 0, "net_cents": 16000, "free_instant": true, "list_fee_cents": 240}'::jsonb);
select public.create_instant_payout('cr_gia', 'g-k1');
select tap.cleared_post('g2', 'bnty_p1', 'lumi', 'gia', 80000);
select tap.same('the second one costs the list fee', public.instant_payout_quote('cr_gia'), '{"ok": true, "fee_cents": 240, "net_cents": 15760, "free_instant": false}'::jsonb);
select tap.settle();

-- 3. Every gate has a named reason --------------------------------------------------------------------------------------------------
select tap.cleared_post('n1', 'bnty_p1', 'lumi', 'noah', 80000);
update public.payout_methods set deleted_at = now() where creator_id = 'cr_noah';
select tap.eq('no payout method', public.instant_payout_quote('cr_noah') ->> 'blocked_reason', 'method_missing');
select tap.raises('instant cash-out refuses without a method', $$select public.create_instant_payout('cr_noah', 'n-k1')$$, 'FD007');
update public.payout_methods set deleted_at = null where creator_id = 'cr_noah';
select tap.sudo($$update public.tax_profiles set status = 'requested' where creator_id = 'cr_noah'$$);
select tap.eq('no tax info', public.instant_payout_quote('cr_noah') ->> 'blocked_reason', 'tax_info_missing');
select tap.raises('instant cash-out refuses without tax info', $$select public.create_instant_payout('cr_noah', 'n-k2')$$, 'FD008');
select tap.sudo($$update public.tax_profiles set status = 'submitted' where creator_id = 'cr_noah'$$);
select tap.sudo($$update public.creators set verification_status = 'pending' where id = 'cr_noah'$$);
select tap.eq('identity not verified', public.instant_payout_quote('cr_noah') ->> 'blocked_reason', 'identity_check_required');
select tap.raises('instant cash-out refuses before the identity check', $$select public.create_instant_payout('cr_noah', 'n-k3')$$, 'FD009');

-- the weekly run holds the payout with a named reason, and releasing the hold lets the next run pay it
select tap.eq('weekly payout held for the identity check', (select public.start_payout(id) ->> 'hold_reason' from public.payouts where creator_id = 'cr_noah' and kind = 'weekly'), 'identity_check');
select tap.sudo($$update public.creators set verification_status = 'verified' where id = 'cr_noah'$$);
select tap.sudo($$update public.tax_profiles set status = 'requested' where creator_id = 'cr_noah'$$);
select public.release_payout_hold(id) from public.payouts where creator_id = 'cr_noah' and kind = 'weekly';
select tap.eq('then held for the missing W-9', (select public.start_payout(id) ->> 'hold_reason' from public.payouts where creator_id = 'cr_noah' and kind = 'weekly'), 'tax_info_missing');
select tap.sudo($$update public.tax_profiles set status = 'submitted' where creator_id = 'cr_noah'$$);
select public.release_payout_hold(id) from public.payouts where creator_id = 'cr_noah' and kind = 'weekly';
select tap.eq('and starts once every gate passes', (select public.start_payout(id) ->> 'status' from public.payouts where creator_id = 'cr_noah' and kind = 'weekly'), 'processing');

-- 4. A failed transfer: weekly payouts retry next run, instant ones release their rows ------------------------------------------
select tap.eq('failed weekly payout is rescheduled', (select public.fail_payout(id, 'Bank rejected the transfer') ->> 'status' from public.payouts where creator_id = 'cr_noah' and kind = 'weekly'), 'scheduled');
select tap.eq('its rows stay attached for the retry', (select count(*)::text from public.ledger l join public.payouts p on p.id = l.payout_id where p.creator_id = 'cr_noah' and p.kind = 'weekly' and l.status = 'cleared'), '1');
select tap.eq('instant payout created for the failure test', public.create_instant_payout('cr_noah', 'n-k4') ->> 'status', 'processing');
select tap.eq('failed instant payout', (select public.fail_payout(id, 'Card declined') ->> 'status' from public.payouts where creator_id = 'cr_noah' and kind = 'instant'), 'failed');
select tap.eq('releases its rows: the balance is available again', public.instant_payout_quote('cr_noah') ->> 'available_cents', '16000');
select tap.settle();

-- 5. Clawback (proven fraud only): the invalid views are reversed, delivered views stay paid -------------------------------------
select tap.cleared_post('c1', 'bnty_p1', 'lumi', 'gia', 50000);      -- pay $100.00 + fee $10.00
select tap.eq('wallet before the clawback', tap.bal('wallet:br_lumi')::text, (select wallet_balance_cents::text from public.brands where id = 'br_lumi'));
update public.posts set views_invalid = 20000 where id = 'post_c1';  -- Ops confirmed 20,000 invalid views
select tap.same('partial clawback reverses the pay of the invalid views', public.claw_back('post_c1', 'proven view fraud'),
  '{"status": "clawed_back", "reversed_pay_cents": 4000, "reversed_fee_cents": 400, "full": false}'::jsonb);
select tap.settle();
select tap.eq('the post keeps the pay of 30,000 valid views', (select (earnings ->> 'cpm_cents') from public.posts where id = 'post_c1'), '6000');
select tap.eq('the clawback transaction points at the original', (select count(*)::text from public.ledger_transactions where kind = 'clawback' and reverses_txn_id is not null), '1');
select tap.cleared_post('c2', 'bnty_p1', 'lumi', 'gia', 10000);
select tap.raises('a clawback needs a reason', $$select public.claw_back('post_c2', '  ')$$, 'FD003');
select tap.eq('clawing back twice is idempotent', public.claw_back('post_c1', 'again') ->> 'idempotent', 'true');
select tap.ok('audit_ledger is clean after the clawback', (public.audit_ledger() ->> 'ok')::boolean);

-- 6. Proven fraud found AFTER the payout: the bank keeps the money, the creator balance goes negative and the next payout recovers it ----
select tap.cleared_post('f1', 'bnty_p1', 'lumi', 'maya', 50000);     -- $100.00 cleared
select tap.eq('instant cash-out of the $100.00 (+ the $40.00 already waiting)', public.create_instant_payout('cr_maya', 'm-k2') ->> 'status', 'processing');
select public.complete_payout((select id from public.payouts where creator_id = 'cr_maya' and kind = 'instant' and status = 'processing'));
update public.posts set views_invalid = window_views where id = 'post_f1';
select tap.same('full clawback of a paid post', public.claw_back('post_f1', 'proven view fraud'), '{"status": "clawed_back", "reversed_pay_cents": 10000, "reversed_fee_cents": 1000, "full": true}'::jsonb);
select tap.settle();
select tap.eq('the creator owes $100.00: the account is negative', tap.bal('creator:cr_maya')::text, '-10000');
select tap.eq('the debt is a cleared, unpaid row (it nets against the next payout)', (select status::text || '/' || (payout_id is null)::text from public.ledger where post_id = 'post_f1' and entry_type = 'clawback' and account = 'creator:cr_maya'), 'cleared/true');
select tap.eq('a negative balance is not payable', public.attach_cleared_earnings('cr_maya') ->> 'attached', '0');
select tap.cleared_post('f2', 'bnty_p1', 'lumi', 'maya', 80000);     -- +$160.00
select tap.eq('the next payout is the new earning minus the debt: $60.00', (select gross_cents::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly' and status = 'scheduled'), '6000');
select tap.eq('start the weekly payout', (select public.start_payout(id) ->> 'status' from public.payouts where creator_id = 'cr_maya' and kind = 'weekly' and status = 'scheduled'), 'processing');
select public.complete_payout((select id from public.payouts where creator_id = 'cr_maya' and kind = 'weekly' and status = 'processing'));
select tap.settle();
select tap.eq('the account is square again', tap.bal('creator:cr_maya')::text, '0');
select tap.eq('the brand got the paid pay and fee back', (select sum(amount_cents)::text from public.ledger where entry_type = 'clawback' and account = 'wallet:br_lumi' and post_id = 'post_f1'), '11000');
select tap.ok('audit_ledger is clean after the recovery', (public.audit_ledger() ->> 'ok')::boolean);

select 'payouts.test.sql: passed' as result;
rollback;
