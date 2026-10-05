"use client";

import { useEffect, useRef } from "react";
import { isEditableTarget, matchesCombo, mayFire, parseCombo, type ParsedCombo } from "@/lib/hooks/hotkeys-core";

/** Return `false` to say "not mine": the key then carries on to the page, so a focused button keeps its own Space and Enter. */
export type ReviewKeyHandler = (event: KeyboardEvent) => boolean | void;

export interface ReviewKeyOptions {
  /** Off while a dialog is open, so typing in it is never read as a decision. */
  enabled?: boolean;
}

/** The longest pause between `g` and the second key of a go-to sequence ("g r" opens the review queue). */
const GO_TO_WINDOW_MS = 900;

/**
 * The review screens' keyboard layer. Two things set it apart from `useHotkeys`:
 *
 *  - It listens in the capture phase, because the review area owns `[`, `]` and `?` (the shell uses them too) while it is on screen.
 *  - It steps aside for go-to sequences: after a bare `g`, the next key is NOT a decision. "g r" and "g a" must never reject or approve a video.
 *
 * Keys never fire while focus is in a text field. A handler that returns `false` lets the key through untouched.
 */
export function useReviewKeys(bindings: Readonly<Record<string, ReviewKeyHandler>>, { enabled = true }: ReviewKeyOptions = {}): void {
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const parsed = new Map<string, ParsedCombo>();
    let goAt = Number.NEGATIVE_INFINITY;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return;
      const bare = !event.metaKey && !event.ctrlKey && !event.altKey;
      if (event.key === "g" && bare && !isEditableTarget(event.target)) {
        goAt = event.timeStamp;
        return;
      }
      if (event.timeStamp - goAt < GO_TO_WINDOW_MS) return;
      for (const [combo, handler] of Object.entries(ref.current)) {
        let wanted = parsed.get(combo);
        if (!wanted) {
          wanted = parseCombo(combo);
          parsed.set(combo, wanted);
        }
        if (!matchesCombo(event, wanted) || !mayFire(event, wanted)) continue;
        if (handler(event) === false) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled]);
}
