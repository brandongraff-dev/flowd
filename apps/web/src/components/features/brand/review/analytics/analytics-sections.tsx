"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { CONVERSION_SOURCE_META, FORMAT_ID_META, HOOK_TYPE_META, PLATFORM_META, type ConversionSource, type FormatId, type HookType, type Platform } from "@/lib/contract/types";
import type { Cohort, FunnelView, LeagueRow } from "@/lib/data/selectors";
import type { RoasMaturity } from "@/lib/engine";
import { formatCompact, formatCostPer, formatIsoWeek, formatMoney, formatMultiple, formatPct, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarChart, FunnelChart, LineChart, type FunnelStage } from "@/components/charts";
import { ArtAvatar, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { KpiRow, StatCard } from "@/components/shell/stat-card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button-variants";

const MATURITY: Record<RoasMaturity, { label: string; tone: "info" | "accent" | "violet" }> = {
  early_signal: { label: "Early signal", tone: "info" },
  decision: { label: "Decision window", tone: "accent" },
  long_term: { label: "Long term", tone: "violet" },
};

/** Tracked (a flowd link or code: what CPA pays on) or Estimated (modelled; never paid). Every conversion figure wears one. */
export function KindChip({ kind, size = "sm" }: { kind: "tracked" | "estimated"; size?: "sm" | "md" }) {
  return (
    <Badge tone={kind === "tracked" ? "mint" : "info"} size={size} variant={kind === "tracked" ? "soft" : "outline"} title={kind === "tracked" ? "Counted from a flowd link or code. CPA bonuses pay on this." : "Modelled from store or survey data. Never used to pay a bonus."}>
      {kind === "tracked" ? "Tracked" : "Estimated"}
    </Badge>
  );
}

// ── headline numbers ───────────────────────────────────────────────────────────────────────────

export function KpiStrip({ funnel, ready }: { funnel: FunnelView; ready: boolean }) {
  const s = funnel.stats;
  const d30 = s.roas[30];
  return (
    <KpiRow columns={4}>
      <StatCard label="Spend" cents={funnel.cost_cents} hint={`${pluralise(funnel.posts, "post")} · creator pay and fees`} loading={!ready} />
      <StatCard
        label="Cost per trial"
        value={s.cost_per_trial_cents === null ? "Not enough data" : formatMoney(s.cost_per_trial_cents)}
        hint={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <KindChip kind="tracked" /> {funnel.counts.trials} trials
          </span>
        }
        loading={!ready}
      />
      <StatCard
        label="Cost per paid (CAC)"
        value={s.cost_per_paid_cents === null ? "Not enough data" : formatMoney(s.cost_per_paid_cents)}
        hint={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <KindChip kind="tracked" /> {funnel.counts.paid} paid
          </span>
        }
        loading={!ready}
      />
      <StatCard
        label="ROAS at day 30"
        value={funnel.loading ? "…" : cost0(funnel) ? "No spend yet" : formatMultiple(s.roas_d30)}
        hint={
          funnel.loading ? undefined : (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Badge size="sm" tone={MATURITY[d30.maturity].tone} variant="outline">
                {MATURITY[d30.maturity].label}
              </Badge>
              {d30.mature ? "final" : `to date: posts are ${funnel.observed_days.min} to ${funnel.observed_days.max} days old`}
              {s.payback_day !== null ? ` · paid back by day ${s.payback_day}` : " · not paid back yet"}
            </span>
          )
        }
        loading={!ready}
      />
    </KpiRow>
  );
}

const cost0 = (f: FunnelView): boolean => f.cost_cents === 0;

// ── the funnel ─────────────────────────────────────────────────────────────────────────────────

export function FunnelSection({ funnel }: { funnel: FunnelView }) {
  const s = funnel.stats;
  const detail: Record<string, string> = {
    views: s.cpm_effective_cents === null ? "" : `${formatMoney(s.cpm_effective_cents)} per 1,000 views`,
    clicks: formatCostPer(s.cost_per_click_cents, "click"),
    installs: formatCostPer(s.cost_per_install_cents, "install"),
    trials: formatCostPer(s.cost_per_trial_cents, "trial"),
    paid: formatCostPer(s.cost_per_paid_cents, "paid conversion"),
  };
  const stages: FunnelStage[] = funnel.steps.map((step) => ({
    id: step.key,
    label: step.key === "clicks" ? "Clicks" : step.key === "paid" ? "Paid" : step.key === "views" ? "Views" : step.key === "installs" ? "Installs" : "Trials",
    value: step.value,
    kind: "tracked",
    note: step.key === "views" ? "Verified views, after the 72-hour fraud check" : step.key === "clicks" ? "Taps on your tracking links and code lookups" : "Counted from a tracking link or an offer code",
    detail: detail[step.key],
  }));
  const noteFor = (toId: string): string | undefined => funnel.steps.find((x) => x.key === toId)?.rate?.note;
  const counts = funnel.counts;
  return (
    <div className="grid gap-6">
      <FunnelChart
        title="Views to paid"
        subtitle={`${pluralise(funnel.posts, "post")} in this view · tracked counts only`}
        summary={`${formatCompact(counts.views)} verified views led to ${formatCompact(counts.clicks)} clicks, ${counts.installs.toLocaleString("en-US")} installs, ${counts.trials.toLocaleString("en-US")} trials and ${counts.paid.toLocaleString("en-US")} paid subscriptions, all tracked.`}
        stages={stages}
        stepLabel={(from, to, rate) => noteFor(to.id) ?? `${formatPct(rate, rate < 0.1 ? 2 : 1)} of ${from.label.toLowerCase()} became ${to.label.toLowerCase()}`}
        footer="CPA bonuses pay only on Tracked results. Estimated figures are for context and never move money."
        state={funnel.posts === 0 ? "empty" : "ready"}
        empty={{ title: "No settled posts match", description: "Widen the date range or clear a filter. Posts show up here once their 72-hour window has closed." }}
      />
      <TrackedVsEstimated funnel={funnel} />
    </div>
  );
}

function TrackedVsEstimated({ funnel }: { funnel: FunnelView }) {
  const rows = [
    { key: "installs", label: "Installs", tracked: funnel.tracked.installs, estimated: funnel.estimated.installs },
    { key: "trials", label: "Trials started", tracked: funnel.tracked.trials, estimated: funnel.estimated.trials },
    { key: "paid", label: "Paid conversions", tracked: funnel.tracked.paid, estimated: funnel.estimated.paid },
  ];
  return (
    <GlassCard padding="lg" className="grid gap-5">
      <header className="grid gap-1">
        <h3 className="font-display text-title-md text-fg">Tracked and estimated, side by side</h3>
        <p className="max-w-[64ch] text-body-sm text-fg-muted">Tracked counts come from a flowd link or code, so they are certain and they are what CPA pays on. Estimated counts come from store matches, surveys and modelling: useful context, never mixed in.</p>
      </header>
      <table className="w-full border-separate border-spacing-0 text-left text-body-sm">
        <caption className="sr-only">Installs, trials and paid conversions, tracked and estimated</caption>
        <thead>
          <tr className="text-micro font-semibold text-fg-muted">
            <th scope="col" className="border-b border-divider py-2.5 pr-4 text-left">Stage</th>
            <th scope="col" className="border-b border-divider px-4 py-2.5 text-right">
              <span className="inline-flex items-center gap-2"><KindChip kind="tracked" /></span>
            </th>
            <th scope="col" className="border-b border-divider px-4 py-2.5 text-right">
              <span className="inline-flex items-center gap-2"><KindChip kind="estimated" /></span>
            </th>
            <th scope="col" className="border-b border-divider py-2.5 pl-4 text-right">Share tracked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.tracked + r.estimated;
            return (
              <tr key={r.key}>
                <th scope="row" className="border-b border-divider py-3 pr-4 text-left font-medium text-fg">{r.label}</th>
                <td className="border-b border-divider px-4 py-3 text-right font-semibold text-fg tabular-nums">{r.tracked.toLocaleString("en-US")}</td>
                <td className="border-b border-divider px-4 py-3 text-right text-fg-muted tabular-nums">{r.estimated.toLocaleString("en-US")}</td>
                <td className="border-b border-divider py-3 pl-4 text-right text-fg-muted tabular-nums">{total === 0 ? "None yet" : formatPct(r.tracked / total, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassCard>
  );
}

// ── ROAS and payback ───────────────────────────────────────────────────────────────────────────

export function RoasSection({ funnel }: { funnel: FunnelView }) {
  const s = funnel.stats;
  const horizons = [7, 14, 30, 60, 90] as const;
  const points = horizons.map((d) => ({ x: d, y: s.roas[d].value, estimated: !s.roas[d].mature }));
  const payback = s.payback_day;
  const markers = payback !== null && payback >= 7 && payback <= 90 ? [{ id: "payback", x: payback, y: 1, label: `Paid back on day ${payback}` }] : [];
  return (
    <div className="grid gap-4">
      {funnel.loading ? (
        <GlassCard padding="lg" aria-hidden="true">
          <Skeleton className="h-72 w-full" />
        </GlassCard>
      ) : cost0(funnel) ? (
        <GlassCard padding="lg">
          <p className="text-body-sm text-fg-muted">There is no spend in this view yet, so there is nothing to pay back.</p>
        </GlassCard>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Return on ad spend by day">
            {horizons.map((d) => {
              const p = s.roas[d];
              const m = MATURITY[p.maturity];
              return (
                <li key={d}>
                  <GlassCard padding="md" className="grid h-full content-between gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption font-semibold text-fg-muted">Day {d}</span>
                      <Badge size="sm" tone={m.tone} variant="outline">{m.label}</Badge>
                    </div>
                    <p className="font-display text-figure-lg tabular-nums text-fg">{formatMultiple(p.value)}</p>
                    <p className="text-caption text-fg-subtle">{p.mature ? "final for this group" : "to date: the group is younger"} · {formatMoney(p.revenue_cents)} back</p>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
          <LineChart
            title="Return on ad spend over time"
            subtitle="Tracked revenue divided by what you paid. Above 1× the posts have paid for themselves."
            summary={`ROAS is ${formatMultiple(s.roas[7].value)} at day 7, ${formatMultiple(s.roas[30].value)} at day 30 and ${formatMultiple(s.roas[90].value)} at day 90, ${payback !== null ? `paying back on day ${payback}` : "not yet paid back"}.`}
            series={[{ id: "roas", label: "ROAS", points }]}
            references={[{ y: 1, label: "Break-even", tone: "neutral" }]}
            markers={markers}
            xScale="sqrt"
            xTicks={[7, 14, 30, 60, 90]}
            xFormat={(x) => `Day ${String(x)}`}
            xTooltipFormat={(x) => `Day ${String(x)} after posting`}
            yFormat={(v) => formatMultiple(v)}
            yAxisTitle="ROAS"
            height={260}
            curve="monotone"
            dots
            footer="Dotted points are to date: the youngest posts in this view have not lived that long yet. Day 7 is an early signal; day 30 is the decision window."
          />
        </>
      )}
    </div>
  );
}

// ── creator league ─────────────────────────────────────────────────────────────────────────────

export function LeagueSection({ funnel }: { funnel: FunnelView }) {
  const router = useRouter();
  const rows = funnel.league;
  const median = useMemo(() => {
    const costs = rows.filter((r) => r.cost_cents > 0).map((r) => r.cost_per_trial_cents).filter((c): c is number => c !== null).sort((a, b) => a - b);
    if (costs.length === 0) return null;
    const mid = Math.floor(costs.length / 2);
    return costs.length % 2 ? (costs[mid] as number) : Math.round(((costs[mid - 1] as number) + (costs[mid] as number)) / 2);
  }, [rows]);
  const best = rows.find((r) => r.cost_per_trial_cents !== null && r.cost_cents > 0);

  const columns: DataColumn<LeagueRow>[] = [
    {
      id: "creator",
      header: "Creator",
      label: "Creator",
      sticky: true,
      minWidth: "14rem",
      card: "title",
      cell: (r) =>
        r.creator ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <ArtAvatar art={r.creator.avatar} name={`@${r.creator.handle}`} size={28} decorative />
            <span className="grid min-w-0">
              <span className="truncate font-medium text-fg">@{r.creator.handle}</span>
              <span className="truncate text-caption text-fg-subtle">{r.n} {r.n === 1 ? "post" : "posts"}</span>
            </span>
            <TierBadge tier={r.creator.tier} size={18} glow={false} />
          </span>
        ) : (
          <span className="text-fg-muted">{r.key}</span>
        ),
    },
    { id: "views", header: "Views", align: "end", card: "meta", sortValue: (r) => r.funnel.views, cell: (r) => formatCompact(r.funnel.views) },
    { id: "installs", header: "Installs", align: "end", card: "meta", sortValue: (r) => r.funnel.installs, cell: (r) => r.funnel.installs.toLocaleString("en-US") },
    { id: "trials", header: "Trials", align: "end", card: "meta", sortValue: (r) => r.funnel.trials, cell: (r) => r.funnel.trials.toLocaleString("en-US") },
    { id: "rate", header: "Trial rate", align: "end", card: "meta", hideBelow: "md", sortValue: (r) => (r.funnel.installs >= 20 ? r.trial_rate : null), cell: (r) => (r.funnel.installs >= 20 && r.trial_rate !== null ? formatPct(r.trial_rate, 1) : <span className="text-fg-subtle" title="Needs 20 installs to show a reliable rate">n/a</span>) },
    { id: "cpt", header: "Cost per trial", align: "end", card: "value", sortValue: (r) => r.cost_per_trial_cents, cell: (r) => <span className={cn("font-semibold", r === best ? "text-fg" : "text-fg-muted")}>{r.cost_per_trial_cents === null || r.cost_cents === 0 ? <span className="font-normal text-fg-subtle">n/a</span> : formatMoney(r.cost_per_trial_cents)}</span> },
    { id: "roas", header: "ROAS D30", align: "end", card: "meta", hideBelow: "lg", sortValue: (r) => r.roas_d30, cell: (r) => (r.roas_d30 === null ? <span className="text-fg-subtle">…</span> : formatMultiple(r.roas_d30)) },
  ];

  return (
    <div className="grid gap-3">
      <DataTable
        caption="Creator league: creators ranked by cost per trial"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.key}
        getRowLabel={(r) => (r.creator ? `@${r.creator.handle}` : r.key)}
        manualSort
        density="comfortable"
        onRowClick={(r) => {
          if (r.creator) router.push(`/brand/creators/${r.creator.handle}`);
        }}
        loading={funnel.loading && rows.length === 0}
        empty={{ art: "chart", title: "No creators in this view yet", description: "Creators appear here once their posts have settled. Judge them on cost per trial, not views." }}
      />
      <p className="px-1 text-caption text-fg-subtle">
        Ranked by cost per trial, cheapest first, because views do not pay your bills.
        {median !== null && best?.cost_per_trial_cents !== undefined && best.cost_per_trial_cents !== null ? ` The median creator costs ${formatMoney(median)} a trial; the best costs ${formatMoney(best.cost_per_trial_cents)}.` : ""} Trial rate needs 20 installs to be shown.
      </p>
    </div>
  );
}

// ── hooks, formats, platforms, bounties ────────────────────────────────────────────────────────

type Cut = "hook" | "format" | "platform" | "bounty";

export function BreakdownSection({ funnel }: { funnel: FunnelView }) {
  const [cut, setCut] = useState<Cut>("hook");
  const source = cut === "hook" ? funnel.by_hook_type : cut === "format" ? funnel.by_format : cut === "platform" ? funnel.by_platform : funnel.by_bounty;
  const label = (key: string, title?: string): string => {
    if (cut === "hook") return HOOK_TYPE_META[key as HookType]?.label ?? key;
    if (cut === "format") return FORMAT_ID_META[key as FormatId]?.label ?? key;
    if (cut === "platform") return PLATFORM_META[key as Platform]?.label ?? key;
    return title ?? key;
  };
  const rows = source
    .filter((r) => r.trial_rate !== null && r.funnel.installs >= 20)
    .map((r) => ({ key: r.key, label: `${label(r.key, "title" in r ? (r.title as string | undefined) : undefined)}${r.n < 3 ? ` (${r.n})` : ""}`, rate: Math.round((r.trial_rate ?? 0) * 1000) / 10, n: r.n }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);
  const hidden = source.length - rows.length;
  const thin = rows.filter((r) => r.n < 3).length;
  return (
    <div className="grid gap-4">
      <SegmentedControl
        aria-label="Cut the funnel by"
        size="sm"
        value={cut}
        onValueChange={setCut}
        options={[
          { value: "hook", label: "Hook type" },
          { value: "format", label: "Format" },
          { value: "platform", label: "Platform" },
          { value: "bounty", label: "Bounty" },
        ]}
      />
      <BarChart
        title="Trial rate"
        subtitle="Trials per install, tracked, best first"
        summary={rows.length === 0 ? "Not enough installs in any group to compare." : `${rows[0]?.label} converts best at ${rows[0]?.rate}% of installs to trials; ${rows.length} groups are compared.`}
        data={rows.map((r) => ({ label: r.label, values: { rate: r.rate } }))}
        series={[{ id: "rate", label: "Trial rate" }]}
        orientation="horizontal"
        valueFormat={(v) => `${v.toFixed(1)}%`}
        highlight={rows[0]?.label}
        categoryLabel="Group"
        state={rows.length === 0 ? "empty" : "ready"}
        empty={{ title: "Not enough installs to compare", description: "A group needs 20 tracked installs before its trial rate is shown." }}
        footer={`${hidden > 0 ? `${hidden} ${hidden === 1 ? "group has" : "groups have"} fewer than 20 installs and ${hidden === 1 ? "is" : "are"} left out. ` : ""}${thin > 0 ? "A number in brackets is how many posts the bar is based on: treat small ones as a hint, not a result." : "Every bar is based on three posts or more."}`}
      />
    </div>
  );
}

// ── weekly cohorts ─────────────────────────────────────────────────────────────────────────────

export function CohortSection({ funnel }: { funnel: FunnelView }) {
  const columns: DataColumn<Cohort>[] = [
    { id: "week", header: "Posted in", label: "Posted in", card: "title", sticky: true, minWidth: "9rem", cell: (c) => <span className="font-medium text-fg">{formatIsoWeek(c.week)}</span> },
    { id: "posts", header: "Posts", align: "end", card: "meta", cell: (c) => String(c.posts) },
    { id: "views", header: "Views", align: "end", card: "meta", hideBelow: "md", cell: (c) => formatCompact(c.funnel.views) },
    { id: "installs", header: "Installs", align: "end", card: "meta", cell: (c) => c.funnel.installs.toLocaleString("en-US") },
    { id: "trials", header: "Trials", align: "end", card: "meta", cell: (c) => c.funnel.trials.toLocaleString("en-US") },
    { id: "spend", header: "Spend", align: "end", card: "meta", hideBelow: "lg", cell: (c) => formatMoney(c.cost_cents) },
    { id: "cpt", header: "Cost per trial", align: "end", card: "value", cell: (c) => <span className="font-semibold">{c.cost_per_trial_cents === null ? "n/a" : formatMoney(c.cost_per_trial_cents)}</span> },
    { id: "d7", header: "ROAS D7", align: "end", card: "meta", cell: (c) => (c.roas_d7 === null ? <span className="text-fg-subtle">…</span> : formatMultiple(c.roas_d7)) },
    { id: "d30", header: "ROAS D30", align: "end", card: "meta", cell: (c) => (c.roas_d30 === null ? <span className="text-fg-subtle">…</span> : formatMultiple(c.roas_d30)) },
  ];
  return (
    <div className="grid gap-3">
      <DataTable
        caption="Weekly posting cohorts"
        columns={columns}
        rows={[...funnel.cohorts].reverse()}
        getRowId={(c) => c.week}
        getRowLabel={(c) => formatIsoWeek(c.week)}
        density="comfortable"
        loading={funnel.loading && funnel.cohorts.length === 0}
        empty={{ art: "chart", title: "No cohorts yet", description: "Each week of posting becomes a cohort once its posts settle." }}
      />
      <p className="px-1 text-caption text-fg-subtle">A cohort is every post made in one week. Read across a row to see how fast that week paid back; younger weeks show ROAS to date.</p>
    </div>
  );
}

// ── attribution mix and coverage ───────────────────────────────────────────────────────────────

const SOURCES: readonly ConversionSource[] = ["link", "code", "mmp", "survey", "modelled"];

export function AttributionSection({ funnel }: { funnel: FunnelView }) {
  const bySource = funnel.by_source;
  const rows = SOURCES.map((src) => {
    const k = bySource?.[src];
    return { src, installs: k?.installs ?? 0, trials: k?.trials ?? 0, paid: k?.paid ?? 0, total: (k?.installs ?? 0) + (k?.trials ?? 0) + (k?.paid ?? 0) };
  });
  const max = Math.max(1, ...rows.map((r) => r.total));
  const share = funnel.coverage.share;
  return (
    <GlassCard padding="lg" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="grid content-start gap-4">
        <header className="grid gap-1">
          <h3 className="font-display text-title-md text-fg">Attribution coverage</h3>
          <p className="text-body-sm text-fg-muted">The share of installs, trials and paid conversions tied to a creator by a link or a code.</p>
        </header>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-figure-lg tabular-nums text-fg">{formatPct(share, 0)}</p>
            <Badge tone={funnel.coverage.label === "high" ? "mint" : funnel.coverage.label === "medium" ? "sun" : "rose"} variant="soft">
              {funnel.coverage.label === "high" ? "High coverage" : funnel.coverage.label === "medium" ? "Medium coverage" : "Low coverage"}
            </Badge>
          </div>
          <Progress value={Math.round(share * 100)} tone="accent" size="md" aria-label="Attribution coverage" valueText={`${Math.round(share * 100)} percent tracked`} />
          <p className="text-caption text-fg-subtle">CPA pays only on link and code conversions, so every point of coverage is money a creator can earn and you can trust.</p>
        </div>
        <Link href="/brand/attribution" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
          Improve coverage
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <div className="grid content-start gap-3">
        <h3 className="font-display text-title-sm text-fg">Where conversions come from</h3>
        {funnel.loading ? (
          <div className="grid gap-3" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((r) => {
              const tracked = r.src === "link" || r.src === "code";
              return (
                <li key={r.src} className="grid gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="flex items-center gap-2 text-body-sm font-medium text-fg">
                      {CONVERSION_SOURCE_META[r.src].label}
                      <KindChip kind={tracked ? "tracked" : "estimated"} />
                    </span>
                    <span className="text-caption text-fg-muted tabular-nums">
                      {r.installs.toLocaleString("en-US")} installs · {r.trials.toLocaleString("en-US")} trials · {r.paid.toLocaleString("en-US")} paid
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-pill bg-surface-active" aria-hidden="true">
                    <span className={cn("block h-full rounded-pill", !tracked && "bg-fg-subtle/60")} style={{ width: `${(r.total / max) * 100}%`, background: tracked ? "var(--fd-chart-1)" : undefined }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex items-start gap-1.5 text-caption text-fg-subtle">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Estimated sources are shown so you can see the whole picture. They are hatched out of every figure that decides pay.
        </p>
      </div>
    </GlassCard>
  );
}
