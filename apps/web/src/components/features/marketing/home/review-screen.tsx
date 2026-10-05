import { Check, Clock, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { ArtSurface } from "@/components/brand/art-surface";
import type { ArtSeed } from "@/components/brand/art";
import { Badge } from "@/components/ui/badge";
import { HOOK_BEFORE } from "./studio-demo";

const VIDEO_ART: ArtSeed = { hue_a: 262, hue_b: 224, hue_c: 188, pattern: "orbs", seed: 4217 };

const CHECKS = ["Disclosure spoken and on screen", "Music is from the licensed library", "All three must-say beats found", "No duplicate of an earlier video"] as const;

/**
 * The brand side of the same loop, authored at 390 x 844 for the `PhoneFrame`: one submission in the review queue with its decision deadline, the
 * checklist score, the fraud and compliance checks, a timecoded note and the two decisions. Static markup with one CSS-only sweep (the playhead),
 * so it costs nothing and holds still under reduced motion.
 */
export function ReviewScreen() {
  return (
    <div className="relative size-full overflow-hidden px-5 pt-[64px] pb-9 text-fg">
      <div className="flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="fd-eyebrow !text-[12px] text-fg-subtle">Review queue</p>
          <p className="font-display text-[26px] leading-[1.1] font-bold tracking-[-0.02em]">Nap Nest</p>
        </div>
        <Badge size="lg" tone="neutral" className="!text-[14px]">
          3 waiting
        </Badge>
      </div>

      {/* the video with its timeline */}
      <div className="relative mt-4 overflow-hidden rounded-[28px] shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <div className="relative h-[250px]">
          <ArtSurface art={VIDEO_ART} aspect="16:9" className="absolute inset-0 block size-full" aria-hidden="true" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(2_5_16/0.35),rgb(2_5_16/0.82))]" />
          <p className="absolute inset-x-5 top-[84px] font-display text-[30px] leading-[1.1] font-bold tracking-[-0.02em] text-white">I deleted five sleep apps. Here&apos;s the one I kept.</p>
          <div className="absolute inset-x-5 bottom-4">
            <div className="relative h-1.5 rounded-pill bg-white/25">
              <span aria-hidden="true" className="fd-mk-playhead absolute inset-y-0 left-0 w-full rounded-pill bg-white" />
              {/* the timecoded note at 0:14 of 0:30 */}
              <span aria-hidden="true" className="absolute -top-1.5 left-[47%] size-4 rounded-full bg-[var(--fd-sun-500)] ring-2 ring-[var(--fd-abyss-1000)]" />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[13px] text-white/80 tabular-nums">
              <span>0:14</span>
              <span>0:30</span>
            </div>
          </div>
        </div>
      </div>

      {/* decision clock + score */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="grid gap-1.5 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-subtle">
            <Clock className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Decide by
          </p>
          <p className="font-display text-[20px] leading-[1.1] font-bold">Fri 2:00 PM</p>
          <p className="text-[13px] text-fg-muted">61 hours left of 72</p>
        </div>
        <div className="grid gap-1.5 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-subtle">
            <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Fraud check
          </p>
          <p className="font-display text-[20px] leading-[1.1] font-bold">Low risk</p>
          <p className="text-[13px] text-fg-muted">Checklist score {HOOK_BEFORE.band}</p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2.5">
        {CHECKS.map((check) => (
          <li key={check} className="flex items-center gap-3 text-[15px] leading-[1.3] text-fg-muted">
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {check}
          </li>
        ))}
      </ul>

      {/* timecoded note */}
      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-sun-soft p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_35%,transparent)]">
        <MessageSquarePlus className="mt-0.5 size-[18px] shrink-0 text-sun" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-[15px] leading-[1.35] text-fg">
          <span className="font-mono text-[13px] font-medium text-sun tabular-nums">0:14</span> Must fix: the app shows too late. Move it to 0:03.
        </p>
      </div>

      <div className="absolute inset-x-5 bottom-9 grid grid-cols-2 gap-3">
        <span className="fd-btn fd-btn-secondary inline-flex h-12 items-center justify-center rounded-pill text-[15px] font-semibold">Request changes</span>
        <span className="fd-btn fd-btn-primary inline-flex h-12 items-center justify-center rounded-pill text-[15px] font-semibold">Approve</span>
      </div>
    </div>
  );
}
