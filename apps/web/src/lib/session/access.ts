/**
 * Who may open which route (docs/ROUTES.md section 0, "Guards"): `/brand/*` needs `brand_member`; `/creator/*` and
 * `/onboarding/creator` need `creator`; `/admin/*` needs `admin`; everything else is public. A wrong role goes to
 * `/login?next=<path>`, and `/login` sends a signed-in person to their own home. Pure: usable in a layout, a proxy and a test.
 */

import type { Role } from "@/lib/contract/types";

export type RouteAccess = "public" | Role;

/** Route prefixes and the role they need. Longest prefix wins. */
const GUARDED: readonly (readonly [prefix: string, role: Role])[] = [
  ["/brand", "brand_member"],
  ["/creator", "creator"],
  ["/onboarding/creator", "creator"],
  ["/admin", "admin"],
];

const HOME: Readonly<Record<Role, string>> = { brand_member: "/brand", creator: "/creator", admin: "/admin" };

/** A pathname without query, hash or trailing slash ("/" stays "/"). */
export function normalizePath(pathname: string): string {
  const base = pathname.split(/[?#]/, 1)[0] ?? "";
  const withSlash = base.startsWith("/") ? base : `/${base}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") || "/" : withSlash;
}

/** The role a path needs, or "public". `/brand` and `/brand/x` match; `/brandx` does not. */
export function accessFor(pathname: string): RouteAccess {
  const path = normalizePath(pathname);
  let best: { prefix: string; role: Role } | null = null;
  for (const [prefix, role] of GUARDED) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && (!best || prefix.length > best.prefix.length)) best = { prefix, role };
  }
  return best ? best.role : "public";
}

/** True when `role` (or nobody, for public routes) may open `pathname`. */
export function roleCanAccess(role: Role | null | undefined, pathname: string): boolean {
  const need = accessFor(pathname);
  return need === "public" || role === need;
}

/** The home route of a role: `/brand`, `/creator` or `/admin`. */
export const homeFor = (role: Role): string => HOME[role];

/**
 * A `next` value that is safe to redirect to: a same-origin absolute path. Anything else (a full URL, "//evil.example", a backslash,
 * control characters, an over-long value) becomes `fallback`. Stops open redirects through `/login?next=`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  let value: string;
  try {
    value = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (value.length > 512 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  return value;
}

/** `/login?next=%2Fbrand%2Freview`. A missing or unsafe path gives plain `/login`. */
export function loginUrl(next?: string | null): string {
  const safe = safeNextPath(next ?? undefined, "");
  return safe && safe !== "/login" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/**
 * Where a request for `pathname` by `role` should be redirected, or null when it may proceed. A guarded route with no role or the
 * wrong role goes to `/login?next=<path+search>`; a signed-in person on `/login` goes to their home (or `next` when it is theirs).
 */
export function redirectFor(params: { role: Role | null | undefined; pathname: string; search?: string }): string | null {
  const { role, pathname } = params;
  const path = normalizePath(pathname);
  const search = params.search ? (params.search.startsWith("?") ? params.search : `?${params.search}`) : "";
  if (path === "/login" && role) {
    const next = new URLSearchParams(search).get("next");
    return postLoginTarget(role, next);
  }
  if (roleCanAccess(role, path)) return null;
  return loginUrl(`${path}${search}`);
}

/** Where to send a person right after sign-in: `next` when it is a safe path they may open, else their home. */
export function postLoginTarget(role: Role, next?: string | null): string {
  const safe = safeNextPath(next, "");
  if (safe && safe !== "/login" && roleCanAccess(role, safe)) return safe;
  return homeFor(role);
}

/** What a `RoleGate` shows. `pending` is only returned while the browser's session is unread and the server gave no role to go on. */
export type GateDecision = "pending" | "allow" | "signed_out" | "wrong_role";

/**
 * The decision behind `<RoleGate>`, pure so it can be tested without a DOM. Once the session is `ready` the browser's role decides.
 * Before that the server-verified `initialRole` stands in (so the server HTML and the first client render agree, with no flash of a
 * gate screen); with no `initialRole` either, the answer is `pending`.
 */
export function gateDecision(params: {
  status: "unknown" | "ready";
  role: Role | null;
  initialRole?: Role | null;
  allow: Role | readonly Role[];
}): GateDecision {
  const allowed: readonly Role[] = typeof params.allow === "string" ? [params.allow] : params.allow;
  if (params.status === "unknown" && params.initialRole === undefined) return "pending";
  const role = params.status === "ready" ? params.role : (params.initialRole ?? null);
  if (role === null) return "signed_out";
  return allowed.includes(role) ? "allow" : "wrong_role";
}

/** Which personas can open a gate: the allowed roles, in picker order (brand, creator, admin). */
export function gateTargets(allow: Role | readonly Role[]): Role[] {
  const allowed: readonly Role[] = typeof allow === "string" ? [allow] : allow;
  return (["brand_member", "creator", "admin"] as const).filter((role) => allowed.includes(role));
}
