import type { LeaderboardMetric } from "@/lib/contract/types";
import { formatDecimal, formatMoney, formatPct } from "@/lib/format";

/** The ranked value as words, per metric. Earnings are integer cents; conversion rate is already a percent; score accuracy is a 0 to 1 ratio. */
export function formatBoardValue(metric: LeaderboardMetric, value: number): string {
  if (metric === "earnings") return formatMoney(value);
  if (metric === "conversion_rate") return `${formatDecimal(value, 2)}%`;
  return formatPct(value, 0);
}

export const METRIC_BLURB: Record<LeaderboardMetric, { column: string; what: string }> = {
  earnings: { column: "Cleared this week", what: "Cleared earnings this ISO week. Pending money does not count until it clears." },
  conversion_rate: { column: "Trial rate", what: "Share of installs from your posts that started a trial, on tracked links and codes only." },
  score_accuracy: { column: "Score accuracy", what: "How often your checklist band matched the result once the post settled. It rewards honest self-review, not luck." },
};

/** What a rank change means in words, for the chip and for screen readers. Moving down is stated plainly and never styled as a penalty. */
export function describeRankChange(delta: number): string {
  if (delta > 0) return `Up ${delta} ${delta === 1 ? "place" : "places"} since last week`;
  if (delta < 0) return `Down ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "place" : "places"} since last week`;
  return "No change since last week";
}
