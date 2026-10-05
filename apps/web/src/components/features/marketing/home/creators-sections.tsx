import Link from "next/link";
import { ArrowRight, BadgeCheck, Ban, BellOff, Check, Clock, EyeOff, FileText, Flame, MessageCircleOff, PauseCircle, Sparkles, UserRoundCheck } from "lucide-react";
import { CONSTANTS, formatMoney } from "@/lib/engine";
import type { MedianEarnings } from "@/lib/data/selectors";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { DemoTag } from "@/components/shell/demo-banner";
import type { LessonRow } from "./data";

/** The First-Dollar Path: four steps from a scored take to cleared money, with the real timings and the honest note about approval. */
export function FirstDollarPath({ firstDollarMedianHours }: { firstDollarMedianHours: number }) {
  const steps = [
    { icon: Sparkles, title: "Make a scored take", body: "Studio opens with a small flowd-funded starter bounty already loaded, flat $5. Hook Score checks your first three seconds before you submit.", when: "Aim for under 20 minutes" },
    { icon: FileText, title: "Submit it", body: "No bank details, tax form or ID yet. Those come just in time, at your first approval, never at sign-up.", when: "Right away" },
    { icon: BadgeCheck, title: "Get a decision", body: "flowd decides on the starter bounty within 24 hours, with a reason if the answer is no. Approval isn't guaranteed: your video has to meet the brief.", when: "Within 24 hours" },
    { icon: Clock, title: "Watch it clear", body: "The flat $5 clears 48 hours after approval. Your Wallet shows the date from the moment you submit.", when: "48 hours after approval" },
  ] as const;

  return (
    <div className="grid gap-5">
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title}>
            <GlassCard padding="none" className="grid h-full content-start gap-4 rounded-[28px] p-6">
              <div className="flex items-center justify-between gap-3">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                  <step.icon />
                </span>
                <span aria-hidden="true" className="font-display text-figure-lg text-fg-subtle tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-title-md text-fg">{step.title}</h3>
              <p className="text-body-sm text-pretty text-fg-muted">{step.body}</p>
              <p className="mt-auto inline-flex w-fit items-center rounded-pill bg-info-soft px-3 py-1 text-caption font-semibold text-info">{step.when}</p>
            </GlassCard>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-fg-subtle">
        <DemoTag>Demo data</DemoTag>
        In the demo ledger, the median creator&apos;s first dollar cleared {firstDollarMedianHours} hours after they joined. Targets are ours to keep: we publish the real number on the{" "}
        <Link href="/trust" className="text-accent underline underline-offset-2">
          Trust Center
        </Link>
        .
      </p>
    </div>
  );
}

const SHIELD = [
  ["Funded badge only on fully escrowed bounties", "If the money is not in escrow, the bounty does not go live."],
  ["Chat stays in the app", "No asking you to move to email or another app. Nothing to click that takes you away."],
  ["No pay-to-join, ever", "A brand cannot charge you to take part. It is against the rules, and a report triggers a review."],
  ["No burner accounts, no forced post counts", "Brief Lint blocks bounties that demand a new account or a minimum number of posts."],
  ["Verified brands", "Business verification before a brand can fund a bounty."],
  ["A report a person reads", "The report form does not even need an account. You get a case id and a reply inside the service level."],
] as const;

const RIGHTS = [
  ["Organic posting", "Always included. You post it on your own account."],
  ["Paid-ad use", `${CONSTANTS.rights.paid_ads_default_days} days by default, priced and dated.`],
  ["Spark and partnership ads", "Only with your one-tap consent, with a term you can see."],
  ["Exclusivity", "None, unless the bounty pays for it."],
  ["AI likeness", "Off. You opt in, and only for what you choose."],
  ["Renewal", `${Math.round(CONSTANTS.rights.renewal_fee_pct_of_base_per_30d * 100)}% of the base fee for each further 30 days, quoted before you agree.`],
] as const;

/** Scam Shield, the Rights Card and the Tax Desk: the three things that protect a creator's money before a video is even made. */
export function SafetySection() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard padding="lg" className="grid content-start gap-5 rounded-[32px]">
        <div className="grid gap-1.5">
          <p className="fd-eyebrow text-fg-subtle">Scam Shield</p>
          <h3 className="text-title-lg text-fg">Safe by the rules, not by luck.</h3>
        </div>
        <ul className="grid gap-3">
          {SHIELD.map(([title, body]) => (
            <li key={title} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="grid gap-0.5">
                <span className="text-body-sm font-semibold text-fg">{title}</span>
                <span className="text-caption text-fg-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <Link href="/trust/report" className={cn(buttonVariants({ variant: "secondary" }), "w-fit")}>
          Report a scam
        </Link>
      </GlassCard>

      <div className="grid content-start gap-4">
        <GlassCard padding="lg" className="grid content-start gap-5 rounded-[32px]">
          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">Rights Card</p>
            <h3 className="text-title-lg text-fg">Know what you license, in plain English.</h3>
            <p className="text-caption text-fg-subtle">Example: every bounty carries one, and it is snapshotted when you submit.</p>
          </div>
          <dl className="grid gap-2">
            {RIGHTS.map(([label, body]) => (
              <div key={label} className="grid gap-0.5 rounded-2xl bg-surface-field px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-body-sm font-semibold text-fg">{label}</dt>
                <dd className="text-body-sm text-fg-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-3 rounded-[28px]">
          <h3 className="text-title-sm text-fg">Taxes without surprises</h3>
          <p className="text-body-sm text-pretty text-fg-muted">
            Your W-9 is asked for at your first approval, not at sign-up. Tax Desk keeps year-to-date earnings, a set-aside estimate and a CSV export, and flags that free products are taxable too. It is not tax advice.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

/** The Academy: the ten five-minute lessons, free, never required to earn and never an upsell. */
export function AcademyList({ lessons }: { lessons: LessonRow[] }) {
  return (
    <div className="grid gap-5">
      <ol className="grid gap-3 md:grid-cols-2">
        {lessons.map((lesson) => (
          <li key={lesson.slug} className="flex items-start gap-4 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-body-sm font-bold text-accent tabular-nums">
              {lesson.order}
            </span>
            <span className="grid gap-1">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h3 className="text-body font-semibold text-fg">{lesson.title}</h3>
                <span className="text-caption text-fg-subtle tabular-nums">{lesson.readMinutes} min</span>
              </span>
              <span className="text-body-sm text-pretty text-fg-muted">{lesson.summary}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href="/creator/academy" className={buttonVariants({ variant: "secondary" })}>
          Open the Academy
          <ArrowRight aria-hidden="true" />
        </Link>
        <p className="text-caption text-fg-subtle">Free. Never required to earn. No upsell, no course to buy.</p>
      </div>
    </div>
  );
}

const WELLBEING = [
  { icon: BellOff, title: "Quiet hours", body: "10 PM to 8 AM by default. Money notifications are batched, not buzzing." },
  { icon: EyeOff, title: "Numbers-off mode", body: "Hide live views and earnings for set hours, so a slow hour does not follow you to dinner." },
  { icon: PauseCircle, title: "Pause without penalty", body: "Pause keeps your tier and your streak. There is no inactivity penalty and no guilt notification." },
  { icon: Flame, title: "Weekly streaks with slack", body: `One post a week keeps it going. You earn a freeze every ${CONSTANTS.streaks.freeze_earned_every_weeks} weeks, bank up to ${CONSTANTS.streaks.freeze_bank_max}, and take ${CONSTANTS.streaks.rest_weeks_per_quarter} rest weeks a quarter.` },
  { icon: MessageCircleOff, title: "Reasons about the video", body: "A rejection says what is wrong with the video, never with you." },
  { icon: UserRoundCheck, title: "18 and over", body: "flowd is for adults. You confirm your age when you sign up." },
] as const;

/** Wellbeing Mode, written as what it does. */
export function WellbeingGrid() {
  return (
    <div className="grid gap-5">
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {WELLBEING.map((item) => (
          <li key={item.title}>
            <GlassCard padding="none" className="grid h-full content-start gap-3 rounded-[28px] p-6">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                <item.icon />
              </span>
              <h3 className="text-title-sm text-fg">{item.title}</h3>
              <p className="text-body-sm text-pretty text-fg-muted">{item.body}</p>
            </GlassCard>
          </li>
        ))}
      </ul>
      <p className="text-caption max-w-[72ch] text-fg-subtle">
        If creating is weighing on you, in the US you can call or text 988 at any hour to reach the Suicide and Crisis Lifeline. flowd cannot replace that, and it will never ask you to post more.
      </p>
    </div>
  );
}

/** The typical earnings beside the top, in one size class, with the method written out. */
export function TypicalVsTop({ median }: { median: MedianEarnings }) {
  const figures = [
    { label: "Low end (25th percentile)", cents: median.p25_cents },
    { label: "Typical (median)", cents: median.typical_cents },
    { label: "High end (75th percentile)", cents: median.p75_cents },
    { label: "Top 10%", cents: median.top_decile_cents },
  ] as const;
  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-title-md text-fg">Cleared earnings, last 30 days</h3>
            <DemoTag>Demo data</DemoTag>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map((figure) => (
              <div key={figure.label} className={cn("grid content-start gap-1.5 rounded-2xl p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]", figure.label.startsWith("Typical") ? "bg-surface-active" : "bg-surface-field")}>
                <dt className="text-caption font-medium text-fg-muted">{figure.label}</dt>
                <dd>
                  <Money cents={figure.cents} state="cleared" size="lg" decimals="never" />
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-body-sm max-w-[62ch] text-pretty text-fg-muted">{median.sentence}</p>
        </div>
        <div className="grid content-start gap-3 border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <h4 className="text-title-sm text-fg">How we calculate it</h4>
          <ul className="grid gap-2 text-body-sm text-fg-muted">
            <li className="flex items-start gap-2.5">
              <Ban aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
              Cleared earnings only: money that was still pending is not counted.
            </li>
            <li className="flex items-start gap-2.5">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-subtle" strokeWidth={2} />
              Every creator who posted or cleared money in the period ({median.active_creators_30d} of them), not only the busy ones.
            </li>
            <li className="flex items-start gap-2.5">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-fg-subtle" strokeWidth={2} />
              The typical figure is the median, so one big month cannot move it.
            </li>
          </ul>
          <Link href="/legal/earnings-disclosure" className="text-body-sm font-semibold text-accent hover:underline">
            Read the earnings disclosure
          </Link>
          <p className="text-caption text-fg-subtle">{formatMoney(median.typical_cents)} is what the middle creator cleared. It is not a target and not a promise.</p>
        </div>
      </div>
    </GlassCard>
  );
}
