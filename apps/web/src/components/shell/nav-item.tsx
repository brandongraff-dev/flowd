"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { Tooltip } from "@/components/ui/tooltip";
import type { NavEntry } from "./nav";

export interface NavItemProps extends Omit<ComponentPropsWithRef<"a">, "href" | "children"> {
  entry: NavEntry;
  active?: boolean;
  /** Icon only (the collapsed sidebar): the label moves into a tooltip and the badge becomes a dot. */
  collapsed?: boolean;
  /** Shared-layout id of the active lens, so the highlight morphs from item to item. Omit for no morph. */
  lensId?: string;
  /** Rendered after the label (a shortcut hint). */
  trailing?: ReactNode;
}

/** Badge text for a nav entry: numbers cap at 99+. */
function badgeText(badge: ReactNode): ReactNode {
  return typeof badge === "number" && badge > 99 ? "99+" : badge;
}

/**
 * One row of the side nav. 40px (44px on touch), a pill, an icon at stroke 1.75 (heavier when active, so the state is not
 * colour alone), the label, an optional count. The active lens is a shared-layout `motion` element that morphs from the
 * previous item on the `snappy` spring (instant under reduced motion). Collapsed, it is a 44px icon button with the label
 * in a tooltip. Always a real link: middle-click, copy-link and prefetch work.
 */
export function NavItem({ entry, active = false, collapsed = false, lensId, trailing, className, onClick, ...props }: NavItemProps) {
  const Icon = entry.icon;
  const hasBadge = entry.badge !== undefined && entry.badge !== null && entry.badge !== 0 && entry.badge !== "";
  const link = (
    <Link
      href={entry.href}
      target={entry.external ? "_blank" : undefined}
      rel={entry.external ? "noreferrer" : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? entry.label : undefined}
      onClick={onClick}
      className={cn(
        "group/nav relative flex h-10 items-center gap-3 rounded-[18px] text-body-sm font-medium transition-colors duration-(--fd-dur-fast) ease-standard select-none pointer-coarse:h-11",
        collapsed ? "mx-auto size-11 justify-center" : "px-3.5",
        active ? "text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
        className,
      )}
      {...props}
    >
      {active ? (
        <motion.span
          layoutId={lensId}
          transition={spring.snappy}
          aria-hidden="true"
          className="absolute inset-0 rounded-[inherit] bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim)]"
        />
      ) : null}
      <span className="relative grid size-5 shrink-0 place-items-center">
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.1 : 1.75} />
        {collapsed && hasBadge ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent-solid shadow-[0_0_0_2px_var(--fd-surface)]" /> : null}
      </span>
      {collapsed ? null : (
        <>
          <span className="relative min-w-0 flex-1 truncate">{entry.label}</span>
          {hasBadge ? (
            <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-soft px-1.5 text-micro font-semibold text-accent tabular-nums">{badgeText(entry.badge)}</span>
          ) : null}
          {trailing}
        </>
      )}
    </Link>
  );

  return collapsed ? (
    <Tooltip content={entry.label} side="right" sideOffset={14}>
      {link}
    </Tooltip>
  ) : (
    link
  );
}
