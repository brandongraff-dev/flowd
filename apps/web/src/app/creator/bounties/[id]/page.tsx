import { BountyDetail } from "@/components/features/creator/core/bounty-detail";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Bounty", "The brief, the Rights Card, the pay at the median and the brand's scorecard, before you decide to make a take.", "/creator/bounties");

export default async function CreatorBountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BountyDetail bountyId={id} />;
}
