"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { ArrowDown, Check, Sparkles } from "lucide-react";
import { scaleLog, scalePow, scaleLinear } from "d3-scale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { ChartShellProps } from "./cartesian";
import { ChartFrame, type ChartTableData } from "./chart-frame";
import { ChartTooltip, TooltipBody } from "./chart-tooltip";
import { formatCompact, formatRatio, formatWhole } from "./format";
import { useChartCursor, useReveal } from "./hooks";
import { ORDINAL_COLORS } from "./palette";

export type FunnelKind = "tracked" | "estimated";

export interface FunnelStage {
  id: string;
  /** "Views", "Clicks", "Installs", "Trials", "Paid". */
  label: string;
  value: number;
  /** `tracked`: counted from a flowd link or offer code (what CPA bonuses pay on). `estimated`: modelled from store or platform data. */
  kind: FunnelKind;
  /** One line of provenance for the tooltip ("Platform-reported, verified at 72 hours"). */
  note?: string;
  /** Right-hand context under the value ("$6.40 per trial"). */
  detail?: ReactNode;
}

export interface FunnelChartProps extends ChartShellProps {
  stages: readonly FunnelStage[];
  /** Bar length scale. Stages span orders of magnitude (4.2M views to 214 paid), so the default is square-root, and the footer says so. */
  scale?: "sqrt" | "linear" | "log";
  formatValue?: (value: number) => string;
  /** Sentence under each step ("1.8% of views clicked"). */
  stepLabel?: (from: FunnelStage, to: FunnelStage, rate: number) => string;
}

const KIND_COPY: Record<FunnelKind, { label: string; description: string }> = {
  tracked: { label: "Tracked", description: "Counted from a flowd link or offer code. CPA bonuses pay only on tracked results." },
  estimated: { label: "Estimated", description: "Modelled from platform or store data. Shown for context; never used to pay a bonus." },
};

function defaultValue(value: number): string {
  return value >= 100_000 ? formatCompact(value) : formatWhole(value);
}

function defaultStep(from: FunnelStage, to: FunnelStage, rate: number): string {
  return `${formatRatio(rate, rate < 0.1 ? 2 : 1)} of ${from.label.toLowerCase()} became ${to.label.toLowerCase()}`;
}

const HATCH = "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, var(--fd-chart-surface) 62%, transparent) 4px 6px)";

/**
 * The install-to-paid funnel: views to clicks to installs to trials to paid, as one ordered ramp of bars (an ordinal scale,
 * never a rainbow), the step conversion between every pair, and a Tracked / Estimated chip on every stage. Estimated stages
 * are also hatched, so the distinction does not rest on colour. Bars are at most 24px thick with a 4px rounded end and grow
 * from the left once; the figures are real text, so the funnel reads without the bars.
 */
export function FunnelChart({ stages, scale = "sqrt", formatValue = defaultValue, stepLabel = defaultStep, summary, state, empty, footer, ...shell }: FunnelChartProps) {
  const { ref, revealed, animated } = useReveal<HTMLOListElement>();
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const first = stages[0]?.value ?? 0;
  const max = Math.max(...stages.map((stage) => stage.value), 1);

  const widthFor = useMemo(() => {
    const floor = 0.8;
    const fn =
      scale === "linear"
        ? scaleLinear().domain([0, max]).range([0, 100])
        : scale === "log"
          ? scaleLog().domain([1, max]).range([0, 100]).clamp(true)
          : scalePow().exponent(0.5).domain([0, max]).range([0, 100]);
    return (value: number): number => Math.max(floor, fn(Math.max(value, scale === "log" ? 1 : 0)));
  }, [scale, max]);

  const cursor = useChartCursor(stages.length, (index) => {
    const rect = rowRefs.current[index]?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width * 0.5, y: rect.top + rect.height / 2 } : null;
  });
  const active = cursor.state ? stages[cursor.state.index] : undefined;
  const activeIndex = cursor.state?.index ?? -1;
  const previous = activeIndex > 0 ? stages[activeIndex - 1] : undefined;

  const table: ChartTableData = {
    caption: typeof shell.title === "string" ? shell.title : "Funnel data",
    columns: [
      { key: "stage", label: "Stage" },
      { key: "count", label: "Count", align: "end" },
      { key: "share", label: "Of first stage", align: "end" },
      { key: "step", label: "From previous", align: "end" },
      { key: "source", label: "Source" },
    ],
    rows: stages.map((stage, index) => ({
      stage: stage.label,
      count: formatWhole(stage.value),
      share: first > 0 ? formatRatio(stage.value / first, 2) : "",
      step: index === 0 || !stages[index - 1]?.value ? "" : formatRatio(stage.value / (stages[index - 1]?.value ?? 1), 2),
      source: KIND_COPY[stage.kind].label,
    })),
  };

  const scaleNote = scale === "linear" ? null : `Bar length uses a ${scale === "sqrt" ? "square-root" : "log"} scale so small stages stay visible; the figures are exact.`;

  return (
    <ChartFrame
      summary={summary}
      state={state ?? (stages.length === 0 ? "empty" : "ready")}
      empty={empty ?? { title: "No funnel yet", description: "Views, clicks, installs and trials appear once your first post is live." }}
      table={table}
      minHeight={260}
      footer={
        <div className="grid gap-1">
          {scaleNote ? <p>{scaleNote}</p> : null}
          {footer}
        </div>
      }
      {...shell}
    >
      <div className="relative">
        <ol
          ref={ref}
          role="list"
          tabIndex={0}
          aria-label="Funnel stages. Use the arrow keys to move between stages."
          onKeyDown={cursor.keyboard.onKeyDown}
          onFocus={cursor.keyboard.onFocus}
          onBlur={cursor.keyboard.onBlur}
          className="grid rounded-xl"
        >
          {stages.map((stage, index) => {
            const next = stages[index + 1];
            const rate = next && stage.value > 0 ? next.value / stage.value : null;
            const color = ORDINAL_COLORS[Math.min(index, ORDINAL_COLORS.length - 1)] ?? ORDINAL_COLORS[0];
            const receded = cursor.state !== null && activeIndex !== index;
            return (
              <li
                key={stage.id}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                onPointerMove={(event) => cursor.setFromPointer(index, event.clientX, event.clientY)}
                onPointerLeave={cursor.clear}
                onPointerCancel={cursor.clear}
                className={cn("grid gap-2 rounded-xl px-1 transition-opacity duration-(--fd-dur-fast) ease-standard", receded && "opacity-55")}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pt-1">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="font-display text-title-sm text-fg">{stage.label}</span>
                    <Tooltip content={KIND_COPY[stage.kind].description} side="top">
                      <Badge tabIndex={0} size="sm" tone={stage.kind === "tracked" ? "accent" : "violet"} icon={stage.kind === "tracked" ? <Check aria-hidden="true" /> : <Sparkles aria-hidden="true" />}>
                        {KIND_COPY[stage.kind].label}
                      </Badge>
                    </Tooltip>
                  </div>
                  <div className="flex items-baseline gap-2.5">
                    {stage.detail ? <span className="text-caption text-fg-subtle">{stage.detail}</span> : null}
                    <span className="font-display text-figure-md text-fg tabular-nums">{formatValue(stage.value)}</span>
                  </div>
                </div>
                <div aria-hidden="true" className="h-6 overflow-hidden rounded-[4px] bg-surface-active">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      width: `${widthFor(stage.value)}%`,
                      background: color,
                      backgroundImage: stage.kind === "estimated" ? HATCH : undefined,
                      transformOrigin: "0% 50%",
                      transform: revealed ? "none" : "scaleX(0)",
                      transition: animated ? `transform 640ms var(--fd-ease-emphasized) ${Math.min(index, 8) * 70}ms` : "none",
                    }}
                  />
                </div>
                {rate !== null && next ? (
                  <p className="flex items-center gap-1.5 pb-1 pl-1 text-caption text-fg-subtle">
                    <ArrowDown aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                    <span className="tabular-nums">{stepLabel(stage, next, rate)}</span>
                  </p>
                ) : (
                  <span className="pb-1" />
                )}
              </li>
            );
          })}
        </ol>
        <ChartTooltip anchor={cursor.state ? { x: cursor.state.x, y: cursor.state.y } : null}>
          {active ? (
            <TooltipBody
              title={active.label}
              rows={[
                { id: "count", label: "Count", value: formatWhole(active.value), color: ORDINAL_COLORS[Math.min(activeIndex, ORDINAL_COLORS.length - 1)], shape: "rect" },
                ...(first > 0 && activeIndex > 0 ? [{ id: "share", label: `Of ${stages[0]?.label.toLowerCase()}`, value: formatRatio(active.value / first, 2) }] : []),
                ...(previous && previous.value > 0 ? [{ id: "step", label: `From ${previous.label.toLowerCase()}`, value: formatRatio(active.value / previous.value, 2) }] : []),
              ]}
              footer={active.note ?? KIND_COPY[active.kind].description}
            />
          ) : null}
        </ChartTooltip>
      </div>
    </ChartFrame>
  );
}
