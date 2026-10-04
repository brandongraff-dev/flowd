"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KbdShortcut } from "./kbd";
import { menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass, OverlaySurface } from "./overlay";

/** Dropdown menu on L3 glass: roving focus, type-ahead, arrow keys, sub-menus, Escape. Compose with `DropdownMenuTrigger asChild`. */
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  children,
  ...props
}: ComponentPropsWithRef<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content sideOffset={sideOffset} align={align} collisionPadding={12} asChild {...props}>
        <OverlaySurface className={cn(menuContentClass, className)}>{children}</OverlaySurface>
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentPropsWithRef<typeof MenuPrimitive.Item> {
  /** Leading icon (lucide). Rendered as a direct child so the menu sizes it. */
  icon?: ReactNode;
  /** Keyboard shortcut shown at the end, e.g. `["mod", "K"]`. Display only: wire the key with `useHotkey`. */
  shortcut?: readonly string[];
  /** Rose styling for destructive items. Also confirm irreversible ones in a dialog. */
  destructive?: boolean;
}

export function DropdownMenuItem({ icon, shortcut, destructive, className, children, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(menuItemClass, destructive && "text-rose data-[highlighted]:bg-rose-soft [&>svg]:text-rose", className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <KbdShortcut keys={shortcut} size="sm" className="ml-4 shrink-0" /> : null}
    </MenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(menuItemClass, "pl-9", className)} checked={checked} {...props}>
      <span className="absolute left-3 grid size-4 place-items-center">
        <MenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-4 text-accent" strokeWidth={2.25} />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(menuItemClass, "pl-9", className)} {...props}>
      <span className="absolute left-3 grid size-4 place-items-center">
        <MenuPrimitive.ItemIndicator>
          <Circle aria-hidden="true" className="size-2 fill-accent text-accent" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn(menuLabelClass, className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn(menuSeparatorClass, className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.SubTrigger>) {
  return (
    <MenuPrimitive.SubTrigger className={cn(menuItemClass, "data-[state=open]:bg-surface-active", className)} {...props}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight aria-hidden="true" className="!size-4 text-fg-subtle" />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, children, ...props }: ComponentPropsWithRef<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent sideOffset={10} collisionPadding={12} asChild {...props}>
        <OverlaySurface className={cn(menuContentClass, className)}>{children}</OverlaySurface>
      </MenuPrimitive.SubContent>
    </MenuPrimitive.Portal>
  );
}
