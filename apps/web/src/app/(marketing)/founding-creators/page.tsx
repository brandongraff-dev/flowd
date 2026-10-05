import Link from "next/link";
import { breadcrumbJsonLd, buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { GlassCard } from "@/components/glass/glass";
import { Faq, type FaqEntry } from "@/components/features/marketing/home/faq";
import { FoundingApplication, FoundingBadge, FoundingCounter, FoundingPerks } from "@/components/features/marketing/home/founding-experience";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";

export const metadata = buildMetadata({
  title: "Founding creators",
  description: "Apply to be one of the first 200 flowd creators: a Founding badge, a tier head start and free instant cash-out for a year. A person reads every application.",
  path: "/founding-creators",
});

const FOUNDING_FAQ: readonly FaqEntry[] = [
  {
    question: "Who is this for?",
    answer: "Creators who already make videos for apps and want to be among the first on flowd. You need work to show: a link to videos you have made, so a person can see how you make them.",
  },
  {
    question: "Does a place guarantee earnings or approval?",
    answer: "No. A founding place is a badge, a head start toward your tier and free instant cash-out for a year. Every video still has to meet its brief, approval isn't guaranteed, and earnings vary. See the earnings disclosure for how we show them.",
  },
  {
    question: "How do you choose?",
    answer: "A person reads every application within 48 hours and looks at the work you link to. Places are not drawn by chance and cannot be bought.",
  },
  {
    question: "What if all 200 places are taken?",
    answer: "Then the page says so, and you can join the waitlist to hear when the next group opens. The count on this page is the true inventory.",
  },
  {
    question: "Is it free?",
    answer: "Yes. There is no fee to apply or to be a founding creator, and creators never pay a platform fee.",
  },
];

export default function FoundingCreatorsPage() {
  return (
    <>
      <PageHero
        eyebrow="Founding creators"
        title={
          <>
            Be one of the first <GradientWord>200.</GradientWord>
          </>
        }
        lede="The first creators on flowd get a Founding badge, a head start toward their tier and a year of free instant cash-out. We read every application, and the number of places left is the real number."
        note="Applications are read by a person within 48 hours. A place is not a guarantee of earnings or of approval on any bounty."
      >
        <GlassCard padding="lg" className="grid gap-6 rounded-[32px]">
          <div className="flex flex-wrap items-center gap-6">
            <FoundingBadge size={112} />
            <div className="min-w-0 flex-1">
              <FoundingCounter />
            </div>
          </div>
        </GlassCard>
      </PageHero>

      <MarketingSection id="perks" eyebrow="What you get" title="A badge, a head start and a year of free cash-out." reveal={false} className="pt-0">
        <FoundingPerks />
      </MarketingSection>

      <MarketingSection id="apply" eyebrow="Apply" title="Show us your work." lede="Three fields and a link. If you would rather wait, the ranked waitlist is open to everyone.">
        <FoundingApplication />
        <p className="mt-4 text-caption text-fg-subtle">
          Not ready to apply?{" "}
          <Link href="/waitlist" className="text-accent underline underline-offset-2">
            Join the ranked waitlist
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingSection id="terms" eyebrow="Terms and earnings" title="What this is, and what it is not.">
        <GlassCard padding="lg" className="grid gap-4 rounded-[28px]">
          <ul className="grid gap-2.5 text-body-sm text-fg-muted">
            {[
              "The programme is limited to 200 places and applications are reviewed by a person.",
              "The Founding badge, the tier head start and free instant cash-out for 12 months are the whole of the programme. There is no guaranteed income, no minimum earnings and no guaranteed approval of any video.",
              "You must be 18 or over, post from your own accounts and follow the community rules, including #ad on every sponsored post and no burner accounts.",
              "Any earnings figure we show, including the typical creator beside the top 10%, is a median or a range from cleared earnings. Results vary.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-caption text-fg-subtle">
            Read the{" "}
            <Link href="/legal/earnings-disclosure" className="text-accent underline underline-offset-2">
              earnings disclosure
            </Link>
            , the{" "}
            <Link href="/legal/creator-agreement" className="text-accent underline underline-offset-2">
              creator agreement
            </Link>{" "}
            and the{" "}
            <Link href="/legal/community-rules" className="text-accent underline underline-offset-2">
              community rules
            </Link>
            .
          </p>
        </GlassCard>
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Questions" title="Straight answers." lede="If something is missing, hello@joinflowd.io reaches a person.">
        <Faq items={FOUNDING_FAQ} />
      </MarketingSection>

      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Founding creators" }])} />
    </>
  );
}
