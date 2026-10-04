"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";
import { isTheme, type Theme } from "@/lib/theme";
import { useTheme } from "./theme-provider";

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; Icon: LucideIcon }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Three-way theme control (light / dark / system). Hit targets are 44px. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup.Root
      type="single"
      value={theme}
      // Radix reports "" when the active item is pressed again; keep the current choice instead.
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value);
      }}
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-rim bg-surface p-1 backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-sat)",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroup.Item
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="grid size-11 place-items-center rounded-full text-fg-muted transition-colors duration-200 ease-glass hover:text-fg data-[state=on]:bg-surface-raised data-[state=on]:text-fg"
        >
          <Icon className="size-[18px]" aria-hidden />
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
