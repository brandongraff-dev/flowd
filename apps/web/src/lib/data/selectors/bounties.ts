/**
 * Bounties: the rows with their app, brand, scorecard and the numbers a card shows (spots left, fill, budget left, "decides in about 11 h").
 */

import type { App, Bounty, BountyStatus, BountyType, BrandMember, BrandScorecard, Category, Visibility, Brand } from "@/lib/contract/types";
import { BOUNTY_TYPE_META } from "@/lib/contract/types";
import { cardProcessing, decidesInAbout, hoursBetween, toMs } from "@/lib/engine";
import { buildBountyDraft, type BountyDraft, type BountyDraftInput } from "@/lib/store/core/bounty-draft";
import { heldForBidsIn } from "@/lib/store/core/billing";
import { spotsOf, unitOf } from "@/lib/store/core/escrow";
import { asList, asc, defineSelector, desc, groupBy, joinView, matchesQuery, valuesOf, viewCache, type Db } from "../select";

export interface BountyView extends Bounty {
  app: App;
  brand: Brand;
  /** The brand's Scorecard (pay speed, decision time, fairness); absent for flowd itself. */
  scorecard?: BrandScorecard;
  /** The one named owner of the review queue. */
  owner?: { member: BrandMember; name: string };
  /** The true number of videos the pool can still take (a Reserved Slot is one per-video cap plus its fee). */
  spots_left: number;
  /** Cents one Reserved Slot takes from the pool. */
  unit_cents: number;
  /** Share of the pool spent or reserved, 0 to 1. */
  fill_ratio: number;
  /** The pool still free for new videos (`remaining_cents`). */
  budget_left_cents: number;
  /** Funded, live and not past its end date: creators can submit now. */
  is_open: boolean;
  /** Hours until the end date (0 once past). */
  hours_left: number;
  /** "Decides in about 11 h" from the brand's Scorecard; null for a brand with too little history. */
  decides_in: string | null;
  /** Funded by flowd itself (starter and "content about us" bounties). */
  platform_funded: boolean;
  /** "CPM", "CPA", "Stacked", "Direct", "Install-only". */
  type_label: string;
}

export type BountyDb = Db<"bounties" | "apps" | "brands" | "brand_scorecards" | "brand_members" | "users" | "clock">;
type ViewDb = Pick<BountyDb, "apps" | "brands" | "brand_scorecards" | "brand_members" | "users" | "clock">;

const cache = viewCache<Bounty, BountyView>();

/** One bounty as a view. The same object comes back while the row, its app, brand, scorecard and owner are unchanged. */
export function bountyView(db: ViewDb, b: Bounty): BountyView {
  const app = db.apps[b.app_id];
  const brand = db.brands[b.brand_id];
  const scorecard = groupBy(db.brand_scorecards, "brand", (s) => s.brand_id).get(b.brand_id)[0];
  const member = b.owner_member_id ? db.brand_members[b.owner_member_id] : undefined;
  const user = member ? db.users[member.user_id] : undefined;
  const now = db.clock.now;
  return joinView(cache, b, [app, brand, scorecard, member, user, now], () => {
    const unit = unitOf(b);
    const pool = b.escrow_funded_cents;
    return {
      ...b,
      app,
      brand,
      ...(scorecard ? { scorecard } : {}),
      ...(member ? { owner: { member, name: user?.display_name ?? "Review owner" } } : {}),
      spots_left: spotsOf(b),
      unit_cents: unit,
      fill_ratio: pool > 0 ? Math.min(1, Math.max(0, (b.spent_cents + b.reserved_cents) / pool)) : 0,
      budget_left_cents: b.remaining_cents,
      is_open: b.funded && b.status === "live" && toMs(b.ends_at) > toMs(now),
      hours_left: Math.max(0, hoursBetween(now, b.ends_at)),
      decides_in: scorecard ? decidesInAbout(scorecard) : null,
      platform_funded: b.funding_source === "platform",
      type_label: BOUNTY_TYPE_META[b.type].label,
    };
  });
}

/** The brand (workspace) a "mine" filter means. */
export const mineBrandId = (db: Db<"session">): string | null => db.session.brand_id;

export interface BountyFilter {
  /** One status, several, or a group: "open" = funded and live now, "active" = scheduled, live, paused or full, "closed" = ended, settled or cancelled. */
  status?: BountyStatus | readonly BountyStatus[] | "open" | "active" | "closed";
  /** An app id. */
  app?: string;
  /** A brand id, or "mine" for the signed-in brand workspace. */
  brand?: string;
  type?: BountyType | readonly BountyType[];
  visibility?: Visibility | readonly Visibility[];
  funded?: boolean;
  category?: Category;
  featured?: boolean;
  /** Free text over the title, app, brand and brief summary. */
  q?: string;
  sort?: "newest" | "oldest" | "budget" | "fill" | "ending" | "cpm" | "in_review" | "updated";
  limit?: number;
}

const ACTIVE: readonly BountyStatus[] = ["scheduled", "live", "paused", "filled"];
const CLOSED: readonly BountyStatus[] = ["ended", "settled", "cancelled"];

function statusPredicate(status: BountyFilter["status"]): ((b: Bounty, now: string) => boolean) | null {
  if (status === undefined) return null;
  if (status === "open") return (b, now) => b.funded && b.status === "live" && toMs(b.ends_at) > toMs(now);
  if (status === "active") return (b) => ACTIVE.includes(b.status);
  if (status === "closed") return (b) => CLOSED.includes(b.status);
  const set = new Set(asList(status as BountyStatus | readonly BountyStatus[]));
  return (b) => set.has(b.status);
}

/** Bounties, with joins resolved. `useBounties({ brand: "mine", status: "live" })`. */
export const selectBounties = defineSelector(
  ["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "session"] as const,
  (db: BountyDb & Db<"session">, f: BountyFilter | undefined): readonly BountyView[] => {
    const filter = f ?? {};
    const brandId = filter.brand === "mine" ? mineBrandId(db) : filter.brand;
    const status = statusPredicate(filter.status);
    const types = asList(filter.type);
    const visibilities = asList(filter.visibility);
    let rows = valuesOf(db.bounties).filter((b) => {
      if (brandId !== undefined && b.brand_id !== brandId) return false;
      if (filter.app !== undefined && b.app_id !== filter.app) return false;
      if (status && !status(b, db.clock.now)) return false;
      if (types && !types.includes(b.type)) return false;
      if (visibilities && !visibilities.includes(b.visibility)) return false;
      if (filter.funded !== undefined && b.funded !== filter.funded) return false;
      if (filter.featured !== undefined && b.featured !== filter.featured) return false;
      if (filter.category !== undefined && db.apps[b.app_id]?.category !== filter.category) return false;
      return true;
    });
    if (filter.q) rows = rows.filter((b) => matchesQuery(filter.q, b.title, db.apps[b.app_id]?.name, db.brands[b.brand_id]?.name, b.brief.summary));
    const views = rows.map((b) => bountyView(db, b));
    const sort = filter.sort ?? "newest";
    views.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return asc(a.created_at, b.created_at);
        case "budget":
          return desc(a.budget_cents, b.budget_cents);
        case "fill":
          return desc(a.fill_ratio, b.fill_ratio);
        case "ending":
          return asc(a.ends_at, b.ends_at);
        case "cpm":
          return desc(a.cpm_cents, b.cpm_cents);
        case "in_review":
          return desc(a.counts.in_review, b.counts.in_review);
        case "updated":
          return desc(a.updated_at, b.updated_at);
        default:
          return desc(a.published_at ?? a.created_at, b.published_at ?? b.created_at);
      }
    });
    return filter.limit ? views.slice(0, filter.limit) : views;
  },
);

/** One bounty with its joins, or `undefined` (still loading, or the id does not exist). */
export const selectBounty = defineSelector(["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock"] as const, (db: BountyDb, id: string | undefined): BountyView | undefined => {
  const b = id ? db.bounties[id] : undefined;
  return b ? bountyView(db, b) : undefined;
});

/** The bounty counts by tab ("live 4 · draft 2 · filled 1 · ended 3"), for the brand's bounty list. */
export interface BountyTabCounts {
  all: number;
  live: number;
  draft: number;
  awaiting_funding: number;
  scheduled: number;
  paused: number;
  filled: number;
  ended: number;
  settled: number;
  cancelled: number;
}

export const selectBountyCounts = defineSelector(["bounties", "session"] as const, (db: Db<"bounties" | "session">, scope: { brand?: string } | undefined): BountyTabCounts => {
  const brandId = scope?.brand === "mine" ? db.session.brand_id : scope?.brand;
  const out: BountyTabCounts = { all: 0, live: 0, draft: 0, awaiting_funding: 0, scheduled: 0, paused: 0, filled: 0, ended: 0, settled: 0, cancelled: 0 };
  for (const b of valuesOf(db.bounties)) {
    if (brandId && b.brand_id !== brandId) continue;
    out.all += 1;
    out[b.status] += 1;
  }
  return out;
});

/** The live preview of the bounty builder: the exact bounty, Brief Lint, pay math and funding a save would produce, plus what the wallet can cover. */
export interface BountyPreview extends BountyDraft {
  wallet: { balance_cents: number; available_cents: number; held_for_bids_cents: number; shortfall_cents: number; card_charge_for_shortfall_cents: number };
  /** True when Go live is allowed: no Brief Lint blockers and the wallet covers the escrow (or the brand will top up by card). */
  can_publish: boolean;
}

export const selectBountyPreview = defineSelector(
  ["apps", "brands", "brand_members", "formats", "market_series", "bounties", "auctions", "clock", "session"] as const,
  (db: Db<"apps" | "brands" | "brand_members" | "formats" | "market_series" | "bounties" | "auctions" | "clock" | "session">, input: BountyDraftInput | undefined): BountyPreview | null => {
    if (!input || !input.app_id || !db.apps[input.app_id]) return null;
    const member = db.session.member_id ? db.brand_members[db.session.member_id] : undefined;
    const draft = buildBountyDraft(db, input, { member });
    const brand = db.brands[draft.bounty.brand_id];
    const needed = draft.funding.brand_funded_cents;
    // Same arithmetic as Go live (`availableWallet`): the balance less the sealed bids the brand has open.
    const held = heldForBidsIn(valuesOf(db.auctions), brand.id);
    const available = brand.wallet_balance_cents - held;
    const short = Math.max(0, needed - available);
    return {
      ...draft,
      wallet: { balance_cents: brand.wallet_balance_cents, available_cents: available, held_for_bids_cents: held, shortfall_cents: short, card_charge_for_shortfall_cents: short > 0 ? short + cardProcessing(short) : 0 },
      can_publish: draft.lint.can_publish,
    };
  },
);
