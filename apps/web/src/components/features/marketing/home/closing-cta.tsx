import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiquidLens } from "@/components/glass/liquid-lens";
import { buttonVariants } from "@/components/ui/button-variants";
import { Container } from "@/components/shell/container";
import { DemoTag } from "@/components/shell/demo-banner";
import { GradientWord } from "./section";

/**
 * The closing call to action: two ways in, one panel. It is the second of the three Liquid Glass lens surfaces the page spends (the hero ticker is the
 * first); the lens only runs in Chromium and falls back to the same plain glass everywhere else. Text sits well inside the rim.
 */
export function ClosingCta({ foundingLeft, foundingTotal }: { foundingLeft: number; foundingTotal: number }) {
  return (
    <section aria-labelledby="closing-title" className="py-16 md:py-24">
      <Container size="content">
        <LiquidLens layer={3} radius={36} className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:p-16">
          <div className="grid gap-5">
            <p className="fd-eyebrow text-accent">Ready when you are</p>
            <h2 id="closing-title" className="text-display-lg text-fg">
              Put your next dollar where it <GradientWord>works.</GradientWord>
            </h2>
            <p className="text-body-lg max-w-[44ch] text-pretty text-fg-muted">
              Creators make a first take in Studio. Brands fund a first bounty with the fee waived. Either way, every dollar has a state and a date.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <div className="grid gap-1">
                <h3 className="text-title-sm text-fg">I make videos</h3>
                <p className="text-body-sm text-fg-muted">Free for creators. Pick a funded bounty and make your first take.</p>
              </div>
              <Link href="/signup/creator" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full")}>
                Start earning
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-3 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <div className="grid gap-1">
                <h3 className="text-title-sm text-fg">I run an app</h3>
                <p className="text-body-sm text-fg-muted">Free plan, no seats. Your first bounty has the fee waived and a match up to $500.</p>
              </div>
              <Link href="/signup/brand" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}>
                Start a bounty
              </Link>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
              Not ready?
              <Link href="/waitlist" className="font-medium text-accent underline underline-offset-2">
                Join the ranked waitlist
              </Link>
              or
              <Link href="/founding-creators" className="font-medium text-accent underline underline-offset-2">
                apply as a founding creator
              </Link>
              ({foundingLeft} of {foundingTotal} places left) <DemoTag>Demo data</DemoTag>
            </p>
          </div>
        </LiquidLens>
      </Container>
    </section>
  );
}
