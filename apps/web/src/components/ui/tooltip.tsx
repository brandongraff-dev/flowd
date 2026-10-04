"use client";

import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";
import { KbdShortcut } from "./kbd";

const GroupedContext = createContext(false);

export interface TooltipProviderProps {
  children: ReactNode;
  /** Delay before the first tooltip opens (ms). Default 400: long enough to avoid accidental opens. */
  delayDuration?: number;
  /** After one tooltip has opened, neighbours open instantly with no animation for this long (ms). Default 300. */
  skipDelayDuration?: number;
}

/**
 * Shares tooltip delay state across a region so that once one tooltip is open its neighbours appear instantly (the
 * toolbar feels faster without defeating the initial delay). Mount once near the root; `Tooltip` also works without it.
 */
export function TooltipProvider({ children, delayDuration = 400, skipDelayDuration = 300 }: TooltipProviderProps) {
  return (
    <GroupedContext value={true}>
      <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
        {children}
      </TooltipPrimitive.Provider>
    </GroupedContext>
  );
}

export interface TooltipProps {
  /** Tooltip text. Keep it short; it is not the place for essential information (touch users never see it). */
  content: ReactNode;
  /** Optional keyboard shortcut shown beside the text, e.g. `["mod", "K"]`. */
  shortcut?: readonly string[];
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Override the provider delay for this tooltip (ms). */
  delayDuration?: number;
  /** Render the child alone (no tooltip), e.g. while a menu is open. */
  disabled?: boolean;
  /** The trigger: a single focusable element. It receives `aria-describedby` while the tooltip is open. */
  children: ReactElement;
  className?: string;
}

/**
 * Tooltip on L3 glass (compact). Appears after 400 ms, then instantly for neighbours; scales from its trigger
 * (never from the centre); disappears with `Escape`. Opens on keyboard focus as well as hover.
 */
export function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  sideOffset = 8,
  delayDuration,
  disabled = false,
  children,
  className,
}: TooltipProps) {
  const grouped = useContext(GroupedContext);
  if (disabled || content === null || content === undefined || content === false) return children;

  const tooltip = (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} align={align} sideOffset={sideOffset} collisionPadding={12} asChild>
          <Glass
            layer={3}
            portal
            compact
            className={cn(
              "fd-pop z-(--fd-z-tooltip) flex max-w-xs items-center gap-2 rounded-lg px-2.5 py-1.5 text-caption font-medium text-fg select-none",
              className,
            )}
          >
            <span>{content}</span>
            {shortcut ? <KbdShortcut keys={shortcut} size="sm" /> : null}
          </Glass>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );

  return grouped ? tooltip : <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>{tooltip}</TooltipPrimitive.Provider>;
}
