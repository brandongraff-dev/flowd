"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

function noopSubscribe(): () => void {
  return () => {};
}

/** True on Apple platforms (so shortcuts read ⌘ instead of Ctrl). Server and hydration report false. */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

export interface HotkeyOptions {
  /** Fire even when focus is in an input, textarea, select or contenteditable. Default false (except for modifier combos). */
  allowInInputs?: boolean;
  /** Disable without unmounting. */
  enabled?: boolean;
  /** Call preventDefault on a match (default true). */
  preventDefault?: boolean;
}

interface ParsedCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

function parse(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  return {
    key: parts[parts.length - 1] ?? "",
    mod: parts.includes("mod") || parts.includes("cmd") || parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
  };
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Global keyboard shortcut. `combo` uses "mod" for Cmd on Apple / Ctrl elsewhere: "mod+k", "shift+/", "g". A bare key
 * (no modifier) is ignored while the user is typing in a field; a mod combo always fires.
 * Keyboard-initiated actions never animate (emil-design-eng), so there is nothing here to opt out of.
 */
export function useHotkey(combo: string, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}): void {
  const { allowInInputs = false, enabled = true, preventDefault = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const wanted = parse(combo);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== wanted.key) return;
      const modPressed = event.metaKey || event.ctrlKey;
      if (wanted.mod !== modPressed) return;
      if (wanted.shift !== event.shiftKey && wanted.key.length === 1 && /[a-z]/.test(wanted.key)) return;
      if (wanted.alt !== event.altKey) return;
      if (!wanted.mod && !allowInInputs && isEditable(event.target)) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled, allowInInputs, preventDefault]);
}
