"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Search, WalletMinimal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";
import { IconButton } from "@/components/ui/icon-button";
import { KbdShortcut } from "@/components/ui/kbd";
import { Money } from "@/components/ui/money";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TopBarProps extends Omit<ComponentPropsWithoutRef<"header">, "children"> {
  /** Left: a `<Breadcrumbs/>` or a page title. Truncates before anything else gives way. */
  breadcrumbs?: ReactNode;
  /** Before the breadcrumbs: the flowd mark on phones, a back button. */
  leading?: ReactNode;
  /** Opens the command palette. Renders the search field-button (an icon button below 768px). */
  onSearch?: () => void;
  searchPlaceholder?: string;
  /** Slots, in order: wallet chip, notifications, user menu. Use `WalletChip`, `NotificationButton`, `UserMenu` or your own. */
  wallet?: ReactNode;
  notifications?: ReactNode;
  userMenu?: ReactNode;
  /** Anything extra between the search and the wallet (a "New bounty" button). */
  actions?: ReactNode;
}

/**
 * The app top bar: a floating L2 glass pill (AppShell makes it stick 12px from the top) that holds breadcrumbs, the search trigger, the
 * wallet chip, notifications and the user menu. Brand chrome recedes (a quiet bar, hairlines only), so the only loud thing is
 * the one primary action a page puts in `actions`. 56px tall, 44px targets on touch.
 */
export function TopBar({ breadcrumbs, leading, onSearch, searchPlaceholder = "Search or jump to", wallet, notifications, userMenu, actions, className, ...props }: TopBarProps) {
  return (
    <Glass
      as="header"
      layer={2}
      interactive
      className={cn("@container flex h-14 items-center gap-2 rounded-pill pr-2 pl-4 sm:gap-3", className)}
      {...props}
    >
      {leading}
      <div className="min-w-0 flex-1">{breadcrumbs}</div>
      {onSearch ? <SearchTrigger onOpen={onSearch} placeholder={searchPlaceholder} responsive="container" /> : null}
      {/* what stays depends on the bar's own width, not the viewport: the action first, then the wallet chip, then the search field */}
      {actions ? <div className="hidden shrink-0 @[520px]:block">{actions}</div> : null}
      {wallet ? <div className="hidden shrink-0 @[640px]:block">{wallet}</div> : null}
      {notifications}
      {userMenu}
    </Glass>
  );
}

export interface SearchTriggerProps {
  onOpen: () => void;
  placeholder?: string;
  /** `viewport`: the field from 768px up. `container`: the field when the nearest container (the TopBar) is 760px or wider. */
  responsive?: "viewport" | "container";
  className?: string;
}

/**
 * The search field-button: it looks like the input it opens (the command palette) and shows the shortcut. Below 768px it is a
 * plain icon button. Pressing it from the keyboard opens the palette with no animation; this is a 100-times-a-day action.
 */
export function SearchTrigger({ onOpen, placeholder = "Search or jump to", responsive = "viewport", className }: SearchTriggerProps) {
  const container = responsive === "container";
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "hidden h-10 w-56 items-center gap-2.5 rounded-pill bg-surface-field pr-2.5 pl-3.5 text-body-sm text-fg-subtle shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg-muted lg:w-72",
          container ? "@[760px]:inline-flex" : "md:inline-flex",
          className,
        )}
      >
        <Search aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate text-left">{placeholder}</span>
        <KbdShortcut keys={["mod", "K"]} size="sm" />
      </button>
      <IconButton variant="plain" label="Search" icon={<Search />} onClick={onOpen} className={container ? "@[760px]:hidden" : "md:hidden"} shortcut={["mod", "K"]} />
    </>
  );
}

export interface WalletChipProps {
  /** Creators: the cleared balance in cents (mint, with a check). Pending is always a separate figure with a clock. */
  clearedCents?: number;
  pendingCents?: number;
  /** Brands: the escrow balance instead of cleared and pending (neutral ink with a lock). */
  escrowCents?: number;
  href?: string;
  className?: string;
}

/** The wallet chip for the top bar: cleared and pending as two distinct figures (never one blended number), linking to the Wallet. */
export function WalletChip({ clearedCents, pendingCents, escrowCents, href = "/creator/wallet", className }: WalletChipProps) {
  return (
    <Link
      href={href}
      aria-label="Open wallet"
      className={cn(
        "inline-flex h-10 items-center gap-2.5 rounded-pill bg-surface-field px-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:h-11",
        className,
      )}
    >
      <WalletMinimal aria-hidden="true" className="size-[18px] shrink-0 text-fg-muted" strokeWidth={1.75} />
      {escrowCents !== undefined ? (
        <Money cents={escrowCents} size="sm" state="escrow" decimals="auto" />
      ) : (
        <>
          <Money cents={clearedCents ?? 0} size="sm" state="cleared" decimals="auto" />
          {pendingCents ? <Money cents={pendingCents} size="sm" state="pending" decimals="auto" className="hidden lg:inline-flex" /> : null}
        </>
      )}
    </Link>
  );
}

export interface NotificationButtonProps {
  /** Unread count. 0 hides the dot. */
  count?: number;
  onClick?: () => void;
  href?: string;
}

/** Bell with an unread dot (a count in the label, so the number is never colour alone). */
export function NotificationButton({ count = 0, onClick, href }: NotificationButtonProps) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  const button = <IconButton variant="plain" label={label} icon={<Bell />} onClick={onClick} />;
  return (
    <span className="relative inline-grid">
      {href ? (
        <Link href={href} aria-label={label} className="grid size-10 place-items-center rounded-full text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:size-11">
          <Bell aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </Link>
      ) : (
        button
      )}
      {count > 0 ? (
        <span aria-hidden="true" className="pointer-events-none absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-[10px] leading-none font-bold text-on-accent tabular-nums shadow-[0_0_0_2px_var(--fd-surface)]">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </span>
  );
}

export interface UserMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
  shortcut?: readonly string[];
}

export interface UserMenuProps {
  /** An avatar (`Avatar` or `ArtAvatar`), already sized. */
  avatar: ReactNode;
  name: string;
  /** "Brand admin · Nap Nest", "Gold creator". */
  detail?: string;
  /** Items in groups; a separator is drawn between groups. Put sign out last. */
  sections: readonly (readonly UserMenuItem[])[];
}

/** The account menu: avatar trigger, name and detail at the top, grouped items (links or actions), destructive items in rose. */
export function UserMenu({ avatar, name, detail, sections }: UserMenuProps) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="group inline-flex h-10 items-center gap-1.5 rounded-pill pr-2 pl-1 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:h-11"
        >
          {avatar}
          <ChevronDown aria-hidden="true" className="hidden size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-data-[state=open]:rotate-180 sm:block" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel className="grid gap-0.5 normal-case">
          <span className="text-body-sm font-semibold tracking-normal text-fg normal-case">{name}</span>
          {detail ? <span className="text-caption font-normal tracking-normal text-fg-subtle normal-case">{detail}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {sectionIndex > 0 ? <DropdownMenuSeparator /> : null}
            {section.map((item) => (
              <DropdownMenuItem
                key={item.id}
                icon={item.icon}
                destructive={item.destructive}
                shortcut={item.shortcut}
                onSelect={() => {
                  if (item.href) router.push(item.href);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
