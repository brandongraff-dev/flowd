"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  DEFAULT_THEME,
  SERVER_RESOLVED_THEME,
  THEME_STORAGE_KEY,
  isTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  /** The user's choice: light, dark or system. */
  theme: Theme;
  /** What is actually applied to <html data-theme>. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

// In-memory fallback so the toggle still works when localStorage is blocked.
let memoryPreference: Theme | null = null;
const listeners = new Set<() => void>();

function readPreference(): Theme {
  if (memoryPreference) return memoryPreference;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage can be blocked (private mode, site data cleared): fall through.
  }
  return DEFAULT_THEME;
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyToDocument(theme: Theme): void {
  const resolved = resolve(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePref = theme;
  root.style.colorScheme = resolved;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    applyToDocument(readPreference());
    emit();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    memoryPreference = null;
    applyToDocument(readPreference());
    emit();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

// The snapshot is a string ("pref:resolved") so React can compare it by value.
function getSnapshot(): string {
  const theme = readPreference();
  return `${theme}:${resolve(theme)}`;
}

function getServerSnapshot(): string {
  return `${DEFAULT_THEME}:${SERVER_RESOLVED_THEME}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolvedTheme] = snapshot.split(":") as [Theme, ResolvedTheme];

  const setTheme = useCallback((next: Theme) => {
    memoryPreference = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked storage: the in-memory preference above still applies for this session.
    }
    applyToDocument(next);
    emit();
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider> (mounted in src/app/layout.tsx).");
  return context;
}
