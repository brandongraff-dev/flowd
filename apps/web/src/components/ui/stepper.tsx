"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: string;
  /** One or two words: "Link", "Brief", "Pay", "Fund". */
  label: string;
  /** Shown under the label in the vertical layout (and as the subtitle in the compact phone header). */
  description?: ReactNode;
  /** Marks the step skippable ("Optional"). */
  optional?: boolean;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  /** Zero-based index of the current step. Steps before it are complete. */
  current: number;
  /** Makes completed steps buttons that jump back (never forward: validation belongs to the Next button). */
  onStepSelect?: (index: number) => void;
  /** `horizontal` (default): a header row that collapses to "Step 2 of 4" under 640px. `vertical`: a sidebar rail with descriptions. */
  orientation?: "horizontal" | "vertical";
  /** Name of the flow for assistive tech: "Create bounty progress". */
  "aria-label"?: string;
  className?: string;
}

function Indicator({ index, state, label, onSelect }: { index: number; state: "complete" | "current" | "upcoming"; label: string; onSelect?: (() => void) | undefined }) {
  const body = (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full font-display text-caption font-bold tabular-nums",
        "transition-[background-color,box-shadow,color] duration-(--fd-dur-base) ease-standard",
        state === "complete" && "bg-(image:--fd-gradient-flowButton) text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_12px_-4px_rgb(48_125_253/0.6)]",
        state === "current" && "bg-accent-soft text-accent shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright),0_0_0_4px_var(--fd-accent-soft)]",
        state === "upcoming" && "bg-surface-field text-fg-subtle shadow-[inset_0_0_0_1px_var(--fd-rim)]",
      )}
    >
      {state === "complete" ? <Check className="size-4" strokeWidth={2.5} /> : index + 1}
    </span>
  );
  if (!onSelect) return body;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Go back to ${label}, step ${index + 1}`}
      className="-m-2 rounded-full p-2 transition-transform duration-(--fd-dur-fast) ease-standard active:scale-[0.96]"
    >
      {body}
    </button>
  );
}

/**
 * Wizard / flow header: numbered steps with a connector that fills in the Flow gradient as you advance. Completed steps
 * show a check (state is never colour alone), the current step is `aria-current="step"`. Under 640px the row becomes a
 * one-line summary ("Step 2 of 4 · Pay") over a segmented bar, so the label never wraps or truncates.
 *
 * ```tsx
 * <Stepper aria-label="Create bounty" current={1} steps={[{ id: "link", label: "Link" }, { id: "brief", label: "Brief" }, { id: "pay", label: "Pay" }, { id: "fund", label: "Fund" }]} />
 * ```
 */
export function Stepper({ steps, current, onStepSelect, orientation = "horizontal", "aria-label": ariaLabel = "Progress", className }: StepperProps) {
  const stateOf = (index: number): "complete" | "current" | "upcoming" => (index < current ? "complete" : index === current ? "current" : "upcoming");
  const active = steps[Math.min(Math.max(current, 0), steps.length - 1)];

  if (orientation === "vertical") {
    return (
      <nav aria-label={ariaLabel} className={className}>
        <ol className="grid">
          {steps.map((step, index) => {
            const state = stateOf(index);
            return (
              <li key={step.id} aria-current={state === "current" ? "step" : undefined} className="relative flex gap-3.5 pb-6 last:pb-0">
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="absolute top-8 bottom-1 left-3.5 -ml-px w-0.5 overflow-hidden rounded-full bg-divider">
                    <span
                      className="absolute inset-0 origin-top bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton) transition-transform duration-(--fd-dur-slow) ease-emphasized"
                      style={{ transform: `scaleY(${index < current ? 1 : 0})` }}
                    />
                  </span>
                ) : null}
                <Indicator index={index} state={state} label={step.label} onSelect={state === "complete" && onStepSelect ? () => onStepSelect(index) : undefined} />
                <div className="grid gap-0.5 pt-[3px]">
                  <span className={cn("text-body-sm font-semibold", state === "upcoming" ? "text-fg-muted" : "text-fg")}>
                    {step.label}
                    {step.optional ? <span className="ml-1.5 text-caption font-normal text-fg-subtle">Optional</span> : null}
                    <span className="sr-only">{state === "complete" ? ", completed" : state === "current" ? ", current step" : ", upcoming"}</span>
                  </span>
                  {step.description ? <span className="text-caption text-fg-subtle">{step.description}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label={ariaLabel} className={className}>
      {/* phone: one line + segmented bar */}
      <div className="grid gap-3 sm:hidden">
        <p className="flex items-baseline justify-between gap-3">
          <span className="fd-eyebrow text-fg-subtle">
            Step {Math.min(current + 1, steps.length)} of {steps.length}
          </span>
          <span className="text-body-sm font-semibold text-fg">{active?.label}</span>
        </p>
        <ol className="flex gap-1.5" aria-hidden="true">
          {steps.map((step, index) => (
            <li key={step.id} className={cn("h-1.5 flex-1 rounded-pill transition-colors duration-(--fd-dur-slow) ease-standard", index <= current ? "bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton)" : "bg-surface-active")} />
          ))}
        </ol>
      </div>

      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const state = stateOf(index);
          const last = index === steps.length - 1;
          return (
            <li key={step.id} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center gap-2.5", !last && "flex-1")}>
              <Indicator index={index} state={state} label={step.label} onSelect={state === "complete" && onStepSelect ? () => onStepSelect(index) : undefined} />
              <span className={cn("text-body-sm font-semibold whitespace-nowrap", state === "upcoming" ? "text-fg-muted" : "text-fg")}>
                {step.label}
                <span className="sr-only">{state === "complete" ? ", completed" : state === "current" ? ", current step" : ", upcoming"}</span>
              </span>
              {!last ? (
                <span aria-hidden="true" className="relative mx-1.5 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-divider">
                  <span
                    className="absolute inset-0 origin-left bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton) transition-transform duration-(--fd-dur-slow) ease-emphasized"
                    style={{ transform: `scaleX(${index < current ? 1 : 0})` }}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
