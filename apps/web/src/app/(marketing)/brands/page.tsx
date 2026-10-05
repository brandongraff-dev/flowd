import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { buttonVariants } from "@/components/ui/button-variants";
import { AllInCalculator } from "@/components/features/marketing/home/all-in-calculator";
import { AttributionDiagram, BountyOverviewCard, BuilderSteps, GrowthCards, ProofLinks, ReviewSection } from "@/components/features/marketing/home/brands-sections";
import { BriefLintDemo } from "@/components/features/marketing/home/brief-lint-demo";
import { EscrowExplainer } from "@/components/features/marketing/home/escrow-explainer";
import { Faq, type FaqEntry } from "@/components/features/marketing/home/faq";
import { FunnelPreview } from "@/components/features/marketing/home/funnel-preview";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";

export const metadata = buildMetadata({
  title: "For brands: fund the videos that move installs",
  description: "Set a rate, escrow the pool and pay only for views, installs and trials that clear. Every video is scored, checked for fraud and compliance, and decided in 72 hours.",
  path: "/brands",
  keywords: ["app install creator marketing", "UGC for mobile apps", "pay per install creators", "RevenueCat attribution creators"],
});

const BRAND_FAQ: readonly FaqEntry[] = [
  {
    question: "How is this different from hiring creators one by one?",
    answer: "A bounty is open: any qualified creator can take it, so you do not brief, negotiate and chase each one. You set the rate and the pool, flowd prices, scores and checks every submission, and you pay only for what clears. You can still make direct offers to creators you like.",
  },
  {
    question: "What do I need for attribution?",
    answer: "A tracking link works with no setup. For installs, trials and paid subscriptions you add the RevenueCat webhook and the SDK snippet that writes the creator and bounty onto the subscriber. Conversions are labelled Tracked (link or code) or Estimated, and only tracked ones pay a creator bonus.",
  },
  {
    question: "Can a creator post something that breaks the rules?",
    answer: "Disclosure is checked in the audio and on screen before you decide, and the caption carries #ad and your wording, locked. Music outside the licensed library, banned claims, duplicates and AI content are flagged, and a missing disclosure blocks settlement until it is fixed.",
  },
  {
    question: "What if I do not decide in time?",
    answer: "Decisions are due within 72 hours. At that point a clean video is approved or the decision escalates to Ops, and your reliability score takes a hit either way. Brands are scored in public on pay speed, decision time and fairness.",
  },
  {
    question: "How much does it cost?",
    answer: "A platform fee on creator spend: 12% on Free, 10% on Pro and 8% on Scale, and a flat 6% on install-only bounties. Card processing is passed through at cost, and every price is shown all-in. Your first bounty has the fee waived and flowd matches up to $500.",
  },
];

export default function BrandsPage() {
  return (
    <>
      <PageHero
        eyebrow="For brands"
        title={
          <>
            Fund the videos that move <GradientWord>installs.</GradientWord>
          </>
        }
        lede="Set a rate, escrow the pool, and pay only for views, installs and trials that clear. Every video arrives with a checklist score, fraud evidence and compliance checks, and you decide inside 72 hours."
        actions={
          <>
            <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start a bounty
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="#pricing" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              See the all-in price
            </Link>
          </>
        }
        note="Free plan, no seats, no minimums. Your first bounty has the fee waived and flowd matches up to $500."
      >
        <BountyOverviewCard />
      </PageHero>

      <MarketingSection id="attribution" eyebrow="Attribution Kit" title="Tie a trial to the video that earned it." lede="A link, a promo-code pool and a RevenueCat webhook, with every conversion labelled so you always know what is tracked and what is estimated.">
        <AttributionDiagram />
      </MarketingSection>

      <MarketingSection id="funnel" eyebrow="Funnel and payback" title="From a view to a paying subscriber." lede="See cost per install, per trial and per paid subscriber, ROAS from day 7 to day 90, and the payback day, by creator, hook and format. Sparse data says so instead of inventing a rate.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
          <FunnelPreview />
          <ul className="grid gap-3 text-body-sm text-fg-muted">
            {[
              ["Tracked and Estimated, never mixed", "Every stage carries its label, and estimated stages are hatched so the difference does not rest on colour."],
              ["Maturity badges", "Day 7 is labelled an early signal. A rate under 20 events says \"not enough data\" and shows the minimum needed."],
              ["A creator league", "Rank creators by cost per trial and day-30 ROAS, then rebuy the ones that worked in one click."],
            ].map(([title, body]) => (
              <li key={title} className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <span className="text-body-sm font-semibold text-fg">{title}</span>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection id="builder" eyebrow="The AI bounty builder" title="From an App Store link to a live bounty." lede="Four steps, with Brief Lint and the Rights Card running as you go, and a creator-side preview so you see what they will see.">
        <div className="grid gap-6">
          <BuilderSteps />
          <BriefLintDemo />
        </div>
      </MarketingSection>

      <MarketingSection id="escrow" eyebrow="Escrow and the Funded badge" title="Funded, or it does not go live." lede="Your money sits in escrow before the bounty opens, so creators can trust the pool is real, and what is unspent comes back.">
        <EscrowExplainer />
      </MarketingSection>

      <MarketingSection id="review" eyebrow="The review queue" title="Decide fast, with the evidence in front of you." lede="Keyboard-first, timecoded and accountable on both sides: a 72-hour clock for you, a reason for every rejection, and guardrails if you automate.">
        <ReviewSection />
      </MarketingSection>

      <MarketingSection id="pricing" eyebrow="All-in price" title="What a view really costs." lede="Creator pay, our fee and card processing in one number, for each plan, at your spend.">
        <AllInCalculator />
        <p className="mt-4 text-caption text-fg-subtle">
          Plans, add-ons and the break-even chart are on{" "}
          <Link href="/pricing" className="text-accent underline underline-offset-2">
            the pricing page
          </Link>
          . See how we compare in{" "}
          <Link href="/compare" className="text-accent underline underline-offset-2">
            the honest comparison
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingSection id="grow" eyebrow="As you grow" title="Rights, an API and a matched first bounty." lede="The pieces a team grows into, none of which you need on day one.">
        <GrowthCards />
      </MarketingSection>

      <MarketingSection id="proof" eyebrow="Proof you can check" title="Public pages instead of logos." lede="Look before you sign up: the market, the Promise, a brand scorecard and a comparison, none of which need an account.">
        <ProofLinks />
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Questions" title="Straight answers for app teams." lede="If something is missing, hello@joinflowd.io reaches a person.">
        <Faq items={BRAND_FAQ} />
      </MarketingSection>

      <PageCta
        title="Fund your first bounty on us."
        body="The platform fee is waived on your first bounty and flowd matches your funding up to $500. Fund it, review in 72 hours and pay only for what clears."
        note="Design-partner programme. A bounty cannot go live until it is fully funded."
      >
        <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start a bounty
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/tools/app-ugc-audit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Try the free App UGC Audit
        </Link>
      </PageCta>

      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "For brands" }])} />
    </>
  );
}
