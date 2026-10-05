import { Suspense } from "react";
import { SocialSkeleton } from "@/components/features/creator/social/shared/skeletons";
import { WrappedView } from "@/components/features/creator/social/wrapped/wrapped-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Wrapped", "Your month as a story: what cleared, what worked and where you stand, with the typical creator beside it.", "/creator/wrapped");

export default function Page() {
  return (
    <Suspense fallback={<SocialSkeleton label="Loading wrapped" layout="hero" />}>
      <WrappedView />
    </Suspense>
  );
}
