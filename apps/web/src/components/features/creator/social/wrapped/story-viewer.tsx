"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import type { Wrapped } from "@/lib/contract/types";
import { StoryCard } from "./story-card";

/** How long each card stays: long enough to read one figure and one sentence. */
const CARD_MS = 6_000;
/** A press shorter than this is a tap (go forward or back); longer is a hold (pause). */
const HOLD_MS = 180;

export interface StoryViewerProps {
  wrapped: Wrapped;
  /** Moves focus to the share options (the final card's button). */
  onShare: () => void;
}

/**
 * Wrapped as a story: segmented progress, tap the left third to go back and anywhere else to go on, hold to pause, arrow keys and space
 * for keyboards, visible buttons for everyone. It auto-advances every six seconds except for people who asked for reduced motion, who
 * move through at their own pace. Everything on it is one real recap: cleared money, verified views, tracked trials.
 */
export function StoryViewer({ wrapped, onShare }: StoryViewerProps) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const didHold = useRef(false);
  const total = wrapped.cards.length;
  const card = wrapped.cards[index];
  const last = index === total - 1;
  const running = !reduce && !paused && !held && !last;

  const go = useCallback(
    (delta: number): void => {
      setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));
    },
    [total],
  );

  // Pausing while the tab is hidden: the clock should not run past cards nobody saw.
  useEffect(() => {
    const onHide = (): void => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  if (!card) return null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("[data-story-nopress]")) return;
    didHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      didHold.current = true;
      setHeld(true);
    }, HOLD_MS);
  };
  const endPress = (event: PointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("[data-story-nopress]")) return;
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (didHold.current) {
      setHeld(false);
      didHold.current = false;
      return;
    }
    if (event.type === "pointerup") {
      const box = event.currentTarget.getBoundingClientRect();
      go(event.clientX - box.left < box.width / 3 ? -1 : 1);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
    else if (event.key === " " && event.target === event.currentTarget) {
      event.preventDefault();
      setPaused((value) => !value);
    } else if (event.key === "Home") setIndex(0);
    else if (event.key === "End") setIndex(total - 1);
  };

  return (
    <div className="grid justify-items-center gap-4">
      <div
        role="group"
        aria-roledescription="story"
        aria-label={`${wrapped.label} Wrapped, card ${index + 1} of ${total}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={(event) => (held ? endPress(event) : undefined)}
        className="relative aspect-[9/16] w-full max-w-[24rem] touch-pan-y overflow-hidden rounded-[2.25rem] bg-bg-sunken shadow-overlay outline-none select-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        style={{ borderRadius: 36 }}
      >
        <StoryCard card={card} wrapped={wrapped}>
          <div data-story-nopress className="grid justify-items-start gap-3">
            <p className="max-w-[30ch] text-body-lg text-pretty text-white/90">{card.caption}</p>
            <Button variant="primary" onClick={onShare}>
              Share this month
            </Button>
          </div>
        </StoryCard>

        <ol aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-4 flex gap-1.5">
          {wrapped.cards.map((item, position) => (
            <li key={`${item.kind}-${position}`} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              {position < index ? (
                <span className="block h-full w-full bg-white" />
              ) : position === index ? (
                <span
                  key={`${wrapped.id}-${index}`}
                  className="fd-story-fill block h-full w-full bg-white"
                  style={{ animationDuration: `${CARD_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                  onAnimationEnd={() => {
                    if (running) go(1);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ol>

        <div aria-live={running ? "off" : "polite"} className="sr-only">
          {card.title}. {card.figure ?? ""} {card.caption}
        </div>
      </div>

      <div className="flex w-full max-w-[24rem] items-center justify-between gap-3">
        <IconButton variant="secondary" label="Previous card" icon={<ChevronLeft />} disabled={index === 0} onClick={() => go(-1)} />
        <div className="flex items-center gap-3 text-caption font-medium text-fg-muted tabular-nums">
          {reduce ? (
            <span>Auto-play is off for reduced motion</span>
          ) : (
            <IconButton variant="plain" label={paused ? "Play" : "Pause"} icon={paused ? <Play /> : <Pause />} size="sm" onClick={() => setPaused((value) => !value)} />
          )}
          <span aria-hidden="true">
            {index + 1} / {total}
          </span>
        </div>
        <IconButton variant="secondary" label="Next card" icon={<ChevronRight />} disabled={last} onClick={() => go(1)} />
      </div>
      <p className="text-caption text-fg-subtle">Tap to go on. Hold to pause. Arrow keys work too.</p>
    </div>
  );
}
