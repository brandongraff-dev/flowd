"use client";

import { useEffect } from "react";
import { initAnalyticsFromEnv } from "./bootstrap";
import { usePageView } from "./use-page-view";

/**
 * Mount once, near the root (`Providers`). Starts analytics from the environment (the no-op adapter unless one is configured, and
 * nothing at all under Do Not Track) and sends a `page_viewed` event on the first render and on every client-side navigation.
 * Renders nothing.
 */
export function AnalyticsBoot(): null {
  useEffect(() => {
    initAnalyticsFromEnv({ onWarn: process.env.NODE_ENV === "development" ? (message) => console.warn(message) : undefined });
  }, []);
  usePageView();
  return null;
}
