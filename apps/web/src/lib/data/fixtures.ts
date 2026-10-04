/**
 * Typed loading of every synced fixture (`src/data/fixtures/*.json`, copied from `packages/contract/fixtures` by `npm run sync`).
 *
 * Pages never import the JSON directly: they read the demo store through `@/lib/data` hooks. This module is the single door the store (and the
 * server-side mock API) uses to bring the files in. It loads each file with one dynamic import so that
 *   - the bundler splits every fixture into its own chunk and nothing is fetched until it is needed, and
 *   - TypeScript does not infer a literal type from 20 MB of JSON (the cast to `FixtureMap` is the typing).
 */

import type { FixtureMap, FixtureName } from "@/lib/contract/types";
import { FIXTURE_FILES } from "@/lib/contract/types";

/** Every fixture name, in catalogue order. */
export const FIXTURE_NAMES: readonly FixtureName[] = FIXTURE_FILES.map((f) => f.name);

/** Row-table fixtures are arrays; docs (world, ticker, waitlist, state_of_app_ugc, admin_metrics) are single objects. */
export const isArrayFixture = (name: FixtureName): boolean => FIXTURE_FILES.find((f) => f.name === name)?.shape === "array";

const cache = new Map<FixtureName, Promise<unknown>>();

/**
 * Loads one fixture. The result is shared and must be treated as read-only (the store never mutates it; it copies rows on write).
 * Safe to call on the server and in the browser; repeated calls return the same promise.
 */
export function loadFixture<K extends FixtureName>(name: K): Promise<FixtureMap[K]> {
  const hit = cache.get(name);
  if (hit) return hit as Promise<FixtureMap[K]>;
  const promise = import(`../../data/fixtures/${name}.json`).then((mod: { default?: unknown }) => (mod.default ?? mod) as FixtureMap[K]);
  cache.set(name, promise);
  // A failed import must not poison the cache: the next call retries.
  promise.catch(() => cache.delete(name));
  return promise as Promise<FixtureMap[K]>;
}

/** Loads several fixtures in parallel. */
export async function loadFixtures<K extends FixtureName>(names: readonly K[]): Promise<{ [P in K]: FixtureMap[P] }> {
  const entries = await Promise.all(names.map(async (n) => [n, await loadFixture(n)] as const));
  return Object.fromEntries(entries) as { [P in K]: FixtureMap[P] };
}
