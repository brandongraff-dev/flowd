/**
 * Starts analytics from the environment. `NEXT_PUBLIC_ANALYTICS_PROVIDER=none` (the default, and what this demo ships with) mounts the
 * no-op adapter, so nothing leaves the browser. `posthog` mounts `createPostHogAdapter` around a PostHog client, and
 * the browser's Do Not Track and Global Privacy Control signals switch everything off either way.
 *
 * flowd does not depend on posthog-js. The client is whatever the page already has: pass one in, or load PostHog's snippet and this
 * finds `window.posthog`. With the provider set to `posthog` and no client yet, it stays on the no-op adapter (and says so in `reason`)
 * instead of throwing, so a missing script never breaks a page.
 */

import { publicEnv } from "@/lib/env";
import { createPostHogAdapter, noopAdapter, type AnalyticsAdapter, type PostHogLike } from "./adapter";
import type { PrivacySignals } from "./privacy";
import { initAnalytics } from "./track";

export interface AnalyticsBootOptions {
  /** Which adapter to mount. Default: the public env (`NEXT_PUBLIC_ANALYTICS_PROVIDER`). */
  provider?: "none" | "posthog";
  /** An initialised PostHog-style client. Default: `window.posthog` when the snippet is on the page. */
  posthog?: PostHogLike;
  /** The browser's privacy signals. Default: `navigator`. */
  signals?: PrivacySignals;
  /** Called with a plain message when something was left out (development warnings). */
  onWarn?: (message: string) => void;
}

export interface AnalyticsBootResult {
  adapter: AnalyticsAdapter;
  /** Why the no-op adapter is in use when a real one was asked for. */
  reason?: "no_client";
}

/** The adapter for a provider setting and whatever client is available. Pure. */
export function chooseAdapter(provider: "none" | "posthog", client: PostHogLike | undefined): AnalyticsBootResult {
  if (provider === "posthog") return client ? { adapter: createPostHogAdapter(client) } : { adapter: noopAdapter, reason: "no_client" };
  return { adapter: noopAdapter };
}

function pageClient(): PostHogLike | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as unknown as { posthog?: Partial<PostHogLike> }).posthog;
  return candidate && typeof candidate.capture === "function" && typeof candidate.identify === "function" && typeof candidate.reset === "function" ? (candidate as PostHogLike) : undefined;
}

/** Mounts the adapter the environment asks for and applies the browser's privacy signals. Safe to call more than once. */
export function initAnalyticsFromEnv(options: AnalyticsBootOptions = {}): AnalyticsBootResult {
  let provider: "none" | "posthog" = "none";
  try {
    provider = options.provider ?? publicEnv().NEXT_PUBLIC_ANALYTICS_PROVIDER;
  } catch {
    // An invalid public env is reported where it is first read. Analytics stays off.
  }
  const chosen = chooseAdapter(provider, options.posthog ?? pageClient());
  if (chosen.reason === "no_client") options.onWarn?.("analytics: provider is posthog but no PostHog client was found, so nothing is sent");
  const signals = options.signals ?? (typeof navigator === "undefined" ? undefined : (navigator as unknown as PrivacySignals));
  initAnalytics({ adapter: chosen.adapter, signals, onWarn: options.onWarn });
  return chosen;
}
