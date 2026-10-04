/**
 * Scam Shield: flowd keeps conversations in the app and warns when a message tries to leave it, asks a creator to pay to take part, or asks for a
 * burner account. The detection is a transparent rule list (the same on web and iOS); a warning annotates the message, it never silently deletes it.
 */

import type { ScamReason } from "@/lib/contract/types";

const RULES: readonly { reason: ScamReason; re: RegExp }[] = [
  { reason: "pay_to_join", re: /\b(?:entry|joining|registration|signup|sign-up|starter|onboarding) fee\b|\bdeposit\b|\bpay (?:us|me|a fee) (?:first|to (?:join|start|apply))\b|\bbuy (?:the|our) (?:product|kit|app|plan) first\b|\bsend (?:me )?\$\d+/i },
  { reason: "off_platform_chat", re: /\b(?:whatsapp|telegram|signal|discord|snap(?:chat)?|wechat|kik)\b|\b(?:dm|text|email|call) me (?:at|on|instead)\b|\b(?:message|contact) me (?:outside|off) (?:of )?(?:flowd|the app)\b|\bmove (?:this|the chat|our chat) (?:to|off)\b/i },
  { reason: "burner_account_demand", re: /\b(?:new|fresh|burner|dedicated|separate) (?:tiktok |instagram |youtube )?account\b|\bsecond account\b/i },
  { reason: "suspicious_link", re: /\bbit\.ly\/|\btinyurl\.com\/|\bt\.co\/|\bgrabify\b|\bclaim your (?:prize|reward)\b/i },
  { reason: "no_escrow_claim", re: /\b(?:paid|payment) (?:outside|off) (?:the )?(?:platform|flowd)\b|\bvenmo|paypal|cash ?app|zelle|gift ?card|crypto\b|\bwire transfer\b/i },
];

/** The first Scam Shield rule a message trips, or null. */
export function scamWarningFor(text: string): ScamReason | null {
  for (const { reason, re } of RULES) if (re.test(text)) return reason;
  return null;
}

/** What a warning says, in words about the message and never the person. */
export const SCAM_WARNING_COPY: Record<ScamReason, string> = {
  pay_to_join: "flowd never asks creators to pay to take part. If someone asks, report it.",
  off_platform_chat: "Keep this conversation in flowd. Moving off the app removes escrow, Rights Cards and our help if something goes wrong.",
  fake_brand: "This brand could not be verified. Check the Verified badge before you share anything.",
  burner_account_demand: "Bounties cannot require a new or burner account. You post from your own account.",
  no_escrow_claim: "Every flowd payment goes through escrow. A request to be paid outside the platform is a red flag.",
  suspicious_link: "Do not open links from messages you did not expect. flowd links are always joinflowd.io.",
  harassment: "Messages like this break the community rules. You can report it and block the sender.",
  other: "Something about this message looks off. You can report it to our safety team.",
};
