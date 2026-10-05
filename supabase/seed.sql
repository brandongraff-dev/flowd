-- flowd seed: a small, alive local world built THROUGH the money functions, so it is also a worked example of the money path.
-- Loaded by `supabase db reset` (config.toml, [db.seed]) and by `node supabase/tools/verify-pglite.mjs --seed`. Safe to run once on an empty database.
-- For the full demo world (80 fixture files, 97 tables, 4,275 ledger legs) generate supabase/seed.full.sql: node supabase/tools/gen-seed.mjs (supabase/README.md, section 6).
--
-- Who is in it (all fictional; the personas of packages/contract/schema/world.mjs)
--   Maya Reyes  @maya.makes  creator, Silver, $1,640.00 lifetime cleared, 21 of 27 decided videos approved         usr_maya / cr_maya
--   Jordan Ellis             owner of the Lumi workspace (Pro plan)                                                    usr_jordan / br_lumi
--   Sam Okafor               flowd Ops (admin)                                                                          usr_ops
--   Kai Brandt, Noor Haddad  two more creators so the review queue and the market are not empty
-- What has happened (relative to now(), so Money Clock states are live whenever you load it)
--   Lumi topped up $3,300.00 and funded "Glow-up reveal" ($3,000.00 pool + $300.00 fee reserve, $2.10 CPM + $0.40 / $1.50 / $4.00, $250.00 cap): live.
--   Maya's post from 11 days ago settled and cleared: 31,400 verified views = $65.94 CPM pay + $11.60 of tracked CPA, paid in last Friday's run.
--   Maya's post from 3 days ago closed its window and is PENDING (clears at the next 14:00 UTC run); her post from 2 days ago is still ACCRUING.
--   Kai has a cleared post waiting for the next payout; Noor's video is in review with a Reserved Slot.
-- Local sign-in (Supabase Auth, local development only): jordan@example.test, maya@example.test, sam@joinflowd.io with the password "flowd-demo-local".

begin;
select set_config('flowd.seed_mode', 'on', true);

-- 1. identities: auth.users first (a trigger creates the public.users row), then give each row its readable persona id ------------------------------------------------
do $auth$
declare
  r record;
  v_full boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password');
begin
  for r in
    select * from (values
      ('a1000000-0000-4000-8000-000000000001'::uuid, 'maya@example.test', 'creator', 'usr_maya', 'Maya Reyes'),
      ('a1000000-0000-4000-8000-000000000002'::uuid, 'jordan@example.test', 'brand_member', 'usr_jordan', 'Jordan Ellis'),
      ('a1000000-0000-4000-8000-000000000003'::uuid, 'sam@joinflowd.io', 'admin', 'usr_ops', 'Sam Okafor'),
      ('a1000000-0000-4000-8000-000000000004'::uuid, 'kai@example.test', 'creator', 'usr_kai', 'Kai Brandt'),
      ('a1000000-0000-4000-8000-000000000005'::uuid, 'noor@example.test', 'creator', 'usr_noor', 'Noor Haddad')
    ) as t(id, email, role, user_id, name)
  loop
    if v_full then
      -- a real Supabase Auth schema: GoTrue needs empty strings (not NULL) in the token columns, and an identity row to sign in with a password
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email, extensions.crypt('flowd-demo-local', extensions.gen_salt('bf')), now(),
              jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', case when r.role = 'admin' then 'creator' else r.role end),
              jsonb_build_object('full_name', r.name), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), r.id, jsonb_build_object('sub', r.id::text, 'email', r.email), 'email', r.id::text, now(), now(), now());
    else
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (r.id, r.email, jsonb_build_object('role', case when r.role = 'admin' then 'creator' else r.role end), jsonb_build_object('full_name', r.name));
    end if;
    update public.users set id = r.user_id, display_name = r.name, role = r.role::public.role where auth_user_id = r.id;
  end loop;
  -- admin is never self-assigned at sign-up: Ops promote the user (private.handle_new_auth_user)
  update public.users set title = 'Trust & Ops lead' where id = 'usr_ops';
end
$auth$;

-- 2. the Lumi workspace ------------------------------------------------------------------------------------------------------------------------------------------------
insert into public.brands (id, kind, name, slug, tagline, logo, website, country, billing, compliance_defaults, plan, first_bounty_waiver_used, verification, review_sla_hours)
values ('br_lumi', 'brand', 'Lumi', 'lumi', 'Pro-grade photo edits in one tap', public.default_art_seed('lumi', 'Lu'), 'https://lumi.example', 'US',
        '{"legal_name": "Lumi Labs, Inc.", "billing_email": "billing@lumi.example", "po_required": false}'::jsonb,
        '{"disclosure_text": "#ad Paid partnership with Lumi", "banned_claims": ["perfect results"], "competitor_names": [], "music_policy": "commercial_library", "ai_policy": "allowed_disclosed"}'::jsonb,
        'pro', true, 'verified', 72);
insert into public.brand_members (id, brand_id, user_id, role, status, joined_at) values ('bm_lumi_jordan', 'br_lumi', 'usr_jordan', 'owner', 'active', now() - interval '60 days');
insert into public.apps (id, brand_id, name, tagline, category, icon, brand_colors, app_store_id, bundle_id, store_url, pricing, rating, rating_count, status, connected_at, mmp, sdk_status, features, default_hashtags)
values ('app_lumi', 'br_lumi', 'Lumi', 'Pro-grade photo edits in one tap', 'ai_photo', public.default_art_seed('lumi-icon', 'Lu'), '{"primary": "#6D5EF5", "secondary": "#22D3EE", "accent": "#F59E0B"}'::jsonb,
        '6740000001', 'io.lumi.app', 'https://apps.apple.com/app/id6740000001', '{"monthly_cents": 1199, "annual_cents": 5999, "trial_days": 7}'::jsonb, 4.7, 18400, 'connected', now() - interval '60 days',
        'none', 'verified', array['Batch edit 50 photos', 'One-tap relight', 'Remove strangers'], array['#lumiapp', '#photoediting', '#ad']);

-- 3. creators, each with a linked account, a verified bank payout method and a W-9 on file ---------------------------------------------------------------------
insert into public.creators (id, user_id, handle, display_name, bio, avatar, niches, country, languages, tier, tier_basis, tier_since, carry_over, referral_code, storefront, verification_status, payout_ready, streak_weeks, joined_at, onboarding_stage, open_to_offers)
values
  ('cr_maya', 'usr_maya', 'maya.makes', 'Maya Reyes', 'Lifestyle and AI-tools creator. Honest demos, one take.', public.default_art_seed('maya', 'MR'), array['lifestyle', 'ai_tools']::public.niche[], 'US', array['en'], 'silver', 'earned', now() - interval '80 days',
   '{"source": "founding verified history", "cleared_cents": 156346, "approved_count": 18, "decided_count": 24, "verified_by_user_id": "usr_ops", "verified_at": "2026-07-05T00:00:00Z"}'::jsonb,
   'MAYA-LUMI', '{"slug": "maya.makes", "headline": "Honest app demos", "featured_post_ids": [], "show_stats": true, "cta_label": "Work with me", "theme": "aurora"}'::jsonb, 'verified', true, 6, now() - interval '90 days', 'first_dollar', true),
  ('cr_kai', 'usr_kai', 'kai.frames', 'Kai Brandt', 'Photo and travel. I film what I edit.', public.default_art_seed('kai', 'KB'), array['lifestyle', 'travel']::public.niche[], 'US', array['en'], 'bronze', 'earned', now() - interval '40 days',
   '{"source": "none", "cleared_cents": 0, "approved_count": 0, "decided_count": 0, "verified_by_user_id": "usr_ops", "verified_at": "2026-07-05T00:00:00Z"}'::jsonb,
   'KAI-FRAMES', '{"slug": "kai.frames", "headline": "Edits you can see", "featured_post_ids": [], "show_stats": false, "cta_label": "Work with me", "theme": "aurora"}'::jsonb, 'verified', true, 2, now() - interval '45 days', 'first_dollar', true),
  ('cr_noor', 'usr_noor', 'noor.notes', 'Noor Haddad', 'Study and productivity. Short, calm, useful.', public.default_art_seed('noor', 'NH'), array['study', 'productivity']::public.niche[], 'CA', array['en', 'ar'], 'bronze', 'earned', now() - interval '20 days',
   '{"source": "none", "cleared_cents": 0, "approved_count": 0, "decided_count": 0, "verified_by_user_id": "usr_ops", "verified_at": "2026-07-05T00:00:00Z"}'::jsonb,
   'NOOR-NOTES', '{"slug": "noor.notes", "headline": "Calm study tips", "featured_post_ids": [], "show_stats": false, "cta_label": "Work with me", "theme": "aurora"}'::jsonb, 'verified', true, 0, now() - interval '25 days', 'accounts_linked', true);
insert into public.social_accounts (id, creator_id, platform, handle, followers, avg_views_28d, median_views_28d, engagement_rate, us_audience_ratio, status, verified_by_platform, is_primary, account_created_at, connected_at, last_synced_at, health, platform_user_id)
values
  ('sa_maya_tt', 'cr_maya', 'tiktok', 'maya.makes', 38200, 21800, 14200, 0.062, 0.71, 'connected', true, true, now() - interval '3 years', now() - interval '90 days', now() - interval '1 hour', '{"score": 92, "status": "good", "strikes": 0, "unoriginal_flags": 0, "notes": []}'::jsonb, 'tt_maya'),
  ('sa_kai_tt', 'cr_kai', 'tiktok', 'kai.frames', 9100, 6400, 4800, 0.055, 0.64, 'connected', false, true, now() - interval '2 years', now() - interval '45 days', now() - interval '1 hour', '{"score": 88, "status": "good", "strikes": 0, "unoriginal_flags": 0, "notes": []}'::jsonb, 'tt_kai'),
  ('sa_noor_tt', 'cr_noor', 'tiktok', 'noor.notes', 4200, 3100, 2300, 0.071, 0.31, 'connected', false, true, now() - interval '14 months', now() - interval '25 days', now() - interval '1 hour', '{"score": 90, "status": "good", "strikes": 0, "unoriginal_flags": 0, "notes": []}'::jsonb, 'tt_noor');
insert into public.payout_methods (id, creator_id, kind, label, last4, status, instant_capable, verified_at, is_default, stripe_external_account_id)
values ('pm_maya', 'cr_maya', 'bank', 'Bank account', '4821', 'active', true, now() - interval '80 days', true, 'ba_mock_maya'),
       ('pm_kai', 'cr_kai', 'bank', 'Bank account', '1177', 'active', true, now() - interval '40 days', true, 'ba_mock_kai'),
       ('pm_noor', 'cr_noor', 'bank', 'Bank account', '9054', 'active', false, now() - interval '20 days', true, 'ba_mock_noor');
insert into public.tax_profiles (creator_id, tax_year, country, status, form, legal_name, entity_type, tin_last4, threshold_progress, set_aside_rate, submitted_at)
select c.id, private.ki('tax.tax_year')::integer, 'US', 'submitted', 'w9', c.display_name, 'individual', '1234', 0, 0.25, now() - interval '30 days' from public.creators c where c.id in ('cr_maya', 'cr_kai');

-- 4. money in: the brand tops up by card ($3,300.00 wallet credit + $96.00 processing at cost), funds the bounty, it goes live ------------------------------------
select public.post_ledger_txn('wallet_topup', jsonb_build_array(
    jsonb_build_object('account', 'external:card', 'amount_cents', -339600, 'entry_type', 'wallet_topup', 'brand_id', 'br_lumi', 'memo', 'Wallet top-up by card'),
    jsonb_build_object('account', 'wallet:br_lumi', 'amount_cents', 330000, 'entry_type', 'wallet_topup', 'memo', 'Wallet top-up by card'),
    jsonb_build_object('account', 'platform:processing', 'amount_cents', 9600, 'entry_type', 'processing', 'brand_id', 'br_lumi', 'memo', 'Card processing passed through at cost')),
  'Wallet top-up by card', 'seed:topup:br_lumi');
insert into public.bounties (id, app_id, brand_id, title, type, status, visibility, funding_source, take_rate, cpm_cents, cpa_install_cents, cpa_trial_cents, cpa_paid_cents, per_video_cap_cents, budget_cents, fee_reserve_cents,
                             brief, rights_card, deliverables, eligibility, brief_lint, pay_math, art, starts_at, ends_at, format_ids)
values ('bnty_lumi_glowup', 'app_lumi', 'br_lumi', 'Glow-up reveal', 'stacked', 'draft', 'open', 'brand', 0.10, 210, 40, 150, 400, 25000, 300000, 30000,
        '{"summary": "Show Lumi doing one real thing: editing your own photo. A before, then the edit, in one take, under 30 seconds.", "talking_points": ["Show the app within the first 3 seconds.", "Use a photo you took yourself."], "dos": ["Film vertically in good light."], "donts": ["Do not make income or guaranteed-result claims."], "beats": [{"beat": "hook", "label": "Hook", "required": true}, {"beat": "app_reveal", "label": "Show the app by 0:03", "required": true}, {"beat": "cta", "label": "One call to action", "required": true}], "cta": "The link is in my bio, tap it.", "offer_line": "It is free to try for 7 days.", "hashtags": ["#lumiapp", "#ad"], "mentions": ["@lumi"], "tone": "Fast and curious", "disclosure_text": "#ad Paid partnership with Lumi", "banned_claims": ["perfect results"]}'::jsonb,
        '{"organic": true, "paid_ads_days": 90, "ad_platforms": ["tiktok", "meta"], "whitelisting": true, "renewal_pct_per_30d": 0.25, "exclusivity_days": 0, "ai_likeness": false, "territory": "Worldwide", "summary": "Organic posting is always included. Lumi may run your approved video as a paid ad for 90 days with your permission. Renewals are 25% of your base fee per 30 days. No AI likeness."}'::jsonb,
        '{"videos_per_creator": 1, "min_duration_s": 15, "max_duration_s": 30, "aspect": "9:16", "platforms": ["tiktok"], "regions": ["US", "CA", "GB"], "require_face": true, "music_policy": "commercial_library", "ai_policy": "allowed_disclosed"}'::jsonb,
        '{"countries": ["US", "CA", "GB"], "niches": ["lifestyle", "ai_tools"], "burner_accounts_allowed": false}'::jsonb,
        jsonb_build_object('passed', true, 'checked_at', now(), 'issues', '[]'::jsonb),
        '{"expected_views_p25": 5680, "expected_views_median": 14200, "expected_views_p75": 36210, "p25_cents": 1756, "median_cents": 4389, "p75_cents": 11191, "creator_cpm_cents": 210, "all_in_cpm_cents": 238, "basis": "Median views 14,200; estimate"}'::jsonb,
        public.default_art_seed('glowup', 'Glow'), now() - interval '12 days', now() + interval '18 days', array['tmpl_results_update']::public.format_id[]);
select set_config('flowd.seed_mode', 'off', true);
update public.bounties set status = 'awaiting_funding' where id = 'bnty_lumi_glowup';
select public.fund_bounty('bnty_lumi_glowup', 'usr_jordan');
select set_config('flowd.seed_mode', 'on', true);
update public.bounties set funded_at = now() - interval '12 days', published_at = now() - interval '12 days' where id = 'bnty_lumi_glowup';

-- 5. creative work, settled through the real functions (a temp helper so the same steps are not repeated five times) -------------------------------------------------
create function pg_temp.seed_post(p_key text, p_creator text, p_posted_ago interval, p_views bigint, p_close boolean, p_settle boolean)
returns void language plpgsql as $f$
declare
  v_posted timestamptz := now() - p_posted_ago;
  v_handle text := (select handle from public.creators where id = p_creator);
begin
  perform set_config('flowd.seed_mode', 'on', true);
  insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, flow_points, hook_band, hook_points, rights_card, rights_accepted_at, fraud_evidence, submitted_at, format_id)
  values ('sub_' || p_key, 'bnty_lumi_glowup', p_creator, 'br_lumi', 'app_lumi', 'studio', 'Glow-up reveal', 'B', 78, 'A', 90,
          (select rights_card from public.bounties where id = 'bnty_lumi_glowup'), v_posted - interval '1 day', '{}'::jsonb, v_posted - interval '1 day', 'tmpl_results_update');
  perform public.reserve_slot('sub_' || p_key);
  update public.submissions set status = 'in_review' where id = 'sub_' || p_key;
  update public.submissions set status = 'approved', approved_at = v_posted - interval '12 hours',
         decision = jsonb_build_object('action', 'approve', 'decided_at', v_posted - interval '12 hours', 'sla_met', true, 'appeal_used', false) where id = 'sub_' || p_key;
  insert into public.attribution_links (id, creator_id, bounty_id, app_id, code, short_url, deep_link, status)
  values ('lnk_' || p_key, p_creator, 'bnty_lumi_glowup', 'app_lumi', replace(v_handle, '.', '-') || '-' || replace(p_key, '_', '-'), 'joinflowd.io/r/' || replace(v_handle, '.', '-') || '-' || replace(p_key, '_', '-'),
          'lumi://r/' || replace(p_key, '_', '-'), 'active');
  insert into public.posts (id, submission_id, creator_id, brand_id, app_id, bounty_id, social_account_id, platform, platform_post_id, url, caption, thumb, posted_at, window_ends_at, tracking_link_id, flow_band, tags, hashtags)
  values ('post_' || p_key, 'sub_' || p_key, p_creator, 'br_lumi', 'app_lumi', 'bnty_lumi_glowup', (select id from public.social_accounts where creator_id = p_creator limit 1), 'tiktok',
          '7' || lpad((abs(hashtext(p_key)) % 1000000000000000000)::text, 18, '0'), 'https://www.tiktok.com/@' || v_handle || '/video/' || p_key, 'Glow-up #ad Paid partnership with Lumi',
          public.default_art_seed('post-' || p_key, 'Glow'), v_posted, v_posted + interval '72 hours', 'lnk_' || p_key, 'B',
          '{"format_id": "tmpl_results_update", "hook_type": "specific_number", "hook_words": "I fixed 50 photos", "time_to_app_reveal_ms": 2400, "cta_type": "link_in_bio"}'::jsonb, array['#lumiapp', '#ad']);
  update public.attribution_links set post_id = 'post_' || p_key where id = 'lnk_' || p_key;
  update public.submissions set status = 'posted', post_id = 'post_' || p_key, link_id = 'lnk_' || p_key, posted_at = v_posted where id = 'sub_' || p_key;
  -- verified views: a mid-window sample and the closing snapshot, as the hourly sync would have recorded them
  perform public.ingest_post_sample('post_' || p_key, least(now(), v_posted + interval '30 hours'), (p_views * 0.6)::bigint, (p_views * 0.6)::bigint, null, null, null, null, p_snapshot => true);
  perform public.ingest_post_sample('post_' || p_key, least(now(), v_posted + interval '71 hours'), p_views, p_views, (p_views * 0.045)::integer, (p_views * 0.003)::integer, (p_views * 0.01)::integer, (p_views * 0.015)::integer, p_snapshot => true);
  perform set_config('flowd.seed_mode', 'off', true);
  if p_close then
    perform public.close_window('post_' || p_key);
  end if;
  if p_settle then
    perform public.settle_post('post_' || p_key);
  end if;
  perform set_config('flowd.seed_mode', 'on', true);
end
$f$;

-- Maya, 11 days ago: the golden walk-through post. 31,400 verified views x $2.10 = $65.94 + CPA through her link and a code, cleared, then paid.
select pg_temp.seed_post('maya_glowup', 'cr_maya', interval '11 days', 31400, true, true);
select set_config('flowd.seed_mode', 'off', true);
select public.record_conversion('lnk_maya_glowup', 'install', 'link', now() - interval '10 days', 7);
select public.record_conversion('lnk_maya_glowup', 'install', 'code', now() - interval '10 days', 2);
select public.record_conversion('lnk_maya_glowup', 'trial', 'link', now() - interval '10 days', 2);
select public.record_conversion('lnk_maya_glowup', 'paid', 'code', now() - interval '9 days', 1, 3499);
select public.record_conversion('lnk_maya_glowup', 'install', 'mmp', now() - interval '10 days', 14);   -- reported, never paid
select public.settle_conversion(c.id) from public.conversions c where c.post_id = 'post_maya_glowup' order by c.first_at, c.kind;
select public.clear_post('post_maya_glowup');
select set_config('flowd.seed_mode', 'on', true);

-- Maya, 3 days ago: window closed, PENDING until the next clearing run. Maya, 2 days ago: window open, ACCRUING.
select pg_temp.seed_post('maya_second', 'cr_maya', interval '3 days 4 hours', 18700, true, true);
select pg_temp.seed_post('maya_third', 'cr_maya', interval '2 days', 12400, false, false);
-- Kai, 9 days ago: cleared, waiting for the next weekly payout. Noor: submitted, in review with a Reserved Slot.
select pg_temp.seed_post('kai_glowup', 'cr_kai', interval '9 days', 21000, true, true);
select set_config('flowd.seed_mode', 'off', true);
select public.clear_post('post_kai_glowup');
select set_config('flowd.seed_mode', 'on', true);
insert into public.submissions (id, bounty_id, creator_id, brand_id, app_id, source, title, flow_band, flow_points, hook_band, hook_points, rights_card, rights_accepted_at, fraud_evidence, submitted_at, sla_due_at, format_id)
values ('sub_noor_glowup', 'bnty_lumi_glowup', 'cr_noor', 'br_lumi', 'app_lumi', 'studio', 'Glow-up reveal', 'C', 62, 'B', 74, (select rights_card from public.bounties where id = 'bnty_lumi_glowup'), now() - interval '20 hours', '{}'::jsonb,
        now() - interval '20 hours', now() - interval '20 hours' + interval '72 hours', 'tmpl_results_update');
select public.reserve_slot('sub_noor_glowup');
update public.submissions set status = 'in_review' where id = 'sub_noor_glowup';

-- Maya's weekly payout: the cleared money is parked on the scheduled payout; pay it in "last Friday's" run, free, and record the run.
do $payout$
declare
  v_friday timestamptz := (date_trunc('week', now() at time zone 'UTC') + interval '4 days 18 hours') at time zone 'UTC';
  v_id text;
begin
  if v_friday > now() then
    v_friday := v_friday - interval '7 days';
  end if;
  insert into public.payout_runs (id, run_date, scheduled_for, status, initiated_at, completed_at)
  values ('run_' || to_char(v_friday at time zone 'UTC', 'YYYY-MM-DD'), (v_friday at time zone 'UTC')::date, v_friday, 'complete', v_friday, v_friday + interval '2 hours')
  on conflict (id) do nothing;
  select p.id into v_id from public.payouts p where p.creator_id = 'cr_maya' and p.kind = 'weekly' and p.status = 'scheduled';
  -- Maya's earnings so far are exactly the first post: pay them (the later posts are still pending, so they are not on this payout)
  update public.payouts set run_id = 'run_' || to_char(v_friday at time zone 'UTC', 'YYYY-MM-DD'), scheduled_for = v_friday, requested_at = v_friday - interval '2 hours' where id = v_id;
  perform set_config('flowd.seed_mode', 'off', true);
  perform public.start_payout(v_id);
  perform public.complete_payout(v_id, 'tr_seed_maya', 'po_seed_maya');
  perform set_config('flowd.seed_mode', 'on', true);
  update public.payouts set initiated_at = v_friday, paid_at = v_friday + interval '1 hour' where id = v_id;
end
$payout$;

-- 6. projections: the Scorecard and the reputation row, then the persona facts the contract names ------------------------------------------------------------------------
select set_config('flowd.seed_mode', 'off', true);
select public.refresh_brand_scorecard('br_lumi');
select public.refresh_creator_reputation('cr_maya');
select public.refresh_creator_stats(id) from public.creators;
select public.refresh_money_clock(id) from public.creators;
select public.refresh_bounty_counters('bnty_lumi_glowup');
select set_config('flowd.seed_mode', 'on', true);
update public.creators set reliability_score = 93 where id = 'cr_maya';   -- persona fact (the reputation row recomputes from on-platform decisions only)

select public.audit_ledger() as ledger_audit;
commit;
