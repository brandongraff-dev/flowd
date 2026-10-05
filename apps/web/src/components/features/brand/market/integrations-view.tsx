"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Clapperboard, Crosshair, Link2, Megaphone, MessageSquareText, Receipt, Store, Unplug, Waypoints, Zap, type LucideIcon } from "lucide-react";
import { AppIcon, DomainStatusPill } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DataTable, PageHeader, Section, type DataColumn } from "@/components/shell";
import { Badge, Button, Callout, Chip, ChipGroup, ConfirmDialog, EmptyState, Field, Input, Select, Skeleton, SkeletonGroup, Switch, buttonVariants } from "@/components/ui";
import { DELIVERY_STATUS_META, INTEGRATION_STATUS_META, WEBHOOK_EVENT_TYPE_META, WEBHOOK_STATUS_META, type DeliveryStatus, type IntegrationKind, type WebhookEventType } from "@/lib/contract/types";
import { useApps, useBrandSettings, useIntegrations, useMe, useStoreReady } from "@/lib/data";
import type { IntegrationCatalogItem, IntegrationsView as IntegrationsData } from "@/lib/data/selectors/workspace";
import { displayUrl, formatDateTime, formatPct, formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { settle } from "./report";
import { useQueryParams } from "./use-query-state";

const ICON: Record<IntegrationKind, LucideIcon> = {
  revenuecat: Receipt,
  appsflyer: Crosshair,
  adjust: Crosshair,
  branch: Waypoints,
  meta_ads: Megaphone,
  tiktok_ads: Clapperboard,
  slack: MessageSquareText,
  zapier: Zap,
  app_store_connect: Store,
};

const ACCESS: Record<IntegrationKind, string> = {
  revenuecat: "Receives purchase webhooks. Cannot change your subscriptions.",
  appsflyer: "Reads install attribution. Cannot change your campaigns.",
  adjust: "Reads install attribution. Cannot change your campaigns.",
  branch: "Reads install attribution. Cannot change your links.",
  meta_ads: "Creates partnership ads from approved posts on your ad account. You confirm each one.",
  tiktok_ads: "Creates Spark ads from approved posts on your ad account. You confirm each one.",
  slack: "Posts approvals and weekly digests to one channel you choose.",
  zapier: "Sends flowd events to your Zaps. Needs the API on your plan.",
  app_store_connect: "Reads your listing and offer-code limits. Read-only.",
};

const GROUPS: readonly { id: string; title: string; description: string; kinds: readonly IntegrationKind[] }[] = [
  { id: "attribution", title: "Attribution", description: "Tie installs, trials and purchases to the creator who earned them.", kinds: ["revenuecat", "appsflyer", "adjust", "branch", "app_store_connect"] },
  { id: "ads", title: "Ad accounts", description: "Run winning videos as ads on your own account, with the creator's consent.", kinds: ["meta_ads", "tiktok_ads"] },
  { id: "team", title: "Team tools", description: "Review and hear about flowd where your team already works.", kinds: ["slack", "zapier"] },
];

const PARAMS = { app: "", logs: "" } as const;

function Card({ item, busy, onConnect, onDisconnect, onTest, children }: { item: IntegrationCatalogItem; busy: boolean; onConnect: () => void; onDisconnect: () => void; onTest: () => void; children?: ReactNode }) {
  const Icon = ICON[item.kind];
  const live = item.connected;
  const connected = live?.status === "connected" || live?.status === "needs_attention" || live?.status === "error";
  return (
    <GlassCard as="article" aria-label={item.label} padding="md" className="grid content-start gap-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-active text-fg-muted">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 className="truncate font-display text-title-sm text-fg">{item.label}</h3>
          <p className="text-body-sm text-fg-muted">{item.blurb}</p>
        </div>
        <DomainStatusPill meta={INTEGRATION_STATUS_META[live?.status ?? "disconnected"]} value={live?.status ?? "disconnected"} size="md" className="shrink-0" />
      </div>

      {connected && live ? (
        <>
          <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-field p-3.5">
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Events, 24 h</dt>
              <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{live.events_24h}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Last sync</dt>
              <dd className="text-body-sm font-semibold text-fg">{live.last_sync_at ? formatRelative(live.last_sync_at) : "Never"}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption text-fg-subtle">Coverage</dt>
              <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{live.coverage_ratio !== undefined ? formatPct(live.coverage_ratio, 0) : "n/a"}</dd>
            </div>
          </dl>
          <p className={cn("text-body-sm", live.status === "connected" ? "text-fg-muted" : "text-fg")}>{live.health_note}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Scopes">
            {live.scopes.map((scope) => (
              <li key={scope}>
                <Badge size="sm" tone="neutral">
                  {scope}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-caption text-fg-subtle">{ACCESS[item.kind]}</p>
      )}

      {children}

      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            {item.kind === "revenuecat" || item.kind === "slack" || item.kind === "zapier" || item.kind === "appsflyer" || item.kind === "adjust" || item.kind === "branch" ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={onTest}>
                Send test event
              </Button>
            ) : null}
            {item.kind === "revenuecat" ? (
              <Link href="/brand/attribution" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Open Attribution Kit
              </Link>
            ) : null}
            <Button size="sm" variant="plain" leadingIcon={<Unplug />} className="ml-auto" onClick={onDisconnect}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" leadingIcon={<Link2 />} loading={busy} onClick={onConnect}>
            Connect {item.label}
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function SlackConfig({ item }: { item: IntegrationCatalogItem }) {
  const connected = item.connected;
  const current = connected?.config.channel ?? "";
  const [channel, setChannel] = useState(current);
  const [approvals, setApprovals] = useState(connected?.config.approvals !== "off");
  const [digest, setDigest] = useState(connected?.config.digest !== "off");
  const [busy, setBusy] = useState(false);
  const dirty = channel !== current || approvals !== (connected?.config.approvals !== "off") || digest !== (connected?.config.digest !== "off");
  const invalid = channel.trim() !== "" && !/^#[a-z0-9][a-z0-9_-]{0,79}$/.test(channel.trim());

  const save = async (): Promise<void> => {
    if (invalid) return;
    setBusy(true);
    await settle(actions.connectIntegration({ kind: "slack", config: { channel: channel.trim(), approvals: approvals ? "on" : "off", digest: digest ? "on" : "off" } }), "Slack settings saved");
    setBusy(false);
  };

  return (
    <form
      className="grid gap-3 rounded-xl bg-surface-field p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h4 className="text-body-sm font-semibold text-fg">Approvals in Slack</h4>
      <Field label="Channel" error={invalid ? "Use a channel name like #growth-ugc: lowercase letters, numbers, dashes." : undefined} hint="Review requests and the weekly digest post here.">
        <Input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="#growth-ugc" autoComplete="off" spellCheck={false} />
      </Field>
      <Switch label="Approve or reject from Slack" description="Reviewers act on a submission from the message. Every decision is logged in your activity." checked={approvals} onCheckedChange={setApprovals} />
      <Switch label="Weekly digest" description="Spend, trials and what is waiting on you, on Monday morning." checked={digest} onCheckedChange={setDigest} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!dirty || invalid}>
          Save Slack settings
        </Button>
      </div>
    </form>
  );
}

type Delivery = IntegrationsData["deliveries"][number];

function WebhookLog({ deliveries, webhooks }: { deliveries: readonly Delivery[]; webhooks: IntegrationsData["webhooks"] }) {
  const { values, set } = useQueryParams(PARAMS);
  const onlyFailed = values.logs === "failed";
  const rows = deliveries.filter((delivery) => !onlyFailed || delivery.status !== "delivered");
  const failing = webhooks.filter((hook) => hook.status === "failing" || hook.status === "disabled");
  const [testing, setTesting] = useState<string | null>(null);

  const columns: DataColumn<Delivery>[] = [
    { id: "when", header: "Time", card: "title", sortValue: (row) => row.at, cell: (row) => <span className="text-fg-muted tabular-nums">{formatDateTime(row.at)}</span> },
    { id: "event", header: "Event", card: "subtitle", sortValue: (row) => row.event, cell: (row) => <span className="font-medium text-fg">{WEBHOOK_EVENT_TYPE_META[row.event as WebhookEventType]?.label ?? row.event}</span> },
    { id: "url", header: "Endpoint", hideBelow: "lg", minWidth: "14rem", cell: (row) => <span className="font-mono text-code text-fg-muted">{displayUrl(row.url)}</span> },
    { id: "code", header: "Code", align: "end", hideBelow: "md", sortValue: (row) => row.status_code ?? 0, cell: (row) => <span className="tabular-nums">{row.status_code ?? "none"}</span> },
    { id: "latency", header: "Latency", align: "end", hideBelow: "md", sortValue: (row) => row.latency_ms, cell: (row) => <span className="tabular-nums">{row.latency_ms} ms</span> },
    {
      id: "status",
      header: "Result",
      align: "end",
      card: "value",
      sortValue: (row) => row.status,
      cell: (row) => <DomainStatusPill meta={DELIVERY_STATUS_META[row.status as DeliveryStatus] ?? { label: row.status, tone: "neutral" }} value={row.status} size="md" />,
    },
  ];

  return (
    <div className="grid gap-4">
      {failing.map((hook) => (
        <Callout
          key={hook.id}
          tone="sun"
          title={`${displayUrl(hook.url)} is ${WEBHOOK_STATUS_META[hook.status].label.toLowerCase()}`}
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={testing === hook.id}
              onClick={async () => {
                setTesting(hook.id);
                await settle(actions.testWebhook({ webhook_id: hook.id }), "Test delivered. The endpoint answered with a 200.");
                setTesting(null);
              }}
            >
              Send test delivery
            </Button>
          }
        >
          {hook.failure_count} failures in a row. We retry with backoff and keep every event, so nothing is lost while you fix it.
        </Callout>
      ))}
      <DataTable
        caption="Recent webhook deliveries"
        columns={columns}
        rows={rows.slice(0, 25)}
        getRowId={(row) => row.id}
        density="compact"
        stickyHeader={false}
        defaultSort={{ id: "when", direction: "desc" }}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
            <ChipGroup aria-label="Show">
              <Chip size="sm" selected={!onlyFailed} onSelectedChange={() => set({ logs: null })}>
                All deliveries
              </Chip>
              <Chip size="sm" selected={onlyFailed} onSelectedChange={(on) => set({ logs: on ? "failed" : null })}>
                Failed or retrying
              </Chip>
            </ChipGroup>
            <Link href="/brand/developers" className="text-caption font-medium text-accent hover:underline">
              Manage endpoints in Developers
            </Link>
          </div>
        }
        empty={{ art: "inbox", title: onlyFailed ? "No failed deliveries" : "No deliveries yet", description: onlyFailed ? "Every recent event was delivered." : "Add a webhook endpoint in Developers and its deliveries are logged here." }}
      />
    </div>
  );
}

/** Integrations: the attribution, ad-account and team tools around a workspace, with status, scopes, test events, Slack approvals and the webhook log. */
export function IntegrationsView() {
  const ready = useStoreReady();
  const me = useMe();
  const apps = useApps();
  const data = useIntegrations();
  const settings = useBrandSettings();
  const { values, set } = useQueryParams(PARAMS);
  const app = apps.find((entry) => entry.id === values.app) ?? me.app;
  const [busy, setBusy] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<IntegrationCatalogItem | null>(null);

  const catalog = useMemo(() => new Map(data.catalog.map((item) => [item.kind, item])), [data.catalog]);
  const planHas = (feature: string): boolean => settings.plan_features.find((entry) => entry.feature === feature)?.included ?? true;
  const needsApp = (kind: IntegrationKind): boolean => !(kind === "slack" || kind === "zapier");

  const connect = async (item: IntegrationCatalogItem): Promise<void> => {
    if (needsApp(item.kind) && !app) return;
    setBusy(item.kind);
    await settle(actions.connectIntegration({ kind: item.kind, ...(needsApp(item.kind) && app ? { app_id: app.id } : {}) }), `${item.label} connected`);
    setBusy(null);
  };
  const test = async (item: IntegrationCatalogItem): Promise<void> => {
    if (!item.connected) return;
    setBusy(item.kind);
    await settle(actions.testIntegration({ integration_id: item.connected.id }), { title: "Test event received", description: item.connected.health_note });
    setBusy(null);
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Setup"
        title="Integrations"
        description="Connect the tools around flowd. Each shows what it can access, whether it is healthy, and a way to test it."
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
        meta={
          app ? (
            <Badge size="lg" tone="neutral">
              App-level connections apply to {app.name}
            </Badge>
          ) : undefined
        }
      />

      {!ready ? (
        <SkeletonGroup label="Loading integrations" className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </SkeletonGroup>
      ) : (
        <>
          {GROUPS.map((group) => (
            <Section key={group.id} id={group.id} title={group.title} description={group.description}>
              <ul className="grid gap-4 lg:grid-cols-2">
                {group.kinds.map((kind) => {
                  const item = catalog.get(kind);
                  if (!item) return null;
                  const gated = (kind === "slack" && !planHas("slack")) || (kind === "zapier" && !planHas("api"));
                  return (
                    <li key={kind} className="grid">
                      <Card item={item} busy={busy === kind} onConnect={() => void connect(item)} onDisconnect={() => setDisconnecting(item)} onTest={() => void test(item)}>
                        {gated ? (
                          <Callout tone="info" title={kind === "slack" ? "Slack approvals need Pro" : "Zapier needs Pro"} action={<Link href="/brand/settings#plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>See plans</Link>}>
                            Your {settings.brand?.plan ?? "current"} plan does not include it yet.
                          </Callout>
                        ) : kind === "slack" && item.connected?.status === "connected" ? (
                          <SlackConfig key={item.connected.id + JSON.stringify(item.connected.config)} item={item} />
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}

          <Section id="logs" title="Webhook log" description="The newest deliveries to your endpoints, across all of them. Deliveries are signed, and failures retry.">
            {data.webhooks.length === 0 && data.deliveries.length === 0 ? (
              <GlassCard padding="lg">
                <EmptyState
                  art="inbox"
                  title="No webhook endpoints yet"
                  description="Add an endpoint in Developers to receive events like submission approved or post cleared."
                  action={
                    <Link href="/brand/developers" className={buttonVariants({ variant: "primary" })}>
                      Open Developers
                    </Link>
                  }
                />
              </GlassCard>
            ) : (
              <WebhookLog deliveries={data.deliveries} webhooks={data.webhooks} />
            )}
          </Section>
        </>
      )}

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null);
        }}
        title={disconnecting ? `Disconnect ${disconnecting.label}?` : "Disconnect?"}
        description="Tracking links and offer codes keep working. Anything that relied on this connection falls back to them, and conversions it supplied are no longer added."
        confirmLabel="Disconnect"
        tone="danger"
        onConfirm={async () => {
          if (!disconnecting?.connected) return;
          const result = await settle(actions.disconnectIntegration({ integration_id: disconnecting.connected.id }), `${disconnecting.label} disconnected`);
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </div>
  );
}
