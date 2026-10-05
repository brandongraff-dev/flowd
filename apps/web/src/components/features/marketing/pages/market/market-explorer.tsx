"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Flame, Snowflake, Thermometer, Users } from "lucide-react";
import type { Category } from "@/lib/contract/types";
import { formatCpm, formatHours, formatInt, formatMoney, formatPct, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { AppIcon } from "@/components/brand/app-icon";
import { RangeBand, formatCents } from "@/components/charts";
import { DemoTag } from "@/components/shell/demo-banner";
import { Callout, Chip, ChipGroup, Progress, StatusPill } from "@/components/ui";
import { ArrowLink, FactCard, PageSection } from "../kit";
import type { MarketBounty, MarketCategory } from "./market-data";

const URL_KEY = "category";

const dayMs = 86_400_000;

function ChangeLine({ value, trend }: { value: number; trend: MarketCategory["trend"] }) {
  const Icon = trend === "rising" ? ArrowUpRight : trend === "falling" ? ArrowDownRight : ArrowRight;
  const words = trend === "steady" ? "Steady over 7 days" : `${trend === "rising" ? "Up" : "Down"} ${formatPct(Math.abs(value), 0)} over 7 days`;
  return (
    <p className="flex items-center gap-2 text-body font-medium text-fg">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-surface-active text-fg [&_svg]:size-4 [&_svg]:stroke-2">
        <Icon />
      </span>
      <span>{words}</span>
      {trend !== "steady" ? <span className="text-body-sm font-normal text-fg-subtle">({formatSignedPct(value, 0)})</span> : null}
    </p>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className="fd-figure text-figure-md text-fg">{value}</dd>
      {note ? <dd className="text-caption text-fg-subtle">{note}</dd> : null}
    </div>
  );
}

const HEAT: Record<MarketCategory["heat"]["level"], { label: string; Icon: typeof Flame }> = {
  cool: { label: "Cool", Icon: Snowflake },
  warm: { label: "Warm", Icon: Thermometer },
  hot: { label: "Hot", Icon: Flame },
};

function rateLabel(bounty: MarketBounty): string {
  const parts: string[] = [];
  if (bounty.cpmCents > 0) parts.push(formatCpm(bounty.cpmCents));
  if (bounty.cpaInstallCents > 0) parts.push(`${formatMoney(bounty.cpaInstallCents)} per install`);
  if (bounty.cpaTrialCents > 0) parts.push(`${formatMoney(bounty.cpaTrialCents)} per trial`);
  if (bounty.cpaPaidCents > 0) parts.push(`${formatMoney(bounty.cpaPaidCents)} per paid`);
  return parts.length > 0 ? parts.join(" + ") : "Flat fee per video";
}

function BountyRow({ bounty }: { bounty: MarketBounty }) {
  const left = Math.max(0, Math.round((1 - bounty.fillRatio) * 100));
  return (
    <li>
      <Link
        href={`/b/${bounty.id}`}
        className="group grid gap-4 rounded-3xl p-4 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,15rem)] sm:items-center sm:gap-5 sm:p-5"
      >
        <AppIcon art={bounty.appArt} name={bounty.appName} size={52} decorative />
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="font-display text-title-sm text-fg">{bounty.title}</p>
            <StatusPill status="funded" size="md" />
          </div>
          <p className="text-body-sm text-fg-muted">
            {bounty.appName} · {bounty.brandName}
            {bounty.brandVerified ? " (verified brand)" : ""} · {bounty.typeLabel}
          </p>
          <p className="text-body-sm font-semibold text-fg">{rateLabel(bounty)}</p>
          <p className="text-caption text-fg-subtle">
            Up to {formatMoney(bounty.perVideoCapCents, { cents: "auto" })} per video{bounty.decidesIn ? ` · ${bounty.decidesIn}` : ""} · closes in {formatHours(bounty.hoursLeft)}
          </p>
        </div>
        <div className="grid gap-2">
          <Progress value={left} tone="mint" size="sm" aria-label="Pool left" valueText={`${left}% of the pool left, ${formatMoney(bounty.budgetLeftCents, { cents: "never" })}`} />
          <p className="flex items-baseline justify-between gap-3 text-caption text-fg-muted">
            <span>
              <span className="font-semibold text-fg tabular-nums">{formatMoney(bounty.budgetLeftCents, { cents: "never" })}</span> left
            </span>
            <span>
              <span className="font-semibold text-fg tabular-nums">{formatInt(bounty.spotsLeft)}</span> {bounty.spotsLeft === 1 ? "spot" : "spots"}
            </span>
          </p>
        </div>
      </Link>
    </li>
  );
}

export interface MarketExplorerProps {
  categories: readonly MarketCategory[];
  initial: Category;
  /** The demo world's now (ISO), for the stale-data check. */
  now: string;
}

/**
 * The live public market: a category selector (kept in the URL as `?category=`), the clearing CPM with its middle half and 7-day change in
 * neutral arrows (a price, not a score: no green and red), the p25 to p75 band over 60 days, supply beside demand, the open funded bounties and
 * the hook types converting best. Thin categories say "few trades"; data older than two days says so.
 */
export function MarketExplorer({ categories, initial, now }: MarketExplorerProps) {
  const [selected, setSelected] = useState<Category>(initial);
  const current = categories.find((item) => item.category === selected) ?? categories[0];

  const select = (category: Category): void => {
    setSelected(category);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(URL_KEY, category);
      window.history.replaceState(null, "", url);
    } catch {
      // A blocked history API only loses the shareable URL.
    }
  };

  const chartData = useMemo(
    () => (current ? current.series.map((point) => ({ x: new Date(`${point.date}T00:00:00Z`), p25: point.p25, median: point.median, p75: point.p75 })) : []),
    [current],
  );

  if (!current) return null;
  const staleDays = Math.floor((Date.parse(now) - Date.parse(`${current.asOf}T00:00:00Z`)) / dayMs);
  const stale = Number.isFinite(staleDays) && staleDays >= 2;
  const heat = HEAT[current.heat.level];
  const creatorsPerBounty = current.supply.openBounties > 0 ? current.supply.creators / current.supply.openBounties : null;
  const asOfLabel = new Date(`${current.asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageSection
        id="prices"
        eyebrow="Clearing price"
        title="What a view costs, by category"
        description="The clearing CPM is the median rate paid per 1,000 verified views on recent funded bounties. The shaded band is the middle half of trades."
      >
        <div className="grid gap-6">
          <ChipGroup aria-label="Category" className="-mx-1 flex-nowrap overflow-x-auto px-1 pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
            {categories.map((item) => (
              <Chip key={item.category} selected={item.category === selected} onSelectedChange={() => select(item.category)} count={item.thin ? "few trades" : undefined}>
                {item.label}
              </Chip>
            ))}
          </ChipGroup>

          <p className="sr-only" role="status" aria-live="polite">
            {`${current.label}: clearing CPM ${formatCpm(current.clearingCents, "bare")} per 1,000 verified views. ${current.trend === "steady" ? "Steady" : current.trend === "rising" ? "Up" : "Down"} over 7 days.`}
          </p>

          <GlassCard padding="lg" className="grid gap-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-12">
            <div className="grid content-start gap-6">
              <div className="grid gap-1">
                <p className="fd-eyebrow text-fg-subtle">Clearing CPM · {current.label}</p>
                <p className="fd-figure text-figure-hero text-fg">{formatCpm(current.clearingCents, "bare")}</p>
                <p className="text-body-sm text-fg-muted">per 1,000 verified views, median of recent trades</p>
              </div>
              <ChangeLine value={current.change7d} trend={current.trend} />
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Middle half of trades" value={`${formatCpm(current.p25Cents, "bare")} to ${formatCpm(current.p75Cents, "bare")}`} />
                <Stat label="30-day change" value={formatSignedPct(current.change30d, 0)} />
                <Stat label="Median time to fill" value={formatHours(current.medianFillHours)} />
                <Stat label="Median views per post" value={formatInt(Math.round(current.medianViews))} />
              </dl>
              {current.thin ? (
                <Callout tone="sun" title="Few trades in this category">
                  Only {current.sampleN} comparable bounties set this price, so treat it as a guide, not a quote. It firms up as more settle.
                </Callout>
              ) : null}
              {stale ? (
                <Callout tone="info" title={`Last updated ${asOfLabel}`}>
                  Prices may have moved since. The market refreshes daily when bounties settle.
                </Callout>
              ) : null}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-fg-subtle">
                <span>
                  As of {asOfLabel}, from {current.sampleN} settled trades.
                </span>
                <DemoTag />
              </p>
            </div>

            <RangeBand
              bare
              data={chartData}
              medianLabel="Clearing CPM (median)"
              bandLabel="Middle half of trades (25th to 75th percentile)"
              summary={`${current.label} clearing CPM is ${formatCents(current.clearingCents)} per 1,000 verified views, ${current.trend === "steady" ? "steady" : current.trend === "rising" ? "up" : "down"} ${formatPct(Math.abs(current.change7d), 0)} over 7 days. The middle half of trades sits between ${formatCents(current.p25Cents)} and ${formatCents(current.p75Cents)}.`}
              yFormat={(cents) => formatCents(cents)}
              yTooltipFormat={(cents) => `${formatCents(cents)} per 1,000`}
              yAxisTitle="Per 1,000 verified views"
              height={300}
            />
          </GlassCard>

          <div className="grid gap-4 md:grid-cols-2">
            <FactCard>
              <p className="fd-eyebrow text-fg-subtle">Supply and demand</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <p className="fd-figure text-figure-lg text-fg">{formatInt(current.supply.creators)}</p>
                  <p className="text-body-sm text-fg-muted">creators with a matching niche</p>
                </div>
                <div className="grid gap-1">
                  <p className="fd-figure text-figure-lg text-fg">{formatInt(current.supply.openBounties)}</p>
                  <p className="text-body-sm text-fg-muted">open funded bounties, {formatMoney(current.supply.openBudgetCents, { cents: "never" })} in escrow</p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-body-sm text-fg-muted">
                <Users aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                {creatorsPerBounty === null ? "No open bounties right now." : `About ${creatorsPerBounty < 10 ? creatorsPerBounty.toFixed(1) : Math.round(creatorsPerBounty)} creators for each open bounty. ${formatInt(current.supply.submissions7d)} videos were submitted in the last 7 days.`}
              </p>
            </FactCard>
            <FactCard>
              <div className="flex items-center justify-between gap-3">
                <p className="fd-eyebrow text-fg-subtle">Market heat</p>
                <span className={cn("inline-flex items-center gap-1.5 rounded-pill bg-surface-hover px-2.5 py-1 text-caption font-semibold text-fg [&_svg]:size-3.5")}>
                  <heat.Icon aria-hidden="true" strokeWidth={2} />
                  {heat.label}
                </span>
              </div>
              <p className="text-body text-fg">{current.heat.forCreators}</p>
              <p className="text-body-sm text-fg-muted">For brands: {current.heat.forBrands}</p>
            </FactCard>
          </div>
        </div>
      </PageSection>

      <PageSection
        id="bounties"
        eyebrow={`Open now · ${current.label}`}
        title="Funded bounties you can join today"
        description="Every bounty here is fully escrowed, with its rate, spots and the brand's usual decision time up front."
        actions={<ArrowLink href="/signup/creator">Create a creator account</ArrowLink>}
      >
        {current.bounties.length > 0 ? (
          <GlassCard padding="none" className="overflow-hidden p-2 sm:p-3">
            <ul className="grid">{current.bounties.map((bounty) => <BountyRow key={bounty.id} bounty={bounty} />)}</ul>
          </GlassCard>
        ) : (
          <GlassCard padding="lg">
            <p className="font-display text-title-md text-fg">No open bounties in {current.label} right now</p>
            <p className="mt-1 max-w-[52ch] text-body-sm text-fg-muted">New funded bounties appear here the moment they go live. Pick another category, or create an account to be told when one opens.</p>
          </GlassCard>
        )}
      </PageSection>

      <PageSection
        id="hooks"
        eyebrow={`Top hooks · ${current.label}`}
        title="Hook types converting best this week"
        description="The share of installs that start a trial, by hook type, on settled posts in this category."
      >
        {current.hooks.length > 0 ? (
          <GlassCard padding="lg" className="grid gap-6">
            <ul className="grid gap-5">
              {current.hooks.map((hook) => {
                const max = Math.max(0.01, ...current.hooks.map((item) => item.trialRate ?? 0));
                const width = hook.trialRate === null ? 0 : Math.max(4, Math.round((hook.trialRate / max) * 100));
                const small = hook.trialRate === null || hook.posts < 5;
                return (
                  <li key={hook.type} className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_9rem] sm:items-center sm:gap-5">
                    <p className="text-body-sm font-semibold text-fg">{hook.label}</p>
                    <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-pill bg-surface-hover">
                      <div className="h-full rounded-pill bg-(--fd-chart-1)" style={{ width: `${width}%` }} />
                    </div>
                    <p className="text-body-sm text-fg-muted sm:text-right">
                      <span className="font-semibold text-fg tabular-nums">{hook.trialRate === null ? "Not enough data" : formatPct(hook.trialRate, 1)}</span>
                      <span className="text-fg-subtle"> · {hook.posts} {hook.posts === 1 ? "post" : "posts"}{small && hook.trialRate !== null ? ", small sample" : ""}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="text-caption text-fg-subtle">Trials per install on settled posts. Hook types are labelled by the checklist, so a small sample is flagged rather than ranked as a winner.</p>
          </GlassCard>
        ) : (
          <GlassCard padding="lg">
            <p className="font-display text-title-md text-fg">Not enough settled posts yet</p>
            <p className="mt-1 max-w-[52ch] text-body-sm text-fg-muted">Hook rankings appear once enough posts in {current.label} have cleared. Until then we show nothing rather than guess.</p>
          </GlassCard>
        )}
      </PageSection>
    </>
  );
}
