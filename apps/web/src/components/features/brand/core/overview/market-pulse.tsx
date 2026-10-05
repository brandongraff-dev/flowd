"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { BrandOverview } from "@/lib/data/selectors";
import { formatCpm, formatMoney, formatSignedPct } from "@/lib/format";
import { RangeBar } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Panel, PanelLink } from "../common";

const HEAT_TONE = { cool: "info", warm: "sun", hot: "ember" } as const;
const HEAT_WORD = { cool: "Cool", warm: "Warm", hot: "Hot" } as const;

/**
 * Market pulse for the active app's category: the clearing CPM (what bounties pay at the median), its week-on-week move, where your own live
 * bounties sit in the quartile band, and how crowded the category is. A rising CPM is neither good nor bad for a brand, so the arrow is neutral.
 */
export function MarketPulse({ loading, market, yourCpm }: { loading: boolean; market: BrandOverview["market"]; yourCpm: number | null }) {
  const stats = market?.stats;
  const change = stats?.change_7d ?? 0;
  const Arrow = Math.abs(change) < 0.0005 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Panel
      title="Market pulse"
      description={market ? `${market.label}, as of the latest trades` : undefined}
      actions={market ? <PanelLink href="/brand/market">Market view</PanelLink> : undefined}
    >
      {loading || !market || !stats ? (
        <SkeletonGroup label="Loading the market" className="grid gap-4">
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton shape="text" className="w-3/4" />
        </SkeletonGroup>
      ) : (
        <>
          <div className="grid gap-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Money cents={stats.clearing_cpm_cents} size="lg" state="neutral" />
              <span className="text-body-sm text-fg-muted">clearing CPM</span>
              <span className="inline-flex items-center gap-1 text-caption font-semibold text-fg-muted tabular-nums">
                <Arrow aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
                <span className="sr-only">{change > 0 ? "up" : change < 0 ? "down" : "no change"} over 7 days</span>
                {formatSignedPct(change)}
                <span aria-hidden="true" className="font-normal text-fg-subtle">
                  vs 7 days ago
                </span>
              </span>
            </div>
            <p className="text-caption text-fg-subtle">{market.trend_copy}. Median of {stats.sample_n} comparable bounties.</p>
          </div>
          <RangeBar
            low={stats.p25_cpm_cents}
            median={stats.clearing_cpm_cents}
            high={stats.p75_cpm_cents}
            {...(yourCpm !== null ? { top: yourCpm, topLabel: "Your live CPM" } : {})}
            format={(cents) => formatMoney(cents)}
            label={yourCpm !== null ? "Per 1,000 views: the middle half, the median and your live price" : "Per 1,000 views: the middle half and the median"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={HEAT_TONE[market.heat.level]} dot>
              {HEAT_WORD[market.heat.level]} category
            </Badge>
            <p className="text-caption text-fg-muted">{market.heat.for_brands}</p>
          </div>
          {market.thin_market ? <p className="text-caption text-fg-subtle">Few comparable trades, so treat these numbers as a rough guide ({formatCpm(stats.clearing_cpm_cents, "short")} baseline).</p> : null}
        </>
      )}
    </Panel>
  );
}
