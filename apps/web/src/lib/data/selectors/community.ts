/**
 * The creator community and growth surfaces: leaderboards (peer cohorts of about 30), crews, tournaments, the Academy, the Remix library and Trend radar,
 * referrals, Wrapped, Wellbeing Mode and Scam Shield / Account Health.
 */

import type {
  Category,
  Creator,
  Crew,
  CrewMember,
  Format,
  Hook,
  HookType,
  Lesson,
  LessonProgress,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardScope,
  Matchup,
  Niche,
  Referral,
  ScamReport,
  SocialAccount,
  Tier,
  Tournament,
  TournamentEntry,
  TournamentRound,
  WellbeingSettings,
  Wrapped,
} from "@/lib/contract/types";
import { CONSTANTS, fillHook, hoursBetween, isoWeek, referralLink, tierAtLeast, toMs, type HookSlots } from "@/lib/engine";
import { asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { isEarning } from "@/lib/store/core/creator-stats";

// ── leaderboards ───────────────────────────────────────────────────────────────────────────────

export interface LeaderRow extends LeaderboardEntry {
  creator: Creator;
  is_me: boolean;
}

export interface LeaderboardView {
  board?: Leaderboard;
  rows: readonly LeaderRow[];
  me?: LeaderRow;
  /** Top places that move up a tier-cohort next week (cohort boards; there is no demotion zone). */
  promotion_zone_size: number;
  reset_at?: string;
  hours_to_reset: number | null;
  label: string;
  /** The boards that could be shown (for tabs: cohort, niche, global; earnings, conversion rate, score accuracy). */
  available: readonly { id: string; scope: LeaderboardScope; metric: LeaderboardMetric; label: string }[];
  /** The creator has not cleared a dollar yet: they are not ranked ("Earn your first $1"). */
  unranked: boolean;
  /** The creator opted out of leaderboards (Wellbeing Mode). */
  opted_out: boolean;
  /** Public global board footnote: the typical creator beside the leaders. */
  typical_cents: number | null;
}

export interface LeaderboardArg {
  scope?: LeaderboardScope;
  metric?: LeaderboardMetric;
  niche?: Niche;
  tier?: Tier;
  /** An ISO week ("2026-W40"); default the latest. */
  week?: string;
  limit?: number;
}

type LbDb = Db<"leaderboards" | "creators" | "wellbeing_settings" | "ticker" | "clock" | "session">;

/** A leaderboard. Default: the signed-in creator's peer cohort this week. `scope: "global"` for the public board. */
export const selectLeaderboard = defineSelector(["leaderboards", "creators", "wellbeing_settings", "ticker", "clock", "session"] as const, (db: LbDb, arg: LeaderboardArg | undefined): LeaderboardView => {
  const a = arg ?? {};
  const scope = a.scope ?? (db.session.creator_id ? "cohort" : "global");
  const metric = a.metric ?? "earnings";
  const me = db.session.creator_id;
  const all = valuesOf(db.leaderboards);
  const week = a.week ?? all.map((b) => b.iso_week).sort().pop() ?? isoWeek(db.clock.now);
  const boards = all.filter((b) => b.iso_week === week && b.metric === metric);
  const mine = me ? boards.find((b) => b.scope === "cohort" && b.entries.some((e) => e.creator_id === me)) : undefined;
  const board =
    scope === "cohort"
      ? mine ?? boards.find((b) => b.scope === "cohort" && (!a.tier || b.tier === a.tier) && (!a.niche || b.niche === a.niche))
      : scope === "niche"
        ? boards.find((b) => b.scope === "niche" && (!a.niche || b.niche === a.niche))
        : boards.find((b) => b.scope === "global");
  const opted = me ? groupBy(db.wellbeing_settings, "creator", (w) => w.creator_id).get(me)[0]?.leaderboard_opt_out === true : false;
  const rows: LeaderRow[] = (board?.entries ?? []).filter((e) => db.creators[e.creator_id]).map((e) => ({ ...e, creator: db.creators[e.creator_id], is_me: e.creator_id === me }));
  const ticker = db.ticker.totals;
  return {
    ...(board ? { board } : {}),
    rows: a.limit ? rows.slice(0, a.limit) : rows,
    ...(rows.find((r) => r.is_me) ? { me: rows.find((r) => r.is_me) } : {}),
    promotion_zone_size: board?.promotion_zone_size ?? 0,
    ...(board ? { reset_at: board.reset_at } : {}),
    hours_to_reset: board ? Math.max(0, hoursBetween(db.clock.now, board.reset_at)) : null,
    label: board?.label ?? "No board yet",
    available: boards.filter((b) => b.scope !== "cohort" || b.id === mine?.id).map((b) => ({ id: b.id, scope: b.scope, metric: b.metric, label: b.label })),
    unranked: me ? (db.creators[me]?.lifetime_cleared_cents ?? 0) === 0 && !rows.some((r) => r.is_me) : false,
    opted_out: opted,
    typical_cents: ticker.typical_creator_30d_cents || null,
  };
});

// ── crews ──────────────────────────────────────────────────────────────────────────────────────

export interface CrewMemberView extends CrewMember {
  creator: Creator;
}

export interface CrewView extends Crew {
  lead: Creator;
  members: readonly CrewMemberView[];
  /** The week's progress toward the shared goal, 0 to 1 (a platform-funded bonus pays when it is reached). */
  goal_ratio: number;
  /** Members ranked by what they cleared this week. */
  week_leaderboard: readonly CrewMemberView[];
  is_member: boolean;
  /** The signed-in creator leads it. */
  is_lead: boolean;
  invite_url: string;
  /** The signed-in creator could join it now. */
  can_join: boolean;
  join_blocked_reason?: string;
}

export interface CrewsView {
  mine?: CrewView;
  discover: readonly CrewView[];
  /** Leading a crew opens at Gold. */
  can_lead: boolean;
  lead_blocked_reason?: string;
}

type CrewDb = Db<"crews" | "crew_members" | "creators" | "session">;

function crewView(db: CrewDb, c: Crew): CrewView {
  const me = db.session.creator_id;
  const mine = me ? groupBy(db.crew_members, "creator", (m) => m.creator_id).get(me)[0] : undefined;
  const members = groupBy(db.crew_members, "crew", (m) => m.crew_id)
    .get(c.id)
    .map((m): CrewMemberView => ({ ...m, creator: db.creators[m.creator_id] }))
    .filter((m) => m.creator !== undefined);
  let blocked: string | undefined;
  if (mine) blocked = mine.crew_id === c.id ? "You are in this crew." : "You are already in a crew. Leave it first.";
  else if (c.member_count >= CONSTANTS.crews.max_members) blocked = "This crew is full.";
  else if (!c.open) blocked = "This crew is invite-only. Ask the lead for the code.";
  return {
    ...c,
    lead: db.creators[c.lead_creator_id],
    members: members.slice().sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : asc(a.joined_at, b.joined_at))),
    goal_ratio: c.weekly_goal_cents > 0 ? Math.min(1, c.week_cleared_cents / c.weekly_goal_cents) : 0,
    week_leaderboard: members.slice().sort((a, b) => desc(a.week_cleared_cents, b.week_cleared_cents)),
    is_member: mine?.crew_id === c.id,
    is_lead: c.lead_creator_id === me,
    invite_url: `joinflowd.io/crew/${c.invite_code}`,
    can_join: blocked === undefined && me !== null,
    ...(blocked ? { join_blocked_reason: blocked } : {}),
  };
}

/** The signed-in creator's crew and the crews they can join. */
export const selectCrews = defineSelector(["crews", "crew_members", "creators", "session"] as const, (db: CrewDb): CrewsView => {
  const me = db.session.creator_id;
  const creator = me ? db.creators[me] : undefined;
  const membership = me ? groupBy(db.crew_members, "creator", (m) => m.creator_id).get(me)[0] : undefined;
  const crews = valuesOf(db.crews).map((c) => crewView(db, c));
  const canLead = creator ? tierAtLeast(creator.tier, CONSTANTS.crews.lead_min_tier) && !membership : false;
  return {
    ...(membership ? { mine: crews.find((c) => c.id === membership.crew_id) } : {}),
    discover: crews.filter((c) => c.id !== membership?.crew_id).sort((a, b) => Number(b.can_join) - Number(a.can_join) || asc(a.week_rank, b.week_rank)),
    can_lead: canLead,
    ...(creator && !tierAtLeast(creator.tier, CONSTANTS.crews.lead_min_tier) ? { lead_blocked_reason: "Leading a crew opens at Gold. You can join any open crew now." } : membership ? { lead_blocked_reason: "Leave your current crew to start a new one." } : {}),
  };
});

// ── tournaments ────────────────────────────────────────────────────────────────────────────────

export interface EntryView extends TournamentEntry {
  creator: Creator;
  is_me: boolean;
}

export interface MatchupView extends Matchup {
  a?: EntryView;
  b?: EntryView;
  winner?: EntryView;
}

export interface RoundView extends Omit<TournamentRound, "matchups"> {
  matchups: readonly MatchupView[];
}

export interface TournamentView extends Omit<Tournament, "rounds"> {
  entries: readonly EntryView[];
  my_entry?: EntryView;
  /** Standings: placements when complete, otherwise by hook points. */
  standings: readonly EntryView[];
  rounds: readonly RoundView[];
  /** Entries open now and the creator may enter. */
  can_enter: boolean;
  /** Why not, in plain words. */
  enter_blocked_reason?: string;
  hours_to_start: number | null;
  hours_to_end: number | null;
  public_url: string;
}

type TournDb = Db<"tournaments" | "tournament_entries" | "creators" | "clock" | "session">;

function tournamentView(db: TournDb, t: Tournament): TournamentView {
  const me = db.session.creator_id;
  const creator = me ? db.creators[me] : undefined;
  const entries = groupBy(db.tournament_entries, "tournament", (e) => e.tournament_id)
    .get(t.id)
    .map((e): EntryView => ({ ...e, creator: db.creators[e.creator_id], is_me: e.creator_id === me }))
    .filter((e) => e.creator !== undefined);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const now = toMs(db.clock.now);
  const mine = entries.find((e) => e.is_me);
  let blocked: string | undefined;
  if (!creator) blocked = "Sign in as a creator to enter.";
  else if (mine) blocked = "You already entered.";
  else if (t.status === "complete" || t.status === "judging" || t.status === "cancelled") blocked = t.status === "cancelled" ? "This tournament was cancelled." : "This tournament is over.";
  else if (t.status === "announced" && toMs(t.entries_open_at) > now) blocked = "Entries are not open yet.";
  else if (t.min_tier && !tierAtLeast(creator.tier, t.min_tier)) blocked = `This tournament is for ${t.min_tier} creators and above.`;
  else if (t.niche && !creator.niches.includes(t.niche)) blocked = `This tournament is for ${t.niche.replace(/_/g, " ")} creators.`;
  return {
    ...t,
    entries: entries.slice().sort((a, b) => asc(a.seed, b.seed)),
    ...(mine ? { my_entry: mine } : {}),
    standings: entries.slice().sort((a, b) => asc(a.placement ?? 999, b.placement ?? 999) || desc(a.hook_points, b.hook_points)),
    rounds: t.rounds.map((r) => ({ ...r, matchups: r.matchups.map((m): MatchupView => ({ ...m, ...(byId.get(m.entry_a_id) ? { a: byId.get(m.entry_a_id) } : {}), ...(byId.get(m.entry_b_id) ? { b: byId.get(m.entry_b_id) } : {}), ...(m.winner_entry_id && byId.get(m.winner_entry_id) ? { winner: byId.get(m.winner_entry_id) } : {}) })) })),
    can_enter: blocked === undefined,
    ...(blocked ? { enter_blocked_reason: blocked } : {}),
    hours_to_start: toMs(t.starts_at) > now ? hoursBetween(db.clock.now, t.starts_at) : null,
    hours_to_end: toMs(t.ends_at) > now ? hoursBetween(db.clock.now, t.ends_at) : null,
    public_url: `joinflowd.io/t/${t.id}`,
  };
}

export interface TournamentsView {
  live: readonly TournamentView[];
  open: readonly TournamentView[];
  upcoming: readonly TournamentView[];
  past: readonly TournamentView[];
  /** The tournaments the signed-in creator entered. */
  mine: readonly TournamentView[];
}

export const selectTournaments = defineSelector(["tournaments", "tournament_entries", "creators", "clock", "session"] as const, (db: TournDb): TournamentsView => {
  const all = valuesOf(db.tournaments).map((t) => tournamentView(db, t));
  return {
    live: all.filter((t) => t.status === "live" || t.status === "judging").sort((a, b) => asc(a.ends_at, b.ends_at)),
    open: all.filter((t) => t.status === "open").sort((a, b) => asc(a.starts_at, b.starts_at)),
    upcoming: all.filter((t) => t.status === "announced").sort((a, b) => asc(a.starts_at, b.starts_at)),
    past: all.filter((t) => t.status === "complete" || t.status === "cancelled").sort((a, b) => desc(a.ends_at, b.ends_at)),
    mine: all.filter((t) => t.my_entry !== undefined),
  };
});

export const selectTournament = defineSelector(["tournaments", "tournament_entries", "creators", "clock", "session"] as const, (db: TournDb, id: string | undefined): TournamentView | undefined => {
  const t = id ? db.tournaments[id] : undefined;
  return t ? tournamentView(db, t) : undefined;
});

// ── the Academy ────────────────────────────────────────────────────────────────────────────────

export interface LessonView extends Lesson {
  progress?: LessonProgress;
  status: LessonProgress["status"];
  /** The next lesson in the order, if any. */
  next_slug?: string;
  prev_slug?: string;
}

export interface AcademyView {
  lessons: readonly LessonView[];
  completed: number;
  total: number;
  /** Badges earned, by lesson. */
  badges: readonly { lesson_id: string; label: string }[];
  /** Reliability points from the Academy: 0.5 per lesson, capped at 5 across the course. */
  reliability_bonus: number;
  graduate: boolean;
  /** The first lesson not finished. */
  next?: LessonView;
  /** The Academy is free and never required. */
  note: string;
}

type AcademyDb = Db<"lessons" | "lesson_progress" | "session">;

function lessonViews(db: AcademyDb): LessonView[] {
  const me = db.session.creator_id;
  const progress = me ? groupBy(db.lesson_progress, "creator", (p) => p.creator_id).get(me) : [];
  const lessons = valuesOf(db.lessons).slice().sort((a, b) => asc(a.order, b.order));
  return lessons.map((l, i) => {
    const p = progress.find((x) => x.lesson_id === l.id);
    return { ...l, ...(p ? { progress: p } : {}), status: p?.status ?? "not_started", ...(lessons[i + 1] ? { next_slug: lessons[i + 1].slug } : {}), ...(lessons[i - 1] ? { prev_slug: lessons[i - 1].slug } : {}) };
  });
}

export const selectAcademy = defineSelector(["lessons", "lesson_progress", "session"] as const, (db: AcademyDb): AcademyView => {
  const lessons = lessonViews(db);
  const done = lessons.filter((l) => l.status === "completed");
  return {
    lessons,
    completed: done.length,
    total: lessons.length,
    badges: done.filter((l) => l.progress?.badge_awarded).map((l) => ({ lesson_id: l.id, label: l.badge_label })),
    reliability_bonus: Math.min(CONSTANTS.reliability.creator.academy_bonus_cap, done.length * CONSTANTS.reliability.creator.academy_bonus_per_lesson),
    graduate: lessons.length > 0 && done.length === lessons.length,
    ...(lessons.find((l) => l.status !== "completed") ? { next: lessons.find((l) => l.status !== "completed") } : {}),
    note: "Free, five minutes or less, never required.",
  };
});

/** One lesson by slug, with the creator's progress and its neighbours. */
export const selectLesson = defineSelector(["lessons", "lesson_progress", "session"] as const, (db: AcademyDb, slug: string | undefined): LessonView | undefined => lessonViews(db).find((l) => l.slug === slug));

// ── the Remix library and the formats ──────────────────────────────────────────────────────────

export interface FormatView extends Format {
  /** The studio link that loads this structure ("Remix this"). */
  remix_href: string;
}

export interface HookView extends Hook {
  remix_href: string;
}

export interface RemixFilter {
  format?: Format["id"];
  hook_type?: HookType;
  niche?: Niche;
  q?: string;
  /** Only the first six formats (the MVP set). */
  mvp?: boolean;
}

export interface RemixView {
  formats: readonly FormatView[];
  hooks: readonly HookView[];
  /** Posts that won on flowd, with the reasons they won ("why it won" cards). */
  winners: readonly { post_id: string; hook_words: string; why_it_won: readonly string[]; format_id?: Format["id"]; trial_rate: number | null }[];
}

/** Formats and hooks for the Remix library, with filters. The starting library is a hypothesis; the numbers beside it are settled-post results. */
export const selectRemix = defineSelector(["formats", "hooks", "posts"] as const, (db: Db<"formats" | "hooks" | "posts">, f: RemixFilter | undefined): RemixView => {
  const filter = f ?? {};
  const formats = valuesOf(db.formats)
    .filter((x) => (!filter.format || x.id === filter.format) && (!filter.mvp || x.mvp) && (!filter.niche || x.best_for_niches.includes(filter.niche)) && matchesQuery(filter.q, x.name, x.summary, x.why_it_works))
    .sort((a, b) => asc(a.rank, b.rank))
    .map((x): FormatView => ({ ...x, remix_href: `/creator/studio?format=${x.id}` }));
  const hooks = valuesOf(db.hooks)
    .filter((h) => (!filter.hook_type || h.hook_type === filter.hook_type) && (!filter.format || h.applies_to.includes(filter.format)) && matchesQuery(filter.q, h.template, h.when_to_use))
    .map((h): HookView => ({ ...h, remix_href: `/creator/studio?hook=${h.id}` }))
    .sort((a, b) => desc(a.stats.trial_rate, b.stats.trial_rate));
  const winners = valuesOf(db.posts)
    .filter((p) => p.is_winner && (p.why_it_won?.length ?? 0) > 0)
    .sort((a, b) => desc(a.funnel.trials, b.funnel.trials))
    .slice(0, 12)
    .map((p) => ({ post_id: p.id, hook_words: p.tags.hook_words, why_it_won: p.why_it_won ?? [], ...(p.tags.format_id ? { format_id: p.tags.format_id } : {}), trial_rate: p.funnel.installs >= 20 ? Math.round((p.funnel.trials / p.funnel.installs) * 10_000) / 10_000 : null }));
  return { formats, hooks, winners };
});

/** One format with its example script and shot list. */
export const selectFormat = defineSelector(["formats"] as const, (db: Db<"formats">, id: string | undefined): FormatView | undefined => (id && db.formats[id] ? { ...db.formats[id], remix_href: `/creator/studio?format=${id}` } : undefined));

// ── the public format and hook library ─────────────────────────────────────────────────────────

export interface TemplateFilter {
  niche?: Niche;
  hook_type?: HookType;
  category?: Category;
  difficulty?: Format["difficulty"];
  faceless?: boolean;
  q?: string;
}

/** The 11 winning formats with beat structure, why they work and settled-post stats. The starting library is a hypothesis; say so beside it. */
export const selectTemplates = defineSelector(["formats"] as const, (db: Db<"formats">, f: TemplateFilter | undefined): readonly FormatView[] =>
  valuesOf(db.formats)
    .filter((x) => (!f?.niche || x.best_for_niches.includes(f.niche)) && (!f?.hook_type || x.hook_types.includes(f.hook_type)) && (!f?.category || x.best_for_categories.includes(f.category)) && (!f?.difficulty || x.difficulty === f.difficulty) && (f?.faceless === undefined || x.faceless === f.faceless) && matchesQuery(f?.q, x.name, x.summary, x.why_it_works))
    .sort((a, b) => asc(a.rank, b.rank))
    .map((x): FormatView => ({ ...x, remix_href: `/creator/studio?format=${x.id}` })),
);

/** Slots the library's templates use beyond the engine's five. Missing ones fall back to neutral words so a template always reads. */
export interface HookFill extends Partial<HookSlots> {
  noun?: string;
  activity?: string;
  outcome?: string;
  pain?: string;
  days?: string;
}

const EXTRA_SLOTS = { noun: "app", activity: "this", outcome: "the result", pain: "the usual hassle", days: "7" } as const;

/** Fills every slot the library uses: the engine fills app, category, feature, goal and number; the rest come from `fill` or neutral words. */
function fillTemplate(template: string, fill: HookFill | undefined): string {
  const extra: Record<keyof typeof EXTRA_SLOTS, string> = { ...EXTRA_SLOTS, activity: fill?.activity ?? fill?.goal ?? EXTRA_SLOTS.activity, days: fill?.days ?? fill?.number ?? EXTRA_SLOTS.days, noun: fill?.noun ?? EXTRA_SLOTS.noun, outcome: fill?.outcome ?? EXTRA_SLOTS.outcome, pain: fill?.pain ?? EXTRA_SLOTS.pain };
  return fillHook(template, fill).replace(/{(noun|activity|outcome|pain|days)}/g, (_, key: keyof typeof EXTRA_SLOTS) => extra[key]);
}

export interface HookFilter {
  type?: HookType;
  format?: Format["id"];
  /** Show the example written for this category, if the hook has one. */
  category?: Category;
  q?: string;
  /** Pre-fill the template with this app, so a visitor sees their own hook. */
  fill?: HookFill;
}

export interface HookLibraryRow extends HookView {
  /** The template with the slots filled (the `fill` argument, else neutral defaults). */
  filled: string;
  /** The example written for the asked category, if the hook has one. */
  example?: string;
}

/** The hook library: seven types, ten or more hooks each, with templates filled for an app. */
export const selectHookLibrary = defineSelector(["hooks"] as const, (db: Db<"hooks">, f: HookFilter | undefined): readonly HookLibraryRow[] =>
  valuesOf(db.hooks)
    .filter((h) => (!f?.type || h.hook_type === f.type) && (!f?.format || h.applies_to.includes(f.format)) && matchesQuery(f?.q, h.template, h.when_to_use))
    .map((h): HookLibraryRow => {
      const example = f?.category ? h.examples.find((e) => e.category === f.category)?.text : undefined;
      return { ...h, remix_href: `/creator/studio?hook=${h.id}`, filled: fillTemplate(h.template, f?.fill), ...(example ? { example } : {}) };
    })
    .sort((a, b) => desc(a.stats.trial_rate, b.stats.trial_rate)),
);

// ── referrals ──────────────────────────────────────────────────────────────────────────────────

export interface ReferralView extends Referral {
  referee?: Creator;
  /** Days left in the 90-day reward window. */
  window_days_left: number | null;
  /** What this referee can still earn the referrer under the $100 cap. */
  cap_left_cents: number;
}

export interface ReferralsView {
  code: string;
  link: string;
  referrals: readonly ReferralView[];
  totals: { invited: number; joined: number; earning: number; earned_cents: number };
  /** The rules, in numbers: 5% for 90 days, capped at $100 per referee. Funded by flowd, never by the person invited. */
  rules: { rate: number; days: number; cap_per_referee_cents: number; funded_by: string };
}

export const selectReferrals = defineSelector(["referrals", "creators", "clock", "session"] as const, (db: Db<"referrals" | "creators" | "clock" | "session">): ReferralsView => {
  const me = db.session.creator_id ? db.creators[db.session.creator_id] : undefined;
  const list = me ? valuesOf(db.referrals).filter((r) => r.referrer_creator_id === me.id) : [];
  const views = list.map((r): ReferralView => ({ ...r, ...(r.referee_creator_id && db.creators[r.referee_creator_id] ? { referee: db.creators[r.referee_creator_id] } : {}), window_days_left: r.reward_window_ends_at ? Math.max(0, Math.ceil((toMs(r.reward_window_ends_at) - toMs(db.clock.now)) / 86_400_000)) : null, cap_left_cents: Math.max(0, r.reward_cap_cents - r.reward_earned_cents) })).sort((a, b) => desc(a.invited_at, b.invited_at));
  return {
    code: me?.referral_code ?? "",
    link: me ? referralLink(me.referral_code) : "",
    referrals: views,
    totals: { invited: views.length, joined: views.filter((r) => r.status !== "invited" && r.status !== "expired").length, earning: views.filter((r) => r.status === "earning").length, earned_cents: views.reduce((s, r) => s + r.reward_earned_cents, 0) },
    rules: { rate: CONSTANTS.referrals.creator_share_rate, days: CONSTANTS.referrals.creator_share_days, cap_per_referee_cents: CONSTANTS.referrals.creator_share_cap_per_referee_cents, funded_by: "flowd" },
  };
});

// ── Wrapped ────────────────────────────────────────────────────────────────────────────────────

export interface WrappedView {
  /** Every recap of the creator, newest first (month and year switch). */
  all: readonly Wrapped[];
  selected?: Wrapped;
  /** The best post of the period, resolved. */
  best_post_id?: string;
}

export const selectWrapped = defineSelector(["wrapped", "session"] as const, (db: Db<"wrapped" | "session">, id: string | undefined): WrappedView => {
  const me = db.session.creator_id;
  const all = me ? groupBy(db.wrapped, "creator", (w) => w.creator_id).get(me).slice().sort((a, b) => desc(a.period_end, b.period_end)) : [];
  const selected = (id ? all.find((w) => w.id === id || w.label === id) : undefined) ?? all[0];
  return { all, ...(selected ? { selected } : {}), ...(selected?.best_post_id ? { best_post_id: selected.best_post_id } : {}) };
});

// ── Wellbeing ──────────────────────────────────────────────────────────────────────────────────

export interface WellbeingView {
  settings: WellbeingSettings;
  /** Saved settings exist (otherwise these are the defaults, switched off). */
  saved: boolean;
  /** Pause keeps tier and streak while it runs. */
  paused: boolean;
  /** Your worst month in the last six and what to set aside, so a slow month is not a surprise. */
  worst_month?: { month: string; cleared_cents: number };
  set_aside: { rate: number; cents: number };
  resources: readonly { label: string; detail: string; href?: string }[];
}

export const selectWellbeing = defineSelector(["wellbeing_settings", "creators", "ledger", "tax_profiles", "clock", "session"] as const, (db: Db<"wellbeing_settings" | "creators" | "ledger" | "tax_profiles" | "clock" | "session">): WellbeingView => {
  const me = db.session.creator_id ? db.creators[db.session.creator_id] : undefined;
  const saved = me ? groupBy(db.wellbeing_settings, "creator", (w) => w.creator_id).get(me.id)[0] : undefined;
  const settings: WellbeingSettings = saved ?? { id: `wb_${(me?.handle ?? "creator").replace(/\./g, "_")}`, creator_id: me?.id ?? "", enabled: false, quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "America/Chicago" }, numbers_off: { enabled: false }, pace_goal: { enabled: false }, rest_weeks: [], leaderboard_opt_out: false, slack_mode: false, updated_at: db.clock.now };
  const byMonth = new Map<string, number>();
  if (me) for (const e of groupBy(db.ledger, "account", (x) => x.account).get(`creator:${me.id}`)) if (isEarning(e) && (e.status === "cleared" || e.status === "paid") && e.cleared_at) byMonth.set(e.cleared_at.slice(0, 7), (byMonth.get(e.cleared_at.slice(0, 7)) ?? 0) + e.amount_cents);
  const months = [...byMonth.entries()].sort((a, b) => desc(a[0], b[0])).slice(0, 7).slice(1);
  const worst = months.sort((a, b) => asc(a[1], b[1]))[0];
  const tax = me ? groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(me.id)[0] : undefined;
  return {
    settings,
    saved: saved !== undefined,
    paused: settings.paused_until !== undefined && toMs(settings.paused_until) > toMs(db.clock.now),
    ...(worst ? { worst_month: { month: worst[0], cleared_cents: worst[1] } } : {}),
    set_aside: { rate: tax?.set_aside_rate ?? CONSTANTS.tax.set_aside_rate, cents: tax?.set_aside_cents ?? 0 },
    resources: [
      { label: "988 Suicide and Crisis Lifeline (US)", detail: "Call or text 988, any time.", href: "https://988lifeline.org" },
      { label: "Creators 4 Mental Health", detail: "Peer support and resources made for creators.", href: "https://www.creators4mentalhealth.com" },
    ],
  };
});

// ── Scam Shield and Account Health ─────────────────────────────────────────────────────────────

export interface AccountHealthRow {
  account: SocialAccount;
  health: SocialAccount["health"];
  /** Guidance in plain words for this account. */
  guidance: string;
}

export interface SafetyView {
  /** Reports the signed-in person filed, with their case status and SLA. */
  reports: readonly (ScamReport & { sla_hours_left: number | null })[];
  accounts: readonly AccountHealthRow[];
  /** The rules, always visible: flowd never asks you to pay, and every payment is escrowed. */
  rules: readonly string[];
  checklist: readonly string[];
}

export const selectSafety = defineSelector(["scam_reports", "social_accounts", "clock", "session"] as const, (db: Db<"scam_reports" | "social_accounts" | "clock" | "session">): SafetyView => {
  const s = db.session;
  const reports = valuesOf(db.scam_reports)
    .filter((r) => (s.persona === "creator" && r.reporter_creator_id === s.creator_id) || (s.persona === "brand" && r.reporter_brand_id === s.brand_id) || s.persona === "admin")
    .sort((a, b) => desc(a.created_at, b.created_at))
    .map((r) => ({ ...r, sla_hours_left: r.status === "new" || r.status === "triaged" ? hoursBetween(db.clock.now, r.sla_due_at) : null }));
  const accounts = s.creator_id
    ? groupBy(db.social_accounts, "creator", (a) => a.creator_id)
        .get(s.creator_id)
        .filter((a) => a.status === "connected")
        .map((a): AccountHealthRow => ({ account: a, health: a.health, guidance: a.health.status === "good" ? "Healthy. Keep posting your own original videos." : a.health.status === "watch" ? "Watch this account: " + (a.health.notes[0] ?? "recent flags need a look.") : "At risk: " + (a.health.notes[0] ?? "resolve the strike before posting more bounty videos.") }))
    : [];
  return {
    reports,
    accounts,
    rules: [
      "flowd never asks you to pay to join a bounty. If someone does, report it.",
      "Every flowd payment goes through escrow. Anyone asking to be paid outside flowd is a red flag.",
      "Keep conversations in flowd. Moving to WhatsApp or Telegram removes escrow, Rights Cards and our help.",
      "You post from your own account. A bounty can never require a new or burner account.",
      "Links from flowd are always joinflowd.io. Do not open links you did not expect.",
    ],
    checklist: ["Is the brand Verified?", "Is the bounty Funded?", "Does the Rights Card say what you are agreeing to?", "Is the pay in the brief, in dollars?", "Is everything happening inside flowd?"],
  };
});

