/**
 * Public and marketing data: the live payout ticker, median earnings beside the top figure, the State of App UGC, public bounty, proof and tracking-link
 * pages, audits, case studies, testimonials, the changelog, the Promise metrics, the waitlist and the founding-creator places.
 *
 * Nothing here needs a signed-in person. Every earnings figure carries the typical (median) creator beside it, and an estimate says it is one.
 */

import type { App, AuditReport, AttributionLink, CaseStudy, Category, ChangelogEntry, Creator, Niche, PartyKind, ChangelogTag, Plan, Proof, PromiseMetric, StateOfAppUgc, Testimonial, Ticker } from "@/lib/contract/types";
import { CATEGORY_META } from "@/lib/contract/types";
import { budgetPlan, clearingStats, CONSTANTS, EARNINGS_DISCLAIMER, monthlyEarningsRange, rightsLines, rightsSummary, takeRateFor, typicalVsTop, type RightsLine } from "@/lib/engine";
import { NICHE_CATEGORY } from "@/lib/store/core/creator";
import { asc, defineSelector, desc, valuesOf, type Db } from "../select";
import { bountyView, type BountyDb, type BountyView } from "./bounties";
import type { WaitlistDoc } from "@/lib/store/state";

export interface TickerView extends Ticker {
  /** "The typical creator earned $212 in 30 days. The top 10% earned $1,840. Results vary..." */
  typical_vs_top: string;
  disclaimer: string;
}

/** The live payout ticker (handles only, never emails) with the median line the page must show beside any top figure. */
export const selectTicker = defineSelector(["ticker"] as const, (db: Db<"ticker">): TickerView => ({
  ...db.ticker,
  typical_vs_top: typicalVsTop({ typical_cents: db.ticker.totals.typical_creator_30d_cents, top_cents: db.ticker.totals.top_decile_creator_30d_cents }),
  disclaimer: EARNINGS_DISCLAIMER,
}));

export interface MedianEarnings {
  typical_cents: number;
  p25_cents: number;
  p75_cents: number;
  top_decile_cents: number;
  active_creators_30d: number;
  period: string;
  sentence: string;
  disclaimer: string;
}

/** Typical (median) creator earnings in 30 days with the band and the top-decile figure beside it. */
export const selectMedianEarnings = defineSelector(["ticker"] as const, (db: Db<"ticker">): MedianEarnings => {
  const t = db.ticker.totals;
  return { typical_cents: t.typical_creator_30d_cents, p25_cents: t.p25_creator_30d_cents, p75_cents: t.p75_creator_30d_cents, top_decile_cents: t.top_decile_creator_30d_cents, active_creators_30d: t.active_creators_30d, period: "30 days", sentence: typicalVsTop({ typical_cents: t.typical_creator_30d_cents, top_cents: t.top_decile_creator_30d_cents }), disclaimer: EARNINGS_DISCLAIMER };
});

/** The ranked waitlist (totals, leaders, the demo visitor's place) and what the visitor did in this demo. */
export const selectWaitlist = defineSelector(["waitlist"] as const, (db: Db<"waitlist">): WaitlistDoc & { total: number } => ({ ...db.waitlist, total: db.waitlist.totals.creators + db.waitlist.totals.brands }));

export interface FoundingSpots {
  total: number;
  taken: number;
  left: number;
  /** A preview of founding creators (handles only). */
  creators: readonly Creator[];
  /** The visitor already applied in this demo. */
  applied: boolean;
}

/** The true count of the 200 founding-creator places. */
export const selectFoundingSpots = defineSelector(["creators", "waitlist"] as const, (db: Db<"creators" | "waitlist">): FoundingSpots => {
  const founding = valuesOf(db.creators).filter((c) => c.founding);
  return { total: CONSTANTS.founding.creator_count, taken: founding.length, left: Math.max(0, CONSTANTS.founding.creator_count - founding.length), creators: founding.slice(0, 12), applied: db.waitlist.founding_application !== undefined };
});

/** The State of App UGC report. Computed from the demo fixtures: the methodology and caveats travel with every chart. */
export const selectStateOfAppUgc = defineSelector(["state_of_app_ugc"] as const, (db: Db<"state_of_app_ugc">): StateOfAppUgc => db.state_of_app_ugc);

// ── a public bounty ────────────────────────────────────────────────────────────────────────────

export interface PublicBounty {
  bounty: BountyView;
  /** open, filled, ended: closed and filled have their own states on the page. */
  state: "open" | "filled" | "closed" | "scheduled";
  rights: { lines: readonly RightsLine[]; summary: string };
  /** Pay Math and the all-in lines. */
  pay_math: BountyView["pay_math"];
  /** The link the QR code carries. */
  join_url: string;
  /** Short brief teaser for the public page. */
  teaser: string;
}

/** A bounty on its public page `/b/[id]`. Drafts and unfunded bounties are not public (`undefined`). */
export const selectPublicBounty = defineSelector(["bounties", "apps", "brands", "brand_scorecards", "brand_members", "users", "clock"] as const, (db: BountyDb, id: string | undefined): PublicBounty | undefined => {
  const b = id ? db.bounties[id] : undefined;
  if (!b || b.visibility === "private" || b.status === "draft" || b.status === "awaiting_funding" || b.status === "cancelled") return undefined;
  const view = bountyView(db, b);
  return {
    bounty: view,
    state: b.status === "live" || b.status === "paused" ? "open" : b.status === "filled" ? "filled" : b.status === "scheduled" ? "scheduled" : "closed",
    rights: { lines: rightsLines(b.rights_card), summary: rightsSummary(b.rights_card) },
    pay_math: b.pay_math,
    join_url: `joinflowd.io/b/${b.id}`,
    teaser: b.brief.summary.length > 160 ? `${b.brief.summary.slice(0, 157)}...` : b.brief.summary,
  };
});

// ── proof pages and tracking links ─────────────────────────────────────────────────────────────

export interface ProofView {
  proof: Proof;
  creator?: Creator;
  /** The typical creator beside the figure: always shown. */
  typical_line: string;
  revoked: boolean;
  /** "How we verify": what the ledger hash covers. */
  verify_note: string;
  url: string;
}

/** A proof page `/p/[id]`. `undefined` for an unknown id (show the designed 404); a revoked proof reads as revoked. */
export const selectProof = defineSelector(["proofs", "creators"] as const, (db: Db<"proofs" | "creators">, id: string | undefined): ProofView | undefined => {
  const p = id ? db.proofs[id] : undefined;
  if (!p) return undefined;
  return {
    proof: p,
    ...(!p.anonymous && db.creators[p.creator_id] ? { creator: db.creators[p.creator_id] } : {}),
    typical_line: typicalVsTop({ typical_cents: p.typical_median_cents, top_cents: p.amount_cents, top_label: "this", period: p.period_label }),
    revoked: p.revoked,
    verify_note: `The ledger hash ${p.ledger_hash} covers every cleared and paid earning row behind this figure. A payout is only shown once it has been sent.`,
    url: `joinflowd.io/p/${p.id}`,
  };
});

export interface TrackingLanding {
  valid: boolean;
  link?: AttributionLink;
  app?: App;
  creator?: Creator;
  /** "Ad by @maya.makes": the creator's disclosure shown on the landing page. */
  disclosure?: string;
  promo_code?: string;
  store_url?: string;
  deep_link?: string;
}

/** What a viewer sees at `joinflowd.io/r/<code>`: the app, the creator disclosure, the promo code and the store button carrying the deferred link. */
export const selectTrackingLanding = defineSelector(["attribution_links", "apps", "creators"] as const, (db: Db<"attribution_links" | "apps" | "creators">, code: string | undefined): TrackingLanding => {
  const c = (code ?? "").trim().toLowerCase();
  const link = c ? valuesOf(db.attribution_links).find((l) => l.code.toLowerCase() === c) : undefined;
  if (!link || link.status !== "active") return { valid: false };
  const app = db.apps[link.app_id];
  const creator = db.creators[link.creator_id];
  return { valid: true, link, ...(app ? { app, store_url: app.store_url } : {}), ...(creator ? { creator, disclosure: `Ad by @${creator.handle}` } : {}), ...(link.promo_code ? { promo_code: link.promo_code } : {}), deep_link: link.deep_link };
});

// ── audits ─────────────────────────────────────────────────────────────────────────────────────

export interface AuditView extends AuditReport {
  /** The creators ready now, resolved. */
  creators: readonly Creator[];
  url: string;
}

export const selectAudit = defineSelector(["audit_reports", "creators"] as const, (db: Db<"audit_reports" | "creators">, slug: string | undefined): AuditView | undefined => {
  const a = slug ? valuesOf(db.audit_reports).find((r) => r.slug === slug) : undefined;
  return a ? { ...a, creators: a.creators_ready.map((id) => db.creators[id]).filter((c): c is Creator => c !== undefined), url: `joinflowd.io/audit/${a.slug}` } : undefined;
});

/** Example and recent audits (the free tool's gallery), newest first. */
export const selectAudits = defineSelector(["audit_reports"] as const, (db: Db<"audit_reports">, limit: number | undefined): readonly AuditReport[] => valuesOf(db.audit_reports).slice().sort((a, b) => desc(a.generated_at, b.generated_at)).slice(0, limit ?? 12));

// ── marketing content ──────────────────────────────────────────────────────────────────────────

export interface CaseStudyView extends CaseStudy {
  app: App;
}

/** Case studies. Fictional in the demo and labelled so; permission-based in production. */
export const selectCaseStudies = defineSelector(["case_studies", "apps"] as const, (db: Db<"case_studies" | "apps">): readonly CaseStudyView[] => valuesOf(db.case_studies).map((c) => ({ ...c, app: db.apps[c.app_id] })).filter((c) => c.app !== undefined).sort((a, b) => desc(a.published_at, b.published_at)));

export const selectTestimonials = defineSelector(["testimonials"] as const, (db: Db<"testimonials">, kind: PartyKind | undefined): readonly Testimonial[] => valuesOf(db.testimonials).filter((t) => !kind || t.kind === kind));

export const selectChangelog = defineSelector(["changelog"] as const, (db: Db<"changelog">, f: { tag?: ChangelogTag; audience?: PartyKind } | undefined): readonly ChangelogEntry[] =>
  valuesOf(db.changelog)
    .filter((e) => (!f?.tag || e.tags.includes(f.tag)) && (!f?.audience || e.audience.length === 0 || e.audience.includes(f.audience)))
    .sort((a, b) => desc(a.date, b.date)),
);

export interface PromiseView {
  metrics: readonly PromiseMetric[];
  /** The metrics a page can show as live proof, by key. */
  by_key: Readonly<Record<string, PromiseMetric>>;
  as_of: string;
}

/** The 11 flowd Promise commitments with their live public proof metric (computed from the ledger). */
export const selectPromise = defineSelector(["admin_metrics"] as const, (db: Db<"admin_metrics">): PromiseView => ({
  metrics: db.admin_metrics.promise_metrics.slice().sort((a, b) => asc(a.number, b.number)),
  by_key: Object.fromEntries(db.admin_metrics.promise_metrics.map((m) => [m.key, m])),
  as_of: db.admin_metrics.as_of,
}));

// ── free tools: the earnings calculator and the budget planner ─────────────────────────────────

export interface EarningsCalcInput {
  niche?: Niche;
  category?: Category;
  /** Posts per week the creator plans. */
  posts_per_week: number;
  /** The creator's typical views per post; defaults to the category median. */
  avg_views?: number;
  /** Share of submissions approved; defaults to the platform median (78%). */
  approval_rate?: number;
}

export interface EarningsCalcResult {
  category: Category;
  median_views: number;
  cpm_cents: number;
  per_video_cap_cents: number;
  /** p25, median and p75 per video and per month. */
  range: ReturnType<typeof monthlyEarningsRange>;
  /** The typical creator's real 30-day earnings beside the estimate, and the top-decile figure beside that. */
  typical: MedianEarnings;
  assumptions: readonly string[];
  /** "Estimate. Results vary..." Always shown with the numbers. */
  label: string;
}

const usd = (cents: number): string => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The free earnings calculator: an estimate from the category market, always beside what typical creators really cleared. */
export const selectEarningsCalculator = defineSelector(["market_series", "ticker"] as const, (db: Db<"market_series" | "ticker">, input: EarningsCalcInput | undefined): EarningsCalcResult | undefined => {
  if (!input) return undefined;
  const category: Category = input.category ?? (input.niche ? NICHE_CATEGORY[input.niche] : "lifestyle");
  const stats = clearingStats(valuesOf(db.market_series), category);
  const medianViews = input.avg_views ?? stats.median_views;
  const cpm = stats.clearing_cpm_cents;
  const cap = CONSTANTS.pay.default_per_video_cap_cents;
  const range = monthlyEarningsRange({ median_views: medianViews, posts_per_month: Math.round(input.posts_per_week * 4.33), approval_rate: input.approval_rate, cpm_cents: cpm, per_video_cap_cents: cap });
  const t = db.ticker.totals;
  return {
    category,
    median_views: medianViews,
    cpm_cents: cpm,
    per_video_cap_cents: cap,
    range,
    typical: { typical_cents: t.typical_creator_30d_cents, p25_cents: t.p25_creator_30d_cents, p75_cents: t.p75_creator_30d_cents, top_decile_cents: t.top_decile_creator_30d_cents, active_creators_30d: t.active_creators_30d, period: "30 days", sentence: typicalVsTop({ typical_cents: t.typical_creator_30d_cents, top_cents: t.top_decile_creator_30d_cents }), disclaimer: EARNINGS_DISCLAIMER },
    assumptions: [
      `Median ${Math.round(medianViews).toLocaleString("en-US")} views per post (${CATEGORY_META[category].label} market).`,
      `Clearing CPM ${usd(cpm)}, per-video cap ${usd(cap)}.`,
      `${Math.round((input.approval_rate ?? 0.78) * 100)}% of submissions approved: posts that are not approved earn nothing.`,
    ],
    label: range.label,
  };
});

export interface BudgetPlanInput {
  budget_cents: number;
  category: Category;
  plan?: Plan;
  /** CPM in cents; defaults to the category clearing CPM. */
  cpm_cents?: number;
  /** First-payment revenue per paid conversion; defaults to a typical subscription. */
  avg_first_payment_cents?: number;
}

export interface BudgetPlanResult {
  plan: ReturnType<typeof budgetPlan>;
  cpm_cents: number;
  take_rate: number;
  category: Category;
  market: ReturnType<typeof clearingStats>;
}

/** The free budget planner: what a pool buys in views, installs, trials and paid in low, median and high bands, priced at the category market CPM. */
export const selectBudgetPlanner = defineSelector(["market_series"] as const, (db: Db<"market_series">, input: BudgetPlanInput | undefined): BudgetPlanResult | undefined => {
  if (!input) return undefined;
  const market = clearingStats(valuesOf(db.market_series), input.category);
  const cpm = input.cpm_cents ?? market.clearing_cpm_cents;
  const take = takeRateFor({ plan: input.plan ?? "free", type: "cpm" });
  return { plan: budgetPlan({ budget_cents: input.budget_cents, take_rate: take, cpm_cents: cpm, avg_first_payment_cents: input.avg_first_payment_cents ?? 3499 }), cpm_cents: cpm, take_rate: take, category: input.category, market };
});

/** Market-health numbers for the public Trust Center (median decision hours, % cleared on ETA, disputes within 48 hours, % funded at go-live). */
export const selectTrustMetrics = defineSelector(["admin_metrics"] as const, (db: Db<"admin_metrics">) => ({ ...db.admin_metrics.market_health, as_of: db.admin_metrics.as_of }));

