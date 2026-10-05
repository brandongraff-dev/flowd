"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { BrandOverview } from "@/lib/data/selectors";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { Progress } from "@/components/ui/progress";

const STEP_COPY: Record<BrandOverview["checklist"][number]["id"], { hint: string; cta: string }> = {
  connect: { hint: "Paste your App Store link, then connect RevenueCat so trials and paid conversions are tied to the creator who earned them.", cta: "Connect your app" },
  fund: { hint: "Money sits in escrow and is released only for verified views. Your first bounty has no platform fee and flowd matches up to $500.", cta: "Fund your wallet" },
  brief: { hint: "Paste your App Store link and Flo drafts the brief, ten hooks and a price. You edit anything before it goes live.", cta: "Start a bounty" },
};

/**
 * The new-brand checklist: connect, fund, brief. It leads the overview until the first bounty is live, shows how far along the brand is, and
 * puts one primary action on the first step that is not done. Done steps stay visible, ticked, so progress is never hidden.
 */
export function SetupChecklist({ steps }: { steps: BrandOverview["checklist"] }) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  return (
    <GlassCard as="section" aria-labelledby="setup-title" padding="lg" tint="accent" className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <p className="fd-eyebrow text-accent">Get started</p>
          <h2 id="setup-title" className="font-display text-title-lg text-fg">
            Three steps to your first funded bounty
          </h2>
          <p className="max-w-[56ch] text-body-sm text-fg-muted">Most teams finish in about ten minutes. Nothing is charged until you fund a bounty.</p>
        </div>
        <div className="grid w-full gap-1.5 sm:w-56">
          <Progress value={done} max={steps.length} tone="flow" size="md" aria-label="Setup progress" valueText={`${done} of ${steps.length} steps done`} />
          <p className="text-caption text-fg-subtle tabular-nums">
            {done} of {steps.length} done
          </p>
        </div>
      </header>
      <ol className="grid gap-3 lg:grid-cols-3">
        {steps.map((step, index) => {
          const copy = STEP_COPY[step.id];
          const current = next?.id === step.id;
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "grid content-start gap-3 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]",
                current && "shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright)]",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full font-display text-caption font-bold tabular-nums",
                    step.done ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-muted",
                  )}
                >
                  {step.done ? <Check className="size-4" strokeWidth={2.5} /> : index + 1}
                </span>
                <h3 className="text-body-sm font-semibold text-fg">
                  {step.label}
                  <span className="sr-only">{step.done ? ", done" : current ? ", up next" : ", not started"}</span>
                </h3>
              </div>
              <p className="text-caption text-fg-muted">{copy.hint}</p>
              <div>
                <Link href={step.href} className={buttonVariants({ variant: current ? "primary" : step.done ? "plain" : "secondary", size: "sm" })}>
                  {step.done ? "Review" : copy.cta}
                  {step.done ? null : <ArrowRight aria-hidden="true" />}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
