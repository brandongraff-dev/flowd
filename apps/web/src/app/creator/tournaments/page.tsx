import { Suspense } from "react";
import { SocialSkeleton } from "@/components/features/creator/social/shared/skeletons";
import { TournamentsView } from "@/components/features/creator/social/tournaments/tournaments-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Tournaments", "Free-to-enter hook battles and brackets with sponsored prize pools. See what is live, what is coming and how past ones ended.", "/creator/tournaments");

export default function TournamentsPage() {
  return (
    <Suspense fallback={<SocialSkeleton label="Loading tournaments" layout="grid" />}>
      <TournamentsView />
    </Suspense>
  );
}
