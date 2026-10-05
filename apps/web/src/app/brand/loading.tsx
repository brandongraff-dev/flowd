import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";

/** Shown inside the shell while any brand page loads, so navigating never blanks the nav. */
export default function BrandLoading() {
  return <BrandPageSkeleton />;
}
