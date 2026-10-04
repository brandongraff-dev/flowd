// Per-table decisions for every contract entity (80 tables). The contract defines columns, types and nullability;
// this file adds what only a database can say: renames of reserved words, skipped columns that were normalised into
// child tables, extra infrastructure columns, uniqueness, check constraints (escrow, ledger, state coherence), indexes,
// soft delete, foreign-key delete rules, and pgvector columns.
//
// Conventions
//   * Names of checks: <table>_<what>_chk. Names of indexes: <table>_<cols>_idx / _key for unique.
//   * Money is bigint cents (domain public.cents >= 0, or plain bigint when signed). Ratios are public.ratio (0..1).
//   * Every foreign key is DEFERRABLE INITIALLY IMMEDIATE so the seed loader can SET CONSTRAINTS ALL DEFERRED.
//   * `flags.realtime` adds the table to the supabase_realtime publication; RLS still applies to realtime.
//   * pgvector dimension is 768 everywhere (SigLIP / CLIP ViT-B/16 image embeddings and 768-d text embeddings).

import { chk, uq, ix } from './table-kit.mjs';

const VEC = 'extensions.vector(768)';
const SOFT = { name: 'deleted_at', sql: 'timestamptz', notNull: false, doc: 'Soft delete marker (see supabase/README.md, "Soft delete").' };
const bps = (col, rate) => `((${col} * ${rate}) + 5000) / 10000`;

export const TABLE_CONFIG = {
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Meta
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  world: {
    comment: 'Demo world manifest (a single row). Production keeps the table so the same migrations serve demo and live; only the seed writes it.',
    rename: { now: 'demo_now' },
    checks: [chk('world_singleton_chk', `id = 'world_flowd'`)],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Identity
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  users: {
    softDelete: true,
    extra: [
      { name: 'auth_user_id', sql: 'uuid', notNull: false, doc: 'auth.users.id (Supabase Auth). Null for demo/seed users that have not signed in.', fk: { table: 'auth.users', column: 'id', onDelete: 'set null' } },
      { name: 'pii_erased_at', sql: 'timestamptz', notNull: false, doc: 'Set when a GDPR/CCPA erasure anonymised this user (ledger-bearing rows are never deleted).' },
    ],
    checks: [
      chk('users_email_chk', `email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`),
      chk('users_deleted_chk', `status <> 'deleted' or deleted_at is not null`),
    ],
    uniques: [
      uq('users_email_lower_key', { expr: 'lower(email)', where: 'deleted_at is null' }),
      uq('users_auth_user_id_key', { cols: ['auth_user_id'], where: 'auth_user_id is not null' }),
    ],
    indexes: [ix('users_role_idx', '(role) where deleted_at is null')],
    fkDelete: {},
  },

  creators: {
    softDelete: true,
    defaults: { tier: `'bronze'`, tier_basis: `'earned'`, tier_since: 'now()', approval_rate: '0', reliability_score: '70', joined_at: 'now()', last_active_at: 'now()', onboarding_stage: `'signed_up'` },
    extra: [{ name: 'portfolio_embedding', sql: VEC, notNull: false, doc: 'Embedding of the creator portfolio (SigLIP/CLIP mean pool). Used by matching.' }],
    checks: [
      chk('creators_handle_chk', `handle ~ '^[a-z0-9._]{2,30}$'`),
      chk('creators_counts_chk', 'approved_count <= decided_count and live_posts_count <= posts_count'),
      chk('creators_approval_rate_chk', `approval_rate = case when decided_count = 0 then 0 else round(approved_count::numeric / decided_count, 2) end`),
      chk('creators_reliability_chk', 'reliability_score between 0 and 100'),
      chk('creators_elite_review_chk', `tier <> 'elite' or tier_review is not null`),
      chk('creators_grace_chk', `tier_basis <> 'grace_hold' or tier_hold_until is not null`),
      chk('creators_founding_chk', 'founding_perks_until is null or founding'),
      chk('creators_self_referral_chk', 'referred_by_creator_id is null or referred_by_creator_id <> id'),
      chk('creators_niches_chk', 'cardinality(niches) between 1 and 3'),
    ],
    skip: ['payout_method'],
    uniques: [
      uq('creators_user_id_key', { cols: ['user_id'] }),
      uq('creators_handle_key', { cols: ['handle'] }),
      uq('creators_referral_code_key', { cols: ['referral_code'] }),
      uq('creators_stripe_account_id_key', { cols: ['stripe_account_id'], where: 'stripe_account_id is not null' }),
    ],
    indexes: [
      ix('creators_tier_idx', '(tier) where deleted_at is null'),
      ix('creators_country_idx', '(country)'),
      ix('creators_niches_idx', 'using gin (niches)'),
      ix('creators_last_active_idx', '(last_active_at desc)'),
      ix('creators_open_to_offers_idx', '(tier) where open_to_offers and deleted_at is null'),
      ix('creators_portfolio_embedding_idx', 'using hnsw (portfolio_embedding extensions.vector_cosine_ops)'),
    ],
    fkDelete: {},
  },

  social_accounts: {
    softDelete: true,
    rename: { primary: 'is_primary' },
    extra: [{ name: 'platform_user_id', sql: 'text', notNull: false, doc: 'Stable platform id (TikTok open_id, Instagram user id, YouTube channel id). Handles change; ids do not.' }],
    checks: [chk('social_accounts_health_chk', `(health->>'score')::int between 0 and 100`)],
    uniques: [
      uq('social_accounts_platform_handle_key', { expr: 'platform, lower(handle)', where: `deleted_at is null and status <> 'revoked'` }),
      uq('social_accounts_one_primary_key', { cols: ['creator_id'], where: 'is_primary and deleted_at is null' }),
      uq('social_accounts_platform_user_key', { cols: ['platform', 'platform_user_id'], where: 'platform_user_id is not null and deleted_at is null' }),
    ],
    indexes: [ix('social_accounts_status_idx', '(status) where deleted_at is null')],
  },

  rate_cards: {
    softDelete: true,
    defaults: { stats: `'{"offers_received":0,"accepted":0,"median_response_hours":0}'::jsonb`, status: `'open'`, paid_usage_days: '90', paid_usage_pct_per_30d: '0.25', accepts_direct_offers: 'true' },
    checks: [
      chk('rate_cards_usage_chk', 'paid_usage_days between 0 and 365'),
      chk('rate_cards_turnaround_chk', 'turnaround_days between 1 and 60'),
    ],
    uniques: [uq('rate_cards_creator_key', { cols: ['creator_id'], where: 'deleted_at is null' })],
    indexes: [ix('rate_cards_open_idx', '(status, price_per_video_cents) where accepts_direct_offers and deleted_at is null')],
  },

  brands: {
    softDelete: true,
    defaults: { review_sla_hours: '72', timeout_policy: `'escalate'`, plan: `'free'`, verification: `'not_started'`, created_at: 'now()' },
    extra: [
      { name: 'stripe_customer_id', sql: 'text', notNull: false, doc: 'Stripe customer for card/ACH funding and subscriptions.' },
      { name: 'suspended_at', sql: 'timestamptz', notNull: false, doc: 'Scam Shield or Ops suspension: no new bounties, funding or offers.' },
      { name: 'suspended_reason', sql: 'text', notNull: false, doc: 'Plain-English reason recorded with the audit_log entry.' },
    ],
    checks: [
      chk('brands_slug_chk', `slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'`),
      chk('brands_sla_chk', 'review_sla_hours between 1 and 72'),
      chk('brands_match_cap_chk', 'matched_budget_used_cents <= 50000'),
      chk('brands_match_used_chk', 'first_bounty_waiver_used or matched_budget_used_cents = 0'),
      chk('brands_agency_self_chk', 'agency_id is null or agency_id <> id'),
      chk('brands_partner_self_chk', 'referral_partner_brand_id is null or referral_partner_brand_id <> id'),
    ],
    uniques: [
      uq('brands_slug_key', { cols: ['slug'] }),
      uq('brands_stripe_customer_key', { cols: ['stripe_customer_id'], where: 'stripe_customer_id is not null' }),
      uq('brands_one_platform_key', { expr: '(kind)', where: `kind = 'platform'` }),
    ],
    indexes: [ix('brands_plan_idx', '(plan) where deleted_at is null'), ix('brands_verification_idx', '(verification)')],
  },

  brand_members: {
    checks: [chk('brand_members_approver_chk', `role = 'client_approver' or approval_link_code is null`)],
    uniques: [
      uq('brand_members_active_key', { cols: ['brand_id', 'user_id'], where: `status <> 'removed'` }),
      uq('brand_members_approval_code_key', { cols: ['approval_link_code'], where: 'approval_link_code is not null' }),
    ],
    indexes: [ix('brand_members_user_idx', `(user_id) where status = 'active'`), ix('brand_members_brand_role_idx', `(brand_id, role) where status = 'active'`)],
  },

  apps: {
    softDelete: true,
    checks: [
      chk('apps_rating_chk', 'rating between 1 and 5'),
      chk('apps_store_id_chk', `app_store_id ~ '^[0-9]{6,12}$'`),
    ],
    uniques: [
      uq('apps_brand_bundle_key', { cols: ['brand_id', 'bundle_id'], where: 'deleted_at is null' }),
      uq('apps_brand_store_key', { cols: ['brand_id', 'app_store_id'], where: 'deleted_at is null' }),
    ],
    indexes: [ix('apps_category_idx', '(category) where deleted_at is null')],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Money
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  ledger: {
    comment: 'Append-only double-entry ledger. Legs of one txn_id net to exactly zero (deferred constraint trigger). Only status, cleared_at, paid_at and payout_id may ever change (private.ledger_guard). Written exclusively through public.post_ledger_txn().',
    extraFks: [
      { column: 'txn_id', table: 'ledger_transactions', onDelete: 'no action' },
      { column: 'reverses_txn_id', table: 'ledger_transactions', onDelete: 'no action' },
    ],
    columnOverrides: {
      status: { default: `'cleared'` },
      posted_at: { default: 'now()' },
      amount_cents: { sql: 'bigint', default: undefined },
    },
    extra: [
      { name: 'seq', sql: 'bigint', notNull: true, generated: 'generated by default as identity', doc: 'Monotonic order for cursor pagination and audits. Not a key: the id is.' },
      { name: 'db_txid', sql: 'bigint', notNull: true, default: 'txid_current()', doc: 'Database transaction that wrote the leg. All legs of a txn_id must share it (a posted txn can never be extended).' },
      { name: 'account_kind', sql: 'text', notNull: true, generated: `generated always as (split_part(account, ':', 1)) stored`, doc: 'wallet | escrow | creator | platform | external (from the account string).' },
      { name: 'account_ref', sql: 'text', notNull: true, generated: `generated always as (substr(account, strpos(account, ':') + 1)) stored`, doc: 'The id part of the account string (br_x, bnty_x, cr_x, fees ...).' },
    ],
    checks: [
      chk('ledger_account_chk', `account ~ '^(wallet|escrow|creator|platform|external):[a-z0-9_.-]+$'`),
      chk('ledger_amount_chk', 'amount_cents <> 0'),
      chk('ledger_paid_chk', `status <> 'paid' or (paid_at is not null and (payout_id is not null or entry_type in ('payout', 'payout_fee')))`),
      chk('ledger_clawback_chk', `entry_type <> 'clawback' or reverses_txn_id is not null`),
    ],
    indexes: [
      ix('ledger_seq_idx', '(seq)'),
      ix('ledger_txn_idx', '(txn_id)'),
      ix('ledger_account_idx', '(account, seq)'),
      ix('ledger_creator_status_idx', '(creator_id, status) where creator_id is not null'),
      ix('ledger_brand_posted_idx', '(brand_id, posted_at desc) where brand_id is not null'),
      ix('ledger_bounty_type_idx', '(bounty_id, entry_type) where bounty_id is not null'),
      ix('ledger_post_idx', '(post_id) where post_id is not null'),
      ix('ledger_unpaid_cleared_idx', `(creator_id) where status = 'cleared' and payout_id is null and account_kind = 'creator'`),
      ix('ledger_posted_brin_idx', 'using brin (posted_at)'),
    ],
    // 'dedicated': the generic append_only_guard would also block the four lifecycle columns, so the ledger carries its own
    // guard + truncate trigger in sql/20-triggers.sql (private.ledger_guard) instead of the generated pair.
    flags: { appendOnly: 'dedicated' },
  },

  payouts: {
    nullable: ['proof_id'],
    extra: [
      { name: 'idempotency_key', sql: 'text', notNull: false, doc: 'Client key for instant cash-outs / run key for weekly payouts. Repeating a key returns the original payout.' },
      { name: 'payout_method_id', sql: 'text', notNull: false, doc: 'The payout_methods row used.', fk: { table: 'payout_methods', column: 'id' } },
      { name: 'stripe_payout_id', sql: 'text', notNull: false, doc: 'Stripe payout (po_...) on the connected account, when Stripe pays out to the bank.' },
      { name: 'attempts', sql: 'public.nat', notNull: true, default: '0', doc: 'Transfer attempts (retries are bounded by the weekly-payouts function).' },
    ],
    checks: [
      chk('payouts_net_chk', 'net_cents = gross_cents - fee_cents and fee_cents <= gross_cents'),
      chk('payouts_weekly_free_chk', `kind <> 'weekly' or fee_cents = 0`),
      chk('payouts_instant_fee_chk', `fee_cents = 0 or (kind = 'instant' and fee_cents between 50 and 1500)`),
      chk('payouts_instant_min_chk', `kind <> 'instant' or gross_cents >= 500`),
      chk('payouts_paid_chk', `status <> 'paid' or paid_at is not null`),
      chk('payouts_failed_chk', `status <> 'failed' or failed_reason is not null`),
      chk('payouts_held_chk', `status <> 'held' or hold_reason is not null`),
      chk('payouts_weekly_run_chk', `kind <> 'weekly' or run_id is not null`),
    ],
    uniques: [
      uq('payouts_idempotency_key', { cols: ['idempotency_key'], where: 'idempotency_key is not null' }),
      uq('payouts_proof_key', { cols: ['proof_id'], where: 'proof_id is not null' }),
      uq('payouts_stripe_transfer_key', { cols: ['stripe_transfer_id'], where: 'stripe_transfer_id is not null' }),
    ],
    extraFks: [{ column: 'run_id', table: 'payout_runs', onDelete: 'no action' }, { column: 'ledger_txn_id', table: 'ledger_transactions', onDelete: 'no action' }],
    indexes: [
      ix('payouts_creator_status_idx', '(creator_id, status, requested_at desc)'),
      ix('payouts_run_idx', '(run_id) where run_id is not null'),
      ix('payouts_open_idx', `(scheduled_for) where status in ('scheduled', 'held', 'processing', 'in_transit')`),
    ],
    flags: { realtime: true },
  },

  invoices: {
    extra: [
      { name: 'stripe_invoice_id', sql: 'text', notNull: false, doc: 'Stripe invoice (in_...) for subscription invoices.' },
      { name: 'stripe_payment_intent_id', sql: 'text', notNull: false, doc: 'Stripe PaymentIntent (pi_...) that funded this invoice.' },
    ],
    extraFks: [{ column: 'ledger_txn_id', table: 'ledger_transactions', onDelete: 'no action' }],
    checks: [
      chk('invoices_number_chk', `number ~ '^FD-[0-9]{4}-[0-9]{4,}$'`),
      chk('invoices_total_chk', 'total_cents = subtotal_cents + processing_cents + tax_cents'),
      chk('invoices_paid_chk', `status <> 'paid' or paid_at is not null`),
      chk('invoices_due_chk', 'due_at >= issued_at'),
    ],
    uniques: [
      uq('invoices_number_key', { cols: ['number'] }),
      uq('invoices_stripe_pi_key', { cols: ['stripe_payment_intent_id'], where: 'stripe_payment_intent_id is not null' }),
      uq('invoices_stripe_invoice_key', { cols: ['stripe_invoice_id'], where: 'stripe_invoice_id is not null' }),
    ],
    indexes: [ix('invoices_brand_issued_idx', '(brand_id, issued_at desc)'), ix('invoices_open_idx', `(due_at) where status = 'open'`)],
  },

  money_clock: {
    comment: 'Creator-facing projection of every earning with its state, a dated ETA and a named reason. Rebuilt by public.refresh_money_clock(); never edited by clients. Realtime source for the Live Activity and the wallet.',
    checks: [
      chk('money_clock_eta_chk', `state not in ('accruing', 'pending', 'cleared') or eta_at is not null`),
      chk('money_clock_cleared_chk', `state not in ('cleared', 'paid') or cleared_at is not null`),
      chk('money_clock_paid_chk', `state <> 'paid' or paid_at is not null`),
      chk('money_clock_estimated_chk', `estimated = (state = 'accruing')`),
    ],
    indexes: [
      ix('money_clock_creator_state_idx', '(creator_id, state, eta_at)'),
      ix('money_clock_post_idx', '(post_id) where post_id is not null'),
      ix('money_clock_eta_idx', `(eta_at) where state in ('accruing', 'pending', 'cleared')`),
      ix('money_clock_ledger_idx', '(ledger_id) where ledger_id is not null'),
    ],
    flags: { realtime: true },
  },

  market_series: {
    checks: [chk('market_series_band_chk', 'p25_cpm_cents <= clearing_cpm_cents and clearing_cpm_cents <= p75_cpm_cents')],
    uniques: [uq('market_series_category_date_key', { cols: ['category', 'date'] })],
    indexes: [ix('market_series_date_idx', '(date desc, category)')],
  },

  ticker: { replaced: 'ticker_events and the ticker_totals view (the contract entity is a read model)' },

  brand_scorecards: {
    checks: [chk('brand_scorecards_window_chk', 'window_days between 1 and 365'), chk('brand_scorecards_score_chk', 'reliability_score between 0 and 100')],
    uniques: [uq('brand_scorecards_brand_window_key', { cols: ['brand_id', 'window_days'] })],
  },

  creator_reputation: {
    checks: [chk('creator_reputation_score_chk', 'reliability_score between 0 and 100')],
    uniques: [uq('creator_reputation_creator_key', { cols: ['creator_id'] })],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Bounties, submissions, posts
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  bounties: {
    extra: [{ name: 'brief_embedding', sql: VEC, notNull: false, doc: 'Embedding of the brief text, for matching and the Creative Intelligence Library.' }],
    jsonDomains: { rights_card: 'public.rights_card' },
    defaults: {
      review_sla_hours: '72', ad_commission_rate: '0.10', per_video_cap_cents: '25000',
      counts: `'{"creators":0,"submissions":0,"in_review":0,"approved":0,"rejected":0,"posts":0,"live_posts":0}'::jsonb`,
      funnel: `'{"views":0,"clicks":0,"installs":0,"trials":0,"paid":0,"est_installs":0,"est_trials":0,"est_paid":0}'::jsonb`,
    },
    fkDelete: {},
    checks: [
      chk('bounties_escrow_identity_chk', 'escrow_funded_cents = reserved_cents + spent_cents + remaining_cents + refunded_cents'),
      chk('bounties_funded_chk', 'funded = (escrow_funded_cents >= budget_cents + fee_reserve_cents)'),
      chk('bounties_funded_status_chk', `status = 'cancelled' or ((status in ('draft', 'awaiting_funding')) = (not funded))`),
      chk('bounties_matched_chk', `matched_cents <= escrow_funded_cents and ((funding_source = 'brand_matched') = (matched_cents > 0) or funding_source = 'platform')`),
      chk('bounties_take_rate_chk', 'take_rate in (0, 0.06, 0.08, 0.10, 0.12)'),
      chk('bounties_fee_reserve_chk', `fee_reserve_cents = ${bps('budget_cents', '(round(take_rate * 10000))::bigint')}`),
      chk('bounties_cpm_floor_chk', 'cpm_cents = 0 or cpm_cents >= 50'),
      chk('bounties_type_rates_chk', `status = 'draft' or (type in ('cpm', 'stacked') and cpm_cents >= 50) or (type = 'direct' and flat_fee_cents > 0 and cpm_cents = 0) or (type in ('cpa', 'install_only') and cpm_cents = 0 and cpa_install_cents + cpa_trial_cents + cpa_paid_cents > 0)`),
      chk('bounties_flat_fee_chk', `type = 'direct' or flat_fee_cents = 0`),
      chk('bounties_budget_min_chk', `status = 'draft' or funding_source = 'platform' or budget_cents >= 10000`),
      chk('bounties_window_chk', 'ends_at > starts_at'),
      chk('bounties_settled_chk', `status <> 'settled' or (reserved_cents = 0 and remaining_cents = 0)`),
      chk('bounties_review_sla_chk', 'review_sla_hours between 1 and 72'),
      chk('bounties_ad_commission_chk', 'ad_commission_rate between 0 and 0.25'),
      chk('bounties_no_burner_chk', `coalesce((eligibility->>'burner_accounts_allowed')::boolean, false) = false`),
      chk('bounties_featured_chk', 'featured_until is null or featured'),
    ],
    indexes: [
      ix('bounties_brand_status_idx', '(brand_id, status)'),
      ix('bounties_live_feed_idx', `(visibility, published_at desc) where status in ('live', 'filled')`),
      ix('bounties_ends_idx', `(ends_at) where status in ('live', 'paused', 'filled', 'ended')`),
      ix('bounties_settle_idx', `(ended_at) where status = 'ended'`),
      ix('bounties_formats_idx', 'using gin (format_ids)'),
      ix('bounties_featured_idx', '(featured_until) where featured'),
      ix('bounties_brief_embedding_idx', 'using hnsw (brief_embedding extensions.vector_cosine_ops)'),
    ],
    flags: { realtime: true },
  },

  submissions: {
    skip: ['versions'],
    jsonDomains: { rights_card: 'public.rights_card' },
    defaults: { version: '1', revision_round: '0', sla_state: `'on_track'`, auto_approved: 'false', reserved_cents: '0' },
    fkDelete: {},
    checks: [
      chk('submissions_version_chk', 'version >= 1'),
      chk('submissions_revision_chk', 'revision_round >= 0'),
      chk('submissions_decision_chk', `status <> 'rejected' or decision is not null`),
      chk('submissions_posted_chk', `status <> 'posted' or post_id is not null`),
      chk('submissions_reservation_chk', `reserved_cents = 0 or status in ('qa_pending', 'in_review', 'changes_requested', 'approved', 'appealed', 'posted')`),
      chk('submissions_points_chk', 'flow_points between 0 and 100 and hook_points between 0 and 100'),
      chk('submissions_sla_chk', `sla_due_at is null or sla_due_at > submitted_at`),
    ],
    indexes: [
      ix('submissions_bounty_status_idx', '(bounty_id, status)'),
      ix('submissions_creator_status_idx', '(creator_id, status, updated_at desc)'),
      ix('submissions_review_queue_idx', `(brand_id, sla_due_at) where status = 'in_review'`),
      ix('submissions_sla_idx', `(sla_due_at) where status = 'in_review'`),
      ix('submissions_unused_idx', `(approved_at) where status = 'approved'`),
      ix('submissions_post_idx', '(post_id) where post_id is not null'),
    ],
    flags: { realtime: true },
  },

  video_analyses: {
    skip: ['checks'],
    extra: [{ name: 'embedding', sql: VEC, notNull: false, doc: 'Whole-video embedding (SigLIP/CLIP). Duplicate and similar-creative search.' }],
    compositeFks: [{ name: 'video_analyses_version_fkey', columns: ['submission_id', 'version'], table: 'submission_versions', refColumns: ['submission_id', 'version'], onDelete: 'cascade' }],
    checks: [chk('video_analyses_phash_chk', `phash ~ '^[0-9a-f]{16}$'`), chk('video_analyses_version_chk', 'version >= 1')],
    uniques: [uq('video_analyses_submission_version_key', { cols: ['submission_id', 'version'] })],
    indexes: [
      ix('video_analyses_phash_idx', '(phash)'),
      ix('video_analyses_embedding_idx', 'using hnsw (embedding extensions.vector_cosine_ops)'),
    ],
  },

  posts: {
    defaults: {
      funnel: `'{"views":0,"clicks":0,"installs":0,"trials":0,"paid":0,"est_installs":0,"est_trials":0,"est_paid":0}'::jsonb`,
      earnings: `'{"cpm_cents":0,"cpa_cents":0,"commission_cents":0,"flat_cents":0,"total_cents":0,"capped":false,"cap_remaining_cents":0}'::jsonb`,
      fraud: `'{"score":0,"band":"clean","signals":[]}'::jsonb`,
      retention: `'{"curve":[],"avg_watch_ratio":0}'::jsonb`,
    },
    extra: [
      { name: 'fraud_score', sql: 'integer', notNull: true, generated: `generated always as (coalesce((fraud->>'score')::integer, 0)) stored`, doc: 'Generated from fraud.score for the admin queue index.' },
    ],
    checks: [
      chk('posts_window_chk', 'extract(epoch from (window_ends_at - posted_at)) = 259200'),
      chk('posts_views_chk', 'window_views <= views'),
      chk('posts_held_chk', `status <> 'held' or hold_reason is not null`),
      chk('posts_cleared_chk', `status not in ('cleared', 'paid') or cleared_at is not null`),
      chk('posts_paid_chk', `status <> 'paid' or paid_at is not null`),
      chk('posts_removed_chk', `status <> 'removed' or removed_at is not null`),
      chk('posts_url_chk', `url ~ '^https?://'`),
    ],
    uniques: [
      uq('posts_submission_key', { cols: ['submission_id'] }),
      uq('posts_platform_post_key', { cols: ['platform', 'platform_post_id'] }),
    ],
    indexes: [
      ix('posts_creator_status_idx', '(creator_id, status, posted_at desc)'),
      ix('posts_bounty_status_idx', '(bounty_id, status)'),
      ix('posts_brand_posted_idx', '(brand_id, posted_at desc)'),
      ix('posts_app_posted_idx', '(app_id, posted_at desc)'),
      ix('posts_window_close_idx', `(window_ends_at) where status = 'live'`),
      ix('posts_clearing_idx', `(window_ends_at) where status in ('window_closed', 'held')`),
      ix('posts_fraud_idx', '(fraud_score desc) where fraud_score >= 40'),
      ix('posts_winner_idx', '(bounty_id) where is_winner'),
      ix('posts_sync_idx', `(social_account_id, posted_at desc) where status in ('live', 'window_closed', 'cleared', 'held')`),
    ],
    flags: { realtime: true },
  },

  view_snapshots: {
    checks: [
      chk('view_snapshots_invalid_chk', 'views_invalid = views_reported - views_verified and views_verified <= views_reported'),
      chk('view_snapshots_fraud_chk', 'fraud_score between 0 and 100'),
    ],
    uniques: [uq('view_snapshots_post_taken_key', { cols: ['post_id', 'taken_at'] })],
    indexes: [ix('view_snapshots_post_idx', '(post_id, taken_at desc)'), ix('view_snapshots_taken_brin_idx', 'using brin (taken_at)')],
  },

  post_metrics_daily: {
    indexes: [ix('post_metrics_daily_date_idx', '(date)')],
  },

  post_metrics_hourly: {
    comment: 'Hourly deltas per post: the training-data grain. Range-partitioned by month on ts (public.ensure_hourly_partitions() creates future partitions).',
    partition: 'range (ts)',
    checks: [chk('post_metrics_hourly_ts_chk', `extract(minute from (ts at time zone 'UTC')) = 0 and extract(second from (ts at time zone 'UTC')) = 0`), chk('post_metrics_hourly_fraud_chk', 'fraud_score between 0 and 100')],
    indexes: [ix('post_metrics_hourly_ts_idx', '(ts desc)')],
  },

  app_metrics_daily: {
    comment: 'Per-app daily rollup (derived). Rebuilt by public.refresh_app_metrics_daily(date); equals the sum of the app posts daily rows.',
    indexes: [ix('app_metrics_daily_date_idx', '(date desc)')],
  },

  conversions: {
    extra: [],
    checks: [
      chk('conversions_quantity_chk', 'quantity >= 1'),
      chk('conversions_payable_chk', `payable = (source in ('link', 'code') and status not in ('rejected', 'refunded'))`),
      chk('conversions_confidence_chk', `(source in ('link', 'code') and confidence = 'deterministic') or (source = 'mmp' and confidence = 'matched') or (source = 'survey' and confidence = 'self_reported') or (source = 'modelled' and confidence = 'modelled')`),
      chk('conversions_revenue_chk', `kind = 'paid' or revenue_cents = 0`),
      chk('conversions_cleared_chk', `status <> 'cleared' or cleared_at is not null`),
    ],
    uniques: [uq('conversions_batch_key', { cols: ['post_id', 'kind', 'source', 'occurred_on', 'country'], nullsNotDistinct: true })],
    indexes: [
      ix('conversions_app_day_idx', '(app_id, occurred_on desc)'),
      ix('conversions_link_idx', '(link_id)'),
      ix('conversions_bounty_idx', '(bounty_id, kind)'),
      ix('conversions_pending_idx', `(first_at) where status = 'pending'`),
      ix('conversions_creator_idx', '(creator_id, occurred_on desc)'),
    ],
  },

  attribution_links: {
    fkDelete: {},
    checks: [
      chk('attribution_links_code_chk', `code ~ '^[a-z0-9][a-z0-9-]{2,40}$'`),
      chk('attribution_links_short_url_chk', `short_url = 'joinflowd.io/r/' || code`),
    ],
    uniques: [
      uq('attribution_links_code_key', { cols: ['code'] }),
      uq('attribution_links_promo_key', { cols: ['app_id', 'promo_code'], where: 'promo_code is not null' }),
    ],
    indexes: [
      ix('attribution_links_creator_idx', '(creator_id, bounty_id)'),
      ix('attribution_links_post_idx', '(post_id) where post_id is not null'),
    ],
  },

  ads: {
    skip: ['daily'],
    checks: [
      chk('ads_fee_chk', `platform_fee_cents = ((spend_cents * 100) + 5000) / 10000`),
      chk('ads_code_days_chk', 'code_duration_days is null or code_duration_days in (7, 30, 60, 365)'),
      chk('ads_started_chk', `status not in ('live', 'paused', 'fatigued') or started_at is not null`),
      chk('ads_commission_rate_chk', 'commission_rate between 0 and 0.25'),
    ],
    uniques: [uq('ads_external_key', { cols: ['platform', 'external_ad_id'], where: 'external_ad_id is not null' })],
    indexes: [
      ix('ads_brand_status_idx', '(brand_id, status)'),
      ix('ads_post_idx', '(post_id)'),
      ix('ads_rights_idx', `(rights_ends_at) where status in ('live', 'paused', 'fatigued')`),
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Market
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  offers: {
    skip: ['thread'],
    jsonDomains: { rights_card: 'public.rights_card' },
    checks: [
      chk('offers_rounds_chk', 'rounds between 0 and 3'),
      chk('offers_all_in_chk', `all_in_cents = amount_cents + ${bps('amount_cents', '(round(take_rate * 10000))::bigint')}`),
      chk('offers_invite_chk', `kind <> 'invite' or bounty_id is not null`),
      chk('offers_rebuy_chk', `kind <> 'rebuy' or rebuy_of_post_id is not null`),
      chk('offers_accepted_chk', `kind = 'invite' or status not in ('accepted', 'completed') or (escrow_funded and bounty_id is not null)`),
      chk('offers_expiry_chk', 'expires_at > created_at'),
    ],
    indexes: [
      ix('offers_creator_status_idx', '(creator_id, status, updated_at desc)'),
      ix('offers_brand_status_idx', '(brand_id, status, updated_at desc)'),
      ix('offers_expiry_idx', `(expires_at) where status in ('awaiting_creator', 'awaiting_brand')`),
    ],
    flags: { realtime: true },
  },

  auctions: {
    skip: ['bids'],
    softDelete: true,
    jsonDomains: { rights_card: 'public.rights_card' },
    checks: [
      chk('auctions_slots_chk', 'slots between 1 and 5'),
      chk('auctions_reserve_chk', 'reserve_cents >= 5000'),
      chk('auctions_duration_chk', `extract(epoch from (closes_at - opens_at)) between 259200 and 604800`),
      chk('auctions_awarded_chk', `status <> 'awarded' or (clearing_price_cents is not null and awarded_at is not null)`),
    ],
    indexes: [ix('auctions_status_idx', '(status, closes_at) where deleted_at is null'), ix('auctions_creator_idx', '(creator_id, status)')],
    flags: { realtime: true },
  },

  specs: {
    skip: ['licenses'],
    softDelete: true,
    extra: [{ name: 'embedding', sql: VEC, notNull: false, doc: 'Whole-video embedding for similar-spec search.' }],
    jsonDomains: { rights_card: 'public.rights_card' },
    checks: [
      chk('specs_listing_score_chk', `status not in ('listed', 'licensed', 'first_refusal') or flow_points >= 55`),
      chk('specs_price_chk', 'price_cents between 1500 and 50000'),
      chk('specs_source_chk', `source <> 'released_from_bounty' or (source_submission_id is not null and source_brand_id is not null and first_refusal_ends_at is not null)`),
      chk('specs_points_chk', 'flow_points between 0 and 100 and hook_points between 0 and 100'),
    ],
    indexes: [
      ix('specs_listed_idx', `(category, flow_points desc) where status = 'listed' and deleted_at is null`),
      ix('specs_creator_idx', '(creator_id, status)'),
      ix('specs_refusal_idx', `(first_refusal_ends_at) where status = 'first_refusal'`),
      ix('specs_embedding_idx', 'using hnsw (embedding extensions.vector_cosine_ops)'),
    ],
  },

  rights_grants: {
    skip: ['renewals'],
    checks: [
      chk('rights_grants_organic_chk', `(scope = 'organic') = (ends_at is null)`),
      chk('rights_grants_ai_chk', 'ai_likeness = false'),
      chk('rights_grants_renewal_price_chk', `renewal_price_cents = ${bps('base_fee_cents', '(round(renewal_pct_per_30d * 10000))::bigint')}`),
      chk('rights_grants_alerts_chk', 'alerts_sent <@ array[30, 14, 7]'),
      chk('rights_grants_code_days_chk', 'code_duration_days is null or code_duration_days in (7, 30, 60, 365)'),
      chk('rights_grants_term_chk', 'ends_at is null or ends_at > starts_at'),
    ],
    indexes: [
      ix('rights_grants_vault_idx', `(brand_id, ends_at) where ends_at is not null and status in ('active', 'expiring', 'renewal_requested')`),
      ix('rights_grants_expiry_idx', `(ends_at) where status in ('active', 'expiring', 'renewal_requested')`),
      ix('rights_grants_post_idx', '(post_id)'),
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Growth
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  daily_drops: {
    skip: ['items'],
    checks: [
      chk('daily_drops_release_chk', `extract(epoch from release_at) = extract(epoch from (date::timestamp at time zone 'UTC')) + 57600`),
      chk('daily_drops_claim_window_chk', 'extract(epoch from (claim_window_ends_at - release_at)) = 86400'),
      chk('daily_drops_inventory_chk', 'spots_left = spots_total - claims_total and spots_left >= 0'),
    ],
    uniques: [uq('daily_drops_date_key', { cols: ['date'] })],
    indexes: [ix('daily_drops_status_idx', '(status, release_at desc)')],
    flags: { realtime: true },
  },

  tournaments: {
    checks: [
      chk('tournaments_prize_chk', 'prize_pool_cents >= 25000'),
      chk('tournaments_window_chk', 'entries_open_at <= starts_at and starts_at < ends_at'),
    ],
    indexes: [ix('tournaments_status_idx', '(status, starts_at)')],
  },

  tournament_entries: {
    checks: [chk('tournament_entries_points_chk', 'hook_points between 0 and 100'), chk('tournament_entries_seed_chk', 'seed >= 1')],
    uniques: [uq('tournament_entries_creator_key', { cols: ['tournament_id', 'creator_id'] })],
    indexes: [ix('tournament_entries_tournament_idx', '(tournament_id, status)')],
    fkDelete: {},
  },

  crews: {
    softDelete: true,
    checks: [chk('crews_members_chk', 'member_count between 0 and 20'), chk('crews_name_chk', 'char_length(name) between 2 and 40')],
    uniques: [uq('crews_invite_code_key', { cols: ['invite_code'] }), uq('crews_name_key', { expr: 'lower(name)', where: 'deleted_at is null' })],
    indexes: [ix('crews_rank_idx', '(week_rank) where deleted_at is null')],
  },

  crew_members: {
    fkDelete: { crew_id: 'cascade' },
    uniques: [uq('crew_members_crew_creator_key', { cols: ['crew_id', 'creator_id'] })],
    indexes: [ix('crew_members_creator_idx', '(creator_id)')],
  },

  streaks: {
    fkDelete: { creator_id: 'cascade' },
    checks: [
      chk('streaks_freezes_chk', 'freezes_banked between 0 and 2'),
      chk('streaks_rest_chk', 'rest_weeks_used_quarter <= 2'),
      chk('streaks_week_chk', `iso_week ~ '^[0-9]{4}-W[0-9]{2}$'`),
      chk('streaks_next_freeze_chk', 'next_freeze_in_weeks between 0 and 3'),
    ],
    uniques: [uq('streaks_creator_key', { cols: ['creator_id'] })],
  },

  leaderboards: {
    skip: ['entries'],
    extra: [{ name: 'cohort_no', sql: 'public.nat', notNull: true, default: '1', doc: 'Cohort number inside (tier, niche). The contract id has no cohort number, so with more than one cohort per (tier, niche) ids must carry a suffix; this column is the key.' }],
    checks: [
      chk('leaderboards_week_chk', `iso_week ~ '^[0-9]{4}-W[0-9]{2}$'`),
      chk('leaderboards_zone_chk', `scope = 'cohort' or promotion_zone_size = 0`),
      chk('leaderboards_size_chk', 'promotion_zone_size <= cohort_size'),
    ],
    uniques: [uq('leaderboards_board_key', { cols: ['scope', 'iso_week', 'metric', 'tier', 'niche', 'cohort_no'], nullsNotDistinct: true })],
    indexes: [ix('leaderboards_week_idx', '(iso_week, scope, metric)')],
  },

  referrals: {
    checks: [
      chk('referrals_referrer_chk', 'referrer_creator_id is not null or referrer_brand_id is not null'),
      chk('referrals_cap_chk', 'reward_earned_cents <= reward_cap_cents'),
      chk('referrals_channel_chk', `channel in ('link', 'code', 'qr')`),
    ],
    indexes: [ix('referrals_code_idx', '(code)'), ix('referrals_referrer_idx', '(referrer_creator_id, status)')],
  },

  lessons: {
    rename: { order: 'sort_order' },
    checks: [chk('lessons_minutes_chk', 'read_minutes between 1 and 5'), chk('lessons_order_chk', 'sort_order between 1 and 10')],
    uniques: [uq('lessons_slug_key', { cols: ['slug'] }), uq('lessons_order_key', { cols: ['sort_order'] })],
  },

  lesson_progress: {
    fkDelete: { creator_id: 'cascade' },
    uniques: [uq('lesson_progress_creator_lesson_key', { cols: ['creator_id', 'lesson_id'] })],
    indexes: [ix('lesson_progress_lesson_idx', '(lesson_id)')],
  },

  trends: {
    checks: [chk('trends_sparkline_chk', 'cardinality(sparkline) = 8')],
    indexes: [ix('trends_kind_idx', '(kind, direction)')],
  },

  formats: {
    idType: 'public.format_id',
    idDefault: false,
    idPattern: false,
    columnOverrides: { id: { sql: 'public.format_id' } },
    checks: [chk('formats_rank_chk', 'rank between 1 and 11'), chk('formats_duration_chk', 'min_duration_s <= max_duration_s')],
    uniques: [uq('formats_rank_key', { cols: ['rank'] })],
  },

  hooks: {
    indexes: [ix('hooks_type_idx', '(hook_type)'), ix('hooks_applies_idx', 'using gin (applies_to)')],
  },

  tier_history: {
    rename: { at: 'occurred_at' },
    indexes: [ix('tier_history_creator_idx', '(creator_id, occurred_at desc)')],
  },

  wrapped: {
    uniques: [uq('wrapped_creator_period_key', { cols: ['creator_id', 'period', 'period_start'] })],
    checks: [chk('wrapped_period_chk', 'period_start <= period_end')],
    indexes: [ix('wrapped_creator_idx', '(creator_id, period_start desc)')],
  },

  proofs: {
    idPattern: false,
    checks: [
      chk('proofs_id_format_chk', `id ~ '^prf_[a-z0-9]{8}$'`),
      chk('proofs_hash_chk', `ledger_hash ~ '^[0-9a-f]{12}$'`),
      chk('proofs_typical_chk', 'typical_p25_cents <= typical_median_cents and typical_median_cents <= typical_p75_cents'),
      chk('proofs_period_chk', 'period_start <= period_end'),
    ],
    indexes: [ix('proofs_creator_idx', '(creator_id, created_at desc)'), ix('proofs_payout_idx', '(payout_id) where payout_id is not null')],
  },

  bounty_saves: {
    defaults: { saved_at: 'now()', stage: `'saved'` },
    fkDelete: { creator_id: 'cascade' },
    uniques: [uq('bounty_saves_creator_bounty_key', { cols: ['creator_id', 'bounty_id'] })],
    indexes: [ix('bounty_saves_bounty_idx', '(bounty_id, stage)'), ix('bounty_saves_claim_idx', '(claimed_until) where claimed_until is not null')],
  },

  wellbeing_settings: {
    fkDelete: { creator_id: 'cascade' },
    uniques: [uq('wellbeing_settings_creator_key', { cols: ['creator_id'] })],
  },

  notification_prefs: {
    fkDelete: { user_id: 'cascade' },
    uniques: [uq('notification_prefs_user_key', { cols: ['user_id'] })],
  },

  waitlist: { replaced: 'waitlist_entries and the v_waitlist_totals / v_waitlist_leaders views (the contract entity is a read model)' },

  state_of_app_ugc: {
    primaryKey: ['quarter'],
    comment: 'Published State of App UGC reports, one row per quarter. Written by the quarterly report job from the market views; public read.',
    checks: [chk('state_of_app_ugc_quarter_chk', `quarter ~ '^[0-9]{4}-Q[1-4]$'`)],
  },

  case_studies: {
    checks: [chk('case_studies_fictional_chk', 'fictional or published_at is not null')],
    indexes: [ix('case_studies_published_idx', '(published_at desc)')],
  },

  testimonials: { indexes: [ix('testimonials_kind_idx', '(kind)')] },

  changelog: {
    indexes: [ix('changelog_date_idx', '(date desc)')],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Trust
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  feedback_notes: {
    compositeFks: [{ name: 'feedback_notes_version_fkey', columns: ['submission_id', 'version'], table: 'submission_versions', refColumns: ['submission_id', 'version'], onDelete: 'cascade' }],
    checks: [
      chk('feedback_notes_range_chk', 't_end_ms is null or t_end_ms >= t_ms'),
      chk('feedback_notes_resolved_chk', `status <> 'resolved' or resolved_at is not null`),
    ],
    indexes: [
      ix('feedback_notes_submission_idx', '(submission_id, version, t_ms)'),
      ix('feedback_notes_open_idx', `(submission_id) where status = 'open' and severity = 'must_fix'`),
    ],
  },

  disputes: {
    skip: ['events'],
    checks: [
      chk('disputes_appeal_chk', `kind <> 'rejection_appeal' or (submission_id is not null and rejection_reason_code is not null)`),
      chk('disputes_resolved_chk', `status <> 'resolved' or (outcome is not null and resolved_at is not null)`),
      chk('disputes_reply_sla_chk', 'extract(epoch from (reply_due_at - opened_at)) = 86400'),
      chk('disputes_range_chk', 'range_to is null or range_from is null or range_to >= range_from'),
      chk('disputes_opener_chk', `opened_by <> 'creator' or creator_id is not null`),
    ],
    uniques: [uq('disputes_one_appeal_key', { cols: ['submission_id'], where: `kind = 'rejection_appeal' and status <> 'withdrawn'` })],
    indexes: [
      ix('disputes_queue_idx', `(reply_due_at) where status in ('open', 'evidence_requested', 'under_review')`),
      ix('disputes_creator_idx', '(creator_id, status)'),
      ix('disputes_brand_idx', '(brand_id, status)'),
      ix('disputes_post_idx', '(post_id) where post_id is not null'),
    ],
    flags: { realtime: true },
  },

  scam_reports: {
    checks: [
      chk('scam_reports_case_chk', `case_id ~ '^SR-[0-9]{4}-[0-9]{4,}$'`),
      chk('scam_reports_reporter_chk', `(reporter_kind = 'creator' and reporter_creator_id is not null) or (reporter_kind = 'brand' and reporter_brand_id is not null)`),
    ],
    uniques: [uq('scam_reports_case_key', { cols: ['case_id'] })],
    indexes: [ix('scam_reports_queue_idx', `(sla_due_at) where status in ('new', 'triaged')`), ix('scam_reports_target_idx', '(target_kind, target_id)')],
  },

  fraud_flags: {
    checks: [chk('fraud_flags_score_chk', 'score between 40 and 100')],
    uniques: [uq('fraud_flags_open_post_key', { cols: ['post_id'], where: `status in ('open', 'monitoring')` })],
    indexes: [ix('fraud_flags_queue_idx', `(score desc, money_at_stake_cents desc) where status in ('open', 'monitoring')`), ix('fraud_flags_creator_idx', '(creator_id)')],
  },

  verifications: {
    checks: [
      chk('verifications_subject_chk', `(subject_kind = 'creator' and creator_id is not null) or (subject_kind = 'brand' and brand_id is not null)`),
      chk('verifications_reason_chk', `status not in ('needs_info', 'rejected') or reason is not null`),
    ],
    indexes: [ix('verifications_queue_idx', `(sla_due_at) where status = 'pending'`), ix('verifications_creator_idx', '(creator_id, kind)'), ix('verifications_brand_idx', '(brand_id, kind)')],
  },

  tax_profiles: {
    checks: [
      chk('tax_profiles_tin_chk', `tin_last4 is null or tin_last4 ~ '^[0-9]{4}$'`),
      chk('tax_profiles_set_aside_chk', `set_aside_cents = ((ytd_cleared_cents * (round(set_aside_rate * 10000))::bigint) + 5000) / 10000`),
      chk('tax_profiles_progress_chk', 'threshold_progress <= 1'),
      chk('tax_profiles_year_chk', 'tax_year between 2024 and 2100'),
    ],
    uniques: [uq('tax_profiles_creator_year_key', { cols: ['creator_id', 'tax_year'] })],
    indexes: [ix('tax_profiles_status_idx', '(status)')],
  },

  tax_docs: {
    indexes: [ix('tax_docs_creator_idx', '(creator_id, tax_year desc)')],
  },

  compliance_checks: {
    skip: ['checks'],
    checks: [chk('compliance_checks_blocks_chk', `blocks_settlement = (overall = 'fail' and waived_by_member_id is null and fixed_at is null)`)],
    uniques: [uq('compliance_checks_post_key', { cols: ['post_id'] })],
    indexes: [ix('compliance_checks_blocking_idx', '(brand_id) where blocks_settlement')],
  },

  payout_runs: {
    checks: [
      chk('payout_runs_friday_chk', 'extract(isodow from run_date) = 5'),
      chk('payout_runs_schedule_chk', `extract(epoch from scheduled_for) = extract(epoch from (run_date::timestamp at time zone 'UTC')) + 64800`),
      chk('payout_runs_totals_chk', 'total_net_cents = total_gross_cents - total_fee_cents and total_fee_cents = 0'),
    ],
    uniques: [uq('payout_runs_date_key', { cols: ['run_date'] })],
    indexes: [ix('payout_runs_status_idx', '(status, scheduled_for desc)')],
  },

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // Platform
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  notifications: {
    indexes: [
      ix('notifications_recipient_idx', '(recipient_user_id, created_at desc)'),
      ix('notifications_unread_idx', '(recipient_user_id) where read_at is null'),
      ix('notifications_batched_idx', '(recipient_user_id, created_at) where batched and delivered_at is null'),
    ],
    flags: { realtime: true },
  },

  integrations: {
    softDelete: true,
    uniques: [uq('integrations_brand_kind_key', { cols: ['brand_id', 'app_id', 'kind'], where: 'deleted_at is null', nullsNotDistinct: true })],
    indexes: [ix('integrations_status_idx', `(brand_id, status) where deleted_at is null`)],
  },

  api_keys: {
    extra: [
      { name: 'key_hash', sql: 'text', notNull: true, doc: 'sha256 (hex) of the full key. The secret is shown once at creation and never stored.' },
    ],
    checks: [
      chk('api_keys_prefix_chk', `(mode = 'live') = (prefix = 'fd_live_') and prefix in ('fd_live_', 'fd_test_')`),
      chk('api_keys_last4_chk', `last4 ~ '^[A-Za-z0-9]{4}$'`),
      chk('api_keys_scopes_chk', 'cardinality(scopes) >= 1'),
      chk('api_keys_rate_chk', 'rate_limit_per_minute between 1 and 100000'),
    ],
    uniques: [uq('api_keys_hash_key', { cols: ['key_hash'] })],
    indexes: [ix('api_keys_brand_idx', '(brand_id) where revoked_at is null')],
  },

  webhooks: {
    skip: ['deliveries'],
    softDelete: true,
    checks: [chk('webhooks_url_chk', `url ~ '^https://'`)],
    indexes: [ix('webhooks_brand_idx', '(brand_id, status) where deleted_at is null')],
  },

  activity_log: {
    rename: { at: 'occurred_at' },
    indexes: [ix('activity_log_brand_idx', '(brand_id, occurred_at desc)'), ix('activity_log_action_idx', '(brand_id, action, occurred_at desc)')],
    flags: { appendOnly: true },
  },

  auto_approve_rules: {
    skip: ['audit'],
    softDelete: true,
    checks: [
      chk('auto_approve_rules_dry_run_chk', `status not in ('active') or dry_run is not null`),
      chk('auto_approve_rules_killed_chk', `status <> 'killed' or killed_at is not null`),
    ],
    indexes: [ix('auto_approve_rules_brand_idx', '(brand_id, status) where deleted_at is null')],
  },

  test_plans: {
    indexes: [ix('test_plans_brand_idx', '(brand_id, status)')],
    checks: [chk('test_plans_budget_chk', 'budget_cents >= 0')],
  },

  fatigue_alerts: {
    checks: [chk('fatigue_alerts_drop_chk', 'drop_ratio >= 0.30'), chk('fatigue_alerts_values_chk', 'current_value <= peak_value')],
    indexes: [ix('fatigue_alerts_brand_idx', `(brand_id, status)`), ix('fatigue_alerts_post_idx', '(post_id)')],
  },

  audit_reports: {
    checks: [chk('audit_reports_hooks_chk', 'jsonb_array_length(hooks) = 10'), chk('audit_reports_slug_chk', `slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'`)],
    uniques: [uq('audit_reports_slug_key', { cols: ['slug'] })],
    indexes: [ix('audit_reports_generated_idx', '(generated_at desc)')],
  },

  flo_suggestions: {
    indexes: [ix('flo_suggestions_creator_idx', '(creator_id, created_at desc) where creator_id is not null'), ix('flo_suggestions_brand_idx', '(brand_id, created_at desc) where brand_id is not null')],
    checks: [chk('flo_suggestions_owner_chk', 'creator_id is not null or brand_id is not null')],
  },

  ml_models: {
    uniques: [uq('ml_models_kind_key', { cols: ['kind'] })],
    checks: [chk('ml_models_drift_chk', 'drift_score between 0 and 1')],
  },

  admin_metrics: {
    primaryKey: ['as_of'],
    comment: 'Daily snapshots of the admin control tower (targets vs actuals, market health, queue counts). Written by the nightly metrics job; the live queue counts are in v_admin_queue_counts.',
    idPattern: false,
  },

  threads: {
    skip: ['messages'],
    checks: [chk('threads_party_chk', 'creator_id is not null or brand_id is not null')],
    indexes: [
      ix('threads_creator_idx', '(creator_id, last_message_at desc) where creator_id is not null'),
      ix('threads_brand_idx', '(brand_id, last_message_at desc) where brand_id is not null'),
      ix('threads_offer_idx', '(offer_id) where offer_id is not null'),
      ix('threads_submission_idx', '(submission_id) where submission_id is not null'),
    ],
    flags: { realtime: true },
  },

  revenuecat_events: {
    extra: [{ name: 'payload', sql: 'jsonb', notNull: false, jsonbKind: 'object', doc: 'The raw RevenueCat event body, kept for replay and audits.' }],
    checks: [chk('revenuecat_events_env_chk', `environment in ('production', 'sandbox')`)],
    uniques: [uq('revenuecat_events_idem_key', { cols: ['app_id', 'idempotency_key'] })],
    indexes: [
      ix('revenuecat_events_app_idx', '(app_id, received_at desc)'),
      ix('revenuecat_events_unmatched_idx', `(app_id) where match_status = 'unmatched'`),
      ix('revenuecat_events_conversion_idx', '(matched_conversion_id) where matched_conversion_id is not null'),
    ],
  },

  offer_code_pool: {
    checks: [chk('offer_code_pool_redemptions_chk', 'redemptions <= max_redemptions'), chk('offer_code_pool_validity_chk', 'valid_until > valid_from')],
    uniques: [uq('offer_code_pool_code_key', { cols: ['app_id', 'code'] })],
    indexes: [ix('offer_code_pool_active_idx', `(app_id, sku) where status in ('available', 'assigned')`), ix('offer_code_pool_rotation_idx', '(rotation_due_at) where rotation_due_at is not null')],
  },

  brand_lists: {
    softDelete: true,
    uniques: [
      uq('brand_lists_name_key', { cols: ['brand_id', 'name'], where: 'deleted_at is null' }),
      uq('brand_lists_favourites_key', { cols: ['brand_id'], where: 'is_favourites and deleted_at is null' }),
    ],
  },
};
