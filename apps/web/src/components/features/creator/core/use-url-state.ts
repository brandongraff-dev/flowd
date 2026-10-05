"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * State in the URL (`?tab=`, `?q=`, `?sort=`), so a filtered view is linkable and survives a reload. Reads are synchronous from the router;
 * writes replace the history entry (no back-button trail for every keystroke) and keep the scroll position.
 */
export function useUrlState(): { get: (key: string) => string | null; set: (patch: Record<string, string | null | undefined>) => void; params: URLSearchParams } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (patch: Record<string, string | null | undefined>): void => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { get: (key: string) => params.get(key), set, params };
}
