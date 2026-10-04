"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Aurora } from "@/components/glass/aurora";
import { flattenNav, type NavEntry, type NavGroup } from "./nav";
import { MobileBottomBar, type MobileBottomBarProps } from "./mobile-bottom-bar";
import { SideNav, type SideNavProps } from "./side-nav";

export interface AppShellProps {
  /** The destinations, in groups. The side nav shows all of them; the bottom bar shows the entries marked `mobile`. */
  nav: readonly NavGroup[];
  /** A `<TopBar/>`. It sticks to the top of the content column. */
  topBar?: ReactNode;
  /** Props forwarded to the side nav (header, footer, homeHref, storageKey...). */
  sideNav?: Omit<SideNavProps, "groups">;
  /** Props forwarded to the mobile bottom bar (the centre `action`, label). `items` default to the `mobile` entries. */
  bottomBar?: Omit<MobileBottomBarProps, "items"> & { items?: readonly NavEntry[] };
  /**
   * `calm` (brand dashboard: dense, Linear-like, aurora at 60%) or `vivid` (creator portal: full aurora). Two intensities,
   * one system (design-ux principle 7).
   */
  intensity?: "calm" | "vivid";
  /** Render the aurora (default). Set false when the layout above already mounts one: there is one aurora per page. */
  aurora?: boolean;
  /** Width of the page content. */
  contentWidth?: "content" | "wide" | "full";
  className?: string;
  children: ReactNode;
}

const WIDTH = { content: "max-w-(--fd-content-max)", wide: "max-w-(--fd-wide-max)", full: "max-w-none" } as const;

/**
 * The scaffold of every signed-in surface (the three route-group shells compose it): the aurora, a collapsible side nav on
 * L2 glass (md and up), a sticky floating top bar, the `<main id="main">` landmark the skip link points at, and the floating
 * glass bottom bar on phones. It owns the structure and the responsive switch at 768px; the route-group shell supplies the
 * destinations, the slots and the account.
 *
 * ```tsx
 * <AppShell nav={BRAND_NAV} topBar={<TopBar breadcrumbs={<Breadcrumbs items={...} />} onSearch={openPalette} userMenu={...} />}
 *   sideNav={{ footer: <PlanCard /> }} intensity="calm">
 *   {children}
 * </AppShell>
 * ```
 */
export function AppShell({ nav, topBar, sideNav, bottomBar, intensity = "calm", aurora = true, contentWidth = "content", className, children }: AppShellProps) {
  const { items: itemsOverride, ...bottomProps } = bottomBar ?? {};
  const mobileItems = itemsOverride ?? flattenNav(nav).filter((entry) => entry.mobile);
  return (
    <div className={cn("relative min-h-dvh", className)}>
      {aurora ? <Aurora intensity={intensity === "calm" ? "calm" : "full"} drift={intensity === "vivid"} /> : null}
      <div className="flex min-h-dvh items-start gap-3 md:p-3 md:pr-0">
        <div className="sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 md:block">
          <SideNav groups={nav} {...sideNav} />
        </div>
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col md:min-h-[calc(100dvh-1.5rem)]">
          {topBar ? <div className="sticky top-0 z-(--fd-z-nav) px-3 pt-3 md:top-3 md:p-0 md:pr-3">{topBar}</div> : null}
          <main id="main" tabIndex={-1} className="flex-1 scroll-mt-24 px-4 pt-6 pb-32 outline-none sm:px-6 md:pb-12 lg:px-8">
            <div className={cn("mx-auto w-full", WIDTH[contentWidth])}>{children}</div>
          </main>
        </div>
      </div>
      {mobileItems.length > 0 ? <MobileBottomBar items={mobileItems} {...bottomProps} /> : null}
    </div>
  );
}
