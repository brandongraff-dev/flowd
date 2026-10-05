import { FileText } from "lucide-react";
import type { RightsLine } from "@/lib/engine";
import { cn } from "@/lib/utils";

/**
 * The Rights Card in plain language, as rows. Anything that costs the creator something or restricts them (paid ads, exclusivity) is marked
 * "Read twice" in words, never by colour alone. Server-renderable.
 */
export function RightsCardList({ lines, summary, className }: { lines: readonly RightsLine[]; summary?: string; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      <h3 className="flex items-center gap-2 text-body-sm font-semibold text-fg">
        <FileText aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
        Rights Card
      </h3>
      <dl className="grid gap-px overflow-hidden rounded-xl bg-divider">
        {lines.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between gap-4 bg-surface-field px-3.5 py-2.5 text-body-sm">
            <dt className="text-fg-muted">{line.label}</dt>
            <dd className="text-right font-medium text-fg">
              {line.value}
              {line.notable ? <span className="ml-1.5 text-micro font-semibold text-sun">Read twice</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {summary ? <p className="text-caption text-fg-subtle">{summary}</p> : null}
    </div>
  );
}
