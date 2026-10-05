"use client";

import { PageError, type PageErrorProps } from "@/components/features/marketing/pages/route-states";

export default function DevelopersError(props: Omit<PageErrorProps, "what">) {
  return <PageError {...props} what="the developer docs" />;
}
