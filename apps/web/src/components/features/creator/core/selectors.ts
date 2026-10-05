"use client";

/**
 * Small selectors the creator core pages need that the shared data layer has no hook for yet (notification preferences, every linked account
 * with its state, the creator's identity checks). They follow the data-layer rules: pure, total on the empty world, reading only the tables
 * they declare.
 */

import type { NotificationPrefs, Post, SocialAccount, Verification } from "@/lib/contract/types";
import { useSelect } from "@/lib/data";
import { defineSelector, groupBy, type Db } from "@/lib/data/select";

/** The preference fields a page edits. */
export type PrefsView = Pick<NotificationPrefs, "push" | "email_digest" | "categories" | "quiet_hours" | "batch_non_cash" | "drop_reminder">;

/** What preferences are before anything is saved: everything on except the single, opt-in Daily Drop reminder. Mirrors the store's own defaults. */
export const PREFS_DEFAULTS: PrefsView = {
  push: true,
  email_digest: true,
  categories: { money: true, reviews: true, drop: true, offers: true, tournaments: true, tips: true, safety: true },
  quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "America/Chicago" },
  batch_non_cash: true,
  drop_reminder: false,
};

export const selectNotificationPrefs = defineSelector(["notification_prefs", "session"] as const, (db: Db<"notification_prefs" | "session">): PrefsView => {
  const uid = db.session.user_id;
  const saved = uid ? groupBy(db.notification_prefs, "user", (p) => p.user_id).get(uid)[0] : undefined;
  return saved ?? PREFS_DEFAULTS;
});

export const selectMyAccounts = defineSelector(["social_accounts", "session"] as const, (db: Db<"social_accounts" | "session">): readonly SocialAccount[] => {
  const me = db.session.creator_id;
  return me ? groupBy(db.social_accounts, "creator", (a) => a.creator_id).get(me) : [];
});

export const selectMyVerifications = defineSelector(["verifications", "session"] as const, (db: Db<"verifications" | "session">): readonly Verification[] => {
  const me = db.session.creator_id;
  return me
    ? groupBy(db.verifications, "creator", (v) => v.creator_id)
        .get(me)
        .slice()
        .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
    : [];
});

/** Posts by id, in the order asked (a brief's example posts). Unknown ids are skipped. */
export const selectPostsByIds = defineSelector(["posts"] as const, (db: Db<"posts">, ids: readonly string[] | undefined): readonly Post[] => (ids ?? []).map((id) => db.posts[id]).filter((p): p is Post => p !== undefined));

/** Notification preferences of the signed-in creator: channels, categories, quiet hours and the one Daily Drop reminder. Defaults until saved. */
export const useNotificationPrefs = (): PrefsView => useSelect(selectNotificationPrefs);

/** Every account the creator linked, connected or not. */
export const useMyAccounts = (): readonly SocialAccount[] => useSelect(selectMyAccounts);

/** The creator's identity checks, newest first. */
export const useMyVerifications = (): readonly Verification[] => useSelect(selectMyVerifications);

/** The example posts a brief points at, so a creator can see what a winning take looks like. */
export const usePostsByIds = (ids: readonly string[] | undefined): readonly Post[] => useSelect(selectPostsByIds, ids as string[] | undefined);
