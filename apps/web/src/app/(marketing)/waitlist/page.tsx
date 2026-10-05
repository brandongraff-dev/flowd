import Link from "next/link";
import { breadcrumbJsonLd, buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { WAITLIST_JUMP_PER_INVITE } from "@/lib/engine";
import { GlassCard } from "@/components/glass/glass";
import { getMarketingSnapshot } from "@/components/features/marketing/home/data";
import { Faq, type FaqEntry } from "@/components/features/marketing/home/faq";
import { GradientWord, MarketingSection, PageHero } from "@/components/features/marketing/home/section";
import { WaitlistExperience } from "@/components/features/marketing/home/waitlist-experience";

export const metadata = buildMetadata({
  title: "Join the waitlist",
  description: "Get in line for flowd. Your place is your join order, every friend who joins with your link moves you up, and perks depend on position, never on chance.",
  path: "/waitlist",
});

const WAITLIST_FAQ: readonly FaqEntry[] = [
  {
    question: "How is my place decided?",
    answer: `By the order you joined. Every friend who joins with your link moves you up ${WAITLIST_JUMP_PER_INVITE} places. The number you see is your real place: ranks run 1 to n with no gaps.`,
  },
  {
    question: "What do I get for inviting friends?",
    answer: "A better place in line, and nothing else. The reward is one level deep (your friends' invitations do not count for you), it is funded by flowd, and it is never a prize drawn by chance.",
  },
  {
    question: "Is there a catch?",
    answer: "No purchase or payment is needed to join or to move up. Joining is not an offer of work, and nothing on this page promises earnings or approval on any bounty.",
  },
  {
    question: "What happens to my email?",
    answer: "It is used to send your invite and updates about flowd, and you can ask us to delete it. In this demo only a masked version is kept, in your browser. See the privacy policy for how it works in production.",
  },
];

const HOW = [
  { title: "Join", body: "Pick creator or app team, add your email, and take your place." },
  { title: "Invite", body: `Share your link. Each friend who joins moves you up ${WAITLIST_JUMP_PER_INVITE} places.` },
  { title: "Get in", body: "Invites go out in position order as places open up." },
] as const;

export default async function WaitlistPage() {
  const data = await getMarketingSnapshot();

  return (
    <>
      <PageHero
        eyebrow="Ranked waitlist"
        title={
          <>
            Get in line. <GradientWord>Move up.</GradientWord>
          </>
        }
        lede={`${data.waitlist.total.toLocaleString("en-US")} creators and app teams are on the list. Your place is real, you can see it move, and the perks depend on where you stand, not on luck.`}
        note="Demo data: the counts on this page come from a fictional demo world. Joining is free and needs no purchase."
      />

      <MarketingSection id="join" eyebrow="Join" title="Take your place." reveal={false} className="pt-0">
        <WaitlistExperience />
      </MarketingSection>

      <MarketingSection id="how" eyebrow="How it works" title="Three steps, one rule." lede="One rule: your place only ever moves because a real person joined with your link.">
        <ol className="grid gap-4 md:grid-cols-3">
          {HOW.map((step, index) => (
            <li key={step.title}>
              <GlassCard padding="lg" className="grid h-full content-start gap-2 rounded-[28px]">
                <span aria-hidden="true" className="font-display text-figure-lg text-fg-subtle tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-title-md text-fg">{step.title}</h3>
                <p className="text-body-sm text-pretty text-fg-muted">{step.body}</p>
              </GlassCard>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection id="faq" eyebrow="Questions" title="The fine print, in plain English." lede="The terms behind the waitlist, written so you can read them.">
        <Faq items={WAITLIST_FAQ} />
        <p className="mt-6 text-caption text-fg-subtle">
          Looking to apply for a founding place instead?{" "}
          <Link href="/founding-creators" className="text-accent underline underline-offset-2">
            See the founding creators programme
          </Link>
          .
        </p>
      </MarketingSection>

      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Waitlist" }])} />
    </>
  );
}
