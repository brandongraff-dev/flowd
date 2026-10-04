"use client";

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useIsMac } from "@/lib/hooks/use-hotkey";

export interface KbdProps extends ComponentPropsWithRef<"kbd"> {
  /** Smaller variant for tooltips and menu rows. */
  size?: "sm" | "md";
}

/** A single key cap. Use `KbdShortcut` for a combination. */
export function Kbd({ size = "md", className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-surface-field font-mono font-medium text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim),inset_0_-1.5px_0_var(--fd-divider)]",
        size === "md" ? "h-6 min-w-6 px-1.5 text-[12px]" : "h-5 min-w-5 px-1 text-[11px]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

const MOD_KEYS: Record<string, { mac: string; other: string }> = {
  mod: { mac: "⌘", other: "Ctrl" },
  cmd: { mac: "⌘", other: "Ctrl" },
  ctrl: { mac: "⌃", other: "Ctrl" },
  shift: { mac: "⇧", other: "Shift" },
  alt: { mac: "⌥", other: "Alt" },
  option: { mac: "⌥", other: "Alt" },
  enter: { mac: "↵", other: "Enter" },
  return: { mac: "↵", other: "Enter" },
  esc: { mac: "esc", other: "Esc" },
  up: { mac: "↑", other: "↑" },
  down: { mac: "↓", other: "↓" },
  left: { mac: "←", other: "←" },
  right: { mac: "→", other: "→" },
  backspace: { mac: "⌫", other: "Backspace" },
  tab: { mac: "⇥", other: "Tab" },
};

export interface KbdShortcutProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Keys in order, e.g. `["mod", "K"]`. `mod` renders ⌘ on Apple platforms and Ctrl elsewhere. */
  keys: readonly string[];
  size?: "sm" | "md";
}

/** A keyboard shortcut as a row of key caps. Platform-aware (no hydration mismatch: SSR renders the non-Apple form). */
export function KbdShortcut({ keys, size = "md", className, ...props }: KbdShortcutProps) {
  const mac = useIsMac();
  const label = keys.map((key) => MOD_KEYS[key.toLowerCase()]?.[mac ? "mac" : "other"] ?? key.toUpperCase());
  return (
    <span className={cn("inline-flex items-center gap-1", className)} {...props}>
      <span className="sr-only">{`Shortcut: ${label.join(" ")}`}</span>
      {label.map((key, index) => (
        <Kbd key={`${key}-${index}`} size={size} aria-hidden="true">
          {key}
        </Kbd>
      ))}
    </span>
  );
}
