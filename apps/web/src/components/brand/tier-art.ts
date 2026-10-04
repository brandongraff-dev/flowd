/**
 * Tier medallion art (BRAND.md section 14, mirrored from tokens.json `tiers`). The gradient STOPS live here because an SVG
 * `linearGradient` cannot read the CSS gradient tokens (`--fd-tier-gold`); ink, glow and rim colours are read from the CSS
 * variables (`--fd-tier-gold-ink`, `-glow`, `-rim`) so they stay in one place. Keep these in step with tokens.json.
 */

export type TierName = "bronze" | "silver" | "gold" | "platinum" | "elite";

export const TIER_ORDER: readonly TierName[] = ["bronze", "silver", "gold", "platinum", "elite"];

export const TIER_LABEL: Record<TierName, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  elite: "Elite",
};

/** One to four chevrons: rank reads without colour. */
export const TIER_CHEVRONS: Record<TierName, 1 | 2 | 3 | 4> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  elite: 4,
};

/** Gradient stops, 135 degrees, offset 0 to 1. */
export const TIER_STOPS: Record<TierName, ReadonlyArray<readonly [number, string]>> = {
  bronze: [
    [0, "#F2B98A"],
    [0.55, "#C9803F"],
    [1, "#9A5E2C"],
  ],
  silver: [
    [0, "#F4F7FC"],
    [0.55, "#C3CBDA"],
    [1, "#8893AA"],
  ],
  gold: [
    [0, "#FFEBA3"],
    [0.52, "#F6C23A"],
    [1, "#C58A00"],
  ],
  platinum: [
    [0, "#F6FCFF"],
    [0.38, "#BDD8F6"],
    [0.7, "#C2B2F8"],
    [1, "#9FEAF5"],
  ],
  elite: [
    [0, "#FFF1B8"],
    [0.34, "#FFB347"],
    [0.68, "#FF5C8A"],
    [1, "#8B5CFF"],
  ],
};

/** CSS variable names for a tier's ink, glow and rim colours, and its CSS gradient. */
export function tierVars(tier: TierName): { ink: string; glow: string; rim: string; gradient: string } {
  return {
    ink: `var(--fd-tier-${tier}-ink)`,
    glow: `var(--fd-tier-${tier}-glow)`,
    rim: `var(--fd-tier-${tier}-rim)`,
    gradient: `var(--fd-tier-${tier})`,
  };
}
