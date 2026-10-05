import type { Metadata } from "next";
import { Suspense } from "react";
import { BountyDetailView } from "@/components/features/brand/core/bounties/bounty-detail-view";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";

export const metadata: Metadata = {
  title: "Bounty",
  description: "A bounty's pool, escrow, submissions, settlement, funnel, creators and settings.",
};

export default async function BrandBountyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading the bounty" kpis={false} />}>
      <BountyDetailView id={decodeURIComponent(id)} />
    </Suspense>
  );
}
