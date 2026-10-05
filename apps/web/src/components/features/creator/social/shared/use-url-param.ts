"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A view setting that lives in the URL (`?tab=`, `?filter=`) so the page is linkable. Reads through `useSearchParams` and writes with
 * `history.replaceState` (Next keeps `useSearchParams` in sync), so switching a tab is instant: no server round trip and no scroll jump.
 * The fallback value is not written, which keeps the default URL clean. Unknown values fall back (pass `null` for free-form values such as ids).
 */
export function useUrlParam<T extends string>(key: string, allowed: readonly T[] | null, fallback: T): [T, (next: T) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get(key);
  const value = raw !== null && raw !== "" && (allowed === null || (allowed as readonly string[]).includes(raw)) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T): void => {
      const query = new URLSearchParams(params.toString());
      if (next === fallback) query.delete(key);
      else query.set(key, next);
      const text = query.toString();
      window.history.replaceState(null, "", text ? `${pathname}?${text}` : pathname);
    },
    [key, fallback, params, pathname],
  );
  return [value, set];
}
