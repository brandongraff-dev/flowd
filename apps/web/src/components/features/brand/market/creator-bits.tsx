"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { ArtAvatar, PlatformGlyph, TierBadge } from "@/components/brand";
import { Badge } from "@/components/ui";
import { NICHE_META, type Creator, type Niche, type Platform } from "@/lib/contract/types";
import type { ReliabilityView } from "@/lib/engine";
import { formatCompact, formatCostPer, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Avatar, handle, tier and name in one block: the creator everywhere in this area. */
export function CreatorIdentity({
  creator,
  size = 44,
  href,
  showTier = true,
  className,
}: {
  creator: Pick<Creator, "handle" | "display_name" | "avatar" | "tier" | "verification_status">;
  size?: number;
  /** Link the name (the profile). */
  href?: string;
  showTier?: boolean;
  className?: string;
}) {
  const handle = (
    <span className="truncate font-semibold text-fg">
      @{creator.handle}
    </span>
  );
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <ArtAvatar art={creator.avatar} name={creator.display_name} size={size} decorative />
      <div className="grid min-w-0 gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-body-sm">
          {href ? (
            <Link href={href} className="min-w-0 truncate rounded-sm hover:underline after:absolute after:inset-0 after:content-['']">
              {handle}
            </Link>
          ) : (
            handle
          )}
          {creator.verification_status === "verified" ? <BadgeCheck aria-label="ID verified" className="size-4 shrink-0 text-accent" strokeWidth={2} /> : null}
          {showTier ? <TierBadge tier={creator.tier} size={20} decorative className="shrink-0" /> : null}
        </div>
        <p className="truncate text-caption text-fg-subtle">{creator.display_name}</p>
      </div>
    </div>
  );
}

/** The reliability score with what it means: a verdict fills the bar, a range (under five finished decisions) is hatched and says "Building history". */
export function ReliabilityMeter({ view, className }: { view: ReliabilityView | undefined; className?: string }) {
  if (!view) {
    return <p className={cn("text-caption text-fg-subtle", className)}>No finished work yet</p>;
  }
  const range = view.kind === "range";
  const start = range ? view.low : 0;
  const width = range ? Math.max(view.high - view.low, 4) : view.score;
  const text = range ? `${view.low} to ${view.high}` : String(view.score);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption font-medium text-fg-muted">Reliability</span>
        <span className="font-display text-figure-sm font-semibold text-fg tabular-nums">{text}</span>
      </div>
      <div
        role="meter"
        aria-label="Reliability"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={range ? Math.round((view.low + view.high) / 2) : view.score}
        aria-valuetext={range ? `Building history, between ${view.low} and ${view.high}` : `${view.score} out of 100`}
        className="relative h-1.5 overflow-hidden rounded-pill bg-surface-active"
      >
        <span className={cn("absolute inset-y-0 rounded-pill bg-accent-solid", range && "fd-hatched opacity-80")} style={{ left: `${start}%`, width: `${width}%` }} />
      </div>
      {range ? <p className="text-micro text-fg-subtle">Building history. Shown as a range until five posts are decided.</p> : null}
    </div>
  );
}

/** Platforms the creator has connected, with followers on the biggest one. */
export function PlatformRow({ platforms, className }: { platforms: readonly Platform[]; className?: string }) {
  if (platforms.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-1.5", className)} role="group" aria-label="Connected platforms">
      {platforms.map((platform) => (
        <PlatformGlyph key={platform} platform={platform} size={22} />
      ))}
    </div>
  );
}

/** Up to `max` niche pills; the rest collapse into "+N". */
export function NichePills({ niches, max = 3, className }: { niches: readonly Niche[]; max?: number; className?: string }) {
  const shown = niches.slice(0, max);
  const extra = niches.length - shown.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((niche) => (
        <Badge key={niche} size="md" tone="neutral">
          {NICHE_META[niche].label}
        </Badge>
      ))}
      {extra > 0 ? (
        <Badge size="md" tone="neutral" aria-label={`${extra} more niches`}>
          +{extra}
        </Badge>
      ) : null}
    </div>
  );
}

/** A labelled figure for a stat row: caption above, the number below. */
export function Fact({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-0.5", className)}>
      <dt className="truncate text-caption text-fg-subtle">{label}</dt>
      <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{children}</dd>
      {hint ? <dd className="text-micro text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}

/** "$3.40 per trial" or the honest "No tracked trials yet": never a $0 for a creator who has not been measured. */
export function costPerTrialText(cents: number | null): string {
  return formatCostPer(cents, "trial");
}

/** "From $140 per video", or a plain dash for a creator who takes no direct offers. */
export function priceFromText(cents: number | undefined, accepts: boolean): string {
  if (cents === undefined || !accepts) return "Not taking direct offers";
  return `${formatMoney(cents, { cents: "never" })} per video`;
}

export const compactViews = (views: number): string => (views > 0 ? formatCompact(views) : "none yet");
