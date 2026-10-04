import type { ComponentPropsWithRef, ReactNode } from "react";
import { Check, CircleAlert, CircleX, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineState = "done" | "active" | "upcoming" | "warning" | "error";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  /** A dated moment or ETA, always specific: "Fri 6:00 PM", "clears Sat 2:00 PM". Never a bare "soon". */
  time?: ReactNode;
  description?: ReactNode;
  state?: TimelineState;
  /** Replaces the state glyph. */
  icon?: ReactNode;
  /** Extra content under the description: a reason chip, a link, a mini table. */
  children?: ReactNode;
}

export interface TimelineProps extends Omit<ComponentPropsWithRef<"ol">, "children"> {
  items: readonly TimelineItem[];
  /** Tighter rows for sidebars and sheets. */
  compact?: boolean;
}

const NODE: Record<TimelineState, { box: string; glyph: ReactNode; label: string }> = {
  done: { box: "bg-mint-soft text-mint", glyph: <Check strokeWidth={2.5} />, label: "Done" },
  active: { box: "bg-info-soft text-info", glyph: <Clock strokeWidth={2.25} />, label: "In progress" },
  upcoming: { box: "bg-surface-field text-fg-subtle", glyph: null, label: "Upcoming" },
  warning: { box: "bg-ember-soft text-ember", glyph: <CircleAlert strokeWidth={2.25} />, label: "Needs attention" },
  error: { box: "bg-rose-soft text-rose", glyph: <CircleX strokeWidth={2.25} />, label: "Failed" },
};

/**
 * A vertical timeline for anything that has a sequence and dates: the Money Clock (window closes, fraud check, cleared, paid),
 * the review SLA, payout lifecycle, the view ledger. Every step carries a state glyph AND a spoken state, so colour is never
 * the only cue; the active step pulses once a second (still under reduced motion); the connector below a finished step
 * is solid, below an unfinished one it is a faint hairline. Server-renderable.
 */
export function Timeline({ items, compact = false, className, ...props }: TimelineProps) {
  return (
    <ol className={cn("grid", className)} {...props}>
      {items.map((item, index) => {
        const state = item.state ?? "upcoming";
        const spec = NODE[state];
        const last = index === items.length - 1;
        const nextDone = (items[index + 1]?.state ?? "upcoming") === "done" || state === "done";
        return (
          <li key={item.id} className={cn("grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3.5", compact ? "min-h-12" : "min-h-16")}>
            <div className="relative flex flex-col items-center">
              <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--fd-rim)] [&_svg]:size-4", spec.box)}>
                {item.icon ?? spec.glyph ?? <span aria-hidden="true" className="size-2 rounded-full bg-current opacity-70" />}
                {state === "active" ? <span aria-hidden="true" className="fd-pulse absolute inset-0 rounded-full text-info" /> : null}
              </span>
              {last ? null : <span aria-hidden="true" className={cn("mt-1 w-px flex-1 rounded-full", nextDone && state === "done" ? "bg-mint/60" : "bg-divider")} />}
            </div>
            <div className={cn("grid min-w-0 content-start gap-1", last ? "pb-0" : compact ? "pb-4" : "pb-6")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="text-body-sm font-semibold text-fg">
                  {item.title}
                  <span className="sr-only">{`. ${spec.label}.`}</span>
                </p>
                {item.time ? <p className="text-caption font-medium text-fg-muted tabular-nums">{item.time}</p> : null}
              </div>
              {item.description ? <p className="max-w-[56ch] text-caption text-fg-subtle">{item.description}</p> : null}
              {item.children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
