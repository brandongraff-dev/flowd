/**
 * Chart colour system (BRAND.md 6.9, dataviz skill). Every colour is a CSS variable from the generated tokens, so light and
 * dark are separate validated steps (not an automatic flip) and no hex ever lives in a component.
 *
 * Rules the helpers enforce:
 *  - Categorical hues are assigned in FIXED order, by the entity's position in the full series list (never by rank in the
 *    visible subset), so filtering a series never repaints the survivors.
 *  - Slot 9+ is never a generated hue: it folds into the de-emphasis grey ("Other").
 *  - Scatter, bubble, map and small-multiple forms (any two marks can touch) use only the first three slots.
 *  - Status colours are reserved for state and ship with an icon and a label.
 *  - Text never wears a series colour: labels use `fg*`, and a coloured mark beside them carries identity.
 */

export const SERIES_COLORS = [
  "var(--fd-chart-1)",
  "var(--fd-chart-2)",
  "var(--fd-chart-3)",
  "var(--fd-chart-4)",
  "var(--fd-chart-5)",
  "var(--fd-chart-6)",
  "var(--fd-chart-7)",
  "var(--fd-chart-8)",
] as const;

/** Hard ceiling of distinct categorical hues. Past it, fold the tail into "Other", facet, or use composite encoding. */
export const MAX_SERIES = SERIES_COLORS.length;

/** Slots that stay colour-blind-safe when ANY two marks can touch (scatter, bubble, small multiples). */
export const ALL_PAIRS_SERIES = 3;

/** The de-emphasis grey: "Other", context series, gridded context, de-emphasised bars. */
export const OTHER_COLOR = "var(--fd-fg-subtle)";

/** Colour for the series at `index` of the full (unfiltered) list. Beyond the eighth it is the "Other" grey. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? OTHER_COLOR;
}

/** Sequential ramp, one hue (azure): index 0 = lowest magnitude, 6 = highest. Dark theme runs dark to light, light runs light to dark. */
export const SEQUENTIAL_COLORS = [
  "var(--fd-chart-seq-1)",
  "var(--fd-chart-seq-2)",
  "var(--fd-chart-seq-3)",
  "var(--fd-chart-seq-4)",
  "var(--fd-chart-seq-5)",
  "var(--fd-chart-seq-6)",
  "var(--fd-chart-seq-7)",
] as const;

/** Ordinal ramp for ordered categories (funnel stages, tiers, age bands). Index 0 = first stage. */
export const ORDINAL_COLORS = [
  "var(--fd-chart-ord-1)",
  "var(--fd-chart-ord-2)",
  "var(--fd-chart-ord-3)",
  "var(--fd-chart-ord-4)",
  "var(--fd-chart-ord-5)",
] as const;

/** Diverging ramp: azure (below) through a neutral midpoint to ember (above). */
export const DIVERGING_COLORS = [
  "var(--fd-chart-div-1)",
  "var(--fd-chart-div-2)",
  "var(--fd-chart-div-3)",
  "var(--fd-chart-div-4)",
  "var(--fd-chart-div-5)",
  "var(--fd-chart-div-6)",
  "var(--fd-chart-div-7)",
] as const;

/** Reserved state colours. Always pair with an icon and a label. */
export const STATUS_COLORS = {
  good: "var(--fd-chart-good)",
  warning: "var(--fd-chart-warning)",
  serious: "var(--fd-chart-serious)",
  critical: "var(--fd-chart-critical)",
} as const;

/** Chart furniture: recessive hairlines, one step off the surface. */
export const FURNITURE = {
  surface: "var(--fd-chart-surface)",
  grid: "var(--fd-chart-grid)",
  axis: "var(--fd-chart-axis)",
  /** Tick and axis-title text. AA-checked text token (never a series colour). */
  tick: "var(--fd-fg-subtle)",
  label: "var(--fd-fg-muted)",
  value: "var(--fd-fg)",
} as const;

/** Map a 0..1 position to one of `bins` sequential steps (1-7). Past ~7 bins adjacent classes blur, so the count is capped. */
export function sequentialBin(t: number, bins: number = SEQUENTIAL_COLORS.length): number {
  const count = Math.min(Math.max(Math.round(bins), 2), SEQUENTIAL_COLORS.length);
  const clamped = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
  return Math.min(count - 1, Math.floor(clamped * count));
}

/** Ramp step (0-6) of a position, spread across the 7-step ramp when fewer bins are requested (so 5 bins use steps 0, 2, 3, 4, 6). */
export function sequentialStep(t: number, bins: number = SEQUENTIAL_COLORS.length): number {
  const count = Math.min(Math.max(Math.round(bins), 2), SEQUENTIAL_COLORS.length);
  return Math.round((sequentialBin(t, count) * (SEQUENTIAL_COLORS.length - 1)) / (count - 1));
}

/** CSS colour of a position on the sequential ramp, quantised to `bins` steps. */
export function sequentialColor(t: number, bins: number = SEQUENTIAL_COLORS.length): string {
  return SEQUENTIAL_COLORS[sequentialStep(t, bins)] ?? SEQUENTIAL_COLORS[0];
}

/**
 * Tailwind fill class for a label drawn ON a sequential cell, by ramp step (0 = lowest, 6 = highest). The ramp runs dark to
 * light in the dark theme and light to dark in the light theme, so the label flips with it; `fg` and `fg-inverse` are the two
 * text tokens that always oppose the surface. Each pair clears 4.5:1 (checked against the ramp stops in BRAND.md 6.9).
 */
export function sequentialLabelClass(step: number): string {
  if (step <= 2) return "fill-fg";
  if (step === 3) return "fill-fg-inverse light:fill-fg";
  return "fill-fg-inverse";
}

export type MarkerShape = "circle" | "square" | "triangle" | "diamond";

/** Redundant shape channel for colour-blind readers (line charts with 3+ series, scatter groups). */
export const MARKER_SHAPES: readonly MarkerShape[] = ["circle", "square", "triangle", "diamond"];

export function markerShape(index: number): MarkerShape {
  return MARKER_SHAPES[index % MARKER_SHAPES.length] ?? "circle";
}
