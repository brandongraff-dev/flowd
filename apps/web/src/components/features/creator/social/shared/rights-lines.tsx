import { AlertTriangle, Check } from "lucide-react";
import type { RightsLine } from "@/lib/engine";
import { cn } from "@/lib/utils";

export interface RightsLinesProps {
  lines: readonly RightsLine[];
  /** One plain sentence for people who want the short version. */
  summary?: string;
  className?: string;
}

/**
 * A Rights Card as rows: what you are agreeing to, line by line, with the lines worth reading twice marked in words as well as colour
 * ("Read twice"). Organic posting is always included; paid ads, exclusivity and renewals are priced up front.
 */
export function RightsLines({ lines, summary, className }: RightsLinesProps) {
  return (
    <div className={cn("grid gap-3", className)}>
      {summary ? <p className="text-body-sm text-pretty text-fg-muted">{summary}</p> : null}
      <dl className="grid divide-y divide-divider overflow-hidden rounded-xl bg-surface-field">
        {lines.map((line) => (
          <div key={line.id} className="grid gap-0.5 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-baseline sm:gap-4">
            <dt className="flex items-center gap-2 text-body-sm text-fg-muted">
              {line.notable ? <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-sun" /> : <Check aria-hidden="true" className="size-4 shrink-0 text-mint" />}
              {line.label}
            </dt>
            <dd className={cn("text-body-sm font-semibold sm:text-right", line.notable ? "text-sun" : "text-fg")}>
              {line.value}
              {line.notable ? <span className="sr-only">. Read twice.</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
