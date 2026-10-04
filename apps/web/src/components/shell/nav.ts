import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** One destination in the side nav and the mobile bottom bar. */
export interface NavEntry {
  /** Stable key. Defaults to the href. */
  id?: string;
  href: string;
  /** Specific, not generic: "Review queue", not "Home" (apple-design: name nav items for their contents). */
  label: string;
  /** Short label for the bottom bar (12px, one word). Defaults to `label`. */
  shortLabel?: string;
  /** A lucide icon component (outline; the active item gets a heavier stroke). */
  icon: LucideIcon;
  /** A count or short status: "14", "New". Shown at the right of the row, and as a dot when the sidebar is collapsed. */
  badge?: ReactNode;
  /** Active only on this exact path (use for index routes like `/brand`). Default: the path or any child path. */
  exact?: boolean;
  /** Show this entry in the mobile bottom bar (at most five, plus an optional centre action). */
  mobile?: boolean;
  /** Opens in a new tab (docs, the public storefront). */
  external?: boolean;
}

export interface NavGroup {
  id?: string;
  /** Overline above the group ("Grow", "Money"). Omit for the first, unlabelled group. */
  label?: string;
  items: readonly NavEntry[];
}

/** Does `pathname` belong to `entry`? Exact entries match only themselves; others match themselves and their children. */
export function matchesEntry(pathname: string, entry: NavEntry): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const href = entry.href.replace(/\/+$/, "") || "/";
  if (entry.exact || href === "/") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

/**
 * The href of the ONE entry that is active: the longest matching href wins, so `/brand` is not also active on
 * `/brand/bounties` when both are in the nav.
 */
export function resolveActiveHref(pathname: string, entries: readonly NavEntry[]): string | undefined {
  let best: NavEntry | undefined;
  for (const entry of entries) {
    if (entry.external || !matchesEntry(pathname, entry)) continue;
    if (!best || entry.href.length > best.href.length) best = entry;
  }
  return best?.href;
}

export function flattenNav(groups: readonly NavGroup[]): NavEntry[] {
  return groups.flatMap((group) => [...group.items]);
}
