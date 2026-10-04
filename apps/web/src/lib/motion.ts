/**
 * Motion vocabulary for the web design system (BRAND.md section 11, apple-design, emil-design-eng).
 *
 * - Springs are the default for anything a user can touch or interrupt. No overshoot unless the gesture carried
 *   momentum (flick release) or it is a payout moment (`bouncy`).
 * - Micro-interactions use the CSS tokens (`--fd-dur-*`, `--fd-ease-*`); this file is for `motion/react` code.
 * - Numbers mirror packages/tokens (stiffness / damping / mass); keep them in sync with tokens.json.
 *
 * Import from "@/lib/motion". Everything here is pure (no React, no DOM) except `withoutTransitions`.
 */

import type { Transition } from "motion/react";

/** Cubic-bezier control points, usable by `motion` (`ease: ease.out`) and, via `cubicBezier`, in CSS. */
export type Bezier = readonly [number, number, number, number];

/** Spring presets: stiffness / damping / mass, identical to the CSS `linear()` springs and the iOS `FlowdMotion` presets. */
export const spring = {
  /** Press feedback, toggles, checkboxes. */
  tap: { type: "spring", stiffness: 520, damping: 40, mass: 1 },
  /** Menus, popovers, tabs, chips, the morphing indicator. */
  snappy: { type: "spring", stiffness: 420, damping: 34, mass: 1 },
  /** Cards, list reorder, layout shifts, count-ups. */
  smooth: { type: "spring", stiffness: 320, damping: 30, mass: 1 },
  /** Sheets, drawers. */
  sheet: { type: "spring", stiffness: 380, damping: 36, mass: 1 },
  /** Hero art, aurora parallax, page transitions. */
  gentle: { type: "spring", stiffness: 240, damping: 26, mass: 1 },
  /** Momentum only: flick release, payout celebration. */
  bouncy: { type: "spring", stiffness: 300, damping: 22, mass: 1 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof spring;

/** Durations in seconds (tokens are ms). */
export const duration = {
  instant: 0.08,
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
  slower: 0.48,
  hero: 0.8,
} as const;

/** Easing curves. `out` and `drawer` are the strong UI curves from emil-design-eng; the rest are the brand tokens. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.16, 1, 0.3, 1],
  decelerate: [0, 0, 0.2, 1],
  accelerate: [0.4, 0, 1, 1],
  inOut: [0.65, 0, 0.35, 1],
  out: [0.23, 1, 0.32, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const satisfies Record<string, Bezier>;

/** CSS string for a bezier, for inline styles. */
export function cubicBezier(points: Bezier): string {
  return `cubic-bezier(${points.join(", ")})`;
}

/** Press feedback: scale to 0.96 on press-down (never below 0.95). */
export const PRESS_SCALE = 0.96;

/** Icon swap (heart toggle, copy -> check, clock -> check): scale 0.25 -> 1, opacity 0 -> 1, blur 4px -> 0, no bounce. */
export const iconSwap = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 },
} as const;

/** Stagger delay in seconds for list item `index`: <= 40 ms per item, capped at 8 items (design-ux motion spec). */
export function stagger(index: number, cap = 8, step = 0.04): number {
  return Math.min(Math.max(index, 0), cap) * step;
}

/**
 * Where a flick will come to rest: Apple's exponential-decay projection ("Designing Fluid Interfaces").
 * `velocity` in px/s, result in px. decelerationRate 0.998 is normal scroll feel, 0.99 is snappier.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Rubber-banding: the further past a bound, the less the element follows.
 * `overshoot` is the distance past the bound (px), `dimension` the size of the draggable area.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  const sign = overshoot < 0 ? -1 : 1;
  const x = Math.abs(overshoot);
  return sign * ((x * dimension * constant) / (dimension + constant * x));
}

/** Count-up duration in seconds: 0.5 s floor, scaled by how big the change is, capped at 1.2 s (design-ux motion spec). */
export function countDuration(from: number, to: number): number {
  const base = Math.max(Math.abs(from), Math.abs(to), 1);
  const relative = Math.min(Math.abs(to - from) / base, 1);
  return Math.min(1.2, 0.5 + relative * 0.7);
}

/**
 * Run a DOM mutation that flips many colours at once (theme, Reduce glass) with transitions suppressed for one frame,
 * so the change snaps instead of smearing (BRAND.md 11). Safe to call on the server (just runs `change`).
 */
export function withoutTransitions(change: () => void): void {
  if (typeof document === "undefined") {
    change();
    return;
  }
  const style = document.createElement("style");
  style.appendChild(document.createTextNode("*,*::before,*::after{transition:none !important}"));
  document.head.appendChild(style);
  change();
  // Force a reflow so the suppressed state is committed, then lift the override on the next frame.
  void window.getComputedStyle(document.body).opacity;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => style.remove());
  });
}
