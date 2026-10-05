"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BrandWallet } from "@/lib/data/selectors";
import { formatDate, formatPct } from "@/lib/format";
import { formatMoney } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "../common";

/**
 * Plan and fees: what the plan costs, what it took on the last 30 days of creator pay, and what each plan would have cost on the same spend. The
 * cheapest plan for that spend is marked in words, not just colour, and the next break-even is stated in dollars.
 */
export function PlanCard({ loading, wallet }: { loading: boolean; wallet: BrandWallet }) {
  const { plan, fees, spend_30d_cents: spend } = wallet;
  return (
    <Panel
      title="Plan and fees"
      description={loading ? undefined : `${plan.label}: ${formatPct(plan.take_rate, 0)} on creator pay${plan.price_cents_month > 0 ? `, ${formatMoney(plan.price_cents_month, { cents: "auto" })} a month` : ""}`}
      actions={
        loading ? undefined : (
          <Badge tone="neutral" size="md">
            {plan.label}
            {plan.renews_at ? ` · renews ${formatDate(plan.renews_at, "short")}` : ""}
          </Badge>
        )
      }
    >
      {loading ? (
        <div role="status" aria-label="Loading plan" className="grid gap-3">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4">
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Creator pay, last 30 days</dt>
              <dd className="text-body-sm font-semibold text-fg">
                <Money cents={spend} size="inherit" decimals="auto" />
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Platform fees, last 30 days</dt>
              <dd className="text-body-sm font-semibold text-fg">
                <Money cents={fees.last_30d_cents} size="inherit" decimals="auto" />
              </dd>
            </div>
          </dl>
          <ul className="grid gap-1.5" aria-label="Plan cost on the same spend">
            {plan.comparison.plans.map((cost) => (
              <li
                key={cost.plan}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[16px] px-3.5 py-2.5 text-body-sm",
                  cost.plan === plan.plan ? "bg-surface-hover shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "bg-surface-field",
                )}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-fg">{cost.label}</span>
                  <span className="text-caption text-fg-subtle">
                    {formatPct(cost.take_rate, 0)} + {formatMoney(cost.subscription_cents, { cents: "auto" })}/mo
                  </span>
                  {cost.plan === plan.plan ? (
                    <Badge size="sm" tone="neutral">
                      Your plan
                    </Badge>
                  ) : null}
                  {cost.plan === plan.comparison.best && spend > 0 ? (
                    <Badge size="sm" tone="mint">
                      Cheapest at this spend
                    </Badge>
                  ) : null}
                </span>
                <Money cents={cost.total_cents} size="inherit" decimals="auto" className="font-semibold" />
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">
            {plan.next_break_even ? plan.next_break_even.text : "You are on the plan with the lowest platform rate."} The first bounty has no fee; CPA-only and install-only bounties are a flat 6%.
          </p>
          <div>
            <Link href="/brand/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Manage plan
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </Panel>
  );
}
