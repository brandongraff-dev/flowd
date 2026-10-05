import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata, pricingJsonLd } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { buttonVariants } from "@/components/ui/button-variants";
import { AllInCalculator } from "@/components/features/marketing/home/all-in-calculator";
import { Faq, type FaqEntry } from "@/components/features/marketing/home/faq";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { AddOns, PlanCards } from "@/components/features/marketing/home/plan-cards";
import { PriceTable } from "@/components/features/marketing/home/price-table";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";

export const metadata = buildMetadata({
  title: "Pricing",
  description: "Free, Pro and Scale plans at 12%, 10% and 8% of creator spend, a flat 6% on installs and trials, and the first bounty free. The all-in price is shown everywhere.",
  path: "/pricing",
  keywords: ["flowd pricing", "creator bounty fees", "UGC platform pricing", "all-in CPM"],
});

const PRICING_FAQ: readonly FaqEntry[] = [
  {
    question: "When is the platform fee charged?",
    answer: "When you fund a bounty, the fee reserve goes into escrow with the creator pool, so the Funded badge reflects the whole amount. The fee is only taken on money that is actually paid to creators: the part of the reserve that matches unspent pool returns to your wallet when the bounty ends.",
  },
  {
    question: "What is the all-in CPM, and why show it?",
    answer: "It is creator pay plus the platform fee plus card processing, divided by verified views and multiplied by 1,000. A headline rate that leaves out fees and processing is not a price, so every price on flowd is shown all-in, including the plan price when you choose a plan.",
  },
  {
    question: "Does the fee change if I upgrade or downgrade?",
    answer: "A bounty keeps the take rate it was created with. A bounty made on the Free plan stays at 12% after you upgrade, and new bounties use your new plan's rate. That way a price you agreed to never changes underneath you.",
  },
  {
    question: "How does the first bounty offer work?",
    answer: "On your first bounty the platform fee is waived and flowd matches what you fund up to $500, on top of your pool. Funding $5,000 gives a $5,500 pool with no fee. It is part of the design-partner programme, and we will say so on this page if it changes.",
  },
  {
    question: "What do install-only bounties cost?",
    answer: "A flat 6% on cleared installs, trials and paid subscriptions, on any plan. There is no CPM and no fee on views. If nothing converts, the fee is zero. Only tracked conversions (a link or a promo code) are paid, and estimated ones never are.",
  },
  {
    question: "Is there a minimum, a contract or a seat limit?",
    answer: "No contract and no seats. A bounty needs a pool of at least $100. Pro and Scale are billed monthly, and the plan price is the only recurring charge.",
  },
  {
    question: "What do creators pay?",
    answer: "Nothing. Creators never pay a platform fee, to join or to be paid. The weekly payout on Fridays is free. Instant cash-out is optional and costs 1.5% (minimum $0.50, maximum $15), shown before the creator confirms.",
  },
  {
    question: "What does card processing cost?",
    answer: "2.9% plus $0.30 on each top-up, passed through at cost. It is included in the all-in price. Fewer, larger top-ups mean less fixed cost, because the $0.30 is charged once per top-up.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pay for what <GradientWord>performs.</GradientWord>
          </>
        }
        lede="A platform fee on creator spend that falls as you grow, and a price that is always shown all-in: creator pay, our fee and card processing. Creators never pay a fee."
        actions={
          <>
            <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start free
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="#calculator" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Work out your price
            </Link>
          </>
        }
        note="Your first bounty has the fee waived and flowd matches up to $500. Prices are in US dollars."
      />

      <MarketingSection id="plans" eyebrow="Plans" title="Three plans, one rule: the more you spend, the lower the rate." reveal={false} className="pt-0">
        <PlanCards />
      </MarketingSection>

      <MarketingSection
        id="calculator"
        eyebrow="Your price"
        title="What a view really costs."
        lede="Drag the month's creator spend and your CPM. The effective all-in CPM includes creator pay, our fee, processing at cost and the plan price, and the chart shows where a bigger plan starts to pay for itself."
      >
        <AllInCalculator withChart />
      </MarketingSection>

      <MarketingSection id="add-ons" eyebrow="Everything else" title="What is not a plan." lede="Creators, payouts, ads, processing and rights renewals, each with its price.">
        <AddOns />
      </MarketingSection>

      <MarketingSection
        id="compare"
        eyebrow="Compared honestly"
        title="What others publish about price."
        lede="Facts only, tagged by how well we know them and dated. Some of these fees are charged on different things, so the table says what each one applies to."
      >
        <PriceTable />
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Fee timing and other questions" title="Straight answers about the fee." lede="If something is missing, hello@joinflowd.io reaches a person.">
        <Faq items={PRICING_FAQ} defaultOpen={PRICING_FAQ[0]?.question} />
      </MarketingSection>

      <PageCta title="Fund your first bounty on us." body="The platform fee is waived on your first bounty, and flowd matches your funding up to $500. Fund it, review in 72 hours and pay only for what clears." note="Design-partner programme. A bounty cannot go live until it is fully funded.">
        <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start a bounty
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/compare" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          See the full comparison
        </Link>
      </PageCta>

      <JsonLd data={[pricingJsonLd(), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Pricing" }])]} />
    </>
  );
}
