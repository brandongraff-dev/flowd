"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent, planLabel, planPriceCentsMonth, planTakeRate } from "@/lib/engine";
import type { Plan } from "@/lib/contract/types";
import { LineChart, formatCents, seriesColor, type XYMarker, type XYSeries } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { breakEven, platformCostCurve, quotePlans, type PlanQuote } from "./pricing-model";

const SPEND_MIN = 1_000;
const SPEND_MAX = 60_000;
const CHART_MAX_CENTS = SPEND_MAX * 100;

const money = (cents: number): string => formatMoney(cents);
const whole = (cents: number): string => formatMoney(cents, { cents: "never" });

function Part({ label, cents, colour }: { label: string; cents: number; colour: string }) {
  return (
    <li className="flex items-center gap-2 text-caption text-fg-muted">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colour }} />
      <span>{label}</span>
      <span className="ml-auto font-semibold text-fg tabular-nums">{money(cents)}</span>
    </li>
  );
}

/**
 * The all-in price calculator. Drag the month's creator spend and the CPM, pick a plan, and see the effective all-in CPM: creator pay, the platform
 * fee, card processing at cost and the plan price, spread over the views the spend buys. It quotes all three plans side by side and says which one is
 * cheapest, with the break-even spends from the engine. `withChart` adds the break-even chart (the pricing page).
 */
export function AllInCalculator({ withChart = false, defaultSpend = 20_000, className }: { withChart?: boolean; defaultSpend?: number; className?: string }) {
  const [spend, setSpend] = useState(defaultSpend);
  const [cpm, setCpm] = useState(200);
  const [plan, setPlan] = useState<Plan>("free");

  const result = useMemo(() => quotePlans({ spendCents: spend * 100, cpmCents: cpm }), [spend, cpm]);
  const selected = (result.quotes.find((quote) => quote.plan === plan) ?? result.quotes[0]) as PlanQuote;

  const crossings = useMemo(
    () =>
      [
        { from: "free", to: "pro" },
        { from: "free", to: "scale" },
        { from: "pro", to: "scale" },
      ] as const,
    [],
  );

  const chart = useMemo(() => {
    if (!withChart) return null;
    const curve = platformCostCurve(CHART_MAX_CENTS, 24);
    const series: XYSeries[] = (["free", "pro", "scale"] as const).map((id) => ({
      id,
      label: `${planLabel(id)} (${Math.round(planTakeRate(id) * 100)}%${id === "free" ? "" : ` + ${whole(planPriceCentsMonth(id))} a month`})`,
      points: curve.map((point) => ({ x: point.spendCents, y: point.costs[id] })),
    }));
    const markers: XYMarker[] = [
      ...crossings.flatMap((pair) => {
        const at = breakEven(pair.from, pair.to);
        if (at === null) return [];
        const cost = Math.round(at * planTakeRate(pair.from)) + planPriceCentsMonth(pair.from);
        return [{ id: `${pair.from}-${pair.to}`, x: at, y: cost, label: `${planLabel(pair.to)} beats ${planLabel(pair.from)} above ${whole(at)}` }];
      }),
      { id: "you", x: result.spendCents, y: selected.platformCents, label: `You: ${whole(result.spendCents)} a month` },
    ];
    return { series, markers };
  }, [withChart, crossings, result.spendCents, selected.platformCents]);

  const best = result.quotes.find((quote) => quote.plan === result.best) as PlanQuote;

  return (
    <GlassCard padding="none" className={cn("overflow-hidden rounded-[32px]", className)}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="grid content-start gap-7 p-5 sm:p-8">
          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">All-in price calculator</p>
            <h3 className="text-title-lg text-fg">What does a view really cost?</h3>
            <p className="text-body-sm max-w-[48ch] text-fg-muted">The price you see is the price you pay: creator pay, our fee, card processing at cost and your plan, per 1,000 verified views.</p>
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="calc-spend-label" className="text-body-sm font-semibold text-fg">
                Creator spend per month
              </span>
              <span className="font-display text-figure-md text-fg tabular-nums">{whole(spend * 100)}</span>
            </div>
            <Slider
              aria-labelledby="calc-spend-label"
              min={SPEND_MIN}
              max={SPEND_MAX}
              step={500}
              value={[spend]}
              onValueChange={([next]) => setSpend(next ?? spend)}
              format={(value) => whole(value * 100)}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="calc-cpm-label" className="text-body-sm font-semibold text-fg">
                Creator CPM (per 1,000 verified views)
              </span>
              <span className="font-display text-figure-md text-fg tabular-nums">{money(cpm)}</span>
            </div>
            <Slider aria-labelledby="calc-cpm-label" min={50} max={600} step={5} value={[cpm]} onValueChange={([next]) => setCpm(next ?? cpm)} format={money} marks={[{ value: 200, label: "$2.00 default" }]} />
          </div>

          <div className="grid gap-2.5">
            <span id="calc-plan-label" className="text-body-sm font-semibold text-fg">
              Plan
            </span>
            <SegmentedControl<Plan>
              aria-label="Plan"
              value={plan}
              onValueChange={setPlan}
              fullWidth
              options={result.quotes.map((quote) => ({ value: quote.plan, label: quote.plan === result.best ? `${quote.label} · cheapest` : quote.label }))}
            />
          </div>

          <div className="grid gap-2.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="text-body-sm font-semibold text-fg">When a bigger plan pays for itself</p>
            <ul className="grid gap-1.5 text-caption text-fg-muted">
              {crossings.map((pair) => {
                const at = breakEven(pair.from, pair.to);
                return at === null ? null : (
                  <li key={`${pair.from}-${pair.to}`} className="flex items-baseline justify-between gap-3">
                    <span>
                      {planLabel(pair.to)} is cheaper than {planLabel(pair.from)} above
                    </span>
                    <span className="font-semibold text-fg tabular-nums">{whole(at)} a month</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="grid content-start gap-6 border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="grid gap-2" aria-live="polite">
            <p className="text-caption font-medium text-fg-muted">Effective all-in CPM on {selected.label}</p>
            <p className="font-display text-figure-hero text-fg tabular-nums">{money(selected.effectiveCpmCents)}</p>
            <p className="text-body-sm text-fg-muted">
              per 1,000 verified views, {selected.views.toLocaleString("en-US")} views for {whole(result.spendCents)} of creator pay.
            </p>
          </div>

          <ul className="grid gap-2 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]" aria-label="What makes up the price, per 1,000 views">
            <Part label="Creator pay" cents={selected.creatorCpmCents} colour={seriesColor(0)} />
            <Part label={`Platform fee (${formatPercent(selected.takeRate, 0)})`} cents={selected.feeCpmCents} colour={seriesColor(1)} />
            <Part label="Card processing, at cost" cents={selected.processingCpmCents} colour={seriesColor(2)} />
            <Part label={selected.subscriptionCents > 0 ? `${selected.label} plan, spread over the views` : "Plan (free)"} cents={selected.planCpmCents} colour={seriesColor(3)} />
          </ul>

          <div className="grid gap-2">
            <p className="text-caption font-medium text-fg-muted">The three plans at this spend</p>
            <ul className="grid gap-2">
              {result.quotes.map((quote) => (
                <li
                  key={quote.plan}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]",
                    quote.plan === plan ? "bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "bg-surface-field",
                  )}
                >
                  <span className="text-body-sm font-semibold text-fg">{quote.label}</span>
                  {quote.plan === result.best ? (
                    <Badge size="sm" tone="mint">
                      Cheapest
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-caption text-fg-subtle tabular-nums">
                    fee + plan {whole(quote.platformCents)} a month
                  </span>
                  <span className="font-display text-figure-md text-fg tabular-nums">{money(quote.effectiveCpmCents)}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-fg-subtle">
              {result.savingsVsFreeCents > 0
                ? `At ${whole(result.spendCents)} a month, ${best.label} saves ${whole(result.savingsVsFreeCents)} a month against Free.`
                : "At this spend the Free plan is the cheapest. Pro starts to win above $14,950 a month."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/signup/brand" className={buttonVariants({ variant: "primary" })}>
              Start free
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/tools/price-calculator" className={buttonVariants({ variant: "secondary" })}>
              Compare with other models
            </Link>
          </div>
          <p className="text-caption text-fg-subtle">Assumes one card top-up a month (2.9% + $0.30). Your first bounty has the fee waived, and flowd matches up to $500.</p>
        </div>
      </div>

      {chart ? (
        <div className="border-t border-divider p-5 sm:p-8">
          <LineChart
            bare
            height={300}
            title="When a higher plan starts to pay for itself"
            subtitle="Monthly platform cost (fee plus plan, before card processing) by creator spend."
            summary={`Free costs 12% of spend, Pro costs $299 plus 10% and Scale $999 plus 8%. Pro becomes cheaper than Free above ${whole(breakEven("free", "pro") ?? 0)} a month, Scale cheaper than Free above ${whole(breakEven("free", "scale") ?? 0)}, and Scale cheaper than Pro above ${whole(breakEven("pro", "scale") ?? 0)}.`}
            series={chart.series}
            markers={chart.markers}
            xFormat={(x) => formatCents(Number(x), true)}
            xTooltipFormat={(x) => `${whole(Number(x))} of creator spend a month`}
            yFormat={(value) => formatCents(value, true)}
            yTooltipFormat={(value) => formatCents(value)}
            xAxisTitle="Creator spend per month"
            yAxisTitle="Fee plus plan"
            curve="linear"
            zero
            legend
          />
        </div>
      ) : null}
    </GlassCard>
  );
}
