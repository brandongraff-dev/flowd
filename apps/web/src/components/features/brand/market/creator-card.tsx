"use client";

import { Send, Sparkles, Ticket } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Badge, Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import type { CreatorCard as CreatorCardRow } from "@/lib/data/selectors/creators";
import { formatCompact, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddToListMenu } from "./add-to-list";
import { CreatorIdentity, Fact, NichePills, PlatformRow, ReliabilityMeter, costPerTrialText, priceFromText } from "./creator-bits";
import type { OfferTarget } from "./offer-sheet";

/** What a creator row needs to open the offer composer. */
export function offerTargetOf(row: CreatorCardRow): OfferTarget {
  const { creator, rate_card } = row;
  return { id: creator.id, handle: creator.handle, display_name: creator.display_name, avatar: creator.avatar, tier: creator.tier, open_to_offers: creator.open_to_offers, ...(rate_card ? { rate_card } : {}) };
}

export interface DiscoverCardProps {
  row: CreatorCardRow;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  /** The compare tray is full: this unselected card cannot be added. */
  compareFull: boolean;
  onOffer: (row: CreatorCardRow) => void;
  onInvite: (row: CreatorCardRow) => void;
}

/**
 * A creator as a brand reads one: verified numbers first (reliability, approval, hit rate, median views), then what they did on YOUR apps
 * (tracked trials and cost per trial), then price. The whole card opens the profile; the buttons sit above that link.
 */
export function DiscoverCard({ row, selected, onSelectedChange, compareFull, onOffer, onInvite }: DiscoverCardProps) {
  const { creator, rate_card, on_my_apps, match } = row;
  const platforms = row.accounts.map((account) => account.platform).filter((platform, index, all) => all.indexOf(platform) === index);
  const accepts = Boolean(creator.open_to_offers && rate_card?.accepts_direct_offers && rate_card.status !== "paused");
  const hasMine = on_my_apps.posts > 0;

  return (
    <GlassCard
      as="article"
      aria-label={`@${creator.handle}`}
      padding="md"
      className={cn("relative grid content-start gap-4 transition-shadow duration-(--fd-dur-base) ease-standard hover:shadow-raised", selected && "shadow-[0_0_0_2px_var(--fd-accent-bright)]")}
    >
      <div className="flex items-start justify-between gap-3">
        <CreatorIdentity creator={creator} size={48} href={`/brand/creators/${creator.handle}`} className="flex-1" />
        <div className="relative z-10 -mt-1 -mr-1.5">
          <Checkbox
            aria-label={`Compare @${creator.handle}`}
            checked={selected}
            disabled={!selected && compareFull}
            onCheckedChange={(next) => onSelectedChange(next === true)}
            containerClassName="min-h-9 px-1.5"
          />
        </div>
      </div>

      {match ? (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-soft p-2.5 text-caption">
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={1.75} />
          <p className="min-w-0 text-fg-muted">
            {match.score === null ? (
              <span className="font-semibold text-ember">Can&apos;t take this bounty: {match.gate_failures[0] ?? "not eligible"}.</span>
            ) : (
              <>
                <span className="font-semibold text-fg tabular-nums">Match {match.score}</span>
                {match.reasons[0] ? <span>. {match.reasons[0]}</span> : null}
              </>
            )}
          </p>
        </div>
      ) : null}

      <ReliabilityMeter view={row.reliability} />

      <dl className="grid grid-cols-3 gap-3">
        <Fact label="Approval" hint={`of ${creator.decided_count} decided`}>
          {creator.decided_count > 0 ? formatPct(creator.approval_rate, 0) : "New"}
        </Fact>
        <Fact label="Hit rate" hint={row.hit_rate === null ? "needs 5 posts" : "became winners"}>
          {row.hit_rate === null ? "n/a" : formatPct(row.hit_rate, 0)}
        </Fact>
        <Fact label="Median views" hint={row.followers > 0 ? `${formatCompact(row.followers)} followers` : undefined}>
          {row.median_views > 0 ? formatCompact(row.median_views) : "none"}
        </Fact>
      </dl>

      <div className="grid gap-1.5 rounded-lg bg-surface-field p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-medium text-fg-muted">On your apps</p>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="relative z-10 rounded-pill focus-visible:outline-offset-2" aria-label="What Tracked means">
                <Badge size="sm" tone="accent" icon={<Ticket />}>
                  Tracked
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent width="md">
              <p className="text-body-sm font-semibold text-fg">Tracked trials</p>
              <p className="mt-1 text-caption text-fg-muted">Trials tied to this creator by their link or code. These are the only conversions a CPA bounty pays on. Estimated installs from survey or MMP matches are not counted here.</p>
            </PopoverContent>
          </Popover>
        </div>
        {hasMine ? (
          <p className="text-body-sm text-fg">
            <span className="font-semibold tabular-nums">{on_my_apps.posts}</span> {on_my_apps.posts === 1 ? "post" : "posts"} · <span className="font-semibold tabular-nums">{on_my_apps.trials}</span> {on_my_apps.trials === 1 ? "trial" : "trials"} ·{" "}
            <span className="font-semibold tabular-nums">{costPerTrialText(on_my_apps.cost_per_trial_cents)}</span>
          </p>
        ) : (
          <p className="text-body-sm text-fg-muted">No posts for your apps yet. Their results elsewhere are in the numbers above.</p>
        )}
      </div>

      <div className="grid gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <PlatformRow platforms={platforms} />
          <p className={cn("text-right text-body-sm tabular-nums", accepts ? "text-fg" : "text-fg-subtle")}>
            {rate_card ? accepts ? <><span className="text-caption text-fg-subtle">From </span><span className="font-semibold">{priceFromText(rate_card.price_per_video_cents, true)}</span></> : "Not taking direct offers" : "No rate card yet"}
          </p>
        </div>
        <NichePills niches={creator.niches} max={3} />
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-2 border-t border-divider pt-3.5">
        <Button size="sm" variant="secondary" leadingIcon={<Send />} onClick={() => onOffer(row)} disabled={!accepts}>
          Send offer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onInvite(row)} disabled={!creator.open_to_offers}>
          Invite
        </Button>
        <div className="ml-auto">
          <AddToListMenu creatorId={creator.id} handle={creator.handle} />
        </div>
      </div>
    </GlassCard>
  );
}
