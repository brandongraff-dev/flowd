"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { TierBadge, TIER_LABEL } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Progress, ProgressRing } from "@/components/ui";
import type { Remaining } from "@/lib/engine";
import type { Tier } from "@/lib/contract/types";
import type { TierView } from "@/lib/data/selectors";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A criterion's numbers in its own unit. */
function show(key: string, value: number): string {
  if (key === "lifetime_cleared") return formatMoney(value, { cents: "never" });
  if (key === "approval_rate") return formatPct(value, 0);
  if (key === "review") return value >= 1 ? "Done" : "Not yet";
  return String(Math.round(value));
}

export function Requirement({ item }: { item: Remaining }) {
  const manual = item.key === "review";
  return (
    <li className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn("grid size-6 shrink-0 place-items-center rounded-full", item.met ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-subtle")}
          >
            {item.met ? <Check className="size-3.5 stroke-[3]" /> : <span className="size-1.5 rounded-full bg-current" />}
          </span>
          <span className="text-body-sm font-semibold text-fg">{item.label}</span>
          <span className="sr-only">{item.met ? ". Met." : `. ${item.text}.`}</span>
        </div>
        <p className="shrink-0 text-body-sm text-fg-muted tabular-nums">
          {show(item.key, item.have)}
          {manual ? null : <span className="text-fg-subtle"> / {show(item.key, item.need)}</span>}
        </p>
      </div>
      {manual ? null : (
        <Progress
          size="sm"
          tone={item.met ? "mint" : "flow"}
          value={Math.min(item.have, item.need)}
          max={item.need}
          aria-label={item.label}
          valueText={item.met ? `${item.label}: met` : item.text}
        />
      )}
      <p className={cn("pl-[34px] text-caption", item.met ? "text-mint" : "text-fg-muted")}>{item.met ? "Met" : item.text}</p>
    </li>
  );
}

const BOTTLENECK_COPY: Record<string, string> = {
  lifetime_cleared: "Cleared earnings are the slowest part right now.",
  approved: "Approved posts are the slowest part right now.",
  approval_rate: "Your approval rate is the slowest part right now.",
  reliability: "Reliability is the slowest part right now.",
};

export function ProgressPanel({ view }: { view: TierView }) {
  const creator = view.creator;
  if (!creator) return null;
  const tier = creator.tier as Tier;
  const next = view.next as Tier | null;
  const numeric = view.remaining.filter((item) => item.key !== "review");
  const slowest = numeric.filter((item) => !item.met).sort((a, b) => a.have / Math.max(1, a.need) - b.have / Math.max(1, b.need))[0];
  const percent = Math.round(view.progress * 100);
  const justPromoted = view.history[0]?.kind === "promoted" && view.history[0].to_tier === tier;

  return (
    <GlassCard padding="lg" aria-labelledby="tier-progress-title" className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_auto_minmax(0,1fr)] lg:items-center lg:gap-10">
      <div className="grid justify-items-start gap-3">
        <TierBadge tier={tier} size={112} rankUp={justPromoted} decorative />
        <div className="grid gap-1">
          <p className="fd-eyebrow text-fg-subtle">Your tier</p>
          <h2 id="tier-progress-title" className="font-display text-display-sm text-fg">
            {TIER_LABEL[tier]}
          </h2>
          <p className="text-caption text-fg-subtle">
            {creator.tier_basis === "grace_hold" && view.grace ? `Held until ${formatDate(view.grace.until, "medium")}` : `Earned ${formatDate(creator.tier_since, "medium")}`}
          </p>
        </div>
        {view.grace ? (
          <Badge tone="sun" size="lg">
            {view.grace.days_left} days of grace left
          </Badge>
        ) : null}
      </div>

      {next ? (
        <div className="grid justify-items-center gap-3 text-center">
          <ProgressRing value={percent} size={148} thickness={13} aria-label={`Progress to ${TIER_LABEL[next]}`} valueText={`${percent}% of the way to ${TIER_LABEL[next]}`}>
            <span className="grid justify-items-center leading-none">
              <span className="font-display text-figure-lg tabular-nums">{percent}%</span>
              <span className="mt-1 text-caption font-medium text-fg-subtle">to {TIER_LABEL[next]}</span>
            </span>
          </ProgressRing>
          <p className="max-w-[18ch] text-caption text-fg-subtle">{slowest ? (BOTTLENECK_COPY[slowest.key] ?? "") : "Every number is met."}</p>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 text-center">
          <Sparkles aria-hidden="true" className="size-8 text-sun" />
          <p className="font-display text-title-sm text-fg">Top of the ladder</p>
        </div>
      )}

      <div className="grid gap-5">
        {next ? (
          <>
            <div className="grid gap-1">
              <h3 className="font-display text-title-md text-fg">What&rsquo;s missing for {TIER_LABEL[next]}</h3>
              <p className="text-body-sm text-fg-muted">Every number below counts finished, cleared work only. They are the same on iOS and the web.</p>
            </div>
            <ul className="grid gap-5">
              {view.remaining.map((item) => (
                <Requirement key={item.key} item={item} />
              ))}
            </ul>
          </>
        ) : (
          <div className="grid gap-2">
            <h3 className="font-display text-title-md text-fg">You&rsquo;re Elite</h3>
            <p className="text-body-sm text-fg-muted">Elite is reviewed by flowd every quarter. Keep delivering on time and your tier stays.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="secondary" size="sm">
            <Link href="/creator/feed">Find bounties</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/creator/academy">Raise your approval rate</Link>
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
