/**
 * Reduce glass: the in-app switch behind `html[data-transparency="reduce"]`.
 *
 * Safari and Firefox ignore `prefers-reduced-transparency`, so the app ships its own switch (BRAND.md 9.4,
 * CONVENTIONS section 2 rule 4). The attribute is applied before first paint by REDUCE_GLASS_BOOT_SCRIPT (inlined in
 * <head> by the root layout) and flips every glass surface to its opaque solid through the --fd-glass-* tokens.
 *
 * This file is deliberately React-free and has no "use client": the server layout imports the boot script from here.
 * The React hook is `useReduceGlass` in "@/lib/hooks/use-reduce-glass".
 */

import { withoutTransitions } from "@/lib/motion";

export const REDUCE_GLASS_STORAGE_KEY = "flowd-reduce-glass";

/** Inline in <head>, before first paint, so the saved choice applies without a flash of blur. */
export const REDUCE_GLASS_BOOT_SCRIPT = `try{if(localStorage.getItem("${REDUCE_GLASS_STORAGE_KEY}")==="1")document.documentElement.dataset.transparency="reduce"}catch(e){}`;

/** True when the in-app switch is on (the attribute is the single source of truth). Server-safe: false. */
export function isReduceGlassOn(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.transparency === "reduce";
}

/** True when the OS asks for reduced transparency (Chrome/Edge only; Safari and Firefox never report it). */
export function systemReducesTransparency(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

/** Either source: use this to decide whether decorative extras (lens, WebGL aurora) should run. */
export function prefersReducedTransparency(): boolean {
  return isReduceGlassOn() || systemReducesTransparency();
}

/**
 * Turn the in-app Reduce glass switch on or off and persist it. Storage can throw (private mode, blocked site data):
 * the attribute still applies for the session.
 */
export function setReduceGlass(on: boolean): void {
  withoutTransitions(() => {
    document.documentElement.dataset.transparency = on ? "reduce" : "auto";
  });
  try {
    window.localStorage.setItem(REDUCE_GLASS_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Blocked storage: the attribute above still applies for this session.
  }
}
