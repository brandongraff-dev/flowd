"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, RotateCcw, X } from "lucide-react";
import { CURVE_SHAPE_META } from "@/lib/contract/types";
import type { SubmissionView } from "@/lib/data/selectors";
import type { SubmissionAnalysis } from "@/lib/data/selectors";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { BandBadge, CHECKLIST_NOTE, CreatorLine, DuplicateBadge, FraudBadge, QaGlyph, SlaChip } from "./parts";
import { usePlayer } from "./player";
import { flagsFromChecks } from "./queue-data";
import { useDraftNotes } from "./session-state";
import { useReviewKeys } from "./use-review-keys";
import { tc, tcPrecise } from "./timecode";
import { PlayerBar, VideoScreen, type TimelineMarker, type TimelineRange } from "./video-stand-in";

/** Is the key event aimed at something that has its own Space / Enter behaviour (a button, a field, a slider)? */
export function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, input, textarea, select, [role='slider'], [role='checkbox'], [role='switch'], [role='menuitem'], [role='radio'], [role='tab'], [contenteditable='true']") !== null;
}

export interface QueuePreviewProps {
  item: SubmissionView;
  analysis: SubmissionAnalysis;
  /** Keyboard shortcuts are live (no dialog or sheet is open). */
  keysEnabled: boolean;
  onApprove: () => void;
  onChanges: (currentMs: number) => void;
  onReject: (currentMs: number) => void;
}

/**
 * The preview beside the queue: the active video with a transport bar, its QA flags (each one seeks to its moment), a line of
 * evidence and the three decisions. Space plays, `,` and `.` step a frame. Mount it with a `key` per video so each starts at 0:00.
 */
export function QueuePreview({ item, analysis, keysEnabled, onApprove, onChanges, onReject }: QueuePreviewProps) {
  const duration = item.current.video.duration_ms;
  const player = usePlayer(duration);
  const [captions, setCaptions] = useState(true);
  const drafts = useDraftNotes(item.id);
  const a = analysis.current;
  const flags = useMemo(() => flagsFromChecks(a?.checks ?? []), [a]);

  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = [];
    flags.forEach((f, index) => {
      if (f.t_ms !== undefined) list.push({ id: `flag-${index}`, t_ms: f.t_ms, kind: f.result === "fail" ? "fail" : "warn", label: f.message });
    });
    if (a) list.push({ id: "hook", t_ms: a.hook.lands_at_ms, kind: "hook", label: "The hook lands" });
    for (const n of drafts) list.push({ id: n.id, t_ms: n.t_ms, kind: n.severity === "must_fix" ? "must_fix" : "suggestion", label: n.body });
    return list;
  }, [flags, a, drafts]);
  const ranges = useMemo<TimelineRange[]>(() => drafts.filter((n) => n.t_end_ms !== undefined).map((n) => ({ id: n.id, start_ms: n.t_ms, end_ms: n.t_end_ms ?? n.t_ms, tone: "accent" as const })), [drafts]);

  useReviewKeys(
    {
      ",": () => player.step(-1),
      ".": () => player.step(1),
      t: () => setCaptions((on) => !on),
      // Space is also the native key of buttons and sliders: only take it when nothing like that has focus.
      space: (event) => {
        if (isControlTarget(event.target)) return false;
        player.toggle();
      },
    },
    { enabled: keysEnabled },
  );

  const now = (): number => player.getState().timeMs;
  const review = item.review;
  const evidence = item.fraud_evidence;
  const duplicate = evidence.duplicate_of_submission_id !== undefined;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <CreatorLine handle={item.creator.handle} avatar={item.creator.avatar} tier={item.creator.tier} reliability={item.reliability} sub={item.bounty.title} />
          <Link href={`/brand/review/${item.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-1 text-caption font-semibold text-accent transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-accent-soft">
            Focus mode
            <Kbd size="sm">↵</Kbd>
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <BandBadge band={item.flow_band} kind="Flow" word />
          <BandBadge band={item.hook_band} kind="Hook" word />
          {review ? <SlaChip state={review.state} hoursLeft={review.hours_left} label={review.label} /> : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[236px]">
        <VideoScreen player={player} art={item.current.video.art} app={{ name: item.app.name, art: item.app.icon }} analysis={a} captions={captions} label={`${item.title} by @${item.creator.handle}`} />
      </div>
      <PlayerBar player={player} markers={markers} ranges={ranges} captions={captions} onCaptionsChange={setCaptions} />

      {a ? (
        <p className="rounded-xl bg-surface-field px-3.5 py-2.5 text-body-sm text-fg">
          <span className="text-fg-subtle">Hook, lands at {tcPrecise(a.hook.lands_at_ms)}: </span>“{a.hook.text}”
        </p>
      ) : analysis.loading ? (
        <Skeleton className="h-11 w-full" />
      ) : null}

      <section aria-label="What the checks found" className="grid gap-1.5">
        <h3 className="flex items-baseline justify-between gap-3 text-caption font-semibold text-fg-muted">
          <span>Checks</span>
          <span className="font-normal text-fg-subtle">{item.qa.pass} pass · {item.qa.warn} warn · {item.qa.fail} fail</span>
        </h3>
        {analysis.loading && !a ? (
          <div className="grid gap-2" aria-hidden="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : flags.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface-field px-3.5 py-3 text-body-sm text-fg-muted">
            <QaGlyph result="pass" />
            Every check passes. Spoken and on-screen disclosure, music, claims and brief beats are all there.
          </p>
        ) : (
          <ul className="grid gap-1">
            {flags.slice(0, 4).map((f, index) => {
              const content = (
                <>
                  <QaGlyph result={f.result} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1 text-left text-body-sm text-fg">{f.message}</span>
                  {f.t_ms !== undefined ? <span className="mt-0.5 shrink-0 rounded-md bg-surface-active px-1.5 py-0.5 text-micro font-semibold text-fg-muted tabular-nums">{tc(f.t_ms)}</span> : null}
                </>
              );
              return (
                <li key={`${f.check}-${index}`}>
                  {f.t_ms !== undefined ? (
                    <button
                      type="button"
                      onClick={() => {
                        player.pause();
                        player.seek(f.t_ms ?? 0);
                      }}
                      aria-label={`${f.message} Jump to ${tc(f.t_ms)}`}
                      className={cn("flex w-full items-start gap-2.5 rounded-xl bg-surface-field px-3 py-2 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover")}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-xl bg-surface-field px-3 py-2">{content}</div>
                  )}
                </li>
              );
            })}
            {flags.length > 4 ? (
              <li>
                <Link href={`/brand/review/${item.id}`} className="inline-block px-1 py-1 text-caption font-medium text-accent hover:underline">
                  {flags.length - 4} more in focus mode
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section aria-label="Views of this creator" className="grid gap-2 rounded-xl bg-surface-field px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FraudBadge band={evidence.creator_fraud_band} score={evidence.creator_fraud_score} always size="sm" />
          {duplicate ? <DuplicateBadge distance={evidence.phash_distance} /> : null}
        </div>
        <p className="text-caption text-fg-muted">
          US audience {formatPct(evidence.audience_us_ratio, 0)} · curve {CURVE_SHAPE_META[evidence.view_curve_shape].label.toLowerCase()} · follower quality {formatPct(evidence.follower_quality, 0)}
        </p>
      </section>

      <p className="text-caption text-fg-subtle">{CHECKLIST_NOTE}</p>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <Button variant="primary" leadingIcon={<Check />} aria-keyshortcuts="A" onClick={onApprove} className="w-full">
          Approve
          <Kbd size="sm" className="bg-white/20 text-on-accent shadow-none">A</Kbd>
        </Button>
        <Button variant="secondary" leadingIcon={<RotateCcw />} aria-keyshortcuts="F" onClick={() => onChanges(now())} className="w-full">
          Changes
          <Kbd size="sm">F</Kbd>
        </Button>
        <Button variant="danger" leadingIcon={<X />} aria-keyshortcuts="R" onClick={() => onReject(now())} className="w-full">
          Reject
          <Kbd size="sm">R</Kbd>
        </Button>
      </div>
    </div>
  );
}
