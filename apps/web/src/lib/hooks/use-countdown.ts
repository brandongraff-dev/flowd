"use client";

import { useEffect, useRef } from "react";
import { countdownParts, formatCountdown, parseTime, type CountdownParts, type TimeInput } from "@/lib/format/time";
import { useNow } from "./use-now";

export interface UseCountdownOptions {
  /** Tick period in ms. Default: every second under three hours, every 15 seconds above. */
  intervalMs?: number;
  /** Stop ticking (for example while the card is off-screen). */
  enabled?: boolean;
  /** Called once, when the countdown reaches zero while mounted. Not called for a target that was already past on mount. */
  onDone?: () => void;
}

export interface CountdownState extends CountdownParts {
  /** Milliseconds left (never negative). */
  remainingMs: number;
  /** "2h 14m", "14m 09s", "42s". */
  label: string;
  /** "02:14:09" ("3d 04:12:09" over a day). */
  clock: string;
  /** False when `target` was missing or unreadable. */
  valid: boolean;
}

const THREE_HOURS = 3 * 3_600_000;

/**
 * Time left until `target`, ticking with real time from the demo world's instant (so "Daily Drop in 2h 00m" counts down while you
 * watch). The first render, on the server and the client, is computed from the world's frozen instant: no hydration mismatch.
 *
 * ```tsx
 * const drop = useCountdown("2026-10-03T16:00:00Z");
 * return drop.done ? <LiveNow /> : <span>{drop.label}</span>;
 * ```
 */
export function useCountdown(target: TimeInput | null | undefined, options: UseCountdownOptions = {}): CountdownState {
  const { enabled = true, onDone } = options;
  const targetMs = parseTime(target);
  const frozen = useNow();
  // Tick slowly while far away (a minute-resolution label does not need 1 Hz), fast when it matters.
  const far = targetMs !== null && targetMs - frozen > THREE_HOURS;
  const now = useNow({ live: true, intervalMs: options.intervalMs ?? (far ? 15_000 : 1000), enabled: enabled && targetMs !== null });

  const remainingMs = targetMs === null ? 0 : Math.max(0, targetMs - now);
  const parts = countdownParts(remainingMs);

  const doneRef = useRef(onDone);
  const wasPending = useRef(false);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    wasPending.current = false;
  }, [targetMs]);
  useEffect(() => {
    if (targetMs === null) return;
    if (!parts.done) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      doneRef.current?.();
    }
  }, [parts.done, targetMs]);

  return { ...parts, remainingMs, label: formatCountdown(remainingMs, "compact"), clock: formatCountdown(remainingMs, "clock"), valid: targetMs !== null };
}
