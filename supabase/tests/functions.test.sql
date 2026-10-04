-- flowd tests: the remaining business functions (top-up, cancel, holds, tiers, scorecards, projections, erasure)
begin;

select tap.mk_brand('lumi', 'pro', true);
select tap.mk_creator('maya');
select tap.mk_creator('olga');
select tap.top_up('lumi', 700000);
select tap.settle();

-- 1. top_up_bounty: the fee on the addition is funded with it -------------------------------------------------------------------------------
select tap.mk_bounty('bnty_u1', 'lumi', 100000);
select tap.fund_open('bnty_u1');
select tap.same('top-up of $500 adds $500 + 10% fee', public.top_up_bounty('bnty_u1', 50000, 'tu-1'), '{"added_cents": 55000, "remaining_cents": 165000}'::jsonb);
select tap.settle();
select tap.eq('the same idempotency key adds nothing', (public.top_up_bounty('bnty_u1', 50000, 'tu-1') ->> 'idempotent'), 'true');
select tap.settle();
select tap.same('budget and escrow follow', (select to_jsonb(b) from public.bounties b where id = 'bnty_u1'), '{"budget_cents": 150000, "fee_reserve_cents": 15000, "escrow_funded_cents": 165000, "remaining_cents": 165000, "funded": true}'::jsonb);
select tap.eq('only one extra funding transaction exists for the key', (select count(*)::text from public.ledger_transactions where idempotency_key = 'topup:bnty_u1:tu-1'), '1');
select tap.raises('a top-up needs at least a cent', $$select public.top_up_bounty('bnty_u1', 0, 'tu-2')$$, 'FD006');

-- 2. cancel_bounty: only without approved work, and the whole escrow returns ------------------------------------------------------------------
select tap.eq('wallet before cancelling', tap.bal('wallet:br_lumi')::text, (700000 - 110000 - 55000)::text);
select tap.same('cancelling a funded bounty with no work refunds fee reserve and budget', public.cancel_bounty('bnty_u1'), '{"status": "cancelled", "refunded_cents": 165000}'::jsonb);
select tap.settle();
select tap.eq('the wallet has it all back', tap.bal('wallet:br_lumi')::text, '700000');
select tap.eq('escrow is empty', tap.bal('escrow:bnty_u1')::text, '0');
select tap.eq('cancelling twice is idempotent', public.cancel_bounty('bnty_u1') ->> 'idempotent', 'true');
select tap.raises('a bounty cannot be funded after it is cancelled', $$select public.fund_bounty('bnty_u1')$$, 'FD016');

select tap.mk_bounty('bnty_u2', 'lumi', 300000);
select tap.fund_open('bnty_u2');
select tap.cleared_post('u1', 'bnty_u2', 'lumi', 'maya', 80000, false);
select tap.settle();
select tap.raises('a bounty with approved work cannot be cancelled (approved posts are always paid)', $$select public.cancel_bounty('bnty_u2')$$, 'FD016');

-- 3. Holds: a fraud score of 40+ holds the money with a named reason; Ops can release it -------------------------------------------------------
update public.posts set fraud = '{"score": 55, "band": "review", "signals": []}'::jsonb where id = 'post_u1';
select tap.eq('the clearing run holds a post at fraud score 55', public.clear_post('post_u1') ->> 'status', 'held');
select tap.same('with the named reason', (select to_jsonb(p) from public.posts p where id = 'post_u1'), '{"status": "held", "hold_reason": "fraud_review"}'::jsonb);
select tap.eq('the earning row is held, not cleared', (select status::text from public.ledger where post_id = 'post_u1' and account = 'creator:cr_maya'), 'held');
select tap.eq('the Money Clock names the next step', (select reason::text from public.money_clock where post_id = 'post_u1' limit 1), 'held_fraud_review');
select tap.eq('a held post stays held at the next run', public.clear_post('post_u1') ->> 'status', 'held');
select tap.eq('Ops release it (delivered views are still paid)', public.clear_post('post_u1', true) ->> 'status', 'cleared');
select tap.eq('the row clears', (select status::text from public.ledger where post_id = 'post_u1' and account = 'creator:cr_maya'), 'cleared');

-- 4. Tiers: promotion, the 30-day grace after a dip ---------------------------------------------------------------------------------------------
select tap.eq('a new creator is bronze', (select tier::text from public.creators where id = 'cr_olga'), 'bronze');
select tap.sudo($$update public.creators set lifetime_cleared_cents = 30000, approved_count = 6, decided_count = 7, approval_rate = 0.86, reliability_score = 80 where id = 'cr_olga'$$);
select tap.eq('thresholds met: silver', public.refresh_creator_tier('cr_olga')::text, 'silver');
select tap.same('the promotion is in the tier history', (select to_jsonb(h) from public.tier_history h where creator_id = 'cr_olga' order by occurred_at desc limit 1), '{"kind": "promoted", "from_tier": "bronze", "to_tier": "silver"}'::jsonb);
select tap.sudo($$update public.creators set lifetime_cleared_cents = 1000, approved_count = 2, decided_count = 7, approval_rate = 0.29 where id = 'cr_olga'$$);
select tap.eq('a dip does not drop the tier: it is held for 30 days', public.refresh_creator_tier('cr_olga')::text, 'silver');
select tap.same('with a dated hold', (select to_jsonb(c) from public.creators c where id = 'cr_olga'), '{"tier": "silver", "tier_basis": "grace_hold"}'::jsonb);
select tap.ok('the hold runs 30 days', (select tier_hold_until between now() + interval '29 days' and now() + interval '31 days' from public.creators where id = 'cr_olga'));
select tap.sudo($$update public.creators set lifetime_cleared_cents = 30000, approved_count = 6, decided_count = 7, approval_rate = 0.86 where id = 'cr_olga'$$);
select tap.eq('recovering inside the window keeps the tier', public.refresh_creator_tier('cr_olga')::text, 'silver');
select tap.eq('and clears the hold', (select tier_basis::text || '/' || coalesce(tier_hold_until::text, 'none') from public.creators where id = 'cr_olga'), 'earned/none');
select tap.sudo($$update public.creators set lifetime_cleared_cents = 1000, approved_count = 2, approval_rate = 0.29, tier_basis = 'grace_hold', tier_hold_until = now() - interval '1 day' where id = 'cr_olga'$$);
select tap.eq('after an expired hold the tier drops', public.refresh_creator_tier('cr_olga')::text, 'bronze');

-- 5. Reputation and Scorecard projections ------------------------------------------------------------------------------------------------------
select tap.eq('a creator with fewer than 5 finished decisions is provisional (70), shown as "building history"', public.refresh_creator_reputation('cr_maya') ->> 'provisional', 'true');
select tap.eq('the reputation row exists with reasons', (select cardinality(reasons)::text from public.creator_reputation where creator_id = 'cr_maya'), '5');
select tap.eq('a brand with no decisions is "new", never a misleading figure', public.refresh_brand_scorecard('br_lumi') ->> 'band', 'new');
select tap.ok('the scorecard row is public data', (select count(*) from public.brand_scorecards where brand_id = 'br_lumi') = 1);
select tap.eq('per-app daily roll-up writes a row per app', public.refresh_app_metrics_daily((now() at time zone 'UTC')::date)::text, '1');

-- 6. Erasure: personal data goes, money history stays and stays balanced ---------------------------------------------------------------------------
select tap.raises('a creator with unpaid money cannot be erased yet', $$select public.erase_user('usr_maya')$$, 'FD016');
select tap.same('a creator with nothing owed is anonymised', public.erase_user('usr_olga'), '{"erased": true, "creator_id": "cr_olga"}'::jsonb);
select tap.same('the user row keeps no personal data', (select to_jsonb(u) from public.users u where id = 'usr_olga'), '{"display_name": "Deleted user", "status": "deleted"}'::jsonb);
select tap.ok('the email is gone', (select email like 'erased+%@users.invalid' from public.users where id = 'usr_olga'));
select tap.eq('the handle is freed', (select handle from public.creators where id = 'cr_olga'), 'deleted.olga');
select tap.eq('payout methods are closed', (select count(*)::text from public.payout_methods where creator_id = 'cr_olga' and deleted_at is null), '0');
select tap.ok('the ledger is untouched and still balances', (public.audit_ledger() ->> 'ok')::boolean);

-- 6b. Perceptual-hash duplicates (the settlement gate's duplicate_hash signal) ------------------------------------------------------------------
select tap.mk_bounty('bnty_h1', 'lumi', 100000);
select tap.fund_open('bnty_h1');
select tap.mk_creator('quin');
select tap.cleared_post('h1', 'bnty_h1', 'lumi', 'maya', 10000, false);
select tap.cleared_post('h2', 'bnty_h1', 'lumi', 'quin', 10000, false);
update public.posts set posted_at = posted_at + interval '1 hour', window_ends_at = window_ends_at + interval '1 hour' where id = 'post_h2';
insert into public.video_analyses (submission_id, version, language, transcript_text, hook, tags, hook_score, flow_score, phash, analysed_at) values
  ('sub_h1', 1, 'en', 'x', '{}', '{}', '{}', '{}', 'f0f0f0f0f0f0f0f0', now()),
  ('sub_h2', 1, 'en', 'x', '{}', '{}', '{}', '{}', 'f0f0f0f0f0f0f0f3', now());
select tap.same('a later post that matches an earlier one within 6 bits is reported with the distance', (select to_jsonb(d) from public.phash_duplicates('post_h2') d), '{"other_post_id": "post_h1", "distance": 2, "same_creator": false}'::jsonb);
select tap.eq('the earlier post does not match a later one', (select count(*)::text from public.phash_duplicates('post_h1')), '0');
update public.video_analyses set phash = '0f0f0f0f0f0f0f0f' where submission_id = 'sub_h2';
select tap.eq('a distinct video is not a duplicate', (select count(*)::text from public.phash_duplicates('post_h2')), '0');

-- 6c. RevenueCat: a stored event is booked exactly once, even when the booking is retried ---------------------------------------------------------
insert into public.revenuecat_events (id, app_id, event_type, period_type, app_user_id, product_id, currency, environment, purchased_at, received_at, match_status, idempotency_key, price_cents)
values ('rce_t1', 'app_lumi', 'initial_purchase', 'trial', '$RCAnonymousID:abc', 'lumi_pro_annual', 'USD', 'production', now() - interval '9 days', now(), 'unmatched', 'evt-1', 0);
select tap.ok('the first booking records a link conversion', public.book_rc_conversion('rce_t1', 'lnk_h1', 'trial', 'link', now() - interval '9 days', 0, 'US') is not null);
select tap.eq('a retry returns the same conversion and books nothing more', public.book_rc_conversion('rce_t1', 'lnk_h1', 'trial', 'link', now() - interval '9 days', 0, 'US'), (select matched_conversion_id from public.revenuecat_events where id = 'rce_t1'));
select tap.eq('exactly one trial was counted', (select quantity::text from public.conversions where post_id = 'post_h1' and kind = 'trial' and source = 'link'), '1');
select tap.same('the event row carries the match', (select to_jsonb(e) from public.revenuecat_events e where id = 'rce_t1'), '{"match_status": "matched", "matched_link_id": "lnk_h1", "matched_creator_id": "cr_maya"}'::jsonb);

-- 7. Small functions -------------------------------------------------------------------------------------------------------------------------------
select tap.ok('ids are <prefix>_<16 hex>', public.new_id('bnty') ~ '^bnty_[0-9a-f]{16}$');
select tap.ok('invoice numbers read FD-<year>-<n>', public.next_invoice_number('2026-10-03T14:00:00Z') ~ '^FD-2026-[0-9]{4}$');
select tap.ok('scam case ids read SR-<year>-<n>', public.next_scam_case_id('2026-10-03T14:00:00Z') ~ '^SR-2026-[0-9]{4}$');
select tap.eq('perceptual-hash distance counts differing bits', public.phash_distance('ffffffffffffffff', 'fffffffffffffff0')::text, '4');
select tap.eq('duplicate threshold: distance 6 or less', (public.phash_distance('0000000000000000', '000000000000003f') <= private.ki('fraud.duplicate_phash_max_distance'))::text, 'true');
select tap.eq('take rates: Free 12, Pro 10, Scale 8, CPA-only 6, first bounty 0', (select string_agg(public.take_rate(p, 'cpm')::text, ',' order by p) from unnest(array['free', 'pro', 'scale']::public.plan[]) p) || '/' ||
  public.take_rate('pro', 'cpa')::text || '/' || public.take_rate('pro', 'cpm', true)::text, '0.12,0.1,0.08/0.06/0');

select 'functions.test.sql: passed' as result;
rollback;
