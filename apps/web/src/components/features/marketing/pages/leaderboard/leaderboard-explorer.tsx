"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, EyeOff, Minus } from "lucide-react";
import type { LeaderboardMetric, Niche } from "@/lib/contract/types";
import { formatInt, formatIsoWeek, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { ArtAvatar } from "@/components/brand/avatar";
import { TierBadge } from "@/components/brand/tier-badge";
import { RangeBar } from "@/components/charts";
import { DemoTag } from "@/components/shell/demo-banner";
import { Button, Chip, ChipGroup, EmptyState, Money, SegmentedControl } from "@/components/ui";
import { Footnote, PageSection } from "../kit";
import type { Board, BoardRow, LeaderboardPageData } from "./leaderboard-data";

const METRICS: ReadonlyArray<{ value: LeaderboardMetric; label: string; column: string; help: string }> = [
  { value: "earnings", label: "Earnings", column: "Cleared this week", help: "Money cleared in the week. Pending money does not count until it clears." },
  { value: "conversion_rate", label: "Conversion rate", column: "Installs per 1,000 views", help: "Installs per 1,000 verified views, so a small account can beat a big one." },
  { value: "score_accuracy", label: "Score accuracy", column: "Score accuracy", help: "How close a creator's Flow Score band came to the real result. It rewards honest self-checks, not luck." },
];

function Delta({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-caption text-fg-subtle">
        <Minus aria-hidden="true" className="size-3" strokeWidth={2.25} />
        <span className="sr-only">No change</span>
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums", up ? "text-fg" : "text-fg-subtle")}>
      <Icon aria-hidden="true" className="size-3" strokeWidth={2.5} />
      {Math.abs(delta)}
      <span className="sr-only">{up ? " places up since last week" : " places down since last week"}</span>
    </span>
  );
}

function Value({ metric, value }: { metric: LeaderboardMetric; value: number }) {
  if (metric === "earnings") return <Money cents={value} state="cleared" size="md" />;
  if (metric === "conversion_rate") return <span className="fd-figure text-figure-md text-fg">{value.toFixed(2)}</span>;
  return <span className="fd-figure text-figure-md text-fg">{formatPct(value, 0)}</span>;
}

function Row({ row, metric }: { row: BoardRow; metric: LeaderboardMetric }) {
  const top = row.rank <= 3;
  return (
    <li>
      <Link
        href={`/c/${row.handle}`}
        className={cn(
          "group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-2xl px-3 py-3 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover sm:grid-cols-[3.5rem_minmax(0,1fr)_9.5rem_auto] sm:gap-x-4 sm:px-4",
          top && "bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]",
        )}
      >
        <div className="grid justify-items-center gap-0.5">
          <span className={cn("fd-figure text-figure-md", top ? "text-fg" : "text-fg-muted")}>{row.rank}</span>
          <Delta delta={row.delta} />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <ArtAvatar art={row.art} name={`@${row.handle}`} size={40} decorative />
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-body font-semibold text-fg">@{row.handle}</p>
            <p className="truncate text-caption text-fg-subtle">{row.name}</p>
          </div>
        </div>
        <div className="hidden sm:block">
          <TierBadge tier={row.tier} size={24} label />
        </div>
        <div className="grid justify-items-end gap-1 text-right">
          <Value metric={metric} value={row.value} />
          <span className="sm:hidden">
            <TierBadge tier={row.tier} size={20} />
          </span>
        </div>
      </Link>
    </li>
  );
}

export interface LeaderboardExplorerProps {
  data: LeaderboardPageData;
  initialMetric: LeaderboardMetric;
  initialNiche: Niche | "all";
}

/**
 * The public weekly boards. Metric tabs (earnings, conversion rate, score accuracy) and a niche row, both kept in the URL. Each board shows the
 * top 20 with rank, movement since last week, tier and the metric; rows open the creator's public storefront. A board that does not exist for a
 * metric and niche says why and offers the nearest one, instead of showing an empty table.
 */
export function LeaderboardExplorer({ data, initialMetric, initialNiche }: LeaderboardExplorerProps) {
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric);
  const [niche, setNiche] = useState<Niche | "all">(initialNiche);
  const spec = METRICS.find((item) => item.value === metric) ?? METRICS[0];
  const board: Board | undefined = data.boards[`${metric}:${niche}`];
  const nicheLabel = niche === "all" ? "all niches" : (data.niches.find((item) => item.niche === niche)?.label ?? niche);

  const remember = (nextMetric: LeaderboardMetric, nextNiche: Niche | "all"): void => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("metric", nextMetric);
      if (nextNiche === "all") url.searchParams.delete("niche");
      else url.searchParams.set("niche", nextNiche);
      window.history.replaceState(null, "", url);
    } catch {
      // A blocked history API only loses the shareable URL.
    }
  };

  const pickMetric = (next: LeaderboardMetric): void => {
    setMetric(next);
    remember(next, niche);
  };
  const pickNiche = (next: Niche | "all"): void => {
    setNiche(next);
    remember(metric, next);
  };

  const week = formatIsoWeek(data.week);

  return (
    <>
      <PageSection
        id="board"
        eyebrow={`Week of ${week}`}
        title="The top 20, by results"
        description="Boards reset every Monday at 00:00 UTC. Pick a measure and a niche. Rows open the creator's public page."
      >
        <div className="grid gap-6">
          <div className="max-w-full overflow-x-auto scrollbar-none">
            <SegmentedControl<LeaderboardMetric> aria-label="Measure" size="lg" value={metric} onValueChange={pickMetric} options={METRICS.map((item) => ({ value: item.value, label: item.label }))} />
          </div>
          <p className="max-w-[62ch] text-body-sm text-fg-muted">{spec?.help}</p>

          <ChipGroup aria-label="Niche" className="-mx-1 flex-nowrap overflow-x-auto px-1 pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
            <Chip selected={niche === "all"} onSelectedChange={() => pickNiche("all")}>
              All niches
            </Chip>
            {data.niches.map((item) => (
              <Chip key={item.niche} selected={niche === item.niche} onSelectedChange={() => pickNiche(item.niche)}>
                {item.label}
              </Chip>
            ))}
          </ChipGroup>

          <p className="sr-only" role="status" aria-live="polite">
            {board ? `${spec?.label} board for ${nicheLabel}: ${board.rows.length} creators shown.` : `No ${spec?.label.toLowerCase()} board for ${nicheLabel} this week.`}
          </p>

          {board ? (
            <GlassCard padding="none" className="overflow-hidden p-2 sm:p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 pt-2 pb-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-display text-title-sm text-fg">{board.label}</h3>
                  <DemoTag />
                </div>
                <p className="text-caption text-fg-subtle">
                  Top {board.rows.length} of {formatInt(board.size)} ranked · {spec?.column}
                </p>
              </div>
              <ol aria-label={`${board.label}, top ${board.rows.length}`} className="grid gap-1">
                {board.rows.map((row) => (
                  <Row key={row.handle} row={row} metric={metric} />
                ))}
              </ol>
            </GlassCard>
          ) : (
            <GlassCard padding="lg">
              <EmptyState
                art="chart"
                title={`No ${spec?.label.toLowerCase()} board for ${nicheLabel} yet`}
                description={
                  metric === "score_accuracy"
                    ? "Score accuracy is ranked across all niches only, because it needs the most settled posts to mean anything."
                    : `Too few settled posts in ${nicheLabel} this week to rank fairly. Earnings and the all-niche board are available.`
                }
                action={
                  <Button variant="primary" onClick={() => pickNiche("all")}>
                    Show all niches
                  </Button>
                }
                secondaryAction={
                  metric !== "earnings" ? (
                    <Button variant="ghost" onClick={() => pickMetric("earnings")}>
                      Show earnings
                    </Button>
                  ) : undefined
                }
              />
            </GlassCard>
          )}

          <p className="flex items-start gap-2 text-caption text-fg-subtle">
            <EyeOff aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            <span>
              {data.hiddenCount > 0
                ? `${data.hiddenCount} ${data.hiddenCount === 1 ? "creator has" : "creators have"} chosen to hide from leaderboards and ${data.hiddenCount === 1 ? "is" : "are"} neither shown nor ranked. Hiding never affects tier, streak or pay.`
                : "Creators can hide from leaderboards at any time. Hiding never affects tier, streak or pay."}
            </span>
          </p>
        </div>
      </PageSection>

      <PageSection
        id="typical"
        eyebrow="Typical beside top"
        title="The top of a board is not the typical week"
        description="A leaderboard shows the best results. Hold them against the middle before you decide what to expect."
      >
        <GlassCard padding="lg" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <RangeBar
            low={data.typical.p25Cents}
            median={data.typical.typicalCents}
            high={data.typical.p75Cents}
            top={data.typical.topDecileCents}
            topLabel="Top 10%"
            label={`Creator earnings, last ${data.typical.period}, same scale`}
          />
          <div className="grid gap-3">
            <p className="text-body text-fg-muted">
              <span className="font-semibold text-fg">The typical creator cleared {formatMoney(data.typical.typicalCents)}</span> in the last {data.typical.period}, across {formatInt(data.typical.activeCreators)} active creators. The middle half cleared {formatMoney(data.typical.p25Cents)} to {formatMoney(data.typical.p75Cents)}. The top 10% cleared {formatMoney(data.typical.topDecileCents)}.
            </p>
            <Footnote>Results vary and there is no guaranteed income. Boards rank one week; the typical figure covers 30 days. How we calculate it is in the earnings disclosure.</Footnote>
          </div>
        </GlassCard>
      </PageSection>
    </>
  );
}
