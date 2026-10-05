import Link from "next/link";
import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSTANTS, formatMoney, planLabel, planPriceCentsMonth, planTakeRate } from "@/lib/engine";
import type { Plan } from "@/lib/contract/types";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { featuresAddedBy } from "./pricing-model";

const PLANS: readonly { plan: Plan; blurb: string; lead: string }[] = [
  { plan: "free", blurb: "Everything you need to fund, review and pay your first bounties.", lead: "Includes" },
  { plan: "pro", blurb: "For teams running bounties every week and wanting the market and the guardrails.", lead: "Everything in Free, plus" },
  { plan: "scale", blurb: "For several apps, agencies and finance teams that need roles and reports.", lead: "Everything in Pro, plus" },
];

const pct = (rate: number): string => `${Math.round(rate * 100)}%`;

/**
 * The plan cards: Free, Pro and Scale from the engine's constants (never typed twice), then the install-only rate. The take rate is the hero number
 * on each card, because it is what changes the price; the plan price is beside it. The first-bounty offer sits above, since it is the first thing a
 * new brand pays.
 */
export function PlanCards({ compact = false }: { compact?: boolean }) {
  const waived = CONSTANTS.fees.first_bounty_fee_waived;
  return (
    <div className="grid gap-5">
      {waived ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-mint-soft px-5 py-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-mint)_35%,transparent)]">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint-solid text-on-mint">
            <Gift className="size-[18px]" strokeWidth={2} />
          </span>
          <p className="min-w-0 flex-1 text-body-sm text-fg">
            <strong className="font-semibold">Your first bounty is on us.</strong> The platform fee is waived, and flowd matches your funding up to {formatMoney(CONSTANTS.fees.matched_first_bounty_cap_cents, { cents: "never" })} on top.
          </p>
          <span className="text-caption text-fg-muted">Design-partner programme</span>
        </div>
      ) : null}

      <ul className={cn("grid gap-4 md:grid-cols-2", compact ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
        {PLANS.map(({ plan, blurb, lead }) => {
          const price = planPriceCentsMonth(plan);
          const features = featuresAddedBy(plan);
          return (
            <li key={plan}>
              <GlassCard padding="none" className="grid h-full grid-rows-[auto_1fr_auto] gap-6 rounded-[28px] p-6">
                <div className="grid gap-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-title-md text-fg">{planLabel(plan)}</h3>
                    <p className="text-body-sm text-fg-muted tabular-nums">
                      <span className="font-display text-title-md font-bold text-fg">{price === 0 ? "$0" : formatMoney(price, { cents: "never" })}</span>
                      {price === 0 ? " no seats or minimums" : " a month"}
                    </p>
                  </div>
                  <div className="grid gap-1">
                    <p className="font-display text-figure-hero leading-none text-fg tabular-nums">{pct(planTakeRate(plan))}</p>
                    <p className="text-body-sm text-fg-muted">of creator spend on bounties, offers and specs</p>
                  </div>
                  <p className="text-body-sm text-pretty text-fg-muted">{blurb}</p>
                </div>
                <div className="grid content-start gap-2.5">
                  <p className="fd-eyebrow text-fg-subtle">{lead}</p>
                  <ul className="grid gap-2">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-body-sm text-fg">
                        <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" strokeWidth={2.5} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={plan === "free" ? "/signup/brand" : `/signup/brand?plan=${plan}`} className={cn(buttonVariants({ variant: plan === "free" ? "primary" : "secondary", size: "md" }), "w-full")}>
                  {plan === "free" ? "Start free" : `Start on ${planLabel(plan)}`}
                </Link>
              </GlassCard>
            </li>
          );
        })}

        {compact ? null : (
          <li>
            <GlassCard padding="none" className="grid h-full grid-rows-[auto_1fr_auto] gap-6 rounded-[28px] p-6">
              <div className="grid gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-title-md text-fg">Install-only</h3>
                  <p className="text-body-sm text-fg-muted">on any plan</p>
                </div>
                <div className="grid gap-1">
                  <p className="font-display text-figure-hero leading-none text-fg tabular-nums">{pct(CONSTANTS.fees.cpa_only_take_rate)}</p>
                  <p className="text-body-sm text-fg-muted">flat, charged only on cleared conversions</p>
                </div>
                <p className="text-body-sm text-pretty text-fg-muted">Pay for tracked installs and trials, and nothing for views. If nothing converts, the fee is zero.</p>
              </div>
              <ul className="grid content-start gap-2">
                {["No fee on views: there are no paid views", "Tracked link and code conversions only", "Rate cards for installs, trials and paid subscriptions"].map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-body-sm text-fg">
                    <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" strokeWidth={2.5} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup/brand" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full")}>
                Start an install-only bounty
              </Link>
            </GlassCard>
          </li>
        )}
      </ul>
    </div>
  );
}

const ADD_ONS: readonly { title: string; price: string; body: string }[] = [
  { title: "Creators", price: "Free", body: "Creators never pay a platform fee, to join or to be paid." },
  { title: "Weekly payout", price: "Free", body: "Every Friday at 18:00 UTC, over everything that has cleared." },
  {
    title: "Instant cash-out",
    price: "1.5%",
    body: `Paid by the creator, minimum ${formatMoney(CONSTANTS.fees.instant_payout_min_cents)}, maximum ${formatMoney(CONSTANTS.fees.instant_payout_max_cents, { cents: "never" })}, shown before they confirm. Free for founding creators for a year.`,
  },
  { title: "Winner promotion", price: "1% of ad spend", body: "When a brand runs a cleared video as a Spark or partnership ad. The creator also earns a 10% commission for 60 days." },
  { title: "Card processing", price: "2.9% + $0.30", body: "Passed through at cost on each top-up, and always included in the all-in price." },
  { title: "Rights renewals", price: "25% per 30 days", body: "Paid-ad use is 90 days by default. A renewal costs a quarter of the base fee for each further 30 days, quoted before you agree." },
];

/** Everything that is not a plan: what creators pay (nothing), payouts, ads, processing and rights. */
export function AddOns() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ADD_ONS.map((item) => (
        <li key={item.title} className="grid content-start gap-1.5 rounded-2xl bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-body-sm font-semibold text-fg">{item.title}</h3>
            <p className="font-display text-title-sm text-fg tabular-nums">{item.price}</p>
          </div>
          <p className="text-caption text-pretty text-fg-muted">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}
