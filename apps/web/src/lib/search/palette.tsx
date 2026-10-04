import { createElement } from "react";
import type { CommandGroupDef, CommandItemDef } from "@/components/ui/command-palette";
import { SEARCH_ICONS } from "./icons";
import type { ActionId, SearchEntry, SearchGroup } from "./types";

export interface PaletteAdapterOptions {
  /** Runs when an entry that carries an `action` (not a link) is chosen. Map every `ActionId` the catalogue can produce. */
  onAction?: (action: ActionId, entry: SearchEntry) => void;
  /** Called with the entry for every selection (recents, analytics). */
  onSelect?: (entry: SearchEntry) => void;
}

/**
 * Turns ranked search groups into the `CommandPalette` props: icons become elements, links become `href`, actions become `onSelect`.
 * The palette uses an entry's label as its selection key, so a duplicate label (two bounties with one title) is made unique by
 * appending its hint.
 *
 * Pair it with `shouldFilter={false}` and `onQueryChange`, because the ranking is already done:
 *
 * ```tsx
 * const { query, setQuery, groups } = useSearch(index);
 * <CommandPalette groups={toCommandGroups(groups, { onAction })} shouldFilter={false} onQueryChange={setQuery} />
 * ```
 */
export function toCommandGroups(groups: readonly SearchGroup[], options: PaletteAdapterOptions = {}): CommandGroupDef[] {
  const seen = new Set<string>();
  return groups.map((group) => ({
    heading: group.heading,
    items: group.results.map(({ entry }): CommandItemDef => {
      let label = entry.label;
      if (seen.has(label)) label = `${entry.label} (${entry.hint ?? entry.id})`;
      seen.add(label);
      const Icon = SEARCH_ICONS[entry.icon];
      const { action } = entry;
      return {
        id: entry.id,
        label,
        hint: entry.hint,
        icon: createElement(Icon, { "aria-hidden": true, className: "size-[18px] shrink-0 text-fg-muted", strokeWidth: 1.75 }),
        shortcut: entry.shortcut,
        keywords: entry.keywords,
        href: entry.href,
        onSelect: () => {
          options.onSelect?.(entry);
          if (action) options.onAction?.(action, entry);
        },
      };
    }),
  }));
}
