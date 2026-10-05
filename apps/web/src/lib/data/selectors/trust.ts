/**
 * Trust surfaces: the Rights Vault, Compliance QA, disputes and appeals, and the Brand Scorecard.
 */

import type {
  Ad,
  App,
  Bounty,
  Brand,
  BrandScorecard,
  ComplianceAudit,
  ComplianceCheckItem,
  Creator,
  Dispute,
  DisputeStatus,
  Post,
  ReasonCode,
  RightsCard,
  RightsGrant,
  Submission,
} from "@/lib/contract/types";
import {
  brandBandLabel,
  daysLeft,
  decidesInAbout,
  hoursBetween,
  renewalQuote,
  rightsLines,
  rightsSummary,
  rightsVault,
  scorecardSample,
  takeRateFor,
  toMs,
  type RenewalQuote,
  type RightsLine,
  type RightsVault,
} from "@/lib/engine";
import { asList, asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { bountyView, mineBrandId, type BountyView } from "./bounties";

// ── Rights Vault ───────────────────────────────────────────────────────────────────────────────

export interface VaultRow extends RightsGrant {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  app: App;
  /** Days until the rights end (fractional; negative once ended); null for organic posting, which has no end. */
  days_left: number | null;
  /** What one more 30 days costs the brand: the creator's 25% share and the plan fee on top. */
  renewal_per_30: { price_cents: number; fee_cents: number; total_cents: number };
  ad?: Ad;
}

export interface RightsVaultView {
  /** Every licence of the brand, soonest end first (organic last). */
  rows: readonly VaultRow[];
  /** Expired, ending in 7 / 14 / 30 days, later, and no end, with the renewal exposure and the alerts due now. */
  buckets: RightsVault<VaultRow>;
  counts: { total: number; active: number; expiring_30: number; expired: number; ads_depending: number };
}

type VaultDb = Db<"rights_grants" | "posts" | "creators" | "bounties" | "apps" | "brands" | "ads" | "clock" | "session">;

function vaultRow(db: VaultDb, g: RightsGrant, takeRate: number): VaultRow {
  const quote = renewalQuote({ base_fee_cents: g.base_fee_cents, renewal_pct_per_30d: g.renewal_pct_per_30d, extra_days: 30, take_rate: takeRate });
  return {
    ...g,
    post: db.posts[g.post_id],
    creator: db.creators[g.creator_id],
    bounty: db.bounties[g.bounty_id],
    app: db.apps[g.app_id],
    days_left: g.ends_at ? daysLeft(g.ends_at, db.clock.now) : null,
    renewal_per_30: { price_cents: quote.price_cents, fee_cents: quote.fee_cents, total_cents: quote.total_cents },
    ...(g.ad_id && db.ads[g.ad_id] ? { ad: db.ads[g.ad_id] } : {}),
  };
}

/** The brand's Rights Vault: licences by how soon they end, with renewal prices and the alerts due now (30, 14 and 7 days). */
export const selectRightsVault = defineSelector(["rights_grants", "posts", "creators", "bounties", "apps", "brands", "ads", "clock", "session"] as const, (db: VaultDb, brand: string | undefined): RightsVaultView => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const b = brandId ? db.brands[brandId] : undefined;
  const empty = (): RightsVaultView => ({ rows: [], buckets: rightsVault<VaultRow>([], db.clock.now), counts: { total: 0, active: 0, expiring_30: 0, expired: 0, ads_depending: 0 } });
  if (!brandId || !b) return empty();
  const take = takeRateFor({ plan: b.plan, type: "direct" });
  const rows = groupBy(db.rights_grants, "brand", (g) => g.brand_id)
    .get(brandId)
    .filter((g) => g.status !== "revoked")
    .map((g) => vaultRow(db, g, take));
  const buckets = rightsVault(rows, db.clock.now);
  return {
    rows: [...buckets.expired, ...buckets.within_7, ...buckets.within_14, ...buckets.within_30, ...buckets.later, ...buckets.no_end],
    buckets,
    counts: {
      total: rows.length,
      active: rows.filter((r) => r.status === "active" || r.status === "expiring").length,
      expiring_30: buckets.within_7.length + buckets.within_14.length + buckets.within_30.length,
      expired: buckets.expired.length,
      ads_depending: rows.filter((r) => r.ad_id !== undefined && r.ad?.status !== "ended" && r.ad?.status !== "expired").length,
    },
  };
});

/** The price preview of a renewal: each started 30 days is 25% of the base fee to the creator, plus the plan fee. */
export const selectRenewalQuote = defineSelector(["rights_grants", "brands", "clock"] as const, (db: Db<"rights_grants" | "brands" | "clock">, arg: { grant_id: string; extra_days: number } | undefined): (RenewalQuote & { grant_id: string }) | null => {
  const g = arg ? db.rights_grants[arg.grant_id] : undefined;
  if (!arg || !g) return null;
  const brand = db.brands[g.brand_id];
  const from = g.ends_at && toMs(g.ends_at) > toMs(db.clock.now) ? g.ends_at : db.clock.now;
  return { grant_id: g.id, ...renewalQuote({ base_fee_cents: g.base_fee_cents, renewal_pct_per_30d: g.renewal_pct_per_30d, extra_days: arg.extra_days, take_rate: takeRateFor({ plan: brand?.plan ?? "free", type: "direct" }), current_ends_at: from }) };
});

export interface MyLicence extends RightsGrant {
  post: Post;
  brand: Brand;
  bounty: Bounty;
  days_left: number | null;
  /** What the creator earns if the brand renews for 30 days. */
  renewal_earns_cents: number;
  ad?: Ad;
  /** Can the creator ask Ops to revoke it (paid-ad and Spark grants; organic posting is part of the bounty). */
  can_request_revoke: boolean;
}

/** "My licences" for a creator: where each video runs, the term, renewals and what is running as an ad. AI likeness is off by default. */
export const selectMyRights = defineSelector(["rights_grants", "posts", "brands", "bounties", "ads", "clock", "session"] as const, (db: Db<"rights_grants" | "posts" | "brands" | "bounties" | "ads" | "clock" | "session">, creator: string | undefined): readonly MyLicence[] => {
  const id = creator === undefined || creator === "mine" ? db.session.creator_id : creator;
  if (!id) return [];
  return groupBy(db.rights_grants, "creator", (g) => g.creator_id)
    .get(id)
    .filter((g) => g.status !== "revoked")
    .map((g): MyLicence => ({
      ...g,
      post: db.posts[g.post_id],
      brand: db.brands[g.brand_id],
      bounty: db.bounties[g.bounty_id],
      days_left: g.ends_at ? daysLeft(g.ends_at, db.clock.now) : null,
      renewal_earns_cents: g.renewal_price_cents,
      ...(g.ad_id && db.ads[g.ad_id] ? { ad: db.ads[g.ad_id] } : {}),
      can_request_revoke: g.scope !== "organic" && g.status !== "expired",
    }))
    .sort((a, b) => asc(a.ends_at ?? "9999", b.ends_at ?? "9999"));
});

/** A Rights Card in plain language: the lines, the one-line summary and the card itself. */
export const selectRightsCard = defineSelector(["bounties"] as const, (db: Db<"bounties">, bountyId: string | undefined): { card: RightsCard; lines: readonly RightsLine[]; summary: string } | undefined => {
  const b = bountyId ? db.bounties[bountyId] : undefined;
  return b ? { card: b.rights_card, lines: rightsLines(b.rights_card), summary: rightsSummary(b.rights_card) } : undefined;
});

// ── Compliance QA ──────────────────────────────────────────────────────────────────────────────

export interface ComplianceView extends ComplianceAudit {
  post: Post;
  creator: Creator;
  bounty: Bounty;
  app: App;
  failing: readonly ComplianceCheckItem[];
  warnings: readonly ComplianceCheckItem[];
  /** The failure still holds the post's money (not fixed, not waived). */
  blocking: boolean;
  /** Fixed by the creator or waived by the brand. */
  resolved: boolean;
}

export interface ComplianceFilter {
  /** A brand id or "mine". */
  brand?: string;
  status?: "fail" | "warn" | "pass" | "pending" | "blocking";
  bounty?: string;
  creator?: string;
  q?: string;
}

export interface ComplianceLog {
  loading: boolean;
  rows: readonly ComplianceView[];
  counts: { total: number; blocking: number; failing: number; warning: number; passing: number };
  /** The brand's own wording and lists, to edit beside the log. */
  defaults?: Brand["compliance_defaults"];
}

type ComplianceDb = Db<"compliance_checks" | "posts" | "creators" | "bounties" | "apps" | "brands" | "loaded" | "session">;

export const selectComplianceLog = defineSelector(
  ["compliance_checks", "posts", "creators", "bounties", "apps", "brands", "loaded", "session"] as const,
  (db: ComplianceDb, f: ComplianceFilter | undefined): ComplianceLog => {
    const filter = f ?? {};
    const brandId = filter.brand === undefined || filter.brand === "mine" ? db.session.brand_id : filter.brand;
    const loading = db.loaded.compliance_checks !== true;
    if (!brandId) return { loading, rows: [], counts: { total: 0, blocking: 0, failing: 0, warning: 0, passing: 0 } };
    const all = groupBy(db.compliance_checks, "brand", (c) => c.brand_id).get(brandId);
    const rows = all
      .map((c): ComplianceView => {
        const failing = c.checks.filter((x) => x.result === "fail");
        return { ...c, post: db.posts[c.post_id], creator: db.creators[c.creator_id], bounty: db.bounties[c.bounty_id], app: db.apps[db.bounties[c.bounty_id]?.app_id ?? ""], failing, warnings: c.checks.filter((x) => x.result === "warn"), blocking: c.blocks_settlement, resolved: c.fixed_at !== undefined || c.waived_by_member_id !== undefined };
      })
      .filter((c) => {
        if (filter.bounty && c.bounty_id !== filter.bounty) return false;
        if (filter.creator && c.creator_id !== filter.creator) return false;
        if (filter.status === "blocking") return c.blocking;
        if (filter.status && c.overall !== filter.status) return false;
        return matchesQuery(filter.q, c.creator?.handle, c.bounty?.title, c.id, ...c.checks.map((x) => x.message));
      })
      .sort((a, b) => Number(b.blocking) - Number(a.blocking) || desc(a.checked_at, b.checked_at));
    return {
      loading,
      rows,
      counts: { total: all.length, blocking: all.filter((c) => c.blocks_settlement).length, failing: all.filter((c) => c.overall === "fail").length, warning: all.filter((c) => c.overall === "warn").length, passing: all.filter((c) => c.overall === "pass").length },
      ...(db.brands[brandId] ? { defaults: db.brands[brandId].compliance_defaults } : {}),
    };
  },
  { ensure: ["compliance_checks"] },
);

// ── disputes and appeals ───────────────────────────────────────────────────────────────────────

export interface DisputeView extends Dispute {
  creator?: Creator;
  brand: Brand;
  bounty?: Bounty;
  post?: Post;
  submission?: Submission;
  /** Reply within 24 hours; resolve within 5 days (an appeal: 72 hours). */
  sla: {
    state: "on_track" | "due_soon" | "overdue" | "resolved";
    reply_hours_left: number | null;
    resolve_hours_left: number | null;
  };
  last_event: Dispute["events"][number];
  open: boolean;
}

export interface DisputeFilter {
  /** Only these statuses (or "open" = anything not resolved or withdrawn). */
  status?: DisputeStatus | readonly DisputeStatus[] | "open";
  kind?: Dispute["kind"];
  /** Rejection appeals only, or post disputes only. */
  appeals?: boolean;
  q?: string;
}

type DisputeViewDb = Db<"disputes" | "creators" | "brands" | "bounties" | "posts" | "submissions" | "clock">;
type DisputeDb = DisputeViewDb & Db<"session">;
const OPEN_STATUSES: readonly DisputeStatus[] = ["open", "evidence_requested", "under_review"];

function disputeView(db: DisputeViewDb, d: Dispute): DisputeView {
  const now = db.clock.now;
  const open = OPEN_STATUSES.includes(d.status);
  const replyLeft = d.first_reply_at || !open ? null : hoursBetween(now, d.reply_due_at);
  const resolveLeft = open ? hoursBetween(now, d.resolution_due_at) : null;
  const state: DisputeView["sla"]["state"] = !open ? "resolved" : (replyLeft !== null && replyLeft < 0) || (resolveLeft !== null && resolveLeft < 0) ? "overdue" : (replyLeft !== null && replyLeft < 6) || (resolveLeft !== null && resolveLeft < 24) ? "due_soon" : "on_track";
  return {
    ...d,
    ...(d.creator_id && db.creators[d.creator_id] ? { creator: db.creators[d.creator_id] } : {}),
    brand: db.brands[d.brand_id],
    ...(d.bounty_id && db.bounties[d.bounty_id] ? { bounty: db.bounties[d.bounty_id] } : {}),
    ...(d.post_id && db.posts[d.post_id] ? { post: db.posts[d.post_id] } : {}),
    ...(d.submission_id && db.submissions[d.submission_id] ? { submission: db.submissions[d.submission_id] } : {}),
    sla: { state, reply_hours_left: replyLeft, resolve_hours_left: resolveLeft },
    last_event: d.events[d.events.length - 1],
    open,
  };
}

/** Disputes and appeals for whoever is signed in: a creator's own, a brand's, or all of them for Ops. Overdue first, then newest. */
export const selectDisputes = defineSelector(["disputes", "creators", "brands", "bounties", "posts", "submissions", "clock", "session"] as const, (db: DisputeDb, f: DisputeFilter | undefined): readonly DisputeView[] => {
  const filter = f ?? {};
  const s = db.session;
  let list: readonly Dispute[] = valuesOf(db.disputes);
  if (s.persona === "creator" && s.creator_id) list = groupBy(db.disputes, "creator", (d) => d.creator_id).get(s.creator_id);
  else if (s.persona === "brand" && s.brand_id) list = groupBy(db.disputes, "brand", (d) => d.brand_id).get(s.brand_id);
  else if (s.persona !== "admin") return [];
  const wanted = filter.status === "open" ? OPEN_STATUSES : asList(filter.status as DisputeStatus | readonly DisputeStatus[] | undefined);
  const order = { overdue: 0, due_soon: 1, on_track: 2, resolved: 3 } as const;
  return list
    .filter((d) => (!wanted || wanted.includes(d.status)) && (!filter.kind || d.kind === filter.kind) && (filter.appeals === undefined || (d.kind === "rejection_appeal") === filter.appeals))
    .map((d) => disputeView(db, d))
    .filter((d) => matchesQuery(filter.q, d.reason, d.note, d.creator?.handle, d.bounty?.title, d.id))
    .sort((a, b) => order[a.sla.state] - order[b.sla.state] || desc(a.updated_at, b.updated_at));
});

/** One dispute with its timeline, evidence and SLA. */
export const selectDispute = defineSelector(["disputes", "creators", "brands", "bounties", "posts", "submissions", "clock"] as const, (db: Db<"disputes" | "creators" | "brands" | "bounties" | "posts" | "submissions" | "clock">, id: string | undefined): DisputeView | undefined => {
  const d = id ? db.disputes[id] : undefined;
  return d ? disputeView(db, d) : undefined;
});

// ── Brand Scorecard ────────────────────────────────────────────────────────────────────────────

export interface ScorecardMetric {
  label: string;
  /** The figure, formatted for display ("11 h", "78%", "96%"). */
  value: string;
  /** What it means in one line. */
  caption: string;
}

export interface ScorecardView extends BrandScorecard {
  brand: Brand;
  /** "Excellent", "Good", "Fair", "Poor" or "New brand". */
  label: string;
  /** Fewer than 10 decisions: no verdict, only "New brand" and the sample. */
  new_brand: boolean;
  /** "Decides in about 11 h"; null for a new brand. */
  decides_in: string | null;
  /** "142 decisions, 90 days". */
  sample: string;
  /** The four metrics creators see: pay speed, decision time, approval fairness, share of approved work actually run. */
  metrics: readonly [ScorecardMetric, ScorecardMetric, ScorecardMetric, ScorecardMetric];
  /** Reasons given for rejections in the window, most common first. */
  rejection_reasons: readonly { code: ReasonCode; count: number; share: number }[];
  /** Videos that waited past the 72-hour promise. */
  sla_breaches_list: readonly { submission_id: string; bounty_title: string; hours_waited: number }[];
  recent_bounties: readonly BountyView[];
  /** What to do to improve it (own scorecard): clear the queue older than 48 hours, and so on, from real data. */
  improvements: readonly string[];
}

type ScorecardDb = Db<"brand_scorecards" | "brands" | "submissions" | "bounties" | "apps" | "brand_members" | "users" | "clock">;

const pct = (r: number): string => `${Math.round(r * 100)}%`;
const hrs = (h: number): string => (h < 1 ? "under 1 h" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

function scorecardView(db: ScorecardDb, sc: BrandScorecard): ScorecardView {
  const brand = db.brands[sc.brand_id];
  const now = db.clock.now;
  const since = toMs(now) - sc.window_days * 86_400_000;
  const subs = groupBy(db.submissions, "brand", (s) => s.brand_id).get(sc.brand_id);
  const rejected = subs.filter((s) => s.decision && s.decision.reason_code && (s.decision.action === "reject" || s.decision.action === "appeal_uphold") && toMs(s.decision.decided_at) >= since);
  const counts = new Map<ReasonCode, number>();
  for (const s of rejected) counts.set(s.decision?.reason_code as ReasonCode, (counts.get(s.decision?.reason_code as ReasonCode) ?? 0) + 1);
  const waiting = subs.filter((s) => s.status === "in_review");
  const stale = waiting.filter((s) => s.sla_state === "stale" || s.sla_state === "breached");
  const improvements: string[] = [];
  if (stale.length > 0) improvements.push(`Decide the ${stale.length} ${stale.length === 1 ? "video" : "videos"} waiting more than 48 hours.`);
  if (sc.sla_breaches > 0) improvements.push(`${sc.sla_breaches} ${sc.sla_breaches === 1 ? "video" : "videos"} passed the 72-hour promise this period. Turn on approve-if-clean so a clean video is never left waiting.`);
  if (sc.run_rate < 0.9) improvements.push(`Only ${pct(sc.run_rate)} of approved videos were posted or used within 30 days. Approve fewer videos, or brief the creators on when you will run them.`);
  if (sc.pays_on_time_ratio < 0.98) improvements.push("Keep the wallet funded so commissions and offers are paid without delay.");
  return {
    ...sc,
    brand,
    label: brandBandLabel(sc.band),
    new_brand: sc.band === "new",
    decides_in: decidesInAbout(sc),
    sample: scorecardSample(sc),
    metrics: [
      { label: "Pay speed", value: hrs(sc.pay_speed_hours_median), caption: `${pct(sc.pays_on_time_ratio)} of commissions, offers and top-ups funded without delay` },
      { label: "Decision time", value: hrs(sc.decision_hours_median), caption: `Median time to decide; 9 in 10 decided within ${hrs(sc.decision_hours_p90)}` },
      { label: "Approval fairness", value: pct(sc.approval_rate), caption: `${sc.appeals_n} appeals, ${sc.appeals_overturned} overturned. Every rejection names a reason.` },
      { label: "Approved work run", value: pct(sc.run_rate), caption: "Share of approved videos posted or used within 30 days" },
    ],
    rejection_reasons: [...counts.entries()].map(([code, count]) => ({ code, count, share: rejected.length > 0 ? count / rejected.length : 0 })).sort((a, b) => b.count - a.count),
    sla_breaches_list: subs
      .filter((s) => s.sla_breached_at !== undefined && toMs(s.sla_breached_at) >= since)
      .map((s) => ({ submission_id: s.id, bounty_title: db.bounties[s.bounty_id]?.title ?? "", hours_waited: Math.round(hoursBetween(s.versions[s.version - 1]?.submitted_at ?? s.submitted_at, s.decision?.decided_at ?? now)) }))
      .sort((a, b) => b.hours_waited - a.hours_waited)
      .slice(0, 10),
    recent_bounties: groupBy(db.bounties, "brand", (b) => b.brand_id)
      .get(sc.brand_id)
      .filter((b) => b.status !== "draft" && b.status !== "awaiting_funding")
      .sort((a, b) => desc(a.published_at ?? a.created_at, b.published_at ?? b.created_at))
      .slice(0, 6)
      .map((b) => bountyView(db, b)),
    improvements,
  };
}

/** The Brand Scorecard of one brand (public, creator-facing and own views share it). `undefined` for a brand with no scorecard (flowd itself). */
export const selectBrandScorecard = defineSelector(["brand_scorecards", "brands", "submissions", "bounties", "apps", "brand_members", "users", "clock", "session"] as const, (db: ScorecardDb & Db<"session">, brand: string | undefined): ScorecardView | undefined => {
  const id = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const sc = id ? groupBy(db.brand_scorecards, "brand", (s) => s.brand_id).get(id)[0] : undefined;
  return sc ? scorecardView(db, sc) : undefined;
});

/** Every brand's scorecard, best first (the Trust Center teaser). Brands under 10 decisions sort last and read "New brand". */
export const selectBrandScorecards = defineSelector(["brand_scorecards", "brands", "submissions", "bounties", "apps", "brand_members", "users", "clock"] as const, (db: ScorecardDb, limit: number | undefined): readonly ScorecardView[] =>
  valuesOf(db.brand_scorecards)
    .map((sc) => scorecardView(db, sc))
    .sort((a, b) => Number(a.new_brand) - Number(b.new_brand) || desc(a.reliability_score, b.reliability_score))
    .slice(0, limit ?? 50),
);
