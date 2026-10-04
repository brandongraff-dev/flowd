/**
 * Server-sent events for the Flo route: one encoder for the server, one incremental decoder for the browser. Each message is
 * `event: <type>` and `data: <json>`, separated by a blank line, which is what `EventSource` and `fetch` readers both understand.
 */

import type { FloStreamEvent } from "./types";

const TYPES: ReadonlySet<string> = new Set(["start", "delta", "output_end", "done", "error"]);

/** One event as an SSE message. */
export function encodeSse(event: FloStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A comment line some proxies need to keep a quiet connection open. */
export const SSE_KEEPALIVE = ": keep-alive\n\n";

function isEvent(value: unknown): value is FloStreamEvent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string" && TYPES.has((value as { type: string }).type);
}

/**
 * Incremental SSE decoder. Feed it text as it arrives, in any slicing; it returns the events completed so far and keeps the rest.
 * Handles CRLF and LF, comment lines, `data:` split over several lines, and ignores messages that are not Flo events.
 */
export class SseDecoder {
  private buffer = "";

  feed(chunk: string): FloStreamEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const events: FloStreamEvent[] = [];
    let at: number;
    while ((at = this.buffer.indexOf("\n\n")) !== -1) {
      const message = this.buffer.slice(0, at);
      this.buffer = this.buffer.slice(at + 2);
      const event = parseMessage(message);
      if (event) events.push(event);
    }
    return events;
  }

  /** Whatever was left over when the stream closed (a final message with no blank line). */
  flush(): FloStreamEvent[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (!rest) return [];
    const event = parseMessage(rest);
    return event ? [event] : [];
  }
}

function parseMessage(message: string): FloStreamEvent | null {
  const data: string[] = [];
  for (const line of message.split("\n")) {
    if (line.startsWith(":") || line === "") continue;
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(data.join("\n"));
    return isEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Reads a fetch response body as Flo events until it closes. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<FloStreamEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const sse = new SseDecoder();
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of sse.feed(decoder.decode(value, { stream: true }))) yield event;
    }
    for (const event of sse.feed(decoder.decode())) yield event;
    for (const event of sse.flush()) yield event;
  } finally {
    reader.releaseLock();
  }
}
