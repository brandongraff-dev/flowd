"use client";

import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSTANTS, DEFAULT_CPA_RATES, expectedEarnings, formatInt, formatMoney, planTakeRate, settlePost } from "@/lib/engine";
import { seriesColor } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Money } from "@/components/ui/money";
import { Slider } from "@/components/ui/slider";

const CPM_CENTS = CONSTANTS.pay.default_cpm_cents;
const CAP_CENTS = CONSTANTS.pay.default_per_video_cap_cents;
const TAKE = planTakeRate("free");

interface Leg {
  id: "cpm" | "install" | "trial" | "paid";
  label: string;
  detail: string;
  cents: number;
  tracked: boolean;
}

/**
 * One video, three ways to earn, explained by moving a slider. The CPM leg is the floor; installs, trials and paid subscriptions are bonuses that pay
 * only when a tracked link or code ties them to the video; the per-video cap covers both. The numbers come from `settlePost` and
 * `expectedEarnings`, the same functions that settle a post in the product.
 */
export function OutcomeStack() {
  const [views, setViews] = useState(40_000);

  const model = useMemo(() => {
    const expected = expectedEarnings({ base_median_views: views, cpm_cents: CPM_CENTS, rates: DEFAULT_CPA_RATES, per_video_cap_cents: CAP_CENTS }).median;
    const installs = Math.round(expected.installs);
    const trials = Math.round(expected.trials);
    const paid = Math.round(expected.paid);
    const settled = settlePost({ window_views: views, cpm_cents: CPM_CENTS, conversions: { install: installs, trial: trials, paid }, rates: DEFAULT_CPA_RATES, per_video_cap_cents: CAP_CENTS, take_rate: TAKE });

    // Settlement order: the CPM leg first, then installs, trials and paid, each inside what is left of the cap.
    let left = CAP_CENTS;
    const take = (wanted: number): number => {
      const paidOut = Math.min(wanted, left);
      left -= paidOut;
      return paidOut;
    };
    const legs: Leg[] = [
      { id: "cpm", label: "Views", detail: `${formatInt(views)} verified views at ${formatMoney(CPM_CENTS)} per 1,000`, cents: take(settled.cpm_uncapped_cents), tracked: false },
      { id: "install", label: "Installs", detail: `about ${formatInt(installs)} at ${formatMoney(DEFAULT_CPA_RATES.install)} each`, cents: take(installs * DEFAULT_CPA_RATES.install), tracked: true },
      { id: "trial", label: "Trials started", detail: `about ${formatInt(trials)} at ${formatMoney(DEFAULT_CPA_RATES.trial)} each`, cents: take(trials * DEFAULT_CPA_RATES.trial), tracked: true },
      { id: "paid", label: "Paid subscriptions", detail: `about ${formatInt(paid)} at ${formatMoney(DEFAULT_CPA_RATES.paid)} each`, cents: take(paid * DEFAULT_CPA_RATES.paid), tracked: true },
    ];
    return { legs, settled };
  }, [views]);

  const { legs, settled } = model;

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6 p-5 sm:p-8">
          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">One video, three ways to earn</p>
            <h3 className="text-title-lg text-fg">Slide the views. Watch the stack build.</h3>
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="outcome-views-label" className="text-body-sm font-semibold text-fg">
                Verified views in the 72-hour window
              </span>
              <span className="font-display text-figure-md text-fg tabular-nums">{formatInt(views)}</span>
            </div>
            <Slider aria-labelledby="outcome-views-label" min={5_000} max={200_000} step={5_000} value={[views]} onValueChange={([next]) => setViews(next ?? views)} format={(value) => formatInt(value)} />
            <ChipGroup aria-label="Example view counts">
              {[10_000, 40_000, 120_000].map((preset) => (
                <Chip key={preset} size="sm" selected={views === preset} onSelectedChange={() => setViews(preset)}>
                  {formatInt(preset)} views
                </Chip>
              ))}
            </ChipGroup>
          </div>

          <ul className="grid gap-2" aria-label="What this video pays">
            {legs.map((leg, index) => (
              <li key={leg.id} className="flex items-center gap-3 rounded-2xl bg-surface-field px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px]" style={{ background: seriesColor(index) }} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm font-semibold text-fg">
                    {leg.label}
                    {leg.tracked ? (
                      <Badge tone="info" variant="outline" size="sm">
                        Tracked
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-caption text-fg-subtle">{leg.detail}</span>
                </span>
                <Money cents={leg.cents} state="cleared" signDisplay="always" size="sm" icon={false} />
              </li>
            ))}
          </ul>

          <p className="text-caption max-w-[64ch] text-fg-subtle">
            An estimate at typical funnel rates: 0.45% of views visit, 38% of visits install, 6.2% of installs start a trial and 34.8% of trials pay. Only conversions tied by a tracked link or
            promo code are paid; estimated sources (an MMP, a survey, a model) never are. Results vary.
          </p>
        </div>

        <div className="grid content-start gap-6 border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <p className="text-caption font-medium text-fg-muted">Creator receives</p>
                <Money cents={settled.pay_cents} state="cleared" size="xl" animate />
                <p className="text-caption text-fg-subtle">No fee, ever</p>
              </div>
              <div className="grid gap-1">
                <p className="text-caption font-medium text-fg-muted">Brand pays (Free plan)</p>
                <Money cents={settled.brand_cost_cents} state="neutral" size="xl" animate />
                <p className="text-caption text-fg-subtle">Pay plus {Math.round(TAKE * 100)}% fee</p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex h-5 w-full gap-0.5" role="img" aria-label={`Pay by source, out of the ${formatMoney(CAP_CENTS, { cents: "never" })} per-video cap: ${legs.map((leg) => `${leg.label} ${formatMoney(leg.cents)}`).join(", ")}.`}>
                {legs.map((leg, index) => (
                  <span
                    key={leg.id}
                    className="h-full min-w-0 rounded-[4px] first:rounded-l-md"
                    style={{ flexBasis: `${(leg.cents / CAP_CENTS) * 100}%`, flexGrow: 0, flexShrink: 0, background: seriesColor(index) }}
                  />
                ))}
                <span className="h-full min-w-0 flex-1 rounded-r-md bg-surface-active" />
              </div>
              <div className="flex items-center justify-between text-micro text-fg-subtle tabular-nums">
                <span>$0</span>
                <span>Per-video cap {formatMoney(CAP_CENTS, { cents: "never" })}</span>
              </div>
              {settled.capped ? (
                <p className={cn("rounded-xl bg-sun-soft px-3 py-2 text-caption text-sun")}>The cap is reached. Anything above it is unpaid, for CPM and bonuses together.</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <h4 className="font-display text-title-sm text-fg">The cap covers views and bonuses together</h4>
            <dl className="grid gap-1.5 text-body-sm">
              {[
                ["Earned before the cap", settled.cpm_uncapped_cents + settled.cpa_uncapped_cents],
                ["Paid", settled.pay_cents],
                ["Room left under the cap", settled.cap_remaining_cents],
              ].map(([label, cents]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="font-semibold text-fg tabular-nums">{formatMoney(Number(cents))}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid gap-3 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Megaphone className="size-[18px]" strokeWidth={1.75} />
              </span>
              <div className="grid gap-1">
                <h4 className="font-display text-title-sm text-fg">Then, if a brand runs it as an ad</h4>
                <p className="text-body-sm text-pretty text-fg-muted">
                  You keep earning: {Math.round(CONSTANTS.pay.ad_commission_rate * 100)}% of ad-attributed revenue for {CONSTANTS.pay.ad_commission_days} days. It sits outside the cap, needs your one-tap consent, and its term is written on the
                  Rights Card before you accept.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
