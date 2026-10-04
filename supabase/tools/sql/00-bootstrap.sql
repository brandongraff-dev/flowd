-- Bootstrap: extensions, roles and auth shims (vanilla Postgres only), schemas, id generation, domains, sequences.
-- On Supabase every shim below is a no-op because the objects already exist.

-- ---------------------------------------------------------------------------
-- Extensions (pgvector for embeddings, pg_trgm for fuzzy search of apps and creators, pgcrypto for digests)
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Roles and auth shims. Supabase provides anon, authenticated, service_role and the auth schema.
-- On vanilla Postgres (CI, local psql) we create minimal stand-ins so the same migrations apply.
-- ---------------------------------------------------------------------------
do $shim$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$shim$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $shim$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid') then
    execute $f$create function auth.uid() returns uuid language sql stable as
      $b$ select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $b$ $f$;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'jwt') then
    execute $f$create function auth.jwt() returns jsonb language sql stable as
      $b$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $b$ $f$;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'role') then
    execute $f$create function auth.role() returns text language sql stable as
      $b$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), 'anon') $b$ $f$;
  end if;
end
$shim$;

-- ---------------------------------------------------------------------------
-- Schemas. `private` holds helpers and trigger functions that must never be callable through PostgREST.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sequences for human-facing numbers (txn_<n>, FD-2026-0042, SR-2026-0042)
-- ---------------------------------------------------------------------------
create sequence if not exists public.ledger_txn_seq as bigint start 1 minvalue 1;
create sequence if not exists public.invoice_number_seq as bigint start 1 minvalue 1;
create sequence if not exists public.scam_case_seq as bigint start 1 minvalue 1;

-- ---------------------------------------------------------------------------
-- Ids: "<prefix>_<16 lowercase hex>" (64 random bits). Hero entities in the demo seed use readable slugs instead.
-- ---------------------------------------------------------------------------
create or replace function public.new_id(p_prefix text)
returns text
language sql
volatile
parallel safe
as $$
  select p_prefix || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;

-- ---------------------------------------------------------------------------
-- Domains. Money is bigint cents (never negative unless a column says otherwise), ratios are 0..1,
-- counters are non-negative, ArtSeed is a generated-imagery description (never a remote image).
-- ---------------------------------------------------------------------------
create domain public.nat as integer check (value >= 0);
create domain public.bignat as bigint check (value >= 0);
create domain public.cents as bigint check (value >= 0);
create domain public.ratio as numeric(6, 5) check (value >= 0 and value <= 1);
create domain public.art_seed as jsonb check (
  jsonb_typeof(value) = 'object' and value ? 'seed' and value ? 'pattern' and value ? 'hue_a' and value ? 'hue_b' and value ? 'hue_c'
);
-- The Rights Card of every bounty, offer, auction and spec. Organic posting is always included; paid-ad usage is a fixed
-- term (0 to 365 days, never perpetual); AI likeness is off. These are the "no perpetual rights" and "AI likeness off by
-- default" promises enforced in the database, not only in Brief Lint.
create domain public.rights_card as jsonb check (
  jsonb_typeof(value) = 'object'
  and (value ->> 'organic')::boolean is true
  and coalesce((value ->> 'ai_likeness')::boolean, false) is false
  and coalesce((value ->> 'paid_ads_days')::integer, 0) between 0 and 365
);
