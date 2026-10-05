/**
 * Dollar text typed by a person to integer cents, once, at the edge ("$1,250.5" gives 125050). Money is integer cents everywhere else
 * (CONVENTIONS section 1), so this is the only place a decimal is read. Returns null when the text is not an amount.
 */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[\s,$]/g, "");
  if (cleaned === "" || !/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === ".") return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Cents back to the text a field shows: 125000 gives "1250", 125050 gives "1250.50". */
export function dollarsText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
