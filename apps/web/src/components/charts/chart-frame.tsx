"use client";

import { useId, useState, type ReactNode } from "react";
import { ChartLine, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export interface ChartTableColumn {
  key: string;
  label: ReactNode;
  /** `end` for numbers (right-aligned, tabular). */
  align?: "start" | "end";
}

export interface ChartTableData {
  /** Read by screen readers as the table's name. Defaults to the chart title. */
  caption?: string;
  columns: readonly ChartTableColumn[];
  /** One object per row, keyed by column key. The first column is the row header. */
  rows: readonly Record<string, ReactNode>[];
}

/** The accessibility twin of every chart: the same numbers as a real table. WCAG-clean, copyable, and never gated behind hover. */
export function ChartTable({ data, caption }: { data: ChartTableData; caption?: string }) {
  const [first, ...rest] = data.columns;
  return (
    <div className="max-h-[22rem] overflow-auto rounded-xl bg-surface-field" tabIndex={0} role="region" aria-label={`${caption ?? data.caption ?? "Chart"} data table`}>
      <table className="w-full border-separate border-spacing-0 text-body-sm">
        <caption className="sr-only">{data.caption ?? caption}</caption>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-(--fd-z-content) border-b border-divider bg-surface-raised px-3.5 py-2.5 text-micro font-semibold whitespace-nowrap text-fg-muted",
                  column.align === "end" ? "text-right" : "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-surface-hover">
              {first ? (
                <th scope="row" className="border-b border-divider px-3.5 py-2 text-left font-medium whitespace-nowrap text-fg">
                  {row[first.key]}
                </th>
              ) : null}
              {rest.map((column) => (
                <td
                  key={column.key}
                  className={cn("border-b border-divider px-3.5 py-2 whitespace-nowrap text-fg-muted tabular-nums", column.align === "end" ? "text-right" : "text-left")}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ChartFrameProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** REQUIRED: one or two sentences saying what the chart shows and the headline number. Read by screen readers (the chart itself is a graphic). */
  summary: string;
  /** A `<ChartLegend>` (always present for two or more series). Sits under the header, above the plot. */
  legend?: ReactNode;
  /** Small controls on the right of the header (a metric toggle). Page-level filters belong in one row above the charts, not here. */
  actions?: ReactNode;
  /** Enables the Chart / Table switch. */
  table?: ChartTableData;
  /** A caption or source line under the plot ("Tracked = link or code. Estimated = modelled."). */
  footer?: ReactNode;
  /** No card and no header: the chart sits inside a card you already have (a stat tile, a panel). */
  bare?: boolean;
  /** `loading` shows a skeleton the size of the plot; `empty` an illustrated empty state (explain why and what to do). */
  state?: "ready" | "loading" | "empty" | "error";
  /** Empty and error copy. */
  empty?: { title: string; description?: string; action?: ReactNode };
  /** A refetch is in flight: the previous render stays, dimmed, with no skeleton and no layout jump. */
  stale?: boolean;
  /** Height reserved for the loading and empty states (px). */
  minHeight?: number;
  headingAs?: "h2" | "h3" | "h4";
  className?: string;
  /** The plot. */
  children: ReactNode;
}

type View = "chart" | "table";

/**
 * The container every chart lives in: a `<figure>` card (L1 quiet glass) that owns the title, the text summary, the legend
 * slot, the Chart / Table switch, the loading / empty / refetch states and the footnote. Charts render inside it as
 * `children`; `bare` strips the card for charts embedded in another card.
 */
export function ChartFrame({
  title,
  subtitle,
  summary,
  legend,
  actions,
  table,
  footer,
  bare = false,
  state = "ready",
  empty,
  stale = false,
  minHeight = 240,
  headingAs: Heading = "h3",
  className,
  children,
}: ChartFrameProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const summaryId = `${uid}-summary`;
  const [view, setView] = useState<View>("chart");
  const showTable = view === "table" && Boolean(table) && state === "ready";

  const header =
    title || subtitle || actions || table ? (
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 flex-1 basis-40 gap-1">
          {title ? (
            <Heading id={titleId} className="font-display text-title-sm text-fg">
              {title}
            </Heading>
          ) : null}
          {subtitle ? <p className="text-caption text-fg-subtle">{subtitle}</p> : null}
        </div>
        {actions || (table && state === "ready") ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {actions}
            {table && state === "ready" ? (
              <SegmentedControl<View>
                aria-label="Chart or table view"
                size="sm"
                value={view}
                onValueChange={setView}
                options={[
                  { value: "chart", label: "Chart", icon: <ChartLine aria-hidden="true" /> },
                  { value: "table", label: "Table", icon: <Table2 aria-hidden="true" /> },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const plot =
    state === "loading" ? (
      <SkeletonGroup label="Loading chart">
        <Skeleton className="w-full rounded-xl" style={{ height: minHeight }} />
      </SkeletonGroup>
    ) : state === "empty" || state === "error" ? (
      <div className="grid place-items-center rounded-xl bg-surface-field" style={{ minHeight }}>
        <EmptyState
          size="sm"
          art={state === "error" ? "error" : "chart"}
          announce={state === "error" ? "alert" : undefined}
          title={empty?.title ?? (state === "error" ? "The chart could not load" : "Nothing to plot yet")}
          description={empty?.description}
          action={empty?.action}
        />
      </div>
    ) : (
      <>
        <div className={cn("transition-opacity duration-(--fd-dur-base) ease-standard", showTable && "hidden", stale && "opacity-60")} aria-busy={stale || undefined}>
          {children}
        </div>
        {showTable && table ? <ChartTable data={table} caption={typeof title === "string" ? title : undefined} /> : null}
      </>
    );

  const body = (
    <>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {header}
      {legend && state === "ready" && !showTable ? <div className="-mx-2.5">{legend}</div> : null}
      {plot}
      {footer && state === "ready" ? <div className="text-caption text-fg-subtle">{footer}</div> : null}
    </>
  );

  if (bare) {
    return (
      <figure aria-labelledby={title ? titleId : undefined} aria-describedby={summaryId} className={cn("grid min-w-0 gap-4", className)}>
        {body}
      </figure>
    );
  }
  return (
    <GlassCard
      as="figure"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={summaryId}
      className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4", className)}
    >
      {body}
    </GlassCard>
  );
}
