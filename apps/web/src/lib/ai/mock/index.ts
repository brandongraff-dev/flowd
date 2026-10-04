/** The mock engine's dispatcher: one deterministic generator per kind of task. */

import type { FloTask } from "../schemas";
import { answerBountyDraft } from "./bounty-draft";
import { answerCaption } from "./caption";
import type { MockAnswer } from "./common";
import { answerCommentReply } from "./comment";
import { answerHookRewrite } from "./hooks";
import { answerNextAction } from "./next-action";
import { answerRateAdvice } from "./rate";
import { answerScoreFix } from "./score";
import { answerScript } from "./script";
import { answerBriefTldr } from "./tldr";

export type { MockAnswer } from "./common";
export { buildBountyDraft, draftOutputs, lintDraft, DEFAULT_DRAFT_BUDGET_CENTS } from "./bounty-draft";
export { classifyComment, type CommentIntent } from "./comment";
export { tightenHook, hookCandidates, pickDistinct, describeHook, type HookCandidate } from "./hooks";
export { FALLBACK_FORMATS } from "./formats";
export { MOCK_MODEL, NEVER_SAY, bannedPhraseIn } from "./common";

/** Generates the answer for a task. Pure: the same task and attempt always give the same answer. */
export function generateMockAnswer(task: FloTask, attempt = 0): MockAnswer {
  switch (task.kind) {
    case "script":
      return answerScript(task, attempt);
    case "hook_rewrite":
      return answerHookRewrite(task, attempt);
    case "brief_tldr":
      return answerBriefTldr(task);
    case "caption":
      return answerCaption(task, attempt);
    case "comment_reply":
      return answerCommentReply(task, attempt);
    case "score_fix":
      return answerScoreFix(task);
    case "rate_advice":
      return answerRateAdvice(task);
    case "next_action":
      return answerNextAction(task);
    case "bounty_draft":
      return answerBountyDraft(task, attempt);
  }
}
