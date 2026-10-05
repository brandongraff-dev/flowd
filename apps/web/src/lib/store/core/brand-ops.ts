/**
 * Brand workspace actions: apps, integrations, API keys and webhooks, the team, guarded auto-approve rules, rights renewals, Winner promotion,
 * fatigue alerts, lists, settings and the free App UGC Audit.
 */

import type {
  Ad,
  AdKind,
  AdPlatform,
  ApiKey,
  ApiScope,
  App,
  AuditReport,
  AutoApproveRule,
  Brand,
  BrandList,
  BrandMemberRole,
  FatigueAlert,
  Integration,
  IntegrationKind,
  KeyMode,
  RightsGrant,
  Webhook,
  WebhookEventType,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  addMonths,
  canEnable,
  clockLabel,
  dryRun,
  formatMoney,
  generateAudit,
  hashString,
  inferCategory,
  killRule as engineKillRule,
  makeArtSeed,
  mulRate,
  parseAppInput,
  planHasFeature,
  renewalQuote,
  rightsEndsAt,
  rightsRenewalMemo,
  rightsRenewalTxn,
  seededRng,
  sparkCodeDaysFor,
  takeRateFor,
  toMs,
  daysLeft,
  cheapestPlanWith,
  planLabel,
  type DryRunResult,
} from "@/lib/engine";
import { autoApproveSubject } from "./adapters";
import { ensureWalletCovers } from "./billing";
import { addPlatformEarning } from "./earnings";
import { requireBrand, requireCreator, requireAdmin } from "./guards";
import { describeActor, logActivity, notifyBrand, notifyCreator } from "./notify";
import { tryAutoApprove } from "./submissions";
import { ActionError, ensure, type Tx } from "./tx";
import { pad, slug } from "../ids";
import { schemeOf } from "./tracking";

export const needFeature = (tx: Tx, brand: Brand, feature: Parameters<typeof planHasFeature>[1], what: string): void => {
  if (planHasFeature(brand.plan, feature)) return;
  const need = cheapestPlanWith(feature);
  throw new ActionError("plan_required", `${what} is part of the ${need ? planLabel(need) : "Pro"} plan.`, `You are on ${planLabel(brand.plan)}. Upgrade in Settings, then Plan and billing.`, 402);
};

// ── apps ───────────────────────────────────────────────────────────────────────────────────────

/** Adds an app from an App Store link or a name: metadata is looked up (mocked from the name and category), the icon is generated art, never a real logo. */
export function addApp(tx: Tx, input: { store_url_or_name: string; brand_id?: string; category?: App["category"] }): { app: App } {
  const { brand, member } = requireBrand(tx, input.brand_id, "manage");
  const parsed = parseAppInput(input.store_url_or_name);
  ensure(parsed.name.trim().length > 0, "invalid_app", "Paste an App Store link or type the app's name.", "Example: https://apps.apple.com/us/app/lumi/id6448907919", 422);
  const id = `app_${slug(parsed.name).replace(/-/g, "")}`;
  ensure(!tx.get("apps", id), "app_exists", `${parsed.name} is already in a workspace.`, undefined, 409);
  const audit = generateAudit({ input: input.store_url_or_name, now: tx.now });
  const category = input.category ?? inferCategory(parsed.name).category;
  const app: App = {
    id,
    brand_id: brand.id,
    name: parsed.name,
    tagline: audit.tagline,
    category,
    icon: audit.icon,
    brand_colors: { primary: "#6D5CFF", secondary: "#2EB8FF", accent: "#FFC15E" },
    features: audit.features.slice(0, 5),
    app_store_id: String(1_000_000_000 + (hashString(id) % 8_999_999_999)),
    bundle_id: `com.${slug(brand.name).replace(/-/g, "")}.${slug(parsed.name).replace(/-/g, "")}`,
    store_url: audit.store_url,
    pricing: { monthly_cents: 999, annual_cents: 5999, trial_days: 7 },
    avg_first_payment_cents: 3499,
    rating: 4.6,
    rating_count: 120,
    status: "pending",
    connected_at: tx.now,
    mmp: "none",
    sdk_status: "not_installed",
    default_hashtags: [`#${slug(parsed.name).replace(/-/g, "")}`, "#ad"],
  };
  tx.put("apps", app);
  logActivity(tx, { brand_id: brand.id, action: "integration_connected", summary: `${describeActor(tx, member?.id)} added the app ${app.name}`, actor_member_id: member?.id, target_kind: "app", target_id: app.id });
  return { app };
}

/** Updates an app's pricing, features or hashtags (attribution settings are changed by connecting integrations). */
export function updateApp(tx: Tx, input: { app_id: string; changes: Partial<Pick<App, "name" | "tagline" | "features" | "default_hashtags" | "pricing" | "avg_first_payment_cents" | "category">> }): { app: App } {
  const app = tx.must("apps", input.app_id, "App");
  requireBrand(tx, app.brand_id, "manage");
  return { app: tx.patch("apps", app.id, input.changes) };
}

/**
 * Archives an app (or brings it back). An archived app leaves the switcher and cannot start bounties; its history, ledger entries and rights
 * stay. It cannot be archived while money is in a bounty for it (live, paused, full or scheduled), or when it is the last active app of the workspace.
 */
export function setAppArchived(tx: Tx, input: { app_id: string; archived: boolean }): { app: App } {
  const app = tx.must("apps", input.app_id, "App");
  const { brand, member } = requireBrand(tx, app.brand_id, "manage");
  const isArchived = app.archived_at !== undefined;
  if (input.archived === isArchived) return { app };
  if (input.archived) {
    const open = tx.all("bounties").filter((x) => x.app_id === app.id && ["live", "paused", "filled", "scheduled"].includes(x.status));
    ensure(open.length === 0, "app_has_open_bounties", `${app.name} still has ${open.length === 1 ? "a bounty" : `${open.length} bounties`} with money in escrow.`, "End or settle them first, then archive the app.", 409);
    const others = tx.all("apps").filter((a) => a.brand_id === brand.id && a.id !== app.id && a.archived_at === undefined);
    ensure(others.length > 0, "last_app", "Keep at least one active app in the workspace.", "Connect another app first.", 409);
  }
  const next = input.archived ? tx.patch("apps", app.id, { archived_at: tx.now }) : tx.unset("apps", app.id, "archived_at");
  if (input.archived && tx.session.app_id === app.id) {
    const fallback = tx.all("apps").find((a) => a.brand_id === brand.id && a.id !== app.id && a.archived_at === undefined);
    tx.setSession({ ...tx.session, app_id: fallback?.id ?? null });
  }
  logActivity(tx, {
    brand_id: brand.id,
    action: input.archived ? "integration_disconnected" : "integration_connected",
    summary: `${describeActor(tx, member?.id)} ${input.archived ? "archived" : "restored"} the app ${app.name}`,
    actor_member_id: member?.id,
    target_kind: "app",
    target_id: app.id,
  });
  return { app: next };
}

// ── integrations ───────────────────────────────────────────────────────────────────────────────

const COVERAGE: Record<IntegrationKind, number | undefined> = { revenuecat: 0.82, appsflyer: 0.9, adjust: 0.88, branch: 0.86, meta_ads: undefined, tiktok_ads: undefined, slack: undefined, zapier: undefined, app_store_connect: 0.4 };
const LABEL: Record<IntegrationKind, string> = { revenuecat: "RevenueCat", appsflyer: "AppsFlyer", adjust: "Adjust", branch: "Branch", meta_ads: "Meta ads account", tiktok_ads: "TikTok ads account", slack: "Slack", zapier: "Zapier", app_store_connect: "App Store Connect" };

export interface ConnectIntegrationInput {
  kind: IntegrationKind;
  app_id?: string;
  /** Non-secret settings, such as the Slack channel "#growth-ugc". */
  config?: Record<string, string>;
  brand_id?: string;
}

/**
 * Connects an integration (an adapter with a realistic mock in this build). RevenueCat gets its ingest URL and a masked signing secret; a connected
 * RevenueCat or MMP raises the app's attribution coverage, and CPA still pays only on link and code conversions.
 */
export function connectIntegration(tx: Tx, input: ConnectIntegrationInput): { integration: Integration; webhook_secret?: string } {
  const app = input.app_id ? tx.must("apps", input.app_id, "App") : undefined;
  const { brand, member } = requireBrand(tx, input.brand_id ?? app?.brand_id, "manage");
  if (input.kind === "slack" || input.kind === "zapier") needFeature(tx, brand, input.kind === "slack" ? "slack" : "api", input.kind === "slack" ? "Slack approvals" : "Zapier and the API");
  ensure(!(["revenuecat", "appsflyer", "adjust", "branch", "app_store_connect"] as IntegrationKind[]).includes(input.kind) || app, "app_required", `Pick the app to connect ${LABEL[input.kind]} to.`, undefined, 422);
  const id = `intg_${brand.slug}_${app ? `${slug(app.name).replace(/-/g, "")}_` : ""}${input.kind}`;
  const existing = tx.get("integrations", id);
  const secret = `whsec_${hashString(`${id}|secret`).toString(36)}${hashString(`${id}|2`).toString(36)}`;
  const integration: Integration = {
    id,
    brand_id: brand.id,
    ...(app ? { app_id: app.id } : {}),
    kind: input.kind,
    status: "connected",
    label: `${LABEL[input.kind]}${app ? `: ${app.name}` : ""}`,
    scopes: input.kind === "slack" ? ["chat:write", "commands"] : input.kind === "revenuecat" ? ["webhooks:receive"] : ["read"],
    config: input.config ?? existing?.config ?? {},
    ...(input.kind === "revenuecat" && app ? { webhook_url: `https://api.joinflowd.io/v1/webhooks/revenuecat/${slug(app.name).replace(/-/g, "")}`, secret_last4: secret.slice(-4) } : {}),
    ...(COVERAGE[input.kind] !== undefined ? { coverage_ratio: COVERAGE[input.kind] } : {}),
    events_24h: 0,
    health_note: input.kind === "revenuecat" ? "Connected. Send a test event to confirm events flow." : "Connected.",
    connected_at: tx.now,
    last_sync_at: tx.now,
  };
  tx.put("integrations", integration);
  if (app) {
    if (input.kind === "revenuecat") tx.patch("apps", app.id, { revenuecat_project_id: app.revenuecat_project_id ?? `proj_${1000 + (hashString(app.id) % 8999)}`, status: "connected", sdk_status: app.sdk_status === "verified" ? "verified" : "installed" });
    if (input.kind === "appsflyer" || input.kind === "adjust" || input.kind === "branch") tx.patch("apps", app.id, { mmp: input.kind });
  }
  logActivity(tx, { brand_id: brand.id, action: "integration_connected", summary: `${describeActor(tx, member?.id)} connected ${integration.label}`, actor_member_id: member?.id, target_kind: "integration", target_id: id });
  return { integration, ...(input.kind === "revenuecat" ? { webhook_secret: secret } : {}) };
}

/** Disconnects an integration. Attribution that relied on it falls back to the tracking link and codes. */
export function disconnectIntegration(tx: Tx, input: { integration_id: string }): { integration: Integration } {
  const i = tx.must("integrations", input.integration_id, "Integration");
  const { member } = requireBrand(tx, i.brand_id, "manage");
  const next = tx.patch("integrations", i.id, { status: "disconnected", health_note: "Disconnected. Tracking links and codes keep working.", events_24h: 0 });
  logActivity(tx, { brand_id: i.brand_id, action: "integration_disconnected", summary: `${describeActor(tx, member?.id)} disconnected ${i.label}`, actor_member_id: member?.id, target_kind: "integration", target_id: i.id });
  return { integration: next };
}

/** Sends a test event through a connected integration: the counters and the health note update. */
export function testIntegration(tx: Tx, input: { integration_id: string }): { integration: Integration } {
  const i = tx.must("integrations", input.integration_id, "Integration");
  requireBrand(tx, i.brand_id, "manage");
  ensure(i.status === "connected" || i.status === "needs_attention", "invalid_state", "Connect it first.", undefined, 409);
  return { integration: tx.patch("integrations", i.id, { status: "connected", events_24h: i.events_24h + 1, last_event_at: tx.now, last_sync_at: tx.now, health_note: "Test event received and matched. Events are flowing." }) };
}

// ── API keys and webhooks ──────────────────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string;
  mode?: KeyMode;
  scopes?: ApiScope[];
  expires_in_days?: number;
}

/**
 * Creates an API key. The full secret is returned ONCE in this result and never stored (only the prefix and last four characters are). Writes are drafts
 * by default; the financial scope needs an owner or admin. Available from the Pro plan.
 */
export function createApiKey(tx: Tx, input: CreateApiKeyInput): { key: ApiKey; secret: string } {
  const { brand, member } = requireBrand(tx, null, "manage");
  needFeature(tx, brand, "api", "The public API");
  ensure(input.name.trim().length >= 3, "name_required", "Name the key so you remember what it is for (3 or more characters).", undefined, 422);
  const mode = input.mode ?? "test";
  const prefix = mode === "live" ? "fd_live_" : "fd_test_";
  const n = tx.nextNumber("pm") + hashString(`${brand.id}|${input.name}`);
  const body = `${hashString(`k1|${n}`).toString(36)}${hashString(`k2|${n}`).toString(36)}${hashString(`k3|${n}`).toString(36)}${hashString(`k4|${n}`).toString(36)}`.padEnd(32, "x").slice(0, 32);
  const secret = `${prefix}${body}`;
  const key: ApiKey = {
    id: `key_${brand.slug}_${slug(input.name, 24).replace(/-/g, "_") || "key"}`,
    brand_id: brand.id,
    name: input.name.trim(),
    mode,
    scopes: input.scopes && input.scopes.length > 0 ? input.scopes : ["read"],
    prefix,
    last4: secret.slice(-4),
    created_by_member_id: member?.id ?? "bm_system",
    rate_limit_per_minute: brand.plan === "scale" ? 600 : 120,
    requests_30d: 0,
    created_at: tx.now,
    ...(input.expires_in_days ? { expires_at: addDays(tx.now, input.expires_in_days) } : {}),
  };
  ensure(!tx.get("api_keys", key.id), "key_exists", "A key with that name exists. Pick another name.", undefined, 409);
  tx.put("api_keys", key);
  logActivity(tx, { brand_id: brand.id, action: "api_key_created", summary: `${describeActor(tx, member?.id)} created the ${mode} API key "${key.name}"`, actor_member_id: member?.id, target_kind: "api_key", target_id: key.id });
  return { key, secret };
}

/** Revokes a key at once. */
export function revokeApiKey(tx: Tx, input: { key_id: string }): { key: ApiKey } {
  const k = tx.must("api_keys", input.key_id, "API key");
  const { member } = requireBrand(tx, k.brand_id, "manage");
  ensure(!k.revoked_at, "invalid_state", "That key is already revoked.", undefined, 409);
  logActivity(tx, { brand_id: k.brand_id, action: "api_key_revoked", summary: `${describeActor(tx, member?.id)} revoked the API key "${k.name}"`, actor_member_id: member?.id, target_kind: "api_key", target_id: k.id });
  return { key: tx.patch("api_keys", k.id, { revoked_at: tx.now }) };
}

/** Registers a webhook endpoint (HTTPS only). Deliveries are signed; the secret is shown once. */
export function createWebhook(tx: Tx, input: { url: string; events: WebhookEventType[] }): { webhook: Webhook; secret: string } {
  const { brand, member } = requireBrand(tx, null, "manage");
  needFeature(tx, brand, "api", "Webhooks");
  ensure(/^https:\/\/[^\s]+$/i.test(input.url), "url_invalid", "Webhooks need a full https:// URL.", undefined, 422);
  ensure(input.events.length > 0, "events_required", "Pick at least one event.", undefined, 422);
  const id = `whk_${brand.slug}_${String(tx.all("webhooks").filter((w) => w.brand_id === brand.id).length + 1).padStart(2, "0")}`;
  const secret = `whsec_${hashString(`${id}|s`).toString(36)}${hashString(`${id}|t`).toString(36)}`;
  const webhook: Webhook = { id, brand_id: brand.id, url: input.url.trim(), events: input.events, status: "active", secret_last4: secret.slice(-4), failure_count: 0, deliveries: [], created_at: tx.now };
  tx.put("webhooks", webhook);
  logActivity(tx, { brand_id: brand.id, action: "webhook_created", summary: `${describeActor(tx, member?.id)} added a webhook endpoint`, actor_member_id: member?.id, target_kind: "webhook", target_id: id });
  return { webhook, secret };
}

/** Sends a signed test delivery to a webhook and records it. */
export function testWebhook(tx: Tx, input: { webhook_id: string }): { webhook: Webhook } {
  const w = tx.must("webhooks", input.webhook_id, "Webhook");
  requireBrand(tx, w.brand_id, "manage");
  ensure(w.status !== "disabled", "invalid_state", "This endpoint is disabled.", undefined, 409);
  const event: WebhookEventType = w.events[0] ?? "bounty_funded";
  const delivery = { id: `whd_${pad(tx.nextNumber("whd"), 4)}`, event, status: "delivered" as const, status_code: 200, at: tx.now, latency_ms: 90 + (hashString(`${w.id}|${tx.now}`) % 160) };
  return { webhook: tx.patch("webhooks", w.id, { deliveries: [delivery, ...w.deliveries].slice(0, 20), last_success_at: tx.now, failure_count: 0, status: "active" }) };
}

// ── the team ───────────────────────────────────────────────────────────────────────────────────

/** Invites a teammate. Roles: admin, reviewer, finance, viewer, or a seat-free client approver with their own approval link. */
export function inviteTeamMember(tx: Tx, input: { email: string; name?: string; role: Exclude<BrandMemberRole, "owner"> }): { member_id: string; user_id: string; approval_link?: string } {
  const { brand, member } = requireBrand(tx, null, "manage");
  ensure(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()), "email_invalid", "Enter a valid work email.", undefined, 422);
  const email = input.email.trim().toLowerCase();
  ensure(!tx.all("users").some((u) => u.email.toLowerCase() === email && tx.all("brand_members").some((m) => m.user_id === u.id && m.brand_id === brand.id && m.status !== "removed")), "already_member", "That person is already on the team.", undefined, 409);
  const local = email.split("@")[0];
  const display = input.name?.trim() || local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const userId = `usr_${slug(display).replace(/-/g, "_")}_${pad(tx.nextNumber("pm"), 3)}`;
  tx.put("users", { id: userId, role: "brand_member", email, display_name: display, avatar: makeArtSeed(seededRng(userId), { label: display.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() }), auth_providers: ["email"], status: "invited", age_verified: true, locale: "en-US", timezone: "America/Chicago", created_at: tx.now });
  const memberId = `bm_${brand.slug}_${slug(display).replace(/-/g, "")}`;
  const code = input.role === "client_approver" ? `appr_${hashString(memberId).toString(36)}` : undefined;
  tx.put("brand_members", { id: memberId, brand_id: brand.id, user_id: userId, role: input.role, status: "invited", ...(member ? { invited_by_member_id: member.id } : {}), ...(code ? { approval_link_code: code } : {}), joined_at: tx.now });
  logActivity(tx, { brand_id: brand.id, action: "member_invited", summary: `${describeActor(tx, member?.id)} invited ${display} as ${input.role.replace(/_/g, " ")}`, actor_member_id: member?.id, target_kind: "member", target_id: memberId });
  return { member_id: memberId, user_id: userId, ...(code ? { approval_link: `joinflowd.io/approve/${code}` } : {}) };
}

/** Changes a teammate's role (owners are fixed; a workspace always keeps its owner). */
export function changeMemberRole(tx: Tx, input: { member_id: string; role: Exclude<BrandMemberRole, "owner"> }): { member_id: string } {
  const target = tx.must("brand_members", input.member_id, "Team member");
  const { member } = requireBrand(tx, target.brand_id, "manage");
  ensure(target.role !== "owner", "owner_fixed", "A workspace owner's role cannot be changed here.", undefined, 409);
  tx.patch("brand_members", target.id, { role: input.role });
  logActivity(tx, { brand_id: target.brand_id, action: "member_role_changed", summary: `${describeActor(tx, member?.id)} made ${tx.get("users", target.user_id)?.display_name ?? "a teammate"} ${input.role.replace(/_/g, " ")}`, actor_member_id: member?.id, target_kind: "member", target_id: target.id });
  return { member_id: target.id };
}

/** Removes a teammate. */
export function removeMember(tx: Tx, input: { member_id: string }): { member_id: string } {
  const target = tx.must("brand_members", input.member_id, "Team member");
  const { member } = requireBrand(tx, target.brand_id, "manage");
  ensure(target.role !== "owner", "owner_fixed", "A workspace owner cannot be removed.", undefined, 409);
  tx.patch("brand_members", target.id, { status: "removed" });
  logActivity(tx, { brand_id: target.brand_id, action: "member_removed", summary: `${describeActor(tx, member?.id)} removed ${tx.get("users", target.user_id)?.display_name ?? "a teammate"}`, actor_member_id: member?.id, target_kind: "member", target_id: target.id });
  return { member_id: target.id };
}

// ── guarded auto-approve rules ─────────────────────────────────────────────────────────────────

export interface SaveRuleInput {
  rule_id?: string;
  name: string;
  conditions?: Partial<AutoApproveRule["conditions"]>;
  scope?: Partial<AutoApproveRule["scope"]>;
  guardrails?: Partial<AutoApproveRule["guardrails"]>;
  timeout_policy?: AutoApproveRule["timeout_policy"];
}

/** Creates or edits a rule. Editing conditions sends it back to draft: a rule needs a fresh dry run on its current conditions before it can be enabled. */
export function saveRule(tx: Tx, input: SaveRuleInput): { rule: AutoApproveRule } {
  const { brand, member } = requireBrand(tx, null, "manage");
  needFeature(tx, brand, "guarded_auto_approve", "Guarded auto-approve");
  ensure(input.name.trim().length >= 3, "name_required", "Name the rule.", undefined, 422);
  const existing = input.rule_id ? tx.must("auto_approve_rules", input.rule_id, "Rule") : undefined;
  if (existing) ensure(existing.brand_id === brand.id, "forbidden", "That rule belongs to another brand.", undefined, 403);
  const A = CONSTANTS.auto_approve;
  const base: AutoApproveRule = existing ?? {
    id: `rule_${brand.slug}_${slug(input.name, 28).replace(/-/g, "_")}`,
    brand_id: brand.id,
    name: input.name.trim(),
    status: "draft",
    conditions: { min_flow_band: A.default_min_flow_band, require_all_beats: true, require_disclosure_pass: true, require_no_duplicate: true, require_music_pass: true, max_fraud_score: A.default_max_fraud_score, min_us_audience_ratio: A.default_min_us_audience_ratio, min_creator_approved_posts: A.default_min_creator_approved_posts, min_creator_approval_rate: A.default_min_creator_approval_rate },
    scope: { bounty_ids: [], tiers: [], platforms: [] },
    guardrails: { daily_cap: 10, budget_cap_cents: 100_000, spot_check_ratio: A.spot_check_ratio, pause_on_fraud: true },
    timeout_policy: brand.timeout_policy,
    stats: { auto_approved: 0, spot_checked: 0, spot_check_overturned: 0 },
    audit: [{ at: tx.now, ...(member ? { actor_member_id: member.id } : {}), action: "created", note: "Rule created." }],
    created_by_member_id: member?.id ?? "bm_system",
    created_at: tx.now,
    updated_at: tx.now,
  };
  if (!existing) ensure(!tx.get("auto_approve_rules", base.id), "rule_exists", "A rule with that name exists.", undefined, 409);
  if (input.guardrails?.spot_check_ratio !== undefined) ensure(input.guardrails.spot_check_ratio >= A.spot_check_ratio, "spot_check_floor", `The spot-check share cannot go below ${Math.round(A.spot_check_ratio * 100)}%.`, "A person always reviews a share of automatic approvals.", 422);
  const conditionsChanged = input.conditions !== undefined || input.scope !== undefined;
  const rule: AutoApproveRule = {
    ...base,
    name: input.name.trim(),
    conditions: { ...base.conditions, ...(input.conditions ?? {}) },
    scope: { ...base.scope, ...(input.scope ?? {}) },
    guardrails: { ...base.guardrails, ...(input.guardrails ?? {}) },
    timeout_policy: input.timeout_policy ?? base.timeout_policy,
    status: existing && conditionsChanged && (existing.status === "dry_run" || existing.status === "active") ? "draft" : base.status,
    audit: existing ? [...base.audit, { at: tx.now, ...(member ? { actor_member_id: member.id } : {}), action: "edited" as const, note: "Rule edited." }] : base.audit,
    updated_at: tx.now,
  };
  if (existing && conditionsChanged) delete (rule as Partial<AutoApproveRule>).dry_run;
  tx.put("auto_approve_rules", rule);
  if (!existing) logActivity(tx, { brand_id: brand.id, action: "rule_created", summary: `${describeActor(tx, member?.id)} created the auto-approve rule "${rule.name}"`, actor_member_id: member?.id, target_kind: "rule", target_id: rule.id });
  return { rule };
}

/** Dry run on the brand's last 50 submissions: what the rule WOULD have done, with the reasons. Approves nothing. Mandatory before a rule can be enabled. */
export function dryRunRule(tx: Tx, input: { rule_id: string }): { rule: AutoApproveRule; result: DryRunResult } {
  const rule = tx.must("auto_approve_rules", input.rule_id, "Rule");
  const { member } = requireBrand(tx, rule.brand_id, "manage");
  const subs = tx.all("submissions").filter((s) => s.brand_id === rule.brand_id && s.status !== "withdrawn" && s.status !== "expired");
  const subjects = subs.map((s) => autoApproveSubject(s, tx.get("video_analyses", `va_${s.id.slice(4)}_v${s.version}`), tx.must("creators", s.creator_id), tx.must("bounties", s.bounty_id)));
  const result = dryRun(rule, subjects, { now: tx.now });
  const next = tx.patch("auto_approve_rules", rule.id, { dry_run: result.dry_run, status: rule.status === "draft" || rule.status === "killed" ? "dry_run" : rule.status, audit: [...rule.audit, { at: tx.now, ...(member ? { actor_member_id: member.id } : {}), action: "dry_run" as const, note: result.headline }], updated_at: tx.now });
  return { rule: next, result };
}

/** Switches a rule on (after a dry run), pauses it, resumes it, or kills it (the kill switch needs a reason). */
export function setRuleStatus(tx: Tx, input: { rule_id: string; status: "active" | "paused" | "killed"; reason?: string }): { rule: AutoApproveRule } {
  const rule = tx.must("auto_approve_rules", input.rule_id, "Rule");
  const { member, brand } = requireBrand(tx, rule.brand_id, "manage");
  needFeature(tx, brand, "guarded_auto_approve", "Guarded auto-approve");
  const audit = (action: AutoApproveRule["audit"][number]["action"], note: string): AutoApproveRule["audit"] => [...rule.audit, { at: tx.now, ...(member ? { actor_member_id: member.id } : {}), action, note }];
  if (input.status === "active") {
    if (rule.status === "paused") return { rule: tx.patch("auto_approve_rules", rule.id, { status: "active", audit: audit("resumed", "Rule resumed."), updated_at: tx.now }) };
    const can = canEnable(rule);
    ensure(can.ok, "dry_run_required", can.reason ?? "Run the dry run first.", "A dry run shows what the rule would have done on your last 50 submissions.", 409);
    tx.patch("auto_approve_rules", rule.id, { status: "active", enabled_at: tx.now, audit: audit("enabled", "Rule enabled after a dry run."), updated_at: tx.now });
    logActivity(tx, { brand_id: brand.id, action: "rule_enabled", summary: `${describeActor(tx, member?.id)} enabled the auto-approve rule "${rule.name}"`, actor_member_id: member?.id, target_kind: "rule", target_id: rule.id });
  } else if (input.status === "paused") {
    ensure(rule.status === "active", "invalid_state", "Only an active rule can be paused.", undefined, 409);
    tx.patch("auto_approve_rules", rule.id, { status: "paused", audit: audit("paused", input.reason?.trim() || "Rule paused."), updated_at: tx.now });
  } else {
    ensure(input.reason && input.reason.trim().length >= 3, "reason_required", "Say why you are killing the rule. It is logged.", undefined, 422);
    tx.patch("auto_approve_rules", rule.id, { ...engineKillRule(input.reason.trim(), tx.now), audit: audit("killed", input.reason.trim()), updated_at: tx.now });
    logActivity(tx, { brand_id: brand.id, action: "rule_killed", summary: `${describeActor(tx, member?.id)} killed the auto-approve rule "${rule.name}": ${input.reason.trim()}`, actor_member_id: member?.id, target_kind: "rule", target_id: rule.id });
  }
  return { rule: tx.must("auto_approve_rules", rule.id) };
}

/** Runs the active rules over the videos waiting in review now (the "run on the backlog" button). Anything the rules do not approve stays for a person. */
export function autoApproveRun(tx: Tx, input: { rule_id?: string } = {}): { approved: number; routed_to_human: number; evaluated: number } {
  const { brand } = requireBrand(tx, null, "review");
  needFeature(tx, brand, "guarded_auto_approve", "Guarded auto-approve");
  const rules = tx.all("auto_approve_rules").filter((r) => r.brand_id === brand.id && r.status === "active" && (!input.rule_id || r.id === input.rule_id));
  ensure(rules.length > 0, "no_active_rule", "No active rule to run.", "Enable a rule after its dry run.", 409);
  const queue = tx.all("submissions").filter((s) => s.brand_id === brand.id && s.status === "in_review");
  let approved = 0;
  let routed = 0;
  for (const s of queue) {
    const analysis = tx.get("video_analyses", `va_${s.id.slice(4)}_v${s.version}`);
    const r = tryAutoApprove(tx, s.id, analysis);
    if (r.approved) approved += 1;
    else routed += 1;
  }
  return { approved, routed_to_human: routed, evaluated: queue.length };
}

// ── rights: renew and revoke ───────────────────────────────────────────────────────────────────

/** Renews paid-ad rights: each started 30 days costs 25% of the base fee (paid to the creator, outside the per-video cap) plus the platform fee, from the wallet. */
export function renewRights(tx: Tx, input: { grant_id: string; extra_days: number }): { grant: RightsGrant; total_cents: number } {
  const g = tx.must("rights_grants", input.grant_id, "Licence");
  const { member, brand } = requireBrand(tx, g.brand_id, "finance");
  ensure(g.scope !== "organic" && g.ends_at, "invalid_state", "Organic posting never expires, so there is nothing to renew.", undefined, 409);
  ensure(g.status !== "revoked", "invalid_state", "This licence was revoked.", undefined, 409);
  ensure(input.extra_days >= 1 && input.extra_days <= 365, "days_invalid", "Renew for 1 to 365 days.", undefined, 422);
  const bounty = tx.get("bounties", g.bounty_id);
  const quote = renewalQuote({ base_fee_cents: g.base_fee_cents, renewal_pct_per_30d: g.renewal_pct_per_30d, extra_days: input.extra_days, take_rate: takeRateFor({ plan: brand.plan, type: "direct" }) , current_ends_at: toMs(g.ends_at as string) > toMs(tx.now) ? g.ends_at : tx.now });
  ensure(quote.price_cents > 0, "no_price", "This licence has no base fee to renew against.", "Renewals are priced from the post's settled creator pay.", 409);
  ensureWalletCovers(tx, brand.id, quote.total_cents);
  const txnId = tx.nextId("txn");
  const memo = rightsRenewalMemo(quote.periods * 30, bounty?.title ?? "licence");
  const rows = tx.post(rightsRenewalTxn({ txn_id: txnId, posted_at: tx.now, brand_id: brand.id, creator_id: g.creator_id, post_id: g.post_id, bounty_id: g.bounty_id, price_cents: quote.price_cents, fee_cents: quote.fee_cents, memo, fee_memo: `Platform fee ${Math.round(takeRateFor({ plan: brand.plan, type: "direct" }) * 100)}%: rights renewal` }));
  const creatorLeg = rows.find((r) => r.account === `creator:${g.creator_id}`);
  tx.put("money_clock", { id: tx.nextId("mc"), creator_id: g.creator_id, bounty_id: g.bounty_id, app_id: g.app_id, post_id: g.post_id, source: "rights_fee", state: "pending", amount_cents: quote.price_cents, estimated: false, earned_at: tx.now, eta_at: addDays(tx.now, 1), reason: "awaiting_clearing_run", reason_text: `Rights renewal for ${quote.periods * 30} days. Clears with the next daily run.`, label: `${bounty?.title ?? "Licence"} (rights renewal)`, ...(creatorLeg ? { ledger_id: creatorLeg.id } : {}) });
  const from = toMs(g.ends_at as string) > toMs(tx.now) ? (g.ends_at as string) : tx.now;
  const ends = quote.new_ends_at ?? rightsEndsAt(from, quote.periods * 30);
  const next = tx.patch("rights_grants", g.id, { status: "active", ends_at: ends, renewals: [...g.renewals, { at: tx.now, days: quote.periods * 30, fee_cents: quote.price_cents, ledger_txn_id: txnId, ...(member ? { requested_by_member_id: member.id } : {}) }], alerts_sent: [], updated_at: tx.now });
  logActivity(tx, { brand_id: brand.id, action: "rights_renewed", summary: `${describeActor(tx, member?.id)} renewed paid-ad rights for ${quote.periods * 30} days (${formatMoney(quote.total_cents)})`, actor_member_id: member?.id, target_kind: "rights_grant", target_id: g.id });
  notifyCreator(tx, g.creator_id, { kind: "rights_renewed", title: `${brand.name} renewed a licence on your video`, body: `You are paid ${formatMoney(quote.price_cents)} for ${quote.periods * 30} more days. It clears with the next daily run.`, amount_cents: quote.price_cents, path: "rights", ref_kind: "rights_grant", ref_id: g.id });
  return { grant: next, total_cents: quote.total_cents };
}

/** Revokes a licence (the creator, or Ops for misuse beyond the Rights Card). Running ads on it stop. */
export function revokeRights(tx: Tx, input: { grant_id: string; reason: string }): { grant: RightsGrant } {
  const g = tx.must("rights_grants", input.grant_id, "Licence");
  if (tx.session.persona === "creator") requireCreator(tx, g.creator_id);
  else if (tx.session.persona === "admin") requireAdmin(tx);
  else throw new ActionError("forbidden", "Only the creator or Ops can revoke a licence.", undefined, 403);
  ensure(g.status !== "revoked" && g.status !== "expired", "invalid_state", `This licence is ${g.status}.`, undefined, 409);
  ensure(input.reason.trim().length >= 10, "reason_required", "Say why. The brand sees it.", undefined, 422);
  const next = tx.patch("rights_grants", g.id, { status: "revoked", revoked_at: tx.now, revoke_reason: input.reason.trim(), updated_at: tx.now });
  for (const ad of tx.all("ads").filter((a) => a.post_id === g.post_id && (a.status === "live" || a.status === "paused" || a.status === "fatigued" || a.status === "authorised"))) tx.patch("ads", ad.id, { status: "ended", ended_at: tx.now });
  notifyBrand(tx, g.brand_id, { kind: "rights_expiring", title: "A licence was revoked", body: input.reason.trim(), route: "/brand/rights", ref_kind: "rights_grant", ref_id: g.id });
  return { grant: next };
}

// ── Winner promotion ───────────────────────────────────────────────────────────────────────────

export interface PromoteInput {
  post_id: string;
  platform?: AdPlatform;
  kind?: AdKind;
  daily_budget_cents: number;
}

/** Requests Winner promotion for a cleared post: needs the Pro plan and active paid-ad rights. The creator is asked for consent (a Spark code or partnership permission). */
export function promoteWinner(tx: Tx, input: PromoteInput): { ad: Ad } {
  const post = tx.must("posts", input.post_id, "Post");
  const { brand, member } = requireBrand(tx, post.brand_id, "finance");
  needFeature(tx, brand, "winner_promotion", "Winner promotion");
  ensure(post.status === "cleared" || post.status === "paid", "invalid_state", "Only a post that has cleared can be promoted.", "Wait for the view and disclosure check to pass.", 409);
  const grant = tx.all("rights_grants").find((g) => g.post_id === post.id && g.scope === "paid_ads" && g.status !== "revoked" && g.status !== "expired");
  ensure(grant, "no_rights", "This bounty's Rights Card does not include paid-ad use, or the term ended.", "Renew the licence in the Rights Vault first.", 409);
  ensure(!tx.all("ads").some((a) => a.post_id === post.id && ["requested", "authorised", "live", "paused", "fatigued"].includes(a.status)), "already_promoted", "This post already has a promotion.", undefined, 409);
  ensure(input.daily_budget_cents >= 1000, "budget_too_small", "The smallest daily ad budget is $10.", undefined, 422);
  const ad: Ad = {
    id: tx.nextId("ad"),
    post_id: post.id,
    brand_id: brand.id,
    app_id: post.app_id,
    bounty_id: post.bounty_id,
    creator_id: post.creator_id,
    platform: input.platform ?? "tiktok",
    kind: input.kind ?? (input.platform === "meta" ? "partnership_ad" : "spark_ad"),
    status: "requested",
    permission_requested_at: tx.now,
    daily_budget_cents: input.daily_budget_cents,
    spend_cents: 0,
    impressions: 0,
    clicks: 0,
    installs: 0,
    trials: 0,
    paid: 0,
    revenue_cents: 0,
    commission_rate: tx.must("bounties", post.bounty_id).ad_commission_rate,
    commission_cents: 0,
    platform_fee_cents: 0,
    daily: [],
    ...(grant.ends_at ? { rights_ends_at: grant.ends_at } : {}),
  };
  tx.put("ads", ad);
  notifyCreator(tx, post.creator_id, { kind: "ad_live", title: `${brand.name} wants to run your video as an ad`, body: `Ask for a ${ad.kind === "spark_ad" ? "Spark code" : "partnership permission"}. You earn ${Math.round(ad.commission_rate * 100)}% of ad-attributed revenue for ${CONSTANTS.pay.ad_commission_days} days. You can say no.`, path: "rights", ref_kind: "ad", ref_id: ad.id });
  logActivity(tx, { brand_id: brand.id, action: "ad_promoted", summary: `${describeActor(tx, member?.id)} asked to promote a winning post (${formatMoney(input.daily_budget_cents)}/day)`, actor_member_id: member?.id, target_kind: "ad", target_id: ad.id });
  return { ad };
}

/** The creator answers a promotion request: grant the permission (a Spark code of the right length) or decline. */
export function respondToAd(tx: Tx, input: { ad_id: string; accept: boolean; code_days?: number }): { ad: Ad } {
  const ad = tx.must("ads", input.ad_id, "Promotion");
  requireCreator(tx, ad.creator_id);
  ensure(ad.status === "requested", "invalid_state", `This promotion is ${ad.status}.`, undefined, 409);
  if (!input.accept) {
    notifyBrand(tx, ad.brand_id, { kind: "ad_live", title: "A creator declined a promotion", body: "Their video stays organic. Nothing was charged.", route: "/brand/promote", ref_kind: "ad", ref_id: ad.id });
    return { ad: tx.patch("ads", ad.id, { status: "declined", ended_at: tx.now }) };
  }
  const days = input.code_days ?? sparkCodeDaysFor(Math.ceil(ad.rights_ends_at ? daysLeft(ad.rights_ends_at, tx.now) : 90));
  ensure((CONSTANTS.rights.spark_code_options_days as readonly number[]).includes(days), "days_invalid", "Spark codes last 7, 30, 60 or 365 days.", undefined, 422);
  const next = tx.patch("ads", ad.id, { status: "authorised", permission_granted_at: tx.now, spark_code: `${ad.kind === "spark_ad" ? "#" : "&"}${hashString(`${ad.id}|code`).toString(36).toUpperCase()}${hashString(`${ad.id}|b`).toString(36).toUpperCase()}`.slice(0, 18), code_duration_days: days, code_expires_at: addDays(tx.now, days) });
  notifyBrand(tx, ad.brand_id, { kind: "ad_live", title: "Permission granted: launch your promotion", body: `The ${ad.kind === "spark_ad" ? "Spark code" : "permission"} is valid for ${days} days. Launch it from Winner promotion.`, route: "/brand/promote", ref_kind: "ad", ref_id: ad.id });
  return { ad: next };
}

/** Launches an authorised promotion (needs a connected ad account), or pauses, resumes or stops a running one. */
export function setAdStatus(tx: Tx, input: { ad_id: string; status: "live" | "paused" | "ended" }): { ad: Ad } {
  const ad = tx.must("ads", input.ad_id, "Promotion");
  const { brand } = requireBrand(tx, ad.brand_id, "finance");
  if (input.status === "live") {
    if (ad.status === "authorised") {
      const kind: IntegrationKind = ad.platform === "tiktok" ? "tiktok_ads" : "meta_ads";
      ensure(tx.all("integrations").some((i) => i.brand_id === brand.id && i.kind === kind && i.status === "connected"), "no_ad_account", `Connect your ${ad.platform === "tiktok" ? "TikTok" : "Meta"} ad account first.`, "Open Integrations.", 409);
      return { ad: tx.patch("ads", ad.id, { status: "live", started_at: tx.now, commission_window_ends_at: addDays(tx.now, CONSTANTS.pay.ad_commission_days) }) };
    }
    ensure(ad.status === "paused", "invalid_state", `This promotion is ${ad.status}.`, undefined, 409);
    return { ad: tx.patch("ads", ad.id, { status: "live" }) };
  }
  if (input.status === "paused") {
    ensure(ad.status === "live" || ad.status === "fatigued", "invalid_state", `This promotion is ${ad.status}.`, undefined, 409);
    return { ad: tx.patch("ads", ad.id, { status: "paused" }) };
  }
  ensure(["live", "paused", "fatigued", "authorised"].includes(ad.status), "invalid_state", `This promotion is ${ad.status}.`, undefined, 409);
  return { ad: tx.patch("ads", ad.id, { status: "ended", ended_at: tx.now }) };
}

/** Acknowledges, dismisses or answers a fatigue alert with a refresh bounty (a draft built from the winner's brief). */
export function resolveFatigue(tx: Tx, input: { alert_id: string; action: "acknowledge" | "dismiss" | "refresh" }): { alert: FatigueAlert; refresh_bounty_id?: string } {
  const a = tx.must("fatigue_alerts", input.alert_id, "Alert");
  requireBrand(tx, a.brand_id, "manage");
  if (input.action === "dismiss") {
    ensure(a.status === "open" || a.status === "acknowledged", "invalid_state", `This alert is ${a.status}.`, undefined, 409);
    return { alert: tx.patch("fatigue_alerts", a.id, { status: "dismissed" }) };
  }
  if (input.action === "acknowledge") {
    ensure(a.status === "open", "invalid_state", `This alert is ${a.status}.`, undefined, 409);
    return { alert: tx.patch("fatigue_alerts", a.id, { status: "acknowledged", acknowledged_at: tx.now }) };
  }
  ensure(a.status === "open" || a.status === "acknowledged", "invalid_state", `This alert is ${a.status}.`, undefined, 409);
  const source = tx.must("bounties", a.bounty_id);
  const brand = tx.must("brands", source.brand_id);
  const id = `bnty_${brand.slug}_${slug(source.title, 20).replace(/-/g, "")}refresh`;
  const draft = { ...source, id: tx.get("bounties", id) ? `${id}${tx.nextNumber("pm")}` : id, title: `${source.title}: new hooks`, status: "draft" as const, funded: false, funded_at: undefined, published_at: undefined, escrow_funded_cents: 0, matched_cents: 0, reserved_cents: 0, spent_cents: 0, remaining_cents: 0, refunded_cents: 0, is_first_bounty: false, featured: false, art: makeArtSeed(seededRng(`${id}|refresh`), { hue: source.art.hue_a, label: "Refresh" }), counts: { creators: 0, submissions: 0, in_review: 0, approved: 0, rejected: 0, posts: 0, live_posts: 0 }, funnel: { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 }, starts_at: tx.now, ends_at: addDays(tx.now, 30), created_at: tx.now, updated_at: tx.now };
  const cleaned = { ...draft } as Partial<typeof draft>;
  delete cleaned.funded_at;
  delete cleaned.published_at;
  delete cleaned.first_submission_at;
  delete cleaned.filled_at;
  delete cleaned.time_to_fill_hours;
  delete cleaned.ended_at;
  delete cleaned.settled_at;
  tx.put("bounties", cleaned as typeof draft);
  return { alert: tx.patch("fatigue_alerts", a.id, { status: "refreshing", refresh_bounty_id: draft.id, acknowledged_at: a.acknowledged_at ?? tx.now }), refresh_bounty_id: draft.id };
}

// ── lists, settings, billing ───────────────────────────────────────────────────────────────────

/** Adds a creator to a CRM list (favourites by default) with a note and tags. */
export function addToList(tx: Tx, input: { creator_id: string; list_id?: string; note?: string; tags?: string[] }): { list: BrandList } {
  const { brand, member } = requireBrand(tx, null, "build");
  tx.must("creators", input.creator_id, "Creator");
  let list = input.list_id ? tx.must("brand_lists", input.list_id, "List") : tx.all("brand_lists").find((l) => l.brand_id === brand.id && l.is_favourites);
  if (!list) {
    list = tx.put("brand_lists", { id: `list_${brand.slug}_favourites`, brand_id: brand.id, name: "Favourites", is_favourites: true, members: [], created_by_member_id: member?.id ?? "bm_system", created_at: tx.now, updated_at: tx.now });
  }
  ensure(list.brand_id === brand.id, "forbidden", "That list belongs to another brand.", undefined, 403);
  if (list.members.some((m) => m.creator_id === input.creator_id)) return { list: tx.patch("brand_lists", list.id, { members: list.members.map((m) => (m.creator_id === input.creator_id ? { ...m, ...(input.note !== undefined ? { note: input.note } : {}), tags: input.tags ?? m.tags } : m)), updated_at: tx.now }) };
  return { list: tx.patch("brand_lists", list.id, { members: [...list.members, { creator_id: input.creator_id, ...(input.note ? { note: input.note } : {}), tags: input.tags ?? [], added_at: tx.now }], updated_at: tx.now }) };
}

/** Removes a creator from a list. */
export function removeFromList(tx: Tx, input: { list_id: string; creator_id: string }): { list: BrandList } {
  const list = tx.must("brand_lists", input.list_id, "List");
  requireBrand(tx, list.brand_id, "build");
  return { list: tx.patch("brand_lists", list.id, { members: list.members.filter((m) => m.creator_id !== input.creator_id), updated_at: tx.now }) };
}

/** Creates a named CRM list. */
export function createList(tx: Tx, input: { name: string }): { list: BrandList } {
  const { brand, member } = requireBrand(tx, null, "build");
  ensure(input.name.trim().length >= 2, "name_required", "Name the list.", undefined, 422);
  const id = `list_${brand.slug}_${slug(input.name, 24).replace(/-/g, "_")}`;
  ensure(!tx.get("brand_lists", id), "list_exists", "A list with that name exists.", undefined, 409);
  return { list: tx.put("brand_lists", { id, brand_id: brand.id, name: input.name.trim(), is_favourites: false, members: [], created_by_member_id: member?.id ?? "bm_system", created_at: tx.now, updated_at: tx.now }) };
}

export interface BrandSettingsPatch {
  compliance_defaults?: Partial<Brand["compliance_defaults"]>;
  review_sla_hours?: number;
  timeout_policy?: Brand["timeout_policy"];
  billing?: Partial<Pick<Brand["billing"], "legal_name" | "billing_email" | "vat_id" | "po_required" | "cost_center">>;
  auto_top_up?: Brand["auto_top_up"];
  tagline?: string;
  website?: string;
}

/** Edits workspace settings: compliance defaults, review SLA and timeout policy, billing identity and the wallet's auto top-up. */
export function updateBrandSettings(tx: Tx, input: BrandSettingsPatch): { brand: Brand } {
  const { brand, member } = requireBrand(tx, null, "manage");
  if (input.review_sla_hours !== undefined) ensure(input.review_sla_hours >= 12 && input.review_sla_hours <= CONSTANTS.review.sla_hours, "sla_invalid", `The review promise is between 12 and ${CONSTANTS.review.sla_hours} hours.`, "Creators see it before they apply.", 422);
  if (input.auto_top_up?.enabled) ensure(input.auto_top_up.amount_cents >= 10_000 && input.auto_top_up.threshold_cents >= 0, "top_up_invalid", "Auto top-up adds at least $100.", undefined, 422);
  const next = tx.patch("brands", brand.id, {
    ...(input.review_sla_hours !== undefined ? { review_sla_hours: input.review_sla_hours } : {}),
    ...(input.timeout_policy ? { timeout_policy: input.timeout_policy } : {}),
    ...(input.compliance_defaults ? { compliance_defaults: { ...brand.compliance_defaults, ...input.compliance_defaults } } : {}),
    ...(input.billing ? { billing: { ...brand.billing, ...input.billing } } : {}),
    ...(input.auto_top_up ? { auto_top_up: input.auto_top_up } : {}),
    ...(input.tagline ? { tagline: input.tagline.trim() } : {}),
    ...(input.website ? { website: input.website.trim() } : {}),
  });
  if (input.auto_top_up) logActivity(tx, { brand_id: brand.id, action: "auto_topup_changed", summary: `${describeActor(tx, member?.id)} ${input.auto_top_up.enabled ? `set auto top-up to ${formatMoney(input.auto_top_up.amount_cents)} below ${formatMoney(input.auto_top_up.threshold_cents)}` : "turned auto top-up off"}`, actor_member_id: member?.id, target_kind: "brand", target_id: brand.id });
  return { brand: next };
}

// ── the free App UGC Audit ─────────────────────────────────────────────────────────────────────

/** The free App UGC Audit: paste an App Store link (or an app name). The report is generated from the market data, saved, and shareable at /audit/<slug>. No account needed. */
export function runAudit(tx: Tx, input: { input: string }): { report: AuditReport; created: boolean } {
  const raw = input.input.trim();
  ensure(raw.length >= 2, "input_required", "Paste an App Store link or type the app's name.", "Example: https://apps.apple.com/us/app/lumi/id6448907919", 422);
  ensure(raw.length <= 300, "input_too_long", "That is too long for a link or a name.", undefined, 422);
  const creators = tx.all("creators").filter((c) => c.open_to_offers).map((c) => ({ id: c.id, niches: c.niches, tier: c.tier, open_to_offers: c.open_to_offers }));
  const gen = generateAudit({ input: raw, now: tx.now, creators });
  const existing = tx.all("audit_reports").find((r) => r.slug === gen.slug);
  if (existing) return { report: tx.patch("audit_reports", existing.id, { page_views: existing.page_views + 1 }), created: false };
  // The generator also returns working data (reference pool, features, label) that is not part of the saved report.
  const { reference_pool: _pool, category_source: _source, features: _features, label: _label, ...row } = gen;
  const report: AuditReport = { ...row, id: `aud_${gen.slug.replace(/-/g, "_").slice(0, 28)}`, created_by: tx.session.persona === "brand" ? "brand" : "creator", page_views: 1 };
  return { report: tx.put("audit_reports", report), created: true };
}

/** A brand claims an audit as its own (it links to the workspace and prefills the bounty builder). */
export function claimAudit(tx: Tx, input: { slug: string }): { report: AuditReport } {
  const { brand } = requireBrand(tx, null, "build");
  const r = tx.all("audit_reports").find((x) => x.slug === input.slug);
  ensure(r, "not_found", "That audit was not found.", undefined, 404);
  return { report: tx.patch("audit_reports", r.id, { claimed_by_brand_id: brand.id }) };
}

export { addMonths, clockLabel, mulRate, schemeOf, addPlatformEarning };
