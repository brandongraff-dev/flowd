"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny module-level store for UI state that has to survive a route change inside the review area (pending decisions, snoozed
 * videos, unsent notes) but is not server-like data, so it does not belong in the demo store. Read it with `useExternalStore`.
 */
export interface ExternalStore<T> {
  get: () => T;
  set: (next: T) => void;
  update: (fn: (previous: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
  readonly initial: T;
}

export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const store: ExternalStore<T> = {
    initial,
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    update(fn) {
      store.set(fn(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

/** The store's value as React state. The server and the first client render see `initial`, so there is no hydration mismatch. */
export function useExternalStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.initial);
}
