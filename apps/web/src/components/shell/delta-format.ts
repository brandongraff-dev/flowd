/** "+12.4%" with a typographic minus. Flat (within 0.05%) reads "0%". */
export function formatDelta(ratio: number, digits = 1): string {
  const pct = ratio * 100;
  if (Math.abs(pct) < 0.05) return "0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(digits).replace(/\.0+$/, "")}%`;
}
