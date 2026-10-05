import { Suspense } from "react";
import type { Metadata } from "next";
import { DevelopersView } from "@/components/features/brand/market/developers-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Developers",
  description: "API keys with scopes, signed webhook endpoints with delivery logs, and the MCP server config. Writes are drafts by default.",
};

export default function DevelopersPage() {
  return (
    <Suspense fallback={<RouteLoading shape="form" label="Loading Developers" />}>
      <DevelopersView />
    </Suspense>
  );
}
