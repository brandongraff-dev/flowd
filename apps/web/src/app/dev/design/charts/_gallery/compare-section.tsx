"use client";

import { BarChart, FunnelChart, Heatmap, Scatter, formatCents, formatCompact } from "@/components/charts";
import { Cols, Section } from "../../_gallery/kit";
import {
  CTA_COLS,
  HEATMAP_COLS,
  HEATMAP_ROWS,
  HOOK_ROWS,
  approvedPerWeek,
  bestTimeToPost,
  cpmByCategory,
  funnelStages,
  hookByCta,
  marketGroups,
  marketPoints,
  spendByBountyType,
  viewsByPlatformWeekly,
} from "./data";

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function CompareSection() {
  return (
    <Section
      id="compare"
      eyebrow="Compare"
      title="Bars, the funnel, the heatmap and the scatter."
      description="Bars are at most 24px thick with a 4px rounded end and a 2px gap; one series is one colour (nominal categories never get a value ramp); emphasis greys out everything but the story. The funnel separates Tracked from Estimated with a chip and a hatch. The heatmap is one hue in at most seven classes. The scatter finds the nearest point, so nobody has to land on a dot."
    >
      <Cols>
        <BarChart
          title="Approved posts per week"
          subtitle="One series, one colour · values on the caps"
          summary="Approved posts per week rose from 38 in the week of August 10 to 88 in the week of September 28."
          data={approvedPerWeek}
          valueFormat={formatCompact}
          categoryLabel="Week of"
          footer="An approved post is paid when its views clear, 72 hours after it goes live."
        />
        <BarChart
          title="Verified views by platform"
          subtitle="Grouped · the legend toggles series"
          summary="Weekly verified views grew on every platform across four weeks; TikTok is the largest."
          data={viewsByPlatformWeekly}
          series={[
            { id: "tiktok", label: "TikTok" },
            { id: "instagram", label: "Instagram" },
            { id: "youtube", label: "YouTube" },
          ]}
          valueFormat={formatCompact}
          mode="grouped"
          footer="Hover a column for the exact count. Colours follow the platform, not its rank."
        />
        <BarChart
          title="Spend by bounty type"
          subtitle="Stacked · 2px surface gaps, rounded only at the top"
          summary="Weekly spend grew from about $688 thousand to about $948 thousand; CPM bounties are the largest share and CPA spend is growing fastest."
          data={spendByBountyType}
          series={[
            { id: "cpm", label: "CPM" },
            { id: "cpa", label: "CPA" },
            { id: "stacked", label: "Stacked" },
          ]}
          mode="stacked"
          valueFormat={(cents) => formatCents(cents, true)}
          tooltipFormat={(cents) => formatCents(cents)}
        />
        <BarChart
          title="Clearing CPM by category"
          subtitle="Horizontal · emphasis on one category, the rest in grey"
          summary="Clearing CPM ranges from $1.42 for Lifestyle and travel to $3.42 for Money and budgeting; Sleep and mind is $2.31."
          data={cpmByCategory}
          orientation="horizontal"
          highlight="Sleep & mind"
          valueFormat={dollars}
          categoryLabel="Category"
        />
      </Cols>

      <FunnelChart
        title="Views to paid"
        subtitle="Nap Nest · hook test A · last 30 days"
        summary="4.2 million views led to 75.8 thousand clicks, 3,310 installs, 1,026 trials and an estimated 214 paid subscriptions."
        stages={funnelStages}
        footer="CPA bonuses pay only on tracked installs."
      />

      <Cols>
        <Heatmap
          title="Best time to post"
          subtitle="Median views in the first 24 hours · by day and hour (UTC)"
          summary="Median first-day views peak in the evening, roughly 6 to 9 PM, and on weekends; hours 3 to 5 AM have no posts."
          rows={HEATMAP_ROWS}
          cols={HEATMAP_COLS}
          values={bestTimeToPost}
          measure="Median views"
          format={formatCompact}
          rowLabel="Day"
          cellHeight={26}
        />
        <Heatmap
          title="Hook and call to action"
          subtitle="Installs per 1,000 verified views"
          summary="Screen reaction hooks with a code call to action convert best at 1.88 installs per thousand views; comment calls to action convert worst."
          rows={HOOK_ROWS}
          cols={CTA_COLS}
          values={hookByCta}
          bins={5}
          measure="Installs per 1k views"
          format={(value) => value.toFixed(2)}
          rowLabel="Hook"
          cellHeight={40}
          note="Blank cells have fewer than 20 posts."
        />
      </Cols>

      <Scatter
        title="Price against fill time"
        subtitle="Open bounties · each point is one bounty"
        summary="Higher clearing CPMs fill faster: a bounty at $1.80 takes about 8 days to fill and one at $3.10 about 2 days."
        points={marketPoints}
        groups={marketGroups}
        xTitle="Clearing CPM"
        yTitle="Days to fill"
        xFormat={dollars}
        yFormat={(value) => `${value.toFixed(0)}d`}
        yTooltipFormat={(value) => `${value.toFixed(1)} days`}
        xName="CPM"
        yName="Days to fill"
        trend
        highlightId="sleep-0"
        highlightLabel="Nap Nest"
        height={340}
        footer="Trend is a least-squares fit across visible bounties. A guide, not a promise."
      />
    </Section>
  );
}
