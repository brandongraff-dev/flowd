"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { BrandOverview } from "@/lib/data/selectors";
import { formatCompact, formatInt, formatMoney } from "@/lib/format";
import { FunnelChart, type FunnelStage } from "@/components/charts";
import { buttonVariants } from "@/components/ui/button-variants";
import { PanelLink, SourceChip, rangeLabel, type RangeKey } from "../common";

/**
 * The mini funnel: views, visits, installs, trials and paid for the posts in the range, with what each stage cost. Every stage is Tracked (a
 * flowd link or code counted it, so CPA can pay on it); anything modelled is named under the chart as Estimated and never mixed in.
 */
export function FunnelCard({ funnel, range, loading }: { funnel: BrandOverview["funnel"]; range: RangeKey; loading: boolean }) {
  const counts = funnel?.counts;
  const stats = funnel?.stats;
  const stages: FunnelStage[] = counts
    ? [
        { id: "views", label: "Views", value: counts.views, kind: "tracked", note: "Platform-reported and verified at the 72-hour window." },
        { id: "clicks", label: "Visits", value: counts.clicks, kind: "tracked", note: "Clicks on joinflowd.io links and offer-code lookups, counted by flowd." },
        {
          id: "installs",
          label: "Installs",
          value: counts.installs,
          kind: "tracked",
          ...(stats?.cost_per_install_cents ? { detail: `${formatMoney(stats.cost_per_install_cents)} per install` } : {}),
          note: "Deferred-link and code redemptions. This is what install bonuses pay on.",
        },
        {
          id: "trials",
          label: "Trials",
          value: counts.trials,
          kind: "tracked",
          ...(stats?.cost_per_trial_cents ? { detail: `${formatMoney(stats.cost_per_trial_cents)} per trial` } : {}),
          note: "RevenueCat events matched to a flowd link or code.",
        },
        {
          id: "paid",
          label: "Paid",
          value: counts.paid,
          kind: "tracked",
          ...(stats?.cost_per_paid_cents ? { detail: `${formatMoney(stats.cost_per_paid_cents)} each` } : {}),
          note: "Paid subscriptions matched to a flowd link or code.",
        },
      ]
    : [];
  const estimated = funnel ? funnel.estimated.installs + funnel.estimated.trials + funnel.estimated.paid : 0;
  const empty = !loading && (counts?.views ?? 0) === 0;
  const state = loading ? "loading" : empty ? "empty" : "ready";

  return (
    <FunnelChart
      // A chart reveals once when it first mounts with data; remounting on a state change makes the draw-in play when the numbers arrive.
      key={state}
      title="Funnel"
      subtitle={`Posts from the last ${rangeLabel(range)}, views to paid`}
      summary={
        counts
          ? `${formatCompact(counts.views)} verified views led to ${formatInt(counts.installs)} tracked installs, ${formatInt(counts.trials)} tracked trials and ${formatInt(counts.paid)} tracked paid subscriptions.`
          : "The funnel is loading."
      }
      stages={stages}
      state={state}
      empty={{
        title: "No funnel yet",
        description: "Views, installs and trials appear once your first approved video has been posted for a day.",
        action: (
          <Link href="/brand/bounties/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Plus aria-hidden="true" />
            Start a bounty
          </Link>
        ),
      }}
      footer={
        <span className="grid gap-2">
          {estimated > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SourceChip kind="estimated" />
              <span>{formatInt(estimated)} more conversions are modelled from surveys and platform data. They are never added above and never pay a bonus.</span>
            </span>
          ) : (
            <span>Tracked means a flowd link or code counted it. CPA bonuses pay only on tracked results.</span>
          )}
          <span className="justify-self-start">
            <PanelLink href="/brand/analytics">Open the funnel</PanelLink>
          </span>
        </span>
      }
    />
  );
}
