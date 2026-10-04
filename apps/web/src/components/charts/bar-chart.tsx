"use client";

import { useMemo, useRef, useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { AxisX, AxisY, Grid, type AxisTick } from "./axes";
import { ChartFrame, type ChartTableData } from "./chart-frame";
import { ChartLegend, type LegendItem } from "./chart-legend";
import { ChartTooltip, TooltipBody, type TooltipRow } from "./chart-tooltip";
import type { ChartShellProps } from "./cartesian";
import { formatCompact, textWidth, tickCountFor } from "./format";
import { useChartCursor, useMeasure, useReveal, useSeriesVisibility } from "./hooks";
import { FURNITURE, OTHER_COLOR, seriesColor } from "./palette";

export interface BarSeries {
  id: string;
  label: string;
  /** CSS colour. Default: the palette slot of this series in the full list. */
  color?: string;
}

export interface BarDatum {
  /** Category label on the axis. Long labels are shortened on the axis and given in full in the tooltip and the table. */
  label: string;
  /** Value per series id. */
  values: Readonly<Record<string, number>>;
  /** Full name for the tooltip when `label` is abbreviated. */
  title?: string;
}

export interface BarChartProps extends ChartShellProps {
  data: readonly BarDatum[];
  /** Default: one series named "Value" (every bar the same colour; nominal categories never get a value ramp). */
  series?: readonly BarSeries[];
  /** `vertical` columns (time, few categories) or `horizontal` bars (many or long-named categories, rankings). */
  orientation?: "vertical" | "horizontal";
  /** `grouped` side by side, or `stacked` part-to-whole. Only matters with two or more series. */
  mode?: "grouped" | "stacked";
  /** Axis and label format (compact is fine here). */
  valueFormat?: (value: number) => string;
  /** Tooltip and table format (full precision). Default: `valueFormat`. */
  tooltipFormat?: (value: number) => string;
  /** Emphasis form: one category in the accent hue, the rest in the de-emphasis grey (single series only). */
  highlight?: string;
  /** `auto` labels every bar when there are eight or fewer, otherwise only the largest and the highlight. */
  labels?: "auto" | "none" | "all";
  /** Plot height for vertical charts (px). Horizontal charts size themselves from the row count. */
  height?: number;
  /** Heading of the category column in the table view. */
  categoryLabel?: string;
}

const MAX_THICKNESS = 24;
/** Horizontal rows are denser than columns, so their bars run a little thinner. */
const MAX_THICKNESS_HORIZONTAL = 20;
const GAP = 2;
const RADIUS = 4;

/** Bar outline: square at the baseline, `RADIUS` rounded at the data end (the end flips for negative values). */
function barPath(x: number, y: number, w: number, h: number, orientation: "vertical" | "horizontal", positive: boolean, rounded: boolean): string {
  if (w <= 0 || h <= 0) return "";
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  if (orientation === "vertical") {
    return positive
      ? `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}Z`
      : `M${x} ${y}V${y + h - r}a${r} ${r} 0 0 0 ${r} ${r}H${x + w - r}a${r} ${r} 0 0 0 ${r} ${-r}V${y}Z`;
  }
  return positive
    ? `M${x} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x}Z`
    : `M${x + w} ${y}H${x + r}a${r} ${r} 0 0 0 ${-r} ${r}V${y + h - r}a${r} ${r} 0 0 0 ${r} ${r}H${x + w}Z`;
}

function shorten(label: string, maxChars: number): string {
  return label.length <= maxChars ? label : `${label.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

interface Segment {
  seriesId: string;
  color: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string;
}

/**
 * Bar chart, vertical or horizontal, single, grouped or stacked. Marks follow the dataviz spec: at most 24px thick, a 4px
 * rounded data end and a square baseline, a 2px gap between touching marks, a hairline grid, values at the tip only where they
 * fit (never clipped), the hovered category lifting while the rest recede, and bars that grow from the baseline once.
 */
export function BarChart({
  data,
  series: seriesProp,
  orientation = "vertical",
  mode = "grouped",
  valueFormat = formatCompact,
  tooltipFormat,
  highlight,
  labels = "auto",
  height = 260,
  categoryLabel = "Category",
  summary,
  state,
  empty,
  ...shell
}: BarChartProps) {
  const series = useMemo<readonly BarSeries[]>(() => seriesProp ?? [{ id: "value", label: "Value" }], [seriesProp]);
  const { ref: plotRef, width } = useMeasure<HTMLDivElement>();
  const { revealed, animated } = useReveal<HTMLDivElement>(plotRef);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const visibility = useSeriesVisibility(series.map((item) => item.id));
  const tipFormat = tooltipFormat ?? valueFormat;

  const colors = useMemo(() => new Map(series.map((item, index) => [item.id, item.color ?? seriesColor(index)])), [series]);
  const colorOf = (id: string): string => colors.get(id) ?? OTHER_COLOR;
  const hiddenKey = [...visibility.hidden].join("|");
  const visible = useMemo(() => series.filter((item) => !hiddenKey.split("|").includes(item.id)), [series, hiddenKey]);
  const stacked = mode === "stacked" && visible.length > 1;
  const grouped = !stacked && visible.length > 1;
  const horizontal = orientation === "horizontal";
  const compact = width > 0 && width < 420;
  const emphasised = highlight !== undefined && visible.length === 1;

  // ----- geometry -----------------------------------------------------------------------------------------------------------
  const maxLabel = Math.max(0, ...data.map((datum) => datum.label.length));
  const labelGutter = horizontal ? Math.min(compact ? 96 : 150, Math.max(56, maxLabel * 7 + 12)) : 0;
  const rowHeight = grouped ? Math.max(36, visible.length * (MAX_THICKNESS_HORIZONTAL * 0.8 + GAP) + 14) : 36;
  const plotHeight = horizontal ? Math.max(100, data.length * rowHeight) : Math.max(140, height - 46);

  const totalFor = (datum: BarDatum): number => visible.reduce((sum, item) => sum + (datum.values[item.id] ?? 0), 0);

  const extent = useMemo((): [number, number] => {
    let min = 0;
    let max = 0;
    for (const datum of data) {
      if (stacked) max = Math.max(max, visible.reduce((sum, item) => sum + Math.max(datum.values[item.id] ?? 0, 0), 0));
      for (const item of visible) {
        const value = datum.values[item.id] ?? 0;
        if (!stacked) max = Math.max(max, value);
        min = Math.min(min, value);
      }
    }
    return [min, max <= 0 ? 1 : max];
  }, [data, visible, stacked]);

  const tickTarget = Math.min(6, tickCountFor(horizontal ? Math.max(width - labelGutter - 60, 120) : plotHeight, horizontal ? 84 : 46, 3));
  const domain = useMemo(() => scaleLinear().domain(extent).nice(tickTarget).domain() as [number, number], [extent, tickTarget]);
  const tickValues = useMemo(() => scaleLinear().domain(domain).ticks(tickTarget), [domain, tickTarget]);
  const leftGutter = horizontal ? labelGutter : Math.min(76, Math.max(34, Math.max(0, ...tickValues.map((value) => textWidth(valueFormat(value)) * 0.9)) + 16));
  const rightPad = horizontal ? 44 : 16;
  const plotWidth = Math.max(60, width - leftGutter - rightPad);

  const valueScale = useMemo(() => scaleLinear().domain(domain).range(horizontal ? [0, plotWidth] : [plotHeight, 0]), [domain, horizontal, plotWidth, plotHeight]);
  const valueTicks = useMemo<AxisTick[]>(() => tickValues.map((value) => ({ pos: valueScale(value), label: valueFormat(value) })), [tickValues, valueScale, valueFormat]);
  const zeroPos = valueScale(0);

  const bandScale = useMemo(
    () =>
      scaleBand<string>()
        .domain(data.map((datum) => datum.label))
        .range(horizontal ? [0, plotHeight] : [0, plotWidth])
        .paddingInner(horizontal ? 0.28 : 0.34)
        .paddingOuter(horizontal ? 0.12 : 0.2),
    [data, horizontal, plotHeight, plotWidth],
  );
  const band = bandScale.bandwidth();
  const thickness = Math.min(horizontal ? MAX_THICKNESS_HORIZONTAL : MAX_THICKNESS, grouped ? (band * 0.9 - (visible.length - 1) * GAP) / visible.length : band);
  const groupExtent = grouped ? thickness * visible.length + (visible.length - 1) * GAP : thickness;

  const bars = useMemo(
    () =>
      data.map((datum) => {
        const start = (bandScale(datum.label) ?? 0) + (band - groupExtent) / 2;
        const segments: Segment[] = [];
        if (stacked) {
          const positives = visible.filter((item) => (datum.values[item.id] ?? 0) > 0);
          let used = 0;
          positives.forEach((item, index) => {
            const value = datum.values[item.id] ?? 0;
            const from = valueScale(used);
            used += value;
            const to = valueScale(used);
            const gap = index === 0 ? 0 : GAP;
            const isLast = index === positives.length - 1;
            if (horizontal) {
              const x = from + gap;
              const w = Math.max(to - x, 0);
              segments.push({ seriesId: item.id, color: colors.get(item.id) ?? OTHER_COLOR, value, x, y: start, w, h: thickness, path: barPath(x, start, w, thickness, "horizontal", true, isLast) });
            } else {
              const h = Math.max(from - gap - to, 0);
              segments.push({ seriesId: item.id, color: colors.get(item.id) ?? OTHER_COLOR, value, x: start, y: to, w: thickness, h, path: barPath(start, to, thickness, h, "vertical", true, isLast) });
            }
          });
        } else {
          visible.forEach((item, index) => {
            const value = datum.values[item.id] ?? 0;
            const offset = grouped ? index * (thickness + GAP) : 0;
            const position = valueScale(value);
            const positive = value >= 0;
            const color = emphasised && datum.label !== highlight ? OTHER_COLOR : (colors.get(item.id) ?? OTHER_COLOR);
            if (horizontal) {
              const x = positive ? zeroPos : position;
              const w = Math.abs(position - zeroPos);
              segments.push({ seriesId: item.id, color, value, x, y: start + offset, w, h: thickness, path: barPath(x, start + offset, w, thickness, "horizontal", positive, true) });
            } else {
              const top = positive ? position : zeroPos;
              const h = Math.abs(position - zeroPos);
              segments.push({ seriesId: item.id, color, value, x: start + offset, y: top, w: thickness, h, path: barPath(start + offset, top, thickness, h, "vertical", positive, true) });
            }
          });
        }
        return { datum, segments };
      }),
    [data, bandScale, band, groupExtent, stacked, visible, horizontal, zeroPos, valueScale, thickness, grouped, emphasised, highlight, colors],
  );

  const maxTotal = Math.max(0, ...data.map((datum) => (stacked ? totalFor(datum) : Math.max(...visible.map((item) => datum.values[item.id] ?? 0)))));
  const showLabelFor = (datum: BarDatum): boolean => {
    if (labels === "none") return false;
    if (labels === "all") return true;
    if (grouped) return false;
    if (data.length <= 8) return true;
    const value = stacked ? totalFor(datum) : (datum.values[visible[0]?.id ?? ""] ?? 0);
    return value === maxTotal || datum.label === highlight;
  };

  // ----- interaction ----------------------------------------------------------------------------------------------------------
  const cursor = useChartCursor(data.length, (index) => {
    const svg = svgRef.current;
    const datum = data[index];
    if (!svg || !datum) return null;
    const rect = svg.getBoundingClientRect();
    const center = (bandScale(datum.label) ?? 0) + band / 2;
    return horizontal ? { x: rect.left + leftGutter + plotWidth * 0.5, y: rect.top + 8 + center } : { x: rect.left + leftGutter + center, y: rect.top + 40 };
  });
  const activeDatum = cursor.state ? data[cursor.state.index] : undefined;

  const rows: TooltipRow[] = activeDatum
    ? [
        ...visible.map((item) => ({
          id: item.id,
          label: item.label,
          value: tipFormat(activeDatum.values[item.id] ?? 0),
          color: emphasised && activeDatum.label !== highlight ? OTHER_COLOR : colorOf(item.id),
          shape: "rect" as const,
        })),
        ...(stacked ? [{ id: "total", label: "Total", value: tipFormat(totalFor(activeDatum)), muted: true }] : []),
      ]
    : [];
  const liveText = cursor.state?.source === "keyboard" && activeDatum ? `${activeDatum.title ?? activeDatum.label}. ${rows.map((row) => `${typeof row.label === "string" ? row.label : ""} ${typeof row.value === "string" ? row.value : ""}`).join(". ")}` : "";

  const legendItems: LegendItem[] = series.map((item) => ({ id: item.id, label: item.label, color: colorOf(item.id), shape: "rect" }));
  const legendNode = series.length > 1 ? <ChartLegend items={legendItems} hidden={visibility.hidden} onToggle={visibility.toggle} onHover={setFocusId} /> : undefined;

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Chart data",
    columns: [
      { key: "label", label: categoryLabel },
      ...series.map((item) => ({ key: item.id, label: item.label, align: "end" as const })),
      ...(stacked ? [{ key: "total", label: "Total", align: "end" as const }] : []),
    ],
    rows: data.map((datum) => ({
      label: datum.title ?? datum.label,
      ...Object.fromEntries(series.map((item) => [item.id, tipFormat(datum.values[item.id] ?? 0)])),
      ...(stacked ? { total: tipFormat(totalFor(datum)) } : {}),
    })),
  };

  const totalHeight = horizontal ? plotHeight + 8 + 30 : plotHeight + 18 + 28;
  const slot = bandScale.step();
  const maxChars = horizontal ? Math.floor((labelGutter - 12) / 7) : Math.max(3, Math.floor(slot / 6.8));
  const strideLabels = !horizontal && slot < 38 ? Math.ceil(38 / Math.max(slot, 1)) : 1;
  const placeholderHeight = horizontal ? Math.max(120, data.length * 38 + 40) : height;

  const plot = (
    <div ref={plotRef} className="relative w-full" style={{ height: width > 0 ? totalHeight : placeholderHeight }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={totalHeight}
          viewBox={`0 0 ${width} ${totalHeight}`}
          role="group"
          aria-roledescription="chart"
          aria-label={`${typeof shell.title === "string" ? shell.title : "Bar chart"}. Use the arrow keys to move through the bars.`}
          tabIndex={0}
          className="block touch-pan-y overflow-visible rounded-md select-none"
          onKeyDown={cursor.keyboard.onKeyDown}
          onFocus={cursor.keyboard.onFocus}
          onBlur={cursor.keyboard.onBlur}
        >
          <g transform={`translate(${leftGutter} ${horizontal ? 8 : 18})`}>
            {horizontal ? (
              <>
                <Grid ticks={valueTicks} orientation="vertical" length={plotHeight} />
                <AxisX ticks={valueTicks} y={plotHeight} width={plotWidth} rule={false} />
                <line x1={zeroPos} x2={zeroPos} y1={0} y2={plotHeight} stroke={FURNITURE.axis} shapeRendering="crispEdges" />
              </>
            ) : (
              <>
                <Grid ticks={valueTicks} orientation="horizontal" length={plotWidth} />
                <AxisY ticks={valueTicks} />
                <line x1={0} x2={plotWidth} y1={zeroPos} y2={zeroPos} stroke={FURNITURE.axis} shapeRendering="crispEdges" />
              </>
            )}

            {bars.map(({ datum, segments }, categoryIndex) => {
              const receded = cursor.state !== null && cursor.state.index !== categoryIndex;
              const labelText = valueFormat(stacked ? totalFor(datum) : (datum.values[visible[0]?.id ?? ""] ?? 0));
              const tip = segments.reduce<Segment | null>((best, segment) => {
                if (!best) return segment;
                if (horizontal) return segment.x + segment.w > best.x + best.w ? segment : best;
                return segment.y < best.y ? segment : best;
              }, null);
              const delay = Math.min(categoryIndex, 8) * 40;
              return (
                <g key={datum.label} style={{ opacity: receded ? 0.5 : 1, transition: "opacity var(--fd-dur-fast) var(--fd-ease-standard)" }}>
                  {segments.map((segment) => (
                    <path
                      key={segment.seriesId}
                      d={segment.path}
                      fill={segment.color}
                      fillOpacity={segment.color === OTHER_COLOR ? 0.4 : 1}
                      style={{
                        opacity: focusId !== null && focusId !== segment.seriesId ? 0.25 : 1,
                        transformBox: "fill-box",
                        transformOrigin: horizontal ? (segment.value >= 0 ? "0% 50%" : "100% 50%") : segment.value >= 0 ? "50% 100%" : "50% 0%",
                        transform: revealed ? "none" : horizontal ? "scaleX(0)" : "scaleY(0)",
                        transition: animated
                          ? `transform 620ms var(--fd-ease-emphasized) ${delay}ms, opacity var(--fd-dur-fast) var(--fd-ease-standard)`
                          : "opacity var(--fd-dur-fast) var(--fd-ease-standard)",
                      }}
                    />
                  ))}
                  {tip && showLabelFor(datum) && revealed ? (
                    horizontal ? (
                      <text x={tip.x + tip.w + 8} y={tip.y + tip.h / 2} dy="0.35em" className="fill-fg-muted text-micro font-semibold tabular-nums" aria-hidden="true">
                        {labelText}
                      </text>
                    ) : // a label that does not fit above its column is dropped (the tooltip and the table carry it), never clipped
                    textWidth(labelText) + 6 <= band + 10 ? (
                      <text x={tip.x + tip.w / 2} y={tip.y - 7} textAnchor="middle" className="fill-fg-muted text-micro font-semibold tabular-nums" aria-hidden="true">
                        {labelText}
                      </text>
                    ) : null
                  ) : null}
                </g>
              );
            })}

            <g aria-hidden="true">
              {data.map((datum, index) => {
                const center = (bandScale(datum.label) ?? 0) + band / 2;
                if (horizontal) {
                  return (
                    <text key={datum.label} x={-10} y={center} dy="0.35em" textAnchor="end" className="fill-fg-muted text-micro font-medium">
                      {shorten(datum.label, maxChars)}
                    </text>
                  );
                }
                if (index % strideLabels !== 0) return null;
                return (
                  <text key={datum.label} x={center} y={plotHeight + 20} textAnchor="middle" className="fill-fg-subtle text-micro">
                    {shorten(datum.label, maxChars)}
                  </text>
                );
              })}
            </g>

            {/* hit layer: one full-band rect per category (the target is bigger than the mark) */}
            {data.map((datum, index) => {
              const start = bandScale(datum.label) ?? 0;
              const pad = (bandScale.step() - band) / 2;
              return (
                <rect
                  key={datum.label}
                  x={horizontal ? 0 : start - pad}
                  y={horizontal ? start - pad : 0}
                  width={horizontal ? plotWidth + rightPad : band + pad * 2}
                  height={horizontal ? band + pad * 2 : plotHeight}
                  fill="transparent"
                  onPointerMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const tipSegment = bars[index]?.segments.at(-1);
                    const anchorX = horizontal ? rect.left + Math.min(plotWidth * 0.6, (tipSegment?.x ?? 0) + (tipSegment?.w ?? 0)) : rect.left + rect.width / 2;
                    cursor.setFromPointer(index, anchorX, event.clientY);
                  }}
                  onPointerLeave={cursor.clear}
                  onPointerCancel={cursor.clear}
                />
              );
            })}
          </g>
        </svg>
      ) : null}
      <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
        {activeDatum ? <TooltipBody title={activeDatum.title ?? activeDatum.label} rows={rows} /> : null}
      </ChartTooltip>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </div>
  );

  return (
    <ChartFrame
      summary={summary}
      state={state ?? (data.length === 0 ? "empty" : "ready")}
      empty={empty ?? { title: "Nothing to compare yet", description: "Bars appear as soon as there is a result to show." }}
      legend={legendNode}
      table={table}
      minHeight={horizontal ? 200 : height}
      {...shell}
    >
      {plot}
    </ChartFrame>
  );
}
