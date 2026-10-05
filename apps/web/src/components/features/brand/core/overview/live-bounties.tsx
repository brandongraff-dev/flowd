"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import type { BrandOverview } from "@/lib/data/selectors";
import { formatMoney, pluralise } from "@/lib/format";
import { AppIcon } from "@/components/brand/app-icon";
import { Badge, StatusPill } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { FillMeter } from "../fill-meter";
import { Panel, PanelLink } from "../common";

type LiveBounty = BrandOverview["live_bounties"][number];

const PACE_WORD = { ahead: "ahead", on_track: "on pace", behind: "behind" } as const;

/**
 * Live bounties with fill and burn: how much of each pool is committed against how much of its time has passed. The row is a link to the bounty;
 * the facts under the title say the same thing as the bar.
 */
export function LiveBounties({ loading, bounties, total }: { loading: boolean; bounties: readonly LiveBounty[]; total: number }) {
  return (
    <Panel
      title="Live bounties"
      description="Pool committed so far. The tick on each bar is today."
      actions={bounties.length > 0 ? <PanelLink href="/brand/bounties">{total > bounties.length ? `All ${total}` : "All bounties"}</PanelLink> : undefined}
    >
      {loading ? (
        <SkeletonGroup label="Loading live bounties" className="grid gap-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3.5">
              <Skeleton className="size-11 shrink-0 rounded-[28%]" />
              <div className="grid flex-1 gap-2">
                <Skeleton shape="text" className="w-2/5" />
                <Skeleton shape="text" className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </SkeletonGroup>
      ) : bounties.length === 0 ? (
        <EmptyState
          art="bounty"
          size="sm"
          title="No live bounties"
          description="A funded bounty goes live the moment its escrow is in. Flo drafts the brief from your App Store link."
          action={
            <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <Plus aria-hidden="true" />
              Start a bounty
            </Link>
          }
        />
      ) : (
        <ul className="-mx-1.5 grid gap-0.5">
          {bounties.slice(0, 5).map((bounty) => (
            <li key={bounty.id}>
              <Link
                href={`/brand/bounties/${bounty.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 rounded-[20px] p-2.5 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover sm:grid-cols-[auto_minmax(0,1fr)_minmax(9rem,12rem)]"
              >
                <AppIcon art={bounty.app.icon} name={bounty.app.name} size={44} decorative />
                <span className="grid min-w-0 gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-body-sm font-semibold text-fg">{bounty.title}</span>
                    {bounty.funded ? <StatusPill status="funded" size="md" /> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                    <Badge size="sm" tone="neutral">
                      {bounty.type_label}
                    </Badge>
                    <span>
                      {formatMoney(bounty.budget_left_cents, { cents: "auto" })} open · {pluralise(bounty.spots_left, "spot")} · {bounty.counts.in_review} in review
                    </span>
                  </span>
                </span>
                <span className="col-span-2 grid gap-1.5 sm:col-span-1">
                  <span className="flex items-baseline justify-between gap-3 text-caption">
                    <span className="font-semibold text-fg tabular-nums">
                      {Math.round(bounty.burn.fill * 100)}%<span className="sr-only"> of the pool committed,</span>
                    </span>
                    <span className="text-fg-subtle">
                      {PACE_WORD[bounty.burn.pace]}
                      <span className="sr-only"> of the clock</span>
                    </span>
                  </span>
                  <FillMeter settled={bounty.spent_cents} reserved={bounty.reserved_cents} total={bounty.escrow_funded_cents} time={bounty.burn.time} label={`${bounty.title}, pool committed`} size="sm" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
