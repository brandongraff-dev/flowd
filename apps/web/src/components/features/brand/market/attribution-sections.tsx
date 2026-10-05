"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Link2, Plug, Send, Ticket } from "lucide-react";
import { DomainStatusPill, PlatformLabel, type PlatformKey } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DataTable, type DataColumn } from "@/components/shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Callout,
  CopyButton,
  CopyField,
  EmptyState,
  SegmentedControl,
  Skeleton,
  buttonVariants,
} from "@/components/ui";
import { INTEGRATION_STATUS_META, RC_EVENT_TYPE_META, RC_MATCH_STATUS_META, type App, type ConversionSource, type IntegrationKind, type RevenueCatEvent } from "@/lib/contract/types";
import { CONSTANTS, confidenceFor, sourceChip, type KindCounts } from "@/lib/engine";
import type { FunnelView } from "@/lib/data/selectors/funnel";
import type { AttributionKit } from "@/lib/data/selectors/workspace";
import type { IntegrationCatalogItem } from "@/lib/data/selectors/workspace";
import { formatCompact, formatMoney, formatPct, formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { CodeBlock } from "./code-block";
import { settle } from "./report";

type Counts = AttributionKit["by_source"];

const SOURCES: readonly { source: ConversionSource; name: string; blurb: string }[] = [
  { source: "link", name: "Tracking link", blurb: "The viewer tapped the creator's link, and the deferred link reached your app." },
  { source: "code", name: "Offer code", blurb: "The viewer redeemed the creator's offer code in the App Store." },
  { source: "mmp", name: "MMP match", blurb: "AppsFlyer, Adjust or Branch matched the install to the creator." },
  { source: "survey", name: "Survey answer", blurb: "The subscriber said a creator's video is how they heard about you." },
  { source: "modelled", name: "Modelled", blurb: "A statistical estimate for the share of installs no signal could tie to a creator." },
];

const CONFIDENCE_WORD = { deterministic: "Deterministic", matched: "Matched", self_reported: "Self-reported", modelled: "Modelled" } as const;

/** The five sources as a ladder: the top two are Tracked and the only ones CPA bonuses pay on. Counts are the workspace's own. */
export function ConfidenceLadder({ by }: { by: Counts }) {
  return (
    <GlassCard padding="md" className="grid content-start gap-5">
      <div className="grid gap-1">
        <h3 className="font-display text-title-sm text-fg">Confidence ladder</h3>
        <p className="text-body-sm text-fg-muted">Every install, trial and paid conversion arrives with a source. The higher the rung, the more sure we are, and only the top two pay CPA bonuses.</p>
      </div>
      <ol className="grid gap-2.5">
        {SOURCES.map((entry, index) => {
          const chip = sourceChip(entry.source);
          const confidence = confidenceFor(entry.source);
          const row: KindCounts | undefined = by?.sources[entry.source];
          return (
            <li key={entry.source} className="grid gap-2 rounded-xl bg-surface-field p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={{ marginInlineStart: `${index * 6}px` }}>
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-fg">
                  {entry.name}
                  <Badge size="sm" tone={chip.kind === "tracked" ? "accent" : "neutral"} variant={chip.kind === "tracked" ? "soft" : "outline"}>
                    {chip.kind === "tracked" ? "Tracked" : "Estimated"}
                  </Badge>
                  <span className="text-caption font-normal text-fg-subtle">{CONFIDENCE_WORD[confidence]}</span>
                </p>
                <p className="text-caption text-fg-muted">{entry.blurb}</p>
              </div>
              <div className="flex items-center gap-3 text-caption sm:justify-end">
                {row ? <span className="text-fg-muted tabular-nums">{formatCompact(row.installs)} installs · {formatCompact(row.trials)} trials</span> : <Skeleton className="h-4 w-32" />}
                <Badge size="md" tone={chip.pays ? "mint" : "neutral"} variant={chip.pays ? "soft" : "outline"}>
                  {chip.pays ? "Pays CPA" : "Never paid"}
                </Badge>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-caption text-fg-subtle">Estimated conversions are reported next to Tracked ones and never mixed into them. CPM pay is unaffected: it is always paid on verified views.</p>
    </GlassCard>
  );
}

interface SourceRow {
  source: ConversionSource;
  name: string;
}

/** Conversions by source with their confidence and whether CPA pays on them. */
export function ConversionsBySource({ by }: { by: Counts }) {
  const columns: DataColumn<SourceRow>[] = [
    {
      id: "source",
      header: "Source",
      card: "title",
      cell: (row) => <span className="font-semibold text-fg">{row.name}</span>,
    },
    {
      id: "confidence",
      header: "Confidence",
      card: "subtitle",
      hideBelow: "md",
      cell: (row) => <span className="text-fg-muted">{CONFIDENCE_WORD[confidenceFor(row.source)]}</span>,
    },
    { id: "installs", header: "Installs", align: "end", cell: (row) => formatCompact(by?.sources[row.source].installs ?? 0) },
    { id: "trials", header: "Trials", align: "end", cell: (row) => formatCompact(by?.sources[row.source].trials ?? 0) },
    { id: "paid", header: "Paid", align: "end", hideBelow: "sm", cell: (row) => formatCompact(by?.sources[row.source].paid ?? 0) },
    {
      id: "kind",
      header: "Label",
      align: "end",
      card: "value",
      cell: (row) => {
        const chip = sourceChip(row.source);
        return (
          <Badge size="md" tone={chip.kind === "tracked" ? "accent" : "neutral"} variant={chip.kind === "tracked" ? "soft" : "outline"}>
            {chip.kind === "tracked" ? "Tracked" : "Estimated"}
          </Badge>
        );
      },
    },
  ];
  return (
    <DataTable
      caption="Conversions by source with their confidence label"
      columns={columns}
      rows={SOURCES.map((entry) => ({ source: entry.source, name: entry.name }))}
      getRowId={(row) => row.source}
      density="compact"
      stickyHeader={false}
      loading={by === null}
      loadingRows={5}
      footer={
        by ? (
          <p className="border-t border-divider px-4 py-3 text-caption text-fg-subtle">
            Tracked: {formatCompact(by.tracked.installs)} installs, {formatCompact(by.tracked.trials)} trials, {formatCompact(by.tracked.paid)} paid. Estimated: {formatCompact(by.estimated.installs)}, {formatCompact(by.estimated.trials)}, {formatCompact(by.estimated.paid)}. CPA bonuses pay on link and code only.
          </p>
        ) : null
      }
    />
  );
}

const BROWSER_OF: Record<string, string> = { tiktok: "TikTok in-app browser", instagram: "Instagram in-app browser", youtube: "YouTube app and system browser" };

/** Share of installs that are Tracked (matched by link or code) by the platform the viewer was watching on. The landing browser is the in-app browser of that platform. */
export function MatchRateByPlatform({ funnel }: { funnel: FunnelView }) {
  const rows = funnel.by_platform
    .map((row) => {
      const tracked = row.funnel.installs;
      const estimated = row.funnel.est_installs;
      const total = tracked + estimated;
      return { key: row.key, clicks: row.funnel.clicks, tracked, estimated, rate: total >= 20 ? tracked / total : null };
    })
    .sort((a, b) => b.clicks - a.clicks);
  return (
    <GlassCard padding="md" className="grid content-start gap-4">
      <div className="grid gap-1">
        <h3 className="font-display text-title-sm text-fg">Match rate by platform and landing browser</h3>
        <p className="text-body-sm text-fg-muted">The share of installs we could tie to a creator by link or code. Viewers land in the browser of the app they were watching, so the platform is also the source browser.</p>
      </div>
      {funnel.loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState size="sm" art="chart" title="No clicks yet" description="Match rates appear after the first creator posts and viewers tap their links." />
      ) : (
        <ul className="grid gap-3.5">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PlatformLabel platform={row.key as PlatformKey} />
                <span className="font-display text-figure-sm font-semibold text-fg tabular-nums">{row.rate === null ? "Few installs" : formatPct(row.rate, 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-pill bg-surface-active" role="img" aria-label={row.rate === null ? "Not enough installs to show a rate" : `${formatPct(row.rate, 0)} of installs matched by link or code`}>
                <div className="h-full rounded-pill bg-(--fd-chart-1)" style={{ width: `${row.rate === null ? 0 : Math.max(2, row.rate * 100)}%` }} />
              </div>
              <p className="text-micro text-fg-subtle tabular-nums">
                {BROWSER_OF[row.key] ?? "In-app browser"} · {formatCompact(row.clicks)} clicks · {formatCompact(row.tracked)} Tracked installs · {formatCompact(row.estimated)} Estimated
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-fg-subtle">A low rate on one platform usually means its in-app browser drops the deferred link. The offer code and the survey cover the gap, as Estimated.</p>
    </GlassCard>
  );
}

/** RevenueCat: webhook URL and secret, status, a test-event button and the newest events with how each matched. */
export function RevenueCatCard({ app, kit, handles }: { app: App | undefined; kit: AttributionKit; handles: ReadonlyMap<string, string> }) {
  const rc = kit.revenuecat;
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);

  const connect = async (): Promise<void> => {
    if (!app) return;
    setBusy("connect");
    const result = await settle(actions.connectIntegration({ kind: "revenuecat", app_id: app.id }), "RevenueCat connected");
    setBusy(null);
    if (result.ok && result.data.webhook_secret) setSecret(result.data.webhook_secret);
  };
  const test = async (): Promise<void> => {
    if (!rc) return;
    setBusy("test");
    await settle(actions.testIntegration({ integration_id: rc.id }), { title: "Test event received", description: "It was matched and counted as a test, never as a conversion." });
    setBusy(null);
  };

  const columns: DataColumn<RevenueCatEvent>[] = [
    { id: "when", header: "Received", card: "title", cell: (row) => <span className="text-fg-muted">{formatRelative(row.received_at)}</span> },
    { id: "type", header: "Event", card: "subtitle", cell: (row) => <span className="font-medium text-fg">{RC_EVENT_TYPE_META[row.event_type].label}</span> },
    { id: "product", header: "Subscription", hideBelow: "md", cell: (row) => <code className="font-mono text-code text-fg-muted">{row.product_id}</code> },
    { id: "price", header: "Price", align: "end", hideBelow: "sm", cell: (row) => (row.price_cents > 0 ? formatMoney(row.price_cents) : <span className="text-fg-subtle">Trial</span>) },
    {
      id: "match",
      header: "Match",
      card: "value",
      align: "end",
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          {row.matched_creator_id && handles.get(row.matched_creator_id) ? <span className="hidden text-caption text-fg-subtle lg:inline">@{handles.get(row.matched_creator_id)}</span> : null}
          <DomainStatusPill meta={RC_MATCH_STATUS_META[row.match_status]} value={row.match_status} size="md" />
        </span>
      ),
    },
  ];

  return (
    <GlassCard padding="md" className="grid content-start gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">RevenueCat webhook</h3>
          <p className="text-body-sm text-fg-muted">Ties each trial and paid conversion to the creator whose link or code brought the subscriber.</p>
        </div>
        {rc ? <DomainStatusPill meta={INTEGRATION_STATUS_META[rc.status]} value={rc.status} /> : <Badge size="lg" tone="neutral" variant="outline">Not connected</Badge>}
      </div>

      {!rc ? (
        <EmptyState
          size="sm"
          art="chart"
          title="Connect RevenueCat to attribute trials and purchases"
          description="You paste a webhook URL and a signing secret into RevenueCat, then send a test event."
          action={
            <Button variant="primary" leadingIcon={<Plug />} loading={busy === "connect"} onClick={() => void connect()} disabled={!app}>
              Connect RevenueCat
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <p className="text-caption font-medium text-fg-muted">Webhook URL</p>
              <CopyField aria-label="RevenueCat webhook URL" value={rc.webhook_url ?? kit.snippets.webhook_url ?? ""} label="Copy webhook URL" />
            </div>
            <div className="grid gap-1.5">
              <p className="text-caption font-medium text-fg-muted">Signing secret</p>
              {secret ? (
                <>
                  <CopyField aria-label="Webhook signing secret" value={secret} label="Copy secret" />
                  <p className="text-caption text-fg-subtle">Copy it now. For your safety it is shown once, and flowd keeps only the last four characters.</p>
                </>
              ) : (
                <p className="flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
                  <code className="font-mono text-code text-fg">whsec_••••••••{rc.secret_last4 ?? "••••"}</code>
                  <span className="text-caption text-fg-subtle">Created when you connected. Only the last four characters are kept.</span>
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-field p-4">
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Events, 24 h</dt>
              <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{rc.events_24h}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Last event</dt>
              <dd className="text-body-sm font-semibold text-fg">{rc.last_event_at ? formatRelative(rc.last_event_at) : "None yet"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Coverage</dt>
              <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{rc.coverage_ratio !== undefined ? formatPct(rc.coverage_ratio, 0) : "n/a"}</dd>
            </div>
          </dl>
          <p className="text-body-sm text-fg-muted">{rc.health_note}</p>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" leadingIcon={<Send />} loading={busy === "test"} onClick={() => void test()}>
              Send test event
            </Button>
            <p className="text-caption text-fg-subtle">Sends a flowd test event through the same path as a real one.</p>
          </div>

          <Accordion variant="card">
            <AccordionItem value="payload">
              <AccordionTrigger>Sample test payload</AccordionTrigger>
              <AccordionContent>
                <CodeBlock
                  language="json"
                  label="sample RevenueCat test event"
                  code={JSON.stringify({ api_version: "1.0", event: { type: "TEST", app_user_id: "$RCAnonymousID:demo", product_id: "lumi_pro_annual", environment: "SANDBOX", subscriber_attributes: { flowd_link: { value: "maya-lumi7" }, flowd_creator: { value: "cr_maya" } } } }, null, 2)}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}

      {rc ? (
        <div className="grid gap-2.5">
          <h4 className="text-body-sm font-semibold text-fg">Newest events</h4>
          <DataTable
            caption="Newest RevenueCat events and how each matched"
            columns={columns}
            rows={kit.recent_events.slice(0, 6)}
            getRowId={(row) => row.id}
            density="compact"
            stickyHeader={false}
            empty={{ art: "inbox", title: "No events yet", description: "Send a test event, or wait for the first purchase." }}
          />
        </div>
      ) : null}
    </GlassCard>
  );
}

/** The SDK snippet in Swift or Kotlin, with a copy button and where to call it. */
export function SdkSnippet({ kit }: { kit: AttributionKit }) {
  const [lang, setLang] = useState<"swift" | "kotlin">("swift");
  const code = lang === "swift" ? kit.snippets.swift : kit.snippets.kotlin;
  return (
    <GlassCard padding="md" className="grid content-start gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">SDK snippet</h3>
          <p className="text-body-sm text-fg-muted">Two lines after your app reads the deep link at launch. They set the creator on the subscriber, so RevenueCat sends it with the purchase.</p>
        </div>
        <SegmentedControl
          aria-label="Language"
          size="sm"
          value={lang}
          onValueChange={(next) => setLang(next as "swift" | "kotlin")}
          options={[
            { value: "swift", label: "Swift" },
            { value: "kotlin", label: "Kotlin" },
          ]}
        />
      </div>
      {code ? (
        <CodeBlock code={code} language={lang === "swift" ? "Swift" : "Kotlin"} label={`${lang} snippet`} footer="Replace code and creatorId with the values from the deep link: your-app://r/<code>." />
      ) : (
        <Skeleton className="h-32" />
      )}
      <p className="text-caption text-fg-subtle">
        SDK status: <span className="font-medium text-fg">{kit.app?.sdk_status === "verified" ? "Installed and verified" : kit.app?.sdk_status === "installed" ? "Installed, not verified" : "Not installed"}</span>.
      </p>
    </GlassCard>
  );
}

const SURVEY = {
  question: CONSTANTS.attribution.survey_name,
  answer: "single_choice",
  options: ["A TikTok video", "An Instagram video", "A YouTube video", "A friend or family member", "An ad", "App Store search", "Somewhere else"],
} as const;

/** The post-install survey: the exact wording, as JSON to drop into your onboarding and as plain text. Answers count as Estimated. */
export function SurveyTemplate() {
  const json = JSON.stringify({ question: SURVEY.question, type: SURVEY.answer, options: SURVEY.options, report_to: "flowd survey source", label: "Estimated" }, null, 2);
  const text = `${SURVEY.question}\n${SURVEY.options.map((option) => `( ) ${option}`).join("\n")}`;
  return (
    <GlassCard padding="md" className="grid content-start gap-4">
      <div className="grid gap-1">
        <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
          <Ticket aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.75} />
          Post-install survey
        </h3>
        <p className="text-body-sm text-fg-muted">Ask once, after the first session. A viewer who skipped the link and the code can still tell you who brought them. These answers are Estimated and never trigger CPA pay.</p>
      </div>
      <div className="grid gap-2 rounded-xl bg-surface-field p-4">
        <p className="text-body-sm font-semibold text-fg">{SURVEY.question}</p>
        <ul className="grid gap-1.5">
          {SURVEY.options.map((option) => (
            <li key={option} className="flex items-center gap-2.5 text-body-sm text-fg-muted">
              <span aria-hidden="true" className="size-4 rounded-full border border-rim-strong" />
              {option}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={json} label="Copy as JSON" copiedLabel="Copied JSON" />
        <CopyButton value={text} label="Copy as text" copiedLabel="Copied text" />
      </div>
    </GlassCard>
  );
}

/** MMP adapters and the docs. Connecting adds matched installs as Estimated; it never changes what CPA pays on. */
export function AdaptersAndDocs({ app, catalog }: { app: App | undefined; catalog: readonly IntegrationCatalogItem[] }) {
  const [busy, setBusy] = useState<IntegrationKind | null>(null);
  const kinds: readonly IntegrationKind[] = ["appsflyer", "adjust", "branch"];
  const rows = kinds.map((kind) => catalog.find((entry) => entry.kind === kind)).filter((entry): entry is IntegrationCatalogItem => entry !== undefined);

  const toggle = async (item: IntegrationCatalogItem): Promise<void> => {
    if (!app && !item.connected) return;
    setBusy(item.kind);
    if (item.connected && item.connected.status === "connected") await settle(actions.disconnectIntegration({ integration_id: item.connected.id }), `${item.label} disconnected`);
    else if (app) await settle(actions.connectIntegration({ kind: item.kind, app_id: app.id }), `${item.label} connected`);
    setBusy(null);
  };

  return (
    <GlassCard padding="md" className="grid content-start gap-4">
      <div className="grid gap-1">
        <h3 className="font-display text-title-sm text-fg">MMP adapters and docs</h3>
        <p className="text-body-sm text-fg-muted">Optional. A measurement partner adds matched installs, shown as Estimated beside your Tracked ones.</p>
      </div>
      <ul className="grid gap-2.5">
        {rows.map((item) => {
          const on = item.connected?.status === "connected";
          return (
            <li key={item.kind} className="flex items-center gap-3 rounded-xl bg-surface-field p-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-active text-fg-muted">
                {on ? <Check className="size-4" strokeWidth={2} /> : <Link2 className="size-4" strokeWidth={1.75} />}
              </span>
              <div className="grid min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-fg">{item.label}</p>
                <p className="truncate text-caption text-fg-subtle">{on ? `Connected${item.connected?.coverage_ratio !== undefined ? `, ${formatPct(item.connected.coverage_ratio, 0)} coverage` : ""}` : "Not connected"}</p>
              </div>
              <Button size="sm" variant={on ? "ghost" : "secondary"} loading={busy === item.kind} onClick={() => void toggle(item)}>
                {on ? "Disconnect" : "Connect"}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link href="/developers" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          API and webhooks docs
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/help" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Attribution help
        </Link>
      </div>
      <Callout tone="info" title="CPA pays on link and code only">
        Matched, self-reported and modelled conversions inform your analytics. They are labelled Estimated everywhere and never earn a CPA bonus.
      </Callout>
    </GlassCard>
  );
}

