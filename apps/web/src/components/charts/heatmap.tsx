"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChartShellProps } from "./cartesian";
import { ChartFrame, type ChartTableData } from "./chart-frame";
import { ScaleLegend } from "./chart-legend";
import { ChartTooltip, TooltipBody } from "./chart-tooltip";
import { formatCompact, textWidth } from "./format";
import { useChartCursor, useMeasure, useReveal } from "./hooks";
import { FURNITURE, SEQUENTIAL_COLORS, sequentialColor, sequentialLabelClass, sequentialStep } from "./palette";

export interface HeatmapProps extends ChartShellProps {
  rows: readonly string[];
  cols: readonly string[];
  /** `values[row][col]`. `null` is "no data" (a hollow cell, never a zero). */
  values: readonly (readonly (number | null)[])[];
  /** Cell and tooltip value format. */
  format?: (value: number) => string;
  /** Colour classes, 2 to 7. Past about seven the neighbours blur, so the count is capped. */
  bins?: number;
  /** Fix the colour domain (compare two heatmaps on one scale). Default: the data's min and max. */
  domain?: readonly [number, number];
  /** What the colour encodes ("Median views"). Printed in the scale legend and the tooltip. */
  measure?: string;
  /** Cell height in px (default 30). */
  cellHeight?: number;
  /** Print the value inside cells that are wide enough (never clipped). `auto` decides per heatmap. */
  showValues?: "auto" | "always" | "never";
  /** Heading of the row column in the table view. */
  rowLabel?: string;
  /** Caption under the legend. */
  note?: ReactNode;
}

/**
 * Heatmap on the sequential azure ramp (more is darker in the light theme and lighter in the dark theme, one hue, never a
 * rainbow): quantised to at most seven classes, 2px gaps, 4px cells, a scale legend, a hollow "no data" cell, per-cell
 * tooltips and 2D arrow-key navigation. Labels inside cells only appear where they fit.
 */
export function Heatmap({
  rows,
  cols,
  values,
  format = formatCompact,
  bins = 7,
  domain,
  measure = "Value",
  cellHeight = 30,
  showValues = "auto",
  rowLabel = "Row",
  note,
  summary,
  state,
  empty,
  footer,
  ...shell
}: HeatmapProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { revealed, animated } = useReveal<HTMLDivElement>(ref);
  const svgRef = useRef<SVGSVGElement>(null);

  const stats = useMemo(() => {
    const flat = values.flat().filter((value): value is number => value !== null && Number.isFinite(value));
    const min = domain?.[0] ?? Math.min(...flat);
    const max = domain?.[1] ?? Math.max(...flat);
    return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1, hasData: flat.length > 0 };
  }, [values, domain]);

  const rowGutter = Math.min(132, Math.max(36, Math.max(0, ...rows.map((row) => row.length)) * 7 + 14));
  const rowChars = Math.floor((rowGutter - 14) / 7);
  const headerHeight = 24;
  const gridWidth = Math.max(60, width - rowGutter);
  const cellWidth = gridWidth / Math.max(cols.length, 1);
  const total = rows.length * cols.length;
  const sampleLabel = format(stats.max);
  const labelsFit = cellWidth - 4 >= textWidth(sampleLabel) + 8 && cellHeight >= 22;
  const printValues = showValues === "always" || (showValues === "auto" && labelsFit);
  const colStride = Math.max(1, Math.ceil((textWidth(cols.reduce((longest, col) => (col.length > longest.length ? col : longest), "")) + 8) / Math.max(cellWidth, 1)));

  const cellAt = (index: number): { row: number; col: number; value: number | null } => {
    const row = Math.floor(index / Math.max(cols.length, 1));
    const col = index % Math.max(cols.length, 1);
    return { row, col, value: values[row]?.[col] ?? null };
  };

  const cursor = useChartCursor(
    total,
    (index) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const { row, col } = cellAt(index);
      return { x: rect.left + rowGutter + col * cellWidth + cellWidth / 2, y: rect.top + headerHeight + row * cellHeight + cellHeight / 2 };
    },
    { columns: cols.length },
  );
  const active = cursor.state ? cellAt(cursor.state.index) : null;

  const range = stats.max - stats.min || 1;
  const stepFor = (value: number): number => sequentialStep((value - stats.min) / range, bins);
  const legendSteps = Array.from({ length: Math.min(Math.max(bins, 2), 7) }, (_, index) => sequentialColor((index + 0.5) / Math.min(Math.max(bins, 2), 7), bins));

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Heatmap data",
    columns: [{ key: "row", label: rowLabel }, ...cols.map((col) => ({ key: col, label: col, align: "end" as const }))],
    rows: rows.map((row, rowIndex) => ({
      row,
      ...Object.fromEntries(cols.map((col, colIndex) => [col, values[rowIndex]?.[colIndex] == null ? "No data" : format(values[rowIndex]?.[colIndex] as number)])),
    })),
  };

  const height = headerHeight + rows.length * cellHeight + 2;

  return (
    <ChartFrame
      summary={summary}
      state={state ?? (rows.length === 0 || cols.length === 0 || !stats.hasData ? "empty" : "ready")}
      empty={empty ?? { title: "No data in this view yet", description: "Cells fill in as posts collect views." }}
      table={table}
      minHeight={height}
      footer={
        <div className="grid gap-2">
          <ScaleLegend steps={legendSteps} min={format(stats.min)} max={format(stats.max)} label={measure} empty="No data" />
          {note ? <p>{note}</p> : null}
          {footer}
        </div>
      }
      {...shell}
    >
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="group"
            aria-roledescription="heatmap"
            aria-label={`${typeof shell.title === "string" ? shell.title : "Heatmap"}. Use the arrow keys to move between cells.`}
            tabIndex={0}
            className="block touch-pan-y overflow-visible rounded-md select-none"
            style={{ clipPath: revealed ? "inset(-8px)" : "inset(-8px 100% -8px -8px)", transition: animated ? "clip-path 900ms var(--fd-ease-emphasized)" : "none" }}
            onKeyDown={cursor.keyboard.onKeyDown}
            onFocus={cursor.keyboard.onFocus}
            onBlur={cursor.keyboard.onBlur}
            onPointerLeave={cursor.clear}
            onPointerCancel={cursor.clear}
          >
            <g aria-hidden="true">
              {cols.map((col, colIndex) =>
                colIndex % colStride === 0 ? (
                  <text key={col} x={rowGutter + colIndex * cellWidth + cellWidth / 2} y={14} textAnchor="middle" className="fill-fg-subtle text-micro">
                    {col}
                  </text>
                ) : null,
              )}
              {rows.map((row, rowIndex) => (
                <text key={row} x={rowGutter - 10} y={headerHeight + rowIndex * cellHeight + cellHeight / 2} dy="0.35em" textAnchor="end" className="fill-fg-muted text-micro font-medium">
                  {row.length > rowChars ? `${row.slice(0, rowChars - 1).trimEnd()}…` : row}
                </text>
              ))}
            </g>
            {rows.map((row, rowIndex) =>
              cols.map((col, colIndex) => {
                const value = values[rowIndex]?.[colIndex] ?? null;
                const x = rowGutter + colIndex * cellWidth + 1;
                const y = headerHeight + rowIndex * cellHeight + 1;
                const w = Math.max(cellWidth - 2, 2);
                const h = cellHeight - 2;
                const isActive = active?.row === rowIndex && active.col === colIndex;
                const step = value === null ? -1 : stepFor(value);
                return (
                  <g
                    key={`${row}-${col}`}
                    onPointerMove={(event) => cursor.setFromPointer(rowIndex * cols.length + colIndex, event.clientX, event.clientY)}
                  >
                    {value === null ? (
                      <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={FURNITURE.axis} strokeWidth={1} />
                    ) : (
                      <rect x={x} y={y} width={w} height={h} rx={4} fill={SEQUENTIAL_COLORS[step] ?? SEQUENTIAL_COLORS[0]} />
                    )}
                    {printValues && value !== null ? (
                      <text x={x + w / 2} y={y + h / 2} dy="0.35em" textAnchor="middle" className={cn("text-micro font-semibold tabular-nums", sequentialLabelClass(step))} aria-hidden="true">
                        {format(value)}
                      </text>
                    ) : null}
                    {isActive ? <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} rx={5} fill="none" stroke="var(--fd-fg)" strokeWidth={2} pointerEvents="none" /> : null}
                  </g>
                );
              }),
            )}
          </svg>
        ) : null}
        <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
          {active ? (
            <TooltipBody
              title={`${rows[active.row] ?? ""} · ${cols[active.col] ?? ""}`}
              rows={[{ id: "value", label: measure, value: active.value === null ? "No data" : format(active.value), color: active.value === null ? undefined : (SEQUENTIAL_COLORS[stepFor(active.value)] ?? undefined), shape: "rect" }]}
            />
          ) : null}
        </ChartTooltip>
        <p className="sr-only" aria-live="polite">
          {cursor.state?.source === "keyboard" && active ? `${rows[active.row] ?? ""}, ${cols[active.col] ?? ""}: ${active.value === null ? "no data" : format(active.value)}` : ""}
        </p>
      </div>
    </ChartFrame>
  );
}
