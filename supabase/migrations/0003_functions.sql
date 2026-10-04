-- flowd 0003: business functions
--
-- Conventions
--   * Pure formula functions mirror packages/contract/schema/formulas.mjs one for one (money in integer cents, rounding half up per
--     leg). supabase/tests/formulas.test.sql replays packages/contract/formula-vectors.json against them. Constants are read from
--     public.flowd_constants through private.kn/ki/kt/kj, so SQL, web and iOS share one set of numbers.
--   * Pure functions are callable by anyone (quotes, previews). Functions that read personal data check the caller. Functions that
--     MOVE money or change state are granted to service_role only: the API server and the edge functions call them after
--     authorising the actor, and they re-check every invariant themselves.
--   * Every mutating function is idempotent (idempotency keys on ledger_transactions, status guards) and runs in one transaction.
--   * SECURITY DEFINER functions use set search_path = '' and fully qualify every object.
--
-- Error codes (SQLSTATE) are listed in 10-invariants (0001) and docs/ARCHITECTURE.md.

-- ===========================================================================
-- A. Primitives
-- ===========================================================================
-- True for the service role and for direct database connections (psql, migrations, pg_cron: no JWT at all). False for a signed-in
-- user or anon request. Definer functions use it to decide whether to apply the "caller must be the owner or an admin" rule.
create or replace function private.caller_is_service()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = '' or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.bps(p_rate numeric)
returns integer
language sql
immutable
parallel safe
as $$
  select round(p_rate * 10000)::integer;
$$;

-- round-half-up(cents x rate) in integer basis points: no floating point drift. Inputs are non-negative.
create or replace function public.mul_rate(p_cents bigint, p_rate numeric)
returns bigint
language sql
immutable
parallel safe
as $$
  select ((p_cents * public.bps(p_rate)) + 5000) / 10000;
$$;

create or replace function public.round2(p_x numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select round(p_x, 2);
$$;

create or replace function public.clamp_num(p_x numeric, p_lo numeric, p_hi numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select least(p_hi, greatest(p_lo, p_x));
$$;

-- ===========================================================================
-- B. Funding, take rate, fee reserve, all-in price, Reserved Slot arithmetic   (FORMULAS 1, 2)
-- ===========================================================================
-- Card processing passed through at cost: round(2.9% x amount) + $0.30.
create or replace function public.card_processing(p_amount_cents bigint)
returns bigint
language sql
stable
as $$
  select case when p_amount_cents > 0
    then public.mul_rate(p_amount_cents, private.kn('fees.card_processing_rate')) + private.ki('fees.card_processing_fixed_cents')
    else 0 end;
$$;

-- Plan take rate. First bounty: waived (0). CPA-only and install-only bounties: flat 6%. Otherwise Free 12% / Pro 10% / Scale 8%.
create or replace function public.take_rate(p_plan public.plan, p_type public.bounty_type, p_first_bounty_waived boolean default false)
returns numeric
language sql
stable
as $$
  select case
    when p_first_bounty_waived then 0::numeric
    when p_type in ('cpa', 'install_only') then private.kn('fees.cpa_only_take_rate')
    else private.kn('plans.' || p_plan::text || '.take_rate')
  end;
$$;

-- Escrow funding for a budget (the creator-pay pool).
--   fee_reserve = round(budget x take_rate); escrow_total = budget + fee_reserve (the Funded badge needs escrow >= this);
--   brand_funded = escrow_total - matched; card_charge = brand_funded + processing(brand_funded).
create or replace function public.funding(p_budget_cents bigint, p_take_rate numeric, p_matched_cents bigint default 0)
returns table (
  budget_cents bigint, take_rate numeric, fee_reserve_cents bigint, escrow_total_cents bigint, matched_cents bigint,
  brand_funded_cents bigint, processing_cents bigint, card_charge_cents bigint
)
language plpgsql
stable
as $$
declare
  v_fee bigint := public.mul_rate(p_budget_cents, p_take_rate);
  v_escrow bigint := p_budget_cents + public.mul_rate(p_budget_cents, p_take_rate);
  v_brand bigint := p_budget_cents + public.mul_rate(p_budget_cents, p_take_rate) - p_matched_cents;
  v_proc bigint := public.card_processing(p_budget_cents + public.mul_rate(p_budget_cents, p_take_rate) - p_matched_cents);
begin
  return query select p_budget_cents, p_take_rate, v_fee, v_escrow, p_matched_cents, v_brand, v_proc, v_brand + v_proc;
end
$$;

-- First bounty: flowd matches dollar for dollar up to $500 on top of what the brand funds, and the fee is waived.
create or replace function public.first_bounty_funding(p_brand_funds_cents bigint)
returns table (
  budget_cents bigint, take_rate numeric, fee_reserve_cents bigint, escrow_total_cents bigint, matched_cents bigint,
  brand_funded_cents bigint, processing_cents bigint, card_charge_cents bigint
)
language plpgsql
stable
as $$
declare
  v_matched bigint := least(private.ki('fees.matched_first_bounty_cap_cents'), p_brand_funds_cents);
begin
  return query select * from public.funding(p_brand_funds_cents + v_matched, 0::numeric, v_matched);
end
$$;

-- The brand's all-in effective CPM: round(card_charge x cpm / budget). 0 when the bounty has no CPM.
create or replace function public.all_in_cpm(p_cpm_cents bigint, p_budget_cents bigint, p_card_charge_cents bigint)
returns bigint
language sql
immutable
parallel safe
as $$
  select case when p_cpm_cents > 0 and p_budget_cents > 0
    then round((p_card_charge_cents * p_cpm_cents)::numeric / p_budget_cents)::bigint else 0 end;
$$;

-- All-in price of a flat rate or a CPA event: rate x (1 + take rate) x (1 + 2.9%).
create or replace function public.all_in_rate(p_rate_cents bigint, p_take_rate numeric)
returns bigint
language sql
stable
as $$
  select round((p_rate_cents::numeric * (10000 + public.bps(p_take_rate)) * (10000 + public.bps(private.kn('fees.card_processing_rate')))) / 100000000)::bigint;
$$;

-- Reserved Slot: one reservation unit = per-video cap + the fee on it.
create or replace function public.reservation_unit(p_per_video_cap_cents bigint, p_take_rate numeric)
returns bigint
language sql
immutable
parallel safe
as $$
  select p_per_video_cap_cents + public.mul_rate(p_per_video_cap_cents, p_take_rate);
$$;

create or replace function public.spots_left(p_remaining_cents bigint, p_per_video_cap_cents bigint, p_take_rate numeric)
returns bigint
language sql
immutable
parallel safe
as $$
  select case when public.reservation_unit(p_per_video_cap_cents, p_take_rate) > 0
    then p_remaining_cents / public.reservation_unit(p_per_video_cap_cents, p_take_rate) else 0 end;
$$;

-- Stacked pay of one post with the per-video cap: CPM leg first, then CPA legs, both inside the cap; the fee is rounded per leg.
create or replace function public.settle_post_math(
  p_window_views bigint, p_cpm_cents bigint,
  p_installs bigint default 0, p_trials bigint default 0, p_paid bigint default 0,
  p_rate_install bigint default 0, p_rate_trial bigint default 0, p_rate_paid bigint default 0,
  p_per_video_cap_cents bigint default 25000, p_take_rate numeric default 0.10, p_already_paid_cents bigint default 0
)
returns table (
  cpm_uncapped_cents bigint, cpa_uncapped_cents bigint, cpm_pay_cents bigint, cpa_pay_cents bigint, pay_cents bigint, capped boolean,
  cap_remaining_cents bigint, fee_cpm_cents bigint, fee_cpa_cents bigint, fee_cents bigint, brand_cost_cents bigint
)
language plpgsql
stable
as $$
declare
  v_cap_left bigint := greatest(0, p_per_video_cap_cents - p_already_paid_cents);
  v_cpm_unc bigint := ((p_window_views * p_cpm_cents) + 500) / 1000;
  v_cpa_unc bigint := p_installs * p_rate_install + p_trials * p_rate_trial + p_paid * p_rate_paid;
  v_cpm_pay bigint;
  v_cpa_pay bigint;
  v_fee_cpm bigint;
  v_fee_cpa bigint;
begin
  v_cpm_pay := least(v_cpm_unc, v_cap_left);
  v_cpa_pay := least(v_cpa_unc, v_cap_left - v_cpm_pay);
  v_fee_cpm := public.mul_rate(v_cpm_pay, p_take_rate);
  v_fee_cpa := public.mul_rate(v_cpa_pay, p_take_rate);
  return query select
    v_cpm_unc, v_cpa_unc, v_cpm_pay, v_cpa_pay, v_cpm_pay + v_cpa_pay, (v_cpm_unc + v_cpa_unc > v_cap_left),
    v_cap_left - (v_cpm_pay + v_cpa_pay), v_fee_cpm, v_fee_cpa, v_fee_cpm + v_fee_cpa, v_cpm_pay + v_cpa_pay + v_fee_cpm + v_fee_cpa;
end
$$;

-- Ad commission (10% of ad-attributed revenue inside the 60-day window) and the winner-promotion platform fee (1% of spend).
create or replace function public.ad_commission(p_revenue_in_window_cents bigint, p_rate numeric default null)
returns bigint
language sql
stable
as $$
  select public.mul_rate(p_revenue_in_window_cents, coalesce(p_rate, private.kn('pay.ad_commission_rate')));
$$;

create or replace function public.ad_platform_fee(p_spend_cents bigint)
returns bigint
language sql
stable
as $$
  select public.mul_rate(p_spend_cents, private.kn('fees.ad_spend_fee_rate'));
$$;

-- ===========================================================================
-- C. Instant payout fee   (FORMULAS 4)
-- ===========================================================================
-- fee = clamp(round(1.5% x amount), $0.50, $15). Minimum $5. Free: Platinum and Elite (unlimited), Gold once per ISO week, Founding
-- creators for 12 months. Weekly payouts are always free.
create or replace function public.instant_payout_math(
  p_amount_cents bigint, p_tier public.tier, p_founding_free boolean default false, p_free_used_this_week integer default 0
)
returns table (ok boolean, reason text, fee_cents bigint, net_cents bigint, free_instant boolean, list_fee_cents bigint)
language plpgsql
stable
as $$
declare
  v_raw bigint;
  v_free boolean;
  v_fee bigint;
begin
  if p_amount_cents < private.ki('fees.instant_min_amount_cents') then
    return query select false, 'below_minimum'::text, 0::bigint, 0::bigint, false, 0::bigint;
    return;
  end if;
  v_free := p_founding_free
    or private.kt('tiers.perks.' || p_tier::text || '.instant_cashout_unlimited')::boolean
    or p_free_used_this_week < private.ki('tiers.perks.' || p_tier::text || '.instant_cashout_free_per_week');
  v_raw := least(
    private.ki('fees.instant_payout_max_cents'),
    greatest(private.ki('fees.instant_payout_min_cents'), public.mul_rate(p_amount_cents, private.kn('fees.instant_payout_rate')))
  );
  v_fee := case when v_free then 0 else v_raw end;
  return query select true, null::text, v_fee, p_amount_cents - v_fee, v_free, v_raw;
end
$$;

-- ===========================================================================
-- D. Tiers   (FORMULAS 8)
-- ===========================================================================
create or replace function public.meets_tier(
  p_tier public.tier, p_lifetime_cleared_cents bigint, p_approved_count integer, p_approval_rate numeric, p_reliability_score integer,
  p_elite_reviewed boolean default false
)
returns boolean
language sql
stable
as $$
  select p_lifetime_cleared_cents >= private.ki('tiers.thresholds.' || p_tier::text || '.lifetime_cleared_cents')
     and p_approved_count >= private.ki('tiers.thresholds.' || p_tier::text || '.approved_count')
     and p_approval_rate >= private.kn('tiers.thresholds.' || p_tier::text || '.approval_rate_min')
     and p_reliability_score >= private.ki('tiers.thresholds.' || p_tier::text || '.reliability_min')
     and (not (private.kt('tiers.thresholds.' || p_tier::text || '.manual_review'))::boolean or coalesce(p_elite_reviewed, false));
$$;

-- The highest tier whose thresholds are all met. Elite additionally needs a manual review (p_elite_reviewed).
create or replace function public.tier_for(
  p_lifetime_cleared_cents bigint, p_approved_count integer, p_approval_rate numeric, p_reliability_score integer, p_elite_reviewed boolean default false
)
returns public.tier
language plpgsql
stable
as $$
declare
  v_best public.tier := 'bronze';
  v_t public.tier;
begin
  foreach v_t in array enum_range(null::public.tier) loop
    if public.meets_tier(v_t, p_lifetime_cleared_cents, p_approved_count, p_approval_rate, p_reliability_score, p_elite_reviewed) then
      v_best := v_t;
    end if;
  end loop;
  return v_best;
end
$$;

-- Progress to the next tier: every criterion with have / need; progress = the bottleneck (min of have/need over the numeric criteria).
create or replace function public.tier_progress(
  p_lifetime_cleared_cents bigint, p_approved_count integer, p_approval_rate numeric, p_reliability_score integer,
  p_elite_reviewed boolean default false, p_current public.tier default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_current public.tier := coalesce(p_current, public.tier_for(p_lifetime_cleared_cents, p_approved_count, p_approval_rate, p_reliability_score, p_elite_reviewed));
  v_next public.tier := (enum_range(v_current, null))[2];
  v_t text;
  v_need_lc bigint;
  v_need_ap integer;
  v_need_ar numeric;
  v_need_rel integer;
  v_review boolean;
  v_crit jsonb;
  v_progress numeric;
begin
  if v_next is null then
    return jsonb_build_object('current', v_current, 'criteria', '[]'::jsonb, 'progress', 1);
  end if;
  v_t := v_next::text;
  v_need_lc := private.ki('tiers.thresholds.' || v_t || '.lifetime_cleared_cents');
  v_need_ap := private.ki('tiers.thresholds.' || v_t || '.approved_count');
  v_need_ar := private.kn('tiers.thresholds.' || v_t || '.approval_rate_min');
  v_need_rel := private.ki('tiers.thresholds.' || v_t || '.reliability_min');
  v_review := (private.kt('tiers.thresholds.' || v_t || '.manual_review'))::boolean;
  v_progress := public.clamp_num(p_lifetime_cleared_cents::numeric / v_need_lc, 0, 1);
  v_progress := least(v_progress, public.clamp_num(p_approved_count::numeric / v_need_ap, 0, 1));
  v_progress := least(v_progress, public.clamp_num(p_approval_rate / v_need_ar, 0, 1));
  v_crit := jsonb_build_array(
    jsonb_build_object('key', 'lifetime_cleared', 'label', 'Lifetime cleared', 'have', p_lifetime_cleared_cents, 'need', v_need_lc, 'met', p_lifetime_cleared_cents >= v_need_lc),
    jsonb_build_object('key', 'approved', 'label', 'Approved posts', 'have', p_approved_count, 'need', v_need_ap, 'met', p_approved_count >= v_need_ap),
    jsonb_build_object('key', 'approval_rate', 'label', 'Approval rate', 'have', p_approval_rate, 'need', v_need_ar, 'met', p_approval_rate >= v_need_ar)
  );
  if v_need_rel > 0 then
    v_crit := v_crit || jsonb_build_array(jsonb_build_object('key', 'reliability', 'label', 'Reliability', 'have', p_reliability_score, 'need', v_need_rel, 'met', p_reliability_score >= v_need_rel));
    v_progress := least(v_progress, public.clamp_num(p_reliability_score::numeric / v_need_rel, 0, 1));
  end if;
  if v_review then
    v_crit := v_crit || jsonb_build_array(jsonb_build_object('key', 'review', 'label', 'Manual review', 'have', case when coalesce(p_elite_reviewed, false) then 1 else 0 end, 'need', 1, 'met', coalesce(p_elite_reviewed, false)));
  end if;
  return jsonb_build_object('current', v_current, 'next', v_next, 'criteria', v_crit, 'progress', public.round2(v_progress));
end
$$;

-- Progress of one creator toward the next tier (the caller must be the creator or an admin; the service role may read anyone).
create or replace function public.tier_progress(p_creator_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
begin
  if not private.caller_is_service() and p_creator_id is distinct from private.current_creator_id() and not private.is_admin() then
    raise exception 'forbidden' using errcode = 'FD017';
  end if;
  select * into c from public.creators where id = p_creator_id;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  return public.tier_progress(c.lifetime_cleared_cents, c.approved_count, c.approval_rate, c.reliability_score, c.tier_review is not null, c.tier);
end
$$;

-- ===========================================================================
-- E. Fraud score composition and what a band does to money   (FORMULAS 7)
-- ===========================================================================
create or replace function public.fraud_band_for(p_score integer)
returns public.fraud_band
language sql
stable
as $$
  select case
    when p_score <= (private.kj('fraud.bands.clean') ->> 1)::integer then 'clean'::public.fraud_band
    when p_score <= (private.kj('fraud.bands.watch') ->> 1)::integer then 'watch'::public.fraud_band
    when p_score <= (private.kj('fraud.bands.review') ->> 1)::integer then 'review'::public.fraud_band
    else 'high'::public.fraud_band
  end;
$$;

-- fraud score = min(100, sum over signals of round(max_points x severity)).
-- p_signals: [{ "signal": "view_spike_no_engagement", "severity": 0.8, "detail": "optional" }, ...]
create or replace function public.fraud_score(p_signals jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_hits jsonb;
  v_score integer;
begin
  select coalesce(jsonb_agg(q.hit order by q.ord), '[]'::jsonb), coalesce(sum(q.pts), 0)::integer
    into v_hits, v_score
  from (
    select e.ord,
           p.pts,
           jsonb_build_object(
             'signal', e.s ->> 'signal',
             'severity', (e.s ->> 'severity')::numeric,
             'points', p.pts,
             'detail', coalesce(e.s ->> 'detail', private.kt('fraud.signals.' || (e.s ->> 'signal') || '.rule'))
           ) as hit
    from jsonb_array_elements(p_signals) with ordinality as e(s, ord)
    cross join lateral (
      select round(private.ki('fraud.signals.' || (e.s ->> 'signal') || '.max_points') * (e.s ->> 'severity')::numeric)::integer as pts
    ) p
    where p.pts > 0
  ) q;
  v_score := least(100, v_score);
  return jsonb_build_object('score', v_score, 'band', public.fraud_band_for(v_score), 'signals', v_hits);
end
$$;

create or replace function public.fraud_action(p_score integer)
returns text
language sql
stable
as $$
  select case
    when p_score >= private.ki('fraud.hold_threshold') then 'auto_hold_and_queue'
    when p_score >= private.ki('fraud.review_threshold') then 'hold_for_human_review'
    else 'auto_clear'
  end;
$$;

-- Hamming distance of two 16-hex perceptual hashes (duplicate detection: a distance of 6 or less is a duplicate).
create or replace function public.phash_distance(p_a text, p_b text)
returns integer
language sql
immutable
parallel safe
as $$
  select bit_count(('x' || p_a)::bit(64) # ('x' || p_b)::bit(64))::integer;
$$;

-- ===========================================================================
-- F. Time: clearing runs, Money Clock, review SLA   (FORMULAS 10, 11)
-- ===========================================================================
-- First daily clearing run (14:00:00Z) at or after p_ts.
create or replace function public.first_run_at_or_after(p_ts timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_base timestamptz := (date_trunc('day', p_ts at time zone 'UTC') + make_interval(hours => private.ki('windows.clearing_run_hour_utc')::integer)) at time zone 'UTC';
begin
  return case when v_base >= p_ts then v_base else v_base + interval '24 hours' end;
end
$$;

create or replace function public.post_clearing_run(p_window_ends_at timestamptz)
returns timestamptz
language sql
stable
as $$
  select public.first_run_at_or_after(p_window_ends_at + make_interval(hours => private.ki('windows.clearing_buffer_hours')::integer));
$$;

create or replace function public.conversion_clearing_run(p_kind public.conversion_kind, p_occurred_at timestamptz)
returns timestamptz
language sql
stable
as $$
  select public.first_run_at_or_after(p_occurred_at + make_interval(hours => private.ki('windows.cpa_clear_hours.' || p_kind::text)::integer));
$$;

-- First time strictly after p_after that is p_weekday (0 = Sunday) at p_hour:00:00Z.
create or replace function public.next_weekly_at(p_after timestamptz, p_weekday integer, p_hour integer)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_t timestamptz := (date_trunc('day', p_after at time zone 'UTC') + make_interval(hours => p_hour)) at time zone 'UTC';
begin
  if not (v_t > p_after) then
    v_t := v_t + interval '24 hours';
  end if;
  while extract(dow from v_t at time zone 'UTC') <> p_weekday loop
    v_t := v_t + interval '24 hours';
  end loop;
  return v_t;
end
$$;

-- The weekly payout run (Friday 18:00Z) that pays an item cleared at p_cleared_at.
create or replace function public.weekly_payout_for(p_cleared_at timestamptz)
returns timestamptz
language sql
stable
as $$
  select public.next_weekly_at(p_cleared_at - interval '1 second', private.ki('windows.weekly_payout_weekday_utc')::integer, private.ki('windows.weekly_payout_hour_utc')::integer);
$$;

-- Money Clock state of a post's CPM earnings at p_now.
create or replace function public.money_clock_state_for(p_posted_at timestamptz, p_now timestamptz, p_held boolean default false)
returns table (state public.money_clock_state, reason public.money_clock_reason, eta_at timestamptz, cleared_at timestamptz, window_ends_at timestamptz)
language plpgsql
stable
as $$
declare
  v_window timestamptz := p_posted_at + make_interval(hours => private.ki('windows.view_window_hours')::integer);
  v_run timestamptz;
  v_deadline timestamptz;
begin
  v_run := public.post_clearing_run(v_window);
  if p_now < v_window then
    return query select 'accruing'::public.money_clock_state, 'window_open'::public.money_clock_reason, v_run, null::timestamptz, v_window;
  elsif p_held then
    return query select 'held'::public.money_clock_state, 'held_fraud_review'::public.money_clock_reason, null::timestamptz, null::timestamptz, v_window;
  elsif v_run <= p_now then
    return query select 'cleared'::public.money_clock_state, 'awaiting_weekly_payout'::public.money_clock_reason, public.weekly_payout_for(v_run), v_run, v_window;
  else
    v_deadline := v_window + make_interval(hours => private.ki('windows.fraud_check_max_hours')::integer);
    return query select 'pending'::public.money_clock_state,
      (case when p_now < v_deadline then 'fraud_check' else 'awaiting_clearing_run' end)::public.money_clock_reason, v_run, null::timestamptz, v_window;
  end if;
end
$$;

-- Review SLA: position in the 72 h clock by hours since the current version entered review.
create or replace function public.sla_state_for(p_hours numeric, p_decided boolean default false)
returns public.sla_state
language sql
stable
as $$
  select case
    when p_decided then (case when p_hours <= private.ki('review.sla_hours') then 'met' else 'breached' end)::public.sla_state
    when p_hours < private.ki('review.stale_after_hours') then 'on_track'::public.sla_state
    when p_hours <= private.ki('review.sla_hours') then 'stale'::public.sla_state
    else 'breached'::public.sla_state
  end;
$$;

-- "Sat 2:00 PM UTC" for Money Clock copy.
create or replace function private.fmt_eta(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_ts at time zone 'UTC', 'Dy FMHH12:MI AM') || ' UTC';
$$;

-- ===========================================================================
-- G. Pricing: price vs fill time, and the creator match score   (FORMULAS 12, 13)
-- ===========================================================================
-- p50 = max(6, H x (clearing / cpm)^1.6); p80 = p50 x 1.8; confidence = n / (n + 20) x (1 - min(0.5, |ln(cpm / clearing)|)).
create or replace function public.fill_time(p_cpm_cents numeric, p_clearing_cpm_cents numeric, p_median_fill_hours numeric, p_sample_n integer)
returns table (fill_hours_p50 numeric, fill_hours_p80 numeric, confidence numeric, thin_market boolean)
language plpgsql
stable
as $$
declare
  v_p50 numeric := greatest(private.kn('pricing_model.min_fill_hours'), p_median_fill_hours * power(p_clearing_cpm_cents / p_cpm_cents, private.kn('pricing_model.fill_exponent')));
  v_distance numeric := least(0.5, abs(ln(p_cpm_cents / p_clearing_cpm_cents)));
begin
  return query select
    public.round2(v_p50),
    public.round2(v_p50 * private.kn('pricing_model.p80_multiplier')),
    public.round2((p_sample_n::numeric / (p_sample_n + private.kn('pricing_model.confidence_k'))) * (1 - v_distance)),
    p_sample_n < private.ki('pricing_model.thin_market_min_sample');
end
$$;

-- The price-vs-fill curve: six CPM points at 0.6x .. 2.0x of the clearing CPM.
create or replace function public.price_curve(p_clearing_cpm_cents numeric, p_median_fill_hours numeric, p_sample_n integer)
returns jsonb
language plpgsql
stable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_mult jsonb;
  v_cpm numeric;
  f record;
begin
  for v_mult in select * from jsonb_array_elements(private.kj('pricing_model.curve_cpm_multipliers')) loop
    v_cpm := round(p_clearing_cpm_cents * (v_mult #>> '{}')::numeric);
    select * into f from public.fill_time(v_cpm, p_clearing_cpm_cents, p_median_fill_hours, p_sample_n);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'cpm_cents', v_cpm, 'fill_hours_p50', f.fill_hours_p50, 'fill_hours_p80', f.fill_hours_p80, 'confidence', f.confidence, 'sample_n', p_sample_n));
  end loop;
  return v_out;
end
$$;

-- Match score 0..100 = niche 40 + platform 15 + region 15 + price 15 + brand reliability 10 + recency 5. Null when a gate fails.
create or replace function public.match_score(
  p_gates_pass boolean, p_niche_overlap numeric, p_platform_fit numeric, p_region_fit numeric, p_price_ratio numeric,
  p_brand_reliability numeric, p_bounty_age_days numeric
)
returns integer
language sql
stable
as $$
  select case when not p_gates_pass then null else round(
      private.kn('matching.weights.niche') * p_niche_overlap
    + private.kn('matching.weights.platform') * p_platform_fit
    + private.kn('matching.weights.region') * p_region_fit
    + private.kn('matching.weights.price') * (public.clamp_num(p_price_ratio, 0, private.kn('matching.price_ratio_cap')) / private.kn('matching.price_ratio_cap'))
    + private.kn('matching.weights.brand_reliability') * public.clamp_num(p_brand_reliability / 100, 0, 1)
    + private.kn('matching.weights.recency') * power(0.5, p_bounty_age_days / private.kn('matching.recency_half_life_days'))
  )::integer end;
$$;


-- ===========================================================================
-- H. Reliability: creator and brand   (FORMULAS 9)
-- ===========================================================================
-- Creator reliability 0..100 from finished work only (never penalises multi-brand work or pending samples). Pure.
--   p_decisions: [{ "approved": true, "decided_at": "2026-09-30T10:00:00Z" }, ...]  (approved + rejected; withdrawn and expired excluded)
-- Recency half-life 45 days. Fewer than 5 finished decisions: provisional (70).
create or replace function public.creator_reliability_calc(
  p_decisions jsonb, p_now timestamptz,
  p_on_time_ok integer, p_on_time_total integer,
  p_posted integer, p_approved_for_post integer,
  p_compliance_passed integer, p_compliance_total integer,
  p_fraud_confirmed_90d integer, p_clawbacks_90d integer, p_disputes_lost_90d integer,
  p_academy_lessons integer
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_half numeric := private.kn('reliability.creator.recency_half_life_days');
  w_fin numeric := private.kn('reliability.creator.weights.finished_approval');
  w_on numeric := private.kn('reliability.creator.weights.on_time');
  w_post numeric := private.kn('reliability.creator.weights.post_through');
  w_comp numeric := private.kn('reliability.creator.weights.compliance');
  w_clean numeric := private.kn('reliability.creator.weights.clean_record');
  v_sum_w numeric;
  v_app_w numeric;
  v_n integer;
  v_approved_n integer;
  v_fin numeric;
  v_on numeric;
  v_post numeric;
  v_comp numeric;
  v_clean numeric;
  v_base numeric;
  v_bonus numeric;
  v_prov boolean;
  v_score integer;
  v_days integer := private.ki('reliability.creator.post_through_days');
begin
  select coalesce(sum(x.w), 0), coalesce(sum(x.w) filter (where x.approved), 0), count(*)::integer, (count(*) filter (where x.approved))::integer
    into v_sum_w, v_app_w, v_n, v_approved_n
  from (
    select (d ->> 'approved')::boolean as approved,
           power(0.5, extract(epoch from (p_now - (d ->> 'decided_at')::timestamptz)) / 86400 / v_half) as w
    from jsonb_array_elements(p_decisions) d
  ) x;
  v_fin := case when v_sum_w > 0 then v_app_w / v_sum_w else 0 end;
  v_on := case when p_on_time_total > 0 then p_on_time_ok::numeric / p_on_time_total else 1 end;
  v_post := case when p_approved_for_post > 0 then p_posted::numeric / p_approved_for_post else 1 end;
  v_comp := case when p_compliance_total > 0 then p_compliance_passed::numeric / p_compliance_total else 1 end;
  v_clean := public.clamp_num(1 - 0.4 * p_fraud_confirmed_90d - 0.3 * p_clawbacks_90d - 0.15 * p_disputes_lost_90d, 0, 1);
  v_base := 100 * w_fin * v_fin + 100 * w_on * v_on + 100 * w_post * v_post + 100 * w_comp * v_comp + 100 * w_clean * v_clean;
  v_bonus := least(private.kn('reliability.creator.academy_bonus_cap'), private.kn('reliability.creator.academy_bonus_per_lesson') * p_academy_lessons);
  v_prov := v_n < private.ki('reliability.creator.min_finished_for_score');
  v_score := case when v_prov then private.ki('reliability.creator.provisional_score')::integer else least(100, round(v_base + v_bonus))::integer end;
  return jsonb_build_object(
    'score', v_score,
    'provisional', v_prov,
    'finished_n', v_n,
    'academy_bonus_points', v_bonus,
    'approval_rate_finished', public.round2(v_fin),
    'approval_rate_raw', public.round2(v_approved_n::numeric / greatest(1, v_n)),
    'on_time_ratio', public.round2(v_on),
    'post_through_ratio', public.round2(v_post),
    'compliance_ratio', public.round2(v_comp),
    'clean_record_ratio', public.round2(v_clean),
    'components', jsonb_build_array(
      jsonb_build_object('key', 'finished_approval', 'label', 'Finished-work approval (recency-weighted)', 'value', public.round2(v_fin), 'weight', w_fin, 'points', public.round2(100 * w_fin * v_fin),
        'reason', format('%s%% of %s finished posts approved, recent ones count more.', round(v_fin * 100), v_n)),
      jsonb_build_object('key', 'on_time', 'label', 'Revisions and deadlines on time', 'value', public.round2(v_on), 'weight', w_on, 'points', public.round2(100 * w_on * v_on),
        'reason', format('%s of %s on time.', p_on_time_ok, p_on_time_total)),
      jsonb_build_object('key', 'post_through', 'label', 'Approved videos posted within 7 days', 'value', public.round2(v_post), 'weight', w_post, 'points', public.round2(100 * w_post * v_post),
        'reason', format('%s of %s approved videos posted within %s days.', p_posted, p_approved_for_post, v_days)),
      jsonb_build_object('key', 'compliance', 'label', 'Disclosure right first time', 'value', public.round2(v_comp), 'weight', w_comp, 'points', public.round2(100 * w_comp * v_comp),
        'reason', format('%s of %s posts passed the disclosure check first time.', p_compliance_passed, p_compliance_total)),
      jsonb_build_object('key', 'clean_record', 'label', 'Clean record (90 days)', 'value', public.round2(v_clean), 'weight', w_clean, 'points', public.round2(100 * w_clean * v_clean),
        'reason', format('%s confirmed fraud, %s clawbacks, %s lost disputes.', p_fraud_confirmed_90d, p_clawbacks_90d, p_disputes_lost_90d))
    )
  );
end
$$;

-- Gather one creator's inputs from the tables and score them. Callable by the creator, an admin or the service role.
create or replace function public.creator_reliability(p_creator_id text, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decisions jsonb;
  v_on_ok integer;
  v_on_total integer;
  v_posted integer;
  v_approved integer;
  v_comp_pass integer;
  v_comp_total integer;
  v_fraud integer;
  v_claw integer;
  v_lost integer;
  v_lessons integer;
  v_resubmit_hours integer := private.ki('reliability.creator.on_time_resubmit_hours');
  v_post_days integer := private.ki('reliability.creator.post_through_days');
begin
  if not private.caller_is_service() and p_creator_id is distinct from private.current_creator_id() and not private.is_admin() then
    raise exception 'forbidden' using errcode = 'FD017';
  end if;
  if not exists (select 1 from public.creators c where c.id = p_creator_id) then
    raise exception 'not_found' using errcode = 'FD021';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'approved', (s.decision ->> 'action') in ('approve', 'auto_approve', 'timeout_approve', 'appeal_overturn'),
           'decided_at', s.decision ->> 'decided_at')), '[]'::jsonb)
    into v_decisions
  from public.submissions s
  where s.creator_id = p_creator_id
    and s.decision is not null
    and (s.decision ->> 'action') in ('approve', 'auto_approve', 'timeout_approve', 'appeal_overturn', 'reject', 'auto_reject', 'appeal_uphold')
    and s.status not in ('withdrawn', 'expired');

  -- on time: a resubmission within 48 h of the changes being requested (the first note on the previous version marks the request)
  select (count(*) filter (where q.asked_at is not null))::integer,
         (count(*) filter (where q.asked_at is not null and q.submitted_at - q.asked_at <= make_interval(hours => v_resubmit_hours)))::integer
    into v_on_total, v_on_ok
  from (
    select v.submitted_at,
           (select min(n.created_at) from public.feedback_notes n where n.submission_id = v.submission_id and n.version = v.version - 1) as asked_at
    from public.submission_versions v
    join public.submissions s on s.id = v.submission_id
    where s.creator_id = p_creator_id and v.version >= 2
  ) q;

  -- post-through: approved videos posted within 7 days (only those old enough to judge, or already posted)
  select (count(*) filter (where s.approved_at is not null and (s.approved_at <= p_now - make_interval(days => v_post_days) or s.posted_at is not null)))::integer,
         (count(*) filter (where s.approved_at is not null and s.posted_at is not null and s.posted_at <= s.approved_at + make_interval(days => v_post_days)))::integer
    into v_approved, v_posted
  from public.submissions s
  where s.creator_id = p_creator_id;

  select count(*)::integer, (count(*) filter (where c.overall in ('pass', 'warn')))::integer
    into v_comp_total, v_comp_pass
  from public.compliance_checks c
  where c.creator_id = p_creator_id;

  select count(*)::integer into v_fraud
  from public.fraud_flags f
  where f.creator_id = p_creator_id and f.status = 'confirmed' and f.reviewed_at >= p_now - interval '90 days';

  select count(distinct l.txn_id)::integer into v_claw
  from public.ledger l
  where l.creator_id = p_creator_id and l.account_kind = 'creator' and l.entry_type = 'clawback' and l.posted_at >= p_now - interval '90 days';

  select count(*)::integer into v_lost
  from public.disputes d
  where d.creator_id = p_creator_id and d.opened_by = 'creator' and d.outcome = 'rejected' and d.resolved_at >= p_now - interval '90 days';

  select count(*)::integer into v_lessons
  from public.lesson_progress lp
  where lp.creator_id = p_creator_id and lp.status = 'completed';

  return public.creator_reliability_calc(v_decisions, p_now, v_on_ok, v_on_total, v_posted, v_approved, v_comp_pass, v_comp_total, v_fraud, v_claw, v_lost, v_lessons)
    || jsonb_build_object('fraud_flags_90d', v_fraud, 'clawbacks_90d', v_claw, 'disputes_lost_90d', v_lost);
end
$$;

-- Brand reliability 0..100 (the Brand Scorecard). Pure.
-- decisions = approve + reject (request-changes excluded). Fewer than 10 decisions: band "new".
create or replace function public.brand_reliability_calc(
  p_decisions_n integer, p_approved_n integer, p_decision_hours_median numeric, p_appeals_overturned integer,
  p_pays_on_time_ratio numeric, p_run_rate numeric, p_reply_hours_median numeric
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rejected integer := p_decisions_n - p_approved_n;
  v_rej_rate numeric := case when p_decisions_n > 0 then (p_decisions_n - p_approved_n)::numeric / p_decisions_n else 0 end;
  v_best numeric := private.kn('reliability.brand.decision_best_hours');
  v_worst numeric := private.kn('reliability.brand.decision_worst_hours');
  v_decision_speed numeric;
  v_base numeric;
  v_overturn numeric;
  v_fair numeric;
  v_reply numeric;
  w_ds numeric := private.kn('reliability.brand.weights.decision_speed');
  w_af numeric := private.kn('reliability.brand.weights.approval_fairness');
  w_pt numeric := private.kn('reliability.brand.weights.pays_on_time');
  w_rr numeric := private.kn('reliability.brand.weights.run_rate');
  w_rs numeric := private.kn('reliability.brand.weights.reply_speed');
  v_score integer;
  v_band public.brand_band;
begin
  v_decision_speed := public.clamp_num((v_worst - p_decision_hours_median) / (v_worst - v_best), 0, 1);
  v_base := public.clamp_num(1 - (v_rej_rate - private.kn('reliability.brand.rejection_rate_free_pass')) / (private.kn('reliability.brand.rejection_rate_zero_at') - private.kn('reliability.brand.rejection_rate_free_pass')), 0, 1);
  v_overturn := p_appeals_overturned::numeric / greatest(1, v_rejected);
  v_fair := public.clamp_num(v_base - 0.5 * v_overturn, 0, 1);
  v_reply := public.clamp_num((private.kn('reliability.brand.reply_worst_hours') - p_reply_hours_median) / (private.kn('reliability.brand.reply_worst_hours') - private.kn('reliability.brand.reply_best_hours')), 0, 1);
  v_score := round(100 * w_ds * v_decision_speed + 100 * w_af * v_fair + 100 * w_pt * p_pays_on_time_ratio + 100 * w_rr * p_run_rate + 100 * w_rs * v_reply)::integer;
  v_band := (case
    when p_decisions_n < private.ki('reliability.brand.min_decisions_for_score') then 'new'
    when v_score >= private.ki('reliability.brand.bands.excellent') then 'excellent'
    when v_score >= private.ki('reliability.brand.bands.good') then 'good'
    when v_score >= private.ki('reliability.brand.bands.fair') then 'fair'
    else 'poor' end)::public.brand_band;
  return jsonb_build_object(
    'score', v_score, 'band', v_band, 'rejection_rate', public.round2(v_rej_rate),
    'components', jsonb_build_array(
      jsonb_build_object('key', 'decision_speed', 'label', 'Decision speed', 'value', public.round2(v_decision_speed), 'weight', w_ds, 'points', public.round2(100 * w_ds * v_decision_speed),
        'reason', format('Median %s h to decide (best %s h, worst %s h).', to_char(p_decision_hours_median, 'FM999990.0'), v_best, v_worst)),
      jsonb_build_object('key', 'approval_fairness', 'label', 'Approval fairness', 'value', public.round2(v_fair), 'weight', w_af, 'points', public.round2(100 * w_af * v_fair),
        'reason', format('%s%% of decisions were rejections; %s overturned on appeal.', round(v_rej_rate * 100), p_appeals_overturned)),
      jsonb_build_object('key', 'pays_on_time', 'label', 'Pays on time', 'value', public.round2(p_pays_on_time_ratio), 'weight', w_pt, 'points', public.round2(100 * w_pt * p_pays_on_time_ratio),
        'reason', format('%s%% of commissions, offers and top-ups funded on time.', round(p_pays_on_time_ratio * 100))),
      jsonb_build_object('key', 'run_rate', 'label', 'Runs what it approves', 'value', public.round2(p_run_rate), 'weight', w_rr, 'points', public.round2(100 * w_rr * p_run_rate),
        'reason', format('%s%% of approved work was posted or used within 30 days.', round(p_run_rate * 100))),
      jsonb_build_object('key', 'reply_speed', 'label', 'Reply speed', 'value', public.round2(v_reply), 'weight', w_rs, 'points', public.round2(100 * w_rs * v_reply),
        'reason', format('Median %s h to reply.', to_char(p_reply_hours_median, 'FM999990.0')))
    )
  );
end
$$;

create or replace function public.brand_badges(
  p_decision_hours_median numeric, p_funded_always boolean, p_pays_on_time_ratio numeric, p_appeals_n integer, p_appeals_overturned integer,
  p_run_rate numeric, p_decisions_n integer
)
returns public.brand_badge[]
language plpgsql
stable
as $$
declare
  v_out public.brand_badge[] := '{}';
begin
  if p_decisions_n >= private.ki('reliability.brand.min_decisions_for_score') then
    if p_decision_hours_median < 24 then v_out := v_out || 'fast_decisions'::public.brand_badge; end if;
    if p_appeals_n = 0 or p_appeals_overturned::numeric / p_appeals_n <= 0.1 then v_out := v_out || 'fair_reviews'::public.brand_badge; end if;
    if p_run_rate > 0.9 then v_out := v_out || 'runs_what_it_approves'::public.brand_badge; end if;
  end if;
  if p_funded_always then v_out := v_out || 'funded_always'::public.brand_badge; end if;
  if p_pays_on_time_ratio >= 0.98 then v_out := v_out || 'pays_on_time'::public.brand_badge; end if;
  return v_out;
end
$$;

-- Gather one brand's 90-day inputs and score them. Public data (the Scorecard is public), so anyone may call it.
create or replace function public.brand_reliability(p_brand_id text, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window interval := make_interval(days => 90);
  v_decisions integer;
  v_approved integer;
  v_median numeric;
  v_p90 numeric;
  v_overturned integer;
  v_appeals integer;
  v_breaches integer;
  v_pay_ratio numeric;
  v_run_rate numeric;
  v_reply numeric;
  v_funded_always boolean;
  v_pay_speed numeric;
  v_calc jsonb;
begin
  if not exists (select 1 from public.brands b where b.id = p_brand_id) then
    raise exception 'not_found' using errcode = 'FD021';
  end if;

  -- decisions in the window: approve + reject (request-changes excluded), hours from entering review to the decision
  select count(*)::integer,
         (count(*) filter (where q.approved))::integer,
         coalesce(percentile_cont(0.5) within group (order by q.hours), 0),
         coalesce(percentile_cont(0.9) within group (order by q.hours), 0),
         (count(*) filter (where q.action = 'appeal_overturn'))::integer,
         (count(*) filter (where q.hours > private.ki('review.sla_hours')))::integer
    into v_decisions, v_approved, v_median, v_p90, v_overturned, v_breaches
  from (
    select s.decision ->> 'action' as action,
           (s.decision ->> 'action') in ('approve', 'auto_approve', 'timeout_approve', 'appeal_overturn') as approved,
           extract(epoch from ((s.decision ->> 'decided_at')::timestamptz - coalesce(
             (select max(v.submitted_at) from public.submission_versions v where v.submission_id = s.id and v.submitted_at <= (s.decision ->> 'decided_at')::timestamptz),
             s.submitted_at))) / 3600 as hours
    from public.submissions s
    where s.brand_id = p_brand_id
      and s.decision is not null
      and (s.decision ->> 'action') in ('approve', 'auto_approve', 'timeout_approve', 'appeal_overturn', 'reject', 'auto_reject', 'appeal_uphold')
      and (s.decision ->> 'decided_at')::timestamptz >= p_now - v_window
  ) q;

  select count(*)::integer into v_appeals
  from public.disputes d
  where d.brand_id = p_brand_id and d.kind = 'rejection_appeal' and d.opened_at >= p_now - v_window;

  -- paid on time: invoices due in the window that were paid by their due date (no invoice due = benefit of the doubt)
  select coalesce((count(*) filter (where i.paid_at is not null and i.paid_at <= i.due_at))::numeric / nullif(count(*), 0), 1)
    into v_pay_ratio
  from public.invoices i
  where i.brand_id = p_brand_id and i.status in ('paid', 'open') and i.due_at <= p_now and i.due_at >= p_now - v_window;

  select coalesce((count(*) filter (where s.posted_at is not null and s.posted_at <= s.approved_at + interval '30 days'))::numeric / nullif(count(*), 0), 1)
    into v_run_rate
  from public.submissions s
  where s.brand_id = p_brand_id and s.approved_at is not null and s.approved_at <= p_now - interval '30 days' and s.approved_at >= p_now - v_window;

  -- reply time: hours from a creator message to the next brand message in the same thread
  select coalesce(percentile_cont(0.5) within group (order by r.hours), 0)
    into v_reply
  from (
    select extract(epoch from (
             (select min(b.sent_at) from public.chat_messages b where b.thread_id = m.thread_id and b.author_role = 'brand' and b.sent_at > m.sent_at) - m.sent_at)) / 3600 as hours
    from public.chat_messages m
    join public.threads t on t.id = m.thread_id
    where t.brand_id = p_brand_id and m.author_role = 'creator' and m.kind = 'text' and m.sent_at >= p_now - v_window
  ) r
  where r.hours is not null;

  -- median hours from a payment falling due to the invoice being paid (commissions, direct offers, top-ups)
  select coalesce(percentile_cont(0.5) within group (order by greatest(0, extract(epoch from (i.paid_at - i.issued_at)) / 3600)), 0)
    into v_pay_speed
  from public.invoices i
  where i.brand_id = p_brand_id and i.status = 'paid' and i.paid_at >= p_now - v_window;

  -- every live bounty is escrowed by construction (bounties_funded_status_chk); the badge needs at least one funded bounty
  select exists (select 1 from public.bounties b where b.brand_id = p_brand_id and b.funded) into v_funded_always;

  v_calc := public.brand_reliability_calc(v_decisions, v_approved, v_median, v_overturned, v_pay_ratio, v_run_rate, v_reply);
  return v_calc || jsonb_build_object(
    'decisions_n', v_decisions, 'approved_n', v_approved, 'decision_hours_median', public.round2(v_median), 'decision_hours_p90', public.round2(v_p90),
    'sla_breaches', v_breaches, 'appeals_n', v_appeals, 'appeals_overturned', v_overturned, 'pays_on_time_ratio', public.round2(v_pay_ratio),
    'run_rate', public.round2(v_run_rate), 'reply_hours_median', public.round2(v_reply), 'pay_speed_hours_median', public.round2(v_pay_speed),
    'funded_always', v_funded_always,
    'badges', to_jsonb(public.brand_badges(v_median, v_funded_always, v_pay_ratio, v_appeals, v_overturned, v_run_rate, v_decisions))
  );
end
$$;

-- ===========================================================================
-- I. Denormalised projections: creator stats and tier, creator reputation, brand scorecard, bounty counters
-- ===========================================================================
-- Tier with a 30-day grace after a dip (FORMULAS 8, tierWithGrace) and the tier history it implies.
create or replace function public.refresh_creator_tier(p_creator_id text)
returns public.tier
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  v_computed public.tier;
  v_stats jsonb;
begin
  select * into c from public.creators where id = p_creator_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  v_computed := public.tier_for(c.lifetime_cleared_cents, c.approved_count, c.approval_rate, c.reliability_score, c.tier_review is not null);
  v_stats := jsonb_build_object('lifetime_cleared_cents', c.lifetime_cleared_cents, 'approved_count', c.approved_count, 'approval_rate', c.approval_rate, 'reliability_score', c.reliability_score);
  if v_computed > c.tier then
    update public.creators set tier = v_computed, tier_basis = 'earned', tier_since = now(), tier_hold_until = null where id = c.id;
    insert into public.tier_history (id, creator_id, kind, from_tier, to_tier, basis, occurred_at, stats, note)
    values (public.new_id('tev'), c.id, 'promoted', c.tier, v_computed, 'earned', now(), v_stats, 'Thresholds met: promoted to ' || v_computed::text || '.');
    return v_computed;
  elsif v_computed = c.tier then
    if c.tier_basis = 'grace_hold' then
      update public.creators set tier_basis = 'earned', tier_hold_until = null where id = c.id;
      insert into public.tier_history (id, creator_id, kind, from_tier, to_tier, basis, occurred_at, stats, note)
      values (public.new_id('tev'), c.id, 'hold_cleared', c.tier, c.tier, 'earned', now(), v_stats, 'Back above the thresholds: the grace hold ended.');
    end if;
    return c.tier;
  else
    if c.tier_basis = 'grace_hold' and c.tier_hold_until is not null then
      if now() >= c.tier_hold_until then
        update public.creators set tier = v_computed, tier_basis = 'earned', tier_since = now(), tier_hold_until = null where id = c.id;
        insert into public.tier_history (id, creator_id, kind, from_tier, to_tier, basis, occurred_at, stats, note)
        values (public.new_id('tev'), c.id, 'demoted', c.tier, v_computed, 'earned', now(), v_stats, 'The 30-day grace hold ended below the thresholds.');
        return v_computed;
      end if;
      return c.tier;
    end if;
    update public.creators
      set tier_basis = 'grace_hold', tier_hold_until = now() + make_interval(days => private.ki('tiers.demotion_grace_days')::integer)
      where id = c.id;
    insert into public.tier_history (id, creator_id, kind, from_tier, to_tier, basis, occurred_at, stats, note)
    values (public.new_id('tev'), c.id, 'hold_started', c.tier, c.tier, 'grace_hold', now(), v_stats, 'Below the thresholds: tier held for 30 days.');
    return c.tier;
  end if;
end
$$;

-- Recompute a creator's denormalised counters from their rows, then their tier.
--   lifetime_cleared = carry_over.cleared + sum of the creator's cleared and paid earning rows (L-09)
--   approved_count / decided_count = carry-over + finished decisions; approval_rate = round(approved / decided, 2)
create or replace function public.refresh_creator_stats(p_creator_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  v_carry jsonb;
  v_ledger bigint;
  v_approved integer;
  v_decided integer;
  v_posts integer;
  v_live integer;
  v_rel integer;
  v_lifetime bigint;
  v_rate numeric;
begin
  select * into c from public.creators where id = p_creator_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  v_carry := coalesce(c.carry_over, '{}'::jsonb);
  select coalesce(sum(l.amount_cents), 0) into v_ledger
  from public.ledger l
  where l.creator_id = p_creator_id and l.account_kind = 'creator'
    and l.entry_type in ('cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral', 'clawback')
    and l.status in ('cleared', 'paid');
  v_lifetime := greatest(0, coalesce((v_carry ->> 'cleared_cents')::bigint, 0) + v_ledger);
  select (count(*) filter (where s.status in ('approved', 'posted', 'released')))::integer,
         (count(*) filter (where s.status in ('approved', 'posted', 'released', 'rejected')))::integer
    into v_approved, v_decided
  from public.submissions s
  where s.creator_id = p_creator_id;
  v_approved := v_approved + coalesce((v_carry ->> 'approved_count')::integer, 0);
  v_decided := v_decided + coalesce((v_carry ->> 'decided_count')::integer, 0);
  v_rate := case when v_decided = 0 then 0 else round(v_approved::numeric / v_decided, 2) end;
  select count(*)::integer, (count(*) filter (where p.status = 'live'))::integer into v_posts, v_live
  from public.posts p
  where p.creator_id = p_creator_id;
  v_rel := (public.creator_reliability(p_creator_id) ->> 'score')::integer;
  update public.creators
    set lifetime_cleared_cents = v_lifetime, approved_count = v_approved, decided_count = v_decided, approval_rate = v_rate,
        posts_count = v_posts, live_posts_count = v_live, reliability_score = v_rel,
        first_dollar_at = coalesce(first_dollar_at, case when v_lifetime > 0 then now() end)
    where id = p_creator_id;
  perform public.refresh_creator_tier(p_creator_id);
end
$$;

-- The creator's fair reputation row (finished work only, recency-weighted, shown with reasons).
create or replace function public.refresh_creator_reputation(p_creator_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  v_calc jsonb;
begin
  select * into c from public.creators where id = p_creator_id;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  v_calc := public.creator_reliability(p_creator_id);
  insert into public.creator_reputation (id, creator_id, as_of, provisional, reliability_score, approval_rate_finished, approval_rate_raw, on_time_ratio,
    post_through_ratio, compliance_ratio, clean_record_ratio, finished_n, fraud_flags_90d, clawbacks_90d, disputes_lost_90d, academy_bonus_points,
    components, reasons, tier_progress)
  values (
    'rep_' || substr(p_creator_id, 4), p_creator_id, now(), (v_calc ->> 'provisional')::boolean, (v_calc ->> 'score')::integer,
    (v_calc ->> 'approval_rate_finished')::numeric, (v_calc ->> 'approval_rate_raw')::numeric, (v_calc ->> 'on_time_ratio')::numeric,
    (v_calc ->> 'post_through_ratio')::numeric, (v_calc ->> 'compliance_ratio')::numeric, (v_calc ->> 'clean_record_ratio')::numeric,
    (v_calc ->> 'finished_n')::integer, (v_calc ->> 'fraud_flags_90d')::integer, (v_calc ->> 'clawbacks_90d')::integer,
    (v_calc ->> 'disputes_lost_90d')::integer, (v_calc ->> 'academy_bonus_points')::numeric, v_calc -> 'components',
    (select coalesce(array_agg(x ->> 'reason'), '{}') from jsonb_array_elements(v_calc -> 'components') x),
    public.tier_progress(c.lifetime_cleared_cents, c.approved_count, c.approval_rate, (v_calc ->> 'score')::integer, c.tier_review is not null, c.tier)
  )
  on conflict (creator_id) do update set
    as_of = excluded.as_of, provisional = excluded.provisional, reliability_score = excluded.reliability_score,
    approval_rate_finished = excluded.approval_rate_finished, approval_rate_raw = excluded.approval_rate_raw, on_time_ratio = excluded.on_time_ratio,
    post_through_ratio = excluded.post_through_ratio, compliance_ratio = excluded.compliance_ratio, clean_record_ratio = excluded.clean_record_ratio,
    finished_n = excluded.finished_n, fraud_flags_90d = excluded.fraud_flags_90d, clawbacks_90d = excluded.clawbacks_90d,
    disputes_lost_90d = excluded.disputes_lost_90d, academy_bonus_points = excluded.academy_bonus_points, components = excluded.components,
    reasons = excluded.reasons, tier_progress = excluded.tier_progress;
  update public.creators set reliability_score = (v_calc ->> 'score')::integer where id = p_creator_id;
  return v_calc;
end
$$;

-- The brand's public Scorecard row.
create or replace function public.refresh_brand_scorecard(p_brand_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calc jsonb;
  v_prev integer;
begin
  v_calc := public.brand_reliability(p_brand_id);
  select s.reliability_score into v_prev from public.brand_scorecards s where s.brand_id = p_brand_id and s.window_days = 90;
  insert into public.brand_scorecards (id, brand_id, window_days, as_of, decisions_n, approved_n, decision_hours_median, decision_hours_p90, sla_breaches,
    approval_rate, rejection_rate, appeals_n, appeals_overturned, run_rate, pays_on_time_ratio, pay_speed_hours_median, reply_hours_median, funded_always,
    reliability_score, band, badges, trend_30d)
  values (
    'bsc_' || substr(p_brand_id, 4), p_brand_id, 90, now(), (v_calc ->> 'decisions_n')::integer, (v_calc ->> 'approved_n')::integer,
    (v_calc ->> 'decision_hours_median')::numeric, (v_calc ->> 'decision_hours_p90')::numeric, (v_calc ->> 'sla_breaches')::integer,
    case when (v_calc ->> 'decisions_n')::integer > 0 then round((v_calc ->> 'approved_n')::numeric / (v_calc ->> 'decisions_n')::integer, 2) else 0 end,
    (v_calc ->> 'rejection_rate')::numeric, (v_calc ->> 'appeals_n')::integer, (v_calc ->> 'appeals_overturned')::integer, (v_calc ->> 'run_rate')::numeric,
    (v_calc ->> 'pays_on_time_ratio')::numeric, (v_calc ->> 'pay_speed_hours_median')::numeric, (v_calc ->> 'reply_hours_median')::numeric,
    (v_calc ->> 'funded_always')::boolean, (v_calc ->> 'score')::integer, (v_calc ->> 'band')::public.brand_band,
    coalesce((select array_agg(x::public.brand_badge) from jsonb_array_elements_text(v_calc -> 'badges') x), '{}'),
    0
  )
  on conflict (brand_id, window_days) do update set
    as_of = excluded.as_of, decisions_n = excluded.decisions_n, approved_n = excluded.approved_n, decision_hours_median = excluded.decision_hours_median,
    decision_hours_p90 = excluded.decision_hours_p90, sla_breaches = excluded.sla_breaches, approval_rate = excluded.approval_rate,
    rejection_rate = excluded.rejection_rate, appeals_n = excluded.appeals_n, appeals_overturned = excluded.appeals_overturned, run_rate = excluded.run_rate,
    pays_on_time_ratio = excluded.pays_on_time_ratio, pay_speed_hours_median = excluded.pay_speed_hours_median, reply_hours_median = excluded.reply_hours_median,
    funded_always = excluded.funded_always, reliability_score = excluded.reliability_score, band = excluded.band, badges = excluded.badges,
    trend_30d = excluded.reliability_score - coalesce(v_prev, excluded.reliability_score);
  return v_calc;
end
$$;

-- Bounty counters (counts and the lifetime funnel of its posts) recomputed from submissions and posts (M-03).
create or replace function public.refresh_bounty_counters(p_bounty_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_funnel jsonb;
begin
  select jsonb_build_object(
      'creators', count(distinct s.creator_id),
      'submissions', count(*),
      'in_review', count(*) filter (where s.status in ('qa_pending', 'in_review')),
      'approved', count(*) filter (where s.status in ('approved', 'posted', 'released')),
      'rejected', count(*) filter (where s.status = 'rejected'),
      'posts', (select count(*) from public.posts p where p.bounty_id = p_bounty_id),
      'live_posts', (select count(*) from public.posts p where p.bounty_id = p_bounty_id and p.status = 'live'))
    into v_counts
  from public.submissions s
  where s.bounty_id = p_bounty_id;
  select jsonb_build_object(
      'views', coalesce(sum((p.funnel ->> 'views')::bigint), 0), 'clicks', coalesce(sum((p.funnel ->> 'clicks')::bigint), 0),
      'installs', coalesce(sum((p.funnel ->> 'installs')::bigint), 0), 'trials', coalesce(sum((p.funnel ->> 'trials')::bigint), 0),
      'paid', coalesce(sum((p.funnel ->> 'paid')::bigint), 0), 'est_installs', coalesce(sum((p.funnel ->> 'est_installs')::bigint), 0),
      'est_trials', coalesce(sum((p.funnel ->> 'est_trials')::bigint), 0), 'est_paid', coalesce(sum((p.funnel ->> 'est_paid')::bigint), 0))
    into v_funnel
  from public.posts p
  where p.bounty_id = p_bounty_id;
  update public.bounties set counts = v_counts, funnel = v_funnel where id = p_bounty_id;
end
$$;

-- ===========================================================================
-- J. Money Clock projection
-- ===========================================================================
create or replace function private.money_clock_text(p_reason public.money_clock_reason, p_eta timestamptz, p_window_end timestamptz default null)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'window_open' then 'Views count until ' || private.fmt_eta(p_window_end) || '. Clears ' || private.fmt_eta(p_eta) || ' after the view check.'
    when 'fraud_check' then 'Running the view check. Next clearing run ' || private.fmt_eta(p_eta) || '.'
    when 'awaiting_clearing_run' then 'Next clearing run ' || private.fmt_eta(p_eta) || '.'
    when 'conversion_clearing' then 'The conversion is inside its clearing window. Clears ' || private.fmt_eta(p_eta) || '.'
    when 'awaiting_weekly_payout' then 'Cleared. Pays out ' || private.fmt_eta(p_eta) || '.'
    when 'payout_in_transit' then 'On its way to your bank.'
    when 'held_fraud_review' then 'Held for a view check by Ops. You will hear within 24 hours; delivered views are still paid.'
    when 'held_dispute' then 'Held while your dispute is open. Other earnings are not affected.'
    when 'held_tax_info' then 'Waiting for your tax form. Add it and the next payout includes this.'
    when 'held_identity_check' then 'Waiting for your ID check. Finish it and the next payout includes this.'
    when 'held_payout_method' then 'Add a payout method and the next payout includes this.'
    when 'held_compliance' then 'Held until the disclosure is fixed. Edit the caption or add #ad and it clears.'
    when 'paid_out' then 'Paid out.'
    when 'reversed_clawback' then 'Reversed after a proven-fraud review. Views delivered legitimately were still paid.'
  end;
$$;

-- Rebuild one creator's Money Clock rows from posts, conversions and the ledger. Idempotent; stale rows are deleted.
--   1. every earning row on the ledger (state from its status, ETA from the clearing rules)
--   2. live posts without a settled row: accruing, with a live estimate
--   3. closed posts without a settled row, and payable conversions not yet settled: pending with a named reason
create or replace function public.refresh_money_clock(p_creator_id text, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with led as (
    select
      l.id as ledger_id, l.entry_type, l.amount_cents, l.status, l.posted_at, l.memo, l.payout_id, l.post_id, l.conversion_id, l.bounty_id,
      coalesce(l.cleared_at, case when l.status in ('cleared', 'paid') then coalesce(l.paid_at, l.posted_at) end) as cleared_at,
      l.paid_at,
      p.window_ends_at, p.hold_reason,
      pay.status as payout_status, pay.scheduled_for as payout_at,
      b.title as bounty_title, b.app_id, a.name as app_name, cv.kind as conv_kind
    from public.ledger l
    left join public.posts p on p.id = l.post_id
    left join public.payouts pay on pay.id = l.payout_id
    left join public.bounties b on b.id = l.bounty_id
    left join public.apps a on a.id = b.app_id
    left join public.conversions cv on cv.id = l.conversion_id
    where l.creator_id = p_creator_id and l.account_kind = 'creator'
      and l.entry_type in ('cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral')
      and l.amount_cents > 0
  ),
  led_rows as (
    select
      'mc_' || x.ledger_id as id, x.bounty_id, x.app_id, x.post_id, x.conversion_id,
      (case x.entry_type
         when 'cpm' then 'cpm' when 'flat_fee' then 'flat_fee' when 'commission' then 'ad_commission' when 'rights_fee' then 'rights_fee'
         when 'prize' then 'prize' when 'bonus' then 'bonus' when 'referral' then 'referral'
         else (case x.conv_kind when 'install' then 'cpa_install' when 'trial' then 'cpa_trial' else 'cpa_paid' end)
       end)::public.money_clock_source as source,
      x.status::text::public.money_clock_state as state,
      x.amount_cents, false as estimated, x.posted_at as earned_at,
      (case x.status::text
         when 'pending' then (case when x.window_ends_at is not null then public.post_clearing_run(x.window_ends_at) else public.first_run_at_or_after(p_now) end)
         when 'cleared' then coalesce(x.payout_at, public.weekly_payout_for(coalesce(x.cleared_at, p_now)))
       end) as eta_at,
      (case x.status::text
         when 'pending' then (case when x.entry_type in ('cpm', 'flat_fee') and p_now < x.window_ends_at + make_interval(hours => private.ki('windows.fraud_check_max_hours')::integer) then 'fraud_check' else 'awaiting_clearing_run' end)
         when 'cleared' then (case when x.payout_status in ('processing', 'in_transit') then 'payout_in_transit' else 'awaiting_weekly_payout' end)
         when 'paid' then 'paid_out'
         when 'held' then (case x.hold_reason::text
              when 'dispute_open' then 'held_dispute' when 'tax_info_missing' then 'held_tax_info' when 'identity_check' then 'held_identity_check'
              when 'payout_method_missing' then 'held_payout_method' when 'compliance_fail' then 'held_compliance' else 'held_fraud_review' end)
         else 'reversed_clawback'
       end)::public.money_clock_reason as reason,
      x.window_ends_at,
      coalesce(x.app_name || ': ' || x.bounty_title, x.memo) as label,
      x.ledger_id, x.payout_id, x.cleared_at, x.paid_at
    from led x
  ),
  est_rows as (
    -- accruing (window open) or pending (window closed, not yet settled): CPM / flat-fee estimate for posts without a ledger row
    select
      'mc_' || p.id || '_cpm' as id, p.bounty_id, p.app_id, p.id as post_id, null::text as conversion_id,
      (case when b.type = 'direct' then 'flat_fee' else 'cpm' end)::public.money_clock_source as source,
      (case when p_now < p.window_ends_at then 'accruing' else 'pending' end)::public.money_clock_state as state,
      (case when b.type = 'direct' then b.flat_fee_cents else least(b.per_video_cap_cents, ((p.window_views * b.cpm_cents) + 500) / 1000) end) as amount_cents,
      (p_now < p.window_ends_at) as estimated, p.posted_at as earned_at,
      public.post_clearing_run(p.window_ends_at) as eta_at,
      (case when p_now < p.window_ends_at then 'window_open'
            when p_now < p.window_ends_at + make_interval(hours => private.ki('windows.fraud_check_max_hours')::integer) then 'fraud_check'
            else 'awaiting_clearing_run' end)::public.money_clock_reason as reason,
      p.window_ends_at,
      a.name || ': ' || b.title as label,
      null::text as ledger_id, null::text as payout_id, null::timestamptz as cleared_at, null::timestamptz as paid_at
    from public.posts p
    join public.bounties b on b.id = p.bounty_id
    join public.apps a on a.id = p.app_id
    where p.creator_id = p_creator_id and p.status in ('live', 'window_closed')
      and not exists (select 1 from public.ledger l where l.post_id = p.id and l.creator_id = p_creator_id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'flat_fee'))
  ),
  -- Conversions inside their clearing window. The per-video cap is shared with the CPM leg, so the amount shown is what the cap will let
  -- through: gross minus what the post already earned or is estimated to earn, minus the earlier pending batches of the same post.
  conv_base as (
    select
      cv.id, cv.post_id, cv.bounty_id, cv.app_id, cv.kind, cv.first_at, b.per_video_cap_cents as cap,
      a.name || ': ' || b.title as label,
      cv.quantity::bigint * (case cv.kind when 'install' then b.cpa_install_cents when 'trial' then b.cpa_trial_cents else b.cpa_paid_cents end) as gross,
      coalesce((select sum(l.amount_cents) from public.ledger l
                where l.post_id = cv.post_id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'cpa', 'flat_fee') and l.status <> 'reversed' and l.amount_cents > 0), 0)
        + coalesce((select e.amount_cents from est_rows e where e.post_id = cv.post_id), 0) as used
    from public.conversions cv
    join public.bounties b on b.id = cv.bounty_id
    join public.apps a on a.id = cv.app_id
    where cv.creator_id = p_creator_id and cv.status = 'pending' and cv.payable
      and (case cv.kind when 'install' then b.cpa_install_cents when 'trial' then b.cpa_trial_cents else b.cpa_paid_cents end) > 0
      and not exists (select 1 from public.ledger l where l.conversion_id = cv.id and l.account_kind = 'creator')
  ),
  conv_capped as (
    select c.*, least(c.gross, greatest(0, c.cap - c.used - coalesce(sum(c.gross) over (partition by c.post_id order by c.first_at, c.id rows between unbounded preceding and 1 preceding), 0))) as capped_amount
    from conv_base c
  ),
  conv_rows as (
    select
      'mc_' || c.id as id, c.bounty_id, c.app_id, c.post_id, c.id as conversion_id,
      (case c.kind when 'install' then 'cpa_install' when 'trial' then 'cpa_trial' else 'cpa_paid' end)::public.money_clock_source as source,
      'pending'::public.money_clock_state as state,
      c.capped_amount as amount_cents,
      false as estimated, c.first_at as earned_at,
      public.conversion_clearing_run(c.kind, c.first_at) as eta_at,
      'conversion_clearing'::public.money_clock_reason as reason,
      null::timestamptz as window_ends_at,
      c.label,
      null::text as ledger_id, null::text as payout_id, null::timestamptz as cleared_at, null::timestamptz as paid_at
    from conv_capped c
    where c.capped_amount > 0
  ),
  all_rows as (
    select * from led_rows
    union all select * from est_rows
    union all select * from conv_rows
  ),
  ins as (
    insert into public.money_clock (id, creator_id, bounty_id, app_id, post_id, conversion_id, source, state, amount_cents, estimated, earned_at, eta_at,
      reason, reason_text, label, ledger_id, payout_id, cleared_at, paid_at)
    select r.id, p_creator_id, r.bounty_id, r.app_id, r.post_id, r.conversion_id, r.source, r.state, r.amount_cents, r.estimated, r.earned_at, r.eta_at,
           r.reason, private.money_clock_text(r.reason, r.eta_at, r.window_ends_at), r.label, r.ledger_id, r.payout_id, r.cleared_at, r.paid_at
    from all_rows r
    where r.bounty_id is not null and r.app_id is not null
    on conflict (id) do update set
      source = excluded.source, state = excluded.state, amount_cents = excluded.amount_cents, estimated = excluded.estimated,
      earned_at = excluded.earned_at, eta_at = excluded.eta_at, reason = excluded.reason, reason_text = excluded.reason_text, label = excluded.label,
      ledger_id = excluded.ledger_id, payout_id = excluded.payout_id, cleared_at = excluded.cleared_at, paid_at = excluded.paid_at
    returning 1
  )
  delete from public.money_clock m
  where m.creator_id = p_creator_id and not exists (select 1 from all_rows r where r.id = m.id);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ===========================================================================
-- K. Roll-ups: ad totals and the per-app daily table
-- ===========================================================================
-- Ad totals from ad_daily; the commission accrues on revenue inside the 60 days after the ad first goes live (FORMULAS 3).
create or replace function public.rollup_ad(p_ad_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ads%rowtype;
  v_window_end timestamptz;
  v_rev_in_window bigint;
begin
  select * into a from public.ads where id = p_ad_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  v_window_end := case when a.started_at is not null then a.started_at + make_interval(days => private.ki('pay.ad_commission_days')::integer) end;
  select coalesce(sum(d.revenue_cents), 0) into v_rev_in_window
  from public.ad_daily d
  where d.ad_id = p_ad_id and (v_window_end is null or d.date <= (v_window_end at time zone 'UTC')::date);
  update public.ads x
  set spend_cents = coalesce(s.spend, 0), impressions = coalesce(s.impressions, 0), clicks = coalesce(s.clicks, 0), installs = coalesce(s.installs, 0),
      trials = coalesce(s.trials, 0), paid = coalesce(s.paid, 0), revenue_cents = coalesce(s.revenue, 0),
      platform_fee_cents = public.ad_platform_fee(coalesce(s.spend, 0)), commission_window_ends_at = v_window_end,
      commission_cents = public.ad_commission(v_rev_in_window, a.commission_rate)
  from (
    select sum(d.spend_cents) as spend, sum(d.impressions) as impressions, sum(d.clicks) as clicks, sum(d.installs) as installs,
           sum(d.trials) as trials, sum(d.paid) as paid, sum(d.revenue_cents) as revenue
    from public.ad_daily d
    where d.ad_id = p_ad_id
  ) s
  where x.id = p_ad_id;
end
$$;

-- Per-app daily roll-up (M-04): the sum of the app's posts' daily rows plus pipeline and money counters for the UTC day.
create or replace function public.refresh_app_metrics_daily(p_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_start timestamptz := (p_date::timestamp at time zone 'UTC');
  v_end timestamptz := ((p_date + 1)::timestamp at time zone 'UTC');
begin
  insert into public.app_metrics_daily (app_id, date, views, clicks, installs, trials, paid, est_installs, est_trials, est_paid, revenue_cents,
    posts_live, new_posts, new_submissions, approvals, creator_pay_cents, fee_cents)
  select a.id, p_date,
    coalesce(m.views, 0), coalesce(m.clicks, 0), coalesce(m.installs, 0), coalesce(m.trials, 0), coalesce(m.paid, 0),
    coalesce(m.est_installs, 0), coalesce(m.est_trials, 0), coalesce(m.est_paid, 0),
    coalesce((select sum(c.revenue_cents) from public.conversions c where c.app_id = a.id and c.occurred_on = p_date and c.payable and c.kind = 'paid'), 0),
    (select count(*) from public.posts p where p.app_id = a.id and p.posted_at < v_end and p.window_ends_at >= v_start and p.status <> 'removed'),
    (select count(*) from public.posts p where p.app_id = a.id and p.posted_at >= v_start and p.posted_at < v_end),
    (select count(*) from public.submissions s where s.app_id = a.id and s.submitted_at >= v_start and s.submitted_at < v_end),
    (select count(*) from public.submissions s where s.app_id = a.id and s.approved_at >= v_start and s.approved_at < v_end),
    coalesce((select sum(l.amount_cents) from public.ledger l join public.bounties b on b.id = l.bounty_id
              where b.app_id = a.id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'cpa', 'flat_fee') and l.amount_cents > 0 and l.posted_at >= v_start and l.posted_at < v_end), 0),
    coalesce((select sum(l.amount_cents) from public.ledger l join public.bounties b on b.id = l.bounty_id
              where b.app_id = a.id and l.account = 'platform:fees' and l.entry_type = 'fee' and l.posted_at >= v_start and l.posted_at < v_end), 0)
  from public.apps a
  left join (
    select p.app_id, sum(d.views) as views, sum(d.clicks) as clicks, sum(d.installs) as installs, sum(d.trials) as trials, sum(d.paid) as paid,
           sum(d.est_installs) as est_installs, sum(d.est_trials) as est_trials, sum(d.est_paid) as est_paid
    from public.post_metrics_daily d
    join public.posts p on p.id = d.post_id
    where d.date = p_date
    group by p.app_id
  ) m on m.app_id = a.id
  where a.deleted_at is null
  on conflict (app_id, date) do update set
    views = excluded.views, clicks = excluded.clicks, installs = excluded.installs, trials = excluded.trials, paid = excluded.paid,
    est_installs = excluded.est_installs, est_trials = excluded.est_trials, est_paid = excluded.est_paid, revenue_cents = excluded.revenue_cents,
    posts_live = excluded.posts_live, new_posts = excluded.new_posts, new_submissions = excluded.new_submissions, approvals = excluded.approvals,
    creator_pay_cents = excluded.creator_pay_cents, fee_cents = excluded.fee_cents;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;


-- ===========================================================================
-- L. The money path (service role only)
--
--   fund_bounty -> reserve_slot (on submit) -> close_window -> settle_post (CPM leg, pending) -> clear_post (14:00 UTC run)
--   record_conversion -> settle_conversion (CPA leg, after the clearing window) -> attach_cleared_earnings -> start_payout /
--   create_instant_payout -> complete_payout (Stripe confirms) ... and claw_back, settle_bounty, cancel_bounty.
--
-- Every function locks the rows it changes, writes the ledger through post_ledger_txn, and keeps the bounty money columns
-- (reserved / spent / remaining / refunded) in step. The CHECK constraints and the deferred triggers of 0001 verify the result
-- at COMMIT: a bug here fails the transaction instead of corrupting money.
-- ===========================================================================

-- Post one balanced transaction. p_legs: [{ account, amount_cents (signed), entry_type?, status?, memo?, brand_id?, bounty_id?, post_id?,
-- submission_id?, creator_id?, conversion_id?, ad_id?, payout_id?, invoice_id? }, ...]. Returns the txn id. A repeated idempotency key
-- returns the original transaction and posts nothing.
create or replace function public.post_ledger_txn(
  p_kind public.ledger_type, p_legs jsonb, p_memo text, p_idempotency_key text default null,
  p_actor_user_id text default null, p_reverses_txn_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn text;
  v_existing text;
  v_sum bigint;
begin
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) < 2 then
    raise exception 'validation_failed' using errcode = 'FD022', detail = 'a ledger transaction needs at least two legs';
  end if;
  select coalesce(sum((l ->> 'amount_cents')::bigint), 0) into v_sum from jsonb_array_elements(p_legs) l;
  if v_sum <> 0 then
    raise exception 'ledger_unbalanced' using errcode = 'FD014', detail = format('the legs net to %s cents; they must net to exactly 0', v_sum);
  end if;
  if p_idempotency_key is not null then
    select t.id into v_existing from public.ledger_transactions t where t.idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;
  v_txn := 'txn_' || lpad(nextval('public.ledger_txn_seq')::text, 9, '0');
  begin
    insert into public.ledger_transactions (id, kind, memo, idempotency_key, actor_user_id, reverses_txn_id)
    values (v_txn, p_kind, p_memo, p_idempotency_key, p_actor_user_id, p_reverses_txn_id);
  exception when unique_violation then
    -- a concurrent caller with the same idempotency key won the race
    select t.id into v_existing from public.ledger_transactions t where t.idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
    raise;
  end;
  insert into public.ledger (txn_id, entry_type, account, amount_cents, status, memo, brand_id, bounty_id, post_id, submission_id, creator_id,
                             conversion_id, ad_id, payout_id, invoice_id, reverses_txn_id, cleared_at, paid_at)
  select v_txn,
         coalesce((l ->> 'entry_type')::public.ledger_type, p_kind),
         l ->> 'account',
         (l ->> 'amount_cents')::bigint,
         coalesce((l ->> 'status')::public.ledger_status, 'cleared'),
         coalesce(l ->> 'memo', p_memo),
         l ->> 'brand_id', l ->> 'bounty_id', l ->> 'post_id', l ->> 'submission_id', l ->> 'creator_id',
         l ->> 'conversion_id', l ->> 'ad_id', l ->> 'payout_id', l ->> 'invoice_id', p_reverses_txn_id,
         case when coalesce(l ->> 'status', 'cleared') in ('cleared', 'paid') then now() end,
         case when coalesce(l ->> 'status', 'cleared') = 'paid' then now() end
  from jsonb_array_elements(p_legs) l;
  return v_txn;
end
$$;

-- Bounty pricing is owned by the database: a client writes the budget and the rates; the take rate (plan, CPA-only 6%, first-bounty
-- waiver) and the fee reserve are always recomputed here, so a brand can never underprice its own fee.
create or replace function private.bounty_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  br public.brands%rowtype;
  v_first boolean;
  v_matched bigint;
  f record;
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  select * into br from public.brands where id = new.brand_id;
  if tg_op = 'INSERT' then
    new.is_first_bounty := not br.first_bounty_waiver_used
      and not exists (select 1 from public.bounties b where b.brand_id = new.brand_id and b.funded);
    new.funding_source := coalesce(new.funding_source, 'brand');
  end if;
  v_first := coalesce(new.is_first_bounty, false) and not br.first_bounty_waiver_used;
  new.take_rate := public.take_rate(br.plan, new.type, v_first);
  new.fee_reserve_cents := public.mul_rate(new.budget_cents, new.take_rate);
  v_matched := case when v_first then least(private.ki('fees.matched_first_bounty_cap_cents'), new.budget_cents / 2) else 0 end;
  select * into f from public.funding(new.budget_cents, new.take_rate, v_matched);
  new.all_in_cpm_cents := public.all_in_cpm(new.cpm_cents, new.budget_cents, f.card_charge_cents);
  return new;
end
$$;

create trigger bounties_pricing
  before insert or update of budget_cents, type, cpm_cents on public.bounties
  for each row
  when (new.status in ('draft', 'awaiting_funding'))
  execute function private.bounty_pricing();

-- ---------------------------------------------------------------------------
-- Funding: wallet -> escrow (and the first-bounty match). Moves a bounty from awaiting_funding to live or scheduled.
-- The wallet must already hold the money (the Stripe webhook posted the top-up); otherwise insufficient_funds.
-- ---------------------------------------------------------------------------
create or replace function public.fund_bounty(p_bounty_id text, p_actor_user_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  br public.brands%rowtype;
  f record;
  v_first boolean;
  v_matched bigint;
  v_take numeric;
  v_bal bigint;
  v_holds bigint;
  v_txn text;
  v_legs jsonb;
  v_status public.bounty_status;
begin
  select * into b from public.bounties where id = p_bounty_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if b.funded and b.status <> 'cancelled' then
    return jsonb_build_object('bounty_id', b.id, 'status', b.status, 'funded', true, 'idempotent', true);
  end if;
  if b.status <> 'awaiting_funding' then
    raise exception 'conflict' using errcode = 'FD016', detail = format('bounty %s is %s; publish it (Brief Lint must pass) before funding', b.id, b.status);
  end if;
  select * into br from public.brands where id = b.brand_id for update;
  if br.suspended_at is not null then
    raise exception 'forbidden' using errcode = 'FD017', detail = 'the workspace is suspended';
  end if;
  v_first := b.is_first_bounty and not br.first_bounty_waiver_used;
  v_take := public.take_rate(br.plan, b.type, v_first);
  v_matched := case when v_first then least(private.ki('fees.matched_first_bounty_cap_cents'), b.budget_cents / 2) else 0 end;
  select * into f from public.funding(b.budget_cents, v_take, v_matched);
  select coalesce(lb.balance_cents, 0) into v_bal from public.ledger_balances lb where lb.account = 'wallet:' || b.brand_id for update;
  v_bal := coalesce(v_bal, 0);
  select coalesce(sum(h.amount_cents), 0) into v_holds from public.wallet_holds h where h.brand_id = b.brand_id and h.status = 'active';
  if v_bal - v_holds < f.brand_funded_cents then
    raise exception 'insufficient_funds' using errcode = 'FD018',
      detail = format('funding needs %s cents; the wallet has %s available (%s on hold)', f.brand_funded_cents, v_bal - v_holds, v_holds),
      hint = 'Top up the wallet, then fund the bounty.';
  end if;
  v_legs := jsonb_build_array(
    jsonb_build_object('account', 'wallet:' || b.brand_id, 'amount_cents', -f.brand_funded_cents, 'entry_type', 'escrow_fund', 'bounty_id', b.id,
      'memo', format('Funded: %s ($%s pool + $%s fee reserve)', b.title, to_char(b.budget_cents / 100.0, 'FM999,999,990.00'), to_char(f.fee_reserve_cents / 100.0, 'FM999,999,990.00'))),
    jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', f.brand_funded_cents, 'entry_type', 'escrow_fund', 'bounty_id', b.id,
      'memo', format('Funded: %s ($%s pool + $%s fee reserve)', b.title, to_char(b.budget_cents / 100.0, 'FM999,999,990.00'), to_char(f.fee_reserve_cents / 100.0, 'FM999,999,990.00')))
  );
  if v_matched > 0 then
    v_legs := v_legs || jsonb_build_array(
      jsonb_build_object('account', 'platform:matching', 'amount_cents', -v_matched, 'entry_type', 'matched_budget', 'bounty_id', b.id, 'memo', 'Matched budget (first bounty)'),
      jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', v_matched, 'entry_type', 'matched_budget', 'bounty_id', b.id, 'memo', 'Matched budget (first bounty)')
    );
  end if;
  v_txn := public.post_ledger_txn('escrow_fund', v_legs, 'Funded: ' || b.title, 'fund:' || b.id, p_actor_user_id);
  v_status := case when b.starts_at <= now() then 'live' else 'scheduled' end;
  update public.bounties
    set take_rate = v_take, fee_reserve_cents = f.fee_reserve_cents, escrow_funded_cents = f.escrow_total_cents, matched_cents = v_matched,
        funded = true, funded_at = now(), remaining_cents = f.escrow_total_cents, reserved_cents = 0, spent_cents = 0, refunded_cents = 0,
        funding_source = case when b.funding_source = 'platform' then 'platform'::public.funding_source
                              when v_matched > 0 then 'brand_matched'::public.funding_source else 'brand'::public.funding_source end,
        is_first_bounty = v_first or b.is_first_bounty, status = v_status, published_at = coalesce(b.published_at, now()),
        all_in_cpm_cents = public.all_in_cpm(b.cpm_cents, b.budget_cents, f.card_charge_cents)
    where id = b.id;
  if v_first then
    update public.brands set first_bounty_waiver_used = true, matched_budget_used_cents = matched_budget_used_cents + v_matched where id = br.id;
  end if;
  return jsonb_build_object('bounty_id', b.id, 'status', v_status, 'funded', true, 'txn_id', v_txn, 'take_rate', v_take,
    'escrow_total_cents', f.escrow_total_cents, 'matched_cents', v_matched, 'brand_funded_cents', f.brand_funded_cents, 'card_charge_cents', f.card_charge_cents);
end
$$;

-- Add budget to a live bounty (the fee on the addition is funded with it; a filled bounty with new capacity goes live again).
create or replace function public.top_up_bounty(p_bounty_id text, p_add_budget_cents bigint, p_idempotency_key text, p_actor_user_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  v_new_budget bigint;
  v_new_fee bigint;
  v_total bigint;
  v_bal bigint;
  v_holds bigint;
  v_txn text;
  v_remaining bigint;
  v_status public.bounty_status;
begin
  if p_add_budget_cents < 1 then
    raise exception 'below_minimum' using errcode = 'FD006';
  end if;
  select * into b from public.bounties where id = p_bounty_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  -- a replayed request (same Idempotency-Key) must not touch the bounty columns again
  select t.id into v_txn from public.ledger_transactions t where t.idempotency_key = 'topup:' || b.id || ':' || p_idempotency_key;
  if found then
    return jsonb_build_object('bounty_id', b.id, 'status', b.status, 'txn_id', v_txn, 'remaining_cents', b.remaining_cents, 'idempotent', true);
  end if;
  if not b.funded or b.status not in ('scheduled', 'live', 'paused', 'filled') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('bounty %s is %s and cannot take a top-up', b.id, b.status);
  end if;
  v_new_budget := b.budget_cents + p_add_budget_cents;
  v_new_fee := public.mul_rate(v_new_budget, b.take_rate);
  v_total := p_add_budget_cents + (v_new_fee - b.fee_reserve_cents);
  select coalesce(lb.balance_cents, 0) into v_bal from public.ledger_balances lb where lb.account = 'wallet:' || b.brand_id for update;
  v_bal := coalesce(v_bal, 0);
  select coalesce(sum(h.amount_cents), 0) into v_holds from public.wallet_holds h where h.brand_id = b.brand_id and h.status = 'active';
  if v_bal - v_holds < v_total then
    raise exception 'insufficient_funds' using errcode = 'FD018', detail = format('the top-up needs %s cents; the wallet has %s available', v_total, v_bal - v_holds);
  end if;
  v_txn := public.post_ledger_txn('escrow_fund', jsonb_build_array(
      jsonb_build_object('account', 'wallet:' || b.brand_id, 'amount_cents', -v_total, 'entry_type', 'escrow_fund', 'bounty_id', b.id, 'memo', 'Top-up: ' || b.title),
      jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', v_total, 'entry_type', 'escrow_fund', 'bounty_id', b.id, 'memo', 'Top-up: ' || b.title)),
    'Top-up: ' || b.title, 'topup:' || b.id || ':' || p_idempotency_key, p_actor_user_id);
  v_remaining := b.remaining_cents + v_total;
  v_status := case when b.status = 'filled' and v_remaining >= public.reservation_unit(b.per_video_cap_cents, b.take_rate) and b.ends_at > now() then 'live'::public.bounty_status else b.status end;
  update public.bounties
    set budget_cents = v_new_budget, fee_reserve_cents = v_new_fee, escrow_funded_cents = escrow_funded_cents + v_total,
        remaining_cents = v_remaining, status = v_status
    where id = b.id;
  return jsonb_build_object('bounty_id', b.id, 'status', v_status, 'txn_id', v_txn, 'added_cents', v_total, 'remaining_cents', v_remaining);
end
$$;

-- ---------------------------------------------------------------------------
-- Reserved Slot
-- ---------------------------------------------------------------------------
-- Tier early access: a bounty opens to Elite first and to Bronze 12 hours later (Silver 1h, Gold 3h, Platinum 6h, Elite 12h head start).
-- A creator who claimed a Daily Drop spot, and invited creators (private / invite-only bounties), skip the wait.
create or replace function private.assert_can_submit(p_bounty public.bounties, p_creator_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier public.tier;
  v_min public.tier;
  v_perk integer;
  v_max integer := private.ki('tiers.perks.elite.early_access_hours');
  v_live_at timestamptz;
  v_open_at timestamptz;
begin
  select c.tier into v_tier from public.creators c where c.id = p_creator_id;
  if v_tier is null then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p_bounty.eligibility ? 'min_tier' then
    v_min := (p_bounty.eligibility ->> 'min_tier')::public.tier;
    if v_tier < v_min then
      raise exception 'tier_locked' using errcode = 'FD010', detail = format('this bounty needs %s or above; you are %s', v_min, v_tier);
    end if;
  end if;
  if p_bounty.visibility <> 'open' or p_bounty.is_starter then
    return;
  end if;
  if exists (select 1 from public.drop_claims dc where dc.bounty_id = p_bounty.id and dc.creator_id = p_creator_id and dc.expires_at > now()) then
    return;
  end if;
  v_perk := private.ki('tiers.perks.' || v_tier::text || '.early_access_hours');
  v_live_at := greatest(p_bounty.starts_at, coalesce(p_bounty.funded_at, p_bounty.published_at, p_bounty.starts_at));
  v_open_at := v_live_at + make_interval(hours => (v_max - v_perk)::integer);
  if now() < v_open_at then
    raise exception 'tier_locked' using errcode = 'FD010',
      detail = format('this bounty opens to %s creators at %s', v_tier, to_char(v_open_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'),
      hint = 'Higher tiers get a head start of up to 12 hours.';
  end if;
end
$$;

-- Take a Reserved Slot for a submission: up to the per-video cap (plus the fee on it) is reserved from the pool, so an approved
-- post is paid even if the pool later empties. Idempotent. Raises pool_exhausted when the pool cannot cover one more unit.
create or replace function public.reserve_slot(p_submission_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions%rowtype;
  b public.bounties%rowtype;
  v_unit bigint;
  v_after bigint;
  v_creator_total bigint;
begin
  select * into s from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  select * into b from public.bounties where id = s.bounty_id for update;
  if s.reserved_cents > 0 then
    return s.reserved_cents;
  end if;
  if s.status not in ('qa_pending', 'in_review', 'changes_requested') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('submission %s is %s and cannot take a slot', s.id, s.status);
  end if;
  if not b.funded then
    raise exception 'bounty_not_funded' using errcode = 'FD002';
  end if;
  if b.status = 'filled' then
    raise exception 'pool_exhausted' using errcode = 'FD001', detail = 'every slot of this bounty is taken';
  end if;
  if b.status <> 'live' or b.ends_at <= now() then
    raise exception 'conflict' using errcode = 'FD016', detail = format('bounty %s is %s and not taking submissions', b.id, b.status);
  end if;
  perform private.assert_can_submit(b, s.creator_id);
  v_unit := public.reservation_unit(b.per_video_cap_cents, b.take_rate);
  if b.remaining_cents < v_unit then
    raise exception 'pool_exhausted' using errcode = 'FD001', detail = format('the pool has %s cents left; one slot needs %s', b.remaining_cents, v_unit);
  end if;
  if b.per_creator_cap_cents is not null then
    select coalesce(sum(x.r), 0) into v_creator_total from (
      select s2.reserved_cents as r from public.submissions s2 where s2.bounty_id = b.id and s2.creator_id = s.creator_id
      union all
      select l.amount_cents from public.ledger l
       where l.bounty_id = b.id and l.creator_id = s.creator_id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'cpa', 'flat_fee') and l.status <> 'reversed' and l.amount_cents > 0
    ) x;
    if v_creator_total + b.per_video_cap_cents > b.per_creator_cap_cents then
      raise exception 'conflict' using errcode = 'FD016', detail = 'this bounty caps what one creator can earn and you have reached it';
    end if;
  end if;
  v_after := b.remaining_cents - v_unit;
  update public.bounties
    set reserved_cents = reserved_cents + v_unit, remaining_cents = v_after,
        status = case when v_after < v_unit then 'filled'::public.bounty_status else status end,
        filled_at = case when v_after < v_unit then coalesce(filled_at, now()) else filled_at end,
        first_submission_at = coalesce(first_submission_at, now()),
        time_to_fill_hours = case when v_after < v_unit and filled_at is null and published_at is not null
                                  then round((extract(epoch from (now() - published_at)) / 3600)::numeric, 2) else time_to_fill_hours end
    where id = b.id;
  update public.submissions set reserved_cents = v_unit where id = s.id;
  return v_unit;
end
$$;

-- Release a submission's reservation (rejection, withdrawal, expiry, release to the Spec Market, or the end of the CPA window).
-- A filled bounty with capacity again goes back to live. Returns the cents released.
create or replace function public.release_reserved(p_submission_id text, p_reason text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.submissions%rowtype;
  b public.bounties%rowtype;
  v_released bigint;
  v_remaining bigint;
begin
  select * into s from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  v_released := s.reserved_cents;
  if v_released = 0 then
    return 0;
  end if;
  select * into b from public.bounties where id = s.bounty_id for update;
  v_remaining := b.remaining_cents + v_released;
  update public.submissions set reserved_cents = 0 where id = s.id;
  update public.bounties
    set reserved_cents = reserved_cents - v_released, remaining_cents = v_remaining,
        status = case when status = 'filled' and v_remaining >= public.reservation_unit(per_video_cap_cents, take_rate) and ends_at > now() then 'live'::public.bounty_status else status end
    where id = b.id;
  return v_released;
end
$$;

-- ---------------------------------------------------------------------------
-- Windows, settlement and clearing
-- ---------------------------------------------------------------------------
-- 72 hours elapsed: freeze the verified views that count for CPM pay (the snapshot at window end, the View Ledger).
create or replace function public.close_window(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
  v_views bigint;
begin
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status <> 'live' then
    return jsonb_build_object('post_id', p.id, 'status', p.status, 'window_views', p.window_views, 'idempotent', true);
  end if;
  if now() < p.window_ends_at then
    raise exception 'conflict' using errcode = 'FD016', detail = format('the window of post %s closes at %s', p.id, p.window_ends_at);
  end if;
  select coalesce(
    (select s.views_verified from public.view_snapshots s where s.post_id = p.id and s.taken_at <= p.window_ends_at order by s.taken_at desc limit 1),
    p.window_views) into v_views;
  update public.posts
    set status = 'window_closed', window_views = v_views, views = greatest(views, v_views),
        funnel = jsonb_set(funnel, '{views}', to_jsonb(greatest(views, v_views)))
    where id = p.id;
  return jsonb_build_object('post_id', p.id, 'status', 'window_closed', 'window_views', v_views);
end
$$;

-- Settlement of the CPM (or flat-fee) leg when the window has closed: escrow debited, creator credited as PENDING, platform fee credited.
-- Pay = min(round(window_views x CPM / 1000), per-video cap); the fee is round(pay x take rate) per leg, never more than the reservation holds.
-- Later CPA legs (settle_conversion) share the same cap. Idempotent on (post, leg).
create or replace function public.settle_post(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
  b public.bounties%rowtype;
  s public.submissions%rowtype;
  v_key text := 'settle:cpm:' || p_post_id;
  v_txn text;
  v_leg public.ledger_type;
  v_pay bigint;
  v_fee bigint;
  v_take bigint;
  v_rtake bigint;
  v_extra bigint;
  v_capped boolean;
  v_unc bigint;
  v_cpa_possible boolean;
  v_earn jsonb;
  v_name text;
begin
  select t.id into v_txn from public.ledger_transactions t where t.idempotency_key = v_key;
  if found then
    return jsonb_build_object('post_id', p_post_id, 'txn_id', v_txn, 'idempotent', true);
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status <> 'window_closed' then
    raise exception 'conflict' using errcode = 'FD016', detail = format('post %s is %s; only a post with a closed window settles', p.id, p.status);
  end if;
  select * into b from public.bounties where id = p.bounty_id for update;
  select * into s from public.submissions where id = p.submission_id for update;
  if b.type = 'direct' then
    v_leg := 'flat_fee';
    v_unc := b.flat_fee_cents;
    v_pay := least(b.flat_fee_cents, b.per_video_cap_cents);
  else
    v_leg := 'cpm';
    v_unc := ((p.window_views * b.cpm_cents) + 500) / 1000;
    v_pay := least(v_unc, b.per_video_cap_cents);
  end if;
  v_capped := v_unc > v_pay;
  v_fee := least(public.mul_rate(v_pay, b.take_rate), greatest(0, s.reserved_cents - v_pay));
  v_take := v_pay + v_fee;
  if v_pay > 0 then
    select a.name || ': ' || b.title into v_name from public.apps a where a.id = p.app_id;
    v_txn := public.post_ledger_txn(v_leg, jsonb_build_array(
        jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', -v_take, 'entry_type', v_leg, 'bounty_id', b.id, 'post_id', p.id, 'submission_id', s.id,
          'memo', case when v_leg = 'cpm' then format('Views pay: %s (%s verified views)', b.title, to_char(p.window_views, 'FM999,999,999,990')) else 'Flat fee: ' || b.title end),
        jsonb_build_object('account', 'creator:' || p.creator_id, 'amount_cents', v_pay, 'entry_type', v_leg, 'status', 'pending', 'bounty_id', b.id, 'post_id', p.id,
          'submission_id', s.id, 'creator_id', p.creator_id,
          'memo', case when v_leg = 'cpm' then format('Views pay: %s (%s verified views)', b.title, to_char(p.window_views, 'FM999,999,999,990')) else 'Flat fee: ' || b.title end))
      || case when v_fee > 0 then jsonb_build_array(
        jsonb_build_object('account', 'platform:fees', 'amount_cents', v_fee, 'entry_type', 'fee', 'bounty_id', b.id, 'post_id', p.id, 'submission_id', s.id,
          'memo', format('Platform fee %s%%: %s', round(b.take_rate * 100), b.title))) else '[]'::jsonb end,
      coalesce(v_name, b.title), v_key);
    -- reservation -> spent
    v_rtake := least(v_take, s.reserved_cents);
    v_extra := v_take - v_rtake;
    if v_extra > b.remaining_cents then
      raise exception 'pool_exhausted' using errcode = 'FD001', detail = 'the reservation of an approved post did not cover its pay';
    end if;
    update public.submissions set reserved_cents = reserved_cents - v_rtake where id = s.id;
    update public.bounties set spent_cents = spent_cents + v_take, reserved_cents = reserved_cents - v_rtake, remaining_cents = remaining_cents - v_extra where id = b.id;
  end if;
  v_cpa_possible := b.type <> 'direct' and (b.cpa_install_cents + b.cpa_trial_cents + b.cpa_paid_cents) > 0;
  if not v_cpa_possible then
    perform public.release_reserved(s.id, 'settled');
  end if;
  v_earn := p.earnings;
  v_earn := jsonb_set(v_earn, case when v_leg = 'cpm' then '{cpm_cents}' else '{flat_cents}' end::text[], to_jsonb(v_pay));
  v_earn := jsonb_set(v_earn, '{total_cents}', to_jsonb(
    (v_earn ->> 'cpm_cents')::bigint + (v_earn ->> 'cpa_cents')::bigint + (v_earn ->> 'commission_cents')::bigint + (v_earn ->> 'flat_cents')::bigint));
  v_earn := jsonb_set(v_earn, '{capped}', to_jsonb(v_capped));
  v_earn := jsonb_set(v_earn, '{cap_remaining_cents}', to_jsonb(greatest(0, b.per_video_cap_cents - ((v_earn ->> 'cpm_cents')::bigint + (v_earn ->> 'cpa_cents')::bigint + (v_earn ->> 'flat_cents')::bigint))));
  update public.posts set earnings = v_earn where id = p.id;
  perform public.refresh_money_clock(p.creator_id);
  return jsonb_build_object('post_id', p.id, 'txn_id', v_txn, 'leg', v_leg, 'pay_cents', v_pay, 'fee_cents', v_fee, 'capped', v_capped);
end
$$;

-- Put a post's pending money on hold (fraud score, failed disclosure, open dispute). The post goes window_closed -> held;
-- delivered legitimate views are still paid when the hold resolves in the creator's favour.
create or replace function public.hold_post(p_post_id text, p_reason public.hold_reason)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
begin
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status = 'held' then
    return jsonb_build_object('post_id', p.id, 'status', 'held', 'hold_reason', p.hold_reason, 'idempotent', true);
  end if;
  if p.status <> 'window_closed' then
    raise exception 'conflict' using errcode = 'FD016', detail = format('post %s is %s; only a post with a closed window can be held', p.id, p.status);
  end if;
  update public.ledger set status = 'held'
    where post_id = p.id and account_kind = 'creator' and status = 'pending' and entry_type in ('cpm', 'flat_fee', 'cpa');
  update public.posts set status = 'held', hold_reason = p_reason where id = p.id;
  perform public.refresh_money_clock(p.creator_id);
  return jsonb_build_object('post_id', p.id, 'status', 'held', 'hold_reason', p_reason);
end
$$;

-- The 14:00 UTC clearing run for one post: fraud score under 40, no failed disclosure, no open dispute -> pending becomes CLEARED and
-- counts toward lifetime cleared (tiers). Otherwise the post is held with a named reason. p_override = Ops released a hold.
create or replace function public.clear_post(p_post_id text, p_override boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
  v_cleared bigint;
begin
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status in ('cleared', 'paid') then
    return jsonb_build_object('post_id', p.id, 'status', p.status, 'idempotent', true);
  end if;
  if p.status = 'held' and not p_override then
    return jsonb_build_object('post_id', p.id, 'status', 'held', 'hold_reason', p.hold_reason);
  end if;
  if p.status not in ('window_closed', 'held') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('post %s is %s and cannot clear', p.id, p.status);
  end if;
  if not p_override then
    if p.fraud_score >= private.ki('fraud.review_threshold') then
      return public.hold_post(p.id, 'fraud_review');
    end if;
    if exists (select 1 from public.compliance_checks c where c.post_id = p.id and c.blocks_settlement) then
      return public.hold_post(p.id, 'compliance_fail');
    end if;
    if exists (select 1 from public.disputes d where d.post_id = p.id and d.status in ('open', 'evidence_requested', 'under_review')) then
      return public.hold_post(p.id, 'dispute_open');
    end if;
  end if;
  update public.ledger set status = 'cleared', cleared_at = now()
    where post_id = p.id and account_kind = 'creator' and status in ('pending', 'held') and entry_type in ('cpm', 'flat_fee', 'cpa');
  update public.posts set status = 'cleared', cleared_at = now(), hold_reason = null where id = p.id;
  select coalesce(sum(l.amount_cents), 0) into v_cleared
    from public.ledger l where l.post_id = p.id and l.account_kind = 'creator' and l.status = 'cleared' and l.cleared_at = now();
  perform public.refresh_creator_stats(p.creator_id);
  perform public.refresh_money_clock(p.creator_id);
  perform public.attach_cleared_earnings(p.creator_id);
  return jsonb_build_object('post_id', p.id, 'status', 'cleared', 'cleared_cents', v_cleared);
end
$$;

-- A tracked conversion (install, trial, paid) from a link, a code, an MMP, a survey or a model. Batches identical events per
-- (post, kind, source, UTC day, country). CPA is paid only for source link and code (payable); everything else is reported, never paid.
create or replace function public.record_conversion(
  p_link_id text, p_kind public.conversion_kind, p_source public.conversion_source, p_occurred_at timestamptz default now(),
  p_quantity integer default 1, p_revenue_cents bigint default 0, p_country public.country default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.attribution_links%rowtype;
  v_id text;
  v_day date := (p_occurred_at at time zone 'UTC')::date;
  v_conf public.conversion_confidence;
  v_det boolean := p_source in ('link', 'code');
  v_key text;
begin
  if p_quantity < 1 then
    raise exception 'validation_failed' using errcode = 'FD022', detail = 'quantity must be at least 1';
  end if;
  select * into l from public.attribution_links where id = p_link_id;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if l.post_id is null then
    raise exception 'validation_failed' using errcode = 'FD022', detail = 'the tracking link has no post yet';
  end if;
  v_conf := (case p_source when 'link' then 'deterministic' when 'code' then 'deterministic' when 'mmp' then 'matched' when 'survey' then 'self_reported' else 'modelled' end)::public.conversion_confidence;
  for i in 1 .. 2 loop
    insert into public.conversions (id, post_id, link_id, app_id, bounty_id, creator_id, kind, source, confidence, quantity, occurred_on, first_at,
                                    revenue_cents, country, status, payable, capped)
    values (public.new_id('conv'), l.post_id, l.id, l.app_id, l.bounty_id, l.creator_id, p_kind, p_source, v_conf, p_quantity, v_day, p_occurred_at,
            case when p_kind = 'paid' then p_revenue_cents else 0 end, p_country, 'pending', v_det, false)
    on conflict (post_id, kind, source, occurred_on, country) do update
      set quantity = public.conversions.quantity + excluded.quantity,
          revenue_cents = public.conversions.revenue_cents + excluded.revenue_cents,
          first_at = least(public.conversions.first_at, excluded.first_at)
      where public.conversions.status = 'pending'
    returning id into v_id;
    exit when v_id is not null;
    -- the day's batch already cleared (a late event): book it on today's batch instead
    v_day := (now() at time zone 'UTC')::date;
  end loop;
  if v_id is null then
    raise exception 'conflict' using errcode = 'FD016', detail = 'could not book the conversion: its batch already cleared';
  end if;
  v_key := case p_kind when 'install' then 'installs' when 'trial' then 'trials' else 'paid' end;
  if not v_det then
    v_key := 'est_' || v_key;
  end if;
  update public.posts set funnel = jsonb_set(funnel, array[v_key], to_jsonb(coalesce((funnel ->> v_key)::bigint, 0) + p_quantity)) where id = l.post_id;
  insert into public.post_metrics_daily (post_id, date, installs, trials, paid, est_installs, est_trials, est_paid)
  values (l.post_id, v_day,
    case when v_det and p_kind = 'install' then p_quantity else 0 end, case when v_det and p_kind = 'trial' then p_quantity else 0 end,
    case when v_det and p_kind = 'paid' then p_quantity else 0 end, case when not v_det and p_kind = 'install' then p_quantity else 0 end,
    case when not v_det and p_kind = 'trial' then p_quantity else 0 end, case when not v_det and p_kind = 'paid' then p_quantity else 0 end)
  on conflict (post_id, date) do update set
    installs = public.post_metrics_daily.installs + excluded.installs, trials = public.post_metrics_daily.trials + excluded.trials,
    paid = public.post_metrics_daily.paid + excluded.paid, est_installs = public.post_metrics_daily.est_installs + excluded.est_installs,
    est_trials = public.post_metrics_daily.est_trials + excluded.est_trials, est_paid = public.post_metrics_daily.est_paid + excluded.est_paid;
  if v_det then
    update public.attribution_links
      set installs = installs + case when p_kind = 'install' then p_quantity else 0 end, trials = trials + case when p_kind = 'trial' then p_quantity else 0 end,
          paid = paid + case when p_kind = 'paid' then p_quantity else 0 end
      where id = l.id;
  end if;
  return v_id;
end
$$;

-- Book the conversion of a stored RevenueCat event exactly once. The event row is locked, the conversion is recorded and the row is
-- stamped with it in one transaction, so a crash or a redelivery between "stored" and "booked" can neither lose nor double-count it.
create or replace function public.book_rc_conversion(
  p_rc_event_id text, p_link_id text, p_kind public.conversion_kind, p_source public.conversion_source,
  p_occurred_at timestamptz, p_revenue_cents bigint default 0, p_country public.country default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.revenuecat_events%rowtype;
  v_conv text;
begin
  select * into e from public.revenuecat_events where id = p_rc_event_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if e.matched_conversion_id is not null then
    return e.matched_conversion_id;
  end if;
  v_conv := public.record_conversion(p_link_id, p_kind, p_source, p_occurred_at, 1, p_revenue_cents, p_country);
  update public.revenuecat_events
    set matched_conversion_id = v_conv, match_status = 'matched', matched_link_id = p_link_id,
        matched_creator_id = (select l.creator_id from public.attribution_links l where l.id = p_link_id)
    where id = p_rc_event_id;
  return v_conv;
end
$$;

-- CPA settlement of one conversion batch after its clearing window (install 24 h, trial 72 h, paid 168 h, then the next 14:00 run).
-- Only link and code conversions pay; the per-video cap is shared with the CPM leg; held, removed or clawed-back posts do not clear.
create or replace function public.settle_conversion(p_conversion_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.conversions%rowtype;
  p public.posts%rowtype;
  b public.bounties%rowtype;
  s public.submissions%rowtype;
  v_due timestamptz;
  v_rate bigint;
  v_gross bigint;
  v_paid_so_far bigint;
  v_cap_left bigint;
  v_pay bigint;
  v_fee bigint;
  v_take bigint;
  v_rtake bigint;
  v_extra bigint;
  v_capped boolean;
  v_txn text;
begin
  select * into cv from public.conversions where id = p_conversion_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if cv.status <> 'pending' then
    return jsonb_build_object('conversion_id', cv.id, 'status', cv.status, 'idempotent', true);
  end if;
  v_due := public.conversion_clearing_run(cv.kind, cv.first_at);
  if now() < v_due then
    return jsonb_build_object('conversion_id', cv.id, 'status', 'pending', 'due_at', v_due);
  end if;
  select * into p from public.posts where id = cv.post_id for update;
  if p.status in ('removed', 'clawed_back') then
    update public.conversions set status = 'rejected', reject_reason = 'The post was removed or reversed.' where id = cv.id;
    return jsonb_build_object('conversion_id', cv.id, 'status', 'rejected');
  end if;
  if p.status in ('held') then
    return jsonb_build_object('conversion_id', cv.id, 'status', 'pending', 'held', true);
  end if;
  if cv.first_at > p.posted_at + make_interval(days => private.ki('pay.cpa_window_days')::integer) then
    update public.conversions set status = 'rejected', reject_reason = 'Outside the 30-day conversion window after posting.' where id = cv.id;
    return jsonb_build_object('conversion_id', cv.id, 'status', 'rejected');
  end if;
  if not cv.payable then
    update public.conversions set status = 'cleared', cleared_at = now() where id = cv.id;
    return jsonb_build_object('conversion_id', cv.id, 'status', 'cleared', 'paid', false, 'reason', 'estimated sources are reported, never paid');
  end if;
  select * into b from public.bounties where id = cv.bounty_id for update;
  select * into s from public.submissions where id = p.submission_id for update;
  v_rate := case cv.kind when 'install' then b.cpa_install_cents when 'trial' then b.cpa_trial_cents else b.cpa_paid_cents end;
  v_gross := cv.quantity::bigint * v_rate;
  select coalesce(sum(l.amount_cents), 0) into v_paid_so_far
    from public.ledger l
    where l.post_id = p.id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'cpa', 'flat_fee') and l.status <> 'reversed' and l.amount_cents > 0;
  v_cap_left := greatest(0, b.per_video_cap_cents - v_paid_so_far);
  v_pay := least(v_gross, v_cap_left);
  v_capped := v_gross > v_cap_left;
  if v_pay = 0 then
    update public.conversions set status = 'cleared', cleared_at = now(), capped = v_capped where id = cv.id;
    return jsonb_build_object('conversion_id', cv.id, 'status', 'cleared', 'paid', false, 'capped', v_capped);
  end if;
  v_fee := least(public.mul_rate(v_pay, b.take_rate), greatest(0, s.reserved_cents - v_pay));
  v_take := v_pay + v_fee;
  v_txn := public.post_ledger_txn('cpa', jsonb_build_array(
      jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', -v_take, 'entry_type', 'cpa', 'bounty_id', b.id, 'post_id', p.id, 'submission_id', s.id, 'conversion_id', cv.id,
        'memo', format('%s x%s (%s): %s', initcap(cv.kind::text), cv.quantity, cv.source, b.title)),
      jsonb_build_object('account', 'creator:' || p.creator_id, 'amount_cents', v_pay, 'entry_type', 'cpa', 'status', 'cleared', 'bounty_id', b.id, 'post_id', p.id,
        'submission_id', s.id, 'creator_id', p.creator_id, 'conversion_id', cv.id, 'memo', format('%s bonus x%s (tracked %s): %s', initcap(cv.kind::text), cv.quantity, cv.source, b.title)))
    || case when v_fee > 0 then jsonb_build_array(
      jsonb_build_object('account', 'platform:fees', 'amount_cents', v_fee, 'entry_type', 'fee', 'bounty_id', b.id, 'post_id', p.id, 'submission_id', s.id, 'conversion_id', cv.id,
        'memo', format('Platform fee %s%%: %s', round(b.take_rate * 100), b.title))) else '[]'::jsonb end,
    'Conversion pay: ' || b.title, 'settle:cpa:' || cv.id);
  v_rtake := least(v_take, s.reserved_cents);
  v_extra := v_take - v_rtake;
  if v_extra > b.remaining_cents then
    raise exception 'pool_exhausted' using errcode = 'FD001', detail = 'the reservation of an approved post did not cover its conversion pay';
  end if;
  update public.submissions set reserved_cents = reserved_cents - v_rtake where id = s.id;
  update public.bounties set spent_cents = spent_cents + v_take, reserved_cents = reserved_cents - v_rtake, remaining_cents = remaining_cents - v_extra where id = b.id;
  update public.conversions set status = 'cleared', cleared_at = now(), capped = v_capped, ledger_txn_id = v_txn where id = cv.id;
  update public.posts
    set earnings = jsonb_set(jsonb_set(jsonb_set(earnings, '{cpa_cents}', to_jsonb((earnings ->> 'cpa_cents')::bigint + v_pay)),
        '{total_cents}', to_jsonb((earnings ->> 'total_cents')::bigint + v_pay)), '{capped}', to_jsonb(v_capped or (earnings ->> 'capped')::boolean))
    where id = p.id;
  perform public.refresh_creator_stats(p.creator_id);
  perform public.refresh_money_clock(p.creator_id);
  perform public.attach_cleared_earnings(p.creator_id);
  return jsonb_build_object('conversion_id', cv.id, 'status', 'cleared', 'txn_id', v_txn, 'pay_cents', v_pay, 'fee_cents', v_fee, 'capped', v_capped);
end
$$;

-- Release the reservations of posts whose 30-day CPA window has ended (CPA-capable bounties keep the slot reserved until then).
create or replace function public.finalize_cpa_windows(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select s.id
    from public.submissions s
    join public.posts p on p.id = s.post_id
    where s.reserved_cents > 0 and p.status in ('cleared', 'paid', 'removed', 'clawed_back')
      and p.posted_at + make_interval(days => private.ki('pay.cpa_window_days')::integer) <= p_now
      and not exists (select 1 from public.conversions c where c.post_id = p.id and c.status = 'pending' and c.payable)
  loop
    perform public.release_reserved(r.id, 'cpa_window_closed');
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- Hourly sample of a post from the platform: updates the hourly delta, the daily row, the post counters and (when p_snapshot) the View
-- Ledger. Views never go backwards; window_views follows the verified views while the window is open.
create or replace function public.ingest_post_sample(
  p_post_id text, p_sampled_at timestamptz, p_views_reported bigint, p_views_verified bigint,
  p_likes integer default null, p_comments integer default null, p_shares integer default null, p_saves integer default null,
  p_sources jsonb default null, p_geo jsonb default null, p_exclusions jsonb default null, p_flags public.snapshot_flag[] default '{}',
  p_fraud_score integer default 0, p_source public.snapshot_source default 'platform_api', p_snapshot boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
  v_views bigint;
  v_likes integer;
  v_comments integer;
  v_shares integer;
  v_saves integer;
  v_d_views bigint;
  v_d_likes integer;
  v_d_comments integer;
  v_d_shares integer;
  v_d_saves integer;
  v_hour timestamptz := date_trunc('hour', p_sampled_at at time zone 'UTC') at time zone 'UTC';
  v_day date := (p_sampled_at at time zone 'UTC')::date;
begin
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status in ('removed', 'clawed_back') then
    return jsonb_build_object('post_id', p.id, 'ignored', true, 'status', p.status);
  end if;
  v_views := greatest(p.views, p_views_verified);
  v_likes := greatest(p.likes, coalesce(p_likes, p.likes));
  v_comments := greatest(p.comments, coalesce(p_comments, p.comments));
  v_shares := greatest(p.shares, coalesce(p_shares, p.shares));
  v_saves := greatest(p.saves, coalesce(p_saves, p.saves));
  v_d_views := v_views - p.views;
  v_d_likes := v_likes - p.likes;
  v_d_comments := v_comments - p.comments;
  v_d_shares := v_shares - p.shares;
  v_d_saves := v_saves - p.saves;
  insert into public.post_metrics_hourly (post_id, ts, views, likes, comments, shares, fraud_score)
  values (p.id, v_hour, v_d_views, v_d_likes, v_d_comments, v_d_shares, p_fraud_score)
  on conflict (post_id, ts) do update set
    views = public.post_metrics_hourly.views + excluded.views, likes = public.post_metrics_hourly.likes + excluded.likes,
    comments = public.post_metrics_hourly.comments + excluded.comments, shares = public.post_metrics_hourly.shares + excluded.shares,
    fraud_score = excluded.fraud_score;
  insert into public.post_metrics_daily (post_id, date, views, likes, comments, shares, saves)
  values (p.id, v_day, v_d_views, v_d_likes, v_d_comments, v_d_shares, v_d_saves)
  on conflict (post_id, date) do update set
    views = public.post_metrics_daily.views + excluded.views, likes = public.post_metrics_daily.likes + excluded.likes,
    comments = public.post_metrics_daily.comments + excluded.comments, shares = public.post_metrics_daily.shares + excluded.shares,
    saves = public.post_metrics_daily.saves + excluded.saves;
  update public.posts
    set views = v_views, likes = v_likes, comments = v_comments, shares = v_shares, saves = v_saves,
        window_views = case when p_sampled_at <= p.window_ends_at and p.status = 'live' then least(v_views, greatest(p.window_views, p_views_verified)) else p.window_views end,
        funnel = jsonb_set(funnel, '{views}', to_jsonb(v_views))
    where id = p.id;
  if p_snapshot then
    insert into public.view_snapshots (id, post_id, taken_at, views_reported, views_verified, views_invalid, exclusions, delta_verified, source, sources, geo, flags, fraud_score)
    values (public.new_id('vsn'), p.id, p_sampled_at, greatest(p_views_reported, p_views_verified), p_views_verified, greatest(p_views_reported, p_views_verified) - p_views_verified,
            p_exclusions, 0, p_source, p_sources, p_geo, coalesce(p_flags, '{}'), p_fraud_score)
    on conflict (post_id, taken_at) do nothing;
  end if;
  return jsonb_build_object('post_id', p.id, 'views', v_views, 'delta_views', v_d_views);
end
$$;

-- ---------------------------------------------------------------------------
-- Escrow refunds: settlement and cancellation
-- ---------------------------------------------------------------------------
-- Release every reservation, then return what is left of the escrow (unspent budget and unused fee reserve) to the brand wallet.
create or replace function private.refund_escrow(p_bounty_id text, p_key text, p_memo text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  v_refund bigint;
begin
  select * into b from public.bounties where id = p_bounty_id for update;
  update public.submissions set reserved_cents = 0 where bounty_id = p_bounty_id and reserved_cents > 0;
  update public.bounties set remaining_cents = remaining_cents + reserved_cents, reserved_cents = 0 where id = p_bounty_id;
  select remaining_cents into v_refund from public.bounties where id = p_bounty_id;
  if v_refund > 0 then
    perform public.post_ledger_txn('escrow_refund', jsonb_build_array(
        jsonb_build_object('account', 'escrow:' || b.id, 'amount_cents', -v_refund, 'entry_type', 'escrow_refund', 'bounty_id', b.id, 'memo', p_memo),
        jsonb_build_object('account', 'wallet:' || b.brand_id, 'amount_cents', v_refund, 'entry_type', 'escrow_refund', 'bounty_id', b.id, 'memo', p_memo)),
      p_memo, p_key);
    update public.bounties set remaining_cents = 0, refunded_cents = refunded_cents + v_refund where id = p_bounty_id;
  end if;
  return v_refund;
end
$$;

-- ended -> settled: every window closed, no open work, no pending conversion; the unspent escrow returns to the wallet.
create or replace function public.settle_bounty(p_bounty_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  v_refund bigint;
begin
  select * into b from public.bounties where id = p_bounty_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if b.status = 'settled' then
    return jsonb_build_object('bounty_id', b.id, 'status', 'settled', 'idempotent', true);
  end if;
  if b.status <> 'ended' then
    raise exception 'conflict' using errcode = 'FD016', detail = format('bounty %s is %s; only an ended bounty settles', b.id, b.status);
  end if;
  if exists (select 1 from public.posts p where p.bounty_id = b.id and p.status in ('live', 'window_closed', 'held')) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'a post of this bounty is still counting, closing or held';
  end if;
  if exists (select 1 from public.submissions s where s.bounty_id = b.id and s.status in ('qa_pending', 'in_review', 'changes_requested', 'approved', 'appealed')) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'a submission of this bounty is still open';
  end if;
  if exists (select 1 from public.conversions c where c.bounty_id = b.id and c.status = 'pending' and c.payable) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'a conversion of this bounty is still inside its clearing window';
  end if;
  if exists (select 1 from public.posts p where p.bounty_id = b.id and p.posted_at + make_interval(days => private.ki('pay.cpa_window_days')::integer) > now()
             and (b.cpa_install_cents + b.cpa_trial_cents + b.cpa_paid_cents) > 0) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'a post of this bounty is still inside its 30-day conversion window';
  end if;
  v_refund := private.refund_escrow(b.id, 'refund:' || b.id, 'Refund of unspent budget: ' || b.title);
  update public.bounties set status = 'settled', settled_at = now() where id = b.id;
  perform public.refresh_bounty_counters(b.id);
  return jsonb_build_object('bounty_id', b.id, 'status', 'settled', 'refunded_cents', v_refund);
end
$$;

-- Cancel a bounty that has no approved work. A funded bounty returns its whole escrow to the wallet (the fee reserve included).
create or replace function public.cancel_bounty(p_bounty_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  v_refund bigint := 0;
begin
  select * into b from public.bounties where id = p_bounty_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if b.status = 'cancelled' then
    return jsonb_build_object('bounty_id', b.id, 'status', 'cancelled', 'idempotent', true);
  end if;
  if b.status not in ('draft', 'awaiting_funding', 'scheduled', 'live', 'paused') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('bounty %s is %s and cannot be cancelled', b.id, b.status);
  end if;
  if exists (select 1 from public.submissions s where s.bounty_id = b.id and s.status in ('approved', 'posted', 'released', 'appealed')) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'a bounty with approved work cannot be cancelled; end it instead',
      hint = 'Approved posts are always paid.';
  end if;
  if exists (select 1 from public.submissions s where s.bounty_id = b.id and s.status in ('qa_pending', 'in_review', 'changes_requested')) then
    raise exception 'conflict' using errcode = 'FD016', detail = 'decide or release the open submissions first';
  end if;
  if b.funded then
    v_refund := private.refund_escrow(b.id, 'refund:' || b.id, 'Refund of cancelled bounty: ' || b.title);
  end if;
  update public.bounties set status = 'cancelled', ended_at = coalesce(ended_at, now()) where id = b.id;
  return jsonb_build_object('bounty_id', b.id, 'status', 'cancelled', 'refunded_cents', v_refund);
end
$$;


-- ===========================================================================
-- M. Payouts: weekly runs, instant cash-out, completion, failure
--
--   Cleared earning rows (ledger, creator account, status cleared, payout_id null) are the creator's payable balance.
--   attach_cleared_earnings   a weekly payout for the next Friday 18:00 UTC run collects them as they clear (status scheduled)
--   start_payout              at the run: identity, tax and payout-method gates -> processing or held (named reason)
--   create_instant_payout     on demand: the whole cleared balance, fee shown first by instant_payout_quote
--   complete_payout           Stripe confirmed: the payout transaction posts and the rows become paid
--   fail_payout               the transfer failed: weekly payouts retry at the next run, instant ones release their rows
--   A clawback after payout leaves a negative cleared row, so it is recovered from the next payout automatically.
-- ===========================================================================
create or replace function private.fmt_money(p_cents bigint)
returns text
language sql
immutable
as $$
  select case when p_cents < 0 then '-$' else '$' end || to_char(abs(p_cents) / 100.0, 'FM999,999,990.00');
$$;

-- Make sure the payout_runs row for a Friday exists (payouts reference it).
create or replace function private.ensure_payout_run(p_run_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := 'run_' || to_char(p_run_at at time zone 'UTC', 'YYYY-MM-DD');
begin
  insert into public.payout_runs (id, run_date, scheduled_for, status)
  values (v_id, (p_run_at at time zone 'UTC')::date, p_run_at, 'scheduled')
  on conflict (id) do nothing;
  return v_id;
end
$$;

create or replace function private.payout_method_label(p_creator_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.label || ' ••' || m.last4 from public.payout_methods m where m.creator_id = p_creator_id and m.deleted_at is null and m.status = 'active'
      order by m.is_default desc, m.created_at limit 1),
    'No payout method yet');
$$;

-- Collect the creator's unattached cleared earnings into the weekly payout for the next run (created on first use, status scheduled).
create or replace function public.attach_cleared_earnings(p_creator_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  po public.payouts%rowtype;
  v_run_at timestamptz;
  v_run_id text;
  v_gross bigint;
  v_count integer;
  v_id text;
begin
  select * into c from public.creators where id = p_creator_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  select coalesce(sum(l.amount_cents), 0), count(*)::integer into v_gross, v_count
  from public.ledger l
  where l.creator_id = p_creator_id and l.account_kind = 'creator' and l.status = 'cleared' and l.payout_id is null;
  if v_count = 0 then
    return jsonb_build_object('attached', 0);
  end if;
  if v_gross <= 0 then
    return jsonb_build_object('attached', 0, 'reason', 'The cleared balance is not positive (a clawback is being recovered).');
  end if;
  v_run_at := public.weekly_payout_for(now());
  v_run_id := private.ensure_payout_run(v_run_at);
  select * into po from public.payouts p
    where p.creator_id = p_creator_id and p.kind = 'weekly' and p.run_id = v_run_id and p.status in ('scheduled', 'held')
    for update;
  if not found then
    v_id := public.new_id('pay');
    insert into public.payouts (id, creator_id, kind, status, gross_cents, fee_cents, net_cents, run_id, requested_at, scheduled_for, method_label,
                                item_count, tier_at_payout, free_instant, idempotency_key)
    values (v_id, p_creator_id, 'weekly', 'scheduled', 0, 0, 0, v_run_id, now(), v_run_at, private.payout_method_label(p_creator_id), 0, c.tier, false,
            'weekly:' || p_creator_id || ':' || v_run_id);
  else
    v_id := po.id;
  end if;
  update public.ledger set payout_id = v_id
    where creator_id = p_creator_id and account_kind = 'creator' and status = 'cleared' and payout_id is null;
  update public.payouts set gross_cents = gross_cents + v_gross, net_cents = net_cents + v_gross, item_count = item_count + v_count,
      method_label = private.payout_method_label(p_creator_id), tier_at_payout = c.tier
    where id = v_id;
  return jsonb_build_object('payout_id', v_id, 'run_id', v_run_id, 'attached', v_count, 'gross_cents', v_gross, 'scheduled_for', v_run_at);
end
$$;

-- At the Friday run: gate the payout (identity, tax info, payout method) and start it, or hold it with a named reason.
create or replace function public.start_payout(p_payout_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
  c public.creators%rowtype;
  v_method_id text;
  v_method_label text;
  v_tax public.tax_status;
  v_reason public.hold_reason;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if po.status <> 'scheduled' then
    return jsonb_build_object('payout_id', po.id, 'status', po.status, 'idempotent', true);
  end if;
  select * into c from public.creators where id = po.creator_id;
  select m.id, m.label || ' ••' || m.last4 into v_method_id, v_method_label from public.payout_methods m
    where m.creator_id = po.creator_id and m.deleted_at is null and m.status = 'active' order by m.is_default desc, m.created_at limit 1;
  select t.status into v_tax from public.tax_profiles t
    where t.creator_id = po.creator_id and t.tax_year = private.ki('tax.tax_year')::integer;
  v_reason := case
    when c.verification_status <> 'verified' then 'identity_check'::public.hold_reason
    when private.kt('tax.hold_payout_without_tax_info')::boolean and coalesce(v_tax, 'none') not in ('submitted', 'verified') then 'tax_info_missing'::public.hold_reason
    when v_method_id is null then 'payout_method_missing'::public.hold_reason
    else null end;
  if v_reason is not null then
    update public.payouts set status = 'held', hold_reason = v_reason where id = po.id;
    return jsonb_build_object('payout_id', po.id, 'status', 'held', 'hold_reason', v_reason);
  end if;
  update public.payouts
    set status = 'processing', hold_reason = null, initiated_at = now(), attempts = attempts + 1, payout_method_id = v_method_id,
        method_label = v_method_label
    where id = po.id;
  return jsonb_build_object('payout_id', po.id, 'status', 'processing', 'net_cents', po.net_cents, 'payout_method_id', v_method_id);
end
$$;

-- Ops or the creator fixed the cause: a held payout goes back to scheduled and the next run (or the retry) picks it up.
create or replace function public.release_payout_hold(p_payout_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if po.status <> 'held' then
    return jsonb_build_object('payout_id', po.id, 'status', po.status, 'idempotent', true);
  end if;
  update public.payouts set status = 'scheduled', hold_reason = null where id = po.id;
  return jsonb_build_object('payout_id', po.id, 'status', 'scheduled');
end
$$;

-- Instant cash-out preview: fee, net, free allowance and the named reason it is blocked (the API's PayoutPreview).
-- Callable by the creator, an admin and the service role.
create or replace function public.instant_payout_quote(p_creator_id text, p_amount_cents bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  v_available bigint;
  v_amount bigint;
  v_used integer;
  v_founding_free boolean;
  v_unlimited boolean;
  v_per_week integer;
  v_tax public.tax_status;
  v_method_ok boolean;
  v_blocked text;
  m record;
begin
  if not private.caller_is_service() and p_creator_id is distinct from private.current_creator_id() and not private.is_admin() then
    raise exception 'forbidden' using errcode = 'FD017';
  end if;
  select * into c from public.creators where id = p_creator_id;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  -- Cleared money is parked on the creator's scheduled weekly payout as soon as it clears (so the Wallet can show "pays Friday").
  -- An instant cash-out takes it back from that payout, so it counts as available here. A held weekly payout is not touched.
  select coalesce(sum(l.amount_cents), 0) into v_available
  from public.ledger l
  where l.creator_id = p_creator_id and l.account_kind = 'creator' and l.status = 'cleared'
    and (l.payout_id is null or l.payout_id in (select w.id from public.payouts w where w.creator_id = p_creator_id and w.kind = 'weekly' and w.status = 'scheduled'));
  v_amount := coalesce(p_amount_cents, v_available);
  select count(*)::integer into v_used
  from public.payouts p
  where p.creator_id = p_creator_id and p.kind = 'instant' and p.free_instant and p.status not in ('failed', 'cancelled')
    and p.requested_at >= (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC');
  v_founding_free := c.founding and now() < coalesce(c.founding_perks_until, c.joined_at + make_interval(months => private.ki('founding.free_instant_months')::integer));
  select * into m from public.instant_payout_math(v_amount, c.tier, v_founding_free, v_used);
  select t.status into v_tax from public.tax_profiles t where t.creator_id = p_creator_id and t.tax_year = private.ki('tax.tax_year')::integer;
  select exists (select 1 from public.payout_methods pm where pm.creator_id = p_creator_id and pm.deleted_at is null and pm.status = 'active' and pm.instant_capable) into v_method_ok;
  v_unlimited := private.kt('tiers.perks.' || c.tier::text || '.instant_cashout_unlimited')::boolean;
  v_per_week := private.ki('tiers.perks.' || c.tier::text || '.instant_cashout_free_per_week');
  v_blocked := case
    when not m.ok then m.reason
    when v_amount > v_available then 'exceeds_cleared'
    when c.verification_status <> 'verified' then 'identity_check_required'
    when coalesce(v_tax, 'none') not in ('submitted', 'verified') then 'tax_info_missing'
    when not v_method_ok then 'method_missing'
    else null end;
  return jsonb_build_object(
    'ok', v_blocked is null, 'blocked_reason', v_blocked, 'amount_cents', v_amount, 'fee_cents', m.fee_cents, 'net_cents', m.net_cents,
    'free_instant', m.free_instant, 'list_fee_cents', m.list_fee_cents, 'available_cents', v_available, 'tier', c.tier,
    'free_allowance', jsonb_build_object('unlimited', v_unlimited or v_founding_free, 'per_week', v_per_week, 'used_this_week', v_used)
  );
end
$$;

-- Instant cash-out of the whole cleared balance. The fee was shown first (instant_payout_quote); this re-checks every gate.
create or replace function public.create_instant_payout(p_creator_id text, p_idempotency_key text, p_actor_user_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.creators%rowtype;
  po public.payouts%rowtype;
  q jsonb;
  v_id text;
  v_method record;
  v_count integer;
  w public.payouts%rowtype;
  v_left bigint;
  v_left_n integer;
begin
  select * into po from public.payouts p where p.idempotency_key = 'instant:' || p_creator_id || ':' || p_idempotency_key;
  if found then
    return to_jsonb(po) || jsonb_build_object('idempotent', true);
  end if;
  select * into c from public.creators where id = p_creator_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  q := public.instant_payout_quote(p_creator_id, null);
  case q ->> 'blocked_reason'
    when 'below_minimum' then raise exception 'below_minimum' using errcode = 'FD006', detail = 'The minimum instant cash-out is $5.00.';
    when 'method_missing' then raise exception 'method_missing' using errcode = 'FD007';
    when 'tax_info_missing' then raise exception 'tax_info_missing' using errcode = 'FD008';
    when 'identity_check_required' then raise exception 'identity_check_required' using errcode = 'FD009';
    when 'exceeds_cleared' then raise exception 'conflict' using errcode = 'FD016', detail = 'Instant cash-out pays the whole cleared balance.';
    else null;
  end case;
  select * into v_method from public.payout_methods m
    where m.creator_id = p_creator_id and m.deleted_at is null and m.status = 'active' and m.instant_capable order by m.is_default desc, m.created_at limit 1;
  v_id := public.new_id('pay');
  insert into public.payouts (id, creator_id, kind, status, gross_cents, fee_cents, net_cents, requested_at, scheduled_for, initiated_at, method_label,
                              item_count, tier_at_payout, free_instant, idempotency_key, payout_method_id, attempts)
  values (v_id, p_creator_id, 'instant', 'processing', (q ->> 'amount_cents')::bigint, (q ->> 'fee_cents')::bigint, (q ->> 'net_cents')::bigint, now(), now(), now(),
          v_method.label || ' ••' || v_method.last4, 0, c.tier, (q ->> 'free_instant')::boolean, 'instant:' || p_creator_id || ':' || p_idempotency_key, v_method.id, 1);
  -- take the rows back from the scheduled weekly payout (release, then attach: a row is never moved directly between payouts) ...
  update public.ledger set payout_id = null
    where creator_id = p_creator_id and account_kind = 'creator' and status = 'cleared'
      and payout_id in (select wk.id from public.payouts wk where wk.creator_id = p_creator_id and wk.kind = 'weekly' and wk.status = 'scheduled');
  update public.ledger set payout_id = v_id
    where creator_id = p_creator_id and account_kind = 'creator' and status = 'cleared' and payout_id is null;
  get diagnostics v_count = row_count;
  update public.payouts set item_count = v_count where id = v_id;
  -- ... and shrink that payout to what is left on it; an empty one is cancelled (its idempotency key is freed for the next clearing run)
  for w in select * from public.payouts x where x.creator_id = p_creator_id and x.kind = 'weekly' and x.status = 'scheduled' for update loop
    select coalesce(sum(l.amount_cents), 0), count(*)::integer into v_left, v_left_n
      from public.ledger l where l.payout_id = w.id and l.account_kind = 'creator' and l.status = 'cleared';
    if v_left_n = 0 then
      update public.payouts set status = 'cancelled', gross_cents = 0, net_cents = 0, item_count = 0, idempotency_key = w.idempotency_key || ':cancelled:' || w.id where id = w.id;
    else
      update public.payouts set gross_cents = v_left, net_cents = v_left, item_count = v_left_n where id = w.id;
    end if;
  end loop;
  perform public.refresh_money_clock(p_creator_id);
  select * into po from public.payouts where id = v_id;
  return to_jsonb(po);
end
$$;

-- The transfer was created at Stripe: processing -> in_transit (the Money Clock shows "On its way to your bank").
create or replace function public.mark_payout_in_transit(p_payout_id text, p_stripe_transfer_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if po.status <> 'processing' then
    return jsonb_build_object('payout_id', po.id, 'status', po.status, 'idempotent', true);
  end if;
  update public.payouts set status = 'in_transit', stripe_transfer_id = p_stripe_transfer_id where id = po.id;
  perform public.refresh_money_clock(po.creator_id);
  return jsonb_build_object('payout_id', po.id, 'status', 'in_transit');
end
$$;

-- Stripe confirmed the transfer: post the payout transaction (creator -gross, bank +net, platform fee +fee), mark the rows paid,
-- the posts paid, and publish the (anonymous unless the creator shares stats) ticker event.
create or replace function public.complete_payout(p_payout_id text, p_stripe_transfer_id text default null, p_stripe_payout_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
  c public.creators%rowtype;
  v_sum bigint;
  v_txn text;
  v_legs jsonb;
  v_public boolean;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if po.status = 'paid' then
    return jsonb_build_object('payout_id', po.id, 'status', 'paid', 'idempotent', true);
  end if;
  if po.status not in ('processing', 'in_transit') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('payout %s is %s and cannot complete', po.id, po.status);
  end if;
  select coalesce(sum(l.amount_cents), 0) into v_sum
    from public.ledger l where l.payout_id = po.id and l.account_kind = 'creator' and l.status = 'cleared';
  if v_sum <> po.gross_cents then
    raise exception 'conflict' using errcode = 'FD016', detail = format('payout %s expects %s cents of cleared earnings but %s are attached', po.id, po.gross_cents, v_sum);
  end if;
  v_legs := jsonb_build_array(
    jsonb_build_object('account', 'creator:' || po.creator_id, 'amount_cents', -po.gross_cents, 'entry_type', 'payout', 'status', 'paid', 'payout_id', po.id,
      'creator_id', po.creator_id, 'memo', case when po.kind = 'weekly' then 'Weekly payout ' || coalesce(po.run_id, '') else format('Instant cash-out (fee %s)', private.fmt_money(po.fee_cents)) end),
    jsonb_build_object('account', 'external:bank', 'amount_cents', po.net_cents, 'entry_type', 'payout', 'status', 'paid', 'payout_id', po.id,
      'creator_id', po.creator_id, 'memo', case when po.kind = 'weekly' then 'Weekly payout ' || coalesce(po.run_id, '') else format('Instant cash-out (fee %s)', private.fmt_money(po.fee_cents)) end)
  );
  if po.fee_cents > 0 then
    v_legs := v_legs || jsonb_build_array(jsonb_build_object('account', 'platform:fees', 'amount_cents', po.fee_cents, 'entry_type', 'payout_fee', 'payout_id', po.id,
      'creator_id', po.creator_id, 'memo', 'Instant cash-out fee'));
  end if;
  v_txn := public.post_ledger_txn('payout', v_legs, 'Payout ' || po.id, 'payout:' || po.id);
  update public.ledger set status = 'paid', paid_at = now()
    where payout_id = po.id and account_kind = 'creator' and status = 'cleared';
  update public.posts set status = 'paid', paid_at = now()
    where status = 'cleared' and id in (select l.post_id from public.ledger l where l.payout_id = po.id and l.entry_type in ('cpm', 'flat_fee') and l.post_id is not null);
  if po.status = 'processing' then
    update public.payouts set status = 'in_transit' where id = po.id;
  end if;
  update public.payouts
    set status = 'paid', paid_at = now(), ledger_txn_id = v_txn, stripe_transfer_id = coalesce(p_stripe_transfer_id, stripe_transfer_id),
        stripe_payout_id = coalesce(p_stripe_payout_id, stripe_payout_id)
    where id = po.id;
  select * into c from public.creators where id = po.creator_id;
  v_public := coalesce((c.storefront ->> 'show_stats')::boolean, false);
  insert into public.ticker_events (id, kind, occurred_at, text, amount_cents, creator_id, handle, tier)
  values (public.new_id('tick'), 'payout', now(),
          case when v_public then '@' || c.handle || ' was paid ' || private.fmt_money(po.net_cents) else 'A ' || initcap(c.tier::text) || ' creator was paid ' || private.fmt_money(po.net_cents) end,
          po.net_cents, po.creator_id, case when v_public then c.handle end, c.tier);
  perform public.refresh_money_clock(po.creator_id);
  return jsonb_build_object('payout_id', po.id, 'status', 'paid', 'txn_id', v_txn, 'net_cents', po.net_cents, 'fee_cents', po.fee_cents);
end
$$;

-- The transfer failed. Weekly payouts keep their rows and retry at the next run (failed -> scheduled); instant payouts release their
-- rows so the balance is available again (weekly run or another cash-out).
create or replace function public.fail_payout(p_payout_id text, p_reason text, p_retry boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
  v_run_at timestamptz;
  v_run_id text;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if po.status = 'failed' or po.status = 'paid' then
    return jsonb_build_object('payout_id', po.id, 'status', po.status, 'idempotent', true);
  end if;
  if po.status not in ('processing', 'in_transit') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('payout %s is %s and cannot fail', po.id, po.status);
  end if;
  update public.payouts set status = 'failed', failed_reason = coalesce(p_reason, 'The transfer failed.') where id = po.id;
  if po.kind = 'instant' or not p_retry then
    update public.ledger set payout_id = null where payout_id = po.id and account_kind = 'creator' and status = 'cleared';
  else
    v_run_at := public.weekly_payout_for(now());
    v_run_id := private.ensure_payout_run(v_run_at);
    update public.payouts set status = 'scheduled', run_id = v_run_id, scheduled_for = v_run_at where id = po.id;
  end if;
  perform public.refresh_money_clock(po.creator_id);
  return jsonb_build_object('payout_id', po.id, 'status', (select p.status from public.payouts p where p.id = po.id));
end
$$;

-- ===========================================================================
-- N. Clawback (proven fraud only): reverse the pay of the invalid views; delivered legitimate views are still paid
-- ===========================================================================
-- Before calling, Ops record the invalid views on the post (posts.views_invalid) and confirm the fraud flag. The CPM leg is recomputed
-- on the valid views; the difference (pay + the fee on it) returns to the brand wallet in a new transaction that carries
-- reverses_txn_id. If every view was invalid the original rows are marked reversed. After a payout the creator balance may go
-- negative and is recovered from future earnings (the clawback row is an unpaid cleared row).
create or replace function public.claw_back(p_post_id text, p_reason text, p_actor_user_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.posts%rowtype;
  b public.bounties%rowtype;
  v_orig_txn text;
  v_old_pay bigint;
  v_new_pay bigint;
  v_claw_pay bigint;
  v_claw_fee bigint;
  v_orig_fee bigint;
  v_full boolean;
  v_was_paid boolean;
  v_txn text;
  v_legs jsonb;
begin
  select * into p from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if p.status = 'clawed_back' then
    return jsonb_build_object('post_id', p.id, 'status', 'clawed_back', 'idempotent', true);
  end if;
  if p.status not in ('held', 'cleared', 'paid') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('post %s is %s; only a settled post can be clawed back', p.id, p.status);
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'FD003';
  end if;
  select * into b from public.bounties where id = p.bounty_id;
  select l.txn_id, l.amount_cents into v_orig_txn, v_old_pay
    from public.ledger l
    where l.post_id = p.id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'flat_fee') and l.amount_cents > 0 and l.status <> 'reversed'
    order by l.seq limit 1;
  if v_orig_txn is null then
    -- nothing was ever settled for this post: just mark it
    update public.posts set status = 'clawed_back' where id = p.id;
    return jsonb_build_object('post_id', p.id, 'status', 'clawed_back', 'reversed_cents', 0);
  end if;
  if b.type = 'direct' then
    v_new_pay := 0;
  else
    v_new_pay := least(((greatest(0, p.window_views - p.views_invalid) * b.cpm_cents) + 500) / 1000, b.per_video_cap_cents);
  end if;
  v_claw_pay := greatest(0, v_old_pay - v_new_pay);
  v_full := v_new_pay = 0;
  -- Money already paid out cannot be taken back from the bank: the clawback leg stays a CLEARED negative row, which the next payout nets
  -- against (a creator balance may go negative and is recovered from future earnings). Money that never left (pending, held or cleared but
  -- not yet paid) is simply reversed: the original row and the clawback leg are both marked reversed and net to zero.
  v_was_paid := exists (
    select 1 from public.ledger l
    where l.post_id = p.id and l.account_kind = 'creator' and l.entry_type in ('cpm', 'flat_fee') and l.amount_cents > 0 and l.status = 'paid');
  select coalesce(sum(l.amount_cents), 0) into v_orig_fee from public.ledger l where l.txn_id = v_orig_txn and l.account = 'platform:fees' and l.amount_cents > 0;
  v_claw_fee := least(public.mul_rate(v_claw_pay, b.take_rate), v_orig_fee);
  if v_claw_pay > 0 then
    v_legs := jsonb_build_array(
      jsonb_build_object('account', 'creator:' || p.creator_id, 'amount_cents', -v_claw_pay, 'entry_type', 'clawback', 'status', case when v_full and not v_was_paid then 'reversed' else 'cleared' end,
        'post_id', p.id, 'bounty_id', b.id, 'creator_id', p.creator_id, 'memo', 'Clawback: proven view fraud (delivered views still paid)'),
      jsonb_build_object('account', 'wallet:' || p.brand_id, 'amount_cents', v_claw_pay + v_claw_fee, 'entry_type', 'clawback', 'post_id', p.id, 'bounty_id', b.id,
        'memo', 'Clawback: proven view fraud (delivered views still paid)'));
    if v_claw_fee > 0 then
      v_legs := v_legs || jsonb_build_array(jsonb_build_object('account', 'platform:fees', 'amount_cents', -v_claw_fee, 'entry_type', 'clawback', 'post_id', p.id, 'bounty_id', b.id,
        'memo', 'Clawback: proven view fraud (delivered views still paid)'));
    end if;
    v_txn := public.post_ledger_txn('clawback', v_legs, 'Clawback: ' || p_reason, 'clawback:' || p.id, p_actor_user_id, v_orig_txn);
  end if;
  if v_full and not v_was_paid then
    update public.ledger set status = 'reversed'
      where post_id = p.id and account_kind = 'creator' and entry_type in ('cpm', 'flat_fee') and amount_cents > 0 and status in ('pending', 'held', 'cleared');
  end if;
  update public.posts
    set status = 'clawed_back', earnings = jsonb_set(jsonb_set(earnings, '{cpm_cents}', to_jsonb(v_new_pay)), '{total_cents}', to_jsonb(greatest(0, (earnings ->> 'total_cents')::bigint - v_claw_pay)))
    where id = p.id;
  insert into public.audit_log (actor_user_id, actor_kind, action, target_table, target_id, reason, after)
  values (p_actor_user_id, (case when p_actor_user_id is null then 'system' else 'admin' end)::public.actor_kind, 'fraud.clawback', 'posts', p.id, p_reason,
          jsonb_build_object('txn_id', v_txn, 'reversed_pay_cents', v_claw_pay, 'reversed_fee_cents', v_claw_fee, 'full', v_full));
  perform public.refresh_creator_stats(p.creator_id);
  perform public.refresh_money_clock(p.creator_id);
  return jsonb_build_object('post_id', p.id, 'status', 'clawed_back', 'txn_id', v_txn, 'reversed_pay_cents', v_claw_pay, 'reversed_fee_cents', v_claw_fee, 'full', v_full);
end
$$;

-- ===========================================================================
-- O. Daily Drop claim and the privacy erasure
-- ===========================================================================
-- Claim a real spot of a live drop: a 24-hour reserved place to submit (inventory is checked under a row lock by the claim guard).
create or replace function public.claim_drop_spot(p_drop_id text, p_bounty_id text, p_creator_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bounties%rowtype;
  v_expires timestamptz := now() + make_interval(hours => private.ki('daily_drop.claim_window_hours')::integer);
  v_left integer;
begin
  select * into b from public.bounties where id = p_bounty_id;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  if b.eligibility ? 'min_tier' and private.creator_tier_at_least(p_creator_id, (b.eligibility ->> 'min_tier')::public.tier) is not true then
    raise exception 'tier_locked' using errcode = 'FD010', detail = format('this bounty needs %s or above', b.eligibility ->> 'min_tier');
  end if;
  begin
    insert into public.drop_claims (drop_id, bounty_id, creator_id, expires_at) values (p_drop_id, p_bounty_id, p_creator_id, v_expires);
  exception when unique_violation then
    raise exception 'conflict' using errcode = 'FD016', detail = 'you already claimed a spot on this item';
  end;
  insert into public.bounty_saves (id, creator_id, bounty_id, stage, saved_at, claimed_until, drop_id)
  values (public.new_id('save'), p_creator_id, p_bounty_id, 'joined', now(), v_expires, p_drop_id)
  on conflict (creator_id, bounty_id) do update set stage = 'joined', claimed_until = excluded.claimed_until, drop_id = excluded.drop_id, updated_at = now();
  select (i.spots_total - (select count(*) from public.drop_claims c where c.drop_id = i.drop_id and c.bounty_id = i.bounty_id))::integer into v_left
    from public.drop_items i where i.drop_id = p_drop_id and i.bounty_id = p_bounty_id;
  return jsonb_build_object('drop_id', p_drop_id, 'bounty_id', p_bounty_id, 'claimed_until', v_expires, 'spots_left', v_left);
end
$$;

-- GDPR / CCPA erasure: anonymise the person, keep the ledger (it carries ids only) and refuse while money is unsettled.
create or replace function public.erase_user(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.users%rowtype;
  v_creator text;
begin
  select * into u from public.users where id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021';
  end if;
  perform set_config('flowd.erasure_mode', 'on', true);
  select c.id into v_creator from public.creators c where c.user_id = u.id;
  if v_creator is not null then
    update public.creators
      set display_name = 'Deleted creator', bio = '', handle = 'deleted.' || substr(replace(id, 'cr_', ''), 1, 20), avatar = public.default_art_seed(id, '?'),
          storefront = jsonb_build_object('slug', 'deleted.' || substr(replace(id, 'cr_', ''), 1, 20), 'headline', '', 'show_stats', false, 'cta_label', '', 'theme', 'ink', 'featured_post_ids', '[]'::jsonb),
          portfolio = '[]'::jsonb, open_to_offers = false, stripe_account_id = null, deleted_at = coalesce(deleted_at, now())
      where id = v_creator;
    update public.social_accounts set handle = 'deleted', platform_user_id = null, status = 'revoked', deleted_at = coalesce(deleted_at, now()) where creator_id = v_creator;
    delete from public.social_account_tokens where social_account_id in (select sa.id from public.social_accounts sa where sa.creator_id = v_creator);
    update public.payout_methods set deleted_at = coalesce(deleted_at, now()), stripe_external_account_id = null where creator_id = v_creator;
    update public.tax_profiles set legal_name = null, address = null, tin_last4 = null where creator_id = v_creator;
    update public.flo_suggestions set prompt = '[removed]', outputs = '{}' where creator_id = v_creator;
  end if;
  update public.users
    set email = 'erased+' || id || '@users.invalid', display_name = 'Deleted user', avatar = public.default_art_seed(id, '?'), auth_providers = array['email']::public.auth_provider[],
        status = 'deleted', deleted_at = coalesce(deleted_at, now()), pii_erased_at = now(), auth_user_id = null, title = null, last_seen_at = null
    where id = u.id;
  update public.notifications set title = 'Removed', body = 'Removed', deep_link = 'flowd://home' where recipient_user_id = u.id;
  update public.chat_messages set body = '[removed]' where author_user_id = u.id;
  update public.offer_messages set body = '[removed]' where author_user_id = u.id;
  update public.activity_log set summary = 'A former team member made a change.'
    where actor_member_id in (select m.id from public.brand_members m where m.user_id = u.id);
  update public.brand_members set status = 'removed' where user_id = u.id and status <> 'removed';
  insert into public.audit_log (actor_kind, action, target_table, target_id, reason)
  values ('system', 'privacy.erase_user', 'users', u.id, 'Erasure request fulfilled');
  return jsonb_build_object('user_id', u.id, 'erased', true, 'creator_id', v_creator);
end
$$;

-- Perceptual-hash duplicates of a post: other posts, earlier than this one, whose latest analysed video is within the duplicate distance
-- (6 bits of 64) of this post's. Same creator = reposting their own earlier video; another creator = copied footage. The settlement gate
-- feeds the closest match to the fraud model (signal duplicate_hash, 20 points).
create or replace function public.phash_duplicates(p_post_id text, p_max_distance integer default null)
returns table (other_post_id text, other_creator_id text, distance integer, same_creator boolean, other_posted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.creator_id, p.posted_at, va.phash
    from public.posts p
    join lateral (select v.phash from public.video_analyses v where v.submission_id = p.submission_id order by v.version desc limit 1) va on true
    where p.id = p_post_id and va.phash ~ '^[0-9a-f]{16}$'
  )
  select o.id, o.creator_id, public.phash_distance(me.phash, ova.phash), o.creator_id = me.creator_id, o.posted_at
  from me
  join public.posts o on o.id <> me.id and o.posted_at < me.posted_at and o.status <> 'removed'
  join lateral (select v.phash from public.video_analyses v where v.submission_id = o.submission_id order by v.version desc limit 1) ova on ova.phash ~ '^[0-9a-f]{16}$'
  where public.phash_distance(me.phash, ova.phash) <= coalesce(p_max_distance, private.ki('fraud.duplicate_phash_max_distance'))
  order by 3, o.posted_at
  limit 5;
$$;

-- ===========================================================================
-- P. Ledger audit (the admin ledger explorer's balance proof and anomaly detector)
-- ===========================================================================
create or replace function public.audit_ledger()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unbalanced jsonb;
  v_balances jsonb;
  v_wallets jsonb;
  v_escrows jsonb;
  v_negative jsonb;
begin
  if not private.caller_is_service() and not private.is_admin() then
    raise exception 'forbidden' using errcode = 'FD017';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('txn_id', t.txn_id, 'net_cents', t.net)), '[]'::jsonb) into v_unbalanced
    from (select l.txn_id, sum(l.amount_cents) as net from public.ledger l group by l.txn_id having sum(l.amount_cents) <> 0) t;
  select coalesce(jsonb_agg(jsonb_build_object('account', x.account, 'cached_cents', x.cached, 'ledger_cents', x.actual)), '[]'::jsonb) into v_balances
    from (
      select coalesce(b.account, s.account) as account, coalesce(b.balance_cents, 0) as cached, coalesce(s.sum, 0) as actual
      from public.ledger_balances b
      full join (select l.account, sum(l.amount_cents) as sum from public.ledger l group by l.account) s on s.account = b.account
      where coalesce(b.balance_cents, 0) <> coalesce(s.sum, 0)
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('brand_id', br.id, 'wallet_balance_cents', br.wallet_balance_cents, 'ledger_cents', coalesce(b.balance_cents, 0))), '[]'::jsonb) into v_wallets
    from public.brands br
    left join public.ledger_balances b on b.account = 'wallet:' || br.id
    where br.wallet_balance_cents <> coalesce(b.balance_cents, 0);
  select coalesce(jsonb_agg(jsonb_build_object('bounty_id', bo.id, 'reserved_plus_remaining_cents', bo.reserved_cents + bo.remaining_cents, 'ledger_cents', coalesce(b.balance_cents, 0))), '[]'::jsonb) into v_escrows
    from public.bounties bo
    left join public.ledger_balances b on b.account = 'escrow:' || bo.id
    where bo.reserved_cents + bo.remaining_cents <> coalesce(b.balance_cents, 0);
  select coalesce(jsonb_agg(jsonb_build_object('account', b.account, 'balance_cents', b.balance_cents)), '[]'::jsonb) into v_negative
    from public.ledger_balances b
    where b.balance_cents < 0 and (b.account like 'wallet:%' or b.account like 'escrow:%' or (b.account like 'platform:%' and b.account not in ('platform:promo', 'platform:matching')));
  return jsonb_build_object(
    'ok', v_unbalanced = '[]'::jsonb and v_balances = '[]'::jsonb and v_wallets = '[]'::jsonb and v_escrows = '[]'::jsonb and v_negative = '[]'::jsonb,
    'unbalanced_transactions', v_unbalanced, 'balance_mismatches', v_balances, 'wallet_projection_mismatches', v_wallets,
    'escrow_mismatches', v_escrows, 'negative_floors', v_negative,
    'transactions', (select count(*) from public.ledger_transactions), 'legs', (select count(*) from public.ledger)
  );
end
$$;

-- Next-invoice and scam-case numbers (FD-2026-0042, SR-2026-0042).
create or replace function public.next_invoice_number(p_at timestamptz default now())
returns text
language sql
volatile
as $$
  select 'FD-' || to_char(p_at at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;

create or replace function public.next_scam_case_id(p_at timestamptz default now())
returns text
language sql
volatile
as $$
  select 'SR-' || to_char(p_at at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.scam_case_seq')::text, 4, '0');
$$;

-- ===========================================================================
-- Q. Grants. Everything is revoked from clients by default (0002). Pure formula and quote functions are public; creator-data
--    functions check the caller inside; every mutating function is service_role only.
-- ===========================================================================
grant execute on function private.kj(text), private.kn(text), private.ki(text), private.kt(text) to anon, authenticated, service_role;

do $grant$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'bps', 'mul_rate', 'round2', 'clamp_num', 'card_processing', 'take_rate', 'funding', 'first_bounty_funding', 'all_in_cpm', 'all_in_rate',
      'reservation_unit', 'spots_left', 'settle_post_math', 'ad_commission', 'ad_platform_fee', 'instant_payout_math', 'meets_tier', 'tier_for',
      'tier_progress', 'fraud_band_for', 'fraud_score', 'fraud_action', 'phash_distance', 'first_run_at_or_after', 'post_clearing_run',
      'conversion_clearing_run', 'next_weekly_at', 'weekly_payout_for', 'money_clock_state_for', 'sla_state_for', 'fill_time', 'price_curve',
      'match_score', 'creator_reliability_calc', 'brand_reliability_calc', 'brand_badges', 'brand_reliability'
    ])
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array['creator_reliability', 'instant_payout_quote'])
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$grant$;

grant execute on all functions in schema public to service_role;
