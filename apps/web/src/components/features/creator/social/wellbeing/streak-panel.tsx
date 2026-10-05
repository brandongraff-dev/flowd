import { Check, Flame, Minus, Moon, Snowflake } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge } from "@/components/ui";
import { WEEK_OUTCOME_META, type WeekOutcome } from "@/lib/contract/types";
import type { StreakView } from "@/lib/data/selectors";
import { CONSTANTS } from "@/lib/engine";
import { formatIsoWeek } from "@/lib/format";
import { cn } from "@/lib/utils";

const OUTCOME_STYLE: Record<WeekOutcome, { box: string; icon: typeof Check }> = {
  posted: { box: "bg-mint-solid text-on-mint", icon: Check },
  freeze_used: { box: "bg-info-soft text-info", icon: Snowflake },
  rest: { box: "bg-info-soft text-info", icon: Moon },
  missed: { box: "bg-surface-active text-fg-subtle", icon: Minus },
};

/**
 * The streak, slack by design: weeks, not days; a freeze earned every four weeks and banked up to two; rest weeks that cost nothing. The
 * twelve-week row shows what happened each week in a glyph and a word, never a red "missed" and never a nag.
 */
export function StreakPanel({ streak }: { streak: StreakView }) {
  const cycle = CONSTANTS.streaks.freeze_earned_every_weeks;
  const toward = Math.max(0, Math.min(cycle, cycle - streak.next_freeze_in_weeks));
  const maxFreezes = CONSTANTS.streaks.freeze_bank_max;
  return (
    <GlassCard padding="lg" aria-labelledby="streak-title" className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ember-soft text-ember">
            <Flame className="size-7" />
          </span>
          <div className="grid gap-1">
            <h2 id="streak-title" className="font-display text-title-lg text-fg">
              {streak.headline}
            </h2>
            <p className="max-w-[58ch] text-body-sm text-fg-muted">{streak.detail}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" size="lg">
            Best: {streak.best_weeks} weeks
          </Badge>
          <Badge tone="info" size="lg" icon={<Moon />}>
            Rest weeks this quarter: {streak.rest_weeks_used_quarter} of {CONSTANTS.streaks.rest_weeks_per_quarter}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-caption font-semibold text-fg-subtle">Last {streak.weeks.length} weeks</p>
        <ol className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {streak.weeks.map((week) => {
            const style = OUTCOME_STYLE[week.outcome];
            const Icon = style.icon;
            const label = WEEK_OUTCOME_META[week.outcome].label;
            return (
              <li key={week.iso_week} className="grid justify-items-center gap-1">
                <span className={cn("grid size-9 place-items-center rounded-xl", style.box)} title={`${formatIsoWeek(week.iso_week)}: ${label}`}>
                  <Icon aria-hidden="true" className="size-4 stroke-[2.5]" />
                  <span className="sr-only">
                    {formatIsoWeek(week.iso_week)}: {label}
                  </span>
                </span>
                <span aria-hidden="true" className="text-micro text-fg-subtle tabular-nums">
                  {week.iso_week.slice(-3)}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-caption text-fg-subtle">A tick is a week with a post. A snowflake is a freeze doing its job. A moon is a rest week. A dash is a quiet week, and it is fine.</p>
      </div>

      <div className="grid gap-5 border-t border-divider pt-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-body-sm font-semibold text-fg">Freezes banked</p>
          <div className="flex items-center gap-2">
            {Array.from({ length: maxFreezes }, (_, index) => (
              <span
                key={index}
                className={cn("grid size-10 place-items-center rounded-xl", index < streak.freezes_banked ? "bg-info-soft text-info shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-info)_40%,transparent)]" : "border border-dashed border-rim text-fg-subtle")}
              >
                <Snowflake aria-hidden="true" className="size-5" />
              </span>
            ))}
            <span className="ml-1 text-body-sm text-fg-muted">
              {streak.freezes_banked} of {maxFreezes}
              <span className="sr-only"> freezes banked</span>
            </span>
          </div>
          <p className="text-caption text-fg-subtle">A freeze covers one quiet week automatically, so a busy week never breaks a streak.</p>
        </div>
        <div className="grid gap-2">
          <p className="text-body-sm font-semibold text-fg">Next freeze</p>
          <div role="img" aria-label={`${toward} of ${cycle} weeks toward the next freeze`} className="flex gap-1.5">
            {Array.from({ length: cycle }, (_, index) => (
              <span key={index} className={cn("h-2.5 flex-1 rounded-full", index < toward ? "bg-info-solid" : "bg-surface-active")} />
            ))}
          </div>
          <p className="text-caption text-fg-subtle">
            You earn one every {cycle} weeks in a row. {streak.freezes_banked >= maxFreezes ? "Your bank is full, so the next one waits." : `${streak.next_freeze_in_weeks} more ${streak.next_freeze_in_weeks === 1 ? "week" : "weeks"} to go.`}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
