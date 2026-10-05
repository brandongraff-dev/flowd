import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsView } from "@/components/features/brand/market/settings-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Settings",
  description: "Workspace profile, plan and billing, notifications, review and compliance defaults, default rights and tax details.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="form" label="Loading Settings" />}>
      <SettingsView />
    </Suspense>
  );
}
