"use client";

import { useState } from "react";
import { Donut, Gauge, LineChart, RangeBar, ScoreRing, Sparkline, formatCents, type SparklineTone } from "@/components/charts";
import { Button, Money, Switch } from "@/components/ui";
import { Cols, Panel, Row, Section, Spec } from "../../_gallery/kit";
import { clearedDaily, sparkSets, spendShare } from "./data";

const TILES: ReadonlyArray<{ label: string; value: string; delta: string; data: readonly number[]; tone: SparklineTone }> = [
  { label: "Verified views", value: "4.2M", delta: "up 12% vs prior 30 days", data: sparkSets.views, tone: "accent" },
  { label: "Spend", value: "$12.5K", delta: "up 9% vs prior 30 days", data: sparkSets.spend, tone: "neutral" },
  { label: "Installs", value: "3,310", delta: "up 18% vs prior 30 days", data: sparkSets.installs, tone: "accent" },
  { label: "Cost per trial", value: "$7.40", delta: "down 21% vs prior 30 days", data: sparkSets.cost, tone: "neutral" },
];

const RELIABILITY = [
  { to: 69, color: "var(--fd-chart-critical)", label: "Weak" },
  { to: 84, color: "var(--fd-chart-warning)", label: "Fair" },
  { to: 100, color: "var(--fd-chart-good)", label: "Strong" },
] as const;

export function FiguresSection() {
  const [stale, setStale] = useState(false);
  return (
    <Section
      id="figures"
      eyebrow="Figures"
      title="When the answer is a number, the chart gets out of the way."
      description="Sparklines for tiles and rows, a donut for part-to-whole at a glance, score rings that print the band as a letter and a word, a gauge, and the typical-earnings range bar that always sits beside a top earner."
    >
      <Cols className="items-start">
        <Panel title="Sparklines" note="12 points, de-emphasis grey with the current period in the accent, a ringed end dot, one wipe on first view. Brands see accent or neutral; creators see mint for money.">
          <div className="grid gap-4 sm:grid-cols-2">
            {TILES.map((tile) => (
              <div key={tile.label} className="grid gap-2 rounded-2xl bg-surface-field p-4">
                <p className="text-caption font-medium text-fg-muted">{tile.label}</p>
                <p className="font-display text-figure-lg text-fg">{tile.value}</p>
                <Sparkline data={tile.data} tone={tile.tone} height={38} label={`${tile.label}, 12 week trend`} />
                <p className="text-micro text-fg-subtle">{tile.delta}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 rounded-2xl bg-surface-field p-4">
            <p className="text-caption font-medium text-fg-muted">Creator wallet · cleared this week</p>
            <Money cents={128460} size="lg" state="cleared" />
            <Sparkline data={sparkSets.earnings} tone="mint" area height={44} label="Cleared earnings, last 12 days" />
          </div>
        </Panel>

        <Donut
          title="Spend by app"
          subtitle="Part-to-whole · six segments at most, the tail folds into Other"
          summary="Nap Nest is 39 percent of spend, Fernlingo 26 percent and Loafly 16 percent; four smaller apps are grouped as Other."
          segments={spendShare}
          format={(cents) => formatCents(cents, true)}
          centerValue="$32.3K"
          centerLabel="spent in 30 days"
          maxSegments={4}
        />

        <Panel title="Score rings" note="Checklist scores: the band is a letter and a word, with detent ticks at 40, 55, 70 and 85. The ring sweeps once.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            <ScoreRing name="Hook Score" score={92} size={120} checklist={false} />
            <ScoreRing name="Hook Score" score={78} size={120} checklist={false} />
            <ScoreRing name="Hook Score" score={61} size={120} checklist={false} />
            <ScoreRing name="Hook Score" score={47} size={120} checklist={false} />
            <ScoreRing name="Hook Score" score={28} size={120} checklist={false} />
            <ScoreRing name="Flow Score" score={84} size={120} caption="Move the app reveal from 0:14 to 0:03." />
          </div>
          <Row>
            <span className="text-caption text-fg-subtle">Day-one scores say what they are:</span>
          </Row>
          <ScoreRing name="Hook Score" score={78} size={156} caption="Strong open. App shows at 0:14." />
        </Panel>

        <Panel title="Gauges and the typical range" note="One ratio against a range, and the earnings range that always shows the median beside the top earner.">
          <div className="grid gap-6 sm:grid-cols-2">
            <Gauge name="Approval rate" value={87} target={80} format={(value) => `${Math.round(value)}%`} targetLabel="Target 80%" width={200} />
            <Gauge name="Brand reliability" value={92} zones={RELIABILITY} format={(value) => `${Math.round(value)}`} width={200} caption="Pay speed, decisions on time, work actually run." />
          </div>
          <RangeBar label="Typical creator, last 30 days" low={3800} median={6200} high={14000} top={194000} topLabel="Top earner" />
          <RangeBar label="Typical on this bounty" low={3800} median={6200} high={14000} />
        </Panel>
      </Cols>

      <Cols className="items-start">
        <LineChart
          title="Refetch keeps the frame"
          subtitle="While data reloads the previous render stays, dimmed. No skeleton, no layout jump."
          summary="Cleared earnings per day over 30 days, shown while a refetch is in flight."
          series={[{ id: "cleared", label: "Cleared", points: clearedDaily }]}
          legend={false}
          stale={stale}
          yFormat={(cents) => formatCents(cents, true)}
          yTooltipFormat={(cents) => formatCents(cents)}
          actions={<Switch aria-label="Simulate a refetch" label="Refetching" checked={stale} onCheckedChange={setStale} />}
          height={240}
        />
        <div className="grid gap-5">
          <LineChart title="Loading" summary="A chart that is loading." series={[]} state="loading" height={150} />
          <LineChart
            title="Empty"
            summary="A chart with nothing to plot yet."
            series={[]}
            state="empty"
            empty={{ title: "No views counted yet", description: "Your first post's views appear 72 hours after it goes live.", action: <Button size="sm" variant="secondary">Browse bounties</Button> }}
            height={150}
          />
          <LineChart title="Error" summary="A chart that failed to load." series={[]} state="error" empty={{ title: "The chart could not load", description: "Your numbers are safe. Try again in a moment." }} height={150} />
        </div>
      </Cols>

      <Panel title="Colour discipline" note="The categorical order is fixed per entity; the ninth series never gets a generated hue. Slot 1 azure, 2 ember, 3 lagoon, 4 rose, 5 violet, 6 sun, 7 magenta, 8 green.">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 9 }, (_, index) => (
            <Spec key={index} caption={index < 8 ? `Slot ${index + 1}` : "9th: Other (grey)"}>
              <span
                aria-hidden="true"
                className="block h-8 w-16 rounded-[4px]"
                style={{ background: index < 8 ? `var(--fd-chart-${index + 1})` : "var(--fd-fg-subtle)", opacity: index < 8 ? 1 : 0.5 }}
              />
            </Spec>
          ))}
        </div>
      </Panel>
    </Section>
  );
}
