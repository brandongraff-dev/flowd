import SwiftUI

// Pill: a small non-interactive label. StatusPill: the canonical status vocabulary (bounty, submission and money states).
// Colour is never the only cue: every status carries a glyph and a word. Mint is reserved for earned money and approvals.

enum PillStyle: CaseIterable, Hashable, Sendable {
    /// Tinted background, tone ink label. The default.
    case soft
    /// Solid fill, on-solid label. Use for one emphasised pill per view.
    case solid
    /// Hairline outline, tone ink label.
    case outline
}

enum PillSize: CaseIterable, Hashable, Sendable {
    case small
    case regular

    var minHeight: CGFloat {
        switch self {
        case .small: return 22
        case .regular: return 28
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .small: return 8
        case .regular: return 10
        }
    }

    var textStyle: FlowdTextStyle {
        switch self {
        case .small: return FlowdFont.caption2
        case .regular: return FlowdFont.caption1
        }
    }

    var glyphPoints: CGFloat {
        switch self {
        case .small: return 10
        case .regular: return 12
        }
    }
}

/// A small label.
///
///     Pill("Funded", systemImage: "lock.fill")                                  // neutral soft
///     Pill("Daily Drop", systemImage: "bolt.fill", tone: .ember, style: .solid)
///     Pill("Gold", tone: .sun, size: .small)
struct Pill: View {
    let text: String
    let systemImage: String?
    let tone: FlowdTone
    let style: PillStyle
    let size: PillSize

    init(
        _ text: String,
        systemImage: String? = nil,
        tone: FlowdTone = .neutral,
        style: PillStyle = .soft,
        size: PillSize = .regular
    ) {
        self.text = text
        self.systemImage = systemImage
        self.tone = tone
        self.style = style
        self.size = size
    }

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage = systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: size.glyphPoints, weight: .bold))
                    .accessibilityHidden(true)
            }
            Text(text)
                .flowdText(size.textStyle)
                .fontWeight(.semibold)
                .lineLimit(1)
        }
        .foregroundStyle(labelColor)
        .padding(.horizontal, size.horizontalPadding)
        .frame(minHeight: size.minHeight)
        .background { Capsule(style: .continuous).fill(backgroundColor) }
        .overlay {
            if style == PillStyle.outline {
                Capsule(style: .continuous).strokeBorder(tone.ink.opacity(0.55), lineWidth: 1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var labelColor: Color {
        switch style {
        case .soft, .outline: return tone.ink
        case .solid: return tone.onSolid
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .soft: return tone.soft
        case .solid: return tone.solid
        case .outline: return Color.clear
        }
    }
}

// MARK: - Status

/// The status vocabulary shared by bounties, submissions, posts and money. Use `StatusPill(.approved)`.
enum FlowdStatus: String, CaseIterable, Hashable, Sendable {
    // Bounty
    case live
    case funded
    case scheduled
    case draft
    case soldOut
    case closed
    case expired
    // Submission
    case inReview
    case revision
    case approved
    case rejected
    case appealed
    // Money
    case pending
    case cleared
    case paid
    case held

    var title: String {
        switch self {
        case .live: return "Live"
        case .funded: return "Funded"
        case .scheduled: return "Scheduled"
        case .draft: return "Draft"
        case .soldOut: return "Sold out"
        case .closed: return "Closed"
        case .expired: return "Expired"
        case .inReview: return "In review"
        case .revision: return "Needs changes"
        case .approved: return "Approved"
        case .rejected: return "Not approved"
        case .appealed: return "Appealed"
        case .pending: return "Pending"
        case .cleared: return "Cleared"
        case .paid: return "Paid out"
        case .held: return "On hold"
        }
    }

    var systemImage: String {
        switch self {
        case .live: return "dot.radiowaves.left.and.right"
        case .funded: return "lock.fill"
        case .scheduled: return "calendar"
        case .draft: return "pencil"
        case .soldOut: return "nosign"
        case .closed: return "archivebox.fill"
        case .expired: return "clock.fill"
        case .inReview: return "hourglass"
        case .revision: return "arrow.uturn.backward"
        case .approved: return "checkmark.circle.fill"
        case .rejected: return "xmark.circle.fill"
        case .appealed: return "questionmark.circle.fill"
        case .pending: return "clock.fill"
        case .cleared: return "checkmark.circle.fill"
        case .paid: return "building.columns.fill"
        case .held: return "pause.circle.fill"
        }
    }

    var tone: FlowdTone {
        switch self {
        case .live: return FlowdTone.accent
        case .funded, .scheduled, .draft, .soldOut, .closed, .expired, .paid: return FlowdTone.neutral
        case .inReview, .appealed, .pending: return FlowdTone.info
        case .revision, .held: return FlowdTone.ember
        case .approved, .cleared: return FlowdTone.mint
        case .rejected: return FlowdTone.rose
        }
    }
}

/// `StatusPill(.approved)`, `StatusPill(.inReview, detail: "decide by Fri 2 PM")`.
/// Rejected is "Not approved" on purpose: say what happened, then give the reason and the next step beside it.
struct StatusPill: View {
    let status: FlowdStatus
    let detail: String?
    let size: PillSize

    init(_ status: FlowdStatus, detail: String? = nil, size: PillSize = .regular) {
        self.status = status
        self.detail = detail
        self.size = size
    }

    var body: some View {
        HStack(spacing: FlowdSpacing.xs) {
            Pill(status.title, systemImage: status.systemImage, tone: status.tone, style: .soft, size: size)
            if let detail = detail {
                Text(detail)
                    .flowdCaption(.footnote)
                    .foregroundStyle(FlowdColor.fgMuted)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview("Pills and statuses") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.md) {
            HStack(spacing: FlowdSpacing.xs) {
                Pill("Funded", systemImage: "lock.fill")
                Pill("Daily Drop", systemImage: "bolt.fill", tone: .ember, style: .solid)
                Pill("Flo", systemImage: "sparkles", tone: .violet)
                Pill("Gold", tone: .sun, style: .outline, size: .small)
            }
            ForEach(FlowdStatus.allCases, id: \.self) { (status: FlowdStatus) in
                StatusPill(status)
            }
            StatusPill(.inReview, detail: "decides by Fri 2:00 PM")
        }
        .padding(FlowdSpacing.lg)
    }
}
