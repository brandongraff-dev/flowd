"use client";

import { useRef } from "react";
import Link from "next/link";
import { CalendarRange, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, EmptyState, Select } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import type { Tier } from "@/lib/contract/types";
import { useMe, useStoreReady, useWrapped } from "@/lib/data";
import { formatCompact, formatMoney } from "@/lib/format";
import { SocialSkeleton } from "../shared/skeletons";
import { useUrlParam } from "../shared/use-url-param";
import { SharePanel } from "./share-panel";
import { StoryViewer } from "./story-viewer";

export function WrappedView() {
  const ready = useStoreReady();
  const me = useMe();
  const [id, setId] = useUrlParam<string>("id", null, "");
  const wrapped = useWrapped(id || undefined);
  const shareRef = useRef<HTMLDivElement>(null);

  if (!ready) return <SocialSkeleton label="Loading Wrapped" layout="hero" />;

  const selected = wrapped.selected;
  const months = wrapped.all.filter((item) => item.period === "month");
  const hasYear = wrapped.all.some((item) => item.period === "year");

  if (!selected) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <PageHeader eyebrow="Look back" title="Wrapped" description="A monthly story of what you cleared, what worked and where you stand, with the typical creator beside it." />
        <GlassCard padding="lg">
          <EmptyState
            art="chart"
            title="Your first Wrapped is waiting on a month"
            description="Wrapped is built from cleared earnings and verified views. Once you have cleared money in a calendar month, the recap appears on the 1st."
            action={
              <Button asChild variant="primary">
                <Link href="/creator/feed">Find a bounty</Link>
              </Button>
            }
          />
        </GlassCard>
      </div>
    );
  }

  const tier = selected.tier as Tier;
  const handle = me.creator?.handle ?? "creator";
  const focusShare = (): void => {
    shareRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    shareRef.current?.querySelector<HTMLElement>("button, [role=radio]")?.focus({ preventScroll: true });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Look back"
        title="Wrapped"
        description="Your month as a story: what cleared, what worked, and where you stand. The typical creator is on it too, so no number travels alone."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              aria-label="Recap"
              size="sm"
              value={selected.id}
              onValueChange={setId}
              options={months.map((item) => ({ value: item.id, label: item.label }))}
              leading={<CalendarRange />}
              className="w-52"
            />
            <Badge tone="neutral" size="lg">
              {hasYear ? "Year recap ready" : "Year recap in December"}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-14">
        <StoryViewer key={selected.id} wrapped={selected} onShare={focusShare} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <GlassCard className="grid gap-5" aria-labelledby="recap-facts">
            <div className="grid gap-1">
              <h2 id="recap-facts" className="font-display text-title-md text-fg">
                {selected.label} in numbers
              </h2>
              <p className="text-body-sm text-fg-muted">The same figures as the story, in one place.</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-subtle">Cleared</dt>
                <dd className="font-display text-figure-lg text-mint tabular-nums">{formatMoney(selected.total_cleared_cents)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-subtle">Typical for {tier} (median)</dt>
                <dd className="font-display text-figure-lg text-fg tabular-nums">{formatMoney(selected.tier_median_cents)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-subtle">Verified views</dt>
                <dd className="font-display text-figure-md text-fg tabular-nums">{formatCompact(selected.views_total)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-caption font-medium text-fg-subtle">Posts · tracked trials</dt>
                <dd className="font-display text-figure-md text-fg tabular-nums">
                  {selected.posts_count} · {selected.trials_total}
                </dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 text-caption text-fg-subtle">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" />
              Only cleared money, verified views and tracked conversions count. Estimated conversions and pending money never appear here.
            </p>
          </GlassCard>

          <div ref={shareRef} id="share-panel" tabIndex={-1} className="scroll-mt-24 outline-none">
            <GlassCard padding="lg" className="grid gap-5" aria-labelledby="share-title">
              <div className="grid gap-1">
                <h2 id="share-title" className="font-display text-title-md text-fg">
                  Share your month
                </h2>
                <p className="text-body-sm text-fg-muted">An Earnings Card with your proof link, if you want one. Nothing is shared until you save or send it.</p>
              </div>
              <SharePanel wrapped={selected} handle={handle} tier={tier} />
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
