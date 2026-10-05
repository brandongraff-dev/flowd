/**
 * The creator's home: the Money Clock, today's Daily Drop (real inventory), the streak, matched bounties, what to post today, the First-Dollar tracker,
 * next steps, the tier path and notifications.
 */

import type { Bounty, BountySave, DailyDrop, DropItem, Niche, Notification, NotificationKind, OnboardingStage, SocialAccount, Streak, SubmissionStatus, Tier, TierEvent } from "@/lib/contract/types";
import { NICHES, NICHE_META } from "@/lib/contract/types";
import { hoursBetween, nextDailyAt, perkLines, remainingToNext, streakCopy, tierProgress, toMs, whatUnlocksNext, CONSTANTS, TIER_ORDER, type Remaining } from "@/lib/engine";
import { asList, asc, defineSelector, desc, groupBy, valuesOf, type Db } from "../select";
import { bountyView, type BountyView } from "./bounties";
import { selectFeed, type FeedItem } from "./feed";
import { selectWalletChip, type WalletChip } from "./money";

// ── the Daily Drop ─────────────────────────────────────────────────────────────────────────────

export interface DropItemView {
  item: DropItem;
  bounty: BountyView;
  spots_left: number;
  spots_total: number;
  sold_out: boolean;
  /** The signed-in creator claimed a place here. */
  claimed_by_me: boolean;
  /** The place is held until this time (24 hours from the claim). */
  claimed_until?: string;
}

export interface DropView {
  drop: DailyDrop;
  /** "pre" before 16:00 UTC, "live" with spots, "sold_out", "closed" after the claim window. */
  state: "pre" | "live" | "sold_out" | "closed";
  release_at: string;
  claim_window_ends_at: string;
  /** Hours until the drop opens (pre) or until the claim window closes (live). */
  hours_left: number;
  items: readonly DropItemView[];
  /** A true count across every item. */
  spots_left: number;
  spots_total: number;
  claims_total: number;
  /** When the next drop opens ("Sat 4:00 PM UTC") for the sold-out and closed states. */
  next_drop_at: string;
  headline: string;
}

type DropDb = Db<"daily_drops" | "bounties" | "apps" | "brands" | "brand_scorecards" | "brand_members" | "users" | "bounty_saves" | "clock" | "session">;

function dropView(db: DropDb, d: DailyDrop): DropView {
  const now = db.clock.now;
  const me = db.session.creator_id;
  const saves = me ? groupBy(db.bounty_saves, "creator", (s) => s.creator_id).get(me) : [];
  const state: DropView["state"] = toMs(now) < toMs(d.release_at) ? "pre" : toMs(now) >= toMs(d.claim_window_ends_at) ? "closed" : d.spots_left === 0 ? "sold_out" : "live";
  const items: DropItemView[] = d.items
    .filter((i) => db.bounties[i.bounty_id] !== undefined)
    .map((i) => {
      const save: BountySave | undefined = saves.find((s) => s.bounty_id === i.bounty_id && s.drop_id === d.id);
      return { item: i, bounty: bountyView(db, db.bounties[i.bounty_id]), spots_left: i.spots_left, spots_total: i.spots_total, sold_out: i.spots_left === 0, claimed_by_me: i.claims.some((c) => c.creator_id === me), ...(save?.claimed_until ? { claimed_until: save.claimed_until } : {}) };
    });
  return {
    drop: d,
    state,
    release_at: d.release_at,
    claim_window_ends_at: d.claim_window_ends_at,
    hours_left: state === "pre" ? Math.max(0, hoursBetween(now, d.release_at)) : state === "closed" ? 0 : Math.max(0, hoursBetween(now, d.claim_window_ends_at)),
    items,
    spots_left: d.spots_left,
    spots_total: d.spots_total,
    claims_total: d.claims_total,
    next_drop_at: nextDailyAt(now, CONSTANTS.daily_drop.hour_utc),
    headline: d.headline,
  };
}

export interface DropsView {
  /** The drop that matters right now: live or sold out inside its claim window, else the next one. */
  today: DropView | null;
  upcoming: readonly DropView[];
  recent: readonly DropView[];
}

/** The Daily Drop: one a day at 16:00 UTC with real inventory (spots left are true counts). */
export const selectDrops = defineSelector(["daily_drops", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "bounty_saves", "clock", "session"] as const, (db: DropDb): DropsView => {
  const now = toMs(db.clock.now);
  const all = valuesOf(db.daily_drops).slice().sort((a, b) => asc(a.release_at, b.release_at));
  const active = all.find((d) => toMs(d.release_at) <= now && now < toMs(d.claim_window_ends_at));
  const next = all.find((d) => toMs(d.release_at) > now);
  const today = active ?? next;
  return {
    today: today ? dropView(db, today) : null,
    upcoming: all.filter((d) => toMs(d.release_at) > now && d.id !== today?.id).slice(0, 3).map((d) => dropView(db, d)),
    recent: all.filter((d) => toMs(d.claim_window_ends_at) <= now).slice(-5).reverse().map((d) => dropView(db, d)),
  };
});

/** One drop. */
export const selectDrop = defineSelector(["daily_drops", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "bounty_saves", "clock", "session"] as const, (db: DropDb, id: string | undefined): DropView | undefined => {
  const d = id ? db.daily_drops[id] : undefined;
  return d ? dropView(db, d) : undefined;
});

// ── the streak ─────────────────────────────────────────────────────────────────────────────────

export interface StreakView extends Streak {
  headline: string;
  detail: string;
  /** Days left in the ISO week (the week ends Sunday 23:59 UTC). */
  days_left_in_week: number;
  /** Twelve weeks, oldest first, for the dot row. */
  weeks: Streak["history"];
}

export const selectStreak = defineSelector(["streaks", "creators", "clock", "session"] as const, (db: Db<"streaks" | "creators" | "clock" | "session">, creator: string | undefined): StreakView | null => {
  const id = creator === undefined || creator === "mine" ? db.session.creator_id : creator;
  const s = id ? groupBy(db.streaks, "creator", (x) => x.creator_id).get(id)[0] : undefined;
  if (!s) return null;
  const copy = streakCopy({ status: s.status, current_weeks: s.current_weeks, best_weeks: s.best_weeks, freezes_banked: s.freezes_banked, weeks_to_next_freeze: s.next_freeze_in_weeks, posted_this_week: s.posted_this_week });
  return { ...s, ...copy, days_left_in_week: Math.max(0, Math.ceil(hoursBetween(db.clock.now, s.week_ends_at) / 24)), weeks: s.history };
});

// ── tiers ──────────────────────────────────────────────────────────────────────────────────────

export interface TierRow {
  tier: Tier;
  /** Thresholds in numbers. */
  needs: { cleared_cents: number; approved: number; approval_rate: number; reliability: number; manual_review: boolean };
  perks: readonly string[];
  reached: boolean;
  current: boolean;
}

export interface TierView {
  creator?: { id: string; handle: string; tier: Tier; tier_basis: string; tier_since: string; tier_hold_until?: string };
  /** What is missing for the next tier, with the bottleneck first. */
  remaining: readonly Remaining[];
  /** 0 to 1: the bottleneck criterion. */
  progress: number;
  next: Tier | null;
  /** What the next tier adds. */
  unlocks: readonly string[];
  /** The ladder Bronze to Elite with thresholds and perks. */
  ladder: readonly TierRow[];
  /** "No tier drop for 30 days after a dip" copy when a grace hold is running, with the days left. */
  grace?: { until: string; days_left: number };
  history: readonly TierEvent[];
}

export const selectTiers = defineSelector(["creators", "creator_reputation", "tier_history", "clock", "session"] as const, (db: Db<"creators" | "creator_reputation" | "tier_history" | "clock" | "session">, creator: string | undefined): TierView => {
  const id = creator === undefined || creator === "mine" ? db.session.creator_id : creator;
  const c = id ? db.creators[id] : undefined;
  const ladder = (): TierRow[] => TIER_ORDER.map((tier) => ({ tier, needs: { cleared_cents: CONSTANTS.tiers.thresholds[tier].lifetime_cleared_cents, approved: CONSTANTS.tiers.thresholds[tier].approved_count, approval_rate: CONSTANTS.tiers.thresholds[tier].approval_rate_min, reliability: CONSTANTS.tiers.thresholds[tier].reliability_min, manual_review: CONSTANTS.tiers.thresholds[tier].manual_review }, perks: perkLines(tier), reached: false, current: false }));
  if (!c) return { remaining: [], progress: 0, next: null, unlocks: [], ladder: ladder(), history: [] };
  const stats = { lifetime_cleared_cents: c.lifetime_cleared_cents, approved_count: c.approved_count, approval_rate: c.approval_rate, reliability_score: c.reliability_score, elite_reviewed: c.tier_review !== undefined };
  const prog = tierProgress(stats, c.tier);
  const rank = TIER_ORDER.indexOf(c.tier);
  return {
    creator: { id: c.id, handle: c.handle, tier: c.tier, tier_basis: c.tier_basis, tier_since: c.tier_since, ...(c.tier_hold_until ? { tier_hold_until: c.tier_hold_until } : {}) },
    remaining: remainingToNext(stats, c.tier).slice().sort((a, b) => Number(a.met) - Number(b.met) || asc(a.have / Math.max(1, a.need), b.have / Math.max(1, b.need))),
    progress: prog.progress,
    next: prog.next ?? null,
    unlocks: whatUnlocksNext(c.tier),
    ladder: ladder().map((row, i) => ({ ...row, reached: i <= rank, current: i === rank })),
    ...(c.tier_hold_until && toMs(c.tier_hold_until) > toMs(db.clock.now) ? { grace: { until: c.tier_hold_until, days_left: Math.max(0, Math.ceil((toMs(c.tier_hold_until) - toMs(db.clock.now)) / 86_400_000)) } } : {}),
    history: groupBy(db.tier_history, "creator", (t) => t.creator_id).get(c.id).slice().sort((a, b) => desc(a.at, b.at)),
  };
});

/** The perks of a tier in plain lines (for the ladder and for tier badges' tooltips). */
export const tierPerkLines = (tier: Tier): readonly string[] => perkLines(tier);

// ── notifications ──────────────────────────────────────────────────────────────────────────────

export interface NotificationView extends Notification {
  /** The web route for this notification (creator deep links `flowd://submission/sub_1` become `/creator/submissions/sub_1`). */
  href: string | null;
  unread: boolean;
  /** "Needs you": cash events, reviews waiting, funding, safety. */
  needs_you: boolean;
}

export interface NotificationFilter {
  kind?: NotificationKind | readonly NotificationKind[];
  unread?: boolean;
  limit?: number;
}

export interface NotificationsView {
  items: readonly NotificationView[];
  unread: number;
  /** Unread ones that need the person to act. */
  needs_you: readonly NotificationView[];
}

/** Where a creator deep link lands on the web portal. */
export function creatorHref(deepLink: string): string | null {
  if (!deepLink.startsWith("flowd://")) return deepLink.startsWith("/") ? deepLink : null;
  const [kind, id] = deepLink.slice("flowd://".length).split("/");
  switch (kind) {
    case "submission":
      return id ? `/creator/submissions/${id}` : "/creator/submissions";
    case "post":
      return id ? `/creator/posts/${id}` : "/creator/posts";
    case "payout":
    case "wallet":
      return "/creator/wallet";
    case "bounty":
      return id ? `/creator/bounties/${id}` : "/creator/feed";
    case "offer":
    case "inbox":
    case "dispute":
      return "/creator/inbox";
    case "tax":
      return "/creator/tax";
    case "tiers":
      return "/creator/tiers";
    case "academy":
      return "/creator/academy";
    case "tournament":
      return id ? `/creator/tournaments/${id}` : "/creator/tournaments";
    case "drop":
      return "/creator";
    case "rights":
      return "/creator/rights";
    case "referrals":
      return "/creator/referrals";
    case "settings":
      return "/creator/settings";
    case "spec":
      return "/creator/specs";
    case "auction":
      return "/creator/auctions";
    default:
      return "/creator";
  }
}

const NEEDS_YOU = new Set<NotificationKind>(["changes_requested", "offer_received", "offer_countered", "tax_info_needed", "payout_held", "funding_needed", "review_waiting", "review_sla_warning", "dispute_update", "scam_warning", "rights_expiring", "auto_approve_paused"]);

/** The signed-in person's notifications (creator, brand member or admin), newest first. */
export const selectNotifications = defineSelector(["notifications", "session"] as const, (db: Db<"notifications" | "session">, f: NotificationFilter | undefined): NotificationsView => {
  const uid = db.session.user_id;
  if (!uid) return { items: [], unread: 0, needs_you: [] };
  const kinds = asList(f?.kind);
  const all = groupBy(db.notifications, "user", (n) => n.recipient_user_id)
    .get(uid)
    .filter((n) => n.delivered_at === undefined || n.delivered_at <= "9999")
    .map((n): NotificationView => ({ ...n, href: db.session.persona === "creator" ? creatorHref(n.deep_link) : n.deep_link, unread: n.read_at === undefined, needs_you: n.read_at === undefined && NEEDS_YOU.has(n.kind) }))
    .sort((a, b) => desc(a.created_at, b.created_at));
  const items = all.filter((n) => (!kinds || kinds.includes(n.kind)) && (f?.unread === undefined || n.unread === f.unread));
  return { items: f?.limit ? items.slice(0, f.limit) : items, unread: all.filter((n) => n.unread).length, needs_you: all.filter((n) => n.needs_you).slice(0, 10) };
});

// ── the creator home ───────────────────────────────────────────────────────────────────────────

export interface FirstDollarStep {
  id: "signed_up" | "niches_picked" | "accounts_linked" | "first_submission" | "first_approval" | "verified" | "first_dollar";
  label: string;
  done: boolean;
}

export interface NextStep {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface WhatToPost {
  kind: "approved_video" | "claimed_drop" | "joined_bounty" | "revision";
  title: string;
  detail: string;
  href: string;
  bounty: Bounty;
  /** When the claim or the SLA runs out, if it does. */
  due_at?: string;
}

export interface CreatorHome {
  ready: boolean;
  creator?: { id: string; handle: string; display_name: string; tier: Tier; first_dollar_at?: string };
  wallet: WalletChip;
  drop: DropView | null;
  streak: StreakView | null;
  /** The best three open bounties for this creator. */
  matched: readonly FeedItem[];
  what_to_post: readonly WhatToPost[];
  first_dollar: { steps: readonly FirstDollarStep[]; done: number; total: number; complete: boolean; first_dollar_at?: string };
  next_steps: readonly NextStep[];
  activity: readonly NotificationView[];
  tier: TierView;
}

const STEP_LABEL: Record<FirstDollarStep["id"], string> = {
  signed_up: "Signed up",
  niches_picked: "Picked your niches",
  accounts_linked: "Linked an account",
  first_submission: "Submitted a first video",
  first_approval: "Got a first approval",
  verified: "Verified your identity",
  first_dollar: "Cleared your first dollar",
};
const STAGES = Object.keys(STEP_LABEL) as FirstDollarStep["id"][];

type HomeDb = Db<"creators" | "tax_profiles" | "social_accounts" | "submissions" | "bounty_saves" | "offers" | "ads" | "daily_drops" | "streaks" | "creator_reputation" | "tier_history" | "notifications" | "money_clock" | "payouts" | "ledger" | "rate_cards" | "bounties" | "apps" | "brands" | "brand_scorecards" | "brand_members" | "users" | "clock" | "session">;

export const selectCreatorHome = defineSelector(
  ["creators", "tax_profiles", "social_accounts", "submissions", "bounty_saves", "offers", "ads", "daily_drops", "streaks", "creator_reputation", "tier_history", "notifications", "money_clock", "payouts", "ledger", "rate_cards", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock", "session"] as const,
  (db: HomeDb): CreatorHome => {
    const id = db.session.creator_id;
    const c = id ? db.creators[id] : undefined;
    const empty: CreatorHome = { ready: false, wallet: { pending_cents: 0, cleared_cents: 0, held_cents: 0 }, drop: null, streak: null, matched: [], what_to_post: [], first_dollar: { steps: [], done: 0, total: 0, complete: false }, next_steps: [], activity: [], tier: selectTiers(db, undefined) };
    if (!c || !id) return empty;
    const now = db.clock.now;
    const subs = groupBy(db.submissions, "creator", (s) => s.creator_id).get(id);
    const saves = groupBy(db.bounty_saves, "creator", (s) => s.creator_id).get(id);
    const stageIdx = STAGES.indexOf(c.onboarding_stage);
    const steps: FirstDollarStep[] = STAGES.map((s, i) => ({ id: s, label: STEP_LABEL[s], done: c.first_dollar_at !== undefined || i <= stageIdx }));
    const tax = groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(id)[0];
    const accounts = groupBy(db.social_accounts, "creator", (a) => a.creator_id).get(id).filter((a) => a.status === "connected");
    const next: NextStep[] = [];
    if (accounts.length === 0) next.push({ id: "link", title: "Link a TikTok, Instagram or YouTube account", detail: "Read-only. It lets flowd match you and verify your views.", href: "/creator/settings" });
    if (!c.payout_method) next.push({ id: "payout-method", title: "Add a bank account or debit card", detail: "Money clears either way; it needs somewhere to go on Friday.", href: "/creator/wallet" });
    if (!tax || tax.status === "none" || tax.status === "requested" || tax.status === "rejected") next.push({ id: "tax", title: `Add your ${c.country === "US" ? "W-9" : "W-8BEN"}`, detail: "Needed before the first payout leaves flowd. About two minutes.", href: "/creator/tax" });
    if (c.verification_status !== "verified") next.push({ id: "verify", title: "Verify your identity", detail: "Just in time: it releases payouts held for identity.", href: "/verify" });
    const waitingForMe = valuesOf(db.offers).filter((o) => o.creator_id === id && o.status === "awaiting_creator").length;
    if (waitingForMe > 0) next.push({ id: "offers", title: `${waitingForMe} ${waitingForMe === 1 ? "offer is" : "offers are"} waiting for you`, detail: "Accept, counter or decline. Everything stays in flowd.", href: "/creator/inbox" });
    const adAsks = valuesOf(db.ads).filter((a) => a.creator_id === id && a.status === "requested").length;
    if (adAsks > 0) next.push({ id: "ads", title: `${adAsks} ${adAsks === 1 ? "brand wants" : "brands want"} to run your video as an ad`, detail: "You earn 10% of ad-attributed revenue for 60 days. You can say no.", href: "/creator/rights" });
    const post: WhatToPost[] = [];
    for (const s of subs) {
      const bounty = db.bounties[s.bounty_id];
      if (!bounty) continue;
      if (s.status === "approved") post.push({ kind: "approved_video", title: `Post "${s.title}"`, detail: `Approved for ${bounty.title}. The disclosure and your link are ready.`, href: `/creator/submissions/${s.id}`, bounty });
      else if (s.status === ("changes_requested" as SubmissionStatus)) post.push({ kind: "revision", title: `Revise "${s.title}"`, detail: `Changes requested on ${bounty.title}.`, href: `/creator/submissions/${s.id}`, bounty });
    }
    for (const s of saves) {
      const bounty = db.bounties[s.bounty_id];
      if (!bounty || bounty.status !== "live") continue;
      if (s.claimed_until && s.claimed_until > now && s.stage !== "submitted") post.push({ kind: "claimed_drop", title: `Your Daily Drop place on ${bounty.title}`, detail: "Held for you. Submit before it runs out.", href: `/creator/bounties/${bounty.id}`, bounty, due_at: s.claimed_until });
      else if (s.stage === "joined") post.push({ kind: "joined_bounty", title: `Make your take for ${bounty.title}`, detail: "You joined it. Open Studio to film or upload.", href: `/creator/studio?bounty=${bounty.id}`, bounty });
    }
    const notifications = selectNotifications(db, { limit: 6 });
    return {
      ready: true,
      creator: { id: c.id, handle: c.handle, display_name: c.display_name, tier: c.tier, ...(c.first_dollar_at ? { first_dollar_at: c.first_dollar_at } : {}) },
      wallet: selectWalletChip(db, id),
      drop: selectDrops(db).today,
      streak: selectStreak(db, id),
      matched: selectFeed(db, { sort: "match", hide_locked: true, limit: 3 }).items,
      what_to_post: post.slice(0, 5),
      first_dollar: { steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: c.first_dollar_at !== undefined, ...(c.first_dollar_at ? { first_dollar_at: c.first_dollar_at } : {}) },
      next_steps: next.slice(0, 4),
      activity: notifications.items,
      tier: selectTiers(db, id),
    };
  },
);


// ── the First-Dollar Path wizard ───────────────────────────────────────────────────────────────

export interface OnboardingView {
  ready: boolean;
  creator?: { id: string; handle: string; display_name: string };
  stage: OnboardingStage;
  /** The wizard steps. Verification and the tax form are just in time, so they are not here. */
  steps: readonly { id: "niches" | "accounts" | "agreement"; label: string; done: boolean }[];
  /** Index of the first step that is not done (steps.length when the wizard is finished). */
  current: number;
  complete: boolean;
  niches: readonly Niche[];
  /** Every niche to pick from, with its label. */
  niche_options: readonly { id: Niche; label: string; picked: boolean }[];
  accounts: readonly SocialAccount[];
  age_verified: boolean;
  /** The funded starter bounties ready now: a flat $5 and a decision within 24 hours. */
  starter_count: number;
  /** "First dollar in 72 hours": what the path promises, in words. */
  promise: string;
}

const NO_ONBOARDING: OnboardingView = { ready: false, stage: "signed_up", steps: [], current: 0, complete: false, niches: [], niche_options: [], accounts: [], age_verified: false, starter_count: 0, promise: "" };

/** The creator's onboarding wizard state: what is done, what is next, the starter bounties waiting. Resumable: it reads what each step saved. */
export const selectOnboarding = defineSelector(["session", "creators", "users", "social_accounts", "bounties"] as const, (db: Db<"session" | "creators" | "users" | "social_accounts" | "bounties">): OnboardingView => {
  const id = db.session.creator_id;
  const c = id ? db.creators[id] : undefined;
  if (!c || !id) return NO_ONBOARDING;
  const accounts = groupBy(db.social_accounts, "creator", (a) => a.creator_id).get(id).filter((a) => a.status === "connected");
  const ageOk = db.users[c.user_id]?.age_verified === true;
  const steps = [
    { id: "niches" as const, label: "Pick your niches", done: c.niches.length > 0 },
    { id: "accounts" as const, label: "Link an account", done: accounts.length > 0 },
    { id: "agreement" as const, label: "Confirm 18+ and accept the creator agreement", done: ageOk },
  ];
  const first = steps.findIndex((s) => !s.done);
  return {
    ready: true,
    creator: { id: c.id, handle: c.handle, display_name: c.display_name },
    stage: c.onboarding_stage,
    steps,
    current: first === -1 ? steps.length : first,
    complete: first === -1,
    niches: c.niches,
    niche_options: NICHES.map((n) => ({ id: n, label: NICHE_META[n].label, picked: c.niches.includes(n) })),
    accounts,
    age_verified: ageOk,
    starter_count: valuesOf(db.bounties).filter((b) => b.is_starter && b.status === "live" && b.funded).length,
    promise: `Your first dollar in ${CONSTANTS.windows.view_window_hours} hours: post a starter video, it is reviewed within 24 hours, and views settle after ${CONSTANTS.windows.view_window_hours} hours.`,
  };
});
