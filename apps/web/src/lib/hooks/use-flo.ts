"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { FloSuggestion } from "@/lib/contract/types";
import { createFloProvider } from "@/lib/ai/factory";
import type { AIProvider, FloResult, FloStreamEvent, FloTask } from "@/lib/ai";
import { track } from "@/lib/analytics";
import { useMediaQuery } from "./use-media-query";

export type FloStatus = "idle" | "thinking" | "streaming" | "done" | "error";

export interface FloState {
  status: FloStatus;
  /** The answer's title, known as soon as the stream starts. */
  title: string | null;
  /** One string per option, growing while it streams. Reset on every `start` (a fallback restarts the stream). */
  outputs: string[];
  /** The complete answer, once done. */
  result: FloResult | null;
  error: string | null;
  /** 0 for the first answer, +1 per regenerate. */
  attempt: number;
}

const INITIAL: FloState = { status: "idle", title: null, outputs: [], result: null, error: null, attempt: 0 };

type Action = { type: "begin"; attempt: number } | { type: "event"; event: FloStreamEvent } | { type: "fail"; message: string } | { type: "reset" };

function reduce(state: FloState, action: Action): FloState {
  switch (action.type) {
    case "begin":
      return { ...INITIAL, status: "thinking", attempt: action.attempt };
    case "reset":
      return INITIAL;
    case "fail":
      return { ...state, status: "error", error: action.message };
    case "event": {
      const e = action.event;
      if (e.type === "start") return { ...state, status: "thinking", title: e.title, outputs: Array.from({ length: e.outputs }, () => ""), result: null, error: null };
      if (e.type === "delta") {
        const outputs = [...state.outputs];
        outputs[e.output] = (outputs[e.output] ?? "") + e.text;
        return { ...state, status: "streaming", outputs };
      }
      if (e.type === "done") return { ...state, status: "done", title: e.result.title, outputs: [...e.result.outputs], result: e.result };
      if (e.type === "error") return { ...state, status: "error", error: e.message };
      return state;
    }
  }
}

export interface UseFloOptions {
  /** A provider to use instead of the app's default. */
  provider?: AIProvider;
  /** `flo_suggestions` from the data layer, replayed for matching requests. Ignored when `provider` is given. */
  suggestions?: readonly FloSuggestion[];
  /** No typing animation. Default: follows `prefers-reduced-motion`. */
  instant?: boolean;
}

export interface UseFlo extends FloState {
  /** Asks Flo. Cancels any answer still streaming. Resolves with the result, or null when it failed or was cancelled. */
  run: (task: FloTask) => Promise<FloResult | null>;
  /** Asks again for different wording (attempt + 1) with the last task. */
  regenerate: () => Promise<FloResult | null>;
  /** Stops the answer where it is. */
  cancel: () => void;
  reset: () => void;
  /** The last answer came from the backup engine because the remote one failed. */
  degraded: boolean;
}

/**
 * Runs Flo tasks and exposes the streaming answer as React state. Cancels on unmount, resets its buffers when a stream restarts, honours
 * reduced motion, and records `flo_prompt_sent` (the task kind and surface only, never the text).
 *
 * ```tsx
 * const flo = useFlo({ suggestions });
 * <Button onClick={() => flo.run(scriptTask({ bounty, app, format }))}>Write scripts</Button>
 * {flo.outputs.map((text, i) => <ScriptCard key={i} text={text} streaming={flo.status === "streaming"} />)}
 * ```
 */
export function useFlo(options: UseFloOptions = {}): UseFlo {
  const { provider: given, suggestions, instant } = options;
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const noMotion = instant ?? reduced;
  const provider = useMemo(() => given ?? createFloProvider({ suggestions }), [given, suggestions]);

  const [state, dispatch] = useReducer(reduce, INITIAL);
  const controller = useRef<AbortController | null>(null);
  const last = useRef<FloTask | null>(null);
  const attempt = useRef(0);

  const cancel = useCallback((): void => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const execute = useCallback(
    async (task: FloTask, nextAttempt: number): Promise<FloResult | null> => {
      cancel();
      const ctl = new AbortController();
      controller.current = ctl;
      last.current = task;
      attempt.current = nextAttempt;
      dispatch({ type: "begin", attempt: nextAttempt });
      track("flo_prompt_sent", { kind: task.kind, ...(task.surface ? { surface: task.surface } : {}) });

      let result: FloResult | null = null;
      try {
        for await (const event of provider.stream(task, { attempt: nextAttempt, signal: ctl.signal, typewriter: { instant: noMotion, signal: ctl.signal } })) {
          if (ctl.signal.aborted) return null;
          dispatch({ type: "event", event });
          if (event.type === "done") result = event.result;
        }
      } catch {
        if (!ctl.signal.aborted) dispatch({ type: "fail", message: "Flo could not answer. Try again in a moment." });
        return null;
      }
      return result;
    },
    [cancel, provider, noMotion],
  );

  const run = useCallback((task: FloTask) => execute(task, 0), [execute]);
  const regenerate = useCallback(async (): Promise<FloResult | null> => {
    const task = last.current;
    return task ? execute(task, attempt.current + 1) : null;
  }, [execute]);
  const reset = useCallback((): void => {
    cancel();
    dispatch({ type: "reset" });
  }, [cancel]);

  return { ...state, run, regenerate, cancel, reset, degraded: state.result?.degraded === true };
}
