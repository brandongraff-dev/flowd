import { seriesColor } from "@/components/charts";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HoldingsSegment {
  id: string;
  label: string;
  cents: number;
  /** Money that is real but not final (reserved for a video in review): drawn hatched, so it never rests on colour alone. */
  hatched?: boolean;
  hint?: string;
}

/**
 * Where the money is, as one stacked bar and a legend that says the same thing in words and cents. Segments are categorical by entity (fixed
 * order, never by size), 2px surface gaps between fills, a 4px rounded outer end. Server-renderable.
 */
export function HoldingsBar({ segments, label, className }: { segments: readonly HoldingsSegment[]; label: string; className?: string }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.cents), 0);
  const visible = segments.filter((segment) => segment.cents > 0);
  return (
    <div className={cn("grid gap-4", className)}>
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${formatMoney(s.cents, { cents: "auto" })}`).join(", ")}`}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-[6px] bg-surface-active"
      >
        {total === 0 ? null : visible.map((segment) => {
          const index = segments.findIndex((s) => s.id === segment.id);
          return (
            <span
              key={segment.id}
              className={cn("h-full min-w-[3px] first:rounded-l-[6px] last:rounded-r-[6px]", segment.hatched && "fd-hatched")}
              style={{ flexGrow: segment.cents, flexBasis: 0, backgroundColor: seriesColor(index) }}
            />
          );
        })}
      </div>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {segments.map((segment, index) => (
          <li key={segment.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5">
            <span
              aria-hidden="true"
              className={cn("mt-[5px] size-2.5 rounded-[3px]", segment.hatched && "fd-hatched")}
              style={{ backgroundColor: seriesColor(index) }}
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-caption text-fg-muted">{segment.label}</span>
              <span className="text-body-sm font-semibold text-fg tabular-nums">
                {formatMoney(segment.cents, { cents: "auto" })}
                {total > 0 ? <span className="ml-1.5 font-normal text-fg-subtle">{Math.round((segment.cents / total) * 100)}%</span> : null}
              </span>
              {segment.hint ? <span className="text-micro text-fg-subtle">{segment.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
