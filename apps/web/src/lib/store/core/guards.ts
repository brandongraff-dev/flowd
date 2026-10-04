/**
 * Who may do what. The demo has three personas, but the checks are real: a creator cannot approve a video, a viewer cannot move money, and a
 * brand cannot touch another brand's bounties. Admin (Ops) may act anywhere. Failures are `ActionError`s with a plain-English message.
 */

import type { Brand, BrandMember, BrandMemberRole, Creator, User } from "@/lib/contract/types";
import { ActionError, ensure, type Tx } from "./tx";

export type BrandCapability = "view" | "review" | "finance" | "manage" | "build";

/** Which workspace roles can do what (DOMAIN: roles matrix). Owners and admins can do everything. */
const CAPABILITIES: Record<BrandCapability, readonly BrandMemberRole[]> = {
  view: ["owner", "admin", "reviewer", "finance", "viewer", "client_approver"],
  review: ["owner", "admin", "reviewer", "client_approver"],
  build: ["owner", "admin", "reviewer"],
  finance: ["owner", "admin", "finance"],
  manage: ["owner", "admin"],
};

export const roleCan = (role: BrandMemberRole, capability: BrandCapability): boolean => CAPABILITIES[capability].includes(role);

export interface BrandActor {
  brand: Brand;
  /** The signed-in member; absent when Ops acts on the brand's behalf. */
  member?: BrandMember;
  /** The acting user. */
  user_id: string;
  by_admin: boolean;
}

/** The brand a signed-in persona may act for: its own workspace, or a client brand when it is the managing agency. */
export function requireBrand(tx: Tx, brandId: string | null | undefined, capability: BrandCapability = "view"): BrandActor {
  const s = tx.session;
  ensure(s.persona !== null, "unauthenticated", "Sign in to do that.", "Pick a demo persona on the login page.", 401);
  const brand = tx.must("brands", brandId ?? s.brand_id, "Brand");
  if (s.persona === "admin") return { brand, user_id: s.user_id ?? "usr_ops", by_admin: true };
  ensure(s.persona === "brand", "forbidden", "Only the brand team can do that.", "Switch to the brand persona.", 403);
  const own = s.brand_id === brand.id;
  const managed = brand.agency_id !== undefined && brand.agency_id === s.brand_id;
  ensure(own || managed, "forbidden", "That belongs to another brand.", undefined, 403);
  const member = tx.get("brand_members", s.member_id ?? undefined) ?? tx.all("brand_members").find((m) => m.brand_id === s.brand_id && m.user_id === s.user_id);
  ensure(member && member.status === "active", "forbidden", "You are not an active member of this workspace.", undefined, 403);
  ensure(roleCan(member.role, capability), "forbidden", `Your role (${member.role.replace(/_/g, " ")}) cannot do that.`, "Ask a workspace owner or admin.", 403);
  return { brand, member, user_id: member.user_id, by_admin: false };
}

export interface CreatorActor {
  creator: Creator;
  user_id: string;
  by_admin: boolean;
}

/** The creator an action is for: the signed-in creator, or any creator when Ops acts. */
export function requireCreator(tx: Tx, creatorId?: string | null): CreatorActor {
  const s = tx.session;
  ensure(s.persona !== null, "unauthenticated", "Sign in to do that.", "Pick a demo persona on the login page.", 401);
  if (s.persona === "admin") {
    const creator = tx.must("creators", creatorId, "Creator");
    return { creator, user_id: s.user_id ?? "usr_ops", by_admin: true };
  }
  ensure(s.persona === "creator", "forbidden", "Only creators can do that.", "Switch to the creator persona.", 403);
  const id = s.creator_id;
  ensure(!creatorId || creatorId === id, "forbidden", "That belongs to another creator.", undefined, 403);
  const creator = tx.must("creators", id, "Creator");
  return { creator, user_id: creator.user_id, by_admin: false };
}

/** Ops only. */
export function requireAdmin(tx: Tx): User {
  const s = tx.session;
  ensure(s.persona !== null, "unauthenticated", "Sign in to do that.", "Pick a demo persona on the login page.", 401);
  ensure(s.persona === "admin", "forbidden", "Only Ops can do that.", "Switch to the admin persona.", 403);
  return tx.must("users", s.user_id, "User");
}

/** Who is acting, for audit trails: the user id and the party kind. */
export function actorOf(tx: Tx): { user_id: string | undefined; kind: "creator" | "brand" | "admin" | "system" } {
  const s = tx.session;
  if (s.persona === null) return { user_id: undefined, kind: "system" };
  return { user_id: s.user_id ?? undefined, kind: s.persona };
}

/** A plain refusal used by many actions when the object is in the wrong state. */
export const invalidState = (what: string, state: string, wanted: string): ActionError =>
  new ActionError("invalid_state", `This ${what} is ${state.replace(/_/g, " ")}, so that is not possible now.`, `It needs to be ${wanted}.`, 409);
