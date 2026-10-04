"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/contract/types";
import { homeFor } from "./access";
import { isPersonaKey, PERSONA_TO_ROLE, type PersonaKey } from "./constants";
import { personaForRole, type DemoPersona } from "./personas";
import { getServerSessionSnapshot, getSessionSnapshot, signInAs, signOut, subscribeSession, type SessionStatus } from "./store";

export interface SignInOptions {
  /** After signing in, navigate here. `true` goes to the persona's home (`/brand`, `/creator`, `/admin`). Default: stay. */
  redirectTo?: string | boolean;
}

export interface UseSession {
  /** "unknown" until the browser's cookie has been read (the server and the first client render). */
  status: SessionStatus;
  role: Role | null;
  persona: DemoPersona | null;
  isSignedIn: boolean;
  /** Sign in (or switch) as a role or persona key ("brand", "creator", "admin"). */
  signIn: (who: Role | PersonaKey, options?: SignInOptions) => void;
  /** Sign out; with `redirectTo` navigates afterwards (typically "/login"). */
  signOut: (options?: { redirectTo?: string }) => void;
}

/**
 * The signed-in demo persona. Reads the role cookie through a `useSyncExternalStore`, so it is consistent across components and tabs
 * and never causes a hydration mismatch (`status` is "unknown" until the browser has been read).
 *
 * ```tsx
 * const { role, persona, signIn } = useSession();
 * <Button onClick={() => signIn("creator", { redirectTo: true })}>Switch to {DEMO_PERSONAS.creator.firstName}</Button>
 * ```
 */
export function useSession(): UseSession {
  const router = useRouter();
  const snap = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot);

  const signIn = useCallback(
    (who: Role | PersonaKey, options: SignInOptions = {}): void => {
      const role: Role = isPersonaKey(who) ? PERSONA_TO_ROLE[who] : who;
      signInAs(role);
      const { redirectTo } = options;
      if (redirectTo === true) router.push(homeFor(role));
      else if (typeof redirectTo === "string") router.push(redirectTo);
      else router.refresh();
    },
    [router],
  );

  const signOutAndGo = useCallback(
    (options: { redirectTo?: string } = {}): void => {
      signOut();
      if (options.redirectTo) router.push(options.redirectTo);
      else router.refresh();
    },
    [router],
  );

  return useMemo(
    () => ({
      status: snap.status,
      role: snap.role,
      persona: snap.role ? personaForRole(snap.role) : null,
      isSignedIn: snap.role !== null,
      signIn,
      signOut: signOutAndGo,
    }),
    [snap, signIn, signOutAndGo],
  );
}

/** Just the role: `null` when signed out or not yet known. Prefer `useSession` when you also need `status`. */
export function useRole(): Role | null {
  return useSyncExternalStore(subscribeSession, () => getSessionSnapshot().role, () => null);
}
