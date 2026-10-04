/**
 * Money in integer cents. No floats touch a stored amount: rates are applied in basis points with integer arithmetic,
 * rounding is half-up per ledger leg, and formatting happens only at the edge (`formatMoney`).
 *
 * Conventions (CONVENTIONS section 1): USD only in v1; money fields end in `_cents`; a CPM is cents per 1,000 verified views;
 * ratios are 0..1.
 */

/** Basis points of a rate (0.12 gives 1200). */
export const bps = (rate: number): number => Math.round(rate * 10_000);

/**
 * Rounds half away from zero (identical to half-up for the non-negative amounts the ledger stores, and symmetric for
 * clawbacks, so `roundHalfUp(-x) === -roundHalfUp(x)`).
 */
export function roundHalfUp(x: number): number {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

/**
 * round-half-up(cents x rate) using integer basis-point math, so 12% of $5,000.00 is exactly $600.00 and a half cent always
 * rounds up. `rate` is a ratio (0.12), not a percentage.
 */
export function mulRate(cents: number, rate: number): number {
  const n = cents * bps(rate);
  const sign = n < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(n) * 2 + 10_000) / 20_000);
}

/** round-half-up of an integer ratio num / den (den must be positive). */
export function divRound(num: number, den: number): number {
  if (den <= 0) throw new Error("divRound: denominator must be positive");
  const sign = num < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(num) * 2 + den) / (2 * den));
}

/** Sum of cent amounts. */
export const sumCents = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0);

/**
 * Splits `total` cents across weights with the largest-remainder method: the parts always add up to exactly `total`
 * (no drift), and a zero-weight entry receives zero. Throws when every weight is zero and total is non-zero.
 */
export function splitCents(total: number, weights: readonly number[]): number[] {
  const wsum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (wsum <= 0) {
    if (total === 0) return weights.map(() => 0);
    throw new Error("splitCents: weights sum to zero");
  }
  const exact = weights.map((w) => (total * w) / wsum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((s, v) => s + v, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) out[order[k].i] += 1;
  return out;
}

/** Whole-dollar amount (already rounded, e.g. from a form field) to cents. For strings use `parseMoney`. */
export const dollarsToCents = (dollars: number): number => Math.round((dollars + Number.EPSILON) * 100);

/**
 * Parses "$1,234.56", "1234.5", "-$12", "(12.00)" into cents. Returns null when the text is not a clean amount
 * (letters, more than two decimals, empty). Never throws.
 */
export function parseMoney(input: string): number | null {
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (s.startsWith("$")) s = s.slice(1).trim();
  if (s.startsWith("-")) return null;
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const clean = s.replace(/,/g, "");
  const [whole = "0", frac = ""] = clean.split(".");
  const cents = Number(whole === "" ? "0" : whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

// ── formatting (edge only) ─────────────────────────────────────────────────────────────────────

/** Thousands separators for a non-negative integer string. */
function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 12345 gives "12,345". Rounds to a whole number. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = roundHalfUp(n);
  return `${r < 0 ? "-" : ""}${group(String(Math.abs(r)))}`;
}

export interface FormatMoneyOptions {
  /**
   * "always" (default): $250.00. "auto": $250 when the amount is a whole number of dollars, else $250.40. "never": whole
   * dollars, rounded half-up.
   */
  cents?: "always" | "auto" | "never";
  /** "always" prefixes "+" on positive amounts (deltas); default "auto" shows only a minus on negatives. */
  sign?: "auto" | "always";
  /** Compact form for dashboards: $1.2K, $3.4M. Ignores `cents`. */
  compact?: boolean;
}

/**
 * "$1,234.56". Money is formatted only here, at the edge. Negative amounts are "-$12.30". Non-finite input gives "—".
 *
 * ```ts
 * formatMoney(123456)                       // "$1,234.56"
 * formatMoney(25000, { cents: "auto" })     // "$250"
 * formatMoney(1500000, { compact: true })   // "$15K"
 * formatMoney(120, { sign: "always" })      // "+$1.20"
 * ```
 */
export function formatMoney(cents: number, options: FormatMoneyOptions = {}): string {
  if (!Number.isFinite(cents)) return "—";
  const { cents: mode = "always", sign = "auto", compact = false } = options;
  const total = roundHalfUp(cents);
  const negative = total < 0;
  const abs = Math.abs(total);
  const prefix = negative ? "-" : sign === "always" && abs > 0 ? "+" : "";
  if (compact) return `${prefix}$${formatCompact(abs / 100)}`;
  if (mode === "never") {
    const dollars = Math.floor((abs + 50) / 100);
    return `${prefix}$${group(String(dollars))}`;
  }
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  if (mode === "auto" && rem === 0) return `${prefix}$${group(String(dollars))}`;
  return `${prefix}$${group(String(dollars))}.${String(rem).padStart(2, "0")}`;
}

/** Styles for `formatCpm`. */
export type CpmStyle = "long" | "short" | "bare";

/**
 * A CPM (cents per 1,000 verified views). Default is the house wording "$2.10 per 1,000 views"; "short" gives "$2.10 CPM";
 * "bare" gives "$2.10".
 */
export function formatCpm(cpmCents: number, style: CpmStyle = "long"): string {
  const money = formatMoney(cpmCents);
  if (style === "bare") return money;
  if (style === "short") return `${money} CPM`;
  return `${money} per 1,000 views`;
}

/**
 * Compact counts: 999, 1K, 1.2K, 14.2K, 142K, 1.5M, 2.1B. One decimal below 100 of a unit; trailing ".0" is dropped; a value that
 * rounds up to the next unit carries (999,500 gives "1M").
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const negative = n < 0;
  const abs = Math.abs(n);
  const units = ["", "K", "M", "B", "T"];
  if (abs < 1000) {
    const r = roundHalfUp(abs);
    if (r < 1000) return `${negative ? "-" : ""}${r}`;
  }
  let idx = 0;
  let scaled = abs;
  while (scaled >= 1000 && idx < units.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  for (;;) {
    const rounded = scaled < 100 ? roundHalfUp(scaled * 10) / 10 : roundHalfUp(scaled);
    if (rounded >= 1000 && idx < units.length - 1) {
      scaled = rounded / 1000;
      idx += 1;
      continue;
    }
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${negative ? "-" : ""}${text}${units[idx]}`;
  }
}

/**
 * A ratio as a percentage: 0.12 gives "12%", 0.015 gives "1.5%". `digits` fixes the decimals; the default trims to what is
 * needed (up to two).
 */
export function formatPercent(ratio: number, digits?: number): string {
  if (!Number.isFinite(ratio)) return "0%";
  const pct = ratio * 100;
  if (digits !== undefined) return `${pct.toFixed(digits)}%`;
  const rounded = Math.round(pct * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : String(rounded)}%`;
}

/** "1.6x" style multiple. */
export function formatMultiple(x: number, digits = 1): string {
  return `${Number(x.toFixed(digits))}x`;
}

/** Signed change in cents: "+$1.20" / "-$0.40" / "$0.00". */
export const formatDeltaMoney = (cents: number): string => formatMoney(cents, { sign: "always" });

/** "12 min" / "2.5 h" / "3 days" style hours label for fill times and SLAs. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "n/a";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 36) {
    const h = Math.round(hours * 10) / 10;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
