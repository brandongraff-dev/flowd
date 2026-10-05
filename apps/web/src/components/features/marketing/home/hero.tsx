"use client";

import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassPill } from "@/components/glass/glass";
import { LiquidLens } from "@/components/glass/liquid-lens";
import { buttonVariants } from "@/components/ui/button-variants";
import { Money } from "@/components/ui/money";
import { Container } from "@/components/shell/container";
import { DemoTag } from "@/components/shell/demo-banner";
import { PayoutTicker, type PayoutEvent } from "@/components/shell/payout-ticker";
import { PhoneFrame } from "@/components/shell/phone-frame";
import type { MedianEarnings } from "@/lib/data/selectors";
import { AudienceToggle, ByAudience, useAudience } from "./audience";
import { HeroAurora } from "./hero-aurora";
import { ReviewScreen } from "./review-screen";
import { StudioScreen, useStudioLoop } from "./studio-screen";
import { GradientWord } from "./section";

export interface HeroProps {
  median: MedianEarnings;
  events: PayoutEvent[];
  paidTodayCents: number;
}

/**
 * The landing hero. The headline never changes ("Money follows what works."); the audience switch changes what is said under it and what the phone
 * shows: Studio and a Hook Score for creators, the review queue for app teams. The live payout ticker sits in a Liquid Glass lens beside the phone,
 * and the typical creator is always shown beside the top 10% in the same size.
 */
export function Hero({ median, events, paidTodayCents }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <HeroAurora />
      <Container size="wide" className="relative z-[1] grid items-center gap-x-10 gap-y-12 pt-6 pb-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:pt-10 xl:gap-x-16">
        <HeroCopy median={median} />
        <HeroStage events={events} paidTodayCents={paidTodayCents} />
      </Container>
    </section>
  );
}

function HeroCopy({ median }: { median: MedianEarnings }) {
  const { audience } = useAudience();
  const creators = audience === "creators";
  const primary = creators ? { href: "/signup/creator", label: "Start earning" } : { href: "/signup/brand", label: "Start a bounty" };
  const secondary = creators ? { href: "#money-clock", label: "See how payouts work" } : { href: "#pricing", label: "See the all-in price" };

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <AudienceToggle />
      </div>

      <h1 id="hero-title" className="text-display-xl text-fg lg:text-display-xl xl:text-display-2xl">
        Money follows <GradientWord>what works.</GradientWord>
      </h1>

      <div className="grid max-w-[54ch] gap-3">
        <p className="text-body-lg font-medium text-fg">flowd is the open market for app creators. Brands fund bounties. Creators compete. Results get paid.</p>
        <p className="text-body-lg text-pretty text-fg-muted" aria-live="polite">
          {creators
            ? "Pick a funded bounty, make a take in Studio, and watch every dollar move from pending to cleared with a date on it."
            : "Set a rate, escrow the pool, and pay only for views, installs and trials that clear. Every video is scored and checked before you decide."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={primary.href} className={buttonVariants({ variant: "primary", size: "lg" })}>
          {primary.label}
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href={secondary.href} className={buttonVariants({ variant: "secondary", size: "lg" })}>
          {secondary.label}
        </Link>
      </div>
      <p className="text-caption max-w-[56ch] text-fg-subtle">
        {creators
          ? "Free for creators, 18 and over. Approval isn't guaranteed: every video has to meet the brief."
          : "Free plan, no seats, no minimums. Your first bounty has the fee waived and flowd matches up to $500."}
      </p>

      <TypicalBesideTop median={median} />
    </div>
  );
}

/** The honest earnings line: the typical (median) creator and the top 10%, same size, same period, with the method one click away. */
function TypicalBesideTop({ median }: { median: MedianEarnings }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="fd-eyebrow text-fg-subtle">Creator earnings, last 30 days</p>
        <DemoTag>Demo data</DemoTag>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:max-w-[34rem]">
        <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <dt className="text-caption font-medium text-fg-muted">Typical creator (median)</dt>
          <dd>
            <Money cents={median.typical_cents} state="cleared" size="lg" decimals="always" animate="mount" />
          </dd>
        </div>
        <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <dt className="text-caption font-medium text-fg-muted">Top 10% of creators</dt>
          <dd>
            <Money cents={median.top_decile_cents} state="cleared" size="lg" decimals="always" animate="mount" />
          </dd>
        </div>
      </dl>
      <p className="text-caption max-w-[62ch] text-fg-subtle">
        Middle half of {median.active_creators_30d} active creators: {formatRange(median.p25_cents, median.p75_cents)}. Results vary; this is not a guarantee.{" "}
        <Link href="/legal/earnings-disclosure" className="text-accent underline underline-offset-2">
          How we calculate it
        </Link>
        .
      </p>
    </div>
  );
}

function formatRange(lowCents: number, highCents: number): string {
  const money = (cents: number): string => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${money(lowCents)} to ${money(highCents)}`;
}

function HeroStage({ events, paidTodayCents }: { events: PayoutEvent[]; paidTodayCents: number }) {
  const { audience } = useAudience();
  const studio = useStudioLoop();
  const creators = audience === "creators";

  return (
    <div className="relative mx-auto grid w-full max-w-[26rem] justify-items-center pb-2 xl:mx-0 xl:max-w-none xl:justify-items-end">
      <div className="relative">
        <div ref={studio.ref}>
          <PhoneFrame
            width={320}
            label={
              creators
                ? "Studio on a phone: the brief's script at the lens, a live checklist, then a Hook Score with timecoded reasons and a one-tap fix."
                : "The review queue on a phone: a submission with its decision deadline, a checklist score, fraud and compliance checks, and a timecoded note."
            }
          >
            <ByAudience creators={<StudioScreen state={studio.state} />} brands={<ReviewScreen />} />
          </PhoneFrame>
        </div>

        <GlassPill size="md" className="absolute -top-3 -right-3 z-10 sm:-right-8 xl:-right-10" tint={creators ? "none" : "mint"}>
          {creators ? (
            <>
              <Sparkles className="size-4 text-violet" strokeWidth={2} aria-hidden="true" />
              Checklist score, not a verdict
            </>
          ) : (
            <>
              <ShieldCheck className="size-4 text-mint" strokeWidth={2} aria-hidden="true" />
              Funded &middot; $5,500 in escrow
            </>
          )}
        </GlassPill>

        <LiquidLens
          radius={28}
          className={cn("relative z-10 -mt-8 w-[24rem] max-w-[calc(100vw-2rem)] p-7", "xl:absolute xl:bottom-14 xl:-left-[21.5rem] xl:mt-0")}
        >
          <PayoutTicker events={events} visible={3} paidTodayCents={paidTodayCents} intervalMs={3600} />
        </LiquidLens>
      </div>
    </div>
  );
}

/** The strip under the hero: the same ledger rows as a quiet marquee, plus the three facts that never change. */
export function HeroStrip({ events }: { events: PayoutEvent[] }) {
  return (
    <div className="relative z-[1] -mt-4 pb-6">
      <Container size="wide" className="grid gap-8">
        <ul className="grid gap-x-8 gap-y-3 text-body-sm text-fg-muted sm:grid-cols-3">
          {[
            ["Funded or not live", "A bounty goes live only when its escrow is full."],
            ["A decision in 72 hours", "With a reason, or an automatic escalation."],
            ["Pending always has a date", "Every earning shows when it clears."],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span>
                <strong className="font-semibold text-fg">{title}.</strong> {body}
              </span>
            </li>
          ))}
        </ul>
        <PayoutTicker events={events} layout="strip" />
      </Container>
    </div>
  );
}

