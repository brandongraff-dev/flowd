/**
 * Ops: the launch control tower, the fraud, dispute, verification, safety and SLA queues, payout operations, the registries and model monitoring.
 * Counts that must not go stale (queue sizes, the next payout run, GMV) are recomputed from the tables, never read from a stored number.
 */

import type {
  AdminMetrics,
  Brand,
  Creator,
  FraudFlag,
  FraudFlagStatus,
  HoldReason,
  MlModel,
  Payout,
  PayoutRun,
  Post,
  ScamReport,
  ScamReason,
  Submission,
  TaxProfile,
  Verification,
  VerificationKind,
} from "@/lib/contract/types";
import { clockLabel, hoursBetween, nextClearingRun, nextWeeklyPayout, toMs } from "@/lib/engine";
import { liveAdminMetrics } from "@/lib/store/core/admin";
import { asList, asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { bountyView, type BountyDb, type BountyView } from "./bounties";

// ── the control tower ──────────────────────────────────────────────────────────────────────────

export interface AdminMetricsView extends AdminMetrics {
  /** The six day-90 targets with the gap to each. */
  gaps: readonly { id: string; label: string; actual: number; target: number; gap: number; met: boolean }[];
  /** Days since launch (day 0 is the launch date). */
  launch_day: number;
  /** The next Friday 18:00 UTC payout run, with hours to go. */
  payout_run: AdminMetrics["next_payout_run"] & { hours_left: number; label: string };
}

type AdminDb = Db<"admin_metrics" | "world" | "fraud_flags" | "disputes" | "verifications" | "scam_reports" | "submissions" | "payouts" | "ledger" | "posts" | "bounties" | "clock">;

/** The control tower: targets, market health and the numbers that follow the data (queues, next run, GMV), plus alerts. */
export const selectAdminMetrics = defineSelector(["admin_metrics", "world", "fraud_flags", "disputes", "verifications", "scam_reports", "submissions", "payouts", "ledger", "posts", "bounties", "clock"] as const, (db: AdminDb): AdminMetricsView => {
  const doc = db.admin_metrics;
  const live = liveAdminMetrics(db, db.clock.now);
  const next = live.next_payout_run;
  return {
    ...doc,
    as_of: db.clock.now,
    queues: live.queues,
    next_payout_run: next,
    summary: { ...doc.summary, ...live.summary },
    gaps: doc.targets.map((t) => ({ id: t.id, label: t.label, actual: t.actual, target: t.target, gap: Math.round((t.actual - t.target) * 1000) / 1000, met: t.status === "achieved" })),
    launch_day: Math.max(0, Math.floor((toMs(db.clock.now) - toMs(`${db.world.launch_date}T00:00:00Z`)) / 86_400_000)),
    payout_run: { ...next, hours_left: Math.max(0, hoursBetween(db.clock.now, next.scheduled_for)), label: `${clockLabel(next.scheduled_for)} UTC` },
  };
});

/** The demo clock: now, hours advanced since the seed, and the next scheduled runs. */
export interface DemoClockView {
  now: string;
  advanced_hours: number;
  next_clearing_run: string;
  next_payout_run: string;
  hours_to_payout: number;
}

export const selectDemoClock = defineSelector(["clock"] as const, (db: Db<"clock">): DemoClockView => ({
  now: db.clock.now,
  advanced_hours: db.clock.advanced_hours,
  next_clearing_run: nextClearingRun(db.clock.now),
  next_payout_run: nextWeeklyPayout(db.clock.now),
  hours_to_payout: Math.max(0, hoursBetween(db.clock.now, nextWeeklyPayout(db.clock.now))),
}));

// ── fraud ──────────────────────────────────────────────────────────────────────────────────────

export interface FraudCaseView extends FraudFlag {
  post: Post;
  creator: Creator;
  bounty: BountyView;
  /** Hours until the 24-hour review SLA (negative once overdue). */
  sla_hours_left: number | null;
  /** The case is waiting on Ops (open or monitoring). */
  open: boolean;
}

export interface FraudFilter {
  status?: FraudFlagStatus | readonly FraudFlagStatus[] | "open";
  /** At least this fraud score. */
  min_score?: number;
  brand?: string;
  q?: string;
  sort?: "risk" | "money" | "age";
}

export interface FraudQueue {
  items: readonly FraudCaseView[];
  /** Cases per fraud rule (signal), for the filter chips. */
  by_signal: readonly { signal: string; count: number }[];
  open_count: number;
  /** Money held across open cases. */
  stake_cents: number;
}

type FraudDb = BountyDb & Db<"fraud_flags" | "posts" | "creators">;
const FRAUD_KEYS = ["fraud_flags", "posts", "creators", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock"] as const;

function fraudCase(db: FraudDb, f: FraudFlag): FraudCaseView {
  const open = f.status === "open" || f.status === "monitoring";
  return { ...f, post: db.posts[f.post_id], creator: db.creators[f.creator_id], bounty: bountyView(db, db.bounties[f.bounty_id]), sla_hours_left: open ? hoursBetween(db.clock.now, f.sla_due_at) : null, open };
}

/** The fraud queue, sorted by risk and money at stake. */
export const selectFraudQueue = defineSelector(FRAUD_KEYS, (db: FraudDb, f: FraudFilter | undefined): FraudQueue => {
  const wanted = f?.status === "open" || f?.status === undefined ? (["open", "monitoring"] as const) : asList(f.status);
  const all = valuesOf(db.fraud_flags);
  const items = all
    .filter((x) => (!wanted || (wanted as readonly string[]).includes(x.status)) && (f?.min_score === undefined || x.score >= f.min_score) && (!f?.brand || x.brand_id === f.brand))
    .map((x) => fraudCase(db, x))
    .filter((x) => matchesQuery(f?.q, x.creator?.handle, x.bounty?.title, x.id, x.post_id));
  const sort = f?.sort ?? "risk";
  items.sort((a, b) => (sort === "money" ? desc(a.money_at_stake_cents, b.money_at_stake_cents) : sort === "age" ? asc(a.opened_at, b.opened_at) : desc(a.score, b.score) || desc(a.money_at_stake_cents, b.money_at_stake_cents)));
  const signals = new Map<string, number>();
  for (const x of items) for (const s of x.signals) signals.set(s.signal, (signals.get(s.signal) ?? 0) + 1);
  const open = all.filter((x) => x.status === "open" || x.status === "monitoring");
  return { items, by_signal: [...signals.entries()].map(([signal, count]) => ({ signal, count })).sort((a, b) => b.count - a.count), open_count: open.length, stake_cents: open.reduce((s, x) => s + x.money_at_stake_cents, 0) };
});

export interface FraudCaseDetail extends FraudCaseView {
  /** The creator's other flags, newest first. */
  history: readonly FraudCaseView[];
  /** The post this one duplicates, if the duplicate hash matched. */
  duplicate_of?: Post;
  /** The creator's 28-day posts (for the pattern across posts). */
  creator_posts: readonly Post[];
}

export const selectFraudCase = defineSelector(FRAUD_KEYS, (db: FraudDb, id: string | undefined): FraudCaseDetail | undefined => {
  const f = id ? db.fraud_flags[id] : undefined;
  if (!f) return undefined;
  const base = fraudCase(db, f);
  return {
    ...base,
    history: valuesOf(db.fraud_flags).filter((x) => x.creator_id === f.creator_id && x.id !== f.id).map((x) => fraudCase(db, x)).sort((a, b) => desc(a.opened_at, b.opened_at)),
    ...(f.duplicate_of_post_id && db.posts[f.duplicate_of_post_id] ? { duplicate_of: db.posts[f.duplicate_of_post_id] } : {}),
    creator_posts: groupBy(db.posts, "creator", (p) => p.creator_id).get(f.creator_id).slice().sort((a, b) => desc(a.posted_at, b.posted_at)).slice(0, 10),
  };
});

// ── verification ───────────────────────────────────────────────────────────────────────────────

export interface VerificationRow extends Verification {
  creator?: Creator;
  brand?: Brand;
  /** Hours to the 24-hour SLA (negative once overdue); null when decided. */
  sla_hours_left: number | null;
  open: boolean;
}

export interface TaxRow {
  profile: TaxProfile;
  creator: Creator;
  /** The W-9 or W-8BEN waiting on someone. */
  waiting_on: "creator" | "ops" | null;
}

export interface VerificationQueue {
  creator_id: readonly VerificationRow[];
  brand_business: readonly VerificationRow[];
  tax: readonly TaxRow[];
  counts: { creator: number; brand: number; tax: number };
}

export interface VerificationFilter {
  kind?: VerificationKind;
  /** Include decided items. Default false. */
  all?: boolean;
}

export const selectVerificationQueue = defineSelector(["verifications", "creators", "brands", "tax_profiles", "clock"] as const, (db: Db<"verifications" | "creators" | "brands" | "tax_profiles" | "clock">, f: VerificationFilter | undefined): VerificationQueue => {
  const rows = valuesOf(db.verifications)
    .filter((v) => (!f?.kind || v.kind === f.kind) && (f?.all || v.status === "pending" || v.status === "needs_info"))
    .map((v): VerificationRow => ({ ...v, ...(v.creator_id && db.creators[v.creator_id] ? { creator: db.creators[v.creator_id] } : {}), ...(v.brand_id && db.brands[v.brand_id] ? { brand: db.brands[v.brand_id] } : {}), sla_hours_left: v.status === "pending" || v.status === "needs_info" ? hoursBetween(db.clock.now, v.sla_due_at) : null, open: v.status === "pending" || v.status === "needs_info" }))
    .sort((a, b) => asc(a.sla_due_at, b.sla_due_at));
  const tax = valuesOf(db.tax_profiles)
    .filter((t) => t.status === "requested" || t.status === "submitted" || t.status === "rejected")
    .map((t): TaxRow => ({ profile: t, creator: db.creators[t.creator_id], waiting_on: t.status === "submitted" ? "ops" : "creator" }))
    .filter((t) => t.creator !== undefined);
  const creatorRows = rows.filter((r) => r.subject_kind === "creator");
  const brandRows = rows.filter((r) => r.subject_kind === "brand");
  return { creator_id: creatorRows, brand_business: brandRows, tax, counts: { creator: creatorRows.filter((r) => r.open).length, brand: brandRows.filter((r) => r.open).length, tax: tax.length } };
});

// ── payouts ────────────────────────────────────────────────────────────────────────────────────

export interface HeldPayout {
  payout: Payout;
  creator: Creator;
  reason: HoldReason;
  /** Which holds Ops can clear itself: a fraud or dispute hold has its own queue; identity, tax and method wait for the creator. */
  releasable_by_ops: boolean;
}

export interface PayoutOps {
  /** The next Friday run: count, total and the holds grouped by named reason. */
  next_run: { run_id: string; scheduled_for: string; hours_left: number; payouts: number; total_cents: number; held: number; held_cents: number; holds: readonly { reason: HoldReason; count: number; cents: number }[] };
  held: readonly HeldPayout[];
  failed: readonly (Payout & { creator: Creator })[];
  runs: readonly PayoutRun[];
  /** Instant cash-outs in the last 7 days: volume and fees. */
  instant_7d: { count: number; gross_cents: number; fee_cents: number };
  /** Creators with cleared money and no usable payout method. */
  method_issues: readonly { creator: Creator; cleared_cents: number }[];
}

export const selectPayoutOps = defineSelector(["payouts", "payout_runs", "creators", "ledger", "clock"] as const, (db: Db<"payouts" | "payout_runs" | "creators" | "ledger" | "clock">): PayoutOps => {
  const now = db.clock.now;
  const runAt = nextWeeklyPayout(now);
  const runId = `run_${runAt.slice(0, 10)}`;
  const run = db.payout_runs[runId];
  const inRun = valuesOf(db.payouts).filter((p) => p.run_id === runId && p.status !== "cancelled");
  const held = inRun.filter((p) => p.status === "held" && p.hold_reason !== undefined);
  const holds = new Map<HoldReason, { count: number; cents: number }>();
  for (const p of held) {
    const cur = holds.get(p.hold_reason as HoldReason) ?? { count: 0, cents: 0 };
    holds.set(p.hold_reason as HoldReason, { count: cur.count + 1, cents: cur.cents + p.gross_cents });
  }
  const week = toMs(now) - 7 * 86_400_000;
  const instant = valuesOf(db.payouts).filter((p) => p.kind === "instant" && toMs(p.requested_at) >= week && p.status !== "failed" && p.status !== "cancelled");
  const cleared = new Map<string, number>();
  for (const e of valuesOf(db.ledger)) if (e.account.startsWith("creator:") && e.status === "cleared" && !e.payout_id && e.amount_cents > 0) cleared.set(e.account.slice(8), (cleared.get(e.account.slice(8)) ?? 0) + e.amount_cents);
  return {
    next_run: { run_id: runId, scheduled_for: runAt, hours_left: Math.max(0, hoursBetween(now, runAt)), payouts: inRun.length, total_cents: inRun.reduce((s, p) => s + p.gross_cents, 0), held: held.length, held_cents: held.reduce((s, p) => s + p.gross_cents, 0), holds: run && run.holds.length > 0 && inRun.length === run.payouts_count ? run.holds : [...holds.entries()].map(([reason, v]) => ({ reason, ...v })) },
    held: held.map((p) => ({ payout: p, creator: db.creators[p.creator_id], reason: p.hold_reason as HoldReason, releasable_by_ops: p.hold_reason === "admin_hold" })).filter((h) => h.creator !== undefined).sort((a, b) => desc(a.payout.gross_cents, b.payout.gross_cents)),
    failed: valuesOf(db.payouts).filter((p) => p.status === "failed").map((p) => ({ ...p, creator: db.creators[p.creator_id] })).filter((p) => p.creator !== undefined),
    runs: valuesOf(db.payout_runs).slice().sort((a, b) => desc(a.run_date, b.run_date)).slice(0, 12),
    instant_7d: { count: instant.length, gross_cents: instant.reduce((s, p) => s + p.gross_cents, 0), fee_cents: instant.reduce((s, p) => s + p.fee_cents, 0) },
    method_issues: [...cleared.entries()].map(([id, cents]) => ({ creator: db.creators[id], cleared_cents: cents })).filter((x) => x.creator && (!x.creator.payout_method || x.creator.payout_method.status !== "active")).sort((a, b) => desc(a.cleared_cents, b.cleared_cents)),
  };
});

// ── the review SLA desk ────────────────────────────────────────────────────────────────────────

export interface SlaRow {
  submission: Submission;
  creator: Creator;
  bounty: BountyView;
  brand: Brand;
  hours_in_queue: number;
  state: "stale" | "breached";
  /** QA is clean, so Ops can approve it under the "approve if clean" policy. */
  qa_clean: boolean;
}

export interface SlaDesk {
  stale: readonly SlaRow[];
  breached: readonly SlaRow[];
  /** Per brand: how many videos are over the line, worst first. */
  by_brand: readonly { brand: Brand; stale: number; breached: number; oldest_hours: number }[];
  /** Approved but unused: videos approaching the 30-day release to the Spec Market. */
  unused: readonly { submission: Submission; creator: Creator; days_unused: number }[];
}

export const selectSlaDesk = defineSelector(["submissions", "creators", "bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock"] as const, (db: BountyDb & Db<"submissions" | "creators">): SlaDesk => {
  const now = db.clock.now;
  const rows: SlaRow[] = [];
  for (const s of valuesOf(db.submissions)) {
    if (s.status !== "in_review" || (s.sla_state !== "stale" && s.sla_state !== "breached")) continue;
    const v = s.versions[s.version - 1];
    rows.push({ submission: s, creator: db.creators[s.creator_id], bounty: bountyView(db, db.bounties[s.bounty_id]), brand: db.brands[s.brand_id], hours_in_queue: hoursBetween(v?.submitted_at ?? s.submitted_at, now), state: s.sla_state, qa_clean: v !== undefined && v.qa_fail === 0 && v.qa_warn === 0 });
  }
  const sorted = rows.sort((a, b) => desc(a.hours_in_queue, b.hours_in_queue));
  const brands = new Map<string, { brand: Brand; stale: number; breached: number; oldest_hours: number }>();
  for (const r of sorted) {
    const cur = brands.get(r.brand.id) ?? { brand: r.brand, stale: 0, breached: 0, oldest_hours: 0 };
    if (r.state === "stale") cur.stale += 1;
    else cur.breached += 1;
    cur.oldest_hours = Math.max(cur.oldest_hours, r.hours_in_queue);
    brands.set(r.brand.id, cur);
  }
  return {
    stale: sorted.filter((r) => r.state === "stale"),
    breached: sorted.filter((r) => r.state === "breached"),
    by_brand: [...brands.values()].sort((a, b) => desc(a.breached, b.breached) || desc(a.oldest_hours, b.oldest_hours)),
    unused: valuesOf(db.submissions)
      .filter((s) => s.status === "approved" && s.approved_at !== undefined && hoursBetween(s.approved_at, now) >= 24 * 20)
      .map((s) => ({ submission: s, creator: db.creators[s.creator_id], days_unused: Math.floor(hoursBetween(s.approved_at as string, now) / 24) }))
      .sort((a, b) => desc(a.days_unused, b.days_unused)),
  };
});

// ── safety ─────────────────────────────────────────────────────────────────────────────────────

export interface SafetyRow extends ScamReport {
  /** The reporter and the target, by name. */
  reporter_label: string;
  target_label: string;
  sla_hours_left: number | null;
  open: boolean;
}

export interface SafetyQueue {
  items: readonly SafetyRow[];
  /** Reports per reason, for the filter chips. */
  by_reason: readonly { reason: ScamReason; count: number }[];
  /** Targets reported more than once. */
  repeat_targets: readonly { target_kind: string; target_id: string; label: string; count: number }[];
  /** Open reports that are pay-to-join detections. */
  pay_to_join_open: number;
  counts: { new: number; triaged: number; confirmed: number };
}

export interface SafetyFilter {
  status?: ScamReport["status"] | readonly ScamReport["status"][] | "open";
  reason?: ScamReason;
  q?: string;
}

export const selectSafetyQueue = defineSelector(["scam_reports", "creators", "brands", "bounties", "clock"] as const, (db: Db<"scam_reports" | "creators" | "brands" | "bounties" | "clock">, f: SafetyFilter | undefined): SafetyQueue => {
  const all = valuesOf(db.scam_reports);
  const open = (r: ScamReport): boolean => r.status === "new" || r.status === "triaged" || r.status === "confirmed";
  const wanted = f?.status === "open" || f?.status === undefined ? undefined : asList(f.status);
  const labelOf = (kind: string, id: string): string => (kind === "brand" ? db.brands[id]?.name : kind === "creator" ? `@${db.creators[id]?.handle}` : kind === "bounty" ? db.bounties[id]?.title : id) ?? id;
  const rows = all
    .filter((r) => (f?.status === "open" || f?.status === undefined ? open(r) : wanted?.includes(r.status)) && (!f?.reason || r.reason === f.reason))
    .map((r): SafetyRow => ({ ...r, reporter_label: r.reporter_creator_id ? `@${db.creators[r.reporter_creator_id]?.handle ?? "creator"}` : r.reporter_brand_id ? (db.brands[r.reporter_brand_id]?.name ?? "A brand") : "Anonymous", target_label: labelOf(r.target_kind, r.target_id), sla_hours_left: r.status === "new" || r.status === "triaged" ? hoursBetween(db.clock.now, r.sla_due_at) : null, open: open(r) }))
    .filter((r) => matchesQuery(f?.q, r.description, r.case_id, r.target_label, r.reporter_label))
    .sort((a, b) => asc(a.sla_due_at, b.sla_due_at));
  const reasons = new Map<ScamReason, number>();
  for (const r of rows) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
  const targets = new Map<string, { target_kind: string; target_id: string; count: number }>();
  for (const r of all) {
    const key = `${r.target_kind}:${r.target_id}`;
    const cur = targets.get(key) ?? { target_kind: r.target_kind, target_id: r.target_id, count: 0 };
    cur.count += 1;
    targets.set(key, cur);
  }
  return {
    items: rows,
    by_reason: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    repeat_targets: [...targets.values()].filter((t) => t.count > 1).map((t) => ({ ...t, label: labelOf(t.target_kind, t.target_id) })).sort((a, b) => b.count - a.count),
    pay_to_join_open: all.filter((r) => open(r) && r.reason === "pay_to_join").length,
    counts: { new: all.filter((r) => r.status === "new").length, triaged: all.filter((r) => r.status === "triaged").length, confirmed: all.filter((r) => r.status === "confirmed").length },
  };
});

// ── registries ─────────────────────────────────────────────────────────────────────────────────

export interface BountyRegistryRow {
  bounty: BountyView;
  /** Videos waiting and the oldest wait. */
  in_review: number;
  oldest_hours: number | null;
  lint_overrides: number;
}

export interface BountyRegistryFilter {
  status?: BountyView["status"] | readonly BountyView["status"][];
  brand?: string;
  funded?: boolean;
  q?: string;
}

export const selectBountyRegistry = defineSelector(["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "submissions", "clock"] as const, (db: BountyDb & Db<"submissions">, f: BountyRegistryFilter | undefined): readonly BountyRegistryRow[] => {
  const wanted = asList(f?.status);
  return valuesOf(db.bounties)
    .filter((b) => (!wanted || wanted.includes(b.status)) && (!f?.brand || b.brand_id === f.brand) && (f?.funded === undefined || b.funded === f.funded) && matchesQuery(f?.q, b.title, db.apps[b.app_id]?.name, db.brands[b.brand_id]?.name, b.id))
    .map((b): BountyRegistryRow => {
      const waiting = groupBy(db.submissions, "bounty", (s) => s.bounty_id).get(b.id).filter((s) => s.status === "in_review");
      return { bounty: bountyView(db, b), in_review: waiting.length, oldest_hours: waiting.length > 0 ? Math.max(...waiting.map((s) => hoursBetween(s.versions[s.version - 1]?.submitted_at ?? s.submitted_at, db.clock.now))) : null, lint_overrides: b.lint_overrides?.length ?? 0 };
    })
    .sort((a, b) => desc(a.bounty.updated_at, b.bounty.updated_at));
});

export interface CreatorRegistryRow {
  creator: Creator;
  /** Open fraud flags and confirmed ones in the last 90 days. */
  fraud_open: number;
  fraud_confirmed: number;
  on_hold: boolean;
  payout_hold: HoldReason | null;
  cleared_unpaid_cents: number;
}

export interface CreatorRegistryFilter {
  q?: string;
  tier?: Creator["tier"];
  /** Only creators with open fraud flags. */
  flagged?: boolean;
  on_hold?: boolean;
  limit?: number;
}

export const selectCreatorRegistry = defineSelector(["creators", "users", "fraud_flags", "tax_profiles", "ledger"] as const, (db: Db<"creators" | "users" | "fraud_flags" | "tax_profiles" | "ledger">, f: CreatorRegistryFilter | undefined): readonly CreatorRegistryRow[] => {
  const cleared = new Map<string, number>();
  for (const e of valuesOf(db.ledger)) if (e.account.startsWith("creator:") && e.status === "cleared" && !e.payout_id && e.amount_cents > 0) cleared.set(e.account.slice(8), (cleared.get(e.account.slice(8)) ?? 0) + e.amount_cents);
  const rows = valuesOf(db.creators)
    .filter((c) => (!f?.tier || c.tier === f.tier) && matchesQuery(f?.q, c.handle, c.display_name, c.id))
    .map((c): CreatorRegistryRow => {
      const flags = valuesOf(db.fraud_flags).filter((x) => x.creator_id === c.id);
      const tax = groupBy(db.tax_profiles, "creator", (t) => t.creator_id).get(c.id)[0];
      return {
        creator: c,
        fraud_open: flags.filter((x) => x.status === "open" || x.status === "monitoring").length,
        fraud_confirmed: flags.filter((x) => x.status === "confirmed").length,
        on_hold: db.users[c.user_id]?.status === "suspended",
        payout_hold: !c.payout_method || c.payout_method.status !== "active" ? "payout_method_missing" : c.verification_status !== "verified" ? "identity_check" : !tax || tax.status !== "verified" ? "tax_info_missing" : null,
        cleared_unpaid_cents: cleared.get(c.id) ?? 0,
      };
    })
    .filter((r) => (!f?.flagged || r.fraud_open > 0) && (f?.on_hold === undefined || r.on_hold === f.on_hold))
    .sort((a, b) => desc(a.creator.lifetime_cleared_cents, b.creator.lifetime_cleared_cents));
  return f?.limit ? rows.slice(0, f.limit) : rows;
});

export interface BrandRegistryRow {
  brand: Brand;
  scorecard_score: number | null;
  open_disputes: number;
  live_bounties: number;
  on_hold: boolean;
}

export const selectBrandRegistry = defineSelector(["brands", "brand_scorecards", "disputes", "bounties", "brand_members", "users"] as const, (db: Db<"brands" | "brand_scorecards" | "disputes" | "bounties" | "brand_members" | "users">, f: { q?: string; plan?: Brand["plan"] } | undefined): readonly BrandRegistryRow[] =>
  valuesOf(db.brands)
    .filter((b) => b.kind !== "platform" && (!f?.plan || b.plan === f.plan) && matchesQuery(f?.q, b.name, b.slug, b.id))
    .map((b): BrandRegistryRow => ({
      brand: b,
      scorecard_score: groupBy(db.brand_scorecards, "brand", (s) => s.brand_id).get(b.id)[0]?.reliability_score ?? null,
      open_disputes: groupBy(db.disputes, "brand", (d) => d.brand_id).get(b.id).filter((d) => d.status === "open" || d.status === "evidence_requested" || d.status === "under_review").length,
      live_bounties: groupBy(db.bounties, "brand", (x) => x.brand_id).get(b.id).filter((x) => x.status === "live").length,
      on_hold: groupBy(db.brand_members, "brand", (m) => m.brand_id).get(b.id).some((m) => db.users[m.user_id]?.status === "suspended"),
    }))
    .sort((a, b) => desc(a.live_bounties, b.live_bounties)),
);

// ── ML monitoring ──────────────────────────────────────────────────────────────────────────────

export interface MlModelView extends MlModel {
  /** Settled posts so far against the count at which learned scoring is compared with the checklist. */
  readiness: { settled_posts: number; needed: number; ratio: number };
}

export const selectMlModels = defineSelector(["ml_models", "posts"] as const, (db: Db<"ml_models" | "posts">): readonly MlModelView[] => {
  const settled = valuesOf(db.posts).filter((p) => p.status === "cleared" || p.status === "paid").length;
  return valuesOf(db.ml_models)
    .map((m): MlModelView => ({ ...m, readiness: { settled_posts: settled, needed: m.learned_ready_at_posts, ratio: m.learned_ready_at_posts > 0 ? Math.min(1, settled / m.learned_ready_at_posts) : 1 } }))
    .sort((a, b) => asc(a.name, b.name));
});

/** The audit trail of Ops actions (the notification lines every Ops action leaves), newest first. */
export const selectAdminAudit = defineSelector(["notifications", "session"] as const, (db: Db<"notifications" | "session">, limit: number | undefined): readonly { id: string; at: string; action: string; detail: string; target_kind?: string; target_id?: string }[] =>
  valuesOf(db.notifications)
    .filter((n) => n.audience === "admin" && n.ref_kind === "audit")
    .sort((a, b) => desc(a.created_at, b.created_at))
    .slice(0, limit ?? 50)
    .map((n) => ({ id: n.id, at: n.created_at, action: n.title.replace(/^Audit: /, ""), detail: n.body, ...(n.ref_id ? { target_id: n.ref_id } : {}) })),
);

