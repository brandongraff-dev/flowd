"use client";

import type { Platform } from "@/lib/contract/types";
import { defineSelector, useSelect, type Db } from "@/lib/data";
import { hoursBetween } from "@/lib/engine";
import { desc } from "@/lib/data/select";

/** A creator's connected account as a reviewer needs it: reach, quality and how old it is. */
export interface CreatorAccountView {
  id: string;
  platform: Platform;
  handle: string;
  followers: number;
  engagement_rate: number;
  us_audience_ratio: number;
  /** Whole days since the account was created (a very new account is a fraud signal). */
  age_days: number;
  verified: boolean;
  primary: boolean;
}

const NONE: readonly CreatorAccountView[] = Object.freeze([]);

/** The connected accounts of one creator, primary first. */
export const selectCreatorAccounts = defineSelector(["social_accounts", "clock"] as const, (db: Db<"social_accounts" | "clock">, creatorId: string | undefined): readonly CreatorAccountView[] => {
  if (!creatorId) return NONE;
  return Object.values(db.social_accounts)
    .filter((a) => a.creator_id === creatorId && a.status === "connected")
    .map(
      (a): CreatorAccountView => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        followers: a.followers,
        engagement_rate: a.engagement_rate,
        us_audience_ratio: a.us_audience_ratio,
        age_days: Math.max(0, Math.floor(hoursBetween(a.account_created_at, db.clock.now) / 24)),
        verified: a.verified_by_platform,
        primary: a.primary,
      }),
    )
    .sort((a, b) => Number(b.primary) - Number(a.primary) || desc(a.followers, b.followers));
});

/** `useCreatorAccounts(id)`: the creator's connected accounts, for the fraud evidence (account age, audience, engagement). */
export function useCreatorAccounts(creatorId: string | undefined): readonly CreatorAccountView[] {
  return useSelect(selectCreatorAccounts, creatorId);
}

/** "2 y 3 mo", "5 mo", "19 days". */
export function accountAge(days: number): string {
  if (days >= 730) return `${Math.floor(days / 365)} y ${Math.round((days % 365) / 30)} mo`.replace(" 0 mo", "");
  if (days >= 60) return `${Math.round(days / 30)} mo`;
  return `${days} days`;
}
