/**
 * The in-app inbox: threads tied to an offer, a submission, a bounty or support, and Flo's saved suggestions. flowd keeps conversations in the app;
 * Scam Shield adds a visible warning after a risky message and never silently deletes it.
 */

import type { AuthorRole, ChatMessage, ChatThread, FloAction, FloKind, FloSuggestion, FloSurface, MessageKind, Offer, OfferMessage, ScamReason, ThreadKind } from "@/lib/contract/types";
import { addMinutes } from "@/lib/engine";
import { requireBrand, requireCreator } from "./guards";
import { notifyBrand, notifyCreator } from "./notify";
import { SCAM_WARNING_COPY, scamWarningFor } from "./scamshield";
import { ensure, type Tx } from "./tx";

/** How many messages a brand may send in a row before the creator replies (the one-sided rate limit that keeps creators' inboxes calm). */
export const MAX_UNANSWERED_BRAND_MESSAGES = 3;

type Side = "creator" | "brand" | "admin";

/** Who is writing in a thread, and the user id. Throws unless they are a party (or Ops). */
function sideOf(tx: Tx, thread: ChatThread): { side: Side; user_id: string } {
  const s = tx.session;
  if (s.persona === "creator") {
    const { creator } = requireCreator(tx, thread.creator_id);
    ensure(thread.creator_id === creator.id, "forbidden", "That conversation is not yours.", undefined, 403);
    return { side: "creator", user_id: creator.user_id };
  }
  if (s.persona === "brand") {
    ensure(thread.brand_id !== undefined, "forbidden", "That conversation is not yours.", undefined, 403);
    const { user_id } = requireBrand(tx, thread.brand_id, "view");
    return { side: "brand", user_id };
  }
  ensure(s.persona === "admin", "unauthenticated", "Sign in to do that.", undefined, 401);
  return { side: "admin", user_id: s.user_id ?? "usr_ops" };
}

/** Consecutive trailing messages from the brand side with no creator reply in between. */
function unansweredBrandMessages(messages: readonly ChatMessage[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.kind !== "text") continue;
    if (m.author_role === "brand") n += 1;
    else break;
  }
  return n;
}

export interface SendThreadMessageResult {
  thread: ChatThread;
  message: ChatMessage;
  /** The Scam Shield reason when the message tripped a rule (a warning was added under it). */
  warning?: string;
}

/** Sends a message in a thread. Scam Shield scans it; a brand cannot send more than three in a row before the creator replies. */
export function sendThreadMessage(tx: Tx, input: { thread_id: string; body: string }): SendThreadMessageResult {
  const thread = tx.must("threads", input.thread_id, "Conversation");
  const { side, user_id } = sideOf(tx, thread);
  const body = input.body.trim();
  ensure(body.length > 0, "empty_message", "Write a message first.", undefined, 422);
  ensure(body.length <= 2000, "message_too_long", "Keep messages under 2,000 characters.", undefined, 422);
  if (side === "brand") {
    ensure(unansweredBrandMessages(thread.messages) < MAX_UNANSWERED_BRAND_MESSAGES, "rate_limited", "Wait for a reply before sending more.", "This keeps creators' inboxes calm. They are told you are waiting.", 429);
  }
  const message: ChatMessage = { id: tx.nextId("msg"), author_role: side === "admin" ? "system" : side, author_user_id: user_id, kind: "text", body, at: tx.now };
  const messages: ChatMessage[] = [...thread.messages, message];
  const reason = scamWarningFor(body);
  if (reason) messages.push({ id: tx.nextId("msg"), author_role: "system", kind: "warning", body: SCAM_WARNING_COPY[reason], at: addMinutes(tx.now, 1), warning_code: reason });
  const added = messages.length - thread.messages.length;
  const limited = unansweredBrandMessages(messages) >= MAX_UNANSWERED_BRAND_MESSAGES;
  const next = tx.patch("threads", thread.id, {
    messages,
    last_message_at: messages[messages.length - 1].at,
    rate_limited: limited,
    ...(side === "creator" ? { unread_brand: thread.unread_brand + added } : side === "brand" ? { unread_creator: thread.unread_creator + added } : { unread_creator: thread.unread_creator + 1, unread_brand: thread.unread_brand + 1 }),
  });
  if (thread.kind === "offer" && thread.offer_id && side !== "admin") mirrorToOffer(tx, thread.offer_id, { author_role: side, author_user_id: user_id, body, ...(reason ? { warning: reason } : {}) });
  if (side === "brand" && thread.creator_id) {
    notifyCreator(tx, thread.creator_id, { kind: "offer_received", title: `New message: ${thread.title}`, body: body.length > 120 ? `${body.slice(0, 117)}...` : body, path: `inbox/${thread.id}`, ref_kind: "thread", ref_id: thread.id });
  } else if (side === "creator" && thread.brand_id) {
    notifyBrand(tx, thread.brand_id, { kind: "offer_received", title: `New message: ${thread.title}`, body: body.length > 120 ? `${body.slice(0, 117)}...` : body, route: "/brand/offers", ref_kind: "thread", ref_id: thread.id });
  }
  return { thread: next, message, ...(reason ? { warning: reason } : {}) };
}

/** Opens a conversation (support, or a note on a bounty or submission) with a first message. */
export function startThread(tx: Tx, input: { kind: Exclude<ThreadKind, "offer">; title: string; body: string; bounty_id?: string; submission_id?: string }): { thread: ChatThread } {
  const s = tx.session;
  ensure(s.persona === "creator" || s.persona === "brand", "forbidden", "Creators and brands start conversations.", undefined, 403);
  ensure(input.title.trim().length >= 3, "title_required", "Give the conversation a short subject.", undefined, 422);
  ensure(input.body.trim().length >= 3, "empty_message", "Write a message first.", undefined, 422);
  const creatorId = s.persona === "creator" ? s.creator_id ?? undefined : undefined;
  const brandId = s.persona === "brand" ? s.brand_id ?? undefined : undefined;
  const id = tx.nextId("thr");
  const first: ChatMessage = { id: tx.nextId("msg"), author_role: s.persona === "creator" ? "creator" : "brand", ...(s.user_id ? { author_user_id: s.user_id } : {}), kind: "text", body: input.body.trim(), at: tx.now };
  const messages: ChatMessage[] = [first];
  const reason = scamWarningFor(first.body);
  if (reason) messages.push({ id: tx.nextId("msg"), author_role: "system", kind: "warning", body: SCAM_WARNING_COPY[reason], at: addMinutes(tx.now, 1), warning_code: reason });
  if (input.kind === "support") messages.push({ id: tx.nextId("msg"), author_role: "system", kind: "system", body: "Thanks. A person on the flowd team replies within 24 hours. Your money and your work are not affected while you wait.", at: addMinutes(tx.now, 1) });
  const thread: ChatThread = {
    id,
    kind: input.kind,
    title: input.title.trim(),
    ...(creatorId ? { creator_id: creatorId } : {}),
    ...(brandId ? { brand_id: brandId } : {}),
    ...(input.submission_id ? { submission_id: input.submission_id } : {}),
    ...(input.bounty_id ? { bounty_id: input.bounty_id } : {}),
    messages,
    unread_creator: 0,
    unread_brand: 0,
    rate_limited: false,
    last_message_at: messages[messages.length - 1].at,
    created_at: tx.now,
  };
  return { thread: tx.put("threads", thread) };
}

/** Marks a conversation read for the person looking at it. */
export function markThreadRead(tx: Tx, input: { thread_id: string }): { thread: ChatThread } {
  const thread = tx.must("threads", input.thread_id, "Conversation");
  const { side } = sideOf(tx, thread);
  const mine = side === "creator" ? thread.unread_creator : thread.unread_brand;
  if (side === "admin" || mine === 0) return { thread };
  const messages = thread.messages.map((m) => (m.read_at || (side === "creator" ? m.author_role === "creator" : m.author_role === "brand") ? m : { ...m, read_at: tx.now }));
  return { thread: tx.patch("threads", thread.id, { messages, ...(side === "creator" ? { unread_creator: 0 } : { unread_brand: 0 }) }) };
}

// ── offers and their thread ────────────────────────────────────────────────────────────────────

/** The conversation thread of an offer (one per offer): created with the offer, and every offer event is mirrored into it so the inbox reads in order. */
export function offerThread(tx: Tx, offer: Offer): ChatThread {
  const existing = tx.all("threads").find((t) => t.offer_id === offer.id);
  if (existing) return existing;
  return tx.put("threads", {
    id: tx.nextId("thr"),
    kind: "offer",
    title: offer.title,
    creator_id: offer.creator_id,
    brand_id: offer.brand_id,
    offer_id: offer.id,
    messages: [],
    unread_creator: 0,
    unread_brand: 0,
    rate_limited: false,
    last_message_at: tx.now,
    created_at: tx.now,
  });
}

/** Appends one message (and a Scam Shield warning under a risky one) to the offer's thread, and counts it unread for the other side. */
export function mirrorToThread(tx: Tx, offer: Offer, p: { author_role: AuthorRole; author_user_id?: string; kind?: MessageKind; body: string; warning?: ScamReason }): void {
  const thread = offerThread(tx, offer);
  const message: ChatMessage = { id: tx.nextId("msg"), author_role: p.author_role, ...(p.author_user_id ? { author_user_id: p.author_user_id } : {}), kind: p.kind ?? "text", body: p.body, at: tx.now };
  const messages: ChatMessage[] = [...thread.messages, message];
  if (p.warning) messages.push({ id: tx.nextId("msg"), author_role: "system", kind: "warning", body: SCAM_WARNING_COPY[p.warning], at: addMinutes(tx.now, 1), warning_code: p.warning });
  const added = messages.length - thread.messages.length;
  tx.patch("threads", thread.id, {
    messages,
    last_message_at: messages[messages.length - 1].at,
    ...(p.author_role === "creator" ? { unread_brand: thread.unread_brand + added } : p.author_role === "brand" ? { unread_creator: thread.unread_creator + added } : { unread_creator: thread.unread_creator + 1, unread_brand: thread.unread_brand + 1 }),
  });
}

/** A message written in an offer thread also joins the offer's own conversation (so the Offers page and the inbox never disagree). */
function mirrorToOffer(tx: Tx, offerId: string, m: { author_role: AuthorRole; author_user_id: string; body: string; warning?: ScamReason }): void {
  const offer = tx.get("offers", offerId);
  if (!offer) return;
  const msg: OfferMessage = { id: tx.nextId("omsg"), author_role: m.author_role, author_user_id: m.author_user_id, type: "message", body: m.body, at: tx.now, ...(m.warning ? { warning_code: m.warning } : {}) };
  tx.patch("offers", offer.id, { thread: [...offer.thread, msg], updated_at: tx.now });
}

// ── Flo ────────────────────────────────────────────────────────────────────────────────────────

export interface SaveFloInput {
  surface: FloSurface;
  kind: FloKind;
  prompt: string;
  title: string;
  outputs: string[];
  actions?: FloAction[];
  context_kind?: string;
  context_id?: string;
  /** Mock engine timing, shown as "answered in 1.2 s". */
  latency_ms?: number;
}

/** Saves what Flo produced to the signed-in person's history (so a script or a rewrite is still there tomorrow). */
export function saveFloSuggestion(tx: Tx, input: SaveFloInput): { suggestion: FloSuggestion } {
  const s = tx.session;
  ensure(s.persona === "creator" || s.persona === "brand", "forbidden", "Flo history is kept for creators and brands.", undefined, 403);
  ensure(input.outputs.length > 0, "empty_output", "Flo has nothing to save yet.", undefined, 422);
  const suggestion: FloSuggestion = {
    id: tx.nextId("flo"),
    surface: input.surface,
    kind: input.kind,
    ...(s.persona === "creator" && s.creator_id ? { creator_id: s.creator_id } : {}),
    ...(s.persona === "brand" && s.brand_id ? { brand_id: s.brand_id } : {}),
    ...(input.context_kind ? { context_kind: input.context_kind } : {}),
    ...(input.context_id ? { context_id: input.context_id } : {}),
    prompt: input.prompt.trim(),
    title: input.title.trim(),
    outputs: input.outputs,
    actions: input.actions ?? [],
    model: "flo-mock-1",
    latency_ms: input.latency_ms ?? 900,
    created_at: tx.now,
  };
  return { suggestion: tx.put("flo_suggestions", suggestion) };
}

/** Thumbs up or down on a Flo suggestion (it teaches the checklist which tips help). */
export function rateFloSuggestion(tx: Tx, input: { id: string; helpful: boolean }): { suggestion: FloSuggestion } {
  const suggestion = tx.must("flo_suggestions", input.id, "Suggestion");
  const s = tx.session;
  const mine = (s.persona === "creator" && suggestion.creator_id === s.creator_id) || (s.persona === "brand" && suggestion.brand_id === s.brand_id);
  ensure(mine, "forbidden", "That suggestion is not yours.", undefined, 403);
  return { suggestion: tx.patch("flo_suggestions", suggestion.id, { helpful: input.helpful }) };
}
