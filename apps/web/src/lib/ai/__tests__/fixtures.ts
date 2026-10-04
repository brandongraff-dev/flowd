/** Test helper: reads the demo world's fixtures from disk (typed by the caller), so tests run on realistic data. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { App, Bounty, Format, FloSuggestion } from "@/lib/contract/types";

const dir = fileURLToPath(new URL("../../../data/fixtures/", import.meta.url));
const cache = new Map<string, unknown>();

export function fixture<T>(name: string): T {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(`${dir}${name}.json`, "utf8")));
  return cache.get(name) as T;
}

export const bounties = (): Bounty[] => fixture<Bounty[]>("bounties");
export const apps = (): App[] => fixture<App[]>("apps");
export const formats = (): Format[] => fixture<Format[]>("formats");
export const suggestions = (): FloSuggestion[] => fixture<FloSuggestion[]>("flo_suggestions");

export function appOf(bounty: Bounty): App {
  const app = apps().find((a) => a.id === bounty.app_id);
  if (!app) throw new Error(`fixture: no app for ${bounty.id}`);
  return app;
}

export function bountyById(id: string): Bounty {
  const b = bounties().find((x) => x.id === id);
  if (!b) throw new Error(`fixture: no bounty ${id}`);
  return b;
}

export function formatById(id: string): Format {
  const f = formats().find((x) => x.id === id);
  if (!f) throw new Error(`fixture: no format ${id}`);
  return f;
}
