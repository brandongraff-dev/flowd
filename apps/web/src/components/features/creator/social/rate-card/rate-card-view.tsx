"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { TierBadge, TIER_LABEL } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import { RATE_CARD_STATUS_META, type RateCard } from "@/lib/contract/types";
import { useRateCard, useStoreReady, useTiers } from "@/lib/data";
import { CONSTANTS } from "@/lib/engine";
import { SocialSkeleton } from "../shared/skeletons";
import { Requirement } from "../tiers/progress-panel";
import { RateCardEditor } from "./rate-card-editor";

/** A rate card for a creator who has none yet, seeded from the market read so the first price is a fair one. */
function starterCard(creatorId: string, suggestionPrice: number, platforms: RateCard["platforms"]): RateCard {
  return {
    id: "rate_new",
    creator_id: creatorId,
    status: "open",
    price_per_video_cents: suggestionPrice,
    min_cpm_cents: CONSTANTS.pay.default_cpm_cents,
    paid_usage_days: CONSTANTS.rights.paid_ads_default_days,
    paid_usage_pct_per_30d: CONSTANTS.rights.renewal_fee_pct_of_base_per_30d,
    turnaround_days: 5,
    max_videos_per_month: 8,
    platforms: [...platforms],
    format_ids: [],
    categories_excluded: [],
    accepts_direct_offers: true,
    packages: [],
    stats: { offers_received: 0, accepted: 0, median_response_hours: 0 },
    updated_at: "",
  };
}

function Locked() {
  const tiers = useTiers();
  const toSilver = tiers.creator?.tier === "bronze";
  return (
    <GlassCard padding="lg" className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="grid gap-4">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-sun-soft text-sun">
          <Lock className="size-7" />
        </span>
        <h2 className="font-display text-display-sm text-balance text-fg">Rate cards open at Silver</h2>
        <p className="max-w-[52ch] text-body-lg text-fg-muted">
          Once you have a track record, brands can buy a video from you at your own price, with the market&rsquo;s middle range beside it. Until then, open bounties are where you earn.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="primary">
            <Link href="/creator/feed">Find bounties</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/creator/tiers">See all tiers</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 rounded-2xl bg-surface-field p-5">
        <div className="flex items-center gap-3">
          <TierBadge tier="silver" size={40} decorative />
          <h3 className="font-display text-title-sm text-fg">{toSilver ? "What Silver needs" : `You are ${tiers.creator ? TIER_LABEL[tiers.creator.tier as "bronze"] : "on your way"}`}</h3>
        </div>
        <ul className="grid gap-4">
          {tiers.remaining.map((item) => (
            <Requirement key={item.key} item={item} />
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}

export function RateCardView() {
  const ready = useStoreReady();
  const view = useRateCard();
  if (!ready) return <SocialSkeleton label="Loading rate card" layout="split" />;

  const creator = view.creator;
  const card = view.rate_card ?? (creator && view.suggestion ? starterCard(creator.id, view.suggestion.price_cents, ["tiktok"]) : undefined);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Earn"
        title="Rate card"
        description="Your own price list. Brands can buy a video from you directly at this price, and your market read shows where it sits against what comparable creators charge."
        meta={
          view.rate_card ? (
            <Badge tone={RATE_CARD_STATUS_META[view.rate_card.status].tone} size="lg" icon={<Sparkles />}>
              {RATE_CARD_STATUS_META[view.rate_card.status].label}
            </Badge>
          ) : null
        }
      />
      {!creator ? (
        <EmptyState art="locked" title="Sign in as a creator" description="Rate cards belong to a creator account." />
      ) : view.locked ? (
        <Locked />
      ) : card ? (
        <RateCardEditor key={view.rate_card?.updated_at ?? "new"} creator={creator} card={card} view={view} />
      ) : (
        <GlassCard>
          <EmptyState art="chart" title="Connect an account to set a price" description="flowd reads your median views from a linked account to suggest a fair starting price." />
        </GlassCard>
      )}
    </div>
  );
}
