/**
 * A small fixed-window rate limiter for the Flo route, which fronts a paid API. In-memory and per server instance: it stops a runaway
 * loop or a casual abuser, not a determined one. A deployment with several instances puts a shared limiter (a gateway or a store) in
 * front of the route; this stays as the last line.
 */

export interface RateLimiter {
  /** Counts one request for `key`. `ok` is false once the window's allowance is used up. */
  take(key: string): { ok: boolean; remaining: number; retryAfterSec: number };
}

export function createRateLimiter(options: { limit: number; windowMs?: number; now?: () => number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs = 60_000, now = () => Date.now(), maxKeys = 5000 } = options;
  const windows = new Map<string, { start: number; count: number }>();

  return {
    take(key) {
      const t = now();
      if (windows.size > maxKeys) {
        for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
        // Still too many live keys: drop the oldest so memory stays bounded.
        if (windows.size > maxKeys) windows.delete(windows.keys().next().value as string);
      }
      const current = windows.get(key);
      const w = current && t - current.start < windowMs ? current : { start: t, count: 0 };
      w.count += 1;
      windows.set(key, w);
      const remaining = Math.max(0, limit - w.count);
      return { ok: w.count <= limit, remaining, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
    },
  };
}

/** The client key for a request: the first `x-forwarded-for` hop, else `x-real-ip`, else one shared bucket ("local"). */
export function clientKey(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
