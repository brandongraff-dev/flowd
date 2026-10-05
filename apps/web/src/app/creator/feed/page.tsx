import { FeedPage } from "@/components/features/creator/core/feed-page";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Bounty feed", "Funded bounties ranked for you, with the median pay, the pool left and how fast each brand decides.", "/creator/feed");

export default function CreatorFeedPage() {
  return <FeedPage />;
}
