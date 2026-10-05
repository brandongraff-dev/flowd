"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Switch } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Flash a quiet "Saved" beside a setting for two seconds after it is written. Not a toast: it belongs to the control that changed. */
export function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = (): void => {
    setSaved(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2_000);
  };
  return [saved, flash];
}

export interface SettingCardProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** The master switch for the setting; it takes effect at once, so no Save button. */
  switchProps?: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; label: string };
  /** Shows "Saved" beside the title. */
  saved?: boolean;
  /** Controls that appear when the setting is on (or always, when there is no switch). */
  children?: ReactNode;
  className?: string;
}

/**
 * One Wellbeing setting: an icon, a title, one honest sentence about what it does, a switch that applies immediately and, below it,
 * the details. A setting that is off stays quiet: its details are hidden, not greyed out.
 */
export function SettingCard({ icon, title, description, switchProps, saved = false, children, className }: SettingCardProps) {
  return (
    <GlassCard className={cn("grid grid-cols-[minmax(0,1fr)] content-start gap-5", className)}>
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">
          {icon}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-title-sm text-fg">{title}</h2>
            <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1 text-caption font-semibold text-mint transition-opacity duration-(--fd-dur-base)", saved ? "opacity-100" : "opacity-0")}>
              {saved ? (
                <>
                  <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
                  Saved
                </>
              ) : null}
            </span>
          </div>
          <p className="text-body-sm text-pretty text-fg-muted">{description}</p>
        </div>
        {switchProps ? (
          <Switch aria-label={switchProps.label} checked={switchProps.checked} disabled={switchProps.disabled} onCheckedChange={switchProps.onCheckedChange} />
        ) : null}
      </div>
      {children}
    </GlassCard>
  );
}
