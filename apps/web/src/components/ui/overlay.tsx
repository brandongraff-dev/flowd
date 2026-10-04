"use client";

import { cn } from "@/lib/utils";
import { Glass, type GlassProps } from "@/components/glass/glass";

/**
 * L3 surface for anchored overlays (popover, dropdown, select, command palette body). A separate floating layer: it
 * ignores the glass of whatever opened it (`portal`), scales in from its trigger (`fd-pop`) and keeps 20px outer radius
 * so 6px padding gives items the concentric 14px.
 *
 * Use as the child of a Radix `Content` with `asChild`: `<Popover.Content asChild><OverlaySurface>...</OverlaySurface></Popover.Content>`.
 */
export function OverlaySurface({ className, ...props }: Omit<GlassProps, "layer" | "portal">) {
  return <Glass layer={3} portal className={cn("fd-pop text-fg", className)} {...props} />;
}

/** Shared class strings for menu-like content and rows (DropdownMenu, Select, Command). */
export const menuContentClass =
  "z-(--fd-z-popover) max-h-(--radix-popper-available-height) min-w-52 overflow-x-hidden overflow-y-auto rounded-[20px] p-1.5 outline-none";

export const menuItemClass =
  "fd-menu-item relative flex min-h-10 cursor-default items-center gap-2.5 rounded-[14px] px-3 py-2 text-body-sm font-medium text-fg outline-none select-none pointer-coarse:min-h-11 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:stroke-[1.75] [&>svg]:text-fg-muted";

export const menuLabelClass = "px-3 pt-2 pb-1 fd-eyebrow text-fg-subtle";

export const menuSeparatorClass = "-mx-1.5 my-1.5 h-px bg-divider";
