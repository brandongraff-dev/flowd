"use client";

import { CartesianChart, type CartesianChartProps, type XYMarker, type XYReference, type XYSeries, type XValue } from "./cartesian";
import { formatMoneyText } from "@/components/ui/money-format";
import { cn } from "@/lib/utils";

export interface RangePoint {
  x: XValue;
  p25: number;
  median: number;
  p75: number;
  estimated?: boolean;
}

export interface RangeBandProps extends Omit<CartesianChartProps, "variant" | "series" | "band"> {
  data: readonly RangePoint[];
  /** Name of the centre line ("Clearing CPM, median"). */
  medianLabel?: string;
  /** Name of the shaded range. */
  bandLabel?: string;
  /** Extra lines over the band (your own price, a competitor median). */
  extraSeries?: readonly XYSeries[];
  references?: readonly XYReference[];
  markers?: readonly XYMarker[];
}

/**
 * The Market view chart: a p25 to p75 band with the median line through it ("what a view costs, typical to high"), and an
 * optional marker for where your own bounty sits. The band is a wash, the median is the only 2px line, so the eye reads
 * "typical range" first and the exact median second. Always show the range beside any single number (median beside top).
 */
export function RangeBand({ data, medianLabel = "Median", bandLabel = "Middle half (25th to 75th percentile)", extraSeries = [], ...props }: RangeBandProps) {
  const median: XYSeries = {
    id: "median",
    label: medianLabel,
    points: data.map((point) => ({ x: point.x, y: point.median, estimated: point.estimated })),
  };
  return (
    <CartesianChart
      {...props}
      variant="line"
      series={[median, ...extraSeries]}
      band={{
        id: "band",
        label: bandLabel,
        lowLabel: "25th percentile",
        highLabel: "75th percentile",
        points: data.map((point) => ({ x: point.x, low: point.p25, high: point.p75 })),
      }}
    />
  );
}

export interface RangeBarProps {
  /** 25th percentile, in the same unit as the others (cents for money). */
  low: number;
  median: number;
  /** 75th percentile. */
  high: number;
  /** A top-earner example. It always sits beside the typical range, at the same size (the earnings-honesty rule). */
  top?: number;
  /** Axis maximum. Default: the largest of `high` and `top`, plus 8%. */
  max?: number;
  format?: (value: number) => string;
  /** Caption above the bar ("Typical creator, last 30 days"). */
  label?: string;
  /** Label of the top marker. */
  topLabel?: string;
  className?: string;
}

/**
 * A single typical-earnings range: the middle half as a rounded bar, the median as a tick, and optionally a top-earner
 * marker on the same scale. Purely presentational and server-renderable. The numbers also appear as text, so the bar is
 * never the only way to read them.
 *
 * ```tsx
 * <RangeBar low={3800} median={6200} high={14000} top={194000} label="Typical creator, last 30 days" />
 * ```
 */
export function RangeBar({ low, median, high, top, max, format = (value) => formatMoneyText(value, { decimals: "auto" }), label, topLabel = "Top earner", className }: RangeBarProps) {
  const domainMax = max ?? Math.max(high, top ?? 0) * 1.08;
  const at = (value: number): number => Math.min(Math.max(value / domainMax, 0), 1) * 100;
  const topNearEdge = top !== undefined && at(top) > 84;
  return (
    <div className={cn("grid gap-2", className)} role="group" aria-label={label ?? "Typical range"}>
      {label ? <p className="text-caption font-medium text-fg-muted">{label}</p> : null}
      <div aria-hidden="true" className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--fd-chart-axis)" />
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[4px] bg-(--fd-chart-1) opacity-35"
          style={{ left: `${at(low)}%`, width: `${Math.max(at(high) - at(low), 1.2)}%` }}
        />
        <div className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" style={{ left: `${at(median)}%` }} />
        {top !== undefined ? (
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${at(top)}%` }}>
            <span className="block size-3 rounded-full bg-fg shadow-[0_0_0_2px_var(--fd-chart-surface)]" />
          </div>
        ) : null}
      </div>
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-caption">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Typical range</dt>
          <dd className="font-semibold text-fg tabular-nums">
            {format(low)} to {format(high)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-fg-subtle">Median</dt>
          <dd className="font-semibold text-fg tabular-nums">{format(median)}</dd>
        </div>
        {top !== undefined ? (
          <div className={cn("flex items-baseline gap-1.5", topNearEdge && "order-last")}>
            <dt className="text-fg-subtle">{topLabel}</dt>
            <dd className="font-semibold text-fg tabular-nums">{format(top)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
