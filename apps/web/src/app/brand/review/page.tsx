import { Suspense } from "react";
import type { Metadata } from "next";
import { ReviewQueue } from "@/components/features/brand/review/review-queue";
import { RouteLoading } from "@/components/features/brand/review/route-states";

export const metadata: Metadata = {
  title: "Review queue",
  description: "Decide every submission within 72 hours: keyboard-first review with QA flags, fraud evidence, bulk approval and a 10-second undo.",
};

export default function ReviewPage() {
  return (
    <Suspense fallback={<RouteLoading shape="queue" label="Loading the review queue" />}>
      <ReviewQueue />
    </Suspense>
  );
}
