"use client";

import type { ReactNode } from "react";
import { Check, Clock, Lock, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { Container } from "@/components/shell/container";
import { RevealItem, SectionReveal } from "@/components/shell/section-reveal";
import { AudienceToggle, useAudience } from "./audience";
import { Eyebrow } from "./section";

interface Step {
  title: string;
  body: string;
  visual: ReactNode;
}

/** A small "example" tile: fills only, because it sits on L1 glass. */
function Example({ children, label = "Example" }: { children: ReactNode; label?: string }) {
  return (
    <div className="grid gap-2.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      {children}
      <p className="text-micro text-fg-subtle">{label}</p>
    </div>
  );
}

const CREATOR_STEPS: readonly Step[] = [
  {
    title: "Pick a funded bounty",
    body: "Open bounties show the rate, the per-video cap and a Funded badge. No applications that go unanswered, and tiers earn early access.",
    visual: (
      <Example>
        <div className="flex items-center justify-between gap-3">
          <p className="text-body-sm font-semibold text-fg">Wind-down routine hook</p>
          <Badge tone="mint" icon={<ShieldCheck />}>
            Funded
          </Badge>
        </div>
        <p className="text-body-sm text-fg-muted">
          <span className="font-semibold text-fg tabular-nums">$2.40</span> per 1,000 views + <span className="font-semibold text-mint tabular-nums">$1.50</span> per trial. Cap $250.
        </p>
      </Example>
    ),
  },
  {
    title: "Make it in Studio",
    body: "The brief loads into a teleprompter and a live checklist. Hook Score checks your first three seconds before you post, with reasons and one-tap fixes.",
    visual: (
      <Example>
        <ul className="flex flex-wrap gap-1.5">
          {["Hook by 0:02", "App by 0:03", "#ad on screen"].map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5 rounded-pill bg-mint-soft px-2.5 py-1 text-caption font-semibold text-mint">
              <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-fg-muted">Checklist score B. One fix would make it an A.</p>
      </Example>
    ),
  },
  {
    title: "Get paid, with a date",
    body: "Views count for 72 hours, then the money clears. Pending always shows the day it clears. The Friday payout is free.",
    visual: (
      <Example>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Money cents={6240} state="pending" size="md" note="clears Mon 2:00 PM" />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Money cents={12810} state="cleared" size="md" note="pays Fri 6:00 PM" />
        </div>
      </Example>
    ),
  },
];

const BRAND_STEPS: readonly Step[] = [
  {
    title: "Fund a bounty",
    body: "Paste your App Store link and Flo drafts the brief. Brief Lint blocks traps. The bounty goes live only when escrow is full.",
    visual: (
      <Example>
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-body-sm font-semibold text-fg">
            <Lock aria-hidden="true" className="size-4" strokeWidth={1.75} />
            $5,000 in escrow
          </p>
          <Badge tone="mint" icon={<ShieldCheck />}>
            Funded
          </Badge>
        </div>
        <p className="text-body-sm text-fg-muted">First bounty: fee waived and a $500 match on top.</p>
      </Example>
    ),
  },
  {
    title: "Decide in 72 hours",
    body: "Each video arrives with a checklist score, fraud evidence and compliance checks. Timecoded feedback, two free revisions, guarded auto-approve.",
    visual: (
      <Example>
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-body-sm font-semibold text-fg">
            <Clock aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Decide by Fri 2:00 PM
          </p>
          <Badge tone="neutral">Score B</Badge>
        </div>
        <p className="text-body-sm text-fg-muted">Fraud check: low risk. Disclosure found.</p>
      </Example>
    ),
  },
  {
    title: "Pay for what clears",
    body: "Views, installs and trials settle from the ledger after the 72-hour window. Tracked results pay; estimated ones never do.",
    visual: (
      <Example>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-body-sm font-semibold text-fg tabular-nums">3,310 installs</p>
          <Badge tone="info" variant="outline" size="sm">
            Tracked
          </Badge>
        </div>
        <p className="text-body-sm text-fg-muted">$2.58 per install, all-in. Payback by day 41.</p>
      </Example>
    ),
  },
];

/**
 * Three steps per audience. It follows the hero's switch, and has its own switch for visitors who scrolled straight here. Every example tile says
 * "Example": these are illustrations of the product, not claims about results.
 */
export function HowItWorks() {
  const { audience } = useAudience();
  const steps = audience === "creators" ? CREATOR_STEPS : BRAND_STEPS;

  return (
    <SectionReveal as="section" id="how-it-works" className="scroll-mt-24 py-16 md:py-24" amount={0.1}>
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3">
            <RevealItem index={0}>
              <Eyebrow>How it works</Eyebrow>
            </RevealItem>
            <RevealItem index={1} as="h2" className="text-display-md text-fg">
              {audience === "creators" ? "From brief to cleared money in three steps." : "From App Store link to paid results in three steps."}
            </RevealItem>
          </div>
          <RevealItem index={2}>
            <AudienceToggle />
          </RevealItem>
        </div>

        <ol className="mt-10 grid gap-4 md:mt-14 lg:grid-cols-3">
          {steps.map((step, index) => (
            <RevealItem key={index} as="li" index={index + 2} className="list-none">
              <GlassCard padding="lg" className="grid h-full content-between gap-8 rounded-[28px]">
                <div className="grid gap-3">
                  <span aria-hidden="true" className="font-display text-figure-lg text-fg-subtle tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-title-lg text-fg">{step.title}</h3>
                  <p className="text-body text-pretty text-fg-muted">{step.body}</p>
                </div>
                <div className="self-end">{step.visual}</div>
              </GlassCard>
            </RevealItem>
          ))}
        </ol>
      </Container>
    </SectionReveal>
  );
}
