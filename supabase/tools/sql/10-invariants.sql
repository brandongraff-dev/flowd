-- Invariants: the rules the database enforces no matter which client, job or admin tool attempts a write.
--
--   1. Constants accessors (private.kn / ki / kt / kj) reading public.flowd_constants.
--   2. updated_at touch trigger.
--   3. State machines as data (public.state_transitions) with generic BEFORE triggers.
--   4. Append-only tables (activity_log, audit_log, offer_messages, dispute_events, rule_audit_log, chat_messages).
--   5. The double-entry ledger: fill links, append-only guard, running balances, per-transaction balance (deferred),
--      balance floors and wallet holds (deferred).
--   6. Escrow: the bounty escrow identity (CHECK, in the table DDL) reconciled with the ledger at commit.
--   7. View snapshots, Daily Drop inventory, crew size, offer-code cap, brand owner, review decisions.
--   8. Hourly metrics partitions.
--
-- Error codes: every business rule raises SQLSTATE FDnnn with a stable message (the API error code), see
-- docs/ARCHITECTURE.md "Error codes". FD001 pool_exhausted, FD002 bounty_not_funded, FD003 reason_required,
-- FD004 revision_limit, FD005 appeal_used, FD006 below_minimum, FD007 method_missing, FD008 tax_info_missing,
-- FD009 identity_check_required, FD010 tier_locked, FD011 sla_not_started, FD012 idempotency_conflict,
-- FD013 invalid_transition, FD014 ledger_unbalanced, FD015 ledger_immutable / append_only, FD016 conflict,
-- FD017 forbidden, FD018 insufficient_funds, FD019 escrow_ledger_mismatch, FD020 snapshot_regression, FD021 not_found,
-- FD022 validation_failed.
--
-- Seed mode: `set local flowd.seed_mode = 'on'` (supabase/seed.sql does this) skips the *soft* rules (state-machine
-- edges, owner required, crew size, snapshot order, claim guards) so fixtures can load rows in any historical state.
-- It never skips the money rules: ledger balance, escrow identity and reconciliation are checked at commit even for seeds.

-- ---------------------------------------------------------------------------
-- 1. Constants
-- ---------------------------------------------------------------------------
create or replace function private.kj(p_path text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select c.value into v from public.flowd_constants c where c.path = p_path;
  if not found then
    raise exception 'unknown constant %', p_path using errcode = 'P0002';
  end if;
  return v;
end
$$;

create or replace function private.kn(p_path text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (private.kj(p_path) #>> '{}')::numeric;
$$;

create or replace function private.ki(p_path text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (private.kj(p_path) #>> '{}')::bigint;
$$;

create or replace function private.kt(p_path text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.kj(p_path) #>> '{}';
$$;

-- ---------------------------------------------------------------------------
-- 2. updated_at
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. State machines
-- ---------------------------------------------------------------------------
create or replace function private.assert_transition(p_machine text, p_from text, p_to text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is not distinct from p_to then
    return;
  end if;
  if not exists (
    select 1 from public.state_transitions t
    where t.machine = p_machine and t.from_state is not distinct from p_from and t.to_state = p_to
  ) then
    raise exception 'invalid_transition' using errcode = 'FD013',
      detail = format('%s: %s -> %s is not an allowed transition', p_machine, coalesce(p_from, '(new)'), p_to),
      hint = 'See public.state_transitions for the allowed moves.';
  end if;
end
$$;

-- Generic trigger: tg_argv[0] = machine name, tg_argv[1] = status column. Attached BEFORE INSERT and
-- BEFORE UPDATE OF <column> (WHEN old <> new) on every table that follows a contract state machine.
create or replace function private.enforce_state_machine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_machine text := tg_argv[0];
  v_col text := tg_argv[1];
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform private.assert_transition(v_machine, null, to_jsonb(new) ->> v_col);
  else
    perform private.assert_transition(v_machine, to_jsonb(old) ->> v_col, to_jsonb(new) ->> v_col);
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Append-only tables. tg_argv lists the columns that MAY change (none for most).
-- ---------------------------------------------------------------------------
create or replace function private.append_only_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only' using errcode = 'FD015', detail = format('%s rows are never deleted', tg_table_name);
  end if;
  if current_setting('flowd.erasure_mode', true) = 'on' then
    return new; -- public.erase_user() anonymises personal text inside audit-style tables
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_col in array coalesce(tg_argv, '{}'::text[]) loop -- tg_argv is NULL (not empty) when the trigger has no arguments
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  end loop;
  if v_old is distinct from v_new then
    raise exception 'append_only' using errcode = 'FD015', detail = format('%s rows are immutable', tg_table_name);
  end if;
  return new;
end
$$;

create or replace function private.no_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append_only' using errcode = 'FD015', detail = format('truncate of %s is not allowed', tg_table_name);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. The ledger
-- ---------------------------------------------------------------------------
-- 5a. Fill the typed link (brand_id, bounty_id, creator_id) from the account string and refuse contradictions.
create or replace function private.ledger_fill_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := split_part(new.account, ':', 1);
  v_ref text := substr(new.account, strpos(new.account, ':') + 1);
begin
  if v_kind = 'wallet' then
    if new.brand_id is null then new.brand_id := v_ref;
    elsif new.brand_id <> v_ref then raise exception 'ledger_link_mismatch' using errcode = 'FD022', detail = format('%s carries brand_id %s', new.account, new.brand_id);
    end if;
  elsif v_kind = 'escrow' then
    if new.bounty_id is null then new.bounty_id := v_ref;
    elsif new.bounty_id <> v_ref then raise exception 'ledger_link_mismatch' using errcode = 'FD022', detail = format('%s carries bounty_id %s', new.account, new.bounty_id);
    end if;
  elsif v_kind = 'creator' then
    if new.creator_id is null then new.creator_id := v_ref;
    elsif new.creator_id <> v_ref then raise exception 'ledger_link_mismatch' using errcode = 'FD022', detail = format('%s carries creator_id %s', new.account, new.creator_id);
    end if;
  end if;
  if current_setting('flowd.seed_mode', true) is distinct from 'on' then
    -- earning rows become paid only through a payout (update); only the payout legs themselves are written as paid
    if new.status = 'paid' and new.entry_type not in ('payout', 'payout_fee') then
      raise exception 'ledger_immutable' using errcode = 'FD015', detail = 'earning rows are marked paid by a payout, never inserted as paid';
    end if;
  end if;
  return new;
end
$$;

-- 5b. Append-only: only status, cleared_at, paid_at and payout_id may change, and status only along the ledger machine.
create or replace function private.ledger_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger_immutable' using errcode = 'FD015', detail = 'ledger rows are never deleted; post a reversing transaction instead';
  end if;
  -- account_kind and account_ref are stored generated columns: Postgres computes them after BEFORE triggers, so NEW carries NULL there.
  if (to_jsonb(new) - 'status' - 'cleared_at' - 'paid_at' - 'payout_id' - 'account_kind' - 'account_ref')
     is distinct from (to_jsonb(old) - 'status' - 'cleared_at' - 'paid_at' - 'payout_id' - 'account_kind' - 'account_ref') then
    raise exception 'ledger_immutable' using errcode = 'FD015', detail = 'only status, cleared_at, paid_at and payout_id may change; post a reversing transaction instead';
  end if;
  if new.status is distinct from old.status then
    perform private.assert_transition('ledger', old.status::text, new.status::text);
    if new.status = 'cleared' and new.cleared_at is null then
      new.cleared_at := now();
    end if;
    if new.status = 'paid' and new.paid_at is null then
      new.paid_at := now();
    end if;
  end if;
  if new.payout_id is distinct from old.payout_id then
    if old.payout_id is not null and new.payout_id is not null then
      raise exception 'ledger_immutable' using errcode = 'FD015', detail = 'a row can be attached to a payout or released from it, never moved between payouts';
    end if;
    if old.status = 'paid' and new.payout_id is null then
      raise exception 'ledger_immutable' using errcode = 'FD015', detail = 'a paid row keeps its payout';
    end if;
  end if;
  return new;
end
$$;

-- 5c. Running balance per account. The upsert takes the row lock that serialises concurrent postings to one account.
create or replace function private.ledger_apply_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_balances as b (account, balance_cents, updated_at)
  values (new.account, new.amount_cents, now())
  on conflict (account) do update
    set balance_cents = b.balance_cents + excluded.balance_cents, updated_at = now();
  return null;
end
$$;

-- 5d. Every transaction nets to exactly zero, has at least two legs and is posted in one database transaction.
--     Deferred: legs may be inserted in any order inside the transaction; the check runs at COMMIT.
create or replace function private.ledger_txn_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum bigint;
  v_legs integer;
  v_tx integer;
begin
  select coalesce(sum(l.amount_cents), 0), count(*), count(distinct l.db_txid)
    into v_sum, v_legs, v_tx
  from public.ledger l
  where l.txn_id = new.txn_id;
  if v_sum <> 0 then
    raise exception 'ledger_unbalanced' using errcode = 'FD014',
      detail = format('transaction %s nets to %s cents; every transaction must net to exactly 0', new.txn_id, v_sum);
  end if;
  if v_legs < 2 then
    raise exception 'ledger_unbalanced' using errcode = 'FD014', detail = format('transaction %s has a single leg', new.txn_id);
  end if;
  if v_tx <> 1 then
    raise exception 'ledger_immutable' using errcode = 'FD015',
      detail = format('transaction %s was extended after it was posted; post a new transaction instead', new.txn_id);
  end if;
  return null;
end
$$;

-- 5e. Balance floors at COMMIT: wallet >= active holds (so >= 0), escrow >= 0, platform accounts >= 0 except the
--     treasury accounts platform:promo and platform:matching. Creator balances may go negative after a clawback
--     (recovered from future earnings). The wallet balance is projected onto brands.wallet_balance_cents here.
create or replace function private.ledger_balance_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := split_part(new.account, ':', 1);
  v_ref text := substr(new.account, strpos(new.account, ':') + 1);
  v_holds bigint;
  v_bal bigint;
begin
  -- A deferred row trigger sees the row as it was when the event was queued. Re-read the committed-so-far balance so that only the
  -- final state of the account inside the transaction is judged (an account may pass through a lower value on the way).
  select b.balance_cents into v_bal from public.ledger_balances b where b.account = new.account;
  if v_bal is null then
    return null;
  end if;
  if v_kind = 'wallet' then
    select coalesce(sum(h.amount_cents), 0) into v_holds from public.wallet_holds h where h.brand_id = v_ref and h.status = 'active';
    if v_bal < v_holds then
      raise exception 'insufficient_funds' using errcode = 'FD018',
        detail = format('%s holds %s cents of which %s are on hold', new.account, v_bal, v_holds);
    end if;
    update public.brands set wallet_balance_cents = v_bal
    where id = v_ref and wallet_balance_cents is distinct from v_bal;
  elsif v_kind = 'escrow' then
    if v_bal < 0 then
      raise exception 'insufficient_funds' using errcode = 'FD018', detail = format('%s would go to %s cents', new.account, v_bal);
    end if;
  elsif v_kind = 'platform' and v_ref not in ('promo', 'matching') then
    if v_bal < 0 then
      raise exception 'insufficient_funds' using errcode = 'FD018', detail = format('%s would go to %s cents', new.account, v_bal);
    end if;
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Escrow reconciliation: the ledger balance of escrow:<bounty> must equal reserved + remaining (money that is
--    neither spent nor refunded). The identity escrow_funded = reserved + spent + remaining + refunded is a CHECK.
-- ---------------------------------------------------------------------------
create or replace function private.bounty_escrow_reconcile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal bigint;
  b public.bounties%rowtype;
begin
  if current_setting('flowd.skip_reconcile', true) = 'on' then
    return null;
  end if;
  -- A deferred row trigger sees the row as it was when the event was queued (for example the INSERT of a draft, long before funding).
  -- Judge the bounty as it stands at the end of the transaction.
  select * into b from public.bounties x where x.id = new.id;
  if not found then
    return null;
  end if;
  select l.balance_cents into v_bal from public.ledger_balances l where l.account = 'escrow:' || b.id;
  v_bal := coalesce(v_bal, 0);
  if v_bal <> b.reserved_cents + b.remaining_cents then
    raise exception 'escrow_ledger_mismatch' using errcode = 'FD019',
      detail = format('bounty %s: ledger escrow %s <> reserved %s + remaining %s', b.id, v_bal, b.reserved_cents, b.remaining_cents);
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Business guards
-- ---------------------------------------------------------------------------
-- 7a. View Ledger: verified views never decrease (except a logged manual adjustment); delta is derived.
create or replace function private.view_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev bigint;
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  select s.views_verified into v_prev
  from public.view_snapshots s
  where s.post_id = new.post_id and s.taken_at < new.taken_at
  order by s.taken_at desc
  limit 1;
  v_prev := coalesce(v_prev, 0);
  if new.source <> 'manual_adjust' and new.views_verified < v_prev then
    raise exception 'snapshot_regression' using errcode = 'FD020',
      detail = format('post %s: verified views fell from %s to %s', new.post_id, v_prev, new.views_verified);
  end if;
  new.delta_verified := new.views_verified - v_prev;
  return new;
end
$$;

-- 7b. Daily Drop: a claim needs a live drop and a true spot; counts on daily_drops are derived from the rows.
create or replace function private.drop_claim_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_claimed integer;
  v_status public.drop_status;
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  select i.spots_total into v_total
  from public.drop_items i
  where i.drop_id = new.drop_id and i.bounty_id = new.bounty_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'FD021', detail = 'that bounty is not part of this drop';
  end if;
  select d.status into v_status from public.daily_drops d where d.id = new.drop_id;
  if v_status = 'sold_out' then
    raise exception 'pool_exhausted' using errcode = 'FD001', detail = 'this drop is sold out';
  end if;
  if v_status <> 'live' then
    raise exception 'conflict' using errcode = 'FD016', detail = format('drop %s is %s, claims open only while it is live', new.drop_id, v_status);
  end if;
  select count(*) into v_claimed from public.drop_claims c where c.drop_id = new.drop_id and c.bounty_id = new.bounty_id;
  if v_claimed >= v_total then
    raise exception 'pool_exhausted' using errcode = 'FD001', detail = 'no spots left on that item';
  end if;
  return new;
end
$$;

create or replace function private.drop_inventory_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drop text;
begin
  if tg_op = 'DELETE' then
    v_drop := old.drop_id;
  else
    v_drop := new.drop_id;
  end if;
  update public.daily_drops d
  set spots_total = s.total,
      claims_total = s.claims,
      spots_left = s.total - s.claims,
      status = case when d.status = 'live' and s.total > 0 and s.total - s.claims = 0 then 'sold_out'::public.drop_status else d.status end
  from (
    select coalesce((select sum(i.spots_total) from public.drop_items i where i.drop_id = v_drop), 0)::integer as total,
           coalesce((select count(*) from public.drop_claims c where c.drop_id = v_drop), 0)::integer as claims
  ) s
  where d.id = v_drop;
  return null;
end
$$;

-- 7c. Crews: at most 20 members; member_count is derived.
create or replace function private.crew_member_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  select c.member_count into v_count from public.crews c where c.id = new.crew_id for update;
  if v_count >= private.ki('crews.max_members') then
    raise exception 'conflict' using errcode = 'FD016', detail = 'that crew is full';
  end if;
  return new;
end
$$;

create or replace function private.crew_member_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crew text;
begin
  if tg_op = 'DELETE' then
    v_crew := old.crew_id;
  else
    v_crew := new.crew_id;
  end if;
  update public.crews c
  set member_count = (select count(*) from public.crew_members m where m.crew_id = v_crew)
  where c.id = v_crew;
  return null;
end
$$;

-- 7d. Apple caps active offer codes at 10 per subscription SKU: available + assigned codes never exceed the cap.
create or replace function private.offer_code_cap_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  select count(*) into v_active
  from public.offer_code_pool p
  where p.app_id = new.app_id and p.sku = new.sku and p.status in ('available', 'assigned');
  if v_active > private.ki('attribution.apple_active_offers_per_sku') then
    raise exception 'conflict' using errcode = 'FD016',
      detail = format('app %s sku %s has %s active offer codes; Apple allows %s', new.app_id, new.sku, v_active, private.ki('attribution.apple_active_offers_per_sku'));
  end if;
  return null;
end
$$;

-- 7e. A live workspace always has an active owner (checked at COMMIT so owners can be swapped, and so a new workspace can be created
--     and given its owner in one transaction).
create or replace function private.brand_owner_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand text;
begin
  if current_setting('flowd.seed_mode', true) = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    v_brand := old.brand_id;
  else
    v_brand := new.brand_id;
  end if;
  if exists (select 1 from public.brands b where b.id = v_brand and b.deleted_at is null)
     and not exists (select 1 from public.brand_members m where m.brand_id = v_brand and m.status = 'active' and m.role = 'owner') then
    raise exception 'conflict' using errcode = 'FD016', detail = format('workspace %s must keep at least one active owner', v_brand);
  end if;
  return null;
end
$$;

-- 7f. No-Rug Approvals: a rejection carries a reason code and evidence; request-changes carries a reason code.
create or replace function private.submission_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := new.decision ->> 'action';
begin
  if new.decision is null or current_setting('flowd.seed_mode', true) = 'on' then
    return new;
  end if;
  if v_action in ('reject', 'auto_reject') and not (new.decision ? 'reason_code' and new.decision ? 'evidence') then
    raise exception 'reason_required' using errcode = 'FD003', detail = 'A rejection needs a reason code and evidence.',
      hint = 'Cite the stated requirement and attach a timecode, QA check or brief quote.';
  end if;
  if v_action = 'request_changes' and not (new.decision ? 'reason_code') then
    raise exception 'reason_required' using errcode = 'FD003', detail = 'Requesting changes needs a reason code.';
  end if;
  return new;
end
$$;

-- 7g. Rows that hold money are never soft deleted while the money is still there.
create or replace function private.brand_soft_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and new.wallet_balance_cents > 0 then
    raise exception 'conflict' using errcode = 'FD016', detail = 'withdraw or refund the wallet balance before closing the workspace';
  end if;
  return new;
end
$$;

create or replace function private.creator_soft_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and exists (
    select 1 from public.ledger l
    where l.creator_id = new.id and l.account_kind = 'creator' and l.status in ('pending', 'cleared', 'held')
  ) then
    -- any unsettled row, attached to a scheduled payout or not: money owed to the creator, money in flight, or a clawback debt
    raise exception 'conflict' using errcode = 'FD016', detail = 'pay out or resolve the creator balance before closing the account';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Hourly metrics partitions (range on ts, one per month). Created statically for the demo history and the first
--    18 months, and on demand by the housekeeping job via this function.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_hourly_partitions(p_months_ahead integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_name text;
  v_made integer := 0;
  i integer;
begin
  for i in -1 .. p_months_ahead loop
    v_month := (date_trunc('month', now() at time zone 'UTC') + make_interval(months => i))::date;
    v_name := 'post_metrics_hourly_' || to_char(v_month, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.post_metrics_hourly for values from (%L) to (%L)',
        v_name,
        to_char(v_month, 'YYYY-MM-DD') || ' 00:00:00+00',
        to_char((v_month + interval '1 month')::date, 'YYYY-MM-DD') || ' 00:00:00+00'
      );
      v_made := v_made + 1;
    end if;
  end loop;
  return v_made;
end
$$;
revoke all on function public.ensure_hourly_partitions(integer) from public, anon, authenticated;
grant execute on function public.ensure_hourly_partitions(integer) to service_role;

do $$
declare
  v_month date := date '2026-07-01';
  v_name text;
begin
  while v_month < date '2028-01-01' loop
    v_name := 'post_metrics_hourly_' || to_char(v_month, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.post_metrics_hourly for values from (%L) to (%L)',
        v_name,
        to_char(v_month, 'YYYY-MM-DD') || ' 00:00:00+00',
        to_char((v_month + interval '1 month')::date, 'YYYY-MM-DD') || ' 00:00:00+00'
      );
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;
end
$$;
