"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { addHours, clockLabel, datedClockLabel, describeEarning, moneyClockState, postClearingRun, toMs, weeklyPayoutFor, windowEndsAt } from "@/lib/engine";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Money, type MoneyState } from "@/components/ui/money";
import { Slider } from "@/components/ui/slider";
import { Timeline, type TimelineItem } from "@/components/shell/timeline";

/** An example post, dated in the demo world so the dates are real engine output: 31,200 verified views at $2.00 per 1,000. */
const POSTED_AT = "2026-10-01T15:00:00Z";
const AMOUNT_CENTS = 6240;
const MAX_HOURS = 200;

type Column = "pending" | "cleared" | "paid";

const COLUMN_FOR_STATE: Record<string, Column> = { accruing: "pending", pending: "pending", cleared: "cleared", paid: "paid" };

const COLUMNS: readonly { id: Column; label: string; state: MoneyState }[] = [
  { id: "pending", label: "Pending", state: "pending" },
  { id: "cleared", label: "Cleared", state: "cleared" },
  { id: "paid", label: "Paid out", state: "paid" },
];

/**
 * The Money Clock, running on the real engine: drag through the eight days after a post goes up and watch one amount move from Pending to Cleared to
 * Paid, with the dated reason at every step. Pending, cleared and paid are three numbers, never summed. It plays once when it scrolls into view and
 * stays under the visitor's hand after that; under reduced motion it opens on the cleared state and does not play.
 */
export function MoneyClockDemo() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4, once: true });
  const [hour, setHour] = useState(reduced ? 110 : 0);
  const [touched, setTouched] = useState(false);
  const [replay, setReplay] = useState(0);

  const schedule = useMemo(() => {
    const windowEnd = windowEndsAt(POSTED_AT);
    const run = postClearingRun(windowEnd);
    const payAt = weeklyPayoutFor(run);
    const hoursTo = (at: string): number => Math.round((toMs(at) - toMs(POSTED_AT)) / 3_600_000);
    return { windowEnd, run, payAt, windowHour: hoursTo(windowEnd), runHour: hoursTo(run), payHour: hoursTo(payAt) };
  }, []);

  // Reduced motion: open on the cleared state instead of playing.
  useEffect(() => {
    if (reduced) setHour((current) => (current === 0 ? 110 : current));
  }, [reduced]);

  // Autoplay: from the post to just past the clearing run, once, unless the visitor takes the slider first.
  useEffect(() => {
    if (reduced || touched || !inView) return;
    setHour(0);
    const target = schedule.runHour + 8;
    const timer = window.setInterval(() => {
      setHour((current) => {
        if (current >= target) {
          window.clearInterval(timer);
          return current;
        }
        return Math.min(target, current + 2);
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [reduced, touched, inView, replay, schedule.runHour]);

  const now = addHours(POSTED_AT, hour);
  const clock = moneyClockState({ posted_at: POSTED_AT, now, assume_weekly_payout: true });
  const described = describeEarning(clock);
  const active: Column = COLUMN_FOR_STATE[clock.state] ?? "pending";

  const items: TimelineItem[] = [
    { id: "posted", title: "Posted", time: datedClockLabel(POSTED_AT), description: "Views start counting. The earning shows as Pending, with the date it clears.", state: "done" },
    {
      id: "window",
      title: "72-hour window closes",
      time: datedClockLabel(schedule.windowEnd),
      description: "Only verified views count: bots and duplicates are removed, and the removal is named.",
      state: clock.state === "accruing" ? "active" : "done",
    },
    {
      id: "check",
      title: "View and disclosure check",
      time: "Done within 12 hours",
      description: "A named reason shows while it runs. Nothing is ever just \"pending\".",
      state: clock.state === "pending" ? "active" : clock.state === "accruing" ? "upcoming" : "done",
    },
    {
      id: "clears",
      title: "Clears",
      time: datedClockLabel(schedule.run),
      description: "The first daily 14:00 UTC run after the check. The money moves to Cleared.",
      state: clock.state === "cleared" || clock.state === "paid" ? "done" : "upcoming",
    },
    {
      id: "pays",
      title: "Weekly payout, free",
      time: datedClockLabel(schedule.payAt),
      description: "Every Friday at 18:00 UTC. Instant cash-out is optional: 1.5%, minimum $0.50, maximum $15, shown before you confirm.",
      state: clock.state === "paid" ? "done" : clock.state === "cleared" ? "active" : "upcoming",
    },
  ];

  const jump = (target: number): void => {
    setTouched(true);
    setHour(target);
  };

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div ref={ref} className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6 p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <p className="fd-eyebrow text-fg-subtle">Example post</p>
              <p className="text-body-sm text-fg-muted">31,200 verified views at $2.00 per 1,000 views, posted {datedClockLabel(POSTED_AT)}.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<RotateCcw />}
              onClick={() => {
                setTouched(false);
                setHour(0);
                setReplay((value) => value + 1);
              }}
            >
              Replay
            </Button>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            {COLUMNS.map((column) => {
              const on = column.id === active;
              return (
                <div
                  key={column.id}
                  data-active={on || undefined}
                  className={cn(
                    "grid content-start gap-2 rounded-2xl p-4 transition-[background-color,box-shadow] duration-(--fd-dur-base) ease-standard",
                    on ? "bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]",
                  )}
                >
                  <dt className="text-caption font-medium text-fg-muted">{column.label}</dt>
                  <dd className={cn(!on && "opacity-55")}>
                    <Money cents={on ? AMOUNT_CENTS : 0} state={on ? column.state : "neutral"} size="lg" icon={on} />
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="grid gap-2 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={clock.state === "cleared" || clock.state === "paid" ? "mint" : "info"}>{described.ui_state}</Badge>
              <Badge tone="neutral" variant="outline">
                {described.reason_label}
              </Badge>
              {described.eta_label ? <span className="text-caption font-semibold text-fg tabular-nums">{described.eta_label}</span> : null}
            </div>
            <p className="text-body-sm text-pretty text-fg-muted">{described.reason_text}</p>
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span id="clock-time-label" className="text-body-sm font-semibold text-fg">
                Move through time
              </span>
              <span className="text-body-sm font-semibold text-fg tabular-nums">{clockLabel(now)} UTC</span>
            </div>
            <Slider
              aria-labelledby="clock-time-label"
              min={0}
              max={MAX_HOURS}
              step={1}
              value={[hour]}
              onValueChange={([next]) => {
                setTouched(true);
                setHour(next ?? hour);
              }}
              format={(value) => `${clockLabel(addHours(POSTED_AT, value))} UTC`}
              marks={[
                { value: 0, label: "Posted" },
                { value: schedule.windowHour },
                { value: schedule.runHour },
                { value: schedule.payHour },
              ]}
            />
            <ChipGroup aria-label="Jump to">
              <Chip size="sm" selected={hour === 0} onSelectedChange={() => jump(0)}>
                Just posted
              </Chip>
              <Chip size="sm" selected={hour === schedule.windowHour} onSelectedChange={() => jump(schedule.windowHour)}>
                Window closes
              </Chip>
              <Chip size="sm" selected={hour === schedule.runHour} onSelectedChange={() => jump(schedule.runHour)}>
                Clears
              </Chip>
              <Chip size="sm" selected={hour === schedule.payHour} onSelectedChange={() => jump(schedule.payHour)}>
                Paid
              </Chip>
            </ChipGroup>
          </div>
        </div>

        <div className="border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <h3 className="mb-5 text-title-sm text-fg">Every step has a date</h3>
          <Timeline items={items} />
          <p className="text-caption mt-5 max-w-[56ch] text-fg-subtle">
            Times are UTC. A hold is just as specific: a flagged post or an open dispute shows its named reason and what releases it, and undisputed money is never blocked.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
