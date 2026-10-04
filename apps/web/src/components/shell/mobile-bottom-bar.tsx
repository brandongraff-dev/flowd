"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { Glass } from "@/components/glass/glass";
import { resolveActiveHref, type NavEntry } from "./nav";

export interface MobileBottomBarProps extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  /** Up to five destinations (the entries marked `mobile`, in order). */
  items: readonly NavEntry[];
  /**
   * A centre action (the creator's "Make a take", the brand's "New bounty"): a round, raised primary button between the
   * items. With a centre action pass four items; without, up to five.
   */
  action?: ReactNode;
  activePath?: string;
  /** Accessible name of the landmark. */
  label?: string;
}

/**
 * The floating glass tab bar for phones (below 768px, replacing the side nav): a 64px L2 pill 12px above the bottom edge
 * (safe-area aware), icon over a 12px label, 44px+ targets, an active lens that morphs between tabs. The active tab is the
 * filled/heavier icon and the heavier label, so the state does not rest on colour. Pad the page by `pb-28` to clear it.
 */
export function MobileBottomBar({ items, action, activePath, label = "Primary", className, ...props }: MobileBottomBarProps) {
  const pathname = usePathname();
  const lensId = `tab-lens-${useId()}`;
  const activeHref = resolveActiveHref(activePath ?? pathname ?? "/", items);
  const visible = items.slice(0, action ? 4 : 5);
  const half = Math.ceil(visible.length / 2);

  const tab = (entry: NavEntry) => {
    const active = entry.href === activeHref;
    const Icon = entry.icon;
    return (
      <li key={entry.id ?? entry.href} className="min-w-0 flex-1">
        <Link
          href={entry.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-pill text-micro transition-colors duration-(--fd-dur-fast) ease-standard select-none active:scale-[0.96]",
            active ? "font-semibold text-fg" : "font-medium text-fg-muted",
          )}
        >
          {active ? (
            <motion.span layoutId={lensId} transition={spring.snappy} aria-hidden="true" className="absolute inset-0 rounded-[inherit] bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim)]" />
          ) : null}
          <span className="relative grid size-6 place-items-center">
            <Icon aria-hidden="true" className="size-[22px]" strokeWidth={active ? 2.15 : 1.75} />
            {entry.badge ? <span aria-hidden="true" className="absolute top-0 -right-0.5 size-2 rounded-full bg-accent-solid shadow-[0_0_0_2px_var(--fd-surface)]" /> : null}
          </span>
          <span className="relative max-w-full truncate px-1">{entry.shortLabel ?? entry.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <Glass
      as="nav"
      layer={2}
      interactive={false}
      aria-label={label}
      className={cn("fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-(--fd-z-nav) mx-auto max-w-md rounded-pill p-1.5 md:hidden", className)}
      {...props}
    >
      <ul className="flex items-center gap-1">
        {action ? (
          <>
            {visible.slice(0, half).map((entry) => tab(entry))}
            <li className="relative flex shrink-0 justify-center px-1">
              <span className="-mt-7 grid place-items-center">{action}</span>
            </li>
            {visible.slice(half).map((entry) => tab(entry))}
          </>
        ) : (
          visible.map((entry) => tab(entry))
        )}
      </ul>
    </Glass>
  );
}
