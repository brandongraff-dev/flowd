import Link from "next/link";
import { ArrowRight, Building2, CircleCheck, Video } from "lucide-react";
import { CONSTANTS } from "@/lib/engine";
import { formatHours, formatMoney, formatPct } from "@/lib/format";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import type { AuthSnapshot } from "./auth-data";
import { AuthHeading } from "./auth-parts";

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-body-sm text-fg-muted">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** `/signup`: creator or brand. One line of value and one line of public proof for each, then straight to the right form. Server component. */
export function SignupChooser({ snapshot }: { snapshot: AuthSnapshot }) {
  const { median, trust } = snapshot;
  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-10">
      <AuthHeading
        id="signup-title"
        eyebrow="Join flowd"
        title={
          <>
            Which side of the <span className="fd-gradient-text">market</span> are you on?
          </>
        }
        description="Creators make videos for app bounties and get paid for what works. Brands fund the bounties and pay only for results that clear. Both start free."
      />

      <div className="grid gap-5 md:grid-cols-2">
        <GlassCard padding="lg" className="grid content-start gap-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-6 [&_svg]:stroke-[1.75]">
              <Video />
            </span>
            <p className="fd-eyebrow text-fg-subtle">I make videos</p>
          </div>
          <div className="grid gap-2">
            <h2 className="font-display text-title-lg text-balance text-fg">Get paid for videos that work.</h2>
            <p className="text-body text-fg-muted">Open bounties for app UGC, paid on verified views, installs and trials. Your first video takes about three minutes.</p>
          </div>
          <Points
            items={[
              "No followers needed to start. A flowd-funded starter bounty pays a flat $5 on approval.",
              "Every dollar has a date: pending, then cleared, then paid. The weekly payout is free.",
              "Creators never pay to join, and nobody can ask you to.",
            ]}
          />
          <p className="rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span className="font-semibold text-fg">Typical creator, last {median.period}: {formatMoney(median.typical_cents)}</span> (middle half {formatMoney(median.p25_cents)} to {formatMoney(median.p75_cents)}). The top 10% earned {formatMoney(median.top_decile_cents)}. Results vary, and approval is never guaranteed.
          </p>
          <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" }) + " w-full justify-between"}>
            <span>Create a creator account</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </GlassCard>

        <GlassCard padding="lg" className="grid content-start gap-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-info-soft text-info [&_svg]:size-6 [&_svg]:stroke-[1.75]">
              <Building2 />
            </span>
            <p className="fd-eyebrow text-fg-subtle">I run an app</p>
          </div>
          <div className="grid gap-2">
            <h2 className="font-display text-title-lg text-balance text-fg">Fund the videos that move installs.</h2>
            <p className="text-body text-fg-muted">Set a rate, escrow the pool, and pay only for the views, installs and trials that clear. Set up takes minutes.</p>
          </div>
          <Points
            items={[
              `Your first bounty has the platform fee waived, and flowd matches up to ${formatMoney(CONSTANTS.fees.matched_first_bounty_cap_cents, { cents: "never" })}.`,
              "A bounty goes live only when it is fully escrowed. Creators see the Funded badge before they spend a minute.",
              "You decide in 72 hours with a reason, or the video is escalated and your Scorecard takes the hit.",
            ]}
          />
          <p className="rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span className="font-semibold text-fg">Median decision time: {formatHours(trust.medianDecisionHours)}</span> across brands on flowd. {formatPct(trust.fundedLiveRatio, 0)} of live bounties were fully funded at go-live.
          </p>
          <Link href="/signup/brand" className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full justify-between"}>
            <span>Create a brand workspace</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </GlassCard>
      </div>

      <nav aria-label="Other ways in" className="flex flex-wrap items-center gap-x-8 gap-y-2 text-body-sm text-fg-muted">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
        <p>
          Agency or consultant?{" "}
          <Link href="/partners" className="font-semibold text-accent underline underline-offset-4">
            See the partner programme
          </Link>
        </p>
        <p>
          Just looking?{" "}
          <Link href="/tools" className="font-semibold text-accent underline underline-offset-4">
            Try the free tools
          </Link>
        </p>
      </nav>
    </div>
  );
}
