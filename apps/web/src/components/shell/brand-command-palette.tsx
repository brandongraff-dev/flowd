"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSearchIndex } from "@/lib/data";
import { personaOfAction } from "@/lib/search/actions";
import type { ActionId } from "@/lib/search/types";
import { toCommandGroups } from "@/lib/search/palette";
import { useSearch } from "@/lib/search/use-search";
import { useSession } from "@/lib/session/use-session";
import { actions } from "@/lib/store";
import { useReduceGlass } from "@/lib/hooks/use-reduce-glass";
import { CommandPalette } from "@/components/ui/command-palette";
import { notify } from "@/components/ui/toast";
import { useTheme } from "./theme-provider";

export interface BrandCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the keyboard shortcuts dialog (the "show-shortcuts" action). */
  onShowShortcuts: () => void;
}

/**
 * The Ctrl+K palette for the brand dashboard. Its index comes from the store (this workspace's bounties, apps, submissions, the creator
 * directory) plus the route registry and the shell actions, ranked by `useSearch`. Every action the catalogue can produce for a brand is
 * handled here, so nothing in the palette is a dead row.
 */
export function BrandCommandPalette({ open, onOpenChange, onShowShortcuts }: BrandCommandPaletteProps) {
  const router = useRouter();
  const index = useSearchIndex();
  const { query, setQuery, groups, recordUse } = useSearch(index);
  const { signIn, signOut } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const glass = useReduceGlass();

  const run = useCallback(
    (action: ActionId): void => {
      const persona = personaOfAction(action);
      if (persona) {
        signIn(persona, { redirectTo: true });
        return;
      }
      switch (action) {
        case "toggle-theme":
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          return;
        case "toggle-reduce-glass":
          glass.setReduced(!glass.app);
          return;
        case "show-shortcuts":
          onShowShortcuts();
          return;
        case "reset-demo":
          void actions.resetDemo().then(() => {
            notify.success("Demo data reset", { description: "Every bounty, wallet and review is back to where it started." });
            router.refresh();
          });
          return;
        case "sign-out":
          signOut({ redirectTo: "/login" });
          return;
        default:
          // Creator and admin actions are not in a brand's catalogue; if one ever appears it goes nowhere silently rather than breaking the palette.
          return;
      }
    },
    [glass, onShowShortcuts, resolvedTheme, router, setTheme, signIn, signOut],
  );

  const commandGroups = useMemo(() => toCommandGroups(groups, { onAction: run, onSelect: recordUse }), [groups, run, recordUse]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      hotkey="mod+k"
      groups={commandGroups}
      shouldFilter={false}
      onQueryChange={setQuery}
      placeholder="Search bounties, creators, pages and actions"
      label="Search the brand dashboard"
      empty={query ? `Nothing matches “${query}”` : "Nothing to show yet"}
    />
  );
}
