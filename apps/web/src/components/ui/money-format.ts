/**
 * Money formatting at the edge (CONVENTIONS section 1): data is integer cents, USD for v1, formatted here and nowhere else
 * in the design system. Pure and server-safe (no "use client"), so server components and metadata can use it too.
 */

export type MoneyDecimals = "always" | "auto" | "never";
export type MoneySign = "auto" | "always" | "never";

export interface MoneyFormatOptions {
  /** `always` (default): $62.40 and $5,000.00. `auto`: whole-dollar amounts drop the cents ($5,000, $62.40). `never`: rounds to dollars. */
  decimals?: MoneyDecimals;
  /** `auto` (default): a minus sign for negatives only. `always`: also a plus for positives (bonuses, deltas, earnings rows). `never`: no sign. */
  sign?: MoneySign;
  /** Short form for dense places and charts: $1.2K, $48M. Never used for balances a person acts on. */
  compact?: boolean;
}

export interface MoneyParts {
  /** "+" , "−" (U+2212, the typographic minus) or "". */
  sign: "+" | "−" | "";
  symbol: "$";
  /** Integer part with group separators ("1,284"), or the whole compact figure ("12.5K"). */
  whole: string;
  /** Digits after the point, without the point ("60"), or "". */
  fraction: string;
}

const groupFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Split integer cents into the pieces `Money` lays out. Non-finite input renders as $0.00 rather than "NaN". */
export function moneyParts(cents: number, options: MoneyFormatOptions = {}): MoneyParts {
  const { decimals = "always", sign = "auto", compact = false } = options;
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const symbol = "$" as const;
  const mark: MoneyParts["sign"] = sign === "never" ? "" : negative ? "−" : sign === "always" && safe !== 0 ? "+" : "";

  if (compact) {
    return { sign: mark, symbol, whole: compactFormat.format(absolute / 100), fraction: "" };
  }

  const keepCents = decimals === "always" || (decimals === "auto" && absolute % 100 !== 0);
  if (!keepCents) {
    return { sign: mark, symbol, whole: groupFormat.format(Math.round(absolute / 100)), fraction: "" };
  }
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return { sign: mark, symbol, whole: groupFormat.format(dollars), fraction: String(remainder).padStart(2, "0") };
}

/** "$1,284.60", "−$12.00", "+$1.50". Plain text for aria labels, toasts, titles and CSV. */
export function formatMoneyText(cents: number, options: MoneyFormatOptions = {}): string {
  const parts = moneyParts(cents, options);
  return `${parts.sign}${parts.symbol}${parts.whole}${parts.fraction ? `.${parts.fraction}` : ""}`;
}
