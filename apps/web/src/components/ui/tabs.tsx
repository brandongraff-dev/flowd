"use client";

import { createContext, useContext, useId, type ComponentPropsWithRef, type ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useControllableState } from "@/lib/hooks/use-controllable-state";

type TabsVariant = "segment" | "underline";

interface TabsContextValue {
  value: string;
  layoutId: string;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger / TabsList must be used inside <Tabs>.");
  return context;
}

export interface TabsProps extends Omit<ComponentPropsWithRef<typeof TabsPrimitive.Root>, "value" | "defaultValue" | "onValueChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * `segment`: a field-fill track with a morphing lens behind the active tab (pill, 36px). Use inside cards and on forms.
   * `underline`: text tabs with a morphing underline, for page and dashboard section navigation.
   */
  variant?: TabsVariant;
}

/**
 * Tabs with a morphing active indicator (a shared-layout `motion` element on the `snappy` spring; instant under reduced
 * motion). Radix handles roles, arrow keys, Home/End and automatic activation.
 *
 * ```tsx
 * <Tabs defaultValue="submissions">
 *   <TabsList aria-label="Bounty sections"><TabsTrigger value="submissions" count={14}>Submissions</TabsTrigger>…</TabsList>
 *   <TabsContent value="submissions">…</TabsContent>
 * </Tabs>
 * ```
 */
export function Tabs({ value, defaultValue, onValueChange, variant = "segment", children, ...props }: TabsProps) {
  const [current, setCurrent] = useControllableState<string>({ value, defaultValue: defaultValue ?? "", onChange: onValueChange });
  const layoutId = useId();
  return (
    <TabsContext value={{ value: current, layoutId: `tabs-${layoutId}`, variant }}>
      <TabsPrimitive.Root value={current} onValueChange={setCurrent} {...props}>
        {children}
      </TabsPrimitive.Root>
    </TabsContext>
  );
}

export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  const { variant } = useTabs();
  return (
    <TabsPrimitive.List
      className={cn(
        "scrollbar-none inline-flex max-w-full items-center overflow-x-auto",
        variant === "segment" ? "fd-seg-track gap-0.5 rounded-pill p-[3px]" : "w-full gap-1 border-b border-divider",
        className,
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends ComponentPropsWithRef<typeof TabsPrimitive.Trigger> {
  /** Trailing count (unread, in review). Tabular. */
  count?: ReactNode;
  icon?: ReactNode;
}

export function TabsTrigger({ value, count, icon, className, children, ...props }: TabsTriggerProps) {
  const { value: active, layoutId, variant } = useTabs();
  const selected = active === value;
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-1.5 font-semibold whitespace-nowrap select-none",
        "transition-colors duration-(--fd-dur-fast) ease-standard [&_svg]:size-4 [&_svg]:stroke-[1.75]",
        variant === "segment"
          ? "h-9 rounded-pill px-4 text-[14px] pointer-coarse:h-11"
          : "h-11 px-3 text-[15px] pointer-coarse:h-12",
        selected ? "text-fg" : "text-fg-muted hover:text-fg",
        className,
      )}
      {...props}
    >
      {selected ? (
        variant === "segment" ? (
          <motion.span
            layoutId={layoutId}
            transition={spring.snappy}
            className="fd-seg-lens absolute inset-0"
            style={{ borderRadius: 9999 }}
            aria-hidden="true"
          />
        ) : (
          <motion.span
            layoutId={layoutId}
            transition={spring.snappy}
            className="absolute inset-x-2 bottom-0 h-0.5 bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton)"
            style={{ borderRadius: 2 }}
            aria-hidden="true"
          />
        )
      ) : null}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {icon}
        {children}
        {count !== undefined ? (
          <span
            className={cn(
              "rounded-pill px-1.5 text-micro font-semibold tabular-nums",
              selected ? "bg-accent-solid text-on-accent" : "bg-surface-hover text-fg-muted",
            )}
          >
            {count}
          </span>
        ) : null}
      </span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-4", className)} {...props} />;
}
