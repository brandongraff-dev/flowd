import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { buttonVariants } from "@/components/ui/button-variants";
import { GlassCard } from "@/components/glass/glass";
import { CompareExplorer } from "@/components/features/marketing/home/compare-explorer";
import { LAST_VERIFIED } from "@/components/features/marketing/home/compare-data";
import { ConfidenceLegend } from "@/components/features/marketing/home/compare-grid";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";

export const metadata = buildMetadata({
  title: "flowd compared with Trybe, Whop, SideShift and agencies",
  description: "An honest, dated comparison of flowd with Trybe, Whop Content Rewards, SideShift and agencies: every claim tagged verified, reported or not documented, and where each one is better.",
  path: "/compare",
  keywords: ["Trybe alternative", "Whop content rewards alternative", "SideShift alternative", "UGC platform comparison"],
});

const METHOD = [
  { title: "Their own pages first", body: "We read each product's homepage, terms, documentation and store listings. Anything we saw there is tagged Verified." },
  { title: "Everyone else is Reported", body: "Reviews, third-party guides and competitors' write-ups are useful but can be biased or stale, so they are tagged Reported and named in the sources." },
  { title: "Silence is not proof", body: "If we looked and found nothing, the cell says Not documented. That is not a claim that the feature does not exist." },
  { title: "Dated, and corrected", body: `Every column carries its last-verified date (${LAST_VERIFIED}). If we are wrong, email hello@joinflowd.io and we will fix it and say what changed.` },
] as const;

export default function ComparePage() {
  return (
    <>
      <PageHero
        eyebrow="Compared honestly"
        title={
          <>
            How flowd compares, <GradientWord>honestly.</GradientWord>
          </>
        }
        lede="Pick who to put beside us. Every claim is tagged by how well we know it, dated, and followed by where they do something better than we do. Trybe has an Android app and deep Shopify tooling; our wedge is app attribution, escrow and accountable review."
        actions={
          <>
            <Link href="#compare" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Compare now
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/tools/price-calculator" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Try the price calculator
            </Link>
          </>
        }
        note={`Last verified ${LAST_VERIFIED}. We compare on public facts only, and we do not run these products ourselves.`}
      >
        <GlassCard padding="lg" className="grid gap-5 rounded-[32px]">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
              <ShieldCheck />
            </span>
            <h2 className="text-title-sm text-fg">How to read each cell</h2>
          </div>
          <ConfidenceLegend className="sm:grid-cols-1" />
        </GlassCard>
      </PageHero>

      <MarketingSection id="compare" eyebrow="Side by side" title="Pick who to compare." lede="Choose up to three. On a phone each topic becomes its own card." reveal={false} className="pt-0">
        <CompareExplorer />
      </MarketingSection>

      <MarketingSection id="method" eyebrow="Method" title="How we check." lede="So you can judge the comparison, not just read it.">
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {METHOD.map((item) => (
            <li key={item.title}>
              <GlassCard padding="lg" className="grid h-full content-start gap-2 rounded-[28px]">
                <h3 className="text-title-sm text-fg">{item.title}</h3>
                <p className="text-body-sm text-pretty text-fg-muted">{item.body}</p>
              </GlassCard>
            </li>
          ))}
        </ul>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
          <Mail aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Spot something wrong? <a href="mailto:hello@joinflowd.io" className="font-semibold text-accent underline underline-offset-2">hello@joinflowd.io</a>
        </p>
      </MarketingSection>

      <PageCta title="Compare on your own numbers." body="Fees are charged on different things, so the fairest comparison is your spend and your CPM. The calculator shows the all-in price for each flowd plan." note="We will not claim a like-for-like winner where there is not one.">
        <Link href="/tools/price-calculator" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Price calculator
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/pricing" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          See pricing
        </Link>
      </PageCta>

      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Compare" }])} />
    </>
  );
}
