"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

export interface CheckboxProps extends Omit<ComponentPropsWithRef<typeof CheckboxPrimitive.Root>, "children"> {
  /** Visible label. The label and the box share one 44px hit target (no dead zone between them). */
  label?: ReactNode;
  /** Secondary line under the label (linked with aria-describedby). */
  description?: ReactNode;
  /** Classes for the wrapping <label> (the `className` prop goes to the box). */
  containerClassName?: string;
}

/**
 * Checkbox: 22px box, Flow-gradient fill with a drawn check, minus for `checked="indeterminate"`.
 * Keyboard: Space toggles. Pass `label` (and optionally `description`) for the standard 44px row, or compose your own
 * <label> around the bare box.
 */
export function Checkbox({ label, description, containerClassName, className, id, ...props }: CheckboxProps) {
  const control = useFieldControl({ id, disabled: props.disabled, required: props.required, "aria-describedby": props["aria-describedby"] });
  const descriptionId = description && control.id ? `${control.id}-description` : undefined;

  const box = (
    <CheckboxPrimitive.Root
      {...props}
      id={control.id}
      disabled={control.disabled}
      aria-describedby={[control["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined}
      aria-invalid={control["aria-invalid"]}
      className={cn(
        "fd-checkbox group/box relative mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-[7px] text-on-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator forceMount className="grid place-items-center">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path
            className="fd-check-draw hidden group-data-[state=checked]/box:block"
            d="M3.5 8.5 6.6 11.5 12.5 4.8"
            pathLength={1}
            strokeDasharray={1}
          />
          <path className="fd-check-draw hidden group-data-[state=indeterminate]/box:block" d="M4 8h8" pathLength={1} strokeDasharray={1} />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-1.5 has-[:disabled]:cursor-not-allowed", containerClassName)}>
      {box}
      <span className="grid gap-0.5 text-body-sm">
        <span className="font-medium text-fg">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-caption text-fg-subtle">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
