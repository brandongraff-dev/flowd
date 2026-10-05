"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";
import type { FeedItem } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppIcon, ArtSurface } from "@/components/brand";
import { Badge, IconButton, notify } from "@/components/ui";
import { GlassCard } from "@/components/glass";
import { Amount } from "./amount";
import { BudgetLeft, DecidesIn, EarlyAccessBadge, FundedBadge, LockedBadge, PayTypeBadge, RightsChip, payParts, rightsChipText } from "./bounty-parts";

/** "$38 to $140": the middle half of what creators like you make per video. A range always sits beside the median, never alone. */
export function expectedRange(expected: FeedItem["expected"]): string {
  return `${formatMoney(expected.p25, { cents: "never" })} to ${formatMoney(expected.p75, { cents: "never" })}`;
}

export async function toggleSaved(bountyId: string, saved: boolean): Promise<void> {
  const result = await actions.saveBounty({ bounty_id: bountyId, saved: !saved });
  if (!result.ok) notify.error(result.error.message, { description: result.error.hint });
}

export interface BountyCardProps {
  item: FeedItem;
  /** Show the pay structure badge and the rights chip (the feed). Compact cards on Home leave them out. */
  detailed?: boolean;
  /** Where the creator's own submission to this bounty lives, when there is one (the card then says "Submitted" instead of "Locked"). */
  submissionHref?: string;
  className?: string;
}

/**
 * A bounty in the feed: generated cover with the pay as its headline, the Funded badge, what a typical creator earns here (the median, with the
 * middle-half range beside it), the pool left, the Rights chip and how fast the brand decides. The whole card opens the bounty; the save
 * button sits above it. Locked bounties say why and what unlocks them.
 */
export function BountyCard({ item, detailed = true, submissionHref, className }: BountyCardProps) {
  const { bounty, match } = item;
  const pay = payParts(bounty);
  const submitted = item.submitted && match.locked;
  const locked = match.locked && !submitted;
  const lockReason = match.lock_reasons[0];

  return (
    <GlassCard padding="none" className={cn("group relative grid min-w-0 content-start overflow-hidden rounded-[28px] transition-shadow duration-(--fd-dur-base) ease-standard hover:shadow-raised", className)}>
      <div className="relative h-36 overflow-hidden rounded-t-[28px]">
        <ArtSurface art={bounty.art} aspect="16:9" className={cn("absolute inset-0 block size-full", locked && "grayscale-[0.55]")} />
        <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
          <AppIcon art={bounty.app.icon} name={bounty.app.name} size={36} decorative />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {item.pinned ? (
              <Badge tone="sun" size="md">
                {bounty.platform_funded ? "Always on" : "Featured"}
              </Badge>
            ) : null}
            {bounty.is_starter ? (
              <Badge tone="accent" size="md">
                Starter
              </Badge>
            ) : null}
            {submitted ? (
              <Badge tone="accent" size="md" icon={<Check aria-hidden="true" />}>
                Submitted
              </Badge>
            ) : locked ? (
              <LockedBadge reason={lockReason} />
            ) : bounty.funded ? (
              <FundedBadge />
            ) : null}
          </div>
        </div>
        <div className="absolute inset-x-4 bottom-3.5 grid gap-0.5 text-white">
          <p className="font-display text-title-md leading-tight [text-shadow:0_2px_14px_rgb(1_4_20/0.55)]">{pay.headline}</p>
          {pay.extras ? <p className="truncate text-caption font-medium text-white/90">{pay.extras}</p> : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-3.5 p-5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="grid min-w-0 gap-1">
            <h3 className="font-display text-title-sm text-fg">
              <Link href={`/creator/bounties/${bounty.id}`} className="line-clamp-2 rounded-sm after:absolute after:inset-0 after:content-['']">
                {bounty.title}
              </Link>
            </h3>
            <p className="truncate text-caption text-fg-muted">
              {bounty.app.name} · {bounty.brand.name}
              {bounty.per_video_cap_cents > 0 ? ` · cap ${formatMoney(bounty.per_video_cap_cents, { cents: "never" })} per video` : ""}
            </p>
          </div>
          <IconButton
            label={item.saved ? "Remove from saved" : "Save for later"}
            aria-pressed={item.saved}
            variant="plain"
            size="sm"
            icon={item.saved ? <BookmarkCheck /> : <Bookmark />}
            onClick={() => void toggleSaved(bounty.id, item.saved)}
            className="relative z-10 -mt-1 -mr-2"
          />
        </div>

        {submitted ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-caption text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_32%,transparent)]">
            You submitted a video here.{" "}
            {submissionHref ? (
              <Link href={submissionHref} className="relative z-10 font-semibold text-accent hover:underline">
                See where it stands
              </Link>
            ) : null}
          </p>
        ) : locked ? (
          <p className="rounded-xl bg-sun-soft px-3 py-2 text-caption text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_32%,transparent)]">{lockReason ?? "You do not meet every requirement yet."}</p>
        ) : (
          <div className="grid gap-1 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-micro font-medium text-fg-subtle">Typical creator, per video</p>
              {item.score !== null ? <span className="text-micro font-semibold whitespace-nowrap text-accent tabular-nums">{Math.round(item.score)}% match</span> : null}
            </div>
            <Amount cents={item.expected.median} size="md" state="neutral" decimals="never" note="median" />
            <p className="text-micro text-fg-subtle">{item.expected.p25 === item.expected.p75 ? "Flat fee. Approval isn't guaranteed: the video must meet the brief." : `Middle half ${expectedRange(item.expected)}. An estimate; results vary.`}</p>
          </div>
        )}

        <BudgetLeft bounty={bounty} />

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <DecidesIn decides={bounty.decides_in} />
          {item.joined && !submitted ? (
            <span className="relative z-10 inline-flex items-center gap-1 text-caption font-semibold text-mint">
              <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              {item.submitted ? "Submitted" : "Joined"}
            </span>
          ) : null}
        </div>

        {detailed ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <PayTypeBadge type={bounty.type} />
            {!item.match.visible ? <EarlyAccessBadge /> : null}
            <RightsChip summary={rightsChipText(bounty.rights_card)} className="max-w-full" />
          </div>
        ) : null}
      </div>

    </GlassCard>
  );
}
