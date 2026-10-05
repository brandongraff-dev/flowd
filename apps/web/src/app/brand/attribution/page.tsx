import { Suspense } from "react";
import type { Metadata } from "next";
import { AttributionView } from "@/components/features/brand/market/attribution-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Attribution Kit",
  description: "Tracking links, offer-code pool, RevenueCat webhook, SDK snippet and survey, with every conversion labelled Tracked or Estimated.",
};

export default function AttributionPage() {
  return (
    <Suspense fallback={<RouteLoading shape="dashboard" label="Loading the Attribution Kit" />}>
      <AttributionView />
    </Suspense>
  );
}
