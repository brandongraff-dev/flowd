-- Trigger attachments for the invariants in 10-invariants.sql that are specific to one table.
-- (Generic attachments - updated_at, state machines, append-only - are generated per table by gen-schema.mjs.)

-- Ledger: fill links, append-only, running balance, per-transaction balance and balance floors.
create trigger ledger_fill_links
  before insert on public.ledger
  for each row execute function private.ledger_fill_links();
create trigger ledger_guard
  before update or delete on public.ledger
  for each row execute function private.ledger_guard();
create trigger ledger_no_truncate
  before truncate on public.ledger
  for each statement execute function private.no_truncate();
create trigger ledger_apply_balance
  after insert on public.ledger
  for each row execute function private.ledger_apply_balance();
create constraint trigger ledger_txn_balanced
  after insert on public.ledger
  deferrable initially deferred
  for each row execute function private.ledger_txn_check();
create constraint trigger ledger_balance_floor
  after insert or update on public.ledger_balances
  deferrable initially deferred
  for each row execute function private.ledger_balance_check();

create trigger ledger_transactions_append_only
  before update or delete on public.ledger_transactions
  for each row execute function private.append_only_guard();
create trigger ledger_transactions_no_truncate
  before truncate on public.ledger_transactions
  for each statement execute function private.no_truncate();
create trigger ledger_balances_no_truncate
  before truncate on public.ledger_balances
  for each statement execute function private.no_truncate();

-- Escrow: ledger balance of escrow:<bounty> = reserved + remaining, checked at commit.
create constraint trigger bounties_escrow_reconcile
  after insert or update of escrow_funded_cents, reserved_cents, remaining_cents, spent_cents, refunded_cents on public.bounties
  deferrable initially deferred
  for each row execute function private.bounty_escrow_reconcile();

-- View Ledger.
create trigger view_snapshots_guard
  before insert on public.view_snapshots
  for each row execute function private.view_snapshot_guard();

-- Daily Drop inventory.
create trigger drop_claims_guard
  before insert on public.drop_claims
  for each row execute function private.drop_claim_guard();
create trigger drop_claims_sync
  after insert or delete on public.drop_claims
  for each row execute function private.drop_inventory_sync();
create trigger drop_items_sync
  after insert or update or delete on public.drop_items
  for each row execute function private.drop_inventory_sync();

-- Crews.
create trigger crew_members_guard
  before insert on public.crew_members
  for each row execute function private.crew_member_guard();
create trigger crew_members_sync
  after insert or delete on public.crew_members
  for each row execute function private.crew_member_sync();

-- Offer-code pool cap.
create constraint trigger offer_code_pool_cap
  after insert or update of status, sku, app_id on public.offer_code_pool
  deferrable initially deferred
  for each row execute function private.offer_code_cap_check();

-- Workspaces keep an owner.
create constraint trigger brand_members_owner
  after insert or update or delete on public.brand_members
  deferrable initially deferred
  for each row execute function private.brand_owner_check();

-- No-Rug Approvals.
create trigger submissions_decision_guard
  before update of decision on public.submissions
  for each row
  when (new.decision is distinct from old.decision)
  execute function private.submission_decision_guard();

-- Soft delete never hides money.
create trigger brands_soft_delete_guard
  before update of deleted_at on public.brands
  for each row execute function private.brand_soft_delete_guard();
create trigger creators_soft_delete_guard
  before update of deleted_at on public.creators
  for each row execute function private.creator_soft_delete_guard();
