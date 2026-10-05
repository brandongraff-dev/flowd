import Link from "next/link";
import { FlaskConical, ListChecks, ScrollText } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { formatInt } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button-variants";
import { CtaBand, FactCard, Footnote, HeroAccent, IconTile, PageHero, PageSection, SignupActions } from "@/components/features/marketing/pages/kit";
import { getFormatsData } from "@/components/features/marketing/pages/formats/formats-data";
import { FormatsExplorer } from "@/components/features/marketing/pages/formats/formats-explorer";
import { FormatsHero } from "@/components/features/marketing/pages/formats/formats-hero";

export const metadata = buildMetadata({
  title: "Formats and hook library",
  description: "Eleven video formats with their beat structure, why each one works, and more than eighty fill-in hooks, filled for a demo app. Filter by hook type and try any format in Studio.",
  path: "/formats",
});

export default async function FormatsPage() {
  const data = await getFormatsData();
  return (
    <>
      <PageHero
        eyebrow="Formats and hooks"
        title={
          <>
            Start from what <HeroAccent>already works.</HeroAccent>
          </>
        }
        lede={`Eleven video formats with their beats, why each one works, and ${formatInt(data.totals.hooks)} fill-in hooks, filled for a demo app so you can read real sentences. It is a starting library, not a rulebook: every number here comes from settled posts and moves as bounties settle.`}
        actions={
          <>
            <Link href="#library" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Browse the library
            </Link>
            <Link href="/tools/hook-score" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Score a hook free
            </Link>
          </>
        }
        art={<FormatsHero data={data} />}
      />

      <FormatsExplorer data={data} />

      <PageSection id="honesty" eyebrow="Read this first" title="A starting library is a hypothesis" description="We would rather be useful and say what we do not know than look certain.">
        <div className="grid gap-4 md:grid-cols-3">
          <FactCard>
            <IconTile tone="sun">
              <FlaskConical />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">It is a hypothesis</h3>
            <p className="text-body-sm text-fg-muted">The formats come from public creator-economy research and vendor writeups, marked reported where we could not verify a claim. Then flowd&apos;s own settled posts re-rank them. Small samples are labelled, not celebrated.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="accent">
              <ScrollText />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">The brief comes first</h3>
            <p className="text-body-sm text-fg-muted">A format never overrides a brand&apos;s brief. In Studio the required beats are checked against what the bounty asks you to show and say, and the disclosure is added for you.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="violet">
              <ListChecks />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Scores are checklists</h3>
            <p className="text-body-sm text-fg-muted">
              A Hook Score checks the first three seconds, captions, disclosure and pacing. It is a checklist score that gets smarter as bounties settle, and it never promises a video will perform.
            </p>
          </FactCard>
        </div>
        <Footnote className="mt-6">
          Sources: public creator-economy research and AI-UGC vendor writeups (reported), and flowd&apos;s own settled posts for views, trial rate and approval rate. Every figure on this page is demo data from the demo world. The demo app Lumi and its features are fictional.
        </Footnote>
      </PageSection>

      <CtaBand title="Pick a format, make a take." description="Studio writes the script from the bounty's brief, shows the beats at the lens and checks the first three seconds before you submit." actions={<SignupActions creatorLabel="Create a creator account" brandLabel="Fund a bounty" />} />
    </>
  );
}
