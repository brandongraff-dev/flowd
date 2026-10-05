"use client";

import { PageError, type PageErrorProps } from "@/components/features/marketing/pages/route-states";

export default function MarketError(props: Omit<PageErrorProps, "what">) {
  return <PageError {...props} what="the live market" />;
}
