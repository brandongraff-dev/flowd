/**
 * The app's one demo store, and everything that ties it to the browser: boot, the session cookie, the demo clock and `actions`.
 *
 * Import from `@/lib/store` in client code. Nothing here runs on the server: `bootApp` is a no-op there, and the store stays in its empty `idle` state
 * so the server render and the first client render match.
 */

import type { Persona } from "./state";
import { bootStore, createDemoStore, resetStore, setSessionRole, STORAGE_KEY, type StoreState } from "./store";
import { createActions, type ActionHost, type Actions } from "./actions";
import { getSessionSnapshot, subscribeSession } from "@/lib/session";
import { demoClock } from "@/lib/hooks/demo-clock";
import { SIGNED_OUT, sessionFor } from "./state";

/** The store the whole app shares. Prefer the hooks in `@/lib/data`; use this directly only for imperative reads (`demoStore.getState()`). */
export const demoStore = createDemoStore();

let booted: Promise<void> | null = null;
let detach: (() => void) | null = null;

/** Mirrors the store's clock into the app-wide demo clock (`useNow`, relative labels) and the sign-in cookie into the store's session. */
function attachRuntime(): () => void {
  const pushClock = (s: StoreState): void => demoClock.set(s.clock.now);
  pushClock(demoStore.getState());
  const offClock = demoStore.subscribe((s, prev) => {
    if (s.clock.now !== prev.clock.now) pushClock(s);
  });
  const syncSession = (): void => {
    const snap = getSessionSnapshot();
    if (snap.status === "ready") setSessionRole(demoStore, snap.role);
  };
  syncSession();
  const offSession = subscribeSession(syncSession);
  return () => {
    offClock();
    offSession();
  };
}

/**
 * Loads the core fixtures, applies the saved overlay, starts saving, and attaches the clock and session. Safe to call from anywhere, any number of
 * times (one promise); `<StoreHydrator/>` and every data hook call it. Does nothing on the server.
 */
export function bootApp(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!booted) {
    booted = bootStore(demoStore).then(() => {
      detach?.();
      detach = attachRuntime();
    });
    booted.catch(() => {
      booted = null;
    });
  }
  return booted;
}

const appHost: ActionHost = { store: demoStore, ready: bootApp };

/** Throws away every change and goes back to the seeded world. You stay signed in. */
export async function resetDemo(): Promise<void> {
  await bootApp();
  resetStore(demoStore);
}

/**
 * Signs the demo store in as a persona without touching the cookie (tests and previews). The app switches persona through `useSession().signIn` from
 * `@/lib/session`, which the store follows.
 */
export function setPersona(persona: Persona | null): void {
  const state = demoStore.getState();
  demoStore.setState({ session: persona ? sessionFor(persona, state.world.personas) : SIGNED_OUT });
}

/** Every mutation of the demo (see `actions.ts`), plus `resetDemo`. */
export const actions: Actions & { resetDemo: typeof resetDemo } = { ...createActions(appHost), resetDemo };

export { STORAGE_KEY };
