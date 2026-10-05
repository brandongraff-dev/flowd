"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CalendarClock, ExternalLink, Globe, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppIcon, ArtAvatar, DomainStatusPill, PlatformGlyph, TierBadge, Thumb, TIER_LABEL } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { PageHeader, Breadcrumbs, DataTable, KpiRow, Section, StatCard, type DataColumn } from "@/components/shell";
import { Badge, Button, EmptyState, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";
import { BADGE_ID_META, COUNTRY_META, OFFER_STATUS_META, PLATFORM_META, type Offer } from "@/lib/contract/types";
import { fraudBand } from "@/lib/engine";
import { useCreatorProfile, useMe, useStoreReady } from "@/lib/data";
import type { CreatorProfileView } from "@/lib/data/selectors/creators";
import { formatCompact, formatCpm, formatDate, formatMoney, formatPct, formatRelative, pluralise } from "@/lib/format";
import { AddToListMenu } from "./add-to-list";
import { Fact, NichePills, ReliabilityMeter } from "./creator-bits";
import { OfferSheet, type OfferKindChoice, type OfferTarget } from "./offer-sheet";

type AppRow = CreatorProfileView["per_app"][number];

const BAND_COPY = {
  clean: { label: "Clean", detail: "Nothing unusual in how their views arrive." },
  watch: { label: "Watch", detail: "A few posts looked slightly off, and were cleared." },
  review: { label: "Review", detail: "Some posts needed a closer look from flowd before they cleared." },
  high: { label: "High risk", detail: "At least one post was held for suspected fake views." },
} as const;

function ProfileSkeleton() {
  return (
    <SkeletonGroup label="Loading creator" className="grid gap-8">
      <Skeleton className="h-5 w-56" />
      <GlassCard padding="lg" className="grid gap-5">
        <div className="flex items-center gap-5">
          <Skeleton shape="circle" className="size-20" />
          <div className="grid flex-1 gap-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton shape="text" className="w-1/2" />
          </div>
        </div>
        <Skeleton className="h-16 w-full" />
      </GlassCard>
      <div className="grid gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** "en-US" to "English". Falls back to the code when the runtime has no name for it. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0] ?? code) ?? code;
  } catch {
    return code;
  }
}

function offerHref(offer: Offer): string {
  return `/brand/offers?offer=${offer.id}`;
}

/** A creator profile as a brand reads it: who they are, why to trust the number, what they did on your apps, what they cost, and your history together. */
export function CreatorProfileViewPage({ handle }: { handle: string }) {
  const ready = useStoreReady();
  const profile = useCreatorProfile(handle);
  const me = useMe();
  const [composer, setComposer] = useState<{ kind: OfferKindChoice } | null>(null);

  const myAppIds = useMemo(() => new Set(me.apps.map((app) => app.id)), [me.apps]);

  if (!ready) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
        <Breadcrumbs items={[{ label: "Creators", href: "/brand/creators" }, { label: `@${handle}` }]} />
        <GlassCard padding="lg" className="mx-auto w-full max-w-2xl">
          <EmptyState
            art="search"
            title={`No creator with the handle @${handle}`}
            description="The handle may have changed, or the creator may have left flowd. Search by name or niche instead."
            action={
              <Link href="/brand/creators" className={buttonVariants({ variant: "primary" })}>
                Discover creators
              </Link>
            }
          />
        </GlassCard>
      </div>
    );
  }

  const { creator, rate_card, reputation, on_my_apps, history, fraud } = profile;
  const target: OfferTarget = { id: creator.id, handle: creator.handle, display_name: creator.display_name, avatar: creator.avatar, tier: creator.tier, open_to_offers: creator.open_to_offers, ...(rate_card ? { rate_card } : {}) };
  const accepts = Boolean(creator.open_to_offers && rate_card?.accepts_direct_offers && rate_card.status !== "paused");
  const platforms = profile.accounts;
  const band = fraudBand(fraud.max_score_90d);
  const approved = history.submissions.filter((s) => s.status === "approved" || s.status === "posted" || s.status === "released").length;
  const rejected = history.submissions.filter((s) => s.status === "rejected").length;
  const reliabilityText = profile.reliability ? (profile.reliability.kind === "verdict" ? String(profile.reliability.score) : `${profile.reliability.low} to ${profile.reliability.high}`) : "None yet";

  const appColumns: DataColumn<AppRow>[] = [
    {
      id: "app",
      header: "App",
      card: "title",
      minWidth: "11rem",
      sortValue: (row) => row.app.name,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <AppIcon art={row.app.icon} name={row.app.name} size={28} decorative />
          <span className="font-semibold text-fg">{row.app.name}</span>
          {myAppIds.has(row.app.id) ? (
            <Badge size="sm" tone="accent">
              Your app
            </Badge>
          ) : null}
        </span>
      ),
    },
    { id: "posts", header: "Posts", align: "end", sortValue: (row) => row.posts, cell: (row) => row.posts },
    { id: "views", header: "Views", align: "end", sortValue: (row) => row.views, cell: (row) => formatCompact(row.views) },
    { id: "installs", header: "Installs", align: "end", hideBelow: "md", sortValue: (row) => row.installs, cell: (row) => formatCompact(row.installs) },
    {
      id: "trials",
      header: "Trials",
      align: "end",
      sortValue: (row) => row.trials,
      cell: (row) => (
        <span className="grid justify-items-end leading-tight">
          <span>{formatCompact(row.trials)}</span>
          <span className="text-micro font-normal text-fg-subtle">{row.installs >= 20 ? `${formatPct(row.trials / row.installs, 0)} of installs` : "few installs"}</span>
        </span>
      ),
    },
    { id: "paid", header: "Paid", align: "end", hideBelow: "md", sortValue: (row) => row.paid, cell: (row) => formatCompact(row.paid) },
  ];

  const lastSeen = formatRelative(creator.last_active_at);
  const languages = creator.languages.map(languageName).join(", ");

  return (
    <div className="grid gap-8">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Creators", href: "/brand/creators" }, { label: `@${creator.handle}` }]} />}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            @{creator.handle}
            {creator.verification_status === "verified" ? <BadgeCheck aria-label="ID verified" className="size-7 text-accent" strokeWidth={2} /> : null}
          </span>
        }
        description={`${creator.display_name} · ${COUNTRY_META[creator.country].label}`}
        meta={
          <>
            <Badge size="lg" tone="neutral" icon={<TierBadge tier={creator.tier} size={20} decorative />}>
              {TIER_LABEL[creator.tier]}
            </Badge>
            {creator.badges.slice(0, 4).map((badge) => (
              <Badge key={badge} size="lg" tone={BADGE_ID_META[badge].tone}>
                {BADGE_ID_META[badge].label}
              </Badge>
            ))}
            {creator.open_to_offers ? (
              <Badge size="lg" tone="mint" variant="outline">
                Open to offers
              </Badge>
            ) : (
              <Badge size="lg" tone="neutral" variant="outline">
                Not taking offers
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button variant="primary" leadingIcon={<Send />} disabled={!accepts} onClick={() => setComposer({ kind: "direct" })}>
              Send offer
            </Button>
            <Button variant="secondary" disabled={!creator.open_to_offers} onClick={() => setComposer({ kind: "invite" })}>
              Invite to bounty
            </Button>
            <AddToListMenu creatorId={creator.id} handle={creator.handle} />
            <Link href={`/c/${creator.handle}`} className={buttonVariants({ variant: "ghost" })}>
              Storefront
              <ExternalLink aria-hidden="true" />
            </Link>
          </>
        }
      />

      <GlassCard padding="md" className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <ArtAvatar art={creator.avatar} name={creator.display_name} size={72} decorative />
        <div className="grid gap-3">
          <p className="max-w-[68ch] text-body text-fg-muted">{creator.bio}</p>
          <NichePills niches={creator.niches} max={4} />
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-caption">
          <dt className="text-fg-subtle">Joined</dt>
          <dd className="font-medium text-fg-muted tabular-nums">{formatDate(creator.joined_at, "medium")}</dd>
          <dt className="text-fg-subtle">Last active</dt>
          <dd className="font-medium text-fg-muted">{lastSeen}</dd>
          <dt className="text-fg-subtle">Languages</dt>
          <dd className="font-medium text-fg-muted">{languages}</dd>
        </dl>
      </GlassCard>

      <KpiRow>
        <StatCard
          label="Reliability"
          value={<span className="tabular-nums">{reliabilityText}</span>}
          hint={profile.reliability?.kind === "range" ? "Building history until five posts are decided" : reputation ? `Recency-weighted over ${reputation.finished_n} decided posts` : "No finished work yet"}
        />
        <StatCard
          label="Approval rate"
          value={creator.decided_count > 0 ? formatPct(creator.approval_rate, 0) : "New"}
          hint={`${creator.approved_count} approved of ${creator.decided_count} decided`}
        />
        <StatCard label="Hit rate" value={profile.hit_rate === null ? "Not yet" : formatPct(profile.hit_rate, 0)} hint={profile.hit_rate === null ? "Needs five settled posts" : "Posts that became winners"} />
        <StatCard
          label="Cost per trial, your apps"
          value={on_my_apps.cost_per_trial_cents === null ? "No data yet" : formatMoney(on_my_apps.cost_per_trial_cents)}
          hint={on_my_apps.posts > 0 ? `${pluralise(on_my_apps.posts, "post")} · ${pluralise(on_my_apps.trials, "tracked trial")}` : "No posts for your apps yet"}
        />
      </KpiRow>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="grid min-w-0 gap-10">
          <Section
            title="Results by app"
            description="Tracked views, installs, trials and paid conversions from this creator's posts. Link and code matches only."
            actions={
              <Badge tone="accent" size="md">
                Tracked
              </Badge>
            }
          >
            <DataTable
              caption={`Results by app for @${creator.handle}`}
              columns={appColumns}
              rows={profile.per_app}
              getRowId={(row) => row.app.id}
              defaultSort={{ id: "trials", direction: "desc" }}
              stickyHeader={false}
              empty={{ art: "chart", title: "No posts yet", description: "Results appear here after their first post's 72-hour window closes." }}
            />
          </Section>

          <Section title="Recent posts" description={`${profile.recent_posts.length} of ${creator.posts_count} posts, newest first. Views are verified, after fraud filtering.`}>
            {profile.recent_posts.length === 0 ? (
              <GlassCard padding="md">
                <EmptyState size="sm" art="video" title="No posts yet" description="Their first post will show here once it is live." />
              </GlassCard>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {profile.recent_posts.slice(0, 8).map((post) => {
                  const app = profile.per_app.find((entry) => entry.app.id === post.app_id)?.app;
                  return (
                    <li key={post.id} className="grid gap-2">
                      <Thumb art={post.thumb} aspect="9:16" app={app ? { name: app.name, art: app.icon } : undefined} durationSec={Math.round(post.duration_ms / 1000)} label={`${app?.name ?? "App"} post on ${PLATFORM_META[post.platform].label}`} />
                      <p className="text-caption text-fg-muted tabular-nums">
                        <span className="font-semibold text-fg">{formatCompact(post.views)}</span> views · {post.funnel.trials} {post.funnel.trials === 1 ? "trial" : "trials"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={`History with ${me.brand?.name ?? "your brand"}`} description="Everything between you and this creator, in one place.">
            <GlassCard padding="md" className="grid gap-5">
              {history.submissions.length === 0 && history.offers.length === 0 ? (
                <EmptyState
                  size="sm"
                  art="inbox"
                  title="No history yet"
                  description="Send an offer or invite them to a bounty. Their first approved video starts a track record with you."
                  action={
                    <Button variant="secondary" disabled={!accepts} onClick={() => setComposer({ kind: "direct" })}>
                      Send offer
                    </Button>
                  }
                />
              ) : (
                <>
                  <dl className="grid grid-cols-3 gap-4">
                    <Fact label="Submissions">{history.submissions.length}</Fact>
                    <Fact label="Approved">{approved}</Fact>
                    <Fact label="Not approved">{rejected}</Fact>
                  </dl>
                  {history.offers.length > 0 ? (
                    <ul className="grid divide-y divide-divider" aria-label="Offers">
                      {history.offers.map((offer) => (
                        <li key={offer.id}>
                          <Link href={offerHref(offer)} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-(--fd-dur-fast) hover:bg-surface-hover">
                            <div className="grid min-w-0 flex-1 gap-0.5">
                              <span className="truncate text-body-sm font-semibold text-fg">{offer.title}</span>
                              <span className="text-caption text-fg-subtle">{formatDate(offer.updated_at, "medium")}</span>
                            </div>
                            <span className="text-body-sm font-medium text-fg tabular-nums">{offer.amount_cents > 0 ? formatMoney(offer.amount_cents, { cents: "never" }) : "Invite"}</span>
                            <DomainStatusPill meta={OFFER_STATUS_META[offer.status]} value={offer.status} size="md" />
                            <ArrowUpRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </GlassCard>
          </Section>
        </div>

        <div className="grid min-w-0 gap-6 lg:sticky lg:top-24">
          <GlassCard padding="md" className="grid gap-4">
            <h2 className="font-display text-title-sm text-fg">Rate card</h2>
            {rate_card ? (
              <>
                <div>
                  <p className="font-display text-figure-lg text-fg tabular-nums">{formatMoney(rate_card.price_per_video_cents, { cents: "never" })}</p>
                  <p className="text-caption text-fg-subtle">per video, organic posting included</p>
                </div>
                <dl className="grid gap-2.5 text-body-sm">
                  <Row label="Paid-ad usage" value={`${rate_card.paid_usage_days} days included`} hint={`Each extra 30 days is ${Math.round(rate_card.paid_usage_pct_per_30d * 100)}% of the base price`} />
                  <Row label="Minimum CPM" value={formatCpm(rate_card.min_cpm_cents, "short")} hint="On open bounties" />
                  <Row label="Turnaround" value={`${rate_card.turnaround_days} days`} />
                  <Row label="Capacity" value={`${rate_card.max_videos_per_month} videos a month`} />
                  <Row label="Replies in" value={`about ${Math.max(1, Math.round(rate_card.stats.median_response_hours))} hours`} hint={`${rate_card.stats.accepted} of ${rate_card.stats.offers_received} offers accepted`} />
                </dl>
                {rate_card.packages.length > 0 ? (
                  <ul className="grid gap-1.5 rounded-lg bg-surface-field p-3 text-caption" aria-label="Packages">
                    {rate_card.packages.map((pack) => (
                      <li key={pack.label} className="flex justify-between gap-3">
                        <span className="text-fg-muted">
                          {pack.label} · {pack.videos} {pack.videos === 1 ? "video" : "videos"}
                        </span>
                        <span className="font-semibold text-fg tabular-nums">{formatMoney(pack.price_per_video_cents, { cents: "never" })} each</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {rate_card.suggested ? (
                  <p className="text-caption text-fg-subtle">
                    Market band {formatMoney(rate_card.suggested.low_cents, { cents: "never" })} to {formatMoney(rate_card.suggested.high_cents, { cents: "never" })}.{" "}
                    {rate_card.price_per_video_cents > rate_card.suggested.high_cents ? "Their ask is above it." : rate_card.price_per_video_cents < rate_card.suggested.low_cents ? "Their ask is below it." : "Their ask is inside it."}
                  </p>
                ) : null}
                <Button variant="primary" leadingIcon={<Send />} disabled={!accepts} onClick={() => setComposer({ kind: "direct" })}>
                  Send offer
                </Button>
              </>
            ) : (
              <p className="text-body-sm text-fg-muted">No rate card yet. Rate cards open at Silver. You can still invite them to a bounty.</p>
            )}
          </GlassCard>

          <GlassCard padding="md" className="grid gap-4">
            <h2 className="font-display text-title-sm text-fg">Why this reliability</h2>
            <ReliabilityMeter view={profile.reliability} />
            {reputation && reputation.components.length > 0 ? (
              <ul className="grid gap-3 text-caption">
                {reputation.components.map((component) => (
                  <li key={component.key} className="grid gap-0.5">
                    <p className="flex justify-between gap-3">
                      <span className="font-medium text-fg">{component.label}</span>
                      <span className="text-fg-muted tabular-nums">{Math.round(component.value * 100)}%</span>
                    </p>
                    <p className="text-fg-subtle">{component.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-fg-subtle">Reasons appear once five posts are decided. Until then, we show a range and never a verdict.</p>
            )}
          </GlassCard>

          <GlassCard padding="md" className="grid gap-3">
            <h2 className="flex items-center gap-2 font-display text-title-sm text-fg">
              <ShieldCheck aria-hidden="true" className="size-5 text-fg-muted" strokeWidth={1.75} />
              Integrity, last 90 days
            </h2>
            <p className="text-body-sm text-fg">
              <span className="font-semibold">{BAND_COPY[band].label}.</span> <span className="text-fg-muted">{BAND_COPY[band].detail}</span>
            </p>
            <dl className="grid grid-cols-3 gap-3">
              <Fact label="Highest score">{fraud.max_score_90d}</Fact>
              <Fact label="Flags">{fraud.flags_90d}</Fact>
              <Fact label="Clawbacks">{fraud.clawbacks_90d}</Fact>
            </dl>
            <p className="flex items-start gap-1.5 text-micro text-fg-subtle">
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
              Brands see the summary. The evidence stays with flowd Trust and Safety, and views that fail a check are never paid.
            </p>
          </GlassCard>

          <GlassCard padding="md" className="grid gap-3">
            <h2 className="font-display text-title-sm text-fg">Accounts</h2>
            <ul className="grid gap-2.5">
              {platforms.map((account) => (
                <li key={account.id} className="flex items-center gap-3">
                  <PlatformGlyph platform={account.platform} size={28} />
                  <div className="grid min-w-0 flex-1">
                    <span className="truncate text-body-sm font-medium text-fg">@{account.handle}</span>
                    <span className="text-caption text-fg-subtle tabular-nums">
                      {formatCompact(account.followers)} followers · {formatCompact(account.median_views_28d)} median views
                    </span>
                  </div>
                  {account.verified_by_platform ? <BadgeCheck aria-label="Verified by the platform" className="size-4 shrink-0 text-accent" strokeWidth={2} /> : null}
                </li>
              ))}
            </ul>
            <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
              <Globe aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {profile.us_audience_ratio > 0 ? `${formatPct(profile.us_audience_ratio, 0)} US audience on their strongest account` : "Audience location not shared yet"}
            </p>
            <div className="grid gap-0.5 text-caption">
              <p className="flex items-center gap-1.5 text-fg-subtle">
                <CalendarClock aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                Public storefront
              </p>
              <a href={`/c/${creator.handle}`} className="truncate font-mono text-accent hover:underline">
                {profile.storefront_url}
              </a>
            </div>
          </GlassCard>
        </div>
      </div>

      <OfferSheet
        open={composer !== null}
        onOpenChange={(next) => {
          if (!next) setComposer(null);
        }}
        targets={[target]}
        initialKind={composer?.kind ?? "direct"}
      />
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-fg-muted">{label}</dt>
        <dd className="font-semibold text-fg tabular-nums">{value}</dd>
      </div>
      {hint ? <dd className="text-micro text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}

