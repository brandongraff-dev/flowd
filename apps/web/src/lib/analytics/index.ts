/**
 * flowd analytics. Import from "@/lib/analytics". Typed events (docs/PRODUCT_SPEC.md section 10), privacy sanitising, and a no-op
 * PostHog-style adapter behind one `track()` call.
 *
 *   track("bounty_viewed", { source: "feed" })       typed names and properties
 *   initAnalytics({ adapter })                        mount an adapter (default: no-op)
 *   identify(userId, { role, plan, tier })            pseudonymous id, non-identifying traits only
 *   setAnalyticsContext({ plan: "pro" })              context merged into every event
 *   usePageView()                                     from "@/lib/analytics/use-page-view" (client)
 */

export * from "./events";
export * from "./adapter";
export * from "./privacy";
export * from "./track";
