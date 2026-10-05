import SwiftUI

// The two pieces that sit around the tab bar: the Studio action fan (Record, Upload, Script with Flo) and the "Continue draft" accessory above the bar.
// Both are L2 glass controls floating over content; neither sits on another glass control (the fan floats above the bar, the accessory above it with a
// gap), and everything inside the glass is a label, never more glass.

// MARK: - Action fan

/// One pill of the Studio action fan.
struct ActionFanAction: Identifiable {
    let id: String
    let title: String
    let systemImage: String
    let tone: FlowdTone
    let handler: () -> Void

    init(id: String, title: String, systemImage: String, tone: FlowdTone, handler: @escaping () -> Void) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.tone = tone
        self.handler = handler
    }
}

/// The fan: a dimmed scrim (tap anywhere to close) and a stack of glass pills above the centre action. The first action in the array is the one
/// nearest the thumb. The pills rise in with the design system's 40 ms stagger; under Reduce Motion they fade.
struct ActionFanOverlay: View {
    let actions: [ActionFanAction]
    let onDismiss: () -> Void

    init(actions: [ActionFanAction], onDismiss: @escaping () -> Void) {
        self.actions = actions
        self.onDismiss = onDismiss
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            FlowdColor.scrim
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture {
                    onDismiss()
                }
                .accessibilityElement()
                .accessibilityLabel("Close actions")
                .accessibilityAddTraits(AccessibilityTraits.isButton)
            pills
                .padding(.bottom, FlowdLayout.tabBarHeight + FlowdSpacing.xxl)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(AccessibilityTraits.isModal)
    }

    private var pills: some View {
        let ordered: [ActionFanAction] = Array(actions.reversed())
        return FlowdGlassContainer(spacing: 14) {
            VStack(spacing: FlowdSpacing.xs) {
                ForEach(0..<ordered.count, id: \.self) { (index: Int) in
                    pill(ordered[index], index: ordered.count - 1 - index)
                }
            }
        }
    }

    private func pill(_ action: ActionFanAction, index: Int) -> some View {
        Button {
            FlowdHaptics.play(FlowdHapticKind.tap)
            action.handler()
        } label: {
            HStack(spacing: FlowdSpacing.xs) {
                Image(systemName: action.systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(action.tone.ink)
                    .accessibilityHidden(true)
                Text(action.title)
                    .flowdBody(.headline)
                    .foregroundStyle(FlowdColor.fg)
            }
            .padding(.horizontal, FlowdSpacing.lg)
            .frame(minHeight: 52)
            .flowdGlassCapsule(FlowdGlassLayer.l2, interactive: true)
        }
        .buttonStyle(FlowdPressStyle())
        .flowdReveal(index: index)
        .accessibilityLabel(action.title)
    }
}

// MARK: - Continue draft

/// "Continue draft": a glass pill above the tab bar while an unfinished Studio take exists. Tapping it reopens the Studio at the draft's stage. While the
/// tab bar is compact (scrolling down on iOS 26) it shrinks to its icon and one word.
struct ContinueDraftAccessory: View {
    let draft: DraftSnapshot
    let isCompact: Bool
    let action: () -> Void

    init(draft: DraftSnapshot, isCompact: Bool, action: @escaping () -> Void) {
        self.draft = draft
        self.isCompact = isCompact
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: FlowdSpacing.sm) {
                Image(systemName: "video.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FlowdColor.accent)
                    .accessibilityHidden(true)
                if isCompact {
                    Text("Draft")
                        .flowdBody(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(FlowdColor.fg)
                } else {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Continue draft")
                            .flowdBody(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundStyle(FlowdColor.fg)
                            .lineLimit(1)
                        Text(subtitle)
                            .flowdCaption(.footnote)
                            .foregroundStyle(FlowdColor.fgMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: FlowdSpacing.xs)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FlowdColor.fgMuted)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, FlowdSpacing.md)
            .frame(minHeight: FlowdLayout.hitTarget)
            .frame(maxWidth: isCompact ? nil : 440)
            .flowdGlassCapsule(FlowdGlassLayer.l2, interactive: true)
        }
        .buttonStyle(FlowdPressStyle())
        .padding(.horizontal, FlowdSpacing.md)
        .accessibilityLabel("Continue draft")
        .accessibilityHint(subtitle)
    }

    /// "Lumi glow up. Capture. 0:24 recorded." or just the stage summary when the draft has no title yet.
    private var subtitle: String {
        if draft.title.isEmpty {
            return draft.summaryLine
        }
        return draft.title + ". " + draft.summaryLine
    }
}

#Preview("Continue draft") {
    VStack(spacing: FlowdSpacing.md) {
        ContinueDraftAccessory(draft: DraftSnapshot(bountyId: "bnty_lumi_glowup", title: "Lumi glow up", stage: DraftStage.capture, videoFileName: "take.mov", durationMs: 24_000), isCompact: false) {
        }
        ContinueDraftAccessory(draft: DraftSnapshot(bountyId: "bnty_lumi_glowup", title: "Lumi glow up", stage: DraftStage.capture, videoFileName: "take.mov", durationMs: 24_000), isCompact: true) {
        }
    }
    .padding(FlowdSpacing.lg)
    .flowdAurora()
    .flowdPreviewEnvironment()
}

#Preview("Action fan") {
    ActionFanOverlay(
        actions: [
            ActionFanAction(id: "record", title: "Record", systemImage: "video.fill", tone: FlowdTone.accent) {
            },
            ActionFanAction(id: "upload", title: "Upload", systemImage: "square.and.arrow.up", tone: FlowdTone.info) {
            },
            ActionFanAction(id: "script", title: "Script with Flo", systemImage: "sparkles", tone: FlowdTone.violet) {
            }
        ]
    ) {
    }
    .flowdAurora()
    .flowdPreviewEnvironment()
}
