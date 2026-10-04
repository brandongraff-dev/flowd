/**
 * Transactions: how every mutation of the demo world is made.
 *
 * A `Tx` wraps a state with copy-on-write tables. An action reads and writes through it, and either the whole action commits (a new state with
 * structural sharing) or it throws an `ActionError` and the original state is untouched. Rows are never mutated in place: `patch` and `put`
 * store a new object, so the immutable fixture rows (and every selector that memoises on identity) stay valid.
 *
 * The same pure action runs in the browser store, in the server-side mock API and in unit tests.
 */

import type { LedgerEntry, IsoTimestamp } from "@/lib/contract/types";
import type { LedgerTxn } from "@/lib/engine";
import { walletAccount } from "@/lib/engine";
import { getBaseTable } from "../base";
import { formatSequenceId } from "../ids";
import type { DemoState, Docs, Session } from "../state";
import { keyOf, type DocName, type RowOf, type RowTableName, type SequenceName } from "../tables";

/** A refusal with a stable code (the API's `{ code, message, hint }`), a plain-English message and what to do next. */
export class ActionError extends Error {
  readonly code: string;
  readonly hint?: string;
  /** The HTTP status the mock API answers with. */
  readonly status: number;
  constructor(code: string, message: string, hint?: string, status = 409) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

export interface ActionFailure {
  code: string;
  message: string;
  hint?: string;
  status: number;
}

/** What every action returns. Pages show `error.message` (and `error.hint`) in a toast or inline. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionFailure };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (code: string, message: string, hint?: string, status = 409): ActionResult<never> => ({ ok: false, error: { code, message, hint, status } });

/** Throws an `ActionError` unless the condition holds. */
export function ensure(condition: unknown, code: string, message: string, hint?: string, status = 409): asserts condition {
  if (!condition) throw new ActionError(code, message, hint, status);
}

export class Tx {
  private s: DemoState;
  /** Tables already copied since the last time the state was handed out. */
  private readonly cloned = new Set<string>();
  /** True once `state` was handed out: the next write starts a fresh copy so a handed-out snapshot never changes underneath its reader. */
  private published = false;

  constructor(base: DemoState) {
    this.s = { ...base };
  }

  /** Makes the working state private again before a write (see `published`). */
  private touch(): void {
    if (this.published) {
      this.s = { ...this.s };
      this.published = false;
    }
  }

  // ── context ──────────────────────────────────────────────────────────────────────────────────

  /** The demo clock. */
  get now(): IsoTimestamp {
    return this.s.clock.now;
  }

  get session(): Session {
    return this.s.session;
  }

  /**
   * The working state as it is right now, for reading (selectors and engine calls take it). Do not write through it. A later write never changes the
   * returned object, so it is safe to run memoised selectors on it.
   */
  get state(): DemoState {
    this.published = true;
    this.cloned.clear();
    return this.s;
  }

  // ── rows ─────────────────────────────────────────────────────────────────────────────────────

  private writable<K extends RowTableName>(table: K): Record<string, RowOf<K>> {
    this.touch();
    if (!this.cloned.has(table)) {
      (this.s as unknown as Record<string, unknown>)[table] = { ...(this.s[table] as Record<string, unknown>) };
      this.cloned.add(table);
    }
    return this.s[table] as Record<string, RowOf<K>>;
  }

  get<K extends RowTableName>(table: K, id: string | undefined | null): RowOf<K> | undefined {
    if (!id) return undefined;
    return (this.s[table] as Record<string, RowOf<K>>)[id];
  }

  /** A row that must exist: throws `not_found` (404) otherwise. */
  must<K extends RowTableName>(table: K, id: string | undefined | null, what?: string): RowOf<K> {
    const row = this.get(table, id);
    if (!row) throw new ActionError("not_found", `${what ?? table.replace(/_/g, " ")} ${id ?? ""} was not found.`.replace(/\s+\./, "."), "Check the id and try again.", 404);
    return row;
  }

  all<K extends RowTableName>(table: K): RowOf<K>[] {
    return Object.values(this.s[table] as Record<string, RowOf<K>>);
  }

  /** Inserts or replaces a row (keyed by its id). */
  put<K extends RowTableName>(table: K, row: RowOf<K>): RowOf<K> {
    this.writable(table)[keyOf(table, row)] = row;
    return row;
  }

  /** Replaces a row with a patched copy. `change` is a partial row or a function from the row to a partial row. */
  patch<K extends RowTableName>(table: K, id: string, change: Partial<RowOf<K>> | ((row: RowOf<K>) => Partial<RowOf<K>>), what?: string): RowOf<K> {
    const row = this.must(table, id, what);
    const next = { ...(row as unknown as Record<string, unknown>), ...((typeof change === "function" ? change(row) : change) as Record<string, unknown>) } as unknown as RowOf<K>;
    this.writable(table)[id] = next;
    return next;
  }

  /** Replaces a row with a copy that has the given optional fields removed (patch cannot clear a field). */
  unset<K extends RowTableName>(table: K, id: string, ...keys: (keyof RowOf<K>)[]): RowOf<K> {
    const row = { ...(this.must(table, id) as unknown as Record<string, unknown>) } as unknown as RowOf<K>;
    for (const k of keys) delete (row as unknown as Record<string, unknown>)[k as string];
    this.writable(table)[id] = row;
    return row;
  }

  /** Removes a row. A base fixture row is tombstoned so a later load does not bring it back. */
  remove<K extends RowTableName>(table: K, id: string): void {
    const t = this.writable(table);
    if (!(id in t)) return;
    delete t[id];
    const base = getBaseTable(table);
    if (base && id in base) {
      this.touch();
      this.s = { ...this.s, tombstones: { ...this.s.tombstones, [table]: [...(this.s.tombstones[table] ?? []), id] } };
    }
  }

  // ── docs ─────────────────────────────────────────────────────────────────────────────────────

  doc<K extends DocName>(name: K): Docs[K] {
    return this.s[name];
  }

  setDoc<K extends DocName>(name: K, value: Docs[K]): void {
    this.touch();
    (this.s as unknown as Record<string, unknown>)[name] = value;
  }

  // ── session and clock ────────────────────────────────────────────────────────────────────────

  setSession(session: Session): void {
    this.touch();
    this.s = { ...this.s, session };
  }

  setClock(now: IsoTimestamp, advancedHours: number): void {
    this.touch();
    this.s = { ...this.s, clock: { now, advanced_hours: advancedHours } };
  }

  // ── ids ──────────────────────────────────────────────────────────────────────────────────────

  /** The next id of a sequence ("sub_0705", "ledg_004278", "txn_001634"). */
  nextId(seq: SequenceName): string {
    return formatSequenceId(seq, this.nextNumber(seq));
  }

  /** The next number of a sequence (for ids that embed it in another shape, like "vid_0778"). */
  nextNumber(seq: SequenceName): number {
    this.touch();
    const n = (this.s.counters[seq] ?? 0) + 1;
    this.s = { ...this.s, counters: { ...this.s.counters, [seq]: n } };
    return n;
  }

  // ── the ledger ───────────────────────────────────────────────────────────────────────────────

  /**
   * Appends a transaction to the ledger. Legs get ids in order; a leg on `wallet:br_x` also moves that brand's `wallet_balance_cents`, so the
   * denormalised balance and the ledger can never disagree (invariant L-02).
   */
  post(txn: LedgerTxn): LedgerEntry[] {
    const rows: LedgerEntry[] = [];
    for (const leg of txn.legs) {
      const row: LedgerEntry = { id: this.nextId("ledg"), ...leg };
      this.put("ledger", row);
      rows.push(row);
      if (leg.account.startsWith("wallet:")) {
        const brandId = leg.account.slice("wallet:".length);
        const brand = this.get("brands", brandId);
        if (brand) this.patch("brands", brandId, { wallet_balance_cents: brand.wallet_balance_cents + leg.amount_cents });
      }
    }
    return rows;
  }

  /** The brand's wallet balance from the ledger rows posted so far (the source of truth `wallet_balance_cents` mirrors). */
  walletBalance(brandId: string): number {
    const account = walletAccount(brandId);
    let sum = 0;
    for (const e of this.all("ledger")) if (e.account === account) sum += e.amount_cents;
    return sum;
  }

  // ── commit ───────────────────────────────────────────────────────────────────────────────────

  commit(): DemoState {
    this.published = true;
    return this.s;
  }
}

/**
 * Runs an action against a state. On success returns the new state and the result; on an `ActionError` returns the SAME state and a failure.
 * Unexpected errors (a bug) are reported as `internal_error` in the app and rethrown under test so they cannot hide.
 */
export function runAction<I, T>(state: DemoState, fn: (tx: Tx, input: I) => T, input: I): { state: DemoState; result: ActionResult<T> } {
  const tx = new Tx(state);
  try {
    const data = fn(tx, input);
    return { state: tx.commit(), result: ok(data) };
  } catch (e) {
    if (e instanceof ActionError) return { state, result: { ok: false, error: { code: e.code, message: e.message, hint: e.hint, status: e.status } } };
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST !== undefined)) throw e;
    if (typeof console !== "undefined") console.error("[flowd demo store] action failed", e);
    return { state, result: fail("internal_error", "Something went wrong in the demo. Your data is unchanged.", "Reset the demo from the account menu if this keeps happening.", 500) };
  }
}
