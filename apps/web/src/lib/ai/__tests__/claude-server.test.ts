import { describe, expect, it, vi } from "vitest";
import { parseServerEnv, type ServerEnv } from "@/lib/env";
import {
  FloError,
  HttpFloProvider,
  MockFloProvider,
  bountyDraftTask,
  captionTask,
  collectStream,
  commentReplyTask,
  readSse,
  scriptTask,
  type FloStreamEvent,
  type FloTask,
} from "../index";
import { ClaudeProvider, FALLBACK_BETA, assertHouseRules, buildMessagesParams, loadAnthropicClient, mergeCreative, type AnthropicLike, type AnthropicMessageLike } from "../claude-provider";
import { FLO_SYSTEM_PROMPT, buildClaudeRequest } from "../claude-prompts";
import { clientKey, createRateLimiter } from "../rate-limit";
import { MAX_BODY_BYTES, createFloServer, describeFlo, resolveProviders, streamWithFallback } from "../server";
import { buildBountyDraft } from "../mock/bounty-draft";
import { appOf, bountyById, formatById, formats } from "./fixtures";

const NOW = "2026-10-03T14:00:00Z";
const lumi = bountyById("bnty_lumi_editwithme");
const lumiApp = appOf(lumi);
const task = (): FloTask => scriptTask({ bounty: lumi, app: lumiApp, format: formatById("tmpl_screen_reaction"), formats: formats().slice(0, 4), creatorCode: "MAYA6", creatorId: "cr_maya" });
const disclosure = lumi.brief.disclosure_text;

/** A reply a well-behaved model would send for a script task. */
const goodScripts = {
  title: `Three scripts for ${lumi.title}`,
  outputs: [`Option 1: screen reaction. ${disclosure}`, `Option 2: voiceover. ${disclosure}`, `Option 3: split screen. ${disclosure}`],
  notes: ["The hook lands by 2 seconds."],
};

const reply = (value: unknown, extra: Partial<AnthropicMessageLike> = {}): AnthropicMessageLike => ({ content: [{ type: "text", text: JSON.stringify(value) }], stop_reason: "end_turn", ...extra });

interface FakeClient extends AnthropicLike {
  create: ReturnType<typeof vi.fn>;
  betaCreate: ReturnType<typeof vi.fn>;
}

/** A stand-in for the SDK's client. `answer` is what the Messages API returns (or a function of the request). */
function fakeClient(answer: AnthropicMessageLike | ((params: Record<string, unknown>) => Promise<AnthropicMessageLike>), withBeta = true): FakeClient {
  const respond = typeof answer === "function" ? answer : async () => answer;
  const create = vi.fn((params: Record<string, unknown>) => respond(params));
  const betaCreate = vi.fn((params: Record<string, unknown>) => respond(params));
  return { messages: { create }, ...(withBeta ? { beta: { messages: { create: betaCreate } } } : {}), create, betaCreate } as FakeClient;
}

describe("the request Flo sends to Claude", () => {
  it("is built for claude-sonnet-5-5 with structured outputs, effort and none of the parameters that model rejects", () => {
    const params = buildMessagesParams(task(), { model: "claude-sonnet-5-5", maxTokens: 4000, effort: "low" });
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.max_tokens).toBe(4000);
    expect(params.system).toBe(FLO_SYSTEM_PROMPT);
    expect(params.messages).toEqual([{ role: "user", content: expect.any(String) }]);
    expect(params.output_config).toMatchObject({ effort: "low", format: { type: "json_schema", schema: { type: "object", additionalProperties: false } } });
    for (const banned of ["temperature", "top_p", "top_k", "thinking", "tool_choice", "budget_tokens"]) expect(params, banned).not.toHaveProperty(banned);
    // No assistant prefill: the only message is the user's.
    expect((params.messages as { role: string }[]).every((m) => m.role === "user")).toBe(true);
  });

  it("keeps the system prompt stable and house-safe: no clock, no ids, the vocabulary and the disclosure rule", () => {
    expect(FLO_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(FLO_SYSTEM_PROMPT).toMatch(/bounty/);
    expect(FLO_SYSTEM_PROMPT).toMatch(/#ad/);
    expect(FLO_SYSTEM_PROMPT).toMatch(/No exclamation marks/);
    expect(buildClaudeRequest(task()).system).toBe(buildClaudeRequest(commentReplyTask({ comment: "is this an ad?", app: lumiApp })).system);
  });

  it("sends the task's context but not its bookkeeping, and asks for different wording on a regenerate", () => {
    const first = JSON.parse(buildClaudeRequest(task()).user) as { task: string; instructions: string; context: Record<string, unknown>; variation?: string };
    expect(first.task).toBe("script");
    expect(first.instructions).toMatch(/Write 3 scripts/);
    expect(first.context.bounty).toBeDefined();
    for (const key of ["kind", "surface", "creator_id", "brand_id", "prompt", "attempt"]) expect(first.context, key).not.toHaveProperty(key);
    expect(first.variation).toBeUndefined();
    const again = JSON.parse(buildClaudeRequest({ ...task(), attempt: 2 }).user) as { variation?: string };
    expect(again.variation).toMatch(/regeneration number 2/);
    expect(buildClaudeRequest(task()).user).toBe(buildClaudeRequest(task()).user);
  });

  it("uses the draft schema, and tells Claude the engine's facts, for a bounty draft", () => {
    const draftTask = bountyDraftTask({ input: "Lumi AI Photo Editor", now: NOW });
    const parts = buildClaudeRequest(draftTask, { engine: { category: "ai_photo" } });
    expect(parts.expects).toBe("draft");
    expect(parts.schema.required).toContain("cta");
    expect(JSON.parse(parts.user).context.engine).toEqual({ category: "ai_photo" });
    expect(buildClaudeRequest(task()).expects).toBe("outputs");
  });
});

describe("the house rules every model answer passes", () => {
  it("rejects a phrase the brand banned or Flo never says", () => {
    const banned = lumi.brief.banned_claims[0];
    if (banned) expect(() => assertHouseRules(task(), [`${disclosure} This is ${banned}.`])).toThrow(FloError);
    expect(() => assertHouseRules(task(), [`${disclosure} Results are guaranteed.`])).toThrow(/banned phrase/);
  });
  it("requires #ad in every script and caption option, and one call to action in a caption", () => {
    expect(() => assertHouseRules(task(), [disclosure, "No disclosure here."])).toThrow(/#ad/);
    const caption = captionTask({ bounty: lumi, app: lumiApp });
    expect(() => assertHouseRules(caption, [`${disclosure} Link in bio.`])).not.toThrow();
    expect(() => assertHouseRules(caption, [`${disclosure} Link in bio. Follow me for more.`])).toThrow(/more than one thing/);
  });
  it("lets a comment reply through without #ad (it is a short answer, not a post)", () => {
    expect(() => assertHouseRules(commentReplyTask({ comment: "is this an ad?", app: lumiApp }), ["Yes, a paid partnership."])).not.toThrow();
  });
});

describe("ClaudeProvider", () => {
  it("answers a script task from the model's JSON, labelled as Claude's, and checks nothing but words", async () => {
    const client = fakeClient(reply(goodScripts));
    let t = 1000;
    const flo = new ClaudeProvider({ client, now: () => (t += 250) });
    const result = await flo.generate(task());
    expect(result).toMatchObject({ source: "claude", model: "claude-sonnet-5-5", kind: "script", task_kind: "script", title: goodScripts.title, outputs: goodScripts.outputs, notes: goodScripts.notes });
    expect(result.latency_ms).toBe(250);
    expect(result.label).toMatch(/can be wrong/);
    expect(result.actions.map((a) => a.kind)).toEqual(["open_studio", "copy"]);
    expect(flo.id).toBe("claude");
  });

  it("opts into the server-side refusal fallback by default and can turn it off", async () => {
    const withFallback = fakeClient(reply(goodScripts));
    await new ClaudeProvider({ client: withFallback }).generate(task());
    expect(withFallback.create).not.toHaveBeenCalled();
    const [params] = withFallback.betaCreate.mock.calls[0] as [Record<string, unknown>];
    expect(params.betas).toEqual([FALLBACK_BETA]);
    expect(FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(params.fallbacks).toBe("default");

    const plain = fakeClient(reply(goodScripts));
    await new ClaudeProvider({ client: plain, refusalFallback: false }).generate(task());
    expect(plain.betaCreate).not.toHaveBeenCalled();
    expect(plain.create.mock.calls[0]?.[0]).not.toHaveProperty("fallbacks");

    const noBetaApi = fakeClient(reply(goodScripts), false);
    await new ClaudeProvider({ client: noBetaApi }).generate(task());
    expect(noBetaApi.create).toHaveBeenCalledOnce();
  });

  it("turns a refusal, a cut-off, bad JSON and a reply that breaks the schema into errors the server can fall back from", async () => {
    const refusal = new ClaudeProvider({ client: fakeClient({ content: [], stop_reason: "refusal", stop_details: { category: "general_harms" } }) });
    await expect(refusal.generate(task())).rejects.toMatchObject({ name: "FloError", code: "refused", message: expect.stringContaining("general_harms") });

    const cut = new ClaudeProvider({ client: fakeClient(reply(goodScripts, { stop_reason: "max_tokens" })) });
    await expect(cut.generate(task())).rejects.toMatchObject({ code: "invalid_output", message: expect.stringContaining("cut off") });

    const notJson = new ClaudeProvider({ client: fakeClient({ content: [{ type: "text", text: "Sure! Here are some scripts." }], stop_reason: "end_turn" }) });
    await expect(notJson.generate(task())).rejects.toMatchObject({ code: "invalid_output", message: expect.stringContaining("valid JSON") });

    const wrongShape = new ClaudeProvider({ client: fakeClient(reply({ title: "Only a title" })) });
    await expect(wrongShape.generate(task())).rejects.toMatchObject({ code: "invalid_output" });

    const tooMany = new ClaudeProvider({ client: fakeClient(reply({ ...goodScripts, outputs: Array.from({ length: 9 }, () => goodScripts.outputs[0]) })) });
    await expect(tooMany.generate(task())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("refuses to show an answer that breaks the house rules", async () => {
    const hype = new ClaudeProvider({ client: fakeClient(reply({ ...goodScripts, outputs: [`${disclosure} Make easy money with this.`] })) });
    await expect(hype.generate(task())).rejects.toMatchObject({ code: "guard" });
    const hidden = new ClaudeProvider({ client: fakeClient(reply({ ...goodScripts, outputs: ["No disclosure in this one."] })) });
    await expect(hidden.generate(task())).rejects.toMatchObject({ code: "guard" });
  });

  it("reports a network failure as unavailable and a cancelled call as aborted, without leaking the cause's text", async () => {
    const down = new ClaudeProvider({ client: fakeClient(async () => Promise.reject(new Error("socket hang up: key sk-ant-secret"))) });
    const error = await down.generate(task()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FloError);
    expect(error).toMatchObject({ code: "unavailable", message: "Claude could not be reached." });
    expect(String((error as Error).message)).not.toContain("sk-ant-secret");

    const controller = new AbortController();
    controller.abort();
    const cancelled = new ClaudeProvider({ client: fakeClient(async () => Promise.reject(new Error("aborted"))) });
    await expect(cancelled.generate(task(), { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("streams the validated answer through the typewriter and ends with the result", async () => {
    const flo = new ClaudeProvider({ client: fakeClient(reply(goodScripts)) });
    const { outputs, result, error } = await collectStream(flo.stream(task(), { typewriter: { instant: true } }));
    expect(error).toBeNull();
    expect(outputs).toEqual(goodScripts.outputs);
    expect(result?.source).toBe("claude");
  });

  describe("bounty drafts: Claude writes the words, the engine keeps the numbers", () => {
    const draftTask = bountyDraftTask({ input: "https://apps.apple.com/us/app/lumi-ai-photo-editor/id6448900000", now: NOW });
    const creative = {
      title: "I edited a week of photos in one lunch break",
      summary: "Show one photo going from flat to finished in Lumi, with the app on screen from the first second.",
      talking_points: ["One-tap enhance on a dull photo", "Swap the background", "Pick a style preset"],
      dos: ["Show the app on screen in the first 3 seconds", "Say what you edited"],
      donts: ["Do not promise results"],
      cta: "Link in bio.",
      offer_line: "Free to try.",
      tone: "Warm and specific",
      rationale: ["Before and after is the clearest demo for photo editing."],
    };

    it("keeps every number, the beats and the disclosure from the engine's baseline", async () => {
      const baseline = buildBountyDraft(draftTask, 0);
      const flo = new ClaudeProvider({ client: fakeClient(reply(creative)) });
      const result = await flo.generate(draftTask);
      const draft = result.draft;
      expect(draft).toBeDefined();
      if (!draft) return;
      expect(result).toMatchObject({ source: "claude", kind: "bounty_draft", label: expect.stringMatching(/Brief Lint decides/) });
      expect(draft.title).toBe(creative.title);
      expect(draft.brief.summary).toBe(creative.summary);
      expect(draft.brief.cta).toBe("Link in bio.");
      for (const key of ["cpm_cents", "cpa_install_cents", "cpa_trial_cents", "cpa_paid_cents", "per_video_cap_cents", "budget_cents"] as const) expect(draft[key], key).toBe(baseline[key]);
      expect(draft.brief.beats).toEqual(baseline.brief.beats);
      expect(draft.brief.disclosure_text).toBe(baseline.brief.disclosure_text);
      expect(draft.brief.banned_claims).toEqual(baseline.brief.banned_claims);
      expect(draft.funding).toEqual(baseline.funding);
      expect(draft.lint.can_publish).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it("gives the model the engine's category, beats and banned claims to write inside", async () => {
      const client = fakeClient(reply(creative));
      await new ClaudeProvider({ client }).generate(draftTask);
      const [params] = client.betaCreate.mock.calls[0] as [{ messages: { content: string }[] }];
      const sent = JSON.parse(params.messages[0]?.content ?? "{}") as { context: { engine: { category: string; beats: unknown[]; banned_claims: string[] } } };
      expect(sent.context.engine.category).toBe("ai_photo");
      expect(sent.context.engine.beats.length).toBeGreaterThan(2);
      expect(sent.context.engine.banned_claims.length).toBeGreaterThan(0);
    });

    it("rejects a draft that uses a banned phrase or asks for two things", () => {
      const base = buildBountyDraft(draftTask, 0);
      expect(() => mergeCreative(base, { ...creative, summary: "A guaranteed way to get better photos, shown on screen." }, draftTask)).toThrow(/banned phrase/);
      expect(() => mergeCreative(base, { ...creative, cta: "Link in bio and follow me for more." }, draftTask)).toThrow(/more than one thing/);
      expect(() => mergeCreative(base, creative, draftTask)).not.toThrow();
    });

    it("rejects a draft that does not match the schema", async () => {
      const flo = new ClaudeProvider({ client: fakeClient(reply({ ...creative, talking_points: [] })) });
      await expect(flo.generate(draftTask)).rejects.toMatchObject({ code: "invalid_output" });
    });
  });
});

describe("loadAnthropicClient", () => {
  it("builds a client from the SDK's default export, with the key, a timeout and retries", async () => {
    const ctor = vi.fn();
    class Fake {
      constructor(init: unknown) {
        ctor(init);
      }
    }
    const importer = vi.fn(async () => ({ default: Fake }));
    const client = await loadAnthropicClient({ apiKey: "sk-ant-test", importer });
    expect(client).toBeInstanceOf(Fake);
    expect(importer).toHaveBeenCalledWith("@anthropic-ai/sdk");
    expect(ctor).toHaveBeenCalledWith({ apiKey: "sk-ant-test", timeout: 30_000, maxRetries: 2 });
  });
  it("also accepts a named Anthropic export and a custom timeout", async () => {
    const ctor = vi.fn();
    class Fake {
      constructor(init: unknown) {
        ctor(init);
      }
    }
    await loadAnthropicClient({ apiKey: "k", timeoutMs: 5000, importer: async () => ({ Anthropic: Fake }) });
    expect(ctor).toHaveBeenCalledWith({ apiKey: "k", timeout: 5000, maxRetries: 2 });
  });
  it("names the one command that fixes a missing SDK, and rejects a module with no client class", async () => {
    await expect(loadAnthropicClient({ apiKey: "k", importer: async () => Promise.reject(new Error("Cannot find module")) })).rejects.toMatchObject({ code: "unavailable", message: expect.stringContaining("npm install @anthropic-ai/sdk") });
    await expect(loadAnthropicClient({ apiKey: "k", importer: async () => ({}) })).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("the rate limiter", () => {
  it("allows a window's worth of requests, then says how long to wait", () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(limiter.take("a")).toMatchObject({ ok: true, remaining: 2 });
    expect(limiter.take("a")).toMatchObject({ ok: true, remaining: 1 });
    expect(limiter.take("a")).toMatchObject({ ok: true, remaining: 0 });
    now += 10_000;
    const blocked = limiter.take("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(50);
  });
  it("counts each client separately and starts a fresh window afterwards", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
    now += 1000;
    expect(limiter.take("a").ok).toBe(true);
  });
  it("keeps memory bounded when many clients show up", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 10, now: () => now });
    for (let i = 0; i < 200; i += 1) {
      now += 1;
      expect(limiter.take(`client-${i}`).ok).toBe(true);
    }
  });
  it("finds the client from the first forwarded hop, then x-real-ip, then one shared bucket", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(new Headers())).toBe("local");
  });
});

// ── the route handler ──────────────────────────────────────────────────────────────────────────

const mockEnv = (): ServerEnv => parseServerEnv({});
const claudeEnv = (extra: Record<string, string> = {}): ServerEnv => parseServerEnv({ ANTHROPIC_API_KEY: "sk-ant-secret-key", ...extra });

const post = (body: unknown, init: RequestInit = {}): Request =>
  new Request("http://localhost:3000/api/v1/flo/chat", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body), ...init });

async function events(response: Response): Promise<FloStreamEvent[]> {
  const out: FloStreamEvent[] = [];
  if (!response.body) return out;
  for await (const e of readSse(response.body)) out.push(e);
  return out;
}

describe("POST /api/v1/flo/chat", () => {
  const silent = { log: () => undefined };

  it("answers from the mock with no key, streaming server-sent events that end in the result", async () => {
    const server = createFloServer({ env: mockEnv(), ...silent });
    const response = await server.handle(post({ task: task() }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-flo-engine")).toBe("mock");
    const got = await events(response);
    expect(got[0]?.type).toBe("start");
    const done = got.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.source).toBe("mock");
      expect(done.result.outputs).toHaveLength(3);
      expect(done.result.degraded).toBeUndefined();
    }
  });

  it("sends each option whole, and the browser's provider types it out from the finished answer", async () => {
    const server = createFloServer({ env: mockEnv(), ...silent });
    const wire = await events(await server.handle(post({ task: task() })));
    expect(wire.filter((e) => e.type === "delta")).toHaveLength(3);

    const viaRoute = (async (_url: unknown, init?: RequestInit) => server.handle(new Request("http://localhost:3000/api/v1/flo/chat", init))) as typeof fetch;
    const flo = new HttpFloProvider({ fetch: viaRoute });
    const pauses: number[] = [];
    const typed: FloStreamEvent[] = [];
    for await (const e of flo.stream(task(), { typewriter: { sleep: async (ms) => void pauses.push(ms) } })) typed.push(e);
    const deltas = typed.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(100);
    expect(pauses.length).toBeGreaterThan(100);
    const done = typed.at(-1);
    expect(done?.type === "done" && done.result.source).toBe("mock");
    expect(done?.type === "done" && done.result.degraded).toBeUndefined();
    const collected = await collectStream(flo.stream(task(), { typewriter: { instant: true } }));
    expect(collected.outputs).toEqual(collected.result?.outputs);
  });

  it("rejects bad requests with the API's { code, message, hint } shape", async () => {
    const server = createFloServer({ env: mockEnv(), ...silent });
    const notJson = await server.handle(post("{not json"));
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toMatchObject({ code: "invalid_json", message: expect.any(String), hint: expect.any(String) });

    const invalid = await server.handle(post({ task: { kind: "script" } }));
    expect(invalid.status).toBe(422);
    const body = (await invalid.json()) as { code: string; issues: { path: string; message: string }[] };
    expect(body.code).toBe("validation_failed");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues.length).toBeLessThanOrEqual(8);

    const unknownKind = await server.handle(post({ task: { kind: "write_my_homework" } }));
    expect(unknownKind.status).toBe(422);

    const huge = await server.handle(post({ task: { kind: "comment_reply", comment: "x".repeat(MAX_BODY_BYTES), app: { name: "Lumi" } } }));
    expect(huge.status).toBe(413);
    expect(await huge.json()).toMatchObject({ code: "payload_too_large" });
  });

  it("rate limits per client and says when to retry", async () => {
    const server = createFloServer({ env: parseServerEnv({ FLO_RATE_LIMIT_PER_MIN: "2" }), ...silent });
    const request = () => post({ task: commentReplyTask({ comment: "is this an ad?", app: lumiApp }) }, { headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" } });
    expect((await server.handle(request())).status).toBe(200);
    expect((await server.handle(request())).status).toBe(200);
    const limited = await server.handle(request());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
    // Another client is unaffected.
    const other = await server.handle(post({ task: commentReplyTask({ comment: "hi", app: lumiApp }) }, { headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" } }));
    expect(other.status).toBe(200);
  });

  it("uses Claude when a key is set, and never puts the key on the wire", async () => {
    const client = fakeClient(reply(goodScripts));
    const server = createFloServer({ env: claudeEnv(), loadClient: async () => client, ...silent });
    const response = await server.handle(post({ task: task() }));
    expect(response.headers.get("x-flo-engine")).toBe("claude");
    const got = await events(response);
    const done = got.at(-1);
    expect(done?.type === "done" && done.result.source).toBe("claude");
    expect(JSON.stringify(got)).not.toContain("sk-ant-secret-key");
    expect([...response.headers.values()].join(" ")).not.toContain("sk-ant-secret-key");
    expect(client.betaCreate).toHaveBeenCalledOnce();
  });

  it("falls back to the mock, marked degraded, when Claude fails, and logs without the prompt or the key", async () => {
    const log = vi.fn();
    const client = fakeClient(async () => Promise.reject(new Error("overloaded")));
    const server = createFloServer({ env: claudeEnv(), loadClient: async () => client, log });
    const got = await events(await server.handle(post({ task: task() })));
    const done = got.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.source).toBe("mock");
      expect(done.result.degraded).toBe(true);
    }
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk-ant-secret-key");
  });

  it("falls back too when the SDK cannot be loaded, and when Claude refuses", async () => {
    const missing = createFloServer({ env: claudeEnv(), loadClient: async () => Promise.reject(new FloError("unavailable", "no sdk")), ...silent });
    const a = (await events(await missing.handle(post({ task: task() })))).at(-1);
    expect(a?.type === "done" && a.result.degraded).toBe(true);

    const refusing = createFloServer({ env: claudeEnv(), loadClient: async () => fakeClient({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }), ...silent });
    const b = (await events(await refusing.handle(post({ task: task() })))).at(-1);
    expect(b?.type === "done" && b.result.degraded).toBe(true);
  });

  it("does not use Claude when FLO_PROVIDER is mock, even with a key", async () => {
    const loadClient = vi.fn(async () => fakeClient(reply(goodScripts)));
    const server = createFloServer({ env: claudeEnv({ FLO_PROVIDER: "mock" }), loadClient, ...silent });
    const response = await server.handle(post({ task: task() }));
    expect(response.headers.get("x-flo-engine")).toBe("mock");
    await events(response);
    expect(loadClient).not.toHaveBeenCalled();
  });

  it("sends an error event, not a stack trace, if even the fallback fails", async () => {
    const broken: MockFloProvider = new MockFloProvider();
    vi.spyOn(broken, "stream").mockImplementation(async function* () {
      yield* [];
      throw new Error("kaboom at /srv/app/secret.ts:42");
    });
    const server = createFloServer({ env: mockEnv(), fallback: broken, ...silent });
    const got = await events(await server.handle(post({ task: task() })));
    const error = got.find((e) => e.type === "error");
    expect(error).toMatchObject({ type: "error", message: "Flo could not answer. Try again in a moment." });
    expect(JSON.stringify(got)).not.toContain("kaboom");
  });
});

describe("which engine answers", () => {
  it("describes the engine without revealing the key", () => {
    expect(describeFlo(mockEnv())).toEqual({ provider: "mock", model: "flo-mock-1", configured: false, fallback: "mock" });
    expect(describeFlo(claudeEnv())).toEqual({ provider: "claude", model: "claude-sonnet-5-5", configured: true, fallback: "mock" });
    expect(describeFlo(claudeEnv({ FLO_PROVIDER: "mock" }))).toMatchObject({ provider: "mock", configured: true });
    expect(describeFlo(claudeEnv({ FLO_MODEL: "claude-sonnet-5-5" })).model).toBe("claude-sonnet-5-5");
    expect(JSON.stringify(describeFlo(claudeEnv()))).not.toContain("sk-ant");
  });

  it("picks the mock for both roles with no key, and Claude first with the mock behind it when there is one", () => {
    const none = resolveProviders(mockEnv());
    expect(none.primary).toBe(none.fallback);
    const withKey = resolveProviders(claudeEnv(), { loadClient: async () => fakeClient(reply(goodScripts)) });
    expect(withKey.primary.id).toBe("claude");
    expect(withKey.fallback.id).toBe("mock");
  });

  it("streamWithFallback marks the fallback's answer degraded and stays quiet when the caller cancelled", async () => {
    const mock = new MockFloProvider();
    const failing = new ClaudeProvider({ client: fakeClient(async () => Promise.reject(new Error("down"))) });
    const onFailure = vi.fn();
    const out: FloStreamEvent[] = [];
    for await (const e of streamWithFallback(failing, mock, task(), { typewriter: { instant: true } }, onFailure)) out.push(e);
    const done = out.at(-1);
    expect(done?.type === "done" && done.result.degraded).toBe(true);
    expect(onFailure).toHaveBeenCalledOnce();

    const controller = new AbortController();
    controller.abort();
    const quiet: FloStreamEvent[] = [];
    for await (const e of streamWithFallback(failing, mock, task(), { signal: controller.signal, typewriter: { instant: true } })) quiet.push(e);
    expect(quiet).toEqual([]);
  });
});
