import type { Metadata } from "next";
import { FocusReview } from "@/components/features/brand/review/focus-review";

export const metadata: Metadata = {
  title: "Review a video",
  description: "Focus-mode review: the video, its scores and checks, fraud evidence, the creator's record and timecoded notes.",
};

export default async function FocusReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FocusReview id={decodeURIComponent(id)} />;
}
