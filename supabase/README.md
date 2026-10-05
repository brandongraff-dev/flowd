# supabase

The flowd backend: Postgres schema, row-level security, the money functions, views, the seed, and the Deno edge functions that run settlement, payouts and webhooks. The design is in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md); this file is how to run it.

```
supabase/
  config.toml              Supabase CLI project (Postgres 17, Auth, Realtime, Storage, Edge runtime; seed path)
  migrations/
    0001_schema.sql        extensions, enums, domains, 109 tables, FKs, indexes, triggers, invariants, partitions     GENERATED
    0002_rls.sql           RLS on every table, 237 policies, column grants, function privileges, storage buckets       hand-written
    0003_functions.sql     the money functions: ledger posting, fund, reserve, settle, clear, payout, clawback, refund  hand-written
    0004_views.sql         19 views + 3 materialised views (wallets, funnels, review queue, market series ...)         hand-written
    0005_reference_data.sql state machines as data, 347 constants, brand role capabilities                              GENERATED
    0006_schedules.sql     pg_cron jobs calling the edge functions through pg_net; maintenance                          hand-written
  seed.sql                 a small, alive local world built through the money functions (loaded by `supabase db reset`)
  seed.full.sql            the whole fixture world (97 tables, ~80,000 rows): GENERATED on demand by tools/gen-seed.mjs, gitignored
  SCHEMA.md                data dictionary: every table and column with its contract field                              GENERATED
  functions/               8 edge functions, the shared library, adapters, unit tests, .env.example
  tests/                   SQL tests (7 files, 370 assertions) + tests/seed (the small seed, 23) + tests/seed-full (the full world, 26, generated)
  tools/                   generators (schema, formula tests, OpenAPI, full seed), linter, the PGlite verifier and the psql test runner
```

Everything marked GENERATED comes from the contract (`packages/contract/schema`) plus the per-table decisions in `tools/lib/table-*.mjs`. **Never edit a generated file by hand**; change the generator input and run `npm run supabase:gen`. `0001` is regenerated freely while flowd is pre-launch; after the first production deploy it is frozen and every change ships as a new numbered migration (`0007_...`).

## 1. Run it locally

Prerequisites: [Supabase CLI](https://supabase.com/docs/guides/cli) 2.x, Docker, Node 20+ (Deno is only needed to run the edge functions with `supabase functions serve`; the CLI bundles it).

```sh
supabase start                       # Postgres 17 + Auth + Realtime + Storage + Studio at http://127.0.0.1:54323
supabase db reset                    # drop, apply migrations 0001..0006, load seed.sql
supabase status                      # API URL, anon key, service_role key, DB URL
```

`supabase db reset --no-seed` gives a clean database (what the SQL tests want). pg_cron, pg_net and Vault are available on the Supabase image, so the schedules of `0006` are created; they call the edge functions only once you store the two Vault secrets (section 4). On a plain Postgres without them, `0006` is a no-op and says so.

**Sign in locally** (Supabase Auth, local development only; the password is a test credential that lives in `seed.sql`):

| Persona | Email | Role |
|---|---|---|
| Maya Reyes (`@maya.makes`, Silver creator) | `maya@example.test` | creator |
| Jordan Ellis (owner of the Lumi workspace) | `jordan@example.test` | brand_member |
| Sam Okafor (flowd Ops) | `sam@joinflowd.io` | admin |

Password: `flowd-demo-local`. Kai and Noor (two more creators) exist too; they have no password-sign-in need, and their auth rows follow the same pattern.

**Run the edge functions** against that database:

```sh
cp supabase/functions/.env.example supabase/functions/.env     # then paste the service_role key from `supabase status`
supabase functions serve --env-file supabase/functions/.env

# every scheduled job is a POST with the cron secret; phases are in the body
curl -X POST http://127.0.0.1:54321/functions/v1/settle-window \
  -H "x-cron-secret: local-dev-cron-secret" -H "content-type: application/json" -d '{"phase":"close"}'
```

`FLOWD_ADAPTERS=mock` (the default) means no call leaves the machine: platform views come from a deterministic curve, Stripe and ad platforms are in-memory. `FLOWD_FIXED_NOW=2026-10-03T14:00:00Z` pins the clock to the demo world; never set it in production. Webhook endpoints (`webhook-stripe`, `webhook-revenuecat`) authenticate the *provider* instead of the cron secret.

### Generate TypeScript types from the live schema

```sh
supabase gen types typescript --local --schema public > apps/web/src/lib/supabase/database.types.ts
```

Use these for the server code that talks to Postgres (the API routes call the money functions as `service_role`). The **API** types stay `packages/contract/types.ts` (and `openapi.yaml`); both are generated from the same contract, so a column and its contract field have the same name (renames are listed in `SCHEMA.md`: `world.now` is `demo_now`, `social_accounts.primary` is `is_primary`, `lessons.order` is `sort_order`, `tier_history.at` and `activity_log.at` are `occurred_at`).

## 2. Verify it

| Check | Command | Needs |
|---|---|---|
| Everything | `npm run supabase:check` | Node |
| Generated files are current | `node supabase/tools/gen-schema.mjs --check`, `gen-formula-tests.mjs --check`, `gen-openapi.mjs --check` | Node |
| Static lint (quotes, references, RLS on every table, identifiers) | `node supabase/tools/lint.mjs` | Node |
| **Apply every migration and run every SQL test** | `npm run supabase:verify` | Node + PGlite |
| The same tests on a real Postgres | `supabase db reset --no-seed && sh supabase/tools/test-psql.sh` | Docker, psql |
| The seed world | `node supabase/tools/verify-pglite.mjs --seed` or `sh supabase/tools/test-psql.sh --seed` | as above |
| **The full fixture world** | `node supabase/tools/gen-seed.mjs && node supabase/tools/verify-pglite.mjs --seed-file seed.full.sql` (psql: `sh supabase/tools/test-psql.sh --seed-full` after loading it) | Node + PGlite |
| The full-world test is current | `node supabase/tools/gen-seed.mjs --check` (part of `npm run supabase:check`) | Node |
| Edge function unit tests | `npm run functions:test` (Node) or `deno task test` in `supabase/functions` | Node or Deno |
| Edge function types | `deno check */index.ts` in `supabase/functions` | Deno |
| The OpenAPI document | `node supabase/tools/gen-openapi.mjs --verify` | Node, optionally PyYAML + openapi-spec-validator |

**PGlite verifier** (no Docker, no Supabase CLI): runs the migrations in an in-process Postgres 18 with pgvector, pg_trgm and pgcrypto, then every test file.

```sh
npm i --no-save @electric-sql/pglite @electric-sql/pglite-pgvector        # anywhere; nothing is added to the repo
PGLITE_DIR=/path/to/that/folder node supabase/tools/verify-pglite.mjs     # PGLITE_DIR only if installed outside the repo
```

What is real in it: the SQL, PL/pgSQL, constraints, triggers, deferred constraint triggers, RLS (the tests `SET ROLE` to `anon`, `authenticated` and `service_role` with real JWT claims), pgvector columns and HNSW indexes. What is not: pg_cron, pg_net, Vault, Realtime, Storage and GoTrue (migration 0001 creates the same minimal `auth` shim it creates on any vanilla Postgres; `0006` skips itself). Postgres 17 (the Supabase image) is exercised only by the Docker path; only 18 has been run in this repository.

### What the SQL tests cover

| File | Proves |
|---|---|
| `formulas.test.sql` | the 45 reference vectors of `packages/contract/formula-vectors.json` against the SQL formulas (generated by `tools/gen-formula-tests.mjs`) |
| `invariants.test.sql` | double entry, append-only ledger, escrow identity, balance floors, state machines, no-perpetual-rights and the other CHECKs and triggers |
| `money_path.test.sql` | top-up, fund, reserve, settle CPM and CPA, clear, refund, `settle_bounty`, idempotent replays |
| `payouts.test.sql` | weekly and instant payouts, gates (identity, W-9, method), holds, clawback before and after payout, fraud release |
| `rls.test.sql` | who can read and write what: anon, creator, brand owner, viewer, reviewer, admin, service role; column grants; function privileges |
| `views.test.sql` | wallets, funnels, review queue, Money Clock states and ETAs |
| `functions.test.sql` | utility, scoring and quote functions, erase_user, SLA clock |
| `seed/world.test.sql` | the small seed: audit clean, persona facts, Money Clock states, role visibility |
| `seed-full/full-world.test.sql` | the full world (generated, every expectation computed from the fixtures): ledger audit, one row count per table, read models reproduced by the views, what each persona sees through RLS |

Conventions: each file is one transaction ending in `ROLLBACK`; assertions come from the `tap` helper schema in `tests/00_helpers.sql` (not pgTAP, so `supabase test db` does not run them); deferred triggers fire at COMMIT, which a rolled back test never reaches, so tests call `tap.settle()` after each money step. `tap` is not a migration: do not ship it (`drop schema tap cascade;`).

## 3. Change the schema

1. Edit the contract (`packages/contract/schema/*.mjs`) or the table decisions (`supabase/tools/lib/table-config.mjs`, `table-local.mjs`; invariants and triggers in `tools/sql/*.sql`).
2. `npm run supabase:gen` regenerates `0001`, `0005`, `SCHEMA.md`, `tests/formulas.test.sql`, `tests/seed-full/full-world.test.sql` and `packages/contract/openapi.yaml`.
3. Hand-written changes go in `0002`..`0004`/`0006` (pre-launch) or a new `0007_*.sql` (after launch). Keep money functions `security definer`, `set search_path = ''`, fully qualified, and `service_role` only (`revoke ... from public, anon, authenticated`).
4. `npm run supabase:check && npm run supabase:verify`. Add a regression test for every bug you fix.

Rules that never bend: money is integer cents; every money movement is balanced legs through `public.post_ledger_txn` with an idempotency key; a rule that protects money is a constraint or a trigger, not application code; business-rule failures raise `FD001..FD022` (table in `docs/ARCHITECTURE.md`).

### Seed mode

`set_config('flowd.seed_mode', 'on', true)` (transaction local) lets seeds and test worlds insert rows in states that the soft rules would otherwise reach step by step (state-machine edges, claim guards). It never relaxes a money rule: the ledger still has to balance, escrow still has to reconcile, floors still apply.

## 4. Deploy

```sh
supabase link --project-ref <ref>
supabase db push                                       # migrations 0001..0006 (no seed in production)
```

Then, once per project:

1. **Extensions**: enable `pg_cron` and `pg_net` (Database > Extensions). `0006` creates the schedules when they exist.
2. **Vault secrets** (SQL editor), the same secret you set as `CRON_SECRET`:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<random 32+ byte string>', 'cron_secret');
   ```
3. **Function secrets**: copy `functions/.env.example` to `functions/.env.production`, fill it in, then `supabase secrets set --env-file supabase/functions/.env.production`. `SUPABASE_URL` and the keys are injected by the runtime. Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
4. **Deploy the functions**: `supabase functions deploy` (every function is `verify_jwt = false` in `config.toml`: they authenticate with the cron secret or a provider signature, never a user JWT).
5. **Webhooks**: Stripe, two endpoints at `https://<ref>.supabase.co/functions/v1/webhook-stripe` (platform events, and "events on connected accounts" for payouts; each endpoint has its own signing secret); RevenueCat, `.../webhook-revenuecat`, with the Authorization header value you store as the app's secret.
6. **Auth providers**: Apple and Google in the dashboard (the client ids and secrets referenced by `config.toml`).
7. **Go live** with adapters one at a time: `FLOWD_ADAPTER_PAYMENTS=live`, then `PLATFORM`, `ADS`, `ML`, `PUSH`, or `FLOWD_ADAPTERS=live` for all.

Never put the service role key, the encryption key ring or the cron secret in a client, a repository or a log. Rotate the key ring by adding `"2"`, setting `TOKEN_ENCRYPTION_ACTIVE_VERSION=2` and deploying; the `housekeeping` keys phase re-seals old rows; remove `"1"` when none are left.

## 5. The edge functions

All are Deno TypeScript, framework-free, typed under `strict`, and written in erasable TypeScript (no enums or parameter properties) so the unit tests also run under Node. Each has `index.ts` (`Deno.serve`) and `handler.ts` (testable, no top-level side effects). Shared code is in `_shared/`.

| Function | Trigger | Body | Does |
|---|---|---|---|
| `webhook-stripe` | Stripe | signed event | top-ups to the ledger, payout paid/failed, Connect account updates, invoices, subscription end, disputes and refunds |
| `webhook-revenuecat` | RevenueCat | event | attribution (offer code beats link), `book_rc_conversion`; unmatched and sandbox events are stored, never paid |
| `sync-views` | cron `0 * * * *` | none | view counts through the platform adapter, View Ledger snapshots, token refresh, early fraud scoring |
| `settle-window` | cron `5 * * * *` and `0 14 * * *` | `{"phase":"close" or "clear"}` | close windows, fraud gate, pending; clear, CPA, `settle_bounty`, notifications |
| `weekly-payouts` | cron Fri `0 18`, `15,45 * * * *` | `{"phase":"run" or "reconcile" or "dispatch"}` | gates, Stripe transfer and bank payout, recovery, instant cash-out dispatch |
| `expiry-alerts` | cron `0 9 * * *` | none | Rights Vault alerts at 30, 14 and 7 days, Spark code expiry, ads stop with the rights |
| `daily-drop` | cron 14:00, 16:00, `10 * * * *` | `{"phase":"prepare" or "release" or "close"}` | one drop a day with true inventory |
| `housekeeping` | cron `20 * * * *`, `*/5 * * * *` | `{"phase":"sla" or "lifecycle" or "inbox" or "webhooks" or "wallet" or "keys" or "fatigue"}` | review SLA, bounty lifecycle, inbox replay, outbound webhooks, auto top-up, key rotation, fatigue |

Properties every job shares: it claims its `(job, scheduled_for)` slot in `public.job_runs` first (a retry or an overlap skips, a crash is taken over after 30 minutes); every step is idempotent in the database; bounded batches and bounded concurrency; one failing row never stops the batch; errors map `FD0xx` to API codes (`_shared/errors.ts`).

**Adapters** (`_shared/adapters/`): `platform` (TikTok Display API, Instagram Graph API, YouTube Data API), `payments` (Stripe), `ads` (TikTok Spark, Meta partnership ads), `ml` (`services/ml`), `push` (APNs). Each file defines the interface, a live implementation and a deterministic mock; `buildAdapters(env)` chooses per adapter from `FLOWD_ADAPTERS` and `FLOWD_ADAPTER_<NAME>`. To add a platform, implement `PlatformAdapter` and register it; nothing else changes. To add Android push, add an FCM `PushAdapter` beside `ApnsPushAdapter`.

## 6. Seed and fixtures

Two sources of local data, for two purposes:

| | `seed.sql` | the contract fixtures |
|---|---|---|
| What | 5 people, 1 brand, 1 bounty, 5 posts: the golden path from DOMAIN section 10 | the full demo world: 80 files, 25 apps, 90 creators, 418 posts, 4,277 ledger legs |
| How it is built | **through the money functions** (`post_ledger_txn`, `fund_bounty`, `settle_post`, `clear_post`, ...), so every ledger row is real and `audit_ledger()` is clean | files in `packages/contract/fixtures/*.json`, generated by `npm run fixtures:gen` and shared with the web mock API and the iOS app |
| Loaded by | `supabase db reset` (automatic, `config.toml`) | the web app and iOS app read them directly; `tools/gen-seed.mjs` turns them into `seed.full.sql` for Postgres (below) |
| Time | relative to `now()`, so the Money Clock is alive whenever you load it | fixed at the contract's "now" (`2026-10-03T14:00Z`) |

Both use the same ids and personas (`usr_maya`, `cr_maya`, `br_lumi`, `bnty_lumi_glowup` ...), so a screen built against the fixtures shows the same story against the local database.

**Fixture to table mapping.** One fixture file is one table (`entity.table`), and the column names are the contract field names, except these (all recorded in `SCHEMA.md`):

* *Renamed*: `world.now` to `demo_now`, `social_accounts.primary` to `is_primary`, `lessons.order` to `sort_order`, `tier_history.at` and `activity_log.at` to `occurred_at`.
* *Normalised into child tables* (the nested array becomes rows): `creators.payout_method` to `payout_methods`, `submissions.versions` to `submission_versions`, `video_analyses.checks` to `qa_checks`, `ads.daily` to `ad_daily`, `offers.thread` to `offer_messages`, `auctions.bids` to `auction_bids`, `specs.licenses` to `spec_licenses`, `rights_grants.renewals` to `rights_renewals`, `daily_drops.items` to `drop_items`, `leaderboards.entries` to `leaderboard_entries`, `disputes.events` to `dispute_events`, `compliance_checks.checks` to `compliance_check_items`, `webhooks.deliveries` to `webhook_deliveries`, `auto_approve_rules.audit` to `rule_audit_log`, `threads.messages` to `chat_messages`.
* *Read models, not tables*: `ticker` (becomes `ticker_events` and the `v_ticker_totals` view) and `waitlist` (`waitlist_entries` and the `v_waitlist_*` views). `admin_metrics` and `state_of_app_ugc` stay single-document fixtures stored in their own tables.
* *Added by the backend*: `ledger.seq`, `account_kind`, `account_ref`, `ledger_transactions` (one row per `txn_id`), `ledger_balances` (derived), `posts.fraud_score` (generated from `fraud.score`), `api_keys.key_hash` (sha256 of a fixed string: a seeded key cannot call the API), `users.auth_user_id` (an `auth.users` row per user).

### The full world: `tools/gen-seed.mjs`

```sh
node supabase/tools/gen-seed.mjs                              # writes supabase/seed.full.sql (~22 MB, gitignored) and the committed tests/seed-full test
supabase db reset --no-seed                                   # an EMPTY database: the fixture ids would collide with seed.sql's
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/seed.full.sql
sh supabase/tools/test-psql.sh --seed-full                    # or, with no Docker: node supabase/tools/verify-pglite.mjs --seed-file seed.full.sql
```

To make `supabase db reset` load it, point `[db.seed] sql_paths` in `config.toml` at `./seed.full.sql` (generate it first). Local sign-in works for the three personas (`maya.reyes@example.com`, `jordan.ellis@example.com`, `sam@joinflowd.io`, password `flowd-demo-local`); the other 141 users have an `auth.users` row and no password.

How it works: the fixtures are not turned into hand-written `INSERT`s. Each table is loaded with `insert ... select ... from jsonb_populate_recordset(null::public.<table>, <rows as JSON>)`, so Postgres converts every enum, array, domain and timestamp, and **every constraint and trigger runs**. `flowd.seed_mode` is on (transaction local): the soft rules (state-machine edges, claim guards, snapshot order, pricing recompute) are skipped so rows can be loaded in any historical state; the money rules are not: every ledger transaction must net to zero, every escrow must reconcile with its bounty and no wallet may end negative, all checked at `COMMIT`, and `audit_ledger()` runs again after it. The mapping (renames from the model, the 16 child tables, ticker and waitlist, the backend columns, `ledger_transactions`) is `tools/lib/seed-map.mjs`; a fixture field that maps to no column aborts the generator, so a contract change cannot be dropped silently.

What the database does differently from the fixtures (each is explained in `docs/ARCHITECTURE.md`, section 13, items 11 to 15):

* 2 ledger legs of 0 cents are left out (a leg is never zero); their transactions still net to zero.
* 46 RevenueCat redelivery rows (`match_status = duplicate`) are left out: the database keeps one row per `(app, event id)`.
* The waitlist is loaded as 19,759 rows: the 25 leaders of the fixture, then deterministic filler (no handle, a `.test` address) so `v_waitlist_totals` reproduces the fixture totals.
* Embeddings (`pgvector` columns) stay null until `services/ml` writes them; tokens and secrets are not seeded.
