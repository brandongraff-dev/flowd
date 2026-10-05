import Link from "next/link";
import { BadgeCheck, Scale, Tags } from "lucide-react";
import { CATEGORIES, type Category } from "@/lib/contract/types";
import { buildMetadata } from "@/lib/seo";
import { formatMoney } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button-variants";
import { GlassCard } from "@/components/glass/glass";
import { PayoutTicker } from "@/components/shell/payout-ticker";
import { CtaBand, FactCard, Footnote, HeroAccent, IconTile, PageHero, PageSection, SignupActions } from "@/components/features/marketing/pages/kit";
import { getMarketData } from "@/components/features/marketing/pages/market/market-data";
import { MarketExplorer } from "@/components/features/marketing/pages/market/market-explorer";

export const metadata = buildMetadata({
  title: "Market",
  description: "See what a view is worth today. Live clearing CPMs by category, the middle half of trades beside the median, supply against demand, and the funded bounties open now.",
  path: "/market",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const isCategory = (value: string | undefined): value is Category => (CATEGORIES as readonly string[]).includes(value ?? "");

export default async function MarketPage({ searchParams }: { searchParams: SearchParams }) {
  const [data, params] = await Promise.all([getMarketData(), searchParams]);
  const requested = Array.isArray(params.category) ? params.category[0] : params.category;
  const initial: Category = isCategory(requested) ? requested : (data.categories[0]?.category ?? "ai_photo");
  const { median } = data;

  return (
    <>
      <PageHero
        eyebrow="Market"
        title={
          <>
            See what a view is <HeroAccent>worth today.</HeroAccent>
          </>
        }
        lede="Live clearing prices by category. Median and top, side by side. Every price comes from funded bounties that settled on flowd, so a brand can price a bounty and a creator can see what a view pays before filming."
        actions={
          <>
            <Link href="#bounties" className={buttonVariants({ variant: "primary", size: "lg" })}>
              See funded bounties
            </Link>
            <Link href="/tools/price-calculator" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Price a bounty
            </Link>
          </>
        }
        meta={
          <p className="max-w-[60ch] text-caption text-fg-subtle">
            Typical creator, last {median.period}: <span className="font-semibold text-fg-muted">{formatMoney(median.typical_cents)}</span> (middle half {formatMoney(median.p25_cents)} to {formatMoney(median.p75_cents)}). The top 10% earned {formatMoney(median.top_decile_cents)}. Results vary; this is not a guarantee.
          </p>
        }
        art={
          <GlassCard padding="lg" className="mx-auto w-full max-w-[34rem] lg:ml-auto">
            <PayoutTicker events={data.ticker.events} paidTodayCents={data.ticker.paidTodayCents} visible={5} />
          </GlassCard>
        }
      />

      <MarketExplorer categories={data.categories} initial={initial} now={data.now} />

      <PageSection
        id="method"
        eyebrow="How to read it"
        title="Three rules that keep the number honest"
        description="A price page is only useful if it can be wrong in public. These are the rules it follows."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <FactCard>
            <IconTile tone="mint">
              <BadgeCheck />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Verified views only</h3>
            <p className="text-body-sm text-fg-muted">Rates are cents per 1,000 views that passed the 72-hour window and the fraud check. Bought or bot views never enter the price.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="accent">
              <Scale />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">The median, with the middle half</h3>
            <p className="text-body-sm text-fg-muted">We show the median and the 25th to 75th percentile together, so one outlier bounty cannot move the headline, and a top price is never shown alone.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="sun">
              <Tags />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Thin markets say so</h3>
            <p className="text-body-sm text-fg-muted">With fewer than 8 comparable bounties a category is flagged &quot;few trades&quot;, and the number is a guide rather than a quote.</p>
          </FactCard>
        </div>
        <Footnote className="mt-6">
          Demo data: every figure on this page is generated from the demo world, so the bounties, brands and creators are fictional. In production the same selectors read the public ledger. Brands see the full Market view, with price against time to fill, inside the dashboard.
        </Footnote>
      </PageSection>

      <CtaBand
        title="Price it, or earn from it."
        description="Creators join free and brands start on the Free plan. Your first bounty has the fee waived, and flowd matches up to $500."
        actions={<SignupActions />}
      />
    </>
  );
}
