"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { allInBreakdown, CONSTANTS, cpmPercentile, expectedEarnings, fillTime, formatHours, formatMoney, formatPercent, suggestCpm, trendCopy } from "@/lib/engine";
import { LineChart, type XYSeries } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { DemoTag } from "@/components/shell/demo-banner";
import type { MarketRow } from "./data";

type View = "brands" | "creators";

const TARGETS = [
  { hours: 24, label: "About a day" },
  { hours: 48, label: "2 days" },
  { hours: 168, label: "A week" },
] as const;

const money = (cents: number): string => formatMoney(cents);

/** Axis ticks for a fill time: hours up to two days, then days. */
const axisHours = (hours: number): string => (hours <= 0 ? "0" : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} d`);

function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid content-start gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]", className)}>
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className="font-display text-figure-lg text-fg tabular-nums">{value}</dd>
      {sub ? <dd className="text-caption text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

function TrendArrow({ trend }: { trend: MarketRow["trend"] }) {
  const Icon = trend === "rising" ? ArrowUpRight : trend === "falling" ? ArrowDownRight : ArrowRight;
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />;
}

/**
 * The market, live in the page: pick a category, drag the price, and the engine answers the question both sides ask. Brands see how long that
 * price takes to fill and what it costs all-in; creators see what a typical post earns at it. It is the same `fillTime`, `suggestCpm` and
 * `expectedEarnings` the product uses, fed with the demo market. Day-one pricing is a heuristic and the confidence is on the face of it.
 */
export function MarketModule({ rows }: { rows: MarketRow[] }) {
  const first = rows[0];
  const [view, setView] = useState<View>("brands");
  const [category, setCategory] = useState<string>(first?.category ?? "");
  const row = rows.find((candidate) => candidate.category === category) ?? first;
  const [cpm, setCpm] = useState<number>(first?.clearing_cpm_cents ?? 200);

  const model = useMemo(() => {
    if (!row) return null;
    const quartiles = { p25: row.p25_cpm_cents, median: row.clearing_cpm_cents, p75: row.p75_cpm_cents };
    const fill = fillTime({ cpm_cents: cpm, clearing_cpm_cents: row.clearing_cpm_cents, median_fill_hours: row.median_fill_hours, sample_n: row.sample_n });
    const percentile = cpmPercentile(cpm, quartiles);
    const price = allInBreakdown({ rate_cents: cpm, plan: "free" });
    const earnings = expectedEarnings({ base_median_views: row.median_views, cpm_cents: cpm, per_video_cap_cents: CONSTANTS.pay.default_per_video_cap_cents });
    const min = Math.max(CONSTANTS.pay.floor_cpm_cents, Math.round((row.clearing_cpm_cents * 0.4) / 5) * 5);
    const max = Math.max(Math.round((row.clearing_cpm_cents * 3) / 5) * 5, min + 100);
    const suggestions = TARGETS.map((target) => ({
      ...target,
      result: suggestCpm({
        clearing_cpm_cents: row.clearing_cpm_cents,
        p25_cpm_cents: row.p25_cpm_cents,
        p75_cpm_cents: row.p75_cpm_cents,
        median_fill_hours: row.median_fill_hours,
        sample_n: row.sample_n,
        target_fill_hours: target.hours,
        category_label: row.label,
      }),
    }));
    const points: number[] = [];
    const stride = Math.max(5, Math.round((max - min) / 20 / 5) * 5);
    for (let value = min; value < max; value += stride) points.push(value);
    points.push(max);
    const curves = points.map((value) => ({ value, fill: fillTime({ cpm_cents: value, clearing_cpm_cents: row.clearing_cpm_cents, median_fill_hours: row.median_fill_hours, sample_n: row.sample_n }) }));
    const series: XYSeries[] = [
      { id: "p50", label: "Half of bounties fill by", points: curves.map((point) => ({ x: point.value, y: point.fill.fill_hours_p50 })) },
      { id: "p80", label: "Four in five fill by", points: curves.map((point) => ({ x: point.value, y: point.fill.fill_hours_p80 })) },
    ];
    return { quartiles, fill, percentile, price, earnings, min, max, suggestions, series };
  }, [row, cpm]);

  if (!row || !model) return null;
  const clampCpm = (value: number): number => Math.min(model.max, Math.max(model.min, value));

  const position = `Higher than about ${model.percentile}% of bounties`;
  const summary = `At ${money(cpm)} per 1,000 views in ${row.label}, half of bounties fill in about ${formatHours(model.fill.fill_hours_p50)} and four in five within ${formatHours(model.fill.fill_hours_p80)}, at ${formatPercent(model.fill.confidence, 0)} confidence.`;

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6 p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl<View>
              aria-label="See the market as"
              value={view}
              onValueChange={setView}
              options={[
                { value: "brands", label: "As a brand" },
                { value: "creators", label: "As a creator" },
              ]}
            />
            <DemoTag>Demo data</DemoTag>
          </div>

          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">{row.label}</p>
            <h3 className="text-title-lg text-fg">
              {view === "brands" ? "What does a view cost, and how fast does it fill?" : "What does a post pay at this rate?"}
            </h3>
            <p className="text-body-sm max-w-[60ch] text-fg-muted">
              Median clearing price today is <strong className="font-semibold text-fg tabular-nums">{money(row.clearing_cpm_cents)}</strong> per 1,000 verified views (middle half {money(row.p25_cpm_cents)} to {money(row.p75_cpm_cents)}),
              from {row.sample_n} comparable bounties.{row.thin_market ? " That is a thin market, so treat it as a rough guide." : ""}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="market-price-label" className="text-body-sm font-semibold text-fg">
                {view === "brands" ? "Your price per 1,000 verified views" : "Rate a brand sets per 1,000 verified views"}
              </span>
              <span className="font-display text-figure-md text-fg tabular-nums">{money(cpm)}</span>
            </div>
            <Slider
              aria-labelledby="market-price-label"
              min={model.min}
              max={model.max}
              step={5}
              value={[cpm]}
              onValueChange={([next]) => setCpm(next ?? cpm)}
              format={money}
              marks={[{ value: row.p25_cpm_cents }, { value: row.clearing_cpm_cents, label: "Median" }, { value: row.p75_cpm_cents }]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-fg-subtle">{view === "brands" ? "Price it to fill in" : "Brands price for a fill in"}</span>
              <ChipGroup aria-label="Target fill time">
                {model.suggestions.map((target) => (
                  <Chip key={target.hours} size="sm" selected={cpm === clampCpm(target.result.cpm_cents)} onSelectedChange={() => setCpm(clampCpm(target.result.cpm_cents))}>
                    {target.label} · {money(clampCpm(target.result.cpm_cents))}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            {view === "brands" ? (
              <>
                <Stat label="Half fill within" value={formatHours(model.fill.fill_hours_p50)} sub={`Four in five within ${formatHours(model.fill.fill_hours_p80)}`} />
                <Stat label="Confidence" value={formatPercent(model.fill.confidence, 0)} sub={model.fill.thin_market ? "Thin market: few trades" : position} />
                <Stat
                  label="All-in on Free"
                  value={money(model.price.total_cents)}
                  sub={`Creator ${money(model.price.creator_cents)} + fee ${money(model.price.fee_cents)} + processing ${money(model.price.processing_cents)}`}
                />
              </>
            ) : (
              <>
                <Stat label="A typical post earns" value={money(model.earnings.median.pay_cents)} sub={`Middle range ${money(model.earnings.p25.pay_cents)} to ${money(model.earnings.p75.pay_cents)}`} />
                <Stat label="Median views per post" value={model.earnings.median.views.toLocaleString("en-US")} sub={`${row.label}, trailing 7 days`} />
                <Stat label="Open bounties" value={row.open_bounties} sub={`Half fill within ${formatHours(model.fill.fill_hours_p50)} at this price`} />
              </>
            )}
          </dl>

          <LineChart
            bare
            height={220}
            summary={summary}
            series={model.series}
            xFormat={(x) => money(Number(x))}
            xTooltipFormat={(x) => `${money(Number(x))} per 1,000 views`}
            yFormat={axisHours}
            yTooltipFormat={(value) => formatHours(value)}
            xAxisTitle="Price per 1,000 verified views"
            yAxisTitle="Time to fill"
            markers={[{ id: "you", x: cpm, y: model.fill.fill_hours_p50, label: `You: ${money(cpm)}` }]}
            curve="monotone"
            zero
            legend
          />

          <p className="text-caption max-w-[72ch] text-fg-subtle">
            {view === "creators"
              ? "Estimate from the category median of verified views per post and the $250 per-video cap, before any install or trial bonus. Posts that are not approved earn nothing, and approval isn't guaranteed. Results vary."
              : "Day-one pricing is a heuristic: p50 fill time = median fill time x (clearing price / your price) ^ 1.6, and it says how sure it is. It is replaced by a regression as bounties settle."}
          </p>
        </div>

        <div className="border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-title-sm text-fg">Clearing prices today</h3>
            <Link href="/market" className={buttonVariants({ variant: "link" })}>
              Open the Market
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Categories">
            {rows.map((item) => {
              const selected = item.category === row.category;
              return (
                <li key={item.category}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setCategory(item.category);
                      setCpm(item.clearing_cpm_cents);
                    }}
                    className={cn(
                      "flex w-full min-h-12 items-center gap-3 rounded-2xl px-3.5 py-2 text-left transition-[background-color,box-shadow] duration-(--fd-dur-fast) ease-standard",
                      selected ? "bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "hover:bg-surface-hover",
                    )}
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-body-sm font-semibold text-fg">{item.label}</span>
                      <span className="flex items-center gap-1.5 text-caption text-fg-subtle">
                        <TrendArrow trend={item.trend} />
                        {trendCopy(item.change_7d)}
                        {item.thin_market ? (
                          <Badge size="sm" tone="neutral" variant="outline" className="ml-1">
                            few trades
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                    <span className="font-display text-figure-md text-fg tabular-nums">{money(item.clearing_cpm_cents)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 grid gap-2 rounded-2xl bg-surface-field p-4 text-caption text-fg-subtle shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p>Arrows are neutral on purpose: a rising price is good news for creators and costs brands more.</p>
            <p>
              <Badge size="sm" tone="neutral" variant="outline" className="mr-1.5">few trades</Badge>
              means fewer than 8 comparable bounties, so the number is a rough guide.
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
