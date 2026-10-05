"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import { BRAND_BADGE_META, BRAND_BAND_META, REASON_CODE_META } from "@/lib/contract/types";
import { useBrandScorecard, useStoreReady } from "@/lib/data";
import type { ScorecardView } from "@/lib/data/selectors";
import { formatDate, formatPct } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { AppIcon, ArtAvatar, DomainStatusPill } from "@/components/brand";
import { Gauge } from "@/components/charts";
import { GlassCard } from "@/components/glass";
import { PageHeader } from "@/components/shell";
import { Badge, EmptyState, Progress, Skeleton, buttonVariants } from "@/components/ui";
import { BOUNTY_STATUS_META } from "@/lib/contract/types";
import { DecidesIn } from "./bounty-parts";
import { ReportDialog } from "./report-dialog";

const RELIABILITY_ZONES = [
  { to: 59, color: "var(--fd-rose)", label: "Poor" },
  { to: 74, color: "var(--fd-ember)", label: "Fair" },
  { to: 89, color: "var(--fd-accent-bright)", label: "Good" },
  { to: 100, color: "var(--fd-mint)", label: "Excellent" },
] as const;

/** The four metrics creators see, as a 2 x 2 grid of figures with one line each. Ledger data only, never editable by the brand. */
export function ScorecardMetrics({ scorecard, className }: { scorecard: ScorecardView; className?: string }) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {scorecard.metrics.map((metric) => (
        <div key={metric.label} className="grid content-start gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <dt className="text-caption font-medium text-fg-muted">{metric.label}</dt>
          <dd className="font-display text-figure-lg text-fg tabular-nums">{metric.value}</dd>
          <dd className="text-caption text-fg-subtle">{metric.caption}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A compact scorecard for the bounty page: the verdict word, how fast they decide, the four figures and one link to the whole card. */
export function ScorecardSummary({ brandId, brandName, platformFunded, className }: { brandId: string; brandName: string; platformFunded: boolean; className?: string }) {
  const scorecard = useBrandScorecard(brandId);
  if (platformFunded || !scorecard) {
    return (
      <GlassCard className={cn("grid gap-2", className)}>
        <h2 className="fd-eyebrow text-fg-subtle">Brand Scorecard</h2>
        <p className="text-body-sm text-fg">flowd funds this bounty itself, so there is no brand to score.</p>
        <p className="text-caption text-fg-muted">We hold ourselves to the same promise: a decision in 72 hours with a reason, and money with a date.</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fd-eyebrow text-fg-subtle">Brand Scorecard</h2>
        <Badge tone={BRAND_BAND_META[scorecard.band].tone} size="md">
          {scorecard.label}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <ArtAvatar art={scorecard.brand.logo} name={brandName} size={44} shape="square" decorative />
        <div className="grid">
          <p className="text-body-sm font-semibold text-fg">{brandName}</p>
          <DecidesIn decides={scorecard.decides_in} />
        </div>
      </div>
      {scorecard.new_brand ? (
        <p className="text-caption text-fg-muted">New brand: {scorecard.sample}. We do not show a verdict until a brand has decided 10 videos.</p>
      ) : (
        <ScorecardMetrics scorecard={scorecard} className="sm:grid-cols-2" />
      )}
      <p className="text-micro text-fg-subtle">{scorecard.sample}. From the ledger, never self-reported.</p>
      <Link href={`/creator/brands/${brandId}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
        See the full scorecard
        <ArrowRight aria-hidden="true" />
      </Link>
    </GlassCard>
  );
}

/** `/creator/brands/[id]`: the whole Brand Scorecard. */
export function BrandScorecardPage({ brandId }: { brandId: string }) {
  const ready = useStoreReady();
  const scorecard = useBrandScorecard(brandId);
  const now = useNow();

  if (!ready) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-24 w-full max-w-xl" />
        <Skeleton className="h-64 w-full rounded-[28px]" />
      </div>
    );
  }
  if (!scorecard) {
    return (
      <GlassCard>
        <EmptyState
          art="search"
          headingAs="h1"
          title="No scorecard for this brand"
          description="Either the brand does not exist, or it is flowd itself, which funds its own bounties and has no scorecard."
          action={
            <Link href="/creator/feed" className={buttonVariants({ variant: "primary" })}>
              Back to the feed
            </Link>
          }
        />
      </GlassCard>
    );
  }

  const meta = BRAND_BAND_META[scorecard.band];
  return (
    <div className="grid gap-8">
      <PageHeader
        breadcrumbs={
          <Link href="/creator/feed" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-caption font-semibold text-fg-muted hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
            Bounty feed
          </Link>
        }
        eyebrow="Brand Scorecard"
        title={scorecard.brand.name}
        description={scorecard.brand.tagline}
        meta={
          <>
            <Badge tone={meta.tone} size="lg">
              {scorecard.label}
            </Badge>
            {scorecard.brand.verification === "verified" ? (
              <Badge tone="accent" size="lg" icon={<ShieldCheck aria-hidden="true" />}>
                Verified business
              </Badge>
            ) : null}
            <DecidesIn decides={scorecard.decides_in} />
          </>
        }
        actions={<ReportDialog targetKind="brand" targetId={scorecard.brand_id} targetLabel={scorecard.brand.name} />}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <GlassCard className="grid justify-items-center gap-4 text-center">
          <h2 className="fd-eyebrow justify-self-start text-fg-subtle">Reliability</h2>
          {scorecard.new_brand ? (
            <div className="grid gap-2 py-6">
              <p className="font-display text-title-lg text-fg">New brand</p>
              <p className="max-w-[28ch] text-body-sm text-fg-muted">{scorecard.sample}. A brand needs 10 decisions before we show a score, so nobody is judged on a handful of videos.</p>
            </div>
          ) : (
            <>
              <Gauge name="Brand reliability" value={scorecard.reliability_score} min={0} max={100} zones={RELIABILITY_ZONES} width={260} caption={`${scorecard.trend_30d >= 0 ? "Up" : "Down"} ${Math.abs(scorecard.trend_30d)} points in 30 days`} />
              <p className="text-caption text-fg-muted">{scorecard.sample}</p>
            </>
          )}
          {scorecard.badges.length > 0 ? (
            <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Badges">
              {scorecard.badges.map((badge) => (
                <li key={badge}>
                  <Badge tone={BRAND_BADGE_META[badge].tone} size="md">
                    {BRAND_BADGE_META[badge].label}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </GlassCard>

        <div className="grid gap-5">
          <GlassCard className="grid gap-4">
            <h2 className="fd-eyebrow text-fg-subtle">The four numbers</h2>
            <ScorecardMetrics scorecard={scorecard} />
            <div className="grid gap-1 text-caption text-fg-muted">
              <p>
                <span className="font-semibold text-fg">{formatPct(scorecard.approval_rate)}</span> of decisions were approvals; <span className="font-semibold text-fg">{formatPct(scorecard.rejection_rate)}</span> were rejections.{" "}
                {scorecard.sla_breaches > 0 ? `${scorecard.sla_breaches} ${scorecard.sla_breaches === 1 ? "video" : "videos"} waited past the 72-hour promise.` : "No video waited past the 72-hour promise."}
              </p>
              <p className="text-fg-subtle">Data window: the last {scorecard.window_days} days, as of {formatDate(scorecard.as_of, "medium", { now })}. Admin adjustments are logged.</p>
            </div>
          </GlassCard>

          <GlassCard className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="fd-eyebrow text-fg-subtle">When this brand says no</h2>
              <p className="text-caption text-fg-muted">Every rejection names a reason from the brief and points at evidence. Here is how often each reason is used.</p>
            </div>
            {scorecard.rejection_reasons.length === 0 ? (
              <p className="text-body-sm text-fg-muted">No rejections in this window.</p>
            ) : (
              <ul className="grid gap-3">
                {scorecard.rejection_reasons.slice(0, 5).map((reason) => (
                  <li key={reason.code} className="grid gap-1.5">
                    <Progress
                      value={Math.round(reason.share * 100)}
                      size="sm"
                      tone="neutral"
                      aria-label={REASON_CODE_META[reason.code].label}
                      valueText={`${Math.round(reason.share * 100)} percent of rejections`}
                      label={REASON_CODE_META[reason.code].label}
                      trailing={`${reason.count} · ${Math.round(reason.share * 100)}%`}
                    />
                    <p className="text-micro text-fg-subtle">{REASON_CODE_META[reason.code].meaning}</p>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <section aria-labelledby="recent-title" className="grid gap-4">
        <h2 id="recent-title" className="font-display text-title-md text-fg">
          Recent bounties
        </h2>
        {scorecard.recent_bounties.length === 0 ? (
          <p className="text-body-sm text-fg-muted">No bounties yet.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {scorecard.recent_bounties.map((bounty) => (
              <li key={bounty.id}>
                <Link href={`/creator/bounties/${bounty.id}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[20px] bg-surface p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-raised">
                  <AppIcon art={bounty.app.icon} name={bounty.app.name} size={40} decorative />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-body-sm font-semibold text-fg">{bounty.title}</span>
                    <span className="flex items-center gap-1.5 text-caption text-fg-muted">
                      <Clock aria-hidden="true" className="size-3.5" strokeWidth={2} />
                      {bounty.counts.submissions} submissions · {bounty.counts.approved} approved
                    </span>
                  </span>
                  <DomainStatusPill meta={BOUNTY_STATUS_META[bounty.status]} value={bounty.status} size="md" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-[70ch] text-caption text-fg-subtle">
        A Brand Scorecard is built from flowd's ledger and review log, not from the brand. Brands with fewer than 10 decisions read &ldquo;New brand&rdquo; and never get a score.
      </p>
    </div>
  );
}
