import Link from "next/link";
import { Ban, BadgeCheck, CircleCheck, Flag, Lock, MessagesSquare, ScanSearch, ShieldAlert, TriangleAlert, UserRoundX } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { AppIcon } from "@/components/brand/app-icon";
import { DemoTag } from "@/components/shell/demo-banner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Progress } from "@/components/ui/progress";
import { ArrowLink, FactCard, Figure, IconTile, PageSection } from "../kit";
import type { HeadlineMetric, MeasuredPromise, ScorecardTeaser, TrustPageData } from "./trust-data";

function StatusBadge({ status }: { status: "met" | "below" }) {
  return status === "met" ? (
    <Badge tone="mint" size="md" icon={<CircleCheck aria-hidden="true" />}>
      On target
    </Badge>
  ) : (
    <Badge tone="sun" size="md" icon={<TriangleAlert aria-hidden="true" />}>
      Below target
    </Badge>
  );
}

/** The hero art: every promise that has a published target, one row each, with the ones we are missing in plain sight. */
export function TrustReportCard({ measured, asOf }: { measured: readonly MeasuredPromise[]; asOf: string }) {
  const met = measured.filter((item) => item.status === "met").length;
  return (
    <GlassCard padding="lg" className="mx-auto grid w-full max-w-[36rem] gap-5 lg:ml-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="fd-eyebrow text-fg-subtle">Promises with a target</p>
          <p className="fd-figure text-figure-xl text-fg">
            {met} of {measured.length}
            <span className="ml-2 text-title-sm font-semibold text-fg-muted">on target</span>
          </p>
        </div>
        <DemoTag />
      </div>
      <div aria-hidden="true" className="flex gap-1">
        {measured.map((item) => (
          <span key={item.key} className={cn("h-2 flex-1 rounded-pill", item.status === "met" ? "bg-mint-solid" : "bg-sun-solid")} />
        ))}
      </div>
      <ul className="grid gap-2">
        {measured.map((item) => (
          <li key={item.key} className="flex items-center gap-3 rounded-2xl bg-surface-field px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            {item.status === "met" ? <CircleCheck aria-hidden="true" className="size-[18px] shrink-0 text-mint" strokeWidth={2} /> : <TriangleAlert aria-hidden="true" className="size-[18px] shrink-0 text-sun" strokeWidth={2} />}
            <p className="min-w-0 flex-1 truncate text-body-sm text-fg">
              <span className="sr-only">{item.status === "met" ? "On target: " : "Below target: "}</span>
              {item.label}
            </p>
            <p className="fd-figure shrink-0 text-body-sm font-semibold text-fg tabular-nums">{(item.value * 100).toFixed(item.value === 1 ? 0 : 1)}%</p>
          </li>
        ))}
      </ul>
      <p className="text-caption text-fg-subtle">As of {formatDateTime(asOf)}. Where a promise has no row here it has no ratio to hold, and is on the Promise page.</p>
    </GlassCard>
  );
}

function HeadlineCard({ metric }: { metric: HeadlineMetric }) {
  return (
    <GlassCard padding="lg" className="grid content-start gap-5">
      <Figure label={metric.label} value={metric.figure} trailing={<StatusBadge status={metric.status} />} />
      <p className="text-caption font-medium text-fg-muted">Target: {metric.target}</p>
      <p className="text-body-sm text-fg-muted">{metric.meaning}</p>
      <div className="grid gap-1 border-t border-divider pt-4">
        <p className="fd-eyebrow text-fg-subtle">If we miss it</p>
        <p className="text-body-sm text-fg-muted">{metric.consequence}</p>
      </div>
    </GlassCard>
  );
}

export function LiveMetricsSection({ data }: { data: TrustPageData }) {
  return (
    <PageSection
      id="live"
      eyebrow="Live promise metrics"
      title="The four numbers that matter most"
      description="Computed from the ledger, not written by marketing. Each has a target beside it, and when we miss one the page says so."
      actions={<ArrowLink href="/promise">All eleven promises</ArrowLink>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {data.headline.map((metric) => (
          <HeadlineCard key={metric.id} metric={metric} />
        ))}
      </div>
      <p className="mt-6 max-w-[72ch] text-caption text-fg-subtle">
        As of {formatDateTime(data.asOf)}. Demo data: the demo world is small and generated, so these figures show how the page behaves, not how a launched market performs. Targets are hypotheses we hold ourselves to, not guarantees.
      </p>
    </PageSection>
  );
}

function ScorecardRow({ card }: { card: ScorecardTeaser }) {
  return (
    <li>
      <Link
        href={`/scorecard/${card.brandId}`}
        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-3xl p-4 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover sm:grid-cols-[auto_minmax(0,1fr)_14rem] sm:p-5"
      >
        <AppIcon art={card.art} name={card.name} size={48} decorative />
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-title-sm text-fg">
            {card.name}
            {card.verified ? (
              <Badge tone="accent" size="sm" icon={<BadgeCheck aria-hidden="true" />}>
                Verified
              </Badge>
            ) : null}
          </p>
          <p className="text-caption text-fg-subtle">
            {card.label} · {card.decidesIn ?? "decision time not yet public"} · {card.sample}
          </p>
        </div>
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-fg-subtle">Reliability</span>
            <span className="fd-figure text-figure-md text-fg">
              {card.reliability}
              <span className="text-caption font-medium text-fg-subtle"> / 100</span>
            </span>
          </p>
          <Progress value={card.reliability} tone="accent" size="sm" aria-label={`${card.name} reliability`} valueText={`${card.reliability} out of 100`} />
        </div>
      </Link>
    </li>
  );
}

export function ScorecardsSection({ data }: { data: TrustPageData }) {
  return (
    <PageSection
      id="scorecards"
      eyebrow="Brands are scored too"
      title="The Brand Scorecard, in public"
      description="Creators deserve to know how a brand treats them before they spend a minute. Four measures are public for every brand with enough history: pay speed, decision time, approval fairness and the share of approved work actually run."
    >
      <div className="grid gap-6">
        <GlassCard padding="none" className="p-2 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2 sm:px-5">
            <p className="font-display text-title-sm text-fg">Most reliable brands, 90 days</p>
            <DemoTag />
          </div>
          <ul className="grid">{data.scorecards.map((card) => <ScorecardRow key={card.brandId} card={card} />)}</ul>
        </GlassCard>
        <p className="max-w-[72ch] text-caption text-fg-subtle">
          {data.scorecardCount} brands have a Scorecard. A brand with fewer than 10 decisions shows &ldquo;New brand&rdquo; and its sample size, never a verdict. A slow or unfair brand shows that too: the score is computed the same way for everyone, and a brand cannot hide its page.
        </p>
      </div>
    </PageSection>
  );
}

const POLICIES = [
  {
    icon: <Ban />,
    tone: "rose" as const,
    title: "No pay-to-join",
    body: "No bounty may ask a creator to pay, buy a product or deposit money to take part. Brief Lint blocks it before a brief can publish, and a report is triaged within 24 hours.",
  },
  {
    icon: <UserRoundX />,
    tone: "ember" as const,
    title: "No burner accounts",
    body: "A bounty cannot demand new accounts, forced posting counts or an account you would not normally use. Your real account is the only one you ever need.",
  },
  {
    icon: <ScanSearch />,
    tone: "accent" as const,
    title: "Original work only",
    body: "Account Health checks flag duplicates, watermarks and subtitle-only reposts before you post, so a platform strike never comes as a surprise. You can appeal a flag.",
  },
  {
    icon: <Lock />,
    tone: "mint" as const,
    title: "In-app chat only",
    body: "Brand and creator messages stay in flowd, where they are kept as evidence. Anyone who asks you to move to another app is breaking the rules, and you can report it in two taps.",
  },
];

export function PoliciesSection() {
  return (
    <PageSection
      id="policies"
      eyebrow="Policies we enforce"
      title="The rules that protect creators"
      description="These are written into the product, not just the terms. Most are checked by code before a human ever has to."
      actions={<ArrowLink href="/legal/community-rules">Read the community rules</ArrowLink>}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POLICIES.map((policy) => (
          <FactCard key={policy.title}>
            <IconTile tone={policy.tone}>{policy.icon}</IconTile>
            <h3 className="font-display text-title-md text-fg">{policy.title}</h3>
            <p className="text-body-sm text-fg-muted">{policy.body}</p>
          </FactCard>
        ))}
      </div>
    </PageSection>
  );
}

const STEPS = [
  { title: "Stay in the app", body: "A real brand has no reason to move you to another chat app. If someone does, stop and report it." },
  { title: "Never pay to join", body: "No legitimate bounty asks for a fee, a deposit, a purchase or your card details. None on flowd can." },
  { title: "Look for the Funded badge", body: "Funded means the whole pool is in escrow and approved posts are paid even if the pool runs out. No badge, no work." },
  { title: "Check the Scorecard", body: "Open the brand's Scorecard. Slow decisions, a low reliability score or no history yet are all worth knowing before you film." },
  { title: "Report it in two taps", body: "Use Report on any bounty, message or offer in the app, or the form below if you are not signed in. A person reads every report." },
];

const RED_FLAGS = [
  "Asks you to pay, buy something or send a deposit",
  "Wants to chat on another app, or by email, instead of in flowd",
  "Needs a brand-new account, or a set number of posts a day",
  "Says an unfunded bounty is funded, or pays only in gift cards",
  "Sends a link that does not go to the App Store or flowd",
  "Pushes you to hurry: a countdown that is not on the bounty page",
];

export function ScamShieldSection() {
  return (
    <PageSection id="scam-shield" eyebrow="Scam Shield" title="How to spot a scam, and what to do" description="Most scams on creator platforms follow the same five or six moves. Knowing them takes a minute.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <GlassCard padding="lg">
          <ol className="grid gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
                <span aria-hidden="true" className="fd-figure grid size-9 place-items-center rounded-full bg-accent-soft text-body-sm font-bold text-accent">
                  {index + 1}
                </span>
                <div className="grid gap-1">
                  <h3 className="text-body font-semibold text-fg">{step.title}</h3>
                  <p className="text-body-sm text-fg-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </GlassCard>
        <GlassCard tint="rose" padding="lg" className="grid content-start gap-5">
          <div className="flex items-center gap-3">
            <IconTile tone="rose">
              <ShieldAlert />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Red flags</h3>
          </div>
          <ul className="grid gap-3">
            {RED_FLAGS.map((flag) => (
              <li key={flag} className="flex items-start gap-2.5 text-body-sm text-fg-muted">
                <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-rose" strokeWidth={2} />
                {flag}
              </li>
            ))}
          </ul>
          <Link href="/trust/report" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Report a scam or abuse
          </Link>
          <p className="text-caption text-fg-subtle">No account needed. Reports are triaged within 24 hours.</p>
        </GlassCard>
      </div>
    </PageSection>
  );
}

const SUPPORT = [
  { who: "Scam and abuse reports", commitment: "Triaged within 24 hours", detail: "A person reads it, and you get a case ID." },
  { who: "Disputes about views or pay", commitment: "A human reply within 48 hours", detail: "A proposed target. Undisputed money is never held." },
  { who: "Identity and business checks that need a person", commitment: "Decided within 24 hours", detail: "Most checks decide at once." },
  { who: "Everything else", commitment: "A reply within one business day", detail: "From a person, not a bot." },
];

export function SupportSection() {
  return (
    <PageSection
      id="support"
      eyebrow="Human support"
      title="A person, with a named deadline"
      description="Every queue has an owner and a clock. The deadlines are targets we publish and measure, not promises of an outcome."
      actions={<ArrowLink href="/help#contact">Contact support</ArrowLink>}
    >
      <GlassCard padding="none" className="p-2 sm:p-3">
        <ul className="grid divide-y divide-divider">
          {SUPPORT.map((row) => (
            <li key={row.who} className="grid gap-1 px-4 py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6 sm:px-5">
              <p className="flex items-center gap-2.5 text-body font-semibold text-fg">
                <MessagesSquare aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                {row.who}
              </p>
              <p className="text-body-sm font-semibold text-accent">{row.commitment}</p>
              <p className="text-body-sm text-fg-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
      </GlassCard>
      <p className="mt-6 text-body-sm text-fg-muted">
        Is something down right now?{" "}
        <Link href="/status" className="font-semibold text-accent underline underline-offset-4">
          Check system status
        </Link>
        .
      </p>
    </PageSection>
  );
}
