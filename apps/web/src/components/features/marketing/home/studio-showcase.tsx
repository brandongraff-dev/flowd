import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { ScoreRing } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { HOOK_BEFORE, reasonsOf } from "./studio-demo";

const CARD = "grid h-full content-between gap-6 rounded-[28px] p-6";

/**
 * Three things Studio does that an upload button does not, each with a small picture of it. A fuller walk-through is on /studio. The pictures are
 * HTML and CSS, never screenshots, and each one is labelled as an example where it shows a number.
 */
export function StudioShowcase() {
  return (
    <div className="grid gap-5">
      <ul className="grid gap-4 md:grid-cols-3">
        <li>
          <GlassCard padding="none" className={CARD}>
            <div className="grid gap-2">
              <h3 className="text-title-md text-fg">The brief at the lens</h3>
              <p className="text-body-sm text-pretty text-fg-muted">The brief loads as a teleprompter beside the camera at your pace, with a live checklist that ticks as you say each must-say beat.</p>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-bg-sunken p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]" aria-hidden="true">
              <p className="font-display text-body-sm font-bold text-fg opacity-35">I deleted five sleep apps.</p>
              <p className="my-1.5 rounded-xl bg-surface-active px-3 py-2 font-display text-body font-bold text-fg">Number three fixed my 2 a.m. wake-ups.</p>
              <p className="font-display text-body-sm font-bold text-fg opacity-55">Nap Nest tells you when to wind down.</p>
            </div>
          </GlassCard>
        </li>
        <li>
          <GlassCard padding="none" className={CARD}>
            <div className="grid gap-2">
              <h3 className="text-title-md text-fg">A score with reasons</h3>
              <p className="text-body-sm text-pretty text-fg-muted">Hook Score checks your first three seconds and shows the timecode behind each point, with a one-tap fix. A checklist score, not a verdict.</p>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <ScoreRing name="Hook Score" score={HOOK_BEFORE.points} size={92} checklist={false} />
              <ul className="grid gap-1.5 text-caption text-fg-muted">
                {reasonsOf(HOOK_BEFORE).map((reason) => (
                  <li key={reason.at} className={cn("flex items-center gap-2", !reason.ok && "font-medium text-fg")}>
                    {reason.ok ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-mint" strokeWidth={3} /> : <span aria-hidden="true" className="size-3.5 shrink-0 rounded-full bg-sun" />}
                    <span className="tabular-nums">{reason.at}</span> {reason.text}
                  </li>
                ))}
              </ul>
            </div>
          </GlassCard>
        </li>
        <li>
          <GlassCard padding="none" className={CARD}>
            <div className="grid gap-2">
              <h3 className="text-title-md text-fg">Disclosure done for you</h3>
              <p className="text-body-sm text-pretty text-fg-muted">#ad and the brand's wording are added to your caption and locked, and Studio checks the spoken and on-screen disclosure before you submit.</p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <p className="flex items-center gap-2 text-body-sm font-medium text-fg">
                <Lock aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.75} />
                #ad Nap Nest. Free for seven days.
              </p>
              <p className={cn("flex items-center gap-2 text-caption text-mint")}>
                <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                Disclosure found: spoken and on screen
              </p>
            </div>
          </GlassCard>
        </li>
      </ul>
      <div>
        <Link href="/studio" className={buttonVariants({ variant: "secondary" })}>
          See Studio
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
