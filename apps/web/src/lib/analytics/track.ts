/**
 * `track()`: the one function product code calls. Typed event names and properties, privacy sanitising, the spec's context on every
 * event, and an adapter behind it (a no-op until one is mounted).
 *
 * ```ts
 * track("bounty_viewed", { source: "feed" });
 * track("cash_out_confirmed", { instant: true, fee_cents: 240 });   // money is integer cents
 * ```
 *
 * Module state is per JS realm (one browser tab, one server process); the server never captures, so calling `track` in a server
 * component is a harmless no-op.
 */

import { publicEnv } from "@/lib/env";
import { noopAdapter, type AnalyticsAdapter } from "./adapter";
import type { AnalyticsContext, AnalyticsProps, EventArgs, EventName } from "./events";
import { pseudonymise, sanitizePath, sanitizeProps, privacyOptOut, type PrivacySignals } from "./privacy";

let adapter: AnalyticsAdapter = noopAdapter;
let enabled = true;
let captureOnServer = false;
let warn: ((message: string) => void) | null = null;

function defaultContext(): AnalyticsContext {
  let appVersion = "0.1.0";
  let demo = true;
  try {
    const env = publicEnv();
    appVersion = env.NEXT_PUBLIC_APP_VERSION;
    demo = env.NEXT_PUBLIC_DEMO_MODE;
  } catch {
    // An invalid public env is reported where it is first read; analytics falls back to the defaults.
  }
  return { surface: "web", app_version: appVersion, demo, locale: "en-US" };
}

let context: AnalyticsContext = defaultContext();

export interface InitAnalyticsOptions {
  /** The adapter to send to. Default: no-op. */
  adapter?: AnalyticsAdapter;
  /** Browser privacy signals (`navigator`). DNT or Global Privacy Control turns analytics off. */
  signals?: PrivacySignals;
  /** Called with a message when the sanitiser drops a property (development warnings). */
  onWarn?: (message: string) => void;
  /** Capture when there is no `window` (tests and server-side debugging). Default false: the server never captures. */
  captureOnServer?: boolean;
}

/** Mounts an adapter and applies the browser's privacy signals. Safe to call more than once (the last call wins). */
export function initAnalytics(options: InitAnalyticsOptions = {}): void {
  adapter = options.adapter ?? noopAdapter;
  enabled = !privacyOptOut(options.signals);
  warn = options.onWarn ?? null;
  captureOnServer = options.captureOnServer ?? false;
  if (enabled) adapter.init?.();
}

export const getAnalyticsAdapter = (): AnalyticsAdapter => adapter;
export const isAnalyticsEnabled = (): boolean => enabled;

/** Turns capturing on or off (a consent toggle). Off also resets the adapter's identity. */
export function setAnalyticsEnabled(next: boolean): void {
  if (!next && enabled) adapter.reset();
  enabled = next;
}

/** Merges into the context sent with every event (role, plan, tier, workspace or creator id). Ids are pseudonymised here. */
export function setAnalyticsContext(patch: Partial<Omit<AnalyticsContext, "workspace_id" | "creator_id">> & { workspaceId?: string; creatorId?: string }): void {
  const { workspaceId, creatorId, ...rest } = patch;
  context = {
    ...context,
    ...rest,
    ...(workspaceId ? { workspace_id: pseudonymise(workspaceId) } : {}),
    ...(creatorId ? { creator_id: pseudonymise(creatorId) } : {}),
  };
  adapter.register?.(contextProps());
}

export const getAnalyticsContext = (): Readonly<AnalyticsContext> => context;

function contextProps(): AnalyticsProps {
  return { ...context };
}

function canCapture(): boolean {
  return enabled && (typeof window !== "undefined" || captureOnServer);
}

/** Sends one event. Properties are sanitised; the spec's context is merged underneath. Never throws. */
export function track<E extends EventName>(event: E, ...args: EventArgs<E>): void {
  if (!canCapture()) return;
  try {
    const [props] = args as [AnalyticsProps | undefined];
    const clean = sanitizeProps(props);
    if (clean.dropped.length > 0) warn?.(`${event}: dropped ${clean.dropped.join("; ")}`);
    const withPath = typeof clean.props.path === "string" ? { ...clean.props, path: sanitizePath(clean.props.path) } : clean.props;
    adapter.capture(event, { ...contextProps(), ...withPath });
  } catch {
    // Analytics must never break the product.
  }
}

/** A page view: sends the adapter's native page call and the `page_viewed` event with the sanitised path. */
export function trackPage(path: string, props?: AnalyticsProps): void {
  if (!canCapture()) return;
  try {
    const safePath = sanitizePath(path);
    const clean = sanitizeProps(props);
    adapter.page?.(safePath, { ...contextProps(), ...clean.props });
    track("page_viewed", { path: safePath, ...clean.props });
  } catch {
    // Never break the product.
  }
}

/**
 * Ties later events to a pseudonymous id with only non-identifying traits: the role, plan and tier. Never an email or a name.
 * `id` is pseudonymised here, so pass the real user id.
 */
export function identify(id: string, traits: { role?: AnalyticsContext["role"]; plan?: AnalyticsContext["plan"]; tier?: AnalyticsContext["tier"] } = {}): void {
  setAnalyticsContext(traits);
  if (!canCapture()) return;
  try {
    adapter.identify(pseudonymise(id), { ...traits });
  } catch {
    // Never break the product.
  }
}

/** Sign-out: clears identity and the role, plan, tier and id context. */
export function resetAnalytics(): void {
  const { role: _role, plan: _plan, tier: _tier, workspace_id: _w, creator_id: _c, ...rest } = context;
  context = rest;
  try {
    adapter.reset();
  } catch {
    // Never break the product.
  }
}

/** Test helper: back to the no-op adapter, defaults and enabled. */
export function resetAnalyticsForTests(): void {
  adapter = noopAdapter;
  enabled = true;
  captureOnServer = false;
  warn = null;
  context = defaultContext();
}
