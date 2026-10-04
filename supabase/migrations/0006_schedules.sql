-- flowd 0006: scheduled jobs (pg_cron) calling the edge functions (pg_net), plus pure-SQL maintenance jobs
--
-- Everything here is guarded: on a Postgres without pg_cron / pg_net / vault (CI, a plain local psql) the migration is a no-op.
-- On Supabase, enable the pg_cron and pg_net extensions (they are available on every project) and store two secrets in Vault once:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random 32+ byte string>', 'cron_secret');   -- the same value as the CRON_SECRET function secret
--
-- Each job is idempotent: the edge functions claim a (job, scheduled_for) slot in public.job_runs before doing any work, so a retry,
-- an overlapping run or a manual re-run of the same slot skips instead of paying twice.
--
-- Schedule (UTC)
--   sync-views         every hour at :00        pull view counts for posts in their window and for the 30 days after
--   settle-window      every hour at :05        close 72 h windows, run the fraud gate, write ledger rows (phase "close")
--   housekeeping       every hour at :20        review SLA states and timeouts, bounty start/end, offer and revision expiry, unused-approval release,
--                                               webhook-inbox replay, auto top-up, key rotation, fatigue scan
--   housekeeping       every 5 minutes          outbound webhook deliveries (phase "webhooks")
--   daily-drop         14:00 prepare, 16:00 release, every hour at :10 close
--   settle-window      14:00 daily              the clearing run: pending -> cleared, conversion clearing (phase "clear")
--   weekly-payouts     Friday 18:00             the weekly payout run; every 30 minutes at :15 and :45 it reconciles in-flight payouts
--   expiry-alerts      09:00 daily              Rights Vault expiry alerts at 30, 14 and 7 days; Spark code expiry; ads stop at rights end
--   market views       every hour at :30        refresh the materialised views and publish the day's market series
--   maintenance        daily 03:00              partitions, retention, ledger audit

do $ext$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$ext$;

-- POST to an edge function with the shared cron secret. Returns the pg_net request id (or null when not configured).
create or replace function private.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise warning 'flowd: pg_net or vault is not available; skipping %', p_name;
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'flowd: vault secrets project_url / cron_secret are not set; skipping %', p_name;
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_id
    using rtrim(v_url, '/') || '/functions/v1/' || p_name,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
          p_body;
  return v_id;
end
$$;
revoke all on function private.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Retention and integrity jobs that need no edge function.
create or replace function private.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idem integer;
  v_hooks integer;
  v_inbound integer;
  v_parts integer;
  v_audit jsonb;
begin
  delete from public.idempotency_keys where expires_at < now();
  get diagnostics v_idem = row_count;
  delete from public.webhook_deliveries where created_at < now() - interval '30 days';
  get diagnostics v_hooks = row_count;
  delete from public.inbound_events where status in ('processed', 'ignored') and received_at < now() - interval '90 days';
  get diagnostics v_inbound = row_count;
  v_parts := public.ensure_hourly_partitions(3);
  v_audit := public.audit_ledger();
  insert into public.job_runs (job, scheduled_for, status, finished_at, stats)
  values ('maintenance', date_trunc('hour', now()), case when (v_audit ->> 'ok')::boolean then 'succeeded' else 'failed' end, now(),
          jsonb_build_object('idempotency_keys_deleted', v_idem, 'webhook_deliveries_deleted', v_hooks, 'inbound_events_deleted', v_inbound,
                             'partitions_created', v_parts, 'ledger_ok', (v_audit ->> 'ok')::boolean, 'ledger', v_audit))
  on conflict (job, scheduled_for) do nothing;
  return v_audit;
end
$$;
revoke all on function private.run_maintenance() from public, anon, authenticated;

do $sched$
begin
  if to_regnamespace('cron') is null then
    raise notice 'flowd: pg_cron is not installed; schedules were not created (see supabase/README.md)';
    return;
  end if;
  -- idempotent: re-running the migration replaces a job of the same name
  perform cron.schedule('flowd-sync-views', '0 * * * *', $c$select private.invoke_edge_function('sync-views')$c$);
  perform cron.schedule('flowd-settle-close', '5 * * * *', $c$select private.invoke_edge_function('settle-window', '{"phase":"close"}'::jsonb)$c$);
  perform cron.schedule('flowd-settle-clear', '0 14 * * *', $c$select private.invoke_edge_function('settle-window', '{"phase":"clear"}'::jsonb)$c$);
  perform cron.schedule('flowd-housekeeping', '20 * * * *', $c$select private.invoke_edge_function('housekeeping')$c$);
  perform cron.schedule('flowd-webhooks-out', '*/5 * * * *', $c$select private.invoke_edge_function('housekeeping', '{"phase":"webhooks"}'::jsonb)$c$);
  perform cron.schedule('flowd-drop-prepare', '0 14 * * *', $c$select private.invoke_edge_function('daily-drop', '{"phase":"prepare"}'::jsonb)$c$);
  perform cron.schedule('flowd-drop-release', '0 16 * * *', $c$select private.invoke_edge_function('daily-drop', '{"phase":"release"}'::jsonb)$c$);
  perform cron.schedule('flowd-drop-close', '10 * * * *', $c$select private.invoke_edge_function('daily-drop', '{"phase":"close"}'::jsonb)$c$);
  perform cron.schedule('flowd-weekly-payouts', '0 18 * * 5', $c$select private.invoke_edge_function('weekly-payouts', '{"phase":"run"}'::jsonb)$c$);
  perform cron.schedule('flowd-payouts-reconcile', '15,45 * * * *', $c$select private.invoke_edge_function('weekly-payouts', '{"phase":"reconcile"}'::jsonb)$c$);
  perform cron.schedule('flowd-expiry-alerts', '0 9 * * *', $c$select private.invoke_edge_function('expiry-alerts')$c$);
  perform cron.schedule('flowd-market-views', '30 * * * *', $c$select public.refresh_market_views(), public.publish_market_series()$c$);
  perform cron.schedule('flowd-maintenance', '0 3 * * *', $c$select private.run_maintenance()$c$);
end
$sched$;
