/**
 * The canonical list of static pages (docs/ROUTES.md, v1 final). One registry feeds the command palette, the sitemap and the
 * route-guard tests, so a page cannot exist in one place and be missing from another. Dynamic routes (`/c/[handle]`, `/b/[id]`,
 * `/brand/bounties/[id]` ...) are built by `entityHref` in ./build.ts.
 *
 * Labels name the content, not the container: "Review queue", never "Home" (apple-design). Sentence case, per the voice.
 */

import type { Role } from "@/lib/contract/types";
import type { RouteAccess } from "@/lib/session/access";
import type { SearchIconName } from "./types";

export type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface RouteDef {
  href: string;
  label: string;
  /** Palette hint and grouping ("Money and rights", "Setup"). */
  section: string;
  access: RouteAccess;
  icon: SearchIconName;
  keywords: readonly string[];
  /** Key sequence shown in the palette and wired with `useKeySequence` ("g", "w"). Unique per role. */
  shortcut?: readonly string[];
  /** 0 to 10 palette weight (default 4). */
  boost?: number;
  /** In the sitemap? Default: every public page. Auth utility pages opt out. */
  indexable?: boolean;
  /** Sitemap priority 0 to 1. */
  priority?: number;
  changeFrequency?: ChangeFrequency;
}

const pub = (
  href: string,
  label: string,
  section: string,
  icon: SearchIconName,
  keywords: readonly string[],
  extra: Partial<RouteDef> = {},
): RouteDef => ({ href, label, section, access: "public", icon, keywords, ...extra });

const brand = (
  href: string,
  label: string,
  section: string,
  icon: SearchIconName,
  keywords: readonly string[],
  extra: Partial<RouteDef> = {},
): RouteDef => ({ href, label, section, access: "brand_member", icon, keywords, ...extra });

const creator = (
  href: string,
  label: string,
  section: string,
  icon: SearchIconName,
  keywords: readonly string[],
  extra: Partial<RouteDef> = {},
): RouteDef => ({ href, label, section, access: "creator", icon, keywords, ...extra });

const admin = (
  href: string,
  label: string,
  section: string,
  icon: SearchIconName,
  keywords: readonly string[],
  extra: Partial<RouteDef> = {},
): RouteDef => ({ href, label, section, access: "admin", icon, keywords, ...extra });

// ── public: marketing, content, auth, tools, legal ─────────────────────────────────────────────

const MARKETING: readonly RouteDef[] = [
  pub("/", "flowd home", "Product", "home", ["landing", "money follows what works", "start"], { boost: 5, priority: 1, changeFrequency: "weekly" }),
  pub("/creators", "For creators", "Product", "film", ["earn", "get paid", "videos", "ugc", "first dollar"], { boost: 5, priority: 0.9, changeFrequency: "weekly" }),
  pub("/brands", "For brands", "Product", "building", ["app teams", "fund bounties", "installs", "attribution"], { boost: 5, priority: 0.9, changeFrequency: "weekly" }),
  pub("/pricing", "Pricing", "Product", "tag", ["plans", "fees", "free", "pro", "scale", "take rate", "12%", "10%", "8%", "all-in"], { boost: 6, priority: 0.9, changeFrequency: "weekly" }),
  pub("/promise", "The flowd Promise", "Product", "badge", ["trust", "commitments", "money has a date", "funded", "72 hours"], { priority: 0.8, changeFrequency: "weekly" }),
  pub("/studio", "Studio", "Product", "film", ["record", "teleprompter", "hook score", "script"], { priority: 0.8, changeFrequency: "monthly" }),
  pub("/compare", "How flowd compares", "Product", "scale", ["trybe", "whop", "sideshift", "agencies", "alternatives", "versus"], { priority: 0.8, changeFrequency: "monthly" }),
  pub("/waitlist", "Join the waitlist", "Product", "ticket", ["invite", "referral", "early access", "position"], { priority: 0.6, changeFrequency: "weekly" }),
  pub("/founding-creators", "Founding creators", "Product", "crown", ["200 spots", "free instant payouts", "badge", "apply"], { priority: 0.7, changeFrequency: "weekly" }),
  pub("/market", "Live market", "Product", "trend", ["clearing cpm", "prices", "supply", "demand", "categories"], { boost: 4, priority: 0.8, changeFrequency: "daily" }),
  pub("/leaderboard", "Weekly leaderboard", "Product", "trophy", ["top creators", "rankings", "earnings", "conversion"], { priority: 0.7, changeFrequency: "daily" }),
  pub("/formats", "Formats and hooks", "Product", "layers", ["hook library", "templates", "screen reaction", "confession", "hidden gem"], { priority: 0.7, changeFrequency: "monthly" }),
  pub("/app", "Get the app", "Product", "phone", ["ios", "testflight", "android", "download", "iphone"], { priority: 0.6, changeFrequency: "monthly" }),
  pub("/security", "Security", "Company", "shield", ["escrow", "ledger", "fraud", "privacy", "encryption", "disclosure"], { priority: 0.6, changeFrequency: "monthly" }),
  pub("/trust", "Trust Center", "Company", "shield", ["promise metrics", "scam shield", "policies", "support sla"], { priority: 0.7, changeFrequency: "weekly" }),
  pub("/trust/report", "Report a scam or abuse", "Company", "siren", ["scam", "abuse", "pay to join", "fake brand", "burner account", "safety"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/about", "About flowd", "Company", "heart", ["mission", "team", "press", "contact"], { priority: 0.5, changeFrequency: "monthly" }),
  pub("/partners", "Partner programme", "Company", "handshake", ["agency", "consultant", "referral", "12 months", "share"], { priority: 0.5, changeFrequency: "monthly" }),
  pub("/developers", "Developers", "Company", "code", ["api", "webhooks", "mcp", "openapi", "sdk", "keys"], { priority: 0.6, changeFrequency: "monthly" }),
  pub("/campus", "Campus ambassadors", "Company", "graduation", ["university", "students", "ambassador"], { priority: 0.4, changeFrequency: "monthly" }),
  pub("/changelog", "Changelog", "Company", "news", ["releases", "updates", "what's new"], { priority: 0.5, changeFrequency: "weekly" }),
  pub("/help", "Help centre", "Company", "help", ["support", "faq", "how do i", "contact"], { priority: 0.6, changeFrequency: "weekly" }),
  pub("/status", "System status", "Company", "activity", ["uptime", "incidents", "outage"], { priority: 0.4, changeFrequency: "daily" }),
];

const AUTH: readonly RouteDef[] = [
  pub("/login", "Sign in", "Account", "key", ["log in", "persona", "demo", "switch account"], { boost: 5, indexable: false }),
  pub("/signup", "Create an account", "Account", "userplus", ["register", "join"], { priority: 0.5, changeFrequency: "monthly" }),
  pub("/signup/creator", "Sign up as a creator", "Account", "userplus", ["join as creator", "start earning"], { priority: 0.5, changeFrequency: "monthly" }),
  pub("/signup/brand", "Sign up as a brand", "Account", "building", ["join as brand", "app team", "workspace"], { priority: 0.5, changeFrequency: "monthly" }),
  pub("/forgot", "Reset your password", "Account", "lock", ["forgot password", "recover"], { indexable: false }),
  pub("/verify", "Verify your identity", "Account", "fingerprint", ["kyc", "id check", "age", "business verification"], { indexable: false }),
];

const TOOLS: readonly RouteDef[] = [
  pub("/tools", "Free tools", "Tools", "wrench", ["hook score", "audit", "calculator", "planner"], { boost: 5, priority: 0.8, changeFrequency: "monthly" }),
  pub("/tools/hook-score", "Hook Score checker", "Tools", "gauge", ["hook", "first 3 seconds", "score", "rewrite", "free"], { boost: 5, priority: 0.8, changeFrequency: "monthly" }),
  pub("/tools/app-ugc-audit", "App UGC Audit", "Tools", "search", ["audit", "app store link", "brief", "hooks", "predicted cpm"], { boost: 5, priority: 0.8, changeFrequency: "monthly" }),
  pub("/tools/earnings-calculator", "Earnings calculator", "Tools", "calculator", ["how much", "median", "p25", "p75", "niche", "posts per week"], { boost: 5, priority: 0.8, changeFrequency: "monthly" }),
  pub("/tools/budget-planner", "Budget planner", "Tools", "piggy", ["views", "installs", "trials", "cac", "spend"], { priority: 0.7, changeFrequency: "monthly" }),
  pub("/tools/price-calculator", "All-in price calculator", "Tools", "percent", ["effective cpm", "fees", "break-even", "vs trybe"], { priority: 0.7, changeFrequency: "monthly" }),
  pub("/report/state-of-app-ugc", "State of App UGC report", "Tools", "chart", ["research", "clearing cpm", "top hooks", "view to trial"], { priority: 0.7, changeFrequency: "monthly" }),
];

const LEGAL: readonly RouteDef[] = [
  pub("/legal/terms", "Terms of service", "Legal", "scroll", ["tos", "escrow", "fees", "clawbacks"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/privacy", "Privacy policy", "Legal", "lock", ["data", "gdpr", "ccpa", "export", "delete"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/creator-agreement", "Creator agreement", "Legal", "file", ["licence", "payment terms", "likeness"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/brand-terms", "Brand terms", "Legal", "file", ["escrow obligations", "review sla", "rights"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/earnings-disclosure", "Earnings disclosure", "Legal", "file", ["results vary", "median", "ftc", "income"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/usage-rights", "Usage rights", "Legal", "filecheck", ["rights card", "paid ads", "90 days", "renewal", "spark", "ai likeness"], { priority: 0.3, changeFrequency: "yearly" }),
  pub("/legal/community-rules", "Community rules", "Legal", "shield", ["no burner accounts", "originality", "strikes", "scam"], { priority: 0.3, changeFrequency: "yearly" }),
];

// ── brand dashboard ────────────────────────────────────────────────────────────────────────────

const BRAND: readonly RouteDef[] = [
  brand("/brand", "Overview", "Overview", "dashboard", ["home", "dashboard", "needs you", "kpis"], { boost: 8 }),
  brand("/brand/bounties", "Bounties", "Bounties", "target", ["campaigns", "live", "drafts", "filled"], { boost: 8, shortcut: ["g", "b"] }),
  brand("/brand/bounties/new", "Start a bounty", "Bounties", "wand", ["new bounty", "create", "ai builder", "brief", "launch", "flo"], { boost: 9 }),
  brand("/brand/review", "Review queue", "Bounties", "review", ["submissions", "approve", "reject", "feedback", "inbox"], { boost: 9, shortcut: ["g", "r"] }),
  brand("/brand/review/rules", "Auto-approve rules", "Bounties", "zap", ["guardrails", "dry run", "spot check", "kill switch"], { boost: 5 }),
  brand("/brand/disputes", "Disputes and appeals", "Bounties", "scale", ["creator disputes", "appeal", "view ledger"]),
  brand("/brand/analytics", "Funnel and analytics", "Growth", "chart", ["roas", "payback", "installs", "trials", "paid", "cost per trial", "creator league"], { boost: 7, shortcut: ["g", "a"] }),
  brand("/brand/library", "Creative library", "Growth", "library", ["hooks", "formats", "winning videos", "tags"]),
  brand("/brand/tests", "Test planner", "Growth", "flask", ["hook body cta", "a/b", "variants", "experiments"]),
  brand("/brand/promote", "Winner promotion", "Growth", "megaphone", ["spark ads", "partnership ads", "whitelisting", "fatigue", "ads"]),
  brand("/brand/creators", "Discover creators", "Market", "users", ["find creators", "invite", "roster", "search creators"], { boost: 6 }),
  brand("/brand/creators/lists", "Creator lists", "Market", "users", ["crm", "favourites", "saved creators", "tags"]),
  brand("/brand/offers", "Direct offers", "Market", "handshake", ["rate card", "buy", "counter", "re-buy"]),
  brand("/brand/market", "Market view", "Market", "trend", ["clearing cpm", "price vs fill time", "competition", "suggested price"], { shortcut: ["g", "m"] }),
  brand("/brand/auctions", "Auctions", "Market", "gavel", ["bids", "second price", "top creator slots"]),
  brand("/brand/specs", "Spec Market", "Market", "store", ["pre-made videos", "license", "scored videos", "first refusal"]),
  brand("/brand/wallet", "Wallet", "Money and rights", "wallet", ["escrow", "fund", "top up", "ledger", "invoices", "balance", "card"], { boost: 9, shortcut: ["g", "w"] }),
  brand("/brand/rights", "Rights Vault", "Money and rights", "filecheck", ["licences", "expiry", "renew", "paid usage", "spark codes"]),
  brand("/brand/compliance", "Compliance QA", "Money and rights", "shield", ["disclosure", "banned claims", "music licence", "audit log", "ftc"]),
  brand("/brand/scorecard", "Brand Scorecard", "Money and rights", "gauge", ["reliability", "pay speed", "decision time", "fairness", "sla"]),
  brand("/brand/apps", "Apps", "Setup", "phone", ["app store", "connect app", "listing"]),
  brand("/brand/onboarding", "Connect your app", "Setup", "rocket", ["onboarding", "revenuecat", "sdk", "setup", "first bounty"]),
  brand("/brand/attribution", "Attribution Kit", "Setup", "link", ["tracking links", "code pool", "revenuecat", "deferred link", "confidence", "sdk"], { boost: 5 }),
  brand("/brand/integrations", "Integrations", "Setup", "plug", ["revenuecat", "appsflyer", "adjust", "branch", "slack", "zapier", "meta", "tiktok"]),
  brand("/brand/team", "Team and activity", "Setup", "team", ["members", "roles", "invite", "activity log", "client approval"]),
  brand("/brand/agency", "Agency roll-up", "Setup", "building", ["clients", "white label", "reports", "multi app"]),
  brand("/brand/developers", "API keys and webhooks", "Setup", "code", ["api", "mcp", "webhook endpoints", "openapi", "scopes"]),
  brand("/brand/settings", "Settings", "Setup", "settings", ["plan", "billing", "notifications", "defaults", "tax", "danger zone"], { boost: 5 }),
];

// ── creator portal ─────────────────────────────────────────────────────────────────────────────

const CREATOR: readonly RouteDef[] = [
  creator("/creator", "Home", "Overview", "home", ["dashboard", "money clock", "daily drop", "streak", "what to post today"], { boost: 8, shortcut: ["g", "h"] }),
  creator("/creator/feed", "Bounty feed", "Earn", "target", ["bounties", "find work", "matches", "funded", "browse"], { boost: 9, shortcut: ["g", "f"] }),
  creator("/creator/studio", "Studio", "Earn", "film", ["make a take", "record", "script", "teleprompter", "hook score", "flow score", "upload"], { boost: 9, shortcut: ["g", "s"] }),
  creator("/creator/submissions", "Submissions", "Earn", "review", ["in review", "revise", "approved", "rejected", "decide by"], { boost: 7 }),
  creator("/creator/posts", "Posts", "Earn", "video", ["views", "installs", "trials", "earnings", "live posts", "window"], { boost: 6 }),
  creator("/creator/wallet", "Wallet", "Money", "wallet", ["money clock", "cash out", "withdraw", "payout", "pending", "cleared", "paid", "earnings card"], { boost: 9, shortcut: ["g", "w"] }),
  creator("/creator/tax", "Tax Desk", "Money", "receipt", ["w-9", "1099", "set aside", "ytd", "csv", "taxes"], { boost: 5 }),
  creator("/creator/rate-card", "Rate card", "Money", "banknote", ["prices", "per video", "paid usage", "minimum cpm", "availability"], { boost: 5 }),
  creator("/creator/inbox", "Inbox", "Money", "inbox", ["offers", "messages", "counter", "direct offers"], { boost: 6 }),
  creator("/creator/rights", "My licences", "Money", "filecheck", ["rights", "expiry", "renewal", "spark access", "ai likeness"]),
  creator("/creator/leaderboard", "Leaderboard", "Grow", "trophy", ["rank", "cohort", "global board", "promotion zone"]),
  creator("/creator/tiers", "Tiers", "Grow", "medal", ["bronze", "silver", "gold", "platinum", "elite", "perks", "progress"], { boost: 5 }),
  creator("/creator/crews", "Crews", "Grow", "users", ["team", "crew", "join", "lead"]),
  creator("/creator/tournaments", "Tournaments", "Grow", "trophy", ["hook battles", "prizes", "enter"]),
  creator("/creator/academy", "Academy", "Grow", "graduation", ["lessons", "learn", "badges", "taxes", "rights", "scams"]),
  creator("/creator/remix", "Remix library", "Grow", "layers", ["formats", "hooks", "trend radar", "why it won"]),
  creator("/creator/referrals", "Referrals", "Grow", "share", ["invite", "link", "reward", "friends"]),
  creator("/creator/wrapped", "Wrapped", "Grow", "sparkles", ["recap", "year", "month", "stories"]),
  creator("/creator/flo", "Ask Flo", "Tools", "sparkles", ["ai", "copilot", "scripts", "captions", "hook rewrite", "chat", "assistant"], { boost: 7 }),
  creator("/creator/profile", "Profile and storefront", "Tools", "user", ["bio", "portfolio", "badges", "link in bio", "public page"]),
  creator("/creator/specs", "Spec uploads", "Tools", "package", ["sell videos", "spec market", "license"]),
  creator("/creator/auctions", "Auction slots", "Tools", "gavel", ["platinum", "bids", "slots"]),
  creator("/creator/safety", "Scam Shield and account health", "Safety", "shieldalert", ["report", "scam", "burner", "originality", "account health"], { boost: 5 }),
  creator("/creator/wellbeing", "Wellbeing Mode", "Safety", "heart", ["quiet hours", "numbers off", "rest week", "pause", "slack"]),
  creator("/creator/settings", "Settings", "Safety", "settings", ["accounts", "payout methods", "notifications", "appearance", "privacy", "delete"], { boost: 5 }),
  creator("/onboarding/creator", "First-Dollar Path", "Overview", "rocket", ["onboarding", "setup", "starter bounty", "first dollar"], { boost: 3 }),
];

// ── admin ──────────────────────────────────────────────────────────────────────────────────────

const ADMIN: readonly RouteDef[] = [
  admin("/admin", "Launch control tower", "Overview", "dashboard", ["overview", "targets", "90-day", "alerts", "demo clock"], { boost: 8 }),
  admin("/admin/fraud", "Fraud queue", "Queues", "shieldalert", ["bots", "view curve", "cap clustering", "hold", "claw back"], { boost: 8, shortcut: ["g", "f"] }),
  admin("/admin/disputes", "Dispute queue", "Queues", "scale", ["appeals", "48 hour sla", "uphold", "overturn"], { boost: 7, shortcut: ["g", "d"] }),
  admin("/admin/verification", "Verification queue", "Queues", "fingerprint", ["kyc", "id", "w-9", "business", "age"], { shortcut: ["g", "v"] }),
  admin("/admin/payouts", "Payout operations", "Queues", "banknote", ["friday run", "holds", "failures", "instant cash-out"], { boost: 7, shortcut: ["g", "p"] }),
  admin("/admin/sla", "Review SLA desk", "Queues", "clock", ["stale", "breach", "72 hours", "approve if clean", "reliability"], { shortcut: ["g", "s"] }),
  admin("/admin/safety", "Safety queue", "Queues", "siren", ["scam reports", "takedown", "strike", "pay to join"]),
  admin("/admin/ledger", "Ledger explorer", "Money", "database", ["double entry", "escrow", "balance proof", "anomaly", "export"], { boost: 6, shortcut: ["g", "l"] }),
  admin("/admin/bounties", "Bounty registry", "Registry", "target", ["pause", "hold", "relabel", "lint override"]),
  admin("/admin/creators", "Creator registry", "Registry", "users", ["tier override", "ban", "kyc", "reliability"]),
  admin("/admin/brands", "Brand registry", "Registry", "building", ["suspend", "fee adjustment", "plan", "scorecard"]),
  admin("/admin/ml", "Model monitoring", "Models", "brain", ["calibration", "drift", "fraud precision", "checklist vs learned", "versions"]),
];

/** Every static page, in the order sections appear in the product. */
export const ROUTE_REGISTRY: readonly RouteDef[] = [...MARKETING, ...AUTH, ...TOOLS, ...LEGAL, ...BRAND, ...CREATOR, ...ADMIN];

const BY_HREF: ReadonlyMap<string, RouteDef> = new Map(ROUTE_REGISTRY.map((r) => [r.href, r]));

/** The registry entry for an exact path, or undefined. */
export const routeFor = (href: string): RouteDef | undefined => BY_HREF.get(href);

/** Pages a role may open: its own area plus every public page. A null role is a visitor: public pages only. */
export function routesForRole(role: Role | null): readonly RouteDef[] {
  return ROUTE_REGISTRY.filter((r) => r.access === "public" || r.access === role);
}

/** Public pages that belong in the sitemap, with their priority and change frequency. */
export function sitemapRoutes(): readonly RouteDef[] {
  return ROUTE_REGISTRY.filter((r) => r.access === "public" && r.indexable !== false);
}

/** The `g` then key shortcuts of one role, for `useKeySequence`. */
export function shortcutsForRole(role: Role): { keys: readonly string[]; href: string; label: string }[] {
  return ROUTE_REGISTRY.filter((r) => r.access === role && r.shortcut).map((r) => ({ keys: r.shortcut ?? [], href: r.href, label: r.label }));
}
