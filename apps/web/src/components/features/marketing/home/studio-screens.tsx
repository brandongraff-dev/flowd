import { Check, Lock, Shield, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { bandDescriptor, scoreHookText } from "@/lib/engine";
import { ArtSurface } from "@/components/brand/art-surface";
import type { ArtSeed } from "@/components/brand/art";
import { Badge } from "@/components/ui/badge";
import { DEMO_APP, DEMO_HOOK } from "./studio-demo";

/*
 * The other screens of the Studio walk-through, authored at 390 x 844 for the PhoneFrame (the capture and score screens are in studio-screen.tsx).
 * They use the app's own tokens, so they follow the theme. Text is at least 14px authored (about 10.5px in a 300px phone).
 */

const THUMB: ArtSeed = { hue_a: 262, hue_b: 224, hue_c: 188, pattern: "orbs", seed: 4217 };

const Header = ({ overline, title }: { overline: string; title: string }) => (
  <div className="grid gap-1 pt-[64px]">
    <p className="fd-eyebrow !text-[12px] text-fg-subtle">{overline}</p>
    <p className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.02em]">{title}</p>
  </div>
);

/** Step 1: the brief, as the creator sees it before they start. */
export function BriefScreen() {
  return (
    <div className="relative size-full overflow-hidden px-5 pb-9 text-fg">
      <Header overline="Funded bounty" title="Wind-down routine hook" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge size="lg" tone="mint" icon={<ShieldCheck />} className="!text-[14px]">
          Funded
        </Badge>
        <Badge size="lg" tone="neutral" className="!text-[14px]">
          {DEMO_APP}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          ["$2.40", "per 1,000 views"],
          ["+$1.50", "per trial"],
          ["$250", "cap per video"],
        ].map(([figure, label]) => (
          <div key={label} className="grid gap-0.5 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="font-display text-[22px] leading-none font-bold tabular-nums">{figure}</p>
            <p className="text-[13px] leading-[1.25] text-fg-muted">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[14px] font-semibold text-fg-subtle">Say these three things</p>
      <ul className="mt-2 grid gap-2.5">
        {["It tells you when to wind down", "It works with your sleep schedule", "Free for seven days"].map((beat) => (
          <li key={beat} className="flex items-center gap-3 rounded-2xl bg-surface-field px-3.5 py-3 text-[16px] leading-[1.25] shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {beat}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-1.5 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <Shield className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />
          Rights Card
        </p>
        <p className="text-[14px] leading-[1.35] text-fg-muted">Organic posting always. Paid ads 90 days. AI likeness off. Brand decides in 72 hours.</p>
      </div>

      <span className="fd-btn fd-btn-primary absolute inset-x-5 bottom-9 inline-flex h-12 items-center justify-center rounded-pill text-[16px] font-semibold">Make a take</span>
    </div>
  );
}

const CANDIDATES = [
  DEMO_HOOK,
  "Why do you wake up at 2 a.m. every night?",
  "POV: you finally stop doomscrolling at 2 a.m.",
] as const;

/** Step 2: Flo writes hooks and scores each with the same text scorer as the free tool, so the band is real. */
export function ScriptScreen() {
  const scored = CANDIDATES.map((text) => ({ text, result: scoreHookText(text) }));
  return (
    <div className="relative size-full overflow-hidden px-5 pb-9 text-fg">
      <Header overline="Flo" title="Pick your opening line" />
      <p className="mt-2 text-[15px] leading-[1.35] text-fg-muted">Three hooks written from the brief. Each lands inside two seconds.</p>
      <ul className="mt-4 grid gap-3">
        {scored.map(({ text, result }, index) => (
          <li
            key={text}
            className={cn("grid gap-2.5 rounded-[22px] p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]", index === 0 ? "bg-violet-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-violet)_45%,transparent)]" : "bg-surface-field")}
          >
            <p className="font-display text-[20px] leading-[1.2] font-bold tracking-[-0.01em]">{text}</p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] text-fg-muted tabular-nums">
                Checklist score {result.band}, {bandDescriptor(result.band).toLowerCase()} ({result.score})
              </p>
              {index === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-solid px-3 py-1.5 text-[14px] font-semibold text-on-violet">
                  <Sparkles className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
                  Use this
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] leading-[1.35] text-fg-subtle">Flo is checklist-based and can be wrong. Check it against the brief before you post.</p>
    </div>
  );
}

/** Step 6: submit, with the disclosure locked, the licence in view and the money already set aside. */
export function SubmitScreen() {
  return (
    <div className="relative size-full overflow-hidden px-5 pb-9 text-fg">
      <Header overline="Ready to submit" title="Nap Nest, take 3" />
      <div className="mt-4 flex items-center gap-3.5 rounded-[22px] bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <div className="relative size-[76px] shrink-0 overflow-hidden rounded-2xl">
          <ArtSurface art={THUMB} aspect="9:16" className="absolute inset-0 block size-full" aria-hidden="true" />
          <div aria-hidden="true" className="absolute inset-0 bg-[rgb(2_5_16/0.5)]" />
        </div>
        <div className="grid gap-1">
          <p className="text-[16px] font-semibold">0:27, 9:16, 1080p</p>
          <p className="text-[14px] text-fg-muted">Hook Score A. All beats found.</p>
        </div>
      </div>

      <p className="mt-5 text-[14px] font-semibold text-fg-subtle">Caption</p>
      <div className="mt-2 grid gap-2 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <p className="flex items-start gap-2 text-[16px] leading-[1.3]">
          <Lock className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden="true" />
          <span>
            <strong className="font-semibold">#ad</strong> Paid partnership with Nap Nest
          </span>
        </p>
        <p className="text-[14px] text-fg-muted">Locked: added to every post automatically.</p>
      </div>

      <ul className="mt-4 grid gap-2.5 text-[15px] leading-[1.3]">
        {[
          "Disclosure found, spoken and on screen",
          "Music is from the licensed library",
          "I accept the Rights Card: organic, paid ads 90 days",
        ].map((line) => (
          <li key={line} className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-1 rounded-2xl bg-info-soft p-3.5">
        <p className="text-[15px] font-semibold text-fg">Up to $250 is reserved for you</p>
        <p className="text-[14px] text-fg-muted">The brand decides by Fri 2:00 PM. Pending shows the date it clears.</p>
      </div>

      <span className="fd-btn fd-btn-primary absolute inset-x-5 bottom-9 inline-flex h-12 items-center justify-center rounded-pill text-[16px] font-semibold">Submit for review</span>
    </div>
  );
}
