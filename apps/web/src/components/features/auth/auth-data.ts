import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectMedianEarnings, selectTrustMetrics, type MedianEarnings } from "@/lib/data/selectors";
import { valuesOf } from "@/lib/data/select";
import { DEMO_IDS } from "@/lib/constants";
import type { ArtSeed } from "@/components/brand/art";

export interface AuthSnapshot {
  /** Typical (median) creator earnings in 30 days, with the middle half and the top 10% beside it. */
  median: Pick<MedianEarnings, "typical_cents" | "p25_cents" | "p75_cents" | "top_decile_cents" | "period">;
  /** Handles already taken in the demo world, so the creator form can say so before the store does. */
  takenHandles: readonly string[];
  /** Public market-health numbers: the brand side's proof that a decision comes quickly and bounties are funded. */
  trust: { medianDecisionHours: number; fundedLiveRatio: number; firstDollarMedianHours: number };
}

/** What the sign-up pages need from the demo world, read once per request on the server (no skeleton, no client download of the fixtures). */
export const getAuthSnapshot = cache(async (): Promise<AuthSnapshot> => {
  const db = await getServerState();
  const median = selectMedianEarnings(db);
  const trust = selectTrustMetrics(db);
  return {
    median: { typical_cents: median.typical_cents, p25_cents: median.p25_cents, p75_cents: median.p75_cents, top_decile_cents: median.top_decile_cents, period: median.period },
    takenHandles: valuesOf(db.creators).map((creator) => creator.handle.toLowerCase()),
    trust: { medianDecisionHours: trust.median_decision_hours, fundedLiveRatio: trust.funded_live_ratio, firstDollarMedianHours: trust.first_dollar_median_hours },
  };
});

/** The generated avatars of the three demo personas, from the same user rows the product shows, so the picker and the app agree. */
export const getPersonaArt = cache(async (): Promise<Record<"brand" | "creator" | "admin", ArtSeed | null>> => {
  const db = await getServerState();
  return {
    brand: db.users[DEMO_IDS.brand.userId]?.avatar ?? null,
    creator: db.users[DEMO_IDS.creator.userId]?.avatar ?? null,
    admin: db.users[DEMO_IDS.admin.userId]?.avatar ?? null,
  };
});
