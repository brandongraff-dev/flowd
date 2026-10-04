// HTTP plumbing shared by every function: JSON responses, the { code, message, hint } error body, a request id for the logs, and a
// handler wrapper that turns thrown FlowdErrors into responses and anything else into a clean 500 (details go to the log, not the caller).

import { ConfigError, errorMessage, FlowdError } from './errors.ts';

export interface RequestContext {
  requestId: string;
  startedAt: number;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorResponse(err: FlowdError, requestId: string): Response {
  return jsonResponse(err.toBody(), err.status, { 'x-request-id': requestId });
}

/** Parse a JSON body; an empty body is `{}` so cron invocations can POST nothing. */
export async function readJson<T extends object>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.trim() === '') return {} as T;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as T;
  } catch {
    throw new FlowdError('validation_failed', 'The request body must be a JSON object.', 422);
  }
}

export function requireMethod(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new FlowdError('method_not_allowed', `Use ${methods.join(' or ')}.`, 405);
  }
}

type Handler = (req: Request, ctx: RequestContext) => Promise<Response | Record<string, unknown>>;

/**
 * Wrap a function body. Plain objects become 200 JSON; thrown FlowdErrors keep their status; ConfigError is a 500 that names the
 * missing configuration (safe: it lists variable names, never values); everything else is a generic 500 with the request id.
 */
export function handle(name: string, fn: Handler): (req: Request) => Promise<Response> {
  return async (req) => {
    const ctx: RequestContext = { requestId: req.headers.get('x-request-id') ?? crypto.randomUUID(), startedAt: Date.now() };
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS' } });
      const out = await fn(req, ctx);
      const res = out instanceof Response ? out : jsonResponse(out, 200, { 'x-request-id': ctx.requestId });
      log(name, 'info', 'done', { request_id: ctx.requestId, status: res.status, ms: Date.now() - ctx.startedAt });
      return res;
    } catch (err) {
      if (err instanceof FlowdError) {
        log(name, err.status >= 500 ? 'error' : 'warn', err.code, { request_id: ctx.requestId, message: err.message });
        return errorResponse(err, ctx.requestId);
      }
      if (err instanceof ConfigError) {
        log(name, 'error', 'config', { request_id: ctx.requestId, message: err.message });
        return errorResponse(new FlowdError('misconfigured', err.message, 500), ctx.requestId);
      }
      log(name, 'error', 'unhandled', { request_id: ctx.requestId, message: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
      return errorResponse(new FlowdError('internal', 'Something went wrong on our side.', 500, { hint: `Quote request id ${ctx.requestId} to support.` }), ctx.requestId);
    }
  };
}

/** Structured log line (one JSON object per line: Supabase Logs and any log drain index the fields). */
export function log(fn: string, level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), fn, level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
