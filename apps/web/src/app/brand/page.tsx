import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";
import { BrandOverviewView } from "@/components/features/brand/core/overview/overview-view";

export const metadata: Metadata = {
  title: "Overview",
  description: "Spend, verified views, installs, trials and cost per trial, what needs you, and what to do next.",
};

export default function BrandOverviewPage() {
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading the overview" />}>
      <BrandOverviewView />
    </Suspense>
  );
}
