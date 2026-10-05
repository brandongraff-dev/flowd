"use client";

import { useEffect, useState } from "react";

/**
 * A value that follows `value` after it has stopped changing for `delayMs`. For search boxes that hit a server or a heavy filter.
 * For in-memory lists prefer React's `useDeferredValue`, which needs no timer.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    if (delayMs <= 0) return;
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : debounced;
}
