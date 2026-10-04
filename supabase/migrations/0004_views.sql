-- flowd 0004: views and materialised views
--
-- Three kinds
--   * PUBLIC views (v_public_*, v_ticker_totals, v_waitlist_*, v_promise_metrics): run with the view owner's rights, select only safe
--     columns, and are granted to anon. They are how the web and the storefront read data the tables keep private.
--   * INVOKER views (security_invoker = true): behave like the caller; RLS on the base tables decides which rows exist for them
--     (the creator wallet and Money Clock, the brand wallet, funnel, payback, review queue, creative library, leaderboard rows).
--   * MATERIALISED views (mv_*): market and creative statistics. No RLS on a materialised view, so they hold aggregates only.
--     public.refresh_market_views() refreshes them (hourly, by the housekeeping job) and public.publish_market_series() writes the
--     day's rows into market_series.
--
-- Sums are cast to bigint explicitly: sum(bigint) is numeric in Postgres.

-- ===========================================================================
-- 1. Public views
-- ===========================================================================
-- Brand profile with its public Scorecard (creators check it before they apply).
create view public.v_public_brands as
select b.id, b.kind, b.name, b.slug, b.tagline, b.logo, b.website, b.country, b.verification,
       s.reliability_score, s.band, s.badges, s.decision_hours_median, s.pays_on_time_ratio, s.run_rate, s.funded_always, s.decisions_n, s.as_of as scorecard_as_of
from public.brands b
left join public.brand_scorecards s on s.brand_id = b.id and s.window_days = 90
where b.deleted_at is null and b.suspended_at is null;

-- App facts shown on bounty cards.
create view public.v_public_apps as
select a.id, a.brand_id, a.name, a.tagline, a.category, a.icon, a.rating, a.rating_count, a.features, a.default_hashtags
from public.apps a
where a.deleted_at is null;

-- Public bounty pages (joinflowd.io/b/<id>): the Funded badge, the Rights Card, Pay Math and the TRUE number of spots left.
-- Escrow internals, the take rate and the all-in price are brand-side and are not here.
create view public.v_public_bounties as
select bo.id, bo.title, bo.type, bo.status, bo.visibility, bo.featured, bo.is_starter,
       bo.cpm_cents, bo.cpa_install_cents, bo.cpa_trial_cents, bo.cpa_paid_cents, bo.flat_fee_cents, bo.ad_commission_rate, bo.per_video_cap_cents,
       bo.budget_cents, bo.funded, bo.funded_at,
       public.spots_left(bo.remaining_cents, bo.per_video_cap_cents, bo.take_rate)::integer as spots_left,
       bo.brief, bo.rights_card, bo.deliverables, bo.eligibility, bo.pay_math, bo.format_ids, bo.art,
       bo.starts_at, bo.ends_at, bo.published_at, bo.review_sla_hours,
       (bo.counts ->> 'creators')::integer as creators_count, (bo.counts ->> 'submissions')::integer as submissions_count, (bo.counts ->> 'approved')::integer as approved_count,
       bo.brand_id, br.name as brand_name, br.slug as brand_slug, br.logo as brand_logo, br.verification as brand_verification,
       sc.reliability_score as brand_reliability_score, sc.band as brand_band, sc.badges as brand_badges,
       a.id as app_id, a.name as app_name, a.tagline as app_tagline, a.category as app_category, a.icon as app_icon
from public.bounties bo
join public.brands br on br.id = bo.brand_id and br.deleted_at is null and br.suspended_at is null
join public.apps a on a.id = bo.app_id and a.deleted_at is null
left join public.brand_scorecards sc on sc.brand_id = bo.brand_id and sc.window_days = 90
where bo.visibility = 'open' and bo.status in ('live', 'paused', 'filled', 'ended', 'settled');

-- Creator storefront (joinflowd.io/c/<handle>): verified stats only, and only when the creator turned stats on.
create view public.v_public_storefronts as
select c.id, c.handle, c.display_name, c.bio, c.avatar, c.tier, c.niches, c.country, c.badges, c.founding, c.open_to_offers,
       c.verification_status = 'verified' as id_verified, c.storefront, c.portfolio,
       case when coalesce((c.storefront ->> 'show_stats')::boolean, false) then c.posts_count end as posts_count,
       case when coalesce((c.storefront ->> 'show_stats')::boolean, false) then c.approval_rate end as approval_rate,
       case when coalesce((c.storefront ->> 'show_stats')::boolean, false)
            then (select coalesce(sum(sa.followers), 0)::bigint from public.social_accounts sa where sa.creator_id = c.id and sa.deleted_at is null and sa.status = 'connected') end as followers
from public.creators c
where c.deleted_at is null and (c.paused_until is null or c.paused_until < now());

-- Creator discovery for brands: verified stats and the fair reputation. A creator with fewer than 5 finished decisions shows
-- "building history" (reliability is null, never a verdict). No earnings, no stripe id, no payout data.
create view public.v_creator_cards as
select c.id, c.handle, c.display_name, c.bio, c.avatar, c.niches, c.country, c.languages, c.tier, c.tier_since, c.approval_rate, c.posts_count, c.badges, c.founding,
       c.verification_status = 'verified' as id_verified, c.open_to_offers, c.storefront, c.portfolio,
       case when coalesce(r.provisional, true) then null else c.reliability_score end as reliability_score,
       coalesce(r.provisional, true) as reliability_provisional,
       coalesce(r.finished_n, 0) as finished_n,
       (select coalesce(sum(sa.followers), 0)::bigint from public.social_accounts sa where sa.creator_id = c.id and sa.deleted_at is null and sa.status = 'connected') as followers,
       (select coalesce(jsonb_agg(jsonb_build_object('platform', sa.platform, 'handle', sa.handle, 'followers', sa.followers, 'median_views_28d', sa.median_views_28d,
                 'engagement_rate', sa.engagement_rate, 'us_audience_ratio', sa.us_audience_ratio, 'verified_by_platform', sa.verified_by_platform)
                 order by sa.is_primary desc, sa.followers desc), '[]'::jsonb)
          from public.social_accounts sa where sa.creator_id = c.id and sa.deleted_at is null and sa.status = 'connected') as accounts,
       rc.price_per_video_cents, rc.min_cpm_cents, rc.turnaround_days, coalesce(rc.accepts_direct_offers, false) as accepts_direct_offers
from public.creators c
left join public.creator_reputation r on r.creator_id = c.id
left join public.rate_cards rc on rc.creator_id = c.id and rc.deleted_at is null and rc.status <> 'paused'
where c.deleted_at is null and (c.paused_until is null or c.paused_until < now());

-- The public payout ticker totals (TickerTotals). The typical (median) 30-day creator figure is ALWAYS published beside the top decile.
create view public.v_ticker_totals as
with paid as (
  select p.net_cents, p.paid_at, p.creator_id from public.payouts p where p.status = 'paid'
),
c30 as (
  select c.id as creator_id,
         coalesce((select sum(l.amount_cents) from public.ledger l
                   where l.creator_id = c.id and l.account_kind = 'creator' and l.amount_cents > 0 and l.entry_type in ('cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral')
                     and l.status in ('cleared', 'paid') and l.cleared_at >= now() - interval '30 days'), 0)::bigint as earned
  from public.creators c
  where c.deleted_at is null
    and (exists (select 1 from public.posts p where p.creator_id = c.id and p.posted_at >= now() - interval '30 days')
         or exists (select 1 from public.ledger l where l.creator_id = c.id and l.account_kind = 'creator' and l.status in ('cleared', 'paid') and l.cleared_at >= now() - interval '30 days'))
)
select
  coalesce((select sum(net_cents) from paid), 0)::bigint as total_paid_cents,
  coalesce((select sum(net_cents) from paid where paid_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'), 0)::bigint as paid_today_cents,
  coalesce((select sum(net_cents) from paid where paid_at >= now() - interval '7 days'), 0)::bigint as paid_7d_cents,
  (select count(distinct creator_id) from paid)::integer as creators_paid,
  (select count(*) from paid)::integer as payouts_count,
  (select count(*) from public.posts where status in ('cleared', 'paid'))::integer as posts_cleared,
  coalesce(round((select percentile_cont(0.5) within group (order by earned) from c30)), 0)::bigint as typical_creator_30d_cents,
  coalesce(round((select percentile_cont(0.25) within group (order by earned) from c30)), 0)::bigint as p25_creator_30d_cents,
  coalesce(round((select percentile_cont(0.75) within group (order by earned) from c30)), 0)::bigint as p75_creator_30d_cents,
  coalesce(round((select percentile_cont(0.9) within group (order by earned) from c30)), 0)::bigint as top_decile_creator_30d_cents,
  (select count(*) from c30)::integer as active_creators_30d,
  now() as updated_at;

-- Ranked waitlist: handles only, never emails.
create view public.v_waitlist_totals as
select (count(*) filter (where kind = 'creator'))::integer as creators,
       (count(*) filter (where kind = 'brand'))::integer as brands,
       (count(*) filter (where converted_user_id is not null or invite_accepted_at is not null))::integer as invites_accepted,
       now() as updated_at
from public.waitlist_entries;

create view public.v_waitlist_leaders as
select (row_number() over (order by w.referrals_count desc, w.joined_at))::integer as position,
       w.kind, coalesce(w.handle, 'anonymous') as handle, w.referrals_count as referrals, w.joined_at
from public.waitlist_entries w
order by w.referrals_count desc, w.joined_at
limit 25;

-- The 11 flowd Promise proof metrics, computed from the ledger and the queues (public on /promise and /trust).
create view public.v_promise_metrics as
with
cleared as (
  select count(*) filter (where p.cleared_at <= public.post_clearing_run(p.window_ends_at)) as ok, count(*) as total
  from public.posts p where p.status in ('cleared', 'paid') and p.cleared_at >= now() - interval '90 days'
),
funded as (
  select count(*) filter (where b.funded) as ok, count(*) as total from public.bounties b where b.status in ('scheduled', 'live', 'paused', 'filled', 'ended', 'settled')
),
sla as (
  select count(*) filter (where q.hours <= private.ki('review.sla_hours')) as ok, count(*) as total
  from (
    select extract(epoch from ((s.decision ->> 'decided_at')::timestamptz - s.submitted_at)) / 3600 as hours
    from public.submissions s
    where s.decision is not null and (s.decision ->> 'action') in ('approve', 'auto_approve', 'timeout_approve', 'reject', 'auto_reject', 'appeal_overturn', 'appeal_uphold')
      and (s.decision ->> 'decided_at')::timestamptz >= now() - interval '90 days'
  ) q
),
scored as (
  select count(distinct sc.brand_id) as ok, count(distinct b.brand_id) as total
  from public.bounties b left join public.brand_scorecards sc on sc.brand_id = b.brand_id
  where b.status <> 'draft'
),
ledgered as (
  select count(*) filter (where exists (select 1 from public.view_snapshots v where v.post_id = p.id)) as ok, count(*) as total
  from public.posts p where p.status in ('cleared', 'paid', 'window_closed', 'held')
),
carded as (
  select count(*) filter (where b.rights_card ? 'organic') as ok, count(*) as total from public.bounties b where b.status <> 'draft'
),
linted as (
  select count(*) filter (where (b.brief_lint ->> 'passed')::boolean) as ok, count(*) as total from public.bounties b where b.status not in ('draft', 'cancelled')
),
taxed as (
  select count(*) filter (where c.payout_ready) as ok, count(*) as total
  from public.creators c where c.onboarding_stage in ('first_approval', 'verified', 'first_dollar') and c.deleted_at is null
),
triaged as (
  select count(*) filter (where r.triaged_at <= r.created_at + interval '24 hours') as ok, count(*) as total from public.scam_reports r where r.triaged_at is not null
),
well as (
  select count(*) filter (where w.enabled) as ok, count(*) as total from public.creators c left join public.wellbeing_settings w on w.creator_id = c.id where c.deleted_at is null
)
select 1 as number, 'cleared_on_eta'::text as key, 'Earnings cleared on or before the date we showed'::text as label,
       coalesce(ok::numeric / nullif(total, 0), 1) as value, 'ratio'::text as unit, 0.95::numeric as target,
       format('%s%% cleared on or before the ETA', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)) as display,
       'Last 90 days, posts that cleared at the daily run.'::text as note
from cleared
union all
select 2, 'funded_live_ratio', 'Bounties live with the full budget in escrow', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 1::numeric,
       format('%s%% of live bounties were fully funded', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'No bounty can go live unfunded.' from funded
union all
select 3, 'decided_in_sla_ratio', 'Submissions decided inside 72 hours', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 0.9::numeric,
       format('%s%% decided in 72 hours or less', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'Last 90 days, every decision carries a reason code.' from sla
union all
select 4, 'brands_scored_ratio', 'Brands with a public Scorecard', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 1::numeric,
       format('%s%% of brands show a Scorecard', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'Pay speed, decision time, fairness and run rate.' from scored
union all
select 5, 'view_ledger_ratio', 'Posts with a View Ledger', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 1::numeric,
       format('%s%% of posts have source-labelled snapshots', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'Verified versus excluded views with the cause.' from ledgered
union all
select 6, 'rights_card_ratio', 'Bounties with a plain-language Rights Card', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 1::numeric,
       format('%s%% of bounties carry a Rights Card', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'Organic posting always included; paid-ad use is a fixed term.' from carded
union all
select 7, 'brief_lint_pass_ratio', 'Published bounties that passed Brief Lint', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 1::numeric,
       format('%s%% passed Brief Lint', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'No unpaid trials, view minimums or burner-account demands.' from linted
union all
select 8, 'payout_ready_ratio', 'Creators ready to be paid (ID, tax form, payout method)', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 0.9::numeric,
       format('%s%% of working creators are payout ready', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'Collected just in time, at the first approval.' from taxed
union all
select 9, 'scam_triage_24h_ratio', 'Scam reports triaged inside 24 hours', coalesce(ok::numeric / nullif(total, 0), 1), 'ratio', 0.95::numeric,
       format('%s%% triaged in 24 hours or less', round(coalesce(ok::numeric / nullif(total, 0), 1) * 100, 1)), 'In-app chat only, no pay-to-join, verified brands.' from triaged
union all
select 10, 'typical_creator_30d_cents', 'Typical (median) 30-day earnings of active creators', t.typical_creator_30d_cents::numeric, 'cents', null::numeric,
       private.fmt_money(t.typical_creator_30d_cents) || ' typical, ' || private.fmt_money(t.top_decile_creator_30d_cents) || ' for the top 10%',
       'Always shown beside any top-earner figure. Results vary.' from public.v_ticker_totals t
union all
select 11, 'wellbeing_opt_in_ratio', 'Creators using Wellbeing Mode', coalesce(ok::numeric / nullif(total, 0), 0), 'ratio', null::numeric,
       format('%s%% of creators use Wellbeing Mode', round(coalesce(ok::numeric / nullif(total, 0), 0) * 100, 1)), 'Quiet hours, numbers-off and a pause that keeps tier and streak.' from well;

-- Daily Drop inventory: spots left are a TRUE count (total minus claims), never a marketing number.
create view public.v_drop_inventory as
select d.id as drop_id, d.status as drop_status, d.release_at, d.claim_window_ends_at, i.bounty_id, bo.title as bounty_title, i.position, i.spots_total,
       (select count(*) from public.drop_claims c where c.drop_id = i.drop_id and c.bounty_id = i.bounty_id)::integer as claims,
       (i.spots_total - (select count(*) from public.drop_claims c where c.drop_id = i.drop_id and c.bounty_id = i.bounty_id))::integer as spots_left
from public.daily_drops d
join public.drop_items i on i.drop_id = d.id
join public.bounties bo on bo.id = i.bounty_id;

-- The admin control tower queue counts, live. A definer view that returns a row only to admins.
create view public.v_admin_queue_counts as
select
  (select count(*) from public.fraud_flags where status in ('open', 'monitoring'))::integer as fraud_open,
  (select count(*) from public.disputes where status in ('open', 'evidence_requested', 'under_review'))::integer as disputes_open,
  (select count(*) from public.verifications where status = 'pending')::integer as verification_open,
  (select count(*) from public.scam_reports where status = 'new')::integer as safety_new,
  (select count(*) from public.submissions s where s.status = 'in_review' and s.sla_state = 'stale')::integer as sla_stale,
  (select count(*) from public.submissions s where s.status = 'in_review' and s.sla_state = 'breached')::integer as sla_breached,
  (select count(*) from public.payouts where status = 'held')::integer as payouts_held
from (select 1) x
where (select private.is_admin());

-- ===========================================================================
-- 2. Invoker views (RLS decides which rows a caller sees)
-- ===========================================================================
-- The Money Clock of the signed-in creator: every earning with its state, dated ETA and named reason. Pending shows accruing and
-- pending together; cleared is never summed with pending.
create view public.v_money_clock with (security_invoker = true) as
select m.*,
       m.state in ('accruing', 'pending') as is_pending_ui,
       case when m.eta_at is not null then round((extract(epoch from (m.eta_at - now())) / 3600)::numeric, 1) end as hours_to_eta,
       a.name as app_name, a.icon as app_icon
from public.money_clock m
left join public.v_public_apps a on a.id = m.app_id;

-- Creator wallet: Cleared and Pending side by side (never summed), held, paid and the next dates.
create view public.v_wallet_creator with (security_invoker = true) as
select m.creator_id,
       coalesce(sum(m.amount_cents) filter (where m.state in ('accruing', 'pending')), 0)::bigint as pending_cents,
       coalesce(sum(m.amount_cents) filter (where m.state = 'cleared'), 0)::bigint as cleared_cents,
       coalesce(sum(m.amount_cents) filter (where m.state = 'held'), 0)::bigint as held_cents,
       coalesce(sum(m.amount_cents) filter (where m.state = 'paid'), 0)::bigint as paid_cents,
       (count(*) filter (where m.state in ('accruing', 'pending')))::integer as pending_items,
       (count(*) filter (where m.state = 'cleared'))::integer as cleared_items,
       (count(*) filter (where m.state = 'held'))::integer as held_items,
       min(m.eta_at) filter (where m.state in ('accruing', 'pending')) as next_clear_at,
       min(m.eta_at) filter (where m.state = 'cleared') as next_payout_at
from public.money_clock m
group by m.creator_id;

-- Brand wallet: balance, holds, what is available, and what sits in escrow.
create view public.v_wallet_brand with (security_invoker = true) as
select br.id as brand_id, br.wallet_balance_cents,
       coalesce((select sum(h.amount_cents) from public.wallet_holds h where h.brand_id = br.id and h.status = 'active'), 0)::bigint as holds_cents,
       (br.wallet_balance_cents - coalesce((select sum(h.amount_cents) from public.wallet_holds h where h.brand_id = br.id and h.status = 'active'), 0))::bigint as available_cents,
       coalesce((select sum(b.remaining_cents) from public.bounties b where b.brand_id = br.id and b.funded and b.status in ('scheduled', 'live', 'paused', 'filled', 'ended')), 0)::bigint as escrow_remaining_cents,
       coalesce((select sum(b.reserved_cents) from public.bounties b where b.brand_id = br.id and b.funded and b.status in ('scheduled', 'live', 'paused', 'filled', 'ended')), 0)::bigint as escrow_reserved_cents,
       coalesce((select sum(b.spent_cents) from public.bounties b where b.brand_id = br.id), 0)::bigint as spent_cents,
       (select count(*) from public.bounties b where b.brand_id = br.id and b.status = 'live')::integer as live_bounties
from public.brands br
where br.deleted_at is null;

-- Views to paid per bounty with the cost of each stage. Tracked (link + code) counts drive every cost; estimated counts (MMP, survey,
-- modelled) are separate columns and are never mixed in. ROAS Dn = tracked revenue within n days of posting / brand cost.
create view public.v_funnel_bounty with (security_invoker = true) as
with cost as (
  select bo.id as bounty_id,
         (bo.spent_cents + coalesce((select sum(ad.spend_cents + ad.commission_cents + ad.platform_fee_cents) from public.ads ad where ad.bounty_id = bo.id), 0))::bigint as cost_cents
  from public.bounties bo
),
rev as (
  select c.bounty_id,
         coalesce(sum(c.revenue_cents), 0)::bigint as revenue_cents,
         coalesce(sum(c.revenue_cents) filter (where c.occurred_on <= (p.posted_at at time zone 'UTC')::date + 7), 0)::bigint as revenue_d7_cents,
         coalesce(sum(c.revenue_cents) filter (where c.occurred_on <= (p.posted_at at time zone 'UTC')::date + 30), 0)::bigint as revenue_d30_cents,
         coalesce(sum(c.revenue_cents) filter (where c.occurred_on <= (p.posted_at at time zone 'UTC')::date + 90), 0)::bigint as revenue_d90_cents
  from public.conversions c
  join public.posts p on p.id = c.post_id
  where c.payable and c.kind = 'paid' and c.status not in ('rejected', 'refunded')
  group by c.bounty_id
)
select bo.id as bounty_id, bo.brand_id, bo.app_id, bo.title, bo.status,
       (bo.funnel ->> 'views')::bigint as views, (bo.funnel ->> 'clicks')::bigint as clicks, (bo.funnel ->> 'installs')::bigint as installs,
       (bo.funnel ->> 'trials')::bigint as trials, (bo.funnel ->> 'paid')::bigint as paid,
       (bo.funnel ->> 'est_installs')::bigint as est_installs, (bo.funnel ->> 'est_trials')::bigint as est_trials, (bo.funnel ->> 'est_paid')::bigint as est_paid,
       cost.cost_cents,
       case when (bo.funnel ->> 'views')::bigint > 0 then round(cost.cost_cents::numeric / (bo.funnel ->> 'views')::bigint * 1000)::bigint end as cpm_effective_cents,
       case when (bo.funnel ->> 'clicks')::bigint > 0 then round(cost.cost_cents::numeric / (bo.funnel ->> 'clicks')::bigint)::bigint end as cost_per_click_cents,
       case when (bo.funnel ->> 'installs')::bigint > 0 then round(cost.cost_cents::numeric / (bo.funnel ->> 'installs')::bigint)::bigint end as cost_per_install_cents,
       case when (bo.funnel ->> 'trials')::bigint > 0 then round(cost.cost_cents::numeric / (bo.funnel ->> 'trials')::bigint)::bigint end as cost_per_trial_cents,
       case when (bo.funnel ->> 'paid')::bigint > 0 then round(cost.cost_cents::numeric / (bo.funnel ->> 'paid')::bigint)::bigint end as cost_per_paid_cents,
       case when (bo.funnel ->> 'views')::bigint > 0 then round((bo.funnel ->> 'clicks')::numeric / (bo.funnel ->> 'views')::bigint, 4) else 0 end as view_to_click,
       case when (bo.funnel ->> 'trials')::bigint > 0 then round((bo.funnel ->> 'paid')::numeric / (bo.funnel ->> 'trials')::bigint, 4) else 0 end as trial_to_paid,
       coalesce(rev.revenue_cents, 0)::bigint as revenue_cents,
       case when cost.cost_cents > 0 then round(coalesce(rev.revenue_d7_cents, 0)::numeric / cost.cost_cents, 2) else 0 end as roas_d7,
       case when cost.cost_cents > 0 then round(coalesce(rev.revenue_d30_cents, 0)::numeric / cost.cost_cents, 2) else 0 end as roas_d30,
       case when cost.cost_cents > 0 then round(coalesce(rev.revenue_d90_cents, 0)::numeric / cost.cost_cents, 2) else 0 end as roas_d90
from public.bounties bo
join cost on cost.bounty_id = bo.id
left join rev on rev.bounty_id = bo.id;

-- Payback: the first day on which cumulative tracked revenue covers the bounty's cost.
create view public.v_payback_bounty with (security_invoker = true) as
with cost as (
  select bo.id as bounty_id, bo.brand_id, bo.published_at,
         (bo.spent_cents + coalesce((select sum(ad.spend_cents + ad.commission_cents + ad.platform_fee_cents) from public.ads ad where ad.bounty_id = bo.id), 0))::bigint as cost_cents
  from public.bounties bo
),
daily as (
  select c.bounty_id, c.occurred_on as day, sum(c.revenue_cents) as revenue
  from public.conversions c
  where c.payable and c.kind = 'paid' and c.status not in ('rejected', 'refunded')
  group by c.bounty_id, c.occurred_on
),
cum as (
  select d.bounty_id, d.day, sum(d.revenue) over (partition by d.bounty_id order by d.day) as cum_revenue from daily d
)
select cost.bounty_id, cost.brand_id, cost.cost_cents,
       coalesce(max(cum.cum_revenue), 0)::bigint as revenue_cents,
       min(cum.day) filter (where cum.cum_revenue >= cost.cost_cents and cost.cost_cents > 0) as payback_on,
       (min(cum.day) filter (where cum.cum_revenue >= cost.cost_cents and cost.cost_cents > 0) - (cost.published_at at time zone 'UTC')::date) as payback_days
from cost
left join cum on cum.bounty_id = cost.bounty_id
group by cost.bounty_id, cost.brand_id, cost.cost_cents, cost.published_at;

-- The brand's review queue: submissions in review, oldest SLA first, with QA counts, Flow Score and the creator card.
create view public.v_review_queue with (security_invoker = true) as
select s.id as submission_id, s.bounty_id, bo.title as bounty_title, s.brand_id, s.app_id, s.creator_id, s.version, s.title, s.status,
       s.flow_band, s.flow_points, s.hook_band, s.hook_points, s.fraud_evidence, s.revision_round, s.submitted_at, s.sla_due_at,
       lv.submitted_at as version_submitted_at, lv.qa_pass, lv.qa_warn, lv.qa_fail, lv.video_duration_ms, lv.video_art,
       round((extract(epoch from (now() - lv.submitted_at)) / 3600)::numeric, 1) as hours_in_queue,
       round(greatest(0, extract(epoch from (s.sla_due_at - now())) / 3600)::numeric, 1) as hours_left,
       public.sla_state_for((extract(epoch from (now() - lv.submitted_at)) / 3600)::numeric, false) as sla_state_now,
       cc.handle as creator_handle, cc.display_name as creator_name, cc.avatar as creator_avatar, cc.tier as creator_tier,
       cc.reliability_score as creator_reliability, cc.reliability_provisional as creator_provisional
from public.submissions s
join public.bounties bo on bo.id = s.bounty_id
join lateral (select v.* from public.submission_versions v where v.submission_id = s.id order by v.version desc limit 1) lv on true
left join public.v_creator_cards cc on cc.id = s.creator_id
where s.status = 'in_review';

-- Creative Intelligence Library: every posted video tagged by format, hook and CTA with its results.
create view public.v_creative_library with (security_invoker = true) as
select p.id as post_id, p.brand_id, p.app_id, p.bounty_id, p.creator_id, p.platform, p.posted_at, p.status, p.thumb,
       (p.tags ->> 'format_id') as format_id, (p.tags ->> 'hook_type') as hook_type, (p.tags ->> 'hook_words') as hook_words,
       (p.tags ->> 'cta_type') as cta_type, (p.tags ->> 'time_to_app_reveal_ms')::integer as time_to_app_reveal_ms,
       p.window_views, p.views, (p.funnel ->> 'clicks')::bigint as clicks, (p.funnel ->> 'installs')::bigint as installs,
       (p.funnel ->> 'trials')::bigint as trials, (p.funnel ->> 'paid')::bigint as paid,
       case when (p.funnel ->> 'installs')::bigint > 0 then round((p.funnel ->> 'trials')::numeric / (p.funnel ->> 'installs')::bigint, 4) end as trial_rate,
       p.is_winner, p.why_it_won, p.flow_band
from public.posts p
where p.status <> 'removed';

-- Leaderboard rows ready to render (the creator card is joined through the definer view, so handles resolve under RLS).
create view public.v_leaderboard_rows with (security_invoker = true) as
select l.id as leaderboard_id, l.scope, l.iso_week, l.metric, l.tier as board_tier, l.niche as board_niche, l.label, l.cohort_size, l.promotion_zone_size, l.reset_at,
       e.rank, e.value, e.delta_rank, e.zone, e.creator_id,
       cc.handle, cc.display_name, cc.avatar, cc.tier as creator_tier
from public.leaderboards l
join public.leaderboard_entries e on e.leaderboard_id = l.id
left join public.v_creator_cards cc on cc.id = e.creator_id;

-- ===========================================================================
-- 3. Materialised views: market statistics
-- ===========================================================================
-- The clearing-CPM series per category and day, rebuilt from bounties, submissions and posts (the shape of market_series).
-- Clearing CPM = median CPM of open bounties published in the trailing 7 days that are receiving submissions.
create materialized view public.mv_market_series_daily as
with days as (
  select (g)::date as date from generate_series(((now() at time zone 'UTC')::date - 120)::timestamp, ((now() at time zone 'UTC')::date)::timestamp, interval '1 day') g
),
cats as (
  select unnest(enum_range(null::public.category)) as category
),
b as (
  select a.category, bo.cpm_cents, bo.budget_cents, bo.first_submission_at, bo.time_to_fill_hours,
         (bo.published_at at time zone 'UTC')::date as pub_date,
         (coalesce(bo.ended_at, bo.ends_at) at time zone 'UTC')::date as end_date,
         (bo.filled_at at time zone 'UTC')::date as filled_date
  from public.bounties bo
  join public.apps a on a.id = bo.app_id
  where bo.published_at is not null and bo.visibility = 'open' and bo.funded
)
select
  'mkt_' || c.category::text || '_' || to_char(d.date, 'YYYY-MM-DD') as id,
  c.category, d.date,
  coalesce(round(bx.clearing), 0)::bigint as clearing_cpm_cents,
  coalesce(round(bx.p25), 0)::bigint as p25_cpm_cents,
  coalesce(round(bx.p75), 0)::bigint as p75_cpm_cents,
  coalesce(bx.open_bounties, 0)::integer as open_bounties,
  coalesce(bx.open_budget_cents, 0)::bigint as open_budget_cents,
  coalesce(bx.new_bounties, 0)::integer as new_bounties,
  coalesce(sx.submissions, 0)::integer as submissions,
  coalesce(round(bx.fill_hours::numeric, 2), 0) as median_fill_hours,
  coalesce(round(px.median_views), 0)::integer as median_views,
  coalesce(least(1, round(px.trial_rate, 5)), 0) as trial_rate,
  coalesce(bx.sample_n, 0)::integer as sample_n
from days d
cross join cats c
cross join lateral (
  select
    count(*) filter (where x.pub_date <= d.date and x.end_date >= d.date) as open_bounties,
    coalesce(sum(x.budget_cents) filter (where x.pub_date <= d.date and x.end_date >= d.date), 0) as open_budget_cents,
    count(*) filter (where x.pub_date = d.date) as new_bounties,
    percentile_cont(0.5) within group (order by x.cpm_cents) filter (where x.cpm_cents > 0 and x.first_submission_at is not null and x.pub_date between d.date - 6 and d.date) as clearing,
    percentile_cont(0.25) within group (order by x.cpm_cents) filter (where x.cpm_cents > 0 and x.first_submission_at is not null and x.pub_date between d.date - 6 and d.date) as p25,
    percentile_cont(0.75) within group (order by x.cpm_cents) filter (where x.cpm_cents > 0 and x.first_submission_at is not null and x.pub_date between d.date - 6 and d.date) as p75,
    count(*) filter (where x.cpm_cents > 0 and x.first_submission_at is not null and x.pub_date between d.date - 6 and d.date) as sample_n,
    percentile_cont(0.5) within group (order by x.time_to_fill_hours) filter (where x.time_to_fill_hours is not null and x.filled_date between d.date - 29 and d.date) as fill_hours
  from b x
  where x.category = c.category
) bx
cross join lateral (
  select count(*) as submissions
  from public.submissions s
  join public.bounties bo on bo.id = s.bounty_id
  join public.apps a on a.id = bo.app_id
  where a.category = c.category and (s.submitted_at at time zone 'UTC')::date = d.date
) sx
cross join lateral (
  select percentile_cont(0.5) within group (order by p.window_views) as median_views,
         sum((p.funnel ->> 'trials')::bigint)::numeric / nullif(sum((p.funnel ->> 'installs')::bigint), 0) as trial_rate
  from public.posts p
  join public.apps a on a.id = p.app_id
  where a.category = c.category and p.status in ('window_closed', 'held', 'cleared', 'paid')
    and (p.posted_at at time zone 'UTC')::date between d.date - 6 and d.date
) px;
create unique index mv_market_series_daily_key on public.mv_market_series_daily (category, date);
create unique index mv_market_series_daily_id on public.mv_market_series_daily (id);

-- Hook-type performance on settled posts (Creative Intelligence hook leaderboard, State of App UGC).
create materialized view public.mv_hook_leaderboard as
select (p.tags ->> 'hook_type')::public.hook_type as hook_type, a.category,
       count(*)::integer as posts,
       round(percentile_cont(0.5) within group (order by p.window_views))::bigint as median_views,
       coalesce(sum((p.funnel ->> 'installs')::bigint), 0)::bigint as installs,
       coalesce(sum((p.funnel ->> 'trials')::bigint), 0)::bigint as trials,
       coalesce(sum((p.funnel ->> 'paid')::bigint), 0)::bigint as paid,
       coalesce(least(1, sum((p.funnel ->> 'trials')::numeric) / nullif(sum((p.funnel ->> 'installs')::numeric), 0)), 0) as trial_rate,
       count(*)::numeric / sum(count(*)) over (partition by a.category) as share_of_posts
from public.posts p
join public.apps a on a.id = p.app_id
where p.status in ('cleared', 'paid') and p.tags ? 'hook_type'
group by (p.tags ->> 'hook_type'), a.category;
create unique index mv_hook_leaderboard_key on public.mv_hook_leaderboard (hook_type, category);

-- Format performance on settled posts.
create materialized view public.mv_format_leaderboard as
select (p.tags ->> 'format_id')::public.format_id as format_id, a.category,
       count(*)::integer as posts,
       round(percentile_cont(0.5) within group (order by p.window_views))::bigint as median_views,
       coalesce(sum((p.funnel ->> 'installs')::bigint), 0)::bigint as installs,
       coalesce(sum((p.funnel ->> 'trials')::bigint), 0)::bigint as trials,
       coalesce(least(1, sum((p.funnel ->> 'trials')::numeric) / nullif(sum((p.funnel ->> 'installs')::numeric), 0)), 0) as trial_rate,
       count(*)::numeric / sum(count(*)) over (partition by a.category) as share_of_posts
from public.posts p
join public.apps a on a.id = p.app_id
where p.status in ('cleared', 'paid') and p.tags ? 'format_id'
group by (p.tags ->> 'format_id'), a.category;
create unique index mv_format_leaderboard_key on public.mv_format_leaderboard (format_id, category);

create or replace function public.refresh_market_views()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view public.mv_market_series_daily;
  refresh materialized view public.mv_hook_leaderboard;
  refresh materialized view public.mv_format_leaderboard;
end
$$;

-- Publish one day of the market series (the table the public Market view reads) from the materialised view.
create or replace function public.publish_market_series(p_date date default ((now() at time zone 'UTC')::date))
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.market_series (id, category, date, clearing_cpm_cents, p25_cpm_cents, p75_cpm_cents, open_bounties, open_budget_cents, new_bounties,
                                    submissions, median_fill_hours, median_views, trial_rate, sample_n)
  select m.id, m.category, m.date, m.clearing_cpm_cents, m.p25_cpm_cents, m.p75_cpm_cents, m.open_bounties, m.open_budget_cents, m.new_bounties,
         m.submissions, m.median_fill_hours, m.median_views, m.trial_rate, m.sample_n
  from public.mv_market_series_daily m
  where m.date = p_date
  on conflict (category, date) do update set
    clearing_cpm_cents = excluded.clearing_cpm_cents, p25_cpm_cents = excluded.p25_cpm_cents, p75_cpm_cents = excluded.p75_cpm_cents,
    open_bounties = excluded.open_bounties, open_budget_cents = excluded.open_budget_cents, new_bounties = excluded.new_bounties,
    submissions = excluded.submissions, median_fill_hours = excluded.median_fill_hours, median_views = excluded.median_views,
    trial_rate = excluded.trial_rate, sample_n = excluded.sample_n;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function public.refresh_market_views() from public, anon, authenticated;
revoke all on function public.publish_market_series(date) from public, anon, authenticated;
grant execute on function public.refresh_market_views() to service_role;
grant execute on function public.publish_market_series(date) to service_role;

-- ===========================================================================
-- 4. Grants
-- ===========================================================================
grant select on public.v_public_brands, public.v_public_apps, public.v_public_bounties, public.v_public_storefronts, public.v_ticker_totals,
  public.v_waitlist_totals, public.v_waitlist_leaders, public.v_promise_metrics, public.mv_market_series_daily, public.mv_hook_leaderboard,
  public.mv_format_leaderboard to anon, authenticated;
grant select on public.v_creator_cards, public.v_drop_inventory, public.v_admin_queue_counts, public.v_money_clock, public.v_wallet_creator,
  public.v_wallet_brand, public.v_funnel_bounty, public.v_payback_bounty, public.v_review_queue, public.v_creative_library,
  public.v_leaderboard_rows to authenticated;
grant select on all tables in schema public to service_role;
-- helpers the public views call run with the caller's rights
grant execute on function private.fmt_money(bigint), private.fmt_eta(timestamptz) to anon, authenticated, service_role;
