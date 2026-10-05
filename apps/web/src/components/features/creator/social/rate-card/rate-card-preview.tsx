import { BadgeCheck, Clock, Layers, Timer } from "lucide-react";
import { ArtAvatar, PlatformGlyph, TierBadge, TIER_LABEL, type TierName } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Money } from "@/components/ui";
import { FORMAT_ID_META, RATE_CARD_STATUS_META, type Creator, type FormatId, type Platform, type RateCardStatus } from "@/lib/contract/types";
import { mulRate } from "@/lib/engine";
import { formatMoney, formatPct } from "@/lib/format";

export interface PreviewDraft {
  price_per_video_cents: number;
  min_cpm_cents: number;
  paid_usage_days: number;
  paid_usage_pct_per_30d: number;
  turnaround_days: number;
  max_videos_per_month: number;
  platforms: readonly Platform[];
  format_ids: readonly FormatId[];
  status: RateCardStatus;
  packages: readonly { label: string; videos: number; price_per_video_cents: number }[];
}

/**
 * The rate card as a brand sees it in the creator directory: your handle and tier, the price as the number, what the price includes, what
 * extra usage costs, and your bundles. It follows your draft as you type, so you see the effect before you save.
 */
export function RateCardPreview({ creator, draft }: { creator: Pick<Creator, "handle" | "display_name" | "avatar" | "tier">; draft: PreviewDraft }) {
  const status = RATE_CARD_STATUS_META[draft.status];
  const renewal = mulRate(draft.price_per_video_cents, draft.paid_usage_pct_per_30d);
  return (
    <GlassCard padding="md" className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-label="Rate card as brands see it">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ArtAvatar art={creator.avatar} name={creator.display_name} size={48} decorative />
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-body font-semibold text-fg">@{creator.handle}</span>
            <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
              <TierBadge tier={creator.tier as TierName} size={20} decorative />
              {TIER_LABEL[creator.tier as TierName]}
            </span>
          </div>
        </div>
        <Badge tone={status.tone} size="md">
          {status.label}
        </Badge>
      </div>

      <div className="grid gap-1">
        <p className="text-caption font-medium text-fg-subtle">From, per video</p>
        <Money cents={draft.price_per_video_cents} size="xl" decimals="never" icon={false} />
        <p className="text-caption text-fg-subtle">Organic posting included.</p>
      </div>

      <ul className="grid gap-2.5 text-body-sm text-fg-muted">
        <li className="flex items-start gap-2.5">
          <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" />
          <span>
            {draft.paid_usage_days} days of paid-ad usage included. Each extra 30 days is {formatPct(draft.paid_usage_pct_per_30d, 0)} of the base price ({formatMoney(renewal)}).
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Timer aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <span>{draft.turnaround_days}-day turnaround</span>
        </li>
        <li className="flex items-start gap-2.5">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <span>Up to {draft.max_videos_per_month} videos a month</span>
        </li>
        <li className="flex items-start gap-2.5">
          <Layers aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <span>Joins open bounties from {formatMoney(draft.min_cpm_cents)} per 1,000 views</span>
        </li>
      </ul>

      {draft.packages.length > 0 ? (
        <div className="grid gap-2 rounded-xl bg-surface-field p-3.5">
          {draft.packages.map((pack) => (
            <div key={pack.label} className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-fg-muted">{pack.label}</span>
              <span className="font-semibold text-fg tabular-nums">{formatMoney(pack.price_per_video_cents, { cents: "never" })} per video</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {draft.platforms.map((platform) => (
          <PlatformGlyph key={platform} platform={platform} size={24} />
        ))}
        {draft.format_ids.slice(0, 3).map((id) => (
          <Badge key={id} tone="neutral" size="md">
            {FORMAT_ID_META[id].label}
          </Badge>
        ))}
        {draft.format_ids.length > 3 ? (
          <Badge tone="neutral" size="md">
            +{draft.format_ids.length - 3}
          </Badge>
        ) : null}
      </div>

      <Button variant="primary" disabled={draft.status === "paused"} className="w-full">
        {draft.status === "paused" ? "Not taking offers" : `Send an offer from ${formatMoney(draft.price_per_video_cents, { cents: "never" })}`}
      </Button>
    </GlassCard>
  );
}
