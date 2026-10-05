"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CirclePlus, Ellipsis, ExternalLink, Plug, Target } from "lucide-react";
import { CATEGORY_META, SDK_STATUS_META } from "@/lib/contract/types";
import { useApps, useDemoNow, useStoreReady } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/ui/toast";
import { GlassCard } from "@/components/glass/glass";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { CoverageMeter } from "../coverage-meter";

export const HEALTH: Record<AppView["health"], { label: string; tone: Tone; hint: string }> = {
  healthy: { label: "Healthy", tone: "mint", hint: "RevenueCat is connected and events are flowing." },
  needs_attention: { label: "Needs attention", tone: "sun", hint: "An integration is failing. Open the app to fix it." },
  not_connected: { label: "Not connected", tone: "neutral", hint: "Connect RevenueCat so trials and paid conversions can be tied to creators." },
};

/**
 * `/brand/apps`: every app in the workspace with its attribution health and what is live. Connect another, open one, start a bounty for it, or
 * archive it (an archived app leaves the switcher; its history stays, and it comes back with one click).
 */
export function BrandAppsView() {
  const ready = useStoreReady();
  const now = useDemoNow();
  const apps = useApps();
  const [showArchived, setShowArchived] = useState(false);
  const active = apps.filter((app) => app.archived_at === undefined);
  const archived = apps.filter((app) => app.archived_at !== undefined);
  const visible = showArchived ? apps : active;
  const healthy = active.filter((app) => app.health === "healthy").length;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Setup"
        title="Apps"
        description="Each app has its own attribution, brief defaults and bounties. Healthy means RevenueCat is connected, so installs, trials and paid conversions can be tied to the creator who earned them."
        actions={
          <Link href="/brand/onboarding" className={buttonVariants({ variant: "primary", size: "md" })}>
            <CirclePlus aria-hidden="true" />
            Connect an app
          </Link>
        }
        meta={
          ready ? (
            <>
              <Badge tone="neutral">{pluralise(active.length, "active app")}</Badge>
              <Badge tone={healthy === active.length && active.length > 0 ? "mint" : "neutral"}>{healthy} healthy</Badge>
              <DemoTag />
            </>
          ) : undefined
        }
      />

      {archived.length > 0 ? <Switch label={`Show ${archived.length} archived`} checked={showArchived} onCheckedChange={setShowArchived} side="left" containerClassName="w-fit" /> : null}

      {!ready ? (
        <SkeletonGroup label="Loading apps" className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <GlassCard key={index} padding="md" className="grid gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 rounded-[28%]" />
                <div className="grid flex-1 gap-2">
                  <Skeleton shape="text" className="w-1/2" />
                  <Skeleton shape="text" className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-2 w-full" shape="pill" />
              <Skeleton shape="text" className="w-2/3" />
            </GlassCard>
          ))}
        </SkeletonGroup>
      ) : visible.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="bounty"
            title="No apps yet"
            description="Paste your App Store link and flowd builds the listing card, then walks you through attribution so creators can be paid on installs and trials."
            action={
              <Link href="/brand/onboarding" className={buttonVariants({ variant: "primary", size: "md" })}>
                <CirclePlus aria-hidden="true" />
                Connect your first app
              </Link>
            }
          />
        </GlassCard>
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {visible.map((app) => (
            <li key={app.id} className="min-w-0">
              <AppCard app={app} now={now} lastActive={active.length <= 1 && app.archived_at === undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AppCard({ app, now, lastActive }: { app: AppView; now: string; lastActive: boolean }) {
  const router = useRouter();
  const health = HEALTH[app.health];
  const isArchived = app.archived_at !== undefined;

  const archive = async (): Promise<void> => {
    const result = await actions.setAppArchived({ app_id: app.id, archived: true });
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    notify.undo(`${app.name} archived`, {
      description: "It left the switcher. Its history, ledger entries and rights stay.",
      onUndo: () => void actions.setAppArchived({ app_id: app.id, archived: false }),
    });
  };
  const restore = async (): Promise<void> => {
    const result = await actions.setAppArchived({ app_id: app.id, archived: false });
    if (result.ok) notify.success(`${app.name} is back in the switcher`);
    else notify.error(result.error.message, { description: result.error.hint });
  };

  return (
    <GlassCard as="article" aria-label={app.name} padding="md" className={cn("grid h-full content-start gap-5", isArchived && "opacity-80")}>
      <div className="flex items-start gap-4">
        <AppIcon art={app.icon} name={app.name} size={56} decorative />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="truncate font-display text-title-md text-fg">
            <Link href={`/brand/apps/${app.id}`} className="rounded-md after:absolute after:inset-0 after:rounded-[inherit] hover:underline">
              {app.name}
            </Link>
          </h2>
          <p className="line-clamp-1 text-caption text-fg-muted">{app.tagline}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={CATEGORY_META[app.category].tone} size="sm">
              {CATEGORY_META[app.category].label}
            </Badge>
            <Badge tone={health.tone} size="sm" dot>
              {health.label}
            </Badge>
            {isArchived ? (
              <Badge tone="neutral" variant="outline" size="sm">
                Archived
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="plain" size="sm" label={`Actions for ${app.name}`} icon={<Ellipsis />} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem icon={<ExternalLink />} onSelect={() => router.push(`/brand/apps/${app.id}`)}>
                Open app
              </DropdownMenuItem>
              {!isArchived ? (
                <DropdownMenuItem icon={<Target />} onSelect={() => router.push(`/brand/bounties/new?app=${app.id}`)}>
                  Start a bounty
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem icon={<Plug />} onSelect={() => router.push("/brand/attribution")}>
                Attribution Kit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isArchived ? (
                <DropdownMenuItem icon={<ArchiveRestore />} onSelect={() => void restore()}>
                  Restore app
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem icon={<Archive />} disabled={lastActive} onSelect={() => void archive()}>
                  {lastActive ? "Archive (keep one active app)" : "Archive app"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CoverageMeter share={app.coverage.share} label={app.coverage.label} />
      <p className="-mt-2 text-caption text-fg-subtle">{health.hint}</p>

      <dl className="grid grid-cols-3 gap-3 border-t border-divider pt-4">
        <div className="grid gap-0.5">
          <dt className="text-caption text-fg-subtle">Live bounties</dt>
          <dd className="text-body-sm font-semibold text-fg tabular-nums">
            {app.bounties_live}
            <span className="font-normal text-fg-subtle"> of {app.bounties_total}</span>
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-caption text-fg-subtle">SDK</dt>
          <dd className="text-body-sm font-semibold text-fg">{SDK_STATUS_META[app.sdk_status].label}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-caption text-fg-subtle">Last event</dt>
          <dd className="text-body-sm font-semibold text-fg">{app.last_event_at ? formatRelative(app.last_event_at, now, { style: "short" }) : "None yet"}</dd>
        </div>
      </dl>
    </GlassCard>
  );
}
