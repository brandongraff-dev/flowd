"use client";

import { RouteError } from "@/components/features/brand/review/route-states";

export default function Error({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <RouteError area="Auto-approve rules" error={error} retry={retry} reset={reset} />;
}
