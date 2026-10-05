import { cn } from "@/lib/utils";

export interface PositionStripProps {
  /** Creators on the board. */
  size: number;
  /** Your 1-based rank, or undefined when you are not on this board. */
  rank?: number;
  /** The top N are the promotion zone (cohort boards). */
  promotion: number;
  className?: string;
}

/**
 * One dot per creator on the board, best first: the promotion zone in mint, you as a ringed dot. It shows at a glance how close the
 * line is. The strip is decorative to the eye and described in one sentence for assistive tech.
 */
export function PositionStrip({ size, rank, promotion, className }: PositionStripProps) {
  const label =
    rank === undefined
      ? `${size} creators on this board`
      : promotion > 0
        ? `You are number ${rank} of ${size}. The top ${promotion} move up a cohort.`
        : `You are number ${rank} of ${size}.`;
  return (
    <div role="img" aria-label={label} className={cn("flex items-center gap-[3px]", className)}>
      {Array.from({ length: size }, (_, index) => {
        const place = index + 1;
        const mine = rank === place;
        const inZone = place <= promotion;
        return (
          <span
            key={place}
            aria-hidden="true"
            className={cn(
              "h-6 min-w-0 flex-1 rounded-full transition-colors duration-(--fd-dur-base) ease-standard",
              mine
                ? "bg-accent-bright shadow-[0_0_0_2px_var(--fd-bg),0_0_0_4px_var(--fd-accent-bright),0_0_18px_var(--fd-accent-bright)]"
                : inZone
                  ? "bg-mint-solid/70"
                  : "bg-surface-active",
            )}
            style={mine ? { height: "2rem", flexGrow: 1.6 } : undefined}
          />
        );
      })}
    </div>
  );
}
