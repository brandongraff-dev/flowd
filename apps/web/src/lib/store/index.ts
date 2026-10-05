/**
 * The demo store, client entry. Pages import from here:
 *
 *   import { actions } from "@/lib/store";            // every mutation, bound to the app's store
 *   import { StoreHydrator, StoreGate } from "@/lib/store";
 *
 * Reading data is done with the hooks in `@/lib/data`. Server code (route handlers, Server Components) imports `@/lib/store/server` instead.
 */

export { actions, bootApp, demoStore, resetDemo, setPersona, STORAGE_KEY } from "./app";
export { StoreGate, StoreHydrator } from "./hydrator";
export { createActions, type ActionName, type Actions, type ActionHost } from "./actions";
export { ActionError, fail, ok, type ActionFailure, type ActionResult } from "./core/tx";
export { createDemoStore, ensureTables, resetStore, type DemoStore, type StoreMeta, type StoreState } from "./store";
export type { DemoState, Persona, Session } from "./state";
export type { RowTableName, DocName } from "./tables";
