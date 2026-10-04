"use client";

import { useEffect, useRef, useState, type ComponentPropsWithRef } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { Money } from "@/components/ui/money";
import { ArtAvatar } from "@/components/brand/avatar";
import { PlatformGlyph, type PlatformKey } from "@/components/brand/platform-glyph";
import type { ArtSeed } from "@/components/brand/art";
import { Marquee } from "./marquee";

export interface PayoutEvent {
  id: string;
  /** "@maya.k". Fictional handles only. */
  handle: string;
  /** The creator's generated avatar seed. */
  art: ArtSeed;
  amountCents: number;
  /** The (fictional) app the bounty was for. */
  app: string;
  platform?: PlatformKey;
}

export interface PayoutTickerProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** The pool of events. The ticker walks it in order and loops. In production these are rows of the public payout ledger. */
  events: readonly PayoutEvent[];
  /** Rows shown in the `stack` layout (default 5). */
  visible?: number;
  /** Milliseconds between new rows (default 3400). Rows only advance while the ticker is on screen and the tab is visible. */
  intervalMs?: number;
  /** The "Paid today" total at the start, in cents. It grows by each new row. */
  paidTodayCents?: number;
  /** `stack`: a live list that rises. `strip`: a marquee of chips for hero rows. */
  layout?: "stack" | "strip";
  /** Show the "Demo data" tag. On by default: the numbers here are fixtures, and the UI says so (design-ux). */
  demo?: boolean;
}

const AGO = ["just now", "1 min ago", "3 min ago", "4 min ago", "6 min ago", "9 min ago", "12 min ago"] as const;

/**
 * The live-feeling payout ticker: new "earned" rows rise at the top every few seconds, older ones slide down on the `smooth`
 * spring, and the "Paid today" total counts up with each. It only runs while it is visible and the tab is foregrounded, and
 * under reduced motion it holds still (a static list). Honest by construction: it carries a "Demo data" tag, shows creator
 * handles and amounts only, and in production reads the same public ledger that backs the proof pages.
 */
export function PayoutTicker({ events, visible = 5, intervalMs = 3400, paidTodayCents = 4_821_000, layout = "stack", demo = true, className, ...props }: PayoutTickerProps) {
  if (layout === "strip") return <PayoutStrip events={events} demo={demo} className={className} {...props} />;
  return <PayoutStack events={events} visible={visible} intervalMs={intervalMs} paidTodayCents={paidTodayCents} demo={demo} className={className} {...props} />;
}

function PayoutStack({ events, visible, intervalMs, paidTodayCents, demo, className, ...props }: Required<Pick<PayoutTickerProps, "events" | "visible" | "intervalMs" | "paidTodayCents" | "demo">> & Omit<ComponentPropsWithRef<"div">, "children">) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const [state, setState] = useState({ tick: 0, extra: 0 });
  const count = events.length;

  useEffect(() => {
    if (reduced || !inView || count === 0) return;
    const advance = (): void => {
      if (document.hidden) return;
      setState((previous) => ({ tick: previous.tick + 1, extra: previous.extra + (events[(previous.tick + 1) % count]?.amountCents ?? 0) }));
    };
    const timer = window.setInterval(advance, intervalMs);
    return () => window.clearInterval(timer);
  }, [reduced, inView, count, intervalMs, events]);

  const rows = Array.from({ length: Math.min(visible, count) }, (_, offset) => {
    const sequence = state.tick - offset;
    const index = ((sequence % count) + count) % count;
    return { sequence, event: events[index] as PayoutEvent, ago: AGO[Math.min(offset, AGO.length - 1)] };
  });

  return (
    <div ref={ref} className={cn("grid gap-3", className)} {...props}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="fd-pulse relative inline-flex size-2 text-mint">
            <span className="relative size-2 rounded-full bg-current" />
          </span>
          <p className="text-caption font-semibold text-fg">Paid to creators today</p>
          {demo ? <Badge size="sm" tone="neutral" variant="outline">Demo data</Badge> : null}
        </div>
        <CountUp value={Math.round((paidTodayCents + state.extra) / 100)} format={(value) => `$${Math.round(value).toLocaleString("en-US")}`} className="font-display text-title-md text-fg" />
      </div>
      <ul aria-label="Recent payouts" className="grid gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map(({ sequence, event, ago }) => (
            <motion.li
              key={sequence}
              layout="position"
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={spring.smooth}
              className="flex items-center gap-3 rounded-2xl bg-surface-field px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]"
            >
              <ArtAvatar art={event.art} name={event.handle} size={34} decorative />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="truncate text-body-sm font-medium text-fg">
                  <span className="font-semibold">{event.handle}</span> <span className="text-fg-muted">earned</span>
                </p>
                <p className="flex items-center gap-1.5 truncate text-caption text-fg-subtle">
                  {event.platform ? <PlatformGlyph platform={event.platform} size={16} decorative /> : null}
                  <span className="truncate">{event.app}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{ago}</span>
                </p>
              </div>
              <Money cents={event.amountCents} state="cleared" signDisplay="always" size="sm" />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function PayoutStrip({ events, demo, className, ...props }: Pick<PayoutTickerProps, "events" | "demo"> & Omit<ComponentPropsWithRef<"div">, "children">) {
  return (
    <div className={cn("grid gap-3", className)} {...props}>
      {demo ? (
        <p className="flex items-center gap-2 text-caption text-fg-subtle">
          <Badge size="sm" tone="neutral" variant="outline">Demo data</Badge>
          Recent creator earnings
        </p>
      ) : null}
      <Marquee gap={12} speed={32}>
        {events.map((event) => (
          <span key={event.id} className="inline-flex items-center gap-2.5 rounded-pill bg-surface-field py-1.5 pr-4 pl-1.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <ArtAvatar art={event.art} name={event.handle} size={28} decorative />
            <span className="text-body-sm font-semibold text-fg">{event.handle}</span>
            <Money cents={event.amountCents} state="cleared" signDisplay="always" size="sm" />
            <span className="text-caption whitespace-nowrap text-fg-subtle">{event.app}</span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}
