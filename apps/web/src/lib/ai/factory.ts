/**
 * Which Flo engine the browser talks to. `NEXT_PUBLIC_FLO_MODE=local` (the default) runs the deterministic mock in the page: no server,
 * no key, works offline. `remote` posts to `/api/v1/flo/chat`, which may use Claude, and falls back to the local mock if the route cannot answer.
 */

import type { FloSuggestion } from "@/lib/contract/types";
import { publicEnv } from "@/lib/env";
import { HttpFloProvider } from "./http-provider";
import { MockFloProvider } from "./mock-provider";
import type { AIProvider } from "./types";

export interface CreateFloProviderOptions {
  /** `flo_suggestions` rows to replay for matching requests (history and a re-run agree). */
  suggestions?: readonly FloSuggestion[];
  /** Override the environment's mode. */
  mode?: "local" | "remote";
  fetch?: typeof fetch;
}

/** Builds a provider. Pass `suggestions` from the data layer so the demo's saved answers are replayed. */
export function createFloProvider(options: CreateFloProviderOptions = {}): AIProvider {
  const mock = new MockFloProvider({ suggestions: options.suggestions });
  const mode = options.mode ?? safeMode();
  return mode === "remote" ? new HttpFloProvider({ fallback: mock, fetch: options.fetch }) : mock;
}

function safeMode(): "local" | "remote" {
  try {
    return publicEnv().NEXT_PUBLIC_FLO_MODE;
  } catch {
    return "local";
  }
}

let shared: AIProvider | undefined;

/** The app-wide provider with no saved suggestions. Prefer `createFloProvider({ suggestions })` where the store is available. */
export function getFloProvider(): AIProvider {
  shared ??= createFloProvider();
  return shared;
}

/** Test helper. */
export function resetFloProviderForTests(): void {
  shared = undefined;
}
