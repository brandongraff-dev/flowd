"use client";

import { useRef, type ComponentPropsWithRef, type PointerEvent, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useMergedRef } from "@/lib/hooks/use-merged-ref";
import { useFieldControl } from "./field";

/**
 * Field surface recipes (Input, Textarea, Select trigger). Material in styles/glass.css (`.fd-field`): a fill, not more
 * glass, so it sits on L1/L3 without breaking the stacking rule. 16px text on mobile so iOS Safari never zooms.
 */
export const fieldVariants = cva("fd-field group relative flex w-full items-center gap-2.5 text-fg", {
  variants: {
    size: {
      sm: "min-h-9 rounded-md px-3",
      md: "min-h-11 rounded-lg px-4",
      lg: "min-h-13 rounded-lg px-4",
    },
  },
  defaultVariants: { size: "md" },
});

const CONTROL_TEXT =
  "min-w-0 flex-1 self-stretch bg-transparent font-medium text-fg placeholder:font-normal placeholder:text-fg-subtle outline-none disabled:cursor-not-allowed disabled:text-fg-disabled text-base md:text-[15px]";

export interface InputProps extends Omit<ComponentPropsWithRef<"input">, "size" | "prefix">, VariantProps<typeof fieldVariants> {
  /** Icon or short text before the value (a "$", a search glyph). Decorative: hidden from assistive tech. */
  leading?: ReactNode;
  /** Content after the value (a unit, a clear button, a status icon). Interactive children are allowed. */
  trailing?: ReactNode;
  /** Force the invalid look. Normally set by the surrounding <Field error>. */
  invalid?: boolean;
  /** Classes for the outer field surface (the `className` prop goes to the <input>). */
  containerClassName?: string;
  /** Force a visual state for documentation (/dev/design). Never use in product code. */
  "data-force"?: "hover" | "focus";
}

/**
 * Text input on a field surface (44px default; 36 and 52 also). Wrap in <Field> for label, hint, error and wiring.
 * Mobile-safe 16px text, medium weight on glass, placeholder in `fg-subtle` (AA).
 */
export function Input({
  size,
  leading,
  trailing,
  invalid: invalidProp,
  containerClassName,
  className,
  ref,
  type = "text",
  "data-force": force,
  ...props
}: InputProps) {
  const control = useFieldControl({ ...props, invalid: invalidProp });
  const inputRef = useRef<HTMLInputElement>(null);
  const merged = useMergedRef<HTMLInputElement>(inputRef, ref);

  // Clicking the padding or the leading glyph focuses the input, like a native control.
  const focusOnPress = (event: PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target === inputRef.current || target.closest("button, a, [role='button']")) return;
    event.preventDefault();
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(fieldVariants({ size }), containerClassName)}
      data-invalid={control.invalid ? "" : undefined}
      data-disabled={control.disabled ? "" : undefined}
      data-force={force}
      onPointerDown={focusOnPress}
    >
      {leading ? (
        <span aria-hidden="true" className="flex shrink-0 items-center text-fg-subtle [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">
          {leading}
        </span>
      ) : null}
      <input
        ref={merged}
        type={type}
        {...props}
        id={control.id}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        required={control.required}
        disabled={control.disabled}
        className={cn(CONTROL_TEXT, className)}
      />
      {trailing ? <span className="flex shrink-0 items-center gap-1 text-fg-subtle [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">{trailing}</span> : null}
    </div>
  );
}
