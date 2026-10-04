"use client";

import { CartesianChart, type CartesianChartProps } from "./cartesian";

export type LineChartProps = Omit<CartesianChartProps, "variant">;

/**
 * Multi-series line chart: 2px lines, a ringed end dot per series, names at the line ends when they separate cleanly, a
 * toggle-to-isolate legend (always present for two or more series), one tooltip listing every series at the snapped x,
 * dotted estimated segments, and optional marker shapes for colour-blind readers.
 *
 * Colour follows the entity: hiding a series never repaints the others. Past four series, facet instead of adding hues.
 */
export function LineChart(props: LineChartProps) {
  return <CartesianChart {...props} variant="line" />;
}
