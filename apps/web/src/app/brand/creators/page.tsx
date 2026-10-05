import { Suspense } from "react";
import type { Metadata } from "next";
import { CreatorsView } from "@/components/features/brand/market/creators-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Discover creators",
  description: "Find creators by verified results: reliability, approval rate, hit rate and cost per trial on your apps.",
};

export default function CreatorsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="cards" label="Loading creators" />}>
      <CreatorsView />
    </Suspense>
  );
}
