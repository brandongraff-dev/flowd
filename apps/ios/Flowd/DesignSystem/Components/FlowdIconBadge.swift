import SwiftUI

// FlowdIconBadge: a glossy glass-tile icon that carries meaning without words. A tone-coloured squircle with a top highlight,
// a hairline rim and a soft coloured glow, with a hierarchical multicolour SF Symbol on top. Use it as the lead visual for a
// stat, an alert, a streak or a state instead of a text pill.

struct FlowdIconBadge: View {
    let systemImage: String
    let tone: FlowdTone
    let size: CGFloat

    init(_ systemImage: String, tone: FlowdTone = .accent, size: CGFloat = 44) {
        self.systemImage = systemImage
        self.tone = tone
        self.size = size
    }

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: size * 0.32, style: .continuous)
        return ZStack {
            shape.fill(tone.solid)
            shape.fill(
                LinearGradient(
                    colors: [FlowdPrimitive.white.opacity(0.42), FlowdPrimitive.white.opacity(0)],
                    startPoint: .top,
                    endPoint: .center
                )
            )
            shape.strokeBorder(FlowdPrimitive.white.opacity(0.35), lineWidth: 1)
            Image(systemName: systemImage)
                .font(.system(size: size * 0.46, weight: .bold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(tone.onSolid)
                .shadow(color: FlowdPrimitive.black.opacity(0.18), radius: 1, x: 0, y: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: tone.solid.opacity(0.55), radius: size * 0.3, x: 0, y: size * 0.12)
        .accessibilityHidden(true)
    }
}

#Preview("Icon badges") {
    FlowdPreviewCanvas {
        HStack(spacing: 16) {
            FlowdIconBadge("flame.fill", tone: .ember)
            FlowdIconBadge("checkmark", tone: .mint)
            FlowdIconBadge("clock.fill", tone: .info)
            FlowdIconBadge("bolt.fill", tone: .sun)
            FlowdIconBadge("sparkles", tone: .violet)
        }
        .padding(24)
    }
}
