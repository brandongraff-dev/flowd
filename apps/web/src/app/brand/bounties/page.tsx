import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandBountiesView } from "@/components/features/brand/core/bounties/bounties-view";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";

export const metadata: Metadata = {
  title: "Bounties",
  description: "Live, draft, filled and ended bounties with funding, fill, budget left and cost per trial.",
};

export default function BrandBountiesPage() {
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading bounties" kpis={false} />}>
      <BrandBountiesView />
    </Suspense>
  );
}
