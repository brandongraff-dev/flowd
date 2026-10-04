// A small bounded-concurrency map: run `fn` over `items` with at most `limit` in flight, keep the results in input order, and never let one
// failure stop the batch (each result is { ok: true, value } or { ok: false, error }). Edge functions have a wall-clock limit and providers have
// rate limits, so work is always done in bounded parallel batches, never Promise.all over thousands of rows.

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function mapLimit<I, O>(items: readonly I[], limit: number, fn: (item: I, index: number) => Promise<O>): Promise<Array<Settled<O>>> {
  const results = new Array<Settled<O>>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i] as I, i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** Split a list into chunks (database `in (...)` filters and batch inserts stay under URL and payload limits). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
