"use client";

import { useMemo, useState } from "react";
import { Moon, PauseCircle, Play } from "lucide-react";
import { Button, Callout, Chip, ChipGroup, SegmentedControl } from "@/components/ui";
import type { WellbeingView } from "@/lib/data/selectors";
import { useDemoNow } from "@/lib/data";
import { addDays, canDeclareRestWeek, isoWeek, isoWeekAdd } from "@/lib/engine";
import { formatDate, formatIsoWeek } from "@/lib/format";
import { actions } from "@/lib/store";
import { useRun } from "../shared/run-action";
import { SettingCard, useSavedFlash } from "./setting-card";

const PAUSE_DAYS = ["7", "14", "30"] as const;
type PauseDays = (typeof PAUSE_DAYS)[number];

/** Declare quiet weeks ahead of time. A rest week keeps your streak and never counts against you; two a quarter. */
export function RestWeeksCard({ view }: { view: WellbeingView }) {
  const now = useDemoNow();
  const { busy, run } = useRun();
  const [saved, flash] = useSavedFlash();
  const rest = view.settings.rest_weeks;
  const weeks = useMemo(() => {
    const first = isoWeek(now);
    return Array.from({ length: 8 }, (_, index) => isoWeekAdd(first, index + 1));
  }, [now]);

  const toggle = async (week: string, on: boolean): Promise<void> => {
    const next = on ? [...rest, week] : rest.filter((item) => item !== week);
    const data = await run(`rest-${week}`, () => actions.updateWellbeing({ rest_weeks: next }));
    if (data) flash();
  };

  return (
    <SettingCard
      icon={<Moon />}
      title="Rest weeks"
      description="Take a week off without touching your streak. Two a quarter, declared ahead of time, and they never count as a miss."
      saved={saved}
    >
      <ChipGroup aria-label="Upcoming weeks">
        {weeks.map((week) => {
          const selected = rest.includes(week);
          const check = canDeclareRestWeek({ rest_weeks: rest, week });
          return (
            <Chip key={week} selected={selected} disabled={!selected && !check.ok} onSelectedChange={(on) => void toggle(week, on)} aria-busy={busy === `rest-${week}` || undefined}>
              {formatIsoWeek(week)}
            </Chip>
          );
        })}
      </ChipGroup>
      <p className="text-caption text-fg-subtle">
        {rest.length > 0 ? `Declared: ${rest.map((week) => formatIsoWeek(week)).join(", ")}. ` : "None declared. "}
        Weeks you cannot pick are in a quarter where both rest weeks are already used.
      </p>
    </SettingCard>
  );
}

/** Pause keeps your tier and your streak exactly where they are. Money you already earned keeps clearing and paying out. */
export function PauseCard({ view }: { view: WellbeingView }) {
  const now = useDemoNow();
  const { busy, run } = useRun();
  const [saved, flash] = useSavedFlash();
  const [days, setDays] = useState<PauseDays>("14");
  const until = view.settings.paused_until;

  const start = async (): Promise<void> => {
    const data = await run("pause", () => actions.updateWellbeing({ paused_until: addDays(now, Number(days)) }));
    if (data) flash();
  };
  const resume = async (): Promise<void> => {
    const data = await run("resume", () => actions.updateWellbeing({ paused_until: null }));
    if (data) flash();
  };

  return (
    <SettingCard
      icon={<PauseCircle />}
      title="Pause"
      description="Step away completely. Your tier and your streak stay exactly as they are, and money you already earned keeps clearing and paying out."
      saved={saved}
    >
      {view.paused && until ? (
        <Callout tone="info" icon={<PauseCircle />} title={`Paused until ${formatDate(until, "weekday")}`} action={<Button size="sm" variant="secondary" leadingIcon={<Play />} loading={busy === "resume"} onClick={() => void resume()}>Resume now</Button>}>
          Your tier and streak are preserved. You can come back any time before then.
        </Callout>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<PauseDays> aria-label="Pause length" size="sm" value={days} onValueChange={setDays} options={PAUSE_DAYS.map((value) => ({ value, label: `${value} days` }))} />
          <Button variant="secondary" size="sm" loading={busy === "pause"} onClick={() => void start()}>
            Pause for {days} days
          </Button>
        </div>
      )}
    </SettingCard>
  );
}
