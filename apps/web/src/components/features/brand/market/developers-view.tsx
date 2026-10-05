"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Download, KeyRound, Plus, ShieldAlert, Webhook } from "lucide-react";
import { DomainStatusPill } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { DataTable, PageHeader, Section, type DataColumn } from "@/components/shell";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  CopyField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  Skeleton,
  SkeletonGroup,
  buttonVariants,
} from "@/components/ui";
import { API_SCOPE_META, DELIVERY_STATUS_META, KEY_MODE_META, WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_TYPE_META, WEBHOOK_STATUS_META, type ApiScope, type DeliveryStatus, type KeyMode, type WebhookEventType } from "@/lib/contract/types";
import { useBrandSettings, useDeveloper, useStoreReady } from "@/lib/data";
import type { ApiKeyView } from "@/lib/data/selectors/workspace";
import { displayUrl, formatDate, formatInt, formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { CodeBlock } from "./code-block";
import { settle } from "./report";

const EXPIRY = [
  { value: "0", label: "Never expires" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const;

const EVENT_GROUPS: readonly { title: string; events: readonly WebhookEventType[] }[] = [
  { title: "Bounties", events: ["bounty_funded", "bounty_live", "bounty_filled", "bounty_ended"] },
  { title: "Submissions", events: ["submission_created", "submission_approved", "submission_changes_requested", "submission_rejected"] },
  { title: "Posts and money", events: ["post_live", "post_window_closed", "post_cleared", "conversion_tracked", "invoice_paid", "wallet_low"] },
  { title: "Ads and rights", events: ["ad_live", "ad_fatigued", "rights_expiring", "dispute_opened"] },
];

const PROMPTS = [
  "Launch a $500 bounty for my app at $2.00 CPM.",
  "Which creators have the lowest cost per trial on my apps this month?",
  "Pause my fitness bounty and tell me how much is left in the pool.",
] as const;

const GROUPS = ["Bounties", "Submissions", "Posts", "Wallet and ledger", "Creators and offers", "Market", "Attribution"] as const;

function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<KeyMode>("test");
  const [scopes, setScopes] = useState<ReadonlySet<ApiScope>>(new Set<ApiScope>(["read"]));
  const [expiry, setExpiry] = useState("90");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const reset = (): void => {
    setName("");
    setMode("test");
    setScopes(new Set<ApiScope>(["read"]));
    setExpiry("90");
    setError(undefined);
    setSecret(null);
  };
  const toggle = (scope: ApiScope, on: boolean): void => {
    const next = new Set(scopes);
    if (on) next.add(scope);
    else next.delete(scope);
    next.add("read");
    setScopes(next);
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.createApiKey({ name, mode, scopes: [...scopes], ...(expiry !== "0" ? { expires_in_days: Number(expiry) } : {}) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message);
      return;
    }
    setSecret(result.data.secret);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent size="md">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your key now</DialogTitle>
              <DialogDescription>For your safety this is the only time the full key is shown. flowd keeps only its first and last characters.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              <CopyField aria-label="New API key" value={secret} label="Copy key" />
              <Callout tone="sun" title="Treat it like a password">
                Keep it on a server you control. If it leaks, revoke it here and create a new one.
              </Callout>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="primary"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                I copied it
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
              <DialogDescription>Start with a test key. It works against a sandbox with pretend money.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-5">
              <Field label="Name" error={error} hint="So you remember what it is for: Growth automation, Zapier.">
                <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus maxLength={40} />
              </Field>
              <div className="grid gap-2">
                <p id="mode-label" className="text-body-sm font-medium text-fg">
                  Mode
                </p>
                <RadioGroup aria-labelledby="mode-label" value={mode} onValueChange={(next) => setMode(next as KeyMode)} className="grid gap-2 sm:grid-cols-2">
                  <RadioGroupItem id="mode-test" value="test" variant="card" label="Test" description="Sandbox. Pretend money, safe to experiment." />
                  <RadioGroupItem id="mode-live" value="live" variant="card" label="Live" description="Your real workspace and wallet." />
                </RadioGroup>
              </div>
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-body-sm font-medium text-fg">Scopes</legend>
                <Checkbox label="Read" description="Bounties, submissions, posts and analytics." checked disabled />
                <Checkbox label="Write" description="Create and edit drafts. Publishing needs a person to confirm." checked={scopes.has("write")} onCheckedChange={(on) => toggle("write", on === true)} />
                <Checkbox label="Financial" description="Fund and top up. Off by default. Use it only on a server you control." checked={scopes.has("financial")} onCheckedChange={(on) => toggle("financial", on === true)} />
              </fieldset>
              <Field label="Expires">
                <Select value={expiry} onValueChange={setExpiry} options={EXPIRY} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EndpointDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("https://");
  const [events, setEvents] = useState<ReadonlySet<WebhookEventType>>(new Set<WebhookEventType>(["submission_approved", "post_cleared"]));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const reset = (): void => {
    setUrl("https://");
    setEvents(new Set<WebhookEventType>(["submission_approved", "post_cleared"]));
    setError(undefined);
    setSecret(null);
  };
  const create = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.createWebhook({ url: url.trim(), events: [...events] });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message);
      return;
    }
    setSecret(result.data.secret);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent size="lg">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Endpoint added</DialogTitle>
              <DialogDescription>Verify each delivery with this signing secret. It is shown once.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              <CopyField aria-label="Webhook signing secret" value={secret} label="Copy secret" />
              <p className="text-caption text-fg-subtle">Deliveries carry a signature header computed with this secret. Reject anything that does not verify.</p>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="primary"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a webhook endpoint</DialogTitle>
              <DialogDescription>flowd sends a signed POST for each event you pick. Failed deliveries retry with backoff.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-5">
              <Field label="Endpoint URL" error={error} hint="HTTPS only.">
                <Input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck={false} autoFocus />
              </Field>
              <fieldset className="grid gap-4">
                <legend className="mb-1 text-body-sm font-medium text-fg">Events</legend>
                {EVENT_GROUPS.map((group) => (
                  <div key={group.title} className="grid gap-1">
                    <p className="text-caption font-semibold text-fg-muted">{group.title}</p>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      {group.events.map((event) => (
                        <Checkbox
                          key={event}
                          label={WEBHOOK_EVENT_TYPE_META[event].label}
                          checked={events.has(event)}
                          onCheckedChange={(on) => {
                            const next = new Set(events);
                            if (on === true) next.add(event);
                            else next.delete(event);
                            setEvents(next);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={events.size === 0}>
                Add endpoint
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Developers: API keys with scopes, webhook endpoints with their delivery log, and the MCP server config. */
export function DevelopersView() {
  const ready = useStoreReady();
  const dev = useDeveloper();
  const settings = useBrandSettings();
  const [creating, setCreating] = useState(false);
  const [addingHook, setAddingHook] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const apiOk = settings.plan_features.find((entry) => entry.feature === "api")?.included ?? true;

  const keyColumns: DataColumn<ApiKeyView>[] = [
    {
      id: "name",
      header: "Key",
      card: "title",
      minWidth: "13rem",
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className="grid">
          <span className="font-semibold text-fg">{row.name}</span>
          <code className="font-mono text-code text-fg-subtle">{row.masked}</code>
        </span>
      ),
    },
    { id: "mode", header: "Mode", card: "subtitle", cell: (row) => <Badge size="md" tone={row.mode === "live" ? "accent" : "neutral"} variant={row.mode === "live" ? "soft" : "outline"}>{KEY_MODE_META[row.mode].label}</Badge> },
    {
      id: "scopes",
      header: "Scopes",
      hideBelow: "md",
      cell: (row) => (
        <span className="flex flex-wrap gap-1.5">
          {row.scopes.map((scope) => (
            <Badge key={scope} size="sm" tone={scope === "financial" ? "sun" : scope === "write" ? "accent" : "neutral"}>
              {API_SCOPE_META[scope].label}
            </Badge>
          ))}
        </span>
      ),
    },
    { id: "used", header: "Last used", align: "end", hideBelow: "lg", sortValue: (row) => row.last_used_at ?? "", cell: (row) => <span className="text-fg-muted">{row.last_used_at ? formatRelative(row.last_used_at) : "Never"}</span> },
    { id: "requests", header: "Requests, 30 d", align: "end", hideBelow: "lg", sortValue: (row) => row.requests_30d, cell: (row) => formatInt(row.requests_30d) },
    {
      id: "status",
      header: "Status",
      align: "end",
      card: "value",
      cell: (row) =>
        row.revoked_at ? (
          <Badge size="md" tone="rose">
            Revoked
          </Badge>
        ) : row.active ? (
          <Badge size="md" tone="mint">
            Active{row.expires_at ? `, to ${formatDate(row.expires_at, "short")}` : ""}
          </Badge>
        ) : (
          <Badge size="md" tone="neutral">
            Expired
          </Badge>
        ),
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Setup"
        title="Developers"
        description="Build on flowd: keys with scopes, signed webhooks, and an MCP server so an assistant can launch a bounty for you. Writes are drafts until a person confirms."
        actions={
          <>
            <a href="/openapi.yaml" download className={buttonVariants({ variant: "secondary" })}>
              <Download aria-hidden="true" />
              OpenAPI
            </a>
            <Link href="/developers" className={buttonVariants({ variant: "ghost" })}>
              Docs
            </Link>
          </>
        }
      />

      {!ready ? (
        <SkeletonGroup label="Loading developer settings" className="grid gap-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-64" />
        </SkeletonGroup>
      ) : (
        <>
          {!apiOk ? (
            <Callout tone="info" title="The API is part of Pro" action={<Link href="/brand/settings#plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>See plans</Link>}>
              Your {settings.brand?.plan ?? "current"} plan can read this page but not create keys or endpoints.
            </Callout>
          ) : null}

          <GlassCard padding="md" className="grid gap-5 lg:grid-cols-2">
            <div className="grid content-start gap-2">
              <p className="text-caption font-medium text-fg-muted">Base URL</p>
              <CopyField aria-label="API base URL" value={dev.base_url} label="Copy base URL" />
              <p className="text-caption text-fg-subtle">Send your key as a bearer token. Money is always integer cents, and errors come back as code, message and hint.</p>
            </div>
            <div className="grid content-start gap-2">
              <p className="text-caption font-medium text-fg-muted">Try it</p>
              <CodeBlock language="curl" label="curl example" code={`curl ${dev.base_url}/bounties \\\n  -H "Authorization: Bearer fd_test_..."`} />
            </div>
          </GlassCard>

          <Section
            id="keys"
            title="API keys"
            description="Scoped, revocable, and shown in full only once."
            actions={
              <Button variant="primary" leadingIcon={<Plus />} disabled={!apiOk} onClick={() => setCreating(true)}>
                Create key
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              {dev.scopes.map((entry) => (
                <GlassCard key={entry.scope} padding="md" className="grid content-start gap-1.5">
                  <Badge size="md" tone={entry.scope === "financial" ? "sun" : entry.scope === "write" ? "accent" : "neutral"} className="w-fit">
                    {API_SCOPE_META[entry.scope].label}
                  </Badge>
                  <p className="text-body-sm text-fg-muted">{entry.text}</p>
                </GlassCard>
              ))}
            </div>
            <DataTable
              caption="API keys"
              columns={keyColumns}
              rows={dev.keys}
              getRowId={(row) => row.id}
              stickyHeader={false}
              rowActions={(row) => (row.revoked_at ? [] : [{ id: "revoke", label: "Revoke key", icon: <ShieldAlert />, destructive: true, onSelect: () => setRevoking(row) }])}
              empty={{ art: "locked", title: "No keys yet", description: "Create a test key to try the API against a sandbox.", action: apiOk ? <Button variant="primary" onClick={() => setCreating(true)}>Create a test key</Button> : undefined }}
            />
          </Section>

          <Section
            id="webhooks"
            title="Webhook endpoints"
            description="Signed deliveries for the events you choose. See every attempt below."
            actions={
              <Button variant="secondary" leadingIcon={<Webhook />} disabled={!apiOk} onClick={() => setAddingHook(true)}>
                Add endpoint
              </Button>
            }
          >
            {dev.webhooks.length === 0 ? (
              <GlassCard padding="lg">
                <EmptyState art="inbox" title="No endpoints yet" description="Add an HTTPS endpoint and pick the events it should receive." />
              </GlassCard>
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {dev.webhooks.map((hook) => (
                  <li key={hook.id} className="grid">
                    <GlassCard as="article" aria-label={displayUrl(hook.url)} padding="md" className="grid content-start gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="grid min-w-0 gap-1">
                          <h3 className="truncate font-mono text-code font-semibold text-fg">{displayUrl(hook.url)}</h3>
                          <p className="text-caption text-fg-subtle">
                            Secret ending {hook.secret_last4} · added {formatDate(hook.created_at, "medium")}
                          </p>
                        </div>
                        <DomainStatusPill meta={WEBHOOK_STATUS_META[hook.status]} value={hook.status} size="md" />
                      </div>
                      <ul className="flex flex-wrap gap-1.5" aria-label="Events">
                        {hook.events.map((event) => (
                          <li key={event}>
                            <Badge size="sm" tone="neutral">
                              {WEBHOOK_EVENT_TYPE_META[event].label}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                      {hook.status === "failing" || hook.status === "disabled" ? (
                        <Callout tone="sun" title={`${pluralise(hook.failure_count, "failure")} in a row`}>
                          We retry with backoff and keep the events, so nothing is lost while you fix the endpoint.
                        </Callout>
                      ) : null}
                      <div className="grid gap-1.5">
                        <p className="text-caption font-medium text-fg-muted">Latest deliveries</p>
                        {hook.deliveries.length === 0 ? (
                          <p className="text-caption text-fg-subtle">Nothing sent yet.</p>
                        ) : (
                          <ul className="grid divide-y divide-divider rounded-xl bg-surface-field">
                            {hook.deliveries.slice(0, 4).map((delivery) => (
                              <li key={delivery.id} className="flex items-center gap-3 px-3.5 py-2.5 text-caption">
                                <span className="min-w-0 flex-1 truncate font-medium text-fg">{WEBHOOK_EVENT_TYPE_META[delivery.event].label}</span>
                                <span className="text-fg-subtle tabular-nums">{delivery.status_code ?? "none"}</span>
                                <span className="hidden text-fg-subtle tabular-nums sm:inline">{delivery.latency_ms} ms</span>
                                <DomainStatusPill meta={DELIVERY_STATUS_META[delivery.status as DeliveryStatus]} value={delivery.status} size="sm" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={testing === hook.id}
                          disabled={hook.status === "disabled"}
                          onClick={async () => {
                            setTesting(hook.id);
                            await settle(actions.testWebhook({ webhook_id: hook.id }), "Test delivery sent. The endpoint answered 200.");
                            setTesting(null);
                          }}
                        >
                          Send test delivery
                        </Button>
                        <Link href="/brand/integrations#logs" className="text-caption font-medium text-accent hover:underline">
                          Full delivery log
                        </Link>
                      </div>
                    </GlassCard>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="mcp" title="MCP server" description="Let an assistant work in flowd for you. It can read, and it can draft. A person confirms before money moves.">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <GlassCard padding="md" className="grid content-start gap-4">
                <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
                  <Bot aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.75} />
                  Config for your assistant
                </h3>
                <CodeBlock language="json" label="MCP configuration" code={dev.mcp.config} footer="Use a test key to start. Replace the placeholder with the key you copied." />
              </GlassCard>
              <GlassCard padding="md" className="grid content-start gap-4">
                <h3 className="font-display text-title-sm text-fg">Things to ask</h3>
                <ul className="grid gap-2.5">
                  {PROMPTS.map((prompt) => (
                    <li key={prompt} className="rounded-xl bg-surface-field p-3.5 text-body-sm text-fg">
                      &ldquo;{prompt}&rdquo;
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-fg-subtle">Launching a bounty creates a draft and shows you the Pay Math. You confirm in flowd, and the escrow is funded before it goes live. The financial scope is off unless you turn it on.</p>
              </GlassCard>
            </div>
          </Section>

          <Section id="reference" title="What the API covers" description="Endpoint groups, as in the OpenAPI file.">
            <GlassCard padding="md">
              <ul className="flex flex-wrap gap-2">
                {GROUPS.map((group) => (
                  <li key={group}>
                    <Badge size="lg" tone="neutral">
                      <KeyRound aria-hidden="true" />
                      {group}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-caption text-fg-subtle">
                Rate limit {dev.keys[0]?.rate_limit_per_minute ?? 120} requests a minute per key on your plan. Writes return drafts, publishing needs a confirmation, and every webhook delivery is signed. {WEBHOOK_EVENT_TYPES.length} event types are available.
              </p>
            </GlassCard>
          </Section>
        </>
      )}

      <KeyDialog open={creating} onOpenChange={setCreating} />
      <EndpointDialog open={addingHook} onOpenChange={setAddingHook} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={revoking ? `Revoke ${revoking.name}?` : "Revoke key?"}
        description="Anything using this key stops working at once. This cannot be undone: you would create a new key and update the code that used it."
        confirmLabel="Revoke key"
        tone="danger"
        onConfirm={async () => {
          if (!revoking) return;
          const result = await settle(actions.revokeApiKey({ key_id: revoking.id }), `${revoking.name} revoked`);
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </div>
  );
}
