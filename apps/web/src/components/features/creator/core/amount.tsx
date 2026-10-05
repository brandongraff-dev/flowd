"use client";

import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWellbeing } from "@/lib/data";
import { actions } from "@/lib/store";
import { Money, notify, type MoneyProps } from "@/components/ui";

/**
 * Wellbeing Mode's "numbers off": true when the creator has turned the numbers off. Money on the creator pages renders as dots then,
 * for sighted and screen-reader users alike, so a slow week is never forced in front of anyone. The state is the saved wellbeing setting,
 * so the shell's quick toggle, the Wellbeing page and every figure agree.
 */
export function useNumbersOff(): boolean {
  const { settings } = useWellbeing();
  return settings.enabled && settings.numbers_off.enabled;
}

/** Turns numbers off or on from anywhere (the shell menu, the palette, the Wallet). Wellbeing Mode switches on with it, since it is the owner of the setting. */
export async function setNumbersOff(next: boolean, current: { numbers_off: { enabled: boolean; from?: string; to?: string } }): Promise<boolean> {
  const result = await actions.updateWellbeing({ enabled: true, numbers_off: { ...current.numbers_off, enabled: next } });
  if (!result.ok) {
    notify.error(result.error.message, { description: result.error.hint });
    return false;
  }
  notify.message(next ? "Numbers are off" : "Numbers are back on", { description: next ? "Earnings show as dots until you turn them back on." : "Your earnings are visible again." });
  return true;
}

const SIZE: Record<NonNullable<MoneyProps["size"]>, string> = {
  hero: "font-display text-figure-hero",
  xl: "font-display text-figure-xl",
  lg: "font-display text-figure-lg",
  md: "font-display text-figure-md",
  sm: "font-sans text-figure-sm",
  inherit: "",
};

/**
 * `<Money>` that honours numbers-off. Same props; when numbers are off it draws a fixed-width row of dots with a spoken "Amount hidden", and
 * keeps the state word (cleared, pending) so the layout and the meaning survive.
 */
export function Amount({ cents, state = "auto", size = "md", note, className, ...props }: MoneyProps) {
  const off = useNumbersOff();
  if (!off) return <Money cents={cents} state={state} size={size} note={note} className={className} {...props} />;
  const word = state === "cleared" ? "cleared" : state === "pending" ? "pending" : state === "paid" ? "paid out" : state === "escrow" ? "in escrow" : "";
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap text-fg-muted", SIZE[size], className)}>
      <span className="sr-only">{`Amount hidden${word ? `, ${word}` : ""}. Numbers are off.`}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1.5">
        <EyeOff className="size-[0.4em] min-h-3.5 min-w-3.5 self-center" strokeWidth={2} />
        <span className="tracking-[0.12em]">••••</span>
      </span>
      {note ? <span aria-hidden="true" className="ml-1 self-baseline text-caption font-medium tracking-normal text-fg-subtle">{note}</span> : null}
    </span>
  );
}
