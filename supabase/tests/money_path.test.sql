-- flowd tests: the money path, end to end (Pro plan, 10% take rate)
--
--   top-up -> fund (Funded badge) -> Reserved Slot -> post + 72 h window -> settle (pending) -> conversions (CPA, link only)
--   -> clearing run (cleared) -> weekly payout (paid) -> settlement refund, with the ledger audit after every step.
--
-- The numbers are the stacked worked example of DOMAIN section 11: 48,200 views at $2.00 CPM + 14 installs / 6 trials / 2 paid at
-- $0.40 / $1.50 / $4.00 = $119.00 of pay, $11.90 of fee, $130.90 of brand cost, under the $250.00 per-video cap.
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_creator('maya');

-- 1. Wallet top-up -> the brand wallet projection ---------------------------------------------------------------------------------
select tap.top_up('lumi', 110000);
select tap.settle();
select tap.eq('wallet ledger balance', tap.bal('wallet:br_lumi')::text, '110000');
select tap.eq('brands.wallet_balance_cents is the projection of the ledger', (select wallet_balance_cents::text from public.brands where id = 'br_lumi'), '110000');
select tap.eq('processing fee is passed through at cost', tap.bal('platform:processing')::text, '3220');
select tap.eq('the outside world holds the card charge', tap.bal('external:card')::text, '-113220');

-- 2. Bounty pricing is owned by the database --------------------------------------------------------------------------------------
select tap.mk_bounty('bnty_t1', 'lumi');
select tap.eq('take rate is recomputed from the plan (a client cannot underprice its fee)', (select take_rate::text from public.bounties where id = 'bnty_t1'), '0.10000');
select tap.eq('fee reserve = 10% of the $1,000 pool', (select fee_reserve_cents::text from public.bounties where id = 'bnty_t1'), '10000');
select tap.eq('all-in CPM includes fee and processing', (select all_in_cpm_cents::text from public.bounties where id = 'bnty_t1'), '226');
select tap.eq('not live and not funded before funding', (select status::text || '/' || funded::text from public.bounties where id = 'bnty_t1'), 'awaiting_funding/false');

-- 3. Fund: wallet -> escrow, Funded badge, goes live -------------------------------------------------------------------------------
select tap.same('fund_bounty result', public.fund_bounty('bnty_t1'), '{"funded": true, "status": "live", "escrow_total_cents": 110000, "brand_funded_cents": 110000, "matched_cents": 0}'::jsonb);
select tap.settle();
select tap.same('bounty after funding', (select to_jsonb(b) from public.bounties b where id = 'bnty_t1'),
  '{"status": "live", "funded": true, "escrow_funded_cents": 110000, "remaining_cents": 110000, "reserved_cents": 0, "spent_cents": 0, "refunded_cents": 0}'::jsonb);
select tap.eq('escrow ledger = reserved + remaining', tap.bal('escrow:bnty_t1')::text, '110000');
select tap.eq('wallet is empty after funding', tap.bal('wallet:br_lumi')::text, '0');
select tap.eq('funding again is idempotent', (public.fund_bounty('bnty_t1') ->> 'idempotent'), 'true');
select tap.eq('exactly one escrow_fund transaction', (select count(*)::text from public.ledger_transactions where kind = 'escrow_fund'), '1');
select tap.ok('audit_ledger is clean after funding', (public.audit_ledger() ->> 'ok')::boolean);

-- the bounty has been live for 6 days: every tier may submit (early access is 0 to 12 h)
update public.bounties set funded_at = now() - interval '6 days', published_at = now() - interval '6 days' where id = 'bnty_t1';

-- 4. Reserved Slot: submit takes up to the cap (+ fee) out of the pool ------------------------------------------------------------
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
values ('sub_t1', 'bnty_t1', 'cr_maya', 'br_lumi', 'app_lumi', 'studio', 'Glow-up reveal', 'B', 'A', '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, now() - interval '10 days', '{}'::jsonb, now() - interval '10 days');
select tap.eq('reserve_slot reserves one unit: $250 cap + $25 fee', public.reserve_slot('sub_t1')::text, '27500');
select tap.eq('reserving again is idempotent', public.reserve_slot('sub_t1')::text, '27500');
select tap.settle();
select tap.same('bounty after the reservation', (select to_jsonb(b) from public.bounties b where id = 'bnty_t1'),
  '{"status": "live", "reserved_cents": 27500, "remaining_cents": 82500, "escrow_funded_cents": 110000}'::jsonb);
select tap.eq('spots left = floor(remaining / unit)', public.spots_left(82500, 25000, 0.10)::text, '3');

-- the brand approves (qa_pending -> in_review -> approved) and the creator posts
update public.submissions set status = 'in_review' where id = 'sub_t1';
update public.submissions set status = 'approved', approved_at = now() - interval '10 days', decision = '{"action": "approve", "decided_at": "2026-09-24T10:00:00Z"}'::jsonb where id = 'sub_t1';
insert into public.attribution_links (id, creator_id, bounty_id, app_id, code, short_url, deep_link, status)
values ('lnk_t1', 'cr_maya', 'bnty_t1', 'app_lumi', 'maya-t1', 'joinflowd.io/r/maya-t1', 'lumi://r/maya-t1', 'active');
insert into public.posts (id, submission_id, creator_id, brand_id, app_id, bounty_id, social_account_id, platform, platform_post_id, url, caption, thumb, posted_at, window_ends_at,
                          tracking_link_id, flow_band, tags)
values ('post_t1', 'sub_t1', 'cr_maya', 'br_lumi', 'app_lumi', 'bnty_t1', 'sa_maya', 'tiktok', '7000000000000000001', 'https://www.tiktok.com/@maya.t/video/7000000000000000001',
        'Glow-up #ad Paid partnership with Lumi', public.default_art_seed('p1'), now() - interval '10 days', now() - interval '10 days' + interval '72 hours', 'lnk_t1', 'B', '{}'::jsonb);
update public.attribution_links set post_id = 'post_t1' where id = 'lnk_t1';
update public.submissions set status = 'posted', post_id = 'post_t1', link_id = 'lnk_t1', posted_at = now() - interval '10 days' where id = 'sub_t1';
select tap.settle();

-- 5. Verified views arrive hourly; the View Ledger snapshot at window end is what pays ----------------------------------------------
select public.ingest_post_sample('post_t1', now() - interval '10 days' + interval '30 hours', 30000, 30000);
select public.ingest_post_sample('post_t1', now() - interval '10 days' + interval '71 hours', 48200, 48200, 2100, 90, 310, 400, p_snapshot => true);
select tap.eq('views never go backwards (a lower sample is ignored)', (public.ingest_post_sample('post_t1', now() - interval '10 days' + interval '71 hours 30 minutes', 40000, 40000) ->> 'delta_views'), '0');
select tap.eq('window views follow the verified views while the window is open', (select window_views::text from public.posts where id = 'post_t1'), '48200');
select tap.raises('a snapshot may not lower verified views', $$insert into public.view_snapshots (post_id, taken_at, views_reported, views_verified, source) values ('post_t1', now() - interval '10 days' + interval '71 hours 40 minutes', 40000, 40000, 'platform_api')$$, 'FD020');
select tap.raises('a live post cannot settle', $$select public.settle_post('post_t1')$$, 'FD016');

select tap.eq('close_window freezes the window views', public.close_window('post_t1') ->> 'window_views', '48200');
select tap.eq('post is window_closed', (select status::text from public.posts where id = 'post_t1'), 'window_closed');

-- 6. Settlement: CPM leg, pending, fee on its own leg ------------------------------------------------------------------------------
select tap.same('settle_post', public.settle_post('post_t1'), '{"leg": "cpm", "pay_cents": 9640, "fee_cents": 964, "capped": false}'::jsonb);
select tap.settle();
select tap.eq('escrow paid pay + fee: 9,640 + 964', tap.bal('escrow:bnty_t1')::text, '99396');
select tap.eq('creator row is PENDING, never cleared at settlement', (select status::text from public.ledger where post_id = 'post_t1' and account = 'creator:cr_maya'), 'pending');
select tap.eq('platform fee leg', tap.bal('platform:fees')::text, '964');
select tap.same('bounty money columns after settlement', (select to_jsonb(b) from public.bounties b where id = 'bnty_t1'),
  '{"spent_cents": 10604, "reserved_cents": 16896, "remaining_cents": 82500}'::jsonb);
select tap.eq('settling twice posts nothing more', (public.settle_post('post_t1') ->> 'idempotent'), 'true');
select tap.eq('still exactly one cpm transaction for the post', (select count(*)::text from public.ledger_transactions where idempotency_key = 'settle:cpm:post_t1'), '1');
select tap.ok('audit_ledger is clean after settlement', (public.audit_ledger() ->> 'ok')::boolean);

-- 7. Conversions: tracked link events pay, estimated ones never do -----------------------------------------------------------------
select public.record_conversion('lnk_t1', 'install', 'link', now() - interval '9 days', 14);
select public.record_conversion('lnk_t1', 'trial', 'link', now() - interval '9 days', 6);
select public.record_conversion('lnk_t1', 'paid', 'link', now() - interval '9 days', 2, 6998);
select public.record_conversion('lnk_t1', 'install', 'mmp', now() - interval '9 days', 30);
select tap.eq('the MMP batch is estimated, not payable', (select payable::text from public.conversions where source = 'mmp'), 'false');
select tap.eq('link batches are payable and deterministic', (select string_agg(distinct payable::text || '/' || confidence::text, ',') from public.conversions where source = 'link'), 'true/deterministic');

select tap.same('install batch settles at 14 x $0.40 + fee', (select public.settle_conversion(id) from public.conversions where kind = 'install' and source = 'link'), '{"pay_cents": 560, "fee_cents": 56}'::jsonb);
select tap.same('trial batch settles at 6 x $1.50 + fee', (select public.settle_conversion(id) from public.conversions where kind = 'trial' and source = 'link'), '{"pay_cents": 900, "fee_cents": 90}'::jsonb);
select tap.same('paid batch settles at 2 x $4.00 + fee', (select public.settle_conversion(id) from public.conversions where kind = 'paid' and source = 'link'), '{"pay_cents": 800, "fee_cents": 80}'::jsonb);
select tap.eq('estimated conversions are cleared as "reported", paying nothing', (select public.settle_conversion(id) ->> 'paid' from public.conversions where source = 'mmp'), 'false');
select tap.settle();
select tap.eq('creator CPA rows are cleared (their clearing window already passed)', (select string_agg(distinct status::text, ',') from public.ledger where post_id = 'post_t1' and account = 'creator:cr_maya' and entry_type = 'cpa'), 'cleared');
select tap.eq('brand cost of the post = pay 11,900 + fee 1,190', (select (-sum(amount_cents))::text from public.ledger where post_id = 'post_t1' and account = 'escrow:bnty_t1'), '13090');
select tap.ok('audit_ledger is clean after the CPA legs', (public.audit_ledger() ->> 'ok')::boolean);

-- 8. The 14:00 UTC clearing run: pending -> cleared, counts toward lifetime cleared, attaches to the weekly payout ------------------
select tap.same('clear_post', public.clear_post('post_t1'), '{"status": "cleared"}'::jsonb);
select tap.settle();
select tap.eq('post cleared', (select status::text from public.posts where id = 'post_t1'), 'cleared');
select tap.eq('no earning row is left pending', (select count(*)::text from public.ledger where creator_id = 'cr_maya' and account_kind = 'creator' and status = 'pending'), '0');
select tap.eq('lifetime cleared = $119.00', (select lifetime_cleared_cents::text from public.creators where id = 'cr_maya'), '11900');
select tap.eq('the weekly payout was scheduled for the next Friday 18:00Z', (select to_char(scheduled_for at time zone 'UTC', 'Dy HH24:MI') || '/' || status::text || '/' || gross_cents::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), 'Fri 18:00/scheduled/11900');
select tap.eq('weekly payouts are free', (select fee_cents::text from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), '0');

-- 9. The Friday run: start (gates pass), Stripe confirms, rows become paid --------------------------------------------------------
select tap.eq('start_payout moves to processing', (select public.start_payout(id) ->> 'status' from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), 'processing');
select tap.eq('complete_payout pays net 11,900', (select public.complete_payout(id, 'tr_test_1', 'po_test_1') ->> 'net_cents' from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), '11900');
select tap.settle();
select tap.eq('creator account is empty after the payout', tap.bal('creator:cr_maya')::text, '0');
select tap.eq('the bank received the net amount', tap.bal('external:bank')::text, '11900');
select tap.eq('every earning row is paid', (select string_agg(distinct status::text, ',') from public.ledger where creator_id = 'cr_maya' and entry_type in ('cpm', 'cpa')), 'paid');
select tap.eq('post is paid', (select status::text from public.posts where id = 'post_t1'), 'paid');
select tap.eq('completing again is idempotent', (select public.complete_payout(id) ->> 'idempotent' from public.payouts where creator_id = 'cr_maya' and kind = 'weekly'), 'true');
select tap.eq('a ticker event was published without the handle', (select count(*)::text from public.ticker_events where creator_id = 'cr_maya' and handle is null and text like 'A Bronze creator was paid $119.00'), '1');
select tap.ok('audit_ledger is clean after the payout', (public.audit_ledger() ->> 'ok')::boolean);

-- 10. Settlement: the rest of the escrow goes back to the wallet ------------------------------------------------------------------
select tap.raises('a live bounty cannot settle', $$select public.settle_bounty('bnty_t1')$$, 'FD016');
update public.bounties set status = 'ended', ended_at = now() where id = 'bnty_t1';
update public.posts set posted_at = posted_at - interval '40 days', window_ends_at = window_ends_at - interval '40 days' where id = 'post_t1';
select public.finalize_cpa_windows();
select tap.same('settle_bounty refunds unspent budget and unused fee reserve', public.settle_bounty('bnty_t1'), '{"status": "settled", "refunded_cents": 96910}'::jsonb);
select tap.settle();
select tap.eq('escrow is empty', tap.bal('escrow:bnty_t1')::text, '0');
select tap.eq('wallet got the refund: 110,000 funded - 13,090 spent = 96,910 (16,896 reserved released + 80,014 never reserved)', tap.bal('wallet:br_lumi')::text, '96910');
select tap.eq('escrow identity: funded = spent + refunded', (select (escrow_funded_cents = spent_cents + refunded_cents)::text from public.bounties where id = 'bnty_t1'), 'true');
select tap.eq('platform fee = 10% of pay', tap.bal('platform:fees')::text, '1190');
select tap.ok('audit_ledger is clean at the end', (public.audit_ledger() ->> 'ok')::boolean);

select 'money_path.test.sql: passed' as result;
rollback;
