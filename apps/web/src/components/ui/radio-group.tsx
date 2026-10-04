"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

/** Group of radio items. Arrow keys move and select; Tab leaves the group (Radix roving focus). Always give it an accessible name. */
export function RadioGroup({ className, ...props }: ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn("grid gap-1", className)} {...props} />;
}

export interface RadioGroupItemProps extends Omit<ComponentPropsWithRef<typeof RadioGroupPrimitive.Item>, "children"> {
  label: ReactNode;
  description?: ReactNode;
  /** Trailing content for `card` rows: a price, a badge. */
  meta?: ReactNode;
  /**
   * `default`: a plain 44px row. `card`: a bordered tile that lights up when selected, for choices that deserve weight
   * (plan, payout speed, rights term).
   */
  variant?: "default" | "card";
}

/**
 * One radio option with its label (shared 44px hit target). `variant="card"` makes the whole tile the target.
 *
 * ```tsx
 * <RadioGroup aria-label="Payout speed" defaultValue="weekly">
 *   <RadioGroupItem value="weekly" label="Weekly" description="Free · Fri 2:00 PM" variant="card" />
 * </RadioGroup>
 * ```
 */
export function RadioGroupItem({ label, description, meta, variant = "default", className, id, ...props }: RadioGroupItemProps) {
  const descriptionId = description && id ? `${id}-description` : undefined;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        variant === "default" ? "min-h-11 py-1.5" : "fd-radio-card min-h-14 rounded-xl p-3.5 pr-4",
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        id={id}
        aria-describedby={descriptionId}
        className="fd-radio group/radio mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full text-on-accent disabled:cursor-not-allowed"
        {...props}
      >
        <RadioGroupPrimitive.Indicator forceMount className="grid size-full place-items-center">
          <span className="size-2 scale-0 rounded-full bg-white transition-transform duration-(--fd-spring-tap-dur) ease-spring-tap group-data-[state=checked]/radio:scale-100" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
      <span className="grid flex-1 gap-0.5 text-body-sm">
        <span className="font-medium text-fg">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-caption text-fg-subtle">
            {description}
          </span>
        ) : null}
      </span>
      {meta ? <span className="shrink-0 text-body-sm font-semibold text-fg">{meta}</span> : null}
    </label>
  );
}
