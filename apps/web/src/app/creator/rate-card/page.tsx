import { RateCardView } from "@/components/features/creator/social/rate-card/rate-card-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Rate card", "Set your price per video, see where it sits against the market's typical range, and preview how brands see your card.", "/creator/rate-card");

export default function Page() {
  return <RateCardView />;
}
