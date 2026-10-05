"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { FORMAT_ID_META, HOOK_TYPE_META, PLATFORM_META, type FormatId, type HookType, type Platform } from "@/lib/contract/types";
import { useBounties, useFunnel, useStoreReady } from "@/lib/data";
import { actions } from "@/lib/store";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Section } from "@/components/shell/page-header";
import { DemoTag } from "@/components/shell/demo-banner";
import { notify } from "@/components/ui/toast";
import { RouteLoading } from "../route-states";
import { dollars, downloadCsv, toCsv } from "../csv";
import { useUrlChoice, useUrlValue } from "../url-state";
import { FilterBar, RANGES, type AnalyticsFilters, type RangeChoice } from "./analytics-filters";
import { AttributionSection, BreakdownSection, CohortSection, FunnelSection, KpiStrip, LeagueSection, RoasSection } from "./analytics-sections";

/**
 * Funnel and analytics (F-044, F-045). Verified views to clicks to installs to trials to paid, every conversion labelled Tracked
 * or Estimated, cost at each stage, ROAS from day 7 to day 90 with how mature each figure is, the day the posts paid back, weekly
 * cohorts, and a creator league ranked on cost per trial rather than views. Every chart has a table view, and every table exports.
 */
export function AnalyticsPage() {
  const ready = useStoreReady();
  const [range, setRange] = useUrlChoice<RangeChoice>("range", RANGES, "30d");
  const [bounty, setBounty] = useUrlValue("bounty");
  const [creator, setCreator] = useUrlValue("creator");
  const [hook, setHook] = useUrlValue("hook");
  const [format, setFormat] = useUrlValue("format");
  const [platform, setPlatform] = useUrlValue("platform");

  const filters: AnalyticsFilters = { range, bounty, creator, hook, format, platform };
  const funnel = useFunnel({
    brand: "mine",
    range,
    ...(bounty ? { bounty } : {}),
    ...(creator ? { creator } : {}),
    ...(hook ? { hook_type: hook as HookType } : {}),
    ...(format ? { format: format as FormatId } : {}),
    ...(platform ? { platform: platform as Platform } : {}),
  });
  // The choices in the filter menus come from the whole brand, not the filtered view, so a filter can always be changed.
  const everything = useFunnel({ brand: "mine", range: "all" });
  const bounties = useBounties({ brand: "mine" });
  const bountyOptions = useMemo(() => bounties.filter((b) => b.status !== "draft").map((b) => ({ value: b.id, label: b.title })), [bounties]);
  const creatorOptions = useMemo(() => everything.league.filter((r) => r.creator).map((r) => ({ value: r.key, label: `@${r.creator?.handle ?? r.key}` })), [everything.league]);

  const change: <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => void = (key, value) => {
    if (key === "range") setRange(value as RangeChoice);
    else if (key === "bounty") setBounty(value as string | null);
    else if (key === "creator") setCreator(value as string | null);
    else if (key === "hook") setHook(value as string | null);
    else if (key === "format") setFormat(value as string | null);
    else setPlatform(value as string | null);
  };
  const clear = (): void => {
    setBounty(null);
    setCreator(null);
    setHook(null);
    setFormat(null);
    setPlatform(null);
  };

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (bounty) parts.push(bounties.find((b) => b.id === bounty)?.title ?? "one bounty");
    if (creator) parts.push(`@${everything.league.find((r) => r.key === creator)?.creator?.handle ?? "creator"}`);
    if (hook) parts.push(`${HOOK_TYPE_META[hook as HookType]?.label ?? hook} hooks`);
    if (format) parts.push(FORMAT_ID_META[format as FormatId]?.label ?? format);
    if (platform) parts.push(PLATFORM_META[platform as Platform]?.label ?? platform);
    return parts.length === 0 ? "All your posts" : parts.join(" · ");
  }, [bounty, creator, hook, format, platform, bounties, everything.league]);

  const exportCsv = async (what: "funnel" | "league" | "cohorts"): Promise<void> => {
    const stamp = "2026-10-03";
    if (what === "funnel") {
      const s = funnel.stats;
      downloadCsv(
        `flowd-funnel-${stamp}.csv`,
        toCsv(
          ["stage", "count", "kind", "cost_per_stage_usd"],
          [
            ["Verified views", funnel.counts.views, "tracked", s.cpm_effective_cents === null ? "" : `${dollars(s.cpm_effective_cents)} per 1000`],
            ["Clicks", funnel.counts.clicks, "tracked", dollars(s.cost_per_click_cents)],
            ["Installs", funnel.tracked.installs, "tracked", dollars(s.cost_per_install_cents)],
            ["Installs", funnel.estimated.installs, "estimated", ""],
            ["Trials", funnel.tracked.trials, "tracked", dollars(s.cost_per_trial_cents)],
            ["Trials", funnel.estimated.trials, "estimated", ""],
            ["Paid", funnel.tracked.paid, "tracked", dollars(s.cost_per_paid_cents)],
            ["Paid", funnel.estimated.paid, "estimated", ""],
          ],
        ),
      );
    } else if (what === "league") {
      downloadCsv(
        `flowd-creator-league-${stamp}.csv`,
        toCsv(
          ["handle", "posts", "views", "installs", "trials", "paid", "spend_usd", "cost_per_trial_usd", "trial_rate", "roas_d30"],
          funnel.league.map((r) => [r.creator ? `@${r.creator.handle}` : r.key, r.n, r.funnel.views, r.funnel.installs, r.funnel.trials, r.funnel.paid, dollars(r.cost_cents), dollars(r.cost_per_trial_cents), r.funnel.installs >= 20 && r.trial_rate !== null ? r.trial_rate.toFixed(4) : "", r.roas_d30 ?? ""]),
        ),
      );
    } else {
      downloadCsv(
        `flowd-cohorts-${stamp}.csv`,
        toCsv(
          ["week", "posts", "views", "installs", "trials", "spend_usd", "cost_per_trial_usd", "roas_d7", "roas_d30"],
          funnel.cohorts.map((c) => [c.week, c.posts, c.funnel.views, c.funnel.installs, c.funnel.trials, dollars(c.cost_cents), dollars(c.cost_per_trial_cents), c.roas_d7 ?? "", c.roas_d30 ?? ""]),
        ),
      );
    }
    await actions.recordExport({ what: `analytics ${what}`, target_kind: "brand" });
    notify.success("Export saved", { description: "The download is in your browser. It is logged in your activity." });
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Growth"
        title="Funnel and analytics"
        description="From verified views to paid subscriptions, with what each step cost. CPA bonuses pay only on Tracked results, so those are the numbers to trust."
        meta={
          <>
            <span className="text-body-sm font-medium text-fg-muted">{scopeLabel}</span>
            <DemoTag>Demo data</DemoTag>
          </>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" leadingIcon={<Download />}>
                Export CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportCsv("funnel")}>The funnel</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportCsv("league")}>Creator league</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportCsv("cohorts")}>Weekly cohorts</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <FilterBar filters={filters} bounties={bountyOptions} creators={creatorOptions} onChange={change} onClear={clear} />

      {ready ? null : <RouteLoading shape="dashboard" label="Loading the funnel" header={false} />}
      {ready ? <KpiStrip funnel={funnel} ready={ready} /> : null}

      {ready ? (
        <>
          <Section title="The funnel" description="Each bar is a step, and the line under it says how many from the step above made it.">
            <FunnelSection funnel={funnel} />
          </Section>

          <Section title="Payback" description="Return on what you paid, by days after posting. Day 7 is an early signal, day 30 is where to decide.">
            <RoasSection funnel={funnel} />
          </Section>

          <Section title="Creator league" description="Ranked by cost per trial and day-30 return, because views do not pay your bills. Click a creator for their record.">
            <LeagueSection funnel={funnel} />
          </Section>

          <Section title="What converts" description="Hooks, formats, platforms and bounties, compared on the share of installs that become trials.">
            <BreakdownSection funnel={funnel} />
          </Section>

          <Section title="Weekly cohorts" description="Every post made in the same week, read together.">
            <CohortSection funnel={funnel} />
          </Section>

          <Section title="Attribution" description="How much of this is certain.">
            <AttributionSection funnel={funnel} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
