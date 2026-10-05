/**
 * The demo store: one zustand store holding the whole demo world (`DemoState`) plus a little runtime status.
 *
 * Lifecycle (no flash, no SSR mismatch):
 *   1. The server and the first client render see the EMPTY initial state (`status: "idle"`), so their markup is identical.
 *   2. `bootStore` loads the core fixtures (one dynamic import each), then rehydrates: the persisted overlay (what the visitor changed) is laid over
 *      the immutable fixture rows. `skipHydration` keeps zustand from doing this on its own at import time.
 *   3. `status: "ready"`: hooks in `@/lib/data` return real data. Heavy tables (video analyses, snapshots, metrics) load on demand (`ensureTables`).
 *
 * Mutations never touch this file: they are pure actions (`core/*`) run by `runAction` and committed with one `setState`. See `actions.ts`.
 */

import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/contract/types";
import { loadBase, loadCoreBase, mergeBase, seedState } from "./base";
import { applyOverlay, migrateOverlay, OVERLAY_VERSION, toOverlay, type Overlay } from "./overlay";
import { createOverlayStorage, type OverlayStorage, type PersistenceStatus, type Persisted } from "./storage";
import { createEmptyState, SIGNED_OUT, sessionFor, type DemoState, type Persona, type Session } from "./state";
import { DOC_NAMES, ROW_TABLES, type DocName, type RowTableName } from "./tables";

/** The localStorage key of the overlay. Bump the suffix only for an incompatible rewrite; use `OVERLAY_VERSION` + `migrateOverlay` for the rest. */
export const STORAGE_KEY = "flowd-demo-v1";

export type BootStatus = "idle" | "loading" | "ready" | "error";

/** Runtime facts about the store (not part of the demo world, never persisted). */
export interface StoreMeta {
  /** idle (before anything loaded) to loading (core fixtures) to ready (overlay applied). Hooks return empty data until ready. */
  status: BootStatus;
  error?: string;
  /** Heavy tables being fetched right now. */
  loading_tables: readonly string[];
  /** Whether the overlay is being saved: pending until the first write, saved, or memory when the browser refused (private window, quota). */
  persistence: PersistenceStatus;
  /** Counts every committed action (a cheap "something changed" signal for effects). */
  revision: number;
}

export type StoreState = DemoState & StoreMeta;

export type DemoStore = Mutate<StoreApi<StoreState>, [["zustand/persist", Persisted]]>;

const INITIAL_META: StoreMeta = { status: "idle", loading_tables: [], persistence: "pending", revision: 0 };

/** The empty world with idle status: what the server and the first client render see. */
export function createInitialState(): StoreState {
  return { ...createEmptyState(), ...INITIAL_META };
}

/** Everything that decides what an overlay contains, by identity: when none of it changed, the previous overlay is still correct. */
function signatureOf(s: DemoState): unknown[] {
  const sig: unknown[] = [];
  for (const t of ROW_TABLES) sig.push(s[t]);
  for (const d of DOC_NAMES) sig.push(s[d]);
  sig.push(s.session, s.clock, s.counters, s.tombstones);
  return sig;
}

function sameSignature(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Merges a stored overlay (or nothing) into the seeded world. Corrupt data falls back to the seed rather than breaking the demo. */
export function mergePersisted(persisted: unknown, current: StoreState): StoreState {
  const overlay = persisted !== null && typeof persisted === "object" ? (persisted as Overlay) : null;
  let next: DemoState = seedState({ session: current.session });
  if (overlay) {
    try {
      next = applyOverlay(next, overlay);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[flowd demo store] the saved demo data could not be read; starting from the seed", e);
      next = seedState({ session: current.session });
    }
  }
  // A re-hydration (another tab saved, or a reset) keeps who is signed in here; the first boot takes the saved session until the cookie is read.
  const session = current.status === "ready" ? current.session : next.session;
  return { ...next, session, status: "ready", error: undefined, loading_tables: [], persistence: current.persistence, revision: current.revision + 1 };
}

export interface DemoStoreOptions {
  /** Defaults to a localStorage-backed overlay storage. Pass `createOverlayStorage({ backend: () => memoryBackend() })` in tests. */
  storage?: OverlayStorage;
  /** Storage key. Default `flowd-demo-v1`. */
  name?: string;
}

const storages = new WeakMap<object, OverlayStorage>();
const bootPromises = new WeakMap<object, Promise<void>>();

/** Creates a store. The app uses one (`demoStore`); tests make their own so nothing leaks between them. */
export function createDemoStore(options: DemoStoreOptions = {}): DemoStore {
  const holder: { store?: DemoStore } = {};
  const storage =
    options.storage ??
    createOverlayStorage({
      onStatus: (status) => {
        const store = holder.store;
        if (store && store.getState().persistence !== status) store.setState({ persistence: status });
      },
    });
  let last: { sig: unknown[]; overlay: Overlay } | null = null;
  const store = createStore<StoreState>()(
    persist(() => createInitialState(), {
      name: options.name ?? STORAGE_KEY,
      version: OVERLAY_VERSION,
      storage,
      skipHydration: true,
      partialize: (state): Persisted => {
        if (!storage.enabled) return null;
        const sig = signatureOf(state);
        if (last && sameSignature(last.sig, sig)) return last.overlay;
        last = { sig, overlay: toOverlay(state) };
        return last.overlay;
      },
      migrate: (stored, version): Persisted => migrateOverlay(stored, version),
      merge: mergePersisted,
    }),
  );
  holder.store = store;
  storages.set(store, storage);
  return store;
}

/** The overlay storage of a store (to enable, flush or reset it). */
export const storageOf = (store: DemoStore): OverlayStorage => {
  const s = storages.get(store);
  if (!s) throw new Error("storageOf: this store was not made by createDemoStore");
  return s;
};

/**
 * Loads the core fixtures and applies the saved overlay, once per store. Safe to call from anywhere, any number of times; every caller gets the same promise.
 * Persistence starts only after this resolves.
 */
export function bootStore(store: DemoStore): Promise<void> {
  const existing = bootPromises.get(store);
  if (existing) return existing;
  const promise = (async () => {
    if (store.getState().status !== "ready") store.setState({ status: "loading" });
    try {
      await loadCoreBase();
      await store.persist.rehydrate();
      storageOf(store).enable();
      if (store.getState().status !== "ready") store.setState({ status: "ready" });
    } catch (e) {
      store.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
      bootPromises.delete(store);
      throw e;
    }
  })();
  bootPromises.set(store, promise);
  return promise;
}

/** Brings tables (or docs) into the store: the fixture rows are fetched once, then merged under any rows the visitor already changed. */
export async function ensureTables(store: StoreApi<StoreState>, names: readonly (RowTableName | DocName)[]): Promise<void> {
  const missing = names.filter((n) => store.getState().loaded[n] !== true);
  if (missing.length === 0) return;
  store.setState((s) => ({ loading_tables: [...new Set([...s.loading_tables, ...missing])] }));
  try {
    await loadBase(missing);
  } catch (e) {
    store.setState((s) => ({ loading_tables: s.loading_tables.filter((n) => !missing.includes(n as RowTableName)), error: e instanceof Error ? e.message : String(e) }));
    throw e;
  }
  store.setState((s) => ({ ...(mergeBase(s, missing) as StoreState), loading_tables: s.loading_tables.filter((n) => !missing.includes(n as RowTableName)) }));
}

// ── session and clock ──────────────────────────────────────────────────────────────────────────

const PERSONA_OF_ROLE: Record<Role, Persona> = { brand_member: "brand", creator: "creator", admin: "admin" };

/** The demo persona a role signs in as. */
export const personaOfRole = (role: Role): Persona => PERSONA_OF_ROLE[role];

/**
 * Points the store at the persona of a role (or signs it out). Choosing the persona that is already active keeps the session as it is, so an app the
 * brand switched to is not reset by a re-render.
 */
export function setSessionRole(store: StoreApi<StoreState>, role: Role | null): void {
  const state = store.getState();
  if (role === null) {
    if (state.session.persona !== null) store.setState({ session: SIGNED_OUT });
    return;
  }
  const persona = PERSONA_OF_ROLE[role];
  if (state.session.persona === persona) return;
  store.setState({ session: sessionFor(persona, state.world.personas) });
}

/** Sets the whole session (tests, and the account menu's app / workspace switcher). */
export function setSession(store: StoreApi<StoreState>, session: Session): void {
  store.setState({ session });
}

// ── reset ──────────────────────────────────────────────────────────────────────────────────────

/** Throws away every change: the saved overlay is deleted and the world goes back to the seed. The session is kept (you stay signed in). */
export function resetStore(store: DemoStore): void {
  store.persist.clearStorage();
  const fresh = seedState({ session: store.getState().session });
  store.setState((s) => ({ ...fresh, status: "ready", error: undefined, loading_tables: [], persistence: s.persistence, revision: s.revision + 1 }), true);
}
