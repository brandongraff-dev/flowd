/**
 * Analytics adapters. The product talks to one small interface; what is behind it is a deployment decision.
 *
 *  - `noopAdapter`            the default. Nothing leaves the browser (this build ships with analytics off).
 *  - `createMemoryAdapter()`  records events in an array: tests, the /dev pages and "what would we send?" debugging.
 *  - `createConsoleAdapter()` logs each event in development.
 *  - `createPostHogAdapter()` wraps a posthog-js style client you inject. flowd does not depend on posthog-js; when you add it,
 *                             `createPostHogAdapter(posthog)` is the whole integration.
 *
 * Adapters receive events that were already sanitised and enriched by `track()`, so an adapter never has to enforce the privacy rules.
 */

import type { AnalyticsProps } from "./events";

export interface AnalyticsAdapter {
  readonly name: string;
  /** Called once by `initAnalytics`. */
  init?(): void;
  /** One event with its properties (context already merged in). */
  capture(event: string, props: AnalyticsProps): void;
  /** Associates later events with a pseudonymous id and non-identifying traits (role, plan, tier). */
  identify(distinctId: string, traits?: AnalyticsProps): void;
  /** A page view. Adapters without a native page call may ignore it: `track("page_viewed")` is sent as well. */
  page?(path: string, props?: AnalyticsProps): void;
  /** Sign-out: forget the distinct id. */
  reset(): void;
  /** Properties sent with every later event. */
  register?(props: AnalyticsProps): void;
}

/** Does nothing, by design. */
export const noopAdapter: AnalyticsAdapter = {
  name: "noop",
  capture() {},
  identify() {},
  reset() {},
};

export interface CapturedEvent {
  kind: "capture" | "identify" | "page" | "reset" | "register";
  event?: string;
  props?: AnalyticsProps;
  distinctId?: string;
  path?: string;
}

export interface MemoryAdapter extends AnalyticsAdapter {
  /** Everything received, in order. */
  readonly events: CapturedEvent[];
  /** Only the `capture` calls, as `[name, props]`. */
  captures(): [string, AnalyticsProps][];
  clear(): void;
}

export function createMemoryAdapter(): MemoryAdapter {
  const events: CapturedEvent[] = [];
  return {
    name: "memory",
    events,
    capture: (event, props) => void events.push({ kind: "capture", event, props }),
    identify: (distinctId, props) => void events.push({ kind: "identify", distinctId, props }),
    page: (path, props) => void events.push({ kind: "page", path, props }),
    reset: () => void events.push({ kind: "reset" }),
    register: (props) => void events.push({ kind: "register", props }),
    captures: () => events.filter((e) => e.kind === "capture").map((e): [string, AnalyticsProps] => [e.event ?? "", e.props ?? {}]),
    clear: () => void events.splice(0, events.length),
  };
}

/** Logs to the console (debug level). Development only: do not mount in production. */
export function createConsoleAdapter(log: (...args: unknown[]) => void = console.debug): AnalyticsAdapter {
  return {
    name: "console",
    capture: (event, props) => log("[analytics]", event, props),
    identify: (distinctId, props) => log("[analytics] identify", distinctId, props),
    page: (path, props) => log("[analytics] page", path, props),
    reset: () => log("[analytics] reset"),
    register: (props) => log("[analytics] register", props),
  };
}

/** The slice of posthog-js the adapter uses. Any client with these methods works (posthog-js, a server SDK wrapper, a test double). */
export interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
  register?(properties: Record<string, unknown>): void;
}

/**
 * Wraps a PostHog-style client. Page views go through `capture("$pageview")`, PostHog's own event name, so its built-in web
 * analytics keep working. Pass the client after it has been initialised with `person_profiles: "identified_only"`.
 */
export function createPostHogAdapter(client: PostHogLike): AnalyticsAdapter {
  return {
    name: "posthog",
    capture: (event, props) => client.capture(event, { ...props }),
    identify: (distinctId, traits) => client.identify(distinctId, traits ? { ...traits } : undefined),
    page: (path, props) => client.capture("$pageview", { ...props, $pathname: path }),
    reset: () => client.reset(),
    register: (props) => client.register?.({ ...props }),
  };
}
