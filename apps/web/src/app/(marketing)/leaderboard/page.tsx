import Link from "next/link";
import { CalendarClock, EyeOff, Users } from "lucide-react";
import { NICHES, type LeaderboardMetric, type Niche } from "@/lib/contract/types";
import { buildMetadata } from "@/lib/seo";
import { formatInt } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button-variants";
import { CtaBand, FactCard, HeroAccent, IconTile, PageHero, PageSection, SignupActions } from "@/components/features/marketing/pages/kit";
import { getLeaderboardData } from "@/components/features/marketing/pages/leaderboard/leaderboard-data";
import { LeaderboardExplorer } from "@/components/features/marketing/pages/leaderboard/leaderboard-explorer";
import { LeaderboardHero } from "@/components/features/marketing/pages/leaderboard/leaderboard-hero";

export const metadata = buildMetadata({
  title: "Leaderboards",
  description: "The weekly top 20 creators by niche, ranked by cleared earnings, installs per 1,000 views or score accuracy. Boards reset every Monday, and the typical creator is shown beside the top.",
  path: "/leaderboard",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const METRICS: readonly LeaderboardMetric[] = ["earnings", "conversion_rate", "score_accuracy"];

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [data, params] = await Promise.all([getLeaderboardData(), searchParams]);
  const metricParam = first(params.metric);
  const nicheParam = first(params.niche);
  const metric: LeaderboardMetric = METRICS.find((item) => item === metricParam) ?? "earnings";
  const niche: Niche | "all" = NICHES.find((item) => item === nicheParam) ?? "all";
  const largest = Math.max(0, ...Object.values(data.boards).map((board) => board.size));

  return (
    <>
      <PageHero
        eyebrow="Leaderboards"
        title={
          <>
            Who is winning <HeroAccent>this week.</HeroAccent>
          </>
        }
        lede="Public boards by niche, reset every Monday. Rank by what cleared, by installs per 1,000 views, or by how well a creator's own score predicted the result. Creators can hide from boards at any time."
        actions={
          <>
            <Link href="#board" className={buttonVariants({ variant: "primary", size: "lg" })}>
              See the boards
            </Link>
            <Link href="/signup/creator" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Join as a creator
            </Link>
          </>
        }
        art={<LeaderboardHero data={data} />}
      />

      <LeaderboardExplorer data={data} initialMetric={metric} initialNiche={niche} />

      <PageSection id="how" eyebrow="How boards work" title="Fair by design" description="Boards exist to show what good looks like, not to make anyone feel behind.">
        <div className="grid gap-4 md:grid-cols-3">
          <FactCard>
            <IconTile tone="accent">
              <CalendarClock />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">A fresh start every Monday</h3>
            <p className="text-body-sm text-fg-muted">Every board resets at 00:00 UTC on Monday. Only money that has cleared counts, so a lucky pending week cannot jump the queue.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="violet">
              <Users />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Peers, not the whole world</h3>
            <p className="text-body-sm text-fg-muted">
              Inside the app you are ranked against about {data.cohortTarget} creators of your own tier and niche, with a promotion zone and no demotion zone. The public global board shows the top {data.boardSize}.
            </p>
          </FactCard>
          <FactCard>
            <IconTile tone="info">
              <EyeOff />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Your name, your call</h3>
            <p className="text-body-sm text-fg-muted">Hide from leaderboards in Wellbeing Mode and you are neither shown nor ranked. It never changes your tier, your streak or what you are paid.</p>
          </FactCard>
        </div>
        <p className="mt-6 max-w-[72ch] text-caption text-fg-subtle">
          Boards this week range from a handful of creators in small niches to {formatInt(largest)} on the largest. A niche with too few settled posts has no board rather than a misleading one.
        </p>
      </PageSection>

      <CtaBand title="Earn a place on the board, or just earn." description="Creators join free. Your first dollar starts with one video for a flowd-funded starter bounty." actions={<SignupActions />} />
    </>
  );
}
