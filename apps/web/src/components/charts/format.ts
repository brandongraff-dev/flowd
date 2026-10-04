/**
 * Chart formatting helpers. Pure and server-safe. Money always arrives as integer cents and is formatted here (and only
 * here) at the edge, via the design system's `formatMoneyText`.
 */

import { formatMoneyText } from "@/components/ui/money-format";

/** A value on a chart's x axis: a number, a date, or a category label. */
export type XValue = number | Date | string;

const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const wholeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** 12.9K, 4.2M. For axis ticks and dense labels, never for a balance a person acts on. */
export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

/** 1,284 (thousands separators, no decimals). */
export function formatWhole(value: number): string {
  return wholeFormat.format(Math.round(value));
}

/** 1,284.5 (up to two decimals). */
export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** 0.184 -> "18.4%". Ratios are 0..1 everywhere in the data model (CONVENTIONS section 6). */
export function formatRatio(value: number, digits = 1): string {
  const text = (value * 100).toFixed(digits);
  return `${digits > 0 ? text.replace(/\.?0+$/, "") : text}%`;
}

/** Integer cents -> "$1,284.60" (or "$12.5K" with `compact`). */
export function formatCents(cents: number, compact = false): string {
  return formatMoneyText(cents, { compact, decimals: compact ? "auto" : "always" });
}

/** Cents -> "$2.40" CPM style (always two decimals, no compact). */
export function formatCpm(cents: number): string {
  return formatMoneyText(cents, { decimals: "always" });
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "Oct 3". Charts format dates in UTC, like the rest of the data model. */
export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}

/** "Fri, Oct 3, 2026". */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/** "Oct". */
export function formatMonth(date: Date): string {
  return monthOnly.format(date);
}

/** Default axis-tick label for any x value. */
export function formatX(value: XValue): string {
  if (value instanceof Date) return formatShortDate(value);
  if (typeof value === "number") return formatCompact(value);
  return value;
}

/** Default tooltip title for any x value (dates get the long form). */
export function formatXLong(value: XValue): string {
  if (value instanceof Date) return formatLongDate(value);
  if (typeof value === "number") return formatDecimal(value);
  return value;
}

/** Numeric key of an x value (dates become epoch ms) so equal x values compare equal across series. */
export function xKey(value: XValue): number | string {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * Rough rendered width of a string at the chart text size (12px, tabular figures). Used to size axis gutters and to decide
 * whether a label fits inside a mark BEFORE drawing it (a label that does not fit is moved or dropped, never clipped).
 */
export function textWidth(text: string, size = 12): number {
  return Math.ceil(text.length * size * 0.6);
}

/** How many ticks fit in `extent` px at roughly `gap` px apart (at least `min`). */
export function tickCountFor(extent: number, gap: number, min = 2): number {
  return Math.max(min, Math.floor(extent / gap));
}

/** Deterministic id-safe slug for SVG ids and keys. */
export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Linear-interpolated quantile of a sorted numeric array (p in 0..1). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (index - lower);
}
