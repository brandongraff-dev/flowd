"use client";

import { BrandErrorState } from "@/components/features/brand/core/error-state";

/** Error boundary for the brand dashboard: it renders inside the shell and offers a retry. */
export default function BrandError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <BrandErrorState error={error} reset={reset} />;
}
