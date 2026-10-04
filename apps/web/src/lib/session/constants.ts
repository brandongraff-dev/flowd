import type { Role } from "@/lib/contract/types";

/**
 * The server-readable role cookie. Layouts read it with `getServerRole()` to redirect; the client mirrors it into localStorage.
 * This is a DEMO affordance (pick a persona on /login), not a security boundary: production swaps it for a signed httpOnly session.
 */
export const ROLE_COOKIE = "flowd_role";
/** localStorage key holding the persona the client last signed in as. */
export const SESSION_STORAGE_KEY = "flowd-session";
/** 30 days, in seconds. */
export const ROLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** The three account roles, in the order the persona picker shows them. */
export const ROLE_VALUES = ["brand_member", "creator", "admin"] as const satisfies readonly Role[];

/** The persona keys the UI and URLs use (`brand` is the `brand_member` role). */
export type PersonaKey = "brand" | "creator" | "admin";
export const PERSONA_KEYS = ["brand", "creator", "admin"] as const satisfies readonly PersonaKey[];

export const ROLE_TO_PERSONA: Readonly<Record<Role, PersonaKey>> = { brand_member: "brand", creator: "creator", admin: "admin" };
export const PERSONA_TO_ROLE: Readonly<Record<PersonaKey, Role>> = { brand: "brand_member", creator: "creator", admin: "admin" };

/** Short human label for a role ("Brand", "Creator", "Admin"): the vocabulary is "brand", never "brand_member", in UI copy. */
export const ROLE_LABEL: Readonly<Record<Role, string>> = { brand_member: "Brand", creator: "Creator", admin: "Admin" };

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
export const isPersonaKey = (value: unknown): value is PersonaKey => typeof value === "string" && (PERSONA_KEYS as readonly string[]).includes(value);
