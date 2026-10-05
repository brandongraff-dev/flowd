"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Flame, Hourglass, Snowflake, Sparkles, TrendingUp } from "lucide-react";
import { NOTIFICATION_KIND_META, TREND_DIRECTION_META, type WeekOutcome } from "@/lib/contract/types";
import type { CreatorHome, NotificationView, StreakView } from "@/lib/data/selectors";
import { useTrends } from "@/lib/data";
import { formatClockEta, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Progress, Skeleton, buttonVariants, toneClasses } from "@/components/ui";
import { Amount } from "./amount";

function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="fd-eyebrow text-fg-subtle">{children}</h2>
      {aside}
    </div>
  );
}

// ── streak ─────────────────────────────────────────────────────────────────────────────────────

const WEEK_LABEL: Record<WeekOutcome, string> = { posted: "Posted", freeze_used: "Freeze used", rest: "Rest week", missed: "No post" };

function WeekDot({ week, current }: { week: StreakView["weeks"][number]; current: boolean }) {
  const label = `${week.iso_week.slice(5)}: ${WEEK_LABEL[week.outcome]}`;
  return (
    <li title={label} className="grid justify-items-center gap-1">
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 place-items-center rounded-full text-micro font-bold",
          week.outcome === "posted" && "bg-mint-solid text-on-mint",
          week.outcome === "freeze_used" && "bg-info-soft text-info shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-info)_40%,transparent)]",
          week.outcome === "rest" && "text-info shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--fd-info)_55%,transparent)]",
          week.outcome === "missed" && "bg-surface-field text-fg-disabled shadow-[inset_0_0_0_1px_var(--fd-rim)]",
          current && "ring-2 ring-accent-bright ring-offset-2 ring-offset-surface",
        )}
      >
        {week.outcome === "posted" ? <Check className="size-3.5" strokeWidth={3} /> : week.outcome === "freeze_used" ? <Snowflake className="size-3.5" strokeWidth={2.25} /> : null}
      </span>
    </li>
  );
}

/** The streak: weekly, slack-based. Twelve weeks as dots (posted, freeze, rest, none), the freezes you hold, and calm copy. It never nags. */
export function StreakCard({ streak, loading, className }: { streak: StreakView | null; loading?: boolean; className?: string }) {
  if (loading || !streak) {
    return (
      <GlassCard className={cn("grid gap-4", className)} aria-busy="true">
        <Skeleton shape="text" className="h-3 w-20" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-6 w-full" />
      </GlassCard>
    );
  }
  const last = streak.weeks.length - 1;
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <CardTitle aside={streak.best_weeks > streak.current_weeks ? <span className="text-caption text-fg-subtle tabular-nums">Best {streak.best_weeks} weeks</span> : null}>Streak</CardTitle>
      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-ember-soft text-ember shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-ember)_32%,transparent)]">
          <Flame className="size-6" strokeWidth={2} />
        </span>
        <div className="grid">
          <p className="font-display text-figure-lg text-fg tabular-nums">
            {streak.current_weeks}
            <span className="ml-1.5 text-body font-semibold text-fg-muted">{streak.current_weeks === 1 ? "week" : "weeks"}</span>
          </p>
          <p className="flex items-center gap-1.5 text-caption text-fg-muted">
            {streak.freezes_banked > 0 ? (
              <>
                {Array.from({ length: streak.freezes_banked }, (_, i) => (
                  <Snowflake key={i} aria-hidden="true" className="size-3.5 text-info" strokeWidth={2.25} />
                ))}
                {streak.freezes_banked} {streak.freezes_banked === 1 ? "freeze" : "freezes"} banked
              </>
            ) : (
              "No freezes banked yet"
            )}
          </p>
        </div>
      </div>
      <ol className="grid grid-cols-12 gap-1" aria-label="Last 12 weeks">
        {streak.weeks.map((week, i) => (
          <WeekDot key={week.iso_week} week={week} current={i === last} />
        ))}
      </ol>
      <p className="text-caption text-fg-muted">
        {streak.detail}
        {streak.status === "active" && !streak.posted_this_week ? ` ${streak.days_left_in_week} ${streak.days_left_in_week === 1 ? "day" : "days"} left this week.` : ""}
      </p>
    </GlassCard>
  );
}

// ── tier ───────────────────────────────────────────────────────────────────────────────────────

/** The tier path: where you are, what the next tier needs (the bottleneck first) and what it unlocks. Earned, never bought. */
export function TierProgressCard({ tier, loading, className }: { tier: CreatorHome["tier"]; loading?: boolean; className?: string }) {
  const creator = tier.creator;
  if (loading || !creator) {
    return (
      <GlassCard className={cn("grid gap-4", className)} aria-busy="true">
        <Skeleton shape="text" className="h-3 w-16" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-16 w-full" />
      </GlassCard>
    );
  }
  const name = creator.tier[0]?.toUpperCase() + creator.tier.slice(1);
  const next = tier.next ? tier.next[0]?.toUpperCase() + tier.next.slice(1) : null;
  const open = tier.remaining.filter((r) => !r.met).slice(0, 3);
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <CardTitle aside={<Link href="/creator/tiers" className="inline-flex items-center gap-1 rounded-sm text-caption font-semibold text-accent hover:underline">All tiers<ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.25} /></Link>}>Tier</CardTitle>
      <div className="flex items-center gap-3.5">
        <TierBadge tier={creator.tier} size={56} decorative />
        <div className="grid">
          <p className="font-display text-title-md text-fg">{name}</p>
          <p className="text-caption text-fg-muted">{next ? `${Math.round(tier.progress * 100)}% of the way to ${next}` : "The top tier. Reviewed by hand."}</p>
        </div>
      </div>
      {next ? (
        <>
          <Progress value={Math.round(tier.progress * 100)} tone="flow" size="sm" aria-label={`Progress to ${next}`} valueText={`${Math.round(tier.progress * 100)} percent of the way to ${next}`} />
          <ul className="grid gap-1.5 text-caption text-fg-muted">
            {open.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <Hourglass aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" strokeWidth={2} />
                {r.text}
              </li>
            ))}
            {open.length === 0 ? <li>Everything is met. Elite also needs a manual review.</li> : null}
          </ul>
          {creator.tier_hold_until && tier.grace ? <p className="rounded-xl bg-info-soft px-3 py-2 text-caption text-fg">No tier drop for {tier.grace.days_left} more days, even after a dip.</p> : null}
        </>
      ) : null}
    </GlassCard>
  );
}

// ── first dollar ───────────────────────────────────────────────────────────────────────────────

const FIRST_DOLLAR_STEPS: readonly { id: string; label: string; eta: string; done: (ids: ReadonlySet<string>) => boolean }[] = [
  { id: "scored", label: "Score a take", eta: "Hook Score checks the first 3 seconds", done: (d) => d.has("first_submission") },
  { id: "submitted", label: "Submit it", eta: "Decision within 24 hours", done: (d) => d.has("first_submission") },
  { id: "approved", label: "Get approved", eta: "Approval isn't guaranteed: the video must meet the brief", done: (d) => d.has("first_approval") },
  { id: "cleared", label: "First dollar clears", eta: "Within 48 hours of approval", done: (d) => d.has("first_dollar") },
];

/** The First-Dollar tracker (F-073): four steps with a promise on each, shown until the first dollar clears. */
export function FirstDollarTracker({ home, className }: { home: CreatorHome["first_dollar"]; className?: string }) {
  if (home.complete || home.total === 0) return null;
  const doneIds = new Set(home.steps.filter((s) => s.done).map((s) => s.id));
  const states = FIRST_DOLLAR_STEPS.map((s) => s.done(doneIds));
  const current = states.findIndex((d) => !d);
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <CardTitle aside={<Badge tone="accent">First dollar in 72 hours</Badge>}>First dollar</CardTitle>
      <ol className="grid gap-3 sm:grid-cols-2">
        {FIRST_DOLLAR_STEPS.map((step, i) => (
          <li key={step.id} aria-current={i === current ? "step" : undefined} className={cn("flex items-start gap-3 rounded-2xl p-3", i === current ? "bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_32%,transparent)]" : "bg-surface-field")}>
            <span aria-hidden="true" className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold", states[i] ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-muted")}>
              {states[i] ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="grid gap-0.5">
              <span className="text-body-sm font-semibold text-fg">
                {step.label}
                <span className="sr-only">{states[i] ? ", done" : i === current ? ", next" : ""}</span>
              </span>
              <span className="text-caption text-fg-muted">{step.eta}</span>
            </span>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}

// ── what to post, next steps, activity, flo ────────────────────────────────────────────────────

export function WhatToPost({ items, loading, className }: { items: CreatorHome["what_to_post"]; loading?: boolean; className?: string }) {
  const now = useNow();
  const rising = useTrends({ direction: "rising", kind: "format" })[0];
  if (loading) return <Skeleton className={cn("h-40 w-full rounded-[28px]", className)} />;
  return (
    <GlassCard className={cn("grid gap-4", className)}>
      <CardTitle>What to post today</CardTitle>
      {items.length === 0 ? (
        <p className="text-body-sm text-fg-muted">Nothing is waiting on you. Pick a bounty from the feed and make a take when you feel like it.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.href}-${item.title}`}>
              <Link href={item.href} className="group flex items-center justify-between gap-3 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-body-sm font-semibold text-fg">{item.title}</span>
                  <span className="line-clamp-2 text-caption text-fg-muted">
                    {item.detail}
                    {item.due_at ? ` Held until ${formatClockEta(item.due_at, { now })} UTC.` : ""}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rising ? (
        <Link href="/creator/remix" className="group flex items-start gap-3 rounded-2xl p-3 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
          <span aria-hidden="true" className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", toneClasses(TREND_DIRECTION_META[rising.direction].tone, "soft"))}>
            <TrendingUp className="size-4" strokeWidth={2} />
          </span>
          <span className="grid gap-0.5">
            <span className="text-body-sm font-semibold text-fg">
              Rising: {rising.label} <span className="font-medium text-mint">{rising.change_copy}</span>
            </span>
            <span className="text-caption text-fg-muted">{rising.why_it_works}</span>
          </span>
        </Link>
      ) : null}
    </GlassCard>
  );
}

export function NextSteps({ steps, className }: { steps: CreatorHome["next_steps"]; className?: string }) {
  if (steps.length === 0) return null;
  return (
    <GlassCard className={cn("grid gap-3", className)}>
      <CardTitle>Next steps</CardTitle>
      <ul className="grid gap-1">
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-3 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
              <span className="grid gap-0.5">
                <span className="text-body-sm font-semibold text-fg">{step.title}</span>
                <span className="text-caption text-fg-muted">{step.detail}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

export function ActivityList({ items, className }: { items: readonly NotificationView[]; className?: string }) {
  const now = useNow();
  return (
    <GlassCard className={cn("grid gap-3", className)}>
      <CardTitle>Activity</CardTitle>
      {items.length === 0 ? (
        <p className="text-body-sm text-fg-muted">Approvals, cleared money and offers show up here as they happen.</p>
      ) : (
        <ul className="grid">
          {items.slice(0, 5).map((n) => {
            const meta = NOTIFICATION_KIND_META[n.kind];
            const body = (
              <>
                <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-accent-bright" : "bg-transparent")} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body-sm font-semibold text-fg">
                      {n.title}
                      {n.unread ? <span className="sr-only"> (unread)</span> : null}
                    </span>
                    <time dateTime={n.created_at} className="shrink-0 text-micro text-fg-subtle tabular-nums">
                      {formatRelative(n.created_at, now, { style: "short" })}
                    </time>
                  </span>
                  {n.amount_cents !== undefined ? <Amount cents={n.amount_cents} state="cleared" signDisplay="always" size="sm" icon={false} /> : null}
                  <span className="line-clamp-1 text-caption text-fg-muted">{n.body}</span>
                  <span className="sr-only">{meta.label}</span>
                </span>
              </>
            );
            return (
              <li key={n.id} className="border-b border-divider last:border-b-0">
                {n.href ? (
                  <Link href={n.href} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 py-3 hover:bg-surface-hover">
                    {body}
                  </Link>
                ) : (
                  <div className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

/** Flo, the copilot: violet, one line of what it can do and one link. It is checklist-based and says so on its own page. */
export function FloEntry({ className }: { className?: string }) {
  return (
    <GlassCard tint="violet" className={cn("grid gap-3", className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-violet-solid text-on-violet">
          <Sparkles className="size-[18px]" strokeWidth={2} />
        </span>
        <h2 className="font-display text-title-sm text-fg">Ask Flo</h2>
      </div>
      <p className="text-body-sm text-fg-muted">Three script options for any bounty, a sharper hook, a caption with #ad in the right place. Checklist-based, so check it against the brief.</p>
      <Link href="/creator/flo" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
        Open Flo
        <ArrowRight aria-hidden="true" />
      </Link>
    </GlassCard>
  );
}
