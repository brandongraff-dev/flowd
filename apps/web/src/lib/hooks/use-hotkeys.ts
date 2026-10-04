"use client";

import { useEffect, useRef } from "react";
import {
  createSequenceMatcher,
  isEditableTarget,
  isPlainKey,
  matchesCombo,
  mayFire,
  parseCombo,
  sequenceKeys,
  type ParsedCombo,
  type SequenceBinding,
} from "./hotkeys-core";

export interface HotkeysOptions {
  /** Fire bare keys even while focus is in an input, textarea, select or contenteditable. Default false (chords with Cmd, Ctrl or Alt always fire). */
  allowInInputs?: boolean;
  /** Disable without unmounting. */
  enabled?: boolean;
  /** Call preventDefault when a binding fires. Default true. */
  preventDefault?: boolean;
}

type Handler = (event: KeyboardEvent) => void;

/**
 * Several chords on one listener: `{ "mod+k": openPalette, "?": showHelp, "j": next, "k": previous }`. Bindings are matched in the
 * order given; the first match wins. The map may change every render (it is read through a ref), so inline objects are fine.
 *
 * `useHotkey` (singular, in `use-hotkey.ts`) is the one-chord version; use this when a screen has a keyboard layer (the review queue).
 */
export function useHotkeys(bindings: Readonly<Record<string, Handler>>, options: HotkeysOptions = {}): void {
  const { allowInInputs = false, enabled = true, preventDefault = true } = options;
  const ref = useRef(bindings);
  useEffect(() => {
    ref.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const parsed = new Map<string, ParsedCombo>();
    const onKeyDown = (event: KeyboardEvent): void => {
      for (const [combo, handler] of Object.entries(ref.current)) {
        let wanted = parsed.get(combo);
        if (!wanted) {
          wanted = parseCombo(combo);
          parsed.set(combo, wanted);
        }
        if (!matchesCombo(event, wanted) || !mayFire(event, wanted, allowInInputs)) continue;
        if (preventDefault) event.preventDefault();
        handler(event);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, allowInInputs, preventDefault]);
}

export interface KeySequenceBinding {
  /** "g w" or ["g", "w"]. */
  keys: string | readonly string[];
  run: () => void;
}

export interface KeySequenceOptions extends Pick<HotkeysOptions, "enabled" | "allowInInputs"> {
  /** Longest pause between keys, in ms. Default 900. */
  timeoutMs?: number;
  /** Called with the keys typed so far after each key of an unfinished sequence ("g" shows a hint), and with [] when it ends. */
  onPending?: (keys: readonly string[]) => void;
}

/**
 * Go-to shortcuts: press "g", then "w". Many sequences share one listener and one state machine, so "g w", "g r" and "g f" can coexist.
 * Bare keys only (a modifier press never counts), and never while the focus is in a text field.
 *
 * ```ts
 * useKeySequences(shortcutsForRole("creator").map((s) => ({ keys: s.keys, run: () => router.push(s.href) })));
 * ```
 */
export function useKeySequences(bindings: readonly KeySequenceBinding[], options: KeySequenceOptions = {}): void {
  const { enabled = true, allowInInputs = false, timeoutMs = 900, onPending } = options;
  const ref = useRef(bindings);
  const pendingRef = useRef(onPending);
  useEffect(() => {
    ref.current = bindings;
    pendingRef.current = onPending;
  });

  // Rebuild the matcher only when the set of key lists changes, not on every render of the caller.
  const signature = bindings.map((b) => sequenceKeys(b.keys).join(" ")).join("|");

  useEffect(() => {
    if (!enabled) return;
    const table: SequenceBinding<number>[] = ref.current.map((b, i) => ({ keys: sequenceKeys(b.keys), id: i }));
    const matcher = createSequenceMatcher(table, timeoutMs);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.repeat || !isPlainKey(event) || event.key.length !== 1) return;
      if (!allowInInputs && isEditableTarget(event.target)) {
        matcher.reset();
        return;
      }
      const hit = matcher.feed(event.key, event.timeStamp || Date.now());
      if (hit !== null) {
        event.preventDefault();
        pendingRef.current?.([]);
        ref.current[hit]?.run();
        return;
      }
      pendingRef.current?.(matcher.pending());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      matcher.reset();
    };
  }, [enabled, allowInInputs, timeoutMs, signature]);
}

/** One sequence: `useKeySequence("g w", () => router.push("/creator/wallet"))`. */
export function useKeySequence(keys: string | readonly string[], run: () => void, options: KeySequenceOptions = {}): void {
  useKeySequences([{ keys, run }], options);
}
