"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";
import { ChartKey, type ChartKeyShape } from "./chart-key";

export interface TooltipRow {
  /** Stable key (a series id or category). */
  id: string;
  label: ReactNode;
  /** The value, already formatted. It leads: high-contrast, semibold, tabular. */
  value: ReactNode;
  /** Series colour for the key. Omit for a row without a key (totals, notes). */
  color?: string;
  shape?: ChartKeyShape;
  /** Quieter row (a context series, a total). */
  muted?: boolean;
}

export interface ChartTooltipProps {
  /** Viewport coordinates of the datum, or `null` to hide. */
  anchor: { x: number; y: number } | null;
  /** Gap between the anchor and the tooltip (px). */
  offset?: number;
  children: ReactNode;
  className?: string;
}

/**
 * The chart tooltip: a compact L3 glass card rendered in a portal (so no card, scroller or `overflow` can clip it and its
 * backdrop samples the page, not the chart card), positioned beside the datum and flipped before it hits a viewport edge.
 * It carries no animation on purpose: it follows the pointer dozens of times a second, which is the kind of interaction
 * that must feel instant (apple-design: respond on pointer-down, never lag the hand).
 */
export function ChartTooltip({ anchor, offset = 14, children, className }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const open = anchor !== null;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      setSize((previous) => (previous && Math.abs(previous.width - rect.width) < 1 && Math.abs(previous.height - rect.height) < 1 ? previous : { width: rect.width, height: rect.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // The row count can change while it is open (a series toggled), so keep tracking the box until it closes.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  if (!anchor || typeof document === "undefined") return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  let x = anchor.x + offset;
  if (x + width > viewportWidth - 8) x = anchor.x - offset - width;
  x = Math.max(8, x);
  const y = Math.min(Math.max(8, anchor.y - height / 2), Math.max(8, viewportHeight - height - 8));

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-(--fd-z-tooltip)"
      style={{ transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`, visibility: size ? "visible" : "hidden" }}
    >
      <Glass
        layer={3}
        portal
        compact
        className={cn("grid min-w-40 max-w-72 gap-2 rounded-xl px-3.5 py-3 text-caption text-fg select-none", className)}
      >
        {children}
      </Glass>
    </div>,
    document.body,
  );
}

export interface TooltipBodyProps {
  /** Heading: the x value (a date, a category). Secondary in weight, because the reader already knows what they aimed at. */
  title?: ReactNode;
  rows: readonly TooltipRow[];
  /** A closing line: "Estimated from day 14", a source. */
  footer?: ReactNode;
}

/** Standard tooltip content: values lead (strong, tabular), series names follow, rows are keyed with a line or marker, not a box. */
export function TooltipBody({ title, rows, footer }: TooltipBodyProps) {
  return (
    <>
      {title ? <p className="text-micro font-medium text-fg-subtle">{title}</p> : null}
      <ul className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="col-span-3 grid grid-cols-subgrid items-center">
            {row.color ? <ChartKey color={row.color} shape={row.shape ?? "line"} /> : <span aria-hidden="true" className="w-3.5" />}
            <span className={cn("truncate text-caption", row.muted ? "text-fg-subtle" : "text-fg-muted")}>{row.label}</span>
            <span className={cn("text-right text-body-sm font-semibold tabular-nums", row.muted ? "text-fg-muted" : "text-fg")}>{row.value}</span>
          </li>
        ))}
      </ul>
      {footer ? <p className="border-t border-divider pt-2 text-micro text-fg-subtle">{footer}</p> : null}
    </>
  );
}
