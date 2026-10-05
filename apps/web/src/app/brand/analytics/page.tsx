import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyticsPage } from "@/components/features/brand/review/analytics/analytics-page";
import { RouteLoading } from "@/components/features/brand/review/route-states";

export const metadata: Metadata = {
  title: "Funnel and analytics",
  description: "Verified views to paid subscriptions with Tracked and Estimated kept apart, cost per stage, ROAS by day, payback and a creator league ranked on cost per trial.",
};

export default function AnalyticsRoute() {
  return (
    <Suspense fallback={<RouteLoading shape="dashboard" label="Loading the funnel" />}>
      <AnalyticsPage />
    </Suspense>
  );
}
