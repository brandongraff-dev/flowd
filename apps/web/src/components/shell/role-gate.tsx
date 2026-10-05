"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, LogIn } from "lucide-react";
import type { Role } from "@/lib/contract/types";
import { formatList, withArticle } from "@/lib/format";
import { gateDecision, gateTargets, homeFor, loginUrl } from "@/lib/session/access";
import { personaForRole, type DemoPersona } from "@/lib/session/personas";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import { Aurora } from "@/components/glass/aurora";
import { GlassCard } from "@/components/glass";
import { Avatar, Button, buttonVariants, EmptyArt, Spinner } from "@/components/ui";

export interface RoleGateProps {
  /** The role, or roles, allowed to see `children`. */
  allow: Role | readonly Role[];
  children: ReactNode;
  /**
   * The role the server already verified (`await getServerRole()` or `requireRole()` in the layout). It stands in until the browser's
   * session has been read, so the server HTML and the first client render agree and a signed-in person never sees a flash of the
   * gate screen. Without it the gate shows `pending` until the browser has answered, and `children` are not server-rendered.
   */
  initialRole?: Role | null;
  /**
   * What a signed-out visitor gets. `redirect` (default) sends them to `/login?next=<this page>`; `screen` shows the sign-in screen
   * here without navigating.
   */
  signedOut?: "redirect" | "screen";
  /**
   * `page` (default) fills the viewport with its own aurora: wrap a whole shell with it, so the shell (and its data hooks) never
   * mounts for the wrong role. `inline` fills the content area of a shell that already has an aurora.
   */
  layout?: "page" | "inline";
  /** Shown while the session is unknown and there is no `initialRole`. Default: a quiet loading state. */
  pending?: ReactNode;
}

/**
 * Keeps a route area to the roles that may open it, on the client. The server layout does the real redirect with `requireRole()`
 * (`@/lib/session/server`); this covers what a server layout cannot see: a persona switched in another tab, a cleared cookie, a
 * layout that cannot read the request.
 *
 *  - allowed          renders `children` untouched.
 *  - signed out       redirects to `/login?next=<path>` (or shows the sign-in screen with `signedOut="screen"`).
 *  - wrong role       a friendly "switch persona" screen: who you are, who can open this page, one click to switch. It never bounces
 *                     the person around silently.
 *
 * ```tsx
 * // src/app/brand/layout.tsx (server)
 * const role = await requireRole("brand_member");
 * return <RoleGate allow="brand_member" initialRole={role}><BrandShell>{children}</BrandShell></RoleGate>;
 * ```
 *
 * This is a demo affordance, not a security boundary (docs/CONVENTIONS.md section 6): production swaps the cookie for a signed session.
 */
export function RoleGate({ allow, children, initialRole, signedOut = "redirect", layout = "page", pending }: RoleGateProps) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const decision = gateDecision({ status: session.status, role: session.role, initialRole, allow });
  const ready = session.status === "ready";

  const redirecting = decision === "signed_out" && signedOut === "redirect";
  useEffect(() => {
    if (!redirecting || !ready) return;
    router.replace(loginUrl(`${window.location.pathname}${window.location.search}`));
  }, [redirecting, ready, pathname, router]);

  if (decision === "allow") return <>{children}</>;
  if (decision === "pending") return <Frame layout={layout}>{pending ?? <PendingState />}</Frame>;
  if (decision === "signed_out") {
    return (
      <Frame layout={layout}>
        <SignedOutCard allow={allow} redirecting={redirecting} />
      </Frame>
    );
  }
  return (
    <Frame layout={layout}>
      <WrongRoleCard allow={allow} role={session.role ?? initialRole ?? null} />
    </Frame>
  );
}

// ── screens ────────────────────────────────────────────────────────────────────────────────────

function Frame({ layout, children }: { layout: "page" | "inline"; children: ReactNode }) {
  if (layout === "inline") return <div className="grid min-h-[60dvh] place-items-center py-10">{children}</div>;
  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4 py-12 sm:px-6">
      <Aurora intensity="calm" drift={false} />
      <main id="main" tabIndex={-1} className="grid w-full place-items-center outline-none">
        {children}
      </main>
    </div>
  );
}

function PendingState() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-body-sm text-fg-muted">
      <Spinner size={20} />
      Checking your session
    </div>
  );
}

/** Who an area is for, in a sentence: "creators", "brands and the flowd team". */
function areaName(targets: readonly Role[]): string {
  const names = targets.map((role) => (role === "creator" ? "creators" : role === "brand_member" ? "brands" : "the flowd team"));
  return names.length === 0 ? "no one" : formatList(names);
}

function PersonaRow({ persona, action }: { persona: DemoPersona; action: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-surface-field p-3 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={persona.displayName} seed={persona.userId} size={44} decorative />
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-fg">{persona.displayName}</p>
          <p className="truncate text-body-sm text-fg-muted">{persona.title}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function CardShell({ title, description, children, status }: { title: string; description: ReactNode; children?: ReactNode; status?: boolean }) {
  return (
    <GlassCard padding="lg" className={cn("w-full max-w-lg rounded-[28px] text-center")} role={status ? "status" : undefined}>
      <div className="flex flex-col items-center gap-6">
        <EmptyArt name="locked" size="md" />
        <div className="grid gap-2">
          <h1 className="font-display text-title-lg text-fg">{title}</h1>
          <p className="mx-auto max-w-[38ch] text-body-sm text-fg-muted">{description}</p>
        </div>
        {children}
      </div>
    </GlassCard>
  );
}

function WrongRoleCard({ allow, role }: { allow: Role | readonly Role[]; role: Role | null }) {
  const { signIn } = useSession();
  const targets = gateTargets(allow);
  const current = role ? personaForRole(role) : null;
  const first = targets[0] ? personaForRole(targets[0]) : null;
  const who = current ? `${current.displayName}, ${withArticle(current.roleLabel.toLowerCase())}` : "someone else";
  return (
    <CardShell
      title={`This area is for ${areaName(targets)}`}
      description={
        first
          ? `You're signed in as ${who}. Switch to ${first.firstName} to open this page. Nothing is lost when you switch back.`
          : `You're signed in as ${who}, and this page is not open to that persona.`
      }
    >
      <ul className="grid w-full gap-2.5">
        {targets.map((target) => {
          const persona = personaForRole(target);
          return (
            <PersonaRow
              key={target}
              persona={persona}
              action={
                <Button variant="primary" size="md" className="w-full sm:w-auto" leadingIcon={<ArrowLeftRight aria-hidden="true" />} onClick={() => signIn(target)}>
                  Switch to {persona.firstName}
                </Button>
              }
            />
          );
        })}
      </ul>
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
        {role ? (
          <Link href={homeFor(role)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Back to the {personaForRole(role).roleLabel.toLowerCase()} home
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
        <Link href="/login" className={buttonVariants({ variant: "plain", size: "sm" })}>
          See all personas
        </Link>
      </div>
      <p className="text-caption text-fg-muted">Demo personas are for exploring. Switching changes the view, not the data.</p>
    </CardShell>
  );
}

function SignedOutCard({ allow, redirecting }: { allow: Role | readonly Role[]; redirecting: boolean }) {
  const { signIn } = useSession();
  const targets = gateTargets(allow);
  const pathname = usePathname();
  const login = loginUrl(pathname);

  if (redirecting) {
    return (
      <CardShell status title="Taking you to sign in" description="This page needs a signed-in persona. If nothing happens, open the sign-in page.">
        <div className="flex items-center gap-3">
          <Spinner size={18} label="Redirecting to sign in" />
          <Link href={login} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open sign-in
          </Link>
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell title="Sign in to continue" description={`This page is for ${areaName(targets)}. Pick the demo persona to open it.`}>
      <ul className="grid w-full gap-2.5">
        {targets.map((target) => {
          const persona = personaForRole(target);
          return (
            <PersonaRow
              key={target}
              persona={persona}
              action={
                <Button variant="primary" size="md" className="w-full sm:w-auto" leadingIcon={<LogIn aria-hidden="true" />} onClick={() => signIn(target)}>
                  Continue as {persona.firstName}
                </Button>
              }
            />
          );
        })}
      </ul>
      <Link href={login} className={buttonVariants({ variant: "plain", size: "sm" })}>
        Use the sign-in page
      </Link>
    </CardShell>
  );
}
