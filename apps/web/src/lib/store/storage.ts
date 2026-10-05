/**
 * Where the persisted overlay lives (localStorage in the browser, memory in tests and on the server).
 *
 * Three jobs beyond `localStorage.setItem`:
 *   - never throws: a private window, blocked site data or a full quota just means the demo keeps working in memory (the store reports it);
 *   - writes are batched: an action burst becomes one `JSON.stringify` after a short quiet period, flushed when the tab is hidden or closed;
 *   - nothing is written until the store has finished hydrating, so the empty pre-hydration state can never overwrite a saved demo.
 */

import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { Overlay } from "./overlay";

/** What persist hands the storage: an overlay, or null when there is nothing worth saving. */
export type Persisted = Overlay | null;

export type PersistenceStatus = "pending" | "saved" | "memory";

type Backend = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface OverlayStorage extends PersistStorage<Persisted> {
  /** Starts accepting writes (called once the store has hydrated). */
  enable(): void;
  /** Writes the latest pending value now. */
  flush(): void;
  /** True while writes are accepted. */
  readonly enabled: boolean;
}

export interface OverlayStorageOptions {
  /** The backing store. Defaults to `window.localStorage` when the browser allows it. */
  backend?: () => Backend | undefined;
  /** Quiet period before a write, in ms. Default 250. */
  delayMs?: number;
  /** Called after each write attempt: "saved", or "memory" when the browser refused it. */
  onStatus?: (status: Exclude<PersistenceStatus, "pending">) => void;
}

/** The browser's localStorage, or undefined where it is missing or throws on access. */
export function browserBackend(): Backend | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** A throwaway in-memory backend (tests, server). */
export function memoryBackend(seed: Record<string, string> = {}): Backend & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

export function createOverlayStorage(options: OverlayStorageOptions = {}): OverlayStorage {
  const backend = options.backend ?? browserBackend;
  const delay = options.delayMs ?? 250;
  let enabled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { name: string; value: StorageValue<Persisted> } | null = null;
  let lastState: Persisted | undefined;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    const store = backend();
    if (!store) {
      options.onStatus?.("memory");
      return;
    }
    try {
      store.setItem(name, JSON.stringify(value));
      options.onStatus?.("saved");
    } catch {
      // Quota exceeded or storage blocked: keep going in memory.
      options.onStatus?.("memory");
    }
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      try {
        const raw = backend()?.getItem(name);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? (parsed as StorageValue<Persisted>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (!enabled) return;
      // The store hands over the same overlay object when nothing that matters changed (a status flag, say): nothing to write.
      if (value.state === lastState) return;
      lastState = value.state;
      pending = { name, value };
      if (timer === undefined) timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending = null;
      lastState = undefined;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      try {
        backend()?.removeItem(name);
      } catch {
        // Nothing to remove if storage is blocked.
      }
    },
    enable: () => {
      enabled = true;
    },
    flush,
    get enabled() {
      return enabled;
    },
  };
}
