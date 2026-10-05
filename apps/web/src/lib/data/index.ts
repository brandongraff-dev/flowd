/**
 * The data layer's client entry: every hook plus the fixture loader. Pages import from here:
 *
 *   import { useBounties, useCreatorWallet, useStoreReady } from "@/lib/data";
 *   import { actions } from "@/lib/store";
 *
 * Server code and tests use the selectors directly (`@/lib/data/selectors`) with `getServerState()` from `@/lib/store/server`.
 */

export * from "./hooks";
export { useActions, useDemoNow, useDemoStore, useEnsureTables, useSelect, useSlice, useStableArg, useStoreReady, useStoreStatus, type StoreStatus } from "./use-store";
export { defineSelector, type Db, type Selector } from "./select";
export { FIXTURE_NAMES, loadFixture, loadFixtures } from "./fixtures";
