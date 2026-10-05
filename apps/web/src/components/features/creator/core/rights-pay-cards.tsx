"use client";

import { Check, Info, TriangleAlert } from "lucide-react";
import type { RightsCard } from "@/lib/contract/types";
import type { RightsLine } from "@/lib/engine";
import { formatMoney } from "@/lib/format";
import { GlassCard } from "@/components/glass";
import { RangeBar } from "@/components/charts";
import { Badge, Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Amount } from "./amount";

/**
 * The Rights Card, in plain language: what you keep, what the brand may do and for how long. Lines that cost you something or limit you are marked
 * "Read twice". Snapshotted when you submit, so a later edit never changes the licence on a video you already sent.
 */
export function RightsCardView({ card, lines, summary, className }: { card: RightsCard; lines: readonly RightsLine[]; summary: string; className?: string }) {
  const notable = lines.some((l) => l.notable);
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fd-eyebrow text-fg-subtle">Rights Card</h2>
        <Badge tone={card.paid_ads_days > 0 || card.exclusivity_days > 0 ? "sun" : "mint"} size="md">
          {card.paid_ads_days > 0 ? `Paid ads ${card.paid_ads_days} days` : "Organic only"}
        </Badge>
      </div>
      <p className="text-body-sm text-fg">{summary}</p>
      <dl className="grid divide-y divide-divider rounded-2xl bg-surface-field px-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        {lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-2.5">
            <dt className="text-caption text-fg-muted">{line.label}</dt>
            <dd className="text-right text-caption font-semibold text-fg">
              {line.notable ? <span className="mr-1.5 text-micro font-semibold text-sun">Read twice</span> : null}
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex items-start gap-2 text-caption text-fg-subtle">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        {notable ? "Read the lines marked above before you make a take. " : ""}
        Your licence is saved when you submit. Later edits to the bounty never change it.
      </p>
    </GlassCard>
  );
}

export interface PayMathProps {
  /** The bounty's category-wide Pay Math (p25 / median / p75 per video). */
  math: { p25_cents: number; median_cents: number; p75_cents: number; expected_views_median: number; creator_cpm_cents: number; basis: string };
  /** What this creator would earn (their own account's views), when it is known. */
  mine?: { p25: number; median: number; p75: number } | null;
  perVideoCapCents: number;
  className?: string;
}

/**
 * Pay Math: what a video here pays at the 25th percentile, the median and the 75th, and what that means for you. The median is as prominent as any
 * high example, always. It is an estimate from the category's views, says so, and never promises approval.
 */
export function PayMathCard({ math, mine, perVideoCapCents, className }: PayMathProps) {
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fd-eyebrow text-fg-subtle">Pay Math</h2>
        <Tooltip content="A checklist estimate from the median views in this category. Results vary and approval is not guaranteed.">
          <button type="button" className="inline-flex items-center gap-1 rounded-sm text-micro font-semibold text-fg-subtle underline decoration-dotted underline-offset-2">
            Estimate
          </button>
        </Tooltip>
      </div>

      {mine ? (
        <div className="grid gap-1">
          <p className="text-caption font-medium text-fg-muted">For you, per video</p>
          <Amount cents={mine.median} size="xl" state="neutral" decimals="never" note="median" />
          <p className="text-caption text-fg-muted">
            Middle half: {formatMoney(mine.p25, { cents: "never" })} to {formatMoney(mine.p75, { cents: "never" })}. Based on your linked accounts' median views.
          </p>
        </div>
      ) : null}

      <RangeBar low={math.p25_cents} median={math.median_cents} high={math.p75_cents} label="Typical creator in this category" format={(v) => formatMoney(v, { cents: "never" })} />
      <dl className="grid grid-cols-3 gap-3 text-center">
        {(
          [
            ["Lower", math.p25_cents],
            ["Median", math.median_cents],
            ["Higher", math.p75_cents],
          ] as const
        ).map(([label, cents]) => (
          <div key={label} className={cn("grid gap-0.5 rounded-xl py-2", label === "Median" ? "bg-surface-active" : "bg-surface-field")}>
            <dt className="text-micro text-fg-subtle">{label}</dt>
            <dd className="font-display text-figure-md text-fg tabular-nums">{formatMoney(cents, { cents: "never" })}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-fg-muted">
        About {math.expected_views_median.toLocaleString("en-US")} verified views at the median, so about {formatMoney(math.creator_cpm_cents)} per 1,000 views blended. {math.basis.replace(/\.$/, "")}.
      </p>
      <p className="flex items-start gap-2 text-caption text-fg-subtle">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        Pay is capped at {formatMoney(perVideoCapCents, { cents: "never" })} per video. A video that is not approved earns nothing.
      </p>
    </GlassCard>
  );
}

export function ScamShieldCues({ funded, verifiedBrand, className }: { funded: boolean; verifiedBrand: boolean; className?: string }) {
  const cues = [
    { ok: funded, label: "Fully funded", detail: "The pool is in escrow. An approved video is paid even if the pool empties." },
    { ok: true, label: "Chat stays in flowd", detail: "Offers and messages happen in the app. Leave if anyone asks you to move to another app." },
    { ok: true, label: "Free to join", detail: "flowd never asks a creator to pay to join, apply or unlock a bounty." },
    { ok: verifiedBrand, label: "Verified business", detail: verifiedBrand ? "This brand passed flowd's business check." : "This brand has not finished the business check yet." },
  ];
  return (
    <GlassCard className={cn("grid gap-3", className)}>
      <h2 className="fd-eyebrow text-fg-subtle">Scam Shield</h2>
      <ul className="grid gap-2.5">
        {cues.map((cue) => (
          <li key={cue.label} className="flex items-start gap-2.5">
            <span aria-hidden="true" className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", cue.ok ? "bg-mint-soft text-mint" : "bg-sun-soft text-sun")}>
              {cue.ok ? <Check className="size-3" strokeWidth={3} /> : <TriangleAlert className="size-3" strokeWidth={2.5} />}
            </span>
            <span className="grid gap-0.5">
              <span className="text-body-sm font-semibold text-fg">
                {cue.label}
                <span className="sr-only">{cue.ok ? ", yes" : ", not yet"}</span>
              </span>
              <span className="text-caption text-fg-muted">{cue.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
