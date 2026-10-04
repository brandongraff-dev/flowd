-- flowd tests: the local seed world (supabase/seed.sql). Run only with the seed loaded:  node supabase/tools/verify-pglite.mjs --seed
-- The seed is built through the money functions, so these assertions double as a check of the golden walk-through of DOMAIN section 10.
begin;

-- the ledger is whole
select tap.ok('audit_ledger is clean after the seed', (public.audit_ledger() ->> 'ok')::boolean);
select tap.eq('every wallet and escrow account reconciles', (public.audit_ledger() -> 'escrow_mismatches')::text || (public.audit_ledger() -> 'balance_mismatches')::text, '[][]');

-- Lumi: $3,300.00 in, escrowed, live, funded
select tap.eq('the card paid $3,396.00 for a $3,300.00 credit ($96.00 processing at cost)', tap.bal('external:card')::text || '/' || tap.bal('platform:processing')::text, '-339600/9600');
select tap.same('Glow-up reveal is funded and live', (select to_jsonb(b) from public.bounties b where id = 'bnty_lumi_glowup'),
  '{"status": "live", "funded": true, "escrow_funded_cents": 330000, "take_rate": 0.1, "fee_reserve_cents": 30000}'::jsonb);
select tap.eq('the escrow identity holds: funded = reserved + spent + remaining + refunded', (select (escrow_funded_cents = reserved_cents + spent_cents + remaining_cents + refunded_cents)::text from public.bounties where id = 'bnty_lumi_glowup'), 'true');
select tap.eq('escrow on the ledger = reserved + remaining', tap.bal('escrow:bnty_lumi_glowup')::text, (select (reserved_cents + remaining_cents)::text from public.bounties where id = 'bnty_lumi_glowup'));
select tap.eq('the wallet is empty: every cent is escrowed', tap.bal('wallet:br_lumi')::text, '0');

-- Maya's golden post: 31,400 views x $2.10 = $65.94, CPA from the link and a code, $76.54 paid, MMP installs reported but never paid
select tap.eq('CPM pay for 31,400 verified views at $2.10 CPM', (select amount_cents::text from public.money_clock where post_id = 'post_maya_glowup' and source = 'cpm'), '6594');
select tap.eq('tracked CPA: 7 installs by link, 2 by code, 2 trials by link, 1 paid by code', (select string_agg(amount_cents::text, ',' order by amount_cents) from public.money_clock where post_id = 'post_maya_glowup' and source <> 'cpm'), '80,280,300,400');
select tap.eq('Maya was paid $76.54 in last Friday''s weekly run, free', (select gross_cents::text || '/' || fee_cents::text || '/' || status::text || '/' || to_char(scheduled_for at time zone 'UTC', 'Dy HH24:MI') from public.payouts where creator_id = 'cr_maya'), '7654/0/paid/Fri 18:00');
select tap.eq('the 14 estimated MMP installs are reported and never paid', (select payable::text || '/' || status::text from public.conversions where source = 'mmp'), 'false/cleared');
select tap.eq('the brand paid pay + 10% fee per leg: $84.19 for the post', (select (-sum(amount_cents))::text from public.ledger where post_id = 'post_maya_glowup' and account = 'escrow:bnty_lumi_glowup'), '8419');
select tap.same('Maya''s numbers match the persona facts: Silver, $1,640.00 cleared, 21 of 27 approved, 78%, reliability 93', (select to_jsonb(c) from public.creators c where id = 'cr_maya'),
  '{"tier": "silver", "lifetime_cleared_cents": 164000, "approved_count": 21, "decided_count": 27, "approval_rate": 0.78, "reliability_score": 93, "streak_weeks": 6}'::jsonb);

-- the Money Clock tells the truth at any moment
select tap.eq('a post inside its window is ACCRUING with a named reason', (select state::text || '/' || reason::text from public.money_clock where post_id = 'post_maya_third'), 'accruing/window_open');
select tap.eq('a closed window is PENDING with a named reason and a dated ETA', (select state::text || '/' || (reason in ('fraud_check', 'awaiting_clearing_run'))::text || '/' || (eta_at is not null)::text from public.money_clock where post_id = 'post_maya_second'), 'pending/true/true');
select tap.eq('Kai''s cleared money waits for the next Friday payout', (select state::text || '/' || reason::text from public.money_clock where post_id = 'post_kai_glowup'), 'cleared/awaiting_weekly_payout');
select tap.eq('Kai''s payout is scheduled for a future Friday 18:00Z, never paid early', (select status::text || '/' || to_char(scheduled_for at time zone 'UTC', 'Dy HH24:MI') from public.payouts where creator_id = 'cr_kai'), 'scheduled/Fri 18:00');
select tap.eq('Noor''s video is in review with a Reserved Slot (up to the cap plus the fee)', (select status::text || '/' || reserved_cents::text from public.submissions where id = 'sub_noor_glowup'), 'in_review/27500');

-- who can see what, through the real roles
select tap.as_user_by_auth('a1000000-0000-4000-8000-000000000001');            -- Maya
select tap.eq('Maya sees only her own earnings', (select string_agg(distinct account, ',') from public.ledger), 'creator:cr_maya');
select tap.same('Maya''s wallet: cleared and paid are separate numbers', (select to_jsonb(w) from public.v_wallet_creator w), '{"creator_id": "cr_maya", "paid_cents": 7654, "cleared_cents": 0}'::jsonb);
select tap.as_owner();
select tap.as_user_by_auth('a1000000-0000-4000-8000-000000000002');            -- Jordan
select tap.eq('Jordan sees the Lumi workspace only', (select string_agg(id, ',') from public.brands), 'br_lumi');
select tap.eq('Jordan sees the funnel of his bounty', (select count(*)::text from public.v_funnel_bounty), '1');
select tap.as_owner();
select tap.as_user_by_auth('a1000000-0000-4000-8000-000000000003');            -- Sam (Ops)
select tap.ok('Ops can read everything', (select count(*) from public.ledger) > 20 and (select count(*) from public.creators) = 3);
select tap.as_owner();

select 'seed/world.test.sql: passed' as result;
rollback;
