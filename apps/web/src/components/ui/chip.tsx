"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipProps extends Omit<ComponentPropsWithRef<"button">, "color" | "onChange"> {
  /** Pressed state of a toggle chip (filters). Exposed as `aria-pressed`. */
  selected?: boolean;
  /** Called with the next state when the chip is toggled. */
  onSelectedChange?: (selected: boolean) => void;
  /** Leading icon (lucide, 16px). */
  icon?: ReactNode;
  /** Trailing count, tabular. */
  count?: ReactNode;
  size?: "sm" | "md";
  /** Force a visual state for documentation (/dev/design). Never use in product code. */
  "data-force"?: "hover" | "focus" | "active";
}

/**
 * Toggle chip for filters and choices (niche, platform, status). A real button with `aria-pressed`; selected = accent
 * tint and ring, which also changes the weight of the border (not colour alone). 32px (sm: 28px), 44px on touch.
 *
 * ```tsx
 * <ChipGroup aria-label="Niche">{niches.map((n) => <Chip key={n} selected={on.has(n)} onSelectedChange={() => toggle(n)}>{n}</Chip>)}</ChipGroup>
 * ```
 */
export function Chip({ selected = false, onSelectedChange, icon, count, size = "md", className, children, onClick, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelectedChange?.(!selected);
      }}
      className={cn(
        "fd-chip inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap select-none",
        "active:scale-[0.96] pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
        size === "md" ? "h-8 px-3.5 text-[14px]" : "h-7 px-3 text-caption",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined ? <span className="text-caption font-semibold tabular-nums">{count}</span> : null}
    </button>
  );
}

export interface RemovableChipProps extends Omit<ComponentPropsWithRef<"span">, "color"> {
  /** Called when the X is pressed. */
  onRemove: () => void;
  /** Accessible label for the remove button; default "Remove". Include the chip's subject: "Remove Fitness". */
  removeLabel?: string;
  icon?: ReactNode;
  size?: "sm" | "md";
}

/** An applied filter or tag with a remove button. The X is the only interactive part. */
export function RemovableChip({ onRemove, removeLabel = "Remove", icon, size = "md", className, children, ...props }: RemovableChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill bg-accent-soft pl-3.5 font-semibold whitespace-nowrap text-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent-bright)_55%,transparent)] [&_svg]:size-4 [&_svg]:shrink-0",
        size === "md" ? "h-8 text-[14px]" : "h-7 text-caption",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="mr-1 grid size-6 place-items-center rounded-pill text-accent transition-colors duration-(--fd-dur-fast) hover:bg-accent-soft pointer-coarse:size-9"
      >
        <X aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      </button>
    </span>
  );
}

/** Wrapping row for chips. Gives the group an accessible name. */
export function ChipGroup({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div role="group" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}
