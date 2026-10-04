/**
 * The bounty builder's brain: turns a handful of choices into a complete, linted, priced bounty row.
 *
 * It is a pure function of the world (no writes), used twice: by the `createBounty` / `updateBounty` actions, and by the builder's live preview
 * (`useBountyPreview`), so the numbers a brand sees while typing are exactly the numbers the saved bounty gets.
 */

import {
  CATEGORY_META,
  type App,
  type ArtSeed,
  type Bounty,
  type Brand,
  type BrandMember,
  type Brief,
  type BriefBeat,
  type Category,
  type Deliverables,
  type Eligibility,
  type FormatId,
  type Niche,
  type Platform,
  type Country,
  type Tier,
  type Visibility,
  type BountyType,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  DEFAULT_CPA_RATES,
  addDays,
  allInCpm,
  baselineFor,
  buildRightsCard,
  clearingStats,
  formatCompact,
  funding,
  lintBrief,
  makeArtSeed,
  mulRate,
  payMath,
  seededRng,
  takeRateFor,
  type BriefLintResult,
  type Funding,
  type RightsCardOptions,
} from "@/lib/engine";
import { slug } from "../ids";
import type { DemoState } from "../state";

/** Niches that fit each app category (a starting point the brand can edit). */
const CATEGORY_NICHES: Record<Category, Niche[]> = {
  ai_photo: ["ai_tools", "tech", "lifestyle", "beauty"],
  ai_assistant: ["ai_tools", "tech", "productivity"],
  fitness: ["fitness", "wellness", "lifestyle"],
  language: ["study", "travel", "lifestyle"],
  productivity: ["productivity", "study", "tech"],
  finance: ["money", "lifestyle", "productivity"],
  sleep_mind: ["wellness", "lifestyle", "parenting"],
  music_audio: ["lifestyle", "tech"],
  lifestyle: ["lifestyle", "food", "travel", "parenting"],
};

/** What a brand chooses in the builder. Everything but the app, title and budget has a sensible default. */
export interface BountyDraftInput {
  app_id: string;
  title: string;
  /** The creator-pay pool, in cents. On a first bounty flowd matches part of it (see `matched_cents` in the preview). */
  budget_cents: number;
  type?: BountyType;
  visibility?: Visibility;
  cpm_cents?: number;
  cpa_install_cents?: number;
  cpa_trial_cents?: number;
  cpa_paid_cents?: number;
  /** Direct bounties: the flat fee per video. */
  flat_fee_cents?: number;
  per_video_cap_cents?: number;
  per_creator_cap_cents?: number;
  ad_commission_rate?: number;
  brief?: Partial<Brief>;
  rights?: RightsCardOptions;
  deliverables?: Partial<Deliverables>;
  eligibility?: Partial<Eligibility> & { min_tier?: Tier };
  format_ids?: FormatId[];
  starts_at?: string;
  ends_at?: string;
  /** Extra free text to scan for traps (a message to creators). */
  extra_text?: string[];
}

export interface BountyDraft {
  bounty: Bounty;
  lint: BriefLintResult;
  funding: Funding;
  /** True when this bounty would be the brand's first (fee waived, flowd matches up to $500). */
  first_bounty: boolean;
  /** The take rate this bounty is charged: 0 on the first bounty, 6% for CPA-only, else the plan rate. */
  take_rate: number;
}

/** The default brief for an app: honest, specific and lint-clean. */
export function defaultBrief(app: App, brand: Brand): Brief {
  const feature = app.features[0] ?? "the main feature";
  const trial = app.pricing.trial_days;
  const beats: BriefBeat[] = [
    { beat: "hook", label: "Hook", required: true },
    { beat: "app_reveal", label: "Show the app by 0:03", required: true, hint: "On screen within the first 3 seconds." },
    { beat: "demo", label: `Demo ${feature}`, required: true },
    { beat: "payoff", label: "The result", required: true },
    { beat: "offer", label: trial > 0 ? "State the free trial once" : "State the offer once", required: trial > 0, hint: "Once, before the call to action." },
    { beat: "cta", label: "One call to action", required: true },
  ];
  const first = slug(app.name).split("-")[0] || "app";
  return {
    summary: `Show ${app.name}, ${app.tagline.charAt(0).toLowerCase()}${app.tagline.slice(1)}, doing one real thing: ${feature.charAt(0).toLowerCase()}${feature.slice(1)}. Keep it honest and under 30 seconds.`,
    talking_points: ["Show the app on screen within the first 3 seconds.", `Demo ${feature} for at least 5 seconds.`, "Say what the app does for you in one sentence.", ...app.features.slice(1, 3).map((f) => `Mention ${f}.`)],
    dos: ["Film vertically, 9:16, in good light.", "Use your own screen recordings and footage.", "Show the one-tap moment clearly."],
    donts: ["Do not make income, health or guaranteed-result claims.", "Do not show other apps in the same category."],
    beats,
    cta: trial > 0 ? `Try ${app.name} free for ${trial} days. The link is in my bio.` : `The link to ${app.name} is in my bio.`,
    ...(trial > 0 ? { offer_line: `Free to try for ${trial} days.` } : {}),
    hashtags: [...app.default_hashtags.slice(0, 2), "#ad"],
    mentions: [`@${first}`],
    tone: "Honest and a little playful",
    disclosure_text: brand.compliance_defaults.disclosure_text || `#ad Paid partnership with ${app.name}`,
    banned_claims: [...brand.compliance_defaults.banned_claims],
  };
}

/** The unique bounty id for a title: `bnty_<brand slug>_<title slug>`, with a number when taken. */
export function bountyIdFor(brand: Brand, title: string, taken: (id: string) => boolean): string {
  const base = `bnty_${brand.slug}_${slug(title, 24).replace(/-/g, "") || "bounty"}`;
  if (!taken(base)) return base;
  for (let n = 2; ; n += 1) if (!taken(`${base}${n}`)) return `${base}${n}`;
}

/** Best formats for a category, best first. */
function formatsFor(db: Pick<DemoState, "formats">, category: Category): FormatId[] {
  return Object.values(db.formats)
    .filter((f) => f.best_for_categories.includes(category))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 4)
    .map((f) => f.id);
}

/**
 * Builds the bounty a brand would get from these choices: brief, rights, deliverables, eligibility, money (with the first-bounty waiver and match
 * when it applies), Brief Lint, Pay Math and the all-in price. `existing` keeps the id, status and money of a draft being edited.
 */
export function buildBountyDraft(
  db: Pick<DemoState, "apps" | "brands" | "brand_members" | "formats" | "market_series" | "bounties" | "clock">,
  input: BountyDraftInput,
  actor: { member?: BrandMember },
  existing?: Bounty,
): BountyDraft {
  const app = db.apps[input.app_id];
  if (!app) throw new Error(`Unknown app ${input.app_id}`);
  const brand = db.brands[app.brand_id];
  const now = db.clock.now;
  const type: BountyType = input.type ?? existing?.type ?? "cpm";
  const hasCpm = type === "cpm" || type === "stacked";
  const hasCpa = type === "stacked" || type === "cpa" || type === "install_only";
  const isDirect = type === "direct";

  const cpm_cents = hasCpm ? (input.cpm_cents ?? existing?.cpm_cents ?? CONSTANTS.pay.default_cpm_cents) : 0;
  const rates = {
    install: hasCpa ? (input.cpa_install_cents ?? existing?.cpa_install_cents ?? DEFAULT_CPA_RATES.install) : 0,
    trial: type === "install_only" ? 0 : hasCpa ? (input.cpa_trial_cents ?? existing?.cpa_trial_cents ?? DEFAULT_CPA_RATES.trial) : 0,
    paid: type === "install_only" ? 0 : hasCpa ? (input.cpa_paid_cents ?? existing?.cpa_paid_cents ?? DEFAULT_CPA_RATES.paid) : 0,
  };
  const flat_fee_cents = isDirect ? (input.flat_fee_cents ?? existing?.flat_fee_cents ?? 0) : 0;
  const per_video_cap_cents = isDirect ? flat_fee_cents : (input.per_video_cap_cents ?? existing?.per_video_cap_cents ?? CONSTANTS.pay.default_per_video_cap_cents);
  const budget_cents = Math.max(0, Math.round(input.budget_cents));

  // first bounty: fee waived, flowd matches min($500, half the pool); otherwise the plan (or flat 6% for CPA-only) rate
  const first_bounty = !brand.first_bounty_waiver_used && !isDirect;
  const matched = first_bounty ? Math.min(CONSTANTS.fees.matched_first_bounty_cap_cents, Math.floor(budget_cents / 2)) : 0;
  const take_rate = takeRateFor({ plan: brand.plan, type, firstBountyWaived: first_bounty });
  const fund: Funding = funding({ budget_cents, take_rate, matched_cents: matched });

  const base = defaultBrief(app, brand);
  const brief: Brief = { ...base, ...(input.brief ?? existing?.brief ?? {}) };
  const rights_card = buildRightsCard(input.rights ?? (existing ? { paid_ads_days: existing.rights_card.paid_ads_days, ad_platforms: existing.rights_card.ad_platforms, whitelisting: existing.rights_card.whitelisting, exclusivity_days: existing.rights_card.exclusivity_days, territory: existing.rights_card.territory } : {}));
  const deliverables: Deliverables = {
    videos_per_creator: 1,
    min_duration_s: 15,
    max_duration_s: 30,
    aspect: "9:16",
    platforms: ["tiktok"] as Platform[],
    regions: ["US"] as Country[],
    require_face: true,
    music_policy: brand.compliance_defaults.music_policy,
    ai_policy: brand.compliance_defaults.ai_policy,
    ...(existing?.deliverables ?? {}),
    ...(input.deliverables ?? {}),
  };
  const eligibility: Eligibility = {
    countries: deliverables.regions,
    niches: CATEGORY_NICHES[app.category],
    burner_accounts_allowed: false,
    ...(existing?.eligibility ?? {}),
    ...(input.eligibility ?? {}),
  };
  const starts_at = input.starts_at ?? existing?.starts_at ?? now;
  const ends_at = input.ends_at ?? existing?.ends_at ?? addDays(now, 30);

  // market-based Pay Math (the category's latest median views)
  const stats = clearingStats(Object.values(db.market_series), app.category);
  const median_views = stats.from_baseline ? baselineFor(app.category).median_views : stats.median_views;
  const basis = `${CATEGORY_META[app.category].label} market: median ${formatCompact(median_views)} verified views per post, tracked funnel from the category defaults. An estimate, not a promise.`;
  const pay_math = payMath({ cpm_cents, rates, per_video_cap_cents, plan: brand.plan, type, take_rate, flat_fee_cents, median_views, basis });

  const lint = lintBrief(
    {
      type,
      plan: brand.plan,
      cpm_cents,
      rates,
      flat_fee_cents,
      take_rate,
      per_video_cap_cents,
      budget_cents,
      brief,
      rights_card,
      deliverables,
      starts_at,
      ends_at,
      median_views,
      basis,
      first_bounty,
      extra_text: [input.title, ...(input.extra_text ?? [])],
    },
    now,
    { overrides: (existing?.lint_overrides ?? []).map((o) => o.code) },
  );

  const id = existing?.id ?? bountyIdFor(brand, input.title, (candidate) => candidate in db.bounties);
  const art: ArtSeed = existing?.art ?? makeArtSeed(seededRng(id), { hue: app.icon.hue_a, pattern: app.icon.pattern, label: input.title });
  const member = actor.member ?? Object.values(db.brand_members).find((m) => m.brand_id === brand.id && m.role === "owner");
  const fee_reserve_cents = first_bounty ? 0 : mulRate(budget_cents, take_rate);

  const bounty: Bounty = {
    id,
    app_id: app.id,
    brand_id: brand.id,
    ...(existing?.owner_member_id ?? member?.id ? { owner_member_id: existing?.owner_member_id ?? member?.id } : {}),
    ...(existing?.created_by_member_id ?? member?.id ? { created_by_member_id: existing?.created_by_member_id ?? member?.id } : {}),
    title: input.title.trim(),
    type,
    status: existing?.status ?? "draft",
    visibility: input.visibility ?? existing?.visibility ?? "open",
    funding_source: first_bounty ? "brand_matched" : "brand",
    is_first_bounty: first_bounty,
    is_starter: false,
    featured: existing?.featured ?? false,
    ...(existing?.featured_until ? { featured_until: existing.featured_until } : {}),
    cpm_cents,
    cpa_install_cents: rates.install,
    cpa_trial_cents: rates.trial,
    cpa_paid_cents: rates.paid,
    flat_fee_cents,
    ad_commission_rate: input.ad_commission_rate ?? existing?.ad_commission_rate ?? CONSTANTS.pay.ad_commission_rate,
    per_video_cap_cents,
    ...(input.per_creator_cap_cents !== undefined ? { per_creator_cap_cents: input.per_creator_cap_cents } : existing?.per_creator_cap_cents !== undefined ? { per_creator_cap_cents: existing.per_creator_cap_cents } : {}),
    budget_cents,
    take_rate,
    fee_reserve_cents,
    escrow_funded_cents: existing?.escrow_funded_cents ?? 0,
    matched_cents: existing?.matched_cents ?? 0,
    funded: existing?.funded ?? false,
    ...(existing?.funded_at ? { funded_at: existing.funded_at } : {}),
    reserved_cents: existing?.reserved_cents ?? 0,
    spent_cents: existing?.spent_cents ?? 0,
    remaining_cents: existing?.remaining_cents ?? 0,
    refunded_cents: existing?.refunded_cents ?? 0,
    brief,
    rights_card,
    deliverables,
    eligibility,
    brief_lint: { passed: lint.can_publish, checked_at: now, issues: lint.issues },
    ...(existing?.lint_overrides ? { lint_overrides: existing.lint_overrides } : {}),
    pay_math,
    format_ids: input.format_ids ?? existing?.format_ids ?? formatsFor(db, app.category),
    art,
    starts_at,
    ends_at,
    ...(existing?.published_at ? { published_at: existing.published_at } : {}),
    review_sla_hours: brand.review_sla_hours,
    counts: existing?.counts ?? { creators: 0, submissions: 0, in_review: 0, approved: 0, rejected: 0, posts: 0, live_posts: 0 },
    funnel: existing?.funnel ?? { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 },
    all_in_cpm_cents: allInCpm({ cpm_cents, budget_cents, card_charge_cents: fund.card_charge_cents }),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  return { bounty, lint, funding: { ...fund, take_rate }, first_bounty, take_rate };
}

