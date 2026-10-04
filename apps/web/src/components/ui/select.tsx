"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { fieldVariants } from "./input";
import { menuItemClass, menuLabelClass, menuSeparatorClass, OverlaySurface } from "./overlay";

export interface SelectOption {
  /** Non-empty string (Radix reserves "" for clearing). */
  value: string;
  label: ReactNode;
  /** Second line in the menu (not shown in the trigger). */
  description?: ReactNode;
  /** Decorative icon before the label (shown in the trigger too). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Plain text for typeahead and the trigger when `label` is not a string. */
  textValue?: string;
}

export interface SelectGroupDef {
  label?: string;
  options: readonly SelectOption[];
}

export interface SelectProps {
  /** Flat options. Use `groups` for labelled sections. */
  options?: readonly SelectOption[];
  groups?: readonly SelectGroupDef[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  /** Icon before the value in the trigger. */
  leading?: ReactNode;
  className?: string;
  /** Match the menu width to the trigger (default) or let it size to its content. */
  menuWidth?: "trigger" | "auto";
  "data-force"?: "hover" | "focus";
}

/**
 * Select on a field surface with an L3 glass menu. Keyboard: arrows, type-ahead, Home/End, Escape. The trigger is a
 * real button, so <Field label> labels it and `aria-describedby` / `aria-invalid` are wired.
 *
 * ```tsx
 * <Select options={[{ value: "fitness", label: "Fitness" }]} placeholder="Pick a niche" onValueChange={setNiche} />
 * ```
 */
export function Select({
  options,
  groups,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select",
  size,
  invalid: invalidProp,
  disabled,
  required,
  name,
  leading,
  className,
  menuWidth = "trigger",
  "data-force": force,
  ...props
}: SelectProps) {
  const control = useFieldControl({ ...props, invalid: invalidProp, disabled, required });
  const sections: readonly SelectGroupDef[] = groups ?? [{ options: options ?? [] }];

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={control.disabled}
      required={control.required}
    >
      <SelectPrimitive.Trigger
        id={control.id}
        aria-label={props["aria-label"]}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        data-invalid={control.invalid ? "" : undefined}
        data-disabled={control.disabled ? "" : undefined}
        data-force={force}
        className={cn(
          fieldVariants({ size }),
          "cursor-pointer justify-between text-left text-base font-medium md:text-[15px]",
          // Radix SelectValue ignores className by design, so the value span (the only child with an inline style) is styled from here.
          "[&>span[style]]:min-w-0 [&>span[style]]:flex-1 [&>span[style]]:truncate [&>span[style]_svg]:size-[18px] [&>span[style]_svg]:stroke-[1.75]",
          "data-[placeholder]:[&>span[style]]:font-normal data-[placeholder]:[&>span[style]]:text-fg-subtle",
          className,
        )}
      >
        {leading ? (
          <span aria-hidden="true" className="flex shrink-0 text-fg-subtle [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">
            {leading}
          </span>
        ) : null}
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-base) ease-standard group-data-[state=open]:rotate-180" strokeWidth={1.75} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={8} collisionPadding={12} asChild>
          <OverlaySurface
            className={cn(
              "z-(--fd-z-popover) max-h-(--radix-select-content-available-height) overflow-hidden rounded-[20px]",
              menuWidth === "trigger" ? "w-(--radix-select-trigger-width)" : "min-w-(--radix-select-trigger-width)",
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-fg-muted">
              <ChevronUp aria-hidden="true" className="size-4" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1.5">
              {sections.map((section, index) => (
                <SelectPrimitive.Group key={section.label ?? index}>
                  {index > 0 ? <SelectPrimitive.Separator className={menuSeparatorClass} /> : null}
                  {section.label ? <SelectPrimitive.Label className={menuLabelClass}>{section.label}</SelectPrimitive.Label> : null}
                  {section.options.map((option) => (
                    <SelectItem key={option.value} {...option} />
                  ))}
                </SelectPrimitive.Group>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-fg-muted">
              <ChevronDown aria-hidden="true" className="size-4" />
            </SelectPrimitive.ScrollDownButton>
          </OverlaySurface>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** One row of a Select menu. Exposed for composition; `Select` renders these from `options`. */
export function SelectItem({ value, label, description, icon, disabled, textValue }: SelectOption) {
  return (
    <SelectPrimitive.Item value={value} disabled={disabled} textValue={textValue} className={cn(menuItemClass, "pr-9")}>
      <span className="grid gap-0.5">
        <SelectPrimitive.ItemText>
          <span className="inline-flex items-center gap-2">
            {icon ? (
              <span aria-hidden="true" className="inline-flex text-fg-muted">
                {icon}
              </span>
            ) : null}
            <span>{label}</span>
          </span>
        </SelectPrimitive.ItemText>
        {description ? <span className={cn("text-caption font-normal text-fg-subtle", icon && "pl-6")}>{description}</span> : null}
      </span>
      <SelectPrimitive.ItemIndicator className="absolute top-1/2 right-3 -translate-y-1/2">
        <Check aria-hidden="true" className="size-4 text-accent" strokeWidth={2.25} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export type SelectRootProps = ComponentPropsWithRef<typeof SelectPrimitive.Root>;
