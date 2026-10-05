import { Suspense } from "react";
import type { Metadata } from "next";
import { AgencyView } from "@/components/features/brand/market/agency-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Agency roll-up",
  description: "Every client brand you manage in one roll-up, with queues, approval links and white-label reports.",
};

export default function AgencyPage() {
  return (
    <Suspense fallback={<RouteLoading shape="table" label="Loading Agency roll-up" />}>
      <AgencyView />
    </Suspense>
  );
}
