/**
 * Offers, counters and the in-app inbox. flowd keeps conversations in the app: the thread, the offer, the Rights Card and the Pay Math sit together,
 * and Scam Shield warnings are part of the thread, never hidden.
 */

import type { App, Bounty, Brand, ChatMessage, ChatThread, Creator, Offer, OfferKind, OfferMessage, OfferStatus, Post, RateCard, RightsCard, Submission, ThreadKind } from "@/lib/contract/types";
import { hoursBetween, mulRate, rightsLines, rightsSummary, type RightsLine } from "@/lib/engine";
import { asList, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";

export interface OfferView extends Offer {
  creator: Creator;
  brand: Brand;
  app: App;
  bounty?: Bounty;
  rate_card?: RateCard;
  /** Which side the signed-in person is on; null for Ops. */
  my_side: "creator" | "brand" | null;
  /** It is the signed-in person's move (accept, counter or decline). */
  my_turn: boolean;
  /** The offer against the creator's ask: negative is below it. */
  vs_ask: { delta_cents: number; ratio: number } | null;
  /** Hours until it expires (0 once past or closed). */
  expires_in_hours: number;
  /** Counter rounds left (three are allowed). */
  rounds_left: number;
  /** Still waiting on someone. */
  open: boolean;
  last_message?: OfferMessage;
  /** A Scam Shield warning is attached to a message in the thread. */
  has_warning: boolean;
  /** The Rights Card in plain language, shown inline with the price. */
  rights: { card: RightsCard; lines: readonly RightsLine[]; summary: string };
  /** What the brand pays in total, and the platform fee inside it. */
  all_in: { amount_cents: number; fee_cents: number; total_cents: number };
  /** The conversation thread of this offer, if any. */
  thread_id?: string;
}

export interface OfferFilter {
  status?: OfferStatus | readonly OfferStatus[] | "open" | "closed";
  kind?: OfferKind;
  /** Only offers waiting on the signed-in person. */
  my_turn?: boolean;
  /** A creator id (brand view) or a brand id (creator view). */
  with?: string;
  q?: string;
}

type OfferDb = Db<"offers" | "creators" | "brands" | "apps" | "bounties" | "rate_cards" | "threads" | "clock" | "session">;
const OPEN: readonly OfferStatus[] = ["awaiting_creator", "awaiting_brand"];

function offerView(db: OfferDb, o: Offer): OfferView {
  const s = db.session;
  const mySide: OfferView["my_side"] = s.persona === "creator" && s.creator_id === o.creator_id ? "creator" : s.persona === "brand" && s.brand_id === o.brand_id ? "brand" : null;
  const open = OPEN.includes(o.status);
  const rate = o.rate_card_id ? db.rate_cards[o.rate_card_id] : undefined;
  const bounty = o.bounty_id ? db.bounties[o.bounty_id] : undefined;
  const thread = valuesOf(db.threads).find((t) => t.offer_id === o.id);
  const turn = (o.status === "awaiting_creator" && mySide === "creator") || (o.status === "awaiting_brand" && mySide === "brand");
  return {
    ...o,
    creator: db.creators[o.creator_id],
    brand: db.brands[o.brand_id],
    app: db.apps[o.app_id],
    ...(bounty ? { bounty } : {}),
    ...(rate ? { rate_card: rate } : {}),
    my_side: mySide,
    my_turn: open && turn,
    vs_ask: o.ask_cents && o.ask_cents > 0 ? { delta_cents: o.amount_cents - o.ask_cents, ratio: Math.round((o.amount_cents / o.ask_cents) * 100) / 100 } : null,
    expires_in_hours: open ? Math.max(0, hoursBetween(db.clock.now, o.expires_at)) : 0,
    rounds_left: Math.max(0, 3 - o.rounds),
    open,
    ...(o.thread.length > 0 ? { last_message: o.thread[o.thread.length - 1] } : {}),
    has_warning: o.thread.some((m) => m.warning_code !== undefined),
    rights: { card: o.rights_card, lines: rightsLines(o.rights_card), summary: rightsSummary(o.rights_card) },
    all_in: { amount_cents: o.amount_cents, fee_cents: mulRate(o.amount_cents, o.take_rate), total_cents: o.all_in_cents },
    ...(thread ? { thread_id: thread.id } : {}),
  };
}

/** Offers for whoever is signed in: a creator's inbox of offers, a brand's sent offers, or all for Ops. Waiting-on-me first, then newest. */
export const selectOffers = defineSelector(["offers", "creators", "brands", "apps", "bounties", "rate_cards", "threads", "clock", "session"] as const, (db: OfferDb, f: OfferFilter | undefined): readonly OfferView[] => {
  const filter = f ?? {};
  const s = db.session;
  let list: readonly Offer[] = valuesOf(db.offers);
  if (s.persona === "creator" && s.creator_id) list = groupBy(db.offers, "creator", (o) => o.creator_id).get(s.creator_id);
  else if (s.persona === "brand" && s.brand_id) list = groupBy(db.offers, "brand", (o) => o.brand_id).get(s.brand_id);
  else if (s.persona !== "admin") return [];
  const wanted = filter.status === "open" ? OPEN : filter.status === "closed" ? (["accepted", "declined", "expired", "withdrawn", "completed"] as const) : asList(filter.status as OfferStatus | readonly OfferStatus[] | undefined);
  return list
    .filter((o) => (!wanted || wanted.includes(o.status)) && (!filter.kind || o.kind === filter.kind) && (!filter.with || o.creator_id === filter.with || o.brand_id === filter.with))
    .map((o) => offerView(db, o))
    .filter((o) => (filter.my_turn === undefined || o.my_turn === filter.my_turn) && matchesQuery(filter.q, o.title, o.message, o.creator?.handle, o.brand?.name, o.app?.name))
    .sort((a, b) => Number(b.my_turn) - Number(a.my_turn) || Number(b.open) - Number(a.open) || desc(a.updated_at, b.updated_at));
});

/** One offer with its thread of events, price against the ask, Rights Card and whose turn it is. */
export const selectOffer = defineSelector(["offers", "creators", "brands", "apps", "bounties", "rate_cards", "threads", "clock", "session"] as const, (db: OfferDb, id: string | undefined): OfferView | undefined => {
  const o = id ? db.offers[id] : undefined;
  return o ? offerView(db, o) : undefined;
});

export interface RebuyCandidate {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  /** The creator's rate-card price per video (the re-buy ask), or null when they take no direct offers. */
  ask_cents: number | null;
  /** The reasons the post won. */
  why_it_won: readonly string[];
  /** The creator takes direct offers right now. */
  can_offer: boolean;
}

/** The re-buy shortcut: winning posts of this brand whose creators can be asked for new hooks on the same idea. */
export const selectRebuyCandidates = defineSelector(["posts", "creators", "bounties", "rate_cards", "session"] as const, (db: Db<"posts" | "creators" | "bounties" | "rate_cards" | "session">, limit: number | undefined): readonly RebuyCandidate[] => {
  const brandId = db.session.brand_id;
  if (!brandId) return [];
  return groupBy(db.posts, "brand", (p) => p.brand_id)
    .get(brandId)
    .filter((p) => p.is_winner && (p.status === "cleared" || p.status === "paid"))
    .map((p): RebuyCandidate => {
      const creator = db.creators[p.creator_id];
      const rate = groupBy(db.rate_cards, "creator", (r) => r.creator_id).get(p.creator_id)[0];
      return { post: p, creator, bounty: db.bounties[p.bounty_id], ask_cents: rate?.accepts_direct_offers ? rate.price_per_video_cents : null, why_it_won: p.why_it_won ?? [], can_offer: creator.open_to_offers && rate?.accepts_direct_offers === true && rate.status !== "paused" };
    })
    .sort((a, b) => desc(a.post.funnel.trials, b.post.funnel.trials))
    .slice(0, limit ?? 12);
});

// ── the inbox ──────────────────────────────────────────────────────────────────────────────────

export interface MessageView extends ChatMessage {
  /** Who wrote it, by name ("Maya Reyes", "flowd"). */
  author_name: string;
  /** The message is from the signed-in person. */
  mine: boolean;
}

export interface ThreadView extends Omit<ChatThread, "messages"> {
  /** The other side of the conversation: the creator for a brand, the brand for a creator. */
  counterpart: { name: string; handle?: string; kind: "creator" | "brand" | "flowd" };
  messages: readonly MessageView[];
  /** Unread for the signed-in person. */
  unread: number;
  offer?: OfferView;
  submission?: Submission;
  bounty?: Bounty;
  /** A Scam Shield warning is in the thread. */
  has_warning: boolean;
  /** The signed-in person can write now (a brand is rate-limited until the creator replies). */
  can_send: boolean;
  /** The web route that opens what the thread is about. */
  href: string | null;
  last_message?: ChatMessage;
}

type InboxDb = OfferDb & Db<"users" | "submissions">;
const INBOX_KEYS = ["threads", "offers", "creators", "brands", "apps", "bounties", "rate_cards", "submissions", "users", "clock", "session"] as const;

function threadView(db: InboxDb, t: ChatThread): ThreadView {
  const s = db.session;
  const side = s.persona === "creator" ? "creator" : s.persona === "brand" ? "brand" : null;
  const creator = t.creator_id ? db.creators[t.creator_id] : undefined;
  const brand = t.brand_id ? db.brands[t.brand_id] : undefined;
  const counterpart: ThreadView["counterpart"] = side === "creator" ? (brand ? { name: brand.name, kind: "brand" } : { name: "flowd", kind: "flowd" }) : creator ? { name: creator.display_name, handle: creator.handle, kind: "creator" } : { name: "flowd", kind: "flowd" };
  const nameOf = (m: ChatMessage): string => (m.author_user_id && db.users[m.author_user_id]?.display_name) || (m.author_role === "system" ? "flowd" : m.author_role === "creator" ? (creator?.display_name ?? "Creator") : (brand?.name ?? "Brand"));
  const myUser = s.user_id;
  const offer = t.offer_id && db.offers[t.offer_id] ? offerView(db, db.offers[t.offer_id]) : undefined;
  const submission = t.submission_id ? db.submissions[t.submission_id] : undefined;
  const bounty = t.bounty_id ? db.bounties[t.bounty_id] : undefined;
  const href =
    s.persona === "creator"
      ? offer
        ? "/creator/inbox"
        : submission
          ? `/creator/submissions/${submission.id}`
          : bounty
            ? `/creator/bounties/${bounty.id}`
            : null
      : s.persona === "brand"
        ? offer
          ? "/brand/offers"
          : submission
            ? `/brand/review/${submission.id}`
            : bounty
              ? `/brand/bounties/${bounty.id}`
              : null
        : null;
  return {
    ...t,
    counterpart,
    messages: t.messages.map((m) => ({ ...m, author_name: nameOf(m), mine: m.author_user_id !== undefined && m.author_user_id === myUser })),
    unread: side === "creator" ? t.unread_creator : side === "brand" ? t.unread_brand : 0,
    ...(offer ? { offer } : {}),
    ...(submission ? { submission } : {}),
    ...(bounty ? { bounty } : {}),
    has_warning: t.messages.some((m) => m.kind === "warning"),
    can_send: !(side === "brand" && t.rate_limited),
    href,
    ...(t.messages.length > 0 ? { last_message: t.messages[t.messages.length - 1] } : {}),
  };
}

export interface InboxView {
  threads: readonly ThreadView[];
  unread_total: number;
  /** Offers waiting on the signed-in person. */
  offers_waiting: number;
}

export interface InboxFilter {
  kind?: ThreadKind;
  unread?: boolean;
  q?: string;
}

/** The signed-in person's conversations, newest first, with unread counts and the offer card beside offer threads. */
export const selectInbox = defineSelector(INBOX_KEYS, (db: InboxDb, f: InboxFilter | undefined): InboxView => {
  const filter = f ?? {};
  const s = db.session;
  let list: readonly ChatThread[] = [];
  if (s.persona === "creator" && s.creator_id) list = groupBy(db.threads, "creator", (t) => t.creator_id).get(s.creator_id);
  else if (s.persona === "brand" && s.brand_id) list = groupBy(db.threads, "brand", (t) => t.brand_id).get(s.brand_id);
  else if (s.persona === "admin") list = valuesOf(db.threads).filter((t) => t.kind === "support");
  const views = list.map((t) => threadView(db, t));
  return {
    threads: views
      .filter((t) => (!filter.kind || t.kind === filter.kind) && (filter.unread === undefined || t.unread > 0 === filter.unread) && matchesQuery(filter.q, t.title, t.counterpart.name, t.last_message?.body))
      .sort((a, b) => desc(a.last_message_at, b.last_message_at)),
    unread_total: views.reduce((sum, t) => sum + t.unread, 0),
    offers_waiting: views.filter((t) => t.offer?.my_turn).length,
  };
});

/** One conversation with named authors, the offer card and the submission or bounty it is about. */
export const selectThread = defineSelector(INBOX_KEYS, (db: InboxDb, id: string | undefined): ThreadView | undefined => {
  const t = id ? db.threads[id] : undefined;
  return t ? threadView(db, t) : undefined;
});

