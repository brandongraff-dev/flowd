/**
 * The creator's bounty feed and bounty detail: ranked by match (five gates, then niche, platform, region, price, reliability, recency), with the
 * expected pay for THIS creator at p25, median and p75, the Rights Card in plain language and the honest reason when a bounty is locked.
 */

import type { BountyType, BountySave, Category, Format, Platform, RightsCard, Submission } from "@/lib/contract/types";
import { rankBountiesForCreator, rightsLines, rightsSummary, type BountyMatch, type RightsLine } from "@/lib/engine";
import { creatorProfile, matchBounty, COUNTS_AGAINST_LIMIT } from "@/lib/store/core/adapters";
import { spotsOf } from "@/lib/store/core/escrow";
import { asList, asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { bountyView, type BountyDb, type BountyView } from "./bounties";

export interface FeedFilter {
  /** Pay structure: CPM, CPA, install-only, stacked, direct. */
  structure?: BountyType | readonly BountyType[];
  platform?: Platform;
  category?: Category;
  /** Only the bounties the creator saved. */
  saved?: boolean;
  /** Hide bounties the creator cannot take (tier, country, no linked account...). Default false: locked ones are shown last with their reasons. */
  hide_locked?: boolean;
  /** Only funded, open bounties. Default true; the Funded badge is the promise. */
  funded_only?: boolean;
  q?: string;
  sort?: "match" | "pay" | "new" | "ending" | "spots";
  limit?: number;
}

export interface FeedItem {
  bounty: BountyView;
  match: BountyMatch;
  /** 0 to 100, or null when a gate failed (locked). */
  score: number | null;
  /** Expected pay per video for this creator at the three view quantiles. An estimate. */
  expected: { p25: number; median: number; p75: number };
  saved: boolean;
  /** The creator has joined it ("Make it" was pressed, or a Daily Drop claim holds a place). */
  joined: boolean;
  /** Where a Daily Drop claim holds the place until. */
  claimed_until?: string;
  submitted: boolean;
  /** Pinned at the top: the always-on flowd "content about us" bounty for new creators, and featured pins. */
  pinned: boolean;
  /** "Decides in about 11 h". */
  decides_in: string | null;
  /** One line for the Rights chip: "Organic posting, paid ads 90 days". */
  rights_chip: string;
}

export interface FeedResult {
  items: readonly FeedItem[];
  counts: { all: number; open: number; saved: number; locked: number; early_access: number };
}

type FeedDb = BountyDb & Db<"creators" | "social_accounts" | "submissions" | "rate_cards" | "bounty_saves" | "session">;
const FEED_KEYS = ["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "creators", "social_accounts", "submissions", "rate_cards", "bounty_saves", "session"] as const;

function saveOf(db: Db<"bounty_saves">, creatorId: string, bountyId: string): BountySave | undefined {
  return groupBy(db.bounty_saves, "creator", (s) => s.creator_id).get(creatorId).find((s) => s.bounty_id === bountyId);
}

/** The creator's bounty feed. `useFeed({ sort: "match" })`. Empty unless the signed-in persona is a creator. */
export const selectFeed = defineSelector(FEED_KEYS, (db: FeedDb, f: FeedFilter | undefined): FeedResult => {
  const filter = f ?? {};
  const creator = db.session.creator_id ? db.creators[db.session.creator_id] : undefined;
  const none: FeedResult = { items: [], counts: { all: 0, open: 0, saved: 0, locked: 0, early_access: 0 } };
  if (!creator) return none;
  const open = valuesOf(db.bounties).filter((b) => b.status === "live" && (b.visibility === "open" || b.visibility === "drop"));
  const matches = rankBountiesForCreator({ creator: creatorProfile(db, creator), bounties: open.map((b) => matchBounty(db, b)), now: db.clock.now, include_hidden: true });
  const saves = groupBy(db.bounty_saves, "creator", (s) => s.creator_id).get(creator.id);
  const saveByBounty = new Map(saves.map((s) => [s.bounty_id, s]));
  const submitted = new Set(
    groupBy(db.submissions, "creator", (s) => s.creator_id)
      .get(creator.id)
      .filter((s) => COUNTS_AGAINST_LIMIT.has(s.status))
      .map((s) => s.bounty_id),
  );
  const structures = asList(filter.structure);
  const fundedOnly = filter.funded_only !== false;
  const items: FeedItem[] = [];
  let earlyAccess = 0;
  for (const m of matches) {
    const b = db.bounties[m.bounty_id];
    const view = bountyView(db, b);
    if (!m.visible) {
      earlyAccess += 1;
      continue;
    }
    if (fundedOnly && !view.funded) continue;
    if (structures && !structures.includes(b.type)) continue;
    if (filter.platform && !b.deliverables.platforms.includes(filter.platform)) continue;
    if (filter.category && view.app.category !== filter.category) continue;
    if (filter.hide_locked && m.locked) continue;
    const save = saveByBounty.get(b.id);
    if (filter.saved && !save) continue;
    if (!matchesQuery(filter.q, b.title, view.app.name, view.brand.name, b.brief.summary)) continue;
    items.push({
      bounty: view,
      match: m,
      score: m.score,
      expected: m.expected_pay_cents,
      saved: save !== undefined,
      joined: save?.stage === "joined" || save?.stage === "submitted",
      ...(save?.claimed_until && save.claimed_until > db.clock.now ? { claimed_until: save.claimed_until } : {}),
      submitted: submitted.has(b.id),
      pinned: (view.brand.kind === "platform" && b.featured) || (b.featured && (b.featured_until ?? "9") > db.clock.now),
      decides_in: view.decides_in,
      rights_chip: rightsSummary(b.rights_card),
    });
  }
  const sort = filter.sort ?? "match";
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (sort) {
      case "pay":
        return desc(a.expected.median, b.expected.median);
      case "new":
        return desc(a.bounty.published_at ?? a.bounty.created_at, b.bounty.published_at ?? b.bounty.created_at);
      case "ending":
        return asc(a.bounty.ends_at, b.bounty.ends_at);
      case "spots":
        return asc(a.bounty.spots_left, b.bounty.spots_left);
      default:
        return 0; // the engine already ordered by match (locked last)
    }
  });
  const shown = filter.limit ? items.slice(0, filter.limit) : items;
  return {
    items: shown,
    counts: { all: items.length, open: items.filter((i) => !i.match.locked).length, saved: saves.length, locked: items.filter((i) => i.match.locked).length, early_access: earlyAccess },
  };
});

export interface CreatorBountyView {
  bounty: BountyView;
  match: BountyMatch | null;
  /** True when "Make it" works now. */
  can_submit: boolean;
  /** Why not, in plain words and what to do about it ("This bounty opens to your tier at Sat 8:00 PM UTC."). */
  blocked_reason?: string;
  /** The creator's submission to this bounty, newest first, if any. */
  submissions: readonly Submission[];
  save?: BountySave;
  expected: { p25: number; median: number; p75: number } | null;
  /** The Rights Card as plain-language lines and a one-line summary. */
  rights: { card: RightsCard; lines: readonly RightsLine[]; summary: string };
  /** Formats recommended for this bounty, best first. */
  formats: readonly Format[];
  /** Spots left, a true count. */
  spots_left: number;
}

/** A bounty as the signed-in creator sees it: detail with their match, expected pay and what stops them, in words. */
export const selectBountyForCreator = defineSelector([...FEED_KEYS, "formats"] as const, (db: FeedDb & Db<"formats">, id: string | undefined): CreatorBountyView | undefined => {
  const b = id ? db.bounties[id] : undefined;
  if (!b) return undefined;
  const view = bountyView(db, b);
  const creator = db.session.creator_id ? db.creators[db.session.creator_id] : undefined;
  const match = creator ? rankBountiesForCreator({ creator: creatorProfile(db, creator), bounties: [matchBounty(db, b)], now: db.clock.now, include_hidden: true })[0] ?? null : null;
  const mine = creator ? groupBy(db.submissions, "bounty", (s) => s.bounty_id).get(b.id).filter((s) => s.creator_id === creator.id) : [];
  const save = creator ? saveOf(db, creator.id, b.id) : undefined;
  let blocked: string | undefined;
  if (!creator) blocked = "Sign in as a creator to take this bounty.";
  else if (!view.funded) blocked = "This bounty is not fully funded yet, so it cannot take videos.";
  else if (b.status !== "live") blocked = b.status === "filled" ? "This bounty is full right now. A spot opens when a pending video is rejected or withdrawn." : `This bounty is ${b.status.replace(/_/g, " ")}.`;
  else if (match && !match.visible) blocked = `This bounty opens to your tier at ${match.visible_at.slice(11, 16)} UTC. Higher tiers get a head start: Silver 1 hour, Gold 3, Platinum 6, Elite 12.`;
  else if (match?.locked) blocked = match.lock_reasons[0];
  else if (spotsOf(b) === 0) blocked = "This bounty has no spot left right now.";
  const submittedAlready = mine.some((s) => COUNTS_AGAINST_LIMIT.has(s.status));
  return {
    bounty: view,
    match,
    can_submit: blocked === undefined && !submittedAlready,
    ...(submittedAlready ? { blocked_reason: "You have already submitted to this bounty. Open your submission to see where it stands." } : blocked ? { blocked_reason: blocked } : {}),
    submissions: [...mine].sort((a, c) => desc(a.submitted_at, c.submitted_at)),
    ...(save ? { save } : {}),
    expected: match ? match.expected_pay_cents : null,
    rights: { card: b.rights_card, lines: rightsLines(b.rights_card), summary: rightsSummary(b.rights_card) },
    formats: b.format_ids.map((fid) => db.formats[fid]).filter((x): x is Format => x !== undefined),
    spots_left: spotsOf(b),
  };
});

/** The starter bounties flowd funds for new creators (the First-Dollar Path: flat $5, decision within 24 hours). */
export const selectStarterBounties = defineSelector(["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock"] as const, (db: BountyDb): readonly BountyView[] =>
  valuesOf(db.bounties)
    .filter((b) => b.is_starter && b.status === "live" && b.funded)
    .map((b) => bountyView(db, b)),
);

/** Saved bounties (the creator's shortlist), newest save first. */
export const selectSavedBounties = defineSelector([...FEED_KEYS] as const, (db: FeedDb): readonly BountyView[] => {
  const id = db.session.creator_id;
  if (!id) return [];
  return groupBy(db.bounty_saves, "creator", (s) => s.creator_id)
    .get(id)
    .filter((s) => s.stage === "saved" || s.stage === "joined")
    .sort((a, b) => desc(a.saved_at, b.saved_at))
    .map((s) => db.bounties[s.bounty_id])
    .filter((b) => b !== undefined)
    .map((b) => bountyView(db, b));
});
