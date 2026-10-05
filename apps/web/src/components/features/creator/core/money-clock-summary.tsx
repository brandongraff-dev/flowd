"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock, Pause } from "lucide-react";
import { MONEY_CLOCK_REASON_META } from "@/lib/contract/types";
import { useCreatorHome, useMoneyClock } from "@/lib/data";
import { formatClockEta, formatList, pluralise } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { GlassCard } from "@/components/glass";
import { Progress, Skeleton, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Amount } from "./amount";

const utc = (iso: string | undefined, now: number): string => (iso ? `${formatClockEta(iso, { now })} UTC` : "");

/**
 * Home's Money Clock: cleared (mint, check) and pending (lagoon, clock, hatched) as two figures side by side, never summed, each with a
 * dated sentence and the named reason it is waiting. The bar shows the share of each; money on hold is its own line with the next step.
 */
export function MoneyClockSummary({ className }: { className?: string }) {
  const home = useCreatorHome();
  const now = useNow();
  const waiting = useMoneyClock({ state: ["accruing", "pending"] });
  const held = useMoneyClock({ state: "held" });
  const wallet = home.wallet;

  if (!home.ready) {
    return (
      <GlassCard className={cn("grid gap-5", className)} aria-busy="true">
        <Skeleton shape="text" className="h-3 w-28" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-2.5 w-full" shape="pill" />
      </GlassCard>
    );
  }

  const posts = new Set(waiting.map((r) => r.post_id ?? r.id)).size;
  const reasons = [...new Set(waiting.map((r) => MONEY_CLOCK_REASON_META[r.reason].label.toLowerCase()))].slice(0, 3);
  const total = wallet.cleared_cents + wallet.pending_cents;
  const empty = total === 0 && wallet.held_cents === 0;

  return (
    <GlassCard className={cn("grid gap-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fd-eyebrow text-fg-subtle">Money Clock</h2>
        <Link href="/creator/wallet" className="inline-flex items-center gap-1 rounded-sm text-caption font-semibold text-accent hover:underline">
          Open Wallet
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        </Link>
      </div>

      {empty ? (
        <p className="max-w-[46ch] text-body-sm text-fg-muted">Your first payout lands here. Pending money shows the day it clears, with the reason it is waiting.</p>
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-mint">
                <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                Cleared
              </p>
              <Amount cents={wallet.cleared_cents} size="xl" state="cleared" animate icon={false} />
              <p className="text-caption text-fg-muted">{wallet.cleared_cents > 0 ? `Pays out ${utc(wallet.next_payout_at, now)}. Free.` : "Nothing cleared and waiting for the Friday payout."}</p>
            </div>
            <div className="grid content-start gap-1.5">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-info">
                <Clock aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                Pending
              </p>
              <Amount cents={wallet.pending_cents} size="xl" state="pending" animate icon={false} />
              <p className="text-caption text-fg-muted">
                {wallet.pending_cents > 0
                  ? `${wallet.next_clear_at ? `Next clears ${utc(wallet.next_clear_at, now)}. ` : ""}${pluralise(posts, "post")}: ${formatList(reasons)}.`
                  : "Nothing waiting to clear."}
              </p>
            </div>
          </div>
          <Progress
            value={wallet.cleared_cents}
            pending={wallet.pending_cents}
            max={Math.max(total, 1)}
            tone="mint"
            size="md"
            aria-label="Cleared compared with pending"
            valueText={`Cleared ${wallet.cleared_cents / 100} dollars, pending ${wallet.pending_cents / 100} dollars`}
          />
        </>
      )}

      {wallet.held_cents > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sun-soft p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_32%,transparent)]">
          <p className="flex items-center gap-2 text-body-sm text-fg">
            <Pause aria-hidden="true" className="size-4 text-sun" strokeWidth={2.25} />
            <Amount cents={wallet.held_cents} size="sm" state="neutral" icon={false} />
            on hold. {held[0]?.reason_text ?? "A named step releases it."}
          </p>
          <Link href="/creator/wallet" className={buttonVariants({ variant: "secondary", size: "xs" })}>
            See why
          </Link>
        </div>
      ) : null}
    </GlassCard>
  );
}
