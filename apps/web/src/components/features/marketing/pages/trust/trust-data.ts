import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectBrandScorecards, selectPromise, selectTrustMetrics } from "@/lib/data/selectors";
import type { ArtSeed } from "@/components/brand/art";

export type MetricStatus = "met" | "below";

export interface MeasuredPromise {
  number: number;
  key: string;
  label: string;
  /** The live public figure as a sentence, straight from the ledger-backed metric ("92.3% cleared on or before the ETA"). */
  display: string;
  value: number;
  target: number;
  status: MetricStatus;
}

/** One of the four headline numbers on the Trust Center, with the target it is held to and what happens when it is missed. */
export interface HeadlineMetric {
  id: "decision" | "cleared" | "disputes" | "funded";
  label: string;
  /** Pre-formatted headline figure. */
  figure: string;
  /** The target in words ("95% or better"). */
  target: string;
  status: MetricStatus;
  /** One sentence: what the number means. */
  meaning: string;
  /** One sentence: what happens when we miss it. */
  consequence: string;
}

export interface ScorecardTeaser {
  brandId: string;
  name: string;
  art: ArtSeed;
  reliability: number;
  /** "Excellent", "Good", "Fair", "Poor" or "New brand". */
  label: string;
  newBrand: boolean;
  decidesIn: string | null;
  sample: string;
  verified: boolean;
  trend30d: number;
}

export interface TrustPageData {
  asOf: string;
  measured: readonly MeasuredPromise[];
  headline: readonly HeadlineMetric[];
  scorecards: readonly ScorecardTeaser[];
  scorecardCount: number;
}

/**
 * Targets that the demo world does not carry per metric, from docs/PRODUCT_SPEC.md section 9.2 ("Promise metrics", written as hypotheses).
 * The page labels them as targets, never as guarantees.
 */
const TARGET_DECISION_HOURS = 24;
const TARGET_DISPUTES_48H = 0.9;

const pct = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

/** The Trust Center's live numbers, read once per request on the server from the same ledger-backed selectors `/promise` uses. */
export const getTrustData = cache(async (): Promise<TrustPageData> => {
  const db = await getServerState();
  const promise = selectPromise(db);
  const health = selectTrustMetrics(db);
  const cards = selectBrandScorecards(db, 50);

  const measured: MeasuredPromise[] = promise.metrics
    .filter((metric) => metric.unit === "ratio" && metric.target !== undefined)
    .map((metric) => ({ number: metric.number, key: metric.key, label: metric.label, display: metric.display, value: metric.value, target: metric.target ?? 0, status: metric.value + 1e-9 >= (metric.target ?? 0) ? ("met" as const) : ("below" as const) }));

  const clearedTarget = promise.by_key.cleared_on_eta?.target ?? 0.95;
  const headline: HeadlineMetric[] = [
    {
      id: "decision",
      label: "Median decision time",
      figure: `${health.median_decision_hours.toFixed(1)} h`,
      target: `${TARGET_DECISION_HOURS} h or faster`,
      status: health.median_decision_hours <= TARGET_DECISION_HOURS ? "met" : "below",
      meaning: `Half of all submissions get a decision in under ${health.median_decision_hours.toFixed(1)} hours, and ${pct(health.decided_in_sla_ratio)} are decided inside the 72-hour promise.`,
      consequence: "A video that waits past 72 hours is escalated to Ops and the brand's reliability score takes the hit. A clean video can be approved without them.",
    },
    {
      id: "cleared",
      label: "Cleared on or before the ETA",
      figure: pct(health.cleared_on_eta_ratio),
      target: `${Math.round(clearedTarget * 100)}% or better`,
      status: health.cleared_on_eta_ratio >= clearedTarget ? "met" : "below",
      meaning: "Every earning row carries a dated ETA. This is the share that cleared on or before that date.",
      consequence: "A late row always shows a named reason, such as fraud review or missing tax info, never a bare Pending. We publish the miss and fix the cause.",
    },
    {
      id: "disputes",
      label: "Disputes resolved within 48 hours",
      figure: pct(health.disputes_resolved_48h_ratio),
      target: `${Math.round(TARGET_DISPUTES_48H * 100)}% or better`,
      status: health.disputes_resolved_48h_ratio >= TARGET_DISPUTES_48H ? "met" : "below",
      meaning: "One tap opens a dispute with the ledger evidence attached. This is the share a person decided inside two days.",
      consequence: "A dispute never blocks undisputed money. The disputed amount is held, and an overturned flag is released in the next payout run.",
    },
    {
      id: "funded",
      label: "Live bounties funded at go-live",
      figure: pct(health.funded_live_ratio),
      target: "100%",
      status: health.funded_live_ratio >= 1 ? "met" : "below",
      meaning: "A bounty cannot go live until its whole pool and fee are in escrow. The Funded badge is the proof.",
      consequence: "There is no exception path. If this number is ever below 100%, something broke, and we publish it.",
    },
  ];

  const scorecards: ScorecardTeaser[] = cards
    .filter((card) => !card.new_brand && card.brand.kind !== "platform")
    .slice(0, 5)
    .map((card) => ({
      brandId: card.brand_id,
      name: card.brand.name,
      art: card.brand.logo,
      reliability: card.reliability_score,
      label: card.label,
      newBrand: card.new_brand,
      decidesIn: card.decides_in,
      sample: card.sample,
      verified: card.brand.verification === "verified",
      trend30d: card.trend_30d,
    }));

  return { asOf: health.as_of, measured, headline, scorecards, scorecardCount: cards.filter((card) => card.brand.kind !== "platform").length };
});
