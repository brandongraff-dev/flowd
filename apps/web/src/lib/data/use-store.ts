"use client";

/**
 * The hook kit under every `use...` data hook: subscribe to the tables a selector declares, memoise its result, and make sure the store is booted
 * and heavy tables are loaded. Page code uses the named hooks (`useBounties`, `useCreatorWallet`...); `useSelect` is for writing a new one.
 */

import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { actions, bootApp, demoStore } from "@/lib/store/app";
import { ensureTables, type StoreState } from "@/lib/store/store";
import type { StateKey } from "@/lib/store/state";
import type { Db, Selector } from "./select";

/** Reads from the demo store with a selector. The selector must return a value that is stable between renders (a field, not a new object). */
export function useDemoStore<T>(selector: (state: StoreState) => T): T {
  return useStore(demoStore, selector);
}

/** Boots the store once per page load: fetches the core fixtures and applies the saved demo. Called by every data hook; idempotent. */
function useBoot(): void {
  useEffect(() => {
    void bootApp();
  }, []);
}

/** The listed keys of the store as one object that changes only when one of those keys does. */
export function useSlice<K extends StateKey>(keys: readonly K[]): Db<K> {
  return useStore(
    demoStore,
    useShallow((s: StoreState): Db<K> => {
      const out = {} as Db<K>;
      for (const k of keys) out[k] = s[k] as Db<K>[K];
      return out;
    }),
  );
}

/**
 * Makes an inline argument safe to use as a dependency: the same value in JSON gives the same object. Arguments must be plain JSON data (strings,
 * numbers, booleans, arrays and objects of those); that is what filters and ids are.
 */
export function useStableArg<A>(arg: A): A {
  const key = arg === undefined ? "" : JSON.stringify(arg);
  return useMemo(() => (key === "" ? undefined : JSON.parse(key)) as A, [key]);
}

/**
 * Runs a selector against the live store and memoises the result. Re-runs only when a table the selector declared changes, or the argument changes
 * by value. Before the store is ready the selector sees the empty world (empty lists, `undefined`).
 */
export function useSelect<K extends StateKey, A, R>(selector: Selector<K, A, R>, arg?: A): R {
  useBoot();
  const status = useDemoStore((s) => s.status);
  const needs = selector.ensure;
  useEffect(() => {
    if (status === "ready" && needs.length > 0) ensureTables(demoStore, needs).catch(() => undefined);
  }, [status, needs]);
  const db = useSlice(selector.keys);
  const stable = useStableArg(arg);
  return useMemo(() => selector(db, stable), [selector, db, stable]);
}

export interface StoreStatus {
  /** idle (nothing loaded yet) to loading to ready, or error. */
  status: StoreState["status"];
  ready: boolean;
  error?: string;
  /** Heavy tables being fetched right now (analytics, snapshots). */
  loading_tables: readonly string[];
  /** Whether the demo is being saved in this browser: "memory" means private mode or a full quota (changes are lost on reload). */
  persistence: StoreState["persistence"];
}

/** Is the demo world loaded? Show a skeleton while `ready` is false; an empty list after that is a real empty state. */
export function useStoreStatus(): StoreStatus {
  useBoot();
  const s = useStore(
    demoStore,
    useShallow((state: StoreState) => ({ status: state.status, error: state.error, loading_tables: state.loading_tables, persistence: state.persistence })),
  );
  return useMemo(() => ({ ...s, ready: s.status === "ready" }), [s]);
}

/** `useStoreStatus().ready`. */
export function useStoreReady(): boolean {
  return useStoreStatus().ready;
}

/** The demo world's current instant as an ISO timestamp (moves when Ops advances the clock). Use it for state ("is this row cleared yet"); `useNow` from `@/lib/hooks/use-now` is the same instant as milliseconds. */
export function useDemoNow(): string {
  useBoot();
  return useDemoStore((s) => s.clock.now);
}

/** Loads heavy tables into the store (video analyses, view snapshots, metrics, conversions...). Selectors that need them do this themselves. */
export function useEnsureTables(tables: readonly string[]): void {
  const status = useDemoStore((s) => s.status);
  const key = tables.join(",");
  useEffect(() => {
    if (status !== "ready" || key === "") return;
    ensureTables(demoStore, key.split(",") as Parameters<typeof ensureTables>[1]).catch(() => undefined);
  }, [status, key]);
}

/** Every mutation of the demo (see `@/lib/store/actions`). Stable: safe in dependency arrays. */
export function useActions(): typeof actions {
  return actions;
}
