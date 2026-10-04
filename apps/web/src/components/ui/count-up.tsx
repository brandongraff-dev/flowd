"use client";

import { useRef, type ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useCountUp, type CountUpOptions } from "@/lib/hooks/use-count-up";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export interface CountUpProps extends Omit<ComponentPropsWithRef<"span">, "children">, CountUpOptions {
  /** The number to show. Change it and the figure springs to the new value. */
  value: number;
  /** Turn the live number into text (default: whole number with thousands separators). Must be pure and cheap. */
  format?: (value: number) => string;
  /**
   * Announce the new value to screen readers, once per change and politely (the rolling digits themselves are hidden).
   * Default false so a page of stat tiles does not chatter; turn it on for the one figure a person is waiting on (wallet).
   */
  announce?: boolean;
}

/**
 * A number that counts to its value on the `smooth` spring: tabular figures (no width jitter), interruptible, and a
 * calm mint wash instead of a roll under reduced motion. For money use `<Money animate>` (it formats cents and keeps
 * the pending/cleared styling); use this for views, installs and other counts.
 *
 * ```tsx
 * <CountUp value={views} className="text-figure-xl font-display" animateOnMount />
 * ```
 */
export function CountUp({ value, format = (v) => whole.format(v), announce = false, from, animateOnMount, disabled, restDelta, className, ...props }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useCountUp(ref, value, { from, animateOnMount, disabled, restDelta });
  return (
    <span ref={ref} className={cn("rounded-md tabular-nums", className)} {...props}>
      <span aria-hidden={announce || undefined}>{format(shown)}</span>
      {announce ? (
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {format(value)}
        </span>
      ) : null}
    </span>
  );
}
