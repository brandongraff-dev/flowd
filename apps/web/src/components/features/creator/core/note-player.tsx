"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import type { ArtSeed, FeedbackNote, OnScreenText, TranscriptSegment } from "@/lib/contract/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtSurface, hashString, mulberry32 } from "@/components/brand";

export interface NotePlayerProps {
  art: ArtSeed;
  /** Seeds the waveform, so the same video always draws the same one. */
  assetId: string;
  durationMs: number;
  transcript: readonly TranscriptSegment[];
  onScreen: readonly OnScreenText[];
  notes: readonly Pick<FeedbackNote, "id" | "t_ms" | "t_end_ms" | "severity" | "status" | "body">[];
  currentMs: number;
  playing: boolean;
  onSeek: (ms: number) => void;
  onPlayingChange: (playing: boolean) => void;
  activeNoteId?: string | null;
}

const BARS = 72;

/**
 * The review player. There is no real video in the demo, so it is a generated cover, a waveform scrubber and the transcript as captions: what the brand
 * saw, in the order they saw it. Notes sit on the timeline at their timecode; pressing one seeks to it. The scrubber is a real range input, so it works with a
 * keyboard and a screen reader (it reads the timecode).
 */
export function NotePlayer({ art, assetId, durationMs, transcript, onScreen, notes, currentMs, playing, onSeek, onPlayingChange, activeNoteId }: NotePlayerProps) {
  const bars = useMemo(() => {
    const rand = mulberry32(hashString(assetId));
    return Array.from({ length: BARS }, (_, i) => {
      const envelope = 0.35 + 0.65 * Math.sin((i / BARS) * Math.PI);
      return Math.max(0.12, Math.min(1, envelope * (0.35 + rand() * 0.75)));
    });
  }, [assetId]);

  // Playback is a clock: it advances the playhead and stops at the end. It is user-started, so reduced motion does not change it.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onSeek(Math.min(durationMs, currentMs + 100));
    }, 100);
    if (currentMs >= durationMs) onPlayingChange(false);
    return () => window.clearInterval(id);
  }, [playing, currentMs, durationMs, onSeek, onPlayingChange]);

  const caption = transcript.find((s) => currentMs >= s.t_start_ms && currentMs < s.t_end_ms)?.text;
  const overlay = onScreen.find((o) => currentMs >= o.t_start_ms && currentMs < o.t_end_ms)?.text;
  const progress = durationMs > 0 ? currentMs / durationMs : 0;

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-72 overflow-hidden rounded-[28px] bg-bg-sunken text-white shadow-[inset_0_0_0_1px_var(--fd-rim),var(--fd-elevation-2)]">
        <ArtSurface art={art} aspect="9:16" className="absolute inset-0 block size-full" />
        <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />
        {overlay ? <p className="absolute inset-x-5 top-8 text-center font-display text-title-md leading-tight font-extrabold uppercase [text-shadow:0_2px_14px_rgb(1_4_20/0.7)]">{overlay}</p> : null}
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? "Pause" : "Play the preview"}
          className="group absolute inset-0 grid place-items-center focus-visible:outline-offset-[-4px]"
        >
          <span aria-hidden="true" className={cn("grid size-14 place-items-center rounded-full bg-[color-mix(in_oklab,var(--fd-abyss-1000)_52%,transparent)] shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4)] transition-opacity duration-(--fd-dur-base) ease-standard", playing ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100")}>
            {playing ? <Pause className="size-6 fill-current" strokeWidth={1.5} /> : <Play className="size-6 translate-x-0.5 fill-current" strokeWidth={1.5} />}
          </span>
        </button>
        {caption ? <p className="pointer-events-none absolute inset-x-4 bottom-5 rounded-xl bg-[color-mix(in_oklab,var(--fd-abyss-1000)_62%,transparent)] px-3 py-2 text-center text-caption font-medium">{caption}</p> : null}
      </div>

      <div className="relative mx-auto h-16 w-full max-w-72" style={{ "--p": `${progress * 100}%` } as CSSProperties}>
        <div aria-hidden="true" className="absolute inset-x-0 top-3 bottom-4 flex items-center gap-[2px]">
          {bars.map((height, i) => (
            <span key={i} className={cn("flex-1 rounded-full", (i + 0.5) / BARS <= progress ? "bg-accent-bright" : "bg-surface-active")} style={{ height: `${height * 100}%` }} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(durationMs, 1)}
          step={100}
          value={Math.min(currentMs, durationMs)}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Seek"
          aria-valuetext={`${formatDuration(currentMs / 1000)} of ${formatDuration(durationMs / 1000)}`}
          className="absolute inset-x-0 top-0 h-12 w-full cursor-pointer opacity-0"
        />
        <div aria-hidden="true" className="pointer-events-none absolute top-1 bottom-4 w-0.5 rounded-full bg-fg" style={{ left: "var(--p)" }} />
        <ul className="absolute inset-x-0 bottom-0 h-4" aria-label="Notes on the timeline">
          {notes.map((note) => (
            <li key={note.id} className="absolute -translate-x-1/2" style={{ left: `${Math.min(100, (note.t_ms / Math.max(durationMs, 1)) * 100)}%` }}>
              <button
                type="button"
                onClick={() => onSeek(note.t_ms)}
                aria-label={`${note.severity === "must_fix" ? "Must fix" : "Suggestion"} at ${formatDuration(note.t_ms / 1000)}: ${note.body}`}
                className={cn(
                  "grid size-4 place-items-center rounded-full ring-2 ring-surface transition-transform duration-(--fd-dur-fast) ease-standard hover:scale-125",
                  note.severity === "must_fix" ? "bg-ember-solid" : "bg-info-solid",
                  note.status !== "open" && "opacity-50",
                  activeNoteId === note.id && "scale-125 ring-fg",
                )}
              />
            </li>
          ))}
        </ul>
      </div>
      <p className="flex justify-between text-caption text-fg-muted tabular-nums">
        <span>{formatDuration(currentMs / 1000)}</span>
        <span>{formatDuration(durationMs / 1000)}</span>
      </p>
    </div>
  );
}
