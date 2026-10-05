"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The review player's clock. There is no real video in the demo (every clip is generated art plus a transcript), so playback is a
 * clock that runs at the chosen speed and drives the art, the captions and the scrub bar. It is an external store, so the page that
 * owns the player never re-renders per frame: only the small pieces that read the time subscribe to it.
 */

export const FRAME_MS = 1000 / 30;
export const RATES = [1, 1.5, 2] as const;
export type PlayerRate = (typeof RATES)[number];

export interface PlayerState {
  timeMs: number;
  playing: boolean;
  rate: PlayerRate;
}

export interface Player {
  readonly durationMs: number;
  getState: () => PlayerState;
  subscribe: (listener: () => void) => () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
  seekBy: (deltaMs: number) => void;
  /** Moves by whole frames at 30 fps and pauses (frame stepping is a paused act). */
  step: (frames: number) => void;
  setRate: (rate: PlayerRate) => void;
  cycleRate: () => void;
  /** Stops the clock. Safe to call twice; the player can be used again afterwards. */
  stop: () => void;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export function createPlayer(durationMs: number): Player {
  let state: PlayerState = { timeMs: 0, playing: false, rate: 1 };
  const listeners = new Set<() => void>();
  let raf: number | null = null;
  let last = 0;

  const emit = (next: PlayerState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const tick = (now: number): void => {
    const elapsed = Math.min(64, now - last) * state.rate;
    last = now;
    const timeMs = state.timeMs + elapsed;
    if (timeMs >= durationMs) {
      raf = null;
      emit({ ...state, timeMs: durationMs, playing: false });
      return;
    }
    emit({ ...state, timeMs });
    raf = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (state.playing) emit({ ...state, playing: false });
  };

  const player: Player = {
    durationMs,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play() {
      if (state.playing) return;
      // Pressing play at the end starts again from the top.
      const start = state.timeMs >= durationMs ? 0 : state.timeMs;
      emit({ ...state, timeMs: start, playing: true });
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    pause: stop,
    toggle() {
      if (state.playing) stop();
      else player.play();
    },
    seek(ms) {
      emit({ ...state, timeMs: clamp(ms, 0, durationMs) });
    },
    seekBy(deltaMs) {
      emit({ ...state, timeMs: clamp(state.timeMs + deltaMs, 0, durationMs) });
    },
    step(frames) {
      stop();
      emit({ ...state, playing: false, timeMs: clamp(Math.round((state.timeMs + frames * FRAME_MS) / FRAME_MS) * FRAME_MS, 0, durationMs) });
    },
    setRate(rate) {
      emit({ ...state, rate });
    },
    cycleRate() {
      const index = RATES.indexOf(state.rate);
      emit({ ...state, rate: RATES[(index + 1) % RATES.length] ?? 1 });
    },
    stop,
  };
  return player;
}

/** One player per mounted component: key the component by the video so a new video starts at 0:00. */
export function usePlayer(durationMs: number): Player {
  const [player] = useState(() => createPlayer(durationMs));
  useEffect(() => () => player.stop(), [player]);
  return player;
}

/** The player's full state (re-renders every frame while playing: use it only in small leaf components). */
export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

/** Just whether it is playing (re-renders only when that flips). */
export function usePlaying(player: Player): boolean {
  return useSyncExternalStore(player.subscribe, () => player.getState().playing, () => false);
}
