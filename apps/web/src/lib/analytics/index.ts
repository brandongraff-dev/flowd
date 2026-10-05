/**
 * flowd analytics. Import from "@/lib/analytics". Typed events (docs/PRODUCT_SPEC.md section 10), privacy sanitising, and a no-op
 * PostHog-style adapter behind one `track()` call.
 *
 *   track("bounty_viewed", { source: "feed" })       typed names and properties
 *   initAnalytics({ adapter })                        mount an adapter (default: no-op)
 *   identify(userId, { role, plan, tier })            pseudonymous id, non-identifying traits only
 *   setAnalyticsContext({ plan: "pro" })              context merged into every event
 *   initAnalyticsFromEnv()                            mount the adapter the environment asks for (no-op by default)
 *   usePageView()                                     from "@/lib/analytics/use-page-view" (client)
 *   <AnalyticsBoot />                                 from "@/lib/analytics/analytics-boot" (client): both of the above, mounted once in Providers
 */

export * from "./events";
export * from "./adapter";
export * from "./privacy";
export * from "./track";
export * from "./bootstrap";
