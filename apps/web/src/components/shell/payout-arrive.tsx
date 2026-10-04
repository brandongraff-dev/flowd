"use client";

import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Landmark, WalletMinimal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease, iconSwap, spring } from "@/lib/motion";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Money } from "@/components/ui/money";
import { ConfettiBurst } from "./confetti-burst";

export interface PayoutArriveProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** The cleared amount, integer cents. */
  cents: number;
  /** What it was for: "Nap Nest, hook B" or "Weekly payout". */
  source?: string;
  /** Line under the figure (default "Cleared. It's in your Wallet now."). */
  message?: ReactNode;
  /**
   * The typical (median) amount for the same period. It sits in the same view, in the same size class, always: a celebratory
   * number never appears without the median beside it (FTC-careful earnings language, BRAND.md 4.3).
   */
  median?: { cents: number; label: string };
  /** Replays the moment each time this number changes. */
  play?: number;
  /** Confetti with the arrival (default true; it is skipped under reduced motion). */
  confetti?: boolean;
  /** Buttons under the card text: "Share earnings card", "View in Wallet". */
  actions?: ReactNode;
}

/**
 * The payout-arrives moment, the creator's earned-outcome celebration (DECISIONS section 5): a mint bloom, a path that draws
 * from the bank to you, the wallet icon swapping to a check, the figure counting up, and one burst of confetti. The one place
 * the brand name is a verb: "Payout flowd". It plays once on mount and again when `play` changes; interruptible (nothing locks
 * input), and under reduced motion it becomes the final state with a calm mint wash on the figure, no bloom, no path, no confetti.
 * Use it ONLY for cleared money, approvals and tier-ups: funding and spending get quiet confirmations.
 */
export function PayoutArrive({ cents, source, message = "Cleared. It's in your Wallet now.", median, play = 0, confetti = true, actions, className, ...props }: PayoutArriveProps) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const [arrived, setArrived] = useState<{ key: number; done: boolean }>({ key: play, done: false });
  const [burst, setBurst] = useState(0);
  const done = reduced || (arrived.key === play && arrived.done);

  useEffect(() => {
    if (reduced) return;
    const arrive = window.setTimeout(() => setArrived({ key: play, done: true }), 620);
    const fireConfetti = window.setTimeout(() => {
      if (confetti) setBurst((value) => value + 1);
    }, 760);
    return () => {
      window.clearTimeout(arrive);
      window.clearTimeout(fireConfetti);
    };
  }, [play, reduced, confetti]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("relative isolate overflow-hidden rounded-[28px] bg-surface p-7 text-center shadow-[inset_0_0_0_1px_var(--fd-rim),var(--fd-elevation-2)] sm:p-9", className)}
      {...props}
    >
      <span className="sr-only">
        Payout flowd. {`$${(cents / 100).toFixed(2)}`} cleared to your Wallet{source ? ` from ${source}` : ""}.
        {median ? ` Typical creator, ${median.label}: $${(median.cents / 100).toFixed(2)} (median).` : ""}
      </span>
      <div aria-hidden="true" className="contents" key={play}>
        {/* the bloom: a mint wash that opens from the middle */}
        <motion.div
          className="pointer-events-none absolute left-1/2 top-[38%] -z-10 size-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--fd-mint-400) 34%, transparent), color-mix(in oklab, var(--fd-lagoon-400) 14%, transparent) 55%, transparent)" }}
          initial={reduced ? false : { opacity: 0, scale: 0.55 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, ease: ease.emphasized }}
        />

        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-pill bg-mint-soft px-3 py-1 text-caption font-semibold text-mint">
          <Check className="size-3.5" strokeWidth={2.5} />
          Payout flowd
        </p>

        {/* bank to you */}
        <div className="mx-auto mb-5 flex w-full max-w-60 items-center justify-between">
          <span className="grid size-11 place-items-center rounded-full bg-surface-field text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <Landmark className="size-5" strokeWidth={1.75} />
          </span>
          <svg viewBox="0 0 120 44" className="h-11 flex-1 overflow-visible" fill="none">
            <path d="M2 22C34 2 86 42 118 22" stroke="var(--fd-rim-strong)" strokeWidth="2" strokeLinecap="round" />
            <motion.path
              d="M2 22C34 2 86 42 118 22"
              stroke="var(--fd-mint)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.62, ease: ease.emphasized, delay: 0.1 }}
            />
          </svg>
          <span className="relative grid size-11 place-items-center rounded-full bg-mint-soft text-mint shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-mint)_40%,transparent)]">
            <AnimatePresence initial={false} mode="popLayout">
              {done ? (
                <motion.span key="check" {...iconSwap} className="absolute grid place-items-center">
                  <Check className="size-5" strokeWidth={2.5} />
                </motion.span>
              ) : (
                <motion.span key="wallet" {...iconSwap} className="absolute grid place-items-center">
                  <WalletMinimal className="size-5" strokeWidth={1.75} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </div>

        <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? { duration: 0 } : { ...spring.bouncy, delay: 0.3 }}>
          <Money cents={cents} size="hero" state="cleared" animate="mount" icon={false} className="justify-center" />
        </motion.div>
        {source ? <p className="mt-2 text-caption font-medium text-fg-muted">{source}</p> : null}
        <p className="mx-auto mt-3 max-w-[32ch] text-body text-fg-muted">{message}</p>
        {median ? (
          <p className="mx-auto mt-4 inline-flex flex-wrap items-baseline justify-center gap-x-1.5 rounded-pill bg-surface-field px-3.5 py-1.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            Typical creator, {median.label}:
            <Money cents={median.cents} size="sm" icon={false} decimals="auto" />
            <span className="text-fg-subtle">(median)</span>
          </p>
        ) : null}
      </div>
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">{actions}</div> : null}
      <ConfettiBurst fire={burst} origin={{ x: 0.5, y: 0.5 }} />
    </div>
  );
}
