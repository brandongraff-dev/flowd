/**
 * Comment replies: three short answers to a viewer's comment on a creator's post. Honest by construction: a question about whether the
 * post is an ad is always answered "yes, paid partnership"; nothing here claims results, income or a cure; pricing is never invented
 * (it points at the listing); a critical comment is met with respect, not defence.
 */

import type { FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, featureOf, stableInt, wordsFor, type MockAnswer } from "./common";

export type CommentIntent = "sponsored" | "skeptical" | "price" | "how_to" | "critical" | "praise" | "feature" | "other";

const RULES: readonly (readonly [CommentIntent, RegExp])[] = [
  ["sponsored", /\b(?:ad|ads|sponsored|sponsor|sponsorship|partnership|promo|promotion|gifted)\b|#ad\b|\b(?:being|are you|were you|got|is this|is she|is he|is it) paid\b|\bpaid (?:to|for|promo|partnership|post|ad)\b/i],
  ["skeptical", /\b(?:legit|scam|fake|real|actually work|does it work|does this work|too good|sus|suspicious|trust|bot|catch)\b/i],
  ["price", /\b(?:free|price|cost|how much|subscription|subscribe|pay|paid version|premium|pro|trial|cheap|expensive|worth it)\b/i],
  ["how_to", /\b(?:link|where|which app|what app|name of|what'?s it called|whats it called|how do i|how to|download|app store|android|iphone)\b/i],
  ["critical", /\b(?:trash|garbage|bad|worse|awful|hate|buggy|crash|slow|useless|waste|overrated|don'?t like|didn'?t work|not working|terrible)\b/i],
  ["feature", /\b(?:can it|does it have|is there|can you|support|offline|widget|dark mode|export|import|sync)\b/i],
  ["praise", /\b(?:love|great|amazing|nice|cool|awesome|helpful|thank|thanks|needed this|obsessed|so good|goals)\b/i],
];

/** What a comment is asking. The first matching rule wins, in the order above (a sponsorship question outranks everything). */
export function classifyComment(comment: string): CommentIntent {
  for (const [intent, re] of RULES) if (re.test(comment)) return intent;
  return "other";
}

interface Ctx {
  app: string;
  feature: string;
  goal: string;
  trial: boolean;
  code?: string;
}

const link = (c: Ctx): string => (c.code ? `Link's in my bio, and my code is ${c.code}.` : "Link's in my bio.");

type Reply = (c: Ctx) => string;

const REPLIES: Readonly<Record<CommentIntent, readonly Reply[]>> = {
  sponsored: [
    (c) => `Yes, this is a paid partnership with ${c.app}. I'd tell you either way. ${c.feature.charAt(0).toUpperCase()}${c.feature.slice(1)} is the part I'd actually use.`,
    () => `It's an ad, yes: #ad is in the caption. I only show what I'd try myself, and I show it on screen.`,
    (c) => `Good catch. Paid partnership with ${c.app}. What you see on screen is what the app did for me.`,
  ],
  skeptical: [
    (c) => `Fair to ask. I used it for ${c.goal} and showed it on screen. ${c.trial ? "It's free to try, so you can check for yourself." : "Judge it by the demo."} (#ad)`,
    (c) => `It's a real app, and this is a paid partnership, so weigh it that way. ${c.trial ? "The free trial lets you decide." : "Read the reviews on the listing too."}`,
    (c) => `Totally fair. I'd test it yourself rather than take my word. ${link(c)}`,
  ],
  price: [
    (c) => (c.trial ? `There's a free trial, so you can try ${c.app} before you pay for anything. Check the listing for current pricing.` : `Check the ${c.app} listing for current pricing. I don't want to quote a number that has changed.`),
    (c) => `Pricing is on the listing, and ${c.trial ? "the trial is free" : "it's worth reading before you commit"}. ${link(c)}`,
    (c) => `Honest answer: look at the listing first.${c.trial ? " You can start free." : ""} (#ad)`,
  ],
  how_to: [
    (c) => `It's ${c.app}. ${link(c)}`,
    (c) => `${c.app}. You can find it in the App Store, or use the link in my bio. (#ad)`,
    (c) => `Search ${c.app} in the App Store. ${c.code ? `Code ${c.code} works in the app.` : "Link's in my bio too."}`,
  ],
  critical: [
    (c) => `Fair point. It won't suit everyone. It worked for me for ${c.goal}, and ${c.trial ? "the free trial lets you judge it yourself" : "the demo shows what I used it for"}.`,
    (c) => `Thanks for saying so. I can only speak to ${c.feature}, which I used. It's a paid partnership (#ad), so take it with that in mind.`,
    () => `Appreciate the honesty. Not every app is for everyone, and that's okay.`,
  ],
  praise: [
    (c) => `Thank you. ${c.feature.charAt(0).toUpperCase()}${c.feature.slice(1)} is the part I use most. (#ad)`,
    (c) => `Glad it helps. ${c.app} has more than I showed. ${link(c)}`,
    (c) => `Appreciate that. Paid partnership with ${c.app}, and I'd say the same either way.`,
  ],
  feature: [
    (c) => `Good question. I only showed ${c.feature}, so check the ${c.app} listing for the full feature list.`,
    (c) => `I'm not sure, and I don't want to guess. The ${c.app} listing will have it. ${link(c)}`,
    (c) => `Worth checking on the listing before you download. I only used ${c.feature}. (#ad)`,
  ],
  other: [
    (c) => `Thanks for watching. This is a paid partnership with ${c.app}. ${link(c)}`,
    (c) => `Appreciate you stopping by. I used ${c.feature} for ${c.goal}. (#ad)`,
    (c) => `Thanks. Ask me anything about ${c.app} and I'll answer honestly.`,
  ],
};

export function answerCommentReply(task: FloTaskOf<"comment_reply">, attempt: number): MockAnswer {
  const { app } = task;
  const words = wordsFor(app);
  const intent = classifyComment(task.comment);
  const ctx: Ctx = { app: app.name, feature: featureOf(app, 0), goal: words.goal, trial: app.has_free_trial === true, code: task.creator_code?.trim() || undefined };

  const pool = REPLIES[intent];
  // Rotate which reply leads on a regenerate; always return all three.
  const start = (stableInt(task.comment, pool.length) + attempt) % pool.length;
  const ordered = [...pool.slice(start), ...pool.slice(0, start)];
  const outputs = ordered.map((reply) => reply(ctx).trim());

  const sponsored = task.sponsored !== false;
  const notes = [
    intent === "sponsored" ? "A question about whether this is an ad always gets a plain yes. Say it, even if the comment is friendly." : sponsored ? "Keep #ad in your replies when you talk about the app: the disclosure rule covers comments you write too." : "Replies stay short and honest. No claims about results.",
    "Flo read this as " + ({ sponsored: "a question about sponsorship", skeptical: "a doubt about whether it works", price: "a question about price", how_to: "a request for the name or link", critical: "a criticism", praise: "a compliment", feature: "a question about a feature", other: "a general comment" } as const)[intent] + ".",
  ];

  return {
    surface: task.surface ?? "studio",
    title: "Three replies",
    outputs,
    notes,
    actions: [act("Copy reply 1", "copy", "0"), act("Answer with a video", "open_studio", "tmpl_reply_comment")],
    label: FLO_LABEL,
  };
}
