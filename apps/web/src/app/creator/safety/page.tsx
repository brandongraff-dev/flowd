import { Suspense } from "react";
import { SocialSkeleton } from "@/components/features/creator/social/shared/skeletons";
import { SafetyView } from "@/components/features/creator/social/safety/safety-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Scam Shield and Account Health", "Scam Shield rules, a spot-a-scam checklist, your reports, and the health of every account you post from.", "/creator/safety");

export default function Page() {
  return (
    <Suspense fallback={<SocialSkeleton label="Loading safety" layout="hero" />}>
      <SafetyView />
    </Suspense>
  );
}
