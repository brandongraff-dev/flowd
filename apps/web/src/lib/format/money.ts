/**
 * Money and number formatting at the edge (CONVENTIONS section 1: data is integer cents, USD, formatted only here).
 *
 * The core formatters live in the engine so web, the mock API and the tests agree to the cent. They are re-exported here under the
 * names UI code imports, with the range, signed and per-unit helpers the pages need on top. Pure and server-safe.
 */

import {
  formatCompact,
  formatCpm,
  formatDeltaMoney,
  formatHours,
  formatInt,
  formatMoney,
  formatMultiple,
  formatPercent,
  type CpmStyle,
  type FormatMoneyOptions,
} from "@/lib/engine/money";

export { formatCompact, formatCpm, formatDeltaMoney, formatHours, formatInt, formatMoney, formatMultiple };
export type { CpmStyle, FormatMoneyOptions };

/**
 * A ratio as a percentage: 0.12 gives "12%", 0.015 gives "1.5%". `digits` fixes the decimals; the default trims to what is needed
 * (up to two). Alias of the engine's `formatPercent`, named for the UI.
 */
export const formatPct = formatPercent;

/** "+12%" / "-4.5%" / "0%". The sign is always shown, so a delta never reads as a level. `digits` as in `formatPct`. */
export function formatSignedPct(ratio: number, digits?: number): string {
  if (!Number.isFinite(ratio)) return "0%";
  const body = formatPercent(Math.abs(ratio), digits);
  if (body === "0%" || /^0(\.0+)?%$/.test(body)) return body;
  return `${ratio < 0 ? "-" : "+"}${body}`;
}

/** Percentage points between two ratios: 0.62 vs 0.55 gives "+7 pts". */
export function formatPoints(ratioNow: number, ratioBefore: number): string {
  const diff = Math.round((ratioNow - ratioBefore) * 100);
  if (diff === 0) return "0 pts";
  return `${diff > 0 ? "+" : "-"}${Math.abs(diff)} pts`;
}

export interface MoneyRangeOptions extends FormatMoneyOptions {
  /** "to" (default, house style: "$80 to $115") or "dash" ("$80–$115", for tight spaces and charts). */
  joiner?: "to" | "dash";
}

/**
 * A low to high band in cents: "$80 to $115". `cents` defaults to "auto" (whole dollars drop the cents). Reversed bounds are
 * swapped; equal bounds collapse to one figure. Used for p25 to p75 earnings and CPM bands, always beside the median.
 */
export function formatMoneyRange(lowCents: number, highCents: number, options: MoneyRangeOptions = {}): string {
  const { joiner = "to", ...money } = options;
  const [lo, hi] = lowCents <= highCents ? [lowCents, highCents] : [highCents, lowCents];
  const opts: FormatMoneyOptions = { cents: "auto", ...money };
  const a = formatMoney(lo, opts);
  const b = formatMoney(hi, opts);
  if (a === b) return a;
  return joiner === "dash" ? `${a}–${b}` : `${a} to ${b}`;
}

/** A CPM band: "$1.90 to $3.10 per 1,000 views". */
export function formatCpmRange(lowCents: number, highCents: number, style: CpmStyle = "long"): string {
  const [lo, hi] = lowCents <= highCents ? [lowCents, highCents] : [highCents, lowCents];
  const a = formatMoney(lo);
  const b = formatMoney(hi);
  const range = a === b ? a : `${a} to ${b}`;
  if (style === "bare") return range;
  return style === "short" ? `${range} CPM` : `${range} per 1,000 views`;
}

/** A cost per unit: "$3.40 per trial". `null` (nothing to divide by yet) reads "not enough data", never "$0". */
export function formatCostPer(cents: number | null | undefined, unit: string): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "not enough data";
  return `${formatMoney(cents)} per ${unit}`;
}

/** A payout fee line shown before confirm: "$2.40 fee (1.5%)". */
export function formatFee(feeCents: number, rate?: number): string {
  if (feeCents <= 0) return "No fee";
  return rate === undefined ? `${formatMoney(feeCents)} fee` : `${formatMoney(feeCents)} fee (${formatPercent(rate)})`;
}

/**
 * Money split for hero figures that style the cents smaller: `{ sign, dollars: "1,284", cents: "60" }`. Always two cent digits.
 * For the rendered component see `components/ui/money.tsx`; this is the same split for places that cannot use it (canvas, OG art).
 */
export function splitMoney(cents: number): { sign: "-" | ""; dollars: string; cents: string } {
  const text = formatMoney(cents);
  const negative = text.startsWith("-");
  const body = negative ? text.slice(2) : text.slice(1);
  const [dollars = "0", fraction = "00"] = body.split(".");
  return { sign: negative ? "-" : "", dollars, cents: fraction };
}

/** A view or install count that is too small to be a rate: "12 views" reads as a count, not "0.1K". */
export function formatViews(views: number): string {
  return `${formatCompact(views)} ${Math.round(views) === 1 ? "view" : "views"}`;
}

/** Decimal with grouping: 1234.567 with 1 digit gives "1,234.6". */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = Math.abs(value).toFixed(digits);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  return value < 0 && Number(fixed) !== 0 ? `-${body}` : body;
}
