"use client";

import { useMemo } from "react";
import { DEFAULT_FUNNEL, budgetPlan, formatInt, formatMoney, planTakeRate } from "@/lib/engine";
import { FunnelChart, type FunnelStage } from "@/components/charts";

/**
 * Views to paid, planned. This is the funnel a $5,000 pool at the default $2.00 CPM is expected to produce at typical conversion rates, drawn with the same
 * chart the live funnel uses. Every stage is marked Estimated (hatched) on purpose: it is a plan, and on a live bounty the installs, trials and paid
 * subscriptions that a tracked link or code ties to a video become Tracked, and only those are paid.
 */
export function FunnelPreview() {
  const plan = useMemo(() => budgetPlan({ budget_cents: 500_000, take_rate: planTakeRate("free"), cpm_cents: 200, avg_first_payment_cents: 3499 }), []);
  const median = plan.band.median;
  const visits = Math.round(plan.views * DEFAULT_FUNNEL.view_to_visit);

  const stages: FunnelStage[] = [
    { id: "views", label: "Views", value: plan.views, kind: "estimated", note: "What $5,000 buys at $2.00 per 1,000 verified views.", detail: `${formatMoney(200)} per 1,000` },
    { id: "visits", label: "Link visits", value: visits, kind: "estimated", note: "0.45% of views open the tracking link." },
    { id: "installs", label: "Installs", value: median.installs, kind: "estimated", note: "38% of visits install.", detail: median.cost_per_install_cents === null ? undefined : `${formatMoney(median.cost_per_install_cents)} per install` },
    { id: "trials", label: "Trials", value: median.trials, kind: "estimated", note: "6.2% of installs start a trial.", detail: median.cost_per_trial_cents === null ? undefined : `${formatMoney(median.cost_per_trial_cents)} per trial` },
    { id: "paid", label: "Paid", value: median.paid, kind: "estimated", note: "34.8% of trials convert.", detail: median.cost_per_paid_cents === null ? undefined : `${formatMoney(median.cost_per_paid_cents)} per subscriber` },
  ];

  return (
    <FunnelChart
      title="A $5,000 pool, planned"
      subtitle="Views to paid at typical conversion rates, with what each step costs all-in on the Free plan."
      summary={`A $5,000 pool at $2.00 CPM buys about ${formatInt(plan.views)} views, then about ${formatInt(median.installs)} installs, ${formatInt(median.trials)} trials and ${formatInt(median.paid)} paid subscribers. This is a planning estimate, not a result.`}
      stages={stages}
      footer="Estimate. A planning range from category medians, not a promise. On a live bounty, conversions tied by a tracked link or code are Tracked and paid; modelled ones stay Estimated and are never paid."
    />
  );
}
