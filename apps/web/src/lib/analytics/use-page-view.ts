"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPage } from "./track";

/**
 * Sends a `page_viewed` event on the first render and on every client-side navigation. Mount it once in a client component near the
 * root (the shells and the marketing layout). Sends nothing while analytics is the no-op adapter.
 */
export function usePageView(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) trackPage(pathname);
  }, [pathname]);
}
