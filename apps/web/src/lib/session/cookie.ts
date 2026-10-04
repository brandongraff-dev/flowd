/**
 * The `flowd_role` cookie: parse, serialize, read and write. Parsing and serializing are pure (server, proxy, tests);
 * `readRoleCookie` / `writeRoleCookie` touch `document.cookie` and are client-only (they no-op during SSR).
 */

import type { Role } from "@/lib/contract/types";
import { isRole, ROLE_COOKIE, ROLE_COOKIE_MAX_AGE } from "./constants";

/** A cookie value to a role, or null for anything that is not one of the three roles. */
export const parseRole = (value: string | null | undefined): Role | null => (isRole(value) ? value : null);

/** Reads the role out of a raw `Cookie` request header ("a=1; flowd_role=creator; b=2"). */
export function readRoleFromCookieHeader(header: string | null | undefined): Role | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ROLE_COOKIE) return parseRole(decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return null;
}

export interface RoleCookieOptions {
  /** Add `Secure`. Default false (the dev server is http). */
  secure?: boolean;
  /** Seconds. Default 30 days. */
  maxAge?: number;
}

/** The `Set-Cookie` / `document.cookie` string. A null role expires the cookie. Lax, site-wide, readable by the client (demo affordance). */
export function serializeRoleCookie(role: Role | null, options: RoleCookieOptions = {}): string {
  const { secure = false, maxAge = ROLE_COOKIE_MAX_AGE } = options;
  const base = `${ROLE_COOKIE}=${role ?? ""}; Path=/; SameSite=Lax`;
  const age = role === null ? "; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : `; Max-Age=${maxAge}`;
  return `${base}${age}${secure ? "; Secure" : ""}`;
}

/** The role in this browser's cookie, or null (also null on the server). */
export function readRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  try {
    return readRoleFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

/** Sets or clears the role cookie in this browser. No-op on the server or when cookies are blocked. */
export function writeRoleCookie(role: Role | null): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = serializeRoleCookie(role, { secure: typeof location !== "undefined" && location.protocol === "https:" });
  } catch {
    // Cookies blocked: the localStorage mirror still carries the session for client-side gating.
  }
}
