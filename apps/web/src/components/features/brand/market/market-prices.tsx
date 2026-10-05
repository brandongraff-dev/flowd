"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Info, Target } from "lucide-react";
import { AppIcon } from "@/components/brand";
import { LineChart, RangeBand, formatCents, type XYReference } from "@/components/charts";
import { GlassCard } from "@/components/glass";
import { DataTable, Delta, Section, StatCard, type DataColumn } from "@/components/shell";
import { Badge, Button, Callout, Chip, ChipGroup, Popover, PopoverContent, PopoverTrigger, Progress, Skeleton, SkeletonGroup, Slider, buttonVariants } from "@/components/ui";
import { HOOK_TYPE_META } from "@/lib/contract/types";
import { CONSTANTS } from "@/lib/engine";
import { usePriceSuggestion, useStoreReady } from "@/lib/data";
import type { MarketView } from "@/lib/data/selectors/market";
import type { BountyView } from "@/lib/data/selectors/bounties";
import { formatCompact, formatCpm, formatDate, formatMoney, formatPct, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hoursLabel } from "./fmt";

const TARGETS = [
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

const POSITION_COPY = {
  below_p25: "Below the 25th percentile: cheaper than most, and slower to fill.",
  p25_to_median: "Between the 25th percentile and the median: a little under the market.",
  median_to_p75: "Between the median and the 75th percentile: a little above the market.",
  above_p75: "Above the 75th percentile: one of the best-paying bounties in this category.",
} as const;

const HEAT_COPY = { cool: "Cool", warm: "Warm", hot: "Hot" } as const;

const dollars = (cents: number): string => formatCents(cents);

function MarketSkeleton() {
  return (
    <SkeletonGroup label="Loading the market" className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-72" />
    </SkeletonGroup>
  );
}

/** The slider's "Why this price" popover: every input of the estimate, in words, with the real numbers. */
function WhyThisPrice({ market, cpm, confidence, p50 }: { market: MarketView; cpm: number; confidence: number; p50: number }) {
  const P = CONSTANTS.pricing_model;
  const n = market.stats.sample_n;
  const weight = n / (n + P.confidence_k);
  const distance = Math.min(0.5, Math.abs(Math.log(Math.max(1, cpm) / Math.max(1, market.stats.clearing_cpm_cents))));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="plain" size="xs" leadingIcon={<Info />}>
          Why this price
        </Button>
      </PopoverTrigger>
      <PopoverContent width="lg" align="end">
        <p className="text-body-sm font-semibold text-fg">How this estimate is made</p>
        <ol className="mt-3 grid gap-3 text-caption text-fg-muted">
          <li>
            <span className="font-semibold text-fg">Market price.</span> The category&apos;s clearing CPM is {formatCpm(market.stats.clearing_cpm_cents, "short")}, the median of {pluralise(n, "recent trade")} as of {formatDate(market.as_of, "medium")}.
          </li>
          <li>
            <span className="font-semibold text-fg">Fill time.</span> Typical bounties here fill in {hoursLabel(market.stats.median_fill_hours)}. Fill time shrinks as price rises: time = typical time × (market ÷ your price) to the power {P.fill_exponent}, never under {P.min_fill_hours} hours. At your price that is {hoursLabel(p50)}.
          </li>
          <li>
            <span className="font-semibold text-fg">Confidence {Math.round(confidence * 100)}%.</span> It is how much we trust the number: {Math.round(weight * 100)}% for the size of the sample, times {Math.round((1 - distance) * 100)}% for how close your price sits to what has been observed.
          </li>
          <li>
            <span className="font-semibold text-fg">Slow end.</span> About 4 in 5 bounties fill within {P.p80_multiplier} times the typical time.
          </li>
        </ol>
        <p className="mt-3 text-micro text-fg-subtle">A model of recent prices, not a promise. Creator supply moves day to day.</p>
      </PopoverContent>
    </Popover>
  );
}

function PriceVsFill({ market, mine }: { market: MarketView; mine: readonly BountyView[] }) {
  const stats = market.stats;
  const [cpm, setCpm] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const base = usePriceSuggestion({ category: market.category, ...(target !== null ? { target_hours: target } : {}) });
  const step = 5;
  const min = Math.max(50, Math.floor((stats.clearing_cpm_cents * 0.5) / step) * step);
  const max = Math.ceil((stats.clearing_cpm_cents * 2) / step) * step;
  const value = Math.min(max, Math.max(min, cpm ?? base?.cpm_cents ?? stats.clearing_cpm_cents));
  /** The estimate for exactly the price on the slider, so the figure and the readout never disagree. */
  const suggestion = usePriceSuggestion({ category: market.category, cpm_cents: value, ...(target !== null ? { target_hours: target } : {}) });
  if (!suggestion || !base) return <Skeleton className="h-96" />;
  const fill = suggestion.fill;

  const curve = suggestion.curve;
  const series = [
    { id: "p50", label: "Typical fill time (median)", points: curve.map((point) => ({ x: point.cpm_cents, y: Math.round(point.fill_hours_p50) })) },
    { id: "p80", label: "Slow end (4 in 5 fill sooner)", points: curve.map((point) => ({ x: point.cpm_cents, y: Math.round(point.fill_hours_p80) })) },
  ];
  const yourMine = mine.find((bounty) => bounty.cpm_cents > 0);

  return (
    <GlassCard padding="lg" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">Price against fill time</h2>
          <p className="max-w-[60ch] text-body-sm text-fg-muted">Drag to try a price. Higher prices fill faster, with diminishing returns. The estimate comes with a confidence, never a promise.</p>
        </div>
        <WhyThisPrice market={market} cpm={value} confidence={fill.confidence} p50={fill.fill_hours_p50} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-caption font-medium text-fg-muted">Your price per 1,000 views</p>
              <p className="font-display text-figure-lg text-fg tabular-nums" aria-live="polite">
                {dollars(value)}
              </p>
            </div>
            <Slider
              aria-label="Price per 1,000 views"
              min={min}
              max={max}
              step={step}
              value={[value]}
              onValueChange={([next]) => setCpm(next)}
              format={dollars}
              marks={[
                { value: Math.min(max, Math.max(min, stats.p25_cpm_cents)) },
                { value: Math.min(max, Math.max(min, stats.clearing_cpm_cents)), label: "Market" },
                { value: Math.min(max, Math.max(min, stats.p75_cpm_cents)) },
              ]}
            />
          </div>

          <div className="grid gap-2.5">
            <p id="target-label" className="text-body-sm font-medium text-fg">
              Or start from how fast you need it
            </p>
            <ChipGroup aria-labelledby="target-label">
              <Chip
                size="sm"
                selected={cpm === null && target === null}
                onSelectedChange={() => {
                  setTarget(null);
                  setCpm(null);
                }}
              >
                At the market price
              </Chip>
              {TARGETS.map((entry) => (
                <Chip
                  key={entry.hours}
                  size="sm"
                  selected={cpm === null && target === entry.hours}
                  onSelectedChange={() => {
                    setTarget(entry.hours);
                    setCpm(null);
                  }}
                >
                  Fill in {entry.label}
                </Chip>
              ))}
            </ChipGroup>
            {cpm === null ? <p className="text-caption text-fg-subtle">{target === null ? `The market price is ${dollars(base.cpm_cents)}.` : `Suggested ${dollars(base.cpm_cents)} to fill in about ${hoursLabel(target).replace("about ", "")}.`} {base.basis}</p> : <p className="text-caption text-fg-subtle">Your own price. Pick one of the options above to return to a suggestion.</p>}
          </div>
        </div>

        <div className="grid content-start gap-5">
          <div className="grid gap-1 rounded-2xl bg-surface-field p-5">
            <p className="text-caption font-medium text-fg-muted">At {dollars(value)} a bounty fills in</p>
            <p className="font-display text-figure-xl text-fg">{hoursLabel(fill.fill_hours_p50).replace("about ", "about ")}</p>
            <p className="text-body-sm text-fg-muted">
              Slow end <span className="font-semibold text-fg">{hoursLabel(fill.fill_hours_p80).replace("about ", "")}</span>. {POSITION_COPY[suggestion.position]}
            </p>
            <p className="text-caption text-fg-subtle">Higher than {suggestion.percentile}% of bounties in {market.label}.</p>
          </div>
          <Progress value={Math.round(fill.confidence * 100)} tone="accent" label="Confidence in this estimate" trailing={`${Math.round(fill.confidence * 100)}%`} aria-label="Confidence in this estimate" valueText={`${Math.round(fill.confidence * 100)} percent`} />
          {fill.thin_market ? (
            <Callout tone="sun" title="Few trades here">
              Under {CONSTANTS.pricing_model.thin_market_min_sample} comparable bounties, so treat this as a rough guide.
            </Callout>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary" })}>
              <Target aria-hidden="true" />
              Start a bounty at {dollars(value)}
            </Link>
            {yourMine ? <p className="text-caption text-fg-subtle">Yours today: {yourMine.title} at {formatCpm(yourMine.cpm_cents, "short")}</p> : null}
          </div>
        </div>
      </div>

      <LineChart
        title="Fill time at each price"
        subtitle={`${market.label} · hours until a bounty fills, six prices around the market`}
        summary={`Typical fill time falls from about ${Math.round(curve[0]?.fill_hours_p50 ?? 0)} hours at ${dollars(curve[0]?.cpm_cents ?? 0)} to about ${Math.round(curve[curve.length - 1]?.fill_hours_p50 ?? 0)} hours at ${dollars(curve[curve.length - 1]?.cpm_cents ?? 0)}; the slow end is about ${CONSTANTS.pricing_model.p80_multiplier} times longer.`}
        series={series}
        yFormat={(hours) => (hours >= 48 ? `${Math.round(hours / 24)} d` : `${Math.round(hours)} h`)}
        yTooltipFormat={(hours) => hoursLabel(hours)}
        xFormat={(x) => dollars(Number(x))}
        xTooltipFormat={(x) => `${dollars(Number(x))} per 1,000 views`}
        xAxisTitle="Price per 1,000 views"
        yAxisTitle="Time to fill"
        curve="monotone"
        height={240}
        dots
        legend
        zero
        xLabel="Price"
      />
    </GlassCard>
  );
}

/** The Prices tab of the Market view for one category. */
export function MarketPrices({ market, mine }: { market: MarketView | undefined; mine: readonly BountyView[] }) {
  const ready = useStoreReady();
  const mineIds = useMemo(() => new Set(mine.map((bounty) => bounty.id)), [mine]);
  if (!ready || !market) return <MarketSkeleton />;
  const { stats } = market;

  const references: XYReference[] = mine.filter((bounty) => bounty.cpm_cents > 0).slice(0, 1).map((bounty) => ({ id: bounty.id, y: bounty.cpm_cents, label: `Your bounty ${dollars(bounty.cpm_cents)}`, tone: "neutral" as const }));
  const data = market.series.map((point) => ({ x: new Date(`${point.date}T00:00:00Z`), p25: point.p25_cpm_cents, median: point.clearing_cpm_cents, p75: point.p75_cpm_cents }));
  const days = data.length;
  const first = market.series[0];
  const last = market.series[market.series.length - 1];

  const columns: DataColumn<BountyView>[] = [
    {
      id: "bounty",
      header: "Bounty",
      card: "title",
      minWidth: "12rem",
      sortValue: (row) => row.title,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <AppIcon art={row.app.icon} name={row.app.name} size={28} decorative />
          <span className="grid min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-fg">{row.title}</span>
              {mineIds.has(row.id) ? (
                <Badge size="sm" tone="accent">
                  Yours
                </Badge>
              ) : null}
            </span>
            <span className="truncate text-caption text-fg-subtle">{row.brand.name}</span>
          </span>
        </span>
      ),
    },
    { id: "cpm", header: "CPM", align: "end", sortValue: (row) => row.cpm_cents, cell: (row) => (row.cpm_cents > 0 ? <span className="font-semibold text-fg">{formatCpm(row.cpm_cents, "bare")}</span> : <span className="text-fg-subtle">No CPM</span>) },
    { id: "left", header: "Pool left", align: "end", hideBelow: "md", sortValue: (row) => row.budget_left_cents, cell: (row) => formatMoney(row.budget_left_cents, { cents: "never" }) },
    { id: "fill", header: "Filled", align: "end", sortValue: (row) => row.fill_ratio, cell: (row) => formatPct(row.fill_ratio, 0) },
    { id: "spots", header: "Spots", align: "end", hideBelow: "xl", sortValue: (row) => row.spots_left, cell: (row) => row.spots_left },
  ];

  return (
    <div className="grid gap-10">
      {stats.from_baseline ? (
        <Callout tone="info" title="Starting estimate">
          This category has little live history, so the numbers come from a baseline for similar apps. They sharpen as bounties settle.
        </Callout>
      ) : null}
      {market.thin_market ? (
        <Callout tone="sun" icon={<Info />} title="Few trades in this category">
          Only {pluralise(stats.sample_n, "comparable bounty")} so far, so prices move more and the estimates carry less confidence.
        </Callout>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RangeBand
          title="What a thousand views costs"
          subtitle={`${market.label} · clearing CPM over ${days} days · ${market.stats.sample_n} trades`}
          summary={`The median clearing CPM for ${market.label} went from ${dollars(first?.clearing_cpm_cents ?? 0)} to ${dollars(last?.clearing_cpm_cents ?? 0)} per thousand verified views over ${days} days. The middle half of trades sits between ${dollars(stats.p25_cpm_cents)} and ${dollars(stats.p75_cpm_cents)} today.`}
          data={data}
          medianLabel="Clearing CPM (median)"
          yFormat={(cents) => dollars(cents)}
          yTooltipFormat={(cents) => `${dollars(cents)} per 1,000 views`}
          references={references}
          height={300}
          xLabel="Date"
          footer={references.length > 0 ? `The line is your live CPM bounty "${mine.find((bounty) => bounty.cpm_cents > 0)?.title ?? ""}". Median with the middle half of trades shaded.` : `Median with the middle half of trades shaded. Updated ${formatDate(market.as_of, "medium")}.`}
        />
        <div className="grid gap-4">
          <StatCard
            size="xl"
            label="Clearing CPM, median"
            value={<span className="tabular-nums">{formatCpm(stats.clearing_cpm_cents, "bare")}</span>}
            hint={`Middle half ${dollars(stats.p25_cpm_cents)} to ${dollars(stats.p75_cpm_cents)}`}
          />
          <GlassCard padding="md" className="grid gap-3">
            <p className="text-caption font-medium text-fg-muted">Change in clearing CPM</p>
            <div className="grid gap-2">
              <Delta ratio={stats.change_7d} against="vs 7 days ago" digits={1} />
              <Delta ratio={stats.change_30d} against="vs 30 days ago" digits={1} />
            </div>
            <p className="text-caption text-fg-subtle">{market.trend_copy}. A rising price is not good or bad: it means brands compete harder for creators.</p>
          </GlassCard>
        </div>
      </div>

      <PriceVsFill key={market.category} market={market} mine={mine} />

      <Section title="Supply and demand" description={`Who is posting and what is funded in ${market.label}, today.`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Creators here" value={market.supply.creators_in_category} hint="Active on flowd" />
            <StatCard label="Open bounties" value={market.supply.open_bounties} hint="Funded and live" />
            <StatCard label="Open budget" cents={market.supply.open_budget_cents} hint="Pools still free" />
            <StatCard label="Submissions, 7 days" value={market.supply.submissions_7d} hint="Sent for review" />
          </div>
          <GlassCard padding="md" className="grid content-start gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
                <Flame aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.75} />
                Competition for creators
              </h3>
              <Badge size="lg" tone="neutral" variant="outline">
                {HEAT_COPY[market.heat.level]}
              </Badge>
            </div>
            <div role="meter" aria-label="Competition for creators" aria-valuemin={0} aria-valuemax={100} aria-valuenow={market.heat.score} aria-valuetext={`${HEAT_COPY[market.heat.level]}, ${market.heat.score} out of 100`} className="relative h-2.5 rounded-pill bg-surface-active">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1/3 rounded-l-pill border-r border-bg opacity-30 bg-fg-subtle" />
              <div aria-hidden="true" className="absolute inset-y-0 left-1/3 w-1/3 border-r border-bg opacity-55 bg-fg-subtle" />
              <div aria-hidden="true" className="absolute inset-y-0 left-2/3 w-1/3 rounded-r-pill opacity-85 bg-fg-subtle" />
              <span aria-hidden="true" className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-[0_0_0_3px_var(--fd-surface)]" style={{ left: `${Math.min(97, Math.max(3, market.heat.score))}%` }} />
            </div>
            <p className="text-body-sm text-fg-muted">{market.heat.for_brands}</p>
            <p className="text-caption text-fg-subtle">
              Open budget covers about {Math.round(market.heat.budget_cover_days)} days of creator supply, with {Math.round(market.heat.bounties_per_100_submissions)} open bounties per 100 daily submissions.
            </p>
          </GlassCard>
        </div>
      </Section>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Competing bounties" description="Funded and live in this category, best-paying first.">
          <DataTable
            caption={`Open funded bounties in ${market.label}`}
            columns={columns}
            rows={market.open_bounties}
            getRowId={(row) => row.id}
            density="compact"
            stickyHeader={false}
            defaultSort={{ id: "cpm", direction: "desc" }}
            empty={{ art: "bounty", title: "No open bounties here", description: "Yours would be the first. Creators in this category can see it as soon as it is funded." }}
          />
        </Section>

        <Section title="Hooks converting best" description="Trial rate from settled posts. Sample size sits beside each.">
          <GlassCard padding="md">
            {market.top_hooks.length === 0 ? (
              <p className="py-4 text-center text-body-sm text-fg-muted">No settled posts in this category yet.</p>
            ) : (
              <ul className="grid gap-4">
                {market.top_hooks.slice(0, 6).map((hook) => {
                  const top = Math.max(...market.top_hooks.map((entry) => entry.trial_rate ?? 0), 0.01);
                  return (
                    <li key={hook.hook_type} className="grid gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="font-medium text-fg">{HOOK_TYPE_META[hook.hook_type].label}</span>
                        <span className="text-fg-muted tabular-nums">{hook.trial_rate === null ? "Not enough installs" : `${formatPct(hook.trial_rate, 1)} of installs start a trial`}</span>
                      </div>
                      <div className="h-2 rounded-pill bg-surface-active" aria-hidden="true">
                        <div className={cn("h-full rounded-pill bg-(--fd-chart-1)", hook.trial_rate === null && "opacity-30")} style={{ width: `${hook.trial_rate === null ? 8 : Math.max(8, (hook.trial_rate / top) * 100)}%` }} />
                      </div>
                      <p className="text-micro text-fg-subtle tabular-nums">{pluralise(hook.posts, "settled post")}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </Section>
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-fg-subtle">
        Prices are what funded bounties actually pay, in CPM: cents per 1,000 verified views, before the platform fee. Median views per post here: {formatCompact(stats.median_views)}.
        <Link href="/market" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Public market
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}
