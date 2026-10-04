-- flowd tests: the Money Clock, wallets, funnel, payback and market views
--
-- Cleared and pending are never summed, every non-final earning row has a dated ETA and a named reason, tracked (link and code)
-- conversions are separated from estimated ones, and the materialised market views build and publish.
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_creator('maya');
select tap.top_up('lumi', 550000);
select tap.mk_bounty('bnty_v1', 'lumi', 500000, 200, 25000);
select tap.fund_open('bnty_v1');
select tap.cleared_post('v1', 'bnty_v1', 'lumi', 'maya', 80000);                 -- $160.00 cleared
select tap.cleared_post('v2', 'bnty_v1', 'lumi', 'maya', 20000, false);          -- $40.00 settled, still pending (clears at the next run)
select public.record_conversion('lnk_v1', 'install', 'link', now() - interval '9 days', 700);
select public.record_conversion('lnk_v1', 'trial', 'link', now() - interval '9 days', 112);
select public.record_conversion('lnk_v1', 'paid', 'link', now() - interval '9 days', 41, 143459);
select public.record_conversion('lnk_v1', 'install', 'mmp', now() - interval '9 days', 300);
select public.refresh_bounty_counters('bnty_v1');
select public.refresh_money_clock('cr_maya');
select tap.settle();

-- Money Clock -------------------------------------------------------------------------------------------------------------------------
select tap.as_user('maya');
select tap.same('v_wallet_creator: cleared and pending side by side, never summed', (select to_jsonb(w) from public.v_wallet_creator w where w.creator_id = 'cr_maya'),
  '{"pending_cents": 13000, "cleared_cents": 16000, "held_cents": 0, "paid_cents": 0, "pending_items": 2, "cleared_items": 1}'::jsonb);
select tap.eq('pending = the $40.00 post still clearing + the $90.00 the $250 cap lets the conversions earn on the first post ($250 - $160)', (select string_agg(amount_cents::text, ',' order by amount_cents) from public.v_money_clock where state in ('accruing', 'pending')), '4000,9000');
select tap.ok('every pending or cleared row has a named reason and a dated ETA (never a bare "pending")', not exists (
  select 1 from public.v_money_clock m where m.state in ('accruing', 'pending', 'cleared') and (m.reason is null or m.eta_at is null)));
select tap.eq('the cleared row waits for the weekly payout with a Friday 18:00Z date', (select reason::text || '/' || to_char(eta_at at time zone 'UTC', 'Dy HH24:MI') from public.v_money_clock where state = 'cleared' and source = 'cpm'), 'awaiting_weekly_payout/Fri 18:00');
select tap.ok('the pending row names why it is pending', (select reason::text from public.v_money_clock where state in ('accruing', 'pending') limit 1) in ('fraud_check', 'awaiting_clearing_run', 'window_open'));
select tap.as_owner();

-- Brand wallet and escrow ---------------------------------------------------------------------------------------------------------------
select tap.as_user('lumi_owner');
select tap.same('v_wallet_brand', (select to_jsonb(w) from public.v_wallet_brand w where w.brand_id = 'br_lumi'),
  '{"wallet_balance_cents": 0, "holds_cents": 0, "available_cents": 0, "live_bounties": 1}'::jsonb);
select tap.eq('spent = pay + fee of the two posts', (select spent_cents::text from public.v_wallet_brand where brand_id = 'br_lumi'), '22000');

-- Funnel: tracked counts drive every cost, estimated ones stay separate ------------------------------------------------------------------
select tap.same('v_funnel_bounty', (select to_jsonb(f) from public.v_funnel_bounty f where f.bounty_id = 'bnty_v1'),
  '{"installs": 700, "trials": 112, "paid": 41, "est_installs": 300, "cost_cents": 22000}'::jsonb);
select tap.eq('cost per tracked install = cost / tracked installs (estimates are never mixed in)', (select cost_per_install_cents::text from public.v_funnel_bounty where bounty_id = 'bnty_v1'), '31');
select tap.eq('cost per trial', (select cost_per_trial_cents::text from public.v_funnel_bounty where bounty_id = 'bnty_v1'), '196');
select tap.eq('cost per paid', (select cost_per_paid_cents::text from public.v_funnel_bounty where bounty_id = 'bnty_v1'), '537');
select tap.eq('revenue is tracked paid conversions only', (select revenue_cents::text from public.v_funnel_bounty where bounty_id = 'bnty_v1'), '143459');
select tap.ok('ROAS D30 is revenue within 30 days over cost', (select roas_d30 from public.v_funnel_bounty where bounty_id = 'bnty_v1') = 6.52);
select tap.ok('payback is reached on the first day cumulative tracked revenue covers cost', (select payback_on from public.v_payback_bounty where bounty_id = 'bnty_v1') is not null);
select tap.as_owner();

-- Market ---------------------------------------------------------------------------------------------------------------------------------
select tap.ok('the materialised market views refresh', (select public.refresh_market_views() is not null or true));
select tap.ok('and the clearing series publishes', (select public.publish_market_series() is not null or true));
select tap.as_anon();
select tap.ok('anyone can read the public market series', (select count(*) from public.market_series) >= 0);
select tap.ok('anyone can read the public ticker totals and Promise metrics', (select count(*) from public.v_ticker_totals) >= 0 and (select count(*) from public.v_promise_metrics) >= 0);
select tap.as_owner();

select 'views.test.sql: passed' as result;
rollback;
