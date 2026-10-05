"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { DemoTag, PageHeader } from "@/components/shell";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CATEGORIES, CATEGORY_META, type Category } from "@/lib/contract/types";
import { useBounties, useDemoNow, useMarket, useMarketOverview, useMe, useStoreReady } from "@/lib/data";
import { formatCpm, formatDate, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarketPrices } from "./market-prices";
import { MarketRadar } from "./market-radar";
import { useQueryParams } from "./use-query-state";

const PARAMS = { tab: "", category: "" } as const;
const isCategory = (value: string): value is Category => (CATEGORIES as readonly string[]).includes(value);

/** Day count between an ISO date and an ISO timestamp, whole days. */
const daysBetween = (isoDate: string, now: string): number => Math.floor((Date.parse(now) - Date.parse(`${isoDate}T00:00:00Z`)) / 86_400_000);

/** The Market view: clearing CPM and its range over time, price against fill time, supply and demand, and the trend radar. Brand colours are neutral ink and arrows: a price rising is neither good nor bad. */
export function MarketView() {
  const ready = useStoreReady();
  const me = useMe();
  const { values, set } = useQueryParams(PARAMS);
  const overview = useMarketOverview();
  const category: Category = isCategory(values.category) ? values.category : (me.app?.category ?? "ai_photo");
  const market = useMarket(category);
  const live = useBounties({ brand: "mine", status: "live" });
  const now = useDemoNow();
  const mine = useMemo(() => live.filter((bounty) => bounty.app.category === category), [live, category]);
  const tab = values.tab === "radar" ? "radar" : "prices";
  const age = market ? daysBetween(market.as_of, now) : 0;

  return (
    <Tabs value={tab} onValueChange={(next) => set({ tab: next === "prices" ? null : next })} variant="underline" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Market view"
        description="What a thousand views costs right now, and what a price buys. Set your CPM from the market, not from a guess."
        meta={
          <>
            <DemoTag>Demo data</DemoTag>
            {market ? (
              <Badge size="lg" tone={age > 2 ? "sun" : "neutral"} icon={<Clock />}>
                {age > 2 ? `Data is ${age} days old` : `As of ${formatDate(market.as_of, "medium")}`}
              </Badge>
            ) : null}
          </>
        }
        tabs={
          <TabsList aria-label="Market sections">
            <TabsTrigger value="prices">Prices</TabsTrigger>
            <TabsTrigger value="radar">Radar</TabsTrigger>
          </TabsList>
        }
      />

      <section aria-label="Category" className="-mx-4 sm:-mx-6 lg:-mx-8">
        <ul className="scrollbar-none relative grid snap-x snap-mandatory auto-cols-[10.75rem] grid-flow-col gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:px-6 lg:px-8">
          {(ready ? overview : []).map((row) => {
            const active = row.category === category;
            const Arrow = row.change_7d > 0.0005 ? ArrowUpRight : row.change_7d < -0.0005 ? ArrowDownRight : Minus;
            return (
              <li key={row.category} className="snap-start">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ category: row.category === (me.app?.category ?? "ai_photo") ? null : row.category })}
                  className={cn(
                    "fd-chip grid h-full w-full gap-1.5 rounded-2xl p-3.5 text-left transition-[box-shadow,background-color] duration-(--fd-dur-fast) ease-standard active:scale-[0.98]",
                    active ? "bg-surface-active shadow-[0_0_0_2px_var(--fd-accent-bright)]" : "bg-surface-field hover:bg-surface-hover",
                  )}
                >
                  <span className="truncate text-caption font-medium text-fg-muted">{CATEGORY_META[row.category].label}</span>
                  <span className="font-display text-figure-md text-fg tabular-nums">{formatCpm(row.clearing_cpm_cents, "bare")}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-0.5 text-micro font-semibold text-fg-muted tabular-nums">
                      <Arrow aria-hidden="true" className="size-3" strokeWidth={2.25} />
                      <span className="sr-only">{row.change_7d > 0 ? "up" : row.change_7d < 0 ? "down" : "flat"} </span>
                      {formatPct(Math.abs(row.change_7d), 1)}
                    </span>
                    <Sparkline data={row.sparkline} tone="neutral" height={20} className="w-12" label={`${CATEGORY_META[row.category].label} clearing CPM, 30 days`} />
                  </span>
                  {row.thin_market ? <span className="text-micro text-fg-subtle">Few trades</span> : <span className="text-micro text-fg-subtle">{row.open_bounties} open</span>}
                </button>
              </li>
            );
          })}
          {!ready
            ? Array.from({ length: 6 }, (_, index) => <li key={index} className="h-[7.25rem] rounded-2xl bg-surface-field" aria-hidden="true" />)
            : null}
        </ul>
      </section>

      <TabsContent value="prices" className="mt-0">
        <MarketPrices market={market} mine={mine} />
      </TabsContent>
      <TabsContent value="radar" className="mt-0">
        <MarketRadar category={category} />
      </TabsContent>
    </Tabs>
  );
}
