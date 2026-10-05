import { Suspense } from "react";
import type { Metadata } from "next";
import { RouteLoading } from "@/components/features/brand/market/route-states";
import { SpecsView } from "@/components/features/brand/market/specs-view";

export const metadata: Metadata = {
  title: "Spec Market",
  description: "License pre-scored videos off the shelf, with first refusal on your own approved-but-unused videos.",
};

export default function SpecsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="cards" label="Loading the Spec Market" />}>
      <SpecsView />
    </Suspense>
  );
}
