"use client";

import type { ReactNode } from "react";
import { CopyIconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A code or config block with a copy button. Mono type is for code only (never money). The block scrolls sideways inside its own box, so a
 * long line never widens the page, and it is focusable so keyboard users can scroll it.
 */
export function CodeBlock({ code, label, language, title, className, footer }: { code: string; label: string; language?: string; title?: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <figure className={cn("grid min-w-0 gap-2", className)}>
      {title ? <figcaption className="text-body-sm font-medium text-fg">{title}</figcaption> : null}
      <div className="relative overflow-hidden rounded-xl bg-bg-sunken shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <div className="flex items-center justify-between gap-2 border-b border-divider px-3.5 py-1.5">
          <span className="text-micro font-medium tracking-wide text-fg-subtle uppercase">{language ?? "Text"}</span>
          <CopyIconButton value={code} label={`Copy ${label}`} copiedLabel="Copied" size="sm" />
        </div>
        <pre tabIndex={0} aria-label={label} className="relative max-h-80 overflow-auto p-4 font-mono text-code leading-relaxed text-fg">
          <code>{code}</code>
        </pre>
      </div>
      {footer ? <div className="text-caption text-fg-subtle">{footer}</div> : null}
    </figure>
  );
}
