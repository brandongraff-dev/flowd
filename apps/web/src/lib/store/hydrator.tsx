"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { bootApp, demoStore } from "./app";
import type { StoreState } from "./store";

/**
 * Starts the demo store in the browser. Mount it once (the app's `Providers` does); it renders nothing.
 *
 * It rehydrates the saved demo on mount, which is why the server render and the first client render agree: both see the empty, not-yet-loaded
 * store, and real data arrives one commit later. The core fixtures are fetched lazily (every data hook also boots the store), so a page with no data
 * hooks, such as the marketing home, never downloads them. Pass `eager` on a layout that always needs data (the dashboards) to start the download
 * during navigation instead of on first paint.
 */
export function StoreHydrator({ eager = false }: { eager?: boolean }): null {
  useEffect(() => {
    if (eager) void bootApp();
  }, [eager]);
  return null;
}

const subscribe = (listener: () => void): (() => void) => demoStore.subscribe(listener);
const getStatus = (): StoreState["status"] => demoStore.getState().status;
const getServerStatus = (): StoreState["status"] => "idle";

/**
 * Renders `fallback` until the demo world is loaded, then the children. Wrap a dashboard layout in it so every page below can assume data exists.
 * Shows `error` if the fixtures fail to load (default: a short message with a reload hint).
 */
export function StoreGate({ children, fallback = null, error }: { children: ReactNode; fallback?: ReactNode; error?: ReactNode }): ReactNode {
  const status = useSyncExternalStore(subscribe, getStatus, getServerStatus);
  useEffect(() => {
    void bootApp();
  }, []);
  if (status === "ready") return children;
  if (status === "error") return error ?? <p role="alert">The demo data could not be loaded. Reload the page; if it keeps happening, reset the demo from the account menu.</p>;
  return fallback;
}
