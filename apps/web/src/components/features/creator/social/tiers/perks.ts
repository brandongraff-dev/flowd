import type { Tier, TierPerks } from "@/lib/contract/types";
import { tierPerks } from "@/lib/engine";

export interface PerkRow {
  id: string;
  label: string;
  /** What the perk means in one line. */
  hint: string;
  /** The cell text for a tier, or null when the tier does not have it. */
  value: (perks: TierPerks) => string | null;
}

/** The perk matrix of docs/ROUTES.md `/creator/tiers`: head start, rate card, instant cash-out, crews, auctions, featured profile. */
export const PERK_ROWS: readonly PerkRow[] = [
  {
    id: "head_start",
    label: "Head start on new bounties",
    hint: "You see new bounties this many hours before the tier below you.",
    value: (p) => (p.early_access_hours > 0 ? `${p.early_access_hours} h` : null),
  },
  { id: "rate_card", label: "Your own rate card", hint: "Brands can buy a video from you at your price.", value: (p) => (p.rate_card ? "Included" : null) },
  {
    id: "instant",
    label: "Free instant cash-out",
    hint: "The Friday payout is always free. Instant cash-out normally costs 1.5%.",
    value: (p) => (p.instant_cashout_unlimited ? "Unlimited" : p.instant_cashout_free_per_week > 0 ? `${p.instant_cashout_free_per_week} a week` : null),
  },
  { id: "crews", label: "Lead a crew", hint: "Anyone can join a crew. Leading one opens at Gold.", value: (p) => (p.crews_lead ? "Included" : null) },
  { id: "auctions", label: "Sealed-bid auctions", hint: "Sell a few slots a week to the highest bidder.", value: (p) => (p.auctions ? "Included" : null) },
  { id: "featured", label: "Featured profile", hint: "Shown first in the creator directory brands search.", value: (p) => (p.featured_profile ? "Included" : null) },
];

export const perksOf = (tier: Tier): TierPerks => tierPerks(tier);
