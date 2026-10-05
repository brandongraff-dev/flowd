"use client";

import type { ReactNode } from "react";
import { Ban, CircleCheck, CircleX, Clock, Copy, Hourglass, ShieldAlert, TriangleAlert } from "lucide-react";
import { SCORE_BAND_META, type FraudBand, type ScoreBand, type SlaState } from "@/lib/contract/types";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { ArtAvatar, TierBadge, type TierName } from "@/components/brand";
import type { ArtSeed } from "@/components/brand";
import type { ReliabilityView } from "@/lib/engine";

/** The words for a checklist band, matching the Hook / Flow Score ring (A 85+, B 70 to 84 ...). */
export const BAND_WORD: Record<ScoreBand, string> = { A: "Strong", B: "Good", C: "Okay", D: "Needs work", E: "Fix first" };

export const CHECKLIST_NOTE = "Checklist score. It gets smarter as bounties settle.";

export interface BandBadgeProps {
  band: ScoreBand;
  /** "Flow" or "Hook". */
  kind?: "Flow" | "Hook";
  /** Print the band word after the letter ("B Good"). */
  word?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A Hook or Flow Score band as a pill: letter, optional word, tone. Always a checklist score, and the tooltip says so
 * (BRAND.md 4.3). The letter carries the band, so colour is never the only cue.
 */
export function BandBadge({ band, kind = "Flow", word = false, size = "md", className }: BandBadgeProps) {
  const tone = SCORE_BAND_META[band].tone as Tone;
  return (
    <Tooltip content={`${kind} Score ${band}: ${BAND_WORD[band]}. ${CHECKLIST_NOTE}`}>
      <Badge tone={tone} size={size} className={cn("cursor-default", className)}>
        <span className="sr-only">{`${kind} Score, ${BAND_WORD[band]}, `}</span>
        <span aria-hidden="true">{kind}</span>
        <span className="font-display font-extrabold">{band}</span>
        {word ? <span aria-hidden="true" className="font-medium">{BAND_WORD[band]}</span> : null}
      </Badge>
    </Tooltip>
  );
}

export interface SlaChipProps {
  state: SlaState;
  /** Hours until the deadline; negative once it has passed. */
  hoursLeft: number;
  /** The full label ("Decide by Sat 2:00 PM UTC"). Becomes the accessible description. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The review SLA as a chip: on track (quiet), stale from 48 hours (ember, with an hourglass), breached after 72 (rose).
 * State is a glyph and a word, never a colour alone. The countdown is the brand's promise to creators.
 */
export function SlaChip({ state, hoursLeft, label, size = "md", className }: SlaChipProps) {
  const overdue = hoursLeft < 0;
  const text = overdue ? `Overdue ${formatHours(-hoursLeft)}` : `${formatHours(hoursLeft)} left`;
  const spec: Record<SlaState, { tone: Tone; icon: ReactNode; word: string }> = {
    on_track: { tone: "neutral", icon: <Clock aria-hidden="true" />, word: "On track" },
    met: { tone: "neutral", icon: <Clock aria-hidden="true" />, word: "Decided in time" },
    stale: { tone: "ember", icon: <Hourglass aria-hidden="true" />, word: "Stale" },
    breached: { tone: "rose", icon: <TriangleAlert aria-hidden="true" />, word: "Past the promise" },
  };
  const item = spec[state];
  return (
    <Tooltip content={label ?? text}>
      <Badge tone={item.tone} size={size} icon={item.icon} className={cn("cursor-default", className)}>
        <span className="sr-only">{`${item.word}. ${label ?? ""} `}</span>
        {text}
      </Badge>
    </Tooltip>
  );
}

const FRAUD_COPY: Record<FraudBand, { word: string; tone: Tone }> = {
  clean: { word: "Clean", tone: "mint" },
  watch: { word: "Watch", tone: "info" },
  review: { word: "Review", tone: "ember" },
  high: { word: "High risk", tone: "rose" },
};

export interface FraudBadgeProps {
  band: FraudBand;
  score?: number;
  /** Also render for the clean band (default: only when there is something to look at). */
  always?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** The fraud band of a creator's history, a pill with a shield: shown when it is more than clean. */
export function FraudBadge({ band, score, always = false, size = "md", className }: FraudBadgeProps) {
  if (band === "clean" && !always) return null;
  const copy = FRAUD_COPY[band];
  return (
    <Badge tone={copy.tone} size={size} icon={<ShieldAlert aria-hidden="true" />} className={className}>
      {`Fraud ${copy.word.toLowerCase()}`}
      {score !== undefined ? <span className="sr-only">{`, score ${score}`}</span> : null}
    </Badge>
  );
}

/** A duplicate-hash match badge. */
export function DuplicateBadge({ distance, className }: { distance?: number; className?: string }) {
  return (
    <Badge tone="rose" icon={<Copy aria-hidden="true" />} className={className}>
      Looks like another video
      {distance !== undefined ? <span className="sr-only">{`, hash distance ${distance}`}</span> : null}
    </Badge>
  );
}

export interface QaSummaryProps {
  qa: { pass: number; warn: number; fail: number };
  className?: string;
}

/** "All checks pass" or "1 fail, 3 warnings", with a glyph for each state. */
export function QaSummary({ qa, className }: QaSummaryProps) {
  if (qa.fail === 0 && qa.warn === 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium text-mint", className)}>
        <CircleCheck aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        All {qa.pass} checks pass
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-medium", className)}>
      {qa.fail > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-rose">
          <CircleX aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
          {qa.fail} {qa.fail === 1 ? "fail" : "fails"}
        </span>
      ) : null}
      {qa.warn > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-ember">
          <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
          {qa.warn} {qa.warn === 1 ? "warning" : "warnings"}
        </span>
      ) : null}
    </span>
  );
}

export interface ReliabilityTextProps {
  reliability?: ReliabilityView;
  className?: string;
}

/** "92 reliability" or "Building history (60 to 78)". Brands see a range, never a verdict, until five decisions are in. */
export function ReliabilityText({ reliability, className }: ReliabilityTextProps) {
  if (!reliability) return <span className={cn("text-fg-subtle", className)}>No history yet</span>;
  return <span className={className}>{reliability.label}</span>;
}

export interface CreatorLineProps {
  handle: string;
  avatar: ArtSeed;
  tier: TierName;
  reliability?: ReliabilityView;
  size?: "sm" | "md";
  className?: string;
  /** Extra line under the handle (the bounty, the format). */
  sub?: ReactNode;
}

/** The creator in a row: avatar, @handle, tier medallion and reliability, on two quiet lines. */
export function CreatorLine({ handle, avatar, tier, reliability, size = "md", className, sub }: CreatorLineProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ArtAvatar art={avatar} name={`@${handle}`} size={size === "sm" ? 28 : 36} decorative />
      <div className="grid min-w-0 gap-0.5">
        <p className="flex min-w-0 items-center gap-1.5 text-body-sm font-semibold text-fg">
          <span className="truncate">@{handle}</span>
          <TierBadge tier={tier} size={18} glow={false} />
        </p>
        <p className="truncate text-caption text-fg-subtle">{sub ?? <ReliabilityText reliability={reliability} />}</p>
      </div>
    </div>
  );
}

/** A small stat for a strip: label over figure. */
export function MiniStat({ label, value, hint, tone, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "rose" | "ember"; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-0.5", className)}>
      <p className="text-caption font-medium text-fg-subtle">{label}</p>
      <p className={cn("font-display text-figure-md tabular-nums", tone === "rose" ? "text-rose" : tone === "ember" ? "text-ember" : "text-fg")}>{value}</p>
      {hint ? <p className="text-caption text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** Icon for a QA result, used by flag lists. */
export function QaGlyph({ result, className }: { result: "pass" | "warn" | "fail"; className?: string }) {
  if (result === "fail") return <CircleX aria-hidden="true" className={cn("size-4 text-rose", className)} strokeWidth={2.25} />;
  if (result === "warn") return <TriangleAlert aria-hidden="true" className={cn("size-4 text-ember", className)} strokeWidth={2.25} />;
  return <CircleCheck aria-hidden="true" className={cn("size-4 text-mint", className)} strokeWidth={2.25} />;
}

/** The "not available" hint used when an action is disabled for a reason. */
export function Reason({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-fg-subtle">
      <Ban aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  );
}
