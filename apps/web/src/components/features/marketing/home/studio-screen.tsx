"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useInView } from "motion/react";
import { AlertTriangle, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { ArtSurface } from "@/components/brand/art-surface";
import type { ArtSeed } from "@/components/brand/art";
import { ScoreRing } from "@/components/charts/score-ring";
import { bandDescriptor } from "@/lib/engine";
import { DEMO_SCRIPT, HOOK_AFTER, HOOK_BEFORE, reasonsOf, type DemoReason } from "./studio-demo";

/** The generated "camera feed": no photo, no person, just art. */
const FEED_ART: ArtSeed = { hue_a: 262, hue_b: 224, hue_c: 188, pattern: "orbs", seed: 4217 };

export const STUDIO_SCRIPT = DEMO_SCRIPT;

export type StudioPhase = "read" | "scoring" | "scored" | "fixed";

export interface StudioState {
  phase: StudioPhase;
  /** The script line being read (0 to 3). */
  line: number;
}

/** The loop: read the four lines, score the first three seconds (B), apply the one-tap fix (A), start again. Milliseconds from the start. */
const TIMELINE: readonly { at: number; state: StudioState }[] = [
  { at: 0, state: { phase: "read", line: 0 } },
  { at: 1500, state: { phase: "read", line: 1 } },
  { at: 3000, state: { phase: "read", line: 2 } },
  { at: 4500, state: { phase: "read", line: 3 } },
  { at: 6000, state: { phase: "scoring", line: 3 } },
  { at: 7000, state: { phase: "scored", line: 3 } },
  { at: 10800, state: { phase: "fixed", line: 3 } },
];
const LOOP_MS = 15600;

/**
 * Drives the mini Studio. It plays while the phone is on screen and the tab is visible, loops after one calm beat on the last frame, and under
 * reduced motion simply shows the finished state (a score with its reasons) instead of moving.
 */
export function useStudioLoop(): { ref: RefObject<HTMLDivElement | null>; state: StudioState } {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -8% 0px" });
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const [state, setState] = useState<StudioState>(TIMELINE[0]!.state);

  useEffect(() => {
    if (reduced) return;
    if (!inView) return;
    const timers: number[] = [];
    let cancelled = false;
    const run = (): void => {
      TIMELINE.forEach((step) => {
        timers.push(window.setTimeout(() => !cancelled && !document.hidden && setState(step.state), step.at));
      });
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setState(TIMELINE[0]!.state);
          run();
        }, LOOP_MS),
      );
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reduced, inView]);

  return { ref, state: reduced ? { phase: "fixed", line: 3 } : state };
}

const LINE_HEIGHT = 92;

/**
 * The camera UI is dark in both themes (it sits on a video feed), so it re-points the semantic tokens to their dark-theme values for everything
 * inside it. The shared components (the score ring) keep using `fg`, `mint`, `info`... and get the right contrast without a theme prop.
 */
export const CAMERA_SCOPE = {
  "--fd-fg": "var(--fd-abyss-50)",
  "--fd-fg-muted": "var(--fd-abyss-300)",
  "--fd-fg-subtle": "var(--fd-abyss-400)",
  "--fd-surface-active": "rgb(255 255 255 / 0.12)",
  "--fd-chart-axis": "rgb(255 255 255 / 0.4)",
  "--fd-mint": "var(--fd-mint-500)",
  "--fd-accent": "var(--fd-azure-300)",
  "--fd-info": "var(--fd-lagoon-500)",
  "--fd-ember": "var(--fd-ember-400)",
  "--fd-rose": "var(--fd-rose-400)",
} as CSSProperties;

function reasonsFor(phase: StudioPhase): DemoReason[] {
  return reasonsOf(phase === "fixed" ? HOOK_AFTER : HOOK_BEFORE);
}

/**
 * The creator's Studio, authored at 390 x 844 for the `PhoneFrame`: the brief's script at the lens with the line being read bright and the
 * past lines dimmed, the live checklist ticking as beats are spoken, and the Hook Score ring sweeping to a band with timecoded reasons and a
 * one-tap fix. It is a checklist score and says so. Pure presentation: pass a `state`, or use `useStudioLoop` to animate it.
 */
export function StudioScreen({ state }: { state: StudioState }) {
  const { phase, line } = state;
  const scored = phase === "scored" || phase === "fixed";
  const score = phase === "fixed" ? HOOK_AFTER.points : phase === "scored" ? HOOK_BEFORE.points : 0;
  const reasons = reasonsFor(phase);

  const chips = [
    { label: "Hook line", done: line >= 1 || scored },
    { label: "App name", done: line >= 3 || scored },
    { label: "#ad", done: phase !== "read" },
  ];

  return (
    <div className="relative size-full overflow-hidden bg-[var(--fd-abyss-1000)] text-[var(--fd-abyss-50)]" style={CAMERA_SCOPE}>
      {/* camera feed + scrim: white text on art always sits on a scrim (BRAND.md 6.6) */}
      <ArtSurface art={FEED_ART} aspect="9:16" className="absolute inset-0 block size-full" aria-hidden="true" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(2_5_16/0.3)_0%,rgb(2_5_16/0.46)_34%,rgb(2_5_16/0.66)_56%,rgb(2_5_16/0.94)_76%,rgb(2_5_16/0.97)_100%)]" />

      {/* top row */}
      <div className="absolute inset-x-5 top-[62px] flex items-center justify-between gap-3 text-white">
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-white/14 ring-1 ring-white/20">
          <X className="size-[18px]" strokeWidth={2} />
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-2 text-[15px] leading-none font-semibold ring-1 ring-white/16">
          <ShieldCheck className="size-4 text-[var(--fd-mint-400)]" strokeWidth={2} aria-hidden="true" />
          Funded &middot; $2.40 per 1,000
        </span>
        <span className="w-9" aria-hidden="true" />
      </div>

      {/* live checklist */}
      <div className="absolute inset-x-5 top-[116px] flex gap-2 text-white" aria-hidden="true">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] leading-none font-semibold ring-1 transition-colors duration-300",
              chip.done ? "bg-[color-mix(in_oklab,var(--fd-mint-500)_26%,transparent)] ring-[color-mix(in_oklab,var(--fd-mint-400)_55%,transparent)]" : "bg-white/10 text-white/70 ring-white/16",
            )}
          >
            <span className={cn("grid size-4 place-items-center rounded-full transition-all duration-300", chip.done ? "bg-[var(--fd-mint-400)] text-[var(--fd-abyss-1000)]" : "bg-white/16")}>
              {chip.done ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            {chip.label}
          </span>
        ))}
      </div>

      {/* teleprompter: the reading band stays put, the script moves through it */}
      <div className="absolute inset-x-0 top-[160px] h-[270px] overflow-hidden" aria-hidden="true">
        <div className="absolute inset-x-4 top-[88px] h-[92px] rounded-3xl bg-white/12 ring-1 ring-white/25" />
        <ol
          className="absolute inset-x-0 top-[88px] px-9 transition-transform duration-[650ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
          style={{ transform: `translateY(${-line * LINE_HEIGHT}px)` }}
        >
          {STUDIO_SCRIPT.map((text, index) => (
            <li
              key={text}
              style={{ height: LINE_HEIGHT }}
              className={cn(
                "flex items-center font-display text-[27px] leading-[1.14] font-bold tracking-[-0.015em] text-white transition-opacity duration-500",
                index === line ? "opacity-100" : index < line ? "opacity-35" : "opacity-55",
              )}
            >
              <span className="line-clamp-2">{text}</span>
            </li>
          ))}
        </ol>
        <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgb(2_5_16/0.6),transparent)]" />
      </div>

      {/* Hook Score card */}
      <div className="absolute inset-x-4 bottom-[34px] rounded-[28px] bg-[rgb(8_17_42/0.82)] p-5 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16),0_20px_40px_-20px_rgb(1_4_20/0.8)]">
        <div className="flex items-center gap-5">
          <div className="shrink-0">
            {scored ? (
              <ScoreRing name="Hook Score" score={score} size={118} checklist={false} />
            ) : (
              <div aria-hidden="true" className="relative grid size-[118px] place-items-center">
                <svg width="118" height="118" viewBox="0 0 118 118" className="absolute inset-0">
                  <circle cx="59" cy="59" r="54" fill="none" stroke="var(--fd-surface-active)" strokeWidth="9" strokeLinecap="round" strokeDasharray="2 12" />
                </svg>
                <span className="font-display text-[30px] font-bold text-white/55">{phase === "scoring" ? "..." : "?"}</span>
              </div>
            )}
          </div>
          <div className="grid min-w-0 gap-1.5">
            <p className="fd-eyebrow !text-[12px] !text-white/70">Hook Score</p>
            <p className="font-display text-[26px] leading-[1.1] font-bold tracking-[-0.02em]">
              {phase === "read" ? "Say it, then check it" : phase === "scoring" ? "Checking first 3 s" : phase === "scored" ? `${bandDescriptor(HOOK_BEFORE.band)}. One fix.` : `${bandDescriptor(HOOK_AFTER.band)} open`}
            </p>
            <p className="text-[14px] leading-[1.35] text-white/72">Checklist score. It gets smarter as bounties settle.</p>
          </div>
        </div>

        <ul className="mt-4 grid gap-2" aria-label="Why this score">
          {reasons.map((reason, index) => (
            <li
              key={reason.text}
              style={{ transitionDelay: scored ? `${index * 110}ms` : "0ms" }}
              className={cn("flex items-center gap-3 rounded-2xl bg-white/9 px-3.5 py-2.5 text-[15px] leading-[1.25] transition-all duration-500", scored ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}
            >
              <span className="w-9 shrink-0 font-mono text-[13px] font-medium text-white/70 tabular-nums">{reason.at}</span>
              <span className="min-w-0 flex-1">{reason.text}</span>
              {reason.ok ? (
                <Check className="size-[18px] shrink-0 text-[var(--fd-mint-400)]" strokeWidth={2.5} aria-label="Passed" />
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--fd-sun-500)] px-2.5 py-1 text-[13px] font-bold text-[var(--fd-abyss-1000)]">
                  <Sparkles className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
                  Fix
                </span>
              )}
            </li>
          ))}
        </ul>
        {phase === "scored" ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-white/72">
            <AlertTriangle className="size-4 text-[var(--fd-sun-400)]" strokeWidth={2} aria-hidden="true" />
            One tap moves the app reveal up.
          </p>
        ) : null}
      </div>
    </div>
  );
}
