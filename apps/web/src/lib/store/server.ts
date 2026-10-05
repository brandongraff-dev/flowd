/**
 * The server-side demo world for the mock API (`/api/v1/**`) and Server Components: one in-memory store per server process, seeded from the fixtures.
 * It runs the very same pure actions as the browser store, so an API call and a click in the app have the same effect and the same rules.
 *
 *   const result = await runServerAction(approveSubmission, { submission_id }, { persona: "brand" });
 *   const db = await getServerState();                     // read with the selectors in `@/lib/data/selectors`
 *
 * Nothing is persisted: a server restart (or `resetServerWorld`) goes back to the seed. The signed-in persona is passed per call, because the server
 * handles many requests and the cookie decides who each one is.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { loadBase, seedState } from "./base";
import { ROW_TABLES, DOC_NAMES } from "./tables";
import { createActions, runOnHost, type Actions } from "./actions";
import { createInitialState, type StoreState } from "./store";
import { SIGNED_OUT, sessionFor, type DemoState, type Persona, type Session } from "./state";
import type { ActionResult, Tx } from "./core/tx";

let world: Promise<StoreApi<StoreState>> | null = null;

async function createServerStore(): Promise<StoreApi<StoreState>> {
  await loadBase([...DOC_NAMES, ...ROW_TABLES]);
  const store = createStore<StoreState>(() => ({ ...createInitialState(), ...seedState(), status: "ready" as const }));
  return store;
}

/** The singleton server store (created on first use, with every table loaded). */
export function getServerStore(): Promise<StoreApi<StoreState>> {
  world ??= createServerStore();
  return world;
}

/** The current server world, for reading. */
export async function getServerState(): Promise<DemoState> {
  return (await getServerStore()).getState();
}

/** Starts over from the seed. */
export async function resetServerWorld(): Promise<void> {
  const store = await getServerStore();
  store.setState({ ...createInitialState(), ...seedState(), status: "ready" as const }, true);
}

export interface ServerCaller {
  /** Who is calling: the persona's session is used for this call only. Omit for an anonymous call (public endpoints). */
  persona?: Persona | null;
  /** Or a complete session (an agency member acting for a client brand, a specific app...). */
  session?: Session;
}

/** Calls run one at a time: each sets the caller's session on the shared store for the length of its action, so two requests must never overlap. */
let lane: Promise<unknown> = Promise.resolve();

/** Runs one action on the server world as the given caller. The caller's session never leaks into the shared state, and calls never overlap. */
export function runServerAction<A extends unknown[], O>(fn: (tx: Tx, ...args: A) => O, args: A, caller: ServerCaller = {}): Promise<ActionResult<O>> {
  const run = lane.then(async () => {
    const store = await getServerStore();
    const keep = store.getState().session;
    const session = caller.session ?? (caller.persona ? sessionFor(caller.persona, store.getState().world.personas) : SIGNED_OUT);
    store.setState({ session });
    try {
      return await runOnHost({ store, ready: () => Promise.resolve() }, fn, args);
    } finally {
      store.setState({ session: keep });
    }
  });
  lane = run.catch(() => undefined);
  return run;
}

/** The bound actions of the server world (anonymous caller). Use `runServerAction` to act as a persona. */
export async function getServerActions(): Promise<Actions> {
  const store = await getServerStore();
  return createActions({ store, ready: () => Promise.resolve() });
}
