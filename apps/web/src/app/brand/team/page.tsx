import { Suspense } from "react";
import type { Metadata } from "next";
import { TeamView } from "@/components/features/brand/market/team-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Team and activity",
  description: "Members, role permissions, client approval links and an exportable activity log.",
};

export default function TeamPage() {
  return (
    <Suspense fallback={<RouteLoading shape="table" label="Loading Team and activity" />}>
      <TeamView />
    </Suspense>
  );
}
