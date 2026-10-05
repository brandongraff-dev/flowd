"use client";

import { PageError, type PageErrorProps } from "@/components/features/marketing/pages/route-states";

export default function StatusError(props: Omit<PageErrorProps, "what">) {
  return <PageError {...props} what="system status" />;
}
