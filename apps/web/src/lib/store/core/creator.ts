/**
 * Creator-side actions beyond the money path: Academy, tournaments, the Daily Drop, crews, Wellbeing Mode, the rate card, the Tax Desk, payout methods,
 * linked accounts, profile, notifications and referrals.
 */

import type {
  Category,
  CrewMember,
  Creator,
  LessonProgress,
  Niche,
  Notification,
  NotificationPrefs,
  PayoutMethod,
  RateCard,
  RateSuggestion,
  SocialAccount,
  Platform,
  TaxProfile,
  TournamentEntry,
  WellbeingSettings,
  Referral,
  Crew,
  Format,
} from "@/lib/contract/types";
import { CATEGORY_META } from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  clearingStats,
  formatCompact,
  formatMoney,
  hashString,
  makeArtSeed,
  mulRate,
  referralLink,
  scoreHookText,
  seededRng,
  tierAtLeast,
  tierPerks,
  toMs,
  baselineFor,
} from "@/lib/engine";
import { requireCreator } from "./guards";
import { notifyCreator } from "./notify";
import { reevaluatePayoutHolds } from "./earnings";
import { refreshReputation } from "./creator-stats";
import { ensure, type Tx } from "./tx";
import type { DemoState } from "../state";

// ── Academy ────────────────────────────────────────────────────────────────────────────────────

const QUIZ_PASS = 0.66;

export interface LessonResult {
  passed: boolean;
  score: number;
  correct: number;
  total: number;
  /** Which questions were right, with the explanation of each (shown after submitting). */
  review: { correct: boolean; explanation: string }[];
  badge_awarded: boolean;
  progress: LessonProgress;
}

/** Marks a lesson started. */
export function startLesson(tx: Tx, input: { lesson_id: string }): { progress: LessonProgress } {
  const { creator } = requireCreator(tx);
  tx.must("lessons", input.lesson_id, "Lesson");
  const existing = tx.all("lesson_progress").find((p) => p.creator_id === creator.id && p.lesson_id === input.lesson_id);
  if (existing) return { progress: existing.status === "not_started" ? tx.patch("lesson_progress", existing.id, { status: "in_progress", started_at: tx.now }) : existing };
  return { progress: tx.put("lesson_progress", { id: tx.nextId("lsp"), creator_id: creator.id, lesson_id: input.lesson_id, status: "in_progress", started_at: tx.now, badge_awarded: false }) };
}

/**
 * Scores the three-question quiz. 2 of 3 passes (66%): the lesson completes, its badge is awarded, the Academy bonus (0.5 reliability point per lesson,
 * up to 5) updates the creator's score, and finishing all ten earns the Academy Graduate badge. A miss is not a failure: read the explanations and retry.
 */
export function completeLesson(tx: Tx, input: { lesson_id: string; answers: number[] }): LessonResult {
  const { creator } = requireCreator(tx);
  const lesson = tx.must("lessons", input.lesson_id, "Lesson");
  ensure(input.answers.length === lesson.quiz.length, "answers_required", `Answer all ${lesson.quiz.length} questions.`, undefined, 422);
  const review = lesson.quiz.map((q, i) => ({ correct: input.answers[i] === q.answer_index, explanation: q.explanation }));
  const correct = review.filter((r) => r.correct).length;
  const score = Math.round((correct / lesson.quiz.length) * 100) / 100;
  const passed = score >= QUIZ_PASS;
  const existing = tx.all("lesson_progress").find((p) => p.creator_id === creator.id && p.lesson_id === lesson.id);
  const wasDone = existing?.status === "completed";
  let progress: LessonProgress;
  if (!passed) {
    progress = existing ? tx.patch("lesson_progress", existing.id, { status: wasDone ? "completed" : "in_progress", started_at: existing.started_at ?? tx.now }) : tx.put("lesson_progress", { id: tx.nextId("lsp"), creator_id: creator.id, lesson_id: lesson.id, status: "in_progress", started_at: tx.now, badge_awarded: false });
    return { passed, score, correct, total: lesson.quiz.length, review, badge_awarded: false, progress };
  }
  const patch = { status: "completed" as const, quiz_score: Math.max(score, existing?.quiz_score ?? 0), completed_at: existing?.completed_at ?? tx.now, started_at: existing?.started_at ?? tx.now, badge_awarded: true };
  progress = existing ? tx.patch("lesson_progress", existing.id, patch) : tx.put("lesson_progress", { id: tx.nextId("lsp"), creator_id: creator.id, lesson_id: lesson.id, ...patch });
  if (!wasDone) {
    const done = tx.all("lesson_progress").filter((p) => p.lesson_id === lesson.id && p.status === "completed");
    tx.patch("lessons", lesson.id, { completions: done.length, avg_quiz_score: Math.round((done.reduce((s, p) => s + (p.quiz_score ?? 0), 0) / Math.max(1, done.length)) * 100) / 100 });
    const mine = tx.all("lesson_progress").filter((p) => p.creator_id === creator.id && p.status === "completed").length;
    if (mine >= tx.all("lessons").length && !creator.badges.includes("academy_graduate")) tx.patch("creators", creator.id, { badges: [...creator.badges, "academy_graduate"] });
    notifyCreator(tx, creator.id, { kind: "academy_badge", title: `Badge earned: ${lesson.badge_label}`, body: `${lesson.title} is done. Your reliability score gets +${CONSTANTS.reliability.creator.academy_bonus_per_lesson} for it (up to ${CONSTANTS.reliability.creator.academy_bonus_cap} across the Academy).`, path: "academy", ref_kind: "lesson", ref_id: lesson.id });
    refreshReputation(tx, creator.id);
  }
  return { passed, score, correct, total: lesson.quiz.length, review, badge_awarded: !wasDone, progress };
}

// ── tournaments ────────────────────────────────────────────────────────────────────────────────

/** Enters a tournament with a hook (free entry). The hook is scored on the same checklist as everywhere else. */
export function joinTournament(tx: Tx, input: { tournament_id: string; hook_text: string; submission_id?: string }): { entry: TournamentEntry } {
  const { creator } = requireCreator(tx);
  const t = tx.must("tournaments", input.tournament_id, "Tournament");
  ensure(t.status === "open" || t.status === "live" || t.status === "announced", "entries_closed", t.status === "complete" || t.status === "judging" ? "This tournament is over." : `Entries are ${t.status}.`, undefined, 409);
  ensure(t.status !== "announced" || toMs(t.entries_open_at) <= toMs(tx.now), "entries_closed", "Entries are not open yet.", undefined, 409);
  if (t.min_tier) ensure(tierAtLeast(creator.tier, t.min_tier), "tier_locked", `This tournament is for ${t.min_tier} creators and above.`, undefined, 403);
  if (t.niche) ensure(creator.niches.includes(t.niche), "niche_mismatch", `This tournament is for ${t.niche.replace(/_/g, " ")} creators.`, undefined, 403);
  ensure(!tx.all("tournament_entries").some((e) => e.tournament_id === t.id && e.creator_id === creator.id), "already_entered", "You already entered this tournament.", undefined, 409);
  ensure(input.hook_text.trim().length >= 8, "hook_required", "Write your hook line (a sentence).", undefined, 422);
  const scored = scoreHookText(input.hook_text.trim());
  const entry: TournamentEntry = {
    id: tx.nextId("tent"),
    tournament_id: t.id,
    creator_id: creator.id,
    status: "entered",
    hook_text: input.hook_text.trim(),
    ...(input.submission_id ? { submission_id: input.submission_id } : {}),
    thumb: makeArtSeed(seededRng(`${t.id}|${creator.id}`), { hue: t.art.hue_a, label: input.hook_text.trim().split(/\s+/).slice(0, 3).join(" ") }),
    hook_points: scored.score,
    hook_band: scored.band,
    seed: t.entries_count + 1,
    round_reached: 1,
    entered_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("tournament_entries", entry);
  tx.patch("tournaments", t.id, { entries_count: t.entries_count + 1 });
  return { entry };
}

// ── the Daily Drop ─────────────────────────────────────────────────────────────────────────────

/**
 * Claims a place in a Daily Drop item. Inventory is real: a claim takes one true spot and holds the place to submit for 24 hours; unclaimed spots return to
 * the open feed. One claim per creator per item.
 */
export function claimDrop(tx: Tx, input: { drop_id: string; bounty_id: string }): { drop_id: string; bounty_id: string; claimed_until: string; spots_left: number } {
  const { creator } = requireCreator(tx);
  const drop = tx.must("daily_drops", input.drop_id, "Daily Drop");
  ensure(drop.status === "live", "drop_not_live", drop.status === "upcoming" ? `Today's drop opens ${drop.release_at.slice(11, 16)} UTC.` : drop.status === "sold_out" ? "Everything in this drop is claimed." : "This drop is closed.", drop.status === "closed" ? "Unclaimed spots are back in the open feed." : undefined, 409);
  const item = drop.items.find((i) => i.bounty_id === input.bounty_id);
  ensure(item, "not_in_drop", "That bounty is not in this drop.", undefined, 404);
  ensure(item.spots_left > 0, "sold_out", "That bounty is sold out.", "Spots are real: when they are gone, they are gone.", 409);
  ensure(!item.claims.some((c) => c.creator_id === creator.id), "already_claimed", "You already claimed a spot on this bounty.", undefined, 409);
  const bounty = tx.must("bounties", input.bounty_id, "Bounty");
  ensure(bounty.status === "live", "bounty_closed", `This bounty is ${bounty.status.replace(/_/g, " ")}.`, undefined, 409);
  if (bounty.eligibility.min_tier) ensure(tierAtLeast(creator.tier, bounty.eligibility.min_tier), "tier_locked", `This bounty needs ${bounty.eligibility.min_tier} or higher.`, undefined, 403);
  ensure(bounty.eligibility.countries.length === 0 || bounty.eligibility.countries.includes(creator.country), "country_locked", "This bounty is not open in your country.", undefined, 403);
  const claimedUntil = addDays(tx.now, 1);
  const items = drop.items.map((i) => (i.bounty_id === input.bounty_id ? { ...i, spots_left: i.spots_left - 1, claims: [...i.claims, { creator_id: creator.id, claimed_at: tx.now }] } : i));
  const spotsLeft = items.reduce((s, i) => s + i.spots_left, 0);
  tx.patch("daily_drops", drop.id, { items, spots_left: spotsLeft, claims_total: drop.spots_total - spotsLeft, status: spotsLeft === 0 ? "sold_out" : drop.status });
  const existing = tx.all("bounty_saves").find((s) => s.creator_id === creator.id && s.bounty_id === bounty.id);
  if (existing) tx.patch("bounty_saves", existing.id, { stage: existing.stage === "submitted" ? "submitted" : "joined", claimed_until: claimedUntil, drop_id: drop.id, updated_at: tx.now });
  else tx.put("bounty_saves", { id: tx.nextId("save"), creator_id: creator.id, bounty_id: bounty.id, stage: "joined", saved_at: tx.now, claimed_until: claimedUntil, drop_id: drop.id, updated_at: tx.now });
  return { drop_id: drop.id, bounty_id: bounty.id, claimed_until: claimedUntil, spots_left: items.find((i) => i.bounty_id === bounty.id)?.spots_left ?? 0 };
}

// ── crews ──────────────────────────────────────────────────────────────────────────────────────

const inviteCodeFor = (name: string): string => `${name.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "CREW"}${(hashString(name) % 90) + 10}`;

/** A Gold or higher creator starts a crew (3 to 20 members, a shared leaderboard and a platform-funded weekly goal bonus). */
export function createCrew(tx: Tx, input: { name: string; tagline: string; niche: Niche; open?: boolean; weekly_goal_cents?: number }): { crew: Crew } {
  const { creator } = requireCreator(tx);
  ensure(tierAtLeast(creator.tier, CONSTANTS.crews.lead_min_tier), "tier_locked", "Leading a crew opens at Gold.", "You can join any open crew now.", 403);
  ensure(!tx.all("crew_members").some((m) => m.creator_id === creator.id), "already_in_crew", "Leave your current crew before starting a new one.", undefined, 409);
  ensure(input.name.trim().length >= 3 && input.name.trim().length <= 32, "name_invalid", "A crew name is 3 to 32 characters.", undefined, 422);
  const id = `crew_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
  ensure(!tx.get("crews", id), "name_taken", "A crew with that name exists.", undefined, 409);
  const crew: Crew = {
    id,
    name: input.name.trim(),
    tagline: input.tagline.trim(),
    art: makeArtSeed(seededRng(id), { label: input.name.trim().slice(0, 2).toUpperCase() }),
    niche: input.niche,
    lead_creator_id: creator.id,
    member_count: 1,
    open: input.open ?? true,
    invite_code: inviteCodeFor(input.name),
    weekly_goal_cents: input.weekly_goal_cents ?? 25_000,
    week_cleared_cents: 0,
    week_rank: tx.all("crews").length + 1,
    bonus_earned_total_cents: 0,
    lifetime_cleared_cents: 0,
    created_at: tx.now,
  };
  tx.put("crews", crew);
  tx.put("crew_members", { id: tx.nextId("cmem"), crew_id: id, creator_id: creator.id, role: "lead", joined_at: tx.now, week_cleared_cents: 0, lifetime_cleared_cents: 0 } satisfies CrewMember);
  return { crew };
}

/** Joins a crew (open ones need no code; closed ones need the invite code). Leave any time. */
export function joinCrew(tx: Tx, input: { crew_id: string; invite_code?: string }): { crew: Crew } {
  const { creator } = requireCreator(tx);
  const crew = tx.must("crews", input.crew_id, "Crew");
  ensure(!tx.all("crew_members").some((m) => m.creator_id === creator.id), "already_in_crew", "You are already in a crew. Leave it first.", undefined, 409);
  ensure(crew.member_count < CONSTANTS.crews.max_members, "crew_full", `Crews hold ${CONSTANTS.crews.max_members} creators at most.`, undefined, 409);
  ensure(crew.open || input.invite_code?.trim().toUpperCase() === crew.invite_code, "invite_required", "This crew is invite-only. Ask the lead for the code.", undefined, 403);
  tx.put("crew_members", { id: tx.nextId("cmem"), crew_id: crew.id, creator_id: creator.id, role: "member", joined_at: tx.now, week_cleared_cents: 0, lifetime_cleared_cents: creator.lifetime_cleared_cents } satisfies CrewMember);
  return { crew: tx.patch("crews", crew.id, { member_count: crew.member_count + 1 }) };
}

/** Leaves the crew. A lead hands over to the longest-standing member first (or the crew closes when they were the last). */
export function leaveCrew(tx: Tx): { left: boolean } {
  const { creator } = requireCreator(tx);
  const mine = tx.all("crew_members").find((m) => m.creator_id === creator.id);
  ensure(mine, "not_in_crew", "You are not in a crew.", undefined, 409);
  const crew = tx.must("crews", mine.crew_id);
  tx.remove("crew_members", mine.id);
  const rest = tx.all("crew_members").filter((m) => m.crew_id === crew.id);
  if (rest.length === 0) {
    tx.remove("crews", crew.id);
    return { left: true };
  }
  if (mine.role === "lead") {
    const next = [...rest].sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1)).find((m) => tierAtLeast(tx.must("creators", m.creator_id).tier, CONSTANTS.crews.lead_min_tier)) ?? rest[0];
    tx.patch("crew_members", next.id, { role: "lead" });
    tx.patch("crews", crew.id, { member_count: rest.length, lead_creator_id: next.creator_id });
  } else tx.patch("crews", crew.id, { member_count: rest.length });
  return { left: true };
}

// ── Wellbeing Mode ─────────────────────────────────────────────────────────────────────────────

export type WellbeingPatch = Partial<Pick<WellbeingSettings, "enabled" | "quiet_hours" | "numbers_off" | "pace_goal" | "rest_weeks" | "leaderboard_opt_out" | "slack_mode">> & { paused_until?: string | null };

/** Updates Wellbeing Mode: quiet hours, numbers off, an opt-in pace goal, rest weeks, slack streaks, leaderboard opt-out, and Pause (which keeps tier and streak). */
export function updateWellbeing(tx: Tx, input: WellbeingPatch): { settings: WellbeingSettings } {
  const { creator } = requireCreator(tx);
  const existing = tx.all("wellbeing_settings").find((w) => w.creator_id === creator.id);
  const base: WellbeingSettings = existing ?? {
    id: `wb_${creator.handle.replace(/\./g, "_")}`,
    creator_id: creator.id,
    enabled: false,
    quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: tx.get("users", creator.user_id)?.timezone ?? "America/Chicago" },
    numbers_off: { enabled: false },
    pace_goal: { enabled: false },
    rest_weeks: [],
    leaderboard_opt_out: false,
    slack_mode: false,
    updated_at: tx.now,
  };
  if (input.rest_weeks) {
    const perQuarter = new Map<string, number>();
    for (const w of input.rest_weeks) {
      const q = `${w.slice(0, 4)}-Q${Math.ceil(Number(w.slice(6)) / 13)}`;
      perQuarter.set(q, (perQuarter.get(q) ?? 0) + 1);
    }
    ensure([...perQuarter.values()].every((n) => n <= CONSTANTS.streaks.rest_weeks_per_quarter), "too_many_rest_weeks", `You can declare ${CONSTANTS.streaks.rest_weeks_per_quarter} rest weeks a quarter.`, "Rest weeks keep your streak without counting a week.", 422);
  }
  if (input.pace_goal?.enabled) ensure((input.pace_goal.posts_per_week ?? 0) >= 1 && (input.pace_goal.posts_per_week ?? 0) <= 14, "pace_invalid", "Pick 1 to 14 posts a week. It is a soft target and never affects your tier.", undefined, 422);
  const { paused_until, ...rest } = input;
  const next: WellbeingSettings = { ...base, ...rest, updated_at: tx.now };
  if (paused_until === null) delete (next as Partial<WellbeingSettings>).paused_until;
  else if (paused_until !== undefined) next.paused_until = paused_until;
  tx.put("wellbeing_settings", next);
  if (paused_until !== undefined) {
    if (paused_until === null) tx.unset("creators", creator.id, "paused_until");
    else tx.patch("creators", creator.id, { paused_until });
  }
  return { settings: next };
}

/** Switches Wellbeing Mode on or off as a whole (quiet hours default 10 pm to 8 am, numbers-off off, no pace goal). */
export function toggleWellbeing(tx: Tx, input: { enabled: boolean }): { settings: WellbeingSettings } {
  return updateWellbeing(tx, input.enabled ? { enabled: true, quiet_hours: { enabled: true, start: "22:00", end: "08:00", timezone: tx.get("users", requireCreator(tx).creator.user_id)?.timezone ?? "America/Chicago" } } : { enabled: false, quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "America/Chicago" }, numbers_off: { enabled: false }, slack_mode: false });
}

// ── rate card ──────────────────────────────────────────────────────────────────────────────────

export const NICHE_CATEGORY: Record<Niche, Category> = { ai_tools: "ai_photo", tech: "ai_assistant", fitness: "fitness", wellness: "sleep_mind", productivity: "productivity", study: "language", money: "finance", lifestyle: "lifestyle", beauty: "ai_photo", travel: "language", food: "lifestyle", parenting: "sleep_mind" };

/** The tier multiplier on a market price: experienced creators ask for more (1.0 Bronze to 2.1 Elite). */
const TIER_PRICE_MULTIPLIER: Record<Creator["tier"], number> = { bronze: 1, silver: 1.3, gold: 1.55, platinum: 1.8, elite: 2.1 };

/** The market-suggested price for one video: median views x the category's clearing CPM, scaled by tier, with a p25 to p75 band. */
export function suggestRate(db: Pick<DemoState, "social_accounts" | "market_series" | "clock">, creator: Creator): RateSuggestion {
  const accounts = Object.values(db.social_accounts).filter((a) => a.creator_id === creator.id && a.status === "connected");
  const median = Math.max(0, ...accounts.map((a) => a.median_views_28d));
  const category = NICHE_CATEGORY[creator.niches[0] ?? "lifestyle"];
  const stats = clearingStats(Object.values(db.market_series), category);
  const clearing = stats.from_baseline ? baselineFor(category).clearing_cpm_cents : stats.clearing_cpm_cents;
  const mult = TIER_PRICE_MULTIPLIER[creator.tier];
  const price = Math.round((median * clearing * mult) / 1000 / 100) * 100;
  const low = Math.round((median * stats.p25_cpm_cents * mult) / 1000 / 100) * 100;
  const high = Math.round((median * stats.p75_cpm_cents * mult) / 1000 / 100) * 100;
  return {
    price_cents: Math.max(2500, price),
    low_cents: Math.max(2500, Math.min(low, price)),
    high_cents: Math.max(price, high),
    basis: `Median ${formatCompact(median)} views x ${formatMoney(clearing)} ${CATEGORY_META[category].label} CPM, ${mult}x ${creator.tier[0].toUpperCase()}${creator.tier.slice(1)}`,
    confidence: Math.round(Math.min(0.85, stats.sample_n / (stats.sample_n + CONSTANTS.pricing_model.confidence_k)) * 100) / 100,
    computed_at: db.clock.now,
  };
}

export interface RateCardInput {
  price_per_video_cents: number;
  min_cpm_cents: number;
  paid_usage_days?: number;
  turnaround_days?: number;
  max_videos_per_month?: number;
  platforms?: Platform[];
  format_ids?: Format["id"][];
  categories_excluded?: Category[];
  accepts_direct_offers?: boolean;
  status?: RateCard["status"];
}

/** Saves the creator's rate card (Silver and above). The market-suggested price is stored beside the ask so brands see both. */
export function saveRateCard(tx: Tx, input: RateCardInput): { rate_card: RateCard } {
  const { creator } = requireCreator(tx);
  ensure(tierPerks(creator.tier).rate_card, "tier_locked", "Rate cards open at Silver.", "Keep clearing approved work: Silver needs $250 cleared and 5 approved posts.", 403);
  ensure(input.price_per_video_cents >= 2500, "price_too_low", "The smallest price is $25 a video.", undefined, 422);
  ensure(input.min_cpm_cents >= CONSTANTS.pay.floor_cpm_cents, "cpm_below_floor", `The minimum CPM is at least ${formatMoney(CONSTANTS.pay.floor_cpm_cents)}.`, undefined, 422);
  const existing = tx.all("rate_cards").find((r) => r.creator_id === creator.id);
  const accounts = tx.all("social_accounts").filter((a) => a.creator_id === creator.id);
  const row: RateCard = {
    id: existing?.id ?? `rate_${creator.handle.replace(/\./g, "_")}`,
    creator_id: creator.id,
    status: input.status ?? existing?.status ?? "open",
    price_per_video_cents: input.price_per_video_cents,
    min_cpm_cents: input.min_cpm_cents,
    paid_usage_days: input.paid_usage_days ?? existing?.paid_usage_days ?? CONSTANTS.rights.paid_ads_default_days,
    paid_usage_pct_per_30d: existing?.paid_usage_pct_per_30d ?? CONSTANTS.rights.renewal_fee_pct_of_base_per_30d,
    turnaround_days: input.turnaround_days ?? existing?.turnaround_days ?? 5,
    max_videos_per_month: input.max_videos_per_month ?? existing?.max_videos_per_month ?? 8,
    platforms: input.platforms ?? existing?.platforms ?? [...new Set(accounts.map((a) => a.platform))],
    format_ids: input.format_ids ?? existing?.format_ids ?? [],
    categories_excluded: input.categories_excluded ?? existing?.categories_excluded ?? [],
    accepts_direct_offers: input.accepts_direct_offers ?? existing?.accepts_direct_offers ?? true,
    suggested: suggestRate(tx.state, creator),
    // Existing bundles keep their discount when the base price moves (a 3-pack must never cost more per video than a single).
    packages: existing?.packages.map((pack) => ({ ...pack, price_per_video_cents: Math.round(input.price_per_video_cents * (existing.price_per_video_cents > 0 ? pack.price_per_video_cents / existing.price_per_video_cents : 1)) })) ?? [
      { label: "3 videos", videos: 3, price_per_video_cents: Math.round(input.price_per_video_cents * 0.92) },
      { label: "5 videos", videos: 5, price_per_video_cents: Math.round(input.price_per_video_cents * 0.85) },
    ],
    stats: existing?.stats ?? { offers_received: 0, accepted: 0, median_response_hours: 0 },
    updated_at: tx.now,
  };
  tx.put("rate_cards", row);
  tx.patch("creators", creator.id, { open_to_offers: row.accepts_direct_offers && row.status !== "paused" });
  return { rate_card: row };
}

// ── Tax Desk and payout method ─────────────────────────────────────────────────────────────────

export interface TaxFormInput {
  legal_name: string;
  entity_type?: TaxProfile["entity_type"];
  /** Only the last four digits are ever sent or stored. */
  tin_last4: string;
  address: NonNullable<TaxProfile["address"]>;
  form?: TaxProfile["form"];
}

/** Just-in-time W-9 or W-8BEN. The mock provider verifies it at once; payouts held for tax info release. Not tax advice. */
export function submitTaxForm(tx: Tx, input: TaxFormInput): { profile: TaxProfile } {
  const { creator } = requireCreator(tx);
  ensure(input.legal_name.trim().split(/\s+/).length >= 2, "name_invalid", "Enter your full legal name as it appears on your tax return.", undefined, 422);
  ensure(/^\d{4}$/.test(input.tin_last4), "tin_invalid", "Enter the last four digits of your SSN or tax ID.", "We never ask for, send or store the full number in this demo.", 422);
  ensure(input.address.line1.trim() && input.address.city.trim() && input.address.postal_code.trim(), "address_invalid", "Add your full mailing address.", undefined, 422);
  const existing = tx.all("tax_profiles").find((t) => t.creator_id === creator.id);
  const form = input.form ?? (creator.country === "US" ? "w9" : "w8ben");
  const ytd = tx.all("ledger").filter((e) => e.account === `creator:${creator.id}` && e.amount_cents > 0 && (e.status === "cleared" || e.status === "paid") && e.posted_at.startsWith("2026")).reduce((s, e) => s + e.amount_cents, 0);
  const paid = tx.all("ledger").filter((e) => e.account === `creator:${creator.id}` && e.amount_cents > 0 && e.status === "paid" && e.posted_at.startsWith("2026")).reduce((s, e) => s + e.amount_cents, 0);
  const base: TaxProfile = existing ?? { id: `taxp_${creator.handle.replace(/\./g, "_")}`, creator_id: creator.id, status: "none", country: creator.country, tax_year: CONSTANTS.tax.tax_year, ytd_cleared_cents: ytd, ytd_paid_cents: paid, threshold_cents: CONSTANTS.tax.form_1099_nec_threshold_cents, threshold_progress: 0, form_1099_required: false, set_aside_rate: CONSTANTS.tax.set_aside_rate, set_aside_cents: 0, updated_at: tx.now };
  const profile: TaxProfile = {
    ...base,
    status: "verified",
    form,
    legal_name: input.legal_name.trim(),
    ...(input.entity_type ? { entity_type: input.entity_type } : {}),
    tin_last4: input.tin_last4,
    address: input.address,
    country: creator.country,
    ytd_cleared_cents: ytd,
    ytd_paid_cents: paid,
    threshold_progress: Math.min(1, paid / base.threshold_cents),
    form_1099_required: creator.country === "US" && paid >= base.threshold_cents,
    set_aside_cents: mulRate(ytd, base.set_aside_rate),
    requested_at: base.requested_at ?? tx.now,
    submitted_at: tx.now,
    verified_at: tx.now,
    ...(form === "w8ben" ? { expires_at: addDays(tx.now, 365 * 3) } : {}),
    updated_at: tx.now,
  };
  tx.put("tax_profiles", profile);
  tx.patch("creators", creator.id, { payout_ready: creator.verification_status === "verified" && creator.payout_method?.status === "active" });
  reevaluatePayoutHolds(tx, creator.id);
  notifyCreator(tx, creator.id, { kind: "system_notice", title: `${form === "w9" ? "W-9" : "W-8BEN"} verified`, body: "Your payouts are no longer held for tax info. This is not tax advice.", path: "tax", ref_kind: "tax_profile", ref_id: profile.id });
  return { profile };
}

/** The set-aside slider on the Tax Desk: the share of cleared earnings to put aside for taxes. */
export function setTaxSetAside(tx: Tx, input: { rate: number }): { profile: TaxProfile } {
  const { creator } = requireCreator(tx);
  ensure(input.rate >= 0 && input.rate <= 0.5, "rate_invalid", "Pick a set-aside between 0% and 50%.", undefined, 422);
  const p = tx.all("tax_profiles").find((t) => t.creator_id === creator.id);
  ensure(p, "not_found", "Start your tax profile first.", undefined, 404);
  return { profile: tx.patch("tax_profiles", p.id, { set_aside_rate: input.rate, set_aside_cents: mulRate(p.ytd_cleared_cents, input.rate), updated_at: tx.now }) };
}

/** Adds a bank account or debit card for payouts (mock Stripe Connect). Debit cards can cash out instantly. */
export function setPayoutMethod(tx: Tx, input: { kind: PayoutMethod["kind"]; label?: string; last4: string }): { method: PayoutMethod } {
  const { creator } = requireCreator(tx);
  ensure(/^\d{4}$/.test(input.last4), "last4_invalid", "Enter the last four digits of the account or card.", undefined, 422);
  const method: PayoutMethod = { id: `pm_${tx.nextNumber("pm")}`, kind: input.kind, label: input.label ?? (input.kind === "bank" ? "Bank account" : "Debit card"), last4: input.last4, status: "active", instant_capable: input.kind === "debit_card", verified_at: tx.now };
  tx.patch("creators", creator.id, { payout_method: method, stripe_account_id: creator.stripe_account_id ?? `acct_${(hashString(creator.id) % 900000) + 100000}` });
  const fresh = tx.must("creators", creator.id);
  tx.patch("creators", creator.id, { payout_ready: fresh.verification_status === "verified" && tx.all("tax_profiles").some((t) => t.creator_id === creator.id && t.status === "verified") });
  reevaluatePayoutHolds(tx, creator.id);
  return { method };
}

// ── linked accounts and profile ────────────────────────────────────────────────────────────────

/** Links a social account (mock read-only OAuth). The stats are generated deterministically from the handle; tokens never exist in the demo. */
export function connectSocialAccount(tx: Tx, input: { platform: Platform; handle: string }): { account: SocialAccount } {
  const { creator } = requireCreator(tx);
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  ensure(/^[a-z0-9._]{2,30}$/.test(handle), "handle_invalid", "A handle is 2 to 30 letters, numbers, dots or underscores.", undefined, 422);
  const id = `sa_${creator.handle.replace(/\./g, "_")}_${input.platform}`;
  const rng = seededRng(`${creator.id}|${input.platform}|${handle}`);
  const followers = Math.round(2500 + rng() * 38_000);
  const median = Math.round(followers * (0.12 + rng() * 0.3));
  const existing = tx.get("social_accounts", id);
  const account: SocialAccount = {
    id,
    creator_id: creator.id,
    platform: input.platform,
    handle,
    followers,
    avg_views_28d: Math.round(median * 1.4),
    median_views_28d: median,
    engagement_rate: Math.round((0.035 + rng() * 0.04) * 1000) / 1000,
    us_audience_ratio: Math.round((0.55 + rng() * 0.3) * 100) / 100,
    status: "connected",
    verified_by_platform: false,
    primary: !tx.all("social_accounts").some((a) => a.creator_id === creator.id && a.primary),
    account_created_at: existing?.account_created_at ?? addDays(tx.now, -(180 + Math.floor(rng() * 600))),
    connected_at: tx.now,
    last_synced_at: tx.now,
    health: existing?.health ?? { score: 92, status: "good", strikes: 0, unoriginal_flags: 0, notes: [] },
  };
  tx.put("social_accounts", account);
  const stage = tx.must("creators", creator.id).onboarding_stage;
  if (stage === "signed_up" || stage === "niches_picked") tx.patch("creators", creator.id, { onboarding_stage: "accounts_linked" });
  return { account };
}

/** Unlinks an account. */
export function disconnectSocialAccount(tx: Tx, input: { account_id: string }): { removed: boolean } {
  const { creator } = requireCreator(tx);
  const a = tx.must("social_accounts", input.account_id, "Account");
  ensure(a.creator_id === creator.id, "forbidden", "That account belongs to another creator.", undefined, 403);
  tx.patch("social_accounts", a.id, { status: "revoked" });
  return { removed: true };
}

export interface ProfilePatch {
  display_name?: string;
  bio?: string;
  niches?: Niche[];
  languages?: string[];
  open_to_offers?: boolean;
  storefront?: Partial<Creator["storefront"]>;
}

/** Edits the creator profile and storefront (joinflowd.io/c/<handle>). The handle never changes. */
export function updateCreatorProfile(tx: Tx, input: ProfilePatch): { creator: Creator } {
  const { creator } = requireCreator(tx);
  if (input.niches) ensure(input.niches.length >= 1 && input.niches.length <= 3, "niches_invalid", "Pick 1 to 3 niches.", undefined, 422);
  if (input.bio !== undefined) ensure(input.bio.length <= 280, "bio_too_long", "Keep your bio under 280 characters.", undefined, 422);
  const patch: Partial<Creator> = {
    ...(input.display_name ? { display_name: input.display_name.trim() } : {}),
    ...(input.bio !== undefined ? { bio: input.bio.trim() } : {}),
    ...(input.niches ? { niches: input.niches } : {}),
    ...(input.languages ? { languages: input.languages } : {}),
    ...(input.open_to_offers !== undefined ? { open_to_offers: input.open_to_offers } : {}),
    ...(input.storefront ? { storefront: { ...creator.storefront, ...input.storefront, slug: creator.handle } } : {}),
  };
  const next = tx.patch("creators", creator.id, patch);
  if (input.display_name) tx.patch("users", creator.user_id, { display_name: input.display_name.trim() });
  return { creator: next };
}

// ── notifications ──────────────────────────────────────────────────────────────────────────────

/** Marks a notification read. */
export function markNotificationRead(tx: Tx, input: { id: string }): { notification: Notification } {
  const n = tx.must("notifications", input.id, "Notification");
  ensure(n.recipient_user_id === tx.session.user_id || tx.session.persona === "admin", "forbidden", "That notification is not yours.", undefined, 403);
  return { notification: n.read_at ? n : tx.patch("notifications", n.id, { read_at: tx.now }) };
}

/** Marks everything read for the signed-in user. */
export function markAllNotificationsRead(tx: Tx): { count: number } {
  const uid = tx.session.user_id;
  ensure(uid, "unauthenticated", "Sign in to do that.", undefined, 401);
  let count = 0;
  for (const n of tx.all("notifications")) {
    if (n.recipient_user_id !== uid || n.read_at) continue;
    tx.patch("notifications", n.id, { read_at: tx.now });
    count += 1;
  }
  return { count };
}

/** Edits notification preferences: channels, categories, quiet hours and the single Daily Drop reminder. */
export function updateNotificationPrefs(tx: Tx, input: Partial<Pick<NotificationPrefs, "push" | "email_digest" | "categories" | "quiet_hours" | "batch_non_cash" | "drop_reminder">>): { prefs: NotificationPrefs } {
  const uid = tx.session.user_id;
  ensure(uid, "unauthenticated", "Sign in to do that.", undefined, 401);
  const existing = tx.all("notification_prefs").find((p) => p.user_id === uid);
  const user = tx.must("users", uid, "User");
  const base: NotificationPrefs = existing ?? { id: `npref_${user.id.replace(/^usr_/, "")}`, user_id: uid, push: true, email_digest: true, categories: { money: true, reviews: true, drop: true, offers: true, tournaments: true, tips: true, safety: true }, quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: user.timezone }, batch_non_cash: true, drop_reminder: false, updated_at: tx.now };
  const next: NotificationPrefs = { ...base, ...input, categories: { ...base.categories, ...(input.categories ?? {}) }, updated_at: tx.now };
  // Money and safety stay on: a creator can never switch off the notifications that protect them.
  next.categories.money = true;
  next.categories.safety = true;
  return { prefs: tx.put("notification_prefs", next) };
}

// ── referrals ──────────────────────────────────────────────────────────────────────────────────

/** Invites someone with the creator's code. Single level, funded by flowd: the invited person is never charged. */
export function inviteToFlowd(tx: Tx, input: { label: string; channel?: "link" | "code" | "qr" }): { referral: Referral; link: string } {
  const { creator } = requireCreator(tx);
  ensure(input.label.trim().length >= 2, "label_required", "Who are you inviting? A name or handle helps you track it.", undefined, 422);
  const referral: Referral = {
    id: tx.nextId("ref"),
    kind: "creator",
    status: "invited",
    code: creator.referral_code,
    referrer_creator_id: creator.id,
    referee_label: input.label.trim(),
    channel: input.channel ?? "link",
    invited_at: tx.now,
    reward_rate: CONSTANTS.referrals.creator_share_rate,
    reward_cap_cents: CONSTANTS.referrals.creator_share_cap_per_referee_cents,
    reward_earned_cents: 0,
    created_at: tx.now,
    updated_at: tx.now,
  };
  tx.put("referrals", referral);
  return { referral, link: referralLink(creator.referral_code) };
}

