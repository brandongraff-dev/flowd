"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Glass } from "@/components/glass/glass";
import { IconButton } from "@/components/ui/icon-button";
import { Logo } from "@/components/brand/logo";
import { flattenNav, resolveActiveHref, type NavGroup } from "./nav";
import { NavItem } from "./nav-item";
import { useStoredBoolean } from "./use-stored-boolean";

export interface SideNavProps extends Omit<ComponentPropsWithoutRef<"aside">, "children"> {
  groups: readonly NavGroup[];
  /** Replaces the default flowd logo at the top. Receives `collapsed` so a workspace switcher can shrink to its avatar. */
  header?: ReactNode | ((state: { collapsed: boolean }) => ReactNode);
  /** Bottom slot: plan card, "Reduce glass" and theme controls, help. Receives `collapsed`. */
  footer?: ReactNode | ((state: { collapsed: boolean }) => ReactNode);
  /** Where the logo links. */
  homeHref?: string;
  /** Override the active path (tests, nested layouts). Default: the current pathname. */
  activePath?: string;
  /** Controlled collapsed state. Omit to let the nav remember it on this device. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** localStorage key for the remembered state (a per-viewer convenience: it works without storage). */
  storageKey?: string;
  /** Collapse to the rail below this viewport width until the person chooses otherwise (default 1024: tablets get the room for content). 0 turns it off. */
  collapseBelow?: number;
  /** Called after a link is followed (closes a mobile drawer). */
  onNavigate?: () => void;
  /** Accessible name of the nav landmark. */
  label?: string;
  /** Show the collapse toggle and honour `[` (default true). Turn off when the nav lives in a phone drawer, where it is always full width. */
  collapsible?: boolean;
}

/**
 * The side navigation: grouped destinations (`NavGroup`), a collapsible 264px to 76px rail, an active lens that morphs between
 * items, tooltips when collapsed, and `[` to toggle. L2 glass (it is navigation, so it is real glass; interactive sheen is off
 * because the surface is large and static). The expanded state is remembered per viewer, and the collapse animates only the
 * width; labels fade, so nothing reflows mid-transition.
 */
export function SideNav({
  groups,
  header,
  footer,
  homeHref = "/",
  activePath,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  storageKey = "flowd.sidenav.collapsed",
  collapseBelow = 1024,
  onNavigate,
  label = "Primary",
  collapsible = true,
  className,
  ...props
}: SideNavProps) {
  const pathname = usePathname();
  const lensId = `nav-lens-${useId()}`;
  const [stored, setStored, chosen] = useStoredBoolean(collapsedProp === undefined ? storageKey : undefined, defaultCollapsed);
  const narrow = useMediaQuery(`(max-width: ${Math.max(collapseBelow, 1) - 1}px)`, false);
  // An explicit choice (the toggle, the [ key) always wins; until then tablets get the rail. A non-collapsible nav (a phone drawer) is always open.
  const collapsed = !collapsible ? false : (collapsedProp ?? (chosen ? stored : collapseBelow > 0 && narrow ? true : stored));
  const setCollapsed = (next: boolean): void => {
    if (collapsedProp === undefined) setStored(next);
    onCollapsedChange?.(next);
  };
  useHotkey("[", () => setCollapsed(!collapsed), { enabled: collapsible });

  const activeHref = resolveActiveHref(activePath ?? pathname ?? "/", flattenNav(groups));
  const state = { collapsed };
  const top = typeof header === "function" ? header(state) : header;
  const bottom = typeof footer === "function" ? footer(state) : footer;

  return (
    <Glass
      as="aside"
      layer={2}
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "relative flex h-full min-h-0 shrink-0 flex-col gap-2 overflow-hidden rounded-[28px] p-2.5 transition-[width] duration-(--fd-dur-slow) ease-emphasized",
        collapsed ? "w-(--fd-sidebar-collapsed)" : "w-(--fd-sidebar)",
        className,
      )}
      {...props}
    >
      <div className={cn("flex h-12 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pr-1 pl-2.5")}>
        {top ?? (
          <Link href={homeHref} aria-label="flowd home" className="rounded-lg p-1">
            <Logo variant={collapsed ? "mark" : "lockup"} height={26} decorative />
          </Link>
        )}
        {collapsed || !collapsible ? null : (
          <IconButton
            variant="plain"
            size="sm"
            label="Collapse sidebar"
            shortcut={["["]}
            icon={<PanelLeftClose />}
            onClick={() => setCollapsed(true)}
            className="shrink-0"
          />
        )}
      </div>
      {collapsed ? (
        <IconButton variant="plain" size="sm" label="Expand sidebar" shortcut={["["]} icon={<PanelLeftOpen />} onClick={() => setCollapsed(false)} className="mx-auto shrink-0" />
      ) : null}

      <nav aria-label={label} className="fd-scroll-fade-y scrollbar-none -mx-1 mt-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2">
        {groups.map((group, groupIndex) => (
          <div key={group.id ?? group.label ?? groupIndex} className="grid gap-0.5">
            {group.label ? (
              collapsed ? (
                <span aria-hidden="true" className="mx-auto mb-1 h-px w-5 bg-divider" />
              ) : (
                <p className="fd-eyebrow px-3.5 pb-1.5 text-fg-subtle">{group.label}</p>
              )
            ) : null}
            {group.items.map((entry) => (
              <NavItem key={entry.id ?? entry.href} entry={entry} active={entry.href === activeHref} collapsed={collapsed} lensId={lensId} onClick={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {bottom ? <div className="shrink-0 border-t border-divider pt-2.5">{bottom}</div> : null}
    </Glass>
  );
}
