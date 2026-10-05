/**
 * The brand workspace: apps and their attribution health, the Attribution Kit (deferred link, code pool, RevenueCat ingest, survey), integrations, the
 * team and activity log, developers (API keys, webhooks, MCP), the agency roll-up and settings.
 */

import type { ActivityEntry, ApiKey, App, Brand, BrandMember, BrandMemberRole, Bounty, Integration, IntegrationKind, OfferCode, RevenueCatEvent, Webhook } from "@/lib/contract/types";
import { BRAND_MEMBER_ROLE_META } from "@/lib/contract/types";
import { activeCodes, coverageLabel, hoursBetween, planHasFeature, poolHealth, splitConversions, toMs, type KindCounts, type PoolHealth } from "@/lib/engine";
import { roleCan, type BrandCapability } from "@/lib/store/core/guards";
import { asList, asc, defineSelector, desc, groupBy, matchesQuery, valuesOf, type Db } from "../select";
import { mineBrandId } from "./bounties";

const INTEGRATION_LABEL: Record<IntegrationKind, string> = {
  revenuecat: "RevenueCat",
  appsflyer: "AppsFlyer",
  adjust: "Adjust",
  branch: "Branch",
  meta_ads: "Meta ads account",
  tiktok_ads: "TikTok ads account",
  slack: "Slack",
  zapier: "Zapier",
  app_store_connect: "App Store Connect",
};

const INTEGRATION_BLURB: Record<IntegrationKind, string> = {
  revenuecat: "Ties trials and paid conversions to the creator who earned them. CPA pays on link and code matches.",
  appsflyer: "Adds matched installs (estimated) beside the tracked ones.",
  adjust: "Adds matched installs (estimated) beside the tracked ones.",
  branch: "Adds matched installs (estimated) beside the tracked ones.",
  meta_ads: "Run Winner promotion as a partnership ad on your own ad account.",
  tiktok_ads: "Run Winner promotion as a Spark ad on your own ad account.",
  slack: "Approve videos and get weekly digests in a channel.",
  zapier: "Send flowd events to the rest of your stack.",
  app_store_connect: "Read your app's listing and offer-code limits.",
};

// ── apps and their attribution health ──────────────────────────────────────────────────────────

export interface AppView extends App {
  brand: Brand;
  integrations: readonly Integration[];
  /** Share of installs and trials that can be tied to a creator (the best integration's coverage). */
  coverage: { share: number; label: "high" | "medium" | "low" };
  health: "healthy" | "needs_attention" | "not_connected";
  bounties_live: number;
  bounties_total: number;
  /** The most recent integration event. */
  last_event_at?: string;
}

type AppsDb = Db<"apps" | "brands" | "integrations" | "bounties" | "session">;

function appView(db: AppsDb, a: App): AppView {
  const integrations = groupBy(db.integrations, "app", (i) => i.app_id).get(a.id);
  const rc = integrations.find((i) => i.kind === "revenuecat");
  const share = Math.max(0, ...integrations.filter((i) => i.status === "connected").map((i) => i.coverage_ratio ?? 0));
  const bounties = groupBy(db.bounties, "app", (b) => b.app_id).get(a.id);
  const last = integrations.map((i) => i.last_event_at).filter((x): x is string => x !== undefined).sort().pop();
  return {
    ...a,
    brand: db.brands[a.brand_id],
    integrations,
    coverage: { share, label: coverageLabel(share) },
    health: rc?.status === "connected" ? "healthy" : integrations.some((i) => i.status === "needs_attention" || i.status === "error") ? "needs_attention" : "not_connected",
    bounties_live: bounties.filter((b) => b.status === "live").length,
    bounties_total: bounties.length,
    ...(last ? { last_event_at: last } : {}),
  };
}

/** The apps of a workspace with attribution health and bounty counts. */
export const selectApps = defineSelector(["apps", "brands", "integrations", "bounties", "session"] as const, (db: AppsDb, brand: string | undefined): readonly AppView[] => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  if (!brandId) return [];
  return groupBy(db.apps, "brand", (a) => a.brand_id).get(brandId).map((a) => appView(db, a)).sort((a, b) => asc(a.name, b.name));
});

/** One app with its integrations and bounty counts. */
export const selectApp = defineSelector(["apps", "brands", "integrations", "bounties", "session"] as const, (db: AppsDb, id: string | undefined): AppView | undefined => {
  const a = id ? db.apps[id] : undefined;
  return a ? appView(db, a) : undefined;
});

// ── the Attribution Kit ────────────────────────────────────────────────────────────────────────

export interface SetupStep {
  id: "link_domain" | "sdk" | "revenuecat" | "code_pool" | "survey" | "mmp";
  label: string;
  done: boolean;
  detail: string;
  optional: boolean;
}

export interface CodePoolView {
  sku: string;
  offer_name: string;
  /** Active codes against Apple's cap of 10 per subscription SKU, with free slots and stale codes. */
  health: PoolHealth;
  codes: readonly OfferCode[];
}

export interface AttributionKit {
  app?: App;
  setup: readonly SetupStep[];
  progress: { done: number; total: number };
  /** Share of events that are Tracked (link and code) and what the integrations can tie to a creator. */
  coverage: { share: number; label: "high" | "medium" | "low" };
  revenuecat?: Integration;
  /** Events RevenueCat sent in the last 24 hours and when the last one arrived. */
  events_24h: number;
  last_event_at?: string;
  pool: readonly CodePoolView[];
  /** Tracked and estimated counts by source; null while conversions load. CPA pays on link and code only. */
  by_source: { loading: boolean; tracked: KindCounts; estimated: KindCounts; sources: Record<"link" | "code" | "mmp" | "survey" | "modelled", KindCounts> } | null;
  /** The newest RevenueCat events (loads on demand). */
  recent_events: readonly RevenueCatEvent[];
  snippets: { swift: string; kotlin: string; webhook_url: string | null };
}

type KitDb = Db<"apps" | "integrations" | "offer_code_pool" | "conversions" | "revenuecat_events" | "loaded" | "clock" | "session">;

/** The setup checklist, code pool and live health of an app's attribution. `useAttributionKit()` for the active app. */
export const selectAttributionKit = defineSelector(
  ["apps", "integrations", "offer_code_pool", "conversions", "revenuecat_events", "loaded", "clock", "session"] as const,
  (db: KitDb, appId: string | undefined): AttributionKit => {
    const app = (appId && appId !== "active" ? db.apps[appId] : undefined) ?? (db.session.app_id ? db.apps[db.session.app_id] : undefined);
    const empty: AttributionKit = { setup: [], progress: { done: 0, total: 0 }, coverage: { share: 0, label: "low" }, events_24h: 0, pool: [], by_source: null, recent_events: [], snippets: { swift: "", kotlin: "", webhook_url: null } };
    if (!app) return empty;
    const integrations = groupBy(db.integrations, "app", (i) => i.app_id).get(app.id);
    const rc = integrations.find((i) => i.kind === "revenuecat");
    const mmp = integrations.find((i) => ["appsflyer", "adjust", "branch"].includes(i.kind) && i.status === "connected");
    const pool = groupBy(db.offer_code_pool, "app", (c) => c.app_id).get(app.id);
    const skus = [...new Set(pool.map((c) => c.sku))].sort();
    const poolViews: CodePoolView[] = skus.map((sku) => ({ sku, offer_name: pool.find((c) => c.sku === sku)?.offer_name ?? sku, health: poolHealth(pool, app.id, sku, db.clock.now), codes: activeCodes(pool, app.id, sku) }));
    const setup: SetupStep[] = [
      { id: "link_domain", label: "Tracking link domain", done: true, detail: "joinflowd.io/r/<code> opens your app with the creator attached (deferred deep link).", optional: false },
      { id: "sdk", label: "SDK snippet", done: app.sdk_status !== "not_installed", detail: app.sdk_status === "verified" ? "Installed and verified." : app.sdk_status === "installed" ? "Installed. Send a test event to verify it." : "Add two lines so the creator is attached to the purchase.", optional: false },
      { id: "revenuecat", label: "RevenueCat webhook", done: rc?.status === "connected", detail: rc?.status === "connected" ? `Connected. ${rc.events_24h} events in the last 24 hours.` : "Paste the webhook URL and secret into RevenueCat, then send a test event.", optional: false },
      { id: "code_pool", label: "Offer-code pool", done: poolViews.length > 0 && poolViews.every((p) => !p.health.at_cap || p.health.available > 0), detail: poolViews.length > 0 ? `${poolViews.map((p) => `${p.health.active} of ${p.health.cap} active codes on ${p.sku}`).join("; ")}.` : "Create codes for your subscription SKU. Apple caps active codes at 10 per SKU, so flowd rotates a pool.", optional: false },
      { id: "survey", label: "Post-install survey", done: false, detail: "Ask \"How did you hear about us?\" and add self-reported installs as Estimated.", optional: true },
      { id: "mmp", label: "MMP (optional)", done: mmp !== undefined, detail: mmp ? `${INTEGRATION_LABEL[mmp.kind]} connected.` : "AppsFlyer, Adjust or Branch add matched installs as Estimated.", optional: true },
    ];
    const required = setup.filter((s) => !s.optional);
    const loaded = db.loaded.conversions === true;
    const convs = loaded ? valuesOf(db.conversions).filter((c) => c.app_id === app.id) : [];
    const split = splitConversions(convs);
    const rcEvents = db.loaded.revenuecat_events === true ? groupBy(db.revenuecat_events, "app", (e) => e.app_id).get(app.id).slice().sort((a, b) => desc(a.received_at, b.received_at)).slice(0, 20) : [];
    const share = Math.max(0, ...integrations.filter((i) => i.status === "connected").map((i) => i.coverage_ratio ?? 0));
    const scheme = app.name.toLowerCase().split(/[^a-z0-9]+/)[0] || "app";
    const lastEvent = integrations.map((i) => i.last_event_at).filter((x): x is string => x !== undefined).sort().pop();
    return {
      app,
      setup,
      progress: { done: required.filter((s) => s.done).length, total: required.length },
      coverage: { share: loaded ? split.deterministic_share : share, label: coverageLabel(loaded ? split.deterministic_share : share) },
      ...(rc ? { revenuecat: rc } : {}),
      events_24h: integrations.reduce((s, i) => s + i.events_24h, 0),
      ...(lastEvent ? { last_event_at: lastEvent } : {}),
      pool: poolViews,
      by_source: loaded ? { loading: false, tracked: split.tracked, estimated: split.estimated, sources: { link: split.by_source.link, code: split.by_source.code, mmp: split.by_source.mmp, survey: split.by_source.survey, modelled: split.by_source.modelled } } : null,
      recent_events: rcEvents,
      snippets: {
        swift: `import RevenueCat\n\n// After you read the ${scheme}://r/<code> deep link at launch:\nPurchases.shared.attribution.setAttributes(["flowd_link": code, "flowd_creator": creatorId])`,
        kotlin: `// After you read the ${scheme}://r/<code> deep link at launch:\nPurchases.sharedInstance.setAttributes(mapOf("flowd_link" to code, "flowd_creator" to creatorId))`,
        webhook_url: rc?.webhook_url ?? null,
      },
    };
  },
  { ensure: ["conversions", "revenuecat_events"] },
);

// ── integrations ───────────────────────────────────────────────────────────────────────────────

export interface IntegrationCatalogItem {
  kind: IntegrationKind;
  label: string;
  blurb: string;
  /** The connection, when there is one for the signed-in workspace (and the active app for app-level kinds). */
  connected: Integration | null;
}

export interface IntegrationsView {
  integrations: readonly (Integration & { label_text: string; app?: App })[];
  catalog: readonly IntegrationCatalogItem[];
  webhooks: readonly Webhook[];
  /** The Slack connection, with its approvals channel. */
  slack?: Integration;
  /** Recent webhook deliveries across endpoints, newest first (the webhook log). */
  deliveries: readonly { webhook_id: string; url: string; id: string; event: string; status: string; status_code?: number; at: string; latency_ms: number }[];
}

export const selectIntegrations = defineSelector(["integrations", "apps", "webhooks", "session"] as const, (db: Db<"integrations" | "apps" | "webhooks" | "session">, brand: string | undefined): IntegrationsView => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  if (!brandId) return { integrations: [], catalog: [], webhooks: [], deliveries: [] };
  const mine = groupBy(db.integrations, "brand", (i) => i.brand_id).get(brandId);
  const appId = db.session.app_id;
  const webhooks = groupBy(db.webhooks, "brand", (w) => w.brand_id).get(brandId);
  return {
    integrations: mine.map((i) => ({ ...i, label_text: INTEGRATION_LABEL[i.kind], ...(i.app_id && db.apps[i.app_id] ? { app: db.apps[i.app_id] } : {}) })),
    catalog: (Object.keys(INTEGRATION_LABEL) as IntegrationKind[]).map((kind) => ({ kind, label: INTEGRATION_LABEL[kind], blurb: INTEGRATION_BLURB[kind], connected: mine.find((i) => i.kind === kind && (kind === "slack" || kind === "zapier" || !i.app_id || !appId || i.app_id === appId)) ?? null })),
    webhooks,
    ...(mine.find((i) => i.kind === "slack") ? { slack: mine.find((i) => i.kind === "slack") } : {}),
    deliveries: webhooks.flatMap((w) => w.deliveries.map((d) => ({ webhook_id: w.id, url: w.url, ...d }))).sort((a, b) => desc(a.at, b.at)).slice(0, 50),
  };
});

// ── team and activity ──────────────────────────────────────────────────────────────────────────

export interface MemberView extends BrandMember {
  name: string;
  email: string;
  title?: string;
  role_label: string;
  /** What this role can do (the roles matrix row). */
  can: Record<BrandCapability, boolean>;
  /** A client approver: reviews through a seat-free link. */
  approval_url?: string;
  is_me: boolean;
}

export interface TeamView {
  members: readonly MemberView[];
  /** The roles matrix: capabilities per role. */
  matrix: readonly { role: BrandMemberRole; label: string; can: Record<BrandCapability, boolean> }[];
  invited: readonly MemberView[];
  /** The signed-in member can invite and change roles. */
  can_manage: boolean;
  seats_used: number;
}

const CAPS: readonly BrandCapability[] = ["view", "review", "build", "finance", "manage"];
const capsOf = (role: BrandMemberRole): Record<BrandCapability, boolean> => Object.fromEntries(CAPS.map((c) => [c, roleCan(role, c)])) as Record<BrandCapability, boolean>;

export const selectTeam = defineSelector(["brand_members", "users", "session"] as const, (db: Db<"brand_members" | "users" | "session">, brand: string | undefined): TeamView => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const matrix = (Object.keys(BRAND_MEMBER_ROLE_META) as BrandMemberRole[]).map((role) => ({ role, label: BRAND_MEMBER_ROLE_META[role].label, can: capsOf(role) }));
  if (!brandId) return { members: [], matrix, invited: [], can_manage: false, seats_used: 0 };
  const members = groupBy(db.brand_members, "brand", (m) => m.brand_id)
    .get(brandId)
    .map((m): MemberView => {
      const u = db.users[m.user_id];
      return { ...m, name: u?.display_name ?? "Team member", email: u?.email ?? "", ...(u?.title ? { title: u.title } : {}), role_label: BRAND_MEMBER_ROLE_META[m.role].label, can: capsOf(m.role), ...(m.approval_link_code ? { approval_url: `joinflowd.io/approve/${m.approval_link_code}` } : {}), is_me: m.id === db.session.member_id };
    })
    .sort((a, b) => Number(b.is_me) - Number(a.is_me) || asc(a.name, b.name));
  const me = members.find((m) => m.is_me);
  return { members: members.filter((m) => m.status === "active"), matrix, invited: members.filter((m) => m.status === "invited"), can_manage: me ? roleCan(me.role, "manage") : db.session.persona === "admin", seats_used: members.filter((m) => m.status === "active" && m.role !== "client_approver").length };
});

export interface ActivityFilter {
  action?: ActivityEntry["action"] | readonly ActivityEntry["action"][];
  /** A member id. */
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

export interface ActivityRow extends ActivityEntry {
  actor_name: string;
}

/** The team activity log, newest first (filterable and ready to export). */
export const selectActivityLog = defineSelector(["activity_log", "brand_members", "users", "session"] as const, (db: Db<"activity_log" | "brand_members" | "users" | "session">, f: ActivityFilter | undefined): readonly ActivityRow[] => {
  const brandId = mineBrandId(db);
  if (!brandId) return [];
  const actions = asList(f?.action);
  const rows = groupBy(db.activity_log, "brand", (a) => a.brand_id)
    .get(brandId)
    .filter((a) => (!actions || actions.includes(a.action)) && (!f?.actor || a.actor_member_id === f.actor) && (!f?.from || a.at.slice(0, 10) >= f.from) && (!f?.to || a.at.slice(0, 10) <= f.to) && matchesQuery(f?.q, a.summary))
    .map((a) => ({ ...a, actor_name: (a.actor_member_id && db.users[db.brand_members[a.actor_member_id]?.user_id ?? ""]?.display_name) || "flowd" }))
    .sort((a, b) => desc(a.at, b.at));
  return f?.limit ? rows.slice(0, f.limit) : rows;
});

// ── developers ─────────────────────────────────────────────────────────────────────────────────

export interface ApiKeyView extends ApiKey {
  /** "fd_live_••••a1b2": only the prefix and the last four characters are ever kept. */
  masked: string;
  active: boolean;
}

export interface DeveloperView {
  keys: readonly ApiKeyView[];
  webhooks: readonly Webhook[];
  /** The MCP config to paste into an assistant, and the example prompt. */
  mcp: { config: string; example_prompt: string };
  openapi_url: string;
  base_url: string;
  /** Writes are drafts by default; the financial scope is separate. */
  scopes: readonly { scope: ApiKey["scopes"][number]; text: string }[];
}

export const selectDeveloper = defineSelector(["api_keys", "webhooks", "session"] as const, (db: Db<"api_keys" | "webhooks" | "session">, brand: string | undefined): DeveloperView => {
  const brandId = brand === undefined || brand === "mine" ? mineBrandId(db) : brand;
  const keys = brandId ? groupBy(db.api_keys, "brand", (k) => k.brand_id).get(brandId) : [];
  return {
    keys: keys.map((k) => ({ ...k, masked: `${k.prefix}••••${k.last4}`, active: k.revoked_at === undefined && (!k.expires_at || k.expires_at > "2026-10-03T14:00:00Z") })).sort((a, b) => desc(a.created_at, b.created_at)),
    webhooks: brandId ? groupBy(db.webhooks, "brand", (w) => w.brand_id).get(brandId) : [],
    mcp: { config: JSON.stringify({ mcpServers: { flowd: { url: "https://api.joinflowd.io/v1/mcp", headers: { Authorization: "Bearer <your fd_test_ key>" } } } }, null, 2), example_prompt: "Launch a $500 bounty for my app at $2.00 CPM." },
    openapi_url: "/openapi.yaml",
    base_url: "https://api.joinflowd.io/v1",
    scopes: [
      { scope: "read", text: "Read bounties, submissions, posts and analytics." },
      { scope: "write", text: "Create and edit drafts. Publishing needs a person to confirm, unless you allow it." },
      { scope: "financial", text: "Fund and top up. Off by default; use it only on a server you control." },
    ],
  };
});

// ── agency ─────────────────────────────────────────────────────────────────────────────────────

export interface AgencyClient {
  brand: Brand;
  apps: readonly App[];
  live_bounties: number;
  /** Creator pay settled in the last 30 days. */
  spend_30d_cents: number;
  /** Cost per tracked trial over the same posts; null with no trials. */
  cost_per_trial_cents: number | null;
  /** Hours the oldest video in the client's queue has waited; null with an empty queue. */
  oldest_queue_hours: number | null;
  /** The client reviewer's seat-free approval link, when one exists. */
  approval_url?: string;
}

export interface AgencyView {
  /** The workspace's plan includes agency workspaces (Scale). */
  plan_ok: boolean;
  clients: readonly AgencyClient[];
  totals: { spend_30d_cents: number; live_bounties: number; waiting: number };
}

export const selectAgency = defineSelector(["brands", "apps", "bounties", "posts", "ledger", "submissions", "brand_members", "clock", "session"] as const, (db: Db<"brands" | "apps" | "bounties" | "posts" | "ledger" | "submissions" | "brand_members" | "clock" | "session">): AgencyView => {
  const me = db.session.brand_id ? db.brands[db.session.brand_id] : undefined;
  if (!me) return { plan_ok: false, clients: [], totals: { spend_30d_cents: 0, live_bounties: 0, waiting: 0 } };
  const day30 = toMs(db.clock.now) - 30 * 86_400_000;
  const clients = valuesOf(db.brands)
    .filter((b) => b.agency_id === me.id)
    .map((b): AgencyClient => {
      const posts = groupBy(db.posts, "brand", (p) => p.brand_id).get(b.id).filter((p) => toMs(p.posted_at) >= day30);
      let spend = 0;
      for (const e of groupBy(db.ledger, "brand", (x) => x.brand_id).get(b.id)) if (toMs(e.posted_at) >= day30 && e.account.startsWith("creator:") && e.amount_cents > 0 && (e.entry_type === "cpm" || e.entry_type === "cpa" || e.entry_type === "flat_fee")) spend += e.amount_cents;
      const trials = posts.reduce((s, p) => s + p.funnel.trials, 0);
      const waiting = groupBy(db.submissions, "brand", (s) => s.brand_id).get(b.id).filter((s) => s.status === "in_review");
      const approver = groupBy(db.brand_members, "brand", (m) => m.brand_id).get(b.id).find((m) => m.role === "client_approver" && m.approval_link_code);
      return {
        brand: b,
        apps: groupBy(db.apps, "brand", (a) => a.brand_id).get(b.id),
        live_bounties: groupBy(db.bounties, "brand", (x) => x.brand_id).get(b.id).filter((x: Bounty) => x.status === "live").length,
        spend_30d_cents: spend,
        cost_per_trial_cents: trials > 0 && spend > 0 ? Math.round(spend / trials) : null,
        oldest_queue_hours: waiting.length > 0 ? Math.max(...waiting.map((s) => hoursBetween(s.versions[s.version - 1]?.submitted_at ?? s.submitted_at, db.clock.now))) : null,
        ...(approver?.approval_link_code ? { approval_url: `joinflowd.io/approve/${approver.approval_link_code}` } : {}),
      };
    })
    .sort((a, b) => desc(a.spend_30d_cents, b.spend_30d_cents));
  return {
    plan_ok: planHasFeature(me.plan, "agency_workspaces"),
    clients,
    totals: { spend_30d_cents: clients.reduce((s, c) => s + c.spend_30d_cents, 0), live_bounties: clients.reduce((s, c) => s + c.live_bounties, 0), waiting: clients.filter((c) => c.oldest_queue_hours !== null).length },
  };
});

// ── settings ───────────────────────────────────────────────────────────────────────────────────

export interface BrandSettingsView {
  brand?: Brand;
  member?: BrandMember;
  can_manage: boolean;
  /** Each plan feature and whether the current plan has it (for the upgrade hints). */
  plan_features: readonly { feature: string; included: boolean }[];
}

export const selectBrandSettings = defineSelector(["brands", "brand_members", "session"] as const, (db: Db<"brands" | "brand_members" | "session">): BrandSettingsView => {
  const brand = db.session.brand_id ? db.brands[db.session.brand_id] : undefined;
  const member = db.session.member_id ? db.brand_members[db.session.member_id] : undefined;
  const features = ["review_queue", "funnel", "brief_lint", "attribution_kit", "learned_scorer", "guarded_auto_approve", "market_view", "rights_vault", "test_planner", "slack", "api", "winner_promotion", "multi_app", "agency_workspaces", "roles", "finance_pack", "slas", "white_label_reports"] as const;
  return {
    ...(brand ? { brand } : {}),
    ...(member ? { member } : {}),
    can_manage: member ? roleCan(member.role, "manage") : false,
    plan_features: brand ? features.map((f) => ({ feature: f, included: planHasFeature(brand.plan, f) })) : [],
  };
});
