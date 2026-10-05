"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HOOK_TYPE_META, type HookType } from "@/lib/contract/types";
import { useFunnel } from "@/lib/data";
import type { BountyDetail } from "@/lib/data/selectors";
import { formatCompact, formatInt, formatMoney } from "@/lib/format";
import { FunnelChart, type FunnelStage } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { Fact, Panel, SourceChip } from "../common";

const ROAS_BADGE = { early_signal: "Early signal", decision: "Decision grade", long_term: "Long term" } as const;

/**
 * Funnel: views to paid for this bounty with what each stage cost, the Tracked and Estimated counts kept apart (only Tracked pays a CPA bonus),
 * the return on spend with its maturity (day 7 is an early signal, not a verdict) and which hook types converted. Small samples say so.
 */
export function FunnelTab({ detail }: { detail: BountyDetail }) {
  const funnel = useFunnel({ brand: "mine", bounty: detail.bounty.id });
  const c = detail.funnel;
  const stats = funnel.stats;
  const stages: FunnelStage[] = [
    { id: "views", label: "Views", value: c.views, kind: "tracked", note: "Platform-reported and verified at the 72-hour window." },
    { id: "clicks", label: "Visits", value: c.clicks, kind: "tracked", note: "Clicks on joinflowd.io links and offer-code lookups." },
    { id: "installs", label: "Installs", value: c.installs, kind: "tracked", ...(stats.cost_per_install_cents ? { detail: `${formatMoney(stats.cost_per_install_cents)} per install` } : {}), note: "Deferred-link and code redemptions." },
    { id: "trials", label: "Trials", value: c.trials, kind: "tracked", ...(stats.cost_per_trial_cents ? { detail: `${formatMoney(stats.cost_per_trial_cents)} per trial` } : {}), note: "RevenueCat events matched to a flowd link or code." },
    { id: "paid", label: "Paid", value: c.paid, kind: "tracked", ...(stats.cost_per_paid_cents ? { detail: `${formatMoney(stats.cost_per_paid_cents)} each` } : {}), note: "Paid subscriptions matched to a flowd link or code." },
  ];
  const estimated = c.est_installs + c.est_trials + c.est_paid;
  const empty = c.views === 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
      <FunnelChart
        key={funnel.loading ? "loading" : empty ? "empty" : "ready"}
        title="Funnel"
        subtitle={`${detail.bounty.title}, since it went live`}
        summary={`${formatCompact(c.views)} verified views led to ${formatInt(c.installs)} tracked installs, ${formatInt(c.trials)} tracked trials and ${formatInt(c.paid)} tracked paid subscriptions.`}
        stages={stages}
        state={funnel.loading ? "loading" : empty ? "empty" : "ready"}
        empty={{ title: "No funnel yet", description: "Views and installs appear once an approved video has been posted for a day." }}
        footer={
          estimated > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SourceChip kind="estimated" />
              <span>{formatInt(estimated)} more conversions are modelled from surveys and partners. They never pay a bonus and are never added above.</span>
            </span>
          ) : (
            "Tracked means a flowd link or code counted it. CPA bonuses pay only on tracked results."
          )
        }
      />

      <div className="grid gap-5">
        <Panel title="What it cost" description="Creator pay plus platform fee, settled so far">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Fact label="Spent">
              <Money cents={detail.bounty.spent_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Per 1,000 views">{detail.cost.cpm_cents === null ? "Not enough data" : formatMoney(detail.cost.cpm_cents)}</Fact>
            <Fact label="Per install">{detail.cost.per_install_cents === null ? "Not enough data" : formatMoney(detail.cost.per_install_cents)}</Fact>
            <Fact label="Per trial">{detail.cost.per_trial_cents === null ? "Not enough data" : formatMoney(detail.cost.per_trial_cents)}</Fact>
          </dl>
        </Panel>

        <Panel title="Return on spend" description="Tracked revenue within n days of posting, over what you spent" actions={<SourceChip kind="tracked" />}>
          {funnel.loading ? (
            <Skeleton className="h-20 w-full" />
          ) : funnel.counts.views === 0 ? (
            <p className="text-body-sm text-fg-muted">Return shows once a post has run for a week.</p>
          ) : (
            <>
              <ul className="grid grid-cols-3 gap-3">
                {([7, 30, 90] as const).map((days) => {
                  const point = stats.roas[days];
                  return (
                    <li key={days} className="grid gap-1 rounded-[16px] bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                      <span className="text-caption text-fg-subtle">Day {days}</span>
                      <span className="font-display text-figure-md text-fg tabular-nums">{point.mature || point.value > 0 ? `${point.value.toFixed(2)}x` : "–"}</span>
                      <Tooltip content={point.mature ? "The cohort has this many days of data, so the figure is final for the horizon." : "Some posts are younger than this. The figure is to date and will move."}>
                        <span tabIndex={0} className="w-fit rounded-pill outline-offset-2">
                          <Badge tone={point.mature ? "neutral" : "sun"} size="sm" variant={point.mature ? "soft" : "outline"}>
                            {point.mature ? ROAS_BADGE[point.maturity] : "To date"}
                          </Badge>
                        </span>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
              <p className="text-caption text-fg-subtle">
                {stats.payback_day !== null ? `Tracked revenue covered the spend on day ${stats.payback_day}.` : "Tracked revenue has not covered the spend yet."} Day 7 is an early signal, not a verdict.
              </p>
            </>
          )}
        </Panel>

        <Panel title="By hook type" description="Which openings turned views into trials">
          {funnel.by_hook_type.length === 0 ? (
            <p className="text-body-sm text-fg-muted">Hook results appear once posts have been tagged and have a few days of data.</p>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-body-sm">
              <caption className="sr-only">Results by hook type</caption>
              <thead>
                <tr className="text-caption font-semibold text-fg-subtle">
                  <th scope="col" className="pb-2 text-left">
                    Hook
                  </th>
                  <th scope="col" className="pb-2 text-right">
                    Posts
                  </th>
                  <th scope="col" className="pb-2 text-right">
                    Trials
                  </th>
                  <th scope="col" className="pb-2 text-right">
                    Per trial
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.by_hook_type.slice(0, 6).map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="border-t border-divider py-2 text-left font-medium text-fg">
                      {HOOK_TYPE_META[row.key as HookType]?.label ?? row.key}
                    </th>
                    <td className="border-t border-divider py-2 text-right text-fg-muted tabular-nums">{row.n}</td>
                    <td className="border-t border-divider py-2 text-right text-fg-muted tabular-nums">{row.funnel.trials}</td>
                    <td className="border-t border-divider py-2 text-right font-medium text-fg tabular-nums">{row.cost_per_trial_cents === null ? "–" : formatMoney(row.cost_per_trial_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-caption text-fg-subtle">Per-hook samples are small. Treat a gap as a lead to test, not a result.</p>
          <div>
            <Link href="/brand/analytics" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open the full funnel
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
