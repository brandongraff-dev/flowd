"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff, EyeOff, HeartHandshake, Hourglass, Snowflake, Target, Trophy } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, Field, Input, Slider, Switch } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import { useStoreReady, useStreak, useWellbeing } from "@/lib/data";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { actions } from "@/lib/store";
import { useRun } from "../shared/run-action";
import { SocialSkeleton } from "../shared/skeletons";
import { PauseCard, RestWeeksCard } from "./rest-and-pause";
import { SettingCard, useSavedFlash } from "./setting-card";
import { StreakPanel } from "./streak-panel";

/** "22:00" as "10 pm", "08:30" as "8:30 am". */
function clock12(value: string): string {
  const [h = "0", m = "00"] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return m === "00" ? `${display} ${suffix}` : `${display}:${m} ${suffix}`;
}

/** A time field that writes when you leave it, so typing "21:30" never saves "21:3". */
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Field label={label}>
      <Input
        type="time"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (/^\d{2}:\d{2}$/.test(draft) && draft !== value) onCommit(draft);
          else setDraft(value);
        }}
      />
    </Field>
  );
}

export function WellbeingView() {
  const ready = useStoreReady();
  const view = useWellbeing();
  const streak = useStreak();
  const { busy, run } = useRun();
  const [quietSaved, flashQuiet] = useSavedFlash();
  const [numbersSaved, flashNumbers] = useSavedFlash();
  const [paceSaved, flashPace] = useSavedFlash();
  const [slackSaved, flashSlack] = useSavedFlash();
  const [boardSaved, flashBoard] = useSavedFlash();
  const [pace, setPace] = useState<number | null>(null);

  if (!ready) return <SocialSkeleton label="Loading Wellbeing Mode" layout="grid" />;

  const { settings } = view;
  const paceValue = pace ?? settings.pace_goal.posts_per_week ?? 3;
  const update = async (key: string, patch: Parameters<typeof actions.updateWellbeing>[0], flash: () => void): Promise<void> => {
    const data = await run(key, () => actions.updateWellbeing(patch));
    if (data) flash();
  };
  const toggleAll = async (enabled: boolean): Promise<void> => {
    await run("master", () => actions.toggleWellbeing({ enabled }));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Take care"
        title="Wellbeing Mode"
        description="Your pace, your numbers. Turn on only what helps. Nothing here ever changes your tier, your bounties or your money, and every switch works the moment you flip it."
        meta={
          <Badge tone="mint" size="lg" icon={<HeartHandshake />}>
            No guilt notifications, ever
          </Badge>
        }
      />

      <GlassCard padding="lg" aria-labelledby="master-title" className="flex flex-wrap items-center justify-between gap-5">
        <div className="grid max-w-[60ch] gap-1">
          <h2 id="master-title" className="font-display text-title-md text-fg">
            Wellbeing Mode
          </h2>
          <p className="text-body-sm text-fg-muted">
            {settings.enabled
              ? settings.quiet_hours.enabled
                ? `On. Quiet hours run ${clock12(settings.quiet_hours.start)} to ${clock12(settings.quiet_hours.end)}. Change any setting below, or turn it all off in one tap.`
                : "On. Add quiet hours or anything else below, or turn it all off in one tap."
              : "Off. Turn it on for quiet hours from 10 pm to 8 am, then add whatever else suits you."}
          </p>
        </div>
        <Switch aria-label="Wellbeing Mode" checked={settings.enabled} disabled={busy === "master"} onCheckedChange={(next) => void toggleAll(next)} />
      </GlassCard>

      {streak ? <StreakPanel streak={streak} /> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
        <SettingCard
          icon={<BellOff />}
          title="Quiet hours"
          description="No pushes while you sleep or switch off. Money and safety messages are held, not lost: they wait for you in your Inbox."
          saved={quietSaved}
          switchProps={{
            label: "Quiet hours",
            checked: settings.quiet_hours.enabled,
            onCheckedChange: (enabled) => void update("quiet", { quiet_hours: { ...settings.quiet_hours, enabled } }, flashQuiet),
          }}
        >
          {settings.quiet_hours.enabled ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-4">
                <TimeField label="From" value={settings.quiet_hours.start} onCommit={(start) => void update("quiet", { quiet_hours: { ...settings.quiet_hours, start } }, flashQuiet)} />
                <TimeField label="Until" value={settings.quiet_hours.end} onCommit={(end) => void update("quiet", { quiet_hours: { ...settings.quiet_hours, end } }, flashQuiet)} />
              </div>
              <p className="text-caption text-fg-subtle">Times follow {settings.quiet_hours.timezone}. The Daily Drop reminder, if you turned it on, also waits.</p>
            </div>
          ) : null}
        </SettingCard>

        <SettingCard
          icon={<EyeOff />}
          title="Numbers off"
          description="Hide live views and earnings in a window, so you can make things without watching them. Dashes show instead, and everything is still counted."
          saved={numbersSaved}
          switchProps={{
            label: "Numbers off",
            checked: settings.numbers_off.enabled,
            onCheckedChange: (enabled) => void update("numbers", { numbers_off: { ...settings.numbers_off, enabled } }, flashNumbers),
          }}
        >
          {settings.numbers_off.enabled ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-4">
                <TimeField label="Hide from" value={settings.numbers_off.from ?? "09:00"} onCommit={(from) => void update("numbers", { numbers_off: { ...settings.numbers_off, from } }, flashNumbers)} />
                <TimeField label="Show again at" value={settings.numbers_off.to ?? "17:00"} onCommit={(to) => void update("numbers", { numbers_off: { ...settings.numbers_off, to } }, flashNumbers)} />
              </div>
              <p className="text-caption text-fg-subtle">The creator header also has a quick switch to hide numbers right now.</p>
            </div>
          ) : null}
        </SettingCard>

        <SettingCard
          icon={<Target />}
          title="Pace goal"
          description="A soft weekly target, if you want one. It never affects your tier, your ranking or your pay, and it never sends a reminder."
          saved={paceSaved}
          switchProps={{
            label: "Pace goal",
            checked: settings.pace_goal.enabled,
            onCheckedChange: (enabled) => void update("pace", { pace_goal: { enabled, posts_per_week: paceValue } }, flashPace),
          }}
        >
          {settings.pace_goal.enabled ? (
            <Field label={`${paceValue} ${paceValue === 1 ? "post" : "posts"} a week`}>
              <Slider
                min={1}
                max={14}
                step={1}
                value={[paceValue]}
                onValueChange={(value) => setPace(value[0] ?? paceValue)}
                onValueCommit={(value) => void update("pace", { pace_goal: { enabled: true, posts_per_week: value[0] ?? paceValue } }, flashPace)}
                aria-label="Posts per week"
              />
            </Field>
          ) : null}
        </SettingCard>

        <SettingCard
          icon={<Snowflake />}
          title="Slack streaks"
          description="Freezes and rest weeks apply on their own, so you never have to remember to protect your streak."
          saved={slackSaved}
          switchProps={{ label: "Slack streaks", checked: settings.slack_mode, onCheckedChange: (slack_mode) => void update("slack", { slack_mode }, flashSlack) }}
        />

        <RestWeeksCard view={view} />
        <PauseCard view={view} />

        <SettingCard
          icon={<Trophy />}
          title="Leaderboards"
          description={
            <>
              Hide yourself from every board. Your tier, streak and earnings are untouched.{" "}
              <Link href="/creator/leaderboard" className="font-semibold text-accent underline underline-offset-4">
                See the leaderboard
              </Link>
              .
            </>
          }
          saved={boardSaved}
          switchProps={{ label: "Hide me from leaderboards", checked: settings.leaderboard_opt_out, onCheckedChange: (leaderboard_opt_out) => void update("board", { leaderboard_opt_out }, flashBoard) }}
        />

        <SettingCard icon={<Hourglass />} title="Slow months happen" description="Income moves around. Here is your quietest recent month and what to set aside, so a slow one is not a surprise.">
          <div className="grid gap-3 rounded-xl bg-surface-field p-4">
            {view.worst_month ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-body-sm text-fg-muted">Quietest of the last six months ({formatDate(`${view.worst_month.month}-15`, "month")})</span>
                <span className="font-display text-figure-md text-fg tabular-nums">{formatMoney(view.worst_month.cleared_cents)}</span>
              </div>
            ) : (
              <p className="text-body-sm text-fg-muted">Not enough months of earnings yet to compare.</p>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-body-sm text-fg-muted">Tax set-aside at {formatPct(view.set_aside.rate, 0)}</span>
              <span className="font-display text-figure-md text-fg tabular-nums">{formatMoney(view.set_aside.cents)}</span>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/creator/tax">Open the Tax Desk</Link>
          </Button>
        </SettingCard>
      </div>

      <Callout tone="info" icon={<HeartHandshake />} title="If things feel heavy">
        <span className="grid gap-2">
          <span>Making things for a living can wear on anyone. These are free and open any time.</span>
          <ul className="grid gap-1.5">
            {view.resources.map((resource) => (
              <li key={resource.label}>
                {resource.href ? (
                  <a href={resource.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                    {resource.label}
                  </a>
                ) : (
                  <span className="font-semibold">{resource.label}</span>
                )}
                <span className="text-fg-muted">: {resource.detail}</span>
              </li>
            ))}
          </ul>
        </span>
      </Callout>
    </div>
  );
}
