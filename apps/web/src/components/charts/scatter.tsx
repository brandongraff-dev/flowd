"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { AxisTitle, AxisX, AxisY, Grid, type AxisTick } from "./axes";
import type { ChartShellProps } from "./cartesian";
import { ChartFrame, type ChartTableData } from "./chart-frame";
import { markerPath } from "./chart-key";
import { ChartLegend, type LegendItem } from "./chart-legend";
import { ChartTooltip, TooltipBody, type TooltipRow } from "./chart-tooltip";
import { formatCompact, textWidth, tickCountFor } from "./format";
import { useChartCursor, useMeasure, useReveal, useSeriesVisibility } from "./hooks";
import { ALL_PAIRS_SERIES, FURNITURE, OTHER_COLOR, markerShape, seriesColor } from "./palette";

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  /** Id of a `ScatterGroup`. */
  group?: string;
  /** Name for the tooltip ("Nap Nest, Hook B"). */
  label?: string;
}

export interface ScatterGroup {
  id: string;
  label: string;
  color?: string;
}

export interface ScatterProps extends ChartShellProps {
  points: readonly ScatterPoint[];
  /** At most three groups get a hue and a marker shape (any two scatter marks can touch, so only the first three palette slots are safe); the rest fold into grey. */
  groups?: readonly ScatterGroup[];
  xFormat?: (value: number) => string;
  yFormat?: (value: number) => string;
  xTooltipFormat?: (value: number) => string;
  yTooltipFormat?: (value: number) => string;
  /** Axis titles (labelled axes are required): "Clearing CPM", "Days to fill". */
  xTitle: string;
  yTitle: string;
  /** Names used in the tooltip rows (default: the axis titles). */
  xName?: string;
  yName?: string;
  /** Least-squares trend line over the visible points. */
  trend?: boolean;
  trendLabel?: string;
  /** A point to call out ("You are here"). Drawn in ink with a label. */
  highlightId?: string;
  highlightLabel?: string;
  /** Extra tooltip rows for a point. */
  tooltipRows?: (point: ScatterPoint) => readonly TooltipRow[];
  height?: number;
  /** Start the y axis at zero. */
  zeroY?: boolean;
}

const HIT_RADIUS = 36;

/** Least-squares line through the points. `null` with fewer than three points or no variance in x. */
function regression(points: readonly { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

/**
 * Scatter for relationships (CPM against days to fill, hook score against installs). Markers are at least 8px with a 2px
 * surface ring; hover uses a nearest-point layer (a 36px radius, never "land on the dot"), so the pointer only has to be
 * closest. Up to three groups, each with its own hue AND marker shape. An optional trend line and a call-out for your own
 * point. Arrow keys walk the points in x order.
 */
export function Scatter({
  points,
  groups = [],
  xFormat = formatCompact,
  yFormat = formatCompact,
  xTooltipFormat,
  yTooltipFormat,
  xTitle,
  yTitle,
  xName,
  yName,
  trend = false,
  trendLabel = "Trend",
  highlightId,
  highlightLabel = "You",
  tooltipRows,
  height = 300,
  zeroY = false,
  summary,
  state,
  empty,
  ...shell
}: ScatterProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { revealed, animated } = useReveal<HTMLDivElement>(ref);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const visibility = useSeriesVisibility(groups.map((group) => group.id));
  const xTip = xTooltipFormat ?? xFormat;
  const yTip = yTooltipFormat ?? yFormat;

  const groupIndex = (id: string | undefined): number => (id === undefined ? 0 : Math.max(0, groups.findIndex((group) => group.id === id)));
  const styleFor = (point: ScatterPoint): { color: string; shape: ReturnType<typeof markerShape> } => {
    if (groups.length === 0) return { color: seriesColor(0), shape: "circle" };
    const index = groupIndex(point.group);
    if (index >= ALL_PAIRS_SERIES) return { color: OTHER_COLOR, shape: "circle" };
    return { color: groups[index]?.color ?? seriesColor(index), shape: markerShape(index) };
  };

  const visible = useMemo(() => points.filter((point) => visibility.isVisible(point.group ?? "")), [points, visibility]);
  const sorted = useMemo(() => [...visible].sort((a, b) => a.x - b.x), [visible]);

  const compact = width > 0 && width < 420;
  const innerHeight = Math.max(160, height - 74);
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xTicksTarget = Math.min(7, tickCountFor(Math.max(width - 90, 100), 84, 3));
  const yTicksTarget = Math.min(6, tickCountFor(innerHeight, 48, 3));
  const yScale = useMemo(() => scaleLinear().domain([zeroY ? Math.min(0, yMin) : yMin, yMax]).nice(yTicksTarget).range([innerHeight, 0]), [yMin, yMax, zeroY, yTicksTarget, innerHeight]);
  const yTicks = useMemo<AxisTick[]>(() => yScale.ticks(yTicksTarget).map((value) => ({ pos: yScale(value), label: yFormat(value) })), [yScale, yTicksTarget, yFormat]);
  const leftGutter = Math.min(76, Math.max(40, Math.max(0, ...yTicks.map((tick) => textWidth(tick.label) * 0.9)) + 16)) + 16;
  const innerWidth = Math.max(80, width - leftGutter - (compact ? 14 : 22));
  const xScale = useMemo(() => scaleLinear().domain([xMin, xMax]).nice(xTicksTarget).range([0, innerWidth]), [xMin, xMax, xTicksTarget, innerWidth]);
  const xTicks = useMemo<AxisTick[]>(() => xScale.ticks(xTicksTarget).map((value) => ({ pos: xScale(value), label: xFormat(value) })), [xScale, xTicksTarget, xFormat]);

  const line = useMemo(() => {
    if (!trend) return null;
    const fit = regression(visible);
    if (!fit) return null;
    const [x0, x1] = xScale.domain() as [number, number];
    const [yLow, yHigh] = [Math.min(...yScale.domain()), Math.max(...yScale.domain())];
    // clip the line to the plot box (a steep trend would otherwise run off the bottom of the chart)
    let start = x0;
    let end = x1;
    if (fit.slope !== 0) {
      const atLow = (yLow - fit.intercept) / fit.slope;
      const atHigh = (yHigh - fit.intercept) / fit.slope;
      const enter = Math.min(atLow, atHigh);
      const leave = Math.max(atLow, atHigh);
      start = Math.max(start, enter);
      end = Math.min(end, leave);
    }
    if (end <= start) return null;
    return { x1: xScale(start), y1: yScale(fit.slope * start + fit.intercept), x2: xScale(end), y2: yScale(fit.slope * end + fit.intercept) };
  }, [trend, visible, xScale, yScale]);

  const cursor = useChartCursor(sorted.length, (index) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const point = sorted[index];
    if (!rect || !point) return null;
    return { x: rect.left + leftGutter + xScale(point.x), y: rect.top + 14 + yScale(point.y) };
  });
  const active = cursor.state ? sorted[cursor.state.index] : undefined;

  const activeRows: TooltipRow[] = active
    ? [
        { id: "x", label: xName ?? xTitle, value: xTip(active.x), color: styleFor(active).color, shape: styleFor(active).shape },
        { id: "y", label: yName ?? yTitle, value: yTip(active.y) },
        ...(tooltipRows?.(active) ?? []),
      ]
    : [];

  const legendItems: LegendItem[] = groups.map((group, index) => ({ id: group.id, label: group.label, color: index < ALL_PAIRS_SERIES ? (group.color ?? seriesColor(index)) : OTHER_COLOR, shape: index < ALL_PAIRS_SERIES ? markerShape(index) : "dot" }));

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Scatter data",
    columns: [
      { key: "label", label: "Point" },
      ...(groups.length > 0 ? [{ key: "group", label: "Group" }] : []),
      { key: "x", label: xTitle, align: "end" as const },
      { key: "y", label: yTitle, align: "end" as const },
    ],
    rows: [...points]
      .sort((a, b) => a.x - b.x)
      .map((point) => ({ label: point.label ?? point.id, group: groups.find((group) => group.id === point.group)?.label ?? "", x: xTip(point.x), y: yTip(point.y) })),
  };

  const highlighted = highlightId ? visible.find((point) => point.id === highlightId) : undefined;

  return (
    <ChartFrame
      summary={summary}
      state={state ?? (visible.length < 2 ? "empty" : "ready")}
      empty={empty ?? { title: "Not enough points yet", description: "The pattern appears once a few bounties have settled." }}
      legend={groups.length > 1 ? <ChartLegend items={legendItems} hidden={visibility.hidden} onToggle={visibility.toggle} onHover={setFocusGroup} /> : undefined}
      table={table}
      minHeight={height}
      {...shell}
    >
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && visible.length > 1 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-roledescription="scatter plot"
            aria-label={`${typeof shell.title === "string" ? shell.title : "Scatter plot"}. Use the arrow keys to move through the points.`}
            tabIndex={0}
            className="block touch-pan-y overflow-visible rounded-md select-none"
            onKeyDown={cursor.keyboard.onKeyDown}
            onFocus={cursor.keyboard.onFocus}
            onBlur={cursor.keyboard.onBlur}
          >
            <g transform={`translate(${leftGutter} 14)`}>
              <Grid ticks={yTicks} orientation="horizontal" length={innerWidth} />
              <Grid ticks={xTicks} orientation="vertical" length={innerHeight} />
              <AxisY ticks={yTicks} />
              <AxisX ticks={xTicks} y={innerHeight} width={innerWidth} />
              <AxisTitle x={-leftGutter + 10} y={innerHeight / 2} rotate={-90}>
                {yTitle}
              </AxisTitle>
              <AxisTitle x={innerWidth / 2} y={innerHeight + 44}>
                {xTitle}
              </AxisTitle>

              <g style={{ opacity: revealed ? 1 : 0, transition: animated ? "opacity 480ms var(--fd-ease-standard) 120ms" : "none" }}>
                {line ? (
                  <g aria-hidden="true">
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--fd-fg-subtle)" strokeWidth={2} strokeLinecap="round" strokeOpacity={0.8} />
                    <text x={line.x1 + 12} y={line.y1 + 24} textAnchor="start" className="fill-fg-muted text-micro font-medium" style={{ paintOrder: "stroke", stroke: FURNITURE.surface, strokeWidth: 3, strokeLinejoin: "round" }}>
                      {trendLabel}
                    </text>
                  </g>
                ) : null}
                {visible.map((point) => {
                  const { color, shape } = styleFor(point);
                  const dimmed = focusGroup !== null && point.group !== focusGroup;
                  const isHighlight = point.id === highlightId;
                  const isActive = active?.id === point.id;
                  return (
                    <g
                      key={point.id}
                      transform={`translate(${xScale(point.x)} ${yScale(point.y)})`}
                      aria-hidden="true"
                      style={{
                        opacity: dimmed ? 0.2 : 1,
                        transition: "opacity var(--fd-dur-fast) var(--fd-ease-standard)",
                      }}
                    >
                      <path d={markerPath(shape, isActive ? 16 : 14)} fill={FURNITURE.surface} />
                      <path d={markerPath(shape, isActive ? 12 : 10)} fill={isHighlight ? "var(--fd-fg)" : color} fillOpacity={isHighlight ? 1 : 0.92} />
                    </g>
                  );
                })}
                {highlighted ? (
                  <g aria-hidden="true" transform={`translate(${xScale(highlighted.x)} ${yScale(highlighted.y) - 24})`}>
                    <rect x={-(textWidth(highlightLabel) + 18) / 2} y={-11} width={textWidth(highlightLabel) + 18} height={22} rx={11} fill="var(--fd-surface-raised)" stroke="var(--fd-rim-strong)" />
                    <text textAnchor="middle" dy="0.35em" className="fill-fg text-micro font-semibold">
                      {highlightLabel}
                    </text>
                  </g>
                ) : null}
              </g>

              {/* nearest-point layer: the pointer only has to be closest */}
              <rect
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                onPointerMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const px = event.clientX - rect.left;
                  const py = event.clientY - rect.top;
                  let best = -1;
                  let bestDistance = HIT_RADIUS;
                  sorted.forEach((point, index) => {
                    const distance = Math.hypot(xScale(point.x) - px, yScale(point.y) - py);
                    if (distance < bestDistance) {
                      bestDistance = distance;
                      best = index;
                    }
                  });
                  if (best < 0) cursor.clear();
                  else {
                    const point = sorted[best];
                    if (point) cursor.setFromPointer(best, rect.left + xScale(point.x), rect.top + yScale(point.y));
                  }
                }}
                onPointerLeave={cursor.clear}
                onPointerCancel={cursor.clear}
              />
            </g>
          </svg>
        ) : null}
        <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
          {active ? <TooltipBody title={active.label ?? active.id} rows={activeRows} /> : null}
        </ChartTooltip>
        <p className="sr-only" aria-live="polite">
          {cursor.state?.source === "keyboard" && active ? `${active.label ?? active.id}. ${xName ?? xTitle} ${xTip(active.x)}. ${yName ?? yTitle} ${yTip(active.y)}.` : ""}
        </p>
      </div>
    </ChartFrame>
  );
}
