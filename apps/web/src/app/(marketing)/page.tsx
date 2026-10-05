import { buildMetadata, siteJsonLd } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { AudienceProvider } from "@/components/features/marketing/home/audience";
import { ClosingCta } from "@/components/features/marketing/home/closing-cta";
import { CompareGlance } from "@/components/features/marketing/home/compare-glance";
import { getMarketingSnapshot } from "@/components/features/marketing/home/data";
import { EscrowExplainer } from "@/components/features/marketing/home/escrow-explainer";
import { Faq, HOME_FAQ } from "@/components/features/marketing/home/faq";
import { Hero, HeroStrip } from "@/components/features/marketing/home/hero";
import { HowItWorks } from "@/components/features/marketing/home/how-it-works";
import { MarketModule } from "@/components/features/marketing/home/market-module";
import { MoneyClockDemo } from "@/components/features/marketing/home/money-clock";
import { OutcomeStack } from "@/components/features/marketing/home/outcome-stack";
import { PainPromise, PromiseStrip } from "@/components/features/marketing/home/pain-promise";
import { PricingTeaser } from "@/components/features/marketing/home/pricing-teaser";
import { MarketingSection } from "@/components/features/marketing/home/section";
import { StudioShowcase } from "@/components/features/marketing/home/studio-showcase";
import { TiersStrip } from "@/components/features/marketing/home/tiers";
import { ToolsTeaser } from "@/components/features/marketing/home/tools-teaser";

export const metadata = buildMetadata({
  title: "flowd: money follows what works",
  absoluteTitle: true,
  description: "flowd is the open market for app creators. Brands fund bounties, creators compete, and a model prices, scores and checks every video so money follows views, installs and trials.",
  path: "/",
});

/**
 * The landing page. The data is read once on the server (the demo world's ticker, medians, Promise metrics and market) and handed to the client islands
 * that need it, so the first paint already has real numbers. Each section reveals as it scrolls into view and nothing above the fold waits for JavaScript.
 */
export default async function LandingPage() {
  const data = await getMarketingSnapshot();

  return (
    <>
      <AudienceProvider>
        <Hero median={data.median} events={data.events} paidTodayCents={data.paidTodayCents} />
        <HeroStrip events={data.events} />
        <HowItWorks />
      </AudienceProvider>

      <MarketingSection
        id="market"
        eyebrow="The market"
        title="See what a view is worth today."
        lede="Live clearing prices by category, the median beside the middle half. Drag the price and see how long it takes to fill, and what it costs all-in."
       
      >
        <MarketModule rows={data.market} />
      </MarketingSection>

      <MarketingSection
        id="outcomes"
        eyebrow="Pay that follows results"
        title="One video, three ways to earn."
        lede="A floor for every verified view, bonuses for the installs and trials a video brings, and a commission if a brand runs it as an ad. Always inside a per-video cap you can see."
       
      >
        <OutcomeStack />
      </MarketingSection>

      <MarketingSection
        id="money-clock"
        eyebrow="The Money Clock"
        title="Every dollar has a state and a date."
        lede="Pending, cleared and paid are three separate numbers, each with the day it moves and the reason if it slips. Drag through the eight days after a post goes up."
       
      >
        <MoneyClockDemo />
      </MarketingSection>

      <MarketingSection
        id="escrow"
        eyebrow="Escrow and the Funded badge"
        title="Funded, or it does not go live."
        lede="Brand money sits in escrow before a bounty opens, so creators can see the pool is real. Money moves out as posts clear, and what is unspent comes back."
      >
        <EscrowExplainer />
      </MarketingSection>

      <MarketingSection
        id="promise"
        eyebrow="The flowd Promise"
        title="Built from what creators and app teams complain about."
        lede="Six problems we kept reading about in reviews, forums and documentation, each paired with the commitment that answers it. No testimonials, no customer logos: just the rules we hold ourselves to."
       
      >
        <PainPromise metrics={data.promise} />
        <div className="mt-14 grid gap-5">
          <div className="grid gap-1.5">
            <h3 className="text-title-lg text-fg">The flowd Promise, all 11</h3>
            <p className="text-body-sm max-w-[64ch] text-fg-muted">Each one has a public proof metric, computed from the ledger, and a stated consequence if we miss it.</p>
          </div>
          <PromiseStrip metrics={data.promise} />
        </div>
      </MarketingSection>

      <MarketingSection id="studio" eyebrow="Studio" title="A studio that already read the brief." lede="Make the take in the app, with the script at the lens and a score before you post. The same checks run on the brand's side, so approval is rarely a surprise.">
        <StudioShowcase />
      </MarketingSection>

      <MarketingSection id="tiers" eyebrow="Tiers" title="Earn your way from Bronze to Elite." lede="Tiers come from cleared money, approved posts, approval rate and reliability. They unlock a head start and a few conveniences, and one bad month never costs you one.">
        <TiersStrip />
      </MarketingSection>

      <MarketingSection id="tools" eyebrow="Free tools" title="Try the numbers before you sign up." lede="No account, nothing to install. Score a hook, audit an app, estimate earnings or plan a budget.">
        <ToolsTeaser />
      </MarketingSection>

      <MarketingSection
        id="compare"
        eyebrow="Compared honestly"
        title="How flowd compares with Trybe and Whop."
        lede="Facts only, tagged by how well we know them and dated. They each do something better than we do, and we say what."
       
      >
        <CompareGlance />
      </MarketingSection>

      <MarketingSection id="pricing" eyebrow="Pricing" title="The price you see is the price you pay." lede="A platform fee that falls as you spend more, shown all-in everywhere a price appears. Creators never pay a fee.">
        <PricingTeaser />
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Questions" title="Straight answers." lede="If something is missing, hello@joinflowd.io reaches a person.">
        <Faq items={HOME_FAQ} />
      </MarketingSection>

      <ClosingCta foundingLeft={data.founding.left} foundingTotal={data.founding.total} />
      <JsonLd data={siteJsonLd()} />
    </>
  );
}
