/**
 * The demo world's clock. Pure and framework-free (the React side is `use-now.ts`).
 *
 * The demo world is "now" = 2026-10-03T14:00:00Z. Two readings:
 *
 *  - `now()`      FROZEN at the world's instant until something moves it: the admin's "advance 24 h / 72 h", a reset, or the data layer
 *                 loading a different world. Use it for labels and state ("clears Sat 2:00 PM", "3 hours ago", is this row cleared?), so
 *                 a screenshot and a reload agree and a row that clears at exactly 14:00 does not flip while you watch.
 *  - `liveNow()`  the same instant PLUS the wall-clock time since the last change. Use it only for things that should visibly tick:
 *                 the Daily Drop countdown, a "live" count.
 *
 * If `lib/store` keeps its own persisted clock, call `demoClock.set(iso)` whenever it changes, and the whole UI follows.
 */

import { DEMO_NOW_MS } from "@/lib/constants";

export interface DemoClock {
  /** The world's current instant (ms), frozen between changes. */
  now(): number;
  /** The world's instant plus real time elapsed since the last change (ms). */
  liveNow(): number;
  /** Moves the world to an instant (ISO string or epoch ms) and restarts the live offset. */
  set(to: number | string): void;
  /** Moves the world forward (or back, with a negative value) by `ms`. */
  advance(ms: number): void;
  /** Back to 2026-10-03T14:00:00Z. */
  reset(): void;
  /** Called after every change (not on ticks). Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Builds a clock. `realNow` is injectable so tests can control wall time. */
export function createDemoClock(options: { start?: number; realNow?: () => number } = {}): DemoClock {
  const initial = options.start ?? DEMO_NOW_MS;
  const realNow = options.realNow ?? (() => Date.now());
  let base = initial;
  let since = realNow();
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    now: () => base,
    liveNow: () => base + Math.max(0, realNow() - since),
    set(to) {
      const ms = typeof to === "number" ? to : Date.parse(to);
      if (!Number.isFinite(ms)) return;
      base = ms;
      since = realNow();
      emit();
    },
    advance(ms) {
      if (!Number.isFinite(ms) || ms === 0) return;
      base += ms;
      since = realNow();
      emit();
    },
    reset() {
      base = initial;
      since = realNow();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The app-wide clock. */
export const demoClock: DemoClock = createDemoClock();
