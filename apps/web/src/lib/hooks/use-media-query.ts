"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query. `serverValue` is what the server and the first client render report, so hydration
 * never mismatches; the real value arrives on the next commit.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    [query, serverValue],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

/** >= 768px (the dashboard side-nav / bottom-bar breakpoint). */
export function useIsDesktop(serverValue = true): boolean {
  return useMediaQuery("(min-width: 768px)", serverValue);
}

/** Mouse-like input: hover and a fine pointer. Gate hover-only decoration (pointer sheen) with this. */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)", false);
}
