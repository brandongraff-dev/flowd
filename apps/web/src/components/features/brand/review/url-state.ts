"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Writes one search parameter without a navigation (Next syncs `useSearchParams` with the native History API). The default value clears it. */
function writeParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null || value === "") url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(window.history.state, "", url.toString());
}

/** A choice kept in the URL (`?filter=stale`), so a view is linkable and survives a reload. Unknown values fall back to the default. */
export function useUrlChoice<T extends string>(name: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const params = useSearchParams();
  const raw = params.get(name);
  const value = (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      writeParam(name, next === fallback ? null : next);
    },
    [name, fallback],
  );
  return [value, set];
}

/** Free text kept in the URL (`?q=maya`). The input keeps its own state, so typing never lags behind the router. */
export function useUrlText(name: string): [string, (next: string) => void] {
  const params = useSearchParams();
  const [text, setText] = useState(() => params.get(name) ?? "");
  useEffect(() => {
    writeParam(name, text.trim() === "" ? null : text);
  }, [name, text]);
  return [text, setText];
}

/** An open-ended value kept in the URL (`?rule=rule_lumi_organic`, `?case=disp_0012`). `null` when absent. */
export function useUrlValue(name: string): [string | null, (next: string | null) => void] {
  const params = useSearchParams();
  const value = params.get(name);
  const set = useCallback(
    (next: string | null) => {
      writeParam(name, next);
    },
    [name],
  );
  return [value, set];
}
