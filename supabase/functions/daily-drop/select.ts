// Which bounties go into today's Daily Drop? Pure (tests/daily-drop.test.ts).
//
// DECISIONS section 3: one drop per day at 16:00 UTC with REAL inventory (spots left are true counts, never fake scarcity). So:
//   * a bounty qualifies only if its pool really has room: spots_left (floor(remaining / reservation unit)) is at least the minimum per item (8)
//   * an item never offers more spots than the pool has, capped at 40
//   * quality first: brands with a good Scorecard and bounties that were not in a recent drop rank higher; at most 2 items per app category so
//     the drop is a menu, not a wall of one thing; "new" brands (not enough decisions for a Scorecard) rank as neutral, not as bad
// If fewer than the minimum qualify, the drop is simply smaller; with none, there is no drop that day and the app says so.

export interface DropCandidate {
  bountyId: string;
  brandId: string;
  category: string;
  /** Brand Scorecard 0..100, or null for a "new" brand. */
  brandScore: number | null;
  /** The brand-side all-in price: lower is better for the pool, higher pay is better for creators (we rank by creator pay: cpm_cents). */
  cpmCents: number;
  spotsLeft: number;
  publishedAt: string;
  /** Days since this bounty last appeared in a drop; null if never. */
  daysSinceLastDrop: number | null;
}

export interface DropConfig {
  itemsPerDrop: number;
  minSpotsPerItem: number;
  maxSpotsPerItem: number;
  maxPerCategory: number;
}

export const DEFAULT_CONFIG: DropConfig = { itemsPerDrop: 6, minSpotsPerItem: 8, maxSpotsPerItem: 40, maxPerCategory: 2 };

export interface DropItemDraft {
  bountyId: string;
  spotsTotal: number;
  position: number;
}

/** 0..1. Higher is better. */
export function rank(c: DropCandidate, now: Date, medianCpm: number): number {
  const brand = c.brandScore === null ? 0.6 : Math.max(0, Math.min(1, c.brandScore / 100));
  const ageDays = (now.getTime() - Date.parse(c.publishedAt)) / 86_400_000;
  const fresh = Math.max(0, 1 - ageDays / 21); // new bounties first, fading over three weeks
  const pay = medianCpm > 0 ? Math.max(0, Math.min(1.5, c.cpmCents / medianCpm)) / 1.5 : 0.5;
  const rotation = c.daysSinceLastDrop === null ? 1 : Math.min(1, c.daysSinceLastDrop / 7); // not repeated within a week
  return 0.35 * brand + 0.25 * fresh + 0.25 * pay + 0.15 * rotation;
}

export function pickItems(candidates: readonly DropCandidate[], now: Date, config: DropConfig = DEFAULT_CONFIG): DropItemDraft[] {
  const eligible = candidates.filter((c) => c.spotsLeft >= config.minSpotsPerItem);
  const sorted = [...eligible].map((c) => c.cpmCents).sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)] ?? 0;
  const ranked = eligible
    .map((c) => ({ c, score: rank(c, now, median) }))
    .sort((a, b) => b.score - a.score || Date.parse(b.c.publishedAt) - Date.parse(a.c.publishedAt) || a.c.bountyId.localeCompare(b.c.bountyId));
  const perCategory = new Map<string, number>();
  const items: DropItemDraft[] = [];
  for (const { c } of ranked) {
    if (items.length >= config.itemsPerDrop) break;
    const used = perCategory.get(c.category) ?? 0;
    if (used >= config.maxPerCategory) continue;
    perCategory.set(c.category, used + 1);
    items.push({ bountyId: c.bountyId, spotsTotal: Math.min(config.maxSpotsPerItem, c.spotsLeft), position: items.length + 1 });
  }
  return items;
}

/** After claims, the most an item can still offer: what is claimed plus what the pool still has room for. Never more than it started with. */
export function syncedSpotsTotal(spotsTotal: number, claims: number, poolSpotsLeft: number): number {
  return Math.max(claims, Math.min(spotsTotal, claims + poolSpotsLeft));
}

export function headline(items: readonly DropItemDraft[]): string {
  const spots = items.reduce((a, i) => a + i.spotsTotal, 0);
  const noun = items.length === 1 ? 'bounty' : 'bounties';
  return `${items.length} ${noun}, ${spots} real spots. Claim one and you have 24 hours to submit.`;
}

/** Same arithmetic as public.reservation_unit / public.spots_left (integer basis points, half up). */
export function spotsLeft(remainingCents: number, capCents: number, takeRate: number): number {
  const bps = Math.round(takeRate * 10000);
  const unit = capCents + Math.floor((capCents * bps + 5000) / 10000);
  return unit > 0 ? Math.floor(remainingCents / unit) : 0;
}
