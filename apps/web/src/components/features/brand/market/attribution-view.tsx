"use client";

import { useMemo, useState } from "react";
import { Check, Circle, Clock, Plug } from "lucide-react";
import { AppIcon } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DemoTag, PageHeader, Section } from "@/components/shell";
import { Badge, Button, Callout, EmptyState, Progress, Select, Skeleton, SkeletonGroup } from "@/components/ui";
import { useApps, useAttributionKit, useCreatorDirectory, useFunnel, useIntegrations, useMe, useStoreReady } from "@/lib/data";
import type { SetupStep } from "@/lib/data/selectors/workspace";
import { formatPct, formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AdaptersAndDocs, ConfidenceLadder, ConversionsBySource, MatchRateByPlatform, RevenueCatCard, SdkSnippet, SurveyTemplate } from "./attribution-sections";
import { CodePoolLanes } from "./attribution-pool";
import { PreflightTester } from "./attribution-preflight";
import { settle } from "./report";
import { useQueryParams } from "./use-query-state";

const PARAMS = { app: "" } as const;

const COVERAGE_COPY = {
  high: "Most installs and trials can be tied to a creator.",
  medium: "Some installs cannot be tied to a creator. Add the offer code and survey to close the gap.",
  low: "Many installs cannot be tied to a creator, so CPA bonuses will pay out less than they should.",
} as const;

const STEP_LINK: Partial<Record<SetupStep["id"], { href: string; label: string }>> = {
  sdk: { href: "#sdk", label: "Get the snippet" },
  code_pool: { href: "#pool", label: "See the pool" },
  survey: { href: "#survey", label: "Get the survey" },
  mmp: { href: "#adapters", label: "See adapters" },
};

function SetupChecklist({ steps, done, total, onConnect, connecting }: { steps: readonly SetupStep[]; done: number; total: number; onConnect: () => void; connecting: boolean }) {
  return (
    <GlassCard padding="md" className="grid content-start gap-5" aria-labelledby="setup-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="setup-title" className="font-display text-title-md text-fg">
            Setup checklist
          </h2>
          <p className="text-body-sm text-fg-muted">Four required steps make CPA bonuses and cost per trial trustworthy. Two optional ones add more coverage.</p>
        </div>
        <p className="font-display text-figure-md text-fg tabular-nums">
          {done} <span className="text-fg-subtle">of {total}</span>
        </p>
      </div>
      <Progress value={done} max={Math.max(total, 1)} tone="accent" aria-label="Required setup steps done" valueText={`${done} of ${total} required steps done`} />
      <ol className="grid gap-2.5">
        {steps.map((step) => {
          const link = STEP_LINK[step.id];
          return (
            <li key={step.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-xl bg-surface-field p-3.5">
              <span aria-hidden="true" className={cn("mt-0.5 grid size-6 place-items-center rounded-full", step.done ? "bg-mint-solid text-on-mint" : "text-fg-subtle shadow-[inset_0_0_0_1.5px_var(--fd-rim-strong)]")}>
                {step.done ? <Check className="size-3.5" strokeWidth={2.5} /> : <Circle className="size-2" strokeWidth={0} />}
              </span>
              <div className="grid gap-0.5">
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-fg">
                  {step.label}
                  {step.optional ? (
                    <Badge size="sm" tone="neutral" variant="outline">
                      Optional
                    </Badge>
                  ) : null}
                  <span className="sr-only">{step.done ? ", done" : ", to do"}</span>
                </p>
                <p className="text-caption text-fg-muted">{step.detail}</p>
              </div>
              {step.id === "revenuecat" && !step.done ? (
                <Button size="sm" variant="primary" leadingIcon={<Plug />} loading={connecting} onClick={onConnect}>
                  Connect
                </Button>
              ) : step.id === "revenuecat" ? (
                <a href="#revenuecat" className="self-center text-caption font-medium text-accent hover:underline">
                  Open
                </a>
              ) : link && !step.done ? (
                <a href={link.href} className="self-center text-caption font-medium text-accent hover:underline">
                  {link.label}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}

function Skeletons() {
  return (
    <SkeletonGroup label="Loading the Attribution Kit" className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-80" />
    </SkeletonGroup>
  );
}

/** The Attribution Kit: setup, health, the confidence ladder, the offer-code pool, a link preflight, match rates, RevenueCat, the SDK and the survey. */
export function AttributionView() {
  const ready = useStoreReady();
  const me = useMe();
  const apps = useApps();
  const { values, set } = useQueryParams(PARAMS);
  const appId = apps.find((app) => app.id === values.app)?.id ?? me.app?.id;
  const kit = useAttributionKit(appId);
  const funnel = useFunnel(appId ? { app: appId } : undefined);
  const integrations = useIntegrations();
  const directory = useCreatorDirectory();
  const handles = useMemo(() => new Map(directory.items.map((row) => [row.creator.id, row.creator.handle])), [directory.items]);
  const [connecting, setConnecting] = useState(false);

  const app = kit.app;
  const connect = async (): Promise<void> => {
    if (!app) return;
    setConnecting(true);
    await settle(actions.connectIntegration({ kind: "revenuecat", app_id: app.id }), "RevenueCat connected");
    setConnecting(false);
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Setup"
        title="Attribution Kit"
        description="How a view becomes a creator-attributed install, trial and purchase. Tracked conversions are the ones you can pay a bonus on."
        meta={
          <>
            <DemoTag>Demo data</DemoTag>
            {kit.last_event_at ? (
              <Badge size="lg" tone="neutral" icon={<Clock />}>
                Last event {formatRelative(kit.last_event_at)}
              </Badge>
            ) : null}
          </>
        }
        actions={
          apps.length > 1 ? (
            <Select
              size="md"
              aria-label="App"
              className="w-56"
              value={app?.id ?? ""}
              onValueChange={(next) => set({ app: next === me.app?.id ? null : next })}
              options={apps.map((entry) => ({ value: entry.id, label: entry.name }))}
              leading={app ? <AppIcon art={app.icon} name={app.name} size={22} decorative /> : undefined}
            />
          ) : undefined
        }
      />

      {!ready ? (
        <Skeletons />
      ) : !app ? (
        <GlassCard padding="lg">
          <EmptyState art="bounty" title="Connect an app first" description="The Attribution Kit lives with an app: its tracking links, codes and RevenueCat project." />
        </GlassCard>
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <SetupChecklist steps={kit.setup} done={kit.progress.done} total={kit.progress.total} onConnect={() => void connect()} connecting={connecting} />
            <GlassCard padding="md" className="grid content-start gap-5" aria-labelledby="health-title">
              <h2 id="health-title" className="font-display text-title-md text-fg">
                Attribution health
              </h2>
              <div className="grid gap-2">
                <p className="text-caption font-medium text-fg-muted">Coverage</p>
                <p className="font-display text-figure-xl text-fg tabular-nums">{formatPct(kit.coverage.share, 0)}</p>
                <Progress value={Math.round(kit.coverage.share * 100)} tone="accent" aria-label="Attribution coverage" valueText={`${Math.round(kit.coverage.share * 100)} percent, ${kit.coverage.label}`} />
                <p className="text-caption text-fg-muted">
                  <span className="font-semibold text-fg">{kit.coverage.label === "high" ? "High" : kit.coverage.label === "medium" ? "Medium" : "Low"} coverage.</span> {COVERAGE_COPY[kit.coverage.label]}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-field p-4">
                <div className="grid gap-0.5">
                  <dt className="text-caption text-fg-subtle">Events, 24 h</dt>
                  <dd className="font-display text-figure-md font-semibold text-fg tabular-nums">{kit.events_24h}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-caption text-fg-subtle">Last event</dt>
                  <dd className="text-body-sm font-semibold text-fg">{kit.last_event_at ? formatRelative(kit.last_event_at) : "None yet"}</dd>
                </div>
              </dl>
              {kit.by_source ? (
                <div className="grid gap-1 text-body-sm">
                  <p className="flex justify-between gap-3">
                    <span className="text-fg-muted">Tracked trials</span>
                    <span className="font-semibold text-fg tabular-nums">{kit.by_source.tracked.trials}</span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-fg-muted">Estimated trials</span>
                    <span className="font-semibold text-fg tabular-nums">{kit.by_source.estimated.trials}</span>
                  </p>
                </div>
              ) : null}
            </GlassCard>
          </div>

          <Section id="sources" title="Where conversions come from" description="Five sources, ranked by how sure we are. CPA bonuses pay on the top two only.">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ConfidenceLadder by={kit.by_source} />
              <ConversionsBySource by={kit.by_source} />
            </div>
          </Section>

          <Section id="pool" title="Offer-code pool" description="Codes by subscription, under Apple's limit of ten active per subscription.">
            <CodePoolLanes pool={kit.pool} handles={handles} />
          </Section>

          <Section id="preflight" title="Test a link before the video goes live" description="Preflight a creator's link, then see how each platform's in-app browser carries it.">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <PreflightTester app={app} rc={kit.revenuecat} />
              <MatchRateByPlatform funnel={funnel} />
            </div>
          </Section>

          <Section id="revenuecat" title="RevenueCat and the SDK" description="The webhook that reports purchases, and the snippet that tells it which creator to credit.">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <RevenueCatCard app={app} kit={kit} handles={handles} />
              <div id="sdk" className="grid scroll-mt-24 gap-4">
                <SdkSnippet kit={kit} />
              </div>
            </div>
          </Section>

          <Section id="survey" title="Survey and adapters" description="The estimated sources: a question you ask, and partners you can connect.">
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <SurveyTemplate />
              <div id="adapters" className="scroll-mt-24">
                <AdaptersAndDocs app={app} catalog={integrations.catalog} />
              </div>
            </div>
          </Section>

          <Callout tone="neutral" title="Honest numbers">
            Cost per trial and ROAS elsewhere in flowd use Tracked conversions by default, with Estimated ones beside them. Nothing on this page changes what a creator is paid for views.
          </Callout>
        </>
      )}
    </div>
  );
}
