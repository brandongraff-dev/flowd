"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

export interface SwitchProps extends Omit<ComponentPropsWithRef<typeof SwitchPrimitive.Root>, "children"> {
  /** Visible label; the whole row is the hit target. */
  label?: ReactNode;
  description?: ReactNode;
  /** Which side the switch sits on. Settings rows put it on the right. */
  side?: "left" | "right";
  containerClassName?: string;
}

/**
 * Switch for settings that take effect immediately (use a Checkbox when the change waits for a Save button).
 * 46x28 track, 22px thumb, spring-tap thumb travel. On = accent fill. Keyboard: Space toggles.
 */
export function Switch({ label, description, side = "right", containerClassName, className, id, ...props }: SwitchProps) {
  const control = useFieldControl({ id, disabled: props.disabled, required: props.required, "aria-describedby": props["aria-describedby"] });
  const descriptionId = description && control.id ? `${control.id}-description` : undefined;

  const toggle = (
    <SwitchPrimitive.Root
      {...props}
      id={control.id}
      disabled={control.disabled}
      aria-describedby={[control["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined}
      className={cn(
        "fd-switch relative inline-flex h-7 w-[46px] shrink-0 items-center rounded-pill p-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-[22px] rounded-full bg-white shadow-rest transition-transform duration-(--fd-spring-tap-dur) ease-spring-tap data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );

  if (!label) return toggle;
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1.5 has-[:disabled]:cursor-not-allowed",
        side === "left" && "flex-row-reverse justify-end",
        containerClassName,
      )}
    >
      <span className="grid gap-0.5 text-body-sm">
        <span className="font-medium text-fg">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-caption text-fg-subtle">
            {description}
          </span>
        ) : null}
      </span>
      {toggle}
    </label>
  );
}
