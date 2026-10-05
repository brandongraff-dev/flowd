"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlus, Menu, Percent } from "lucide-react";
import { useBrandWallet, useDisputes, useMe, useNotifications, useStoreStatus, useSubmissions } from "@/lib/data";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { useKeySequences } from "@/lib/hooks/use-hotkeys";
import { useSession } from "@/lib/session/use-session";
import { actions } from "@/lib/store";
import { StoreHydrator } from "@/lib/store/hydrator";
import { useReduceGlass } from "@/lib/hooks/use-reduce-glass";
import { cn } from "@/lib/utils";
import { ArtAvatar } from "@/components/brand/avatar";
import { Avatar } from "@/components/ui/avatar";
import { Callout } from "@/components/ui/callout";
import { buttonVariants } from "@/components/ui/button-variants";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { notify } from "@/components/ui/toast";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { VisuallyHidden } from "@/components/ui";
import { AppShell } from "./app-shell";
import { BrandBreadcrumbs } from "./brand-crumbs";
import { BrandCommandPalette } from "./brand-command-palette";
import { brandNav } from "./brand-nav";
import { BrandNotifications } from "./brand-notifications";
import { BrandShortcutsDialog, brandSequences } from "./brand-shortcuts";
import { BrandWalletChip } from "./brand-wallet-chip";
import { DemoBanner } from "./demo-banner";
import { SideNav } from "./side-nav";
import { NotificationButton, TopBar, UserMenu, type UserMenuItem } from "./top-bar";
import { useTheme } from "./theme-provider";

/**
 * The brand dashboard shell, wrapped around every `/brand/*` page by `src/app/brand/layout.tsx`.
 *
 *  - Side nav (md and up): Overview, Bounties, Review, Insights, Creators, Market, Money and Setup, with live counts (videos waiting, open
 *    disputes). Collapses to a rail; `[` toggles it.
 *  - Phone: a floating glass bottom bar (Overview, Bounties, New bounty, Review, Wallet) and the full nav in a left drawer.
 *  - Top bar: the app and workspace switcher leading the breadcrumbs, the Ctrl+K palette, the escrow chip, notifications ("Needs you"), and the
 *    account menu with the demo persona switch.
 *  - It starts the demo store early, and says so plainly when this browser cannot save the demo.
 *
 * Chrome recedes (dimmed nav, hairlines only): the one loud thing on a page is its primary action.
 */
export function BrandShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const { persona, signIn, signOut } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const glass = useReduceGlass();
  const status = useStoreStatus();
  const { unread } = useNotifications();
  const waiting = useSubmissions({ status: "in_review", brand: "mine" }).length;
  const openDisputes = useDisputes({ status: "open" }).length;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = useMemo(() => brandNav({ review: waiting, disputes: openDisputes }), [waiting, openDisputes]);
  const sequences = useMemo(() => brandSequences(), []);

  useKeySequences(sequences.map((s) => ({ keys: s.keys, run: () => router.push(s.href) })));
  useHotkey("shift+/", () => setShortcutsOpen(true));

  const name = me.user?.display_name ?? "Brand member";
  const detail = me.user ? `${me.user.title ?? "Brand member"} · ${me.brand?.name ?? ""}`.replace(/ · $/, "") : undefined;
  const avatar = me.user ? <ArtAvatar art={me.user.avatar} name={name} size={32} decorative /> : <Avatar name={name} size={32} decorative />;

  const otherPersonas: UserMenuItem[] = (["creator", "admin"] as const).map((key) => ({
    id: `switch-${key}`,
    label: key === "creator" ? "View as Maya, a creator" : "View as Sam, ops",
    onSelect: () => signIn(key, { redirectTo: true }),
  }));

  const userSections: readonly (readonly UserMenuItem[])[] = [
    [
      { id: "settings", label: "Settings and plan", href: "/brand/settings" },
      { id: "team", label: "Team and activity", href: "/brand/team" },
    ],
    persona ? otherPersonas : [],
    [
      { id: "theme", label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme", onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
      { id: "glass", label: glass.app ? "Turn Reduce glass off" : "Turn Reduce glass on", onSelect: () => glass.setReduced(!glass.app) },
      { id: "shortcuts", label: "Keyboard shortcuts", shortcut: ["?"], onSelect: () => setShortcutsOpen(true) },
      {
        id: "reset",
        label: "Reset demo data",
        onSelect: () => {
          void actions.resetDemo().then(() => {
            notify.success("Demo data reset", { description: "Every bounty, wallet and review is back to where it started." });
            router.refresh();
          });
        },
      },
    ],
    [{ id: "out", label: "Sign out", destructive: true, onSelect: () => signOut({ redirectTo: "/login" }) }],
  ].filter((section) => section.length > 0);

  const sideFooter = (state: { collapsed: boolean }): ReactNode => <BrandPlanCard collapsed={state.collapsed} />;

  return (
    <TooltipProvider>
      <StoreHydrator eager />
      <AppShell
        nav={nav}
        intensity="calm"
        contentWidth="content"
        sideNav={{ homeHref: "/brand", storageKey: "flowd.brand.sidenav", footer: sideFooter }}
        bottomBar={{
          label: "Brand",
          action: (
            <Link href="/brand/bounties/new" aria-label="Start a bounty" className={cn(buttonVariants({ variant: "primary", size: "lg", iconOnly: true }), "shadow-glow-flow")}>
              <CirclePlus aria-hidden="true" />
            </Link>
          ),
        }}
        topBar={
          <TopBar
            leading={<IconButton variant="plain" label="Open menu" icon={<Menu />} onClick={() => setMenuOpen(true)} className="-ml-2 md:hidden" tooltip={false} />}
            breadcrumbs={<BrandBreadcrumbs />}
            onSearch={() => setPaletteOpen(true)}
            searchPlaceholder="Search or jump to"
            actions={
              <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
                <CirclePlus aria-hidden="true" />
                New bounty
              </Link>
            }
            wallet={<BrandWalletChip />}
            notifications={<NotificationButton count={unread} onClick={() => setNotificationsOpen(true)} />}
            userMenu={<UserMenu avatar={avatar} name={name} detail={detail} sections={userSections} />}
          />
        }
      >
        <div className="grid gap-6">
          <DemoBanner />
          {status.persistence === "memory" ? (
            <Callout tone="sun" title="This browser is not saving the demo" role="status">
              Changes you make here last until you reload. Open the demo in a normal window to keep them.
            </Callout>
          ) : null}
          {children}
        </div>
      </AppShell>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="left">
        <SheetContent showClose={false} className="p-2.5">
          <VisuallyHidden>
            <SheetTitle>Brand menu</SheetTitle>
            <SheetDescription>Every page in the brand dashboard.</SheetDescription>
          </VisuallyHidden>
          <SideNav groups={nav} collapsible={false} homeHref="/brand" onNavigate={() => setMenuOpen(false)} footer={<BrandPlanCard collapsed={false} />} label="Brand menu" className="h-full w-full rounded-[22px] bg-transparent p-0 shadow-none" />
        </SheetContent>
      </Sheet>

      <BrandCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onShowShortcuts={() => setShortcutsOpen(true)} />
      <BrandNotifications open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <BrandShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </TooltipProvider>
  );
}

/** The plan at the foot of the nav: which plan, what the fee is, one click to Settings. Collapsed, a percent glyph with the same facts in a tooltip. */
function BrandPlanCard({ collapsed }: { collapsed: boolean }) {
  const { plan, wallet } = useBrandWalletPlan();
  if (!wallet) return null;
  const line = `${plan.label} plan · ${Math.round(plan.take_rate * 100)}% fee on creator pay`;
  if (collapsed) {
    return (
      <Tooltip content={line} side="right" sideOffset={14}>
        <Link href="/brand/settings" aria-label={line} className="mx-auto grid size-11 place-items-center rounded-[18px] text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg">
          <Percent aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Link>
      </Tooltip>
    );
  }
  return (
    <Link href="/brand/settings" className="grid gap-0.5 rounded-[18px] px-3.5 py-2.5 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
      <span className="text-body-sm font-semibold text-fg">{plan.label} plan</span>
      <span className="text-caption text-fg-subtle">{Math.round(plan.take_rate * 100)}% fee on creator pay. Manage plan</span>
    </Link>
  );
}

function useBrandWalletPlan(): { plan: { label: string; take_rate: number }; wallet: boolean } {
  const wallet = useBrandWallet();
  return { plan: wallet.plan, wallet: wallet.brand !== undefined };
}
