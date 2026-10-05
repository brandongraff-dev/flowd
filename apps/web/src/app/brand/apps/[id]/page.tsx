import type { Metadata } from "next";
import { Suspense } from "react";
import { AppDetailView } from "@/components/features/brand/core/apps/app-detail-view";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";

export const metadata: Metadata = {
  title: "App",
  description: "An app's listing, attribution coverage, integrations, rights defaults and bounty history.",
};

export default async function BrandAppDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading the app" kpis={false} />}>
      <AppDetailView id={decodeURIComponent(id)} />
    </Suspense>
  );
}
