"use client";

import { useCallback, useRef, useState } from "react";
import { notify } from "@/components/ui";
import type { ActionFailure, ActionResult } from "@/lib/store";

/** The one way a social surface reports a refused action: plain words, then what to do next. Errors stay until dismissed. */
export function reportFailure(error: ActionFailure): void {
  notify.error(error.message, error.hint ? { description: error.hint } : undefined);
}

/**
 * Runs a store action and returns its data, or `undefined` after showing the refusal. Never throws. Keeps a `busy` key so the
 * button that started the work can show a spinner and a double click cannot fire twice.
 *
 * ```tsx
 * const { run, busy } = useRun();
 * const data = await run("save", () => actions.saveRateCard(input));
 * ```
 */
export function useRun(): { busy: string | null; run: <T>(key: string, job: () => Promise<ActionResult<T>>) => Promise<T | undefined> } {
  const [busy, setBusy] = useState<string | null>(null);
  const active = useRef<string | null>(null);
  const run = useCallback(async <T,>(key: string, job: () => Promise<ActionResult<T>>): Promise<T | undefined> => {
    if (active.current !== null) return undefined;
    active.current = key;
    setBusy(key);
    try {
      const result = await job();
      if (!result.ok) {
        reportFailure(result.error);
        return undefined;
      }
      return result.data;
    } finally {
      active.current = null;
      setBusy(null);
    }
  }, []);
  return { busy, run };
}
