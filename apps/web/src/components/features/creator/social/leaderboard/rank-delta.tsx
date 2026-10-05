import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeRankChange } from "./board-math";

export interface RankDeltaProps {
  /** Change since last week: positive = moved up. */
  delta: number;
  className?: string;
}

/**
 * Rank-delta chip: an arrow, a number and a screen-reader sentence, so the change never rests on colour. Up is mint (it is progress
 * toward earnings); down and flat are quiet ink, because a slow week is not a failure and nothing here is a demotion.
 */
export function RankDelta({ delta, className }: RankDeltaProps) {
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? ChevronUp : down ? ChevronDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-9 items-center justify-center gap-0.5 rounded-pill px-1.5 text-micro font-semibold tabular-nums",
        up ? "bg-mint-soft text-mint" : "bg-surface-hover text-fg-subtle",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 stroke-[2.25]" />
      {delta !== 0 ? <span aria-hidden="true">{Math.abs(delta)}</span> : null}
      <span className="sr-only">{describeRankChange(delta)}</span>
    </span>
  );
}
