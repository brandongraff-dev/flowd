"use client";

import { useState, type ChangeEvent, type ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { fieldVariants } from "./input";

export interface TextareaProps extends Omit<ComponentPropsWithRef<"textarea">, "size"> {
  /** Force the invalid look. Normally set by the surrounding <Field error>. */
  invalid?: boolean;
  /** Show a `n / maxLength` counter bottom-right (needs `maxLength`). */
  showCount?: boolean;
  /** Grow with the content (`field-sizing: content`; falls back to a fixed `rows` height in browsers without it). */
  autoGrow?: boolean;
  /** Classes for the outer field surface (the `className` prop goes to the <textarea>). */
  containerClassName?: string;
  "data-force"?: "hover" | "focus";
}

/** Multi-line input on a field surface. 16px text on mobile, 3 rows by default, optional counter and auto-grow. */
export function Textarea({
  invalid: invalidProp,
  showCount,
  autoGrow,
  containerClassName,
  className,
  rows = 3,
  maxLength,
  onChange,
  "data-force": force,
  ...props
}: TextareaProps) {
  const control = useFieldControl({ ...props, invalid: invalidProp });
  const [length, setLength] = useState<number>(() => String(props.value ?? props.defaultValue ?? "").length);
  const count = props.value !== undefined ? String(props.value).length : length;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setLength(event.target.value.length);
    onChange?.(event);
  };

  return (
    <div
      className={cn(fieldVariants({ size: "md" }), "h-auto items-start py-3", containerClassName)}
      data-invalid={control.invalid ? "" : undefined}
      data-disabled={control.disabled ? "" : undefined}
      data-force={force}
    >
      <textarea
        rows={rows}
        maxLength={maxLength}
        {...props}
        id={control.id}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        required={control.required}
        disabled={control.disabled}
        onChange={handleChange}
        style={autoGrow ? { minHeight: `${rows * 1.5}rem`, ...props.style } : props.style}
        className={cn(
          "w-full min-w-0 flex-1 resize-none bg-transparent text-base leading-6 font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:text-fg-disabled md:text-[15px]",
          autoGrow && "[field-sizing:content] max-h-72",
          showCount && maxLength ? "pb-5" : "",
          className,
        )}
      />
      {showCount && maxLength ? (
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute right-4 bottom-2.5 text-micro tabular-nums", count >= maxLength ? "text-rose" : "text-fg-subtle")}
        >
          {count} / {maxLength}
        </span>
      ) : null}
    </div>
  );
}
