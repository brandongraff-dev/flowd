"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEMO_NOW_MS } from "@/lib/constants";
import { iso } from "@/lib/engine/time";
import { demoClock } from "./demo-clock";

export interface UseNowOptions {
  /** Tick with real time (for a countdown or a live counter). Default false: the frozen world instant, so labels stay put. */
  live?: boolean;
  /** Tick period in ms when `live`. Default 1000. */
  intervalMs?: number;
  /** Pause ticking (a hidden tab, an off-screen card) without unmounting. */
  enabled?: boolean;
}

const subscribe = (listener: () => void): (() => void) => demoClock.subscribe(listener);
const getFrozen = (): number => demoClock.now();
const getServerNow = (): number => DEMO_NOW_MS;

/**
 * The demo world's "now" in epoch milliseconds. The server and the first client render report 2026-10-03T14:00:00Z, so hydration never
 * mismatches. By default it is frozen (it moves only when the admin advances the demo clock or the data layer sets it); pass
 * `{ live: true }` to tick with real time.
 *
 * ```tsx
 * const now = useNow();                                  // labels: formatRelative(post.posted_at, now)
 * const ticking = useNow({ live: true, intervalMs: 1000 }); // countdowns
 * ```
 */
export function useNow(options: UseNowOptions = {}): number {
  const { live = false, intervalMs = 1000, enabled = true } = options;
  const frozen = useSyncExternalStore(subscribe, getFrozen, getServerNow);
  const [ticking, setTicking] = useState<number>(DEMO_NOW_MS);

  useEffect(() => {
    if (!live || !enabled) return;
    const tick = (): void => setTicking(demoClock.liveNow());
    tick();
    const id = window.setInterval(tick, Math.max(100, intervalMs));
    const off = demoClock.subscribe(tick);
    return () => {
      window.clearInterval(id);
      off();
    };
  }, [live, enabled, intervalMs]);

  return live && enabled ? ticking : frozen;
}

/** `useNow()` as an ISO timestamp ("2026-10-03T14:00:00Z"), the form the engine and the formatters take. */
export function useNowIso(options: UseNowOptions = {}): string {
  return iso(useNow(options));
}
