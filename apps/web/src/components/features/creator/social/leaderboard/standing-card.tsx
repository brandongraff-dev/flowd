"use client";

import { ArrowDownToLine, Clock, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Money } from "@/components/ui";
import { DemoTag } from "@/components/shell";
import type { LeaderboardMetric, LeaderboardScope } from "@/lib/contract/types";
import type { LeaderboardView } from "@/lib/data/selectors";
import { formatCountdown } from "@/lib/format";
import { median } from "@/lib/engine";
import { PositionStrip } from "./position-strip";
import { RankDelta } from "./rank-delta";
import { formatBoardValue, describeRankChange } from "./board-math";

export interface StandingCardProps {
  view: LeaderboardView;
  scope: LeaderboardScope;
  metric: LeaderboardMetric;
}

function BoardValue({ metric, value }: { metric: LeaderboardMetric; value: number }) {
  if (metric === "earnings") return <Money cents={value} size="md" icon={false} />;
  return <span className="font-display text-figure-md text-fg tabular-nums">{formatBoardValue(metric, value)}</span>;
}

function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-caption font-medium text-fg-subtle">{label}</dt>
      <dd className="grid gap-0.5">
        {children}
        {note ? <span className="text-caption text-fg-subtle">{note}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The hero of the page: where you stand, what separates you from the promotion line in your own metric, and the median beside the
 * leader so a top figure never stands alone. Cohort boards promote; niche and global boards only rank.
 */
export function StandingCard({ view, scope, metric }: StandingCardProps) {
  const { me, rows, promotion_zone_size: line, hours_to_reset: resetHours } = view;
  const size = rows.length;
  const leader = rows[0];
  const boardMedian = rows.length > 0 ? Math.round(median(rows.map((row) => row.value))) : null;
  const resetLabel = resetHours === null ? null : formatCountdown(resetHours * 3_600_000);
  const inZone = me !== undefined && line > 0 && me.rank <= line;
  const lineRow = line > 0 ? rows[line - 1] : undefined;
  const firstOut = line > 0 ? rows[line] : undefined;

  let headline = "";
  if (me) {
    if (line === 0) headline = scope === "global" ? "The public board shows the week's top creators. Your cohort is where you compete." : "Niche boards rank everyone in the niche. They do not promote.";
    else if (inZone && firstOut) headline = `${formatBoardValue(metric, me.value - firstOut.value)} ahead of #${firstOut.rank}. The top ${line} move up a cohort on Monday.`;
    else if (!inZone && lineRow) headline = `${formatBoardValue(metric, lineRow.value - me.value)} to reach the top ${line}.`;
  }

  return (
    <GlassCard padding="lg" aria-labelledby="standing-title" className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1.5">
          <p className="fd-eyebrow text-accent">This week · {view.label}</p>
          <h2 id="standing-title" className="sr-only">
            Your standing
          </h2>
          {me ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-figure-hero text-fg tabular-nums">#{me.rank}</span>
              <span className="font-display text-title-md text-fg-muted">of {size}</span>
              <RankDelta delta={me.delta_rank} className="self-center" />
            </div>
          ) : (
            <p className="font-display text-title-lg text-fg">{size} creators on this board</p>
          )}
          {me ? <p className="max-w-[56ch] text-body text-fg-muted">{headline}</p> : null}
          {me ? <p className="text-caption text-fg-subtle">{describeRankChange(me.delta_rank)}. Rank moves every week and never changes your tier.</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <DemoTag />
          {resetLabel ? (
            <Badge tone="neutral" size="lg" icon={<Clock />}>
              Resets in {resetLabel}
            </Badge>
          ) : null}
        </div>
      </div>

      <PositionStrip size={Math.min(size, 30)} rank={me && me.rank <= 30 ? me.rank : undefined} promotion={line} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 lg:gap-x-8">
        {me ? (
          <Fact label={metric === "earnings" ? "You cleared this week" : "Your figure"} note={metric === "earnings" ? "Pending money joins when it clears." : undefined}>
            <BoardValue metric={metric} value={me.value} />
          </Fact>
        ) : null}
        {leader ? (
          <Fact label="Leader this week">
            <BoardValue metric={metric} value={leader.value} />
          </Fact>
        ) : null}
        {boardMedian !== null ? (
          <Fact label="Typical on this board" note="Median of everyone listed">
            <BoardValue metric={metric} value={boardMedian} />
          </Fact>
        ) : null}
        {line > 0 && lineRow ? (
          <Fact label={`Promotion line · #${line}`} note="Reset Monday 00:00 UTC">
            <BoardValue metric={metric} value={lineRow.value} />
          </Fact>
        ) : null}
      </dl>

      {me ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<ArrowDownToLine />}
            onClick={() => {
              const target = document.getElementById("board-me");
              target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
            }}
          >
            Jump to your row
          </Button>
          {inZone ? (
            <Badge tone="mint" size="lg" icon={<Sparkles />}>
              In the promotion zone
            </Badge>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
