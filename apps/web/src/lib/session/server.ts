/**
 * Server-side session helpers for layouts, pages and route handlers. Import from "@/lib/session/server" (never from client code:
 * it reads request cookies through `next/headers`).
 *
 * ```tsx
 * // src/app/brand/layout.tsx
 * export default async function BrandLayout({ children }: { children: ReactNode }) {
 *   const role = await requireRole("brand_member");
 *   return <BrandShell initialRole={role}>{children}</BrandShell>;
 * }
 * ```
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/contract/types";
import { loginUrl } from "./access";
import { ROLE_COOKIE } from "./constants";
import { parseRole } from "./cookie";

/** The role in the request's `flowd_role` cookie, or null when signed out. Makes the route dynamic (it reads request cookies). */
export async function getServerRole(): Promise<Role | null> {
  const store = await cookies();
  return parseRole(store.get(ROLE_COOKIE)?.value);
}

/**
 * Redirects to `/login` (with `?next=` when `nextPath` is given) unless the request's role is one of `allowed`. Returns the role.
 * A layout cannot see its own pathname, so pass `nextPath` from a page, or let the client `RoleGate` add it.
 */
export async function requireRole(allowed: Role | readonly Role[], nextPath?: string): Promise<Role> {
  const role = await getServerRole();
  const list: readonly Role[] = typeof allowed === "string" ? [allowed] : allowed;
  if (!role || !list.includes(role)) redirect(loginUrl(nextPath));
  return role;
}
