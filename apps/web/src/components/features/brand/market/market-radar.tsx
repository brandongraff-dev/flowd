"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Music, ShieldAlert } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { GlassCard } from "@/components/glass";
import { Section } from "@/components/shell";
import { Badge, Callout, Chip, ChipGroup, EmptyState, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";
import { CATEGORY_META, TREND_KIND_META, type Category, type TrendDirection, type TrendKind } from "@/lib/contract/types";
import { useStoreReady, useTrends } from "@/lib/data";
import type { TrendView } from "@/lib/data/selectors/market";
import { pluralise } from "@/lib/format";
import { useQueryParams } from "./use-query-state";

const PARAMS = { kind: "", scope: "" } as const;
const KINDS: readonly { value: TrendKind; label: string }[] = [
  { value: "format", label: "Formats" },
  { value: "hook", label: "Hooks" },
  { value: "topic", label: "Topics" },
  { value: "sound", label: "Sounds" },
];

const GROUPS: readonly { direction: TrendDirection; title: string; blurb: string; icon: typeof ArrowUpRight }[] = [
  { direction: "rising", title: "Rising", blurb: "Use grew week on week. Brief these early, before the market catches up.", icon: ArrowUpRight },
  { direction: "steady", title: "Steady", blurb: "Reliable and not crowded by novelty. Safe to build on.", icon: Minus },
  { direction: "fading", title: "Fading", blurb: "Use is falling. Expect tired audiences, so refresh the idea or skip it.", icon: ArrowDownRight },
];

function TrendCard({ trend }: { trend: TrendView }) {
  const Arrow = trend.direction === "rising" ? ArrowUpRight : trend.direction === "fading" ? ArrowDownRight : Minus;
  return (
    <GlassCard as="article" padding="md" aria-label={trend.label} className="grid content-start gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <Badge size="sm" tone="neutral" className="w-fit">
            {TREND_KIND_META[trend.kind].label}
          </Badge>
          <h3 className="font-display text-title-sm text-fg">{trend.label}</h3>
        </div>
        <div className="grid shrink-0 justify-items-end gap-1">
          <p className="inline-flex items-center gap-1 text-body-sm font-semibold text-fg tabular-nums">
            <Arrow aria-hidden="true" className="size-4" strokeWidth={2.25} />
            {trend.change_copy}
          </p>
          <Sparkline data={trend.sparkline} tone="neutral" height={28} className="w-20" label={`${trend.label}, usage over eight weeks`} />
        </div>
      </div>
      <p className="text-body-sm text-fg-muted">{trend.description}</p>
      <p className="text-caption text-fg-subtle">
        <span className="font-medium text-fg-muted">Why it works. </span>
        {trend.why_it_works}
      </p>
      {trend.kind === "sound" && trend.sound_licensed_for_ads === false ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-field p-2.5 text-caption text-fg-muted">
          <ShieldAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-sun" strokeWidth={1.75} />
          Not licensed for ads. Fine for organic posts, but flagged if you promote the video.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-subtle">
        <span className="tabular-nums">{pluralise(trend.sample_posts, "post")} seen</span>
        <span>{trend.categories.slice(0, 2).map((category) => CATEGORY_META[category].label).join(" · ")}</span>
      </div>
      {trend.kind === "format" || trend.kind === "hook" ? (
        <Link href="/brand/bounties/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Brief this {trend.kind}
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </GlassCard>
  );
}

/**
 * Market Radar: what is rising and fading in app ads right now. The data is flowd's own settled winners plus public top ads, shown with
 * neutral ink and arrows (a rising trend is neither good nor bad for a brand, it is an opportunity or a risk).
 */
export function MarketRadar({ category }: { category: Category }) {
  const ready = useStoreReady();
  const { values, set } = useQueryParams(PARAMS);
  const kind = KINDS.find((entry) => entry.value === values.kind)?.value;
  const mine = values.scope !== "all";
  const trends = useTrends({ ...(kind ? { kind } : {}), ...(mine ? { category } : {}) });

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the radar" className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-56" />
        ))}
      </SkeletonGroup>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup aria-label="What to show">
          <Chip size="sm" selected={!kind} onSelectedChange={() => set({ kind: null })}>
            Everything
          </Chip>
          {KINDS.map((entry) => (
            <Chip key={entry.value} size="sm" selected={kind === entry.value} onSelectedChange={(on) => set({ kind: on ? entry.value : null })}>
              {entry.label}
            </Chip>
          ))}
        </ChipGroup>
        <span className="hidden h-5 w-px bg-divider sm:block" aria-hidden="true" />
        <ChipGroup aria-label="Scope">
          <Chip size="sm" selected={mine} onSelectedChange={() => set({ scope: null })}>
            {CATEGORY_META[category].label}
          </Chip>
          <Chip size="sm" selected={!mine} onSelectedChange={() => set({ scope: "all" })}>
            All categories
          </Chip>
        </ChipGroup>
      </div>

      {trends.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="chart"
            title="Nothing trending here yet"
            description="The radar needs settled posts and public ads in this category. Try all categories."
            action={
              <Chip selected={false} onSelectedChange={() => set({ scope: "all" })}>
                Show all categories
              </Chip>
            }
          />
        </GlassCard>
      ) : (
        GROUPS.map((group) => {
          const items = trends.filter((trend) => trend.direction === group.direction);
          if (items.length === 0) return null;
          const Icon = group.icon;
          return (
            <Section
              key={group.direction}
              title={
                <span className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={2} />
                  {group.title}
                  <span className="text-body-sm font-normal text-fg-subtle tabular-nums">{items.length}</span>
                </span>
              }
              description={group.blurb}
            >
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((trend) => (
                  <li key={trend.id} className="grid">
                    <TrendCard trend={trend} />
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}

      <Callout tone="neutral" icon={<Music />} title="How to read the radar">
        Weekly change is the share of sampled ads using a format, hook, topic or sound compared with the week before. It shows momentum, not quality: check Hooks and Creative library for what converts for your app.
      </Callout>
    </div>
  );
}
