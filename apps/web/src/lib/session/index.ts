/**
 * flowd demo session. Import from "@/lib/session" for the pure pieces (constants, personas, access rules, cookie helpers, the store).
 *
 *   CLIENT HOOKS    "@/lib/session/use-session"    useSession()  useRole()
 *   SERVER HELPERS  "@/lib/session/server"         getServerRole()  requireRole()      (imports next/headers: server code only)
 *   GATE            "@/components/shell/role-gate" <RoleGate allow="brand_member">
 *
 * The cookie `flowd_role` (one of `creator`, `brand_member`, `admin`) is what the server reads; localStorage mirrors it.
 * It is a demo affordance, not a security boundary.
 */

export * from "./constants";
export * from "./personas";
export * from "./access";
export * from "./cookie";
export {
  getServerSessionSnapshot,
  getSessionRole,
  getSessionSnapshot,
  signInAs,
  signOut,
  subscribeSession,
  type SessionSnapshot,
  type SessionStatus,
} from "./store";
