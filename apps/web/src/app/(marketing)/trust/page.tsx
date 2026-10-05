import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { buttonVariants } from "@/components/ui/button-variants";
import { CtaBand, HeroAccent, PageHero } from "@/components/features/marketing/pages/kit";
import { getTrustData } from "@/components/features/marketing/pages/trust/trust-data";
import { LiveMetricsSection, PoliciesSection, ScamShieldSection, ScorecardsSection, SupportSection, TrustReportCard } from "@/components/features/marketing/pages/trust/trust-sections";

export const metadata = buildMetadata({
  title: "Trust Center",
  description: "Live promise metrics from the ledger, with the target beside each, public Brand Scorecards, the rules we enforce, how to spot a scam, and who answers when you report one.",
  path: "/trust",
});

export default async function TrustPage() {
  const data = await getTrustData();
  return (
    <>
      <PageHero
        eyebrow="Trust Center"
        title={
          <>
            Trust you can <HeroAccent>check.</HeroAccent>
          </>
        }
        lede="We publish the numbers behind every promise we make, live from the ledger, including the ones we are missing. Brands are scored in public. Scams get reported and read by a person."
        actions={
          <>
            <Link href="#live" className={buttonVariants({ variant: "primary", size: "lg" })}>
              See the live numbers
            </Link>
            <Link href="/trust/report" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Report a scam
            </Link>
          </>
        }
        meta={
          <p className="text-caption text-fg-subtle">
            Also read{" "}
            <Link href="/promise" className="font-semibold text-accent underline underline-offset-4">
              the flowd Promise
            </Link>
            ,{" "}
            <Link href="/security" className="font-semibold text-accent underline underline-offset-4">
              Security
            </Link>{" "}
            and{" "}
            <Link href="/status" className="font-semibold text-accent underline underline-offset-4">
              System status
            </Link>
            .
          </p>
        }
        art={<TrustReportCard measured={data.measured} asOf={data.asOf} />}
      />
      <LiveMetricsSection data={data} />
      <ScorecardsSection data={data} />
      <PoliciesSection />
      <ScamShieldSection />
      <SupportSection />
      <CtaBand
        title="See something wrong? Tell us."
        description="You do not need an account to report a scam, a fake brand or a demand that breaks the rules. A person reads every report, and you get a case ID."
        actions={
          <>
            <Link href="/trust/report" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Report a scam or abuse
            </Link>
            <Link href="/help" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Visit the help centre
            </Link>
          </>
        }
      />
    </>
  );
}
