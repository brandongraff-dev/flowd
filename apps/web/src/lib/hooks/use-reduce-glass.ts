"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isReduceGlassOn,
  setReduceGlass,
  systemReducesTransparency,
} from "@/components/glass/reduce-glass";

const MEDIA = "(prefers-reduced-transparency: reduce)";

function subscribe(onChange: () => void): () => void {
  // The attribute is the source of truth: observe it so any writer (the switch, another tab's boot script, devtools) is reflected.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-transparency"] });
  const media = typeof window.matchMedia === "function" ? window.matchMedia(MEDIA) : null;
  media?.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", onChange);
  };
}

// "app|system" so React can compare snapshots by value.
function getSnapshot(): string {
  return `${isReduceGlassOn() ? 1 : 0}${systemReducesTransparency() ? 1 : 0}`;
}

function getServerSnapshot(): string {
  return "00";
}

export interface ReduceGlassState {
  /** True when surfaces are rendering solid, from either source. */
  reduced: boolean;
  /** The in-app Reduce glass switch. */
  app: boolean;
  /** The OS setting (`prefers-reduced-transparency`; Chrome/Edge only). The in-app switch cannot override it. */
  system: boolean;
  /** Turn the in-app switch on or off (persisted). */
  setReduced: (on: boolean) => void;
}

/** Reactive view of the Reduce glass setting. Server and first client render report `reduced: false` (no hydration mismatch). */
export function useReduceGlass(): ReduceGlassState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const app = snapshot[0] === "1";
  const system = snapshot[1] === "1";
  const setReduced = useCallback((on: boolean) => setReduceGlass(on), []);
  return { reduced: app || system, app, system, setReduced };
}
