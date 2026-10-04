import type { ComponentPropsWithRef, ReactNode } from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends Omit<ComponentPropsWithRef<typeof SeparatorPrimitive.Root>, "children"> {
  /**
   * Text in the middle of a horizontal rule ("or", "Today"). The label is real content, so the separator then becomes
   * a labelled divider for assistive tech (not decorative).
   */
  label?: ReactNode;
}

/**
 * A hairline in `divider` colour. Decorative by default (hidden from assistive tech); pass `decorative={false}` when it
 * separates regions a screen-reader user should know about. With `label` it becomes "—— or ——".
 */
export function Separator({ orientation = "horizontal", decorative = true, label, className, ...props }: SeparatorProps) {
  if (label && orientation === "horizontal") {
    return (
      <div role="separator" aria-orientation="horizontal" className={cn("flex items-center gap-3 text-caption text-fg-subtle", className)}>
        <span aria-hidden="true" className="h-px flex-1 bg-divider" />
        <span>{label}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-divider" />
      </div>
    );
  }
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn("shrink-0 bg-divider", orientation === "horizontal" ? "h-px w-full" : "h-full min-h-4 w-px self-stretch", className)}
      {...props}
    />
  );
}
