"use client";

import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";
import { buttonVariants } from "./button-variants";
import { Spinner } from "./spinner";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "color">, Omit<VariantProps<typeof buttonVariants>, "iconOnly"> {
  /** Render onto the single child (a link) instead of a `<button>`. Loading and icons are not applied. */
  asChild?: boolean;
  /**
   * Busy state: the label stays in place (invisible, so the width never jumps), a spinner replaces it, clicks are ignored
   * and `aria-busy` is set. The button stays focusable, so keyboard users do not lose their place.
   */
  loading?: boolean;
  /** Icon before the label (lucide, 18px, stroke 1.75 are applied by the button). */
  leadingIcon?: ReactNode;
  /** Icon after the label. */
  trailingIcon?: ReactNode;
  /** Force a visual state for documentation (/dev/design). Never use in product code. */
  "data-force"?: "hover" | "focus" | "active";
}

/**
 * The flowd button. Pill-shaped, 28/36/44/52 px, scales to 0.96 on press-down, focus ring from the global
 * `:focus-visible` rule, never `disabled` while loading (so focus is kept) and always typed `button` unless told otherwise.
 */
export function Button({
  variant,
  size,
  asChild = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  type = "button",
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const body = (
    <>
      <span className={cn("inline-flex items-center justify-center gap-[inherit]", loading && "opacity-0")}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </>
  );

  const button = (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading ? "" : undefined}
      className={classes}
      onClick={handleClick}
      {...props}
    >
      {body}
    </button>
  );

  // Real glass: the L2 material on the button element itself (pointer sheen, rim, blur).
  if (variant === "glass" && !disabled) {
    return (
      <Glass layer={2} asChild interactive>
        {button}
      </Glass>
    );
  }
  return button;
}
