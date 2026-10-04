"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useInView } from "motion/react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

/** Hydration-safe `prefers-reduced-motion` (false on the server and the first client render, then the real value). */
export function useReducedMotionPref(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)", false);
}

export interface Measured<T extends HTMLElement> {
  ref: RefObject<T | null>;
  /** 0 until the first measurement (charts render a fixed-height placeholder so the layout never jumps). */
  width: number;
  height: number;
}

/** Observe an element's content-box size. Charts redraw on every change, so they are responsive down to 280px. */
export function useMeasure<T extends HTMLElement>(): Measured<T> {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = (): void => {
      const rect = node.getBoundingClientRect();
      setSize((previous) =>
        Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
          ? previous
          : { width: Math.round(rect.width * 2) / 2, height: Math.round(rect.height * 2) / 2 },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}

export interface Reveal<T extends Element> {
  ref: RefObject<T | null>;
  /** True once the chart has scrolled into view (immediately under reduced motion): flip the draw-in on this. */
  revealed: boolean;
  /** True when draw-in animation should play. Under reduced motion charts render in their final state at once. */
  animated: boolean;
}

/**
 * Draw-in trigger: plays once, the first time the chart is visible; never plays under reduced motion.
 * Pass the ref of an element that exists from the first render (the measured wrapper): the observer attaches once.
 */
export function useReveal<T extends Element>(existing?: RefObject<T | null>): Reveal<T> {
  const own = useRef<T>(null);
  const ref = existing ?? own;
  const reduced = useReducedMotionPref();
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  return { ref, revealed: reduced || inView, animated: !reduced };
}

export interface SeriesVisibility {
  hidden: ReadonlySet<string>;
  isVisible: (id: string) => boolean;
  /** Hide or show one series. The last visible series cannot be hidden (an empty chart explains nothing). */
  toggle: (id: string) => void;
  /** Show only this series (or everything again when it is already the only one). */
  isolate: (id: string) => void;
  reset: () => void;
}

/** Toggle-to-isolate state for legends. Colour follows the entity, so hiding a series never repaints the others. */
export function useSeriesVisibility(ids: readonly string[], controlled?: ReadonlySet<string>): SeriesVisibility {
  const [internal, setInternal] = useState<ReadonlySet<string>>(() => new Set());
  const idKey = ids.join("|");
  // A series that disappeared from the data must not stay "hidden" forever: filter against the live ids on every read.
  const hidden = useMemo<ReadonlySet<string>>(() => {
    if (controlled) return controlled;
    const known = new Set(idKey.split("|"));
    return new Set([...internal].filter((id) => known.has(id)));
  }, [controlled, internal, idKey]);

  const toggle = useCallback(
    (id: string): void => {
      setInternal((previous) => {
        const next = new Set(previous);
        if (next.has(id)) {
          next.delete(id);
        } else if (ids.filter((other) => !next.has(other)).length > 1) {
          next.add(id);
        }
        return next;
      });
    },
    [ids],
  );

  const isolate = useCallback(
    (id: string): void => {
      setInternal((previous) => {
        const onlyThis = ids.every((other) => other === id || previous.has(other)) && !previous.has(id);
        return onlyThis ? new Set() : new Set(ids.filter((other) => other !== id));
      });
    },
    [ids],
  );

  const reset = useCallback((): void => setInternal(new Set()), []);
  const isVisible = useCallback((id: string): boolean => !hidden.has(id), [hidden]);

  return { hidden, isVisible, toggle, isolate, reset };
}

export interface CursorState {
  /** Index of the hovered / focused datum. */
  index: number;
  /** Viewport (client) coordinates the tooltip anchors to. */
  x: number;
  y: number;
  source: "pointer" | "keyboard";
}

export interface ChartCursor {
  state: CursorState | null;
  /** Pointer hover: `index` was resolved by the chart from the pointer position. */
  setFromPointer: (index: number, clientX: number, clientY: number) => void;
  clear: () => void;
  /** Spread on the focusable chart element (an `<svg tabIndex=0>` or a `role="group"` wrapper). */
  keyboard: {
    onKeyDown: (event: KeyboardEvent<Element>) => void;
    onFocus: (event: FocusEvent<Element>) => void;
    onBlur: () => void;
  };
}

/**
 * One cursor model for every chart: pointer hover and keyboard (arrow keys, Home/End, Escape) drive the same tooltip, so
 * everything a tooltip shows is reachable without a mouse. `anchorFor` maps an index to client coordinates for the keyboard.
 */
export function useChartCursor(
  count: number,
  anchorFor: (index: number) => { x: number; y: number } | null,
  options: { columns?: number } = {},
): ChartCursor {
  const [state, setState] = useState<CursorState | null>(null);
  const anchorRef = useRef(anchorFor);
  useEffect(() => {
    anchorRef.current = anchorFor;
  });

  const setFromPointer = useCallback(
    (index: number, clientX: number, clientY: number): void => {
      if (index < 0 || index >= count) return;
      setState((previous) =>
        previous && previous.source === "pointer" && previous.index === index && Math.abs(previous.y - clientY) < 2
          ? previous
          : { index, x: clientX, y: clientY, source: "pointer" },
      );
    },
    [count],
  );

  const clear = useCallback((): void => setState(null), []);

  const move = useCallback(
    (index: number): void => {
      const clamped = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
      const anchor = anchorRef.current(clamped);
      if (anchor) setState({ index: clamped, x: anchor.x, y: anchor.y, source: "keyboard" });
    },
    [count],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<Element>): void => {
      if (count === 0) return;
      const current = state?.index ?? -1;
      const columns = options.columns;
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          move(current < 0 ? 0 : current + 1);
          break;
        case "ArrowDown":
          event.preventDefault();
          move(current < 0 ? 0 : current + (columns ?? 1));
          break;
        case "ArrowLeft":
          event.preventDefault();
          move(current < 0 ? count - 1 : current - 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          move(current < 0 ? count - 1 : current - (columns ?? 1));
          break;
        case "Home":
          event.preventDefault();
          move(0);
          break;
        case "End":
          event.preventDefault();
          move(count - 1);
          break;
        case "Escape":
          if (state) {
            event.preventDefault();
            event.stopPropagation();
            setState(null);
          }
          break;
        default:
      }
    },
    [count, move, state, options.columns],
  );

  const onFocus = useCallback(
    (event: FocusEvent<Element>): void => {
      // Only the keyboard path opens the tooltip on focus; a mouse click focusing the chart must not pop it.
      if (count > 0 && event.currentTarget.matches(":focus-visible")) move(count - 1);
    },
    [count, move],
  );

  return { state, setFromPointer, clear, keyboard: { onKeyDown, onFocus, onBlur: clear } };
}
