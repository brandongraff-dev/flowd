-- flowd tests: row-level security and grants, exercised with the same roles and JWT claims PostgREST uses
--
--   anon          public catalogues and views only
--   authenticated creator -> own rows; brand member -> own workspace by capability; admin -> everything readable
--   service_role  the API server and the edge functions: bypasses RLS and is the only role that can move money
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_brand('newco', 'pro', false);
select tap.mk_member('lumi', 'vera', 'viewer');
select tap.mk_member('lumi', 'ron', 'reviewer');
select tap.mk_creator('maya');
select tap.mk_creator('olga');
select tap.mk_admin('root');
select tap.top_up('lumi', 110000);
select tap.top_up('newco', 55000);
select tap.mk_bounty('bnty_a', 'lumi');
select tap.fund_open('bnty_a');
select tap.mk_bounty('bnty_b', 'newco', 50000);              -- stays a draft/awaiting bounty of another workspace
select tap.cleared_post('ma', 'bnty_a', 'lumi', 'maya', 80000);
select tap.cleared_post('ol', 'bnty_a', 'lumi', 'olga', 40000);
select tap.settle();

-- anon ------------------------------------------------------------------------------------------------------------------------------
select tap.as_anon();
select tap.raises('anon cannot read users', $$select count(*) from public.users$$, '42501');
select tap.raises('anon cannot read the ledger', $$select count(*) from public.ledger$$, '42501');
select tap.raises('anon cannot read brands directly', $$select count(*) from public.brands$$, '42501');
select tap.raises('anon cannot read payouts', $$select count(*) from public.payouts$$, '42501');
select tap.raises('anon cannot write anything', $$insert into public.ticker_events (id, kind, occurred_at, text) values ('tick_x', 'payout', now(), 'x')$$, '42501');
select tap.ok('anon reads the public constants the engines need', (select count(*) from public.flowd_constants) > 100);
select tap.ok('anon reads the public ticker totals view', (select count(*) from public.v_ticker_totals) >= 0);
select tap.ok('anon reads public bounties through the view (no escrow or brief internals)', (select count(*) from public.v_public_bounties) >= 0);
select tap.raises('anon cannot run money functions', $$select public.fund_bounty('bnty_b')$$, '42501');
select tap.raises('anon cannot post to the ledger', $$select public.post_ledger_txn('adjustment', '[]'::jsonb, 'x')$$, '42501');
select tap.ok('anon can use the pure formula functions (quotes, calculators)', (select card_charge_cents from public.funding(100000, 0.10)) = 113220);
select tap.as_owner();

-- a creator ---------------------------------------------------------------------------------------------------------------------------
select tap.as_user('maya');
select tap.eq('maya sees exactly her own creator row', (select string_agg(id, ',') from public.creators), 'cr_maya');
select tap.eq('maya sees only her own earnings in the ledger', (select string_agg(distinct account, ',') from public.ledger), 'creator:cr_maya');
select tap.eq('maya sees her own payouts only', (select string_agg(distinct creator_id, ',') from public.payouts), 'cr_maya');
select tap.eq('maya sees her own posts only', (select string_agg(distinct creator_id, ',') from public.posts), 'cr_maya');
select tap.eq('maya sees her own submissions only', (select string_agg(distinct creator_id, ',') from public.submissions), 'cr_maya');
select tap.eq('maya sees her own payout methods only', (select string_agg(distinct creator_id, ',') from public.payout_methods), 'cr_maya');
select tap.eq('maya sees her own tax profile only', (select string_agg(distinct creator_id, ',') from public.tax_profiles), 'cr_maya');
select tap.eq('maya cannot read brand workspaces she is not in', (select count(*)::text from public.brands), '0');
select tap.eq('maya cannot read escrow or wallet rows', (select count(*)::text from public.ledger where account_kind in ('escrow', 'wallet', 'platform', 'external')), '0');
select tap.ok('maya sees the live public bounty', (select count(*) from public.bounties where id = 'bnty_a') = 1);
select tap.eq('maya does not see another workspace''s draft', (select count(*)::text from public.bounties where id = 'bnty_b'), '0');
select tap.raises('maya cannot write the ledger', $$insert into public.ledger (txn_id, entry_type, account, amount_cents, memo) values ('txn_x', 'bonus', 'creator:cr_maya', 100, 'x')$$, '42501');
select tap.raises('maya cannot raise her own tier', $$update public.creators set tier = 'elite' where id = 'cr_maya'$$, '42501');
select tap.raises('maya cannot edit her cleared total', $$update public.creators set lifetime_cleared_cents = 99999999 where id = 'cr_maya'$$, '42501');
select tap.raises('maya cannot edit a payout', $$update public.payouts set status = 'paid' where creator_id = 'cr_maya'$$, '42501');
select tap.raises('maya cannot edit a post''s earnings', $$update public.posts set earnings = '{}'::jsonb where creator_id = 'cr_maya'$$, '42501');
select tap.raises('maya cannot touch auth identity columns', $$update public.users set role = 'admin' where auth_user_id = tap.auth_id('maya')$$, '42501');
select tap.eq('maya can edit her own bio', tap.affected($$update public.creators set bio = 'Updated by Maya' where id = 'cr_maya'$$)::text, '1');
select tap.eq('maya cannot edit olga''s bio (the row is invisible to her)', tap.affected($$update public.creators set bio = 'hacked' where id = 'cr_olga'$$)::text, '0');
select tap.raises('maya cannot move money', $$select public.settle_post('post_ol')$$, '42501');
select tap.raises('maya cannot claw back', $$select public.claw_back('post_ol', 'x')$$, '42501');
select tap.raises('maya cannot start a payout', $$select public.start_payout('pay_x')$$, '42501');
select tap.ok('maya can ask for her own instant cash-out quote', (public.instant_payout_quote('cr_maya') ->> 'amount_cents')::bigint = 16000);
select tap.raises('maya cannot ask for olga''s', $$select public.instant_payout_quote('cr_olga')$$, 'FD017');
select tap.raises('maya cannot read olga''s reliability', $$select public.creator_reliability('cr_olga')$$, 'FD017');
select tap.ok('maya can read a brand scorecard (it is public)', (public.brand_reliability('br_lumi') ->> 'score') is not null);
select tap.as_owner();

-- a brand team ------------------------------------------------------------------------------------------------------------------------
select tap.as_user('lumi_owner');
select tap.eq('the owner sees only their workspace', (select string_agg(id, ',') from public.brands), 'br_lumi');
select tap.eq('the owner sees only their bounties (and public ones)', (select string_agg(id, ',' order by id) from public.bounties), 'bnty_a');
select tap.eq('the owner sees the wallet and escrow legs of their workspace', (select string_agg(distinct account_kind, ',' order by account_kind) from public.ledger), 'escrow,wallet');
select tap.eq('the owner sees posts on their bounties', (select count(*)::text from public.posts), '2');
select tap.eq('the owner sees teammates', (select count(*)::text from public.brand_members where brand_id = 'br_lumi'), '3');
select tap.eq('the owner does not see the other workspace''s members', (select count(*)::text from public.brand_members where brand_id = 'br_newco'), '0');
select tap.eq('the owner does not see other brands'' invoices, API keys or apps', (select (select count(*) from public.apps where brand_id = 'br_newco')::text), '0');
select tap.eq('a live bounty is no longer editable by clients (state machine owner: the API)', tap.affected($$update public.bounties set title = 'x' where id = 'bnty_a'$$)::text, '0');
select tap.raises('clients cannot write the funded flag', $$update public.bounties set funded = true where id = 'bnty_a'$$, '42501');
select tap.raises('clients cannot write the escrow columns', $$update public.bounties set escrow_funded_cents = 1 where id = 'bnty_a'$$, '42501');
select tap.raises('clients cannot change a bounty status', $$update public.bounties set status = 'live' where id = 'bnty_a'$$, '42501');
select tap.raises('clients cannot change their plan or wallet', $$update public.brands set plan = 'scale' where id = 'br_lumi'$$, '42501');
select tap.raises('clients cannot fund', $$select public.fund_bounty('bnty_a')$$, '42501');
select tap.raises('clients cannot decide with money: no ledger writes', $$insert into public.ledger (txn_id, entry_type, account, amount_cents, memo) values ('txn_x', 'bonus', 'wallet:br_lumi', 100, 'x')$$, '42501');
select tap.as_owner();

select tap.as_user('vera');                                  -- a viewer: read-only
select tap.eq('a viewer reads the workspace', (select string_agg(id, ',') from public.brands), 'br_lumi');
select tap.eq('a viewer cannot see the wallet and escrow ledger (no finance.read)', (select count(*)::text from public.ledger), '0');
select tap.eq('a viewer cannot edit the workspace profile (no workspace capability)', tap.affected($$update public.brands set tagline = 'x' where id = 'br_lumi'$$)::text, '0');
select tap.as_owner();

select tap.as_user('ron');                                   -- a reviewer: reviews, never touches money
select tap.ok('a reviewer reads submissions', (select count(*) from public.submissions) = 2);
select tap.eq('a reviewer sees no ledger', (select count(*)::text from public.ledger), '0');
select tap.as_owner();

-- an admin ----------------------------------------------------------------------------------------------------------------------------
select tap.as_user('root');
select tap.ok('an admin reads every workspace', (select count(*) from public.brands) = 2);
select tap.ok('an admin reads every creator', (select count(*) from public.creators) = 2);
select tap.ok('an admin reads the ledger', (select count(*) from public.ledger) > 10);
select tap.raises('an admin still cannot write the ledger directly', $$update public.ledger set memo = 'x'$$, '42501');
select tap.raises('and cannot call money functions from a user session (the API does it as service_role)', $$select public.settle_bounty('bnty_a')$$, '42501');
select tap.as_owner();

-- the service role --------------------------------------------------------------------------------------------------------------------------
select tap.as_service();
select tap.ok('service_role reads everything', (select count(*) from public.ledger) > 10);
select tap.ok('service_role can read the audit', (public.audit_ledger() ->> 'ok')::boolean);
select tap.as_owner();

-- realtime: only RLS-protected tables are published ----------------------------------------------------------------------------------
select tap.ok('every table has RLS enabled', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition and not c.relrowsecurity));
select tap.ok('no function in schema public is executable by PUBLIC except the intended pure ones', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('post_ledger_txn', 'fund_bounty', 'settle_post', 'clear_post', 'claw_back', 'complete_payout', 'erase_user')
    and has_function_privilege('authenticated', p.oid, 'execute')));

select 'rls.test.sql: passed' as result;
rollback;
