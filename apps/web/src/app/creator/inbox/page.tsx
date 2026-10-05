import { Suspense } from "react";
import { SocialSkeleton } from "@/components/features/creator/social/shared/skeletons";
import { InboxView } from "@/components/features/creator/social/inbox/inbox-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Inbox", "Offers, counters and messages in one place, each with its Pay Math and Rights Card inline. Every conversation stays inside flowd.", "/creator/inbox");

export default function Page() {
  return (
    <Suspense fallback={<SocialSkeleton label="Loading inbox" layout="split" />}>
      <InboxView />
    </Suspense>
  );
}
