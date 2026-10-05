import { vi, describe, expect, it } from "vitest";
import { selectIntegrations } from "@/lib/data/selectors";
import { ledgerProblems, makeWorld, must, walletFromLedger, type TestWorld } from "./helpers";

vi.setConfig({ testTimeout: 60_000 });

/** Signs in as another member of the Lumi workspace (the roles matrix is real, so a viewer cannot do what an owner can). */
function asMember(w: TestWorld, memberId: string): void {
  const member = w.state().brand_members[memberId];
  w.store.setState({ session: { ...w.state().session, member_id: member.id, user_id: member.user_id } });
}

const code = async (p: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string> => {
  const r = await p;
  return r.ok ? "ok" : (r.error?.code ?? "unknown");
};

describe("integrations", () => {
  it("connect, test and disconnect an integration: the app, the counters and the activity log follow", async () => {
    const w = await makeWorld("brand");
    const before = Object.keys(w.state().activity_log).length;
    const connected = must(await w.actions.connectIntegration({ kind: "adjust", app_id: "app_lumi" }));
    expect(connected.integration.status).toBe("connected");
    expect(connected.integration.coverage_ratio).toBeGreaterThan(0.8);
    expect(w.state().apps.app_lumi.mmp).toBe("adjust");
    const tested = must(await w.actions.testIntegration({ integration_id: connected.integration.id }));
    expect(tested.integration.events_24h).toBe(1);
    expect(tested.integration.last_event_at).toBe(w.state().clock.now);
    const off = must(await w.actions.disconnectIntegration({ integration_id: connected.integration.id }));
    expect(off.integration.status).toBe("disconnected");
    expect(off.integration.health_note).toMatch(/links and codes keep working/i);
    // testing a disconnected integration is refused
    expect(await code(w.actions.testIntegration({ integration_id: connected.integration.id }))).toBe("invalid_state");
    expect(Object.keys(w.state().activity_log).length).toBeGreaterThanOrEqual(before + 2);
  });

  it("an MMP needs an app, and Slack needs the plan that includes it", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.connectIntegration({ kind: "revenuecat" }))).toBe("app_required");
    w.as("admin");
    // Ops acts for a free workspace: Slack approvals are part of a paid plan
    const free = await w.actions.connectIntegration({ kind: "slack", brand_id: "br_glowkit" });
    expect(free.ok).toBe(false);
    if (!free.ok) {
      expect(free.error.code).toBe("plan_required");
      expect(free.error.status).toBe(402);
      expect(free.error.hint).toMatch(/Upgrade/);
    }
  });

  it("the integrations view reflects the change", async () => {
    const w = await makeWorld("brand");
    const before = selectIntegrations(w.state(), undefined);
    expect(before.catalog.find((c) => c.kind === "branch")?.connected).toBeNull();
    const { integration } = must(await w.actions.connectIntegration({ kind: "branch", app_id: "app_lumi" }));
    const view = selectIntegrations(w.state(), undefined);
    expect(view.catalog.find((c) => c.kind === "branch")?.connected?.id).toBe(integration.id);
    expect(view.integrations.some((i) => i.id === integration.id)).toBe(true);
  });
});

describe("API keys and webhooks", () => {
  it("the secret is shown once and never stored", async () => {
    const w = await makeWorld("brand");
    const made = must(await w.actions.createApiKey({ name: "Zapier growth sync", mode: "test", scopes: ["read"] }));
    expect(made.secret).toMatch(/^fd_test_[a-z0-9]{32}$/);
    expect(made.key.last4).toBe(made.secret.slice(-4));
    expect(JSON.stringify(w.state().api_keys)).not.toContain(made.secret);
    expect(JSON.stringify(w.state().activity_log)).not.toContain(made.secret);
    // the same name is refused, a second key with another name is fine
    expect(await code(w.actions.createApiKey({ name: "Zapier growth sync" }))).toBe("key_exists");
    expect(await code(w.actions.createApiKey({ name: "ab" }))).toBe("name_required");
    const live = must(await w.actions.createApiKey({ name: "Live automation", mode: "live" }));
    expect(live.secret.startsWith("fd_live_")).toBe(true);
    // revoking is immediate and final
    const revoked = must(await w.actions.revokeApiKey({ key_id: made.key.id }));
    expect(revoked.key.revoked_at).toBe(w.state().clock.now);
    expect(await code(w.actions.revokeApiKey({ key_id: made.key.id }))).toBe("invalid_state");
  });

  it("webhooks need https and at least one event; a test delivery is recorded", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.createWebhook({ url: "http://example.com/hook", events: ["bounty_funded"] }))).toBe("url_invalid");
    expect(await code(w.actions.createWebhook({ url: "https://example.com/hook", events: [] }))).toBe("events_required");
    const made = must(await w.actions.createWebhook({ url: "https://example.com/flowd", events: ["bounty_funded"] }));
    expect(made.secret).toMatch(/^whsec_/);
    expect(JSON.stringify(w.state().webhooks)).not.toContain(made.secret);
    const tested = must(await w.actions.testWebhook({ webhook_id: made.webhook.id }));
    expect(tested.webhook.deliveries[0]).toMatchObject({ status: "delivered", status_code: 200 });
    expect(tested.webhook.failure_count).toBe(0);
  });

  it("a viewer cannot create keys; a workspace on the free plan is told which plan has the API", async () => {
    const w = await makeWorld("brand");
    asMember(w, "bm_lumi_aiko");
    expect(await code(w.actions.createApiKey({ name: "Viewer attempt" }))).toBe("forbidden");
    w.as("admin");
    w.store.setState({ session: { ...w.state().session, brand_id: "br_glowkit" } });
    const free = await w.actions.createApiKey({ name: "Free attempt" });
    expect(free.ok).toBe(false);
  });
});

describe("the team", () => {
  it("invites, changes roles and removes, and keeps the owner", async () => {
    const w = await makeWorld("brand");
    const invited = must(await w.actions.inviteTeamMember({ email: "riley.park@lumi.example", role: "reviewer" }));
    expect(w.state().brand_members[invited.member_id]).toMatchObject({ role: "reviewer", status: "invited", brand_id: "br_lumi" });
    expect(w.state().users[invited.user_id]).toMatchObject({ email: "riley.park@lumi.example", display_name: "Riley Park", status: "invited" });
    expect(await code(w.actions.inviteTeamMember({ email: "riley.park@lumi.example", role: "viewer" }))).toBe("already_member");
    expect(await code(w.actions.inviteTeamMember({ email: "not-an-email", role: "viewer" }))).toBe("email_invalid");
    const approver = must(await w.actions.inviteTeamMember({ email: "client@agency.example", role: "client_approver" }));
    expect(approver.approval_link).toMatch(/^joinflowd\.io\/approve\//);

    must(await w.actions.changeMemberRole({ member_id: invited.member_id, role: "finance" }));
    expect(w.state().brand_members[invited.member_id].role).toBe("finance");
    expect(await code(w.actions.changeMemberRole({ member_id: "bm_lumi_jordan", role: "viewer" }))).toBe("owner_fixed");
    expect(await code(w.actions.removeMember({ member_id: "bm_lumi_jordan" }))).toBe("owner_fixed");

    must(await w.actions.removeMember({ member_id: invited.member_id }));
    expect(w.state().brand_members[invited.member_id].status).toBe("removed");
    // the person can be invited again once removed
    expect(await code(w.actions.inviteTeamMember({ email: "riley.park@lumi.example", role: "viewer" }))).toBe("ok");
    expect(Object.values(w.state().activity_log).some((a) => a.action === "member_invited")).toBe(true);
  });

  it("only owners and admins manage the team", async () => {
    const w = await makeWorld("brand");
    for (const member of ["bm_lumi_maren", "bm_lumi_tobias", "bm_lumi_aiko"]) {
      asMember(w, member);
      expect(await code(w.actions.inviteTeamMember({ email: `x.${member}@lumi.example`, role: "viewer" }))).toBe("forbidden");
    }
  });
});

describe("the roles matrix", () => {
  it("a reviewer reviews but cannot fund; finance funds but cannot decide; a viewer only looks", async () => {
    const w = await makeWorld("brand");
    const waiting = Object.values(w.state().submissions).filter((s) => s.brand_id === "br_lumi" && s.status === "in_review");
    expect(waiting.length).toBeGreaterThan(2);

    asMember(w, "bm_lumi_aiko");
    expect(await code(w.actions.fundWallet({ amount_cents: 10_000 }))).toBe("forbidden");
    expect(await code(w.actions.approveSubmission({ submission_id: waiting[0].id }))).toBe("forbidden");
    expect(await code(w.actions.pauseBounty({ bounty_id: "bnty_lumi_glowup" }))).toBe("forbidden");

    asMember(w, "bm_lumi_tobias");
    expect(await code(w.actions.approveSubmission({ submission_id: waiting[0].id }))).toBe("forbidden");
    expect(await code(w.actions.fundWallet({ amount_cents: 10_000 }))).toBe("ok");

    asMember(w, "bm_lumi_maren");
    expect(await code(w.actions.fundWallet({ amount_cents: 10_000 }))).toBe("forbidden");
    expect(await code(w.actions.approveSubmission({ submission_id: waiting[0].id }))).toBe("ok");
    expect(ledgerProblems(w.state())).toEqual([]);
  });

  it("a removed member can no longer act", async () => {
    const w = await makeWorld("brand");
    must(await w.actions.removeMember({ member_id: "bm_lumi_maren" }));
    asMember(w, "bm_lumi_maren");
    expect(await code(w.actions.createList({ name: "Should fail" }))).toBe("forbidden");
  });

  it("every action is refused for a signed-out visitor, with the same plain code", async () => {
    const w = await makeWorld(null);
    expect(await code(w.actions.fundWallet({ amount_cents: 10_000 }))).toBe("unauthenticated");
    expect(await code(w.actions.createBounty({ app_id: "app_lumi", title: "Anon", budget_cents: 10_000 }))).toBe("unauthenticated");
    expect(await code(w.actions.requestPayout({}))).toBe("unauthenticated");
    expect(await code(w.actions.advanceClock({ hours: 1 }))).toBe("unauthenticated");
  });
});

describe("guarded auto-approve rules", () => {
  it("a rule must dry-run on its current conditions before it can be switched on", async () => {
    const w = await makeWorld("brand");
    const { rule } = must(await w.actions.saveRule({ name: "Clean weekday videos" }));
    expect(rule.status).toBe("draft");
    // no dry run, no enabling
    expect(await code(w.actions.setRuleStatus({ rule_id: rule.id, status: "active" }))).toBe("dry_run_required");
    const dry = must(await w.actions.dryRunRule({ rule_id: rule.id }));
    expect(dry.rule.status).toBe("dry_run");
    expect(dry.result.headline.length).toBeGreaterThan(5);
    const on = must(await w.actions.setRuleStatus({ rule_id: rule.id, status: "active" }));
    expect(on.rule.status).toBe("active");
    expect(on.rule.enabled_at).toBe(w.state().clock.now);
    // editing its conditions sends it back to draft, and the old dry run is gone
    const edited = must(await w.actions.saveRule({ rule_id: rule.id, name: rule.name, conditions: { min_creator_approved_posts: 12 } }));
    expect(edited.rule.status).toBe("draft");
    expect(edited.rule.dry_run).toBeUndefined();
    expect(await code(w.actions.setRuleStatus({ rule_id: rule.id, status: "active" }))).toBe("dry_run_required");
  });

  it("the spot-check share has a floor, and the kill switch needs a reason and is logged", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.saveRule({ name: "No oversight", guardrails: { spot_check_ratio: 0 } }))).toBe("spot_check_floor");
    const rule = w.state().auto_approve_rules.rule_lumi_organic;
    expect(rule.status).toBe("active");
    expect(await code(w.actions.setRuleStatus({ rule_id: rule.id, status: "killed" }))).toBe("reason_required");
    const killed = must(await w.actions.setRuleStatus({ rule_id: rule.id, status: "killed", reason: "Too many hook repeats this week" }));
    expect(killed.rule.status).toBe("killed");
    expect(killed.rule.audit.at(-1)?.action).toBe("killed");
    expect(Object.values(w.state().activity_log).some((a) => a.action === "rule_killed" && a.target_id === rule.id)).toBe(true);
    // a killed rule cannot run
    expect(await code(w.actions.autoApproveRun({}))).toBe("no_active_rule");
  });

  it("running the active rules approves only what the rule allows and leaves the rest for a person", async () => {
    const w = await makeWorld("brand");
    const waiting = Object.values(w.state().submissions).filter((s) => s.brand_id === "br_lumi" && s.status === "in_review").length;
    const r = must(await w.actions.autoApproveRun({ rule_id: "rule_lumi_organic" }));
    expect(r.evaluated).toBe(waiting);
    expect(r.approved + r.routed_to_human).toBe(waiting);
    const after = Object.values(w.state().submissions).filter((s) => s.brand_id === "br_lumi" && s.status === "in_review").length;
    expect(after).toBe(waiting - r.approved);
    expect(ledgerProblems(w.state())).toEqual([]);
  });
});

describe("rights", () => {
  it("renewing paid-ad rights is paid from the wallet: creator, fee and ledger agree and the licence moves out", async () => {
    const w = await makeWorld("brand");
    const grant = w.state().rights_grants.rg_0002;
    const walletBefore = w.state().brands.br_lumi.wallet_balance_cents;
    const r = must(await w.actions.renewRights({ grant_id: grant.id, extra_days: 30 }));
    expect(r.total_cents).toBeGreaterThan(0);
    const next = w.state().rights_grants.rg_0002;
    expect(next.status).toBe("active");
    expect(Date.parse(next.ends_at ?? "")).toBeGreaterThan(Date.parse(grant.ends_at ?? ""));
    expect(next.renewals.length).toBe(grant.renewals.length + 1);
    expect(w.state().brands.br_lumi.wallet_balance_cents).toBe(walletBefore - r.total_cents);
    expect(w.state().brands.br_lumi.wallet_balance_cents).toBe(walletFromLedger(w.state(), "br_lumi"));
    // the creator is paid through the Money Clock, never instantly
    const row = Object.values(w.state().money_clock).find((m) => m.source === "rights_fee" && m.post_id === grant.post_id && m.state === "pending");
    expect(row?.amount_cents).toBeGreaterThan(0);
    expect(row?.reason_text).toMatch(/Clears with the next daily run/);
    expect(ledgerProblems(w.state())).toEqual([]);
    expect(await code(w.actions.renewRights({ grant_id: grant.id, extra_days: 0 }))).toBe("days_invalid");
  });

  it("only the creator or Ops revoke a licence, with a reason, and live ads on it stop", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.revokeRights({ grant_id: "rg_0005", reason: "Changed our mind about this one" }))).toBe("forbidden");
    w.as("admin");
    expect(await code(w.actions.revokeRights({ grant_id: "rg_0005", reason: "short" }))).toBe("reason_required");
    const revoked = must(await w.actions.revokeRights({ grant_id: "rg_0005", reason: "Misuse beyond the Rights Card" }));
    expect(revoked.grant.status).toBe("revoked");
    for (const ad of Object.values(w.state().ads).filter((a) => a.post_id === revoked.grant.post_id)) expect(ad.status).toBe("ended");
    expect(await code(w.actions.revokeRights({ grant_id: "rg_0005", reason: "Misuse beyond the Rights Card" }))).toBe("invalid_state");
    // a revoked licence cannot be renewed
    w.as("brand");
    expect(await code(w.actions.renewRights({ grant_id: "rg_0005", extra_days: 30 }))).toBe("invalid_state");
  });
});

describe("creator lists", () => {
  it("creates a list, adds and removes creators, and refuses nothing silently", async () => {
    const w = await makeWorld("brand");
    const list = must(await w.actions.createList({ name: "Fitness hooks" })).list;
    expect(list.brand_id).toBe("br_lumi");
    const added = must(await w.actions.addToList({ list_id: list.id, creator_id: "cr_maya", note: "Great pacing" }));
    expect(JSON.stringify(added.list)).toContain("cr_maya");
    const removed = must(await w.actions.removeFromList({ list_id: list.id, creator_id: "cr_maya" }));
    expect(JSON.stringify(removed.list)).not.toContain("cr_maya");
    expect(await code(w.actions.createList({ name: "x" }))).not.toBe("");
  });
});

describe("test plans", () => {
  const hooks = [
    { id: "hook_confession_01", label: "I was wrong about photo apps." },
    { id: "hook_pov_02", label: "POV: you found the one photo app." },
  ];
  const bodies = [{ id: "tmpl_screen_reaction", label: "Screen reaction" }];

  it("creates, edits, assigns and archives a plan inside the cell limit of its spend tier", async () => {
    const w = await makeWorld("brand");
    const { plan } = must(await w.actions.createTestPlan({ app_id: "app_lumi", name: "Confession vs POV", budget_cents: 60_000, hooks, bodies, ctas: ["link_in_bio", "use_code"] }));
    expect(plan).toMatchObject({ status: "draft", spend_tier: "starter", brand_id: "br_lumi" });
    expect(plan.cells).toHaveLength(4);
    expect(plan.caution).toMatch(/Nothing measured yet/);

    // too many cells for a starter budget is refused with the fix
    const many = Array.from({ length: 4 }, (_, i) => ({ id: `hook_extra_${i}`, label: `Extra hook ${i}` }));
    const big = await w.actions.updateTestPlan({ plan_id: plan.id, changes: { hooks: [...hooks, ...many] } });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error.code).toBe("too_many_cells");
    expect(await code(w.actions.createTestPlan({ app_id: "app_lumi", name: "One hook", budget_cents: 60_000, hooks: [hooks[0]], bodies, ctas: ["link_in_bio"] }))).toBe("axes_required");
    expect(await code(w.actions.createTestPlan({ app_id: "app_lumi", name: "Tiny", budget_cents: 5_000, hooks, bodies, ctas: ["link_in_bio"] }))).toBe("budget_too_small");

    const bounty = Object.values(w.state().bounties).find((b) => b.app_id === "app_lumi");
    expect(await code(w.actions.assignTestPlan({ plan_id: plan.id }))).toBe("nothing_assigned");
    const running = must(await w.actions.assignTestPlan({ plan_id: plan.id, bounty_ids: [bounty?.id ?? ""] })).plan;
    expect(running.status).toBe("running");
    expect(running.cells.every((c) => c.status === "briefed")).toBe(true);
    // a running plan keeps its matrix
    expect(await code(w.actions.updateTestPlan({ plan_id: plan.id, changes: { name: "Renamed" } }))).toBe("invalid_state");
    expect(must(await w.actions.archiveTestPlan({ plan_id: plan.id })).plan.status).toBe("archived");
  });

  it("the test planner is part of a paid plan", async () => {
    const w = await makeWorld("admin");
    const free = await w.actions.createTestPlan({ app_id: "app_glowkit", name: "Free workspace", budget_cents: 60_000, hooks, bodies, ctas: ["link_in_bio"] });
    expect(free.ok).toBe(false);
    if (!free.ok) expect(free.error.code).toBe("plan_required");
  });
});

describe("workspace settings", () => {
  it("the brand edits its profile and defaults; a viewer cannot", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.updateBrandSettings({ tagline: "AI photos that look like you", review_sla_hours: 48 }))).toBe("ok");
    expect(w.state().brands.br_lumi).toMatchObject({ tagline: "AI photos that look like you", review_sla_hours: 48 });
    expect(await code(w.actions.updateBrandSettings({ review_sla_hours: 200 }))).toBe("sla_invalid");
    asMember(w, "bm_lumi_aiko");
    expect(await code(w.actions.updateBrandSettings({ tagline: "Nope" }))).toBe("forbidden");
    expect(w.state().brands.br_lumi.tagline).toBe("AI photos that look like you");
  });

  it("a brand cannot switch into another brand's workspace", async () => {
    const w = await makeWorld("brand");
    expect(await code(w.actions.switchWorkspace({ brand_id: "br_dozely" }))).toBe("forbidden");
    expect(w.state().session.brand_id).toBe("br_lumi");
    expect(await code(w.actions.switchWorkspace({ app_id: "app_lumi" }))).toBe("ok");
  });
});
