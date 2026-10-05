import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandAppsView } from "@/components/features/brand/core/apps/apps-view";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";

export const metadata: Metadata = {
  title: "Apps",
  description: "Every app in your workspace with its attribution health, live bounties and archive controls.",
};

export default function BrandAppsPage() {
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading apps" kpis={false} />}>
      <BrandAppsView />
    </Suspense>
  );
}
