/**
 * Theme constants shared by the server layout (inline init script) and the
 * client provider. Keep this file free of React and browser globals.
 *
 * <html data-theme> is always the RESOLVED theme ("light" | "dark"); the user's
 * choice ("light" | "dark" | "system") lives in localStorage and in
 * <html data-theme-pref>. Tokens key off data-theme.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "flowd-theme";

/** Dark-first brand: first-time visitors (and headless screenshots) get dark until they choose. */
export const DEFAULT_THEME: Theme = "dark";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function resolveWithoutBrowser(theme: Theme): ResolvedTheme {
  return theme === "system" ? "dark" : theme;
}

/** What the server renders into <html data-theme> before the init script runs. */
export const SERVER_RESOLVED_THEME: ResolvedTheme = resolveWithoutBrowser(DEFAULT_THEME);

/**
 * Blocking inline script placed in <head>: resolves the stored preference and
 * sets data-theme / color-scheme before first paint, so there is no flash.
 */
export const themeInitScript = `(function(){var d=document.documentElement,p="${DEFAULT_THEME}";try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");if(s==="light"||s==="dark"||s==="system")p=s}catch(e){}var r=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;d.dataset.theme=r;d.dataset.themePref=p;d.style.colorScheme=r})();`;
