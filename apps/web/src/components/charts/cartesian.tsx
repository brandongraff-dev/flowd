"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { area as d3Area, curveLinear, curveMonotoneX, curveStepAfter, line as d3Line, stack as d3Stack } from "d3-shape";
import { scaleLinear, scalePoint, scaleSqrt, scaleTime, type ScaleContinuousNumeric } from "d3-scale";
import { ease } from "@/lib/motion";
import { AxisTitle, AxisX, AxisY, Grid, type AxisTick } from "./axes";
import { markerPath } from "./chart-key";
import { ChartFrame, type ChartFrameProps, type ChartTableData } from "./chart-frame";
import { ChartLegend, type LegendItem } from "./chart-legend";
import { ChartTooltip, TooltipBody, type TooltipRow } from "./chart-tooltip";
import { formatCompact, formatX, formatXLong, slug, textWidth, tickCountFor, xKey, type XValue } from "./format";
import { useChartCursor, useMeasure, useReveal, useSeriesVisibility } from "./hooks";
import { FURNITURE, markerShape, seriesColor } from "./palette";

export type { XValue } from "./format";

/** One datum. `estimated` marks modelled values (drawn dotted, labelled "Estimated" in the legend and tooltip). */
export interface XYPoint {
  x: XValue;
  y: number;
  estimated?: boolean;
}

export interface XYSeries {
  id: string;
  label: string;
  /** CSS colour. Default: the palette slot of this series' position in the full list (so colours are stable under filtering). */
  color?: string;
  points: readonly XYPoint[];
}

/** A shaded range (p25 to p75). Draws a wash behind the lines; the tooltip lists both edges. */
export interface XYBand {
  id: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  color?: string;
  points: readonly { x: XValue; low: number; high: number }[];
}

/** A horizontal rule at a value (a goal, a break-even). Solid, one hairline, labelled at the right edge. */
export interface XYReference {
  id?: string;
  y: number;
  label: string;
  tone?: "neutral" | "good" | "bad";
}

/** A labelled point ("Your bounty: $2.40", "Payback day 41"). */
export interface XYMarker {
  id: string;
  x: XValue;
  y: number;
  label: string;
  /** Dot colour (a series colour when the marker belongs to one series). Default: ink. */
  color?: string;
}

export type CurveName = "monotone" | "linear" | "step";

const CURVES = { monotone: curveMonotoneX, linear: curveLinear, step: curveStepAfter } as const;

/** Props shared by every chart that lives in a `ChartFrame`. */
export type ChartShellProps = Pick<ChartFrameProps, "title" | "subtitle" | "summary" | "actions" | "footer" | "bare" | "state" | "empty" | "stale" | "className" | "headingAs">;

export interface CartesianChartProps extends ChartShellProps {
  variant: "line" | "area" | "stacked";
  series: readonly XYSeries[];
  band?: XYBand;
  references?: readonly XYReference[];
  markers?: readonly XYMarker[];
  /** Axis tick label. Default: dates as "Oct 3", numbers compact. */
  xFormat?: (x: XValue) => string;
  /** Tooltip title. Default: dates as "Fri, Oct 3, 2026". */
  xTooltipFormat?: (x: XValue) => string;
  yFormat?: (value: number) => string;
  /** Tooltip value. Default: `yFormat`. Use the full-precision form here ("$1,284.60") and the compact one on the axis. */
  yTooltipFormat?: (value: number) => string;
  /** Force the y domain. */
  yDomain?: readonly [number, number];
  /** Include zero in the y domain. Default: always for area and stacked, off for lines (the line is padded instead). */
  zero?: boolean;
  /** Explicit x ticks (retention days 0, 7, 30, 90). */
  xTicks?: readonly XValue[];
  /** Numeric x scale. `sqrt` spreads the early days of a retention or payback curve (D0 to D7) instead of cramming them against the axis. */
  xScale?: "linear" | "sqrt";
  xAxisTitle?: string;
  yAxisTitle?: string;
  curve?: CurveName;
  /** Total height including the x axis (px). */
  height?: number;
  /** Name the lines at their right end when they separate cleanly; the legend always carries identity regardless. */
  endLabels?: boolean;
  /** Redundant marker shapes (circle, square, triangle, diamond) per series, for colour-blind readers. */
  shapes?: boolean;
  /** Legend. Default: shown for two or more series, hidden for one (the title names it). */
  legend?: boolean;
  /** Draw a point at every datum. Default: only the end dot and the hover point. */
  dots?: boolean;
  /** Heading of the x column in the table view. */
  xLabel?: string;
}

interface Pt {
  px: number;
  py: number;
  estimated: boolean;
}

interface Layer {
  item: XYSeries;
  area: string;
  line: string;
  dash: string;
  tops: Pt[];
}

interface XModel {
  keys: XValue[];
  keyPos: number[];
  pos: (x: XValue) => number;
  ticks: (count: number, format: (x: XValue) => string, explicit?: readonly XValue[]) => AxisTick[];
  nearest: (px: number) => number;
}

/** Unique x values: dates and numbers ascending, categories in first-seen order. Independent of the pixel width. */
function orderedKeys(values: readonly XValue[]): XValue[] {
  const first = values[0];
  if (first === undefined) return [];
  if (first instanceof Date) {
    return [...new Map((values as Date[]).map((date) => [date.getTime(), date])).values()].sort((a, b) => a.getTime() - b.getTime());
  }
  if (typeof first === "number") return [...new Set(values as number[])].sort((a, b) => a - b);
  return [...new Set(values as string[])];
}

function nearestIndex(positions: readonly number[], px: number): number {
  if (positions.length < 2) return 0;
  let low = 0;
  let high = positions.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((positions[mid] ?? 0) <= px) low = mid;
    else high = mid;
  }
  return Math.abs((positions[low] ?? 0) - px) <= Math.abs((positions[high] ?? 0) - px) ? low : high;
}

function strideTicks(keys: readonly XValue[], keyPos: readonly number[], count: number, format: (x: XValue) => string): AxisTick[] {
  const step = Math.max(1, Math.ceil(keys.length / Math.max(count, 1)));
  const ticks: AxisTick[] = [];
  for (let index = 0; index < keys.length; index += step) {
    const key = keys[index];
    if (key !== undefined) ticks.push({ pos: keyPos[index] ?? 0, label: format(key) });
  }
  return ticks;
}

function buildXModel(keys: readonly XValue[], width: number, xScale: "linear" | "sqrt"): XModel | null {
  const first = keys[0];
  if (first === undefined) return null;
  const list = [...keys];

  if (first instanceof Date) {
    const dates = list as Date[];
    const scale = scaleTime()
      .domain([dates[0] as Date, dates[dates.length - 1] as Date])
      .range([0, width]);
    const keyPos = dates.map((date) => scale(date));
    return {
      keys: list,
      keyPos,
      pos: (x) => scale(x as Date),
      nearest: (px) => nearestIndex(keyPos, px),
      ticks: (count, format, explicit) => {
        if (explicit) return explicit.map((value) => ({ pos: scale(value as Date), label: format(value) }));
        if (dates.length <= count * 1.6) return strideTicks(list, keyPos, count, format);
        return scale.ticks(count).map((date) => ({ pos: scale(date), label: format(date) }));
      },
    };
  }

  if (typeof first === "number") {
    const numbers = list as number[];
    const min = numbers[0] ?? 0;
    const max = numbers[numbers.length - 1] ?? 1;
    const scale: ScaleContinuousNumeric<number, number> = (xScale === "sqrt" ? scaleSqrt() : scaleLinear())
      .domain([min, max === min ? min + 1 : max])
      .range([0, width]);
    const keyPos = numbers.map((value) => scale(value));
    return {
      keys: list,
      keyPos,
      pos: (x) => scale(x as number),
      nearest: (px) => nearestIndex(keyPos, px),
      ticks: (count, format, explicit) =>
        (explicit ?? scale.ticks(count)).map((value) => ({ pos: scale(value as number), label: format(value) })),
    };
  }

  const labels = list as string[];
  const scale = scalePoint<string>().domain(labels).range([0, width]).padding(0);
  const keyPos = labels.map((value) => scale(value) ?? 0);
  return {
    keys: list,
    keyPos,
    pos: (x) => scale(x as string) ?? 0,
    nearest: (px) => nearestIndex(keyPos, px),
    ticks: (count, format, explicit) =>
      explicit ? explicit.map((value) => ({ pos: scale(value as string) ?? 0, label: format(value) })) : strideTicks(list, keyPos, count, format),
  };
}

function toPoints(points: readonly XYPoint[], x: XModel, y: (value: number) => number): Pt[] {
  return points
    .filter((point) => Number.isFinite(point.y))
    .map((point) => ({ px: x.pos(point.x), py: y(point.y), estimated: Boolean(point.estimated) }))
    .sort((a, b) => a.px - b.px);
}

function splitEstimated(points: readonly Pt[]): { solid: Pt[]; estimated: Pt[] } {
  const firstEstimated = points.findIndex((point) => point.estimated);
  if (firstEstimated < 0) return { solid: [...points], estimated: [] };
  if (firstEstimated === 0) return { solid: [], estimated: [...points] };
  return { solid: points.slice(0, firstEstimated), estimated: points.slice(firstEstimated - 1) };
}

const REFERENCE_STROKE = {
  neutral: "var(--fd-fg-subtle)",
  good: "var(--fd-mint)",
  bad: "var(--fd-rose)",
} as const;

const HALO = { paintOrder: "stroke", stroke: FURNITURE.surface, strokeWidth: 3, strokeLinejoin: "round" } as const;

/**
 * The engine behind AreaChart, LineChart, RangeBand and RetentionCurve: one set of axes, hairline grid, a hover crosshair with
 * a snapped tooltip that lists every series, a keyboard cursor (arrows, Home/End, Escape), a toggle-to-isolate legend,
 * estimated segments, reference rules, labelled markers, a left-to-right draw-in that plays once (never under reduced
 * motion), and the Chart / Table switch. Use the thin wrappers in feature code.
 */
export function CartesianChart({
  variant,
  series,
  band,
  references = [],
  markers = [],
  xFormat = formatX,
  xTooltipFormat = formatXLong,
  yFormat = formatCompact,
  yTooltipFormat,
  yDomain,
  zero,
  xTicks,
  xScale = "linear",
  xAxisTitle,
  yAxisTitle,
  curve = "monotone",
  height = 260,
  endLabels = true,
  shapes = false,
  legend,
  dots = false,
  xLabel = "Date",
  summary,
  state,
  empty,
  ...shell
}: CartesianChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { ref: plotRef, width } = useMeasure<HTMLDivElement>();
  const { revealed, animated } = useReveal<HTMLDivElement>(plotRef);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const ids = useMemo(() => series.map((item) => item.id), [series]);
  const visibility = useSeriesVisibility(ids);
  const tooltipFormat = yTooltipFormat ?? yFormat;

  const colorOf = (item: XYSeries): string => item.color ?? seriesColor(series.indexOf(item));
  const shapeOf = (item: XYSeries) => (shapes ? markerShape(series.indexOf(item)) : "circle");
  const hiddenKey = [...visibility.hidden].join("|");
  const visible = useMemo(() => series.filter((item) => !hiddenKey.split("|").includes(item.id)), [series, hiddenKey]);
  const hasEstimated = series.some((item) => item.points.some((point) => point.estimated));
  const showLegend = legend ?? (series.length > 1 || Boolean(band) || hasEstimated);
  const dataEnough = series.some((item) => item.points.length >= 2);

  // ----- x keys and stacked rows (independent of the pixel width) ---------------------------------------------------------
  const keys = useMemo(() => {
    const values: XValue[] = [];
    for (const item of series) for (const point of item.points) values.push(point.x);
    for (const point of band?.points ?? []) values.push(point.x);
    for (const marker of markers) values.push(marker.x);
    return orderedKeys(values);
  }, [series, band, markers]);

  const lookups = useMemo(() => {
    const map = new Map<string, Map<number | string, XYPoint>>();
    for (const item of series) map.set(item.id, new Map(item.points.map((point) => [xKey(point.x), point])));
    return map;
  }, [series]);
  const bandLookup = useMemo(() => new Map((band?.points ?? []).map((point) => [xKey(point.x), point])), [band]);

  const stackedRows = useMemo(() => {
    if (variant !== "stacked") return [] as Record<string, number>[];
    return keys.map((key) => {
      const row: Record<string, number> = {};
      for (const item of visible) row[item.id] = lookups.get(item.id)?.get(xKey(key))?.y ?? 0;
      return row;
    });
  }, [variant, keys, visible, lookups]);

  // ----- scales -----------------------------------------------------------------------------------------------------------
  const compact = width > 0 && width < 420;
  const innerHeight = Math.max(120, height - 44 - (xAxisTitle ? 18 : 0));

  const yExtent = useMemo((): [number, number] => {
    if (yDomain) return [yDomain[0], yDomain[1]];
    let min = Infinity;
    let max = -Infinity;
    if (variant === "stacked") {
      for (const row of stackedRows) {
        max = Math.max(max, Object.values(row).reduce((sum, value) => sum + value, 0));
        min = Math.min(min, 0);
      }
    } else {
      for (const item of visible) {
        for (const point of item.points) {
          if (!Number.isFinite(point.y)) continue;
          min = Math.min(min, point.y);
          max = Math.max(max, point.y);
        }
      }
      for (const point of band?.points ?? []) {
        min = Math.min(min, point.low);
        max = Math.max(max, point.high);
      }
    }
    for (const reference of references) {
      min = Math.min(min, reference.y);
      max = Math.max(max, reference.y);
    }
    for (const marker of markers) {
      min = Math.min(min, marker.y);
      max = Math.max(max, marker.y);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (zero ?? variant !== "line") {
      min = Math.min(min, 0);
    } else {
      const pad = (max - min || Math.abs(max) || 1) * 0.1;
      min -= pad;
      max += pad;
    }
    if (max === min) max = min + 1;
    return [min, max];
  }, [yDomain, variant, stackedRows, visible, band, references, markers, zero]);

  const tickTarget = Math.min(6, tickCountFor(innerHeight, 46, 3));
  const y = useMemo(() => scaleLinear().domain(yExtent).nice(tickTarget).range([innerHeight, 0]), [yExtent, tickTarget, innerHeight]);
  const yTicks = useMemo<AxisTick[]>(() => y.ticks(tickTarget).map((value) => ({ pos: y(value), label: yFormat(value) })), [y, tickTarget, yFormat]);
  const leftGutter = Math.min(80, Math.max(34, Math.max(0, ...yTicks.map((tick) => textWidth(tick.label, 12) * 0.9)) + 16)) + (yAxisTitle ? 16 : 0);

  const wantNames = endLabels && !compact && visible.length >= 2 && visible.length <= 4 && variant === "line";
  const nameWidth = Math.min(116, Math.max(0, ...visible.map((item) => textWidth(item.label, 12))) + 20);
  const rightGutter = wantNames ? nameWidth : compact ? 12 : 20;
  const innerWidth = Math.max(60, width - leftGutter - rightGutter);

  const xModel = useMemo(() => buildXModel(keys, innerWidth, xScale), [keys, innerWidth, xScale]);
  const xTickList = useMemo(
    () => (xModel ? xModel.ticks(Math.max(2, Math.floor(innerWidth / (compact ? 68 : 92))), xFormat, xTicks) : []),
    [xModel, innerWidth, compact, xFormat, xTicks],
  );

  // ----- geometry -----------------------------------------------------------------------------------------------------------
  const geometry = useMemo(() => {
    if (!xModel) return null;
    const curveFactory = CURVES[curve];
    const lineGen = d3Line<Pt>()
      .x((point) => point.px)
      .y((point) => point.py)
      .curve(curveFactory);
    const baseline = y(Math.max(y.domain()[0] ?? 0, 0));

    if (variant === "stacked") {
      const stacked = d3Stack<Record<string, number>, string>()
        .keys(visible.map((item) => item.id))
        .value((row, key) => row[key] ?? 0)(stackedRows);
      const layers: Layer[] = stacked.map((layer, layerIndex) => {
        const tops: Pt[] = layer.map((entry, index) => ({ px: xModel.keyPos[index] ?? 0, py: y(entry[1]), estimated: false }));
        const bottoms: Pt[] = layer.map((entry, index) => ({ px: xModel.keyPos[index] ?? 0, py: y(entry[0]), estimated: false }));
        const stackArea = d3Area<Pt>()
          .x((point) => point.px)
          .y0((_, index) => bottoms[index]?.py ?? baseline)
          .y1((point) => point.py)
          .curve(curveFactory);
        return { item: visible[layerIndex] as XYSeries, area: stackArea(tops) ?? "", line: lineGen(tops) ?? "", dash: "", tops };
      });
      return { layers, bandPath: "" };
    }

    const areaGen = d3Area<Pt>()
      .x((point) => point.px)
      .y0(baseline)
      .y1((point) => point.py)
      .curve(curveFactory);
    const layers: Layer[] = visible.map((item) => {
      const tops = toPoints(item.points, xModel, y);
      const { solid, estimated } = splitEstimated(tops);
      return {
        item,
        area: variant === "area" ? (areaGen(tops) ?? "") : "",
        line: lineGen(solid) ?? "",
        dash: lineGen(estimated) ?? "",
        tops,
      };
    });

    let bandPath = "";
    if (band) {
      const sorted = [...band.points].sort((a, b) => xModel.pos(a.x) - xModel.pos(b.x));
      bandPath =
        d3Area<(typeof sorted)[number]>()
          .x((point) => xModel.pos(point.x))
          .y0((point) => y(point.low))
          .y1((point) => y(point.high))
          .curve(curveFactory)(sorted) ?? "";
    }
    return { layers, bandPath };
  }, [xModel, curve, y, variant, visible, stackedRows, band]);

  // ----- interaction --------------------------------------------------------------------------------------------------------
  const cursor = useChartCursor(keys.length, (index) => {
    const svg = svgRef.current;
    if (!svg || !xModel) return null;
    const rect = svg.getBoundingClientRect();
    return { x: rect.left + leftGutter + (xModel.keyPos[index] ?? 0), y: rect.top + 28 };
  });
  const activeKey = cursor.state ? keys[cursor.state.index] : undefined;
  const activeId = activeKey === undefined ? undefined : xKey(activeKey);

  const tooltipRows: TooltipRow[] = [];
  let tooltipFooter: ReactNode = null;
  if (activeKey !== undefined && activeId !== undefined) {
    const bandPoint = bandLookup.get(activeId);
    if (band && bandPoint) tooltipRows.push({ id: `${band.id}-high`, label: band.highLabel, value: tooltipFormat(bandPoint.high), color: band.color ?? seriesColor(0), shape: "rect", muted: true });
    for (const item of visible) {
      const point = lookups.get(item.id)?.get(activeId);
      if (!point) continue;
      tooltipRows.push({
        id: item.id,
        label: item.label,
        value: tooltipFormat(point.y),
        color: colorOf(item),
        shape: shapes ? shapeOf(item) : variant === "line" ? "line" : "rect",
      });
      if (point.estimated) tooltipFooter = "Estimated: modelled, not tracked.";
    }
    if (band && bandPoint) tooltipRows.push({ id: `${band.id}-low`, label: band.lowLabel, value: tooltipFormat(bandPoint.low), color: band.color ?? seriesColor(0), shape: "rect", muted: true });
    if (variant === "stacked" && visible.length > 1) {
      const total = visible.reduce((sum, item) => sum + (lookups.get(item.id)?.get(activeId)?.y ?? 0), 0);
      tooltipRows.push({ id: "total", label: "Total", value: tooltipFormat(total), muted: true });
    }
  }
  const liveText =
    cursor.state?.source === "keyboard" && activeKey !== undefined
      ? `${xTooltipFormat(activeKey)}. ${tooltipRows.map((row) => `${typeof row.label === "string" ? row.label : ""} ${typeof row.value === "string" ? row.value : ""}`).join(". ")}`
      : "";

  // ----- legend + table ------------------------------------------------------------------------------------------------------
  const legendItems: LegendItem[] = [
    ...series.map((item) => ({
      id: item.id,
      label: item.label,
      color: colorOf(item),
      shape: shapes ? shapeOf(item) : variant === "line" ? ("line" as const) : ("rect" as const),
    })),
    ...(band ? [{ id: band.id, label: band.label, color: band.color ?? seriesColor(0), shape: "rect" as const }] : []),
  ];
  const legendNode = showLegend ? (
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <ChartLegend
        items={legendItems}
        hidden={visibility.hidden}
        onToggle={(id) => {
          if (!band || id !== band.id) visibility.toggle(id);
        }}
        onHover={setFocusId}
      />
      {hasEstimated ? <ChartLegend aria-label="Line styles" items={[{ id: "estimated", label: "Estimated", color: "var(--fd-fg-subtle)", shape: "dashed" }]} /> : null}
    </div>
  ) : undefined;

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Chart data",
    columns: [
      { key: "x", label: xLabel },
      ...series.map((item) => ({ key: item.id, label: item.label, align: "end" as const })),
      ...(band
        ? [
            { key: `${band.id}-low`, label: band.lowLabel, align: "end" as const },
            { key: `${band.id}-high`, label: band.highLabel, align: "end" as const },
          ]
        : []),
    ],
    rows: keys.map((key) => {
      const id = xKey(key);
      const row: Record<string, ReactNode> = { x: xTooltipFormat(key) };
      for (const item of series) {
        const point = lookups.get(item.id)?.get(id);
        row[item.id] = point ? `${tooltipFormat(point.y)}${point.estimated ? " (est.)" : ""}` : "";
      }
      if (band) {
        const point = bandLookup.get(id);
        row[`${band.id}-low`] = point ? tooltipFormat(point.low) : "";
        row[`${band.id}-high`] = point ? tooltipFormat(point.high) : "";
      }
      return row;
    }),
  };

  // ----- end marks ----------------------------------------------------------------------------------------------------------
  const layers = geometry?.layers ?? [];
  const nameLabels = (() => {
    if (!wantNames) return [] as { id: string; y: number; text: string }[];
    const raw = layers
      .map((layer) => {
        const last = layer.tops.at(-1);
        return last ? { id: layer.item.id, y: last.py, text: layer.item.label } : null;
      })
      .filter((entry): entry is { id: string; y: number; text: string } => entry !== null)
      .sort((a, b) => a.y - b.y);
    // Labels that would collide are dropped, never nudged apart: a nudged label detaches from its line and reads as noise.
    return raw.every((entry, index) => index === 0 || entry.y - (raw[index - 1]?.y ?? 0) >= 15) ? raw : [];
  })();
  const soloLast = visible.length === 1 && variant !== "stacked" && !compact ? layers[0]?.tops.at(-1) : undefined;
  const soloValue = soloLast ? tooltipFormat(visible[0]?.points.at(-1)?.y ?? 0) : "";

  const clipId = `${uid}-clip`;
  const washId = (id: string): string => `${uid}-wash-${slug(id)}`;
  const effectiveState = state ?? (dataEnough ? "ready" : "empty");

  const plot = (
    <div ref={plotRef} className="relative w-full" style={{ height }}>
      {width > 0 && xModel && geometry ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-roledescription="chart"
          aria-label={`${typeof shell.title === "string" ? shell.title : "Chart"}. Use the arrow keys to move through the data.`}
          tabIndex={0}
          className="block touch-pan-y overflow-visible rounded-md select-none"
          onKeyDown={cursor.keyboard.onKeyDown}
          onFocus={cursor.keyboard.onFocus}
          onBlur={cursor.keyboard.onBlur}
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                x={-12}
                y={-10}
                height={innerHeight + 24}
                initial={false}
                animate={{ width: revealed ? innerWidth + 36 : 0 }}
                transition={animated ? { duration: 0.95, ease: ease.out } : { duration: 0 }}
              />
            </clipPath>
            {visible.map((item) => (
              <linearGradient key={item.id} id={washId(item.id)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colorOf(item)} stopOpacity={variant === "stacked" ? 0.34 : 0.2} />
                <stop offset="1" stopColor={colorOf(item)} stopOpacity={variant === "stacked" ? 0.12 : 0.02} />
              </linearGradient>
            ))}
          </defs>

          <g transform={`translate(${leftGutter} 14)`}>
            <Grid ticks={yTicks} orientation="horizontal" length={innerWidth} />
            <AxisY ticks={yTicks} />
            <AxisX ticks={xTickList} y={innerHeight} width={innerWidth} />
            {yAxisTitle ? (
              <AxisTitle x={-leftGutter + 10} y={innerHeight / 2} rotate={-90}>
                {yAxisTitle}
              </AxisTitle>
            ) : null}
            {xAxisTitle ? (
              <AxisTitle x={innerWidth / 2} y={innerHeight + 44}>
                {xAxisTitle}
              </AxisTitle>
            ) : null}

            <g clipPath={`url(#${clipId})`}>
              {geometry.bandPath ? <path d={geometry.bandPath} fill={band?.color ?? seriesColor(0)} fillOpacity={0.14} /> : null}
              {layers.map((layer) => {
                const color = colorOf(layer.item);
                const dimmed = focusId !== null && focusId !== layer.item.id;
                return (
                  <g key={layer.item.id} style={{ opacity: dimmed ? 0.18 : 1, transition: "opacity var(--fd-dur-fast) var(--fd-ease-standard)" }}>
                    {layer.area ? <path d={layer.area} fill={`url(#${washId(layer.item.id)})`} stroke="none" /> : null}
                    {layer.line ? <path d={layer.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    {layer.dash ? <path d={layer.dash} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 6" /> : null}
                    {dots && variant !== "stacked"
                      ? layer.tops.map((point, index) => <circle key={index} cx={point.px} cy={point.py} r={3.5} fill={color} stroke={FURNITURE.surface} strokeWidth={2} />)
                      : null}
                  </g>
                );
              })}
            </g>

            {references.map((reference) => {
              const ry = y(reference.y);
              return (
                <g key={reference.id ?? reference.label} aria-hidden="true">
                  <line x1={0} x2={innerWidth} y1={ry} y2={ry} stroke={REFERENCE_STROKE[reference.tone ?? "neutral"]} strokeWidth={1} strokeOpacity={0.75} shapeRendering="crispEdges" />
                  <text x={innerWidth - 2} y={ry - 7} textAnchor="end" className="fill-fg-muted text-micro font-medium" style={HALO}>
                    {reference.label}
                  </text>
                </g>
              );
            })}

            {/* end dots, names and the single-series value appear once the line has drawn */}
            <g aria-hidden="true" style={{ opacity: revealed ? 1 : 0, transition: animated ? "opacity 360ms var(--fd-ease-standard) 780ms" : "none" }}>
              {variant !== "stacked"
                ? layers.map((layer) => {
                    const last = layer.tops.at(-1);
                    if (!last) return null;
                    const shape = shapeOf(layer.item);
                    return (
                      <g key={layer.item.id} transform={`translate(${last.px} ${last.py})`} style={{ opacity: focusId !== null && focusId !== layer.item.id ? 0.18 : 1 }}>
                        <path d={markerPath(shape, 13)} fill={FURNITURE.surface} />
                        <path d={markerPath(shape, 9)} fill={colorOf(layer.item)} />
                      </g>
                    );
                  })
                : null}
              {nameLabels.map((label) => (
                <text key={label.id} x={innerWidth + 12} y={label.y} dy="0.35em" className="fill-fg-muted text-micro font-medium">
                  {label.text}
                </text>
              ))}
              {soloLast ? (
                <text x={Math.min(soloLast.px + 2, innerWidth)} y={soloLast.py - 14} textAnchor="end" className="fill-fg font-display text-[13px] font-bold tabular-nums" style={HALO}>
                  {soloValue}
                </text>
              ) : null}
            </g>

            {markers.map((marker, markerIndex) => {
              const mx = xModel.pos(marker.x);
              const my = y(marker.y);
              const labelWidth = textWidth(marker.label, 12) + 18;
              const lx = Math.min(Math.max(mx, labelWidth / 2), innerWidth - labelWidth / 2);
              // alternate above / below so neighbouring labels never sit on top of each other
              const offset = markerIndex % 2 === 0 ? -26 : 26;
              return (
                <g key={marker.id} aria-hidden="true" style={{ opacity: revealed ? 1 : 0, transition: animated ? "opacity 360ms var(--fd-ease-standard) 900ms" : "none" }}>
                  <circle cx={mx} cy={my} r={7} fill={FURNITURE.surface} />
                  <circle cx={mx} cy={my} r={5} fill={marker.color ?? "var(--fd-fg)"} />
                  <g transform={`translate(${lx} ${my + offset})`}>
                    <rect x={-labelWidth / 2} y={-11} width={labelWidth} height={22} rx={11} fill="var(--fd-surface-raised)" stroke="var(--fd-rim-strong)" />
                    <text textAnchor="middle" dy="0.35em" className="fill-fg text-micro font-semibold">
                      {marker.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* hover layer: a snapped crosshair and a ringed mark per series */}
            {cursor.state && activeKey !== undefined ? (
              <g aria-hidden="true" pointerEvents="none">
                <line x1={xModel.pos(activeKey)} x2={xModel.pos(activeKey)} y1={0} y2={innerHeight} stroke={FURNITURE.axis} strokeWidth={1} shapeRendering="crispEdges" />
                {layers.map((layer) => {
                  const point = lookups.get(layer.item.id)?.get(activeId ?? "");
                  if (!point) return null;
                  const cy = variant === "stacked" ? (layer.tops[cursor.state?.index ?? 0]?.py ?? 0) : y(point.y);
                  const shape = shapeOf(layer.item);
                  return (
                    <g key={layer.item.id} transform={`translate(${xModel.pos(activeKey)} ${cy})`}>
                      <path d={markerPath(shape, 14)} fill={FURNITURE.surface} />
                      <path d={markerPath(shape, 10)} fill={colorOf(layer.item)} />
                    </g>
                  );
                })}
              </g>
            ) : null}

            <rect
              x={0}
              y={0}
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const index = xModel.nearest(event.clientX - rect.left);
                cursor.setFromPointer(index, rect.left + (xModel.keyPos[index] ?? 0), event.clientY);
              }}
              onPointerLeave={cursor.clear}
              onPointerCancel={cursor.clear}
            />
          </g>
        </svg>
      ) : null}
      <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
        {activeKey !== undefined ? <TooltipBody title={xTooltipFormat(activeKey)} rows={tooltipRows} footer={tooltipFooter} /> : null}
      </ChartTooltip>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </div>
  );

  return (
    <ChartFrame
      summary={summary}
      state={effectiveState}
      empty={empty ?? { title: "Not enough data to plot yet", description: "A line needs at least two points. It fills in as results come in." }}
      legend={legendNode}
      table={table}
      minHeight={height}
      {...shell}
    >
      {plot}
    </ChartFrame>
  );
}
