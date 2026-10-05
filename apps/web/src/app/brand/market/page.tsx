import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketView } from "@/components/features/brand/market/market-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Market view",
  description: "Clearing CPM with its middle-half band, price against fill time with a confidence, supply and demand, and the trend radar.",
};

export default function MarketPage() {
  return (
    <Suspense fallback={<RouteLoading shape="dashboard" label="Loading the market" />}>
      <MarketView />
    </Suspense>
  );
}
