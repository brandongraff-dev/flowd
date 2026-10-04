"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { groupResults, searchIndex, type SearchOptions } from "./build";
import { pushRecent, readRecents, writeRecents } from "./recents";
import type { SearchEntry, SearchGroup, SearchIndex, SearchResult } from "./types";

export interface UseSearch {
  query: string;
  setQuery: (query: string) => void;
  /** Ranked and grouped for the query (one "Suggested" group when it is empty). */
  groups: SearchGroup[];
  results: SearchResult[];
  /** Call when an entry is chosen so it is remembered for next time. */
  recordUse: (entry: Pick<SearchEntry, "id">) => void;
}

/**
 * Query state, ranking and "recently used" for a palette. Ranking runs on a deferred copy of the query, so typing never waits for
 * the list. Recents live in localStorage (see `RECENTS_KEY`); a blocked store just means no recents.
 */
export function useSearch(index: SearchIndex, options: Omit<SearchOptions, "recent"> = {}): UseSearch {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecents());
  const deferred = useDeferredValue(query);
  const { limit, perGroup, kinds } = options;

  const results = useMemo(() => searchIndex(index, deferred, { limit, perGroup, kinds, recent }), [index, deferred, limit, perGroup, kinds, recent]);
  const groups = useMemo(() => groupResults(results, deferred), [results, deferred]);

  const recordUse = useCallback((entry: Pick<SearchEntry, "id">): void => {
    setRecent((previous) => {
      const next = pushRecent(previous, entry.id);
      writeRecents(next);
      return next;
    });
  }, []);

  return { query, setQuery, groups, results, recordUse };
}

