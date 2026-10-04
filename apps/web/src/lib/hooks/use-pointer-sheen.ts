"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "motion/react";

/** Pointer sheen spring (design-ux motion spec): decorative, so it trails the cursor a little instead of snapping to it. */
const SHEEN_SPRING = { stiffness: 140, damping: 22, mass: 1 } as const;

export interface PointerSheenHandlers<T extends HTMLElement> {
  ref: RefObject<T | null>;
  onPointerEnter: (event: ReactPointerEvent<T>) => void;
  onPointerMove: (event: ReactPointerEvent<T>) => void;
}

/**
 * Pointer-tracking sheen for interactive L2/L3 glass: writes `--mx` / `--my` (px, relative to the element) that the
 * glass CSS reads for the 240px highlight and the rim hot spot. Mouse only (touch has no hover), off under reduced
 * motion, no React re-render per move (the spring writes straight to the element's style).
 *
 * `<Glass interactive>` uses this internally; use it directly only for custom surfaces:
 * `const sheen = usePointerSheen<HTMLDivElement>(); <div ref={sheen.ref} onPointerEnter={sheen.onPointerEnter} onPointerMove={sheen.onPointerMove} />`.
 */
export function usePointerSheen<T extends HTMLElement>(enabled = true): PointerSheenHandlers<T> {
  const ref = useRef<T | null>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, SHEEN_SPRING);
  const y = useSpring(0, SHEEN_SPRING);
  const active = enabled && !reduce;

  useMotionValueEvent(x, "change", (value) => ref.current?.style.setProperty("--mx", `${value.toFixed(1)}px`));
  useMotionValueEvent(y, "change", (value) => ref.current?.style.setProperty("--my", `${value.toFixed(1)}px`));

  const locate = useCallback((event: ReactPointerEvent<T>): { px: number; py: number } | null => {
    if (event.pointerType !== "mouse") return null;
    const box = event.currentTarget.getBoundingClientRect();
    return { px: event.clientX - box.left, py: event.clientY - box.top };
  }, []);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!active) return;
      const point = locate(event);
      if (!point) return;
      // Jump to the entry point so the highlight does not slide in from the previous position.
      x.jump(point.px);
      y.jump(point.py);
    },
    [active, locate, x, y],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!active) return;
      const point = locate(event);
      if (!point) return;
      x.set(point.px);
      y.set(point.py);
    },
    [active, locate, x, y],
  );

  return { ref, onPointerEnter, onPointerMove };
}
