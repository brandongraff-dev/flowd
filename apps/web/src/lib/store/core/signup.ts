/**
 * Sign-up: the two real front doors of the demo (`/signup/creator`, `/signup/brand`). Each one creates a brand-new account inside the demo world
 * (a user, and a creator profile or a brand workspace with its owner seat) and signs the visitor in as it, so the first-run screens (the First-Dollar
 * Path for creators, the connect-an-app checklist for brands) can be walked with a genuinely empty account. Nothing leaves the browser, and
 * "Reset demo" in the account menu throws the account away.
 *
 * Both are public actions: a visitor has no session yet. They validate like the product would (a handle is unique, an email has one account, a
 * creator is 18 or older and has accepted the agreement), and refuse in plain English.
 */

import type { ArtSeed, AuthProvider, Creator, Brand, User } from "@/lib/contract/types";
import { makeArtSeed, makeReferralCode, seededRng } from "@/lib/engine";
import { ensure, type Tx } from "./tx";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE = /^[a-z0-9._]{2,30}$/;
/** Handles that read as the company or its staff. */
const RESERVED_HANDLES: ReadonlySet<string> = new Set(["flowd", "admin", "support", "help", "hello", "team", "ops", "security", "trust", "billing", "press", "legal"]);

/** Id slug: lowercase letters and digits, dots and dashes become underscores (`maya.makes` is `maya_makes`). */
const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "new";

/** The first free id of the form `<prefix>_<slug>`, `<prefix>_<slug>_2`, ... */
function freeId(prefix: string, slug: string, taken: (id: string) => boolean): string {
  let id = `${prefix}_${slug}`;
  for (let n = 2; taken(id); n += 1) id = `${prefix}_${slug}_${n}`;
  return id;
}

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._+-]+/).filter((w) => /^[a-z]+$/i.test(w));
  return words.length > 0 ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "New member";
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "F";

export interface SignUpCreatorInput {
  email: string;
  /** Shown on the profile; defaults to a name made from the email. */
  display_name?: string;
  /** 2 to 30 letters, numbers, dots or underscores. Public link joinflowd.io/c/<handle>. */
  handle: string;
  /** Which door the visitor used (Apple and Google are mocks). */
  provider?: AuthProvider;
  /** The creator confirms they are 18 or older. Required. */
  confirm_18: boolean;
  /** The creator accepts the creator agreement. Required. */
  accept_agreement: boolean;
}

export interface SignUpResult {
  user: User;
  /** Where the visitor goes next. */
  next_path: string;
}

/** Creates a creator account (a user and an empty Bronze profile at the first onboarding stage) and signs the visitor in as it. */
export function signUpCreator(tx: Tx, input: SignUpCreatorInput): SignUpResult & { creator: Creator } {
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim().replace(/^@/, "").toLowerCase();
  ensure(EMAIL.test(email), "email_invalid", "Enter a valid email address.", "Example: you@example.com", 422);
  ensure(HANDLE.test(handle), "handle_invalid", "A handle is 2 to 30 letters, numbers, dots or underscores.", "Example: maya.makes", 422);
  ensure(!RESERVED_HANDLES.has(handle), "handle_reserved", "That handle is reserved.", "Pick one that is yours.", 422);
  ensure(input.confirm_18 === true, "age_required", "flowd creators are 18 or older. Confirm your age to continue.", undefined, 422);
  ensure(input.accept_agreement === true, "agreement_required", "Accept the creator agreement to continue.", "It is short. The summary is on this page.", 422);
  ensure(!tx.all("creators").some((c) => c.handle.toLowerCase() === handle), "handle_taken", `@${handle} is taken.`, "Try adding a word or a number.", 409);
  ensure(!tx.all("users").some((u) => u.email.toLowerCase() === email), "email_taken", "That email already has an account.", "Sign in instead, or use a different email.", 409);

  const name = input.display_name?.trim() || nameFromEmail(email);
  const slug = slugOf(handle);
  const userId = freeId("usr", slug, (id) => tx.get("users", id) !== undefined);
  const creatorId = freeId("cr", slug, (id) => tx.get("creators", id) !== undefined);
  const avatar: ArtSeed = makeArtSeed(seededRng(creatorId), { label: initialsOf(name) });

  const user: User = {
    id: userId,
    role: "creator",
    email,
    display_name: name,
    avatar,
    auth_providers: [input.provider ?? "email"],
    status: "active",
    age_verified: true,
    locale: "en-US",
    timezone: "America/New_York",
    created_at: tx.now,
    last_seen_at: tx.now,
  };
  tx.put("users", user);

  const taken = new Set(tx.all("creators").map((c) => c.referral_code));
  const creator: Creator = {
    id: creatorId,
    user_id: userId,
    handle,
    display_name: name,
    bio: "",
    avatar,
    niches: [],
    country: "US",
    languages: ["en"],
    tier: "bronze",
    tier_basis: "earned",
    tier_since: tx.now,
    lifetime_cleared_cents: 0,
    approved_count: 0,
    decided_count: 0,
    approval_rate: 0,
    reliability_score: 70,
    posts_count: 0,
    live_posts_count: 0,
    joined_at: tx.now,
    last_active_at: tx.now,
    founding: false,
    badges: [],
    verification_status: "not_started",
    onboarding_stage: "signed_up",
    payout_ready: false,
    referral_code: makeReferralCode(name, taken),
    streak_weeks: 0,
    storefront: { slug: handle, headline: "New creator on flowd.", featured_post_ids: [], show_stats: true, cta_label: "Work with me", theme: "lagoon" },
    portfolio: [],
    open_to_offers: false,
  };
  tx.put("creators", creator);

  tx.setSession({ persona: "creator", user_id: userId, creator_id: creatorId, brand_id: null, app_id: null, member_id: null });
  return { user, creator, next_path: "/onboarding/creator" };
}

/** Monthly user-acquisition spend, as the sign-up form asks for it. Used to route the right plan advice; never to price anything. */
export type UaBand = "under_5k" | "5k_25k" | "25k_100k" | "over_100k";

export interface SignUpBrandInput {
  email: string;
  /** The person signing up. */
  name: string;
  company: string;
  /** Their job title: "Growth lead", "Founder". */
  job_title: string;
  ua_band: UaBand;
  provider?: AuthProvider;
}

/** Creates a brand workspace on the Free plan (no apps, an empty wallet, the first-bounty fee waiver unused), its owner seat and the owner's user, and signs the visitor in as it. */
export function signUpBrand(tx: Tx, input: SignUpBrandInput): SignUpResult & { brand: Brand } {
  const email = input.email.trim().toLowerCase();
  const company = input.company.trim();
  const name = input.name.trim();
  ensure(EMAIL.test(email), "email_invalid", "Enter a work email address.", "Example: you@yourapp.com", 422);
  ensure(name.length >= 2, "name_required", "Tell us your name.", undefined, 422);
  ensure(company.length >= 2 && company.length <= 60, "company_invalid", "Enter your company or app name (2 to 60 characters).", undefined, 422);
  ensure(input.job_title.trim().length >= 2, "role_required", "Tell us your role, for example Growth lead.", undefined, 422);
  ensure(!tx.all("users").some((u) => u.email.toLowerCase() === email), "email_taken", "That email already has an account.", "Sign in instead, or use a different email.", 409);

  const slug = slugOf(company);
  const brandId = freeId("br", slug, (id) => tx.get("brands", id) !== undefined);
  const userId = freeId("usr", slugOf(name), (id) => tx.get("users", id) !== undefined);
  const memberId = freeId("bm", `${slug}_${slugOf(name)}`, (id) => tx.get("brand_members", id) !== undefined);

  const user: User = {
    id: userId,
    role: "brand_member",
    email,
    display_name: name,
    avatar: makeArtSeed(seededRng(userId), { label: initialsOf(name) }),
    auth_providers: [input.provider ?? "email"],
    status: "active",
    age_verified: true,
    locale: "en-US",
    timezone: "America/New_York",
    created_at: tx.now,
    last_seen_at: tx.now,
    title: input.job_title.trim(),
  };
  tx.put("users", user);

  const brand: Brand = {
    id: brandId,
    kind: "brand",
    name: company,
    slug,
    tagline: "",
    logo: makeArtSeed(seededRng(brandId), { pattern: "spark", label: initialsOf(company).slice(0, 1) }),
    website: `https://${slug.replace(/_/g, "-")}.example`,
    country: "US",
    plan: "free",
    verification: "not_started",
    created_at: tx.now,
    first_bounty_waiver_used: false,
    matched_budget_used_cents: 0,
    wallet_balance_cents: 0,
    billing: { legal_name: company, billing_email: email, po_required: false },
    timeout_policy: "escalate",
    review_sla_hours: 72,
    compliance_defaults: { disclosure_text: `#ad Paid partnership with ${company}`, banned_claims: [], competitor_names: [], music_policy: "commercial_library", ai_policy: "allowed_disclosed" },
  };
  tx.put("brands", brand);
  tx.put("brand_members", { id: memberId, brand_id: brandId, user_id: userId, role: "owner", status: "active", joined_at: tx.now, last_active_at: tx.now });

  tx.setSession({ persona: "brand", user_id: userId, creator_id: null, brand_id: brandId, app_id: null, member_id: memberId });
  return { user, brand, next_path: "/brand/onboarding" };
}
