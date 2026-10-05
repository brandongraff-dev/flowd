import { Suspense } from "react";
import type { Metadata } from "next";
import { ListsView } from "@/components/features/brand/market/lists-view";
import { RouteLoading } from "@/components/features/brand/market/route-states";

export const metadata: Metadata = {
  title: "Creator lists",
  description: "Your creator CRM: favourites and custom lists with notes, tags, bulk offers and export.",
};

export default function CreatorListsPage() {
  return (
    <Suspense fallback={<RouteLoading shape="table" label="Loading lists" />}>
      <ListsView />
    </Suspense>
  );
}
