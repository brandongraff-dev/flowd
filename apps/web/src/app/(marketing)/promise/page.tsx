import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { formatDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button-variants";
import { Container } from "@/components/shell/container";
import { DemoTag } from "@/components/shell/demo-banner";
import { getMarketingSnapshot } from "@/components/features/marketing/home/data";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { PromiseCards } from "@/components/features/marketing/home/promise-cards";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";

export const metadata = buildMetadata({
  title: "The flowd Promise",
  description: "Eleven commitments about money, reviews, rights and safety, each with a public proof metric from the ledger and a stated consequence if we miss it.",
  path: "/promise",
  keywords: ["flowd promise", "creator payout guarantee", "escrow", "review SLA"],
});

const HEADLINES = ["cleared_on_eta", "funded_at_go_live", "decided_in_72h"] as const;

export default async function PromisePage() {
  const data = await getMarketingSnapshot();
  const headline = HEADLINES.flatMap((key) => data.promise.filter((metric) => metric.key === key));

  return (
    <>
      <PageHero
        eyebrow="The flowd Promise"
        title={
          <>
            Eleven commitments. Each one has <GradientWord>proof.</GradientWord>
          </>
        }
        lede="Most platforms tell you they are fair. We publish the numbers. Every commitment below shows a live metric computed from the ledger, what happens when we miss it, and where the feature is explained."
        actions={
          <>
            <Link href="#promise-1" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Read them all
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/trust" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Open the Trust Center
            </Link>
          </>
        }
        note={`Figures are as of ${formatDate(data.promiseAsOf, "medium")} and come from the demo ledger. We show a metric even when it is below its target.`}
      >
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {headline.map((metric) => (
            <div key={metric.key} className="grid content-start gap-1.5 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <dt className="text-caption font-medium text-fg-muted">{metric.label}</dt>
              <dd className="font-display text-figure-lg text-fg tabular-nums">{metric.unit === "ratio" ? `${(metric.value * 100).toFixed(1)}%` : metric.display}</dd>
              {metric.target !== undefined ? <dd className="text-caption text-fg-subtle tabular-nums">Target {Math.round(metric.target * 100)}%</dd> : null}
            </div>
          ))}
          <div className="sm:col-span-3 lg:col-span-1 xl:col-span-3">
            <DemoTag>Demo data</DemoTag>
          </div>
        </dl>
      </PageHero>

      <MarketingSection id="commitments" eyebrow="The commitments" title="What we hold ourselves to." reveal={false} className="pt-0">
        <PromiseCards metrics={data.promise} />
      </MarketingSection>

      <section className="py-10 md:py-16">
        <Container size="wide">
          <ul className="grid gap-4 md:grid-cols-3">
            {[
              { href: "/trust", title: "Trust Center", body: "The same metrics, plus the Brand Scorecard leaderboard, our policies and how to report abuse." },
              { href: "/security", title: "Security", body: "How escrow and the double-entry ledger work, our fraud rules, and how we handle data." },
              { href: "/legal/earnings-disclosure", title: "Earnings disclosure", body: "How every earnings figure on flowd is calculated, and why none of them is a guarantee." },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group grid h-full content-start gap-1.5 rounded-[24px] bg-surface-field p-6 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[background-color,box-shadow] duration-(--fd-dur-fast) hover:bg-surface-hover hover:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]">
                  <span className="flex items-center justify-between gap-2 text-body font-semibold text-fg">
                    {item.title}
                    <ArrowRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) group-hover:translate-x-0.5" strokeWidth={1.75} />
                  </span>
                  <span className="text-body-sm text-fg-muted">{item.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <PageCta title="Hold us to it." body="Start as a creator or an app team, and watch every one of these commitments work on your own money." note="If we ever miss one, the page above will show it before we say anything.">
        <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start earning
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/signup/brand" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Start a bounty
        </Link>
      </PageCta>

      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "The flowd Promise" }])} />
    </>
  );
}
