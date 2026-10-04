"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ControllableStateOptions<T> {
  /** Controlled value. `undefined` means uncontrolled. */
  value: T | undefined;
  /** Initial value when uncontrolled. */
  defaultValue: T;
  /** Called on every change, controlled or not. */
  onChange?: (value: T) => void;
}

/**
 * The controlled/uncontrolled prop pattern in one hook (`value` + `defaultValue` + `onChange`), for design-system
 * components that need to know their own state (Tabs indicator, Sheet presence, CommandPalette).
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableStateOptions<T>): [T, (next: T | ((previous: T) => T)) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;

  const latest = useRef({ current, controlled, onChange });
  // Refreshed after every commit: setters only ever run from events, never during render.
  useEffect(() => {
    latest.current = { current, controlled, onChange };
  });

  const set = useCallback((next: T | ((previous: T) => T)) => {
    const { current: previous, controlled: isControlled, onChange: notify } = latest.current;
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
    if (!isControlled) setInner(resolved);
    if (!Object.is(resolved, previous)) notify?.(resolved);
  }, []);

  return [current, set];
}
