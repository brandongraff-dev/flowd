import { Suspense } from "react";
import type { Metadata } from "next";
import { OffersView } from "@/components/features/brand/market/offers-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Offers",
  description: "Direct offers and invites to creators: counter, accept, and hold the money in escrow when you both agree.",
};

export default function OffersPage() {
  return (
    <Suspense fallback={<RouteLoading shape="split" label="Loading offers" />}>
      <OffersView />
    </Suspense>
  );
}
