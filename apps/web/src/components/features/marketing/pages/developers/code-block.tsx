"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyIconButton } from "@/components/ui/copy-button";

/**
 * A tiny, dependency-free highlighter for the shell, JSON and JS snippets on the developer pages. It only wraps tokens in coloured spans (no HTML
 * strings), so the code is always plain text underneath and copies exactly as written. Colours are the AA-safe text tokens; the meaning
 * (a key, a string, a number) is also carried by position and punctuation, never by colour alone.
 */
const TOKEN = /("(?:\\.|[^"\\\n])*")(\s*:)?|(\/\/[^\n]*|#[^\n]*)|\b(\d+(?:\.\d+)?)\b|\b(true|false|null)\b|\b(POST|GET|PUT|PATCH|DELETE|curl|const|await|return|import|from)\b/g;

export function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push(code.slice(last, index));
    const [text, str, colon, comment, num, literal, word] = match;
    if (str !== undefined) {
      if (colon !== undefined) {
        out.push(
          <span key={key++} className="text-accent">
            {str}
          </span>,
          colon,
        );
      } else {
        out.push(
          <span key={key++} className="text-info">
            {str}
          </span>,
        );
      }
    } else if (comment !== undefined) {
      out.push(
        <span key={key++} className="text-fg-subtle italic">
          {comment}
        </span>,
      );
    } else if (num !== undefined) {
      out.push(
        <span key={key++} className="text-ember">
          {num}
        </span>,
      );
    } else if (literal !== undefined || word !== undefined) {
      out.push(
        <span key={key++} className="text-violet">
          {text}
        </span>,
      );
    } else {
      out.push(text);
    }
    last = index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export interface CodeBlockProps {
  /** The code, exactly as it should be copied. */
  code: string;
  /** A short label for the header ("curl", "JSON", "Response"). */
  label: string;
  className?: string;
  /** Skip the highlighter (plain output such as a log). */
  plain?: boolean;
}

/** A code window: a label, a copy button and the code on a sunken well. Scrolls sideways on a narrow screen instead of wrapping, so lines stay readable. */
export function CodeBlock({ code, label, className, plain = false }: CodeBlockProps) {
  return (
    <figure className={cn("grid min-w-0 overflow-hidden rounded-[22px] bg-bg-sunken shadow-[inset_0_0_0_1px_var(--fd-rim)]", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-divider py-1.5 pr-1.5 pl-4">
        <span className="font-mono text-caption font-medium text-fg-subtle">{label}</span>
        <CopyIconButton value={code} label={`Copy ${label} code`} />
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-code leading-relaxed text-fg-muted" tabIndex={0}>
        <code>{plain ? code : highlight(code)}</code>
      </pre>
    </figure>
  );
}
