"use client";

import { createContext, useContext, type ComponentPropsWithRef, type ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionVariant = "plain" | "card";

const VariantContext = createContext<AccordionVariant>("plain");

type SingleProps = Omit<ComponentPropsWithRef<typeof AccordionPrimitive.Root>, "type"> & { type?: "single"; collapsible?: boolean };
type MultipleProps = Omit<ComponentPropsWithRef<typeof AccordionPrimitive.Root>, "type" | "collapsible"> & { type: "multiple" };

export type AccordionProps = (SingleProps | MultipleProps) & {
  /**
   * `plain`: hairline-separated rows (FAQ, settings groups). `card`: each item is its own field-fill tile
   * (a fill, not glass, so it sits on L1 without breaking the stacking rule).
   */
  variant?: AccordionVariant;
};

/**
 * Accordion: arrow keys move between headers, Home/End jump, Enter/Space toggle (Radix). Opening grows the panel over
 * 240 ms (height + opacity); under reduced motion it just appears. Defaults to `type="single"` and collapsible.
 *
 * ```tsx
 * <Accordion defaultValue="fees">
 *   <AccordionItem value="fees"><AccordionTrigger>What does flowd cost?</AccordionTrigger>
 *   <AccordionContent>Free plan: 12% on bounty spend. Creators are always free.</AccordionContent></AccordionItem>
 * </Accordion>
 * ```
 */
export function Accordion({ variant = "plain", className, ...props }: AccordionProps) {
  const rootProps = (props.type === "multiple" ? props : { collapsible: true, ...props, type: "single" as const }) as ComponentPropsWithRef<typeof AccordionPrimitive.Root>;
  return (
    <VariantContext value={variant}>
      <AccordionPrimitive.Root {...rootProps} className={cn(variant === "card" ? "grid gap-2" : "grid", className)} />
    </VariantContext>
  );
}

export function AccordionItem({ className, ...props }: ComponentPropsWithRef<typeof AccordionPrimitive.Item>) {
  const variant = useContext(VariantContext);
  return (
    <AccordionPrimitive.Item
      className={cn(
        variant === "card"
          ? "rounded-xl bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-shadow duration-(--fd-dur-fast) data-[state=open]:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]"
          : "border-b border-divider last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export interface AccordionTriggerProps extends ComponentPropsWithRef<typeof AccordionPrimitive.Trigger> {
  /** Small text under the title, visible while collapsed (a count, a summary). */
  description?: ReactNode;
  /** Leading icon (lucide). */
  icon?: ReactNode;
}

export function AccordionTrigger({ className, children, description, icon, ...props }: AccordionTriggerProps) {
  const variant = useContext(VariantContext);
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex min-h-12 flex-1 items-center gap-3 text-left text-body-sm font-semibold text-fg",
          "rounded-xl outline-offset-[-2px] transition-colors duration-(--fd-dur-fast) ease-standard",
          variant === "card" ? "px-4 py-3" : "py-3.5",
          "pointer-coarse:min-h-14",
          className,
        )}
        {...props}
      >
        {icon ? <span className="grid shrink-0 text-fg-muted [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">{icon}</span> : null}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span>{children}</span>
          {description ? <span className="text-caption font-normal text-fg-subtle">{description}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-[18px] shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-base) ease-emphasized group-data-[state=open]:rotate-180"
          strokeWidth={1.75}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: ComponentPropsWithRef<typeof AccordionPrimitive.Content>) {
  const variant = useContext(VariantContext);
  return (
    <AccordionPrimitive.Content className="fd-accordion-content overflow-hidden" {...props}>
      <div className={cn("text-body-sm text-fg-muted", variant === "card" ? "px-4 pb-4" : "pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
