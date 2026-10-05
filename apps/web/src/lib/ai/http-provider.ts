/**
 * The browser's Flo provider for `NEXT_PUBLIC_FLO_MODE=remote`: it posts the task to the server route and reads the answer as
 * server-sent events. If the route is missing, rate limited, down, or sends an error, it answers from the local mock instead and marks
 * the result `degraded`, so the screen still works and can say "Flo is on the backup engine".
 *
 * The route sends each option whole. This provider types the finished answer out in the browser (the same typewriter the mock uses), so
 * the pace and reduced motion are the page's decision and the server never sleeps to look busy.
 *
 * A fallback after a partial stream restarts with a fresh `start` event: UIs reset their buffers on `start` (`useFlo` does).
 */

import type { FloTask } from "./schemas";
import { MockFloProvider } from "./mock-provider";
import { readSse } from "./sse";
import { streamResult } from "./typewriter";
import { FloError, type AIProvider, type FloCallOptions, type FloResult, type FloStreamEvent } from "./types";

export const FLO_ENDPOINT = "/api/v1/flo/chat";

export interface HttpFloOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  /** Answers when the route cannot. Default: a new `MockFloProvider`. */
  fallback?: AIProvider;
}

export class HttpFloProvider implements AIProvider {
  readonly id = "remote" as const;
  readonly model = "flo-remote";
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fallback: AIProvider;

  constructor(options: HttpFloOptions = {}) {
    this.endpoint = options.endpoint ?? FLO_ENDPOINT;
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.fallback = options.fallback ?? new MockFloProvider();
  }

  async generate(task: FloTask, options: FloCallOptions = {}): Promise<FloResult> {
    let result: FloResult | null = null;
    for await (const event of this.stream(task, { ...options, typewriter: { ...options.typewriter, instant: true } })) {
      if (event.type === "done") result = event.result;
    }
    if (!result) throw new FloError("unavailable", "Flo did not finish.");
    return result;
  }

  async *stream(task: FloTask, options: FloCallOptions = {}): AsyncGenerator<FloStreamEvent, void, void> {
    const signal = options.signal ?? options.typewriter?.signal;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ task: { ...task, ...(options.attempt !== undefined ? { attempt: options.attempt } : {}) } }),
        signal,
      });
      if (!response.ok || !response.body) throw new FloError("unavailable", `Flo's route answered ${response.status}.`);

      let finished = false;
      for await (const event of readSse(response.body, signal)) {
        if (event.type === "error") throw new FloError("unavailable", event.message);
        if (event.type === "start") yield event;
        if (event.type === "done") {
          finished = true;
          yield* streamResult(event.result, { ...options.typewriter, firstTokenDelayMs: options.typewriter?.firstTokenDelayMs ?? 0, signal });
        }
        // The route's own delta and output_end events are not replayed: the answer is typed here, from the finished result.
      }
      if (!finished && !signal?.aborted) throw new FloError("unavailable", "The stream ended before the answer was complete.");
    } catch {
      if (signal?.aborted) return;
      for await (const event of this.fallback.stream(task, options)) {
        yield event.type === "done" ? { type: "done", result: { ...event.result, degraded: true } } : event;
      }
    }
  }
}
