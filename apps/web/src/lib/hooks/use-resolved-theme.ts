"use client";

import { useSyncExternalStore } from "react";

export type ResolvedThemeName = "light" | "dark";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getSnapshot(): ResolvedThemeName {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * The theme actually applied to <html data-theme> ("dark" is the fallback, as in the tokens).
 * Reads the DOM instead of the shell's ThemeProvider so design-system pieces (WebGL aurora, canvas art) have no
 * dependency on the shell and still react to the in-app toggle.
 */
export function useResolvedTheme(): ResolvedThemeName {
  return useSyncExternalStore(subscribe, getSnapshot, () => "dark");
}
