"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Page state that lives in the URL (`?tab=`, `?q=`, `?niche=`), so a filtered view is linkable and survives a reload.
 *
 * Writes go through `history.replaceState`, which Next.js folds into `useSearchParams`: the page re-renders at once with no
 * server round trip, so sliders and search boxes stay as responsive as local state. A value equal to its fallback is left out of
 * the address, which keeps shared links short. Back and forward buttons keep working because the source of truth is the URL.
 */
export function useQueryParams<K extends string>(defaults: Readonly<Record<K, string>>): {
  values: Record<K, string>;
  set: (patch: Partial<Record<K, string | null>>) => void;
  /** Resets every key to its fallback. */
  clear: () => void;
} {
  const search = useSearchParams();
  const pathname = usePathname();
  const keys = useMemo(() => Object.keys(defaults) as K[], [defaults]);

  const values = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const key of keys) out[key] = search.get(key) ?? defaults[key];
    return out;
  }, [search, keys, defaults]);

  const write = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      // Read the live address, not the render's snapshot: two writes in one tick must not clobber each other.
      const params = new URLSearchParams(window.location.search);
      mutate(params);
      const query = params.toString();
      window.history.replaceState(window.history.state, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  const set = useCallback(
    (patch: Partial<Record<K, string | null>>) => {
      write((params) => {
        for (const key of keys) {
          const next = patch[key];
          if (next === undefined) continue;
          if (next === null || next === "" || next === defaults[key]) params.delete(key);
          else params.set(key, next);
        }
      });
    },
    [write, keys, defaults],
  );

  const clear = useCallback(() => {
    write((params) => {
      for (const key of keys) params.delete(key);
    });
  }, [write, keys]);

  return { values, set, clear };
}

/** One URL-synced string: `const [tab, setTab] = useQueryParam("tab", "prices")`. */
export function useQueryParam(key: string, fallback: string): readonly [string, (next: string | null) => void] {
  const defaults = useMemo(() => ({ [key]: fallback }), [key, fallback]);
  const { values, set } = useQueryParams(defaults);
  const setOne = useCallback((next: string | null) => set({ [key]: next }), [set, key]);
  return [values[key] ?? fallback, setOne] as const;
}

/** Parses a number out of a query value, falling back when it is missing, not numeric or outside the range. */
export function numberParam(raw: string, fallback: number, min: number, max: number): number {
  if (raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
