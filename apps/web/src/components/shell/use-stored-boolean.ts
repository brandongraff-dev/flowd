"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "fd-stored-boolean";

/** In-memory mirror used when storage is blocked, so the toggle still works for the rest of the session. */
const memory = new Map<string, boolean>();

function read(key: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    // Blocked storage (private mode, cleared site data): fall through to the in-memory value.
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * A boolean remembered on this device (localStorage), for per-viewer conveniences like a collapsed sidebar. Hydration-safe:
 * the server and the first client render use `fallback`, the stored value arrives on the next commit. It works without
 * storage (the choice then lasts for the session) and stays in sync across tabs and across components using the same key.
 *
 * The third value says whether the person has ever made the choice, so a responsive default (collapse on tablets) can yield to it.
 */
export function useStoredBoolean(key: string | undefined, fallback: boolean): [boolean, (next: boolean) => void, boolean] {
  const value = useSyncExternalStore(
    subscribe,
    () => (key ? (read(key) ?? memory.get(key) ?? fallback) : fallback),
    () => fallback,
  );
  const chosen = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) !== null || memory.has(key) : false),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      if (!key) return;
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not persisted; the in-memory value above still updates every listener this session.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set, chosen];
}
