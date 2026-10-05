import { Suspense } from "react";
import type { Metadata } from "next";
import { IntegrationsView } from "@/components/features/brand/market/integrations-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect RevenueCat, measurement partners, ad accounts, Slack and Zapier, with status, scopes, test events and the webhook log.",
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="cards" label="Loading Integrations" />}>
      <IntegrationsView />
    </Suspense>
  );
}
