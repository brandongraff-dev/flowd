"use client";

import Link from "next/link";
import { ArrowRight, Clapperboard } from "lucide-react";
import { useCreatorHome, useStoreReady } from "@/lib/data";
import { formatClockEta, greeting } from "@/lib/format";
import { useNow, useNowIso } from "@/lib/hooks/use-now";
import { PageHeader } from "@/components/shell";
import { buttonVariants } from "@/components/ui";
import { BountyCard } from "./bounty-card";
import { DailyDropCard } from "./daily-drop-card";
import { ActivityList, FirstDollarTracker, FloEntry, NextSteps, StreakCard, TierProgressCard, WhatToPost } from "./home-cards";
import { MoneyClockSummary } from "./money-clock-summary";
import { Skeleton } from "@/components/ui";

/** One calm sentence under the greeting: the thing that matters most right now, never a nudge. */
function headline(home: ReturnType<typeof useCreatorHome>, now: number): string {
  const first = home.what_to_post[0];
  if (first) return `${first.title}. ${first.detail}`;
  if (home.wallet.pending_cents > 0 && home.wallet.next_clear_at) return `Your next money clears ${formatClockEta(home.wallet.next_clear_at, { now })} UTC. Nothing needs you right now.`;
  return "Pick a bounty from the feed and make a take when you feel like it.";
}

/**
 * Creator Home. The Money Clock leads (cleared and pending apart, each dated), then the Daily Drop with its real inventory, what to post today,
 * three matched bounties, the streak, the tier path, the First-Dollar tracker for new creators, next steps, activity and a way into Flo.
 */
export function CreatorHome() {
  const ready = useStoreReady();
  const home = useCreatorHome();
  const now = useNow();
  const nowIso = useNowIso();
  const name = home.creator?.display_name.split(" ")[0];
  const loading = !ready || !home.ready;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Home"
        title={name ? `${greeting(nowIso)}, ${name}` : greeting(nowIso)}
        description={loading ? undefined : headline(home, now)}
        actions={
          <Link href="/creator/studio" className={buttonVariants({ variant: "primary", size: "md" })}>
            <Clapperboard aria-hidden="true" />
            Make a take
          </Link>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <MoneyClockSummary />
          <FirstDollarTracker home={home.first_dollar} />
          <DailyDropCard drop={home.drop} loading={loading} />
          <WhatToPost items={home.what_to_post} loading={loading} />
        </div>

        <div className="grid min-w-0 gap-5">
          <StreakCard streak={home.streak} loading={loading} />
          <TierProgressCard tier={home.tier} loading={loading} />
          <NextSteps steps={home.next_steps} />
          <ActivityList items={home.activity} />
          <FloEntry />
        </div>
      </div>

      <section aria-labelledby="matched-title" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="matched-title" className="font-display text-title-md text-fg">
              Matched for you
            </h2>
            <p className="text-body-sm text-fg-muted">Funded bounties that fit your niches and accounts. Pay shown is the median, not a promise.</p>
          </div>
          <Link href="/creator/feed" className="inline-flex items-center gap-1 rounded-sm text-body-sm font-semibold text-accent hover:underline">
            Open the feed
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
          </Link>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-96 rounded-[28px]" />
            <Skeleton className="h-96 rounded-[28px]" />
          </div>
        ) : home.matched.length === 0 ? (
          <p className="rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">Nothing matches yet. Widen your niches in Settings, or check back when the Daily Drop lands at 4 PM UTC.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {home.matched.map((item) => (
              <BountyCard key={item.bounty.id} item={item} detailed={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
