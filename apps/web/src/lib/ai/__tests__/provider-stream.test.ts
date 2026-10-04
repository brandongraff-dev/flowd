import { describe, expect, it, vi } from "vitest";
import {
  FloChatRequestSchema,
  HttpFloProvider,
  MockFloProvider,
  SseDecoder,
  bountyDraftTask,
  briefTldrTask,
  captionTask,
  chunkText,
  collectStream,
  createFloProvider,
  encodeSse,
  findSuggestion,
  floKindFor,
  fromFloSuggestion,
  hookRewriteTask,
  promptFor,
  readSse,
  resultToText,
  scriptTask,
  streamResult,
  toFloSuggestion,
  typewriter,
  typingDurationMs,
  type FloResult,
  type FloStreamEvent,
  type FloTask,
} from "../index";
import { appOf, bountyById, formatById, suggestions } from "./fixtures";

const NOW = "2026-10-03T14:00:00Z";
const lumi = bountyById("bnty_lumi_editwithme");
const lumiApp = appOf(lumi);

/** A sleep that records instead of waiting. */
function fakeSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number): Promise<void> => {
    delays.push(ms);
  };
  return { delays, sleep };
}

describe("chunkText", () => {
  it("keeps every character: joining the chunks gives the text back", () => {
    const samples = ["", "a", "Hello there.\nSecond line", "  leading and trailing  ", "tabs\tand\n\nblank lines", "emoji 🎬 and ünïcode", "one"];
    for (const s of samples) expect(chunkText(s).join("")).toBe(s);
  });
  it("splits into words with their trailing space", () => {
    expect(chunkText("Hi there.\nOk")).toEqual(["Hi ", "there.\n", "Ok"]);
  });
  it("round-trips random text", () => {
    let seed = 12345;
    const next = (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const alphabet = ["a", "b", " ", " ", "\n", ".", "é", "🎬", "x", "\t"];
    for (let i = 0; i < 200; i += 1) {
      const text = Array.from({ length: 1 + Math.floor(next() * 80) }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
      expect(chunkText(text).join("")).toBe(text);
    }
  });
});

describe("typewriter", () => {
  const text = "Wait until you see what Lumi did. It took nine minutes.\nThen I stopped scrolling.";

  it("yields the whole text back, word by word", async () => {
    const { sleep } = fakeSleep();
    const chunks: string[] = [];
    for await (const c of typewriter(text, { sleep })) chunks.push(c);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(8);
  });
  it("waits before the first character, then a human amount per word, longer after a sentence", async () => {
    const { delays, sleep } = fakeSleep();
    const chunks: string[] = [];
    for await (const c of typewriter(text, { sleep, firstTokenDelayMs: 400, jitter: 0 })) chunks.push(c);
    expect(delays[0]).toBe(400);
    const afterSentence = delays[1 + chunks.findIndex((c) => c.startsWith("did."))] ?? 0;
    const afterWord = delays[1 + chunks.findIndex((c) => c.startsWith("Wait"))] ?? 0;
    expect(afterSentence).toBeGreaterThan(afterWord);
  });
  it("is deterministic: the same text types with the same rhythm", async () => {
    const run = async (): Promise<number[]> => {
      const { delays, sleep } = fakeSleep();
      for await (const _chunk of typewriter(text, { sleep })) void _chunk;
      return delays;
    };
    expect(await run()).toEqual(await run());
  });
  it("is instant on request: one chunk, no sleeping", async () => {
    const sleep = vi.fn(async () => undefined);
    const chunks: string[] = [];
    for await (const c of typewriter(text, { instant: true, sleep })) chunks.push(c);
    expect(chunks).toEqual([text]);
    expect(sleep).not.toHaveBeenCalled();
  });
  it("yields nothing for empty text", async () => {
    const chunks: string[] = [];
    for await (const c of typewriter("", { instant: true })) chunks.push(c);
    expect(chunks).toEqual([]);
  });
  it("speeds up to stay inside the maximum duration", async () => {
    const long = "word ".repeat(2000);
    const { delays, sleep } = fakeSleep();
    for await (const _c of typewriter(long, { sleep, maxDurationMs: 5000, jitter: 0, firstTokenDelayMs: 0 })) void _c;
    expect(delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5000 * 1.05);
    expect(typingDurationMs([long], { maxDurationMs: 5000, jitter: 0, firstTokenDelayMs: 0 })).toBeLessThanOrEqual(5000 * 1.05);
  });
  it("stops quietly when aborted", async () => {
    const ctl = new AbortController();
    const chunks: string[] = [];
    for await (const c of typewriter(text, { signal: ctl.signal, sleep: async () => undefined })) {
      chunks.push(c);
      if (chunks.length === 3) ctl.abort();
    }
    expect(chunks).toHaveLength(3);
  });
  it("reports how long it will take, and zero when instant", () => {
    expect(typingDurationMs([text])).toBeGreaterThan(500);
    expect(typingDurationMs([text], { instant: true })).toBe(0);
  });
});

describe("streamResult", () => {
  const result: FloResult = {
    kind: "hook_rewrite",
    task_kind: "hook_rewrite",
    surface: "studio",
    title: "Three sharper openings",
    outputs: ["First option.", "Second option, a bit longer.", "Third."],
    notes: [],
    actions: [],
    model: "flo-mock-1",
    latency_ms: 1300,
    label: "x",
    source: "mock",
  };

  it("starts with the title, types each option in order, and ends with the result", async () => {
    const events: FloStreamEvent[] = [];
    for await (const e of streamResult(result, { sleep: async () => undefined })) events.push(e);
    expect(events[0]).toEqual({ type: "start", task_kind: "hook_rewrite", title: "Three sharper openings", model: "flo-mock-1", source: "mock", outputs: 3 });
    expect(events[events.length - 1]).toEqual({ type: "done", result });
    expect(events.filter((e) => e.type === "output_end")).toHaveLength(3);
    // options never interleave
    const order = events.filter((e) => e.type === "delta" || e.type === "output_end").map((e) => (e.type === "delta" || e.type === "output_end" ? e.output : -1));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("collects back to the same text", async () => {
    const collected = await collectStream(streamResult(result, { sleep: async () => undefined }));
    expect(collected.outputs).toEqual(result.outputs);
    expect(collected.result).toEqual(result);
    expect(collected.error).toBeNull();
  });
  it("is instant under reduced motion: one delta per option", async () => {
    const events: FloStreamEvent[] = [];
    for await (const e of streamResult(result, { instant: true })) events.push(e);
    expect(events.filter((e) => e.type === "delta")).toHaveLength(3);
  });
  it("ends without a done event when cancelled", async () => {
    const ctl = new AbortController();
    const events: FloStreamEvent[] = [];
    for await (const e of streamResult(result, { signal: ctl.signal, sleep: async () => undefined })) {
      events.push(e);
      if (e.type === "delta") ctl.abort();
    }
    expect(events.some((e) => e.type === "done")).toBe(false);
  });
});

describe("saved suggestions", () => {
  const all = suggestions();

  it("replays the saved answer that matches a request, in the same words", async () => {
    const starter = bountyById("bnty_flowd_starter_1");
    const flo = new MockFloProvider({ suggestions: all });
    const task = briefTldrTask({ bounty: starter, app: appOf(starter), creatorId: "cr_lou_learns" });
    const saved = all.find((s) => s.id === "flo_0001");
    expect(saved).toBeDefined();
    const r = await flo.generate(task);
    expect(r.source).toBe("fixture");
    expect(r.fixture_id).toBe("flo_0001");
    expect(r.outputs).toEqual(saved?.outputs);
    expect(r.title).toBe(saved?.title);
    expect(r.model).toBe("flo-mock-1");
    expect(r.kind).toBe("brief_tldr");
  });
  it("is scoped to the same person when both are known", () => {
    const starter = bountyById("bnty_flowd_starter_1");
    const forLou = findSuggestion(all, briefTldrTask({ bounty: starter, app: appOf(starter), creatorId: "cr_lou_learns" }));
    const forSomeoneElse = findSuggestion(all, briefTldrTask({ bounty: starter, app: appOf(starter), creatorId: "cr_somebody_else" }));
    expect(forLou?.id).toBe("flo_0001");
    expect(forSomeoneElse).toBeUndefined();
  });
  it("matches a hook rewrite by the hook text, not just the submission", () => {
    const saved = all.find((s) => s.kind === "hook_rewrite" && s.prompt.includes("Nobody talks about this part of flowd."));
    expect(saved).toBeDefined();
    const task = hookRewriteTask({ hook: "Nobody talks about this part of flowd.", app: lumiApp, submissionId: saved?.context_id, creatorId: saved?.creator_id });
    expect(findSuggestion(all, task)?.id).toBe(saved?.id);
    const other = hookRewriteTask({ hook: "A completely different line.", app: lumiApp, submissionId: saved?.context_id, creatorId: saved?.creator_id });
    expect(findSuggestion(all, other)).toBeUndefined();
  });
  it("writes new answers once the saved ones run out, and on a regenerate past them", async () => {
    const starter = bountyById("bnty_flowd_starter_1");
    const flo = new MockFloProvider({ suggestions: all });
    const task = briefTldrTask({ bounty: starter, app: appOf(starter), creatorId: "cr_lou_learns" });
    const first = await flo.generate(task, { attempt: 0 });
    const next = await flo.generate(task, { attempt: 1 });
    expect(first.source).toBe("fixture");
    expect(next.source).toBe("mock");
  });
  it("can be told not to replay", async () => {
    const starter = bountyById("bnty_flowd_starter_1");
    const flo = new MockFloProvider({ suggestions: all });
    const r = await flo.generate(briefTldrTask({ bounty: starter, app: appOf(starter), creatorId: "cr_lou_learns" }), { useFixtures: false });
    expect(r.source).toBe("mock");
  });
  it("replays nothing without suggestions or without a context to match", async () => {
    expect((await new MockFloProvider().generate(briefTldrTask({ bounty: lumi, app: lumiApp }))).source).toBe("mock");
    expect(findSuggestion(all, { kind: "next_action", role: "creator", signals: {} })).toBeUndefined();
  });
  it("turns a saved suggestion back into a result and a result into a suggestion", () => {
    const saved = all[0];
    if (!saved) throw new Error("fixture");
    const asResult = fromFloSuggestion(saved, "label");
    expect(asResult.outputs).toEqual(saved.outputs);
    expect(asResult.source).toBe("fixture");
    const task = briefTldrTask({ bounty: lumi, app: lumiApp, creatorId: "cr_maya" });
    const s = toFloSuggestion(task, { ...asResult, kind: "brief_tldr", task_kind: "brief_tldr" }, { id: "flo_9000", created_at: NOW });
    expect(s).toMatchObject({ id: "flo_9000", kind: "brief_tldr", creator_id: "cr_maya", context_kind: "bounty", context_id: lumi.id, prompt: "TL;DR this brief in three bullets.", created_at: NOW });
    expect(Object.keys(s).sort()).toEqual(expect.arrayContaining(["id", "surface", "kind", "prompt", "title", "outputs", "actions", "model", "latency_ms", "created_at"]));
  });
  it("stores a comment reply as a caption with a comment context", async () => {
    const flo = new MockFloProvider();
    const task: FloTask = { kind: "comment_reply", comment: "is this an ad?", app: { name: "Lumi" }, creator_id: "cr_maya" };
    const r = await flo.generate(task);
    const s = toFloSuggestion(task, r, { id: "flo_9001", created_at: NOW });
    expect(s.kind).toBe("caption");
    expect(s.context_kind).toBe("comment");
    expect(s.prompt).toBe('Reply to this comment: "is this an ad?"');
  });
  it("maps every task kind to a contract kind", () => {
    expect(floKindFor("comment_reply")).toBe("caption");
    expect(floKindFor("script")).toBe("script");
    expect(floKindFor("bounty_draft")).toBe("bounty_draft");
  });
});

describe("prompts and text", () => {
  it("describes each request the way saved suggestions do", () => {
    expect(promptFor(briefTldrTask({ bounty: lumi, app: lumiApp }))).toBe("TL;DR this brief in three bullets.");
    expect(promptFor(captionTask({ bounty: lumi, app: lumiApp }))).toBe("Caption ideas with #ad for this video.");
    expect(promptFor(scriptTask({ bounty: lumi, app: lumiApp, format: formatById("tmpl_confession") }))).toBe("Write 3 scripts for the confession hook format for Lumi.");
    expect(promptFor(hookRewriteTask({ hook: "Why?", app: lumiApp }))).toBe('Rewrite this hook so it lands in 2 seconds: "Why?"');
    expect(promptFor(bountyDraftTask({ input: "https://x.test/a", now: NOW }))).toBe("Draft a bounty from this App Store link: https://x.test/a");
    expect(promptFor({ kind: "next_action", role: "creator", signals: {} })).toBe("What should I do today?");
    expect(promptFor(briefTldrTask({ bounty: lumi, app: lumiApp, prompt: "Give me the short version" }))).toBe("Give me the short version");
  });
  it("renders an answer as plain text for a clipboard", () => {
    expect(resultToText({ title: "T", outputs: ["a", "b"] })).toBe("T\n\na\n\nb");
    expect(resultToText({ title: "T", outputs: ["a", "b"] }, { title: false })).toBe("a\n\nb");
  });
});

describe("the server-sent event wire format", () => {
  const events: FloStreamEvent[] = [
    { type: "start", task_kind: "script", title: "Three scripts", model: "flo-mock-1", source: "mock", outputs: 1 },
    { type: "delta", output: 0, text: 'He said "hi"\nand left, then {json: true}' },
    { type: "output_end", output: 0 },
    { type: "error", message: "nope" },
  ];
  const wire = events.map(encodeSse).join("");

  it("encodes one message per event with its type and a JSON line", () => {
    expect(encodeSse(events[1] as FloStreamEvent)).toMatch(/^event: delta\ndata: \{.*\}\n\n$/);
    expect(encodeSse(events[1] as FloStreamEvent).split("\n").length).toBe(4);
  });
  it("decodes whatever way the bytes are sliced", () => {
    for (const size of [1, 2, 3, 7, 16, 1000]) {
      const decoder = new SseDecoder();
      const out: FloStreamEvent[] = [];
      for (let i = 0; i < wire.length; i += size) out.push(...decoder.feed(wire.slice(i, i + size)));
      out.push(...decoder.flush());
      expect(out, `size ${size}`).toEqual(events);
    }
  });
  it("handles CRLF, comments and unknown events", () => {
    const decoder = new SseDecoder();
    const crlf = ": keep-alive\r\n\r\nevent: delta\r\ndata: {\"type\":\"delta\",\"output\":0,\"text\":\"x\"}\r\n\r\ndata: {\"type\":\"mystery\"}\r\n\r\ndata: not json\r\n\r\n";
    expect(decoder.feed(crlf)).toEqual([{ type: "delta", output: 0, text: "x" }]);
  });
  it("flushes a final message that has no blank line", () => {
    const decoder = new SseDecoder();
    expect(decoder.feed('data: {"type":"output_end","output":2}')).toEqual([]);
    expect(decoder.flush()).toEqual([{ type: "output_end", output: 2 }]);
  });
  it("reads a fetch body stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < wire.length; i += 11) controller.enqueue(encoder.encode(wire.slice(i, i + 11)));
        controller.close();
      },
    });
    const out: FloStreamEvent[] = [];
    for await (const e of readSse(body)) out.push(e);
    expect(out).toEqual(events);
  });
});

describe("the remote provider", () => {
  const task = briefTldrTask({ bounty: lumi, app: lumiApp });
  const doneResult: FloResult = { kind: "brief_tldr", task_kind: "brief_tldr", surface: "bounty_detail", title: "Remote", outputs: ["from the route"], notes: [], actions: [], model: "claude-sonnet-5-5", latency_ms: 900, label: "l", source: "claude" };

  const sseResponse = (events: FloStreamEvent[], init: ResponseInit = {}): Response => new Response(events.map(encodeSse).join(""), { status: 200, headers: { "content-type": "text/event-stream" }, ...init });

  it("posts the task and streams the route's answer", async () => {
    const fetchSpy = vi.fn(async () => sseResponse([{ type: "start", task_kind: "brief_tldr", title: "Remote", model: "claude-sonnet-5-5", source: "claude", outputs: 1 }, { type: "delta", output: 0, text: "from the route" }, { type: "output_end", output: 0 }, { type: "done", result: doneResult }]));
    const flo = new HttpFloProvider({ fetch: fetchSpy as unknown as typeof fetch });
    const collected = await collectStream(flo.stream(task));
    expect(collected.outputs).toEqual(["from the route"]);
    expect(collected.result?.source).toBe("claude");
    expect(collected.result?.degraded).toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/flo/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).task.kind).toBe("brief_tldr");
    expect(FloChatRequestSchema.safeParse(JSON.parse(String(init.body))).success).toBe(true);
  });
  it("answers from the local mock, marked degraded, when the route is down", async () => {
    const flo = new HttpFloProvider({ fetch: (async () => new Response("no", { status: 503 })) as typeof fetch });
    const r = await flo.generate(task);
    expect(r.degraded).toBe(true);
    expect(r.source).toBe("mock");
    expect(r.outputs).toHaveLength(5);
  });
  it("falls back when the network throws, when the route sends an error event, and when the stream ends early", async () => {
    const throwing = new HttpFloProvider({ fetch: (async () => { throw new TypeError("offline"); }) as typeof fetch });
    expect((await throwing.generate(task)).degraded).toBe(true);
    const errorEvent = new HttpFloProvider({ fetch: (async () => sseResponse([{ type: "error", message: "boom" }])) as typeof fetch });
    expect((await errorEvent.generate(task)).degraded).toBe(true);
    const early = new HttpFloProvider({ fetch: (async () => sseResponse([{ type: "start", task_kind: "brief_tldr", title: "x", model: "m", source: "claude", outputs: 1 }, { type: "delta", output: 0, text: "half" }])) as typeof fetch });
    const events: FloStreamEvent[] = [];
    for await (const e of early.stream(task, { typewriter: { instant: true } })) events.push(e);
    expect(events.filter((e) => e.type === "start")).toHaveLength(2); // the UI resets on the second start
    expect(events[events.length - 1]).toMatchObject({ type: "done", result: { degraded: true } });
  });
  it("does not fall back when the caller cancelled", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const flo = new HttpFloProvider({ fetch: (async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch });
    const events: FloStreamEvent[] = [];
    for await (const e of flo.stream(task, { signal: ctl.signal })) events.push(e);
    expect(events).toEqual([]);
  });
  it("is chosen by createFloProvider in remote mode, with the mock as its fallback", async () => {
    expect(createFloProvider({ mode: "local" }).id).toBe("mock");
    const remote = createFloProvider({ mode: "remote", fetch: (async () => new Response("", { status: 500 })) as typeof fetch });
    expect(remote.id).toBe("remote");
    expect((await remote.generate(task)).degraded).toBe(true);
  });
});

describe("the mock as a streaming provider", () => {
  it("streams the same answer it generates", async () => {
    const flo = new MockFloProvider();
    const task = captionTask({ bounty: lumi, app: lumiApp, creatorCode: "MAYA6" });
    const generated = await flo.generate(task);
    const streamed = await collectStream(flo.stream(task, { typewriter: { sleep: async () => undefined } }));
    expect(streamed.outputs).toEqual(generated.outputs);
    expect(streamed.result).toEqual(generated);
  });
  it("types a script in a few seconds, never more than the cap", async () => {
    const flo = new MockFloProvider();
    const { delays, sleep } = fakeSleep();
    await collectStream(flo.stream(scriptTask({ bounty: lumi, app: lumiApp, format: formatById("tmpl_screen_reaction") }), { typewriter: { sleep, jitter: 0 } }));
    const total = delays.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThanOrEqual(10_500);
  });
  it("honours an abort signal mid-answer", async () => {
    const flo = new MockFloProvider();
    const ctl = new AbortController();
    const events: FloStreamEvent[] = [];
    for await (const e of flo.stream(briefTldrTask({ bounty: lumi, app: lumiApp }), { signal: ctl.signal, typewriter: { sleep: async () => undefined } })) {
      events.push(e);
      if (e.type === "delta") ctl.abort();
    }
    expect(events.some((e) => e.type === "done")).toBe(false);
  });
  it("is the same on repeated calls: nothing depends on the clock or Math.random", async () => {
    const flo = new MockFloProvider();
    const spy = vi.spyOn(Math, "random");
    const dateSpy = vi.spyOn(Date, "now");
    const task = scriptTask({ bounty: lumi, app: lumiApp });
    const a = JSON.stringify(await flo.generate(task));
    const b = JSON.stringify(await flo.generate(task));
    expect(a).toBe(b);
    expect(spy).not.toHaveBeenCalled();
    expect(dateSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    dateSpy.mockRestore();
  });
});
