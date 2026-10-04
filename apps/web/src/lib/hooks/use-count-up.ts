"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { animate, useInView, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";

export interface CountUpOptions {
  /** Value the entrance count starts from (default 0). Only used with `animateOnMount`. */
  from?: number;
  /**
   * Also count up the first time the element scrolls into view. Default false: the value renders at once (server HTML
   * included) and only later changes animate. Use true for figures revealed on scroll (marketing stats, wrapped), not
   * for numbers that are above the fold at load: the server HTML shows the final value and then snaps back to `from`.
   */
  animateOnMount?: boolean;
  /** Skip all animation and render the value directly. */
  disabled?: boolean;
  /** Distance from the target at which the spring is considered settled (default 0.01; use 0.5 for whole cents). */
  restDelta?: number;
}

/**
 * The `smooth` spring (stiffness 320) but critically damped: a number that overshoots its target and comes back reads as a
 * wrong figure for a moment, which is unacceptable for money. Settles in about 450 ms, like `smooth`.
 */
const COUNT_SPRING = { type: "spring", stiffness: 320, damping: 36, mass: 1 } as const;

/** Retrigger a one-shot CSS animation on an element (remove, force a reflow, add). */
function replay(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/**
 * Spring count between numbers (`smooth` spring, interruptible: a new value mid-count retargets from where the number is
 * and keeps its velocity). Under `prefers-reduced-motion` the number jumps and, when it went up, the element gets a calm
 * 400 ms mint wash (`.fd-flash`) instead of a roll (design-ux motion spec).
 *
 * Pass a ref to the element that shows the number (it drives the in-view entrance and the reduced-motion wash) and render the
 * returned value. The hook re-renders its host once per frame while counting, so keep it on a small leaf (a figure, not a table).
 *
 * ```tsx
 * const ref = useRef<HTMLSpanElement>(null);
 * const views = useCountUp(ref, total);
 * return <span ref={ref}>{Math.round(views)}</span>;
 * ```
 */
export function useCountUp(ref: RefObject<HTMLElement | null>, target: number, options: CountUpOptions = {}): number {
  const { from = 0, animateOnMount = false, disabled = false, restDelta = 0.01 } = options;
  const reduce = useReducedMotion();
  const instant = disabled || Boolean(reduce);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });

  const motionValue = useMotionValue(target);
  const [shown, setShown] = useState(target);
  useMotionValueEvent(motionValue, "change", (latest) => setShown(latest));

  const latest = useRef({ target, from, restDelta });
  const previous = useRef(target);
  const firstRun = useRef(true);

  // Later changes: spring to the new value (or jump with a wash).
  useEffect(() => {
    latest.current = { target, from, restDelta };
    const first = firstRun.current;
    firstRun.current = false;
    const before = previous.current;
    previous.current = target;
    if (first && animateOnMount) return; // the in-view effect below plays the entrance
    if (instant) {
      motionValue.jump(target);
      if (ref.current && target > before && !disabled) replay(ref.current, "fd-flash");
      return;
    }
    const controls = animate(motionValue, target, { ...COUNT_SPRING, restDelta });
    return () => controls.stop();
  }, [target, from, restDelta, instant, disabled, animateOnMount, motionValue, ref]);

  // The entrance: count from `from` the first time the figure is visible.
  useEffect(() => {
    if (!animateOnMount || !inView || instant) return;
    const { target: end, from: start, restDelta: delta } = latest.current;
    motionValue.jump(start);
    const controls = animate(motionValue, end, { ...COUNT_SPRING, restDelta: delta });
    return () => controls.stop();
  }, [animateOnMount, inView, instant, motionValue]);

  return instant ? target : shown;
}
