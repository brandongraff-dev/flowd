"use client";

import type { ComponentPropsWithRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { OverlaySurface } from "./overlay";

/** Anchored popover on L3 glass. Compose with `PopoverTrigger asChild`. Focus moves inside; Escape and outside click close it. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps extends ComponentPropsWithRef<typeof PopoverPrimitive.Content> {
  /** Width preset; the content can always override with `className`. */
  width?: "auto" | "sm" | "md" | "lg";
}

const WIDTH = { auto: "w-max max-w-[min(24rem,calc(100vw-1.5rem))]", sm: "w-60", md: "w-72", lg: "w-96 max-w-[calc(100vw-1.5rem)]" } as const;

/**
 * The popover surface. It scales in from its trigger (never from the centre), is a separate floating layer (it ignores
 * the glass of whatever opened it) and stays inside the viewport (12px collision padding).
 */
export function PopoverContent({ className, align = "center", sideOffset = 8, width = "md", children, ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} collisionPadding={12} asChild {...props}>
        <OverlaySurface className={cn("z-(--fd-z-popover) rounded-[20px] p-4 outline-none", WIDTH[width], className)}>{children}</OverlaySurface>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
