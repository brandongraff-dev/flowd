"use client";

import { CartesianChart, type CartesianChartProps, type XYPoint, type XYSeries } from "./cartesian";

export interface AreaChartProps extends Omit<CartesianChartProps, "variant" | "series"> {
  /** One series: pass the points here and name it with `seriesLabel` (a single series needs no legend; the title names it). */
  data?: readonly XYPoint[];
  seriesLabel?: string;
  /** Several series: pass `series` (and `stacked` for part-to-whole over time). */
  series?: readonly XYSeries[];
  /** Stack the series (spend by app, installs by source). Layers touch; a hairline top edge separates them. */
  stacked?: boolean;
}

/**
 * Area chart: the series hue as a ~10% wash with a 2px line on top, an end dot and a labelled endpoint. Use for one
 * magnitude over time (spend, views, cleared earnings); stack it for part-to-whole over time. Zero-based by default.
 *
 * ```tsx
 * <AreaChart title="Cleared earnings" summary="Cleared earnings rose from $212 to $1,284 over 30 days."
 *   data={days.map((d) => ({ x: new Date(d.date), y: d.cleared_cents }))} seriesLabel="Cleared"
 *   yFormat={(v) => formatCents(v, true)} yTooltipFormat={(v) => formatCents(v)} />
 * ```
 */
export function AreaChart({ data, seriesLabel = "Value", series, stacked = false, ...props }: AreaChartProps) {
  const resolved: readonly XYSeries[] = series ?? [{ id: "value", label: seriesLabel, points: data ?? [] }];
  return <CartesianChart {...props} variant={stacked ? "stacked" : "area"} series={resolved} />;
}
