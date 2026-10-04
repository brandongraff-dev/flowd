"use client";

import { useId, type ReactNode } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useControllableState } from "@/lib/hooks/use-controllable-state";
import { Glass } from "@/components/glass/glass";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when the label is an icon only. */
  "aria-label"?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: readonly SegmentedOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** REQUIRED: names the group for assistive technology. */
  "aria-label": string;
  size?: "sm" | "md" | "lg";
  /** Stretch to the container with equal-width segments. */
  fullWidth?: boolean;
  /**
   * Real L2 glass track (pointer sheen, blur) for floating contexts over aurora or media. Default is a flat field-fill
   * track, which costs nothing and never breaks the stacking rule.
   */
  glass?: boolean;
  className?: string;
}

const SIZE = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-5 text-[15px]",
} as const;

/**
 * Pick one of 2-5 options (view, range, audience). A pill track with a lens that morphs to the selection on the
 * `snappy` spring (shared-layout `motion`, instant under reduced motion). Pressing the selected option again keeps it.
 * Use Tabs when the choice swaps a panel; use SegmentedControl when it changes a setting or a view.
 *
 * ```tsx
 * <SegmentedControl aria-label="Date range" value={range} onValueChange={setRange}
 *   options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
 * ```
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  "aria-label": ariaLabel,
  size = "md",
  fullWidth = false,
  glass = false,
  className,
}: SegmentedControlProps<T>) {
  const [current, setCurrent] = useControllableState<T>({
    value,
    defaultValue: defaultValue ?? options[0]?.value ?? ("" as T),
    onChange: onValueChange,
  });
  const layoutId = `segmented-${useId()}`;

  const group = (
    <ToggleGroup.Root
      type="single"
      value={current}
      // Radix reports "" when the pressed item is pressed again; keep the current choice instead.
      onValueChange={(next) => {
        if (next) setCurrent(next as T);
      }}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill p-[3px]",
        glass ? "" : "fd-seg-track",
        fullWidth && "flex w-full",
        !glass && className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option["aria-label"]}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-pill font-semibold whitespace-nowrap select-none",
              "transition-colors duration-(--fd-dur-fast) ease-standard disabled:cursor-not-allowed disabled:text-fg-disabled pointer-coarse:min-h-11",
              "[&_svg]:size-4 [&_svg]:stroke-[1.75]",
              SIZE[size],
              fullWidth && "flex-1",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={spring.snappy}
                className="fd-seg-lens absolute inset-0"
                style={{ borderRadius: 9999 }}
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );

  if (!glass) return group;
  return (
    <Glass layer={2} interactive className={cn("inline-flex", fullWidth && "flex w-full", className)}>
      {group}
    </Glass>
  );
}
