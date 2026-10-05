"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Panel } from "../common";
import type { RankedAction } from "./rank-next-actions";

/**
 * Ranked next best actions: what to do next and why, one tap each. The ranking is a transparent rule set over your queue, setup and results (it
 * says so), and every line that quotes a number names its sample.
 */
export function NextActions({ loading, actions }: { loading: boolean; actions: readonly RankedAction[] }) {
  return (
    <Panel
      title="Next best actions"
      description="Ranked from your queue, setup and results."
      actions={<Sparkles aria-hidden="true" className="size-4 text-violet" strokeWidth={1.9} />}
    >
      {loading ? (
        <SkeletonGroup label="Loading next actions" className="grid gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton shape="text" className="w-3/5" />
              <Skeleton shape="text" className="h-3 w-full" />
            </div>
          ))}
        </SkeletonGroup>
      ) : actions.length === 0 ? (
        <p className="rounded-[20px] bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          Nothing to suggest right now. New suggestions appear as your queue, wallet and results change.
        </p>
      ) : (
        <ol className="grid gap-3">
          {actions.map((action, index) => (
            <li key={action.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <span aria-hidden="true" className="mt-0.5 grid size-6 place-items-center rounded-full bg-surface-active font-display text-caption font-bold text-fg-muted tabular-nums">
                {index + 1}
              </span>
              <div className="grid min-w-0 gap-1.5">
                <p className="text-body-sm font-semibold text-fg">{action.title}</p>
                <p className="text-caption text-fg-muted">{action.detail}</p>
                <div>
                  <Link href={action.href} className={buttonVariants({ variant: "secondary", size: "xs" })}>
                    {action.cta}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
