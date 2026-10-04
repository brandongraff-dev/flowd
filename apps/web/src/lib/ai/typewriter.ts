/**
 * The typewriter: turns a finished answer into a stream that "types", for the Flo chat, the bounty builder and the script panel.
 *
 * It is a pure async generator over text. Timing is seeded (the same text types with the same rhythm every time), the clock is
 * injectable (`sleep`), it honours an `AbortSignal` between chunks, and `instant` skips every delay for reduced motion and tests.
 * Joining every yielded chunk gives back the original text exactly.
 */

import { hashString, seededRng } from "@/lib/engine/rng";
import type { FloResult, FloStreamEvent, TypewriterOptions } from "./types";

const DEFAULTS = {
  charsPerSecond: 120,
  firstTokenDelayMs: 350,
  sentencePauseMs: 140,
  newlinePauseMs: 70,
  outputPauseMs: 220,
  jitter: 0.3,
  maxDurationMs: 9000,
} as const;

/** Splits text into word-sized chunks that keep their trailing whitespace: `"Hi there.\nOk"` gives `["Hi ", "there.\n", "Ok"]`. Concatenating them restores the text. */
export function chunkText(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Resolves after `ms`, or immediately when the signal aborts. */
export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const id = setTimeout(done, ms);
    function done(): void {
      signal?.removeEventListener("abort", done);
      clearTimeout(id);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

const SENTENCE_END = /[.!?…]["')\]]?\s*$/;

interface Pace {
  /** Characters per second while typing (never below the requested speed; higher when the cap needs it). */
  cps: number;
  sentencePauseMs: number;
  newlinePauseMs: number;
  /** Pause between options, already scaled to fit. */
  outputPauseMs: number;
  jitter: number;
}

/** The pause a chunk earns by how it ends: a longer one after a sentence, a short one after a line break. */
const pauseAfter = (chunk: string, sentenceMs: number, newlineMs: number): number => (SENTENCE_END.test(chunk) ? sentenceMs : 0) + (chunk.includes("\n") ? newlineMs : 0);

/**
 * The pace for a set of texts. Total time is held under `maxDurationMs`: pauses are counted first (a script has a pause on almost every
 * line) and shrunk if they would take more than half the budget, then the typing speed is raised, never lowered, to fit the rest.
 */
function paceFor(texts: readonly string[], options: TypewriterOptions): Pace {
  const sentencePauseMs = options.sentencePauseMs ?? DEFAULTS.sentencePauseMs;
  const newlinePauseMs = options.newlinePauseMs ?? DEFAULTS.newlinePauseMs;
  const outputPauseMs = options.outputPauseMs ?? DEFAULTS.outputPauseMs;
  const first = options.firstTokenDelayMs ?? DEFAULTS.firstTokenDelayMs;
  const cap = options.maxDurationMs ?? DEFAULTS.maxDurationMs;
  const wanted = options.charsPerSecond ?? DEFAULTS.charsPerSecond;

  const chars = texts.reduce((n, t) => n + t.length, 0);
  const pauses = texts.reduce((n, t) => n + chunkText(t).reduce((m, c) => m + pauseAfter(c, sentencePauseMs, newlinePauseMs), 0), 0) + Math.max(0, texts.length - 1) * outputPauseMs;
  const room = Math.max(1, cap * 0.95 - first);
  const scale = pauses > room * 0.5 ? (room * 0.5) / pauses : 1;
  const typingBudget = Math.max(1, room - pauses * scale);
  const needed = chars > 0 ? (chars * 1000) / typingBudget : 0;

  return {
    cps: Math.max(1, wanted, needed),
    sentencePauseMs: sentencePauseMs * scale,
    newlinePauseMs: newlinePauseMs * scale,
    outputPauseMs: outputPauseMs * scale,
    jitter: Math.min(1, Math.max(0, options.jitter ?? DEFAULTS.jitter)),
  };
}

function delayFor(chunk: string, pace: Pace, rng: () => number): number {
  const base = (chunk.length / pace.cps) * 1000;
  const varied = base * (1 + (rng() - 0.5) * 2 * pace.jitter);
  return Math.max(0, Math.round(varied + pauseAfter(chunk, pace.sentencePauseMs, pace.newlinePauseMs)));
}

/**
 * Yields `text` in word-sized chunks at a human typing pace. Stops quietly (no error) when the signal aborts.
 *
 * ```ts
 * for await (const chunk of typewriter(answer, { signal })) setText((t) => t + chunk);
 * ```
 */
export async function* typewriter(text: string, options: TypewriterOptions = {}): AsyncGenerator<string, void, void> {
  const chunks = chunkText(text);
  if (options.instant) {
    if (text.length > 0) yield text;
    return;
  }
  const sleep = options.sleep ?? defaultSleep;
  const rng = seededRng(options.seed ?? `typewriter:${hashString(text)}`);
  const pace = paceFor([text], options);
  const first = options.firstTokenDelayMs ?? DEFAULTS.firstTokenDelayMs;
  if (first > 0) await sleep(first, options.signal);
  for (const chunk of chunks) {
    if (options.signal?.aborted) return;
    yield chunk;
    await sleep(delayFor(chunk, pace, rng), options.signal);
  }
}

/** How long `typewriter` would take for these texts at this pace, in ms (for sizing a skeleton or a progress hint). Instant is 0. */
export function typingDurationMs(texts: readonly string[], options: TypewriterOptions = {}): number {
  if (options.instant) return 0;
  const pace = paceFor(texts, options);
  const rng = seededRng(options.seed ?? "typing-duration");
  let total = options.firstTokenDelayMs ?? DEFAULTS.firstTokenDelayMs;
  texts.forEach((text, i) => {
    for (const chunk of chunkText(text)) total += delayFor(chunk, pace, rng);
    if (i < texts.length - 1) total += options.outputPauseMs ?? DEFAULTS.outputPauseMs;
  });
  return total;
}

/**
 * Streams a finished result as events: `start`, then each option typed out (`delta`s and an `output_end`), then `done` with the
 * result. A cancelled stream ends without `done`.
 */
export async function* streamResult(result: FloResult, options: TypewriterOptions = {}): AsyncGenerator<FloStreamEvent, void, void> {
  yield { type: "start", task_kind: result.task_kind, title: result.title, model: result.model, source: result.source, outputs: result.outputs.length };
  const sleep = options.sleep ?? defaultSleep;
  const pace = paceFor(result.outputs, options);
  const rng = seededRng(options.seed ?? `stream:${result.task_kind}:${hashString(result.outputs.join("\n"))}`);

  if (options.instant) {
    for (let i = 0; i < result.outputs.length; i += 1) {
      const text = result.outputs[i] ?? "";
      if (text.length > 0) yield { type: "delta", output: i, text };
      yield { type: "output_end", output: i };
    }
    yield { type: "done", result };
    return;
  }

  const first = options.firstTokenDelayMs ?? DEFAULTS.firstTokenDelayMs;
  if (first > 0) await sleep(first, options.signal);
  for (let i = 0; i < result.outputs.length; i += 1) {
    for (const chunk of chunkText(result.outputs[i] ?? "")) {
      if (options.signal?.aborted) return;
      yield { type: "delta", output: i, text: chunk };
      await sleep(delayFor(chunk, pace, rng), options.signal);
    }
    if (options.signal?.aborted) return;
    yield { type: "output_end", output: i };
    if (i < result.outputs.length - 1) await sleep(options.outputPauseMs ?? DEFAULTS.outputPauseMs, options.signal);
  }
  if (options.signal?.aborted) return;
  yield { type: "done", result };
}

/** Collects a stream back into plain text per option (what a UI that does not animate would render). */
export async function collectStream(stream: AsyncIterable<FloStreamEvent>): Promise<{ outputs: string[]; result: FloResult | null; error: string | null }> {
  const outputs: string[] = [];
  let result: FloResult | null = null;
  let error: string | null = null;
  for await (const event of stream) {
    if (event.type === "delta") outputs[event.output] = (outputs[event.output] ?? "") + event.text;
    else if (event.type === "done") result = event.result;
    else if (event.type === "error") error = event.message;
  }
  return { outputs, result, error };
}
