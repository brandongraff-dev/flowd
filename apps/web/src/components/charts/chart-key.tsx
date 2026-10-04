import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import type { MarkerShape } from "./palette";

export type ChartKeyShape = "line" | "rect" | "dot" | "dashed" | MarkerShape;

export interface ChartKeyProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** CSS colour of the series (a `var(--fd-chart-N)` from the palette). */
  color: string;
  /** Mirrors the mark: a short stroke for lines, a square for bars and areas, a dot for points. */
  shape?: ChartKeyShape;
}

const SHAPE_PATH: Record<MarkerShape, string> = {
  circle: "M5 1.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z",
  square: "M1.4 1.4h7.2v7.2H1.4Z",
  triangle: "M5 0.9 9.2 8.6H0.8Z",
  diamond: "M5 0.6 9.4 5 5 9.4 0.6 5Z",
};

/** SVG path of a marker glyph centred on (0,0) at `size` px, for drawing marks inside a chart. */
export function markerPath(shape: MarkerShape, size: number): string {
  const half = size / 2;
  switch (shape) {
    case "square":
      return `M${-half} ${-half}h${size}v${size}h${-size}Z`;
    case "triangle":
      return `M0 ${-half * 1.1}L${half * 1.1} ${half * 0.9}H${-half * 1.1}Z`;
    case "diamond":
      return `M0 ${-half * 1.15}L${half * 1.15} 0L0 ${half * 1.15}L${-half * 1.15} 0Z`;
    default:
      return `M${-half} 0a${half} ${half} 0 1 0 ${size} 0a${half} ${half} 0 1 0 ${-size} 0Z`;
  }
}

/**
 * The legend / tooltip key. It mirrors the mark it stands for (a short stroke for a line, a square for a bar or area, a dot
 * or marker glyph for points), so identity never rests on colour alone when a shape channel is on.
 */
export function ChartKey({ color, shape = "rect", className, style, ...props }: ChartKeyProps) {
  if (shape === "line") {
    return <span aria-hidden="true" className={cn("inline-block h-0.5 w-3.5 shrink-0 rounded-full", className)} style={{ background: color, ...style }} {...props} />;
  }
  if (shape === "dashed") {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block h-0.5 w-3.5 shrink-0", className)}
        style={{ backgroundImage: `linear-gradient(90deg, ${color} 0 55%, transparent 55% 100%)`, backgroundSize: "6px 100%", ...style }}
        {...props}
      />
    );
  }
  if (shape === "rect") {
    return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: color, ...style }} {...props} />;
  }
  if (shape === "dot") {
    return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color, ...style }} {...props} />;
  }
  return (
    <span aria-hidden="true" className={cn("inline-grid size-2.5 shrink-0 place-items-center", className)} style={style} {...props}>
      <svg viewBox="0 0 10 10" width="10" height="10">
        <path d={SHAPE_PATH[shape]} fill={color} />
      </svg>
    </span>
  );
}
