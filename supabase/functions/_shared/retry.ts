// Outbound webhook retry policy (pure; tests/retry.test.ts).
// Attempt 1 is the first try; after a failed attempt N the next one is RETRY_DELAYS_SECONDS[N-1] later: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h.
// After the sixth retry fails the delivery is `failed`. An endpoint with FAILING_AFTER consecutive failures is marked `failing`.

export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21600, 86400] as const;
export const FAILING_AFTER = 20;

export function nextRetryDelaySeconds(attemptsMade: number): number | null {
  return RETRY_DELAYS_SECONDS[attemptsMade - 1] ?? null;
}
