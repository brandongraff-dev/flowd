import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";
import { CONSTANTS, formatMoney, planLabel, planPriceCentsMonth, planTakeRate, PLAN_ORDER } from "@/lib/engine";
import { buttonVariants } from "@/components/ui/button-variants";
import { AllInCalculator } from "./all-in-calculator";

const SUB: Record<(typeof PLAN_ORDER)[number], string> = {
  free: "No seats, no minimums",
  pro: "Learned scorer, auto-approve, Market view",
  scale: "Roles, agencies, finance pack",
};

/**
 * The pricing teaser on the landing page: the three take rates as the hero numbers, the all-in calculator right under them, and the first-bounty offer.
 * The full cards, the break-even chart, the add-ons and an honest comparison live on /pricing.
 */
export function PricingTeaser() {
  return (
    <div className="grid gap-6">
      <ul className="grid gap-3 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const price = planPriceCentsMonth(plan);
          return (
            <li key={plan} className="grid content-start gap-1.5 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-title-sm text-fg">{planLabel(plan)}</h3>
                <p className="text-caption text-fg-muted tabular-nums">{price === 0 ? "$0" : `${formatMoney(price, { cents: "never" })} a month`}</p>
              </div>
              <p className="font-display text-figure-xl leading-none text-fg tabular-nums">{Math.round(planTakeRate(plan) * 100)}%</p>
              <p className="text-caption text-fg-muted">of creator spend. {SUB[plan]}.</p>
            </li>
          );
        })}
      </ul>

      <AllInCalculator />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="flex max-w-[64ch] items-start gap-3 text-body-sm text-fg-muted">
          <Gift aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-mint" strokeWidth={1.75} />
          <span>
            <strong className="font-semibold text-fg">Install-only bounties are a flat {Math.round(CONSTANTS.fees.cpa_only_take_rate * 100)}%</strong>, charged only on cleared conversions. Your first bounty has the fee waived and flowd matches up to{" "}
            {formatMoney(CONSTANTS.fees.matched_first_bounty_cap_cents, { cents: "never" })}.
          </span>
        </p>
        <Link href="/pricing" className={buttonVariants({ variant: "secondary" })}>
          See every plan and add-on
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
