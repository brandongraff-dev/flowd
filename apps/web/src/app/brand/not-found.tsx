import type { Metadata } from "next";
import { BrandNotFoundState } from "@/components/features/brand/core/page-states";

export const metadata: Metadata = { title: "Not found" };

/** A brand page or record that does not exist, shown inside the shell. */
export default function BrandNotFound() {
  return (
    <BrandNotFoundState
      title="That page is not in your workspace"
      description="The link may be old, or the bounty, app or invoice belongs to another workspace. Pick up from your overview."
      backHref="/brand"
      backLabel="Back to overview"
    />
  );
}
