"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";
import { buttonVariants } from "./button-variants";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "color" | "children">,
    Pick<VariantProps<typeof buttonVariants>, "size"> {
  /** Accessible name. REQUIRED: an icon alone says nothing to a screen reader. */
  label: string;
  /** The icon element (lucide, e.g. `<Plus />`). Sized to 18px (16px at `xs`) with stroke 1.75 by the button. */
  icon: ReactNode;
  variant?: "secondary" | "glass" | "ghost" | "plain" | "primary" | "mint" | "ember" | "danger" | "destructive";
  /** Show the label as a tooltip (`true`), custom tooltip content, or none (`false`). Default true. */
  tooltip?: boolean | ReactNode;
  /** Optional shortcut shown in the tooltip, e.g. `["mod", "K"]`. */
  shortcut?: readonly string[];
  loading?: boolean;
  /** Force a visual state for documentation (/dev/design). Never use in product code. */
  "data-force"?: "hover" | "focus" | "active";
}

/**
 * Round icon-only button: 28/36/44/52 px square, hit area grown to 44px on touch. `label` is required and doubles as the
 * tooltip. Use `variant="plain"` in toolbars and `secondary` over content; `glass` only in floating hero contexts.
 */
export function IconButton({
  label,
  icon,
  variant = "secondary",
  size = "md",
  tooltip = true,
  shortcut,
  loading = false,
  type = "button",
  className,
  onClick,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading ? "" : undefined}
      className={cn(buttonVariants({ variant, size, iconOnly: true }), className)}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      <span className={cn("grid place-items-center", loading && "opacity-0")}>{icon}</span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  );

  const surface =
    variant === "glass" && !props.disabled ? (
      <Glass layer={2} asChild interactive>
        {button}
      </Glass>
    ) : (
      button
    );

  if (tooltip === false) return surface;
  return (
    <Tooltip content={tooltip === true ? label : tooltip} shortcut={shortcut}>
      {surface}
    </Tooltip>
  );
}
