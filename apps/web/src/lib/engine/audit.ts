/**
 * The App UGC Audit generator (the free tool at /tools/app-ugc-audit and the shareable /audit/<slug> report).
 *
 * Paste an App Store link or an app name and get a draft brief, ten scored hooks, a predicted CPM band, what a pool would buy and the creators ready
 * now. Pure and seeded: the same input always gives the same report, with no network call and no randomness from the clock. Every number is a
 * checklist estimate from category medians and is labelled so; it gets smarter as bounties settle.
 */

import {
  CATEGORIES,
  CATEGORY_META,
  type ArtPattern,
  type ArtSeed,
  type AuditBand,
  type AuditHook,
  type AuditReport,
  type Brief,
  type BriefBeat,
  type Category,
  type CreatorId,
  type CurvePoint,
  type FormatId,
  type HookType,
  type IsoTimestamp,
  type Niche,
  type Tier,
} from "@/lib/contract/types";
import { CONSTANTS } from "./constants";
import { HOOK_LIBRARY, fillHook, scoreHookText, type HookSlots } from "./hooktext";
import { baselineFor, priceCurve, type CategoryBaseline } from "./market";
import { formatInt, formatMoney, formatPercent } from "./money";
import { budgetPlan, DEFAULT_FUNNEL, type FunnelAssumptions } from "./pricing";
import { hashString, pick, seededRng, shuffled, type Rng } from "./rng";
import { round2 } from "./stats";
import { slugify, titleCase } from "./text";
import { tierRank } from "./tiers";

// ── reading the input ──────────────────────────────────────────────────────────────────────────

export interface ParsedApp {
  /** A link or a name. */
  kind: "url" | "name";
  store: "app_store" | "google_play" | "other" | "none";
  /** The app's name, tidied: "Lumi Ai Photo Editor" becomes "Lumi AI Photo Editor". */
  name: string;
  slug: string;
  /** The App Store id (digits) or the Google Play package, when the link has one. */
  store_id?: string;
}

const tidyName = (raw: string): string => titleCase(raw.replace(/[-_.+]+/g, " ").replace(/\s+/g, " ").trim()).replace(/\bAi\b/g, "AI");

/** Reads an App Store link, a Google Play link, another link or a plain name. Never throws: unreadable input becomes a name. */
export function parseAppInput(input: string): ParsedApp {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "apps.apple.com" || host === "itunes.apple.com") {
        const m = /\/app\/(?:([^/]+)\/)?id(\d{6,12})/i.exec(u.pathname);
        const slugPart = m?.[1] ? decodeURIComponent(m[1]) : "";
        const name = tidyName(slugPart) || "Your app";
        return { kind: "url", store: "app_store", name, slug: slugify(name), ...(m?.[2] ? { store_id: m[2] } : {}) };
      }
      if (host === "play.google.com") {
        const id = u.searchParams.get("id") ?? "";
        const last = id.split(".").filter(Boolean).pop() ?? "";
        const name = tidyName(last) || "Your app";
        return { kind: "url", store: "google_play", name, slug: slugify(name), ...(id ? { store_id: id } : {}) };
      }
      const first = host.split(".")[0] ?? "";
      const name = tidyName(first) || "Your app";
      return { kind: "url", store: "other", name, slug: slugify(name) };
    } catch {
      // fall through: treat the text as a name
    }
  }
  const name = tidyName(raw) || "Your app";
  return { kind: "name", store: "none", name, slug: slugify(name) };
}

// ── category ───────────────────────────────────────────────────────────────────────────────────

const KEYWORDS: Readonly<Record<Category, RegExp>> = {
  ai_photo: /photo|selfie|headshot|portrait|picture|image|camera|lens|retouch|editor|filter|avatar|snap|glow/,
  ai_assistant: /\bai\b|assistant|chat|gpt|copilot|answer|agent|writer|summar|ask/,
  fitness: /fit|workout|gym|runn|yoga|pilates|lift|muscle|step|cardio|train|sweat|strong/,
  language: /language|learn|lingo|vocab|speak|spanish|french|german|japanese|korean|polyglot|fluent|phrase|translat/,
  productivity: /todo|task|note|planner|focus|calendar|habit|inbox|organi[sz]e|docs?\b|pomodoro|checklist|schedule/,
  finance: /budget|money|invest|bank|wallet|credit|stock|crypto|saving|finance|expense|tax|coin|cash/,
  sleep_mind: /sleep|calm|mind|meditat|breath|relax|zen|anxiety|journal|mood|dream|nap|therapy/,
  music_audio: /music|beat|audio|sound|podcast|guitar|piano|song|radio|playlist|karaoke|melod|vinyl/,
  lifestyle: /travel|trip|recipe|cook|food|style|fashion|home|garden|pet|dating|wedding|plant|outfit/,
};

/** Tie-break order when several categories match equally: the more specific first. */
const CATEGORY_PRIORITY: readonly Category[] = ["ai_photo", "fitness", "language", "sleep_mind", "music_audio", "finance", "productivity", "lifestyle", "ai_assistant"];

/**
 * Picks the category for an app from its name. The category with the most keyword hits wins; with no hit at all, a stable hash of the name picks one
 * (flagged `guess`, which lowers the report's confidence). The same name always gives the same category.
 */
export function inferCategory(name: string): { category: Category; source: "keyword" | "guess"; matched: Category[] } {
  const text = name.toLowerCase();
  const scores = CATEGORY_PRIORITY.map((c) => ({ c, n: (text.match(new RegExp(KEYWORDS[c].source, "g")) ?? []).length }));
  const best = Math.max(...scores.map((s) => s.n));
  if (best > 0) {
    const matched = scores.filter((s) => s.n > 0).map((s) => s.c);
    return { category: scores.find((s) => s.n === best)?.c ?? "lifestyle", source: "keyword", matched };
  }
  return { category: CATEGORIES[hashString(text) % CATEGORIES.length], source: "guess", matched: [] };
}

// ── category copy ──────────────────────────────────────────────────────────────────────────────

interface CategoryCopy {
  noun: string;
  goal: string;
  action: string;
  tagline: string;
  tone: string;
  features: readonly string[];
  banned: readonly string[];
  niches: readonly Niche[];
  formats: readonly FormatId[];
  dos: readonly string[];
  donts: readonly string[];
}

const COPY: Readonly<Record<Category, CategoryCopy>> = {
  ai_photo: {
    noun: "photo editing",
    goal: "editing photos",
    action: "turns a selfie into a studio-quality photo",
    tagline: "Studio-quality photos from a selfie, in one tap.",
    tone: "Casual, a little amazed, honest about the result",
    features: ["one-tap AI headshots", "background swap", "skin retouching that looks natural", "style presets", "batch editing"],
    banned: ["100% realistic", "guaranteed results", "looks exactly like a photographer"],
    niches: ["ai_tools", "tech", "beauty", "lifestyle"],
    formats: ["tmpl_screen_reaction", "tmpl_results_update", "tmpl_confession", "tmpl_free_trial_lead"],
    dos: ["Show the before and after on screen", "Say how long it took", "Keep the app on screen for the demo"],
    donts: ["Don't call the results perfect", "Don't show a competing app"],
  },
  ai_assistant: {
    noun: "AI assistant",
    goal: "getting answers",
    action: "answers the questions you used to search for",
    tagline: "An assistant that gets to the point.",
    tone: "Curious, practical, no jargon",
    features: ["instant answers", "voice questions", "summaries of long text", "writing help", "saved conversations"],
    banned: ["never wrong", "replaces a doctor", "replaces a lawyer", "guaranteed results"],
    niches: ["ai_tools", "tech", "productivity", "study"],
    formats: ["tmpl_screen_reaction", "tmpl_hidden_gem", "tmpl_problem_solution", "tmpl_reply_comment"],
    dos: ["Ask it something real on screen", "Show the answer arriving", "Say what you used it for"],
    donts: ["Don't claim it is always correct", "Don't give medical or legal advice"],
  },
  fitness: {
    noun: "workout",
    goal: "working out",
    action: "turns a 15-minute workout into a habit",
    tagline: "Workouts that fit into your day.",
    tone: "Energetic, encouraging, real about effort",
    features: ["short guided workouts", "progress tracking", "streaks", "no-equipment plans", "form tips"],
    banned: ["lose weight fast", "guaranteed results", "lose 10 lbs in a week", "burn fat"],
    niches: ["fitness", "wellness", "lifestyle"],
    formats: ["tmpl_results_update", "tmpl_identity_shift", "tmpl_confession", "tmpl_screen_reaction"],
    dos: ["Show a real workout on screen", "Say how many days you stuck with it", "Keep claims about effort, not results"],
    donts: ["Don't promise weight loss", "Don't show unsafe form"],
  },
  language: {
    noun: "language learning",
    goal: "learning a language",
    action: "gets you speaking in a few minutes a day",
    tagline: "A few minutes a day, and you are speaking.",
    tone: "Friendly, encouraging, a little playful",
    features: ["five-minute lessons", "speaking practice", "daily streaks", "offline lessons", "real conversations"],
    banned: ["fluent in 30 days", "guaranteed fluency", "no effort"],
    niches: ["study", "lifestyle", "travel"],
    formats: ["tmpl_results_update", "tmpl_hidden_gem", "tmpl_identity_shift", "tmpl_problem_solution"],
    dos: ["Say a phrase out loud on screen", "Share how long you've stuck with it", "Name the language"],
    donts: ["Don't promise fluency", "Don't show other language apps"],
  },
  productivity: {
    noun: "to-do",
    goal: "planning my week",
    action: "turns a messy to-do list into a plan",
    tagline: "Your week, planned in a minute.",
    tone: "Calm, practical, a little relieved",
    features: ["quick capture", "weekly planner", "reminders that work", "focus timer", "widgets"],
    banned: ["double your productivity", "guaranteed results", "never forget anything"],
    niches: ["productivity", "study", "tech"],
    formats: ["tmpl_problem_solution", "tmpl_screen_reaction", "tmpl_hidden_gem", "tmpl_green_screen"],
    dos: ["Show your real list on screen", "Say what changed in your week", "Keep it to one feature"],
    donts: ["Don't promise a number of hours saved", "Don't show private data"],
  },
  finance: {
    noun: "budgeting",
    goal: "tracking my spending",
    action: "shows where your money goes without a spreadsheet",
    tagline: "See where your money goes.",
    tone: "Straight, calm, never a get-rich pitch",
    features: ["automatic spending categories", "bill reminders", "monthly summary", "savings goals", "shared budgets"],
    banned: ["guaranteed returns", "get rich", "make money fast", "passive income", "financial advice"],
    niches: ["money", "productivity", "lifestyle"],
    formats: ["tmpl_problem_solution", "tmpl_results_update", "tmpl_confession", "tmpl_green_screen"],
    dos: ["Blur any real account numbers", "Say what you learned, not what you earned", "Name the feature you used"],
    donts: ["Don't promise returns or savings", "Don't give financial advice"],
  },
  sleep_mind: {
    noun: "sleep",
    goal: "winding down",
    action: "helps you wind down at the end of the day",
    tagline: "Wind down. Sleep better.",
    tone: "Soft, honest, never clinical",
    features: ["wind-down sessions", "sleep sounds", "breathing exercises", "bedtime reminders", "mood check-ins"],
    banned: ["cures insomnia", "treats anxiety", "replaces therapy", "guaranteed sleep"],
    niches: ["wellness", "lifestyle", "parenting"],
    formats: ["tmpl_identity_shift", "tmpl_results_update", "tmpl_confession", "tmpl_hidden_gem"],
    dos: ["Show your evening routine with the app", "Say how you feel, not what it cures", "Keep volume low and calm"],
    donts: ["Don't make medical claims", "Don't promise sleep results"],
  },
  music_audio: {
    noun: "music",
    goal: "making music",
    action: "lets anyone make a beat in minutes",
    tagline: "Make something that sounds like you.",
    tone: "Playful, creative, a bit showy",
    features: ["loop builder", "voice to melody", "instant mixing", "export and share", "free sound packs"],
    banned: ["sounds like a pro studio", "guaranteed hits", "no skill needed"],
    niches: ["tech", "lifestyle", "ai_tools"],
    formats: ["tmpl_screen_reaction", "tmpl_hidden_gem", "tmpl_results_update", "tmpl_carousel_video"],
    dos: ["Play what you made out loud", "Use music the app provides", "Show the app on screen while you build"],
    donts: ["Don't use trending sounds", "Don't promise a hit"],
  },
  lifestyle: {
    noun: "lifestyle",
    goal: "planning my week",
    action: "makes everyday plans easier",
    tagline: "Everyday plans, sorted.",
    tone: "Warm, relaxed, personal",
    features: ["saved collections", "shared plans", "smart suggestions", "reminders", "offline access"],
    banned: ["guaranteed results", "the best app ever"],
    niches: ["lifestyle", "travel", "food", "parenting"],
    formats: ["tmpl_hidden_gem", "tmpl_identity_shift", "tmpl_screen_reaction", "tmpl_carousel_video"],
    dos: ["Show a real plan on screen", "Say what you used it for last week", "Keep it personal"],
    donts: ["Don't make big promises", "Don't show other people's private details"],
  },
};

/** Which hook type goes with which winning format. */
const HOOK_FORMAT: Readonly<Record<HookType, FormatId>> = {
  confession: "tmpl_confession",
  curiosity_gap: "tmpl_hidden_gem",
  specific_number: "tmpl_results_update",
  pov: "tmpl_identity_shift",
  direct_question: "tmpl_reply_comment",
  risk_reversal: "tmpl_free_trial_lead",
  pattern_interrupt: "tmpl_screen_reaction",
};

/** Ten hooks: how many of each type. */
const HOOK_MIX: readonly (readonly [HookType, number])[] = [
  ["confession", 2],
  ["curiosity_gap", 2],
  ["specific_number", 2],
  ["pov", 1],
  ["direct_question", 1],
  ["risk_reversal", 1],
  ["pattern_interrupt", 1],
];

// ── art ────────────────────────────────────────────────────────────────────────────────────────

const PATTERNS: readonly ArtPattern[] = ["orbs", "waves", "rings", "grid", "spark", "stripes"];

/** A generated-art seed (the same shape fixtures use): harmonious hues, a pattern and a seed, from an Rng. */
export function makeArtSeed(rng: Rng, p: { pattern?: ArtPattern; label?: string; hue?: number }): ArtSeed {
  const hue_a = p.hue ?? Math.floor(rng() * 360);
  const hue_b = (hue_a + (rng() < 0.5 ? 1 : -1) * (25 + Math.floor(rng() * 45)) + 360) % 360;
  const hue_c = (hue_a + 150 + Math.floor(rng() * 60)) % 360;
  return { hue_a, hue_b, hue_c, pattern: p.pattern ?? pick(rng, PATTERNS), seed: Math.floor(rng() * 2 ** 31), ...(p.label ? { label: p.label.slice(0, 24) } : {}) };
}

// ── the report ─────────────────────────────────────────────────────────────────────────────────

/** A creator the audit may name as "ready now". */
export interface AuditCreatorCandidate {
  id: CreatorId;
  niches: readonly Niche[];
  tier: Tier;
  open_to_offers?: boolean;
}

export interface GeneratedAudit extends Omit<AuditReport, "id" | "created_by" | "claimed_by_brand_id" | "page_views"> {
  /** What a reference pool would buy, so the report can say "$2,000 buys about N trials". */
  reference_pool: {
    plan: "free";
    budget_cents: number;
    cpm_cents: number;
    card_charge_cents: number;
    views: number;
    trials: AuditBand;
    installs: AuditBand;
  };
  /** How the category was decided. */
  category_source: "keyword" | "guess";
  /** The app's features the brief draws on. */
  features: string[];
  /** Always shown on the report. */
  label: string;
}

/** The label every audit carries. */
export const AUDIT_LABEL = "Checklist estimate from category medians. It gets smarter as bounties settle.";

const REFERENCE_POOL_CENTS = 200_000;

/** The category's own funnel: its trial and paid rates in place of the global medians. */
const funnelFor = (b: CategoryBaseline): FunnelAssumptions => ({ ...DEFAULT_FUNNEL, install_to_trial: b.install_to_trial, trial_to_paid: b.trial_to_paid });

const round5 = (cents: number): number => Math.max(CONSTANTS.pay.floor_cpm_cents, Math.round(cents / 5) * 5);

function buildBrief(app: string, slug: string, copy: CategoryCopy): Brief {
  const first = slug.split("-")[0] || "app";
  const beats: BriefBeat[] = [
    { beat: "hook", label: "Hook: open on the line, first 2 seconds", required: true },
    { beat: "app_reveal", label: `Show ${app} on screen by 0:03`, required: true, hint: "Cut to the app, then come back to your face." },
    { beat: "demo", label: `Demo ${copy.features[0]}`, required: true },
    { beat: "key_feature", label: `Show ${copy.features[1]}`, required: false },
    { beat: "offer", label: "Say the 7-day free trial once", required: true },
    { beat: "cta", label: `One call to action: try ${app} free`, required: true },
  ];
  return {
    summary: `Show how ${app} ${copy.action}, with the app on screen. Keep it honest and under 30 seconds.`,
    talking_points: [`${app} ${copy.action}`, `Show ${copy.features[0]} working on screen`, "Say the free trial once, near the end"],
    dos: [...copy.dos],
    donts: [...copy.donts],
    beats,
    cta: `Try ${app} free for 7 days`,
    offer_line: "7-day free trial",
    hashtags: ["#ad", `#${first}`],
    mentions: [`@${first}`],
    tone: copy.tone,
    disclosure_text: `#ad Paid partnership with ${app}`,
    banned_claims: [...copy.banned],
  };
}

/**
 * Generates the App UGC Audit for an app link or name: a draft brief with three must-say beats, ten scored hooks, ranked formats, a predicted CPM band,
 * expected views and cost per trial, a price-versus-fill curve, creators ready now, and the assumptions behind it. Deterministic: `generated_at` is passed in.
 */
export function generateAudit(params: {
  input: string;
  now: IsoTimestamp;
  creators?: readonly AuditCreatorCandidate[];
  max_creators?: number;
  /** The category the app team picked (or the store listing names). Skips the guess from the app's name, which is what the audit's assumptions ask for. */
  category?: Category;
}): GeneratedAudit {
  const app = parseAppInput(params.input);
  const guess = params.category ? { category: params.category, source: "keyword" as const, matched: [params.category] } : inferCategory(app.name);
  const category = guess.category;
  const copy = COPY[category];
  const baseline = baselineFor(category);
  const rng = seededRng(`${app.slug}|${category}`);
  const jitter = 0.94 + rng() * 0.12;

  // hooks
  const slots: Partial<HookSlots> = { app: app.name, category: copy.noun, feature: copy.features[0], goal: copy.goal, number: String(7 + Math.floor(rng() * 6)) };
  const used = new Set<string>();
  const hooks: AuditHook[] = [];
  for (const [type, count] of HOOK_MIX) {
    const templates = shuffled(rng, HOOK_LIBRARY[type]);
    let taken = 0;
    for (const tpl of templates) {
      if (taken >= count) break;
      const text = fillHook(tpl, slots);
      if (used.has(text)) continue;
      used.add(text);
      hooks.push({ text, hook_type: type, format_id: HOOK_FORMAT[type], hook_points: scoreHookText(text).score });
      taken += 1;
    }
  }
  const typeOrder = HOOK_MIX.map(([t]) => t);
  hooks.sort((a, b) => b.hook_points - a.hook_points || typeOrder.indexOf(a.hook_type) - typeOrder.indexOf(b.hook_type) || a.text.localeCompare(b.text));

  // price, views, cost per trial
  const p25 = round5(baseline.p25_cpm_cents * jitter);
  const median = Math.max(p25, round5(baseline.clearing_cpm_cents * jitter));
  const p75 = Math.max(median, round5(baseline.p75_cpm_cents * jitter));
  const predicted_cpm_cents: AuditBand = { low: p25, median, high: p75 };
  const q = DEFAULT_FUNNEL.views_quantile_ratio;
  const medianViews = Math.round(baseline.median_views * (0.96 + rng() * 0.08));
  const expected_views_per_post: AuditBand = { low: Math.round(medianViews * q.p25), median: medianViews, high: Math.round(medianViews * q.p75) };
  const plan = budgetPlan({ budget_cents: REFERENCE_POOL_CENTS, take_rate: CONSTANTS.plans.free.take_rate, cpm_cents: median, avg_first_payment_cents: 0, funnel: funnelFor(baseline) });
  const perTrial = (name: "low" | "median" | "high"): number => plan.band[name].cost_per_trial_cents ?? 0;
  const expected_cost_per_trial_cents: AuditBand = { low: perTrial("high"), median: perTrial("median"), high: perTrial("low") };
  const confidence = round2(Math.min(0.85, (baseline.sample_n / (baseline.sample_n + CONSTANTS.pricing_model.confidence_k)) * 0.9 * (guess.source === "guess" ? 0.7 : 1) + (rng() - 0.5) * 0.04));
  const price_curve: CurvePoint[] = priceCurve({ clearing_cpm_cents: median, median_fill_hours: baseline.median_fill_hours, sample_n: baseline.sample_n });

  // creators ready now
  const wanted = new Set<Niche>(copy.niches);
  const ready = [...(params.creators ?? [])]
    .filter((c) => c.open_to_offers !== false)
    .map((c) => ({ id: c.id, score: c.niches.filter((n) => wanted.has(n)).length * 10 + tierRank(c.tier) + rng() * 0.5 }))
    .filter((c) => c.score >= 10)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, params.max_creators ?? 6)
    .map((c) => c.id);

  const storeUrl =
    params.input.trim().startsWith("http") && app.store !== "none"
      ? params.input.trim()
      : `https://apps.apple.com/us/app/${app.slug}/id6${String(hashString(app.slug) % 1_000_000_000).padStart(9, "0")}`;

  const assumptions = [
    `Category: ${CATEGORY_META[category].label}${guess.source === "guess" ? " (a best guess from the name; pick the right one to tighten the numbers)" : ""}.`,
    `Prices come from ${baseline.sample_n} comparable bounties: the median clearing CPM is ${formatMoney(baseline.clearing_cpm_cents)}.`,
    `Views use the category median of ${formatInt(medianViews)} per post, with a typical spread of 0.4x to 2.55x.`,
    `Trials assume ${formatPercent(baseline.install_to_trial, 1)} of installs start a trial and ${formatPercent(baseline.trial_to_paid, 1)} of trials pay.`,
    `The reference pool is ${formatMoney(REFERENCE_POOL_CENTS, { cents: "auto" })} on the Free plan (12% fee, card processing passed through at cost).`,
    "Hook points are checklist scores of the words only. They are not a prediction.",
  ];

  return {
    slug: app.slug,
    app_name: app.name,
    tagline: copy.tagline,
    category,
    store_url: storeUrl,
    icon: makeArtSeed(rng, { pattern: rng() < 0.5 ? "grid" : "spark", label: app.name.split(" ").slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase() }),
    og_art: makeArtSeed(rng, { pattern: pick(rng, ["orbs", "waves"] as const), label: app.name }),
    brief: buildBrief(app.name, app.slug, copy),
    hooks,
    suggested_format_ids: [...copy.formats],
    predicted_cpm_cents,
    expected_views_per_post,
    expected_cost_per_trial_cents,
    confidence,
    price_curve,
    creators_ready: ready,
    assumptions,
    generated_at: params.now,
    reference_pool: {
      plan: "free",
      budget_cents: REFERENCE_POOL_CENTS,
      cpm_cents: median,
      card_charge_cents: plan.funding.card_charge_cents,
      views: plan.views,
      trials: { low: plan.band.low.trials, median: plan.band.median.trials, high: plan.band.high.trials },
      installs: { low: plan.band.low.installs, median: plan.band.median.installs, high: plan.band.high.installs },
    },
    category_source: guess.source,
    features: [...copy.features],
    label: AUDIT_LABEL,
  };
}

