/**
 * The selector kit. A SELECTOR is a pure function `(db, arg) => result` that declares which tables it reads:
 *
 *   export const selectBounty = defineSelector(["bounties", "apps", "brands"], (db, id: string) => ...);
 *
 * Because the keys are part of the type, a selector cannot read a table it did not declare, and `useSelect` subscribes to exactly those tables
 * (nothing re-renders when an unrelated table changes). Selectors never mutate, never read a clock (they use `db.clock.now`), and are total: on the
 * empty world (before the store is ready) they return empty lists and `undefined`, never throw.
 *
 * Views are the rows with their joins resolved (`bounty.app`, `submission.creator`). They keep a stable identity while the rows behind them are
 * unchanged (`joinView`), so React.memo and effect dependencies behave.
 */

import type { DemoState, StateKey } from "@/lib/store/state";
import type { DocName, RowTableName } from "@/lib/store/tables";

/** The slice of the demo world a selector sees. */
export type Db<K extends StateKey> = Pick<DemoState, K>;

type TableName = RowTableName | DocName;

export interface Selector<K extends StateKey, A, R> {
  /** Call it with the world and, when it takes one, its argument. */
  (db: Db<K>, arg?: A): R;
  /** The tables, docs, `session` or `clock` the selector reads. */
  readonly keys: readonly K[];
  /** Heavy tables the selector needs loaded; the hook asks the store to load them. They are also in `keys`. */
  readonly ensure: readonly TableName[];
}

/** Declares a selector and the state it reads. `ensure` lists heavy tables that must be loaded (the result says `loading` until they are). */
export function defineSelector<K extends StateKey, A, R>(keys: readonly K[], fn: (db: Db<K>, arg: A) => R, options: { ensure?: readonly TableName[] } = {}): Selector<K, A, R> {
  const sel = ((db: Db<K>, arg?: A): R => fn(db, arg as A)) as Selector<K, A, R>;
  Object.defineProperty(sel, "keys", { value: keys, enumerable: true });
  Object.defineProperty(sel, "ensure", { value: options.ensure ?? [], enumerable: true });
  return sel;
}

/** The union of several selectors' keys, for a selector that composes others. Name the resulting key type: `mergeKeys<keyof MyDb & StateKey>(a.keys, b.keys)`. */
export function mergeKeys<K extends StateKey>(...lists: readonly (readonly StateKey[])[]): readonly K[] {
  return [...new Set(lists.flat())] as K[];
}

/** The world a selector reads, as a type: `DbOf<typeof selectBounties>`. */
export type DbOf<S extends (db: never, arg?: never) => unknown> = Parameters<S>[0];

// ── caches keyed by table identity ─────────────────────────────────────────────────────────────
// The store never mutates a table object: a write makes a new one. So anything computed from a table can be cached on the table object itself,
// and it is exactly as fresh as the table.

const valuesCache = new WeakMap<object, readonly unknown[]>();

/** The rows of a table as an array (insertion order = fixture order), computed once per table version. */
export function valuesOf<T>(table: Readonly<Record<string, T>>): readonly T[] {
  let hit = valuesCache.get(table);
  if (!hit) {
    hit = Object.values(table);
    valuesCache.set(table, hit);
  }
  return hit as readonly T[];
}

const groupCache = new WeakMap<object, Map<string, Map<string, unknown[]>>>();
const NONE: readonly never[] = Object.freeze([]);

/** Groups a table's rows by a key, once per table version and `name`: `groupBy(db.posts, "creator", (p) => p.creator_id).get("cr_maya")`. */
export function groupBy<T>(table: Readonly<Record<string, T>>, name: string, key: (row: T) => string | undefined): { get(k: string | null | undefined): readonly T[] } {
  let byName = groupCache.get(table);
  if (!byName) {
    byName = new Map();
    groupCache.set(table, byName);
  }
  let groups = byName.get(name);
  if (!groups) {
    groups = new Map();
    for (const row of valuesOf(table)) {
      const k = key(row);
      if (k === undefined) continue;
      const list = groups.get(k);
      if (list) list.push(row);
      else groups.set(k, [row]);
    }
    byName.set(name, groups);
  }
  const g = groups;
  return { get: (k) => (k ? ((g.get(k) as readonly T[] | undefined) ?? NONE) : NONE) };
}

// ── stable views ───────────────────────────────────────────────────────────────────────────────

interface ViewEntry<V> {
  deps: readonly unknown[];
  view: V;
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
};

/**
 * A cache for one kind of view: `joinView(cache, row, [app, brand], () => ({ ...row, app, brand }))` returns the SAME object as last time while the row
 * and every joined row are the same objects. Make one cache per view type (module-level `new WeakMap()`).
 */
export function joinView<R extends object, V>(cache: WeakMap<R, ViewEntry<V>>, row: R, deps: readonly unknown[], build: () => V): V {
  const hit = cache.get(row);
  if (hit && sameDeps(hit.deps, deps)) return hit.view;
  const view = build();
  cache.set(row, { deps, view });
  return view;
}

/** A WeakMap typed for `joinView`. */
export const viewCache = <R extends object, V>(): WeakMap<R, ViewEntry<V>> => new WeakMap<R, ViewEntry<V>>();

// ── small helpers selectors share ──────────────────────────────────────────────────────────────

/** Case-insensitive "all words match" over a haystack. An empty query matches everything. */
export function matchesQuery(query: string | undefined, ...fields: (string | undefined)[]): boolean {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** `a` or `[a, b]` as an array; undefined as undefined. */
export const asList = <T>(v: T | readonly T[] | undefined): readonly T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? (v as readonly T[]) : [v as T]);

/** Compares two strings or numbers, ascending. */
export const asc = <T extends string | number>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);
/** Compares two strings or numbers, descending. */
export const desc = <T extends string | number>(a: T, b: T): number => asc(b, a);

/** Rounds to a whole number of cents (selectors that turn ratios into money use this, never floats). */
export const cents = (n: number): number => Math.round(n);

/** A frozen empty list, returned for "nothing" so callers can rely on identity. */
export const EMPTY: readonly never[] = NONE;
