"use client";

/**
 * Small read models that only the Market, setup and developer pages need. They follow the data layer's rules (pure, total, declared keys), so
 * they live beside the pages rather than in the shared selector files.
 */

import type { AttributionLink, NotificationPrefs } from "@/lib/contract/types";
import { useSelect, defineSelector, type Db } from "@/lib/data";
import { valuesOf } from "@/lib/data/select";

export interface LinkSample {
  link: AttributionLink;
  creator_handle: string;
}

/** A few of the workspace's real tracking links for one app, busiest first: the preflight tester offers them as one-tap examples. */
export const selectMyLinks = defineSelector(["attribution_links", "creators", "apps", "session"] as const, (db: Db<"attribution_links" | "creators" | "apps" | "session">, appId: string | undefined): readonly LinkSample[] => {
  const app = (appId ? db.apps[appId] : undefined) ?? (db.session.app_id ? db.apps[db.session.app_id] : undefined);
  if (!app) return [];
  return valuesOf(db.attribution_links)
    .filter((link) => link.app_id === app.id && link.status === "active")
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 3)
    .map((link) => ({ link, creator_handle: db.creators[link.creator_id]?.handle ?? "creator" }));
});

/** The signed-in person's notification preferences, or undefined until they have saved any (the defaults apply). */
export const selectMyPrefs = defineSelector(["notification_prefs", "session"] as const, (db: Db<"notification_prefs" | "session">): NotificationPrefs | undefined => {
  const uid = db.session.user_id;
  return uid ? valuesOf(db.notification_prefs).find((prefs) => prefs.user_id === uid) : undefined;
});

export const useMyLinks = (appId: string | undefined): readonly LinkSample[] => useSelect(selectMyLinks, appId);
export const useMyPrefs = (): NotificationPrefs | undefined => useSelect(selectMyPrefs);
