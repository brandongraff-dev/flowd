/**
 * The client session: a tiny external store (subscribe / snapshot) so React reads it with `useSyncExternalStore`, and non-React code
 * (a login form handler, the account menu, a command-palette action) can call `signInAs` directly.
 *
 * Source of truth is the `flowd_role` cookie (the server reads it). The role is mirrored into localStorage, so a cleared or expired
 * cookie is repaired from it and other tabs follow through the `storage` event. Both writes are wrapped in try/catch: blocked storage
 * degrades to "signed out" instead of throwing.
 *
 * The server snapshot is `{ status: "unknown", role: null }`: the first client render matches the server HTML, and the real role
 * arrives on the next commit, so there is no hydration mismatch.
 */

import type { Role } from "@/lib/contract/types";
import { identify, resetAnalytics, track } from "@/lib/analytics";
import { isRole, SESSION_STORAGE_KEY } from "./constants";
import { readRoleCookie, writeRoleCookie } from "./cookie";
import { personaForRole } from "./personas";

export type SessionStatus = "unknown" | "ready";

export interface SessionSnapshot {
  /** "unknown" on the server and during hydration; "ready" once the browser's cookie and storage have been read. */
  readonly status: SessionStatus;
  readonly role: Role | null;
}

const SERVER_SNAPSHOT: SessionSnapshot = Object.freeze({ status: "unknown", role: null });

let snapshot: SessionSnapshot = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();
let storageAttached = false;

function readStoredRole(): Role | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const role = typeof parsed === "object" && parsed !== null ? (parsed as { role?: unknown }).role : undefined;
    return isRole(role) ? role : null;
  } catch {
    return null;
  }
}

function writeStoredRole(role: Role | null): void {
  try {
    if (role === null) window.localStorage.removeItem(SESSION_STORAGE_KEY);
    else window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ role, at: new Date().toISOString() }));
  } catch {
    // Storage blocked (private window, quota): the cookie alone carries the session.
  }
}

function publish(next: SessionSnapshot): void {
  if (next.status === snapshot.status && next.role === snapshot.role) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const cookieRole = readRoleCookie();
  const role = cookieRole ?? readStoredRole();
  // Repair: storage remembers a role the cookie lost (expired, cleared), so the server can see it again.
  if (role && !cookieRole) writeRoleCookie(role);
  snapshot = { status: "ready", role };
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== SESSION_STORAGE_KEY) return;
  const role = readStoredRole();
  if (role) writeRoleCookie(role);
  else writeRoleCookie(null);
  publish({ status: "ready", role });
}

/** The current session. Stable between changes (safe for `useSyncExternalStore`); the frozen server snapshot on the server. */
export function getSessionSnapshot(): SessionSnapshot {
  hydrate();
  return snapshot;
}

/** What the server and the first client render report. */
export const getServerSessionSnapshot = (): SessionSnapshot => SERVER_SNAPSHOT;

/** Subscribes to session changes in this tab and, through localStorage, in other tabs. Returns the unsubscribe. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageAttached && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    storageAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageAttached && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
      storageAttached = false;
    }
  };
}

/** The role right now (null when signed out or on the server). */
export const getSessionRole = (): Role | null => getSessionSnapshot().role;

/**
 * Signs in as a demo persona: sets the cookie and the localStorage mirror, notifies subscribers and sends `login_succeeded` (first
 * sign-in) or `persona_switched` (a change of role) to analytics. Signing in as the current role is a no-op.
 */
export function signInAs(role: Role): void {
  if (typeof window === "undefined") return;
  hydrate();
  const from = snapshot.role;
  if (from === role) return;
  writeRoleCookie(role);
  writeStoredRole(role);
  publish({ status: "ready", role });
  const persona = personaForRole(role);
  identify(persona.userId, { role });
  if (from === null) track("login_succeeded", { role, method: "demo" });
  else track("persona_switched", { from, to: role });
}

/** Signs out: clears the cookie and the mirror, resets analytics identity and notifies subscribers. */
export function signOut(): void {
  if (typeof window === "undefined") return;
  hydrate();
  if (snapshot.role === null) return;
  writeRoleCookie(null);
  writeStoredRole(null);
  publish({ status: "ready", role: null });
  resetAnalytics();
}

/** Test helper: forget everything, as a fresh page load would. */
export function resetSessionForTests(): void {
  snapshot = SERVER_SNAPSHOT;
  hydrated = false;
  listeners.clear();
  storageAttached = false;
}
