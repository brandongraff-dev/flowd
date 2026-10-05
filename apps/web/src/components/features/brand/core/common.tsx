"use client";

import { useCallback, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Tooltip } from "@/components/ui/tooltip";

// ── state in the URL ───────────────────────────────────────────────────────────────────────────

/**
 * One piece of page state kept in the URL (`?range=30d`, `?tab=settings`), so a view is linkable and the back button works. Unknown values fall
 * back to `fallback`. Setting the fallback removes the parameter, so default views keep a clean URL. Needs a Suspense boundary above it.
 */
export function useUrlParam<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get(key);
  const value = (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  const set = useCallback(
    (next: T): void => {
      const query = new URLSearchParams(params.toString());
      if (next === fallback) query.delete(key);
      else query.set(key, next);
      const text = query.toString();
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [fallback, key, params, pathname, router],
  );
  return [value, set];
}

/** The date range of an overview: 7, 30 or 90 days. */
export const RANGES = ["7d", "30d", "90d"] as const;
export type RangeKey = (typeof RANGES)[number];
export const RANGE_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;
export const rangeLabel = (range: RangeKey): string => (range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days");

// ── building blocks ────────────────────────────────────────────────────────────────────────────

export interface PanelProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Right of the heading: a link, a small control. */
  actions?: ReactNode;
  /** Heading level (default 2). */
  level?: 2 | 3;
  padding?: "sm" | "md" | "lg";
}

/**
 * A titled L1 card: an H2, an optional line of context and an action, then the content. The quiet container for every list, meter and chart on
 * the dashboard pages, so spacing and heading rhythm stay identical from page to page.
 */
export function Panel({ title, description, actions, level = 2, padding = "md", className, children, ...props }: PanelProps) {
  const id = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <GlassCard as="section" padding={padding} aria-labelledby={id} className={cn("grid min-w-0 content-start gap-4", className)} {...props}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="grid min-w-0 gap-0.5">
          <Heading id={id} className="font-display text-title-sm text-fg">
            {title}
          </Heading>
          {description ? <p className="text-caption text-fg-subtle">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
      {children}
    </GlassCard>
  );
}

/** A quiet "View all" style link for a panel header. */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "plain", size: "xs" }), "-mr-2 text-fg-muted")}>
      {children}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

const SOURCE_COPY = {
  tracked: { label: "Tracked", tip: "Counted from a flowd link or offer code. CPA bonuses pay only on tracked results.", Icon: BadgeCheck },
  estimated: { label: "Estimated", tip: "Modelled from store, survey or platform data. Shown for context and never used to pay a bonus.", Icon: Gauge },
} as const;

/**
 * The honesty chip beside any conversion figure: Tracked (a flowd link or code counted it, CPA pays on it) or Estimated (modelled, never pays).
 * The tooltip says which, in a sentence; the label never depends on colour.
 */
export function SourceChip({ kind, className }: { kind: keyof typeof SOURCE_COPY; className?: string }) {
  const copy = SOURCE_COPY[kind];
  const Icon = copy.Icon;
  return (
    <Tooltip content={copy.tip}>
      <span tabIndex={0} className={cn("inline-flex rounded-pill outline-offset-2", className)}>
        <Badge tone={kind === "tracked" ? "accent" : "neutral"} variant={kind === "tracked" ? "soft" : "outline"} size="sm" icon={<Icon aria-hidden="true" />}>
          {copy.label}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** A label and a value stacked, for dense facts inside a card ("Budget left" / "$1,240"). */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-0.5", className)}>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-body-sm font-semibold text-fg tabular-nums">{children}</dd>
    </div>
  );
}
