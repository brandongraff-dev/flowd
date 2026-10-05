"use client";

import type { ReactNode } from "react";
import { useBrandOverview, useDemoNow, useMe, useStoreReady } from "@/lib/data";
import type { KpiTile } from "@/lib/data/selectors";
import { greeting, pluralise } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/shell/stat-card";
import { RANGES, RANGE_OPTIONS, SourceChip, rangeLabel, useUrlParam, type RangeKey } from "../common";
import { ActivityCard } from "./activity-card";
import { FunnelCard } from "./funnel-card";
import { LiveBounties } from "./live-bounties";
import { MarketPulse } from "./market-pulse";
import { NeedsYou } from "./needs-you";
import { NextActions } from "./next-actions";
import { PacingCard } from "./pacing-card";
import { rankNextActions } from "./rank-next-actions";
import { SetupChecklist } from "./setup-checklist";

const KPI_HINT: Record<KpiTile["key"], ReactNode> = {
  spend: "Creator pay plus platform fees",
  views: "Verified at the 72-hour window",
  installs: <SourceChip kind="tracked" />,
  trials: <SourceChip kind="tracked" />,
  cost_per_trial: "Spend divided by tracked trials",
};

/**
 * `/brand`: the overview. Action before reporting: what needs you sits top-right of the stat tiles (and first on a phone), the tiles read
 * against a named period, and the lower cards say where the money is, what it bought and what to do next. A new brand sees the three-step
 * checklist first. Everything is read from the demo store, so approving a video elsewhere changes this page on its own.
 */
export function BrandOverviewView() {
  const ready = useStoreReady();
  const me = useMe();
  const now = useDemoNow();
  const [range, setRange] = useUrlParam<RangeKey>("range", RANGES, "30d");
  const overview = useBrandOverview({ range });
  const loading = !ready || overview.loading;

  const firstName = me.user?.display_name.split(" ")[0] ?? "";
  const waiting = overview.needs.waiting;
  const description = !ready
    ? "Loading your workspace."
    : overview.is_new
      ? "Connect your app, fund your wallet and let Flo draft your first brief."
      : waiting > 0
        ? `${pluralise(waiting, "video")} ${waiting === 1 ? "is" : "are"} waiting for a decision. Creators get paid faster when you decide within 48 hours.`
        : "Nothing is waiting on you. Every video has a decision.";

  const yourCpms = overview.live_bounties.map((b) => b.cpm_cents).filter((cpm) => cpm > 0);
  const yourCpm = yourCpms.length > 0 ? Math.round(yourCpms.reduce((sum, cpm) => sum + cpm, 0) / yourCpms.length) : null;
  const next = rankNextActions(overview);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Overview"
        title={me.user ? `${greeting(now, me.user.timezone ? { timeZone: me.user.timezone } : {})}, ${firstName}` : "Overview"}
        description={description}
        actions={<SegmentedControl<RangeKey> aria-label="Date range" size="md" value={range} onValueChange={setRange} options={RANGE_OPTIONS} />}
        meta={
          ready && me.brand ? (
            <>
              <Badge tone="neutral">{`Last ${rangeLabel(range)}`}</Badge>
              <Badge tone="neutral">{me.app ? me.app.name : me.brand.name}</Badge>
              <DemoTag />
            </>
          ) : undefined
        }
      />

      {ready && overview.is_new ? <SetupChecklist steps={overview.checklist} /> : null}

      {/* Two columns from xl. Below it the wrappers dissolve and `order` puts "Needs you" first: action before reporting. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <div className="contents xl:grid xl:content-start xl:gap-5">
          <div className="grid gap-4 max-xl:order-2 min-[420px]:grid-cols-2">
            {(loading ? SKELETON_TILES : overview.tiles).map((tile, index) => (
              <StatCard
                key={tile.key}
                label={tile.label}
                loading={loading}
                {...(tile.unit === "cents" ? { cents: tile.value } : { value: tile.value })}
                delta={tile.delta === null ? null : { ratio: tile.delta, against: tile.delta_label, goodWhen: tile.lower_is_better ? "down" : "up" }}
                spark={loading ? undefined : tile.spark}
                sparkTone={tile.lower_is_better || tile.key === "spend" ? "neutral" : "accent"}
                hint={loading ? undefined : tile.delta === null && tile.previous === 0 ? "No earlier period to compare yet" : KPI_HINT[tile.key]}
                size={tile.key === "cost_per_trial" ? "xl" : "lg"}
                className={index === 4 ? "min-[420px]:col-span-2" : undefined}
              />
            ))}
          </div>
          <div className="max-xl:order-4">
            <PacingCard loading={loading} pacing={overview.pacing} />
          </div>
          <div className="max-xl:order-5">
            <LiveBounties loading={loading} bounties={overview.live_bounties} total={overview.pacing.live_bounties} />
          </div>
          <div className="max-xl:order-8">
            <ActivityCard loading={!ready} activity={overview.activity} now={now} />
          </div>
        </div>

        <div className="contents xl:grid xl:content-start xl:gap-5">
          <div className="max-xl:order-1">
            <NeedsYou loading={!ready || overview.loading} items={overview.needs.items} waiting={waiting} oldestHours={overview.needs.oldest_hours} />
          </div>
          <div className="max-xl:order-3">
            <NextActions loading={!ready} actions={next} />
          </div>
          <div className="max-xl:order-6">
            <FunnelCard funnel={overview.funnel} range={range} loading={!ready || (overview.funnel?.loading ?? true)} />
          </div>
          <div className="max-xl:order-7">
            <MarketPulse loading={!ready} market={overview.market} yourCpm={yourCpm} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Five placeholder tiles with the real keys, so the grid keeps its shape (and the wide last tile) while the metrics load. */
const SKELETON_TILES: readonly KpiTile[] = (["spend", "views", "installs", "trials", "cost_per_trial"] as const).map((key) => ({
  key,
  label: { spend: "Spend", views: "Verified views", installs: "Installs", trials: "Trials", cost_per_trial: "Cost per trial" }[key],
  value: 0,
  unit: key === "spend" || key === "cost_per_trial" ? "cents" : "count",
  previous: 0,
  delta: null,
  delta_label: "",
  spark: [],
  lower_is_better: key === "cost_per_trial",
}));
