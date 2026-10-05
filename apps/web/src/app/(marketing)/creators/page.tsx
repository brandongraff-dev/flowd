import Link from "next/link";
import { ArrowRight, Monitor, Smartphone } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata, softwareApplicationJsonLd } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { getMarketingSnapshot } from "@/components/features/marketing/home/data";
import { EarningsCalculator } from "@/components/features/marketing/home/earnings-calculator";
import { AcademyList, FirstDollarPath, SafetySection, TypicalVsTop, WellbeingGrid } from "@/components/features/marketing/home/creators-sections";
import { Faq, type FaqEntry } from "@/components/features/marketing/home/faq";
import { MoneyClockDemo } from "@/components/features/marketing/home/money-clock";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";
import { StudioShowcase } from "@/components/features/marketing/home/studio-showcase";
import { StudioPhone } from "@/components/features/marketing/home/studio-phone";
import { TiersStrip } from "@/components/features/marketing/home/tiers";

export const metadata = buildMetadata({
  title: "For creators: get paid for videos that work",
  description: "Open bounties for app videos, paid on verified views, installs and trials. Every dollar shows a date, every rejection a reason, and the typical creator sits beside the top earner.",
  path: "/creators",
  keywords: ["UGC creator jobs for apps", "get paid for app videos", "creator bounties"],
});

const CREATOR_FAQ: readonly FaqEntry[] = [
  {
    question: "Do I need followers to start?",
    answer: "Not to begin. The starter bounty is open to everyone, and bounties are open to join, so there is no application to wait on. Some bounties set a minimum tier or follower count, a niche or a country, and a locked bounty tells you exactly what it needs. Higher tiers also get a head start on new ones.",
  },
  {
    question: "Do I post the video on my own account?",
    answer: "Yes, on your own TikTok, Instagram or YouTube account. Studio adds #ad and the brand's wording to your caption and locks it. A bounty may never require a new or burner account.",
  },
  {
    question: "How do you check views?",
    answer: "Views count for 72 hours after you post. Bots, duplicate videos and views that pile up exactly at the cap are removed, and every removal names its cause in your View Ledger. You can dispute it in one tap, and undisputed money is never blocked.",
  },
  {
    question: "What happens if the pool runs out?",
    answer: "When you submit, up to the per-video cap is reserved for you, so an approved post is paid even if later submissions would have emptied the pool.",
  },
  {
    question: "Who owns the video?",
    answer: "You do. Each bounty has a Rights Card: organic posting is always included, paid-ad use is a priced, dated term (90 days by default), AI likeness is off, and anything beyond that needs your consent and is renewed at a price shown up front.",
  },
];

export default async function CreatorsPage() {
  const data = await getMarketingSnapshot();

  return (
    <>
      <PageHero
        eyebrow="For creators"
        title={
          <>
            Get paid for videos that <GradientWord>work.</GradientWord>
          </>
        }
        lede="Open bounties for app videos, paid on verified views, installs and trials. Make the take in Studio, see a score with reasons before you post, and watch each dollar move from pending to cleared with a date on it."
        actions={
          <>
            <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Start earning
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/app" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Get the app
            </Link>
          </>
        }
        note="Free for creators, 18 and over. Earnings vary and are not guaranteed, and approval isn't guaranteed either: every video has to meet the brief."
      >
        <StudioPhone width={300} />
      </PageHero>

      <MarketingSection
        id="earnings-calculator"
        eyebrow="Earnings calculator"
        title="A range for you, beside what creators really cleared."
        lede="Pick what you make videos about and how often you post. The estimate is a range with the middle case, and the typical creator and the top 10% always sit right next to it."
      >
        <EarningsCalculator market={data.market} median={data.median} />
      </MarketingSection>

      <MarketingSection
        id="first-dollar"
        eyebrow="The First-Dollar Path"
        title="From download to a first cleared dollar."
        lede="One starter bounty, funded by flowd, that gets you through the whole loop once: make, score, submit, decision, cleared."
      >
        <FirstDollarPath firstDollarMedianHours={data.trust.firstDollarMedianHours} />
      </MarketingSection>

      <MarketingSection id="money-clock" eyebrow="The Money Clock" title="Every dollar has a state and a date." lede="Pending, cleared and paid are three separate numbers. Drag through the eight days after you post and see what each one says.">
        <MoneyClockDemo />
      </MarketingSection>

      <MarketingSection id="studio" eyebrow="Studio" title="A studio that already read the brief." lede="The script at the lens, a live checklist, a score with reasons and disclosure that is done for you. On your phone, with your camera.">
        <StudioShowcase />
      </MarketingSection>

      <MarketingSection id="tiers" eyebrow="Tiers and perks" title="Earn your way from Bronze to Elite." lede="A tier is earned from cleared money, approved posts, approval rate and reliability, and it never disappears after one slow month.">
        <TiersStrip />
      </MarketingSection>

      <MarketingSection id="safety" eyebrow="Scam Shield and Rights Card" title="Protected before you press record." lede="The rules that keep a creator's money and rights safe are part of the product, not a page of advice.">
        <SafetySection />
      </MarketingSection>

      <MarketingSection id="academy" eyebrow="Academy" title="Ten five-minute lessons, free." lede="Hooks, briefs, rights, taxes, scams, rate cards and burnout. Never required to earn, and nothing to buy.">
        <AcademyList lessons={data.lessons} />
      </MarketingSection>

      <MarketingSection id="wellbeing" eyebrow="Wellbeing Mode" title="Slack beats streaks." lede="Made for people who do this alongside the rest of their lives.">
        <WellbeingGrid />
      </MarketingSection>

      <MarketingSection id="typical-vs-top" eyebrow="Typical beside top" title="The middle creator, in the same size as the top." lede="Any top earner on flowd appears beside the typical creator, in the same size, with the method one click away.">
        <TypicalVsTop median={data.median} />
      </MarketingSection>

      <MarketingSection id="get-started" eyebrow="Where to start" title="On your phone, or on the web.">
        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard padding="lg" className="grid content-between gap-6 rounded-[28px]">
            <div className="grid gap-3">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                <Smartphone />
              </span>
              <h3 className="text-title-md text-fg">The iOS app</h3>
              <p className="text-body-sm text-pretty text-fg-muted">Studio with the camera and teleprompter, the Wallet with its Money Clock, and a Lock Screen Live Activity. Needs iOS 17 or later. In TestFlight beta; Android is next.</p>
            </div>
            <Link href="/app" className={cn(buttonVariants({ variant: "primary" }), "w-fit")}>
              Get the app
              <ArrowRight aria-hidden="true" />
            </Link>
          </GlassCard>
          <GlassCard padding="lg" className="grid content-between gap-6 rounded-[28px]">
            <div className="grid gap-3">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                <Monitor />
              </span>
              <h3 className="text-title-md text-fg">The web portal</h3>
              <p className="text-body-sm text-pretty text-fg-muted">The same bounties, Wallet and Money Clock on a bigger screen, with desktop review of your submissions and your tax export. Upload a take you made elsewhere.</p>
            </div>
            <Link href="/signup/creator" className={cn(buttonVariants({ variant: "secondary" }), "w-fit")}>
              Open the web portal
            </Link>
          </GlassCard>
        </div>
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Questions" title="Straight answers for creators." lede="If something is missing, hello@joinflowd.io reaches a person.">
        <Faq items={CREATOR_FAQ} />
      </MarketingSection>

      <PageCta
        title="Make your first take today."
        body="Free for creators. Pick a funded bounty, make a take in Studio and see exactly when your first dollar clears."
        note="Earnings vary and are not guaranteed. Approval isn't guaranteed: your video has to meet the brief."
      >
        <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start earning
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/founding-creators" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Founding creators
        </Link>
      </PageCta>

      <JsonLd data={[softwareApplicationJsonLd(), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "For creators" }])]} />
    </>
  );
}
