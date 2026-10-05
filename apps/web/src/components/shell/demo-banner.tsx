"use client";

import type { ReactNode } from "react";
import { ChevronDown, FlaskConical, LogOut } from "lucide-react";
import { isDemoMode } from "@/lib/env";
import { isPersonaKey, PERSONA_LIST } from "@/lib/session";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import {
  Badge,
  Banner,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useStoredBoolean } from "./use-stored-boolean";

/** localStorage key remembering that this device dismissed the banner. A per-viewer convenience: `DemoTag` still marks simulated numbers. */
export const DEMO_BANNER_DISMISSED_KEY = "flowd-demo-banner-dismissed";

export interface DemoBannerProps {
  /** Show the "view the demo as" persona switcher. Default true. */
  switcher?: boolean;
  /** Let the person hide the strip on this device. Default true. */
  dismissible?: boolean;
  className?: string;
}

/**
 * The slim "this is a demo" strip for the top of a shell's content area (never over the header). It says what is true: every brand,
 * creator and dollar is fictional and lives in this browser. It carries the persona switcher, so a reviewer can walk the whole product
 * as Jordan (brand), Maya (creator) and Sam (admin) without leaving the page. Renders nothing when `NEXT_PUBLIC_DEMO_MODE` is off.
 *
 * ```tsx
 * <main id="main"><DemoBanner className="mb-6" />{children}</main>
 * ```
 */
export function DemoBanner({ switcher = true, dismissible = true, className }: DemoBannerProps) {
  const [dismissed, setDismissed] = useStoredBoolean(DEMO_BANNER_DISMISSED_KEY, false);
  if (!isDemoMode() || (dismissible && dismissed)) return null;
  return (
    <Banner
      tone="neutral"
      role="status"
      icon={<FlaskConical />}
      className={className}
      action={switcher ? <PersonaSwitcher /> : undefined}
      onDismiss={dismissible ? () => setDismissed(true) : undefined}
    >
      <span className="font-semibold">Demo data</span>
      <span className="hidden font-normal text-fg-muted sm:inline"> · Every brand, creator and dollar here is fictional, and it lives only in this browser.</span>
    </Banner>
  );
}

/** The persona switcher: a radio menu of the three demo personas. Switching lands on that persona's home (`/brand`, `/creator`, `/admin`). */
function PersonaSwitcher() {
  const { persona, signIn, signOut } = useSession();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="plain" size="xs" trailingIcon={<ChevronDown aria-hidden="true" />}>
          {persona ? `Viewing as ${persona.firstName}` : "Switch persona"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>View the demo as</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={persona?.key ?? ""}
          onValueChange={(key) => {
            if (isPersonaKey(key) && key !== persona?.key) signIn(key, { redirectTo: true });
          }}
        >
          {PERSONA_LIST.map((p) => (
            <DropdownMenuRadioItem key={p.key} value={p.key}>
              {p.displayName}
              <span className="ml-2 text-fg-muted">{p.roleLabel}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {persona ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<LogOut aria-hidden="true" />} onSelect={() => signOut({ redirectTo: "/login" })}>
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface DemoTagProps {
  /** Visible text. Default "Demo data". */
  children?: ReactNode;
  className?: string;
}

/**
 * The small "Demo data" tag for a card or figure whose numbers are simulated (docs/ROUTES.md section 0, honesty affordances). It is not
 * a tab stop and needs no hover: the sentence that explains it is read by screen readers. Renders nothing when demo mode is off.
 */
export function DemoTag({ children = "Demo data", className }: DemoTagProps) {
  if (!isDemoMode()) return null;
  return (
    <Badge tone="neutral" variant="outline" size="sm" className={cn("gap-1", className)}>
      <FlaskConical aria-hidden="true" />
      {children}
      <span className="sr-only">. Simulated numbers from the demo world, not real money.</span>
    </Badge>
  );
}
