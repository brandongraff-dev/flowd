/**
 * The immutable BASE of the demo world: the fixture rows exactly as shipped.
 *
 * The store state references these row objects directly and never mutates them (every write copies the row), so
 *   - an unchanged table costs nothing (`state.bounties === base.bounties`),
 *   - the persisted overlay is simply the rows whose identity differs from the base,
 *   - reset is "point the state back at the base".
 *
 * Tables load on demand (`ensureBase`). The core set loads together; heavy tables load one at a time.
 */

import { loadFixture } from "@/lib/data/fixtures";
import type { FixtureName } from "@/lib/contract/types";
import { createEmptyState, emptyDocs, type DemoState, type Docs } from "./state";
import { CORE_TABLES, DOC_NAMES, ROW_TABLES, SEQUENCES, keyOf, type DocName, type RowOf, type RowTableName, type SequenceName } from "./tables";
import { initialCounters, scanSequence } from "./ids";

const baseTables = new Map<RowTableName, Record<string, unknown>>();
const baseDocs = new Map<DocName, unknown>();
const inflight = new Map<string, Promise<void>>();

/** Recursively freezes data in tests so an accidental in-place write to a base row fails loudly instead of corrupting the demo. */
const FREEZE = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST !== undefined);

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  return value;
}

/** Rows in fixture order, keyed by id (or the composite key). */
export function indexRows<K extends RowTableName>(table: K, rows: readonly RowOf<K>[]): Record<string, RowOf<K>> {
  const out: Record<string, RowOf<K>> = {};
  for (const row of rows) out[keyOf(table, row)] = row;
  return out;
}

export const getBaseTable = <K extends RowTableName>(table: K): Record<string, RowOf<K>> | undefined => baseTables.get(table) as Record<string, RowOf<K>> | undefined;
export const getBaseDoc = <K extends DocName>(doc: K): Docs[K] | undefined => baseDocs.get(doc) as Docs[K] | undefined;
export const isBaseLoaded = (name: RowTableName | DocName): boolean => baseTables.has(name as RowTableName) || baseDocs.has(name as DocName);

/** Brings fixtures into the base cache (idempotent; concurrent calls share the work). */
export function loadBase(names: readonly (RowTableName | DocName)[]): Promise<void> {
  return Promise.all(
    names.map((name) => {
      if (isBaseLoaded(name)) return Promise.resolve();
      const hit = inflight.get(name);
      if (hit) return hit;
      const p = loadFixture(name as FixtureName).then((data) => {
        const frozen = FREEZE ? deepFreeze(data) : data;
        if ((DOC_NAMES as readonly string[]).includes(name)) baseDocs.set(name as DocName, frozen);
        else baseTables.set(name as RowTableName, indexRows(name as RowTableName, frozen as never));
      });
      inflight.set(name, p);
      p.then(
        () => inflight.delete(name),
        () => inflight.delete(name),
      );
      return p;
    }),
  ).then(() => undefined);
}

/** The core load: every non-heavy table and every doc. */
export const loadCoreBase = (): Promise<void> => loadBase([...DOC_NAMES, ...CORE_TABLES]);

/**
 * Pure merge of loaded base data into a state. Rows already in the state (written by actions or restored from the overlay before the table
 * loaded) win over the base row with the same key; tombstoned base rows stay removed. Docs are replaced only while still a placeholder.
 * The base for every name must already be loaded (`loadBase`).
 */
export function mergeBase(state: DemoState, names: readonly (RowTableName | DocName)[]): DemoState {
  const out = { ...state, loaded: { ...state.loaded } } as unknown as Record<string, unknown> & { loaded: Record<string, boolean> };
  let changed = false;
  for (const name of names) {
    if (state.loaded[name]) continue;
    if ((DOC_NAMES as readonly string[]).includes(name)) {
      const base = baseDocs.get(name as DocName);
      if (base === undefined) continue;
      out[name] = base;
      out.loaded[name] = true;
      changed = true;
      continue;
    }
    const table = name as RowTableName;
    const base = baseTables.get(table);
    if (base === undefined) continue;
    const current = state[table] as Record<string, unknown>;
    const tomb = state.tombstones[table];
    let merged: Record<string, unknown>;
    if (Object.keys(current).length === 0 && !tomb) merged = base;
    else {
      merged = { ...base };
      if (tomb) for (const id of tomb) delete merged[id];
      Object.assign(merged, current);
    }
    out[table] = merged;
    out.loaded[table] = true;
    changed = true;
  }
  if (!changed) return state;
  const next = out as unknown as DemoState;
  // Continue the id numbering the newly loaded rows use.
  const counters = { ...next.counters };
  const touched = new Set<string>(names);
  const coreTouched = names.some((n) => (CORE_TABLES as readonly string[]).includes(n));
  for (const seq of Object.keys(SEQUENCES) as SequenceName[]) {
    const def = SEQUENCES[seq];
    if (def.table === null ? !coreTouched : !touched.has(def.table)) continue;
    counters[seq] = Math.max(counters[seq] ?? 0, scanSequence(next, seq));
  }
  return { ...next, counters };
}

/**
 * The seeded world: every loaded base table and doc, the demo clock, no session. `session` is kept from `keep` when given (reset keeps you signed in).
 */
export function seedState(keep?: Pick<DemoState, "session">): DemoState {
  const state = createEmptyState();
  const out = { ...state, loaded: {} as DemoState["loaded"] } as unknown as Record<string, unknown>;
  for (const t of ROW_TABLES) {
    const base = baseTables.get(t);
    if (base) {
      out[t] = base;
      (out.loaded as Record<string, boolean>)[t] = true;
    }
  }
  const docs = emptyDocs();
  for (const d of DOC_NAMES) {
    const base = baseDocs.get(d);
    out[d] = base ?? docs[d];
    if (base) (out.loaded as Record<string, boolean>)[d] = true;
  }
  const seeded = out as unknown as DemoState;
  const withCounters: DemoState = { ...seeded, counters: initialCounters(seeded), clock: { now: seeded.world.now, advanced_hours: 0 } };
  return keep ? { ...withCounters, session: keep.session } : withCounters;
}

/** Clears the base cache (tests only). */
export function resetBaseForTests(): void {
  baseTables.clear();
  baseDocs.clear();
  inflight.clear();
}
