/**
 * Flo, the in-app AI copilot. Import from "@/lib/ai". Everything here is safe for the browser.
 *
 *   const flo = createFloProvider({ suggestions });                 // local mock by default; remote with NEXT_PUBLIC_FLO_MODE=remote
 *   const result = await flo.generate(scriptTask({ bounty, app, format }));
 *   for await (const event of flo.stream(task)) ...                 // typewriter events
 *   useFlo()                                                         // from "@/lib/hooks/use-flo" (client)
 *
 * Server only (route handler, needs ANTHROPIC_API_KEY): "@/lib/ai/server" and "@/lib/ai/claude-provider".
 */

export * from "./types";
export * from "./schemas";
export * from "./context";
export * from "./result";
export * from "./typewriter";
export * from "./sse";
export { MockFloProvider, findSuggestion, type MockFloOptions } from "./mock-provider";
export { generateMockAnswer, buildBountyDraft, draftOutputs, lintDraft, classifyComment, tightenHook, DEFAULT_DRAFT_BUDGET_CENTS, NEVER_SAY, bannedPhraseIn, MOCK_MODEL } from "./mock";
export { HttpFloProvider, FLO_ENDPOINT, type HttpFloOptions } from "./http-provider";
export { createFloProvider, getFloProvider, type CreateFloProviderOptions } from "./factory";
