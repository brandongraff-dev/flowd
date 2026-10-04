"use client";

import { useId, useMemo, type ComponentPropsWithRef } from "react";
import { curveMonotoneX, line as d3Line, area as d3Area } from "d3-shape";
import { cn } from "@/lib/utils";
import { formatCompact } from "./format";
import { useReveal } from "./hooks";

export type SparklineTone = "accent" | "mint" | "neutral" | "rose" | "info";

const TONE_COLOR: Record<SparklineTone, string> = {
  accent: "var(--fd-chart-1)",
  mint: "var(--fd-mint)",
  neutral: "var(--fd-fg-muted)",
  rose: "var(--fd-rose)",
  info: "var(--fd-info)",
};

export interface SparklineProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** The series, oldest first. 12 points is the stat-tile contract. */
  data: readonly number[];
  /** Colour of the current period and the end dot. Creators see `mint` for money; brands see `accent` or `neutral`. */
  tone?: SparklineTone;
  /** How many trailing points form the "current period", drawn in the tone colour over the de-emphasis grey (default 4). 0 draws the whole line in the tone. */
  highlight?: number;
  /** A faint wash under the line. */
  area?: boolean;
  /** Height in px (default 36). Width follows the container. */
  height?: number;
  /** Start the y domain at zero. Default false: a sparkline shows shape, not magnitude (the tile prints the figure). */
  zero?: boolean;
  /** Accessible description. Default: "Trend over N points, from X to Y". */
  label?: string;
}

const W = 100;

/**
 * Sparkline for stat tiles and table rows: a 2px line in the de-emphasis grey with the current period in the accent, a
 * ringed end dot, and a one-time left-to-right wipe (never under reduced motion). It is a graphic with a text alternative:
 * the figure beside it carries the number.
 */
export function Sparkline({ data, tone = "accent", highlight = 4, area = false, height = 36, zero = false, label, className, style, ...props }: SparklineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { ref, revealed, animated } = useReveal<HTMLDivElement>();
  const pad = 5;

  const geometry = useMemo(() => {
    const values = data.filter((value) => Number.isFinite(value));
    if (values.length < 2) return null;
    const min = zero ? Math.min(0, ...values) : Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points: [number, number][] = values.map((value, index) => [(index / (values.length - 1)) * W, pad + (1 - (value - min) / span) * (height - pad * 2)]);
    const gen = d3Line().curve(curveMonotoneX);
    const tail = highlight > 0 ? points.slice(-Math.min(Math.max(highlight, 2), points.length)) : points;
    const wash = d3Area<[number, number]>().x((point) => point[0]).y0(height).y1((point) => point[1]).curve(curveMonotoneX);
    return {
      base: gen(points) ?? "",
      current: gen(tail) ?? "",
      wash: wash(points) ?? "",
      end: points[points.length - 1] as [number, number],
      first: values[0] as number,
      last: values[values.length - 1] as number,
    };
  }, [data, highlight, height, zero]);

  if (!geometry) return <div ref={ref} aria-hidden="true" className={className} style={{ height, ...style }} {...props} />;

  const color = TONE_COLOR[tone];
  const description = label ?? `Trend over ${data.length} points, from ${formatCompact(geometry.first)} to ${formatCompact(geometry.last)}`;
  const wipe = revealed ? "inset(-6px -6px -6px -6px)" : "inset(-6px 100% -6px -6px)";

  return (
    <div ref={ref} role="img" aria-label={description} className={cn("relative w-full pr-[5px]", className)} style={{ height, ...style }} {...props}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="block size-full overflow-visible"
        aria-hidden="true"
        style={{ clipPath: wipe, transition: animated ? "clip-path 800ms var(--fd-ease-emphasized)" : "none" }}
      >
        <defs>
          <linearGradient id={`${uid}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.18} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {area ? <path d={geometry.wash} fill={`url(#${uid}-wash)`} /> : null}
        {highlight > 0 ? <path d={geometry.base} fill="none" stroke="var(--fd-fg-subtle)" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        <path d={geometry.current} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        aria-hidden="true"
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--fd-chart-surface)]"
        style={{
          background: color,
          left: `calc((100% - 5px) * ${geometry.end[0] / W})`,
          top: `${(geometry.end[1] / height) * 100}%`,
          opacity: revealed ? 1 : 0,
          transition: animated ? "opacity 260ms var(--fd-ease-standard) 640ms" : "none",
        }}
      />
    </div>
  );
}
