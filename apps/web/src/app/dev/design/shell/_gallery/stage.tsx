"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Aurora } from "@/components/glass";

/**
 * A contained stage for specimens that need the aurora behind them (so glass has something to sample) and must NOT sit inside a
 * glass card (glass never samples glass: a nested L2 would flatten). Caption underneath.
 */
export function Stage({ caption, title, children, className, height }: { caption?: ReactNode; title?: string; children: ReactNode; className?: string; height?: number | string }) {
  return (
    <figure className="grid min-w-0 gap-3">
      {title ? <h3 className="font-display text-title-sm text-fg">{title}</h3> : null}
      <div className={cn("relative isolate overflow-hidden rounded-[32px] bg-bg shadow-[inset_0_0_0_1px_var(--fd-rim)]", className)} style={{ height }}>
        <Aurora variant="contained" drift={false} />
        <div className="relative size-full">{children}</div>
      </div>
      {caption ? <figcaption className="max-w-[70ch] text-caption text-fg-subtle">{caption}</figcaption> : null}
    </figure>
  );
}
