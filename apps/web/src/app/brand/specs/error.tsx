"use client";

import { RouteError } from "@/components/features/brand/market/route-states";

export default function Error({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <RouteError area="Spec Market" error={error} retry={retry} reset={reset} />;
}
