"use client";

import { PageError, type PageErrorProps } from "@/components/features/marketing/pages/route-states";

export default function ChangelogError(props: Omit<PageErrorProps, "what">) {
  return <PageError {...props} what="the changelog" />;
}
