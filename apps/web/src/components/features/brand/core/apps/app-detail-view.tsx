"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CirclePlus, FlaskConical, Plug, Target } from "lucide-react";
import { BOUNTY_STATUS_META, CATEGORY_META, CATEGORIES, INTEGRATION_STATUS_META, SDK_STATUS_META, type Category } from "@/lib/contract/types";
import { useApp, useAttributionKit, useBounties, useDemoNow, useMe, useStoreReady } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { buildRightsCard, formatMoney, rightsLines } from "@/lib/engine";
import { formatDate, formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CopyField } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { Fact, Panel, SourceChip } from "../common";
import { CoverageMeter } from "../coverage-meter";
import { dollarsText, parseDollars } from "../dollars";
import { BrandNotFoundState } from "../page-states";
import { TagEditor } from "../tag-editor";
import { HEALTH } from "./apps-view";

/**
 * `/brand/apps/[id]`: one app. Its listing facts, attribution coverage and setup, the integrations feeding it, the rights and disclosure defaults
 * new bounties start from, an editor for the details creators see, and the bounties it has run. Archive lives at the bottom, with its reason.
 */
export function AppDetailView({ id }: { id: string }) {
  const ready = useStoreReady();
  const app = useApp(id);

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the app" className="grid gap-8">
        <div className="flex items-center gap-5">
          <Skeleton className="size-20 rounded-[28%]" />
          <div className="grid flex-1 gap-3">
            <Skeleton className="h-9 w-1/2" />
            <Skeleton shape="text" className="w-2/3" />
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-[28px]" />
          <Skeleton className="h-96 rounded-[28px]" />
        </div>
      </SkeletonGroup>
    );
  }
  if (!app) {
    return <BrandNotFoundState title="That app is not in this workspace" description="It may belong to another workspace, or the link is old. Your apps are listed under Setup." backHref="/brand/apps" backLabel="Back to apps" />;
  }
  return <AppDetail app={app} />;
}

function AppDetail({ app }: { app: AppView }) {
  const router = useRouter();
  const now = useDemoNow();
  const me = useMe();
  const kit = useAttributionKit(app.id);
  const bounties = useBounties({ app: app.id, sort: "newest" });
  const [confirmArchive, setConfirmArchive] = useState(false);
  const health = HEALTH[app.health];
  const isArchived = app.archived_at !== undefined;
  const activeApps = me.apps.filter((a) => a.id !== app.id);

  const toggleArchive = async (archived: boolean): Promise<void> => {
    const result = await actions.setAppArchived({ app_id: app.id, archived });
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      throw new Error(result.error.code);
    }
    if (archived) {
      notify.undo(`${app.name} archived`, { description: "It left the switcher. Its history stays.", onUndo: () => void actions.setAppArchived({ app_id: app.id, archived: false }) });
      router.push("/brand/apps");
    } else notify.success(`${app.name} is back in the switcher`);
  };

  const testEvent = async (integrationId: string): Promise<void> => {
    const result = await actions.testIntegration({ integration_id: integrationId });
    if (result.ok) notify.success("Test event received", { description: result.data.integration.health_note });
    else notify.error(result.error.message, { description: result.error.hint });
  };

  const rights = buildRightsCard();
  const compliance = app.brand.compliance_defaults;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="App"
        title={
          <span className="flex items-center gap-4">
            <AppIcon art={app.icon} name={app.name} size={64} decorative />
            <span className="min-w-0">{app.name}</span>
          </span>
        }
        description={app.tagline}
        actions={
          isArchived ? (
            <Button variant="primary" leadingIcon={<ArchiveRestore aria-hidden="true" />} onClick={() => void toggleArchive(false)}>
              Restore app
            </Button>
          ) : (
            <Link href={`/brand/bounties/new?app=${app.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
              <CirclePlus aria-hidden="true" />
              Start a bounty
            </Link>
          )
        }
        meta={
          <>
            <Badge tone={CATEGORY_META[app.category].tone}>{CATEGORY_META[app.category].label}</Badge>
            <Badge tone={health.tone} dot>
              {health.label}
            </Badge>
            {isArchived ? (
              <Badge tone="neutral" variant="outline">
                Archived {formatDate(app.archived_at, "medium")}
              </Badge>
            ) : null}
            <DemoTag />
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start">
        <div className="grid gap-5">
          <Panel title="Listing" description="From the App Store listing. Fictional in the demo.">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Fact label="Monthly price">{formatMoney(app.pricing.monthly_cents)}</Fact>
              <Fact label="Annual price">{formatMoney(app.pricing.annual_cents)}</Fact>
              <Fact label="Free trial">{app.pricing.trial_days > 0 ? `${app.pricing.trial_days} days` : "None"}</Fact>
              <Fact label="Typical first payment">
                <Money cents={app.avg_first_payment_cents} size="inherit" decimals="always" />
              </Fact>
              <Fact label="Rating">
                {app.rating.toFixed(1)}
                <span className="font-normal text-fg-subtle"> from {app.rating_count.toLocaleString("en-US")}</span>
              </Fact>
              <Fact label="Connected">{formatDate(app.connected_at, "medium")}</Fact>
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              <CopyField value={app.store_url} aria-label="Store listing link" />
              <CopyField value={app.bundle_id} aria-label="Bundle id" />
            </div>
          </Panel>

          <EditDetails app={app} />

          <Panel
            title="Bounty history"
            description={bounties.length > 0 ? `${pluralise(bounties.length, "bounty")} for ${app.name}, newest first` : undefined}
            actions={
              !isArchived ? (
                <Link href={`/brand/bounties/new?app=${app.id}`} className={buttonVariants({ variant: "plain", size: "xs" })}>
                  <Target aria-hidden="true" />
                  New bounty
                </Link>
              ) : undefined
            }
          >
            {bounties.length === 0 ? (
              <EmptyState art="bounty" size="sm" title="No bounties for this app yet" description="Flo drafts the brief from the listing, and you decide the price." />
            ) : (
              <ul className="-mx-1.5 grid gap-0.5">
                {bounties.map((b) => (
                  <li key={b.id}>
                    <Link href={`/brand/bounties/${b.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] p-2.5 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-body-sm font-semibold text-fg">{b.title}</span>
                        <span className="text-caption text-fg-subtle">
                          {b.type_label} · {formatMoney(b.budget_cents, { cents: "auto" })} pool · {b.counts.posts} {b.counts.posts === 1 ? "post" : "posts"}
                        </span>
                      </span>
                      <Badge tone={BOUNTY_STATUS_META[b.status].tone} size="md">
                        {BOUNTY_STATUS_META[b.status].label}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid gap-5">
          <Panel title="Attribution" description="How trials and paid conversions are tied to the creator who earned them" actions={<SourceChip kind="tracked" />}>
            <CoverageMeter share={kit.coverage.share || app.coverage.share} label={kit.coverage.share ? kit.coverage.label : app.coverage.label} />
            <p className="text-caption text-fg-muted">
              Link and code conversions are <strong className="font-semibold text-fg">Tracked</strong> and pay CPA bonuses. Anything from a survey or a partner is{" "}
              <strong className="font-semibold text-fg">Estimated</strong>: shown for context, never paid on.
            </p>
            {kit.setup.length > 0 ? (
              <ul className="grid gap-1.5" aria-label="Attribution setup">
                {kit.setup.map((step) => (
                  <li key={step.id} className="flex items-start gap-2.5 text-body-sm">
                    <span aria-hidden="true" className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step.done ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-subtle"}`}>
                      {step.done ? "✓" : ""}
                    </span>
                    <span className="grid min-w-0">
                      <span className={step.done ? "text-fg" : "font-medium text-fg"}>
                        {step.label}
                        {step.optional ? <span className="ml-1.5 text-caption font-normal text-fg-subtle">Optional</span> : null}
                        <span className="sr-only">{step.done ? ", done" : ", not done"}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <Link href="/brand/attribution" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Open the Attribution Kit
              </Link>
            </div>
          </Panel>

          <Panel title="Integrations" description="What is feeding this app's conversions">
            {app.integrations.length === 0 ? (
              <EmptyState
                art="inbox"
                size="sm"
                title="Nothing connected"
                description="Connect RevenueCat so a trial or a paid subscription can be tied to the creator behind the link or code."
                action={
                  <Link href={`/brand/onboarding?app=${app.id}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    <Plug aria-hidden="true" />
                    Connect RevenueCat
                  </Link>
                }
              />
            ) : (
              <ul className="grid gap-2">
                {app.integrations.map((integration) => (
                  <li key={integration.id} className="grid gap-2 rounded-[20px] bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid min-w-0">
                        <span className="truncate text-body-sm font-semibold text-fg">{integration.label}</span>
                        <span className="text-caption text-fg-subtle">{integration.health_note}</span>
                      </span>
                      <Badge tone={INTEGRATION_STATUS_META[integration.status].tone} size="sm" dot>
                        {INTEGRATION_STATUS_META[integration.status].label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-subtle">
                      <span>
                        {integration.events_24h} events in 24 h{integration.last_event_at ? ` · last ${formatRelative(integration.last_event_at, now, { style: "short" })}` : ""}
                      </span>
                      {integration.kind === "revenuecat" && (integration.status === "connected" || integration.status === "needs_attention") ? (
                        <Button variant="secondary" size="xs" leadingIcon={<FlaskConical aria-hidden="true" />} onClick={() => void testEvent(integration.id)}>
                          Send a test event
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-fg-subtle">SDK: {SDK_STATUS_META[app.sdk_status].label}. {SDK_STATUS_META[app.sdk_status].meaning ?? ""}</p>
          </Panel>

          <Panel title="Defaults for new bounties" description="Rights and disclosure start here. Every bounty can change them in the builder.">
            <dl className="grid gap-2">
              {rightsLines(rights).map((line) => (
                <div key={line.id} className="flex items-baseline justify-between gap-4 text-body-sm">
                  <dt className="text-fg-muted">{line.label}</dt>
                  <dd className="text-right font-medium text-fg">{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-2 border-t border-divider pt-3 text-caption text-fg-muted">
              <p>
                <span className="font-semibold text-fg">Disclosure:</span> {compliance.disclosure_text || `#ad Paid partnership with ${app.name}`}
              </p>
              <p>
                <span className="font-semibold text-fg">Music:</span> {compliance.music_policy.replace(/_/g, " ")}. <span className="font-semibold text-fg">AI content:</span> {compliance.ai_policy.replace(/_/g, " ")}.
              </p>
              {compliance.banned_claims.length > 0 ? (
                <p>
                  <span className="font-semibold text-fg">Banned claims:</span> {compliance.banned_claims.join(", ")}
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel title={isArchived ? "Archived" : "Archive this app"}>
            <p className="text-caption text-fg-muted">
              {isArchived
                ? "This app is out of the switcher and cannot start bounties. Its history, ledger entries and rights are untouched."
                : "An archived app leaves the switcher and cannot start bounties. Its history, ledger entries and rights stay, and you can restore it any time. It needs every bounty for it to be ended or settled first."}
            </p>
            {isArchived ? (
              <Button variant="secondary" leadingIcon={<ArchiveRestore aria-hidden="true" />} onClick={() => void toggleArchive(false)} className="justify-self-start">
                Restore app
              </Button>
            ) : (
              <Button variant="danger" leadingIcon={<Archive aria-hidden="true" />} onClick={() => setConfirmArchive(true)} disabled={activeApps.length === 0} className="justify-self-start">
                {activeApps.length === 0 ? "Archive (keep one active app)" : "Archive app"}
              </Button>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${app.name}?`}
        description="It leaves the switcher and cannot start bounties. Nothing is deleted, and you can restore it from Apps."
        confirmLabel="Archive app"
        tone="danger"
        onConfirm={() => toggleArchive(true)}
      />
    </div>
  );
}

function EditDetails({ app }: { app: AppView }) {
  const [tagline, setTagline] = useState(app.tagline);
  const [category, setCategory] = useState<Category>(app.category);
  const [features, setFeatures] = useState<string[]>([...app.features]);
  const [hashtags, setHashtags] = useState<string[]>([...app.default_hashtags]);
  const [monthly, setMonthly] = useState(dollarsText(app.pricing.monthly_cents));
  const [annual, setAnnual] = useState(dollarsText(app.pricing.annual_cents));
  const [trial, setTrial] = useState(String(app.pricing.trial_days));
  const [firstPayment, setFirstPayment] = useState(dollarsText(app.avg_first_payment_cents));
  const [busy, setBusy] = useState(false);

  const monthlyCents = parseDollars(monthly);
  const annualCents = parseDollars(annual);
  const firstCents = parseDollars(firstPayment);
  const trialDays = /^\d{1,2}$/.test(trial) ? Number(trial) : null;
  const errors = {
    tagline: tagline.trim().length < 3 ? "Write a line creators can read: at least 3 characters." : undefined,
    features: features.length < 1 ? "Add at least one feature creators can demo." : undefined,
    monthly: monthlyCents === null || monthlyCents <= 0 ? "Enter the monthly price in dollars." : undefined,
    annual: annualCents === null || annualCents <= 0 ? "Enter the annual price in dollars." : undefined,
    trial: trialDays === null ? "Enter whole days, 0 to 99." : undefined,
    first: firstCents === null || firstCents <= 0 ? "Enter a typical first payment in dollars." : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
  const dirty =
    tagline !== app.tagline ||
    category !== app.category ||
    !same(features, app.features) ||
    !same(hashtags, app.default_hashtags) ||
    monthlyCents !== app.pricing.monthly_cents ||
    annualCents !== app.pricing.annual_cents ||
    trialDays !== app.pricing.trial_days ||
    firstCents !== app.avg_first_payment_cents;

  const save = async (): Promise<void> => {
    if (invalid || monthlyCents === null || annualCents === null || trialDays === null || firstCents === null) return;
    setBusy(true);
    const result = await actions.updateApp({
      app_id: app.id,
      changes: { tagline: tagline.trim(), category, features, default_hashtags: hashtags, pricing: { ...app.pricing, monthly_cents: monthlyCents, annual_cents: annualCents, trial_days: trialDays }, avg_first_payment_cents: firstCents },
    });
    setBusy(false);
    if (result.ok) notify.success("App details saved", { description: "New bounties and the Flo draft use these." });
    else notify.error(result.error.message, { description: result.error.hint });
  };

  return (
    <Panel title="Details creators and Flo use" description="The tagline, features and hashtags feed every brief Flo drafts. The price points set the Pay Math estimates.">
      <div className="grid gap-5">
        <Field label="Tagline" error={errors.tagline}>
          <Input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={90} autoComplete="off" />
        </Field>
        <Field label="Category" hint="Sets the market the price is compared against.">
          <Select value={category} onValueChange={(next) => setCategory(next as Category)} options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))} />
        </Field>
        <TagEditor label="Features creators can demo" hint="Three to six work best. Each becomes a beat in the brief." values={features} onChange={setFeatures} placeholder="One-tap background removal" max={6} error={errors.features} />
        <TagEditor label="Default hashtags" hint="#ad is always added." values={hashtags} onChange={setHashtags} placeholder="#lumi" max={5} normalize={(raw) => raw.trim().replace(/\s+/g, "").replace(/^#*/, "#").toLowerCase().replace(/^#$/, "")} />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Monthly price" error={errors.monthly}>
            <Input value={monthly} onChange={(event) => setMonthly(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" />
          </Field>
          <Field label="Annual price" error={errors.annual}>
            <Input value={annual} onChange={(event) => setAnnual(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" />
          </Field>
          <Field label="Free trial, in days" error={errors.trial}>
            <Input value={trial} onChange={(event) => setTrial(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Typical first payment" error={errors.first} hint="What a paid subscriber pays in the first period.">
            <Input value={firstPayment} onChange={(event) => setFirstPayment(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={busy} disabled={!dirty || invalid} onClick={save}>
            Save details
          </Button>
          {dirty ? <p className="text-caption text-fg-subtle">You have unsaved changes.</p> : null}
        </div>
      </div>
    </Panel>
  );
}
