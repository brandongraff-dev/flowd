/**
 * The server side of Flo: the route-handler logic for `POST /api/v1/flo/chat`, and the choice of engine. Import from
 * "@/lib/ai/server" in route handlers only (it reads server environment variables).
 *
 * The route file (owned by the admin and API area) is three lines:
 *
 * ```ts
 * // src/app/api/v1/flo/chat/route.ts
 * import { handleFloChat, describeFlo } from "@/lib/ai/server";
 * export const runtime = "nodejs";
 * export const dynamic = "force-dynamic";
 * export const POST = handleFloChat;
 * export const GET = () => Response.json(describeFlo());
 * ```
 *
 * What it does, in order: rate limit per client, read and size-check the body, validate it with zod, pick the engine (Claude when
 * `ANTHROPIC_API_KEY` is set and `FLO_PROVIDER` allows it, otherwise the mock), stream the answer as server-sent events, and on any
 * failure of the primary engine answer from the mock with `degraded: true`. Errors use the API shape `{ code, message, hint }`.
 * Nothing about the key, the SDK or a stack trace ever reaches the client.
 */

import { serverEnv, type ServerEnv } from "@/lib/env";
import { ClaudeProvider, loadAnthropicClient, type AnthropicLike } from "./claude-provider";
import { MockFloProvider } from "./mock-provider";
import { clientKey, createRateLimiter, type RateLimiter } from "./rate-limit";
import { FloChatRequestSchema, type FloTask } from "./schemas";
import { encodeSse, SSE_KEEPALIVE } from "./sse";
import { FloError, type AIProvider, type FloCallOptions, type FloResult, type FloStreamEvent } from "./types";

/** Largest request body accepted, in bytes. A bounty with its brief and formats is a few KB. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface FloServerDeps {
  env?: ServerEnv;
  /** Builds the Anthropic client (tests inject a fake; the default imports the official SDK). */
  loadClient?: (apiKey: string) => Promise<AnthropicLike>;
  /** The fallback engine. Default: a new `MockFloProvider`. */
  fallback?: AIProvider;
  limiter?: RateLimiter;
  /** Where server-side problems are reported. Default: `console.error`. Never receives a key or a prompt. */
  log?: (message: string, detail?: unknown) => void;
}

export interface FloDescription {
  /** The engine that will answer first. */
  provider: "mock" | "claude";
  model: string;
  /** A Claude key is present. */
  configured: boolean;
  /** Where it falls back to. */
  fallback: "mock";
}

/** Which engine would answer, for the GET endpoint and the admin page. Reveals no secret. */
export function describeFlo(env: ServerEnv = serverEnv()): FloDescription {
  const claude = wantsClaude(env);
  return { provider: claude ? "claude" : "mock", model: claude ? env.FLO_MODEL : "flo-mock-1", configured: env.claudeConfigured, fallback: "mock" };
}

function wantsClaude(env: ServerEnv): boolean {
  if (!env.ANTHROPIC_API_KEY) return false;
  return env.FLO_PROVIDER === "claude" || env.FLO_PROVIDER === "auto";
}

/** Imports the SDK and builds the provider the first time it is used; a missing SDK or key surfaces as a fallback, not a crash. */
class LazyClaudeProvider implements AIProvider {
  readonly id = "claude" as const;
  readonly model: string;
  private inner: Promise<ClaudeProvider> | undefined;

  constructor(
    private readonly env: ServerEnv,
    private readonly load: (apiKey: string) => Promise<AnthropicLike>,
  ) {
    this.model = env.FLO_MODEL;
  }

  private provider(): Promise<ClaudeProvider> {
    this.inner ??= (async () => {
      const key = this.env.ANTHROPIC_API_KEY;
      if (!key) throw new FloError("unavailable", "No API key.");
      const client = await this.load(key);
      return new ClaudeProvider({ client, model: this.env.FLO_MODEL, maxTokens: this.env.FLO_MAX_TOKENS, refusalFallback: this.env.FLO_REFUSAL_FALLBACK });
    })();
    // A failed load is not cached forever: the next request tries again (the SDK may have been installed since).
    this.inner.catch(() => {
      this.inner = undefined;
    });
    return this.inner;
  }

  async generate(task: FloTask, options?: FloCallOptions): Promise<FloResult> {
    return (await this.provider()).generate(task, options);
  }

  async *stream(task: FloTask, options?: FloCallOptions): AsyncGenerator<FloStreamEvent, void, void> {
    yield* (await this.provider()).stream(task, options);
  }
}

/** The engine that answers first and the one it falls back to. */
export function resolveProviders(env: ServerEnv, deps: Pick<FloServerDeps, "loadClient" | "fallback"> = {}): { primary: AIProvider; fallback: AIProvider } {
  const fallback = deps.fallback ?? new MockFloProvider();
  if (!wantsClaude(env)) return { primary: fallback, fallback };
  const load = deps.loadClient ?? ((apiKey: string) => loadAnthropicClient({ apiKey }));
  return { primary: new LazyClaudeProvider(env, load), fallback };
}

/** The primary engine's stream; if it throws, the fallback answers and the result is marked degraded. */
export async function* streamWithFallback(primary: AIProvider, fallback: AIProvider, task: FloTask, options: FloCallOptions, onFailure?: (error: unknown) => void): AsyncGenerator<FloStreamEvent, void, void> {
  if (primary === fallback) {
    yield* primary.stream(task, options);
    return;
  }
  try {
    for await (const event of primary.stream(task, options)) yield event;
  } catch (error) {
    if (options.signal?.aborted) return;
    onFailure?.(error);
    for await (const event of fallback.stream(task, options)) yield event.type === "done" ? { type: "done", result: { ...event.result, degraded: true } } : event;
  }
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;

function problem(status: number, code: string, message: string, hint: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ code, message, hint, ...extra }), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export interface FloServer {
  handle(request: Request): Promise<Response>;
  describe(): FloDescription;
}

/** A server instance with its own rate limiter and engine choice. `handleFloChat` is one built from the real environment. */
export function createFloServer(deps: FloServerDeps = {}): FloServer {
  const env = deps.env ?? serverEnv();
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(`[flo] ${message}`, detail instanceof Error ? detail.message : ""));
  const limiter = deps.limiter ?? createRateLimiter({ limit: env.FLO_RATE_LIMIT_PER_MIN });
  const { primary, fallback } = resolveProviders(env, deps);

  return {
    describe: () => describeFlo(env),

    async handle(request: Request): Promise<Response> {
      const taken = limiter.take(clientKey(request.headers));
      if (!taken.ok) {
        return problem(429, "rate_limited", "Too many Flo requests.", `Wait ${taken.retryAfterSec} seconds and try again.`, {}, { "retry-after": String(taken.retryAfterSec) });
      }

      let raw: string;
      try {
        raw = await request.text();
      } catch {
        return problem(400, "bad_request", "The request body could not be read.", "Send a JSON body: { task }.");
      }
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return problem(413, "payload_too_large", "The request is too large.", "Send only the bounty, format and hook Flo needs.");

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return problem(400, "invalid_json", "The body is not valid JSON.", "Send a JSON body: { task }.");
      }
      const parsed = FloChatRequestSchema.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 8).map((i) => ({ path: i.path.join("."), message: i.message }));
        return problem(422, "validation_failed", "The task is not valid.", "Check the fields listed in issues.", { issues });
      }

      const abort = new AbortController();
      request.signal.addEventListener("abort", () => abort.abort(), { once: true });
      const options: FloCallOptions = { signal: abort.signal, typewriter: { signal: abort.signal } };
      const encoder = new TextEncoder();
      const task = parsed.data.task;

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(SSE_KEEPALIVE));
          try {
            for await (const event of streamWithFallback(primary, fallback, task, options, (e) => log("primary engine failed, answering from the mock", e))) {
              controller.enqueue(encoder.encode(encodeSse(event)));
            }
          } catch (error) {
            log("stream failed", error);
            controller.enqueue(encoder.encode(encodeSse({ type: "error", message: "Flo could not answer. Try again in a moment." })));
          } finally {
            controller.close();
          }
        },
        cancel() {
          abort.abort();
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-flo-engine": primary.id,
        },
      });
    },
  };
}

let shared: FloServer | undefined;
const server = (): FloServer => (shared ??= createFloServer());

/** `POST /api/v1/flo/chat`. */
export const handleFloChat = (request: Request): Promise<Response> => server().handle(request);

/** The engine description for a GET endpoint. */
export const floStatus = (): FloDescription => server().describe();

/** Test helper: forget the shared server (re-reads the environment on next use). */
export function resetFloServerForTests(): void {
  shared = undefined;
}
