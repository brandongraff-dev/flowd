-- flowd tests: helpers shared by every *.test.sql file.
--
-- Apply once per database before the test files (the PGlite runner does this automatically):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_helpers.sql
-- It creates one schema, "tap", with a handful of assertion functions and test-world builders. Nothing here is a migration: do not
-- ship the tap schema to production (drop schema tap cascade; removes it).
--
-- Conventions of the test files
--   * Each file is one transaction that ends in ROLLBACK, so tests are safe on a dev database and independent of each other.
--   * Failures raise an exception that names the assertion ("FAIL <label>: got ... want ..."); psql -v ON_ERROR_STOP=1 exits non-zero.
--   * Deferred constraint triggers (ledger balance, escrow reconciliation, balance floors) only run at COMMIT, which a rolled back test
--     never reaches. Tests therefore call tap.settle() after every money step: it runs SET CONSTRAINTS ALL IMMEDIATE and back.
--   * World builders insert with flowd.seed_mode = 'on' (skips state-machine edges and claim guards) and switch it off again, so the
--     steps under test run with every rule enforced.

create schema if not exists tap;
grant usage on schema tap to public;

create or replace function tap.ok(p_label text, p_cond boolean)
returns void language plpgsql as $f$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_label using errcode = 'P0001';
  end if;
end
$f$;

create or replace function tap.eq(p_label text, p_got text, p_want text)
returns void language plpgsql as $f$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL %: got % want %', p_label, p_got, p_want using errcode = 'P0001';
  end if;
end
$f$;

-- b is a structural subset of a: every key and array element of b is present in a with an equal (numerically equal) value, and arrays
-- have the same length. SQL may return extra keys; the expectation may not ask for more than SQL gives.
create or replace function tap.subset(a jsonb, b jsonb)
returns boolean language plpgsql immutable as $f$
declare
  k text;
  i integer;
begin
  if jsonb_typeof(b) = 'object' then
    if jsonb_typeof(a) <> 'object' then return false; end if;
    for k in select jsonb_object_keys(b) loop
      if not (a ? k) or not tap.subset(a -> k, b -> k) then return false; end if;
    end loop;
    return true;
  elsif jsonb_typeof(b) = 'array' then
    if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> jsonb_array_length(b) then return false; end if;
    for i in 0 .. jsonb_array_length(b) - 1 loop
      if not tap.subset(a -> i, b -> i) then return false; end if;
    end loop;
    return true;
  end if;
  return a = b;
end
$f$;

create or replace function tap.same(p_label text, p_got jsonb, p_want jsonb)
returns void language plpgsql as $f$
begin
  if not tap.subset(p_got, p_want) then
    raise exception 'FAIL %: got % want %', p_label, p_got, p_want using errcode = 'P0001';
  end if;
end
$f$;

-- Runs a statement and expects it to fail with the given SQLSTATE (the FDnnn business codes of 0001, or a Postgres class such as 42501).
create or replace function tap.raises(p_label text, p_sql text, p_sqlstate text)
returns void language plpgsql as $f$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> p_sqlstate then
      raise exception 'FAIL %: raised % (%), wanted %', p_label, v_state, sqlerrm, p_sqlstate using errcode = 'P0001';
    end if;
    return;
  end;
  raise exception 'FAIL %: nothing was raised, wanted %', p_label, p_sqlstate using errcode = 'P0001';
end
$f$;

-- Runs one INSERT / UPDATE / DELETE as the current role and returns the number of rows it touched (RLS hides rows, so "0" is an answer).
create or replace function tap.affected(p_sql text)
returns integer language plpgsql as $f$
declare
  v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end
$f$;

-- Fire every deferred constraint trigger now (ledger balance, balance floors, escrow reconciliation, owner check) and re-defer.
create or replace function tap.settle()
returns void language plpgsql as $f$
begin
  set constraints all immediate;
  set constraints all deferred;
end
$f$;

-- Balance of a ledger account straight from the ledger (not the cache).
create or replace function tap.bal(p_account text)
returns bigint language sql stable as $f$
  select coalesce(sum(amount_cents), 0)::bigint from public.ledger where account = p_account;
$f$;

-- ---------------------------------------------------------------------------
-- Acting as a user: the same JWT claims PostgREST sets, and the same database roles (RLS and grants apply)
-- ---------------------------------------------------------------------------
-- Stable auth uuid of a test person: tap.auth_id('maya') for a creator built by mk_creator('maya'), tap.auth_id('lumi_owner') for the
-- owner built by mk_brand('lumi').
create or replace function tap.auth_id(p_key text)
returns uuid language sql immutable as $f$
  select md5('flowd-test-user:' || p_key)::uuid;
$f$;

create or replace function tap.as_user(p_key text)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tap.auth_id(p_key), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$f$;

-- Act as a user by their auth uuid (the seed's personas have fixed uuids).
create or replace function tap.as_user_by_auth(p_auth_id uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$f$;

create or replace function tap.as_anon()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end
$f$;

create or replace function tap.as_service()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end
$f$;

-- Back to the connection owner (the migration role): what psql, migrations and pg_cron run as.
create or replace function tap.as_owner()
returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end
$f$;

-- ---------------------------------------------------------------------------
-- World builders (seed mode on while they insert)
-- ---------------------------------------------------------------------------
-- A workspace with an owner and one app. p_first_used = true means the first-bounty waiver is spent, so the plan take rate applies.
create or replace function tap.mk_brand(p_key text, p_plan public.plan default 'pro', p_first_used boolean default true)
returns void language plpgsql as $f$
begin
  perform set_config('flowd.seed_mode', 'on', true);
  -- signing up creates the public.users row (trigger private.handle_new_auth_user); the test then gives it a readable id
  insert into auth.users (id, email, raw_app_meta_data) values (tap.auth_id(p_key || '_owner'), p_key || '.owner@example.test', '{"role": "brand_member"}'::jsonb);
  update public.users set id = 'usr_' || p_key || '_owner', display_name = initcap(p_key) || ' owner' where auth_user_id = tap.auth_id(p_key || '_owner');
  insert into public.brands (id, kind, name, slug, tagline, logo, website, country, billing, compliance_defaults, plan, first_bounty_waiver_used)
  values ('br_' || p_key, 'brand', initcap(p_key), p_key, 'Test workspace', public.default_art_seed(p_key), 'https://' || p_key || '.example', 'US', '{}'::jsonb, '{}'::jsonb, p_plan, p_first_used);
  insert into public.brand_members (brand_id, user_id, role, status, joined_at)
  values ('br_' || p_key, 'usr_' || p_key || '_owner', 'owner', 'active', now());
  insert into public.apps (id, brand_id, name, tagline, category, icon, brand_colors, app_store_id, bundle_id, store_url, pricing, rating, status, connected_at, mmp, sdk_status)
  values ('app_' || p_key, 'br_' || p_key, initcap(p_key), 'Test app', 'ai_photo', public.default_art_seed(p_key || 'a'), '{}'::jsonb, '6740000001', 'io.' || p_key || '.app',
          'https://apps.apple.com/app/id6740000001', '{}'::jsonb, 4.7, 'connected', now(), 'none', 'verified');
  perform set_config('flowd.seed_mode', 'off', true);
end
$f$;

-- A verified creator with a linked TikTok account, an instant-capable bank payout method and a submitted W-9, ready to be paid.
create or replace function tap.mk_creator(p_key text, p_tier public.tier default 'bronze')
returns void language plpgsql as $f$
begin
  perform set_config('flowd.seed_mode', 'on', true);
  insert into auth.users (id, email, raw_app_meta_data) values (tap.auth_id(p_key), p_key || '@example.test', '{"role": "creator"}'::jsonb);
  update public.users set id = 'usr_' || p_key, display_name = initcap(p_key) where auth_user_id = tap.auth_id(p_key);
  insert into public.creators (id, user_id, handle, display_name, bio, avatar, country, referral_code, storefront, niches, tier, verification_status, payout_ready)
  values ('cr_' || p_key, 'usr_' || p_key, p_key || '.t', initcap(p_key), 'Test creator', public.default_art_seed(p_key), 'US', upper(p_key), jsonb_build_object('slug', p_key || '.t'), array['ai_tools']::public.niche[],
          p_tier, 'verified', true);
  insert into public.social_accounts (id, creator_id, platform, handle, engagement_rate, us_audience_ratio, status, account_created_at, connected_at, last_synced_at, health)
  values ('sa_' || p_key, 'cr_' || p_key, 'tiktok', p_key || '.t', 0.05, 0.7, 'connected', now() - interval '2 years', now(), now(), '{"score": 90}'::jsonb);
  insert into public.payout_methods (id, creator_id, kind, label, last4, status, instant_capable, verified_at, is_default)
  values ('pm_' || p_key, 'cr_' || p_key, 'bank', 'Bank account', '4242', 'active', true, now(), true);
  insert into public.tax_profiles (creator_id, tax_year, country, threshold_progress, set_aside_rate, status)
  values ('cr_' || p_key, private.ki('tax.tax_year')::integer, 'US', 0, 0.25, 'submitted');
  perform set_config('flowd.seed_mode', 'off', true);
end
$f$;

-- Another person on a workspace with the given role (owner, admin, reviewer, finance, viewer, client_approver).
create or replace function tap.mk_member(p_brand_key text, p_key text, p_role public.brand_member_role)
returns void language plpgsql as $f$
begin
  perform set_config('flowd.seed_mode', 'on', true);
  insert into auth.users (id, email, raw_app_meta_data) values (tap.auth_id(p_key), p_key || '@example.test', '{"role": "brand_member"}'::jsonb);
  update public.users set id = 'usr_' || p_key, display_name = initcap(p_key) where auth_user_id = tap.auth_id(p_key);
  insert into public.brand_members (brand_id, user_id, role, status, joined_at) values ('br_' || p_brand_key, 'usr_' || p_key, p_role, 'active', now());
  perform set_config('flowd.seed_mode', 'off', true);
end
$f$;

-- A flowd operator. Admin is never self-assigned at sign-up (private.handle_new_auth_user), Ops promote a user: so does this helper.
create or replace function tap.mk_admin(p_key text)
returns void language plpgsql as $f$
begin
  insert into auth.users (id, email, raw_app_meta_data) values (tap.auth_id(p_key), p_key || '@example.test', '{"role": "admin"}'::jsonb);
  update public.users set id = 'usr_' || p_key, display_name = initcap(p_key), role = 'admin' where auth_user_id = tap.auth_id(p_key);
end
$f$;

-- Put p_cents into a brand wallet the way the Stripe webhook does: card -(amount + processing), wallet +amount, processing +fee.
create or replace function tap.top_up(p_brand_key text, p_cents bigint, p_key text default null)
returns text language plpgsql as $f$
declare
  v_proc bigint := public.card_processing(p_cents);
begin
  return public.post_ledger_txn('wallet_topup', jsonb_build_array(
      jsonb_build_object('account', 'external:card', 'amount_cents', -(p_cents + v_proc), 'entry_type', 'wallet_topup', 'brand_id', 'br_' || p_brand_key),
      jsonb_build_object('account', 'wallet:br_' || p_brand_key, 'amount_cents', p_cents, 'entry_type', 'wallet_topup'),
      jsonb_build_object('account', 'platform:processing', 'amount_cents', v_proc, 'entry_type', 'processing', 'brand_id', 'br_' || p_brand_key)),
    'Wallet top-up', coalesce(p_key, 'topup:' || p_brand_key || ':' || txid_current()::text));
end
$f$;

-- A stacked bounty in awaiting_funding (published), started 6 days ago and open to every tier (funded_at is back-dated by fund helper).
create or replace function tap.mk_bounty(p_id text, p_brand_key text, p_budget bigint default 100000, p_cpm bigint default 200, p_cap bigint default 25000,
                                         p_type public.bounty_type default 'stacked')
returns void language plpgsql as $f$
begin
  insert into public.bounties (id, app_id, brand_id, title, type, visibility, funding_source, take_rate, cpm_cents, cpa_install_cents, cpa_trial_cents, cpa_paid_cents,
                               per_video_cap_cents, budget_cents, brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at)
  values (p_id, 'app_' || p_brand_key, 'br_' || p_brand_key, 'Glow-up reveal ' || p_id, p_type, 'open', 'brand', 0.10, p_cpm,
          case when p_type in ('stacked', 'cpa', 'install_only') then 40 else 0 end, case when p_type in ('stacked', 'cpa') then 150 else 0 end,
          case when p_type in ('stacked', 'cpa') then 400 else 0 end, p_cap, p_budget,
          '{"tldr": "Show the glow-up", "cta": "Try Lumi free", "disclosure_text": "#ad Paid partnership with Lumi"}'::jsonb,
          '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb,
          '{"videos_per_creator": 1, "min_duration_s": 15, "max_duration_s": 30, "platforms": ["tiktok"], "regions": ["US"]}'::jsonb,
          '{}'::jsonb, '{"passed": true, "findings": []}'::jsonb, '{"median_cents": 4389}'::jsonb, public.default_art_seed(p_id),
          now() - interval '6 days', now() + interval '24 days');
  update public.bounties set status = 'awaiting_funding' where id = p_id;
end
$f$;

-- Fund a bounty and back-date its go-live so every tier may submit (early access is 0 to 12 hours).
create or replace function tap.fund_open(p_bounty text)
returns jsonb language plpgsql as $f$
declare
  v_res jsonb;
begin
  v_res := public.fund_bounty(p_bounty);
  update public.bounties set funded_at = now() - interval '6 days', published_at = now() - interval '6 days' where id = p_bounty;
  return v_res;
end
$f$;

-- One approved, posted and settled video: submission -> Reserved Slot -> approval -> post (10 days ago) -> verified views ->
-- window closed -> settle_post (CPM leg, pending) -> clear_post (cleared). Returns the clear_post result.
-- p_post_key names the rows: sub_<key>, lnk_<key>, post_<key>. Requires a live, funded bounty and a creator built by tap.mk_creator.
create or replace function tap.cleared_post(p_key text, p_bounty text, p_brand_key text, p_creator_key text, p_views bigint, p_clear boolean default true)
returns jsonb language plpgsql as $f$
declare
  v_posted timestamptz := now() - interval '10 days';
begin
  insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, hook_band, rights_card, rights_accepted_at, fraud_evidence, submitted_at)
  values ('sub_' || p_key, p_bounty, 'cr_' || p_creator_key, 'br_' || p_brand_key, 'app_' || p_brand_key, 'studio', 'Video ' || p_key, 'B', 'A',
          '{"organic": true, "paid_ads_days": 90, "ai_likeness": false}'::jsonb, v_posted - interval '1 day', '{}'::jsonb, v_posted - interval '1 day');
  perform public.reserve_slot('sub_' || p_key);
  update public.submissions set status = 'in_review' where id = 'sub_' || p_key;
  update public.submissions set status = 'approved', approved_at = v_posted - interval '12 hours',
         decision = jsonb_build_object('action', 'approve', 'decided_at', v_posted - interval '12 hours') where id = 'sub_' || p_key;
  insert into public.attribution_links (id, creator_id, bounty_id, app_id, code, short_url, deep_link, status)
  values ('lnk_' || p_key, 'cr_' || p_creator_key, p_bounty, 'app_' || p_brand_key, 'x-' || p_key, 'joinflowd.io/r/x-' || p_key, 'app://r/x-' || p_key, 'active');
  insert into public.posts (id, submission_id, creator_id, brand_id, app_id, bounty_id, social_account_id, platform, platform_post_id, url, caption, thumb, posted_at, window_ends_at,
                            tracking_link_id, flow_band, tags)
  values ('post_' || p_key, 'sub_' || p_key, 'cr_' || p_creator_key, 'br_' || p_brand_key, 'app_' || p_brand_key, p_bounty, 'sa_' || p_creator_key, 'tiktok', '700' || lpad(abs(hashtext(p_key))::text, 16, '0'),
          'https://www.tiktok.com/@' || p_creator_key || '.t/video/' || p_key, 'Video #ad', public.default_art_seed(p_key), v_posted, v_posted + interval '72 hours', 'lnk_' || p_key, 'B', '{}'::jsonb);
  update public.attribution_links set post_id = 'post_' || p_key where id = 'lnk_' || p_key;
  update public.submissions set status = 'posted', post_id = 'post_' || p_key, link_id = 'lnk_' || p_key, posted_at = v_posted where id = 'sub_' || p_key;
  perform public.ingest_post_sample('post_' || p_key, v_posted + interval '71 hours', p_views, p_views, null, null, null, null, p_snapshot => true);
  perform public.close_window('post_' || p_key);
  perform public.settle_post('post_' || p_key);
  if p_clear then
    return public.clear_post('post_' || p_key);
  end if;
  return jsonb_build_object('post_id', 'post_' || p_key, 'status', 'window_closed');
end
$f$;

-- Run a statement with the soft rules off (state-machine edges, claim guards): used to put a row into a state a test needs without
-- walking the whole workflow. The money rules (ledger balance, escrow identity, floors) are never switched off.
create or replace function tap.sudo(p_sql text)
returns void language plpgsql as $f$
begin
  perform set_config('flowd.seed_mode', 'on', true);
  execute p_sql;
  perform set_config('flowd.seed_mode', 'off', true);
end
$f$;

-- Assertions must be callable while acting as anon / authenticated / service_role (0002 revokes EXECUTE from PUBLIC by default).
grant execute on all functions in schema tap to public;
alter default privileges in schema tap grant execute on functions to public;
