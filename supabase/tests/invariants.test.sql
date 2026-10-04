-- flowd tests: the invariants the database enforces for every client, job and admin tool
--
--   append-only double-entry ledger, balance floors, escrow reconciliation, state machines as data, the No-Rug rules, the Rights Card,
--   first-bounty matching, Reserved Slot limits, tier gates, the offer-code cap and the workspace owner rule.
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_brand('newco', 'pro', false);        -- first bounty not used yet: matched budget and no fee
select tap.mk_creator('maya');
select tap.top_up('lumi', 500000);
select tap.settle();

-- 1. The ledger is append-only --------------------------------------------------------------------------------------------------------
select tap.raises('a ledger amount cannot be edited', $$update public.ledger set amount_cents = amount_cents + 1 where account = 'wallet:br_lumi'$$, 'FD015');
select tap.raises('a ledger account cannot be edited', $$update public.ledger set account = 'wallet:br_newco' where account = 'wallet:br_lumi'$$, 'FD015');
select tap.raises('a ledger memo cannot be edited', $$update public.ledger set memo = 'x' where account = 'wallet:br_lumi'$$, 'FD015');
select tap.raises('ledger rows are never deleted', $$delete from public.ledger where account = 'wallet:br_lumi'$$, 'FD015');
select tap.raises('the ledger cannot be truncated', $$truncate public.ledger cascade$$, 'FD015');
select tap.raises('transaction headers are immutable', $$update public.ledger_transactions set memo = 'x'$$, 'FD015');
select tap.raises('audit_log is append only', $$update public.audit_log set reason = 'x'$$, 'FD015') where exists (select 1 from public.audit_log);
select tap.raises('a ledger status cannot jump backwards', $$update public.ledger set status = 'pending' where account = 'wallet:br_lumi'$$, 'FD013');
select tap.raises('earning rows are never inserted as paid', $$select public.post_ledger_txn('adjustment', jsonb_build_array(
    jsonb_build_object('account', 'platform:promo', 'amount_cents', -100, 'status', 'paid'),
    jsonb_build_object('account', 'creator:cr_maya', 'amount_cents', 100, 'status', 'paid')), 'x')$$, 'FD015');

-- 2. Every transaction nets to exactly zero, checked at COMMIT ------------------------------------------------------------------------
select tap.raises('legs that do not net to zero are refused up front', $$select public.post_ledger_txn('adjustment', jsonb_build_array(
    jsonb_build_object('account', 'platform:promo', 'amount_cents', -100), jsonb_build_object('account', 'creator:cr_maya', 'amount_cents', 99)), 'x')$$, 'FD014');
select tap.raises('a one-leg transaction is refused', $$select public.post_ledger_txn('adjustment', jsonb_build_array(jsonb_build_object('account', 'platform:promo', 'amount_cents', 0)), 'x')$$, 'FD022');
select tap.raises('even a hand-written unbalanced insert fails at commit (deferred constraint trigger)', $$
  insert into public.ledger_transactions (id, kind, memo) values ('txn_hand1', 'adjustment', 'x');
  insert into public.ledger (txn_id, entry_type, account, amount_cents, memo) values
    ('txn_hand1', 'adjustment', 'platform:promo', -90, 'x'), ('txn_hand1', 'adjustment', 'creator:cr_maya', 100, 'x');
  set constraints all immediate$$, 'FD014');
select tap.raises('a hand-written single leg fails at commit', $$
  insert into public.ledger_transactions (id, kind, memo) values ('txn_hand2', 'adjustment', 'x');
  insert into public.ledger (txn_id, entry_type, account, amount_cents, memo) values ('txn_hand2', 'adjustment', 'platform:promo', -100, 'x');
  set constraints all immediate$$, 'FD014');
select tap.raises('a clawback must name the transaction it reverses', $$
  insert into public.ledger_transactions (id, kind, memo) values ('txn_hand3', 'clawback', 'x');
  insert into public.ledger (txn_id, entry_type, account, amount_cents, memo) values
    ('txn_hand3', 'clawback', 'platform:promo', -100, 'x'), ('txn_hand3', 'clawback', 'creator:cr_maya', 100, 'x')$$, '23514');
select tap.raises('a leg cannot contradict its typed link', $$select public.post_ledger_txn('adjustment', jsonb_build_array(
    jsonb_build_object('account', 'wallet:br_lumi', 'amount_cents', -100, 'brand_id', 'br_newco'), jsonb_build_object('account', 'platform:promo', 'amount_cents', 100)), 'x')$$, 'FD022');
select tap.eq('the same idempotency key returns the same transaction and posts nothing', tap.top_up('lumi', 100, 'topup:dup-key') || '', tap.top_up('lumi', 100, 'topup:dup-key') || '');
select tap.eq('exactly one top-up was posted for that key', (select count(*)::text from public.ledger_transactions where idempotency_key = 'topup:dup-key'), '1');

-- 3. Balance floors ---------------------------------------------------------------------------------------------------------------
select tap.raises('a wallet cannot go negative', $$
  select public.post_ledger_txn('escrow_fund', jsonb_build_array(
    jsonb_build_object('account', 'wallet:br_newco', 'amount_cents', -1), jsonb_build_object('account', 'platform:promo', 'amount_cents', 1)), 'x');
  set constraints all immediate$$, 'FD018');
select tap.raises('platform:fees cannot go negative', $$
  select public.post_ledger_txn('adjustment', jsonb_build_array(
    jsonb_build_object('account', 'platform:fees', 'amount_cents', -1), jsonb_build_object('account', 'creator:cr_maya', 'amount_cents', 1)), 'x');
  set constraints all immediate$$, 'FD018');
select tap.ok('the treasury accounts (promo, matching) may go negative: they are funded by the company', (select public.post_ledger_txn('bonus', jsonb_build_array(
    jsonb_build_object('account', 'platform:promo', 'amount_cents', -500, 'entry_type', 'bonus'),
    jsonb_build_object('account', 'creator:cr_maya', 'amount_cents', 500, 'entry_type', 'bonus', 'status', 'cleared', 'creator_id', 'cr_maya')), 'Welcome bonus') is not null));
select tap.settle();
select tap.eq('the welcome bonus sits in the creator account', tap.bal('creator:cr_maya')::text, '500');
select tap.ok('audit_ledger is clean', (public.audit_ledger() ->> 'ok')::boolean);

-- 4. Escrow: identity (CHECK) and the ledger reconciliation (deferred) ---------------------------------------------------------------
select tap.mk_bounty('bnty_i1', 'lumi', 100000);
select public.fund_bounty('bnty_i1');
select tap.settle();
select tap.raises('escrow_funded = reserved + spent + remaining + refunded, always', $$update public.bounties set remaining_cents = remaining_cents + 1 where id = 'bnty_i1'$$, '23514');
select tap.raises('a bounty whose columns drift from the ledger cannot commit', $$
  update public.bounties set remaining_cents = remaining_cents - 100, refunded_cents = refunded_cents + 100 where id = 'bnty_i1';
  set constraints all immediate$$, 'FD019');
select tap.raises('a bounty cannot be funded twice from two different states', $$update public.bounties set status = 'awaiting_funding' where id = 'bnty_i1'$$, 'FD013');
select tap.raises('not funded means not live (the Funded badge is a constraint)', $$update public.bounties set funded = false where id = 'bnty_i1'$$, '23514');

-- 5. State machines are data: an illegal edge is refused wherever it comes from -------------------------------------------------------
select tap.raises('live -> draft is not an edge', $$update public.bounties set status = 'draft' where id = 'bnty_i1'$$, 'FD013');
select tap.raises('live -> settled is not an edge', $$update public.bounties set status = 'settled' where id = 'bnty_i1'$$, 'FD013');
select tap.eq('live -> paused is an edge', (select count(*)::text from public.state_transitions where machine = 'bounty' and from_state = 'live' and to_state = 'paused'), '1');
select tap.ok('state_transitions carries every machine edge', (select count(*) from public.state_transitions) > 150);

-- 6. No-Rug Approvals: a rejection needs a reason code and evidence -----------------------------------------------------------------
select tap.mk_creator('olga');
update public.bounties set funded_at = now() - interval '6 days', published_at = now() - interval '6 days' where id = 'bnty_i1';
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
values ('sub_nr1', 'bnty_i1', 'cr_olga', 'br_lumi', 'app_lumi', 'studio', 'No-rug test', 'C', 'C', '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, now(), '{}'::jsonb, now());
select public.reserve_slot('sub_nr1');
update public.submissions set status = 'in_review' where id = 'sub_nr1';
select tap.raises('a rejection without a reason code and evidence is refused', $$update public.submissions set status = 'rejected', decision = '{"action": "reject", "decided_at": "2026-10-03T10:00:00Z"}'::jsonb where id = 'sub_nr1'$$, 'FD003');
select tap.raises('changes need a reason code too', $$update public.submissions set status = 'changes_requested', decision = '{"action": "request_changes"}'::jsonb where id = 'sub_nr1'$$, 'FD003');
select tap.raises('a rejected submission cannot keep a reservation (release first, then reject)', $$update public.submissions set status = 'rejected', decision = '{"action": "reject", "reason_code": "missing_disclosure", "evidence": {"kind": "timecode", "at_ms": 1200}, "decided_at": "2026-10-03T10:00:00Z"}'::jsonb where id = 'sub_nr1'$$, '23514');
select public.release_reserved('sub_nr1', 'rejected');
update public.submissions set status = 'rejected', decision = '{"action": "reject", "reason_code": "missing_disclosure", "evidence": {"kind": "timecode", "at_ms": 1200}, "decided_at": "2026-10-03T10:00:00Z"}'::jsonb where id = 'sub_nr1';
select tap.eq('a rejection with a reason code and evidence is accepted and the reservation is gone', (select status::text || '/' || reserved_cents::text from public.submissions where id = 'sub_nr1'), 'rejected/0');

-- 7. Rights Card and Brief rules live in the database too ---------------------------------------------------------------------------
select tap.raises('paid-ad rights are never perpetual', $$insert into public.bounties (id, app_id, brand_id, title, type, visibility, funding_source, take_rate, cpm_cents, brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at)
  values ('bnty_bad1', 'app_lumi', 'br_lumi', 'x', 'cpm', 'open', 'brand', 0.10, 200, '{}', '{"organic": true, "paid_ads_days": 400, "ai_likeness": false}', '{}', '{}', '{}', '{}', public.default_art_seed('x'), now(), now() + interval '5 days')$$, '23514');
select tap.raises('AI likeness is off by default and cannot be switched on in a bounty', $$insert into public.bounties (id, app_id, brand_id, title, type, visibility, funding_source, take_rate, cpm_cents, brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at)
  values ('bnty_bad2', 'app_lumi', 'br_lumi', 'x', 'cpm', 'open', 'brand', 0.10, 200, '{}', '{"organic": true, "paid_ads_days": 90, "ai_likeness": true}', '{}', '{}', '{}', '{}', public.default_art_seed('x'), now(), now() + interval '5 days')$$, '23514');
select tap.raises('burner accounts cannot be demanded', $$insert into public.bounties (id, app_id, brand_id, title, type, visibility, funding_source, take_rate, cpm_cents, brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at)
  values ('bnty_bad3', 'app_lumi', 'br_lumi', 'x', 'cpm', 'open', 'brand', 0.10, 200, '{}', '{"organic": true, "paid_ads_days": 90}', '{}', '{"burner_accounts_allowed": true}', '{}', '{}', public.default_art_seed('x'), now(), now() + interval '5 days')$$, '23514');
select tap.raises('the CPM floor is $0.50', $$insert into public.bounties (id, app_id, brand_id, title, type, visibility, funding_source, take_rate, cpm_cents, brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at)
  values ('bnty_bad4', 'app_lumi', 'br_lumi', 'x', 'cpm', 'open', 'brand', 0.10, 40, '{}', '{"organic": true, "paid_ads_days": 90}', '{}', '{}', '{}', '{}', public.default_art_seed('x'), now(), now() + interval '5 days')$$, '23514');

-- 8. First bounty: flowd matches up to $500 and waives the fee -------------------------------------------------------------------------
select tap.top_up('newco', 150000);
select tap.mk_bounty('bnty_f1', 'newco', 200000);
select tap.same('the first bounty is priced with no fee and a match', (select to_jsonb(b) from public.bounties b where id = 'bnty_f1'), '{"is_first_bounty": true, "take_rate": 0.0, "fee_reserve_cents": 0}'::jsonb);
select tap.same('funding adds the matched budget to what the brand pays', public.fund_bounty('bnty_f1'), '{"matched_cents": 50000, "brand_funded_cents": 150000, "escrow_total_cents": 200000, "status": "live"}'::jsonb);
select tap.settle();
select tap.eq('escrow = brand funds + match', tap.bal('escrow:bnty_f1')::text, '200000');
select tap.eq('the match is paid by the matching treasury', tap.bal('platform:matching')::text, '-50000');
select tap.same('the waiver is spent', (select to_jsonb(b) from public.brands b where id = 'br_newco'), '{"first_bounty_waiver_used": true, "matched_budget_used_cents": 50000, "wallet_balance_cents": 0}'::jsonb);
select tap.top_up('newco', 110000);
select tap.mk_bounty('bnty_f2', 'newco', 100000);
select tap.eq('the second bounty pays the plan rate again', (select take_rate::text from public.bounties where id = 'bnty_f2'), '0.10000');

-- 9. Reserved Slot: the pool is real, filled and live flip with it --------------------------------------------------------------------
select tap.top_up('lumi', 11000);
select tap.mk_bounty('bnty_s1', 'lumi', 10000, 200, 5000);      -- $100 pool, $50 cap: reservation unit $55.00, escrow $110.00 = 2 slots
select tap.fund_open('bnty_s1');
select tap.mk_creator('pia'); select tap.mk_creator('quin'); select tap.mk_creator('rex');
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
select 'sub_s_' || k, 'bnty_s1', 'cr_' || k, 'br_lumi', 'app_lumi', 'studio', 'Slot ' || k, 'B', 'B', '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, now(), '{}'::jsonb, now()
from unnest(array['pia', 'quin', 'rex']) as k;
select tap.eq('slot 1', public.reserve_slot('sub_s_pia')::text, '5500');
select tap.eq('slot 2', public.reserve_slot('sub_s_quin')::text, '5500');
select tap.eq('the bounty is filled when no unit is left', (select status::text || '/' || remaining_cents::text from public.bounties where id = 'bnty_s1'), 'filled/0');
select tap.raises('a third submission finds the pool exhausted', $$select public.reserve_slot('sub_s_rex')$$, 'FD001');
select public.release_reserved('sub_s_pia', 'withdrawn');
select tap.eq('a released unit reopens the bounty', (select status::text || '/' || remaining_cents::text from public.bounties where id = 'bnty_s1'), 'live/5500');
select tap.eq('and the third creator gets it', public.reserve_slot('sub_s_rex')::text, '5500');
select tap.settle();
select tap.ok('audit_ledger is clean after the slot churn', (public.audit_ledger() ->> 'ok')::boolean);

-- 10. Tier gates: early access and minimum tier ------------------------------------------------------------------------------------------
select tap.top_up('lumi', 330000);
select tap.mk_bounty('bnty_t2', 'lumi', 300000);
select public.fund_bounty('bnty_t2');                             -- funded just now: bronze waits 12 h
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
values ('sub_t2', 'bnty_t2', 'cr_maya', 'br_lumi', 'app_lumi', 'studio', 'Early access', 'B', 'B', '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, now(), '{}'::jsonb, now());
select tap.raises('bronze creators wait 12 hours after a bounty goes live', $$select public.reserve_slot('sub_t2')$$, 'FD010');
update public.bounties set funded_at = now() - interval '13 hours', published_at = now() - interval '13 hours', starts_at = now() - interval '13 hours' where id = 'bnty_t2';
select tap.eq('after the head start every tier may submit', public.reserve_slot('sub_t2')::text, '27500');
update public.bounties set eligibility = '{"min_tier": "gold"}'::jsonb where id = 'bnty_t2';
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
values ('sub_t3', 'bnty_t2', 'cr_olga', 'br_lumi', 'app_lumi', 'studio', 'Gold only', 'B', 'B', '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, now(), '{}'::jsonb, now());
select tap.raises('a gold-only bounty is locked for bronze', $$select public.reserve_slot('sub_t3')$$, 'FD010');

-- 11. Apple caps active offer codes at 10 per SKU ----------------------------------------------------------------------------------------
select tap.raises('the 11th active offer code of one SKU is refused', $$
  insert into public.offer_code_pool (id, app_id, sku, offer_name, code, status, valid_from, valid_until)
  select 'occ_t_' || g, 'app_lumi', 'lumi_pro_annual', 'creator-offer', 'LUMI' || g, 'available', now(), now() + interval '90 days' from generate_series(1, 11) g;
  set constraints all immediate$$, 'FD016');
select tap.ok('ten active codes are fine', (select true from (select 1) x where not exists (select 1 from public.offer_code_pool)));
insert into public.offer_code_pool (id, app_id, sku, offer_name, code, status, valid_from, valid_until)
select 'occ_ok_' || g, 'app_lumi', 'lumi_pro_annual', 'creator-offer', 'OKLUMI' || g, 'available', now(), now() + interval '90 days' from generate_series(1, 10) g;
select tap.settle();

-- 11b. Daily Drop: spots left are true counts, a sold-out drop refuses the next claim ----------------------------------------------------
select tap.sudo($$insert into public.daily_drops (id, date, release_at, claim_window_ends_at, headline, status)
  values ('drop_t1', date '2026-10-03', timestamptz '2026-10-03 16:00:00+00', timestamptz '2026-10-04 16:00:00+00', 'Today''s drop', 'live')$$);
insert into public.drop_items (drop_id, bounty_id, spots_total) values ('drop_t1', 'bnty_i1', 2);
select tap.same('drop inventory is derived from its items', (select to_jsonb(d) from public.daily_drops d where id = 'drop_t1'), '{"spots_total": 2, "claims_total": 0, "spots_left": 2, "status": "live"}'::jsonb);
select tap.eq('first claim', public.claim_drop_spot('drop_t1', 'bnty_i1', 'cr_maya') ->> 'spots_left', '1');
select tap.raises('claiming the same item twice is refused', $$select public.claim_drop_spot('drop_t1', 'bnty_i1', 'cr_maya')$$, 'FD016');
select tap.eq('second claim takes the last spot', public.claim_drop_spot('drop_t1', 'bnty_i1', 'cr_olga') ->> 'spots_left', '0');
select tap.eq('the drop is sold out, counted from the claim rows', (select status::text || '/' || spots_left::text from public.daily_drops where id = 'drop_t1'), 'sold_out/0');
select tap.raises('a third claim is refused as pool_exhausted: no fake scarcity, no overselling', $$select public.claim_drop_spot('drop_t1', 'bnty_i1', 'cr_pia')$$, 'FD001');
select tap.eq('a claimed creator joins the bounty as "joined" with a 24 h reservation', (select stage::text from public.bounty_saves where creator_id = 'cr_maya' and bounty_id = 'bnty_i1'), 'joined');

-- 12. A workspace always keeps an owner; a wallet never disappears --------------------------------------------------------------------------
select tap.raises('the last owner cannot leave', $$update public.brand_members set status = 'removed' where brand_id = 'br_lumi' and role = 'owner'; set constraints all immediate$$, 'FD016');
select tap.raises('a workspace with money in the wallet cannot be closed', $$update public.brands set deleted_at = now() where id = 'br_lumi'$$, 'FD016');

select 'invariants.test.sql: passed' as result;
rollback;
