"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Button, Money } from "@/components/ui";
import type { LeaderboardMetric } from "@/lib/contract/types";
import { stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { LeaderboardView, LeaderRow } from "@/lib/data/selectors";
import { Person } from "../shared/person";
import { RankDelta } from "./rank-delta";
import { formatBoardValue, METRIC_BLURB } from "./board-math";

const PAGE = 30;
/** Only the first screenful of rows animates in; the rest are just there. */
const ANIMATED_ROWS = 8;

export interface BoardListProps {
  view: LeaderboardView;
  metric: LeaderboardMetric;
  /** Rows to show before "Show all". */
  initial?: number;
}

function Value({ metric, value, className }: { metric: LeaderboardMetric; value: number; className?: string }) {
  if (metric === "earnings") return <Money cents={value} size="sm" icon={false} className={className} />;
  return <span className={cn("inline-flex text-figure-sm font-semibold text-fg tabular-nums", className)}>{formatBoardValue(metric, value)}</span>;
}

function PromotionLine({ size }: { size: number }) {
  return (
    <li aria-label={`Promotion line: the top ${size} move up a cohort on Monday`} className="flex items-center gap-3 px-4 py-2 text-micro font-semibold tracking-wide text-mint uppercase">
      <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-mint/50" />
      <span className="inline-flex items-center gap-1.5">
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
        Top {size} move up on Monday
      </span>
      <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-mint/50" />
    </li>
  );
}

function BoardRow({ row, metric, index, animate }: { row: LeaderRow; metric: LeaderboardMetric; index: number; animate: boolean }) {
  const reduce = useReducedMotion();
  const zone = row.zone === "promotion";
  const content = (
    <>
      <span className={cn("text-center font-display text-title-sm tabular-nums", row.rank <= 3 ? "text-fg" : "text-fg-muted")}>{row.rank}</span>
      <Person creator={row.creator} you={row.is_me} tier detail={row.is_me ? "Your row" : row.creator.display_name} />
      <span className="grid justify-items-end gap-1 sm:flex sm:items-center sm:gap-2.5">
        <Value metric={metric} value={row.value} className="min-w-[4.75rem] justify-end sm:order-2" />
        <RankDelta delta={row.delta_rank} className="sm:order-1" />
      </span>
    </>
  );
  const className = cn(
    "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]",
    zone && "shadow-[inset_3px_0_0_var(--fd-mint-solid)]",
    row.is_me && "bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_40%,transparent),inset_3px_0_0_var(--fd-accent-bright)]",
  );
  if (!animate || reduce) {
    return (
      <li id={row.is_me ? "board-me" : undefined} className={className}>
        {content}
      </li>
    );
  }
  return (
    <motion.li
      id={row.is_me ? "board-me" : undefined}
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30, mass: 1, delay: stagger(index, ANIMATED_ROWS) }}
    >
      {content}
    </motion.li>
  );
}

/** The ranked list: rank, creator, rank change and value, with the promotion line drawn between the last place that moves up and the first that does not. */
export function BoardList({ view, metric, initial = PAGE }: BoardListProps) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? view.rows : view.rows.slice(0, initial);
  const hidden = view.rows.length - rows.length;
  const line = view.promotion_zone_size;
  const blurb = METRIC_BLURB[metric];
  return (
    <div className="grid">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 px-4 pb-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
        <span className="text-center">#</span>
        <span>Creator</span>
        <span className="text-right">{blurb.column}</span>
      </div>
      <ol className="grid divide-y divide-divider overflow-hidden rounded-xl bg-surface-field/60">
        {rows.map((row, index) => (
          <RowGroup key={row.creator_id} line={line} row={row} metric={metric} index={index} />
        ))}
      </ol>
      {hidden > 0 ? (
        <div className="flex justify-center pt-4">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show all {view.rows.length} creators
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RowGroup({ line, row, metric, index }: { line: number; row: LeaderRow; metric: LeaderboardMetric; index: number }) {
  return (
    <>
      {line > 0 && row.rank === line + 1 ? <PromotionLine size={line} /> : null}
      <BoardRow row={row} metric={metric} index={index} animate={index < ANIMATED_ROWS} />
    </>
  );
}
