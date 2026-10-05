/**
 * Who is looking: the signed-in demo persona with the rows that go with it (user, creator, brand workspace, member, active app).
 */

import type { App, Brand, BrandMember, BrandMemberRole, Creator, User } from "@/lib/contract/types";
import type { Persona } from "@/lib/store/state";
import { defineSelector, groupBy, valuesOf, type Db } from "../select";

export interface Me {
  persona: Persona | null;
  signedIn: boolean;
  user?: User;
  /** The signed-in creator (persona "creator"). */
  creator?: Creator;
  /** The workspace being looked at (persona "brand"). */
  brand?: Brand;
  member?: BrandMember;
  member_role?: BrandMemberRole;
  /** The workspace's active app. */
  app?: App;
  /** Apps of the current workspace (the app switcher). */
  apps: readonly App[];
  /** Workspaces the member can switch to: their own brand and, for an agency, its client brands (the workspace switcher). */
  workspaces: readonly Brand[];
}

export type MeDb = Db<"session" | "users" | "creators" | "brands" | "brand_members" | "apps">;

export function me(db: MeDb): Me {
  const s = db.session;
  const user = s.user_id ? db.users[s.user_id] : undefined;
  const creator = s.creator_id ? db.creators[s.creator_id] : undefined;
  const brand = s.brand_id ? db.brands[s.brand_id] : undefined;
  const member = s.member_id ? db.brand_members[s.member_id] : undefined;
  // An archived app leaves the switcher (its history stays reachable from Apps).
  const apps = brand ? groupBy(db.apps, "brand", (a) => a.brand_id).get(brand.id).filter((a) => a.archived_at === undefined) : [];
  const app = (s.app_id ? db.apps[s.app_id] : undefined) ?? apps.find((a) => a.status === "connected") ?? apps[0];
  const workspaces: Brand[] = brand ? [brand, ...valuesOf(db.brands).filter((b) => b.agency_id === brand.id)] : [];
  return { persona: s.persona, signedIn: s.persona !== null, user, creator, brand, member, member_role: member?.role, app, apps, workspaces };
}

/** Who is signed in, with their rows. Safe before the store is ready (`signedIn` false, rows undefined). */
export const selectMe = defineSelector(["session", "users", "creators", "brands", "brand_members", "apps"] as const, (db: MeDb) => me(db));
