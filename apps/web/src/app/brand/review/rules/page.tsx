import { Suspense } from "react";
import type { Metadata } from "next";
import { RouteLoading } from "@/components/features/brand/review/route-states";
import { RulesPage } from "@/components/features/brand/review/rules-page";

export const metadata: Metadata = {
  title: "Auto-approve rules",
  description: "Guarded auto-approve: a dry run on your last 50 videos, caps, a 10% human spot-check and a kill switch. Organic posting only.",
};

export default function AutoApproveRulesPage() {
  return (
    <Suspense fallback={<RouteLoading shape="split" label="Loading auto-approve rules" />}>
      <RulesPage />
    </Suspense>
  );
}
