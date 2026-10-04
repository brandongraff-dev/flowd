"use client";

import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export type ProgressTone = "flow" | "mint" | "accent" | "ember" | "rose" | "neutral";

/**
 * Fills. Light theme swaps to the deeper ends of each ramp so the bar clears 3:1 against its track (non-text contrast);
 * dark theme keeps the luminous brand gradients. The value is always printed next to the bar as well.
 */
const FILL: Record<ProgressTone, string> = {
  flow: "bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton)",
  mint: "bg-[linear-gradient(90deg,var(--fd-mint-solid),var(--fd-info-solid))]",
  accent: "bg-accent-solid",
  ember: "bg-(image:--fd-gradient-ember) light:bg-[linear-gradient(90deg,var(--fd-ember-solid),var(--fd-rose-solid))]",
  rose: "bg-rose-solid",
  neutral: "bg-fg-subtle",
};

const HEIGHT = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

export interface ProgressProps extends Omit<ComponentPropsWithRef<typeof ProgressPrimitive.Root>, "value" | "children"> {
  /** Completed amount, 0 to `max`. `null` = indeterminate (an endless sweep; static under reduced motion). */
  value: number | null;
  max?: number;
  /**
   * A second, hatched segment that starts where `value` ends: money that is real but not yet cleared ("pending").
   * The hatching carries the state without colour or transparency.
   */
  pending?: number;
  tone?: ProgressTone;
  size?: keyof typeof HEIGHT;
  /** REQUIRED unless `aria-labelledby` is given: what is progressing ("Pool left", "Upload"). */
  "aria-label"?: string;
  /** Text read by screen readers instead of the percentage ("$1,240 of $5,000 left"). */
  valueText?: string;
  /** A caption row above the bar: label on the left, `trailing` on the right (a figure). */
  label?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Linear progress. The fill is a transform (not a width), so it animates on the compositor and keeps rounded ends; it
 * grows over 480 ms on the `emphasized` curve and retargets from where it is when the value changes mid-way.
 *
 * ```tsx
 * <Progress value={68} tone="mint" aria-label="Pool left" valueText="$3,400 of $5,000 left" />
 * <Progress value={cleared} pending={pendingAmt} max={total} tone="mint" aria-label="Earned this week" />
 * ```
 */
export function Progress({
  value,
  max = 100,
  pending,
  tone = "flow",
  size = "md",
  valueText,
  label,
  trailing,
  className,
  ...props
}: ProgressProps) {
  const known = value !== null;
  const done = known ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  const wait = known && pending ? Math.min(Math.max(pending / max, 0), 1) * 100 : 0;
  const waitEnd = Math.min(done + wait, 100);

  return (
    <div className={cn("grid gap-2", className)}>
      {label || trailing ? (
        <div className="flex items-baseline justify-between gap-3 text-caption">
          <span className="font-medium text-fg-muted">{label}</span>
          <span className="font-semibold text-fg tabular-nums">{trailing}</span>
        </div>
      ) : null}
      <ProgressPrimitive.Root
        value={known ? Math.min(Math.max(value, 0), max) : null}
        max={max}
        getValueLabel={valueText ? () => valueText : undefined}
        className={cn("fd-track relative w-full overflow-hidden rounded-pill bg-surface-active", HEIGHT[size])}
        {...props}
      >
        {wait > 0 ? (
          <div
            aria-hidden="true"
            className="fd-hatched absolute inset-0 rounded-pill bg-info transition-[clip-path] duration-(--fd-dur-slower) ease-emphasized"
            style={{ clipPath: `inset(0 ${100 - waitEnd}% 0 ${done}%)` }}
          />
        ) : null}
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-pill",
            FILL[tone],
            known
              ? "w-full transition-transform duration-(--fd-dur-slower) ease-emphasized"
              : "w-2/5 motion-reduce:w-full motion-reduce:opacity-40",
          )}
          style={known ? { transform: `translateX(-${100 - done}%)` } : { animation: "fd-indeterminate 1.4s var(--fd-ease-in-out) infinite" }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}

export interface ProgressRingProps {
  /** 0 to `max`. */
  value: number;
  max?: number;
  /** Diameter in px (default 72). */
  size?: number;
  /** Stroke width in px (default 7). */
  thickness?: number;
  tone?: ProgressTone;
  /** Centre content: a percentage, a score, an icon. Keep it short. */
  children?: ReactNode;
  /** REQUIRED: what the ring measures ("Pool left"). */
  "aria-label": string;
  valueText?: string;
  className?: string;
}

function ringStroke(tone: ProgressTone, uid: string): string {
  switch (tone) {
    case "flow":
      return `url(#${uid}-flow)`;
    case "mint":
      return `url(#${uid}-money)`;
    case "ember":
      return `url(#${uid}-ember)`;
    case "accent":
      return "var(--fd-accent-bright)";
    case "rose":
      return "var(--fd-rose-solid)";
    default:
      return "var(--fd-fg-subtle)";
  }
}

/**
 * Circular progress: one Flow-gradient ring (never Apple's three), round caps, a quiet track. The sweep animates the
 * dash offset over 480 ms on the `emphasized` curve. A figure in the centre is the point; the ring is the supporting cast.
 */
export function ProgressRing({ value, max = 100, size = 72, thickness = 7, tone = "flow", valueText, children, className, ...props }: ProgressRingProps) {
  const uid = `fd-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText}
      aria-label={props["aria-label"]}
      className={cn(
        "relative inline-grid shrink-0 place-items-center",
        // ring stops: luminous ramp steps in dark, deeper steps in light (3:1 against the track)
        "[--ring-a:var(--fd-ultraviolet-500)] [--ring-b:var(--fd-azure-500)] [--ring-c:var(--fd-lagoon-500)] [--ring-mint-a:var(--fd-mint-400)] [--ring-mint-b:var(--fd-lagoon-400)] [--ring-ember-a:var(--fd-sun-500)] [--ring-ember-b:var(--fd-ember-500)] [--ring-ember-c:var(--fd-rose-500)]",
        "light:[--ring-a:var(--fd-ultraviolet-600)] light:[--ring-b:var(--fd-azure-600)] light:[--ring-c:var(--fd-lagoon-700)] light:[--ring-mint-a:var(--fd-mint-600)] light:[--ring-mint-b:var(--fd-lagoon-600)] light:[--ring-ember-a:var(--fd-ember-600)] light:[--ring-ember-b:var(--fd-ember-600)] light:[--ring-ember-c:var(--fd-rose-600)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <defs>
          <linearGradient id={`${uid}-flow`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ring-a)" />
            <stop offset="0.52" stopColor="var(--ring-b)" />
            <stop offset="1" stopColor="var(--ring-c)" />
          </linearGradient>
          <linearGradient id={`${uid}-money`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ring-mint-a)" />
            <stop offset="1" stopColor="var(--ring-mint-b)" />
          </linearGradient>
          <linearGradient id={`${uid}-ember`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ring-ember-a)" />
            <stop offset="0.55" stopColor="var(--ring-ember-b)" />
            <stop offset="1" stopColor="var(--ring-ember-c)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fd-surface-active)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringStroke(tone, uid)}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: "stroke-dashoffset var(--fd-dur-slower) var(--fd-ease-emphasized)" }}
        />
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center font-display font-bold text-fg tabular-nums">{children}</div> : null}
    </div>
  );
}
