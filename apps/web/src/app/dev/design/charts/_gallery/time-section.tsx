"use client";

import { AreaChart, LineChart, RangeBand, RetentionCurve, formatCents, formatCompact } from "@/components/charts";
import { Cols, Section } from "../../_gallery/kit";
import { cpmMarket, clearedDaily, installsWithEstimate, paybackCohorts, retentionCohorts, spendByApp, viewsByPlatform } from "./data";

const money = (cents: number): string => formatCents(cents);
const moneyShort = (cents: number): string => formatCents(cents, true);

export function TimeSection() {
  return (
    <Section
      id="time"
      eyebrow="Change over time"
      title="One engine, every time chart."
      description="Area, line, range band and retention curve share one engine: hairline grid, a hover crosshair that snaps to the data, one tooltip listing every series, arrow-key navigation, a legend that toggles series without repainting the others, and a draw-in that plays once. Scroll them into view, hover, tab in and press the arrow keys, or flip any card to its table."
    >
      <Cols>
        <AreaChart
          title="Cleared earnings"
          subtitle="Maya K · last 30 days · cleared, not pending"
          summary="Cleared earnings per day rose from about $38 in early September to about $212 on October 3, with a bump on each Friday payout."
          data={clearedDaily}
          seriesLabel="Cleared"
          yFormat={moneyShort}
          yTooltipFormat={money}
          footer="Typical creator on a similar bounty: $62 a week (median, last 30 days)."
        />
        <LineChart
          title="Views by platform"
          subtitle="Verified views per day · marker shapes on for colour-blind readers"
          summary="Daily verified views grew on all three platforms over 30 days; TikTok leads at about 160 thousand a day, Instagram and YouTube follow."
          series={viewsByPlatform}
          yFormat={formatCompact}
          shapes
          yAxisTitle="Views per day"
        />
        <AreaChart
          title="Daily spend by app"
          subtitle="Stacked part-to-whole · hover for the exact dollars"
          summary="Brand spend grew across Nap Nest, Fernlingo and Loafly; Nap Nest is the largest share throughout."
          series={spendByApp}
          stacked
          yFormat={moneyShort}
          yTooltipFormat={money}
          height={280}
          footer="Brand view: series use the chart palette. Mint is reserved for creator earnings."
        />
        <LineChart
          title="Installs per day"
          subtitle="The last three days are modelled until their 72-hour window closes"
          summary="Tracked installs climbed from about 96 to about 250 a day; the final three points are estimated."
          series={[{ id: "installs", label: "Installs", points: installsWithEstimate }]}
          legend
          yFormat={formatCompact}
          footer="Dotted segments are Estimated. They never trigger a CPA payout."
        />
        <RangeBand
          title="What a view costs"
          subtitle="Clearing CPM · Sleep & mind · last 45 days"
          summary="The median clearing CPM for Sleep and mind rose from about $1.98 to about $2.38 per thousand verified views over 45 days; the middle half of trades sits within roughly 22 percent below and 34 percent above the median."
          data={cpmMarket}
          medianLabel="Clearing CPM (median)"
          yFormat={(cents) => `$${(cents / 100).toFixed(2)}`}
          yTooltipFormat={(cents) => `$${(cents / 100).toFixed(2)} per 1,000`}
          markers={[{ id: "yours", x: cpmMarket[cpmMarket.length - 6]?.x ?? 0, y: 240, label: "Your bounty $2.40" }]}
          footer="Set $2.40 to fill in about 3 days (68% confidence)."
          height={280}
        />
        <RetentionCurve
          title="Retention by install cohort"
          subtitle="Share of installs still active · dotted = modelled"
          summary="Retention drops from 100 percent on day zero to about 25 percent by day seven and about 11 percent by day thirty; newer cohorts retain slightly better."
          cohorts={retentionCohorts}
          mode="retention"
          height={280}
        />
        <RetentionCurve
          title="Payback by install cohort"
          subtitle="Cumulative revenue divided by bounty cost, D7 to D90"
          summary="The August 17 cohort is projected to pay back its bounty cost around day 38 and reach 1.7 times by day 90; the September 7 cohort is projected to break even around day 45."
          cohorts={paybackCohorts}
          mode="payback"
          height={280}
          footer="Payback day is read off the curve and flagged Estimated while the tail is modelled."
        />
      </Cols>
    </Section>
  );
}
