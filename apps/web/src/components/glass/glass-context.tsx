"use client";

import { createContext, useContext } from "react";

/** 1 = quiet content glass, 2 = floating controls, 3 = sheets / popovers. */
export type GlassLayer = 1 | 2 | 3;

/** The glass layer a component is rendered inside (0 = none). */
export type GlassNesting = 0 | GlassLayer;

const GlassNestingContext = createContext<GlassNesting>(0);

export const GlassNestingProvider = GlassNestingContext.Provider;

/**
 * Which glass layer this component sits in (0 when none). `<Glass>` reads it to enforce "glass never samples glass"
 * (a glass element inside another one renders as a fill); controls read it to pick a flat style inside L2/L3.
 */
export function useGlassNesting(): GlassNesting {
  return useContext(GlassNestingContext);
}
