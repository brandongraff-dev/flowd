"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/shell/phone-frame";
import { BriefScreen, ScriptScreen, SubmitScreen } from "./studio-screens";
import { StudioScreen, type StudioState } from "./studio-screen";

type StepId = "brief" | "script" | "capture" | "score" | "fix" | "submit";

const STEPS: readonly { id: StepId; title: string; body: string; note?: string }[] = [
  {
    id: "brief",
    title: "Start from the brief",
    body: "Open a funded bounty and Studio loads it: the rate, the three things to say, the licence on the Rights Card and the deadline. You know what you are agreeing to before you press record.",
    note: "Pay Math shows what a typical video earns, as a range, beside the best case.",
  },
  {
    id: "script",
    title: "Pick an opening line",
    body: "Flo drafts hooks from the brief and the format you chose, and scores each one with the same checklist as the free Hook Score. You edit anything, and you can write your own.",
    note: "Flo is checklist-based and can be wrong. It is a writing partner, not a verdict.",
  },
  {
    id: "capture",
    title: "Say it with the script at the lens",
    body: "The script sits beside the camera at your pace, with the current line bright and the last ones dimmed. A live checklist ticks each must-say beat as you speak it, and safe-zone guides keep captions clear of the platform's buttons.",
    note: "Works offline. A call or a dropped signal saves a draft.",
  },
  {
    id: "score",
    title: "See a score with reasons",
    body: "Hook Score checks your first three seconds: is the hook line landing inside two, is the same text on screen, is a face in frame, is the app visible. Every point has a timecode, and the band is a letter and a word, never colour alone.",
    note: "Checklist score. It gets smarter as bounties settle.",
  },
  {
    id: "fix",
    title: "Fix it in one tap",
    body: "Each lost point comes with a deterministic fix. Tap \"move the app reveal up\" and the band updates on the spot. You decide what to keep: nothing is applied behind your back.",
  },
  {
    id: "submit",
    title: "Submit with everything in order",
    body: "#ad and the brand's wording are added to your caption and locked. Studio checks the spoken and on-screen disclosure and the music, you accept the Rights Card, and up to the cap is reserved for you the moment you submit.",
    note: "Approval isn't guaranteed: the brand decides within 72 hours, and a no comes with a reason.",
  },
];

const CAPTURE: StudioState = { phase: "read", line: 1 };
const SCORED: StudioState = { phase: "scored", line: 3 };
const FIXED: StudioState = { phase: "fixed", line: 3 };

function Screen({ id }: { id: StepId }) {
  switch (id) {
    case "brief":
      return <BriefScreen />;
    case "script":
      return <ScriptScreen />;
    case "capture":
      return <StudioScreen state={CAPTURE} />;
    case "score":
      return <StudioScreen state={SCORED} />;
    case "fix":
      return <StudioScreen state={FIXED} />;
    case "submit":
      return <SubmitScreen />;
  }
}

const LABEL: Record<StepId, string> = {
  brief: "the brief with the rate, three things to say and the Rights Card",
  script: "Flo's three hook options, each with a checklist score",
  capture: "the camera with the script at the lens and a live checklist",
  score: "the Hook Score at a B with timecoded reasons",
  fix: "the Hook Score at an A after the one-tap fix",
  submit: "the submit screen with the disclosure locked and the money reserved",
};

function StepBlock({ step, index, active, onActive }: { step: (typeof STEPS)[number]; index: number; active: boolean; onActive: (id: StepId) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const centred = useInView(ref, { margin: "-42% 0px -42% 0px" });
  useEffect(() => {
    if (centred) onActive(step.id);
  }, [centred, onActive, step.id]);

  return (
    <li ref={ref} className="grid content-center gap-5 py-10 lg:min-h-[78vh] lg:py-0">
      <div className={cn("grid gap-4 transition-opacity duration-300 lg:opacity-45", active && "lg:opacity-100")}>
        <p className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-accent-soft font-display text-body-sm font-bold text-accent tabular-nums">
            {index + 1}
          </span>
          <span className="fd-eyebrow text-fg-subtle">Step {index + 1} of {STEPS.length}</span>
        </p>
        <h3 className="text-display-sm text-fg">{step.title}</h3>
        <p className="text-body-lg max-w-[48ch] text-pretty text-fg-muted">{step.body}</p>
        {step.note ? <p className="text-caption max-w-[56ch] text-fg-subtle">{step.note}</p> : null}
      </div>
      {/* small screens: the phone sits under its step */}
      <div className="lg:hidden">
        <PhoneFrame width={260} className="mx-auto" label={`Studio showing ${LABEL[step.id]}.`}>
          <Screen id={step.id} />
        </PhoneFrame>
      </div>
    </li>
  );
}

/**
 * The Studio walk-through: six steps in a column and one phone that stays in view and changes screen as each step reaches the middle of the
 * viewport. Below 1024px each step carries its own phone instead (a pinned phone would eat the screen). Nothing here moves on its own: the scroll is
 * the only driver, so reduced motion needs no special case beyond a quicker fade.
 */
export function StudioScroller() {
  const [active, setActive] = useState<StepId>("brief");

  return (
    <div className="grid gap-x-16 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ol className="grid">
        {STEPS.map((step, index) => (
          <StepBlock key={step.id} step={step} index={index} active={active === step.id} onActive={setActive} />
        ))}
      </ol>
      <div className="relative hidden lg:block">
        <div className="sticky top-28 grid justify-items-center pt-4">
          <PhoneFrame width={330} label={`Studio showing ${LABEL[active]}.`}>
            <div key={active} className="size-full motion-safe:animate-[fd-mk-screen_260ms_cubic-bezier(0.23,1,0.32,1)]">
              <Screen id={active} />
            </div>
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}
