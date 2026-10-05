import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export interface FillMeterProps {
  /** Money settled out of the pool (cents or any unit; it only needs to share a unit with the others). */
  settled: number;
  /** Money reserved for videos in review (shown hatched: real, but not settled yet). */
  reserved?: number;
  /** The whole pool. */
  total: number;
  /** Share of the bounty's time that has passed, 0 to 1. A tick marks it, so "ahead" and "behind" are visible at a glance. */
  time?: number;
  /** What the bar measures, for assistive tech ("Pool committed"). */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * A pool bar with a clock: the pool settled (solid), reserved for videos in review (hatched) and a tick where the calendar is. The words under
 * it say the same thing, so the bar is never the only way to read it. Server-renderable.
 */
export function FillMeter({ settled, reserved = 0, total, time, label, size = "md", className }: FillMeterProps) {
  const committed = total > 0 ? Math.min(1, (settled + reserved) / total) : 0;
  const text = `${Math.round(committed * 100)}% of the pool is committed${time !== undefined ? ` with ${Math.round(time * 100)}% of the time gone` : ""}`;
  return (
    <div className={cn("relative", className)}>
      <Progress value={settled} pending={reserved} max={Math.max(total, 1)} size={size} aria-label={label} valueText={text} tone="flow" />
      {time !== undefined ? (
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute w-0.5 -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_2px_var(--fd-surface)]", size === "sm" ? "-top-0.5 h-2.5" : size === "md" ? "-top-[3px] h-4" : "-top-1 h-5")}
          style={{ left: `${Math.min(Math.max(time, 0), 1) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
