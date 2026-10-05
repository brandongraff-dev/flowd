"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { ScoreRing } from "@/components/charts";
import { scoreHookText } from "@/lib/engine";
import { cn } from "@/lib/utils";

export interface HookCheckerProps {
  /** The hook line being written. */
  text: string;
  /** Ring diameter in px (default 112). */
  size?: number;
  className?: string;
}

/**
 * A live Hook Score for one line of text: the ring, the checklist items that passed and the ones that did not, each with its reason and
 * the one fix worth making. It is the engine's text checklist (the same one behind the free Hook Score tool), so it says so: a checklist
 * score, not a prediction.
 */
export function HookChecker({ text, size = 112, className }: HookCheckerProps) {
  const result = useMemo(() => scoreHookText(text), [text]);
  const blank = text.trim().length === 0;
  return (
    <div className={cn("grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start", className)}>
      <ScoreRing name="Hook Score" score={result.score} size={size} className="justify-self-center sm:justify-self-start" caption={blank ? "Type your hook" : undefined} />
      <div className="grid gap-3">
        <ul className="grid gap-2" aria-label="Hook checklist">
          {result.items.map((item) => (
            <li key={item.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-2.5 text-body-sm">
              <span aria-hidden="true" className={cn("mt-0.5 grid size-5 place-items-center rounded-full", item.passed && !blank ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-subtle")}>
                {item.passed && !blank ? <Check className="size-3 stroke-[3]" /> : <X className="size-3 stroke-[3]" />}
              </span>
              <span className="grid gap-0.5">
                <span className="font-medium text-fg">{item.label}</span>
                {blank ? null : <span className="text-caption text-fg-subtle">{item.passed ? item.reason : (item.fix ?? item.reason)}</span>}
              </span>
              <span className="text-caption font-semibold text-fg-muted tabular-nums">
                {blank ? item.max : item.points}/{item.max}
              </span>
            </li>
          ))}
        </ul>
        {result.capped ? <p className="rounded-lg bg-rose-soft px-3 py-2 text-caption font-medium text-rose">A risky claim caps this hook. Brands can&rsquo;t approve guaranteed-income or cure language.</p> : null}
      </div>
    </div>
  );
}
