"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Money } from "@/components/ui/money";
import { CountUp } from "@/components/ui/count-up";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline, type SparklineTone } from "@/components/charts/sparkline";
import { formatCompact, formatWhole } from "@/components/charts/format";
import { formatDelta } from "./delta-format";


export interface DeltaProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Change as a ratio against the comparison period: 0.124 is +12.4%. */
  ratio: number;
  /** What it is compared with, always named: "vs prior 30 days". A bare delta says nothing. */
  against: string;
  /** Is up the good direction? Cost per trial: `down`. Drives the signal tone for creators only. */
  goodWhen?: "up" | "down";
  /**
   * Who is looking. Brands see neutral ink and arrows (the arrow and the sign carry direction; colour carries nothing),
   * creators see mint for favourable money and rose for unfavourable (BRAND.md 6.8, DECISIONS section 5).
   */
  audience?: "brand" | "creator";
  /** Digits after the point (default 1). */
  digits?: number;
}

/**
 * A signed change with an arrow, versus a NAMED period. Direction is carried by the arrow and the sign; the tone only
 * signals good or bad for creators. Screen readers hear it in words ("up 12.4 percent versus prior 30 days").
 */
export function Delta({ ratio, against, goodWhen = "up", audience = "brand", digits = 1, className, ...props }: DeltaProps) {
  const flat = Math.abs(ratio * 100) < 0.05;
  const up = ratio > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const favourable = flat ? null : up === (goodWhen === "up");
  const tone = audience === "creator" && favourable !== null ? (favourable ? "text-mint" : "text-rose") : "text-fg-muted";
  const spoken = flat ? "no change" : `${up ? "up" : "down"} ${Math.abs(ratio * 100).toFixed(digits)} percent`;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-caption", className)} {...props}>
      <span className="sr-only">{`${spoken} ${against}`}</span>
      <span aria-hidden="true" className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", tone)}>
        <Icon className="size-3.5 self-center" strokeWidth={2.25} />
        {formatDelta(ratio, digits)}
      </span>
      <span aria-hidden="true" className="text-fg-subtle">
        {against}
      </span>
    </span>
  );
}

export interface StatCardProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** Sentence case, no trailing colon: "Verified views". */
  label: string;
  /** A number (counts up on change) or any node (a `<Money/>`, a rate). For money pass `cents` instead. */
  value?: number | ReactNode;
  /** Integer cents: renders `<Money>` (tabular Bricolage, state glyph, counts on change). */
  cents?: number;
  /** Money state for `cents`: creators `cleared`/`pending`, brands `neutral` (spend) or `escrow`. */
  moneyState?: "neutral" | "cleared" | "pending" | "paid" | "escrow" | "negative";
  /** Format for a numeric `value` (default: whole numbers, compact from 100,000). */
  format?: (value: number) => string;
  delta?: Omit<DeltaProps, "audience"> | null;
  /** 12 points, oldest first. */
  spark?: readonly number[];
  sparkTone?: SparklineTone;
  /** A line under the figure: "3 posts · next clears Sat 2:00 PM". */
  hint?: ReactNode;
  icon?: ReactNode;
  audience?: "brand" | "creator";
  /** `lg` (default) is the tile figure; `xl` is the one hero figure a view leads with. */
  size?: "lg" | "xl";
  loading?: boolean;
  /** Makes the whole card a link (a stretched link with the card's label as its name). */
  href?: string;
}

function defaultFormat(value: number): string {
  return Math.abs(value) >= 100_000 ? formatCompact(value) : formatWhole(value);
}

/**
 * The stat tile contract (dataviz): label (sentence case), value (counts on change, tabular), an optional delta against a named
 * period, and an optional 12-point sparkline in the de-emphasis hue with the current period in the accent. One quiet L1
 * card; the number is the hero, the chart is the supporting cast. Loading is a skeleton in the same shape.
 */
export function StatCard({
  label,
  value,
  cents,
  moneyState = "neutral",
  format = defaultFormat,
  delta,
  spark,
  sparkTone,
  hint,
  icon,
  audience = "brand",
  size = "lg",
  loading = false,
  href,
  className,
  ...props
}: StatCardProps) {
  const figureClass = cn("font-display", size === "xl" ? "text-figure-xl" : "text-figure-lg", "text-fg");
  const tone: SparklineTone = sparkTone ?? (audience === "creator" && cents !== undefined ? "mint" : "accent");
  return (
    <GlassCard
      padding="md"
      aria-busy={loading || undefined}
      className={cn("relative grid min-w-0 content-start gap-3 transition-shadow duration-(--fd-dur-base) ease-standard", href && "hover:shadow-raised", className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-caption font-medium text-fg-muted">
          {icon ? <span aria-hidden="true" className="grid shrink-0 place-items-center text-fg-subtle [&_svg]:size-4 [&_svg]:stroke-[1.75]">{icon}</span> : null}
          <span className="truncate">{label}</span>
        </p>
      </div>

      {loading ? (
        <div className="grid gap-3" role="status" aria-label={`Loading ${label}`}>
          <Skeleton className={cn("w-2/3", size === "xl" ? "h-12" : "h-9")} />
          <Skeleton shape="text" className="w-1/2" />
          {spark ? <Skeleton className="h-9 w-full" /> : null}
        </div>
      ) : (
        <>
          <div className="min-w-0">
            {cents !== undefined ? (
              <Money cents={cents} size={size} state={moneyState} animate icon={moneyState === "neutral" ? false : true} decimals="auto" />
            ) : typeof value === "number" ? (
              <CountUp value={value} format={format} className={figureClass} />
            ) : (
              <div className={figureClass}>{value}</div>
            )}
          </div>
          {delta ? <Delta {...delta} audience={audience} /> : null}
          {spark ? <Sparkline data={spark} tone={tone} height={size === "xl" ? 52 : 40} className="mt-1" label={`${label}, trend`} /> : null}
          {hint ? <p className="text-caption text-fg-subtle">{hint}</p> : null}
        </>
      )}
      {href ? (
        <Link href={href} aria-label={label} className="absolute inset-0 rounded-[inherit]">
          <span className="sr-only">{label}</span>
        </Link>
      ) : null}
    </GlassCard>
  );
}

export interface KpiRowProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** Columns at xl (default 4). Below it the row is two columns, then one under 420px. */
  columns?: 2 | 3 | 4;
  children: ReactNode;
}

const COLUMNS = { 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" } as const;

/** A row of stat cards: one column on phones, two from 420px, then `columns` at xl. All cards share a height. */
export function KpiRow({ columns = 4, className, children, ...props }: KpiRowProps) {
  return (
    <div className={cn("grid gap-4 min-[420px]:grid-cols-2", columns === 3 ? "lg:grid-cols-3" : "", COLUMNS[columns], className)} {...props}>
      {children}
    </div>
  );
}
