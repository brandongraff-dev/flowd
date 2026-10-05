"use client";

import { RouteError } from "@/components/features/brand/review/route-states";

export default function Error({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  return <RouteError area="This video" error={error} retry={retry} reset={reset} />;
}
