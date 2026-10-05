import { Suspense } from "react";
import type { Metadata } from "next";
import { AuctionsView } from "@/components/features/brand/market/auctions-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Auctions",
  description: "Sealed-bid, second-price auctions for top creator slots. Your maximum is held from the wallet and winners pay the clearing price.",
};

export default function AuctionsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="cards" label="Loading auctions" />}>
      <AuctionsView />
    </Suspense>
  );
}
