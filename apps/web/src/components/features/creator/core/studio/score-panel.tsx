"use client";

import { Check, CircleAlert, TriangleAlert, Wand2, X } from "lucide-react";
import type { ScoreBand } from "@/lib/contract/types";
import { bandDescriptor, type Scored, type ScoredItem, type ScoreFix, type BriefChecklist } from "@/lib/engine";
import type { QaCheck } from "@/lib/contract/types";
import { QA_CHECK_TYPE_META } from "@/lib/contract/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScoreRing } from "@/components/charts";
import { Badge, Button, Progress } from "@/components/ui";
import { isOneTap } from "./studio-state";

/** A band as a letter and a word, never colour alone. */
export function BandChip({ band, className }: { band: ScoreBand; className?: string }) {
  return (
    <Badge tone={band === "A" || band === "B" ? "mint" : band === "C" ? "sun" : "rose"} size="md" className={className}>
      {band} · {bandDescriptor(band)}
    </Badge>
  );
}

function Timecode({ ms }: { ms: number }) {
  return <span className="rounded-md bg-surface-active px-1.5 py-0.5 font-mono text-micro font-medium text-fg-muted tabular-nums">{formatDuration(ms / 1000)}</span>;
}

function ReasonRow({ item, fix, onApply }: { item: ScoredItem; fix?: ScoreFix; onApply?: (fix: ScoreFix) => void }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3">
      <span aria-hidden="true" className={cn("mt-0.5 grid size-5 place-items-center rounded-full", item.passed ? "bg-mint-soft text-mint" : item.points > 0 ? "bg-sun-soft text-sun" : "bg-rose-soft text-rose")}>
        {item.passed ? <Check className="size-3" strokeWidth={3} /> : item.points > 0 ? <TriangleAlert className="size-3" strokeWidth={2.5} /> : <X className="size-3" strokeWidth={3} />}
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm font-semibold text-fg">
          {item.label}
          {item.at_ms !== undefined ? <Timecode ms={item.at_ms} /> : null}
          <span className="sr-only">{item.passed ? ", passed" : item.points > 0 ? ", partly" : ", missed"}</span>
        </p>
        <p className="text-caption text-fg-muted">{item.reason}</p>
        {!item.passed && fix && onApply && isOneTap(fix) ? (
          <Button variant="secondary" size="xs" className="mt-1 w-fit" leadingIcon={<Wand2 />} onClick={() => onApply(fix)}>
            {fix.label}
            <span className="ml-1 text-fg-subtle tabular-nums">+{fix.gain_points}</span>
          </Button>
        ) : !item.passed && item.fix ? (
          <p className="text-caption text-fg-subtle">{item.fix}</p>
        ) : null}
      </div>
      <p className="text-caption font-semibold text-fg-muted tabular-nums">
        {item.points}/{item.max}
      </p>
    </li>
  );
}

export interface ScorePanelProps {
  hook: Scored;
  flow: Scored;
  hookFixes?: readonly ScoreFix[];
  flowFixes?: readonly ScoreFix[];
  onApply?: (fix: ScoreFix) => void;
}

/**
 * Hook Score (the first 3 seconds) and Flow Score (the whole video) as two rings with their band, each reason with its timecode and, where a one-tap fix exists,
 * the button that applies it. Always labelled a checklist score: it gets smarter as bounties settle, and it can be wrong.
 */
export function ScorePanel({ hook, flow, hookFixes = [], flowFixes = [], onApply }: ScorePanelProps) {
  const fixFor = (item: ScoredItem, fixes: readonly ScoreFix[]): ScoreFix | undefined => fixes.find((f) => f.item_id === item.id);
  const best = [...hookFixes, ...flowFixes].filter((f) => isOneTap(f)).sort((a, b) => b.gain_points - a.gain_points)[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { name: "Hook Score", scored: hook, hint: "The first 3 seconds" },
          { name: "Flow Score", scored: flow, hint: "The whole video" },
        ].map(({ name, scored, hint }) => (
          <div key={name} className="grid justify-items-center gap-3 rounded-[24px] bg-surface-field p-5 text-center shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <ScoreRing name={name} score={scored.points} size={132} />
            <div className="grid gap-1.5">
              <p className="font-display text-title-sm text-fg">{name}</p>
              <p className="text-caption text-fg-muted">{hint}</p>
            </div>
          </div>
        ))}
      </div>
      {best && onApply ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-violet-soft p-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-violet)_32%,transparent)]">
          <p className="grid gap-0.5 text-body-sm">
            <span className="font-semibold text-fg">One tap could help most</span>
            <span className="text-fg-muted">{best.detail}</span>
          </p>
          <Button variant="primary" size="sm" leadingIcon={<Wand2 />} onClick={() => onApply(best)}>
            {best.label}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { title: "Hook Score reasons", scored: hook, fixes: hookFixes },
          { title: "Flow Score reasons", scored: flow, fixes: flowFixes },
        ].map(({ title, scored, fixes }) => (
          <section key={title} aria-label={title} className="grid content-start gap-1">
            <h3 className="text-body-sm font-semibold text-fg">{title}</h3>
            <ul className="grid divide-y divide-divider">
              {[...scored.items].sort((a, b) => Number(a.passed) - Number(b.passed) || b.max - b.points - (a.max - a.points)).map((item) => (
                <ReasonRow key={item.id} item={item} fix={fixFor(item, fixes)} onApply={onApply} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-caption text-fg-subtle">Checklist score. It gets smarter as bounties settle, and it can be wrong. Brands decide, not scores.</p>
    </div>
  );
}

/** The brief check: how much of what the brief asked for the video covers, as required beats and then each line of the checklist. */
export function BriefCheck({ brief }: { brief: BriefChecklist }) {
  return (
    <div className="grid gap-4">
      <Progress
        value={brief.beats.required === 0 ? 100 : Math.round((brief.beats.found / brief.beats.required) * 100)}
        tone={brief.beats.found === brief.beats.required ? "mint" : "ember"}
        aria-label="Required beats covered"
        valueText={`${brief.beats.found} of ${brief.beats.required} required beats covered`}
        label="Required beats covered"
        trailing={`${brief.beats.found} of ${brief.beats.required}`}
      />
      <ul className="grid divide-y divide-divider">
        {brief.items.map((item) => (
          <li key={item.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
            <span aria-hidden="true" className={cn("mt-0.5 grid size-5 place-items-center rounded-full", item.passed ? "bg-mint-soft text-mint" : item.points > 0 ? "bg-sun-soft text-sun" : "bg-rose-soft text-rose")}>
              {item.passed ? <Check className="size-3" strokeWidth={3} /> : item.points > 0 ? <TriangleAlert className="size-3" strokeWidth={2.5} /> : <X className="size-3" strokeWidth={3} />}
            </span>
            <div className="grid gap-0.5">
              <p className="text-body-sm font-semibold text-fg">
                {item.label}
                <span className="sr-only">{item.passed ? ", passed" : ", needs attention"}</span>
              </p>
              <p className="text-caption text-fg-muted">{item.detail}</p>
              {!item.passed && item.fix ? <p className="text-caption text-fg-subtle">{item.fix}</p> : null}
            </div>
            <p className="text-caption font-semibold text-fg-muted tabular-nums">
              {item.points}/{item.max}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PREFLIGHT_ORDER: readonly string[] = ["disclosure_audio", "disclosure_onscreen", "music_licence", "banned_claims", "ai_content", "duplicate", "watermark", "aspect_ratio", "length", "safe_zone"];

/** Pre-flight: disclosure, music, claims, originality and format, each pass, warning or fail, in words. A disclosure fail blocks settlement, so it blocks the submit button too. */
export function Preflight({ checks }: { checks: readonly QaCheck[] }) {
  const rows = PREFLIGHT_ORDER.map((id) => checks.find((c) => c.check === id)).filter((c): c is QaCheck => c !== undefined);
  return (
    <ul className="grid divide-y divide-divider" aria-label="Pre-flight checks">
      {rows.map((check) => (
        <li key={check.check} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-3 py-2.5">
          <span aria-hidden="true" className={cn("mt-0.5 grid size-5 place-items-center rounded-full", check.result === "pass" ? "bg-mint-soft text-mint" : check.result === "warn" ? "bg-sun-soft text-sun" : "bg-rose-soft text-rose")}>
            {check.result === "pass" ? <Check className="size-3" strokeWidth={3} /> : check.result === "warn" ? <TriangleAlert className="size-3" strokeWidth={2.5} /> : <CircleAlert className="size-3" strokeWidth={2.5} />}
          </span>
          <div className="grid gap-0.5">
            <p className="text-body-sm font-semibold text-fg">
              {QA_CHECK_TYPE_META[check.check].label}
              <span className="sr-only">{check.result === "pass" ? ", passed" : check.result === "warn" ? ", warning" : ", failed"}</span>
            </p>
            <p className="text-caption text-fg-muted">{check.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
