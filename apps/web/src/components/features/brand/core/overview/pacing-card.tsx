"use client";

import Link from "next/link";
import { Gauge, Plus } from "lucide-react";
import type { BrandOverview } from "@/lib/data/selectors";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { FillMeter } from "../fill-meter";
import { Fact, Panel } from "../common";

type Pace = NonNullable<BrandOverview["pacing"]["pace"]>;

const PACE: Record<Pace, { label: string; tone: Tone; line: (committedPct: number, timePct: number) => string }> = {
  on_track: {
    label: "On pace",
    tone: "mint",
    line: (c, t) => `${c}% of the live pools is committed with ${t}% of the time gone. Nothing to change.`,
  },
  ahead: {
    label: "Ahead of the clock",
    tone: "info",
    line: (c, t) => `${c}% committed with ${t}% of the time gone. Pools fill before their end dates: top up the ones you want to keep open.`,
  },
  behind: {
    label: "Behind the clock",
    tone: "sun",
    line: (c, t) => `${c}% committed with ${t}% of the time gone. Fewer videos than planned: a higher CPM or a sharper hook usually fills faster. The Market view shows the price.`,
  },
};

/**
 * Spend pacing: what the live pools have settled and reserved, against the calendar. Money and time on one bar, with the words underneath. A
 * brand that is ahead is not "good" and one that is behind is not "bad", so the tones are informational and the copy says what to try.
 */
export function PacingCard({ loading, pacing }: { loading: boolean; pacing: BrandOverview["pacing"] }) {
  const committed = pacing.spent_cents + pacing.reserved_cents;
  const free = Math.max(0, pacing.budget_cents - committed);
  const committedPct = Math.round(pacing.burn_ratio * 100);
  const timePct = Math.round(pacing.time_ratio * 100);
  const pace = pacing.pace ? PACE[pacing.pace] : null;

  return (
    <Panel
      title="Spend pacing"
      description={loading ? undefined : pacing.live_bounties > 0 ? `${pacing.live_bounties} live ${pacing.live_bounties === 1 ? "bounty" : "bounties"}, pool plus fee reserve in escrow` : "Appears when a bounty is funded"}
      actions={pace ? <Badge tone={pace.tone} dot>{pace.label}</Badge> : undefined}
    >
      {loading ? (
        <SkeletonGroup label="Loading spend pacing" className="grid gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-2.5 w-full" shape="pill" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton shape="text" />
            <Skeleton shape="text" />
            <Skeleton shape="text" />
          </div>
        </SkeletonGroup>
      ) : pacing.live_bounties === 0 ? (
        <EmptyState
          art="wallet"
          size="sm"
          title="No money is moving yet"
          description="Fund a bounty and its pool shows here, with settled money, reserved money and the clock side by side."
          action={
            <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <Plus aria-hidden="true" />
              Start a bounty
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money cents={committed} size="lg" state="neutral" decimals="auto" animate />
            <span className="text-body-sm text-fg-muted">
              committed of <Money cents={pacing.budget_cents} size="inherit" decimals="auto" className="font-semibold text-fg" /> in escrow
            </span>
          </div>
          <FillMeter settled={pacing.spent_cents} reserved={pacing.reserved_cents} total={pacing.budget_cents} time={pacing.time_ratio} label="Live pools committed" size="md" />
          <dl className="grid grid-cols-3 gap-4">
            <Fact label="Settled">
              <Money cents={pacing.spent_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Reserved in review">
              <Money cents={pacing.reserved_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Still open to new videos">
              <Money cents={free} size="inherit" decimals="auto" />
            </Fact>
          </dl>
          {pace ? (
            <p className={cn("flex items-start gap-2 text-caption text-fg-muted")}>
              <Gauge aria-hidden="true" className="mt-px size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.9} />
              {pace.line(committedPct, timePct)}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
