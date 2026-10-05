import Foundation

// Scam Shield: flowd keeps conversations in the app and warns when a message tries to leave it, asks a creator to pay to take part, or asks for a burner
// account. The detection is a transparent rule list (the same on web and iOS); a warning annotates the message, it never silently deletes it. Mirrors
// apps/web/src/lib/store/core/scamshield.ts.

enum ScamShield {
    private static let rules: [(reason: ScamReason, pattern: String)] = [
        (
            .payToJoin,
            #"\b(?:entry|joining|registration|signup|sign-up|starter|onboarding) fee\b|\bdeposit\b|\bpay (?:us|me|a fee) (?:first|to (?:join|start|apply))\b|\bbuy (?:the|our) (?:product|kit|app|plan) first\b|\bsend (?:me )?\$\d+"#
        ),
        (
            .offPlatformChat,
            #"\b(?:whatsapp|telegram|signal|discord|snap(?:chat)?|wechat|kik)\b|\b(?:dm|text|email|call) me (?:at|on|instead)\b|\b(?:message|contact) me (?:outside|off) (?:of )?(?:flowd|the app)\b|\bmove (?:this|the chat|our chat) (?:to|off)\b"#
        ),
        (
            .burnerAccountDemand,
            #"\b(?:new|fresh|burner|dedicated|separate) (?:tiktok |instagram |youtube )?account\b|\bsecond account\b"#
        ),
        (
            .suspiciousLink,
            #"\bbit\.ly/|\btinyurl\.com/|\bt\.co/|\bgrabify\b|\bclaim your (?:prize|reward)\b"#
        ),
        (
            .noEscrowClaim,
            #"\b(?:paid|payment) (?:outside|off) (?:the )?(?:platform|flowd)\b|\bvenmo|paypal|cash ?app|zelle|gift ?card|crypto\b|\bwire transfer\b"#
        )
    ]

    /// The first Scam Shield rule a message trips, or nil.
    static func warning(for text: String) -> ScamReason? {
        for rule in rules {
            if Rx.test(rule.pattern, in: text, caseInsensitive: true) {
                return rule.reason
            }
        }
        return nil
    }

    /// What a warning says, in words about the message and never the person.
    static func copy(for reason: ScamReason) -> String {
        switch reason {
        case .payToJoin:
            return "flowd never asks creators to pay to take part. If someone asks, report it."
        case .offPlatformChat:
            return "Keep this conversation in flowd. Moving off the app removes escrow, Rights Cards and our help if something goes wrong."
        case .fakeBrand:
            return "This brand could not be verified. Check the Verified badge before you share anything."
        case .burnerAccountDemand:
            return "Bounties cannot require a new or burner account. You post from your own account."
        case .noEscrowClaim:
            return "Every flowd payment goes through escrow. A request to be paid outside the platform is a red flag."
        case .suspiciousLink:
            return "Do not open links from messages you did not expect. flowd links are always joinflowd.io."
        case .harassment:
            return "Messages like this break the community rules. You can report it and block the sender."
        case .other, .unknown:
            return "Something about this message looks off. You can report it to our safety team."
        }
    }
}
