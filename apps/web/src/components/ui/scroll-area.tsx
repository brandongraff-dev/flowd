"use client";

import type { ComponentPropsWithRef, Ref } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends Omit<ComponentPropsWithRef<typeof ScrollAreaPrimitive.Root>, "type"> {
  /** Which axes scroll. Default `vertical`. */
  orientation?: "vertical" | "horizontal" | "both";
  /**
   * `hover` (default): thin scrollbars that appear when pointing or scrolling. `always`: always visible (long
   * lists in a sheet). `auto`: native behaviour.
   */
  scrollbars?: "hover" | "always" | "auto";
  /** Soft fade at the scrolling edges instead of a hard cut. Do not put glass inside a faded viewport (the mask would blank its backdrop). */
  fade?: boolean;
  /** Classes for the viewport (padding, max-height live here or on the root). */
  viewportClassName?: string;
  viewportRef?: Ref<HTMLDivElement>;
  /** Accessible name of the scrollable region. Give one: a scrollable area must be reachable and named for keyboard users. */
  "aria-label"?: string;
}

/**
 * Custom thin scrollbars on Radix ScrollArea. The viewport is focusable (`tabIndex 0`, `role="region"`) so keyboard users
 * can scroll it with the arrow keys, and shows the global focus ring. Overscroll is contained so the page behind stays put.
 */
export function ScrollArea({
  orientation = "vertical",
  scrollbars = "hover",
  fade = false,
  viewportClassName,
  viewportRef,
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ScrollAreaProps) {
  const type = scrollbars === "always" ? "always" : scrollbars === "auto" ? "auto" : "hover";
  return (
    <ScrollAreaPrimitive.Root type={type} scrollHideDelay={600} className={cn("relative overflow-hidden", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={cn(
          "size-full overscroll-contain rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
          fade && (orientation === "horizontal" ? "fd-scroll-fade-x" : "fd-scroll-fade-y"),
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" ? <Scrollbar orientation="vertical" /> : null}
      {orientation !== "vertical" ? <Scrollbar orientation="horizontal" /> : null}
      {orientation === "both" ? <ScrollAreaPrimitive.Corner /> : null}
    </ScrollAreaPrimitive.Root>
  );
}

function Scrollbar({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 transition-opacity duration-(--fd-dur-base) select-none data-[state=hidden]:opacity-0",
        orientation === "vertical" ? "h-full w-2.5 flex-col" : "h-2.5 flex-col",
      )}
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-pill bg-rim-strong transition-colors duration-(--fd-dur-fast) hover:bg-fg-subtle active:bg-fg-subtle before:absolute before:top-1/2 before:left-1/2 before:size-full before:min-h-6 before:min-w-6 before:-translate-x-1/2 before:-translate-y-1/2" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
