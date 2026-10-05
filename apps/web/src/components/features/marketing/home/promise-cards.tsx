import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import type { PromiseMetric } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { DemoTag } from "@/components/shell/demo-banner";
import { PROMISES, type PromiseCopy } from "./promise-data";

/** A ratio metric as a bar with its target tick, and a word for whether it is on target. Counts and hours are just the sentence. */
function Proof({ metric }: { metric: PromiseMetric | undefined }) {
  if (!metric) return <p className="text-body-sm text-fg-subtle">Proof metric loading from the ledger.</p>;
  const isRatio = metric.unit === "ratio";
  const onTarget = metric.target === undefined ? null : metric.value >= metric.target;
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {onTarget === null ? null : onTarget ? (
          <Badge size="sm" tone="mint" icon={<CircleCheck />}>
            On target
          </Badge>
        ) : (
          <Badge size="sm" tone="ember" icon={<TriangleAlert />}>
            Below target
          </Badge>
        )}
        {metric.target !== undefined && isRatio ? <span className="text-caption text-fg-subtle tabular-nums">Target {Math.round(metric.target * 100)}%</span> : null}
      </div>
      <p className="font-display text-title-md text-fg tabular-nums">{metric.display}</p>
      {isRatio ? (
        <div className="relative h-2 rounded-pill bg-surface-active" role="img" aria-label={`${metric.display}${metric.target !== undefined ? `, target ${Math.round(metric.target * 100)}%` : ""}`}>
          <span className={cn("absolute inset-y-0 left-0 rounded-pill", onTarget === false ? "bg-ember-solid" : "bg-mint-solid")} style={{ width: `${Math.min(100, Math.max(0, metric.value * 100))}%` }} />
          {metric.target !== undefined ? <span aria-hidden="true" className="absolute -top-1 h-4 w-0.5 rounded-full bg-fg" style={{ left: `${Math.min(100, metric.target * 100)}%` }} /> : null}
        </div>
      ) : null}
      <p className="text-caption text-pretty text-fg-subtle">{metric.note}</p>
    </div>
  );
}

function PromiseCard({ promise, metric }: { promise: PromiseCopy; metric: PromiseMetric | undefined }) {
  return (
    <li id={`promise-${promise.number}`} className="scroll-mt-28">
      <GlassCard padding="none" className="grid overflow-hidden rounded-[32px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft font-display text-title-md font-bold text-accent tabular-nums">
              {promise.number}
            </span>
            <h3 className="text-title-lg text-fg">{promise.title}</h3>
          </div>
          <p className="text-body text-pretty text-fg">{promise.commitment}</p>
          <div className="grid gap-1.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="fd-eyebrow text-fg-subtle">If we miss it</p>
            <p className="text-body-sm text-pretty text-fg-muted">{promise.ifMissed}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {promise.features.map((feature) => (
              <Badge key={feature} tone="neutral" variant="outline">
                {feature}
              </Badge>
            ))}
            <Link href={promise.href} className="inline-flex min-h-8 items-center gap-1 text-body-sm font-semibold text-accent hover:underline pointer-coarse:min-h-11">
              See the feature
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
        <div className="grid content-start gap-3 border-t border-divider bg-surface-field/50 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="fd-eyebrow text-fg-subtle">Live proof</p>
            <DemoTag>Demo data</DemoTag>
          </div>
          <Proof metric={metric} />
        </div>
      </GlassCard>
    </li>
  );
}

/** The 11 commitments, each with its live public metric, what happens if it is missed and where the feature is explained. */
export function PromiseCards({ metrics }: { metrics: readonly PromiseMetric[] }) {
  const byNumber = new Map(metrics.map((metric) => [metric.number, metric]));
  return (
    <ol className="grid gap-5">
      {PROMISES.map((promise) => (
        <PromiseCard key={promise.number} promise={promise} metric={byNumber.get(promise.number)} />
      ))}
    </ol>
  );
}
