"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, Search, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useControllableState } from "@/lib/hooks/use-controllable-state";
import { useHotkey } from "@/lib/hooks/use-hotkey";
import { GlassPanel } from "@/components/glass/glass";
import { Kbd, KbdShortcut } from "./kbd";
import { menuItemClass } from "./overlay";
import { Spinner } from "./spinner";

export interface CommandItemDef {
  /** Stable id (React key). */
  id: string;
  /** What the row says. Must be unique inside the palette: it is also the filter and selection key. */
  label: string;
  /** Muted text after the label ("Bounties", "Wallet"). */
  hint?: ReactNode;
  /** Leading icon (lucide). */
  icon?: ReactNode;
  /** Shortcut shown at the end, e.g. `["g", "w"]`. Display only: wire the key yourself with `useHotkey`. */
  shortcut?: readonly string[];
  /** Extra words that should match ("cash out" for "Withdraw"). */
  keywords?: readonly string[];
  disabled?: boolean;
  /** Runs after the palette closes. */
  onSelect?: () => void;
  /** Navigates (client-side) after the palette closes. */
  href?: string;
}

export interface CommandGroupDef {
  heading: string;
  items: readonly CommandItemDef[];
}

export interface CommandPaletteProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  groups: readonly CommandGroupDef[];
  placeholder?: string;
  /** Accessible name of the dialog. */
  label?: string;
  /**
   * Global shortcut that toggles the palette. Default `mod+k` (Cmd on Apple, Ctrl elsewhere). `false` = none (you open it yourself).
   * Opening from the keyboard never animates: a command palette is used hundreds of times a day.
   */
  hotkey?: string | false;
  /** Shown while results load (async search). */
  loading?: boolean;
  /** Called on every keystroke, for async search; set `shouldFilter={false}` when you filter on the server. */
  onQueryChange?: (query: string) => void;
  /** Turn off the built-in fuzzy filter (server-side search). */
  shouldFilter?: boolean;
  /** Shown when nothing matches. */
  empty?: ReactNode;
  /** Every item row is also called with this after it runs (analytics, recents). */
  onRun?: (item: CommandItemDef) => void;
}

/**
 * Command palette: cmdk on Radix Dialog, L3 glass over a scrim. Fuzzy search, arrow keys, Home/End, Enter, Escape, a
 * focus trap and focus return. It opens and closes instantly (no animation: keyboard-initiated, high frequency).
 *
 * ```tsx
 * <CommandPalette groups={[{ heading: "Go to", items: [{ id: "wallet", label: "Wallet", icon: <WalletMinimal />, href: "/creator/wallet", shortcut: ["g", "w"] }] }]} />
 * ```
 */
export function CommandPalette({
  open,
  defaultOpen = false,
  onOpenChange,
  groups,
  placeholder = "Search or jump to…",
  label = "Command palette",
  hotkey = "mod+k",
  loading = false,
  onQueryChange,
  shouldFilter = true,
  empty,
  onRun,
}: CommandPaletteProps) {
  const router = useRouter();
  const [isOpen, setOpen] = useControllableState<boolean>({ value: open, defaultValue: defaultOpen, onChange: onOpenChange });
  useHotkey(hotkey || "mod+k", () => setOpen((previous) => !previous), { enabled: hotkey !== false });

  const run = (item: CommandItemDef): void => {
    setOpen(false);
    onRun?.(item);
    item.onSelect?.();
    if (item.href) router.push(item.href);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--fd-z-scrim) bg-scrim" />
        <DialogPrimitive.Content asChild aria-describedby={undefined}>
          <GlassPanel
            portal
            padding="none"
            className="fixed top-[min(14dvh,7rem)] left-1/2 z-(--fd-z-modal) w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden rounded-[28px] outline-none"
          >
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            <Command label={label} loop shouldFilter={shouldFilter} className="flex max-h-[min(34rem,calc(100dvh-8rem))] flex-col">
              <div className="flex items-center gap-3 border-b border-divider px-5">
                <Search aria-hidden="true" className="size-5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                <Command.Input
                  placeholder={placeholder}
                  onValueChange={onQueryChange}
                  className="h-14 min-w-0 flex-1 bg-transparent text-base font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle md:text-[16px]"
                />
                {loading ? <Spinner size={16} label="Searching" /> : <Kbd size="sm" className="hidden sm:inline-flex">esc</Kbd>}
              </div>

              <Command.List
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2",
                  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-overline [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase",
                )}
              >
                <Command.Empty className="grid justify-items-center gap-2 px-6 py-10 text-center">
                  <SearchX aria-hidden="true" className="size-7 text-fg-subtle" strokeWidth={1.6} />
                  <span className="text-body-sm font-semibold text-fg">{empty ?? "Nothing matches that"}</span>
                  <span className="text-caption text-fg-subtle">Try a bounty name, a page or an action like “cash out”.</span>
                </Command.Empty>

                {groups.map((group) => (
                  <Command.Group key={group.heading} heading={group.heading}>
                    {group.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.label}
                        keywords={item.keywords ? [...item.keywords] : undefined}
                        disabled={item.disabled}
                        onSelect={() => run(item)}
                        className={cn(menuItemClass, "min-h-11 rounded-[20px] px-3.5 data-[disabled=true]:text-fg-disabled")}
                      >
                        {item.icon}
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                          {item.hint ? <span className="ml-2 text-caption font-normal text-fg-subtle">{item.hint}</span> : null}
                        </span>
                        {item.shortcut ? <KbdShortcut keys={item.shortcut} size="sm" className="shrink-0" /> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              <div className="hidden items-center gap-4 border-t border-divider px-5 py-2.5 text-caption text-fg-subtle sm:flex">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd size="sm">↑</Kbd>
                  <Kbd size="sm">↓</Kbd>
                  to move
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd size="sm">
                    <CornerDownLeft aria-hidden="true" className="size-3" />
                  </Kbd>
                  to open
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <Kbd size="sm">esc</Kbd>
                  to close
                </span>
              </div>
            </Command>
          </GlassPanel>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
