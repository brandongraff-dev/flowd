import { Progress, type ProgressTone } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const TONE: Record<"high" | "medium" | "low", ProgressTone> = { high: "mint", medium: "accent", low: "ember" };
const WORD: Record<"high" | "medium" | "low", string> = { high: "High coverage", medium: "Medium coverage", low: "Low coverage" };

/**
 * The attribution coverage meter: the share of installs and trials that can be tied to the creator who earned them (a flowd link or code is
 * Tracked; the rest is Estimated and never pays a CPA bonus). The label says high, medium or low in words, so the bar is never the only cue.
 */
export function CoverageMeter({ share, label, className, compact = false }: { share: number; label: "high" | "medium" | "low"; className?: string; compact?: boolean }) {
  const pct = Math.round(share * 100);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-caption">
        <span className="font-medium text-fg-muted">{compact ? "Attribution" : "Attribution coverage"}</span>
        <span className="font-semibold text-fg tabular-nums">
          {pct}%<span className="ml-1.5 font-normal text-fg-subtle">{WORD[label]}</span>
        </span>
      </div>
      <Progress value={pct} tone={TONE[label]} size="sm" aria-label="Attribution coverage" valueText={`${pct}% of installs and trials can be tied to a creator. ${WORD[label]}.`} />
    </div>
  );
}
