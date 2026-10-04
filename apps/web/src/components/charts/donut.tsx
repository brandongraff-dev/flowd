"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import { cn } from "@/lib/utils";
import type { ChartShellProps } from "./cartesian";
import { ChartFrame, type ChartTableData } from "./chart-frame";
import { ChartKey } from "./chart-key";
import { ChartTooltip, TooltipBody } from "./chart-tooltip";
import { formatRatio, formatWhole } from "./format";
import { useChartCursor, useReveal } from "./hooks";
import { MAX_SERIES, OTHER_COLOR, seriesColor } from "./palette";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  /** CSS colour. Default: the palette slot by position. */
  color?: string;
}

export interface DonutProps extends ChartShellProps {
  segments: readonly DonutSegment[];
  /** Big figure in the hole ("$12.5K"). Default: the total. */
  centerValue?: ReactNode;
  /** Caption under the figure ("spent"). */
  centerLabel?: ReactNode;
  /** Value format for the legend, tooltip and table. */
  format?: (value: number) => string;
  /** Diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  /** Most segments before the tail folds into "Other" (default 6: a donut is for at-a-glance part-to-whole only). */
  maxSegments?: number;
}

/**
 * Donut for part-to-whole at a glance, six segments at most (the tail folds into "Other"). Segments are separated by a 2px
 * gap, the legend beside it lists every value and share (so no segment is read by colour alone), and the hole holds the one
 * figure that matters. For comparing close values use a bar chart.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  format = formatWhole,
  size = 184,
  thickness = 22,
  maxSegments = 6,
  summary,
  state,
  empty,
  ...shell
}: DonutProps) {
  const { ref, revealed, animated } = useReveal<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [legendFocus, setLegendFocus] = useState<number | null>(null);
  const limit = Math.min(Math.max(maxSegments, 2), MAX_SERIES);

  const folded = useMemo(() => {
    const positive = segments.filter((segment) => segment.value > 0);
    if (positive.length <= limit) return positive.map((segment, index) => ({ ...segment, color: segment.color ?? seriesColor(index) }));
    const head = positive.slice(0, limit - 1).map((segment, index) => ({ ...segment, color: segment.color ?? seriesColor(index) }));
    const rest = positive.slice(limit - 1);
    return [...head, { id: "other", label: "Other", value: rest.reduce((sum, segment) => sum + segment.value, 0), color: OTHER_COLOR }];
  }, [segments, limit]);

  const total = folded.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2;
  const inner = radius - thickness;

  const slices = useMemo(
    () =>
      d3Pie<(typeof folded)[number]>()
        .value((segment) => segment.value)
        .sort(null)
        .padAngle(Math.min(0.05, 2.2 / radius))(folded),
    [folded, radius],
  );

  const cursor = useChartCursor(folded.length, (index) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const slice = slices[index];
    if (!rect || !slice) return null;
    const angle = (slice.startAngle + slice.endAngle) / 2 - Math.PI / 2;
    return { x: rect.left + radius + Math.cos(angle) * (radius - thickness / 2), y: rect.top + radius + Math.sin(angle) * (radius - thickness / 2) };
  });
  const active = cursor.state?.index ?? legendFocus;
  const activeSegment = active !== null && active !== undefined ? folded[active] : undefined;

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Breakdown",
    columns: [
      { key: "label", label: "Segment" },
      { key: "value", label: "Value", align: "end" },
      { key: "share", label: "Share", align: "end" },
    ],
    rows: folded.map((segment) => ({ label: segment.label, value: format(segment.value), share: formatRatio(segment.value / (total || 1), 1) })),
  };

  const arcFor = (index: number, grow: number) => {
    const slice = slices[index];
    return slice ? (d3Arc().innerRadius(inner).outerRadius(radius - 1 + grow).cornerRadius(3)({ ...slice, innerRadius: inner, outerRadius: radius - 1 + grow }) ?? "") : "";
  };

  return (
    <ChartFrame
      summary={summary}
      state={state ?? (total <= 0 ? "empty" : "ready")}
      empty={empty ?? { title: "Nothing to break down yet", description: "The split appears once there is spend or activity to divide." }}
      table={table}
      minHeight={size}
      {...shell}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            ref={svgRef}
            width={size}
            height={size}
            viewBox={`${-radius} ${-radius} ${size} ${size}`}
            role="group"
            aria-roledescription="chart"
            aria-label={`${typeof shell.title === "string" ? shell.title : "Breakdown"}. Use the arrow keys to move between segments.`}
            tabIndex={0}
            className="block overflow-visible rounded-full select-none"
            style={{ opacity: revealed ? 1 : 0, transform: revealed ? "none" : "scale(0.92) rotate(-12deg)", transition: animated ? "opacity 420ms var(--fd-ease-standard), transform 640ms var(--fd-ease-emphasized)" : "none" }}
            onKeyDown={cursor.keyboard.onKeyDown}
            onFocus={cursor.keyboard.onFocus}
            onBlur={cursor.keyboard.onBlur}
          >
            {folded.map((segment, index) => {
              const dim = active !== null && active !== undefined && active !== index;
              return (
                <path
                  key={segment.id}
                  d={arcFor(index, active === index ? 3 : 0)}
                  fill={segment.color}
                  fillOpacity={segment.color === OTHER_COLOR ? 0.55 : 1}
                  style={{ opacity: dim ? 0.4 : 1, transition: "opacity var(--fd-dur-fast) var(--fd-ease-standard)" }}
                  onPointerMove={(event) => cursor.setFromPointer(index, event.clientX, event.clientY)}
                  onPointerLeave={cursor.clear}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" style={{ padding: thickness + 6 }}>
            <p className="font-display text-figure-lg text-fg tabular-nums">{activeSegment ? formatRatio(activeSegment.value / total, 0) : (centerValue ?? format(total))}</p>
            <p className="text-caption text-fg-subtle">{activeSegment ? activeSegment.label : centerLabel}</p>
          </div>
        </div>

        <ul aria-label="Breakdown" className="grid min-w-52 flex-1 gap-0.5 sm:max-w-sm">
          {folded.map((segment, index) => (
            <li
              key={segment.id}
              onPointerEnter={() => setLegendFocus(index)}
              onPointerLeave={() => setLegendFocus(null)}
              className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-lg px-2.5 py-2 text-body-sm transition-colors duration-(--fd-dur-fast) ease-standard", active === index && "bg-surface-hover")}
            >
              <ChartKey color={segment.color} shape="rect" />
              <span className="truncate font-medium text-fg-muted">{segment.label}</span>
              <span className="text-right font-semibold text-fg tabular-nums">{format(segment.value)}</span>
              <span className="w-12 text-right text-caption text-fg-subtle tabular-nums">{formatRatio(segment.value / (total || 1), 0)}</span>
            </li>
          ))}
        </ul>
      </div>
      <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
        {activeSegment && cursor.state ? (
          <TooltipBody
            title={activeSegment.label}
            rows={[
              { id: "value", label: "Value", value: format(activeSegment.value), color: activeSegment.color, shape: "rect" },
              { id: "share", label: "Share", value: formatRatio(activeSegment.value / (total || 1), 1) },
            ]}
          />
        ) : null}
      </ChartTooltip>
    </ChartFrame>
  );
}
