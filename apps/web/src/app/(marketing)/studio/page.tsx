import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { breadcrumbJsonLd, buildMetadata, softwareApplicationJsonLd } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { buttonVariants } from "@/components/ui/button-variants";
import { getMarketingSnapshot } from "@/components/features/marketing/home/data";
import { PageCta } from "@/components/features/marketing/home/page-cta";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";
import { ChecklistNote, FormatLibrary, GlassPreview, StudioExtras } from "@/components/features/marketing/home/studio-extras";
import { StudioPhone } from "@/components/features/marketing/home/studio-phone";
import { StudioScroller } from "@/components/features/marketing/home/studio-scroller";
import { ToolsTeaser } from "@/components/features/marketing/home/tools-teaser";

export const metadata = buildMetadata({
  title: "Studio: make the take that already read the brief",
  description: "A teleprompter at the lens, a live checklist, a Hook Score with timecoded reasons and one-tap fixes, and disclosure done for you. On your phone, with your camera.",
  path: "/studio",
  keywords: ["UGC teleprompter app", "hook score", "creator studio app", "app video hook checker"],
});

export default async function StudioPage() {
  const data = await getMarketingSnapshot();

  return (
    <>
      <PageHero
        eyebrow="Studio"
        title={
          <>
            The take that already read the <GradientWord>brief.</GradientWord>
          </>
        }
        lede="Make the video in the app, with the script at the lens, a live checklist and a score with reasons before you post. Studio is the part of flowd that makes a good take easy, and a bad one obvious."
        actions={
          <>
            <Link href="/tools/hook-score" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Try Hook Score free
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/app" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Get the app
            </Link>
          </>
        }
        note="iOS 17 or later, in TestFlight beta. A lite version of Studio runs on the web portal and takes an upload."
      >
        <StudioPhone width={300} />
      </PageHero>

      <MarketingSection id="walkthrough" eyebrow="From brief to submit" title="Six steps, one phone." lede="Scroll to move through a take. The same example runs the whole way, and every score on it comes from the real checklist." reveal={false} className="pt-0">
        <StudioScroller />
      </MarketingSection>

      <MarketingSection id="score" eyebrow="Honest scoring" title="A checklist, not a crystal ball." lede="Scores explain themselves: a band, the timecoded reasons, a fix, and the uncertainty stated.">
        <ChecklistNote />
      </MarketingSection>

      <MarketingSection id="try" eyebrow="Try the scorer" title="Score a hook right here." lede="The text half of the Hook Score runs on any line. The full tool takes a clip, too, analysed in your browser.">
        <ToolsTeaser />
      </MarketingSection>

      <MarketingSection id="formats" eyebrow="The format library" title="Eleven formats, each a shape to follow." lede="Pick a format and Studio sets the beats, the timings and the shot list. Each one comes with sample hooks you can fill with your app.">
        <FormatLibrary formats={data.formats} />
      </MarketingSection>

      <MarketingSection id="liquid-glass" eyebrow="Liquid Glass" title="Controls that stay out of the picture." lede="The camera is the star. The controls float above it and get out of the way.">
        <GlassPreview />
      </MarketingSection>

      <MarketingSection id="details" eyebrow="The details" title="Private, importable and pre-flighted.">
        <StudioExtras />
      </MarketingSection>

      <PageCta title="Make your first take." body="Open a funded bounty, make a take in Studio and see the score before you submit." note="Free for creators. Approval isn't guaranteed: your video has to meet the brief.">
        <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start earning
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/creators" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          How creators get paid
        </Link>
      </PageCta>

      <JsonLd data={[softwareApplicationJsonLd(), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Studio" }])]} />
    </>
  );
}
