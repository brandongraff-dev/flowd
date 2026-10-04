"use client";

import type { ReactNode } from "react";
import { Glass, type GlassProps } from "./glass";
import type { LensOptions } from "./lens/use-liquid-lens";

export interface LiquidLensProps extends Omit<GlassProps, "lens" | "layer" | "clear" | "asChild"> {
  /** L2 (default) for floating hero cards and pills, L3 for a thick hero panel. */
  layer?: 2 | 3;
  /** Tune the optics. Keep text at least `bezel` px (default 28) from every edge: the rim magnifies. */
  optics?: LensOptions;
  children?: ReactNode;
}

/**
 * Real Liquid Glass with refraction: the backdrop bends through the rim like a thick lens, with a baked specular edge.
 * This is a progressive enhancement for **at most three hero surfaces per page** (wallet hero card, Daily Drop,
 * marketing hero): it only runs in Chromium (gated on `navigator.userAgentData`; Safari and Firefox do not render
 * `backdrop-filter: url()`), only when Reduce glass is off, and only until the budget of three is spent. Everywhere
 * else it renders the identical CSS glass, so the design never depends on it.
 *
 * Under the hood this is `<Glass lens>`; it exists so hero code reads as intent and so the budget is greppable.
 */
export function LiquidLens({ layer = 2, optics, interactive = true, ...props }: LiquidLensProps) {
  return <Glass layer={layer} lens={optics ?? true} interactive={interactive} {...props} />;
}
