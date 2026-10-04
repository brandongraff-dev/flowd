"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartKey, type ChartKeyShape } from "./chart-key";

export interface LegendItem {
  id: string;
  label: ReactNode;
  /** CSS colour (a `var(--fd-chart-N)`). Identity comes from this key beside the text; the text itself never wears the colour. */
  color: string;
  /** Mirrors the mark: `line` for lines, `rect` for bars and areas, `dot`/marker shapes for points, `dashed` for estimated. */
  shape?: ChartKeyShape;
  /** Optional trailing figure (a total, a share). Tabular. */
  value?: ReactNode;
}

export interface ChartLegendProps {
  items: readonly LegendItem[];
  /** Ids currently hidden. Hidden items stay in the legend (so they can come back) with a struck-through label. */
  hidden?: ReadonlySet<string>;
  /** Makes items toggle buttons (toggle-to-isolate). Omit for a static legend. */
  onToggle?: (id: string) => void;
  /** Highlight one series while its legend item is hovered or focused; `null` on leave. */
  onHover?: (id: string | null) => void;
  align?: "start" | "end";
  "aria-label"?: string;
  className?: string;
}

/**
 * Chart legend: always present for two or more series (the dependable identity channel; direct labels only supplement it).
 * With `onToggle` every item is a real toggle button (`aria-pressed`, 44px on touch, keyboard operable); hiding a series
 * never repaints the others because colour follows the entity.
 */
export function ChartLegend({ items, hidden, onToggle, onHover, align = "start", "aria-label": ariaLabel = "Legend", className }: ChartLegendProps) {
  return (
    <ul aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-x-1 gap-y-1", align === "end" && "justify-end", className)}>
      {items.map((item) => {
        const off = hidden?.has(item.id) ?? false;
        const body = (
          <>
            <ChartKey color={item.color} shape={item.shape} className={cn(off && "opacity-40")} />
            <span className={cn(off && "line-through decoration-fg-subtle")}>{item.label}</span>
            {item.value !== undefined ? <span className="font-semibold text-fg tabular-nums">{item.value}</span> : null}
          </>
        );
        return (
          <li key={item.id}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(item.id)}
                onPointerEnter={() => onHover?.(item.id)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(item.id)}
                onBlur={() => onHover?.(null)}
                className={cn(
                  "inline-flex h-7 items-center gap-2 rounded-pill px-2.5 text-caption font-medium transition-colors duration-(--fd-dur-fast) ease-standard",
                  "hover:bg-surface-hover hover:text-fg active:scale-[0.96] pointer-coarse:min-h-11",
                  off ? "text-fg-subtle" : "text-fg-muted",
                )}
              >
                {body}
              </button>
            ) : (
              <span className="inline-flex h-7 items-center gap-2 px-2.5 text-caption font-medium text-fg-muted">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ScaleLegendProps {
  /** CSS colours of the steps, low to high (a sequential or diverging ramp). */
  steps: readonly string[];
  min: ReactNode;
  max: ReactNode;
  /** What the colour encodes ("Median views"). */
  label?: ReactNode;
  /** A "no data" swatch after the ramp. */
  empty?: ReactNode;
  className?: string;
}

/** Legend for a colour ramp: a stepped bar with low and high labels (a continuous encoding always gets a scale legend). */
export function ScaleLegend({ steps, min, max, label, empty, className }: ScaleLegendProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-micro text-fg-subtle", className)}>
      {label ? <span className="font-medium text-fg-muted">{label}</span> : null}
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums">{min}</span>
        <span aria-hidden="true" className="flex gap-0.5">
          {steps.map((color, index) => (
            <span key={index} className="h-2.5 w-5 first:rounded-l-[4px] last:rounded-r-[4px]" style={{ background: color }} />
          ))}
        </span>
        <span className="tabular-nums">{max}</span>
      </span>
      {empty ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_var(--fd-chart-axis)]" />
          {empty}
        </span>
      ) : null}
    </div>
  );
}
