/**
 * Test harness for the demo store: a fresh, isolated store per call, booted from the real fixtures, with the actions bound to it and a tiny
 * way to sign in as a persona. Not a test file.
 */

import { createActions, type Actions } from "../actions";
import type { ActionResult } from "../core/tx";
import { SIGNED_OUT, sessionFor, type DemoState, type Persona } from "../state";
import { bootStore, createDemoStore, type DemoStore, type StoreState } from "../store";
import { createOverlayStorage, memoryBackend } from "../storage";
import { verifyLedger } from "@/lib/engine";

export interface TestWorld {
  store: DemoStore;
  actions: Actions;
  backend: ReturnType<typeof memoryBackend>;
  state: () => StoreState;
  /** Signs the world in as a persona (and returns the world, for chaining). */
  as: (persona: Persona | null) => TestWorld;
}

/** A booted world with nothing saved. `backend` lets a test boot a second world from what the first one saved. */
export async function makeWorld(persona: Persona | null = null, backend = memoryBackend()): Promise<TestWorld> {
  const storage = createOverlayStorage({ backend: () => backend, delayMs: 0 });
  const store = createDemoStore({ storage });
  await bootStore(store);
  const world: TestWorld = {
    store,
    actions: createActions({ store, ready: () => bootStore(store) }),
    backend,
    state: () => store.getState(),
    as: (p) => {
      store.setState({ session: p ? sessionFor(p, store.getState().world.personas) : SIGNED_OUT });
      return world;
    },
  };
  return world.as(persona);
}

/** Ledger problems (a transaction that does not net to zero, a negative platform account), as readable lines. Empty when the books are right. */
export function ledgerProblems(state: Pick<DemoState, "ledger">): string[] {
  return verifyLedger(Object.values(state.ledger)).violations.map((v) => `${v.rule}: ${v.detail}`);
}

/** The brand wallet balance from the ledger (the source of truth the denormalised field must equal). */
export function walletFromLedger(state: Pick<DemoState, "ledger">, brandId: string): number {
  let sum = 0;
  for (const e of Object.values(state.ledger)) if (e.account === `wallet:${brandId}`) sum += e.amount_cents;
  return sum;
}

/** The data of a successful action; a failure throws with the code and message so the test output says what went wrong. */
export function must<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(`action failed: ${result.error.code}: ${result.error.message}${result.error.hint ? ` (${result.error.hint})` : ""}
${result.error.stack ?? ""}`);
  return result.data;
}
