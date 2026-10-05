import { Suspense } from "react";
import { LeaderboardView } from "@/components/features/creator/social/leaderboard/leaderboard-view";
import { SocialSkeleton } from "@/components/features/creator/social/shared/skeletons";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Leaderboard", "Your weekly peer cohort of about 30 creators, the promotion line and the public board.", "/creator/leaderboard");

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<SocialSkeleton label="Loading leaderboard" layout="hero" />}>
      <LeaderboardView />
    </Suspense>
  );
}
