"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { Captions, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { BEAT_ID_META, SCENE_KIND_META, type VideoAnalysis } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { AppIcon, ArtSurface } from "@/components/brand";
import type { ArtSeed } from "@/components/brand";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { RATES, usePlayerState, usePlaying, type Player } from "./player";
import { tc, tcPrecise } from "./timecode";

/** A mark on the scrub bar: a QA finding, a note, or the moment the hook lands. */
export interface TimelineMarker {
  id: string;
  t_ms: number;
  kind: "fail" | "warn" | "must_fix" | "suggestion" | "hook";
  label: string;
}

/** A highlighted span on the scrub bar (a note that covers a range, or the one being authored). */
export interface TimelineRange {
  id: string;
  start_ms: number;
  end_ms: number;
  tone: "accent" | "ember";
}

export interface VideoScreenProps {
  player: Player;
  art: ArtSeed;
  app: { name: string; art: ArtSeed };
  analysis?: VideoAnalysis;
  captions: boolean;
  /** Accessible name of the video ("Free-trial lead v1 by @gigi.glow"). */
  label: string;
  className?: string;
}

function activeAt<T extends { t_start_ms: number; t_end_ms: number }>(items: readonly T[] | undefined, ms: number): T | undefined {
  return items?.find((item) => ms >= item.t_start_ms && ms < item.t_end_ms);
}

/**
 * The picture. Generated art stands in for the video: it drifts slowly while playing, with the spoken line as a caption, on-screen
 * text as it appears, the scene type and the current beat. Everything shown comes from the analysis, so a reviewer sees the same
 * words and moments the checks ran on.
 */
export function VideoScreen({ player, art, app, analysis, captions, label, className }: VideoScreenProps) {
  const { timeMs, playing } = usePlayerState(player);
  const reduce = useReducedMotion();
  const line = activeAt(analysis?.transcript, timeMs);
  const scene = activeAt(analysis?.scenes, timeMs);
  const texts = analysis?.on_screen_text.filter((t) => timeMs >= t.t_start_ms && timeMs < t.t_end_ms) ?? [];
  const beat = analysis ? [...analysis.beats].filter((b) => b.found && b.t_ms !== undefined && b.t_ms <= timeMs).sort((a, b) => (b.t_ms ?? 0) - (a.t_ms ?? 0))[0] : undefined;
  const drift: CSSProperties = reduce
    ? {}
    : { transform: `scale(1.07) translate(${(Math.sin(timeMs / 3200) * 1.6).toFixed(2)}%, ${(Math.cos(timeMs / 4300) * 1.6).toFixed(2)}%)` };

  return (
    <div role="img" aria-label={`${label}, ${tc(player.durationMs)} long`} className={cn("@container relative isolate aspect-[9/16] w-full overflow-hidden rounded-[22px] bg-bg-sunken text-white", className)}>
      <ArtSurface art={art} aspect="9:16" className="absolute inset-0 block size-full" style={drift} />
      <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />

      <div className="absolute inset-x-[5cqw] top-[5cqw] flex items-start justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-pill bg-[color-mix(in_oklab,var(--fd-abyss-1000)_58%,transparent)] py-1 pr-2.5 pl-1 text-micro font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]">
          <AppIcon art={app.art} name={app.name} size={20} decorative />
          <span className="truncate">{app.name}</span>
        </span>
        {scene ? (
          <span className="inline-flex shrink-0 items-center rounded-pill bg-[color-mix(in_oklab,var(--fd-abyss-1000)_58%,transparent)] px-2.5 py-1 text-micro font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]">{SCENE_KIND_META[scene.kind].label}</span>
        ) : null}
      </div>

      {texts.length > 0 ? (
        <div className="absolute inset-x-[7cqw] top-[22%] grid justify-items-center gap-2 text-center">
          {texts.map((t) => (
            <span
              key={`${t.t_start_ms}-${t.text}`}
              className={cn(
                "max-w-full rounded-lg bg-[color-mix(in_oklab,var(--fd-abyss-1000)_72%,transparent)] px-3 py-1.5 font-display leading-tight font-extrabold tracking-[-0.01em] text-balance",
                !t.in_safe_zone && "outline-2 outline-offset-2 outline-ember-solid outline-dashed",
              )}
              style={{ fontSize: "clamp(13px, 6.2cqw, 22px)" }}
            >
              {t.text}
            </span>
          ))}
        </div>
      ) : null}

      {beat?.beat ? (
        <span className="absolute bottom-[26%] left-[5cqw] inline-flex items-center rounded-pill bg-[color-mix(in_oklab,var(--fd-abyss-1000)_58%,transparent)] px-2.5 py-1 text-micro font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]">
          {BEAT_ID_META[beat.beat].label}
        </span>
      ) : null}

      {captions ? (
        <div className="absolute inset-x-[6cqw] bottom-[9cqw] text-center">
          {line ? (
            <p className="mx-auto max-w-[28ch] font-display leading-tight font-bold text-balance [text-shadow:0_2px_12px_rgb(1_4_20/0.7)]" style={{ fontSize: "clamp(13px, 5.4cqw, 20px)" }}>
              {line.text}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-label={playing ? "Pause video" : "Play video"}
        onClick={() => player.toggle()}
        className="absolute inset-0 grid place-items-center outline-offset-[-3px]"
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-[clamp(48px,20cqw,68px)] place-items-center rounded-full bg-[color-mix(in_oklab,var(--fd-abyss-1000)_52%,transparent)] text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4),0_6px_20px_-6px_rgb(1_4_20/0.6)] transition-[opacity,transform] duration-(--fd-dur-base) ease-emphasized",
            playing ? "scale-90 opacity-0" : "opacity-100",
          )}
        >
          <Play className="size-[44%] translate-x-[7%] fill-current" strokeWidth={1.5} />
        </span>
      </button>

      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-[rgb(255_255_255/0.18)]">
        <span className="block h-full origin-left bg-white" style={{ transform: `scaleX(${player.durationMs > 0 ? timeMs / player.durationMs : 0})` }} />
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.12)] light:shadow-[inset_0_0_0_1px_oklch(0_0_0/0.1)]" />
    </div>
  );
}

const MARKER_STYLE: Record<TimelineMarker["kind"], { shape: string; color: string }> = {
  fail: { shape: "rotate-45 rounded-[2px]", color: "bg-rose-solid" },
  warn: { shape: "rounded-full", color: "bg-ember-solid" },
  must_fix: { shape: "rounded-[3px]", color: "bg-accent-bright" },
  suggestion: { shape: "rounded-[3px] ring-2 ring-accent-bright ring-inset", color: "bg-surface-raised" },
  hook: { shape: "rounded-full", color: "bg-mint-solid" },
};

export interface ScrubberProps {
  player: Player;
  markers?: readonly TimelineMarker[];
  ranges?: readonly TimelineRange[];
  className?: string;
}

/** The scrub bar: drag or arrow-key to seek, with marks for flags and notes that you can click to jump to. */
export function Scrubber({ player, markers = [], ranges = [], className }: ScrubberProps) {
  const { timeMs } = usePlayerState(player);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const duration = player.durationMs;
  const pct = (ms: number): number => (duration > 0 ? Math.min(100, Math.max(0, (ms / duration) * 100)) : 0);

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    player.seek(((event.clientX - rect.left) / rect.width) * duration);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 5000 : 1000;
    if (event.key === "ArrowRight") player.seekBy(step);
    else if (event.key === "ArrowLeft") player.seekBy(-step);
    else if (event.key === "Home") player.seek(0);
    else if (event.key === "End") player.seek(duration);
    else return;
    event.preventDefault();
  };

  return (
    <div className={cn("relative h-11 touch-none select-none", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(timeMs / 1000)}
        aria-valuetext={`${tc(timeMs)} of ${tc(duration)}`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) seekFromPointer(event);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        className="group/scrub absolute inset-x-0 top-0 h-full cursor-pointer rounded-md outline-offset-2"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-pill bg-surface-active transition-[height] duration-(--fd-dur-fast) ease-standard group-hover/scrub:h-2">
          {ranges.map((r) => (
            <span key={r.id} className={cn("absolute inset-y-0", r.tone === "ember" ? "bg-ember-solid/55" : "bg-accent-bright/55")} style={{ left: `${pct(r.start_ms)}%`, width: `${Math.max(0.8, pct(r.end_ms) - pct(r.start_ms))}%` }} />
          ))}
          <span className="absolute inset-y-0 left-0 w-full origin-left bg-fg/80" style={{ transform: `scaleX(${pct(timeMs) / 100})` }} />
        </span>
        <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-rest" style={{ left: `${pct(timeMs)}%` }} />
      </div>
      {markers.map((m) => {
        const style = MARKER_STYLE[m.kind];
        return (
          <button
            key={m.id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            title={`${tc(m.t_ms)}  ${m.label}`}
            onClick={() => player.seek(m.t_ms)}
            className="absolute top-1/2 z-10 grid h-4 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center outline-offset-0"
            style={{ left: `${pct(m.t_ms)}%` }}
          >
            <span className={cn("block size-2.5", style.shape, style.color)} />
          </button>
        );
      })}
    </div>
  );
}

export interface PlayerBarProps {
  player: Player;
  markers?: readonly TimelineMarker[];
  ranges?: readonly TimelineRange[];
  captions: boolean;
  onCaptionsChange: (on: boolean) => void;
  /** Show the shortcut hints (the focus view). */
  hints?: boolean;
  className?: string;
}

/** Play, scrub, step a frame, speed and captions, in one quiet row. */
export function PlayerBar({ player, markers, ranges, captions, onCaptionsChange, hints = false, className }: PlayerBarProps) {
  const playing = usePlaying(player);
  const { rate, timeMs } = usePlayerState(player);
  return (
    <div className={cn("grid gap-0.5", className)}>
      <Scrubber player={player} markers={markers} ranges={ranges} />
      <div className="flex items-center gap-1">
        <IconButton variant="plain" size="sm" label={playing ? "Pause" : "Play"} shortcut={["Space"]} icon={playing ? <Pause className="fill-current" /> : <Play className="fill-current" />} onClick={() => player.toggle()} />
        <IconButton variant="plain" size="sm" label="Back one frame" shortcut={[","]} icon={<ChevronLeft />} onClick={() => player.step(-1)} />
        <IconButton variant="plain" size="sm" label="Forward one frame" shortcut={["."]} icon={<ChevronRight />} onClick={() => player.step(1)} />
        <p className="ml-1 text-caption font-medium text-fg-muted tabular-nums" aria-hidden="true">
          <span className="text-fg">{tcPrecise(timeMs)}</span> / {tcPrecise(player.durationMs)}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => player.cycleRate()}
            aria-label={`Playback speed ${rate} times. Change speed`}
            className="inline-flex h-7 min-w-9 items-center justify-center rounded-pill px-2 text-caption font-semibold text-fg-muted tabular-nums transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11"
          >
            {rate}×
          </button>
          <IconButton
            variant="plain"
            size="sm"
            label={captions ? "Hide captions" : "Show captions"}
            shortcut={["T"]}
            icon={<Captions />}
            aria-pressed={captions}
            className={cn(captions && "text-accent")}
            onClick={() => onCaptionsChange(!captions)}
          />
        </div>
      </div>
      {hints ? (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-caption text-fg-subtle">
          <span className="inline-flex items-center gap-1"><Kbd size="sm">J</Kbd><Kbd size="sm">K</Kbd><Kbd size="sm">L</Kbd> back, pause, forward</span>
          <span className="inline-flex items-center gap-1"><Kbd size="sm">,</Kbd><Kbd size="sm">.</Kbd> frame</span>
          <span className="inline-flex items-center gap-1"><Kbd size="sm">1</Kbd><Kbd size="sm">2</Kbd> speed {RATES[0]}× {RATES[2]}×</span>
        </p>
      ) : null}
    </div>
  );
}
