"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, Eye, EyeOff, Flame, Keyboard, LogOut, Moon, RefreshCw, Settings, ShieldHalf, Smartphone, Snowflake, Sparkles, Sun, UserRound, WalletMinimal } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { CommandPalette, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, KbdShortcut, TooltipProvider, Tooltip, buttonVariants, notify } from "@/components/ui";
import { Logo } from "@/components/brand/logo";
import { Amount, setNumbersOff, useNumbersOff } from "@/components/features/creator/core/amount";
import { useReduceGlass } from "@/lib/hooks/use-reduce-glass";
import { useKeySequences } from "@/lib/hooks/use-hotkeys";
import { useBounty, useBrandScorecard, useInbox, useMe, useNotifications, usePost, useSearchIndex, useStreak, useSubmission, useSubmissions, useWalletChip, useWellbeing } from "@/lib/data";
import { links } from "@/lib/constants";
import { shortcutsForRole } from "@/lib/search";
import type { ActionId } from "@/lib/search";
import { toCommandGroups } from "@/lib/search/palette";
import { useSearch } from "@/lib/search/use-search";
import { PERSONA_LIST } from "@/lib/session";
import { useSession } from "@/lib/session/use-session";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppShell } from "./app-shell";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { DemoBanner } from "./demo-banner";
import { CREATOR_DESTINATIONS, CREATOR_MOBILE_ITEMS, creatorNav, mobileActivePath } from "./creator-nav";
import { CreatorNotifications } from "./creator-notifications";
import { useTheme } from "./theme-provider";
import { NotificationButton, TopBar, UserMenu, type UserMenuItem } from "./top-bar";

const LABEL_BY_HREF = new Map(CREATOR_DESTINATIONS.map((d) => [d.href, d.label]));

/** Where each dynamic page's parent sits, and what it is called. */
const PARENT: Record<string, { href: string; label: string }> = {
  bounties: { href: "/creator/feed", label: "Bounty feed" },
  brands: { href: "/creator/feed", label: "Bounty feed" },
  submissions: { href: "/creator/submissions", label: "Submissions" },
  posts: { href: "/creator/posts", label: "Posts" },
  tournaments: { href: "/creator/tournaments", label: "Tournaments" },
  academy: { href: "/creator/academy", label: "Academy" },
};

/** The breadcrumb trail of the current page: the handle, then the section, then the thing itself (a bounty title, a brand name). */
function useCrumbs(pathname: string, handle: string): BreadcrumbItem[] {
  const [, , section, id] = pathname.split("/");
  const bounty = useBounty(section === "bounties" ? id : undefined);
  const submission = useSubmission(section === "submissions" ? id : undefined);
  const post = usePost(section === "posts" ? id : undefined);
  const scorecard = useBrandScorecard(section === "brands" ? id : undefined);
  const root: BreadcrumbItem = { label: `@${handle}`, href: "/creator" };
  if (!section) return [{ label: `@${handle}` }, { label: "Home" }];
  if (!id) return [root, { label: LABEL_BY_HREF.get(`/creator/${section}`) ?? (section === "more" ? "More" : section) }];
  const parent = PARENT[section];
  const name = section === "bounties" ? bounty?.title : section === "submissions" ? submission?.title : section === "posts" ? (post ? `${post.app.name}: ${post.tags.hook_words}` : undefined) : section === "brands" ? scorecard?.brand.name : undefined;
  return [root, ...(parent ? [{ label: parent.label, href: parent.href }] : []), { label: name ?? "Details" }];
}

/** The streak, small: a flame, the weeks and a snowflake per banked freeze. Links home, where the streak card lives. */
function StreakChip() {
  const streak = useStreak("mine");
  if (!streak || streak.current_weeks === 0) return null;
  return (
    <Tooltip content={`${streak.headline} ${streak.detail}`} side="bottom">
      <Link
        href="/creator"
        aria-label={`${streak.current_weeks}-week streak. ${streak.headline}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-surface-field px-3 text-body-sm font-semibold text-ember shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:h-11"
      >
        <Flame aria-hidden="true" className="size-[18px]" strokeWidth={2} />
        <span className="tabular-nums">{streak.current_weeks}</span>
        <span className="sr-only">week streak</span>
        {Array.from({ length: streak.freezes_banked }, (_, i) => (
          <Snowflake key={i} aria-hidden="true" className="size-3.5 text-info" strokeWidth={2} />
        ))}
      </Link>
    </Tooltip>
  );
}

/** Cleared and pending side by side, never one blended number. Pending shows from the lg breakpoint, with its clock. */
function CreatorWalletChip() {
  const chip = useWalletChip("mine");
  return (
    <Link
      href="/creator/wallet"
      aria-label="Open wallet"
      className="inline-flex h-10 items-center gap-2.5 rounded-pill bg-surface-field px-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:h-11"
    >
      <WalletMinimal aria-hidden="true" className="size-[18px] shrink-0 text-fg-muted" strokeWidth={1.75} />
      <Amount cents={chip.cleared_cents} state="cleared" size="sm" decimals="auto" />
      {chip.pending_cents > 0 ? <Amount cents={chip.pending_cents} state="pending" size="sm" decimals="auto" className="hidden lg:inline-flex" /> : null}
    </Link>
  );
}

function GetTheApp({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Tooltip content="Get the app" side="right">
        <Link href="/app" aria-label="Get the app" className={cn(buttonVariants({ variant: "plain", size: "sm", iconOnly: true }), "mx-auto")}>
          <Smartphone />
        </Link>
      </Tooltip>
    );
  }
  return (
    <Link
      href="/app"
      className="group grid gap-1 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover"
    >
      <span className="flex items-center gap-2 text-body-sm font-semibold text-fg">
        <Smartphone aria-hidden="true" className="size-4 text-accent" strokeWidth={2} />
        Get the app
      </span>
      <span className="text-caption text-fg-muted">The teleprompter, the Live Activity and the full Studio live on your phone.</span>
    </Link>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const rows: { keys: readonly string[]; label: string }[] = [
    { keys: ["mod", "K"], label: "Search or jump to" },
    ...shortcutsForRole("creator").map((s) => ({ keys: s.keys, label: s.label })),
    { keys: ["["], label: "Collapse the sidebar" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <h2 className="font-display text-title-lg text-fg">Keyboard shortcuts</h2>
          <DialogDescription>Press the keys one after the other. They are off while you type.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="grid gap-1">
            {rows.map((row) => (
              <li key={row.label} className="flex min-h-11 items-center justify-between gap-4 rounded-xl px-3 text-body-sm even:bg-surface-field">
                <span className="text-fg">{row.label}</span>
                <KbdShortcut keys={row.keys} />
              </li>
            ))}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The creator portal shell: vivid aurora, a side nav that becomes a floating bottom bar under 768px, the top bar (breadcrumbs, search, the
 * streak, the wallet chip with cleared and pending apart, notifications, the account), the command palette and the demo strip.
 * Everything here reads the demo store, so a cleared payout, an approval or a new offer changes the chips and badges at once.
 */
export function CreatorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/creator";
  const me = useMe();
  const session = useSession();
  const { setTheme, resolvedTheme: resolved } = useTheme();
  const glass = useReduceGlass();
  const { settings: wellbeing } = useWellbeing();
  const numbersOff = useNumbersOff();
  const { unread } = useNotifications();
  const inbox = useInbox();
  const open = useSubmissions({ creator: "mine", status: "open" });
  const waiting = open.filter((s) => s.status === "changes_requested" || s.status === "approved").length;
  const index = useSearchIndex();
  const search = useSearch(index);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const creator = me.creator;
  const handle = creator?.handle ?? "creator";
  const crumbs = useCrumbs(pathname, handle);
  const nav = useMemo(() => creatorNav({ inbox: inbox.unread_total + inbox.offers_waiting, submissions: waiting }), [inbox.unread_total, inbox.offers_waiting, waiting]);

  useKeySequences(shortcutsForRole("creator").map((s) => ({ keys: s.keys, run: () => router.push(s.href) })));

  const onAction = (action: ActionId): void => {
    if (action.startsWith("switch-persona:")) {
      session.signIn(action.slice("switch-persona:".length) as "brand" | "creator" | "admin", { redirectTo: true });
      return;
    }
    switch (action) {
      case "toggle-theme":
        setTheme(resolved === "dark" ? "light" : "dark");
        break;
      case "toggle-reduce-glass":
        glass.setReduced(!glass.app);
        break;
      case "open-flo":
        router.push("/creator/flo");
        break;
      case "show-shortcuts":
        setShortcutsOpen(true);
        break;
      case "copy-profile-link":
        void navigator.clipboard
          ?.writeText(`https://${links.creator(handle)}`)
          .then(() => notify.success("Profile link copied", { description: links.creator(handle) }))
          .catch(() => notify.error("Couldn't copy the link", { description: `Select it and copy: ${links.creator(handle)}` }));
        break;
      case "toggle-numbers-off":
        void setNumbersOff(!numbersOff, wellbeing);
        break;
      case "reset-demo":
        void actions.resetDemo().then(() => notify.success("Demo data reset", { description: "Everything is back to the start." }));
        break;
      case "sign-out":
        session.signOut({ redirectTo: "/login" });
        break;
      default:
        break;
    }
  };

  const otherPersonas = PERSONA_LIST.filter((p) => p.key !== "creator");
  const menu: UserMenuItem[][] = [
    [
      { id: "profile", label: "Profile and storefront", icon: <UserRound />, href: "/creator/profile" },
      { id: "wallet", label: "Wallet", icon: <WalletMinimal />, href: "/creator/wallet" },
      { id: "settings", label: "Settings", icon: <Settings />, href: "/creator/settings" },
    ],
    [
      { id: "theme", label: resolved === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: resolved === "dark" ? <Sun /> : <Moon />, onSelect: () => setTheme(resolved === "dark" ? "light" : "dark") },
      { id: "glass", label: glass.app ? "Turn Reduce glass off" : "Turn Reduce glass on", icon: <ShieldHalf />, onSelect: () => glass.setReduced(!glass.app) },
      { id: "numbers", label: numbersOff ? "Show earnings numbers" : "Hide earnings numbers", icon: numbersOff ? <Eye /> : <EyeOff />, onSelect: () => void setNumbersOff(!numbersOff, wellbeing) },
      { id: "keys", label: "Keyboard shortcuts", icon: <Keyboard />, onSelect: () => setShortcutsOpen(true) },
    ],
    [
      ...otherPersonas.map((p) => ({ id: `as-${p.key}`, label: `View demo as ${p.firstName} (${p.roleLabel.toLowerCase()})`, icon: <Sparkles />, onSelect: () => session.signIn(p.key, { redirectTo: true }) })),
      { id: "reset", label: "Reset demo data", icon: <RefreshCw />, onSelect: () => void actions.resetDemo().then(() => notify.success("Demo data reset", { description: "Everything is back to the start." })) },
    ],
    [{ id: "out", label: "Sign out", icon: <LogOut />, destructive: true, onSelect: () => session.signOut({ redirectTo: "/login" }) }],
  ];

  return (
    <TooltipProvider>
      <AppShell
        nav={nav}
        intensity="vivid"
        contentWidth="wide"
        sideNav={{ homeHref: "/creator", storageKey: "flowd.creator.sidenav", label: "Creator", footer: ({ collapsed }) => <GetTheApp collapsed={collapsed} /> }}
        bottomBar={{
          items: CREATOR_MOBILE_ITEMS,
          activePath: mobileActivePath(pathname),
          label: "Creator",
          action: (
            <Link
              href="/creator/studio"
              aria-label="Make a take in Studio"
              className={cn(buttonVariants({ variant: "primary", size: "lg", iconOnly: true }), "shadow-glow-flow")}
            >
              <Clapperboard />
            </Link>
          ),
        }}
        topBar={
          <TopBar
            leading={
              <Link href="/creator" aria-label="flowd home" className="grid size-9 shrink-0 place-items-center rounded-full md:hidden">
                <Logo variant="mark" height={26} decorative />
              </Link>
            }
            breadcrumbs={<Breadcrumbs items={crumbs} />}
            onSearch={() => setPaletteOpen(true)}
            actions={<StreakChip />}
            wallet={<CreatorWalletChip />}
            notifications={<NotificationButton count={unread} onClick={() => setNotificationsOpen(true)} />}
            userMenu={
              <UserMenu
                avatar={creator ? <ArtAvatar art={me.creator?.avatar ?? { hue_a: 220, hue_b: 260, hue_c: 180, pattern: "orbs", seed: 1 }} name={creator.display_name} size={32} decorative /> : <span className="size-8" />}
                name={creator?.display_name ?? "Creator"}
                detail={creator ? `@${creator.handle} · ${creator.tier[0]?.toUpperCase()}${creator.tier.slice(1)} creator` : undefined}
                sections={menu}
              />
            }
          />
        }
      >
        <DemoBanner className="mb-6" />
        {children}
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        hotkey="mod+k"
        shouldFilter={false}
        onQueryChange={search.setQuery}
        placeholder="Search bounties, submissions, lessons, or jump to a page"
        groups={toCommandGroups(search.groups, { onAction, onSelect: search.recordUse })}
      />
      <CreatorNotifications open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </TooltipProvider>
  );
}
