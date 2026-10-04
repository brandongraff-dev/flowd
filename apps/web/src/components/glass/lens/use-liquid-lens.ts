"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { prefersReducedTransparency } from "../reduce-glass";
import { getRefractionMaps, supportsSvgBackdropFilter, type RefractionMaps } from "./refraction";

/** Hard budget: at most three refracting surfaces mounted per page (wallet hero card, Daily Drop, marketing hero). */
export const MAX_LENSES = 3;
const mounted = new Set<string>();

export interface LensOptions {
  /** Width of the refracting rim in px (keep text and icons at least this far from every edge). */
  bezel?: number;
  /** Glass thickness in px; larger bends more. */
  thickness?: number;
  /** Index of refraction (glass is about 1.5). */
  ior?: number;
}

export interface LensState {
  /** SVG filter id to reference as `url(#id)`. */
  id: string;
  maps: RefractionMaps;
}

/**
 * Measures `ref`, builds (and caches) the refraction maps for its size and keeps them current on resize (debounced).
 * Returns null whenever the lens must not run: SSR, a non-Chromium engine, Reduce glass, the 3-surface budget is spent,
 * or a 2D canvas is unavailable. The caller then keeps plain CSS glass, which is the design for every other browser.
 */
export function useLiquidLens(ref: RefObject<HTMLElement | null>, enabled: boolean, options?: LensOptions): LensState | null {
  const rawId = useId();
  const id = `fd-lens-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [maps, setMaps] = useState<RefractionMaps | null>(null);
  const { bezel, thickness, ior } = options ?? {};

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    if (!supportsSvgBackdropFilter() || prefersReducedTransparency()) return;
    if (mounted.size >= MAX_LENSES) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`flowd: more than ${MAX_LENSES} <Glass lens> surfaces on one page; the extra one stays plain CSS glass.`);
      }
      return;
    }
    mounted.add(id);

    let timer = 0;
    let frame = 0;
    const apply = (): void => {
      const box = element.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return;
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 28;
      const built = getRefractionMaps({ width: box.width, height: box.height, radius, bezel, thickness, ior });
      if (built) setMaps(built);
    };
    // First build after layout settles; later builds are debounced (generating a map costs 6-25 ms).
    frame = window.requestAnimationFrame(apply);
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 140);
    });
    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      mounted.delete(id);
      setMaps(null);
    };
  }, [ref, enabled, id, bezel, thickness, ior]);

  return enabled && maps ? { id, maps } : null;
}
