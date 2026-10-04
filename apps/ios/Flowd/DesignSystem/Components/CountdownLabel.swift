import SwiftUI

// CountdownLabel: a live "4h 12m" countdown to a real instant (Daily Drop at 16:00 UTC, a review deadline, a window closing). Only ever
// bind it to a TRUE deadline: no invented scarcity, no fake timers. It ticks each second under an hour and each 15 s above, reads the
// clock from `\.flowdNow` (so the demo world's "now" can be pinned), and gives VoiceOver the full words, not "4h 12m".

enum FlowdCountdownStyle: CaseIterable, Hashable, Sendable {
    /// `4h 12m`, `12m 05s`, `45s`.
    case compact
    /// `4 hours, 12 minutes` (spoken style, for wide layouts).
    case verbose
    /// `04:12:08`, tabular clock for hero use.
    case clock
}

/// Duration formatting shared by the countdown and anything that needs a remaining-time string.
enum FlowdDuration {
    static func compact(seconds: TimeInterval) -> String {
        let total: Int = max(Int(seconds.rounded(.down)), 0)
        let days: Int = total / 86_400
        let hours: Int = (total % 86_400) / 3_600
        let minutes: Int = (total % 3_600) / 60
        let secs: Int = total % 60
        if days > 0 {
            return String(days) + "d " + String(hours) + "h"
        }
        if hours > 0 {
            return String(hours) + "h " + String(minutes) + "m"
        }
        if minutes > 0 {
            return String(minutes) + "m " + pad(secs) + "s"
        }
        return String(secs) + "s"
    }

    static func verbose(seconds: TimeInterval) -> String {
        let total: Int = max(Int(seconds.rounded(.down)), 0)
        let days: Int = total / 86_400
        let hours: Int = (total % 86_400) / 3_600
        let minutes: Int = (total % 3_600) / 60
        let secs: Int = total % 60
        var parts: [String] = []
        if days > 0 { parts.append(plural(days, "day")) }
        if hours > 0 { parts.append(plural(hours, "hour")) }
        if minutes > 0 && days == 0 { parts.append(plural(minutes, "minute")) }
        if parts.isEmpty { parts.append(plural(secs, "second")) }
        return parts.joined(separator: ", ")
    }

    static func clock(seconds: TimeInterval) -> String {
        let total: Int = max(Int(seconds.rounded(.down)), 0)
        let hours: Int = total / 3_600
        let minutes: Int = (total % 3_600) / 60
        let secs: Int = total % 60
        return pad(hours) + ":" + pad(minutes) + ":" + pad(secs)
    }

    private static func pad(_ value: Int) -> String {
        return value < 10 ? "0" + String(value) : String(value)
    }

    private static func plural(_ value: Int, _ unit: String) -> String {
        return String(value) + " " + unit + (value == 1 ? "" : "s")
    }
}

/// `CountdownLabel(to: dropDate, prefix: "Next drop in ", endedText: "Live now")`
struct CountdownLabel: View {
    let target: Date
    let style: FlowdCountdownStyle
    let prefix: String
    let endedText: String
    let textStyle: FlowdTextStyle
    let tone: FlowdTone

    @Environment(\.flowdNow) private var now: @Sendable () -> Date

    init(
        to target: Date,
        style: FlowdCountdownStyle = .compact,
        prefix: String = "",
        endedText: String = "Done",
        textStyle: FlowdTextStyle = FlowdFont.figureSm,
        tone: FlowdTone = .neutral
    ) {
        self.target = target
        self.style = style
        self.prefix = prefix
        self.endedText = endedText
        self.textStyle = textStyle
        self.tone = tone
    }

    var body: some View {
        let interval: TimeInterval = style == FlowdCountdownStyle.verbose ? 15 : 1
        return TimelineView(.periodic(from: Date(), by: interval)) { _ in
            let remaining: TimeInterval = target.timeIntervalSince(now())
            Text(display(remaining: remaining))
                .flowdText(textStyle)
                .foregroundStyle(tone.ink)
                .contentTransition(.numericText(countsDown: true))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityLabel(spoken(remaining: remaining))
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    private func display(remaining: TimeInterval) -> String {
        if remaining <= 0 {
            return endedText
        }
        switch style {
        case .compact: return prefix + FlowdDuration.compact(seconds: remaining)
        case .verbose: return prefix + FlowdDuration.verbose(seconds: remaining)
        case .clock: return prefix + FlowdDuration.clock(seconds: remaining)
        }
    }

    private func spoken(remaining: TimeInterval) -> String {
        if remaining <= 0 {
            return endedText
        }
        let words: String = FlowdDuration.verbose(seconds: remaining)
        let lead: String = prefix.trimmingCharacters(in: .whitespaces)
        return lead.isEmpty ? words : lead + " " + words
    }
}

// MARK: - Preview

#Preview("Countdown") {
    FlowdPreviewCanvas {
        VStack(alignment: .leading, spacing: FlowdSpacing.md) {
            CountdownLabel(to: Date().addingTimeInterval(4 * 3_600 + 12 * 60), prefix: "Next drop in ", textStyle: FlowdFont.figureMd, tone: .ember)
            CountdownLabel(to: Date().addingTimeInterval(12 * 60 + 5), prefix: "Window closes in ")
            CountdownLabel(to: Date().addingTimeInterval(4 * 3_600 + 12 * 60 + 8), style: .clock, textStyle: FlowdFont.figureLg)
            CountdownLabel(to: Date().addingTimeInterval(26 * 3_600), style: .verbose, prefix: "Decides in ")
            CountdownLabel(to: Date().addingTimeInterval(-5), endedText: "Live now", tone: .mint)
        }
        .padding(FlowdSpacing.lg)
    }
}
