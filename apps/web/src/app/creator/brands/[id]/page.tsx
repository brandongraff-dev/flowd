import { BrandScorecardPage } from "@/components/features/creator/core/scorecard";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Brand Scorecard", "How fast a brand decides, how fairly, how quickly it pays and how much of the work it approves it actually runs.", "/creator/brands");

export default async function CreatorBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandScorecardPage brandId={id} />;
}
