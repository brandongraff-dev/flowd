import SwiftUI

// Empty, loading and error states are designed, never blank: a 92 pt glass tile (radius 28) with a 40 pt icon over the soft Flow
// tint, a one-line headline, a one-line reason and a primary action. Copy follows the brand voice: say what is true, give the next
// step, no exclamation marks, no guilt.

/// An illustrated empty state.
///
///     EmptyStateView(
///         systemImage: "creditcard",
///         title: "Your first payout lands here",
///         message: "Pending money shows the day it clears.",
///         actionTitle: "Browse bounties"
///     ) { openBounties() }
struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String?
    let actionTitle: String?
    let tone: FlowdTone
    let action: (() -> Void)?

    init(
        systemImage: String,
        title: String,
        message: String? = nil,
        actionTitle: String? = nil,
        tone: FlowdTone = .accent,
        action: (() -> Void)? = nil
    ) {
        self.systemImage = systemImage
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.tone = tone
        self.action = action
    }

    var body: some View {
        VStack(spacing: FlowdSpacing.md) {
            tile
            VStack(spacing: FlowdSpacing.xxs) {
                Text(title)
                    .flowdDisplay(.title3)
                    .foregroundStyle(FlowdColor.fg)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                if let message = message {
                    Text(message)
                        .flowdBody(.callout)
                        .foregroundStyle(FlowdColor.fgMuted)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let actionTitle = actionTitle, let action = action {
                FlowdButton(actionTitle, variant: .primary, size: .regular, action: action)
                    .padding(.top, FlowdSpacing.xxs)
            }
        }
        .padding(.horizontal, FlowdSpacing.xl)
        .padding(.vertical, FlowdSpacing.xxl)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }

    private var tile: some View {
        RoundedRectangle(cornerRadius: FlowdRadius.xxl, style: .continuous)
            .fill(FlowdGradient.flowSoft)
            .frame(width: 92, height: 92)
            .flowdSurface(cornerRadius: FlowdRadius.xxl)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: 40, weight: .regular))
                    .foregroundStyle(tone.ink)
                    .symbolRenderingMode(.hierarchical)
                    .accessibilityHidden(true)
            }
    }
}

/// A failed load: calm reason, a retry. Use the real reason when you have one ("You're offline. Everything you made is saved.").
///
///     ErrorStateView(title: "Couldn't load your Wallet", message: "Check your connection and try again.") { Task { await reload() } }
struct ErrorStateView: View {
    let title: String
    let message: String?
    let retryTitle: String
    let retry: () -> Void

    init(
        title: String = "Something went wrong",
        message: String? = nil,
        retryTitle: String = "Try again",
        retry: @escaping () -> Void
    ) {
        self.title = title
        self.message = message
        self.retryTitle = retryTitle
        self.retry = retry
    }

    var body: some View {
        EmptyStateView(
            systemImage: "wifi.exclamationmark",
            title: title,
            message: message,
            actionTitle: retryTitle,
            tone: .ember,
            action: retry
        )
    }
}

// MARK: - Preview

#Preview("Empty and error states") {
    FlowdPreviewCanvas {
        VStack(spacing: FlowdSpacing.xl) {
            EmptyStateView(
                systemImage: "creditcard",
                title: "Your first payout lands here",
                message: "Pending money shows the day it clears.",
                actionTitle: "Browse bounties"
            ) {}
            EmptyStateView(
                systemImage: "video",
                title: "No drafts yet",
                message: "Record a take and Hook Score checks the first 3 seconds before you post."
            )
            ErrorStateView(
                title: "Upload stopped at 62%",
                message: "Your take is saved on this phone. Try again."
            ) {}
        }
    }
}
